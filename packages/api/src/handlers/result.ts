/**
 * Result Handler
 * Sprint 7, Story 1.3: Results Display & User Feedback
 * 
 * Endpoints:
 * - GET /api/v1/jobs/{job_id}/result - Get complete run record for results page
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const DECISION_EVENTS_BY_JOB_TABLE_NAME = process.env.DECISION_EVENTS_BY_JOB_TABLE_NAME || 'til-decision-events-by-job';

// Iteration submission structure
interface IterationSubmission {
  iteration: number;
  title: string;
  abstract: string;
  manager_feedback: string | null;
  accepted: boolean;
}

// Provenance structure (actionable, per Sprint 7 backlog)
interface Provenance {
  artifacts_used: Array<{ artifact_id: string; purpose: string }>;
  sources: Array<{ kind: 'conference_rules' | 'web' | 'internal'; ref: string; note?: string }>;
}

// Complete result response
interface ResultResponse {
  job_id: string;
  status: string;
  conference: string;
  topic: string;
  
  // Final output
  final_title: string | null;
  final_abstract: string | null;
  selected_iteration: number | null;
  
  // Iteration history
  iterations: IterationSubmission[];
  
  // Evaluator
  evaluator: {
    predicted_conference: string;
    confidence: number | null;
    matches_target: boolean;
  } | null;
  
  // Summary stats
  summary: {
    total_iterations: number;
    duration_seconds: number;
    total_tool_calls: number;
    estimated_cost_usd: string;
  };
  
  // Provenance (optional, for future credibility features)
  provenance?: Provenance;
}

/**
 * Extract iteration submissions from decision events
 */
async function extractIterations(jobId: string): Promise<IterationSubmission[]> {
  const iterations: IterationSubmission[] = [];
  
  try {
    // Query all events for this job
    const result = await docClient.send(new QueryCommand({
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      ScanIndexForward: true,
    }));
    
    const events = result.Items || [];
    
    // Track iterations by their number
    const iterationMap = new Map<number, IterationSubmission>();
    
    for (const event of events) {
      const eventType = event.event_type;
      const iteration = event.iteration ?? 0;
      const details = event.details || {};
      
      // Initialize iteration if not seen
      if (!iterationMap.has(iteration)) {
        iterationMap.set(iteration, {
          iteration,
          title: '',
          abstract: '',
          manager_feedback: null,
          accepted: false,
        });
      }
      
      const iterData = iterationMap.get(iteration)!;
      
      // Extract submission data
      if (eventType === 'abstract_submitted' || eventType === 'iteration_completed') {
        if (details.title) iterData.title = details.title;
        if (details.abstract) iterData.abstract = details.abstract;
      }
      
      // Extract manager feedback
      if (eventType === 'manager_rejected') {
        iterData.manager_feedback = details.feedback_summary || details.rationale || 'Revision requested';
        iterData.accepted = false;
      }
      
      if (eventType === 'manager_accepted') {
        iterData.accepted = true;
        iterData.manager_feedback = details.feedback_summary || null;
      }
      
      if (eventType === 'manager_selected_best_iteration') {
        const selectedIter = details.selected_iteration;
        if (typeof selectedIter === 'number' && iterationMap.has(selectedIter)) {
          iterationMap.get(selectedIter)!.accepted = true;
        }
      }
    }
    
    // Convert to array and sort by iteration number
    return Array.from(iterationMap.values())
      .filter(iter => iter.title || iter.abstract) // Only include iterations with content
      .sort((a, b) => a.iteration - b.iteration);
      
  } catch (error) {
    console.warn('Failed to extract iterations:', error);
    return [];
  }
}

/**
 * Calculate summary stats from events
 */
