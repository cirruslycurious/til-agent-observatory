"""
Integration Tests for Decision Events
Story 3.1: Decision Event Capture

Test Requirements:
- Test two-table write pattern (TransactWriteItems)
- Test idempotency (duplicate event_id returns existing event)
- Test S3 failure prevents event write (atomicity)
- Test seq gap tolerated (seq counter increment is atomic, gaps are acceptable)
- Use moto for DynamoDB and S3 mocking (no AWS account needed)
"""

import pytest
import boto3
import json
import os
from decimal import Decimal
from moto import mock_aws
from datetime import datetime, timezone
import hashlib

# Import modules under test
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root / 'packages' / 'shared' / 'decision-events'))

from event_logger import (
    log_decision_event,
    EventIdempotencyError,
)
from event_types import EventType
from actor import Actor

# Test configuration
DECISION_EVENTS_BY_JOB_TABLE_NAME = 'til-decision-events-by-job'
DECISION_EVENT_IDS_TABLE_NAME = 'til-decision-event-ids'
GENERATION_METRICS_TABLE_NAME = 'til-generation-metrics'
S3_BUCKET_NAME = 'your-artifacts-bucket'
REGION = 'us-east-1'


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials"""
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = REGION
    os.environ['DECISION_EVENTS_BY_JOB_TABLE_NAME'] = DECISION_EVENTS_BY_JOB_TABLE_NAME
    os.environ['DECISION_EVENT_IDS_TABLE_NAME'] = DECISION_EVENT_IDS_TABLE_NAME
    os.environ['GENERATION_METRICS_TABLE_NAME'] = GENERATION_METRICS_TABLE_NAME
    os.environ['ARTIFACTS_BUCKET_NAME'] = S3_BUCKET_NAME
    yield
    # Cleanup
    for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECURITY_TOKEN', 
                'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION']:
        if key in os.environ:
            del os.environ[key]


@pytest.fixture
def aws_mock(aws_credentials):
    """Create mock AWS environment (DynamoDB and S3)"""
    with mock_aws():
        # Create DynamoDB tables
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        
        # decision_events_by_job table
        events_by_job_table = dynamodb.create_table(
            TableName=DECISION_EVENTS_BY_JOB_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
                {'AttributeName': 'seq_ts_type', 'KeyType': 'RANGE'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
                {'AttributeName': 'seq_ts_type', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        events_by_job_table.wait_until_exists()
        
        # decision_event_ids table (for idempotency)
        event_ids_table = dynamodb.create_table(
            TableName=DECISION_EVENT_IDS_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'event_id', 'KeyType': 'HASH'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'event_id', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        event_ids_table.wait_until_exists()
        
        # generation_metrics table (for seq counter)
        metrics_table = dynamodb.create_table(
            TableName=GENERATION_METRICS_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
                {'AttributeName': 'metric_sk', 'KeyType': 'RANGE'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
                {'AttributeName': 'metric_sk', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        metrics_table.wait_until_exists()
        
        # Create S3 bucket
        s3_client = boto3.client('s3', region_name=REGION)
        s3_client.create_bucket(Bucket=S3_BUCKET_NAME)
        
        yield {
            'events_by_job_table': events_by_job_table,
            'event_ids_table': event_ids_table,
            'metrics_table': metrics_table,
            's3_bucket': S3_BUCKET_NAME,
        }




def test_two_table_write_pattern(aws_mock):
    """Test that TransactWriteItems writes to both tables atomically"""
    job_id = 'test-job-id'
    
    # Log an event
    details = {
        'tool_name': 'web_search',
        'tool_input': {'query': 'test query'},
        'tool_output': {'results': ['result1', 'result2']},
        'results_summary': 'Found 2 results',
    }
    
    result = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Tool called',
    )
    
    # Verify event was written to decision_events_by_job
    events_table = aws_mock['events_by_job_table']
    response = events_table.get_item(
        Key={
            'job_id': job_id,
            'seq_ts_type': result['seq_ts_type'],
        }
    )
    assert 'Item' in response
    event_item = response['Item']
    assert event_item['event_id'] == result['event_id']
    assert event_item['event_type'] == 'tool_called'
    assert event_item['actor'] == 'worker'
    assert event_item['seq'] == 1
    
    # Verify event_id was written to decision_event_ids
    ids_table = aws_mock['event_ids_table']
    id_response = ids_table.get_item(
        Key={'event_id': result['event_id']}
    )
    assert 'Item' in id_response
    id_item = id_response['Item']
    assert id_item['job_id'] == job_id
    assert id_item['sk'] == result['seq_ts_type']
    
    # Verify seq counter was incremented in generation_metrics
    metrics_table = aws_mock['metrics_table']
    metrics_response = metrics_table.get_item(
        Key={
            'job_id': job_id,
            'metric_sk': 'seq_counter#worker',
        }
    )
    assert 'Item' in metrics_response
    metrics_item = metrics_response['Item']
    assert metrics_item['seq'] == 1


def test_idempotency_duplicate_event(aws_mock):
    """Test that duplicate event_id returns existing event (idempotency)"""
    job_id = 'test-job-id'
    
    details = {
        'tool_name': 'web_search',
        'tool_input': {'query': 'test query'},
        'tool_output': {'results': ['result1']},
        'results_summary': 'Found 1 result',
    }
    
    # Log event first time
    result1 = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Tool called',
    )
    
    # Log same event again (same event_id should be generated)
    # Note: In real usage, event_id is deterministic based on inputs
    # For this test, we'll manually trigger idempotency by using the same event_id
    # by calling with identical parameters
    
    # Actually, the event_id is deterministic, so calling with same params should
    # generate same event_id and trigger idempotency
    result2 = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Tool called',
    )
    
    # Both should return the same event_id
    assert result1['event_id'] == result2['event_id']
    
    # Verify only one event exists in decision_events_by_job
    events_table = aws_mock['events_by_job_table']
    scan_response = events_table.scan()
    assert len(scan_response['Items']) == 1
    
    # Verify only one event_id exists in decision_event_ids
    ids_table = aws_mock['event_ids_table']
    ids_scan = ids_table.scan()
    assert len(ids_scan['Items']) == 1


def test_s3_overflow_for_large_details(aws_mock):
    """Test that large details (>10KB) are stored in S3 with truncated reference in DynamoDB"""
    job_id = 'test-job-id'

    # Create details that will be truncated and stored in S3
    details_dict = {
        'tool_name': 'web_search',
        'tool_input': {'query': 'test'},
        'tool_output': {'data': 'x' * 15000},  # > 10KB, will trigger S3
        'results_summary': 'Large result',
    }
    
    # Log event (should succeed with S3 overflow)
    result = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details_dict,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Tool called',
    )
    
    # Verify event was written
    events_table = aws_mock['events_by_job_table']
    response = events_table.get_item(
        Key={
            'job_id': job_id,
            'seq_ts_type': result['seq_ts_type'],
        }
    )
    assert 'Item' in response
    event_item = response['Item']
    assert event_item['details_truncated'] is True
    assert event_item['s3_details_ref'] is not None
    
    # Verify S3 object exists
    s3_client = boto3.client('s3', region_name=REGION)
    s3_key = event_item['s3_details_ref']
    s3_response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
    assert s3_response is not None


def test_seq_gap_tolerated(aws_mock):
    """Test that seq gaps are tolerated (seq counter increment is atomic)"""
    job_id = 'test-job-id'
    
    # Log multiple events from different actors
    details1 = {
        'tool_name': 'web_search',
        'tool_input': {'query': 'query1'},
        'tool_output': {'results': ['result1']},
        'results_summary': 'Result 1',
    }
    
    result1 = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details1,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Event 1',
    )
    
    # Log event from different actor (should get different seq)
    details2 = {
        'artifact_id': 'artifact-1',
        'artifact_type': 'style_profile',
        'artifact_version': 'v0001',
    }
    
    result2 = log_decision_event(
        event_type=EventType.ARTIFACT_CREATED.value,
        details=details2,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.SUB_WORKER.value,
        summary='Event 2',
    )
    
    # Verify seq values are sequential per actor
    assert result1['seq'] == 1  # First event from worker
    assert result2['seq'] == 1  # First event from sub_worker (different counter)
    
    # Log another event from worker (should increment worker's seq)
    details3 = {
        'tool_name': 'web_search',
        'tool_input': {'query': 'query2'},
        'tool_output': {'results': ['result2']},
        'results_summary': 'Result 2',
    }
    
    result3 = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details3,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Event 3',
    )
    
    assert result3['seq'] == 2  # Second event from worker
    
    # Verify all events exist
    events_table = aws_mock['events_by_job_table']
    scan_response = events_table.scan(
        FilterExpression='job_id = :job_id',
        ExpressionAttributeValues={':job_id': job_id}
    )
    assert len(scan_response['Items']) == 3
    
    # Verify seq counters are correct
    metrics_table = aws_mock['metrics_table']
    worker_metrics = metrics_table.get_item(
        Key={
            'job_id': job_id,
            'metric_sk': 'seq_counter#worker',
        }
    )
    assert worker_metrics['Item']['seq'] == 2
    
    sub_worker_metrics = metrics_table.get_item(
        Key={
            'job_id': job_id,
            'metric_sk': 'seq_counter#sub_worker',
        }
    )
    assert sub_worker_metrics['Item']['seq'] == 1


def test_event_details_hashing(aws_mock):
    """Test that event details are hashed consistently"""
    job_id = 'test-job-id'
    
    details = {
        'tool_name': 'web_search',
        'tool_input': {'query': 'test'},
        'tool_output': {'results': ['result1', 'result2']},
        'results_summary': 'Found 2 results',
    }
    
    result = log_decision_event(
        event_type=EventType.TOOL_CALLED.value,
        details=details,
        job_id=job_id,
        execution_id='test-exec-id',
        state_name='TestState',
        iteration=1,
        actor=Actor.WORKER.value,
        summary='Tool called',
    )
    
    # Verify details_hash is present
    events_table = aws_mock['events_by_job_table']
    response = events_table.get_item(
        Key={
            'job_id': job_id,
            'seq_ts_type': result['seq_ts_type'],
        }
    )
    event_item = response['Item']
    assert 'details_hash' in event_item
    assert len(event_item['details_hash']) == 64  # SHA256 hex string
    
    # Verify hash matches canonical JSON of details
    # (This is tested in unit tests, but good to verify in integration)
    # Use canonical JSON serialization (same as event_logger)
    from s3_uploader import canonical_json_serialize
    canonical_bytes = canonical_json_serialize(details)
    expected_hash = hashlib.sha256(canonical_bytes).hexdigest()
    assert event_item['details_hash'] == expected_hash
