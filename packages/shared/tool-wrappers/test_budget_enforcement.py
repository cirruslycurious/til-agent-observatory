"""
Unit Tests for Budget Enforcement
Story 3.3: Tool Usage Logging

Test atomic budget reservation and guardrail enforcement.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError
from datetime import datetime, timezone

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from web_search import (
    reserve_budget_atomically,
    initialize_guardrail_key,
    WEB_SEARCH_LIMIT,
)


@pytest.fixture
def mock_guardrails_table():
    """Mock DynamoDB guardrails table"""
    with patch('web_search.guardrails_table') as mock_table:
        yield mock_table


class TestReserveBudgetAtomically:
    """Test atomic budget reservation"""
    
    def test_successful_reservation(self, mock_guardrails_table):
        """Test successful budget reservation"""
        # Mock successful UpdateItem
        mock_guardrails_table.update_item.return_value = {
            'Attributes': {
                'guardrail_key': 'job-123#0#evidence_researcher#sub-456',
                'web_search_count': 1,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }
        }
        
        result = reserve_budget_atomically('job-123#0#evidence_researcher#sub-456', WEB_SEARCH_LIMIT)
        
        assert result['success'] is True
        assert result['searches_used'] == 1
        assert result['limit'] == WEB_SEARCH_LIMIT
        
        # Verify UpdateItem was called with correct parameters
        mock_guardrails_table.update_item.assert_called_once()
        call_kwargs = mock_guardrails_table.update_item.call_args[1]
        assert call_kwargs['Key']['guardrail_key'] == 'job-123#0#evidence_researcher#sub-456'
        assert 'ConditionExpression' in call_kwargs
        assert 'web_search_count < :limit' in call_kwargs['ConditionExpression']
    
    def test_budget_exceeded(self, mock_guardrails_table):
        """Test budget exceeded (ConditionExpression fails)"""
        # Mock ConditionalCheckFailedException
        error_response = {
            'Error': {
                'Code': 'ConditionalCheckFailedException',
                'Message': 'Conditional check failed',
            }
        }
        mock_guardrails_table.update_item.side_effect = ClientError(error_response, 'UpdateItem')
        
        # Mock GetItem to return current count
        mock_guardrails_table.get_item.return_value = {
            'Item': {
                'guardrail_key': 'job-123#0#evidence_researcher#sub-456',
                'web_search_count': 2,
            }
        }
        
        result = reserve_budget_atomically('job-123#0#evidence_researcher#sub-456', WEB_SEARCH_LIMIT)
        
        assert result['success'] is False
        assert result['searches_used'] == 2
        assert result['limit'] == WEB_SEARCH_LIMIT
        assert 'error' in result
        assert 'budget exceeded' in result['error'].lower()
    
    def test_budget_exceeded_get_item_fails(self, mock_guardrails_table):
        """Test budget exceeded when GetItem also fails"""
        # Mock ConditionalCheckFailedException
        error_response = {
            'Error': {
                'Code': 'ConditionalCheckFailedException',
                'Message': 'Conditional check failed',
            }
        }
        mock_guardrails_table.update_item.side_effect = ClientError(error_response, 'UpdateItem')
        
        # Mock GetItem to also fail
        mock_guardrails_table.get_item.side_effect = Exception("GetItem failed")
        
        result = reserve_budget_atomically('job-123#0#evidence_researcher#sub-456', WEB_SEARCH_LIMIT)
        
        assert result['success'] is False
        assert result['searches_used'] == WEB_SEARCH_LIMIT  # Assumes limit reached
        assert 'error' in result
    
    def test_other_error(self, mock_guardrails_table):
        """Test other DynamoDB error"""
        # Mock other error
        error_response = {
            'Error': {
                'Code': 'ProvisionedThroughputExceededException',
                'Message': 'Throughput exceeded',
            }
        }
        mock_guardrails_table.update_item.side_effect = ClientError(error_response, 'UpdateItem')
        
        result = reserve_budget_atomically('job-123#0#evidence_researcher#sub-456', WEB_SEARCH_LIMIT)
        
        assert result['success'] is False
        assert 'error' in result
        assert 'reservation failed' in result['error'].lower()


class TestInitializeGuardrailKey:
    """Test guardrail key initialization"""
    
    def test_initialize_new_key(self, mock_guardrails_table):
        """Test initializing a new guardrail key"""
        mock_guardrails_table.put_item.return_value = {}
        
        initialize_guardrail_key('job-123#0#evidence_researcher#sub-456')
        
        # Verify PutItem was called
        mock_guardrails_table.put_item.assert_called_once()
        call_kwargs = mock_guardrails_table.put_item.call_args[1]
        assert call_kwargs['Item']['guardrail_key'] == 'job-123#0#evidence_researcher#sub-456'
        assert call_kwargs['Item']['web_search_count'] == 0
        assert 'ConditionExpression' in call_kwargs
    
    def test_initialize_existing_key(self, mock_guardrails_table):
        """Test initializing an existing key (idempotent)"""
        # Mock ConditionalCheckFailedException (key already exists)
        error_response = {
            'Error': {
                'Code': 'ConditionalCheckFailedException',
                'Message': 'Key already exists',
            }
        }
        mock_guardrails_table.put_item.side_effect = ClientError(error_response, 'PutItem')
        
        # Should not raise exception (idempotent)
        initialize_guardrail_key('job-123#0#evidence_researcher#sub-456')
        
        # Verify PutItem was called
        mock_guardrails_table.put_item.assert_called_once()
    
    def test_initialize_other_error(self, mock_guardrails_table):
        """Test initialization with other error (should raise)"""
        # Mock other error
        error_response = {
            'Error': {
                'Code': 'ProvisionedThroughputExceededException',
                'Message': 'Throughput exceeded',
            }
        }
        mock_guardrails_table.put_item.side_effect = ClientError(error_response, 'PutItem')
        
        # Should raise exception
        with pytest.raises(ClientError):
            initialize_guardrail_key('job-123#0#evidence_researcher#sub-456')


class TestWebSearchBudgetEnforcement:
    """Test web search budget enforcement integration"""
    
    @patch('web_search.reserve_budget_atomically')
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    @patch('web_search.log_decision_event')
    def test_budget_exceeded_no_api_call(
        self,
        mock_log_event,
        mock_log_tool,
        mock_tavily,
        mock_reserve
    ):
        """Test that API is NOT called if budget exceeded"""
        from web_search import web_search
        
        # Mock budget reservation failure
        mock_reserve.return_value = {
            'success': False,
            'searches_used': 2,
            'limit': 2,
            'error': 'Budget exceeded',
        }
        
        result = web_search(
            query='test query',
            job_id='job-123',
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
        mock_tavily.assert_not_called()
        
        # Verify cost_guardrail_triggered event was logged
        assert mock_log_event.called
        call_args = mock_log_event.call_args
        assert call_args[1]['event_type'] == 'cost_guardrail_triggered'
        
        # Verify tool call was logged with skipped status
        assert mock_log_tool.called
        tool_call_args = mock_log_tool.call_args
        assert tool_call_args[1]['success_status'] == 'skipped'
        
        # Verify result structure
        assert 'results' in result
        assert result['results']['status'] == 'budget_exhausted'
    
    @patch('web_search.reserve_budget_atomically')
    @patch('web_search.call_tavily_api')
    @patch('web_search.log_tool_call')
    def test_budget_reserved_api_called(
        self,
        mock_log_tool,
        mock_tavily,
        mock_reserve
    ):
        """Test that API is called AFTER successful budget reservation"""
        from web_search import web_search
        
        # Mock successful budget reservation
        mock_reserve.return_value = {
            'success': True,
            'searches_used': 1,
            'limit': 2,
        }
        
        # Mock successful API call
        mock_tavily.return_value = {
            'results': [
                {'title': 'Result 1', 'url': 'http://example.com/1'},
            ],
            'response_time': 1.2,
        }
        
        result = web_search(
            query='test query',
            job_id='job-123',
            actor='sub_worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=0,
            sub_worker_type='evidence_researcher',
            sub_worker_instance_id='sub-456',
        )
        
        # Verify API was called AFTER reservation
        assert mock_reserve.called
        assert mock_tavily.called
        
        # Verify tool call was logged with success status
        assert mock_log_tool.called
        tool_call_args = mock_log_tool.call_args
        assert tool_call_args[1]['success_status'] == 'success'
        
        # Verify result structure
        assert 'results' in result
        assert 'tool_call_record' in result
