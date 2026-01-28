/**
 * Job Lifecycle Handlers
 * Story 6.5: Job Lifecycle & Metadata Table
 * Sprint 7: Enhanced with phase projection
 * 
 * Endpoints:
 * - POST /api/v1/jobs - Create new job
 * - GET /api/v1/jobs/{job_id}/status - Get job status (with phase projection)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SFNClient, StartExecutionCommand, DescribeExecutionCommand, GetExecutionHistoryCommand } from '@aws-sdk/client-sfn';
import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';
// Import from shared auth package (relative path in monorepo)
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';
// Import budget service (Story 4.1)
import { initializeJobBudget } from '../../../shared/budget-service/budget_client';
// Import phase mapping utilities (Sprint 7)
import { buildPhaseProjection, getPhaseFromState, PhaseProjection } from './phase-mapping';

const dynamoClient = new DynamoDBClient({});
// Configure DocumentClient to remove undefined values (DynamoDB doesn't allow undefined)
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const ssmClient = new SSMClient({});
const sfnClient = new SFNClient({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const DECISION_EVENTS_BY_JOB_TABLE_NAME = process.env.DECISION_EVENTS_BY_JOB_TABLE_NAME || 'til-decision-events-by-job';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || ''; // Will be set by CDK
const SERVER_SECRET = process.env.SERVER_SECRET || ''; // Required: set via Lambda environment variable
const SYSTEM_ENABLED_PARAMETER = process.env.SYSTEM_ENABLED_PARAMETER || '/conference-abstract/system-enabled';
const KILL_SWITCH_TIMEOUT_MS = parseInt(process.env.KILL_SWITCH_TIMEOUT_MS || '2000', 10); // 2000ms default, fail closed

// Conference and topic enums (snake_case for consistency)
const CONFERENCES = ['black_hat', 'reinvent', 'kubecon', 'gartner_symposium', 'google_cloud_next'] as const;
const TOPICS = [
  'ai_ml_genai',
  'security_zero_trust',
  'cloud_arch_infra',
  'k8s_containers',
  'platform_devops',
  'networking_mesh',
  'data_analytics',
  'leadership_governance',
] as const;

type Conference = typeof CONFERENCES[number];
type Topic = typeof TOPICS[number];

interface CreateJobRequest {
  conference: Conference;
  topic: Topic;
  user_session_id?: string;
}

interface JobItem {
  job_id: string;
  job_read_token_hash: string;
  status: 'queued' | 'running' | 'completed' | 'completed_with_compromises' | 'failed';
  failure_reason?: 'timeout' | 'validation_failed' | 'budget_exceeded' | 'internal_error' | 'no_acceptance_after_5_iterations' | 'unknown';
  created_at: string;
  updated_at: string;
  completed_at?: string;
  last_heartbeat_at?: string;
  expires_at: number; // Unix timestamp
  request_context: {
    conference: Conference;
    topic: Topic;
    user_session_id?: string;
  };
  vendor_assignment: {
    manager_vendor: 'openai' | 'anthropic';
    manager_model: string;
    worker_vendor: 'openai' | 'anthropic';
    worker_model: string;
    evaluator_model?: string;
  };
  error?: string; // Max 500 chars, truncated
  step_functions_execution_arn?: string;
  // Final output fields (set on completion)
  final_title?: string;
  final_abstract?: string;
  selected_iteration?: number;
  evaluator_prediction?: string;
  evaluator_confidence?: string;
  public_status?: {
    status: 'queued' | 'running' | 'completed' | 'completed_with_compromises' | 'failed';
    created_at: string;
    completed_at?: string;
    error_code?: string;
  };
}

/**
 * Generate HMAC-SHA256 hash of token
 */
function hashToken(token: string): string {
  return createHmac('sha256', SERVER_SECRET).update(token).digest('hex');
}

// Token verification now uses shared utility (verifyJobTokenHash)

/**
 * Generate vendor assignment (randomized for now, will be configurable later)
 */
function generateVendorAssignment(): JobItem['vendor_assignment'] {
  const vendors: Array<'openai' | 'anthropic'> = ['openai', 'anthropic'];
  const models = {
    openai: ['gpt-4', 'gpt-4-turbo'],
    anthropic: ['claude-3-opus', 'claude-3-sonnet'],
  };
  
  const managerVendor = vendors[Math.floor(Math.random() * vendors.length)];
  const workerVendor = vendors[Math.floor(Math.random() * vendors.length)];
  
  return {
    manager_vendor: managerVendor,
    manager_model: models[managerVendor][0],
    worker_vendor: workerVendor,
    worker_model: models[workerVendor][0],
  };
}

