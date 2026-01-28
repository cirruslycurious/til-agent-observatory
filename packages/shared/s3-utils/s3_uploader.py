"""
S3 Uploader Library (Python)
Story 6.3: S3 Storage for Large Artifacts

Source of truth for S3 upload/download logic.
Handles compression, hashing, error handling, and atomic operations.
"""

import json
import hashlib
import gzip
import boto3
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from botocore.exceptions import ClientError

# Configuration
S3_BUCKET_NAME = os.environ.get('ARTIFACTS_BUCKET_NAME', 'your-artifacts-bucket')
S3_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Size thresholds
ARTIFACT_SIZE_THRESHOLD = 350 * 1024  # 350KB (DynamoDB limit is 400KB)
TOOL_RESULTS_SIZE_THRESHOLD = 50 * 1024  # 50KB for tool results
COMPRESSION_THRESHOLD = 10 * 1024  # 10KB (compress if >10KB)

# Initialize S3 client
s3_client = boto3.client('s3', region_name=S3_REGION)


class S3UploadError(Exception):
    """Raised when S3 upload fails"""
    pass


class S3DownloadError(Exception):
    """Raised when S3 download fails"""
    pass


class HashMismatchError(Exception):
    """Raised when hash verification fails"""
    pass


def canonical_json_serialize(data: Dict[str, Any]) -> bytes:
    """
    Serialize data to canonical JSON bytes (UTF-8, stable key order, no whitespace).
    
    This ensures deterministic hashing across Python and TypeScript implementations.
    Used for: artifact hashing, event details_hash, tool results hashing.
    
    Canonical format:
    - sort_keys=True (stable key order)
    - separators=(',', ':') (no whitespace)
    - ensure_ascii=False (preserve Unicode, UTF-8 encoding)
    
    Args:
        data: Data to serialize
        
    Returns:
        Canonical JSON bytes (UTF-8 encoded)
    """
    return json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def compute_sha256_hash(data: bytes) -> str:
    """
    Compute SHA-256 hash of data.
    
    Args:
        data: Bytes to hash
        
    Returns:
        SHA-256 hash (hex string, 64 characters)
    """
    return hashlib.sha256(data).hexdigest()


