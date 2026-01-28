/**
 * Artifact Handlers
 * Story 6.1: DynamoDB Scratch Artifacts Storage
 * Story 3.2: Artifact Traceability
 * 
 * Endpoints:
 * - GET /api/v1/workflow/{job_id}/artifacts/{artifact_id}?token={job_read_token}[&full=true]
 * - GET /api/v1/workflow/{job_id}/artifacts?token={job_read_token}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyJobTokenHash } from '../../../shared/auth/token-verifier';
import { getArtifact, listArtifactsForJob } from '../../../shared/artifact-reader/artifact_reader';
import { downloadArtifactFromS3, S3DownloadError, HashMismatchError } from '../../../shared/s3-utils/s3_uploader';
import { buildDependencyGraph } from '../../../shared/artifact-reader/dependency_graph';
import { getJobBudget } from '../../../shared/budget-service/budget_client';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const ARTIFACTS_TABLE_NAME = process.env.ARTIFACTS_TABLE_NAME || 'til-artifacts';
const S3_BUCKET_NAME = process.env.ARTIFACTS_BUCKET_NAME || 'your-artifacts-bucket';

// Max payload size for default response (1-2MB)
const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024; // 2MB

// Large payload threshold for presigned URLs (5-10MB)
const LARGE_PAYLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB

// Presigned URL expiry (1 hour)
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

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

  // GetItem to retrieve job
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
  if (!verifyJobTokenHash(token, job.job_read_token_hash)) {
    return { valid: false, statusCode: 403 };
  }

  return { valid: true, job };
}

/**
 * Parse artifact_id to extract task_id and artifact_version
 * Format: {job_id}#{task_id}#{artifact_version}
 */
function parseArtifactId(artifactId: string, jobId: string): { taskId: string; artifactVersion: string } | null {
  // Remove job_id prefix
  const prefix = `${jobId}#`;
  if (!artifactId.startsWith(prefix)) {
    return null;
  }

  const suffix = artifactId.substring(prefix.length);
  const parts = suffix.split('#');
  
  if (parts.length !== 2) {
    return null;
  }

  return {
    taskId: parts[0],
    artifactVersion: parts[1],
  };
}

/**
 * Estimate artifact size in bytes
 */
function estimateArtifactSize(artifact: any): number {
  return JSON.stringify(artifact).length;
}

/**
 * Truncate artifact data field if needed
 */
function truncateArtifactData(artifact: any, maxSize: number): { artifact: any; truncated: boolean } {
  const currentSize = estimateArtifactSize(artifact);
  
  if (currentSize <= maxSize) {
    return { artifact, truncated: false };
  }

  // Truncate data field
  const truncated = { ...artifact };
  if (truncated.data && typeof truncated.data === 'object') {
    // Keep structure but reduce size
    truncated.data = {
      ...truncated.data,
      _truncated: true,
      _original_size: currentSize,
    };
  }

  return { artifact: truncated, truncated: true };
}

/**
 * GET /api/v1/workflow/{job_id}/artifacts/{artifact_id}?token={job_read_token}[&full=true]
 * AC: 25-28, Story 3.2 AC: 8-12
 */
