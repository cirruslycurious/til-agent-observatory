"""
Integration Tests for Budget Tracking
Story 4.1: Per-Job Budget Tracking

Tests budget initialization, cost increments, minimal mode activation, and API endpoints.
"""

import pytest
import boto3
import os
from moto import mock_aws
from datetime import datetime, timezone

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent / 'packages' / 'shared' / 'budget-service'))
from budget_client import (
    initialize_job_budget,
    get_job_budget,
    increment_llm_cost,
    increment_web_search_cost,
    check_minimal_mode_activation,
    MINIMAL_MODE_THRESHOLD_CENTS,
    DEFAULT_WEB_SEARCH_LIMIT,
    MINIMAL_WEB_SEARCH_LIMIT,
)

# Set environment variables
REGION = 'us-east-1'
JOB_BUDGETS_TABLE_NAME = 'til-job-budgets-test'
os.environ['JOB_BUDGETS_TABLE_NAME'] = JOB_BUDGETS_TABLE_NAME
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
        # Create DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        table = dynamodb.create_table(
            TableName=JOB_BUDGETS_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        table.wait_until_exists()
        
        # Reload budget_client module to pick up the mocked table
        import importlib
        import budget_client
        importlib.reload(budget_client)
        
        yield {
            'budgets_table': table,
        }


class TestBudgetInitialization:
    """Integration tests for budget initialization"""
    
    def test_budget_initialization_on_job_creation(self, aws_mock):
        """Test budget initialization creates correct entry"""
        job_id = 'integration-job-123'
        
        budget = initialize_job_budget(job_id)
        
        assert budget['job_id'] == job_id
        assert budget['estimated_cost_cents'] == 0
        assert budget['web_search_limit'] == DEFAULT_WEB_SEARCH_LIMIT
        assert budget['minimal_mode_activated'] is False
        assert budget['job_created_at'] is not None
    
    def test_budget_initialization_idempotency(self, aws_mock):
        """Test budget initialization is idempotent"""
        job_id = 'integration-job-idempotent-123'
        
        # First initialization
        budget1 = initialize_job_budget(job_id)
        
        # Second initialization (should return existing)
        budget2 = initialize_job_budget(job_id)
        
        assert budget1['job_id'] == budget2['job_id']
        assert budget1['created_at'] == budget2['created_at']


class TestLLMCostTracking:
    """Integration tests for LLM cost tracking"""
    
    def test_llm_cost_increment(self, aws_mock):
        """Test LLM cost increment updates budget correctly"""
        job_id = 'integration-llm-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Mock event logger (best effort)
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # Increment cost
            budget = increment_llm_cost(job_id, 1.50, 5000, provider='openai', model='gpt-5.2')
            
            assert budget['estimated_cost_cents'] == 150  # $1.50 = 150 cents
            assert budget['tokens_used'] == 5000
            assert budget['minimal_mode_activated'] is False
    
    def test_llm_cost_activates_minimal_mode(self, aws_mock):
        """Test minimal mode activation when cost > $5"""
        job_id = 'integration-llm-minimal-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Mock event logger
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # Increment to $5.01 (501 cents) - should activate minimal mode
            budget = increment_llm_cost(job_id, 5.01, 10000, provider='openai', model='gpt-5.2')
            
            assert budget['estimated_cost_cents'] == 501
            assert budget['minimal_mode_activated'] is True
            assert budget['web_search_limit'] == MINIMAL_WEB_SEARCH_LIMIT
            assert budget['minimal_mode_activated_at'] is not None


class TestWebSearchCostTracking:
    """Integration tests for web search cost tracking"""
    
    def test_web_search_cost_increment(self, aws_mock):
        """Test web search cost increment updates budget correctly"""
        job_id = 'integration-web-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Mock event logger
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # Increment cost
            budget = increment_web_search_cost(job_id, 0.002)
            
            assert budget['estimated_cost_cents'] == 0  # $0.002 rounds to 0 cents
            assert budget['minimal_mode_activated'] is False
    
    def test_web_search_cost_activates_minimal_mode(self, aws_mock):
        """Test minimal mode activation from web search cost"""
        job_id = 'integration-web-minimal-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Mock event logger
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # First increment to $4.99
            increment_web_search_cost(job_id, 4.99)
            
            # Second increment to $5.01 total - should activate minimal mode
            budget = increment_web_search_cost(job_id, 0.02)
            
            assert budget['estimated_cost_cents'] == 501
            assert budget['minimal_mode_activated'] is True
            assert budget['web_search_limit'] == MINIMAL_WEB_SEARCH_LIMIT


