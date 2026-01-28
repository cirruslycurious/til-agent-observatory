"""
Unit Tests for Metrics Writer Library
Story 6.2: DynamoDB Generation Metrics Storage

Tests validation, GSI attributes, and item size management.
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone
from decimal import Decimal

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from metrics_writer import (
    write_generation_metrics,
    write_iteration_metrics,
    validate_conference,
    validate_evaluator_top_3,
    validate_user_intent,
    validate_total_iterations,
    estimate_item_size,
    truncate_arrays_if_needed,
    ValidationError,
    convert_floats_to_decimal,
)


@pytest.fixture
def mock_dynamodb_table():
    """Mock DynamoDB table"""
    table = MagicMock()
    return table


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


class TestValidationFunctions:
    """Tests for validation functions"""
    
    def test_validate_conference_valid(self):
        """validate_conference accepts valid conferences"""
        assert validate_conference('black_hat') is True
        assert validate_conference('reinvent') is True
        assert validate_conference('kubecon') is True
    
    def test_validate_conference_invalid(self):
        """validate_conference rejects invalid conferences"""
        assert validate_conference('invalid') is False
        assert validate_conference('') is False
    
    def test_validate_evaluator_top_3_valid(self):
        """validate_evaluator_top_3 accepts valid top_3"""
        assert validate_evaluator_top_3(['black_hat', 'reinvent', 'kubecon']) is True
        assert validate_evaluator_top_3(['black_hat', 'black_hat', 'reinvent']) is True  # Duplicates allowed
    
    def test_validate_evaluator_top_3_invalid(self):
        """validate_evaluator_top_3 rejects invalid top_3"""
        assert validate_evaluator_top_3(['invalid', 'reinvent', 'kubecon']) is False
        assert validate_evaluator_top_3(['black_hat', 'reinvent']) is False  # Not 3 items
        assert validate_evaluator_top_3(['black_hat', 'reinvent', 'kubecon', 'extra']) is False  # Too many items
    
    def test_validate_user_intent_valid(self):
        """validate_user_intent accepts valid intents"""
        assert validate_user_intent('would_submit_with_edits') is True
        assert validate_user_intent('would_not_submit') is True
    
    def test_validate_user_intent_invalid(self):
        """validate_user_intent rejects invalid intents"""
        assert validate_user_intent('invalid') is False
        assert validate_user_intent('') is False
    
    def test_validate_total_iterations_valid(self):
        """validate_total_iterations accepts valid iterations (1-5)"""
        assert validate_total_iterations(1) is True
        assert validate_total_iterations(3) is True
        assert validate_total_iterations(5) is True
    
    def test_validate_total_iterations_invalid(self):
        """validate_total_iterations rejects invalid iterations"""
        assert validate_total_iterations(0) is False
        assert validate_total_iterations(6) is False
        assert validate_total_iterations(-1) is False


class TestConvertFloatsToDecimal:
    """Tests for float to Decimal conversion"""
    
    def test_convert_floats_to_decimal_simple(self):
        """convert_floats_to_decimal converts simple float"""
        result = convert_floats_to_decimal(0.9)
        assert isinstance(result, Decimal)
        assert result == Decimal('0.9')
    
    def test_convert_floats_to_decimal_nested(self):
        """convert_floats_to_decimal converts floats in nested structures"""
        data = {
            'confidence': 0.9,
            'scores': [0.8, 0.7, 0.6],
            'nested': {
                'value': 0.5,
            },
        }
        result = convert_floats_to_decimal(data)
        assert isinstance(result['confidence'], Decimal)
        assert isinstance(result['scores'][0], Decimal)
        assert isinstance(result['nested']['value'], Decimal)
    
    def test_convert_floats_to_decimal_preserves_other_types(self):
        """convert_floats_to_decimal preserves non-float types"""
        data = {
            'string': 'test',
            'int': 42,
            'bool': True,
            'list': [1, 2, 3],
        }
        result = convert_floats_to_decimal(data)
        assert result['string'] == 'test'
        assert result['int'] == 42
        assert result['bool'] is True
        assert result['list'] == [1, 2, 3]


class TestWriteGenerationMetrics:
    """Tests for write_generation_metrics"""
    
    @patch('metrics_writer.table')
    def test_write_generation_metrics_success(self, mock_table, sample_metrics_data):
        """write_generation_metrics writes metrics successfully"""
        mock_table.put_item.return_value = {}
        
        result = write_generation_metrics(
            job_id='test-job-id',
            metrics_data=sample_metrics_data,
            record_type='summary',
        )
        
        assert result['write_status'] == 'created'
        assert result['job_id'] == 'test-job-id'
        assert result['record_type'] == 'summary'
        assert 'timestamp' in result
        assert 'date_partition' in result
        
        # Verify DynamoDB write was called
        assert mock_table.put_item.called
        call_args = mock_table.put_item.call_args
        item = call_args[1]['Item']
        
        # Verify required fields
        assert item['job_id'] == 'test-job-id'
        assert item['record_type'] == 'summary'
        assert item['timestamp'] is not None
        assert item['date_partition'] is not None
        assert item['record_type_timestamp'].startswith('summary#')
        
        # Verify GSI attributes are present
        assert 'timestamp' in item  # GSI1 sort key
        assert 'date_partition' in item  # GSI1 and GSI2 partition key
        assert 'record_type_timestamp' in item  # Base table SK and GSI2 SK
    
    @patch('metrics_writer.table')
    def test_write_generation_metrics_validation_error(self, mock_table, sample_metrics_data):
        """write_generation_metrics raises ValidationError for invalid conference"""
        sample_metrics_data['conference'] = 'invalid'
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid conference' in str(exc_info.value)
        assert not mock_table.put_item.called  # Should not write if validation fails
    
    @patch('metrics_writer.table')
    def test_write_generation_metrics_evaluator_validation_error(self, mock_table, sample_metrics_data):
        """write_generation_metrics raises ValidationError for invalid evaluator top_3"""
        sample_metrics_data['evaluator_result']['top_3'] = ['invalid', 'reinvent', 'kubecon']
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid evaluator top_3' in str(exc_info.value)
        assert not mock_table.put_item.called
    
    @patch('metrics_writer.table')
    def test_write_generation_metrics_user_intent_validation_error(self, mock_table, sample_metrics_data):
        """write_generation_metrics raises ValidationError for invalid user_intent"""
        sample_metrics_data['user_intent'] = 'invalid'
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid user_intent' in str(exc_info.value)
        assert not mock_table.put_item.called
    
    @patch('metrics_writer.table')
    def test_write_generation_metrics_total_iterations_validation_error(self, mock_table, sample_metrics_data):
        """write_generation_metrics raises ValidationError for invalid total_iterations"""
        sample_metrics_data['total_iterations'] = 6
        
        with pytest.raises(ValidationError) as exc_info:
            write_generation_metrics(
                job_id='test-job-id',
                metrics_data=sample_metrics_data,
            )
        
        assert 'Invalid total_iterations' in str(exc_info.value)
        assert not mock_table.put_item.called
    
    @patch('metrics_writer.table')
    def test_write_generation_metrics_float_to_decimal(self, mock_table, sample_metrics_data):
        """write_generation_metrics converts floats to Decimal"""
        sample_metrics_data['total_cost_usd'] = 0.05  # Float
        sample_metrics_data['evaluator_result']['confidence_scores'] = [0.9, 0.7, 0.5]  # Floats
        
        mock_table.put_item.return_value = {}
        
        write_generation_metrics(
            job_id='test-job-id',
            metrics_data=sample_metrics_data,
        )
        
        # Verify put_item was called
        call_args = mock_table.put_item.call_args
        item = call_args[1]['Item']
        
        # Verify floats were converted to Decimal
        assert isinstance(item['total_cost_usd'], Decimal)
        assert isinstance(item['evaluator_result']['confidence_scores'][0], Decimal)


class TestWriteIterationMetrics:
    """Tests for write_iteration_metrics"""
    
    @patch('metrics_writer.table')
    @patch('metrics_writer.write_generation_metrics')
    def test_write_iteration_metrics_success(self, mock_write, mock_table, sample_metrics_data):
        """write_iteration_metrics writes iteration metrics successfully"""
        mock_write.return_value = {'write_status': 'created'}
        
        result = write_iteration_metrics(
            job_id='test-job-id',
            iteration=2,
            iteration_data=sample_metrics_data,
        )
        
        assert result['write_status'] == 'created'
        
        # Verify write_generation_metrics was called with record_type="iteration"
        assert mock_write.called
        call_args = mock_write.call_args
        assert call_args[1]['record_type'] == 'iteration'
        assert call_args[1]['metrics_data']['iteration'] == 2
    
    def test_write_iteration_metrics_invalid_iteration(self, sample_metrics_data):
        """write_iteration_metrics raises ValidationError for invalid iteration"""
        with pytest.raises(ValidationError) as exc_info:
            write_iteration_metrics(
                job_id='test-job-id',
                iteration=5,  # Invalid (must be 0-4)
                iteration_data=sample_metrics_data,
            )
        
        assert 'Invalid iteration' in str(exc_info.value)


class TestItemSizeManagement:
    """Tests for item size management"""
    
    def test_estimate_item_size(self):
        """estimate_item_size correctly estimates item size"""
        item = {'key': 'value'}
        size = estimate_item_size(item)
        assert size > 0
        assert isinstance(size, int)
    
    def test_truncate_arrays_if_needed_small(self):
        """truncate_arrays_if_needed doesn't truncate if size is small"""
        data = {
            'tool_calls_made': ['tool1', 'tool2'],
            'sub_workers_spawned': ['worker1'],
        }
        result = truncate_arrays_if_needed(data)
        assert result['tool_calls_made'] == ['tool1', 'tool2']
        assert result['sub_workers_spawned'] == ['worker1']
    
    def test_truncate_arrays_if_needed_large(self):
        """truncate_arrays_if_needed truncates arrays if size is large"""
        # Create large data with many array items that exceeds 350KB limit
        # Each tool name is ~10 bytes, 100 items = ~1000 bytes
        # Add large content to push over 350KB limit
        data = {
            'tool_calls_made': ['tool' + str(i) for i in range(100)],  # 100 items
            'sub_workers_spawned': ['worker' + str(i) for i in range(100)],
            'large_content': 'x' * (360 * 1024),  # 360KB (exceeds 350KB limit)
        }
        
        # Verify initial size exceeds limit
        initial_size = estimate_item_size(data)
        assert initial_size >= 350 * 1024, f"Initial size {initial_size} should exceed 350KB"
        
        result = truncate_arrays_if_needed(data, max_size=350 * 1024)
        
        # Arrays should be truncated to 10 items
        assert len(result['tool_calls_made']) <= 10, f"Expected <= 10, got {len(result['tool_calls_made'])}"
        assert len(result['sub_workers_spawned']) <= 10
