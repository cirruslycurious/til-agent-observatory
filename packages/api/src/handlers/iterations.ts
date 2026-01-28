/**
 * Iteration Submissions Handler
 * Sprint 7: Fetch title/abstract submissions for each iteration from decision events
 * 
 * Endpoint:
 * - GET /api/v1/workflow/{job_id}/iterations?token={job_read_token}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const DECISION_EVENTS_BY_JOB_TABLE_NAME = process.env.DECISION_EVENTS_BY_JOB_TABLE_NAME || 'til-decision-events-by-job';

interface IterationSubmission {
  iteration: number;
  title: string;
  abstract: string;
  confidence?: number;
  tools_used?: string[];
  decision: 'accept' | 'reject' | 'pending';
  // Full manager scoring
  quality_score?: number;
  strengths?: string[];
  weaknesses?: string[];
  reasoning?: string;
  feedback?: string;
  creativity?: number;
  // Goal for this iteration
  goal?: string;
}

/**
 * GET /api/v1/workflow/{job_id}/iterations?token={job_read_token}
 * 
 * Returns all iteration submissions (title, abstract, full scoring) for a job
 * by querying decision events.
 */
export async function getIterationsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.job_id;
    const token = event.queryStringParameters?.token;

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
        body: JSON.stringify({ error: 'token query parameter is required' }),
      };
    }

    // Get job and verify token
    const result = await docClient.send(new GetCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    const job = result.Item;
    const now = Math.floor(Date.now() / 1000);

    if (job.expires_at <= now) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job expired' }),
      };
    }

    if (!verifyJobTokenHash(token, job.job_read_token_hash)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    // Query decision events for this job
    const eventsResult = await docClient.send(new QueryCommand({
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :jid',
      ExpressionAttributeValues: { ':jid': jobId },
    }));

    const events = eventsResult.Items || [];
    
    // Build iteration data from events
    const iterationMap: Record<number, IterationSubmission> = {};
    
    for (const evt of events) {
      const iteration = parseInt(evt.iteration ?? '0', 10);
      const eventType = evt.event_type;
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      
      // Initialize iteration entry if needed
      if (!iterationMap[iteration]) {
        iterationMap[iteration] = {
          iteration,
          title: '',
          abstract: '',
          decision: 'pending',
        };
      }
      
      const iter = iterationMap[iteration];
      
      // Extract title/abstract from abstract_submitted event
      if (eventType === 'abstract_submitted') {
        iter.title = details?.title || iter.title;
        iter.abstract = details?.abstract || iter.abstract;
        iter.confidence = details?.confidence;
        iter.tools_used = details?.tools_used;
      }
      
      // Extract goal from manager_goal_formulated
      if (eventType === 'manager_goal_formulated') {
        iter.goal = details?.goal;
        iter.creativity = details?.creativity;
      }
      
      // Extract full scoring from manager_rejected or manager_accepted
      if (eventType === 'manager_rejected' || eventType === 'manager_accepted') {
        iter.decision = eventType === 'manager_accepted' ? 'accept' : 'reject';
        iter.quality_score = details?.quality_score;
        iter.feedback = details?.feedback_for_worker || details?.reasoning;
        iter.reasoning = details?.reasoning;
        iter.creativity = details?.creativity ?? iter.creativity;
        
        // Extract strengths and weaknesses arrays
        if (Array.isArray(details?.strengths)) {
          iter.strengths = details.strengths;
        }
        if (Array.isArray(details?.weaknesses)) {
          iter.weaknesses = details.weaknesses;
        }
      }
      
      // Extract title/abstract from agentic_loop_completed
      if (eventType === 'agentic_loop_completed') {
        iter.title = details?.title || iter.title;
        iter.abstract = details?.abstract || iter.abstract;
        iter.confidence = details?.confidence ?? iter.confidence;
        iter.tools_used = details?.tools_used || iter.tools_used;
      }
    }
    
    // Convert to sorted array
    const iterations = Object.values(iterationMap).sort((a, b) => a.iteration - b.iteration);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        iterations,
        selected_iteration: job.selected_iteration,
        final_title: job.final_title,
        final_abstract: job.final_abstract,
      }),
    };
  } catch (error: any) {
    console.error('Error getting iterations:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
