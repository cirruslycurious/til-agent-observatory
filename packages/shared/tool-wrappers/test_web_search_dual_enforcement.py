"""
Unit Tests for Dual Budget Enforcement
Story 4.2: Minimal Tool Mode Enforcement

Test dual budget enforcement (job-scoped + per-instance) in web_search wrapper.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError
from datetime import datetime, timezone
import boto3
from moto import mock_aws

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from web_search import (
    reserve_job_scoped_budget_atomically,
    reserve_per_instance_budget_atomically,
    web_search,
    WEB_SEARCH_LIMIT,
)

# Import budget service for mocking
sys.path.append(str(Path(__file__).parent.parent / 'budget-service'))
import budget_client

# Import decision events for mocking
sys.path.append(str(Path(__file__).parent.parent / 'decision-events'))
import event_logger

REGION = 'us-east-1'
JOB_BUDGETS_TABLE_NAME = 'til-job-budgets-test'
WEB_SEARCH_GUARDRAILS_TABLE_NAME = 'til-web-search-guardrails-test'


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials"""
    import os
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = REGION
    yield
    # Cleanup
    for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECURITY_TOKEN', 'AWS_SESSION_TOKEN']:
        if key in os.environ:
            del os.environ[key]


@pytest.fixture
def aws_mock(aws_credentials):
    """Create mock AWS environment (DynamoDB)"""
    with mock_aws():
        # Create DynamoDB tables
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        
        # job_budgets table
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
        
        # web_search_guardrails table
        guardrails_table = dynamodb.create_table(
            TableName=WEB_SEARCH_GUARDRAILS_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'guardrail_key', 'KeyType': 'HASH'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'guardrail_key', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        guardrails_table.wait_until_exists()
        
        # Patch module-level table references
        with patch('web_search.job_budgets_table', new=budgets_table), \
             patch('web_search.guardrails_table', new=guardrails_table), \
             patch('budget_client.job_budgets_table', new=budgets_table):
            # Reload modules to pick up mocked tables
            import importlib
            import web_search
            importlib.reload(web_search)
            
            yield {
                'budgets_table': budgets_table,
                'guardrails_table': guardrails_table,
            }


@pytest.fixture
def test_job_budget(aws_mock):
    """Create a test job budget"""
    budgets_table = aws_mock['budgets_table']
    job_id = 'test-job-123'
    
    budgets_table.put_item(
        Item={
            'job_id': job_id,
            'web_search_count': 0,
            'web_search_limit': 10,
            'estimated_cost_cents': 0,
            'minimal_mode_activated': False,
            'tokens_used': 0,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'job_created_at': datetime.now(timezone.utc).isoformat(),
        }
    )
    
    return job_id


class TestReserveJobScopedBudgetAtomically:
    """Test job-scoped budget reservation"""
    
    def test_successful_reservation(self, aws_mock, test_job_budget):
        """Test successful job-scoped reservation"""
        result = reserve_job_scoped_budget_atomically(test_job_budget)
        
        assert result['success'] is True
        assert result['web_search_count'] == 1
        assert result['web_search_limit'] == 10
        assert result['searches_remaining'] == 9
        assert result['minimal_mode_activated'] is False
        
        # Verify count was incremented
        budgets_table = aws_mock['budgets_table']
        item = budgets_table.get_item(Key={'job_id': test_job_budget})['Item']
        assert item['web_search_count'] == 1
    
    def test_job_limit_exceeded(self, aws_mock, test_job_budget):
        """Test job-scoped limit exceeded"""
        budgets_table = aws_mock['budgets_table']
        
        # Set count to limit
        budgets_table.update_item(
            Key={'job_id': test_job_budget},
            UpdateExpression='SET web_search_count = :limit',
            ExpressionAttributeValues={':limit': 10}
        )
        
        result = reserve_job_scoped_budget_atomically(test_job_budget)
        
        assert result['success'] is False
        assert result['web_search_count'] == 10
        assert result['web_search_limit'] == 10
        assert result['searches_remaining'] == 0
        assert result['reason'] == 'job_limit_exceeded'
        assert 'error' in result
    
    def test_minimal_mode_enforcement(self, aws_mock, test_job_budget):
        """Test minimal mode enforcement (limit = 2, count >= limit)"""
        budgets_table = aws_mock['budgets_table']
        
        # Activate minimal mode and set count to limit
        budgets_table.update_item(
            Key={'job_id': test_job_budget},
            UpdateExpression='SET minimal_mode_activated = :true, web_search_limit = :limit, web_search_count = :limit',
            ExpressionAttributeValues={
                ':true': True,
                ':limit': 2
            }
        )
        
        result = reserve_job_scoped_budget_atomically(test_job_budget)
        
        assert result['success'] is False
        assert result['web_search_count'] == 2
        assert result['web_search_limit'] == 2
        assert result['minimal_mode_activated'] is True
        assert result['reason'] == 'minimal_mode'
        assert 'error' in result
    
    def test_job_not_found(self, aws_mock):
        """Test job budget not found"""
        result = reserve_job_scoped_budget_atomically('non-existent-job')
        
        assert result['success'] is False
        assert result['reason'] == 'job_not_found'
        assert 'error' in result
        assert 'not found' in result['error'].lower()


class TestReservePerInstanceBudgetAtomically:
    """Test per-instance budget reservation"""
    
    def test_successful_reservation(self, aws_mock):
        """Test successful per-instance reservation"""
        guardrail_key = 'job-123#0#evidence_researcher#sub-456'
        
        result = reserve_per_instance_budget_atomically(guardrail_key, WEB_SEARCH_LIMIT)
        
        assert result['success'] is True
        assert result['searches_used'] == 1
        assert result['limit'] == WEB_SEARCH_LIMIT
        
        # Verify count was incremented
        guardrails_table = aws_mock['guardrails_table']
        item = guardrails_table.get_item(Key={'guardrail_key': guardrail_key})['Item']
        assert item['web_search_count'] == 1
    
    def test_instance_limit_exceeded(self, aws_mock):
        """Test per-instance limit exceeded"""
        guardrail_key = 'job-123#0#evidence_researcher#sub-456'
        guardrails_table = aws_mock['guardrails_table']
        
        # Set count to limit
        guardrails_table.put_item(
            Item={
                'guardrail_key': guardrail_key,
                'web_search_count': 2,
                'web_search_limit': 2,
            }
        )
        
        result = reserve_per_instance_budget_atomically(guardrail_key, WEB_SEARCH_LIMIT)
        
        assert result['success'] is False
        assert result['searches_used'] == 2
        assert result['limit'] == WEB_SEARCH_LIMIT
        assert 'error' in result
        assert 'budget exceeded' in result['error'].lower()


class TestDualBudgetEnforcement:
    """Test dual budget enforcement in web_search function"""
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('web_search.log_decision_event')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_both_limits_pass_api_called(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_event,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job_budget
    ):
        """Test that API is called when both limits pass"""
        mock_get_cost.return_value = 0.002
        mock_tavily.return_value = {
            'results': [{'title': 'Result 1', 'url': 'http://example.com/1'}],
            'response_time': 1.2,
        }
        
        result = web_search(
            query='test query',
            job_id=test_job_budget,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify API was called
        assert mock_tavily.called
        
        # Verify cost increment was called after successful API call
        assert mock_increment_cost.called
        assert mock_increment_cost.call_args[0][0] == test_job_budget
        
        # Verify result structure
        assert 'results' in result
        assert result['results']['status'] == 'success'
        assert result['results']['api_called'] is True
        assert 'tool_call_record' in result
    
    @patch('web_search.log_tool_call')
    @patch('web_search.log_decision_event')
    def test_job_scoped_limit_fails_no_api_call(
        self,
        mock_log_event,
        mock_log_tool,
        aws_mock,
        test_job_budget
    ):
        """Test that API is NOT called when job-scoped limit fails"""
        budgets_table = aws_mock['budgets_table']
        
        # Set count to limit
        budgets_table.update_item(
            Key={'job_id': test_job_budget},
            UpdateExpression='SET web_search_count = :limit',
            ExpressionAttributeValues={':limit': 10}
        )
        
        result = web_search(
            query='test query',
            job_id=test_job_budget,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify structured error response
        assert result['results']['status'] == 'budget_exhausted'
        assert result['results']['job_scope_reserved'] is False
        assert result['results']['instance_scope_reserved'] is False
        assert result['results']['api_called'] is False
        assert 'reason' in result['results']
        assert result['results']['reason'] == 'job_limit_exceeded'
        
        # Verify cost_guardrail_triggered event was logged
        assert mock_log_event.called
        call_kwargs = mock_log_event.call_args[1]
        assert call_kwargs['event_type'] == 'cost_guardrail_triggered'
        
        # Verify tool call was logged with skipped status
        assert mock_log_tool.called
        tool_call_args = mock_log_tool.call_args[1]
        assert tool_call_args['success_status'] == 'skipped'
    
    @patch('web_search.log_tool_call')
    @patch('web_search.log_decision_event')
    def test_per_instance_limit_fails_job_scoped_not_refunded(
        self,
        mock_log_event,
        mock_log_tool,
        aws_mock,
        test_job_budget
    ):
        """Test that job-scoped reservation is NOT refunded when per-instance fails"""
        guardrails_table = aws_mock['guardrails_table']
        guardrail_key = f'{test_job_budget}#0#evidence_researcher#sub-456'
        
        # Set per-instance count to limit
        guardrails_table.put_item(
            Item={
                'guardrail_key': guardrail_key,
                'web_search_count': 2,
                'web_search_limit': 2,
            }
        )
        
        result = web_search(
            query='test query',
            job_id=test_job_budget,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify structured error response
        assert result['results']['status'] == 'budget_exhausted'
        assert result['results']['job_scope_reserved'] is True  # Job-scoped succeeded
        assert result['results']['instance_scope_reserved'] is False  # Per-instance failed
        assert result['results']['reason'] == 'instance_limit_exceeded'
        assert result['results']['api_called'] is False
        
        # Verify job-scoped count was incremented (NOT refunded)
        budgets_table = aws_mock['budgets_table']
        item = budgets_table.get_item(Key={'job_id': test_job_budget})['Item']
        assert item['web_search_count'] == 1  # Incremented, not refunded
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_failed_api_call_still_counts_toward_budget(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job_budget
    ):
        """Test that failed API calls still count toward budget"""
        mock_get_cost.return_value = 0.002
        mock_tavily.side_effect = Exception('API error')
        
        result = web_search(
            query='test query',
            job_id=test_job_budget,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify budgets were incremented BEFORE API call
        budgets_table = aws_mock['budgets_table']
        budget_item = budgets_table.get_item(Key={'job_id': test_job_budget})['Item']
        assert budget_item['web_search_count'] == 1  # Incremented
        
        guardrails_table = aws_mock['guardrails_table']
        guardrail_key = f'{test_job_budget}#0#evidence_researcher#sub-456'
        guardrail_item = guardrails_table.get_item(Key={'guardrail_key': guardrail_key})['Item']
        assert guardrail_item['web_search_count'] == 1  # Incremented
        
        # Verify cost increment was NOT called (API failed)
        assert not mock_increment_cost.called
        
        # Verify result shows error status
        assert result['results']['status'] == 'error'
        assert result['results']['api_called'] is True  # API was attempted
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_budget_counts_incremented_before_api_call(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job_budget
    ):
        """Test that budget counts are incremented BEFORE API call"""
        mock_get_cost.return_value = 0.002
        
        # Track when API is called vs when budgets are incremented
        api_called = {'value': False}
        budgets_checked = {'value': False}
        
        def check_budgets_before_api(*args, **kwargs):
            budgets_table = aws_mock['budgets_table']
            budget_item = budgets_table.get_item(Key={'job_id': test_job_budget})['Item']
            budgets_checked['value'] = True
            assert budget_item['web_search_count'] == 1  # Already incremented
            api_called['value'] = True
            return {
                'results': [{'title': 'Result 1', 'url': 'http://example.com/1'}],
                'response_time': 1.2,
            }
        
        mock_tavily.side_effect = check_budgets_before_api
        
        result = web_search(
            query='test query',
            job_id=test_job_budget,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify budgets were checked and incremented before API call
        assert budgets_checked['value'] is True
        assert api_called['value'] is True
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_minimal_mode_enforcement_blocks_search(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job_budget
    ):
        """Test that minimal mode blocks search when limit reached"""
        budgets_table = aws_mock['budgets_table']
        
        # Activate minimal mode and set count to limit
        budgets_table.update_item(
            Key={'job_id': test_job_budget},
            UpdateExpression='SET minimal_mode_activated = :true, web_search_limit = :limit, web_search_count = :limit',
            ExpressionAttributeValues={
                ':true': True,
                ':limit': 2
            }
        )
        
        result = web_search(
            query='test query',
            job_id=test_job_budget,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify API was NOT called
        assert not mock_tavily.called
        
        # Verify structured error response
        assert result['results']['status'] == 'budget_exhausted'
        assert result['results']['minimal_mode_activated'] is True
        assert result['results']['reason'] == 'minimal_mode'
        assert result['results']['api_called'] is False


class TestAtomicReservation:
    """Test atomic reservation prevents race conditions"""
    
    def test_concurrent_reservations_race_condition_prevented(
        self,
        aws_mock,
        test_job_budget
    ):
        """Test that atomic reservations prevent race conditions"""
        import threading
        
        results = []
        errors = []
        
        def attempt_reservation():
            try:
                result = reserve_job_scoped_budget_atomically(test_job_budget)
                results.append(result)
            except Exception as e:
                errors.append(e)
        
        # Create 5 threads trying to reserve simultaneously
        threads = [threading.Thread(target=attempt_reservation) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        # Verify only one succeeded (or multiple if limit allows)
        # With limit=10, all 5 should succeed
        successful = [r for r in results if r.get('success')]
        assert len(successful) <= 10  # Cannot exceed limit
        
        # Verify final count matches successful reservations
        budgets_table = aws_mock['budgets_table']
        item = budgets_table.get_item(Key={'job_id': test_job_budget})['Item']
        assert item['web_search_count'] == len(successful)