def upload_artifact_to_s3(
    job_id: str,
    task_id: str,
    artifact_version: str,
    artifact_data: Dict[str, Any],
    compress: bool = True,
    writer_request_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Uploads artifact to S3 if size >=350KB.
    
    Args:
        job_id: Job identifier (UUID)
        task_id: Task identifier (e.g., "cfp_extract")
        artifact_version: Artifact version (e.g., "v0001")
        artifact_data: Full artifact data (dict)
        compress: Whether to compress with gzip (default: True)
        writer_request_id: Request ID for tracking (optional, for orphan cleanup)
        
    Returns:
        dict with s3_key, sha256_hash, size_bytes, compressed (if uploaded)
        None if size <350KB (store in DynamoDB only)
        
    Raises:
        S3UploadError: If S3 upload fails (atomic operation, do NOT write to DynamoDB)
    """
    # Serialize to canonical JSON to compute size
    json_bytes = canonical_json_serialize(artifact_data)
    size_bytes = len(json_bytes)
    
    # If size <350KB, return None (store in DynamoDB only)
    if size_bytes < ARTIFACT_SIZE_THRESHOLD:
        return None
    
    # Compute SHA-256 hash of raw JSON bytes (before compression)
    payload_sha256_raw = compute_sha256_hash(json_bytes)
    
    # Prepare S3 key
    # Format: s3://scratch-artifacts-{environment}/{job_id}/{task_id}/{artifact_version}/full_artifact.json
    s3_key = f"{job_id}/{task_id}/{artifact_version}/full_artifact.json"
    
    # Compress if requested and size >10KB
    compressed = False
    payload_sha256_stored = None
    body = json_bytes
    content_encoding = None
    
    if compress and size_bytes > COMPRESSION_THRESHOLD:
        # Compress with gzip
        body = gzip.compress(json_bytes)
        compressed = True
        content_encoding = 'gzip'
        # Compute hash of compressed bytes (optional, for debuggability)
        payload_sha256_stored = compute_sha256_hash(body)
    
    # Prepare S3 object metadata and tags
    artifact_id = artifact_data.get('meta', {}).get('artifact_id', f"{job_id}#{task_id}#{artifact_version}")
    created_at = datetime.now(timezone.utc).isoformat()
    
    # S3 object tags (for orphan cleanup)
    # Note: S3 tag values must match pattern: ^[{a-zA-Z0-9 }_.://=+-@%]*$ (no # character)
    # Replace # with _ for tag values, but keep original in metadata
    tags = {
        'job_id': job_id,
        'artifact_id': artifact_id.replace('#', '_'),  # Replace # with _ for S3 tags
        'created_at': created_at.replace(':', '-').replace('+', '-'),  # Sanitize timestamp for tags
    }
    if writer_request_id:
        tags['writer_request_id'] = writer_request_id.replace('#', '_') if writer_request_id else writer_request_id
    
    # Convert tags to S3 TagSet format
    tag_set = [{'Key': k, 'Value': v} for k, v in tags.items()]
    
    try:
        # Upload to S3
        put_object_params = {
            'Bucket': S3_BUCKET_NAME,
            'Key': s3_key,
            'Body': body,
            'ContentType': 'application/json',
            'Tagging': '&'.join([f"{k}={v}" for k, v in tags.items()]),
        }
        
        if content_encoding:
            put_object_params['ContentEncoding'] = content_encoding
        
        # Add metadata (for debugging and orphan cleanup)
        put_object_params['Metadata'] = {
            'job_id': job_id,
            'artifact_id': artifact_id,
            'created_at': created_at,
        }
        if writer_request_id:
            put_object_params['Metadata']['writer_request_id'] = writer_request_id
        
        s3_client.put_object(**put_object_params)
        
        # Verify upload succeeded (head object)
        s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        
        # Return upload result
        result = {
            's3_key': s3_key,
            'payload_sha256': payload_sha256_raw,  # Raw hash (before compression)
            'payload_size_bytes': size_bytes,
            'compressed': compressed,
        }
        
        if payload_sha256_stored:
            result['payload_sha256_stored'] = payload_sha256_stored  # Stored hash (after compression, optional)
        
        return result
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))
        raise S3UploadError(
            f"S3 upload failed for {s3_key}: {error_code} - {error_message}"
        ) from e
    except Exception as e:
        raise S3UploadError(f"S3 upload failed for {s3_key}: {str(e)}") from e


def upload_tool_results_to_s3(
    job_id: str,
    task_id: str,
    artifact_version: str,
    tool_results: Dict[str, Any],
    tool_name: str,
    tool_call_id: str,
    writer_request_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Uploads tool results to S3 if size >50KB.
    
    Args:
        job_id: Job identifier (UUID)
        task_id: Task identifier (e.g., "cfp_extract")
        artifact_version: Artifact version (e.g., "v0001")
        tool_results: Full tool results data (dict)
        tool_name: Tool name (e.g., "web_search")
        tool_call_id: Tool call ID (deterministic ID, used in S3 key for uniqueness)
        writer_request_id: Request ID for tracking (optional, for orphan cleanup)
        
    Returns:
        dict with s3_key, sha256_hash, size_bytes (if uploaded)
        None if size <=50KB (store in DynamoDB only, results_inline field)
        
    Raises:
        S3UploadError: If S3 upload fails (atomic operation, do NOT update DynamoDB - never create DynamoDB pointer to missing S3 object)
    """
    # Serialize to canonical JSON to compute size
    json_bytes = canonical_json_serialize(tool_results)
    size_bytes = len(json_bytes)
    
    # If size <=50KB, return None (store in DynamoDB only, results_inline field)
    if size_bytes <= TOOL_RESULTS_SIZE_THRESHOLD:
        return None
    
    # Compute SHA-256 hash of raw JSON bytes (before compression)
    tool_results_hash = compute_sha256_hash(json_bytes)
    
    # Prepare S3 key (includes tool_call_id for uniqueness)
    # Format: s3://scratch-artifacts-{environment}/{job_id}/{task_id}/{artifact_version}/tool_results/{tool_call_id}.json
    s3_key = f"{job_id}/{task_id}/{artifact_version}/tool_results/{tool_call_id}.json"
    
    # Compress if size >10KB
    body = json_bytes
    content_encoding = None
    
    if size_bytes > COMPRESSION_THRESHOLD:
        # Compress with gzip
        body = gzip.compress(json_bytes)
        content_encoding = 'gzip'
    
    # Prepare S3 object metadata and tags
    created_at = datetime.now(timezone.utc).isoformat()
    
    # S3 object tags (for orphan cleanup)
    # Note: S3 tag values must match pattern: ^[{a-zA-Z0-9 }_.://=+-@%]*$ (no # character)
    tags = {
        'job_id': job_id,
        'tool_call_id': tool_call_id.replace('#', '_') if '#' in tool_call_id else tool_call_id,
        'created_at': created_at.replace(':', '-').replace('+', '-'),  # Sanitize timestamp for tags
    }
    if writer_request_id:
        tags['writer_request_id'] = writer_request_id.replace('#', '_') if writer_request_id and '#' in writer_request_id else writer_request_id
    
    try:
        # Upload to S3
        put_object_params = {
            'Bucket': S3_BUCKET_NAME,
            'Key': s3_key,
            'Body': body,
            'ContentType': 'application/json',
            'Tagging': '&'.join([f"{k}={v}" for k, v in tags.items()]),
        }
        
        if content_encoding:
            put_object_params['ContentEncoding'] = content_encoding
        
        # Add metadata (for debugging and orphan cleanup)
        put_object_params['Metadata'] = {
            'job_id': job_id,
            'tool_call_id': tool_call_id,
            'created_at': created_at,
        }
        if writer_request_id:
            put_object_params['Metadata']['writer_request_id'] = writer_request_id
        
        s3_client.put_object(**put_object_params)
        
        # Verify upload succeeded (head object)
        s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        
        # Return upload result
        return {
            's3_key': s3_key,
            'tool_results_hash': tool_results_hash,
            'tool_results_size_bytes': size_bytes,
        }
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))
        raise S3UploadError(
            f"S3 upload failed for {s3_key}: {error_code} - {error_message}"
        ) from e
    except Exception as e:
        raise S3UploadError(f"S3 upload failed for {s3_key}: {str(e)}") from e


