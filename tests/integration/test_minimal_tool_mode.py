"""
Integration Tests for Minimal Tool Mode Enforcement
Story 4.2: Minimal Tool Mode Enforcement

Tests dual budget enforcement, minimal mode activation, and cost_guardrail_triggered events.
"""

import pytest
import boto3
import os
from moto import mock_aws
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent / 'packages' / 'shared' / 'tool-wrappers'))
from web_search import web_search, WEB_SEARCH_LIMIT

sys.path.append(str(Path(__file__).parent.parent.parent / 'packages' / 'shared' / 'budget-service'))
from budget_client import (
    initialize_job_budget,
    increment_llm_cost,
    get_job_budget,
    MINIMAL_MODE_THRESHOLD_CENTS,
    MINIMAL_WEB_SEARCH_LIMIT,
)

# Set environment variables
REGION = 'us-east-1'
JOB_BUDGETS_TABLE_NAME = 'til-job-budgets-test'
WEB_SEARCH_GUARDRAILS_TABLE_NAME = 'til-web-search-guardrails-test'
os.environ['JOB_BUDGETS_TABLE_NAME'] = JOB_BUDGETS_TABLE_NAME
os.environ['WEB_SEARCH_GUARDRAILS_TABLE_NAME'] = WEB_SEARCH_GUARDRAILS_TABLE_NAME
os.environ['AWS_REGION'] = REGION


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials"""
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
            import budget_client
            importlib.reload(web_search)
            importlib.reload(budget_client)
            
            yield {
                'budgets_table': budgets_table,
                'guardrails_table': guardrails_table,
            }


@pytest.fixture
def test_job(aws_mock):
    """Create a test job with budget initialized"""
    job_id = 'integration-job-123'
    initialize_job_budget(job_id)
    return job_id


class TestMinimalModeActivationTriggersEnforcement:
    """Test that minimal mode activation triggers enforcement"""
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('web_search.log_decision_event')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_minimal_mode_activation_blocks_search(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_event,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job
    ):
        """Test that minimal mode activation (cost > $5) triggers enforcement"""
        # Increment cost to trigger minimal mode (501 cents = $5.01)
        increment_llm_cost(
            job_id=test_job,
            cost_usd=5.01,  # Exceeds $5 threshold
            tokens=1000,
        )
        
        # Verify minimal mode was activated
        budget = get_job_budget(test_job)
        assert budget['minimal_mode_activated'] is True
        assert budget['web_search_limit'] == MINIMAL_WEB_SEARCH_LIMIT  # 2
        
        # Set web_search_count to limit (2)
        budgets_table = aws_mock['budgets_table']
        budgets_table.update_item(
            Key={'job_id': test_job},
            UpdateExpression='SET web_search_count = :limit',
            ExpressionAttributeValues={':limit': 2}
        )
        
        # Attempt web search - should be blocked
        result = web_search(
            query='test query',
            job_id=test_job,
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
        
        # Verify cost_guardrail_triggered event was logged
        assert mock_log_event.called
        call_kwargs = mock_log_event.call_args[1]
        assert call_kwargs['event_type'] == 'cost_guardrail_triggered'


class TestDualLimitEnforcement:
    """Test that both job-scoped and per-instance limits are enforced"""
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('web_search.log_decision_event')
    def test_both_limits_must_pass(
        self,
        mock_log_event,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job
    ):
        """Test that both limits must pass for search to proceed"""
        # Job-scoped limit: OK (count < limit)
        # Per-instance limit: EXCEEDED (count >= limit)
        guardrails_table = aws_mock['guardrails_table']
        guardrail_key = f'{test_job}#0#evidence_researcher#sub-456'
        
        guardrails_table.put_item(
            Item={
                'guardrail_key': guardrail_key,
                'web_search_count': 2,  # At limit
                'web_search_limit': 2,
            }
        )
        
        result = web_search(
            query='test query',
            job_id=test_job,
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
        assert result['results']['job_scope_reserved'] is True  # Job-scoped succeeded
        assert result['results']['instance_scope_reserved'] is False  # Per-instance failed
        assert result['results']['reason'] == 'instance_limit_exceeded'
        
        # Verify job-scoped count was incremented (NOT refunded)
        budgets_table = aws_mock['budgets_table']
        item = budgets_table.get_item(Key={'job_id': test_job})['Item']
        assert item['web_search_count'] == 1  # Incremented, not refunded
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_both_limits_pass_search_succeeds(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job
    ):
        """Test that search succeeds when both limits pass"""
        mock_get_cost.return_value = 0.002
        mock_tavily.return_value = {
            'results': [{'title': 'Result 1', 'url': 'http://example.com/1'}],
            'response_time': 1.2,
        }
        
        result = web_search(
            query='test query',
            job_id=test_job,
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
        
        # Verify cost increment was called
        assert mock_increment_cost.called
        
        # Verify result structure
        assert result['results']['status'] == 'success'
        assert result['results']['api_called'] is True
        
        # Verify both budgets were incremented
        budgets_table = aws_mock['budgets_table']
        budget_item = budgets_table.get_item(Key={'job_id': test_job})['Item']
        assert budget_item['web_search_count'] == 1
        
        guardrails_table = aws_mock['guardrails_table']
        guardrail_key = f'{test_job}#0#evidence_researcher#sub-456'
        guardrail_item = guardrails_table.get_item(Key={'guardrail_key': guardrail_key})['Item']
        assert guardrail_item['web_search_count'] == 1


class TestCostGuardrailTriggeredEvent:
    """Test cost_guardrail_triggered event emission"""
    
    @patch('web_search.log_decision_event')
    def test_job_scoped_limit_exceeded_emits_event(
        self,
        mock_log_event,
        aws_mock,
        test_job
    ):
        """Test that job-scoped limit exceeded emits cost_guardrail_triggered event"""
        budgets_table = aws_mock['budgets_table']
        
        # Set count to limit
        budgets_table.update_item(
            Key={'job_id': test_job},
            UpdateExpression='SET web_search_count = :limit',
            ExpressionAttributeValues={':limit': 10}
        )
        
        result = web_search(
            query='test query',
            job_id=test_job,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify cost_guardrail_triggered event was logged
        assert mock_log_event.called
        call_kwargs = mock_log_event.call_args[1]
        assert call_kwargs['event_type'] == 'cost_guardrail_triggered'
        assert 'job_id' in call_kwargs['details']
        assert call_kwargs['details']['job_scope_reserved'] is False
        assert call_kwargs['details']['instance_scope_reserved'] is False
    
    @patch('web_search.log_decision_event')
    def test_per_instance_limit_exceeded_emits_event(
        self,
        mock_log_event,
        aws_mock,
        test_job
    ):
        """Test that per-instance limit exceeded emits cost_guardrail_triggered event"""
        guardrails_table = aws_mock['guardrails_table']
        guardrail_key = f'{test_job}#0#evidence_researcher#sub-456'
        
        guardrails_table.put_item(
            Item={
                'guardrail_key': guardrail_key,
                'web_search_count': 2,
                'web_search_limit': 2,
            }
        )
        
        result = web_search(
            query='test query',
            job_id=test_job,
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify cost_guardrail_triggered event was logged
        assert mock_log_event.called
        call_kwargs = mock_log_event.call_args[1]
        assert call_kwargs['event_type'] == 'cost_guardrail_triggered'
        assert 'guardrail_key' in call_kwargs['details']
        assert call_kwargs['details']['job_scope_reserved'] is True
        assert call_kwargs['details']['instance_scope_reserved'] is False


class TestBudgetCountsBeforeApiCall:
    """Test that budget counts are incremented BEFORE API call"""
    
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('budget_client.increment_web_search_cost')
    @patch('budget_client.get_web_search_cost_usd')
    def test_budgets_incremented_before_api_call(
        self,
        mock_get_cost,
        mock_increment_cost,
        mock_log_tool,
        mock_tavily,
        aws_mock,
        test_job
    ):
        """Test that budgets are incremented BEFORE API call"""
        mock_get_cost.return_value = 0.002
        
        # Track when budgets are checked
        budgets_checked = {'value': False}
        
        def check_budgets(*args, **kwargs):
            budgets_table = aws_mock['budgets_table']
            budget_item = budgets_table.get_item(Key={'job_id': test_job})['Item']
            assert budget_item['web_search_count'] == 1  # Already incremented
            budgets_checked['value'] = True
            return {
                'results': [{'title': 'Result 1', 'url': 'http://example.com/1'}],
                'response_time': 1.2,
            }
        
        mock_tavily.side_effect = check_budgets
        
        result = web_search(
            query='test query',
            job_id=test_job,
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
        assert result['results']['status'] == 'success'
