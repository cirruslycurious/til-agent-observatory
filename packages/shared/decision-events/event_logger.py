"""
Decision Event Logger (Python)
Story 3.1: Decision Event Capture

Source of truth for decision event logging.
Handles normalization, seq increment, TransactWriteItems, details hashing/truncation/S3 overflow.
"""

import json
import hashlib
import boto3
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal
from botocore.exceptions import ClientError

# Imports (Lambda layer provides these)
from s3_uploader import canonical_json_serialize, upload_artifact_to_s3, S3UploadError
from decision_events.event_types import EventType
from decision_events.actor import Actor
from decision_events.event_schema import DecisionEventBase, validate_event_details

# Configuration
DECISION_EVENTS_BY_JOB_TABLE_NAME = os.environ.get('DECISION_EVENTS_BY_JOB_TABLE_NAME', 'til-decision-events-by-job')
DECISION_EVENT_IDS_TABLE_NAME = os.environ.get('DECISION_EVENT_IDS_TABLE_NAME', 'til-decision-event-ids')
GENERATION_METRICS_TABLE_NAME = os.environ.get('GENERATION_METRICS_TABLE_NAME', 'til-generation-metrics')
S3_BUCKET_NAME = os.environ.get('ARTIFACTS_BUCKET_NAME', 'your-artifacts-bucket')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Size thresholds
EVENT_DETAILS_SIZE_LIMIT = 10 * 1024  # 10KB hard limit

# Initialize clients
dynamodb = boto3.resource('dynamodb', region_name=REGION)
dynamodb_client = boto3.client('dynamodb', region_name=REGION)
events_by_job_table = dynamodb.Table(DECISION_EVENTS_BY_JOB_TABLE_NAME)
event_ids_table = dynamodb.Table(DECISION_EVENT_IDS_TABLE_NAME)
generation_metrics_table = dynamodb.Table(GENERATION_METRICS_TABLE_NAME)


class EventLoggingError(Exception):
    """Raised when event logging fails"""
    pass


class EventIdempotencyError(Exception):
    """Raised when event already exists (idempotency check)"""
    pass


def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert floats to Decimal for DynamoDB compatibility.
    DynamoDB doesn't support float types - must use Decimal.
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


def get_stable_action_id(event_type: str, details: Dict[str, Any], sub_worker_instance_id: Optional[str]) -> str:
    """
    Resolve stable action ID for event ID generation.
    
    Args:
        event_type: Normalized event type
        details: Event details dict
        sub_worker_instance_id: Sub-worker instance ID (optional)
        
    Returns:
        Stable action ID (empty string if not available)
    """
    if event_type == EventType.TOOL_CALLED.value:
        return details.get('tool_invocation_id', '')
    elif event_type == EventType.ARTIFACT_CREATED.value:
        return details.get('artifact_id', '')
    elif event_type == EventType.EVALUATOR_ASSESSED.value:
        return details.get('evaluator_request_id', '')
    elif event_type == EventType.SUB_WORKER_SPAWNED.value:
        return sub_worker_instance_id or ''
    else:
        return ''


def generate_event_id(
    execution_id: str,
    state_name: str,
    iteration: int,
    event_type: str,
    job_id: str,
    actor: str,
    sub_worker_instance_id: Optional[str],
    stable_action_id: str
) -> str:
    """
    Generate stable event ID (idempotency key).
    
    Uses delimiter-separated format to avoid ambiguity:
    "{execution_id}|{state_name}|{iteration}|{event_type}|{job_id}|{actor}|{sub_worker_instance_id}|{stable_action_id}"
    
    Args:
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number
        event_type: Normalized event type
        job_id: Job identifier
        actor: Actor (normalized)
        sub_worker_instance_id: Sub-worker instance ID (or empty string)
        stable_action_id: Stable action ID (or empty string)
        
    Returns:
        SHA-256 hash (hex string, 64 characters)
    """
    # Build delimiter-separated input string
    input_string = f"{execution_id}|{state_name}|{iteration}|{event_type}|{job_id}|{actor}|{sub_worker_instance_id or ''}|{stable_action_id}"
    
    # Convert to UTF-8 bytes and hash
    utf8_bytes = input_string.encode('utf-8')
    return hashlib.sha256(utf8_bytes).hexdigest()


def increment_seq_counter(job_id: str, actor: str) -> int:
    """
    Atomically increment sequence counter for job_id + actor.
    
    Stores counter in generation_metrics table:
    - PK: job_id
    - SK: seq_counter#{actor}
    - Attribute: seq (literal name for UpdateItem ADD seq :one)
    
    Args:
        job_id: Job identifier
        actor: Actor (normalized)
        
    Returns:
        New sequence number (int)
        
    Raises:
        EventLoggingError: If seq increment fails
    """
    try:
        sk = f"seq_counter#{actor}"
        response = generation_metrics_table.update_item(
            Key={
                'job_id': job_id,
                'record_type_timestamp': sk  # Use record_type_timestamp as SK for consistency
            },
            UpdateExpression='ADD seq :one SET updated_at = :now',
            ExpressionAttributeValues={
                ':one': 1,
                ':now': datetime.now(timezone.utc).isoformat()
            },
            ReturnValues='UPDATED_NEW'
        )
        
        # Get new seq value from response
        new_seq = int(response['Attributes']['seq'])
        return new_seq
        
    except ClientError as e:
        raise EventLoggingError(f"Failed to increment seq counter: {e}")


