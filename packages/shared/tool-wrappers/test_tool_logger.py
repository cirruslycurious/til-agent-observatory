"""
Unit Tests for Tool Logger
Story 3.3: Tool Usage Logging
"""

import pytest
import json
import hashlib
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from tool_logger import (
    log_tool_call,
    generate_tool_invocation_id,
    compute_canonical_params_hash,
    generate_results_summary,
    summarize_params,
)


@pytest.fixture
def mock_event_logger():
    """Mock the event logger to avoid actual DynamoDB calls"""
    with patch('tool_logger.log_decision_event') as mock_log:
        yield mock_log


@pytest.fixture
def mock_s3_uploader():
    """Mock S3 uploader to avoid actual S3 calls"""
    with patch('tool_logger.upload_tool_results_to_s3') as mock_upload:
        yield mock_upload


class TestGenerateToolInvocationId:
    """Test tool_invocation_id generation (deterministic, retry-stable)"""
    
    def test_deterministic_generation(self):
        """Test that same inputs produce same tool_invocation_id"""
        execution_id = "exec-123"
        state_name = "TestState"
        iteration = 1
        tool_name = "web_search"
        actor = "worker"
        sub_worker_instance_id = "sub-456"
        canonical_params_hash = "abc123"
        
        id1 = generate_tool_invocation_id(
            execution_id, state_name, iteration, tool_name, actor,
            sub_worker_instance_id, canonical_params_hash
        )
        
        id2 = generate_tool_invocation_id(
            execution_id, state_name, iteration, tool_name, actor,
            sub_worker_instance_id, canonical_params_hash
        )
        
        assert id1 == id2
        assert len(id1) == 64  # SHA-256 hex string
    
    def test_different_inputs_produce_different_ids(self):
        """Test that different inputs produce different tool_invocation_ids"""
        base_params = {
            'execution_id': "exec-123",
            'state_name': "TestState",
            'iteration': 1,
            'tool_name': "web_search",
            'actor': "worker",
            'sub_worker_instance_id': "sub-456",
            'canonical_params_hash': "abc123",
        }
        
        id1 = generate_tool_invocation_id(**base_params)
        
        # Change execution_id
        base_params['execution_id'] = "exec-789"
        id2 = generate_tool_invocation_id(**base_params)
        
        assert id1 != id2
    
    def test_no_timestamp_in_id(self):
        """Test that tool_invocation_id doesn't include timestamp (retry-stable)"""
        # Generate ID multiple times - should be identical
        execution_id = "exec-123"
        state_name = "TestState"
        iteration = 1
        tool_name = "web_search"
        actor = "worker"
        sub_worker_instance_id = None
        canonical_params_hash = "abc123"
        
        id1 = generate_tool_invocation_id(
            execution_id, state_name, iteration, tool_name, actor,
            sub_worker_instance_id, canonical_params_hash
        )
        
        # Wait a bit and generate again
        import time
        time.sleep(0.1)
        
        id2 = generate_tool_invocation_id(
            execution_id, state_name, iteration, tool_name, actor,
            sub_worker_instance_id, canonical_params_hash
        )
        
        assert id1 == id2  # Should be identical (no timestamp)


class TestComputeCanonicalParamsHash:
    """Test canonical params hash computation"""
    
    def test_deterministic_hashing(self):
        """Test that same params produce same hash"""
        params1 = {'query': 'test', 'limit': 10}
        params2 = {'limit': 10, 'query': 'test'}  # Different key order
        
        hash1 = compute_canonical_params_hash(params1)
        hash2 = compute_canonical_params_hash(params2)
        
        # Should be same (canonical JSON sorts keys)
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex string
    
    def test_different_params_produce_different_hashes(self):
        """Test that different params produce different hashes"""
        params1 = {'query': 'test1'}
        params2 = {'query': 'test2'}
        
        hash1 = compute_canonical_params_hash(params1)
        hash2 = compute_canonical_params_hash(params2)
        
        assert hash1 != hash2


class TestGenerateResultsSummary:
    """Test results summary generation (deterministic, 50-200 chars)"""
    
    def test_web_search_results_summary(self):
        """Test web search results summary generation"""
        results = {
            'results': [
                {'title': 'Result 1', 'url': 'http://example.com/1'},
                {'title': 'Result 2', 'url': 'http://example.com/2'},
                {'title': 'Result 3', 'url': 'http://example.com/3'},
            ]
        }
        
        summary = generate_results_summary(results, 'web_search')
        
        assert len(summary) >= 50
        assert len(summary) <= 200
        assert 'Found' in summary
        assert 'Result 1' in summary or 'Result 2' in summary
    
    def test_web_search_empty_results(self):
        """Test web search with no results"""
        results = {'results': []}
        
        summary = generate_results_summary(results, 'web_search')
        
        assert len(summary) >= 50
        assert 'No search results' in summary
    
    def test_dynamodb_lookup_results_summary(self):
        """Test DynamoDB lookup results summary generation"""
        results = {
            'data_type': 'requirements',
            'items': [
                {'field1': 'value1', 'field2': 'value2'},
                {'field1': 'value3', 'field2': 'value4'},
            ]
        }
        
        summary = generate_results_summary(results, 'dynamodb_lookup')
        
        assert len(summary) >= 50
        assert len(summary) <= 200
        assert 'requirements' in summary
        assert 'items' in summary or '2' in summary
    
    def test_results_summary_truncation(self):
        """Test that results summary is truncated to 200 chars"""
        # Create results with very long titles
        results = {
            'results': [
                {'title': 'A' * 100, 'url': 'http://example.com/1'},
                {'title': 'B' * 100, 'url': 'http://example.com/2'},
                {'title': 'C' * 100, 'url': 'http://example.com/3'},
            ]
        }
        
        summary = generate_results_summary(results, 'web_search')
        
        assert len(summary) <= 200
    
    def test_results_summary_minimum_length(self):
        """Test that results summary meets minimum 50 chars"""
        results = {'results': []}
        
        summary = generate_results_summary(results, 'web_search')
        
        assert len(summary) >= 50


