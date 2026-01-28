"""
Unit Tests for Artifact Writer Library
Story 6.1: DynamoDB Scratch Artifacts Storage

Tests idempotency, size management, S3 overflow, and version selection.
"""

import pytest
import json
import hashlib
import copy
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta, timezone
from botocore.exceptions import ClientError

# Import the module under test
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from artifact_writer import (
    write_artifact,
    get_artifact,
    list_artifacts_for_job,
    compute_content_hash,
    estimate_artifact_size,
    ArtifactValidationError,
    SchemaVersionMismatchError,
    DYNAMODB_SIZE_LIMIT,
    DYNAMODB_SUMMARY_LIMIT,
)


@pytest.fixture
def mock_dynamodb_table():
    """Mock DynamoDB table"""
    table = MagicMock()
    return table


@pytest.fixture
def mock_s3_client():
    """Mock S3 client"""
    s3_client = MagicMock()
    return s3_client


@pytest.fixture
def sample_artifact_data():
    """Sample artifact data for testing"""
    return {
        'meta': {
            'artifact_id': 'test-job-id#test_task#v0001',
            'job_id': 'test-job-id',
            'iteration': 0,
            'parent_task_id': 'manager',
            'task_id': 'test_task',
            'worker_id': 'test-worker',
            'worker_vendor': 'openai',
            'worker_model': 'gpt-5.2',
            'artifact_type': 'evidence_bundle',
            'artifact_version': 'v0001',
            'content_hash': '',  # Will be computed
            'schema_version': '1.0',
            'spawned_at': datetime.now(timezone.utc).isoformat(),
            'completed_at': datetime.now(timezone.utc).isoformat(),
            'status': 'completed',
        },
        'data': {
            'evidence': ['Evidence 1', 'Evidence 2'],
            'summary': 'Test evidence bundle',
        },
        'quality_signals': {
            'confidence': 0.9,
            'coverage': 'comprehensive',
        },
        'provenance': {
            'sources': [
                {
                    'id': 'source-1',
                    'type': 'web',
                    'uri': 'https://example.com',
                    'snippet': 'Test snippet',
                    'captured_at': datetime.now(timezone.utc).isoformat(),
                }
            ],
            'claims': [],
            'tool_calls': [
                {
                    'tool_name': 'web_search',
                    'tool_invocation_id': 'inv-1',
                    'success_status': 'success',
                    'results_summary': 'Found 5 results',
                }
            ],
            'inputs': {},
        },
        'overflow': {},
        'execution': {
            'tokens_used': 1000,
            'execution_time_ms': 500,
        },
    }


@pytest.fixture
def large_artifact_data(sample_artifact_data):
    """Large artifact data (>350KB) for overflow testing"""
    large_data = sample_artifact_data.copy()
    # Create large data field (>350KB)
    large_data['data'] = {
        'large_content': 'x' * (400 * 1024),  # 400KB
    }
    return large_data


class TestComputeContentHash:
    """Tests for content hash computation"""

    def test_compute_content_hash_deterministic(self, sample_artifact_data):
        """Content hash should be deterministic (same input = same hash)"""
        hash1 = compute_content_hash(sample_artifact_data)
        hash2 = compute_content_hash(sample_artifact_data)
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex string

    def test_compute_content_hash_excludes_timestamps(self, sample_artifact_data):
        """Content hash should exclude timestamps for deterministic hashing"""
        data1 = sample_artifact_data.copy()
        data1['meta']['spawned_at'] = '2026-01-01T00:00:00Z'
        data1['meta']['completed_at'] = '2026-01-01T00:00:00Z'

        data2 = sample_artifact_data.copy()
        data2['meta']['spawned_at'] = '2026-01-02T00:00:00Z'
        data2['meta']['completed_at'] = '2026-01-02T00:00:00Z'

        hash1 = compute_content_hash(data1)
        hash2 = compute_content_hash(data2)
        assert hash1 == hash2  # Same content, different timestamps

    def test_compute_content_hash_different_content(self, sample_artifact_data):
        """Different content should produce different hashes"""
        data1 = sample_artifact_data.copy()
        data2 = sample_artifact_data.copy()
        # Make sure we're modifying the actual data field, not just a reference
        data2_data = data2.get('data', {}).copy()
        data2_data['evidence'] = ['Different evidence']
        data2['data'] = data2_data

        hash1 = compute_content_hash(data1)
        hash2 = compute_content_hash(data2)
        assert hash1 != hash2


