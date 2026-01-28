"""
Unit Tests for Artifact Reader Library
Story 6.1: DynamoDB Scratch Artifacts Storage

Tests artifact retrieval, latest version lookup, and S3 overflow handling.
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Import the module under test
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from artifact_reader import get_artifact, list_artifacts_for_job


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
        'job_id': 'test-job-id',
        'artifact_sk': 'test-task#v0001',
        'meta': {
            'artifact_id': 'test-job-id#test-task#v0001',
            'job_id': 'test-job-id',
            'task_id': 'test-task',
            'artifact_version': 'v0001',
            'artifact_type': 'evidence_bundle',
            'status': 'completed',
            'spawned_at': datetime.utcnow().isoformat(),
        },
        'data': {
            'evidence': ['Evidence 1', 'Evidence 2'],
        },
        'overflow': {},
    }


class TestGetArtifact:
    """Tests for artifact retrieval"""

    @patch('artifact_reader.table')
    @patch('artifact_reader.s3_client')
    def test_get_artifact_with_version(self, mock_s3, mock_table, sample_artifact_data):
        """Get artifact by specific version"""
        mock_table.get_item.return_value = {'Item': sample_artifact_data}

        result = get_artifact(
            job_id='test-job-id',
            task_id='test-task',
            artifact_version='v0001',
        )

        assert result is not None
        assert result['meta']['artifact_id'] == sample_artifact_data['meta']['artifact_id']

        # Verify GetItem was called with correct key
        assert mock_table.get_item.called
        call_args = mock_table.get_item.call_args
        assert call_args[1]['Key']['job_id'] == 'test-job-id'
        assert call_args[1]['Key']['artifact_sk'] == 'test-task#v0001'

    @patch('artifact_reader.table')
    @patch('artifact_reader.s3_client')
    def test_get_artifact_latest_via_pointer(self, mock_s3, mock_table, sample_artifact_data):
        """Get latest artifact via latest pointer (Option 1 - fast)"""
        # Mock latest pointer
        latest_pointer = {
            'job_id': 'test-job-id',
            'artifact_sk': 'latest#test-task',
            'latest_version': 'v0002',
            'latest_artifact_id': 'test-job-id#test-task#v0002',
        }
        mock_table.get_item.side_effect = [
            {'Item': latest_pointer},  # Latest pointer lookup
            {'Item': sample_artifact_data},  # Actual artifact lookup
        ]

        result = get_artifact(
            job_id='test-job-id',
            task_id='test-task',
            artifact_version=None,  # Latest
        )

        assert result is not None
        # Verify GetItem was called twice (pointer + artifact)
        assert mock_table.get_item.call_count == 2

    @patch('artifact_reader.table')
    @patch('artifact_reader.s3_client')
    def test_get_artifact_latest_via_query(self, mock_s3, mock_table, sample_artifact_data):
        """Get latest artifact via Query fallback (Option 2)"""
        # Mock latest pointer not found
        mock_table.get_item.side_effect = [
            {},  # Latest pointer not found
        ]

        # Mock Query for latest version
        mock_table.query.return_value = {'Items': [sample_artifact_data]}

        result = get_artifact(
            job_id='test-job-id',
            task_id='test-task',
            artifact_version=None,  # Latest
        )

        assert result is not None
        # Verify Query was called
        assert mock_table.query.called
        call_args = mock_table.query.call_args
        assert call_args[1]['KeyConditionExpression'] == 'job_id = :job_id'
        assert call_args[1]['ScanIndexForward'] is False  # Descending order

    @patch('artifact_reader.table')
    @patch('artifact_reader.s3_client')
    def test_get_artifact_with_s3_overflow(self, mock_s3, mock_table, sample_artifact_data):
        """Get artifact with S3 overflow fetches from S3"""
        # Add overflow metadata
        artifact_with_overflow = sample_artifact_data.copy()
        artifact_with_overflow['overflow'] = {
            's3_payload_ref': 'test-job-id/test-task/v0001/full_artifact.json',
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
            task_id='test-task',
            artifact_version='v0001',
        )

        # Verify S3 was called
        assert mock_s3.get_object.called
        s3_call = mock_s3.get_object.call_args
        assert s3_call[1]['Bucket'] == 'til-artifacts'
        assert s3_call[1]['Key'] == 'test-job-id/test-task/v0001/full_artifact.json'

        # Verify data was merged from S3
        assert result['data'] == full_artifact['data']

    @patch('artifact_reader.table')
    @patch('artifact_reader.s3_client')
    def test_get_artifact_s3_fetch_failure(self, mock_s3, mock_table, sample_artifact_data):
        """S3 fetch failure returns artifact with summary only"""
        # Add overflow metadata
        artifact_with_overflow = sample_artifact_data.copy()
        artifact_with_overflow['overflow'] = {
            's3_payload_ref': 'test-job-id/test-task/v0001/full_artifact.json',
        }

        # Mock DynamoDB GetItem
        mock_table.get_item.return_value = {'Item': artifact_with_overflow}

        # Mock S3 GetObject failure
        mock_s3.get_object.side_effect = Exception('S3 error')

        result = get_artifact(
            job_id='test-job-id',
            task_id='test-task',
            artifact_version='v0001',
        )

        # Should still return artifact (with summary only)
        assert result is not None
        assert 'data' in result

    @patch('artifact_reader.table')
    @patch('artifact_reader.s3_client')
    def test_get_artifact_not_found(self, mock_s3, mock_table):
        """Get artifact returns None if not found"""
        mock_table.get_item.return_value = {}

        result = get_artifact(
            job_id='test-job-id',
            task_id='test-task',
            artifact_version='v0001',
        )

        assert result is None


class TestListArtifactsForJob:
    """Tests for listing artifacts"""

    @patch('artifact_reader.table')
    def test_list_artifacts_for_job_metadata_only(self, mock_table, sample_artifact_data):
        """List artifacts returns metadata only by default"""
        # Mock Query
        mock_table.query.return_value = {
            'Items': [sample_artifact_data, sample_artifact_data.copy()]
        }

        result = list_artifacts_for_job('test-job-id', include_data=False)

        # Verify Query was called
        assert mock_table.query.called
        call_args = mock_table.query.call_args
        assert call_args[1]['KeyConditionExpression'] == 'job_id = :job_id'

        # Verify result contains metadata only
        assert len(result) == 2
        assert 'artifact_id' in result[0]
        assert 'task_id' in result[0]
        assert 'artifact_version' in result[0]
        # Should NOT include full data payload
        assert 'data' not in result[0] or not isinstance(result[0].get('data'), dict)

    @patch('artifact_reader.table')
    def test_list_artifacts_for_job_with_data(self, mock_table, sample_artifact_data):
        """List artifacts with include_data=True returns full artifacts"""
        # Mock Query
        mock_table.query.return_value = {
            'Items': [sample_artifact_data]
        }

        result = list_artifacts_for_job('test-job-id', include_data=True)

        # Verify result contains full artifacts
        assert len(result) == 1
        assert 'data' in result[0]
        assert result[0]['data'] == sample_artifact_data['data']

    @patch('artifact_reader.table')
    def test_list_artifacts_for_job_empty(self, mock_table):
        """List artifacts returns empty list if no artifacts found"""
        mock_table.query.return_value = {'Items': []}

        result = list_artifacts_for_job('test-job-id')

        assert result == []
