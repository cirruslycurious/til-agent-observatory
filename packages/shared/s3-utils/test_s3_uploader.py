"""
Unit Tests for S3 Uploader Library
Story 6.3: S3 Storage for Large Artifacts

Tests use moto to mock S3 (no AWS account needed).
"""

import pytest
import json
import gzip
import hashlib
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError
import boto3
from moto import mock_s3

# Import S3 uploader
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from s3_uploader import (
    upload_artifact_to_s3,
    upload_tool_results_to_s3,
    download_artifact_from_s3,
    S3UploadError,
    S3DownloadError,
    HashMismatchError,
    canonical_json_serialize,
    compute_sha256_hash,
)


@pytest.fixture
def s3_bucket():
    """Create a mock S3 bucket for testing"""
    with mock_s3():
        s3_client = boto3.client('s3', region_name='us-east-1')
        bucket_name = 'your-artifacts-bucket'
        s3_client.create_bucket(Bucket=bucket_name)
        
        # Set environment variable for S3 uploader
        import os
        os.environ['ARTIFACTS_BUCKET_NAME'] = bucket_name
        
        yield bucket_name
        
        # Cleanup
        if 'ARTIFACTS_BUCKET_NAME' in os.environ:
            del os.environ['ARTIFACTS_BUCKET_NAME']


@pytest.fixture
def sample_artifact_data():
    """Sample artifact data for testing"""
    return {
        'meta': {
            'artifact_id': 'test-job-id#test_task#v0001',
            'job_id': 'test-job-id',
            'task_id': 'test_task',
            'artifact_version': 'v0001',
        },
        'data': {
            'content': 'Sample artifact content',
        },
        'quality_signals': {
            'confidence': 0.9,
            'coverage': 'comprehensive',
        },
        'provenance': {
            'sources': ['source1'],
            'claims': [{'claim': 'test claim'}],
            'tool_calls': [],
            'inputs': {},
        },
    }


@pytest.fixture
def large_artifact_data():
    """Large artifact data (>=350KB) for testing"""
    # Create artifact with large data field
    data = {
        'meta': {
            'artifact_id': 'test-job-id#test_task#v0001',
            'job_id': 'test-job-id',
            'task_id': 'test_task',
            'artifact_version': 'v0001',
        },
        'data': {
            'content': 'x' * (400 * 1024),  # 400KB of data
        },
        'quality_signals': {
            'confidence': 0.9,
            'coverage': 'comprehensive',
        },
        'provenance': {
            'sources': ['source1'],
            'claims': [{'claim': 'test claim'}],
            'tool_calls': [],
            'inputs': {},
        },
    }
    return data


class TestCanonicalJsonSerialize:
    """Tests for canonical JSON serialization"""
    
    def test_canonical_json_serialize_deterministic(self):
        """Canonical JSON serialization is deterministic (same input = same output)"""
        data = {'b': 2, 'a': 1, 'c': 3}
        result1 = canonical_json_serialize(data)
        result2 = canonical_json_serialize(data)
        
        assert result1 == result2
        assert json.loads(result1.decode('utf-8')) == {'a': 1, 'b': 2, 'c': 3}  # Keys sorted
    
    def test_canonical_json_serialize_utf8(self):
        """Canonical JSON serialization uses UTF-8 encoding"""
        data = {'text': 'Hello 世界'}
        result = canonical_json_serialize(data)
        
        assert isinstance(result, bytes)
        assert json.loads(result.decode('utf-8')) == data


class TestComputeSha256Hash:
    """Tests for SHA-256 hash computation"""
    
    def test_compute_sha256_hash(self):
        """SHA-256 hash computation works correctly"""
        data = b'test data'
        hash1 = compute_sha256_hash(data)
        hash2 = compute_sha256_hash(data)
        
        assert len(hash1) == 64  # SHA-256 hex string is 64 characters
        assert hash1 == hash2  # Deterministic
        assert hash1 == hashlib.sha256(data).hexdigest()


class TestUploadArtifactToS3:
    """Tests for upload_artifact_to_s3"""
    
    def test_upload_artifact_small_no_upload(self, s3_bucket, sample_artifact_data):
        """Small artifacts (<350KB) return None (no S3 upload)"""
        result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=sample_artifact_data,
        )
        
        assert result is None
    
    def test_upload_artifact_large_upload_succeeds(self, s3_bucket, large_artifact_data):
        """Large artifacts (>=350KB) upload to S3 successfully"""
        result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        assert result is not None
        assert 's3_key' in result
        assert 'payload_sha256' in result
        assert 'payload_size_bytes' in result
        assert 'compressed' in result
        assert result['compressed'] is True  # Should compress if >10KB
        assert result['s3_key'] == 'test-job-id/test_task/v0001/full_artifact.json'
        
        # Verify S3 object exists
        s3_client = boto3.client('s3', region_name='us-east-1')
        response = s3_client.head_object(Bucket=s3_bucket, Key=result['s3_key'])
        assert response['ContentType'] == 'application/json'
        assert response['ContentEncoding'] == 'gzip'
    
    def test_upload_artifact_compression_disabled(self, s3_bucket, large_artifact_data):
        """Artifact upload without compression works"""
        result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=False,
        )
        
        assert result is not None
        assert result['compressed'] is False
        
        # Verify S3 object exists without Content-Encoding
        s3_client = boto3.client('s3', region_name='us-east-1')
        response = s3_client.head_object(Bucket=s3_bucket, Key=result['s3_key'])
        assert 'ContentEncoding' not in response
    
    def test_upload_artifact_s3_upload_fails(self, s3_bucket, large_artifact_data):
        """S3 upload failure raises S3UploadError"""
        # Mock S3 client to raise error
        with patch('s3_uploader.s3_client') as mock_s3:
            mock_s3.put_object.side_effect = ClientError(
                {'Error': {'Code': 'AccessDenied', 'Message': 'Access denied'}},
                'PutObject'
            )
            
            with pytest.raises(S3UploadError):
                upload_artifact_to_s3(
                    job_id='test-job-id',
                    task_id='test_task',
                    artifact_version='v0001',
                    artifact_data=large_artifact_data,
                )
    
    def test_upload_artifact_hash_verification(self, s3_bucket, large_artifact_data):
        """Uploaded artifact hash matches expected hash"""
        result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        # Download and verify hash
        downloaded = download_artifact_from_s3(result['s3_key'], result['payload_sha256'])
        assert downloaded == large_artifact_data