class TestEstimateArtifactSize:
    """Tests for artifact size estimation"""

    def test_estimate_artifact_size_small(self, sample_artifact_data):
        """Should estimate size correctly for small artifacts"""
        size = estimate_artifact_size(sample_artifact_data)
        assert size > 0
        assert size < DYNAMODB_SIZE_LIMIT

    def test_estimate_artifact_size_large(self, large_artifact_data):
        """Should estimate size correctly for large artifacts"""
        size = estimate_artifact_size(large_artifact_data)
        assert size >= DYNAMODB_SIZE_LIMIT


class TestWriteArtifact:
    """Tests for artifact writing"""

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_small(self, mock_s3, mock_table, sample_artifact_data):
        """Write small artifact (<350KB) to DynamoDB only"""
        # Compute content_hash before writing
        sample_artifact_data['meta']['content_hash'] = compute_content_hash(sample_artifact_data)
        
        # Mock successful PutItem
        mock_table.put_item.return_value = {}

        result = write_artifact(
            artifact_data=sample_artifact_data,
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
        )

        # Verify DynamoDB write was called
        assert mock_table.put_item.called
        call_args = mock_table.put_item.call_args
        assert call_args[1]['ConditionExpression'] == 'attribute_not_exists(#sk)'
        assert call_args[1]['ExpressionAttributeNames'] == {'#sk': 'artifact_sk'}

        # Verify S3 was NOT called
        assert not mock_s3.put_object.called

        # Verify result
        assert result['write_status'] == 'created'
        assert result['artifact_version'] == 'v0001'
        assert not result.get('s3_overflow', False)

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_large_s3_overflow(self, mock_s3, mock_table, large_artifact_data):
        """Write large artifact (>=350KB) to S3 with summary in DynamoDB"""
        # Mock successful PutItem
        mock_table.put_item.return_value = {}

        # Compute content_hash before writing
        from artifact_writer import compute_content_hash
        large_artifact_data['meta']['content_hash'] = compute_content_hash(large_artifact_data)
        
        result = write_artifact(
            artifact_data=large_artifact_data,
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
        )

        # Verify S3 upload was called
        assert mock_s3.put_object.called
        s3_call = mock_s3.put_object.call_args
        assert s3_call[1]['Bucket'] == 'til-artifacts'
        assert 'test-job-id/test_task/v0001/full_artifact.json' in s3_call[1]['Key']

        # Verify DynamoDB write was called with summary
        assert mock_table.put_item.called
        call_args = mock_table.put_item.call_args
        item = call_args[1]['Item']
        assert 'overflow' in item
        assert item['overflow']['s3_payload_ref'] is not None
        assert item['overflow']['payload_sha256'] is not None

        # Verify result
        assert result['write_status'] == 'created'
        assert result['s3_overflow'] is True

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_idempotency_same_content(self, mock_s3, mock_table, sample_artifact_data):
        """Idempotent write with same content hash returns existing artifact"""
        # Compute content_hash before writing
        content_hash = compute_content_hash(sample_artifact_data)
        sample_artifact_data['meta']['content_hash'] = content_hash
        
        # Mock ConditionalCheckFailedException (item exists)
        error = ClientError(
            {'Error': {'Code': 'ConditionalCheckFailedException'}},
            'PutItem'
        )
        mock_table.put_item.side_effect = [error, None]  # First fails, second succeeds (GetItem)

        # Mock GetItem to return existing artifact
        # Use deepcopy to avoid modifying sample_artifact_data (shallow copy shares nested dicts)
        existing_artifact = copy.deepcopy(sample_artifact_data)
        existing_artifact['meta']['content_hash'] = content_hash  # Same hash
        existing_artifact['meta']['schema_version'] = '1.0'
        existing_artifact['meta']['artifact_id'] = 'test-job-id#test_task#v0001'
        existing_artifact['meta']['artifact_version'] = 'v0001'
        existing_artifact['job_id'] = 'test-job-id'
        existing_artifact['artifact_sk'] = 'test_task#v0001'
        mock_table.get_item.return_value = {'Item': existing_artifact}

        result = write_artifact(
            artifact_data=sample_artifact_data,
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            return_existing_on_conflict=True,
        )

        # Verify GetItem was called
        assert mock_table.get_item.called

        # Verify result indicates existing artifact
        assert result['write_status'] == 'existing'

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_idempotency_different_content(self, mock_s3, mock_table, sample_artifact_data):
        """Idempotent write with different content hash increments version"""
        # Mock ConditionalCheckFailedException for v0001
        error = ClientError(
            {'Error': {'Code': 'ConditionalCheckFailedException'}},
            'PutItem'
        )

        # Compute content_hash before writing
        content_hash = compute_content_hash(sample_artifact_data)
        sample_artifact_data['meta']['content_hash'] = content_hash
        
        # First attempt fails (v0001 exists), GetItem returns existing with different hash
        # Use deepcopy to avoid modifying sample_artifact_data (shallow copy shares nested dicts)
        existing_artifact = copy.deepcopy(sample_artifact_data)
        # Use a different valid hash (64 hex chars)
        existing_artifact['meta']['content_hash'] = 'a' * 64  # Different hash
        existing_artifact['meta']['schema_version'] = '1.0'
        existing_artifact['meta']['artifact_id'] = 'test-job-id#test_task#v0001'
        existing_artifact['meta']['artifact_version'] = 'v0001'
        # Make sure existing artifact has the right structure for DynamoDB
        existing_artifact['job_id'] = 'test-job-id'
        existing_artifact['artifact_sk'] = 'test_task#v0001'
        
        # Set up mocks: first put_item fails, get_item returns existing, second put_item succeeds
        # Use a callable side_effect that tracks calls
        put_item_calls = []
        def put_item_side_effect(*args, **kwargs):
            put_item_calls.append(kwargs.get('Item', {}).get('artifact_sk', 'unknown'))
            if len(put_item_calls) == 1:
                # First call (v0001) fails
                raise error
            else:
                # Second call (v0002) succeeds
                return {}
        
        mock_table.put_item.side_effect = put_item_side_effect
        mock_table.get_item.return_value = {'Item': existing_artifact}

        result = write_artifact(
            artifact_data=sample_artifact_data,
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            return_existing_on_conflict=True,
        )

        # Verify GetItem was called (to retrieve existing artifact)
        assert mock_table.get_item.called
        
        # Verify PutItem was called twice (v0001 failed, v0002 succeeded)
        assert mock_table.put_item.call_count == 2, f"Expected 2 put_item calls, got {mock_table.put_item.call_count}. Calls: {put_item_calls}"
        
        # Verify the second call was for v0002
        assert 'test_task#v0002' in put_item_calls, f"Expected v0002 in calls, got: {put_item_calls}"

        # Verify result indicates new version
        assert result['write_status'] == 'created'
        assert result['artifact_version'] == 'v0002'

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_schema_version_mismatch(self, mock_s3, mock_table, sample_artifact_data):
        """Schema version mismatch raises SchemaVersionMismatchError"""
        # Mock ConditionalCheckFailedException
        error = ClientError(
            {'Error': {'Code': 'ConditionalCheckFailedException'}},
            'PutItem'
        )
        mock_table.put_item.side_effect = error

        # Compute content_hash before writing
        content_hash = compute_content_hash(sample_artifact_data)
        sample_artifact_data['meta']['content_hash'] = content_hash

        # Mock GetItem to return existing artifact with different schema version
        # Use deepcopy to avoid modifying sample_artifact_data (shallow copy shares nested dicts)
        existing_artifact = copy.deepcopy(sample_artifact_data)
        existing_artifact['meta']['content_hash'] = content_hash  # Same hash
        existing_artifact['meta']['schema_version'] = '2.0'  # Different version
        existing_artifact['meta']['artifact_id'] = 'test-job-id#test_task#v0001'
        existing_artifact['meta']['artifact_version'] = 'v0001'
        # Make sure existing artifact has the right structure for DynamoDB
        existing_artifact['job_id'] = 'test-job-id'
        existing_artifact['artifact_sk'] = 'test_task#v0001'
        mock_table.get_item.return_value = {'Item': existing_artifact}

        with pytest.raises(SchemaVersionMismatchError) as exc_info:
            write_artifact(
                artifact_data=sample_artifact_data,
                job_id='test-job-id',
                task_id='test_task',
                artifact_version='v0001',
                return_existing_on_conflict=True,
            )
        
        # Verify the error message mentions schema version mismatch
        assert 'schema version mismatch' in str(exc_info.value).lower() or '2.0' in str(exc_info.value)

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_validation_failure(self, mock_s3, mock_table):
        """Invalid artifact data raises ArtifactValidationError"""
        invalid_data = {'invalid': 'data'}

        with pytest.raises(ArtifactValidationError):
            write_artifact(
                artifact_data=invalid_data,
                job_id='test-job-id',
                task_id='test_task',
            )

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_task_id_validation(self, mock_s3, mock_table, sample_artifact_data):
        """Invalid task_id raises ValueError"""
        # Compute content_hash before writing
        sample_artifact_data['meta']['content_hash'] = compute_content_hash(sample_artifact_data)
        
        # Test reserved prefix
        with pytest.raises(ValueError, match="cannot start with 'latest_' or 'meta_'"):
            write_artifact(
                artifact_data=sample_artifact_data,
                job_id='test-job-id',
                task_id='latest_task',  # Invalid
            )

        # Test '#' character
        with pytest.raises(ValueError, match="cannot contain '#'"):
            write_artifact(
                artifact_data=sample_artifact_data,
                job_id='test-job-id',
                task_id='task#id',  # Invalid
            )

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_auto_version_increment(self, mock_s3, mock_table, sample_artifact_data):
        """Auto-increment version when not provided"""
        mock_table.put_item.return_value = {}

        # Compute content_hash before writing
        from artifact_writer import compute_content_hash
        sample_artifact_data['meta']['content_hash'] = compute_content_hash(sample_artifact_data)
        
        result = write_artifact(
            artifact_data=sample_artifact_data,
            job_id='test-job-id',
            task_id='test_task',
            artifact_version=None,  # Auto-increment
        )

        # Verify version was set to v0001
        assert result['artifact_version'] == 'v0001'

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_write_artifact_zero_padded_versions(self, mock_s3, mock_table, sample_artifact_data):
        """Versions should be zero-padded to 4 digits for lexicographic sorting"""
        # Compute content_hash before writing
        sample_artifact_data['meta']['content_hash'] = compute_content_hash(sample_artifact_data)
        
        mock_table.put_item.return_value = {}

        result = write_artifact(
            artifact_data=sample_artifact_data,
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
        )

        # Verify sort key uses zero-padded version
        call_args = mock_table.put_item.call_args
        item = call_args[1]['Item']
        assert item['artifact_sk'] == 'test_task#v0001'
        assert item['meta']['artifact_version'] == 'v0001'


