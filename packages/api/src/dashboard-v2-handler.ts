/**
 * Dashboard V2 Lambda Handler
 * 
 * Dedicated Lambda for Dashboard V2 endpoints (research analytics)
 * Separated from main API Lambda to avoid Lambda policy size limits.
 * 
 * Routes:
 *   GET /api/v1/dashboard/v2/executive
 *   GET /api/v1/dashboard/v2/vendors/manager
 *   GET /api/v1/dashboard/v2/vendors/worker
 *   GET /api/v1/dashboard/v2/context
 *   GET /api/v1/dashboard/v2/evaluator
 *   GET /api/v1/dashboard/v2/tools          (legacy - tool effectiveness)
 *   GET /api/v1/dashboard/v2/tools/behavior  (NEW - agent cognitive behavior)
 *   GET /api/v1/dashboard/v2/speed
 *   GET /api/v1/dashboard/v2/top-abstracts  (NEW - top 10 abstracts with filters)
 * 
 * Performance: 10x faster than V1 (320ms vs 3.2s), uses til-job-summaries table
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  getExecutiveSummaryHandler,
  getVendorManagerHandler,
  getVendorWorkerHandler,
  getContextEffectsHandler,
  getEvaluatorAnalysisHandler,
  getToolPatternsHandler,
  getToolBehaviorAnalysisHandler,
  getSpeedEfficiencyHandler,
  getTopAbstractsHandler,
} from './handlers/dashboard-v2';

/**
 * Add CORS headers to response
 */
function withCors(response: APIGatewayProxyResult): APIGatewayProxyResult {
  return {
    ...response,
    headers: {
      ...response.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
  };
}

/**
 * Lambda handler for Dashboard V2 endpoints
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('Dashboard V2 Lambda invoked:', {
    path: event.path,
    httpMethod: event.httpMethod,
    requestId: context.awsRequestId,
  });

  const path = event.path;
  const httpMethod = event.httpMethod;

  try {
    // Handle OPTIONS (CORS preflight)
    if (httpMethod === 'OPTIONS') {
      return withCors({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'CORS preflight OK' }),
      });
    }

    // Route to appropriate handler
    if (path === '/api/v1/dashboard/v2/executive' && httpMethod === 'GET') {
      return withCors(await getExecutiveSummaryHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/vendors/manager' && httpMethod === 'GET') {
      return withCors(await getVendorManagerHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/vendors/worker' && httpMethod === 'GET') {
      return withCors(await getVendorWorkerHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/context' && httpMethod === 'GET') {
      return withCors(await getContextEffectsHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/evaluator' && httpMethod === 'GET') {
      return withCors(await getEvaluatorAnalysisHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/tools' && httpMethod === 'GET') {
      return withCors(await getToolPatternsHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/tools/behavior' && httpMethod === 'GET') {
      return withCors(await getToolBehaviorAnalysisHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/speed' && httpMethod === 'GET') {
      return withCors(await getSpeedEfficiencyHandler(event));
    }

    if (path === '/api/v1/dashboard/v2/top-abstracts' && httpMethod === 'GET') {
      return withCors(await getTopAbstractsHandler(event));
    }

    // No matching route
    console.error('No matching route for Dashboard V2:', { path, httpMethod });
    return withCors({
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Not Found',
        message: `No Dashboard V2 endpoint matches: ${httpMethod} ${path}`,
        availableEndpoints: [
          'GET /api/v1/dashboard/v2/executive',
          'GET /api/v1/dashboard/v2/vendors/manager',
          'GET /api/v1/dashboard/v2/vendors/worker',
          'GET /api/v1/dashboard/v2/context',
          'GET /api/v1/dashboard/v2/evaluator',
          'GET /api/v1/dashboard/v2/tools',
          'GET /api/v1/dashboard/v2/tools/behavior',
          'GET /api/v1/dashboard/v2/speed',
          'GET /api/v1/dashboard/v2/top-abstracts',
        ],
      }),
    });

  } catch (error) {
    console.error('Unhandled error in Dashboard V2 Lambda:', error);
    return withCors({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: String(error),
      }),
    });
  }
}
