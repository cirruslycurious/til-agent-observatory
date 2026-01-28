/**
 * S3 Uploader Library (TypeScript)
 * Story 6.3: S3 Storage for Large Artifacts
 *
 * Mirror of Python s3_uploader.py - keep in sync via tests.
 * Handles compression, hashing, error handling, and atomic operations.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Configuration
const S3_BUCKET_NAME = process.env.ARTIFACTS_BUCKET_NAME || 'your-artifacts-bucket';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';

// Size thresholds
const ARTIFACT_SIZE_THRESHOLD = 350 * 1024; // 350KB (DynamoDB limit is 400KB)
const TOOL_RESULTS_SIZE_THRESHOLD = 50 * 1024; // 50KB for tool results
const COMPRESSION_THRESHOLD = 10 * 1024; // 10KB (compress if >10KB)

// Initialize S3 client
const s3Client = new S3Client({ region: S3_REGION });

export class S3UploadError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'S3UploadError';
  }
}

export class S3DownloadError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'S3DownloadError';
  }
}

export class HashMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HashMismatchError';
  }
}

export interface ArtifactData {
  [key: string]: any;
}

export interface S3UploadResult {
  s3_key: string;
  payload_sha256: string; // Raw hash (before compression)
  payload_size_bytes: number;
  compressed: boolean;
  payload_sha256_stored?: string; // Stored hash (after compression, optional)
}

export interface ToolResultsUploadResult {
  s3_key: string;
  tool_results_hash: string;
  tool_results_size_bytes: number;
}

/**
 * Serialize data to canonical JSON bytes (UTF-8, stable key order, no whitespace).
 *
 * This ensures deterministic hashing across Python and TypeScript implementations.
 */
function canonicalJsonSerialize(data: ArtifactData): Buffer {
  // Sort keys recursively for deterministic output
  const sorted = sortKeysRecursive(data);
  const jsonString = JSON.stringify(sorted);
  return Buffer.from(jsonString, 'utf-8');
}

/**
 * Recursively sort object keys for deterministic JSON serialization.
 */
function sortKeysRecursive(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sortKeysRecursive(item));
  }
  
  const sorted: any = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortKeysRecursive(obj[key]);
  }
  return sorted;
}

/**
 * Compute SHA-256 hash of data.
 */
function computeSha256Hash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Uploads artifact to S3 if size >=350KB.
 *
 * @param jobId - Job identifier (UUID)
 * @param taskId - Task identifier (e.g., "cfp_extract")
 * @param artifactVersion - Artifact version (e.g., "v0001")
 * @param artifactData - Full artifact data (object)
 * @param compress - Whether to compress with gzip (default: true)
 * @param writerRequestId - Request ID for tracking (optional, for orphan cleanup)
 * @returns Upload result with s3_key, sha256_hash, size_bytes, compressed (if uploaded), or null if size <350KB
 * @throws S3UploadError if S3 upload fails (atomic operation, do NOT write to DynamoDB)
 */