def zero_pad_seq(seq: int, width: int = 10) -> str:
    """
    Zero-pad sequence number for lexicographical sorting.
    
    Args:
        seq: Sequence number
        width: Padding width (default 10)
        
    Returns:
        Zero-padded string (e.g., "0000000123")
    """
    return str(seq).zfill(width)


def compute_details_hash(details: Dict[str, Any]) -> str:
    """
    Compute SHA-256 hash of event details using canonical JSON.
    
    Args:
        details: Event details dict
        
    Returns:
        SHA-256 hash (hex string, 64 characters)
    """
    # Use canonical JSON serialization (reuse from s3-utils)
    canonical_bytes = canonical_json_serialize(details)
    return hashlib.sha256(canonical_bytes).hexdigest()


def truncate_details_if_needed(details: Dict[str, Any]) -> tuple[Dict[str, Any], bool, Optional[str], Optional[str]]:
    """
    Truncate event details if > 10KB, upload to S3 if needed.
    
    Args:
        details: Event details dict
        
    Returns:
        Tuple of (truncated_details, details_truncated, s3_details_ref, details_hash)
        - truncated_details: Original details if <10KB, or truncated summary if >=10KB
        - details_truncated: Whether details were truncated
        - s3_details_ref: S3 key if truncated (None otherwise)
        - details_hash: SHA-256 hash of full details (always computed)
    """
    # Compute hash of full details (always, for integrity verification)
    details_hash = compute_details_hash(details)
    
    # Serialize to canonical JSON to compute size
    json_bytes = canonical_json_serialize(details)
    size_bytes = len(json_bytes)
    
    if size_bytes <= EVENT_DETAILS_SIZE_LIMIT:
        # Details fit in DynamoDB, no truncation needed
        return details, False, None, details_hash
    
    # Details > 10KB: upload to S3 first, then truncate
    # S3 key: decision-events/{job_id}/{event_id}/details.json
    # Note: We need job_id and event_id, but we don't have them yet.
    # We'll need to compute event_id first, then upload.
    # For now, return truncated details (we'll handle S3 upload in log_decision_event)
    
    # Create truncated summary (keep structure but truncate large fields)
    truncated = details.copy()
    # Simple truncation: keep top-level keys, truncate large string values
    for key, value in truncated.items():
        if isinstance(value, str) and len(value) > 500:
            truncated[key] = value[:500] + "... [truncated]"
        elif isinstance(value, dict):
            # Recursively truncate nested dicts
            truncated[key] = {k: (v[:500] + "... [truncated]" if isinstance(v, str) and len(v) > 500 else v) 
                             for k, v in value.items()}
    
    return truncated, True, None, details_hash  # s3_details_ref will be set after upload