def download_artifact_from_s3(s3_key: str, expected_hash: Optional[str] = None) -> Dict[str, Any]:
    """
    Downloads artifact from S3 and verifies hash.
    
    Args:
        s3_key: S3 object key
        expected_hash: Expected SHA-256 hash (optional, for verification - raw hash before compression)
        
    Returns:
        dict with artifact data (decompressed if needed)
        
    Raises:
        S3DownloadError: If download fails (404, 503, etc.)
        HashMismatchError: If hash verification fails
    """
    try:
        # Download object from S3
        response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        
        # Read body
        body = response['Body'].read()
        
        # Check Content-Encoding
        content_encoding = response.get('ContentEncoding')
        
        # Decompress if gzip
        if content_encoding == 'gzip':
            body = gzip.decompress(body)
        
        # Parse JSON
        artifact_data = json.loads(body.decode('utf-8'))
        
        # Verify hash if expected_hash provided
        if expected_hash:
            # Hash raw JSON bytes (before compression) using canonical serialization
            raw_json_bytes = canonical_json_serialize(artifact_data)
            computed_hash = compute_sha256_hash(raw_json_bytes)
            
            if computed_hash != expected_hash:
                raise HashMismatchError(
                    f"Hash mismatch for {s3_key}: expected {expected_hash}, got {computed_hash}"
                )
        
        return artifact_data
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))
        
        if error_code == 'NoSuchKey' or error_code == '404':
            raise S3DownloadError(f"S3 object not found: {s3_key}") from e
        else:
            raise S3DownloadError(
                f"S3 download failed for {s3_key}: {error_code} - {error_message}"
            ) from e
    except HashMismatchError:
        raise
    except Exception as e:
        raise S3DownloadError(f"S3 download failed for {s3_key}: {str(e)}") from e