class TestSummarizeParams:
    """Test parameter summarization"""
    
    def test_small_params_returned_fully(self):
        """Test that small params (<100 chars) are returned fully"""
        params = {'query': 'test'}
        
        summary = summarize_params(params)
        
        assert len(summary) <= 100
        assert 'query' in summary
        assert 'test' in summary
    
    def test_large_params_summarized(self):
        """Test that large params are summarized"""
        params = {
            'query': 'A' * 200,  # Very long query
            'limit': 10,
        }
        
        summary = summarize_params(params)
        
        assert len(summary) <= 200
        assert 'query' in summary
        assert 'limit' in summary


class TestLogToolCall:
    """Test log_tool_call function"""
    
    def test_log_tool_call_success(self, mock_event_logger, mock_s3_uploader):
        """Test successful tool call logging"""
        mock_event_logger.return_value = {
            'event_id': 'event-123',
            'job_id': 'job-456',
            'sk': 'seq#timestamp#tool_called',
        }
        
        params = {'query': 'test'}
        results = {'results': [{'title': 'Result 1'}]}
        
        tool_call_record = log_tool_call(
            tool_name='web_search',
            params=params,
            results=results,
            reasoning='Need to search',
            job_id='job-456',
            actor='worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=1,
        )
        
        # Verify tool call record structure
        assert 'tool_name' in tool_call_record
        assert 'tool_invocation_id' in tool_call_record
        assert 'params_summary' in tool_call_record
        assert 'results_summary' in tool_call_record
        assert 'reasoning' in tool_call_record
        assert 'success_status' in tool_call_record
        assert tool_call_record['tool_name'] == 'web_search'
        assert tool_call_record['success_status'] == 'success'
        
        # Verify event was logged
        assert mock_event_logger.called
        call_args = mock_event_logger.call_args
        assert call_args[1]['event_type'] == 'tool_called'
        assert call_args[1]['job_id'] == 'job-456'
    
    def test_log_tool_call_s3_overflow(self, mock_event_logger, mock_s3_uploader):
        """Test tool call with S3 overflow (>50KB results)"""
        mock_event_logger.return_value = {
            'event_id': 'event-123',
            'job_id': 'job-456',
        }
        
        # Mock S3 upload
        mock_s3_uploader.return_value = {
            's3_key': 'tool-results/job-456/inv-123/results.json',
        }
        
        # Create large results (>50KB)
        large_results = {
            'results': [{'data': 'x' * 60000}]  # ~60KB
        }
        
        tool_call_record = log_tool_call(
            tool_name='web_search',
            params={'query': 'test'},
            results=large_results,
            reasoning='Need to search',
            job_id='job-456',
            actor='worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=1,
        )
        
        # Verify S3 upload was called
        assert mock_s3_uploader.called
        
        # Verify s3_tool_results_ref in record
        assert 's3_tool_results_ref' in tool_call_record
        assert tool_call_record['s3_tool_results_ref'] is not None
    
    def test_log_tool_call_reasoning_truncation(self, mock_event_logger, mock_s3_uploader):
        """Test that reasoning is truncated to 200 chars"""
        long_reasoning = 'A' * 300  # >200 chars
        
        tool_call_record = log_tool_call(
            tool_name='web_search',
            params={'query': 'test'},
            results={'results': []},
            reasoning=long_reasoning,
            job_id='job-456',
            actor='worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=1,
        )
        
        # Verify reasoning is truncated
        assert len(tool_call_record['reasoning']) <= 200
    
    def test_log_tool_call_execution_time(self, mock_event_logger, mock_s3_uploader):
        """Test that execution time is computed from start_time"""
        import time
        
        start_time = time.time()
        time.sleep(0.1)  # Sleep 100ms
        
        tool_call_record = log_tool_call(
            tool_name='web_search',
            params={'query': 'test'},
            results={'results': []},
            reasoning='Test',
            job_id='job-456',
            actor='worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=1,
            start_time=start_time,
        )
        
        # Verify execution_time_ms is set
        assert 'execution_time_ms' in tool_call_record
        assert tool_call_record['execution_time_ms'] >= 100  # At least 100ms
    
    def test_log_tool_call_error_handling(self, mock_event_logger, mock_s3_uploader):
        """Test that errors in event logging don't block tool call"""
        # Make event logger raise exception
        mock_event_logger.side_effect = Exception("Event logging failed")
        
        # Should still return tool call record
        tool_call_record = log_tool_call(
            tool_name='web_search',
            params={'query': 'test'},
            results={'results': []},
            reasoning='Test',
            job_id='job-456',
            actor='worker',
            worker_id='worker-789',
            worker_vendor='openai',
            execution_id='exec-123',
            state_name='TestState',
            iteration=1,
        )
        
        # Verify tool call record is still returned
        assert tool_call_record is not None
        assert 'tool_invocation_id' in tool_call_record
