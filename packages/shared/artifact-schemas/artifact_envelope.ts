/**
 * Artifact Envelope TypeScript Types
 * Story 6.1: DynamoDB Scratch Artifacts Storage
 * 
 * TypeScript types for artifact envelope validation
 * Mirror of Python Pydantic models - keep in sync via tests
 */

export type WorkerVendor = 'openai' | 'anthropic';
export type ArtifactType = 'style_profile' | 'evidence_bundle' | 'draft_candidates' | 'review_feedback' | 'final';
export type Coverage = 'comprehensive' | 'moderate' | 'limited';
export type ArtifactStatus = 'completed' | 'failed' | 'timeout';
export type SourceType = 'artifact' | 'web' | 'conf';
export type ToolName = 'dynamodb_lookup' | 'web_search';
export type SuccessStatus = 'success' | 'failure' | 'skipped';

export interface Source {
  id: string;
  type: SourceType;
  uri: string;
  snippet: string; // max 200 chars
  captured_at: string; // ISO timestamp
}

export interface ToolCall {
  tool_name: ToolName;
  tool_invocation_id: string;
  success_status: SuccessStatus;
  results_summary: string; // 50-200 chars
  s3_tool_results_ref?: string; // S3 key for full tool results (if >50KB)
}

export interface Provenance {
  sources: Source[]; // required, non-empty
  claims?: Array<Record<string, any>>; // optional
  tool_calls: ToolCall[]; // required
  inputs: Record<string, any>; // required
}

export interface Overflow {
  s3_payload_ref?: string; // S3 key for full artifact payload (if >=350KB)
  s3_tool_results_ref?: string; // S3 key for tool results (per-tool)
  payload_sha256?: string; // SHA-256 hash (64 hex chars)
  payload_size_bytes?: number; // Actual size before compression/overflow
}

export interface Execution {
  tokens_used?: number;
  execution_time_ms?: number;
  error?: string; // max 500 chars
}

export interface ArtifactMeta {
  artifact_id: string; // Format: {job_id}#{task_id}#{artifact_version}
  job_id: string; // UUID
  iteration: number; // 0-4
  parent_task_id: string;
  task_id: string; // Pattern: ^[a-z0-9_]{1,64}$ (no '#', no 'latest_' or 'meta_' prefix)
  worker_id: string;
  worker_vendor: WorkerVendor;
  worker_model: string;
  artifact_type: ArtifactType;
  artifact_version: string; // Pattern: ^v\d{4}$ (e.g., 'v0001')
  content_hash: string; // SHA-256 hash (64 hex chars)
  schema_version: string; // e.g., '1.0'
  spawned_at: string; // ISO timestamp
  completed_at: string; // ISO timestamp
  status: ArtifactStatus;
}

export interface ArtifactEnvelope {
  meta: ArtifactMeta;
  data: Record<string, any>; // Artifact-specific data (summary if >=350KB)
  quality_signals: {
    confidence: number; // 0-1
    coverage: Coverage;
  };
  provenance: Provenance;
  overflow?: Overflow;
  execution?: Execution;
  expires_at?: number; // Unix timestamp for TTL (14 days from creation)
}
