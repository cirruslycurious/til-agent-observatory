/**
 * Job Status Updater Utility
 * Story 6.5: Job Lifecycle & Metadata Table
 * 
 * Handles Step Functions state transitions with conditional updates
 * AC: 17-27, 41
 */

import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ['running'],
  running: ['completed', 'failed', 'running'], // running -> running is idempotent
  completed: ['completed'], // completed -> completed is idempotent
  failed: ['failed'], // failed -> failed is idempotent
};

// Terminal states (cannot transition to non-terminal)
const TERMINAL_STATES = ['completed', 'failed'];

/**
 * Check if state transition is valid
 */
function isValidTransition(currentStatus: string, newStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

/**
 * Update job status with conditional update to prevent regression
 * 
 * @param docClient - DynamoDB document client
 * @param jobId - Job ID
 * @param newStatus - New status (queued | running | completed | failed)
 * @param options - Additional update options
 */
export async function updateJobStatus(
  docClient: DynamoDBDocumentClient,
  jobId: string,
  newStatus: 'queued' | 'running' | 'completed' | 'failed',
  options: {
    failureReason?: 'timeout' | 'validation_failed' | 'budget_exceeded' | 'internal_error' | 'unknown';
    error?: string; // Max 500 chars, truncated
    stepFunctionsExecutionArn?: string;
    lastHeartbeatAt?: string;
  } = {}
): Promise<void> {
  const now = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  // Always update updated_at
  updateExpressions.push('#updated_at = :updated_at');
  expressionAttributeNames['#updated_at'] = 'updated_at';
  expressionAttributeValues[':updated_at'] = now;

  // Update status
  updateExpressions.push('#status = :new_status');
  expressionAttributeNames['#status'] = 'status';
  expressionAttributeValues[':new_status'] = newStatus;

  // Update completed_at for terminal states
  if (TERMINAL_STATES.includes(newStatus)) {
    updateExpressions.push('completed_at = :completed_at');
    expressionAttributeValues[':completed_at'] = now;
  }

  // Update failure_reason and error if failed
  if (newStatus === 'failed') {
    if (options.failureReason) {
      updateExpressions.push('failure_reason = :failure_reason');
      expressionAttributeValues[':failure_reason'] = options.failureReason;
    }
    if (options.error) {
      // Truncate error to 500 chars
      const truncatedError = options.error.substring(0, 500);
      updateExpressions.push('#error = :error');
      expressionAttributeNames['#error'] = 'error';
      expressionAttributeValues[':error'] = truncatedError;
    }
  }

  // Update step_functions_execution_arn if provided
  if (options.stepFunctionsExecutionArn) {
    updateExpressions.push('step_functions_execution_arn = :sfn_arn');
    expressionAttributeValues[':sfn_arn'] = options.stepFunctionsExecutionArn;
  }

  // Update last_heartbeat_at if provided
  if (options.lastHeartbeatAt) {
    updateExpressions.push('last_heartbeat_at = :heartbeat');
    expressionAttributeValues[':heartbeat'] = options.lastHeartbeatAt;
  }

  // Update public_status
  updateExpressions.push('public_status = :public_status');
  expressionAttributeValues[':public_status'] = {
    status: newStatus,
    created_at: '', // Will be set from existing item
    completed_at: TERMINAL_STATES.includes(newStatus) ? now : undefined,
    error_code: newStatus === 'failed' ? options.failureReason : undefined,
  };

  // Build condition expression to prevent regression
  // Read current_status from DynamoDB (authoritative), not supplied by client
  // ConditionExpression: status IN (:old_status, :new_status) OR attribute_not_exists(#status)
  // This allows:
  // - queued -> running (if status = queued)
  // - running -> completed/failed (if status = running)
  // - running -> running (idempotent, if status = running)
  // - completed -> completed (idempotent, if status = completed)
  // - failed -> failed (idempotent, if status = failed)
  
  let conditionExpression = '#status IN (:old_status, :new_status) OR attribute_not_exists(#status)';
  expressionAttributeValues[':old_status'] = newStatus; // Allow idempotent updates

  // For queued -> running transition, require status = queued
  if (newStatus === 'running') {
    conditionExpression = '#status = :queued OR #status = :running OR attribute_not_exists(#status)';
    expressionAttributeValues[':queued'] = 'queued';
    expressionAttributeValues[':running'] = 'running';
  }

  // For completed/failed transitions, require status = running
  if (TERMINAL_STATES.includes(newStatus)) {
    conditionExpression = '#status = :running OR #status = :new_status OR attribute_not_exists(#status)';
    expressionAttributeValues[':running'] = 'running';
  }

  await docClient.send(new UpdateCommand({
    TableName: JOBS_TABLE_NAME,
    Key: { job_id: jobId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: conditionExpression,
  }));

  // TODO: Log decision events (job_started, job_completed, job_failed) - Story 3.1
}