export async function uploadArtifactToS3(
  jobId: string,
  taskId: string,
  artifactVersion: string,
  artifactData: ArtifactData,
  compress: boolean = true,
  writerRequestId?: string
): Promise<S3UploadResult | null> {
  // Serialize to canonical JSON to compute size
  const jsonBytes = canonicalJsonSerialize(artifactData);
  const sizeBytes = jsonBytes.length;

  // If size <350KB, return null (store in DynamoDB only)
  if (sizeBytes < ARTIFACT_SIZE_THRESHOLD) {
    return null;
  }

  // Compute SHA-256 hash of raw JSON bytes (before compression)
  const payloadSha256Raw = computeSha256Hash(jsonBytes);

  // Prepare S3 key
  // Format: s3://scratch-artifacts-{environment}/{job_id}/{task_id}/{artifact_version}/full_artifact.json
  const s3Key = `${jobId}/${taskId}/${artifactVersion}/full_artifact.json`;

  // Compress if requested and size >10KB
  let compressed = false;
  let payloadSha256Stored: string | undefined;
  let body: Buffer = jsonBytes;
  let contentEncoding: string | undefined;

  if (compress && sizeBytes > COMPRESSION_THRESHOLD) {
    // Compress with gzip
    body = await gzipAsync(jsonBytes);
    compressed = true;
    contentEncoding = 'gzip';
    // Compute hash of compressed bytes (optional, for debuggability)
    payloadSha256Stored = computeSha256Hash(body);
  }

  // Prepare S3 object metadata and tags
  const artifactId = artifactData.meta?.artifact_id || `${jobId}#${taskId}#${artifactVersion}`;
  const createdAt = new Date().toISOString();

  // S3 object tags (for orphan cleanup)
  const tags: Record<string, string> = {
    job_id: jobId,
    artifact_id: artifactId,
    created_at: createdAt,
  };
  if (writerRequestId) {
    tags.writer_request_id = writerRequestId;
  }

  // Convert tags to S3 TagSet format (URL-encoded)
  const tagString = Object.entries(tags)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  try {
    // Upload to S3
    const putObjectParams: any = {
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: body,
      ContentType: 'application/json',
      Tagging: tagString,
      Metadata: {
        job_id: jobId,
        artifact_id: artifactId,
        created_at: createdAt,
      },
    };

    if (contentEncoding) {
      putObjectParams.ContentEncoding = contentEncoding;
    }

    if (writerRequestId) {
      putObjectParams.Metadata.writer_request_id = writerRequestId;
    }

    await s3Client.send(new PutObjectCommand(putObjectParams));

    // Verify upload succeeded (head object)
    await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: s3Key }));

    // Return upload result
    const result: S3UploadResult = {
      s3_key: s3Key,
      payload_sha256: payloadSha256Raw, // Raw hash (before compression)
      payload_size_bytes: sizeBytes,
      compressed,
    };

    if (payloadSha256Stored) {
      result.payload_sha256_stored = payloadSha256Stored; // Stored hash (after compression, optional)
    }

    return result;
  } catch (error: any) {
    const errorCode = error.Code || error.name || 'Unknown';
    const errorMessage = error.message || String(error);
    throw new S3UploadError(
      `S3 upload failed for ${s3Key}: ${errorCode} - ${errorMessage}`,
      error
    );
  }
}

/**
 * Uploads tool results to S3 if size >50KB.
 *
 * @param jobId - Job identifier (UUID)
 * @param taskId - Task identifier (e.g., "cfp_extract")
 * @param artifactVersion - Artifact version (e.g., "v0001")
 * @param toolResults - Full tool results data (object)
 * @param toolName - Tool name (e.g., "web_search")
 * @param toolCallId - Tool call ID (deterministic ID, used in S3 key for uniqueness)
 * @param writerRequestId - Request ID for tracking (optional, for orphan cleanup)
 * @returns Upload result with s3_key, sha256_hash, size_bytes (if uploaded), or null if size <=50KB
 * @throws S3UploadError if S3 upload fails (atomic operation, do NOT update DynamoDB)
 */