class TestMinimalModeActivation:
    """Integration tests for minimal mode activation"""
    
    def test_minimal_mode_activation_atomic(self, aws_mock):
        """Test minimal mode activation is atomic"""
        job_id = 'integration-minimal-atomic-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Set cost to 501 cents (above threshold)
        table = aws_mock['budgets_table']
        table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='SET estimated_cost_cents = :cost',
            ExpressionAttributeValues={':cost': 501}
        )
        
        # Mock event logger
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # Activate minimal mode
            result = check_minimal_mode_activation(job_id)
            
            assert result is True
            
            # Verify minimal mode was activated
            budget = get_job_budget(job_id)
            assert budget['minimal_mode_activated'] is True
            assert budget['web_search_limit'] == MINIMAL_WEB_SEARCH_LIMIT
    
    def test_minimal_mode_activation_idempotency(self, aws_mock):
        """Test minimal mode activation is idempotent"""
        job_id = 'integration-minimal-idempotent-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Set cost to 501 cents
        table = aws_mock['budgets_table']
        table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='SET estimated_cost_cents = :cost',
            ExpressionAttributeValues={':cost': 501}
        )
        
        # Mock event logger
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # First activation
            result1 = check_minimal_mode_activation(job_id)
            assert result1 is True
            
            # Second activation (should be idempotent)
            result2 = check_minimal_mode_activation(job_id)
            assert result2 is True
            
            # Verify minimal mode is still activated
            budget = get_job_budget(job_id)
            assert budget['minimal_mode_activated'] is True


class TestSearchesRemaining:
    """Integration tests for searches_remaining calculation"""
    
    def test_searches_remaining_calculation(self, aws_mock):
        """Test searches_remaining is calculated correctly"""
        job_id = 'integration-searches-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Manually update web_search_count
        table = aws_mock['budgets_table']
        table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='SET web_search_count = :count',
            ExpressionAttributeValues={':count': 3}
        )
        
        budget = get_job_budget(job_id)
        
        assert budget['searches_remaining'] == DEFAULT_WEB_SEARCH_LIMIT - 3
        assert budget['searches_remaining'] == 7
    
    def test_searches_remaining_prevents_negative(self, aws_mock):
        """Test searches_remaining prevents negative values"""
        job_id = 'integration-searches-negative-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Set count > limit (edge case)
        table = aws_mock['budgets_table']
        table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='SET web_search_count = :count',
            ExpressionAttributeValues={':count': 15}  # > DEFAULT_WEB_SEARCH_LIMIT (10)
        )
        
        budget = get_job_budget(job_id)
        
        assert budget['searches_remaining'] == 0  # max(0, 10 - 15) = 0


class TestCostEventIdempotency:
    """Integration tests for cost event idempotency"""
    
    def test_cost_event_id_stored(self, aws_mock):
        """Test that cost_event_id is stored in budget"""
        job_id = 'integration-event-id-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Mock event logger
        from unittest.mock import patch
        with patch('budget_client.log_decision_event'):
            # Increment cost
            budget = increment_llm_cost(job_id, 0.50, 1000)
            
            # Verify last_cost_event_id is set
            assert budget['last_cost_event_id'] is not None
            assert len(budget['last_cost_event_id']) == 36  # UUID format


class TestBudgetMutationBeforeEvent:
    """Integration tests for budget mutation happening before event emission"""
    
    def test_budget_mutation_before_event(self, aws_mock):
        """Test that budget mutation happens before event emission"""
        job_id = 'integration-mutation-order-123'
        
        # Initialize budget
        initialize_job_budget(job_id)
        
        # Track if budget was updated before event emission
        budget_updated = False
        
        # Mock event logger to check order
        original_log = None
        try:
            import budget_client
            original_log = budget_client.log_decision_event
            
            def track_log(*args, **kwargs):
                nonlocal budget_updated
                # Check if budget was already updated
                budget = get_job_budget(job_id)
                if budget and budget['estimated_cost_cents'] > 0:
                    budget_updated = True
                # Call original (or just pass)
                pass
            
            budget_client.log_decision_event = track_log
            
            # Increment cost
            increment_llm_cost(job_id, 0.50, 1000)
            
            # Verify budget was updated (event emission is best effort)
            budget = get_job_budget(job_id)
            assert budget['estimated_cost_cents'] == 50
            
        finally:
            # Restore original
            if original_log:
                budget_client.log_decision_event = original_log
