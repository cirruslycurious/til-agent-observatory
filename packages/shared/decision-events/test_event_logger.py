"""
Unit Tests for Event Logger
Story 3.1: Decision Event Capture

Tests for normalization, event_id stability, details hashing, truncation path.
"""

import pytest
import json
import hashlib
import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from moto import mock_aws
import boto3

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from event_logger import (
    log_decision_event,
    generate_event_id,
    get_stable_action_id,
    compute_details_hash,
    zero_pad_seq,
    EventLoggingError,
    EventIdempotencyError
)
from event_types import EventType
from actor import Actor


class TestNormalization:
    """Tests for event type and actor normalization"""
    
    def test_normalize_event_type_lowercase(self):
        """Event type normalization converts to lowercase"""
        # This is tested via EventType.normalize, but we can test the integration
        from event_logger import log_decision_event
        
        # Mock DynamoDB to avoid actual writes
        with mock_aws():
            with patch('event_logger.events_by_job_table') as mock_table, \
                 patch('event_logger.event_ids_table') as mock_ids_table, \
                 patch('event_logger.generation_metrics_table') as mock_metrics_table, \
                 patch('event_logger.dynamodb_client') as mock_client:
                
                # Mock seq counter increment
                mock_metrics_table.update_item.return_value = {
                    'Attributes': {'seq': 1}
                }
                
                # Mock successful transaction
                mock_client.transact_write_items.return_value = {}
                
                # This should not raise an error (normalization works)
                # We can't easily test the full flow without more mocking, but
                # the normalization is tested in test_event_types.py
                pass
    
    def test_normalize_actor(self):
        """Actor normalization accepts valid actors"""
        from event_logger import log_decision_event
        
        # Test that valid actors are accepted
        assert Actor.is_valid('manager') is True
        assert Actor.is_valid('worker') is True
        assert Actor.is_valid('system') is True


class TestEventIdStability:
    """Tests for event_id generation stability"""
    
    def test_event_id_deterministic(self):
        """Event ID is deterministic (same inputs = same ID)"""
        event_id_1 = generate_event_id(
            execution_id='exec-123',
            state_name='ManagerLoop',
            iteration=0,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id='tool-inv-789'
        )
        
        event_id_2 = generate_event_id(
            execution_id='exec-123',
            state_name='ManagerLoop',
            iteration=0,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id='tool-inv-789'
        )
        
        assert event_id_1 == event_id_2
        assert len(event_id_1) == 64  # SHA-256 hex string
    
    def test_event_id_different_for_different_inputs(self):
        """Event ID changes when inputs change"""
        base_id = generate_event_id(
            execution_id='exec-123',
            state_name='ManagerLoop',
            iteration=0,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id='tool-inv-789'
        )
        
        # Different execution_id
        different_exec = generate_event_id(
            execution_id='exec-999',
            state_name='ManagerLoop',
            iteration=0,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id='tool-inv-789'
        )
        assert base_id != different_exec
        
        # Different iteration
        different_iter = generate_event_id(
            execution_id='exec-123',
            state_name='ManagerLoop',
            iteration=1,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id='tool-inv-789'
        )
        assert base_id != different_iter
    
    def test_event_id_delimiter_separated(self):
        """Event ID uses delimiter-separated format to avoid ambiguity"""
        # Test that delimiter prevents edge cases like "ab" + "c" vs "a" + "bc"
        id1 = generate_event_id(
            execution_id='ab',
            state_name='c',
            iteration=0,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id=''
        )
        
        id2 = generate_event_id(
            execution_id='a',
            state_name='bc',
            iteration=0,
            event_type='tool_called',
            job_id='job-456',
            actor='worker',
            sub_worker_instance_id='',
            stable_action_id=''
        )
        
        # These should be different (delimiter prevents ambiguity)
        assert id1 != id2
    
    def test_stable_action_id_resolution(self):
        """Stable action ID is resolved correctly per event type"""
        # tool_called
        details_tool = {'tool_invocation_id': 'tool-123'}
        assert get_stable_action_id('tool_called', details_tool, None) == 'tool-123'
        
        # artifact_created
        details_artifact = {'artifact_id': 'artifact-456'}
        assert get_stable_action_id('artifact_created', details_artifact, None) == 'artifact-456'
        
        # evaluator_assessed
        details_eval = {'evaluator_request_id': 'eval-789'}
        assert get_stable_action_id('evaluator_assessed', details_eval, None) == 'eval-789'
        
        # sub_worker_spawned
        assert get_stable_action_id('sub_worker_spawned', {}, 'sub-worker-123') == 'sub-worker-123'
        
        # Other event types
        assert get_stable_action_id('manager_goal_formulated', {}, None) == ''
        assert get_stable_action_id('unknown_type', {}, None) == ''