/**
 * Check global kill switch (Story 4.3)
 * 
 * Reads Parameter Store flag with timeout. Fails closed (treats as disabled) on timeout/error.
 * 
 * @returns true if system is enabled, false if disabled or error/timeout
 */
async function checkSystemEnabled(): Promise<boolean> {
  try {
    // Create promise with timeout
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        // Fail closed: timeout = system disabled
        console.warn(`Kill switch check timed out after ${KILL_SWITCH_TIMEOUT_MS}ms - treating as disabled`);
        resolve(false);
      }, KILL_SWITCH_TIMEOUT_MS);
    });

    const checkPromise = (async () => {
      try {
        const command = new GetParameterCommand({
          Name: SYSTEM_ENABLED_PARAMETER,
        });
        const response = await ssmClient.send(command);
        const value = response.Parameter?.Value || 'false';
        return value.toLowerCase() === 'true';
      } catch (error: any) {
        // Fail closed: error = system disabled
        console.error(`Kill switch check failed: ${error.message} - treating as disabled`);
        return false;
      }
    })();

    // Race: timeout vs actual check
    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error: any) {
    // Fail closed: any exception = system disabled
    console.error(`Kill switch check exception: ${error.message} - treating as disabled`);
    return false;
  }
}

/**
 * POST /api/v1/jobs - Create new job
 * AC: 7-20, 21, 34, 39
 * Story 4.3: Global kill switch check before any cost-incurring operations
 */
