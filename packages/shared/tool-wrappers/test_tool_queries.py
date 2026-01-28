"""
Unit Tests for Tool Query Utilities
Story 3.3: Tool Usage Logging
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from tool_queries import (
    get_tool_calls_by_job_id,
    get_tool_call_sequences,
    get_tool_effectiveness_metrics,
    get_tool_call_by_invocation_id,
)


@pytest.fixture
def mock_events_table():
    """Mock DynamoDB events table"""
    with patch('tool_queries.events_by_job_table') as mock_table:
        yield mock_table


class TestGetToolCallsByJobId:
    """Test get_tool_calls_by_job_id function"""
    
    def test_get_tool_calls_single_page(self, mock_events_table):
        """Test getting tool calls from single page"""
        # Mock query response
        mock_events_table.query.return_value = {
            'Items': [
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000001#2026-01-12T10:30:15.123Z#tool_called',
                    'event_type': 'tool_called',
                    'seq': 1,
                    'details': {'tool_name': 'web_search'},
                },
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000002#2026-01-12T10:30:16.123Z#artifact_created',
                    'event_type': 'artifact_created',
                    'seq': 2,
                },
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000003#2026-01-12T10:30:17.123Z#tool_called',
                    'event_type': 'tool_called',
                    'seq': 3,
                    'details': {'tool_name': 'dynamodb_lookup'},
                },
            ],
        }
        
        tool_calls = get_tool_calls_by_job_id('job-123')
        
        # Verify only tool_called events are returned
        assert len(tool_calls) == 2
        assert all(item['event_type'] == 'tool_called' for item in tool_calls)
        assert tool_calls[0]['seq'] == 1
        assert tool_calls[1]['seq'] == 3
    
    def test_get_tool_calls_pagination(self, mock_events_table):
        """Test getting tool calls with pagination"""
        # Mock first page
        mock_events_table.query.side_effect = [
            {
                'Items': [
                    {
                        'job_id': 'job-123',
                        'seq_ts_type': '0000000001#2026-01-12T10:30:15.123Z#tool_called',
                        'event_type': 'tool_called',
                        'seq': 1,
                        'details': {'tool_name': 'web_search'},
                    },
                ],
                'LastEvaluatedKey': {'job_id': 'job-123', 'seq_ts_type': '0000000001#...'},
            },
            {
                'Items': [
                    {
                        'job_id': 'job-123',
                        'seq_ts_type': '0000000002#2026-01-12T10:30:16.123Z#tool_called',
                        'event_type': 'tool_called',
                        'seq': 2,
                        'details': {'tool_name': 'dynamodb_lookup'},
                    },
                ],
            },
        ]
        
        tool_calls = get_tool_calls_by_job_id('job-123')
        
        # Verify both pages are retrieved
        assert len(tool_calls) == 2
        assert tool_calls[0]['seq'] == 1
        assert tool_calls[1]['seq'] == 2
    
    def test_get_tool_calls_empty(self, mock_events_table):
        """Test getting tool calls when none exist"""
        mock_events_table.query.return_value = {
            'Items': [],
        }
        
        tool_calls = get_tool_calls_by_job_id('job-123')
        
        assert len(tool_calls) == 0


class TestGetToolCallSequences:
    """Test get_tool_call_sequences function"""
    
    def test_get_sequences_grouped(self, mock_events_table):
        """Test getting sequences grouped by actor and sub_worker_instance_id"""
        # Mock query response
        mock_events_table.query.return_value = {
            'Items': [
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000001#2026-01-12T10:30:15.123Z#tool_called',
                    'event_type': 'tool_called',
                    'actor': 'sub_worker',
                    'sub_worker_instance_id': 'sub-456',
                    'seq': 1,
                    'timestamp': '2026-01-12T10:30:15.123Z',
                    'details': {
                        'tool_name': 'web_search',
                        'reasoning': 'Need to search',
                        'success_status': 'success',
                    },
                },
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000002#2026-01-12T10:30:16.123Z#tool_called',
                    'event_type': 'tool_called',
                    'actor': 'sub_worker',
                    'sub_worker_instance_id': 'sub-456',
                    'seq': 2,
                    'timestamp': '2026-01-12T10:30:16.123Z',
                    'details': {
                        'tool_name': 'dynamodb_lookup',
                        'reasoning': 'Need to lookup',
                        'success_status': 'success',
                    },
                },
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000003#2026-01-12T10:30:17.123Z#tool_called',
                    'event_type': 'tool_called',
                    'actor': 'worker',
                    'sub_worker_instance_id': None,
                    'seq': 3,
                    'timestamp': '2026-01-12T10:30:17.123Z',
                    'details': {
                        'tool_name': 'web_search',
                        'reasoning': 'Worker search',
                        'success_status': 'success',
                    },
                },
            ],
        }
        
        sequences = get_tool_call_sequences('job-123')
        
        # Verify sequences are grouped
        assert len(sequences) == 2
        
        # Find sub_worker sequence
        sub_worker_seq = next(s for s in sequences if s['actor'] == 'sub_worker')
        assert sub_worker_seq['sub_worker_instance_id'] == 'sub-456'
        assert len(sub_worker_seq['tool_calls']) == 2
        
        # Find worker sequence
        worker_seq = next(s for s in sequences if s['actor'] == 'worker')
        assert worker_seq['sub_worker_instance_id'] is None
        assert len(worker_seq['tool_calls']) == 1
    
    def test_get_sequences_sorted(self, mock_events_table):
        """Test that sequences are sorted by first tool call seq"""
        # Mock query response with out-of-order sequences
        mock_events_table.query.return_value = {
            'Items': [
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000003#2026-01-12T10:30:17.123Z#tool_called',
                    'event_type': 'tool_called',
                    'actor': 'worker',
                    'seq': 3,
                    'timestamp': '2026-01-12T10:30:17.123Z',
                    'details': {'tool_name': 'web_search', 'reasoning': 'Worker', 'success_status': 'success'},
                },
                {
                    'job_id': 'job-123',
                    'seq_ts_type': '0000000001#2026-01-12T10:30:15.123Z#tool_called',
                    'event_type': 'tool_called',
                    'actor': 'sub_worker',
                    'sub_worker_instance_id': 'sub-456',
                    'seq': 1,
                    'timestamp': '2026-01-12T10:30:15.123Z',
                    'details': {'tool_name': 'web_search', 'reasoning': 'Sub-worker', 'success_status': 'success'},
                },
            ],
        }
        
        sequences = get_tool_call_sequences('job-123')
        
        # Verify sequences are sorted by first tool call seq
        assert sequences[0]['actor'] == 'sub_worker'  # seq 1
        assert sequences[1]['actor'] == 'worker'  # seq 3


class TestGetToolEffectivenessMetrics:
    """Test get_tool_effectiveness_metrics function"""
    
    def test_calculate_metrics(self, mock_events_table):
        """Test calculating effectiveness metrics"""
        # Mock query response
        mock_events_table.query.return_value = {
            'Items': [
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'web_search',
                        'success_status': 'success',
                        'execution_time_ms': 1000,
                        'cost_usd': 0.002,
                    },
                },
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'web_search',
                        'success_status': 'success',
                        'execution_time_ms': 1500,
                        'cost_usd': 0.002,
                    },
                },
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'web_search',
                        'success_status': 'error',
                        'execution_time_ms': 500,
                        'cost_usd': 0.0,
                    },
                },
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'dynamodb_lookup',
                        'success_status': 'success',
                        'execution_time_ms': 100,
                        'cost_usd': 0.0,
                    },
                },
            ],
        }
        
        metrics = get_tool_effectiveness_metrics('job-123')
        
        # Verify web_search metrics
        assert 'web_search' in metrics
        web_search_metrics = metrics['web_search']
        assert web_search_metrics['total_calls'] == 3
        assert web_search_metrics['success_rate'] == pytest.approx(0.667, abs=0.001)  # 2/3
        assert web_search_metrics['avg_time_ms'] == 1000  # (1000 + 1500 + 500) / 3
        assert web_search_metrics['avg_cost_usd'] == pytest.approx(0.0013, abs=0.0001)  # (0.002 + 0.002 + 0) / 3
        
        # Verify dynamodb_lookup metrics
        assert 'dynamodb_lookup' in metrics
        dynamodb_metrics = metrics['dynamodb_lookup']
        assert dynamodb_metrics['total_calls'] == 1
        assert dynamodb_metrics['success_rate'] == 1.0
        assert dynamodb_metrics['avg_time_ms'] == 100
        assert dynamodb_metrics['avg_cost_usd'] == 0.0
    
    def test_calculate_metrics_empty(self, mock_events_table):
        """Test calculating metrics when no tool calls exist"""
        mock_events_table.query.return_value = {
            'Items': [],
        }
        
        metrics = get_tool_effectiveness_metrics('job-123')
        
        assert len(metrics) == 0


class TestGetToolCallByInvocationId:
    """Test get_tool_call_by_invocation_id function"""
    
    def test_find_tool_call(self, mock_events_table):
        """Test finding tool call by invocation ID"""
        # Mock query response
        mock_events_table.query.return_value = {
            'Items': [
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'web_search',
                        'tool_invocation_id': 'inv-123',
                    },
                },
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'dynamodb_lookup',
                        'tool_invocation_id': 'inv-456',
                    },
                },
            ],
        }
        
        tool_call = get_tool_call_by_invocation_id('job-123', 'inv-123')
        
        assert tool_call is not None
        assert tool_call['details']['tool_invocation_id'] == 'inv-123'
        assert tool_call['details']['tool_name'] == 'web_search'
    
    def test_tool_call_not_found(self, mock_events_table):
        """Test when tool call is not found"""
        mock_events_table.query.return_value = {
            'Items': [
                {
                    'job_id': 'job-123',
                    'event_type': 'tool_called',
                    'details': {
                        'tool_name': 'web_search',
                        'tool_invocation_id': 'inv-123',
                    },
                },
            ],
        }
        
        tool_call = get_tool_call_by_invocation_id('job-123', 'inv-999')
        
        assert tool_call is None