class TestUploadToolResultsToS3:
    """Tests for upload_tool_results_to_s3"""
    
    def test_upload_tool_results_small_no_upload(self, s3_bucket):
        """Small tool results (<=50KB) return None (no S3 upload)"""
        tool_results = {'results': 'x' * (40 * 1024)}  # 40KB
        
        result = upload_tool_results_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            tool_results=tool_results,
            tool_name='web_search',
            tool_call_id='tool_call_123',
        )
        
        assert result is None
    
    def test_upload_tool_results_large_upload_succeeds(self, s3_bucket):
        """Large tool results (>50KB) upload to S3 successfully"""
        tool_results = {'results': 'x' * (60 * 1024)}  # 60KB
        
        result = upload_tool_results_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            tool_results=tool_results,
            tool_name='web_search',
            tool_call_id='tool_call_123',
        )
        
        assert result is not None
        assert 's3_key' in result
        assert 'tool_results_hash' in result
        assert 'tool_results_size_bytes' in result
        assert 'tool_results/tool_call_123.json' in result['s3_key']
        
        # Verify S3 object exists
        s3_client = boto3.client('s3', region_name='us-east-1')
        response = s3_client.head_object(Bucket=s3_bucket, Key=result['s3_key'])
        assert response['ContentType'] == 'application/json'
    
    def test_upload_tool_results_s3_upload_fails(self, s3_bucket):
        """S3 upload failure raises S3UploadError"""
        tool_results = {'results': 'x' * (60 * 1024)}  # 60KB
        
        # Mock S3 client to raise error
        with patch('s3_uploader.s3_client') as mock_s3:
            mock_s3.put_object.side_effect = ClientError(
                {'Error': {'Code': 'AccessDenied', 'Message': 'Access denied'}},
                'PutObject'
            )
            
            with pytest.raises(S3UploadError):
                upload_tool_results_to_s3(
                    job_id='test-job-id',
                    task_id='test_task',
                    artifact_version='v0001',
                    tool_results=tool_results,
                    tool_name='web_search',
                    tool_call_id='tool_call_123',
                )


class TestDownloadArtifactFromS3:
    """Tests for download_artifact_from_s3"""
    
    def test_download_artifact_success(self, s3_bucket, large_artifact_data):
        """Download artifact from S3 succeeds"""
        # Upload artifact first
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        # Download artifact
        downloaded = download_artifact_from_s3(
            upload_result['s3_key'],
            expected_hash=upload_result['payload_sha256'],
        )
        
        assert downloaded == large_artifact_data
    
    def test_download_artifact_missing_object(self, s3_bucket):
        """Download missing object raises S3DownloadError"""
        with pytest.raises(S3DownloadError) as exc_info:
            download_artifact_from_s3('nonexistent/key.json')
        
        assert 'not found' in str(exc_info.value).lower()
    
    def test_download_artifact_hash_mismatch(self, s3_bucket, large_artifact_data):
        """Download with hash mismatch raises HashMismatchError"""
        # Upload artifact first
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        # Download with wrong hash
        with pytest.raises(HashMismatchError) as exc_info:
            download_artifact_from_s3(
                upload_result['s3_key'],
                expected_hash='a' * 64,  # Wrong hash
            )
        
        assert 'Hash mismatch' in str(exc_info.value)
    
    def test_download_artifact_no_hash_verification(self, s3_bucket, large_artifact_data):
        """Download without hash verification works"""
        # Upload artifact first
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        # Download without hash verification
        downloaded = download_artifact_from_s3(upload_result['s3_key'])
        
        assert downloaded == large_artifact_data
    
    def test_download_artifact_decompression(self, s3_bucket, large_artifact_data):
        """Downloaded compressed artifact is decompressed correctly"""
        # Upload with compression
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        # Download and verify decompression
        downloaded = download_artifact_from_s3(
            upload_result['s3_key'],
            expected_hash=upload_result['payload_sha256'],
        )
        
        assert downloaded == large_artifact_data
        assert downloaded['data']['content'] == large_artifact_data['data']['content']


class TestAtomicOperations:
    """Tests for atomic operations (S3 upload must succeed before DynamoDB write)"""
    
    def test_atomic_operation_s3_failure_no_dynamodb_write(self, s3_bucket, large_artifact_data):
        """If S3 upload fails, exception is raised (DynamoDB write should not happen)"""
        # Mock S3 client to raise error
        with patch('s3_uploader.s3_client') as mock_s3:
            mock_s3.put_object.side_effect = ClientError(
                {'Error': {'Code': 'AccessDenied', 'Message': 'Access denied'}},
                'PutObject'
            )
            
            # Should raise S3UploadError (atomic operation - no DynamoDB write)
            with pytest.raises(S3UploadError):
                upload_artifact_to_s3(
                    job_id='test-job-id',
                    task_id='test_task',
                    artifact_version='v0001',
                    artifact_data=large_artifact_data,
                )
            
            # Verify S3 put_object was called (but failed)
            assert mock_s3.put_object.called
