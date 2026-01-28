/**
 * Event Handlers
 * Story 3.1: Decision Event Capture
 * Sprint 7: Enhanced with normalized payloads and cursor fields
 * 
 * Endpoints:
 * - GET /api/v1/workflow/{job_id}/events?token={job_read_token}[&event_type={type}][&limit={n}][&cursor={cursor}]
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { normalizeEvents, buildCursor, NormalizedEvent } from './event-normalization';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const DECISION_EVENTS_BY_JOB_TABLE_NAME = process.env.DECISION_EVENTS_BY_JOB_TABLE_NAME || 'til-decision-events-by-job';

// Default limit for pagination
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const TRUNCATION_THRESHOLD = 1000; // Show truncated warning if more than this

/**
 * Verify job_read_token and return job if valid
 */
async function verifyJobToken(
  jobId: string,
  token: string
): Promise<{ valid: boolean; job?: any; statusCode?: number }> {
  if (!token) {
    return { valid: false, statusCode: 400 };
  }

  const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await docClient.send(new GetCommand({
    TableName: JOBS_TABLE_NAME,
    Key: { job_id: jobId },
  }));

  // If item missing → 404 Not Found
  if (!result.Item) {
    return { valid: false, statusCode: 404 };
  }

  const job = result.Item;
  const now = Math.floor(Date.now() / 1000);

  // If expires_at <= now → 410 Gone
  if (job.expires_at <= now) {
    return { valid: false, statusCode: 410 };
  }

  // If token mismatch → 403 Forbidden
  const { verifyJobTokenHash } = await import('../../../shared/auth/token-verifier');
  if (!verifyJobTokenHash(token, job.job_read_token_hash)) {
    return { valid: false, statusCode: 403 };
  }

  return { valid: true, job };
}

/**
 * Encode cursor (LastEvaluatedKey) as base64 JSON
 * Cursor is opaque to client - they must not depend on structure
 */
function encodeCursor(lastEvaluatedKey: Record<string, any> | undefined): string | null {
  if (!lastEvaluatedKey) {
    return null;
  }
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
}

/**
 * Decode cursor (base64 JSON) to LastEvaluatedKey
 */
function decodeCursor(cursor: string): Record<string, any> | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Get total event count for a job (for server_event_count field)
 */
async function getEventCount(jobId: string): Promise<number> {
  try {
    // Use Select: COUNT to just get the count without retrieving items
    const result = await docClient.send(new QueryCommand({
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      Select: 'COUNT',
    }));
    return result.Count || 0;
  } catch (error) {
    console.warn('Failed to get event count:', error);
    return 0;
  }
}

/**
 * GET /api/v1/workflow/{job_id}/events?token={job_read_token}[&event_type={type}][&limit={n}][&cursor={cursor}]
 * Story 3.1: Decision Event Capture
 * Sprint 7: Enhanced with normalized payloads and cursor fields
 * 
 * Retrieves decision events for a job in chronological order (seq-first ensures deterministic ordering).
 * Supports pagination and optional event_type filtering (client-side).
 * 
 * Response includes:
 * - events: NormalizedEvent[] with actor_label, event_type (UIEventType), summary
 * - next_cursor: string | null (format: "timestamp|event_id")
 * - server_event_count: number
 * - truncated: boolean
 */
export async function getEventsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.job_id;
    const token = event.queryStringParameters?.token;
    const eventType = event.queryStringParameters?.event_type;
    const limitParam = event.queryStringParameters?.limit;
    const cursor = event.queryStringParameters?.cursor;

    if (!jobId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'job_id is required' }),
      };
    }

    // Verify job_read_token
    const tokenCheck = await verifyJobToken(jobId, token || '');
    if (!tokenCheck.valid) {
      return {
        statusCode: tokenCheck.statusCode || 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: tokenCheck.statusCode === 404 ? 'Job not found' :
                 tokenCheck.statusCode === 410 ? 'Job expired' :
                 tokenCheck.statusCode === 400 ? 'token query parameter is required' :
                 'Invalid token'
        }),
      };
    }

    // Parse limit (default 200, max 1000)
    let limit = DEFAULT_LIMIT;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'limit must be a positive integer' }),
        };
      }
      limit = Math.min(parsedLimit, MAX_LIMIT);
    }

    // Decode cursor if provided
    let exclusiveStartKey: Record<string, any> | undefined;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid cursor format' }),
        };
      }
      exclusiveStartKey = decoded;
    }

    // Query decision_events_by_job table by job_id (PK=job_id, ascending SK for deterministic order)
    const queryParams: any = {
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      ScanIndexForward: true, // Ascending order (seq-first ensures deterministic order)
      Limit: limit,
    };

    if (exclusiveStartKey) {
      queryParams.ExclusiveStartKey = exclusiveStartKey;
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    // Get raw events
    let rawEvents = result.Items || [];
    
    // Filter by event_type if provided (client-side filtering)
    if (eventType) {
      rawEvents = rawEvents.filter((e: any) => e.event_type === eventType);
    }
    
    // Normalize events for UI (Sprint 7)
    const normalizedEvents: NormalizedEvent[] = normalizeEvents(rawEvents);
    
    // Build next_cursor (locked format: "timestamp|event_id")
    let nextCursor: string | null = null;
    if (normalizedEvents.length > 0 && result.LastEvaluatedKey) {
      const lastEvent = normalizedEvents[normalizedEvents.length - 1];
      nextCursor = buildCursor(lastEvent);
    }
    
    // Get server event count (best effort)
    const serverEventCount = await getEventCount(jobId);
    
    // Determine if truncated
    const truncated = serverEventCount > TRUNCATION_THRESHOLD && normalizedEvents.length < serverEventCount;

    // Return enhanced event response (Sprint 7)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: normalizedEvents,
        next_cursor: nextCursor,
        server_event_count: serverEventCount,
        truncated,
        // Keep replay metadata for backward compatibility
        replay: {
          ordered: true,
          ordering_key: 'seq',
          gaps: [],
        },
      }),
    };
  } catch (error: any) {
    console.error('Error retrieving events:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
