"""
Decision Event Schema (Python)
Story 3.1: Decision Event Capture

Pydantic models for decision event validation.
Base model + event-specific detail schemas.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator, ConfigDict

# Imports (Lambda layer provides these)
from decision_events.event_types import EventType
from decision_events.actor import Actor


class DecisionEventBase(BaseModel):
    """
    Base decision event model with required fields.
    All decision events must include these fields.
    """
    model_config = ConfigDict(extra='forbid')  # Reject unknown fields
    
    # Core identifiers
    event_id: str = Field(..., description="SHA-256 hash of event (idempotency key)")
    event_type: str = Field(..., description="Event type (strict enum)")
    job_id: str = Field(..., description="Job identifier (UUID)")
    
    # Sequence and ordering
    seq: int = Field(..., description="Sequence number (first-class attribute)")
    seq_padded: Optional[str] = Field(None, description="Zero-padded seq (e.g., '0000000123')")
    timestamp: str = Field(..., description="ISO datetime (for display)")
    
    # Actor and context
    actor: str = Field(..., description="Actor (strict enum: manager, worker, sub_worker, evaluator, system)")
    execution_id: Optional[str] = Field(None, description="Step Functions execution ID")
    state_name: Optional[str] = Field(None, description="Step Functions state name")
    iteration: Optional[int] = Field(None, ge=0, le=4, description="Iteration number (0-4)")
    sub_worker_instance_id: Optional[str] = Field(None, description="Sub-worker instance ID")
    
    # Summary fields (always required)
    summary: str = Field(..., max_length=500, description="Human-readable summary (max 500 chars)")
    rationale_summary: Optional[str] = Field(None, max_length=200, description="Why this action was taken (max 200 chars)")
    inputs_summary: Optional[str] = Field(None, max_length=200, description="Summary of inputs (max 200 chars)")
    outputs_summary: Optional[str] = Field(None, max_length=200, description="Summary of outputs (max 200 chars)")
    evidence_pointers: List[str] = Field(default_factory=list, max_length=10, description="Evidence pointers (max 10)")
    
    # Details (full or truncated)
    details: Dict[str, Any] = Field(..., description="Full event details or truncated summary")
    details_hash: str = Field(..., description="SHA-256 hash of details (canonical JSON)")
    details_truncated: bool = Field(..., description="Whether details were truncated")
    s3_details_ref: Optional[str] = Field(None, description="S3 key if details truncated")
    
    # Metadata
    created_at: str = Field(..., description="ISO datetime when event was written")
    
    @field_validator('event_type')
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        """Validate event_type is a valid enum value"""
        if not EventType.is_valid(v):
            raise ValueError(f"Invalid event_type: {v}. Must be one of: {EventType.values()}")
        return v
    
    @field_validator('actor')
    @classmethod
    def validate_actor(cls, v: str) -> str:
        """Validate actor is a valid enum value"""
        if not Actor.is_valid(v):
            raise ValueError(f"Invalid actor: {v}. Must be one of: {Actor.values()}")
        return v
    
    @field_validator('evidence_pointers')
    @classmethod
    def validate_evidence_pointers(cls, v: List[str]) -> List[str]:
        """Validate evidence pointer format"""
        import re
        pattern = r'^[a-z_]+:[A-Za-z0-9._#-]+$'
        for pointer in v:
            if not re.match(pattern, pointer):
                raise ValueError(f"Invalid evidence pointer format: {pointer}. Must match: {pattern}")
        return v


# Event-specific detail schemas (pragmatic approach - implement 3-4 most important in Sprint 2)

class ToolCalledDetails(BaseModel):
    """Details schema for tool_called events"""
    tool_name: str = Field(..., description="Tool name (e.g., 'web_search', 'dynamodb_lookup')")
    tool_invocation_id: str = Field(..., description="Unique invocation ID (for stable_action_id)")
    parameters: Dict[str, Any] = Field(..., description="Tool parameters")
    results_summary: str = Field(..., description="Deterministic results summary (see Story 3.3)")
    reasoning: Optional[str] = Field(None, description="Why this tool was called")
    tokens_used: Optional[int] = Field(None, ge=0, description="Tokens used")
    time_ms: Optional[int] = Field(None, ge=0, description="Execution time in milliseconds")


class ArtifactCreatedDetails(BaseModel):
    """Details schema for artifact_created events"""
    artifact_id: str = Field(..., description="Artifact ID (for stable_action_id)")
    artifact_type: str = Field(..., description="Artifact type (e.g., 'style_profile', 'evidence_bundle')")
    artifact_version: str = Field(..., description="Artifact version (e.g., 'v0001')")
    quality_signals: Dict[str, Any] = Field(default_factory=dict, description="Quality signals")
    task_id: str = Field(..., description="Task ID")


class EvaluatorAssessedDetails(BaseModel):
    """Details schema for evaluator_assessed events"""
    evaluator_request_id: str = Field(..., description="Evaluator request ID (for stable_action_id)")
    top_3: List[str] = Field(..., min_length=1, max_length=3, description="Top 3 conference predictions")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Confidence score")
    reasons: Optional[List[str]] = Field(None, description="Reasons for predictions")


class SubWorkerSpawnedDetails(BaseModel):
    """Details schema for sub_worker_spawned events"""
    sub_worker_type: str = Field(..., description="Sub-worker type")
    reasoning: Optional[str] = Field(None, description="Why this sub-worker was spawned")
    inputs_provided: Dict[str, Any] = Field(default_factory=dict, description="Inputs provided to sub-worker")


# Union type for event details (for type checking)
EventDetails = ToolCalledDetails | ArtifactCreatedDetails | EvaluatorAssessedDetails | SubWorkerSpawnedDetails | Dict[str, Any]


def validate_event_details(event_type: str, details: Dict[str, Any]) -> None:
    """
    Validate event-specific details schema.
    
    Args:
        event_type: Event type (must be normalized)
        details: Event details dict
        
    Raises:
        ValueError: If details don't match expected schema
    """
    if event_type == EventType.TOOL_CALLED.value:
        ToolCalledDetails(**details)
    elif event_type == EventType.ARTIFACT_CREATED.value:
        ArtifactCreatedDetails(**details)
    elif event_type == EventType.EVALUATOR_ASSESSED.value:
        EvaluatorAssessedDetails(**details)
    elif event_type == EventType.SUB_WORKER_SPAWNED.value:
        SubWorkerSpawnedDetails(**details)
    # Other event types: no strict schema validation yet (expand later)
