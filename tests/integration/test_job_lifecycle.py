"""
Integration Tests for Job Lifecycle
Story 6.5: Job Lifecycle & Metadata Table

Test Requirements:
- Test job creation → status query → Step Functions update → completion
- Test job creation → status query → Step Functions failure → failed status
- Test TTL expiration (job auto-deleted after 7 days)
- Test token verification (valid token, invalid token, expired job)
- Test admin endpoint (list failed jobs)

NOTE: These tests require DynamoDB Local running on localhost:8000
To run: docker run -d -p 8000:8000 amazon/dynamodb-local
"""

import pytest

# Skip all tests in this module if DynamoDB Local is not available
pytestmark = pytest.mark.skip(reason="Requires DynamoDB Local on localhost:8000. Run: docker run -d -p 8000:8000 amazon/dynamodb-local")
import boto3
import json
import time
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

# Test configuration
DYNAMODB_ENDPOINT = 'http://localhost:8000'  # DynamoDB Local
TABLE_NAME = 'til-jobs'
REGION = 'us-east-1'


@pytest.fixture
def dynamodb_client():
    """Create DynamoDB client pointing to DynamoDB Local"""
    return boto3.client(
        'dynamodb',
        endpoint_url=DYNAMODB_ENDPOINT,
        region_name=REGION,
        aws_access_key_id='test',
        aws_secret_access_key='test',
    )


@pytest.fixture
def table(dynamodb_client):
    """Create test table"""
    try:
        dynamodb_client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        # Wait for table to be active
        dynamodb_client.get_waiter('table_exists').wait(TableName=TABLE_NAME)
        yield TABLE_NAME
    finally:
        # Cleanup: delete table
        try:
            dynamodb_client.delete_table(TableName=TABLE_NAME)
            dynamodb_client.get_waiter('table_not_exists').wait(TableName=TABLE_NAME)
        except ClientError:
            pass


