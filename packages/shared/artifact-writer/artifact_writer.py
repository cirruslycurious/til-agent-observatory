"""
Artifact Writer Library (Python)
Story 6.1: DynamoDB Scratch Artifacts Storage

Source of truth for artifact writing logic.
Handles idempotency, size management, and S3 overflow.
"""

import json
import hashlib
import boto3
import os
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from botocore.exceptions import ClientError

# Import Pydantic models for validation (Lambda layer provides these as top-level modules)
try:
    # Lambda layer structure: /opt/python/{module_name}
    from artifact_schemas.artifact_envelope import ArtifactEnvelope, ArtifactMeta
    from s3_utils.s3_uploader import upload_artifact_to_s3, S3UploadError
    from schema_validator.schema_validator import validate_artifact, ArtifactValidationError as SchemaArtifactValidationError, LATEST_SCHEMA_VERSION_BY_TYPE
except ImportError:
    # Fallback for local development (sys.path manipulation)
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent / 'artifact-schemas'))
    from artifact_envelope import ArtifactEnvelope, ArtifactMeta
    sys.path.append(str(Path(__file__).parent.parent / 's3-utils'))
    from s3_uploader import upload_artifact_to_s3, S3UploadError
    sys.path.append(str(Path(__file__).parent.parent / 'schema-validator'))
    from schema_validator import validate_artifact, ArtifactValidationError as SchemaArtifactValidationError, LATEST_SCHEMA_VERSION_BY_TYPE

# Configuration
ARTIFACTS_TABLE_NAME = os.environ.get('ARTIFACTS_TABLE_NAME', 'til-artifacts')
S3_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Size thresholds
DYNAMODB_SIZE_LIMIT = 350 * 1024  # 350KB (below 400KB DynamoDB limit)
DYNAMODB_SUMMARY_LIMIT = 10 * 1024  # 10KB summary in DynamoDB
TOOL_RESULTS_OVERFLOW_LIMIT = 50 * 1024  # 50KB for tool results

# Initialize clients
# Use boto3.resource with type conversion for DynamoDB (handles float -> Decimal automatically)
dynamodb = boto3.resource('dynamodb', region_name=S3_REGION)
table = dynamodb.Table(ARTIFACTS_TABLE_NAME)


# Use schema validator's ArtifactValidationError (Story 6.4)
# This provides more detailed error information (artifact_type, schema_version, errors list)
# For backward compatibility, we import it and use it directly
ArtifactValidationError = SchemaArtifactValidationError


class SchemaVersionMismatchError(Exception):
    """Raised when existing artifact has different schema_version"""
    pass


def compute_content_hash(artifact_data: Dict[str, Any]) -> str:
    """
    Compute SHA-256 hash of artifact data (deterministic, excludes timestamps).
    
    Args:
        artifact_data: Artifact data dict (excludes meta.timestamps for deterministic hashing)
        
    Returns:
        SHA-256 hash (hex string, 64 chars)
    """
    # Create a copy without timestamps for deterministic hashing
    data_for_hash = {
        'data': artifact_data.get('data', {}),
        'quality_signals': artifact_data.get('quality_signals', {}),
        'provenance': artifact_data.get('provenance', {}),
        'execution': artifact_data.get('execution', {}),
    }
    
    # Canonical JSON serialization (stable key order, no whitespace)
    canonical_json = json.dumps(data_for_hash, sort_keys=True, separators=(',', ':'))
    
    return hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()


def estimate_artifact_size(artifact_data: Dict[str, Any]) -> int:
    """
    Estimate artifact size in bytes (JSON serialized).
    
    Args:
        artifact_data: Artifact data dict
        
    Returns:
        Estimated size in bytes
    """
    return len(json.dumps(artifact_data, separators=(',', ':')).encode('utf-8'))


