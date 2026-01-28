/**
 * Admin Handlers
 * Story 6.5: Job Lifecycle & Metadata Table
 * 
 * Endpoints:
 * - GET /api/v1/admin/jobs/failed - List failed jobs
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';

/**
 * Verify admin authentication (placeholder - implement with API key or IAM role)
 */
function verifyAdminAuth(event: APIGatewayProxyEvent): boolean {
  // Admin authentication via API key header
  // ADMIN_API_KEY must be set in Lambda environment variables
  const apiKey = event.headers['x-admin-api-key'];
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    // Fail closed: reject if ADMIN_API_KEY is not configured
    console.error('ADMIN_API_KEY environment variable not set - rejecting request');
    return false;
  }

  return apiKey === expectedKey;
}

/**
 * GET /api/v1/admin/jobs/failed?days={N} - List failed jobs
 * AC: 33
 */
export async function listFailedJobsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Verify admin authentication
    if (!verifyAdminAuth(event)) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Parse days parameter (default 7, max 30)
    const daysParam = event.queryStringParameters?.days;
    const days = Math.min(
      Math.max(parseInt(daysParam || '7', 10), 1),
      30
    );

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    // Bounded scan: Scan jobs table with filter status = failed AND created_at >= cutoff
    // Note: If admin scan becomes common, add GSI on status + created_at for efficient queries
    const result = await docClient.send(new ScanCommand({
      TableName: JOBS_TABLE_NAME,
      FilterExpression: '#status = :status AND created_at >= :cutoff',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':cutoff': cutoffTimestamp,
      },
      Limit: 100, // Pagination: limit 100 jobs per request
    }));

    // Format response
    const failedJobs = (result.Items || []).map((item: any) => ({
      job_id: item.job_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      completed_at: item.completed_at,
      error: item.error,
      failure_reason: item.failure_reason,
      step_functions_execution_arn: item.step_functions_execution_arn,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobs: failedJobs,
        count: failedJobs.length,
        days,
        cutoff_date: cutoffTimestamp,
        // TODO: Add pagination token if result is truncated
      }),
    };
  } catch (error) {
    console.error('Error listing failed jobs:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