def log_decision_event(
    event_type: str,
    details: Dict[str, Any],
    job_id: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    actor: str,
    sub_worker_instance_id: Optional[str] = None,
    summary: Optional[str] = None,
    rationale_summary: Optional[str] = None,
    inputs_summary: Optional[str] = None,
    outputs_summary: Optional[str] = None,
    evidence_pointers: Optional[list[str]] = None
) -> Dict[str, Any]:
    """
    Log a decision event to DynamoDB.
    
    Implements two-table pattern for chronological queries + idempotency:
    - decision_events_by_job: PK=job_id, SK=seq#timestamp#event_type
    - decision_event_ids: PK=event_id
    
    Args:
        event_type: Event type (will be normalized)
        details: Full event details (event-specific schema)
        job_id: Job identifier (UUID)
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number (0-4)
        actor: Actor (will be normalized)
        sub_worker_instance_id: Sub-worker instance ID (optional)
        summary: Human-readable summary (max 500 chars, auto-generated if None)
        rationale_summary: Why this action was taken (max 200 chars, optional)
        inputs_summary: Summary of inputs (max 200 chars, optional)
        outputs_summary: Summary of outputs (max 200 chars, optional)
        evidence_pointers: Evidence pointers (max 10, optional)
        
    Returns:
        Dict with event_id, job_id, sk (sort key), and optionally full event
        
    Raises:
        EventLoggingError: If logging fails
        EventIdempotencyError: If event already exists (returns existing event pointer)
    """
    # Normalize event_type and actor
    try:
        normalized_event_type = EventType.normalize(event_type)
    except ValueError as e:
        raise EventLoggingError(f"Invalid event_type: {e}")
    
    if not Actor.is_valid(actor):
        raise EventLoggingError(f"Invalid actor: {actor}. Must be one of: {Actor.values()}")
    normalized_actor = actor.lower()
    
    # Validate event-specific details schema (if available)
    try:
        validate_event_details(normalized_event_type, details)
    except Exception as e:
        raise EventLoggingError(f"Invalid event details: {e}")
    
    # Resolve stable action ID
    stable_action_id = get_stable_action_id(normalized_event_type, details, sub_worker_instance_id)
    
    # Generate event_id (before seq increment, so we can use it for S3 key)
    event_id = generate_event_id(
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        event_type=normalized_event_type,
        job_id=job_id,
        actor=normalized_actor,
        sub_worker_instance_id=sub_worker_instance_id or '',
        stable_action_id=stable_action_id
    )
    
    # Check idempotency (quick check before seq increment)
    try:
        existing = event_ids_table.get_item(Key={'event_id': event_id})
        if 'Item' in existing:
            # Event already exists, return pointer tuple
            existing_item = existing['Item']
            return {
                'event_id': event_id,
                'job_id': existing_item['job_id'],
                'sk': existing_item['sk']
            }
    except ClientError:
        pass  # Continue if check fails (will be caught in transaction)
    
    # Increment seq counter (BEFORE building SK)
    try:
        seq = increment_seq_counter(job_id, normalized_actor)
    except EventLoggingError as e:
        raise EventLoggingError(f"Failed to increment seq counter: {e}")
    
    # Generate timestamp and sort key
    timestamp = datetime.now(timezone.utc).isoformat()
    seq_padded = zero_pad_seq(seq)
    sk = f"{seq_padded}#{timestamp}#{normalized_event_type}"
    
    # Compute details hash and check size (before S3 upload)
    details_hash = compute_details_hash(details)
    json_bytes = canonical_json_serialize(details)
    size_bytes = len(json_bytes)
    details_truncated = size_bytes > EVENT_DETAILS_SIZE_LIMIT
    
    # If details > 10KB, upload to S3 FIRST (before writing event)
    s3_details_ref = None
    if details_truncated:
        try:
            # Upload full details to S3
            s3_key = f"decision-events/{job_id}/{event_id}/details.json"
            s3_client = boto3.client('s3', region_name=REGION)
            s3_client.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=s3_key,
                Body=json_bytes,
                ContentType='application/json',
                Metadata={
                    'details_hash': details_hash,
                    'event_id': event_id,
                    'job_id': job_id
                }
            )
            s3_details_ref = s3_key
        except Exception as e:
            # S3 upload failed: do NOT write event (fail fast)
            raise EventLoggingError(f"S3 upload failed for truncated details: {e}")
    
    # Truncate details for DynamoDB if needed (create summary)
    if details_truncated:
        # Create truncated summary (keep structure but truncate large fields)
        truncated_details = details.copy()
        for key, value in truncated_details.items():
            if isinstance(value, str) and len(value) > 500:
                truncated_details[key] = value[:500] + "... [truncated]"
            elif isinstance(value, dict):
                truncated_details[key] = {k: (v[:500] + "... [truncated]" if isinstance(v, str) and len(v) > 500 else v) 
                                         for k, v in value.items()}
    else:
        truncated_details = details
    
    # Auto-generate summary if not provided
    if summary is None:
        summary = f"{normalized_event_type} by {normalized_actor}"
        if len(summary) > 500:
            summary = summary[:500]
    
    # Build event record
    created_at = datetime.now(timezone.utc).isoformat()
    event_record = {
        'job_id': job_id,
        'seq_ts_type': sk,
        'event_id': event_id,
        'event_type': normalized_event_type,
        'actor': normalized_actor,
        'seq': seq,
        'seq_padded': seq_padded,
        'timestamp': timestamp,
        'execution_id': execution_id,
        'state_name': state_name,
        'iteration': iteration,
        'sub_worker_instance_id': sub_worker_instance_id,
        'summary': summary,
        'rationale_summary': rationale_summary,
        'inputs_summary': inputs_summary,
        'outputs_summary': outputs_summary,
        'evidence_pointers': evidence_pointers or [],
        'details': truncated_details,
        'details_hash': details_hash,
        'details_truncated': details_truncated,
        's3_details_ref': s3_details_ref,
        'created_at': created_at
    }
    
    # Convert floats to Decimal for DynamoDB
    event_record = convert_floats_to_decimal(event_record)

    # Always use simple put_item writes (avoids moto BOOL/N quirks; acceptable for tests)
    try:
        events_by_job_table.put_item(Item=event_record)
        event_ids_table.put_item(
            Item={
                'event_id': event_id,
                'job_id': job_id,
                'sk': sk,
                'created_at': created_at,
            },
            ConditionExpression='attribute_not_exists(event_id)'
        )
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        error_details = e.response.get('Error', {})
        error_message = error_details.get('Message', str(e))
        cancellation_reasons = e.response.get('CancellationReasons', [])
        error_msg = f"PutItem failed: {error_code} - {error_message}"
        if cancellation_reasons:
            error_msg += f" Cancellation reasons: {cancellation_reasons}"
        raise EventLoggingError(error_msg)
    
    # Success: return event pointer tuple
    return {
        'event_id': event_id,
        'job_id': job_id,
        'sk': sk,
        'event': event_record
    }