export async function createJobHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // **Kill switch check FIRST (before any cost-incurring operations)**
    // Story 4.3: Check Parameter Store flag before creating job
    const systemEnabled = await checkSystemEnabled();
    if (!systemEnabled) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'System temporarily unavailable for maintenance. Please try again later.',
        }),
      };
    }

    // Parse and validate request
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: CreateJobRequest = JSON.parse(event.body);

    // Validate conference
    if (!CONFERENCES.includes(request.conference as Conference)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Invalid conference',
          valid_conferences: CONFERENCES,
        }),
      };
    }

    // Validate topic
    if (!TOPICS.includes(request.topic as Topic)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Invalid topic',
          valid_topics: TOPICS,
        }),
      };
    }

    // Generate job_id (UUID v4)
    const jobId = randomUUID();

    // Generate job_read_token (random string, 32+ characters, high entropy)
    const jobReadToken = randomUUID() + randomUUID(); // 64 characters for high entropy

    // Hash token: HMAC-SHA256(server_secret, job_read_token)
    const jobReadTokenHash = hashToken(jobReadToken);

    // Set timestamps
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = Math.floor(now.getTime() / 1000) + (7 * 24 * 60 * 60); // 7 days from now

    // Set status = queued (Step Functions will update to running when it starts)
    const status: 'queued' = 'queued';

    // Create job item
    const jobItem: JobItem = {
      job_id: jobId,
      job_read_token_hash: jobReadTokenHash,
      status,
      created_at: createdAt,
      updated_at: createdAt,
      expires_at: expiresAt,
      request_context: {
        conference: request.conference,
        topic: request.topic,
        user_session_id: request.user_session_id,
      },
      vendor_assignment: generateVendorAssignment(),
      public_status: {
        status,
        created_at: createdAt,
      },
    };

    // Write to DynamoDB with ConditionExpression: attribute_not_exists(job_id)
    // (Defensive, UUID collisions are extremely rare)
    await docClient.send(new PutCommand({
      TableName: JOBS_TABLE_NAME,
      Item: jobItem,
      ConditionExpression: 'attribute_not_exists(job_id)',
    }));

    // Initialize budget tracking (Story 4.1)
    // Budget initialization is idempotent - if it already exists, returns existing budget
    // Errors are logged but don't fail job creation (budget is best-effort for now)
    try {
      await initializeJobBudget(jobId);
    } catch (error: any) {
      // Log warning but don't fail job creation
      // Budget service works independently - job can proceed without budget tracking
      console.warn(`Failed to initialize budget for job ${jobId}:`, error);
      // Continue - job creation succeeds even if budget initialization fails
    }

    // Start Step Functions execution (Story: Step Functions Orchestration)
    let stepFunctionsExecutionArn: string | undefined;
    let finalStatus: 'queued' | 'running' = 'queued';
    
    if (STATE_MACHINE_ARN) {
      try {
        const executionInput = {
          job_id: jobId,
          conference: request.conference,
          topic: request.topic,
          iteration: 0,
          previous_outputs: [],
          previous_artifacts: [],
        };

        const startExecutionCommand = new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: `job-${jobId}`, // Unique execution name
          input: JSON.stringify(executionInput),
        });

        const executionResponse = await sfnClient.send(startExecutionCommand);
        stepFunctionsExecutionArn = executionResponse.executionArn;

        // Update job with execution ARN and status
        await docClient.send(new UpdateCommand({
          TableName: JOBS_TABLE_NAME,
          Key: { job_id: jobId },
          UpdateExpression: 'SET step_functions_execution_arn = :arn, #status = :status, #updated_at = :updated_at',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updated_at': 'updated_at',
          },
          ExpressionAttributeValues: {
            ':arn': stepFunctionsExecutionArn,
            ':status': 'running', // Update to running when Step Functions starts
            ':updated_at': new Date().toISOString(),
          },
        }));
        
        finalStatus = 'running';
      } catch (error: any) {
        // Log error but don't fail job creation
        // Step Functions execution can be retried manually if needed
        console.error(`Failed to start Step Functions execution for job ${jobId}:`, error);
        // Continue - job creation succeeds even if Step Functions start fails
      }
    }

    // TODO: Emit job_created decision event (Story 3.1)
    // TODO: If status = running on create, also emit job_started decision event

    // Return job_id and job_read_token (token only returned once, on creation)
    return {
      statusCode: 202, // Accepted
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        job_read_token: jobReadToken,
        status: finalStatus,
        estimated_time_seconds: 90,
        step_functions_execution_arn: stepFunctionsExecutionArn || undefined,
      }),
    };
  } catch (error: any) {
    // Handle ConditionalCheckFailedException (duplicate job_id - extremely rare)
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job already exists' }),
      };
    }

    console.error('Error creating job:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * Get the latest event timestamp and iteration from decision events
 */
async function getLatestEventInfo(jobId: string): Promise<{ lastEventAt: string | null; iteration: number }> {
  try {
    // Query events in descending order to get the latest
    const result = await docClient.send(new QueryCommand({
      TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
      KeyConditionExpression: 'job_id = :job_id',
      ExpressionAttributeValues: {
        ':job_id': jobId,
      },
      ScanIndexForward: false, // Descending order
      Limit: 1,
    }));

    if (result.Items && result.Items.length > 0) {
      const latestEvent = result.Items[0];
      return {
        lastEventAt: latestEvent.timestamp || null,
        iteration: latestEvent.iteration ?? 0,
      };
    }
    
    return { lastEventAt: null, iteration: 0 };
  } catch (error) {
    console.warn('Failed to get latest event info:', error);
    return { lastEventAt: null, iteration: 0 };
  }
}

/**
 * Get Step Functions execution state (if available)
 * Returns the actual state name (e.g., "WorkerExecution", "CheckEvaluatorResult")
 * not just the status (RUNNING, SUCCEEDED, etc.)
 */
async function getStepFunctionsState(executionArn: string | undefined): Promise<string | undefined> {
  if (!executionArn) return undefined;
  
  try {
    // First check status - if not RUNNING, return the status
    const describeResult = await sfnClient.send(new DescribeExecutionCommand({
      executionArn,
    }));
    
    if (describeResult.status !== 'RUNNING') {
      return describeResult.status; // SUCCEEDED, FAILED, etc.
    }
    
    // For RUNNING executions, get the history to find current state
    // Query in reverse order to get the most recent event first
    const historyResult = await sfnClient.send(new GetExecutionHistoryCommand({
      executionArn,
      reverseOrder: true,
      maxResults: 20, // Only need recent events to find current state
    }));
    
    // Find the most recent StateEntered event to get current state name
    for (const event of historyResult.events || []) {
      if (event.type?.includes('StateEntered') && event.stateEnteredEventDetails?.name) {
        return event.stateEnteredEventDetails.name;
      }
    }
    
    // Fallback to status if no state found
    return describeResult.status;
  } catch (error) {
    console.warn('Failed to get Step Functions state:', error);
    return undefined;
  }
}

/**
 * GET /api/v1/jobs/{job_id}/status - Get job status
 * AC: 26, 31, 40
 * Sprint 7: Enhanced with phase projection
 */
export async function getJobStatusHandler(
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

    // Single-read auth+status: GetItem(job_id) once
    const result = await docClient.send(new GetCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
    }));

    // Deterministic return code order (prevents probing):
    // 1. If item missing → 404 Not Found
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    const job = result.Item as JobItem;
    const now = Math.floor(Date.now() / 1000);

    // 2. If expires_at <= now → 410 Gone (don't leak whether token is valid)
    if (job.expires_at <= now) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job expired' }),
      };
    }

    // 3. Else if token mismatch → 403 Forbidden
    if (!verifyJobTokenHash(token, job.job_read_token_hash)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    // 4. Else → 200 OK with enhanced status response
    
    // Get latest event info for phase projection
    const { lastEventAt, iteration } = await getLatestEventInfo(jobId);
    
    // Get Step Functions state (best effort)
    const stepFnState = await getStepFunctionsState(job.step_functions_execution_arn);
    
    // Build phase projection (Sprint 7)
    const phaseProjection = buildPhaseProjection(
      {
        status: job.status,
        created_at: job.created_at,
        completed_at: job.completed_at,
        failure_reason: job.failure_reason,
      },
      lastEventAt,
      iteration,
      stepFnState
    );

    // Build response with phase projection
    const response: Record<string, unknown> = {
      // Basic status fields
      status: job.status,
      created_at: job.created_at,
      completed_at: job.completed_at,
      error_code: job.failure_reason,
      
      // Request context
      conference: job.request_context.conference,
      topic: job.request_context.topic,
      
      // Phase projection (Sprint 7)
      current_phase: phaseProjection.current_phase,
      current_phase_label: phaseProjection.current_phase_label,
      phase_started_at: phaseProjection.phase_started_at,
      iteration: phaseProjection.iteration,
      max_iterations: phaseProjection.max_iterations,
      last_event_at: phaseProjection.last_event_at,
      phase_history: phaseProjection.phase_history,
      is_terminal: phaseProjection.is_terminal,
      terminal_reason: phaseProjection.terminal_reason,
    };
    
    // Include Step Functions state if available
    if (phaseProjection.stepfn_state) {
      response.stepfn_state = phaseProjection.stepfn_state;
    }
    
    // Add final output data for completed jobs
    if (job.status === 'completed' || job.status === 'completed_with_compromises') {
      if (job.final_title) response.final_title = job.final_title;
      if (job.final_abstract) response.final_abstract = job.final_abstract;
      if (job.selected_iteration !== undefined) response.selected_iteration = job.selected_iteration;
      if (job.evaluator_prediction && job.evaluator_prediction !== 'null') {
        response.evaluator_prediction = job.evaluator_prediction;
      }
      if (job.evaluator_confidence && job.evaluator_confidence !== 'null') {
        const conf = parseFloat(job.evaluator_confidence);
        if (!isNaN(conf)) response.evaluator_confidence = conf;
      }
      // Calculate evaluator agreement
      if (job.evaluator_prediction && job.evaluator_prediction !== 'null') {
        response.evaluator_agreement = job.evaluator_prediction === job.request_context.conference;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error getting job status:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * List all jobs (public endpoint, returns basic info only)
 * GET /api/v1/jobs
 */
export async function listJobsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;
    const maxLimit = 100;

    const jobs: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const scanParams: any = {
        TableName: JOBS_TABLE_NAME,
        Limit: Math.min(limit, maxLimit),
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await docClient.send(new ScanCommand(scanParams));

      if (result.Items) {
        // Return only public-safe fields
        const publicJobs = result.Items.map((item: any) => ({
          job_id: item.job_id,
          status: item.status || item.public_status?.status || 'unknown',
          created_at: item.created_at,
          completed_at: item.completed_at || item.public_status?.completed_at,
          conference: item.request_context?.conference,
          topic: item.request_context?.topic,
          final_title: item.final_title,
          error_code: item.failure_reason || item.public_status?.error_code,
        }));
        jobs.push(...publicJobs);
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey && jobs.length < limit);

    // Sort by created_at descending (newest first)
    jobs.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobs: jobs.slice(0, limit),
        count: jobs.length,
      }),
    };
  } catch (error) {
    console.error('Error listing jobs:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
