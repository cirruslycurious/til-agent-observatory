"""
Integration Tests for Tool API Endpoints
Story 3.3: Tool Usage Logging

Test Requirements:
- Test GET /api/v1/workflow/{job_id}/tools (returns all tool calls)
- Test GET /api/v1/workflow/{job_id}/tools/sequences (returns tool call sequences)
- Test GET /api/v1/workflow/{job_id}/tools/effectiveness (returns tool effectiveness metrics)
- Test pagination for tools endpoint
- Use moto for DynamoDB mocking (no AWS account needed)
"""

import pytest
import boto3
import json
import os
from decimal import Decimal
from moto import mock_aws
from datetime import datetime, timezone

# Import modules under test
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root / 'packages' / 'shared' / 'tool-wrappers'))
sys.path.append(str(project_root / 'packages' / 'shared' / 'decision-events'))

from tool_logger import log_tool_call
from event_types import EventType
from actor import Actor

# Test configuration
JOBS_TABLE_NAME = 'til-jobs'
DECISION_EVENTS_BY_JOB_TABLE_NAME = 'til-decision-events-by-job'
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
    os.environ['JOBS_TABLE_NAME'] = JOBS_TABLE_NAME
    yield
    # Cleanup
    for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECURITY_TOKEN', 
                'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION']:
        if key in os.environ:
            del os.environ[key]


