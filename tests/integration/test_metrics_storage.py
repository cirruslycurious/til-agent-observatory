"""
Integration Tests for Metrics Storage
Story 6.2: DynamoDB Generation Metrics Storage

Tests metrics write, retrieval, and GSI queries using moto.
"""

import pytest
import boto3
import os
from moto import mock_aws
from datetime import datetime, timezone
from decimal import Decimal

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent / 'packages' / 'shared' / 'metrics-writer'))
from metrics_writer import (
    write_generation_metrics,
    write_iteration_metrics,
    ValidationError,
)

# Set environment variables for moto
os.environ['GENERATION_METRICS_TABLE_NAME'] = 'til-generation-metrics'
os.environ['AWS_REGION'] = 'us-east-1'


@pytest.fixture
def dynamodb_table():
    """Create DynamoDB table for testing"""
    with mock_aws():
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        # Create generation_metrics table
        table = dynamodb.create_table(
            TableName='til-generation-metrics',
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
                {'AttributeName': 'record_type_timestamp', 'KeyType': 'RANGE'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
                {'AttributeName': 'record_type_timestamp', 'AttributeType': 'S'},
                {'AttributeName': 'date_partition', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'date-partition-timestamp-index',
                    'KeySchema': [
                        {'AttributeName': 'date_partition', 'KeyType': 'HASH'},
                        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'},
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                },
                {
                    'IndexName': 'date-partition-record-type-index',
                    'KeySchema': [
                        {'AttributeName': 'date_partition', 'KeyType': 'HASH'},
                        {'AttributeName': 'record_type_timestamp', 'KeyType': 'RANGE'},
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                },
            ],
        )
        
        # Wait for table to be created
        table.wait_until_exists()
        
        yield table


@pytest.fixture
def sample_metrics_data():
    """Sample metrics data for testing"""
    return {
        'conference': 'black_hat',
        'topic': 'genai',
        'manager_vendor': 'openai',
        'manager_model': 'gpt-5.2',
        'worker_vendor': 'anthropic',
        'worker_model': 'claude-sonnet-4.5',
        'total_iterations': 3,
        'selected_iteration': 2,
        'user_accepted': True,
        'user_intent': 'would_submit_with_edits',
        'evaluator_result': {
            'top_3': ['black_hat', 'reinvent', 'kubecon'],
            'confidence_scores': [0.9, 0.7, 0.5],
            'reasons': ['Reason 1', 'Reason 2', 'Reason 3'],
        },
        'total_tokens': 5000,
        'total_cost_usd': 0.05,
        'total_time_seconds': 90,
        'sub_workers_spawned': ['cfp_extract', 'evidence_gather'],
        'tool_calls_made': ['web_search', 'dynamodb_lookup'],
        'scratch_artifacts': ['artifact-1', 'artifact-2'],
    }


class TestMetricsWriteAndRetrieval:
    """Tests for metrics write and retrieval"""
    
    @mock_aws
    def test_write_generation_metrics_summary(self, dynamodb_table, sample_metrics_data):
        """Write summary metrics and retrieve from DynamoDB"""
        # Write metrics
        result = write_generation_metrics(
            job_id='test-job-id-1',
            metrics_data=sample_metrics_data,
            record_type='summary',
        )
        
        assert result['write_status'] == 'created'
        assert result['job_id'] == 'test-job-id-1'
        assert result['record_type'] == 'summary'
        assert 'timestamp' in result
        assert 'date_partition' in result
        
        # Retrieve from DynamoDB
        item = dynamodb_table.get_item(
            Key={
                'job_id': 'test-job-id-1',
                'record_type_timestamp': result['record_type_timestamp'],
            }
        )['Item']
        
        # Verify required fields
        assert item['job_id'] == 'test-job-id-1'
        assert item['record_type'] == 'summary'
        assert item['timestamp'] is not None
        assert item['date_partition'] is not None
        assert item['conference'] == 'black_hat'
        assert item['total_iterations'] == 3
        assert item['user_intent'] == 'would_submit_with_edits'
        
        # Verify GSI attributes are present
        assert 'timestamp' in item  # GSI1 sort key
        assert 'date_partition' in item  # GSI1 and GSI2 partition key
        assert 'record_type_timestamp' in item  # Base table SK and GSI2 SK
        
        # Verify floats were converted to Decimal
        assert isinstance(item['total_cost_usd'], Decimal)
        assert isinstance(item['evaluator_result']['confidence_scores'][0], Decimal)
    
    @mock_aws
    def test_write_iteration_metrics(self, dynamodb_table, sample_metrics_data):
        """Write iteration metrics and retrieve from DynamoDB"""
        # Write iteration metrics
        result = write_iteration_metrics(
            job_id='test-job-id-2',
            iteration=2,
            iteration_data=sample_metrics_data,
        )
        
        assert result['write_status'] == 'created'
        assert result['record_type'] == 'iteration'
        
        # Retrieve from DynamoDB
        item = dynamodb_table.get_item(
            Key={
                'job_id': 'test-job-id-2',
                'record_type_timestamp': result['record_type_timestamp'],
            }
        )['Item']
        
        # Verify iteration-specific fields
        assert item['record_type'] == 'iteration'
        assert item['iteration'] == 2
    
    @mock_aws
    def test_write_multiple_iterations(self, dynamodb_table, sample_metrics_data):
        """Write multiple iteration metrics for same job"""
        job_id = 'test-job-id-3'
        
        # Write 3 iterations
        for iteration in range(3):
            result = write_iteration_metrics(
                job_id=job_id,
                iteration=iteration,
                iteration_data=sample_metrics_data,
            )
            assert result['write_status'] == 'created'
        
        # Query all items for this job_id
        response = dynamodb_table.query(
            KeyConditionExpression='job_id = :job_id',
            ExpressionAttributeValues={':job_id': job_id},
        )
        
        # Should have 3 iteration records
        assert len(response['Items']) == 3
        
        # Verify all have record_type = "iteration"
        for item in response['Items']:
            assert item['record_type'] == 'iteration'
            assert 'iteration' in item


class TestGSIQueries:
    """Tests for GSI queries"""
    
    @mock_aws
    def test_gsi1_time_series_query(self, dynamodb_table, sample_metrics_data):
        """Query GSI1 by date_partition for time-series data"""
        # Write multiple summary records for same date
        job_ids = ['test-job-1', 'test-job-2', 'test-job-3']
        
        for job_id in job_ids:
            write_generation_metrics(
                job_id=job_id,
                metrics_data=sample_metrics_data,
                record_type='summary',
            )
        
        # Query GSI1 by date_partition (today's date)
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        response = dynamodb_table.query(
            IndexName='date-partition-timestamp-index',
            KeyConditionExpression='date_partition = :date',
            ExpressionAttributeValues={':date': today},
        )
        
        # Should have at least 3 summary records
        assert len(response['Items']) >= 3
        
        # Verify all have correct date_partition
        for item in response['Items']:
            assert item['date_partition'] == today
            assert 'timestamp' in item
        
        # Verify items are sorted by timestamp (ascending by default)
        timestamps = [item['timestamp'] for item in response['Items']]
        assert timestamps == sorted(timestamps)
    
    @mock_aws
    def test_gsi2_summary_aggregation_query(self, dynamodb_table, sample_metrics_data):
        """Query GSI2 by date_partition for summary records only"""
        # Write summary and iteration records
        job_id = 'test-job-4'
        
        # Write summary
        summary_result = write_generation_metrics(
            job_id=job_id,
            metrics_data=sample_metrics_data,
            record_type='summary',
        )
        
        # Write 2 iterations
        for iteration in range(2):
            write_iteration_metrics(
                job_id=job_id,
                iteration=iteration,
                iteration_data=sample_metrics_data,
            )
        
        # Query GSI2 by date_partition, filter to summary records only
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        response = dynamodb_table.query(
            IndexName='date-partition-record-type-index',
            KeyConditionExpression='date_partition = :date AND begins_with(record_type_timestamp, :summary_prefix)',
            ExpressionAttributeValues={
                ':date': today,
                ':summary_prefix': 'summary#',
            },
        )
        
        # Should have exactly 1 summary record
        assert len(response['Items']) == 1
        
        # Verify it's a summary record
        assert response['Items'][0]['record_type'] == 'summary'
        assert response['Items'][0]['date_partition'] == today


class TestValidation:
    """Tests for validation"""
    
    @mock_aws
    def test_validation_error_invalid_conference(self, dynamodb_table, sample_metrics_data):
        """Validation error for invalid conference"""
        sample_metrics_data['conference'] = 'invalid'
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid conference' in str(exc_info.value)
        
        # Verify nothing was written to DynamoDB
        response = dynamodb_table.query(
            KeyConditionExpression='job_id = :job_id',
            ExpressionAttributeValues={':job_id': 'test-job-id'},
        )
        assert len(response['Items']) == 0
    
    @mock_aws
    def test_validation_error_invalid_evaluator_top_3(self, dynamodb_table, sample_metrics_data):
        """Validation error for invalid evaluator top_3"""
        sample_metrics_data['evaluator_result']['top_3'] = ['invalid', 'reinvent', 'kubecon']
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid evaluator top_3' in str(exc_info.value)
    
    @mock_aws
    def test_validation_error_invalid_user_intent(self, dynamodb_table, sample_metrics_data):
        """Validation error for invalid user_intent"""
        sample_metrics_data['user_intent'] = 'invalid'
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid user_intent' in str(exc_info.value)
    
    @mock_aws
    def test_validation_error_invalid_total_iterations(self, dynamodb_table, sample_metrics_data):
        """Validation error for invalid total_iterations"""
        sample_metrics_data['total_iterations'] = 6
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid total_iterations' in str(exc_info.value)
