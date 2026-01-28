/**
 * Tool Usage Handlers
 * Story 3.3: Tool Usage Logging
 * 
 * Endpoints:
 * - GET /api/v1/workflow/{job_id}/tools?token={job_read_token}[&limit={n}][&cursor={cursor}]
 * - GET /api/v1/workflow/{job_id}/tools/sequences?token={job_read_token}
 * - GET /api/v1/workflow/{job_id}/tools/effectiveness?token={job_read_token}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const DECISION_EVENTS_BY_JOB_TABLE_NAME = process.env.DECISION_EVENTS_BY_JOB_TABLE_NAME || 'til-decision-events-by-job';

// Default limit for pagination
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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
 * GET /api/v1/workflow/{job_id}/tools?token={job_read_token}[&limit={n}][&cursor={cursor}]
 * Story 3.3: Tool Usage Logging
 * 
 * Retrieves all tool calls for a job in chronological order.
 */
export async function getToolsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.job_id;
    const token = event.queryStringParameters?.token;
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

    // Parse limit (default 100, max 500)
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

    // Query decision_events_by_job table by job_id, filter by event_type="tool_called"
    const queryParams: any = {
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      ScanIndexForward: true, // Ascending order
      Limit: limit,
    };

    if (exclusiveStartKey) {
      queryParams.ExclusiveStartKey = exclusiveStartKey;
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    // Filter by event_type="tool_called" (client-side filtering for MVP)
    let toolCalls = result.Items || [];
    toolCalls = toolCalls.filter((item: any) => item.event_type === 'tool_called');

    // Sort by seq (already sorted by SK, but ensure seq order)
    toolCalls.sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0));

    // Encode next cursor if more events available
    const nextCursor = encodeCursor(result.LastEvaluatedKey);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_calls: toolCalls,
        total: toolCalls.length,
        next_cursor: nextCursor,
      }),
    };
  } catch (error: any) {
    console.error('Error retrieving tool calls:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/workflow/{job_id}/tools/sequences?token={job_read_token}
 * Story 3.3: Tool Usage Logging
 * 
 * Retrieves tool call sequences grouped by actor and sub_worker_instance_id.
 */
export async function getToolSequencesHandler(
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

    // Query all tool calls (no pagination for sequences)
    const queryParams: any = {
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      ScanIndexForward: true,
    };

    let allItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        queryParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await docClient.send(new QueryCommand(queryParams));
      allItems = allItems.concat(result.Items || []);
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Filter by event_type="tool_called"
    const toolCalls = allItems.filter((item: any) => item.event_type === 'tool_called');

    // Group by actor and sub_worker_instance_id
    const sequencesDict: Record<string, any> = {};

    for (const toolCall of toolCalls) {
      const actor = toolCall.actor || 'unknown';
      const subWorkerInstanceId = toolCall.sub_worker_instance_id;

      const sequenceKey = `${actor}#${subWorkerInstanceId || 'none'}`;

      if (!sequencesDict[sequenceKey]) {
        sequencesDict[sequenceKey] = {
          actor,
          sub_worker_instance_id: subWorkerInstanceId,
          tool_calls: [],
        };
      }

      const details = toolCall.details || {};
      sequencesDict[sequenceKey].tool_calls.push({
        tool_name: details.tool_name,
        reasoning: details.reasoning,
        timestamp: toolCall.timestamp,
        success_status: details.success_status,
        seq: toolCall.seq,
      });
    }

    // Convert to list and sort
    const sequences = Object.values(sequencesDict);
    for (const sequence of sequences) {
      sequence.tool_calls.sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0));
    }
    sequences.sort((a: any, b: any) => {
      const aSeq = a.tool_calls[0]?.seq || 0;
      const bSeq = b.tool_calls[0]?.seq || 0;
      return aSeq - bSeq;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequences,
      }),
    };
  } catch (error: any) {
    console.error('Error retrieving tool sequences:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/workflow/{job_id}/tools/effectiveness?token={job_read_token}
 * Story 3.3: Tool Usage Logging
 * 
 * Retrieves tool effectiveness metrics (success rate, avg_time, avg_cost per tool).
 */
export async function getToolEffectivenessHandler(
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

    // Query all tool calls (no pagination for metrics)
    const queryParams: any = {
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      ScanIndexForward: true,
    };

    let allItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        queryParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await docClient.send(new QueryCommand(queryParams));
      allItems = allItems.concat(result.Items || []);
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Filter by event_type="tool_called"
    const toolCalls = allItems.filter((item: any) => item.event_type === 'tool_called');

    // Calculate metrics per tool
    const toolStats: Record<string, any> = {};

    for (const toolCall of toolCalls) {
      const details = toolCall.details || {};
      const toolName = details.tool_name;

      if (!toolName) {
        continue;
      }

      if (!toolStats[toolName]) {
        toolStats[toolName] = {
          total_calls: 0,
          successful_calls: 0,
          total_time_ms: 0,
          total_cost_usd: 0,
        };
      }

      const stats = toolStats[toolName];
      stats.total_calls += 1;

      if (details.success_status === 'success') {
        stats.successful_calls += 1;
      }

      if (details.execution_time_ms) {
        stats.total_time_ms += details.execution_time_ms;
      }

      if (details.cost_usd) {
        stats.total_cost_usd += details.cost_usd;
      }
    }

    // Calculate final metrics
    const metrics: Record<string, any> = {};

    for (const [toolName, stats] of Object.entries(toolStats)) {
      const totalCalls = stats.total_calls;
      const successfulCalls = stats.successful_calls;

      metrics[toolName] = {
        success_rate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 1000) / 1000 : 0,
        avg_time_ms: totalCalls > 0 ? Math.round(stats.total_time_ms / totalCalls) : 0,
        avg_cost_usd: totalCalls > 0 ? Math.round((stats.total_cost_usd / totalCalls) * 10000) / 10000 : 0,
        total_calls: totalCalls,
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics,
      }),
    };
  } catch (error: any) {
    console.error('Error retrieving tool effectiveness:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
