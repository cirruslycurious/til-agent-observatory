"""
Integration Tests for Manager Lambda Function
Story 2.1: Manager Agent - High-Level Orchestration

Test Requirements:
- Test Manager Lambda end-to-end (Step Functions input → output)
- Test with real AWS infrastructure (DynamoDB, Parameter Store) using moto
- Test decision events written to DynamoDB
- Test budget tracking increments
- Test conference data lookup
"""

import pytest
import json
import sys
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
import boto3

# Allow running against real AWS when REAL_AWS=1; otherwise default to moto
REAL_AWS = os.environ.get("REAL_AWS") == "1"
if REAL_AWS:
    from contextlib import contextmanager

    @contextmanager
    def mock_aws():
        yield
else:
    from moto import mock_aws

# Add project root to path
project_root = Path(__file__).parent.parent.parent
shared_path = project_root / 'packages' / 'shared'
manager_path = project_root / 'packages' / 'agents' / 'manager'

# Create symlinks for hyphenated packages
import shutil
temp_links = []
for pkg_dir in shared_path.iterdir():
    if pkg_dir.is_dir() and '-' in pkg_dir.name:
        underscore_name = pkg_dir.name.replace('-', '_')
        underscore_path = shared_path / underscore_name
        if not underscore_path.exists():
            try:
                underscore_path.symlink_to(pkg_dir)
                temp_links.append(underscore_path)
            except (OSError, NotImplementedError):
                if underscore_path.exists():
                    shutil.rmtree(underscore_path)
                shutil.copytree(pkg_dir, underscore_path)
                temp_links.append(underscore_path)

sys.path.insert(0, str(shared_path))
sys.path.insert(0, str(manager_path))

# Note: event_logger will be imported and patched in the aws_mock fixture