class TestGetArtifact:
    """Tests for artifact retrieval"""

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_get_artifact_with_version(self, mock_s3, mock_table, sample_artifact_data):
        """Get artifact by specific version"""
        mock_table.get_item.return_value = {'Item': sample_artifact_data}

        result = get_artifact(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
        )

        assert result is not None
        assert result['meta']['artifact_id'] == sample_artifact_data['meta']['artifact_id']

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_get_artifact_latest_version(self, mock_s3, mock_table, sample_artifact_data):
        """Get latest artifact version via Query"""
        # Mock Query for latest version
        mock_table.query.return_value = {'Items': [sample_artifact_data]}

        result = get_artifact(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version=None,  # Latest
        )

        assert result is not None
        assert mock_table.query.called

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_get_artifact_with_s3_overflow(self, mock_s3, mock_table, sample_artifact_data):
        """Get artifact with S3 overflow fetches from S3"""
        # Add overflow metadata
        artifact_with_overflow = sample_artifact_data.copy()
        artifact_with_overflow['overflow'] = {
            's3_payload_ref': 'test-job-id/test_task/v0001/full_artifact.json',
            'payload_sha256': 'test-hash',
            'payload_size_bytes': 500000,
        }

        # Mock DynamoDB GetItem
        mock_table.get_item.return_value = {'Item': artifact_with_overflow}

        # Mock S3 GetObject
        full_artifact = sample_artifact_data.copy()
        full_artifact['data'] = {'large': 'content'}
        mock_s3.get_object.return_value = {
            'Body': MagicMock(read=lambda: json.dumps(full_artifact).encode('utf-8'))
        }

        result = get_artifact(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
        )

        # Verify S3 was called
        assert mock_s3.get_object.called

        # Verify data was merged from S3
        assert result['data'] == full_artifact['data']

    @patch('artifact_writer.table')
    @patch('artifact_writer.s3_client')
    def test_get_artifact_not_found(self, mock_s3, mock_table):
        """Get artifact returns None if not found"""
        mock_table.get_item.return_value = {}

        result = get_artifact(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
        )

        assert result is None


class TestListArtifactsForJob:
    """Tests for listing artifacts"""

    @patch('artifact_writer.table')
    def test_list_artifacts_for_job(self, mock_table, sample_artifact_data):
        """List all artifacts for a job returns metadata only"""
        # Mock Query
        mock_table.query.return_value = {
            'Items': [sample_artifact_data, sample_artifact_data.copy()]
        }

        result = list_artifacts_for_job('test-job-id')

        # Verify Query was called
        assert mock_table.query.called

        # Verify result contains metadata only
        assert len(result) == 2
        assert 'artifact_id' in result[0]
        assert 'task_id' in result[0]
        assert 'artifact_version' in result[0]
        # Should NOT include full data payload
        assert 'data' not in result[0] or isinstance(result[0].get('data'), dict) is False