async function calculateSummary(jobId: string, createdAt: string, completedAt?: string): Promise<{
  total_iterations: number;
  duration_seconds: number;
  total_tool_calls: number;
  estimated_cost_usd: string;
}> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
    }));
    
    const events = result.Items || [];
    
    // Count iterations (max iteration number + 1)
    const maxIteration = events.reduce((max, e) => Math.max(max, e.iteration ?? 0), 0);
    
    // Count tool calls
    const toolCalls = events.filter(e => e.event_type === 'tool_called').length;
    
    // Calculate duration
    const startTime = new Date(createdAt).getTime();
    const endTime = completedAt ? new Date(completedAt).getTime() : Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);
    
    // Sum up costs from cost_event events
    let totalCost = 0;
    for (const event of events) {
      if (event.event_type === 'cost_event') {
        const cost = event.details?.cost_usd || event.details?.amount || 0;
        totalCost += typeof cost === 'number' ? cost : parseFloat(cost) || 0;
      }
    }
    
    return {
      total_iterations: maxIteration + 1,
      duration_seconds: durationSeconds,
      total_tool_calls: toolCalls,
      estimated_cost_usd: totalCost.toFixed(4),
    };
    
  } catch (error) {
    console.warn('Failed to calculate summary:', error);
    return {
      total_iterations: 0,
      duration_seconds: 0,
      total_tool_calls: 0,
      estimated_cost_usd: '0.0000',
    };
  }
}

/**
 * Extract provenance from events (artifacts used, sources)
 */
async function extractProvenance(jobId: string): Promise<Provenance | undefined> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
    }));
    
    const events = result.Items || [];
    
    const artifactsUsed: Provenance['artifacts_used'] = [];
    const sources: Provenance['sources'] = [];
    const seenArtifacts = new Set<string>();
    const seenSources = new Set<string>();
    
    for (const event of events) {
      const details = event.details || {};
      
      // Collect artifacts
      if (event.event_type === 'artifact_created' && details.artifact_id) {
        if (!seenArtifacts.has(details.artifact_id)) {
          seenArtifacts.add(details.artifact_id);
          artifactsUsed.push({
            artifact_id: details.artifact_id,
            purpose: details.artifact_type || 'unknown',
          });
        }
      }
      
      // Collect sources from tool calls (web searches, conference rules lookups)
      if (event.event_type === 'tool_called') {
        const toolName = details.tool_name || details.name || '';
        
        if (toolName.includes('search') || toolName.includes('web')) {
          const ref = details.query || details.url || toolName;
          if (!seenSources.has(ref)) {
            seenSources.add(ref);
            sources.push({
              kind: 'web',
              ref,
              note: details.result_summary?.substring(0, 100),
            });
          }
        }
        
        if (toolName.includes('conference') || toolName.includes('rules')) {
          const ref = details.conference || 'conference_rules';
          if (!seenSources.has(ref)) {
            seenSources.add(ref);
            sources.push({
              kind: 'conference_rules',
              ref,
            });
          }
        }
      }
    }
    
    // Only return provenance if we have data
    if (artifactsUsed.length === 0 && sources.length === 0) {
      return undefined;
    }
    
    return { artifacts_used: artifactsUsed, sources };
    
  } catch (error) {
    console.warn('Failed to extract provenance:', error);
    return undefined;
  }
}

/**
 * GET /api/v1/jobs/{job_id}/result - Get complete run record
 * Sprint 7, Story 1.3
 */
export async function getJobResultHandler(
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

    // Get job from DynamoDB
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

    // Extract data from events
    const [iterations, summary, provenance] = await Promise.all([
      extractIterations(jobId),
      calculateSummary(jobId, job.created_at, job.completed_at),
      extractProvenance(jobId),
    ]);

    // Build evaluator object
    let evaluator: ResultResponse['evaluator'] = null;
    if (job.evaluator_prediction && job.evaluator_prediction !== 'null') {
      const confidence = job.evaluator_confidence ? parseFloat(job.evaluator_confidence) : null;
      evaluator = {
        predicted_conference: job.evaluator_prediction,
        confidence: isNaN(confidence as number) ? null : confidence,
        matches_target: job.evaluator_prediction === job.request_context?.conference,
      };
    }

    // Build response
    const response: ResultResponse = {
      job_id: jobId,
      status: job.status,
      conference: job.request_context?.conference || '',
      topic: job.request_context?.topic || '',
      
      // Final output
      final_title: job.final_title || null,
      final_abstract: job.final_abstract || null,
      selected_iteration: job.selected_iteration ?? null,
      
      // Iteration history
      iterations,
      
      // Evaluator
      evaluator,
      
      // Summary stats
      summary,
      
      // Provenance (optional)
      provenance,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
    
  } catch (error) {
    console.error('Error getting job result:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