@pytest.fixture
def aws_mock(aws_credentials):
    """Create mock AWS environment (DynamoDB)"""
    with mock_aws():
        # Create DynamoDB tables
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        
        # jobs table
        jobs_table = dynamodb.create_table(
            TableName=JOBS_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        jobs_table.wait_until_exists()
        
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
        
        # generation_metrics table (for seq counter)
        metrics_table = dynamodb.create_table(
            TableName='til-generation-metrics',
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
        
        yield {
            'jobs_table': jobs_table,
            'events_by_job_table': events_by_job_table,
            'metrics_table': metrics_table,
        }


@pytest.fixture
def test_job(aws_mock):
    """Create a test job with valid token"""
    import hashlib
    import hmac
    
    job_id = 'test-job-id'
    job_read_token = 'test-token-123'
    server_secret = 'test-secret'
    
    # Hash token
    job_read_token_hash = hmac.new(
        server_secret.encode('utf-8'),
        job_read_token.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Create job
    jobs_table = aws_mock['jobs_table']
    jobs_table.put_item(
        Item={
            'job_id': job_id,
            'job_read_token_hash': job_read_token_hash,
            'expires_at': int(datetime.now(timezone.utc).timestamp()) + 3600,  # 1 hour from now
            'status': 'running',
        }
    )
    
    return {
        'job_id': job_id,
        'job_read_token': job_read_token,
    }


@pytest.fixture
def test_tool_calls(aws_mock, test_job):
    """Create test tool calls for a job"""
    job_id = test_job['job_id']
    
    # Log several tool calls
    tool_calls = []
    
    # Tool call 1: web_search
    tool_call_1 = log_tool_call(
        tool_name='web_search',
        params={'query': 'test query 1'},
        results={'results': [{'title': 'Result 1'}]},
        reasoning='Need to search for information',
        job_id=job_id,
        actor=Actor.SUB_WORKER.value,
        worker_id='worker-1',
        worker_vendor='openai',
        execution_id='exec-123',
        state_name='TestState',
        iteration=0,
        sub_worker_instance_id='sub-456',
        tokens_used=0,
        cost_usd=0.002,
        success_status='success',
    )
    tool_calls.append(tool_call_1)
    
    # Tool call 2: dynamodb_lookup
    tool_call_2 = log_tool_call(
        tool_name='dynamodb_lookup',
        params={'conference': 'black_hat', 'data_type': 'requirements'},
        results={'data_type': 'requirements', 'items': [{'field': 'value'}]},
        reasoning='Need to lookup conference requirements',
        job_id=job_id,
        actor=Actor.WORKER.value,
        worker_id='worker-1',
        worker_vendor='openai',
        execution_id='exec-123',
        state_name='TestState',
        iteration=0,
        tokens_used=0,
        cost_usd=0.0,
        success_status='success',
    )
    tool_calls.append(tool_call_2)
    
    # Tool call 3: web_search (error)
    tool_call_3 = log_tool_call(
        tool_name='web_search',
        params={'query': 'test query 2'},
        results={'error': 'Timeout'},
        reasoning='Another search attempt',
        job_id=job_id,
        actor=Actor.SUB_WORKER.value,
        worker_id='worker-1',
        worker_vendor='openai',
        execution_id='exec-123',
        state_name='TestState',
        iteration=0,
        sub_worker_instance_id='sub-456',
        tokens_used=0,
        cost_usd=0.0,
        success_status='timeout',
    )
    tool_calls.append(tool_call_3)
    
    return tool_calls


def test_get_tool_calls_by_job_id(aws_mock, test_job, test_tool_calls):
    """Test get_tool_calls_by_job_id returns all tool calls chronologically"""
    from tool_queries import get_tool_calls_by_job_id
    
    job_id = test_job['job_id']
    tool_calls = get_tool_calls_by_job_id(job_id)
    
    # Verify all tool calls are returned
    assert len(tool_calls) == 3
    
    # Verify chronological order (by seq)
    assert tool_calls[0]['seq'] < tool_calls[1]['seq']
    assert tool_calls[1]['seq'] < tool_calls[2]['seq']
    
    # Verify all are tool_called events
    assert all(item['event_type'] == 'tool_called' for item in tool_calls)


def test_get_tool_call_sequences(aws_mock, test_job, test_tool_calls):
    """Test get_tool_call_sequences groups by actor and sub_worker_instance_id"""
    from tool_queries import get_tool_call_sequences
    
    job_id = test_job['job_id']
    sequences = get_tool_call_sequences(job_id)
    
    # Verify sequences are grouped
    assert len(sequences) == 2
    
    # Find sub_worker sequence
    sub_worker_seq = next(s for s in sequences if s['actor'] == 'sub_worker')
    assert sub_worker_seq['sub_worker_instance_id'] == 'sub-456'
    assert len(sub_worker_seq['tool_calls']) == 2  # 2 web_search calls
    
    # Find worker sequence
    worker_seq = next(s for s in sequences if s['actor'] == 'worker')
    assert worker_seq['sub_worker_instance_id'] is None
    assert len(worker_seq['tool_calls']) == 1  # 1 dynamodb_lookup call


def test_get_tool_effectiveness_metrics(aws_mock, test_job, test_tool_calls):
    """Test get_tool_effectiveness_metrics calculates correct metrics"""
    from tool_queries import get_tool_effectiveness_metrics
    
    job_id = test_job['job_id']
    metrics = get_tool_effectiveness_metrics(job_id)
    
    # Verify web_search metrics
    assert 'web_search' in metrics
    web_search_metrics = metrics['web_search']
    assert web_search_metrics['total_calls'] == 2
    assert web_search_metrics['success_rate'] == 0.5  # 1 success, 1 timeout
    assert web_search_metrics['avg_cost_usd'] == pytest.approx(0.001, abs=0.0001)  # (0.002 + 0) / 2
    
    # Verify dynamodb_lookup metrics
    assert 'dynamodb_lookup' in metrics
    dynamodb_metrics = metrics['dynamodb_lookup']
    assert dynamodb_metrics['total_calls'] == 1
    assert dynamodb_metrics['success_rate'] == 1.0
    assert dynamodb_metrics['avg_cost_usd'] == 0.0


def test_get_tool_call_by_invocation_id(aws_mock, test_job, test_tool_calls):
    """Test get_tool_call_by_invocation_id finds specific tool call"""
    from tool_queries import get_tool_call_by_invocation_id
    
    job_id = test_job['job_id']
    
    # Get first tool call's invocation ID
    from tool_queries import get_tool_calls_by_job_id
    all_tool_calls = get_tool_calls_by_job_id(job_id)
    first_tool_call = all_tool_calls[0]
    invocation_id = first_tool_call['details']['tool_invocation_id']
    
    # Find by invocation ID
    found_tool_call = get_tool_call_by_invocation_id(job_id, invocation_id)
    
    assert found_tool_call is not None
    assert found_tool_call['details']['tool_invocation_id'] == invocation_id
    assert found_tool_call['details']['tool_name'] == 'web_search'
    
    # Test not found
    not_found = get_tool_call_by_invocation_id(job_id, 'non-existent-id')
    assert not_found is None