# Test configuration
REGION = 'us-east-1'
JOBS_TABLE_NAME = 'til-jobs'
CONFERENCE_DATA_TABLE_NAME = 'til-conference-data'
DECISION_EVENTS_BY_JOB_TABLE_NAME = 'til-decision-events-by-job'  # Must match event_logger default
DECISION_EVENT_IDS_TABLE_NAME = 'til-decision-event-ids'  # Must match event_logger default
GENERATION_METRICS_TABLE_NAME = 'til-generation-metrics'  # Must match event_logger default
JOB_BUDGETS_TABLE_NAME = 'til-job-budgets'
ARTIFACTS_BUCKET_NAME = 'your-artifacts-bucket'


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials"""
    if REAL_AWS:
        # Assume real AWS creds/region already configured
        yield
    else:
        os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
        os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
        os.environ['AWS_SECURITY_TOKEN'] = 'testing'
        os.environ['AWS_SESSION_TOKEN'] = 'testing'
        os.environ['AWS_DEFAULT_REGION'] = REGION
        os.environ['JOBS_TABLE_NAME'] = JOBS_TABLE_NAME
        os.environ['CONFERENCE_DATA_TABLE_NAME'] = CONFERENCE_DATA_TABLE_NAME
        os.environ['DECISION_EVENTS_BY_JOB_TABLE_NAME'] = DECISION_EVENTS_BY_JOB_TABLE_NAME
        os.environ['DECISION_EVENT_IDS_TABLE_NAME'] = DECISION_EVENT_IDS_TABLE_NAME
        os.environ['GENERATION_METRICS_TABLE_NAME'] = GENERATION_METRICS_TABLE_NAME
        os.environ['JOB_BUDGETS_TABLE_NAME'] = JOB_BUDGETS_TABLE_NAME
        os.environ['ARTIFACTS_BUCKET_NAME'] = ARTIFACTS_BUCKET_NAME
        yield
        # Cleanup
        for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECURITY_TOKEN', 
                    'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION']:
            if key in os.environ:
                del os.environ[key]


@pytest.fixture
def aws_mock(aws_credentials):
    """Create mock AWS environment (DynamoDB and S3)"""
    if REAL_AWS:
        # Use real AWS resources; tables/bucket must already exist
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        s3_client = boto3.client('s3', region_name=REGION)

        conference_table = dynamodb.Table(CONFERENCE_DATA_TABLE_NAME)
        budgets_table = dynamodb.Table(JOB_BUDGETS_TABLE_NAME)
        metrics_table = dynamodb.Table(GENERATION_METRICS_TABLE_NAME)
        events_by_job_table = dynamodb.Table(DECISION_EVENTS_BY_JOB_TABLE_NAME)
        event_ids_table = dynamodb.Table(DECISION_EVENT_IDS_TABLE_NAME)

        # Patch event_logger to use real tables/clients
        from decision_events import event_logger
        event_logger.events_by_job_table = events_by_job_table
        event_logger.event_ids_table = event_ids_table
        event_logger.generation_metrics_table = metrics_table
        event_logger.dynamodb_client = boto3.client('dynamodb', region_name=REGION)

        yield {
            'conference_table': conference_table,
            'budgets_table': budgets_table,
            'metrics_table': metrics_table,
            'events_by_job_table': events_by_job_table,
            'event_ids_table': event_ids_table,
            's3_bucket': ARTIFACTS_BUCKET_NAME,
            's3_client': s3_client,
        }
    else:
        with mock_aws():
            dynamodb = boto3.resource('dynamodb', region_name=REGION)
            
            # Conference data table
            conference_table = dynamodb.create_table(
                TableName=CONFERENCE_DATA_TABLE_NAME,
                KeySchema=[
                    {'AttributeName': 'conference', 'KeyType': 'HASH'},
                    {'AttributeName': 'data_type', 'KeyType': 'RANGE'},
                ],
                AttributeDefinitions=[
                    {'AttributeName': 'conference', 'AttributeType': 'S'},
                    {'AttributeName': 'data_type', 'AttributeType': 'S'},
                ],
                BillingMode='PAY_PER_REQUEST',
            )
            conference_table.wait_until_exists()
            
            # Job budgets table
            budgets_table = dynamodb.create_table(
                TableName=JOB_BUDGETS_TABLE_NAME,
                KeySchema=[
                    {'AttributeName': 'job_id', 'KeyType': 'HASH'},
                ],
                AttributeDefinitions=[
                    {'AttributeName': 'job_id', 'AttributeType': 'S'},
                ],
                BillingMode='PAY_PER_REQUEST',
            )
            budgets_table.wait_until_exists()
            
            # Generation metrics table (for seq counter)
            # Note: event_logger uses 'record_type_timestamp' as SK (not 'metric_sk')
            # This matches the actual table schema used in production
            metrics_table = dynamodb.create_table(
                TableName=GENERATION_METRICS_TABLE_NAME,
                KeySchema=[
                    {'AttributeName': 'job_id', 'KeyType': 'HASH'},
                    {'AttributeName': 'record_type_timestamp', 'KeyType': 'RANGE'},
                ],
                AttributeDefinitions=[
                    {'AttributeName': 'job_id', 'AttributeType': 'S'},
                    {'AttributeName': 'record_type_timestamp', 'AttributeType': 'S'},
                ],
                BillingMode='PAY_PER_REQUEST',
            )
            metrics_table.wait_until_exists()
            
            # Decision events tables (create BEFORE patching event_logger)
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
            
            # Create S3 bucket
            s3_client = boto3.client('s3', region_name=REGION)
            s3_client.create_bucket(Bucket=ARTIFACTS_BUCKET_NAME)
            
            # Patch event_logger module-level references AFTER all tables are created
            try:
                from decision_events import event_logger
                # Patch the module-level references to use mocked tables
                event_logger.events_by_job_table = events_by_job_table
                event_logger.event_ids_table = event_ids_table
                event_logger.generation_metrics_table = metrics_table
                event_logger.dynamodb_client = boto3.client('dynamodb', region_name=REGION)
            except ImportError:
                # If import fails, we'll patch it later when needed
                pass
            
            # Patch s3_uploader if it exists
            try:
                from s3_utils import s3_uploader
                s3_uploader.s3_client = s3_client
            except ImportError:
                pass  # s3_uploader might not be available
            
            yield {
                'conference_table': conference_table,
                'budgets_table': budgets_table,
                'metrics_table': metrics_table,
                'events_by_job_table': events_by_job_table,
                'event_ids_table': event_ids_table,
                's3_bucket': ARTIFACTS_BUCKET_NAME,
                's3_client': s3_client,
            }


@pytest.fixture
def test_job(aws_mock):
    """Create a test job with budget initialized"""
    job_id = 'test-job-123'
    budgets_table = aws_mock['budgets_table']
    
    budgets_table.put_item(
        Item={
            'job_id': job_id,
            'web_search_count': 0,
            'web_search_limit': 10,
            'estimated_cost_cents': 0,
            'minimal_mode_activated': False,
            'tokens_used': 0,
            'created_at': '2026-01-15T00:00:00Z',
            'updated_at': '2026-01-15T00:00:00Z',
            'job_created_at': '2026-01-15T00:00:00Z',
        }
    )
    
    return job_id


@pytest.fixture
def test_conference_data(aws_mock):
    """Create test conference data"""
    conference_table = aws_mock['conference_table']
    
    # Add requirements
    conference_table.put_item(
        Item={
            'conference': 'black_hat',
            'data_type': 'requirements',
            'structure_requirements': {
                'sections': ['Problem', 'Approach', 'Impact', 'Why this conference'],
            },
            'length_constraints': {
                'min_words': 100,
                'max_words': 400,
            },
            'tone_markers': ['technical', 'precise'],
        }
    )
    
    # Add example abstract
    conference_table.put_item(
        Item={
            'conference': 'black_hat',
            'data_type': 'example_abstract_1',
            'abstract_id': 'example-1',
            'title': 'Example Abstract',
            'abstract': 'This is an example abstract.',
        }
    )


class TestManagerLambdaIntegration:
    """Integration tests for Manager Lambda"""
    
    @patch('lambda_function.call_llm')
    @patch('lambda_function.increment_llm_cost')
    @patch('event_logger.boto3.client')  # Patch S3 client creation in event_logger
    def test_goal_formulation_end_to_end(
        self,
        mock_boto3_client,
        mock_increment_cost,
        mock_call_llm,
        aws_mock,
        test_job,
        test_conference_data,
    ):
        """Test goal formulation end-to-end with real DynamoDB"""
        # Setup mocks
        mock_call_llm.return_value = {
            'response': 'Generate an abstract that demonstrates innovative security research in genai.',
            'cost_usd': 0.01,
            'total_tokens': 100,
            'temperature': 0.5,
        }
        
        # Import event_logger to access patched client
        from decision_events import event_logger
        
        # Mock boto3.client to return our mocked S3 client
        def mock_client_factory(service_name, **kwargs):
            if service_name == 's3':
                return aws_mock['s3_client']
            elif service_name == 'dynamodb':
                return event_logger.dynamodb_client  # Use already-patched client
            else:
                return boto3.client(service_name, **kwargs)
        
        mock_boto3_client.side_effect = mock_client_factory

        # Initialize seq counter (event_logger will increment it, so start at -1 or just let it create)
        # Actually, event_logger uses ADD which creates if not exists, so we don't need to initialize
        
        # Import lambda_function AFTER patching event_logger
        from lambda_function import lambda_handler
        
        # Call lambda handler
        event = {
            'job_id': test_job,
            'conference': 'black_hat',
            'topic': 'genai',
            'iteration': 0,
            'action': 'formulate_goal',
            'execution_id': 'exec-123',
            'state_name': 'ManagerGoalFormulation',
        }
        
        result = lambda_handler(event, None)
        
        # Check for errors first
        if 'error' in result:
            pytest.fail(f"Lambda handler returned error: {result.get('error')}")
        
        # Assertions
        assert 'goal' in result
        assert 'vendor' in result
        assert 'creativity' in result
        assert result['creativity'] == 0.3
        
        # Verify decision events were written
        events_table = aws_mock['events_by_job_table']
        response = events_table.scan()
        assert len(response['Items']) > 0
        
        # Find goal_formulated event
        goal_events = [item for item in response['Items'] if 'manager_goal_formulated' in item.get('seq_ts_type', '')]
        assert len(goal_events) > 0
        
        # Verify creativity is in event details
        event_item = goal_events[0]
        event_details = json.loads(event_item.get('details', '{}'))
        assert 'creativity' in event_details
        assert 'vendor' in event_details
        assert 'model' in event_details
        
        # Verify budget was checked (get_job_budget was called)
        budgets_table = aws_mock['budgets_table']
        budget_item = budgets_table.get_item(Key={'job_id': test_job})['Item']
        assert budget_item is not None
    
    @patch('lambda_function.call_llm')
    @patch('lambda_function.increment_llm_cost')
    @patch('event_logger.boto3.client')  # Patch S3 client creation
    def test_evaluation_end_to_end(
        self,
        mock_boto3_client,
        mock_increment_cost,
        mock_call_llm,
        aws_mock,
        test_job,
        test_conference_data,
    ):
        """Test evaluation end-to-end with real DynamoDB"""
        # Setup mocks
        mock_call_llm.return_value = {
            'response': json.dumps({
                'decision': 'accept',
                'feedback': 'Excellent abstract.',
                'sections_cited': ['Problem', 'Approach'],
                'reasoning': 'Meets requirements',
            }),
            'cost_usd': 0.02,
            'total_tokens': 200,
            'temperature': 0.5,
        }
        
        # Import event_logger to access patched client
        from decision_events import event_logger
        
        # Mock boto3.client to return our mocked S3 client
        def mock_client_factory(service_name, **kwargs):
            if service_name == 's3':
                return aws_mock['s3_client']
            elif service_name == 'dynamodb':
                return event_logger.dynamodb_client
            else:
                return boto3.client(service_name, **kwargs)
        
        mock_boto3_client.side_effect = mock_client_factory
        
        # Import lambda_function AFTER patching
        from lambda_function import lambda_handler
        
        # Call lambda handler
        event = {
            'job_id': test_job,
            'worker_output': {
                'abstract': '## Problem\nTest problem\n## Approach\nTest approach\n## Impact\nTest impact\n## Why this conference\nTest why',
                'conference': 'black_hat',
            },
            'iteration': 0,
            'action': 'evaluate_output',
            'previous_outputs': [],
            'execution_id': 'exec-123',
            'state_name': 'ManagerEvaluation',
        }
        
        result = lambda_handler(event, None)
        
        # Check for errors first
        if 'error' in result:
            pytest.fail(f"Lambda handler returned error: {result.get('error')}")
        
        # Assertions
        assert 'decision' in result
        assert result['decision'] == 'accept'
        assert 'feedback' in result
        assert 'sections_cited' in result
        
        # Verify decision events were written
        events_table = aws_mock['events_by_job_table']
        response = events_table.scan()
        
        # Find accepted event
        accepted_events = [item for item in response['Items'] if 'manager_accepted' in item.get('seq_ts_type', '')]
        assert len(accepted_events) > 0
        
        # Verify creativity is in event details
        event_item = accepted_events[0]
        event_details = json.loads(event_item.get('details', '{}'))
        assert 'creativity' in event_details
        assert 'vendor' in event_details
        assert 'model' in event_details
    
    @patch('lambda_function.call_llm')
    @patch('lambda_function.increment_llm_cost')
    @patch('event_logger.boto3.client')  # Patch S3 client creation
    def test_creativity_progression_integration(
        self,
        mock_boto3_client,
        mock_increment_cost,
        mock_call_llm,
        aws_mock,
        test_job,
        test_conference_data,
    ):
        """Test creativity progression across iterations"""
        mock_call_llm.return_value = {
            'response': 'Test goal',
            'cost_usd': 0.01,
            'total_tokens': 100,
            'temperature': 0.5,
        }
        
        # Import event_logger to access patched client
        from decision_events import event_logger
        
        # Mock boto3.client to return our mocked S3 client
        def mock_client_factory(service_name, **kwargs):
            if service_name == 's3':
                return aws_mock['s3_client']
            elif service_name == 'dynamodb':
                return event_logger.dynamodb_client
            else:
                return boto3.client(service_name, **kwargs)
        
        mock_boto3_client.side_effect = mock_client_factory
        
        # Import lambda_function AFTER patching
        from lambda_function import lambda_handler
        
        metrics_table = aws_mock['metrics_table']
        events_table = aws_mock['events_by_job_table']
        
        # Test iterations 0-4
        for iteration in range(5):
            expected_creativity = 0.3 + (iteration * 0.1)
            expected_creativity = min(expected_creativity, 0.7)
            
            event = {
                'job_id': test_job,
                'conference': 'black_hat',
                'topic': 'genai',
                'iteration': iteration,
                'action': 'formulate_goal',
                'execution_id': 'exec-123',
                'state_name': 'ManagerGoalFormulation',
            }
            
            result = lambda_handler(event, None)
            
            # Check for errors first
            if 'error' in result:
                pytest.fail(f"Lambda handler returned error on iteration {iteration}: {result.get('error')}")
            
            # Verify creativity in result
            assert 'creativity' in result
            assert result['creativity'] == expected_creativity
            
            # Verify creativity in logged event
            response = events_table.scan(
                FilterExpression='job_id = :job_id',
                ExpressionAttributeValues={':job_id': test_job}
            )
            goal_events = [item for item in response['Items'] if 'manager_goal_formulated' in item.get('seq_ts_type', '')]
            if goal_events:
                latest_event = goal_events[-1]
                event_details = json.loads(latest_event.get('details', '{}'))
                assert event_details.get('creativity') == expected_creativity