export async function getArtifactHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.job_id;
    const artifactId = event.pathParameters?.artifact_id;
    const token = event.queryStringParameters?.token;
    const full = event.queryStringParameters?.full === 'true';

    if (!jobId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'job_id is required' }),
      };
    }

    if (!artifactId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'artifact_id is required' }),
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

    // Parse artifact_id to extract task_id and artifact_version
    const parsed = parseArtifactId(artifactId, jobId);
    if (!parsed) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid artifact_id format' }),
      };
    }

    // Get artifact
    const artifact = await getArtifact(jobId, parsed.taskId, parsed.artifactVersion);

    if (!artifact) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Artifact not found' }),
      };
    }

    // Calculate payload size
    const payloadSize = estimateArtifactSize(artifact);

    // Handle size limits
    let responseArtifact = artifact;
    let dataTruncated = false;

    if (!full) {
      // Default: Max 1-2MB payload
      const { artifact: truncated, truncated: isTruncated } = truncateArtifactData(artifact, MAX_PAYLOAD_SIZE);
      responseArtifact = truncated;
      dataTruncated = isTruncated;
    }
    // If full=true: Return full artifact with no size limit (fetch from S3 if overflowed)

    // Always include payload_size_bytes for UI awareness
    const response = {
      ...responseArtifact,
      payload_size_bytes: payloadSize,
      data_truncated: dataTruncated,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };

  } catch (error: any) {
    console.error('Error in getArtifactHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/workflow/{job_id}/artifacts/{artifact_id}/full?token={job_read_token}[&redirect=1]
 * Story 6.3: S3 Storage for Large Artifacts
 * AC: 25-26, 34
 * 
 * Retrieves full artifact from S3 if overflowed, with presigned URL support for large payloads.
 */
export async function getFullArtifactHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const jobId = event.pathParameters?.job_id;
    const artifactId = event.pathParameters?.artifact_id;
    const token = event.queryStringParameters?.token;
    const redirect = event.queryStringParameters?.redirect === '1';

    if (!jobId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'job_id is required' }),
      };
    }

    if (!artifactId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'artifact_id is required' }),
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

    // Parse artifact_id to extract task_id and artifact_version
    const parsed = parseArtifactId(artifactId, jobId);
    if (!parsed) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid artifact_id format' }),
      };
    }

    // Validate task_id format (prevents path traversal)
    if (!/^[a-z0-9_]{1,64}$/.test(parsed.taskId)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid task_id format' }),
      };
    }

    // Validate artifact_version format (must match artifact writer format)
    if (!/^v\d{4}$/.test(parsed.artifactVersion)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid artifact_version format' }),
      };
    }

    // Get artifact from DynamoDB (to get s3_payload_ref and payload_size_bytes)
    const artifact = await getArtifact(jobId, parsed.taskId, parsed.artifactVersion);

    if (!artifact) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Artifact not found' }),
      };
    }

    const s3PayloadRef = artifact.overflow?.s3_payload_ref;
    const payloadSizeBytes = artifact.overflow?.payload_size_bytes || estimateArtifactSize(artifact);

    // Guardrail for large payloads: If payload_size_bytes > 5-10MB, return presigned URL
    if (payloadSizeBytes > LARGE_PAYLOAD_THRESHOLD) {
      if (s3PayloadRef) {
        // Generate presigned URL
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3PayloadRef,
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });

        // If redirect=1, return 302 redirect
        if (redirect) {
          return {
            statusCode: 302,
            headers: {
              'Location': presignedUrl,
            },
            body: '',
          };
        }

        // Otherwise, return JSON with presigned URL
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            presigned_url: presignedUrl,
            expires_in: PRESIGNED_URL_EXPIRY,
            payload_size_bytes: payloadSizeBytes,
            message: 'Artifact exceeds size limit. Use presigned URL to download.',
          }),
        };
      } else {
        // Artifact not in S3 but exceeds size limit (shouldn't happen, but handle gracefully)
        return {
          statusCode: 413,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Payload too large',
            payload_size_bytes: payloadSizeBytes,
            max_size: LARGE_PAYLOAD_THRESHOLD,
            message: 'Artifact exceeds size limit. Use presigned URL endpoint.',
          }),
        };
      }
    }

    // If s3_payload_ref exists and payload_size_bytes <= 5-10MB: Download from S3, verify hash, return full artifact
    if (s3PayloadRef) {
      try {
        const expectedHash = artifact.overflow?.payload_sha256;
        const fullArtifact = await downloadArtifactFromS3(s3PayloadRef, expectedHash);

        // Merge S3 data back into artifact
        artifact.data = fullArtifact.data;

        return {
          statusCode: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Encoding': artifact.overflow?.compressed ? 'gzip' : undefined,
          },
          body: JSON.stringify(artifact),
        };
      } catch (error: any) {
        if (error instanceof HashMismatchError) {
          console.error(`Hash mismatch for artifact ${artifactId}:`, error);
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Hash verification failed' }),
          };
        } else if (error instanceof S3DownloadError) {
          console.error(`S3 download failed for artifact ${artifactId}:`, error);
          return {
            statusCode: 503,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'S3 download failed', details: error.message }),
          };
        } else {
          throw error;
        }
      }
    }

    // If s3_payload_ref missing: Return artifact from DynamoDB data field
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artifact),
    };

  } catch (error: any) {
    console.error('Error in getFullArtifactHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/workflow/{job_id}/artifacts?token={job_read_token}
 * AC: 25, Story 3.2 AC: 13-15
 */
export async function listArtifactsHandler(
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

    // List artifacts (metadata only, not full payloads)
    const artifacts = await listArtifactsForJob(jobId, false);

    // Handle pagination if needed (limit 50 artifacts per request)
    const limit = 50;
    const paginatedArtifacts = artifacts.slice(0, limit);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifacts: paginatedArtifacts,
        total: artifacts.length,
        returned: paginatedArtifacts.length,
        has_more: artifacts.length > limit,
      }),
    };

  } catch (error: any) {
    console.error('Error in listArtifactsHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/workflow/{job_id}/artifacts/dependencies?token={job_read_token}
 * Story 3.2: Artifact Traceability
 * 
 * Returns dependency graph for all artifacts in a job.
 */
export async function getDependencyGraphHandler(
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

    // Build dependency graph
    const graph = await buildDependencyGraph(jobId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph),
    };

  } catch (error: any) {
    console.error('Error in getDependencyGraphHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/workflow/{job_id}/budget?token={job_read_token}
 * Story 4.1: Per-Job Budget Tracking
 * 
 * Returns current budget state for a job.
 */
export async function getBudgetHandler(
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

    // Get budget state
    const budget = await getJobBudget(jobId);

    if (!budget) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Budget not found for this job' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget),
    };

  } catch (error: any) {
    console.error('Error in getBudgetHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
