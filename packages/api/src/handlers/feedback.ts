/**
 * Feedback Handler
 * Sprint 7, Story 1.3: Results Display & User Feedback
 * 
 * Endpoints:
 * - POST /api/v1/jobs/{job_id}/feedback - Submit user feedback
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';
import { createHash, randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const FEEDBACK_TABLE_NAME = process.env.FEEDBACK_TABLE_NAME || 'til-feedback';

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 submissions per minute per job
const DEDUPE_WINDOW_MS = 60 * 1000; // 60 seconds for dedupe

interface FeedbackRequest {
  rating: 1 | -1;
  comment?: string;
}

interface FeedbackItem {
  job_id: string;
  feedback_id: string;
  rating: 1 | -1;
  comment?: string;
  comment_hash?: string;
  created_at: string;
  user_agent?: string;
}

/**
 * Generate a hash of the comment for deduplication
 */
function hashComment(comment: string | undefined): string {
  if (!comment) return 'empty';
  return createHash('sha256').update(comment).digest('hex').substring(0, 16);
}

/**
 * Generate a ULID-like feedback ID
 */
function generateFeedbackId(): string {
  // Simple approach: timestamp + random
  const timestamp = Date.now().toString(36);
  const random = randomUUID().replace(/-/g, '').substring(0, 12);
  return `fb_${timestamp}${random}`;
}

/**
 * Check rate limit and dedupe for a job
 */
async function checkRateLimitAndDedupe(
  jobId: string,
  rating: number,
  commentHash: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const now = Date.now();
    const windowStart = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();
    
    // Query recent feedback for this job
    const result = await docClient.send(new QueryCommand({
      TableName: FEEDBACK_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      FilterExpression: 'created_at >= :window_start',
      ExpressionAttributeValues: {
        ':job_id': jobId,
        ':window_start': windowStart,
      },
    }));
    
    const recentFeedback = result.Items || [];
    
    // Check rate limit
    if (recentFeedback.length >= RATE_LIMIT_MAX) {
      return { allowed: false, reason: 'Rate limit exceeded. Please wait before submitting more feedback.' };
    }
    
    // Check for duplicate (same rating + comment hash within dedupe window)
    const dedupeStart = new Date(now - DEDUPE_WINDOW_MS).toISOString();
    const duplicate = recentFeedback.find(fb => 
      fb.rating === rating && 
      fb.comment_hash === commentHash &&
      fb.created_at >= dedupeStart
    );
    
    if (duplicate) {
      return { allowed: false, reason: 'Duplicate submission detected. Your feedback was already recorded.' };
    }
    
    return { allowed: true };
    
  } catch (error) {
    // On error, allow the submission (fail open for feedback)
    console.warn('Rate limit check failed:', error);
    return { allowed: true };
  }
}

/**
 * POST /api/v1/jobs/{job_id}/feedback - Submit user feedback
 * Sprint 7, Story 1.3
 * 
 * Requires job_read_token for auth.
 * Rate limited: 5 submissions per job per minute.
 * Deduped: same (rating, comment_hash) within 60s returns 409.
 */
export async function submitFeedbackHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.job_id;
    const token = event.queryStringParameters?.token || 
                  event.headers['Authorization']?.replace('Bearer ', '');

    if (!jobId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'job_id is required' }),
      };
    }

    if (!token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'token is required (query param or Authorization header)' }),
      };
    }

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    let request: FeedbackRequest;
    try {
      request = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    // Validate rating
    if (request.rating !== 1 && request.rating !== -1) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'rating must be 1 (thumbs up) or -1 (thumbs down)' }),
      };
    }

    // Validate comment length
    if (request.comment && request.comment.length > 500) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'comment must be 500 characters or less' }),
      };
    }

    // Get job for token verification
    const jobResult = await docClient.send(new GetCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
    }));

    if (!jobResult.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    const job = jobResult.Item;
    const now = Math.floor(Date.now() / 1000);

    // Check expiry
    if (job.expires_at <= now) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job expired' }),
      };
    }

    // Verify token
    if (!verifyJobTokenHash(token, job.job_read_token_hash)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    // Check rate limit and dedupe
    const commentHash = hashComment(request.comment);
    const rateLimitCheck = await checkRateLimitAndDedupe(jobId, request.rating, commentHash);
    
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429, // Too Many Requests (or 409 for dedupe, but 429 covers both)
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: rateLimitCheck.reason }),
      };
    }

    // Create feedback item
    const feedbackId = generateFeedbackId();
    const createdAt = new Date().toISOString();
    const userAgent = event.headers['User-Agent'] || event.headers['user-agent'];

    const feedbackItem: FeedbackItem = {
      job_id: jobId,
      feedback_id: feedbackId,
      rating: request.rating,
      comment: request.comment,
      comment_hash: commentHash,
      created_at: createdAt,
      user_agent: userAgent,
    };

    // Write to DynamoDB
    await docClient.send(new PutCommand({
      TableName: FEEDBACK_TABLE_NAME,
      Item: feedbackItem,
    }));

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedback_id: feedbackId,
        message: 'Thank you for your feedback!',
      }),
    };

  } catch (error) {
    console.error('Error submitting feedback:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
