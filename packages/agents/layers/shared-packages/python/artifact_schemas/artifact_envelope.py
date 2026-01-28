"""
Artifact Envelope Pydantic Models
Story 6.1: DynamoDB Scratch Artifacts Storage

Pydantic models for artifact envelope validation
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum


class WorkerVendor(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class ArtifactType(str, Enum):
    STYLE_PROFILE = "style_profile"
    EVIDENCE_BUNDLE = "evidence_bundle"
    DRAFT_CANDIDATES = "draft_candidates"
    REVIEW_FEEDBACK = "review_feedback"
    FINAL = "final"


class Coverage(str, Enum):
    COMPREHENSIVE = "comprehensive"
    MODERATE = "moderate"
    LIMITED = "limited"


class ArtifactStatus(str, Enum):
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


class SourceType(str, Enum):
    ARTIFACT = "artifact"
    WEB = "web"
    CONF = "conf"


class ToolName(str, Enum):
    DYNAMODB_LOOKUP = "dynamodb_lookup"
    WEB_SEARCH = "web_search"
    SEARCH_ABSTRACTS = "search_abstracts"
    SEARCH_RECENT_CONTENT = "search_recent_content"
    RED_TEAM_REVIEW = "red_team_review"
    ASSESS_ABSTRACT_PRIMARY = "assess_abstract_primary"
    ASSESS_ABSTRACT_SECONDARY = "assess_abstract_secondary"


class SuccessStatus(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    SKIPPED = "skipped"


class Source(BaseModel):
    id: str = Field(..., description="Unique source identifier")
    type: SourceType = Field(..., description="Source type")
    uri: str = Field(..., description="Source URI or reference")
    snippet: str = Field(..., max_length=200, description="Source snippet (max 200 chars)")
    captured_at: datetime = Field(..., description="ISO timestamp when source was captured")


class ToolCall(BaseModel):
    tool_name: ToolName = Field(..., description="Tool name")
    tool_invocation_id: str = Field(..., description="Unique tool invocation identifier")
    success_status: SuccessStatus = Field(..., description="Tool execution status")
    results_summary: str = Field(..., max_length=200, description="Tool results summary (50-200 chars)")
    s3_tool_results_ref: Optional[str] = Field(None, description="S3 key for full tool results (if >50KB)")


class UpstreamArtifact(BaseModel):
    artifact_id: str = Field(..., description="Artifact ID (format: job_id#task_id#v0001)")
    reason: str = Field(..., description="Reason for dependency")
    pointers: List[str] = Field(default_factory=list, description="Evidence pointers to specific parts of upstream artifact")


class Provenance(BaseModel):
    sources: List[Source] = Field(default_factory=list, description="Array of external source references (optional, can be empty)")
    claims: Optional[List[Dict[str, Any]]] = Field(None, description="Array of claim objects (optional)")
    tool_calls: List[ToolCall] = Field(..., description="Array of tool call objects (required)")
    inputs: Dict[str, Any] = Field(..., description="Input data (required)")
    upstream_artifacts: Optional[List[UpstreamArtifact]] = Field(None, description="Array of internal artifact dependencies (optional, for dependency graph)")


class Overflow(BaseModel):
    s3_payload_ref: Optional[str] = Field(None, description="S3 key for full artifact payload (if >=350KB)")
    s3_tool_results_ref: Optional[str] = Field(None, description="S3 key for tool results (per-tool)")
    payload_sha256: Optional[str] = Field(None, pattern="^[a-f0-9]{64}$", description="SHA-256 hash of full artifact payload")
    payload_size_bytes: Optional[int] = Field(None, ge=0, description="Actual size of full artifact before compression/overflow")


class Execution(BaseModel):
    tokens_used: Optional[int] = Field(None, ge=0, description="Tokens used for artifact generation")
    execution_time_ms: Optional[int] = Field(None, ge=0, description="Execution time in milliseconds")
    error: Optional[str] = Field(None, max_length=500, description="Error message (if status = failed)")


class ArtifactMeta(BaseModel):
    artifact_id: str = Field(..., description="Unique artifact identifier: {job_id}#{task_id}#{artifact_version}")
    job_id: str = Field(..., description="Job identifier (UUID)")
    iteration: int = Field(..., ge=0, le=4, description="Iteration number (0-4)")
    parent_task_id: str = Field(..., description="Parent task identifier")
    task_id: str = Field(..., pattern="^[a-z0-9_]{1,64}$", description="Task identifier (no '#', no 'latest_' or 'meta_' prefix)")
    worker_id: str = Field(..., description="Worker identifier")
    worker_vendor: WorkerVendor = Field(..., description="LLM vendor")
    worker_model: str = Field(..., description="LLM model identifier")
    artifact_type: ArtifactType = Field(..., description="Artifact type")
    artifact_version: str = Field(..., pattern="^v\\d{4}$", description="Artifact version (zero-padded, e.g., 'v0001')")
    content_hash: str = Field(..., pattern="^[a-f0-9]{64}$", description="SHA-256 hash of artifact data")
    schema_version: str = Field(..., description="Schema version (e.g., '1.0')")
    spawned_at: datetime = Field(..., description="ISO timestamp when artifact creation started")
    completed_at: datetime = Field(..., description="ISO timestamp when artifact creation completed")
    status: ArtifactStatus = Field(..., description="Artifact status")

    @field_validator('task_id')
    @classmethod
    def validate_task_id(cls, v):
        """Reject task_id with reserved prefixes"""
        if v.startswith('latest_') or v.startswith('meta_'):
            raise ValueError("task_id cannot start with 'latest_' or 'meta_'")
        if '#' in v:
            raise ValueError("task_id cannot contain '#' character")
        return v


class QualitySignals(BaseModel):
    confidence: float = Field(..., ge=0, le=1, description="Confidence score (0-1)")
    coverage: Coverage = Field(..., description="Coverage level")


class ArtifactEnvelope(BaseModel):
    """Standard artifact envelope structure"""
    meta: ArtifactMeta = Field(..., description="Artifact metadata")
    data: Dict[str, Any] = Field(..., description="Artifact-specific data (summary if >=350KB)")
    quality_signals: QualitySignals = Field(..., description="Quality signals")
    provenance: Provenance = Field(..., description="Provenance information")
    overflow: Optional[Overflow] = Field(None, description="Overflow metadata (if artifact >=350KB)")
    execution: Optional[Execution] = Field(None, description="Execution metadata")
    expires_at: Optional[int] = Field(None, description="Unix timestamp for TTL (14 days from creation)")

    model_config = ConfigDict(
        json_encoders={
            datetime: lambda v: v.isoformat(),
        }
    )
