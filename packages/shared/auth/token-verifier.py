"""
Token Verification Utility (Python)
Story 6.5: Job Lifecycle & Metadata Table

Pure verifier function (no DB reads) - callers pass the job item
Uses constant-time comparison to prevent timing attacks
"""

import hmac
import hashlib
import os
from typing import Optional, Dict, Any

SERVER_SECRET = os.environ.get('SERVER_SECRET', 'local-dev-secret-change-in-production')


def verify_job_token_hash(token: str, stored_hash: str) -> bool:
    """
    Verify job token hash using constant-time comparison.
    
    Args:
        token: The token provided by the client
        stored_hash: The stored hash from the job item
        
    Returns:
        True if token matches, False otherwise
        
    AC: Pure verifier function (no DB reads) - callers pass the job item
    AC: Use known constant-time compare primitive: hmac.compare_digest()
    """
    # Compute HMAC-SHA256(token, server_secret)
    computed_hash = hmac.new(
        SERVER_SECRET.encode('utf-8'),
        token.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(computed_hash, stored_hash)


def get_job_and_verify_token(
    dynamodb_client: Any,
    table_name: str,
    job_id: str,
    token: str
) -> Dict[str, Any]:
    """
    Optional convenience function: Get job and verify token.
    
    NOTE: This function does a DB read - ban from hot endpoints in code review
    Use only for non-hot paths (admin endpoints, etc.)
    
    Args:
        dynamodb_client: Boto3 DynamoDB client
        table_name: Jobs table name
        job_id: Job ID
        token: Token to verify
        
    Returns:
        Dict with 'job', 'is_valid', and 'is_expired' keys
    """
    import time
    
    # GetItem from DynamoDB
    response = dynamodb_client.get_item(
        TableName=table_name,
        Key={'job_id': {'S': job_id}}
    )
    
    if 'Item' not in response:
        return {
            'job': None,
            'is_valid': False,
            'is_expired': False,
        }
    
    # Parse job item
    item = response['Item']
    job = {
        'job_id': item['job_id']['S'],
        'job_read_token_hash': item['job_read_token_hash']['S'],
        'expires_at': int(item['expires_at']['N']),
    }
    
    now = int(time.time())
    is_expired = job['expires_at'] <= now
    
    # Verify token (even if expired, for consistent error handling)
    is_valid = verify_job_token_hash(token, job['job_read_token_hash'])
    
    return {
        'job': job,
        'is_valid': is_valid,
        'is_expired': is_expired,
    }