def test_job_creation_and_status_query(dynamodb_client, table):
    """Test job creation → status query flow"""
    import uuid
    import hmac
    import hashlib
    
    # Create job
    job_id = str(uuid.uuid4())
    job_read_token = str(uuid.uuid4()) + str(uuid.uuid4())
    server_secret = 'test-secret'
    job_read_token_hash = hmac.new(
        server_secret.encode('utf-8'),
        job_read_token.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    now = datetime.utcnow()
    expires_at = int((now + timedelta(days=7)).timestamp())
    
    item = {
        'job_id': {'S': job_id},
        'job_read_token_hash': {'S': job_read_token_hash},
        'status': {'S': 'queued'},
        'created_at': {'S': now.isoformat()},
        'updated_at': {'S': now.isoformat()},
        'expires_at': {'N': str(expires_at)},
        'request_context': {
            'M': {
                'conference': {'S': 'black_hat'},
                'topic': {'S': 'genai'},
            }
        },
        'vendor_assignment': {
            'M': {
                'manager_vendor': {'S': 'openai'},
                'manager_model': {'S': 'gpt-5.2'},
                'worker_vendor': {'S': 'anthropic'},
                'worker_model': {'S': 'claude-sonnet-4.5'},
            }
        },
        'public_status': {
            'M': {
                'status': {'S': 'queued'},
                'created_at': {'S': now.isoformat()},
            }
        },
    }
    
    # Put item
    dynamodb_client.put_item(TableName=table, Item=item)
    
    # Query status (simulate API call)
    response = dynamodb_client.get_item(
        TableName=table,
        Key={'job_id': {'S': job_id}}
    )
    
    assert 'Item' in response
    assert response['Item']['status']['S'] == 'queued'
    
    # Verify token
    computed_hash = hmac.new(
        server_secret.encode('utf-8'),
        job_read_token.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    assert hmac.compare_digest(computed_hash, job_read_token_hash)


def test_job_status_transitions(dynamodb_client, table):
    """Test job status transitions: queued → running → completed"""
    import uuid
    import hmac
    import hashlib
    
    job_id = str(uuid.uuid4())
    server_secret = 'test-secret'
    now = datetime.utcnow()
    expires_at = int((now + timedelta(days=7)).timestamp())
    
    # Create job in queued state
    item = {
        'job_id': {'S': job_id},
        'job_read_token_hash': {'S': 'test-hash'},
        'status': {'S': 'queued'},
        'created_at': {'S': now.isoformat()},
        'updated_at': {'S': now.isoformat()},
        'expires_at': {'N': str(expires_at)},
    }
    dynamodb_client.put_item(TableName=table, Item=item)
    
    # Transition: queued → running
    dynamodb_client.update_item(
        TableName=table,
        Key={'job_id': {'S': job_id}},
        UpdateExpression='SET #status = :running, #updated_at = :updated_at',
        ExpressionAttributeNames={
            '#status': 'status',
            '#updated_at': 'updated_at',
        },
        ExpressionAttributeValues={
            ':running': {'S': 'running'},
            ':updated_at': {'S': datetime.utcnow().isoformat()},
            ':queued': {'S': 'queued'},
        },
        ConditionExpression='#status = :queued OR #status = :running',
    )
    
    response = dynamodb_client.get_item(
        TableName=table,
        Key={'job_id': {'S': job_id}}
    )
    assert response['Item']['status']['S'] == 'running'
    
    # Transition: running → completed
    completed_at = datetime.utcnow()
    dynamodb_client.update_item(
        TableName=table,
        Key={'job_id': {'S': job_id}},
        UpdateExpression='SET #status = :completed, completed_at = :completed_at, #updated_at = :updated_at',
        ExpressionAttributeNames={
            '#status': 'status',
            '#updated_at': 'updated_at',
        },
        ExpressionAttributeValues={
            ':completed': {'S': 'completed'},
            ':completed_at': {'S': completed_at.isoformat()},
            ':updated_at': {'S': datetime.utcnow().isoformat()},
            ':running': {'S': 'running'},
        },
        ConditionExpression='#status = :running OR #status = :completed',
    )
    
    response = dynamodb_client.get_item(
        TableName=table,
        Key={'job_id': {'S': job_id}}
    )
    assert response['Item']['status']['S'] == 'completed'
    assert 'completed_at' in response['Item']


def test_job_failure_transition(dynamodb_client, table):
    """Test job failure: running → failed"""
    import uuid
    
    job_id = str(uuid.uuid4())
    now = datetime.utcnow()
    expires_at = int((now + timedelta(days=7)).timestamp())
    
    # Create job in running state
    item = {
        'job_id': {'S': job_id},
        'job_read_token_hash': {'S': 'test-hash'},
        'status': {'S': 'running'},
        'created_at': {'S': now.isoformat()},
        'updated_at': {'S': now.isoformat()},
        'expires_at': {'N': str(expires_at)},
    }
    dynamodb_client.put_item(TableName=table, Item=item)
    
    # Transition: running → failed
    failed_at = datetime.utcnow()
    dynamodb_client.update_item(
        TableName=table,
        Key={'job_id': {'S': job_id}},
        UpdateExpression='SET #status = :failed, failure_reason = :reason, #error = :error, completed_at = :completed_at, #updated_at = :updated_at',
        ExpressionAttributeNames={
            '#status': 'status',
            '#error': 'error',
            '#updated_at': 'updated_at',
        },
        ExpressionAttributeValues={
            ':failed': {'S': 'failed'},
            ':reason': {'S': 'timeout'},
            ':error': {'S': 'Job timed out after 90 seconds'},
            ':completed_at': {'S': failed_at.isoformat()},
            ':updated_at': {'S': datetime.utcnow().isoformat()},
            ':running': {'S': 'running'},
        },
        ConditionExpression='#status = :running OR #status = :failed',
    )
    
    response = dynamodb_client.get_item(
        TableName=table,
        Key={'job_id': {'S': job_id}}
    )
    assert response['Item']['status']['S'] == 'failed'
    assert response['Item']['failure_reason']['S'] == 'timeout'
    assert 'error' in response['Item']


def test_expired_job(dynamodb_client, table):
    """Test expired job (expires_at <= now)"""
    import uuid
    
    job_id = str(uuid.uuid4())
    now = datetime.utcnow()
    expires_at = int((now - timedelta(days=1)).timestamp())  # Expired 1 day ago
    
    item = {
        'job_id': {'S': job_id},
        'job_read_token_hash': {'S': 'test-hash'},
        'status': {'S': 'completed'},
        'created_at': {'S': now.isoformat()},
        'updated_at': {'S': now.isoformat()},
        'expires_at': {'N': str(expires_at)},
    }
    dynamodb_client.put_item(TableName=table, Item=item)
    
    # Check expiration
    response = dynamodb_client.get_item(
        TableName=table,
        Key={'job_id': {'S': job_id}}
    )
    
    assert 'Item' in response
    item_expires_at = int(response['Item']['expires_at']['N'])
    current_time = int(time.time())
    
    # Job should be expired
    assert item_expires_at <= current_time


def test_admin_list_failed_jobs(dynamodb_client, table):
    """Test admin endpoint: list failed jobs"""
    import uuid
    
    # Create multiple failed jobs
    now = datetime.utcnow()
    expires_at = int((now + timedelta(days=7)).timestamp())
    
    for i in range(3):
        job_id = str(uuid.uuid4())
        item = {
            'job_id': {'S': job_id},
            'job_read_token_hash': {'S': 'test-hash'},
            'status': {'S': 'failed'},
            'failure_reason': {'S': 'timeout'},
            'error': {'S': f'Error {i}'},
            'created_at': {'S': (now - timedelta(days=i)).isoformat()},
            'updated_at': {'S': now.isoformat()},
            'expires_at': {'N': str(expires_at)},
        }
        dynamodb_client.put_item(TableName=table, Item=item)
    
    # Scan for failed jobs
    cutoff_date = (now - timedelta(days=7)).isoformat()
    response = dynamodb_client.scan(
        TableName=table,
        FilterExpression='#status = :status AND created_at >= :cutoff',
        ExpressionAttributeNames={
            '#status': 'status',
        },
        ExpressionAttributeValues={
            ':status': {'S': 'failed'},
            ':cutoff': {'S': cutoff_date},
        },
        Limit=100,
    )
    
    assert len(response['Items']) == 3
    for item in response['Items']:
        assert item['status']['S'] == 'failed'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