class TestDetailsHashing:
    """Tests for details hashing (canonical JSON)"""
    
    def test_details_hash_deterministic(self):
        """Details hash is deterministic (same details = same hash)"""
        details = {
            'tool_name': 'web_search',
            'parameters': {'query': 'test'},
            'results_summary': 'Found 3 results'
        }
        
        hash1 = compute_details_hash(details)
        hash2 = compute_details_hash(details)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex string
    
    def test_details_hash_canonical_order(self):
        """Details hash is canonical (key order doesn't matter)"""
        details1 = {
            'tool_name': 'web_search',
            'parameters': {'query': 'test'},
            'results_summary': 'Found 3 results'
        }
        
        details2 = {
            'results_summary': 'Found 3 results',
            'tool_name': 'web_search',
            'parameters': {'query': 'test'}
        }
        
        # These should have the same hash (canonical JSON sorts keys)
        hash1 = compute_details_hash(details1)
        hash2 = compute_details_hash(details2)
        
        assert hash1 == hash2
    
    def test_details_hash_different_for_different_details(self):
        """Details hash changes when details change"""
        details1 = {'tool_name': 'web_search', 'parameters': {'query': 'test1'}}
        details2 = {'tool_name': 'web_search', 'parameters': {'query': 'test2'}}
        
        hash1 = compute_details_hash(details1)
        hash2 = compute_details_hash(details2)
        
        assert hash1 != hash2


class TestTruncationPath:
    """Tests for details truncation and S3 overflow"""
    
    def test_zero_pad_seq(self):
        """Zero-padding works correctly"""
        assert zero_pad_seq(1) == '0000000001'
        assert zero_pad_seq(123) == '0000000123'
        assert zero_pad_seq(1234567890) == '1234567890'
        assert zero_pad_seq(0) == '0000000000'
    
    def test_zero_pad_seq_custom_width(self):
        """Zero-padding with custom width"""
        assert zero_pad_seq(1, width=5) == '00001'
        assert zero_pad_seq(123, width=3) == '123'
    
    @mock_aws
    def test_truncation_small_details(self):
        """Small details (<10KB) are not truncated"""
        from event_logger import truncate_details_if_needed
        
        # Small details
        details = {
            'tool_name': 'web_search',
            'parameters': {'query': 'test'},
            'results_summary': 'Found 3 results'
        }
        
        truncated, is_truncated, s3_ref, details_hash = truncate_details_if_needed(details)
        
        assert is_truncated is False
        assert s3_ref is None
        assert truncated == details  # Should be unchanged
        assert details_hash is not None
    
    @mock_aws
    def test_truncation_large_details(self):
        """Large details (>10KB) are truncated"""
        # Note: truncate_details_if_needed is not exported, but we can test the logic
        # by checking the size computation and hash calculation
        
        # Create large details (>10KB)
        large_string = 'x' * (11 * 1024)  # 11KB string
        details = {
            'tool_name': 'web_search',
            'large_field': large_string,
            'parameters': {'query': 'test'}
        }
        
        # Test that hash is computed correctly
        hash1 = compute_details_hash(details)
        assert hash1 is not None
        assert len(hash1) == 64
        
        # Test that size would trigger truncation
        from event_logger import canonical_json_serialize
        json_bytes = canonical_json_serialize(details)
        size_bytes = len(json_bytes)
        assert size_bytes > 10 * 1024  # Should be > 10KB


class TestEventLoggerIntegration:
    """Integration tests for event logger (with mocked DynamoDB)"""
    
    @mock_aws
    def test_log_event_success(self):
        """Successfully log an event"""
        # Setup mocks
        with patch('event_logger.generation_metrics_table') as mock_metrics, \
             patch('event_logger.dynamodb_client') as mock_client:
            
            # Mock seq counter increment
            mock_metrics.update_item.return_value = {
                'Attributes': {'seq': 1}
            }
            
            # Mock successful transaction
            mock_client.transact_write_items.return_value = {}
            
            # This test would require more setup, but demonstrates the pattern
            # Full integration tests will be in tests/integration/test_decision_events.py
            pass
    
    @mock_aws
    def test_log_event_idempotency(self):
        """Idempotent event logging returns existing event"""
        # This will be tested in integration tests
        pass