def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert floats to Decimal for DynamoDB compatibility.
    DynamoDB doesn't support float types - must use Decimal.
    """
    from decimal import Decimal
    
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


def generate_summary(artifact_data: Dict[str, Any], max_size: int = DYNAMODB_SUMMARY_LIMIT) -> Dict[str, Any]:
    """
    Generate summary of artifact data (max 10KB).
    
    Args:
        artifact_data: Full artifact data
        max_size: Maximum summary size in bytes
        
    Returns:
        Summary dict
    """
    # Simple summary: keep structure but truncate large fields
    summary = {
        'type': artifact_data.get('type', 'unknown'),
        'summary': str(artifact_data)[:max_size - 100],  # Rough truncation
    }
    return summary


# Removed upload_to_s3 function - now using s3_uploader.upload_artifact_to_s3 (Story 6.3)


def write_artifact(
    artifact_data: Dict[str, Any],
    job_id: str,
    task_id: str,
    artifact_version: Optional[str] = None,
    return_existing_on_conflict: bool = True
) -> Dict[str, Any]:
    """
    Write artifact to DynamoDB with idempotency and size management.
    
    Args:
        artifact_data: Full artifact envelope (meta, data, quality_signals, provenance, overflow, execution)
        job_id: Job identifier (UUID)
        task_id: Task identifier (e.g., "cfp_extract")
        artifact_version: Artifact version (optional, defaults to auto-increment: "v0001", "v0002", etc.)
        return_existing_on_conflict: If True, return existing artifact on conflict (default: True)
        
    Returns:
        dict with artifact_id, artifact_version, and write_status
        
    Raises:
        ArtifactValidationError: If validation fails (does NOT write)
        SchemaVersionMismatchError: If existing artifact has different schema_version
    """
    # Set default schema_version if not present (from LATEST_SCHEMA_VERSION_BY_TYPE)
    meta = artifact_data.get('meta', {})
    artifact_type = meta.get('artifact_type')
    if artifact_type and not meta.get('schema_version'):
        # Set to latest schema version for this artifact type
        latest_version = LATEST_SCHEMA_VERSION_BY_TYPE.get(artifact_type)
        if latest_version:
            meta['schema_version'] = latest_version
            artifact_data['meta'] = meta
    
    # Enforce task_id namespace rules
    if task_id.startswith('latest_') or task_id.startswith('meta_'):
        raise ValueError(f"task_id cannot start with 'latest_' or 'meta_'")
    if '#' in task_id:
        raise ValueError("task_id cannot contain '#' character")
    
    # Compute content hash FIRST (needed for validation)
    content_hash = compute_content_hash(artifact_data)
    
    # Determine artifact_version (auto-increment if not provided)
    if artifact_version is None:
        artifact_version = "v0001"
    
    # Generate artifact_id
    artifact_id = f"{job_id}#{task_id}#{artifact_version}"
    
    # Update artifact_data with computed values BEFORE validation
    artifact_data['meta']['artifact_id'] = artifact_id
    artifact_data['meta']['job_id'] = job_id
    artifact_data['meta']['task_id'] = task_id
    artifact_data['meta']['artifact_version'] = artifact_version
    artifact_data['meta']['content_hash'] = content_hash
    
    # Validate artifact against schema (Story 6.4) - BEFORE DynamoDB write (validation gate)
    try:
        validate_artifact(artifact_data)
    except SchemaArtifactValidationError as e:
        # Re-raise as ArtifactValidationError (same class, but explicit)
        raise ArtifactValidationError(
            artifact_type=e.artifact_type,
            schema_version=e.schema_version,
            errors=e.errors
        )
    
    # Also validate with Pydantic for structure (complementary to JSON Schema)
    try:
        envelope = ArtifactEnvelope(**artifact_data)
    except Exception as e:
        raise ArtifactValidationError(
            artifact_type=artifact_type or 'unknown',
            schema_version=meta.get('schema_version', 'unknown'),
            errors=[f"Pydantic validation failed: {str(e)}"]
        )
    
    # Estimate artifact size
    artifact_size = estimate_artifact_size(artifact_data)
    
    # Set expires_at (14 days from now)
    expires_at = int((datetime.now(timezone.utc) + timedelta(days=14)).timestamp())
    artifact_data['expires_at'] = expires_at
    
    # Store original data for S3 upload if needed
    original_data = artifact_data.get('data', {}).copy() if isinstance(artifact_data.get('data'), dict) else artifact_data.get('data')
    
    # Handle size management
    if artifact_size >= DYNAMODB_SIZE_LIMIT:
        # Generate summary for DynamoDB (before S3 upload to preserve original)
        summary_data = generate_summary(original_data, DYNAMODB_SUMMARY_LIMIT)
        
        # Calculate SHA-256 hash of full artifact (before modifying data)
        full_artifact_for_hash = artifact_data.copy()
        full_artifact_json = json.dumps(full_artifact_for_hash, separators=(',', ':'))
        payload_sha256 = hashlib.sha256(full_artifact_json.encode('utf-8')).hexdigest()
        
        # Update artifact_data with summary (will upload full to S3 in write loop)
        artifact_data['data'] = summary_data
        artifact_data['overflow'] = {
            'payload_sha256': payload_sha256,
            'payload_size_bytes': artifact_size,
        }
    
    # Try write with idempotency
    max_versions = 100  # Safety limit
    version_num = int(artifact_version[1:]) if artifact_version.startswith('v') else 1
    
    for attempt in range(max_versions):
        current_version = f"v{version_num:04d}"  # Zero-padded to 4 digits
        artifact_sk = f"{task_id}#{current_version}"
        
        # Update artifact_data with current version
        artifact_data['meta']['artifact_version'] = current_version
        artifact_data['meta']['artifact_id'] = f"{job_id}#{task_id}#{current_version}"
        
        # If overflowed, upload to S3 with current version (Story 6.3)
        if artifact_size >= DYNAMODB_SIZE_LIMIT:
            # Create full artifact copy for S3 (with original data)
            full_artifact_for_s3 = artifact_data.copy()
            full_artifact_for_s3['data'] = original_data  # Restore original data for S3
            
            try:
                # Upload to S3 using new uploader (handles compression, hashing, metadata)
                s3_result = upload_artifact_to_s3(
                    job_id=job_id,
                    task_id=task_id,
                    artifact_version=current_version,
                    artifact_data=full_artifact_for_s3,
                    compress=True,  # Compress by default
                )
                
                if s3_result:
                    # Set overflow fields from S3 upload result
                    artifact_data['overflow'] = {
                        's3_payload_ref': s3_result['s3_key'],
                        'payload_sha256': s3_result['payload_sha256'],  # Raw hash (before compression)
                        'payload_size_bytes': s3_result['payload_size_bytes'],
                        'compressed': s3_result['compressed'],
                    }
                    
                    # Optional: Store compressed hash for debuggability
                    if 'payload_sha256_stored' in s3_result:
                        artifact_data['overflow']['payload_sha256_stored'] = s3_result['payload_sha256_stored']
                else:
                    # Should not happen (size >=350KB should trigger upload)
                    raise ValueError(f"Artifact size {artifact_size} >= {DYNAMODB_SIZE_LIMIT} but S3 upload returned None")
                    
            except S3UploadError as e:
                # Atomic operation: If S3 upload fails, do NOT write to DynamoDB
                raise ArtifactValidationError(f"S3 upload failed: {str(e)}") from e
        
        try:
            # PutItem with ConditionExpression: attribute_not_exists(#sk)
            # Convert floats to Decimal for DynamoDB compatibility (moto requires this)
            import copy
            item_data = copy.deepcopy(artifact_data)
            item_data = convert_floats_to_decimal(item_data)
            
            table.put_item(
                Item={
                    'job_id': job_id,
                    'artifact_sk': artifact_sk,
                    **item_data,
                },
                ConditionExpression='attribute_not_exists(#sk)',
                ExpressionAttributeNames={'#sk': 'artifact_sk'},
            )
            
            # Write succeeded
            return {
                'artifact_id': artifact_data['meta']['artifact_id'],
                'artifact_version': current_version,
                'write_status': 'created',
                's3_overflow': artifact_size >= DYNAMODB_SIZE_LIMIT,
            }
            
        except ClientError as e:
            if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
                raise
            
            # Item exists - check if we should return existing or increment version
            if not return_existing_on_conflict:
                raise ValueError(f"Artifact already exists: {artifact_sk}")
            
            # GetItem to retrieve existing artifact
            response = table.get_item(
                Key={
                    'job_id': job_id,
                    'artifact_sk': artifact_sk,
                }
            )
            
            if 'Item' not in response:
                # Race condition - item was deleted, retry
                continue
            
            existing_artifact = response['Item']
            
            # Check schema_version match
            existing_schema_version = existing_artifact.get('meta', {}).get('schema_version')
            new_schema_version = artifact_data['meta'].get('schema_version')
            if existing_schema_version != new_schema_version:
                raise SchemaVersionMismatchError(
                    f"Schema version mismatch: existing={existing_schema_version}, new={new_schema_version}"
                )
            
            # Compare content hashes
            existing_content_hash = existing_artifact.get('meta', {}).get('content_hash')
            if existing_content_hash == content_hash:
                # Same content - return existing artifact (idempotent read, no-op)
                # TODO: Log duplicate_write_attempt decision event (Story 3.1)
                return {
                    'artifact_id': existing_artifact['meta']['artifact_id'],
                    'artifact_version': current_version,
                    'write_status': 'existing',
                }
            
            # Different content - increment version and retry
            version_num += 1
            continue
    
    raise ValueError(f"Failed to write artifact after {max_versions} attempts")


def get_artifact(job_id: str, task_id: str, artifact_version: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Retrieve artifact from DynamoDB (and S3 if overflowed).
    
    Args:
        job_id: Job identifier
        task_id: Task identifier
        artifact_version: Artifact version (optional, defaults to latest)
        
    Returns:
        Full artifact (with S3 data merged if needed) or None if not found
    """
    if artifact_version:
        # GetItem by job_id + task_id#artifact_version
        artifact_sk = f"{task_id}#{artifact_version}"
        response = table.get_item(
            Key={
                'job_id': job_id,
                'artifact_sk': artifact_sk,
            }
        )
        
        if 'Item' not in response:
            return None
        
        artifact = response['Item']
    else:
        # Get latest version: Query by job_id, filter by task_id prefix, sort descending, limit 1
        response = table.query(
            KeyConditionExpression='job_id = :job_id',
            FilterExpression='begins_with(artifact_sk, :task_prefix)',
            ExpressionAttributeValues={
                ':job_id': job_id,
                ':task_prefix': f"{task_id}#",
            },
            ScanIndexForward=False,  # Descending order
            Limit=1,
        )
        
        if not response.get('Items'):
            return None
        
        artifact = response['Items'][0]
    
    # If overflowed, fetch full artifact from S3
    if artifact.get('overflow', {}).get('s3_payload_ref'):
        s3_key = artifact['overflow']['s3_payload_ref']
        s3_response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        full_artifact = json.loads(s3_response['Body'].read().decode('utf-8'))
        
        # Merge S3 data back into artifact
        artifact['data'] = full_artifact['data']
    
    return artifact


def list_artifacts_for_job(job_id: str) -> list[Dict[str, Any]]:
    """
    List all artifacts for a job.
    
    Args:
        job_id: Job identifier
        
    Returns:
        List of artifacts (metadata only, not full payloads)
    """
    response = table.query(
        KeyConditionExpression='job_id = :job_id',
        ExpressionAttributeValues={
            ':job_id': job_id,
        },
    )
    
    artifacts = []
    for item in response.get('Items', []):
        # Return metadata only (exclude full data payloads)
        artifact_metadata = {
            'artifact_id': item.get('meta', {}).get('artifact_id'),
            'task_id': item.get('meta', {}).get('task_id'),
            'artifact_version': item.get('meta', {}).get('artifact_version'),
            'artifact_type': item.get('meta', {}).get('artifact_type'),
            'status': item.get('meta', {}).get('status'),
            'created_at': item.get('meta', {}).get('spawned_at'),
            'has_overflow': bool(item.get('overflow', {}).get('s3_payload_ref')),
        }
        artifacts.append(artifact_metadata)
    
    return artifacts