export async function uploadToolResultsToS3(
  jobId: string,
  taskId: string,
  artifactVersion: string,
  toolResults: ArtifactData,
  toolName: string,
  toolCallId: string,
  writerRequestId?: string
): Promise<ToolResultsUploadResult | null> {
  // Serialize to canonical JSON to compute size
  const jsonBytes = canonicalJsonSerialize(toolResults);
  const sizeBytes = jsonBytes.length;

  // If size <=50KB, return null (store in DynamoDB only, results_inline field)
  if (sizeBytes <= TOOL_RESULTS_SIZE_THRESHOLD) {
    return null;
  }

  // Compute SHA-256 hash of raw JSON bytes (before compression)
  const toolResultsHash = computeSha256Hash(jsonBytes);

  // Prepare S3 key (includes tool_call_id for uniqueness)
  // Format: s3://scratch-artifacts-{environment}/{job_id}/{task_id}/{artifact_version}/tool_results/{tool_call_id}.json
  const s3Key = `${jobId}/${taskId}/${artifactVersion}/tool_results/${toolCallId}.json`;

  // Compress if size >10KB
  let body: Buffer = jsonBytes;
  let contentEncoding: string | undefined;

  if (sizeBytes > COMPRESSION_THRESHOLD) {
    // Compress with gzip
    body = await gzipAsync(jsonBytes);
    contentEncoding = 'gzip';
  }

  // Prepare S3 object metadata and tags
  const createdAt = new Date().toISOString();

  // S3 object tags (for orphan cleanup)
  const tags: Record<string, string> = {
    job_id: jobId,
    tool_call_id: toolCallId,
    created_at: createdAt,
  };
  if (writerRequestId) {
    tags.writer_request_id = writerRequestId;
  }

  // Convert tags to S3 TagSet format (URL-encoded)
  const tagString = Object.entries(tags)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  try {
    // Upload to S3
    const putObjectParams: any = {
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: body,
      ContentType: 'application/json',
      Tagging: tagString,
      Metadata: {
        job_id: jobId,
        tool_call_id: toolCallId,
        created_at: createdAt,
      },
    };

    if (contentEncoding) {
      putObjectParams.ContentEncoding = contentEncoding;
    }

    if (writerRequestId) {
      putObjectParams.Metadata.writer_request_id = writerRequestId;
    }

    await s3Client.send(new PutObjectCommand(putObjectParams));

    // Verify upload succeeded (head object)
    await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: s3Key }));

    // Return upload result
    return {
      s3_key: s3Key,
      tool_results_hash: toolResultsHash,
      tool_results_size_bytes: sizeBytes,
    };
  } catch (error: any) {
    const errorCode = error.Code || error.name || 'Unknown';
    const errorMessage = error.message || String(error);
    throw new S3UploadError(
      `S3 upload failed for ${s3Key}: ${errorCode} - ${errorMessage}`,
      error
    );
  }
}

/**
 * Downloads artifact from S3 and verifies hash.
 *
 * @param s3Key - S3 object key
 * @param expectedHash - Expected SHA-256 hash (optional, for verification - raw hash before compression)
 * @returns Artifact data (decompressed if needed)
 * @throws S3DownloadError if download fails (404, 503, etc.)
 * @throws HashMismatchError if hash verification fails
 */
export async function downloadArtifactFromS3(
  s3Key: string,
  expectedHash?: string
): Promise<ArtifactData> {
  try {
    // Download object from S3
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: s3Key })
    );

    if (!response.Body) {
      throw new S3DownloadError(`S3 object body is empty: ${s3Key}`);
    }

    // Read body
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    let body = Buffer.concat(chunks);

    // Check Content-Encoding
    const contentEncoding = response.ContentEncoding;

    // Decompress if gzip
    if (contentEncoding === 'gzip') {
      body = await gunzipAsync(body);
    }

    // Parse JSON
    const artifactData = JSON.parse(body.toString('utf-8'));

    // Verify hash if expectedHash provided
    if (expectedHash) {
      // Hash raw JSON bytes (before compression) using canonical serialization
      const rawJsonBytes = canonicalJsonSerialize(artifactData);
      const computedHash = computeSha256Hash(rawJsonBytes);

      if (computedHash !== expectedHash) {
        throw new HashMismatchError(
          `Hash mismatch for ${s3Key}: expected ${expectedHash}, got ${computedHash}`
        );
      }
    }

    return artifactData;
  } catch (error: any) {
    if (error instanceof HashMismatchError) {
      throw error;
    }

    const errorCode = error.Code || error.name || 'Unknown';
    const errorMessage = error.message || String(error);

    if (errorCode === 'NoSuchKey' || errorCode === 'NotFound' || errorCode === '404') {
      throw new S3DownloadError(`S3 object not found: ${s3Key}`);
    } else {
      throw new S3DownloadError(
        `S3 download failed for ${s3Key}: ${errorCode} - ${errorMessage}`,
        error
      );
    }
  }
}
