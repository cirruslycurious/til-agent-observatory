"""
Artifact Reader Library (Python)
Story 6.1: DynamoDB Scratch Artifacts Storage

Reads artifacts from DynamoDB and S3.
"""

import json
import boto3
import os
from typing import Dict, Any, Optional, List

# Import S3 downloader (Story 6.3)
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent / 's3-utils'))
from s3_uploader import download_artifact_from_s3, S3DownloadError, HashMismatchError

# Configuration
ARTIFACTS_TABLE_NAME = os.environ.get('ARTIFACTS_TABLE_NAME', 'til-artifacts')
S3_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize clients
dynamodb = boto3.resource('dynamodb', region_name=S3_REGION)
table = dynamodb.Table(ARTIFACTS_TABLE_NAME)


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
        # Get latest version: Try latest pointer first (Option 1 - fast)
        latest_sk = f"latest#{task_id}"
        latest_response = table.get_item(
            Key={
                'job_id': job_id,
                'artifact_sk': latest_sk,
            }
        )
        
        if 'Item' in latest_response:
            # Use latest pointer
            latest_version = latest_response['Item'].get('latest_version')
            if latest_version:
                artifact_sk = f"{task_id}#{latest_version}"
                response = table.get_item(
                    Key={
                        'job_id': job_id,
                        'artifact_sk': artifact_sk,
                    }
                )
                if 'Item' in response:
                    artifact = response['Item']
                else:
                    artifact = None
            else:
                artifact = None
        else:
            # Fallback: Query by job_id, filter by task_id prefix, sort descending, limit 1 (Option 2)
            response = table.query(
                KeyConditionExpression='job_id = :job_id',
                FilterExpression='begins_with(artifact_sk, :task_prefix)',
                ExpressionAttributeValues={
                    ':job_id': job_id,
                    ':task_prefix': f"{task_id}#",
                },
                ScanIndexForward=False,  # Descending order (v0002 > v0001 lexicographically)
                Limit=1,
            )
            
            if not response.get('Items'):
                return None
            
            artifact = response['Items'][0]
    
    if not artifact:
        return None
    
    # If overflowed, fetch full artifact from S3 (Story 6.3)
    if artifact.get('overflow', {}).get('s3_payload_ref'):
        s3_key = artifact['overflow']['s3_payload_ref']
        expected_hash = artifact.get('overflow', {}).get('payload_sha256')  # Raw hash (before compression)
        
        try:
            # Download from S3 with hash verification
            full_artifact = download_artifact_from_s3(s3_key, expected_hash=expected_hash)
            
            # Merge S3 data back into artifact
            artifact['data'] = full_artifact['data']
        except (S3DownloadError, HashMismatchError) as e:
            # S3 fetch failed or hash mismatch - return artifact with summary only
            # Log error for debugging (in production, use structured logging)
            print(f"Warning: Failed to fetch S3 artifact {s3_key}: {e}")
            # Return artifact with summary (data field may be truncated)
    
    return artifact


def list_artifacts_for_job(job_id: str, include_data: bool = False) -> List[Dict[str, Any]]:
    """
    List all artifacts for a job.
    
    Args:
        job_id: Job identifier
        include_data: If True, include full data payloads (default: False, metadata only)
        
    Returns:
        List of artifacts (metadata only by default, or full payloads if include_data=True)
    """
    response = table.query(
        KeyConditionExpression='job_id = :job_id',
        ExpressionAttributeValues={
            ':job_id': job_id,
        },
    )
    
    artifacts = []
    for item in response.get('Items', []):
        if include_data:
            # Include full artifact
            artifacts.append(item)
        else:
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
