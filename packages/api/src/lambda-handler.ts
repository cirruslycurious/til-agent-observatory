/**
 * Lambda Handler Entry Point
 * Routes API Gateway events to appropriate handlers
 * Sprint 7: Added /result and /feedback endpoints
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createJobHandler, getJobStatusHandler, listJobsHandler } from './handlers/jobs';
import { getSystemStatusHandler } from './handlers/system';
import { getArtifactHandler, getFullArtifactHandler, listArtifactsHandler, getDependencyGraphHandler, getBudgetHandler } from './handlers/artifacts';
import { getEventsHandler } from './handlers/events';
import { getToolsHandler, getToolSequencesHandler, getToolEffectivenessHandler } from './handlers/tools';
import {
  getDashboardOverviewHandler,
  getDashboardAgenticHandler,
  getDashboardVendorsHandler,
  getDashboardToolsHandler,
  getDashboardEvaluatorHandler,
  getDashboardSystemHandler,
} from './handlers/dashboard';
// NOTE: Dashboard V2 handlers moved to separate Lambda (dashboard-v2-handler.ts)
// to avoid Lambda policy size limits (20 KB AWS limit)
// Sprint 7: Result and feedback endpoints
import { getJobResultHandler } from './handlers/result';
import { submitFeedbackHandler } from './handlers/feedback';
import { getIterationsHandler } from './handlers/iterations';

// CORS headers for all responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Add CORS headers to a response
function withCors(response: APIGatewayProxyResult): APIGatewayProxyResult {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...CORS_HEADERS,
    },
  };
}

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const { httpMethod, resource, path, pathParameters, queryStringParameters } = event;

  // Route based on path
  const pathParts = path.split('/').filter(Boolean);

  try {
    // System endpoints
    if (path === '/api/v1/system/status' && httpMethod === 'GET') {
      return withCors(await getSystemStatusHandler(event));
    }

    // Jobs endpoints
    if (path === '/api/v1/jobs' && httpMethod === 'GET') {
      return withCors(await listJobsHandler(event));
    }
    if (path === '/api/v1/jobs' && httpMethod === 'POST') {
      return withCors(await createJobHandler(event));
    }

    if (path.match(/^\/api\/v1\/jobs\/[^/]+\/status$/) && httpMethod === 'GET') {
      return withCors(await getJobStatusHandler(event));
    }

    // Sprint 7: Result endpoint
    if (path.match(/^\/api\/v1\/jobs\/[^/]+\/result$/) && httpMethod === 'GET') {
      return withCors(await getJobResultHandler(event));
    }

    // Sprint 7: Feedback endpoint
    if (path.match(/^\/api\/v1\/jobs\/[^/]+\/feedback$/) && httpMethod === 'POST') {
      return withCors(await submitFeedbackHandler(event));
    }

    // Dashboard endpoints: /api/v1/dashboard/*
    if (path === '/api/v1/dashboard/overview' && httpMethod === 'GET') {
      return withCors(await getDashboardOverviewHandler(event));
    }
    if (path === '/api/v1/dashboard/agentic' && httpMethod === 'GET') {
      return withCors(await getDashboardAgenticHandler(event));
    }
    if (path === '/api/v1/dashboard/vendors' && httpMethod === 'GET') {
      return withCors(await getDashboardVendorsHandler(event));
    }
    if (path === '/api/v1/dashboard/tools' && httpMethod === 'GET') {
      return withCors(await getDashboardToolsHandler(event));
    }
    if (path === '/api/v1/dashboard/evaluator' && httpMethod === 'GET') {
      return withCors(await getDashboardEvaluatorHandler(event));
    }
    if (path === '/api/v1/dashboard/system' && httpMethod === 'GET') {
      return withCors(await getDashboardSystemHandler(event));
    }

    // NOTE: Dashboard V2 endpoints (/api/v1/dashboard/v2/*) are handled by
    // a separate Lambda (til-dashboard-v2-handler) to avoid policy size limits.
    // See: packages/api/src/dashboard-v2-handler.ts

    // Workflow endpoints
    const workflowMatch = path.match(/^\/api\/v1\/workflow\/([^/]+)\/(.+)$/);
    if (workflowMatch) {
      const jobId = workflowMatch[1];
      const subPath = workflowMatch[2];
      
      // Populate pathParameters so handlers can access job_id
      event.pathParameters = { ...event.pathParameters, job_id: jobId };

      // Budget
      if (subPath === 'budget' && httpMethod === 'GET') {
        return withCors(await getBudgetHandler(event));
      }

      // Events
      if (subPath === 'events' && httpMethod === 'GET') {
        return withCors(await getEventsHandler(event));
      }

      // Iterations (title/abstract history)
      if (subPath === 'iterations' && httpMethod === 'GET') {
        return withCors(await getIterationsHandler(event));
      }

      // Tools
      if (subPath === 'tools' && httpMethod === 'GET') {
        return withCors(await getToolsHandler(event));
      }

      if (subPath === 'tools/sequences' && httpMethod === 'GET') {
        return withCors(await getToolSequencesHandler(event));
      }

      if (subPath === 'tools/effectiveness' && httpMethod === 'GET') {
        return withCors(await getToolEffectivenessHandler(event));
      }

      // Artifacts
      if (subPath === 'artifacts' && httpMethod === 'GET') {
        return withCors(await listArtifactsHandler(event));
      }

      if (subPath === 'artifacts/dependencies' && httpMethod === 'GET') {
        return withCors(await getDependencyGraphHandler(event));
      }

      const artifactMatch = subPath.match(/^artifacts\/(.+)$/);
      if (artifactMatch && httpMethod === 'GET') {
        const taskId = artifactMatch[1];
        // Check if version is in query params
        if (queryStringParameters?.version) {
          return withCors(await getFullArtifactHandler(event));
        } else {
          return withCors(await getArtifactHandler(event));
        }
      }
    }

    // 404 - Route not found
    return withCors({
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    });
  } catch (error: any) {
    console.error('Lambda handler error:', error);
    return withCors({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  }
}
