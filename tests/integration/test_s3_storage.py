"""
Integration Tests for S3 Storage
Story 6.3: S3 Storage for Large Artifacts

Test Requirements:
- Test artifact write → S3 upload → DynamoDB write → artifact read → S3 download (full workflow)
- Test tool results upload and retrieval
- Test hash verification on download
- Test error handling (S3 upload failure, missing object, hash mismatch)
- Test atomic operations (S3 upload fails, DynamoDB not updated)
- Test large payload guardrails (presigned URLs for >5MB)
- Use moto for S3 and DynamoDB mocking (no AWS account needed)
"""

import pytest
import boto3
import json
import os
from decimal import Decimal
from moto import mock_aws  # Newer moto API uses mock_aws instead of mock_s3, mock_dynamodb
from datetime import datetime, timedelta, timezone

# Import modules under test
import sys
from pathlib import Path

# Add parent directories to path (same pattern as unit tests)
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root / 'packages' / 'shared' / 's3-utils'))
sys.path.append(str(project_root / 'packages' / 'shared' / 'artifact-writer'))
sys.path.append(str(project_root / 'packages' / 'shared' / 'artifact-reader'))

from s3_uploader import (
    upload_artifact_to_s3,
    upload_tool_results_to_s3,
    download_artifact_from_s3,
    S3UploadError,
    S3DownloadError,
    HashMismatchError,
)
from artifact_writer import write_artifact, ArtifactValidationError
from artifact_reader import get_artifact


# Test configuration
S3_BUCKET_NAME = 'your-artifacts-bucket'
ARTIFACTS_TABLE_NAME = 'til-artifacts'
REGION = 'us-east-1'


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials"""
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = REGION
    os.environ['ARTIFACTS_BUCKET_NAME'] = S3_BUCKET_NAME
    os.environ['ARTIFACTS_TABLE_NAME'] = ARTIFACTS_TABLE_NAME
    yield
    # Cleanup
    for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SECURITY_TOKEN', 
                'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION', 'ARTIFACTS_BUCKET_NAME', 'ARTIFACTS_TABLE_NAME']:
        if key in os.environ:
            del os.environ[key]


@pytest.fixture
def aws_mock(aws_credentials):
    """Create mock AWS environment (S3 and DynamoDB)"""
    with mock_aws():
        # Create S3 bucket
        s3_client = boto3.client('s3', region_name=REGION)
        s3_client.create_bucket(Bucket=S3_BUCKET_NAME)
        
        # Create DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        table = dynamodb.create_table(
            TableName=ARTIFACTS_TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'job_id', 'KeyType': 'HASH'},
                {'AttributeName': 'artifact_sk', 'KeyType': 'RANGE'},
            ],
            AttributeDefinitions=[
                {'AttributeName': 'job_id', 'AttributeType': 'S'},
                {'AttributeName': 'artifact_sk', 'AttributeType': 'S'},
            ],
            BillingMode='PAY_PER_REQUEST',
        )
        table.wait_until_exists()
        
        yield {
            's3_bucket': S3_BUCKET_NAME,
            'dynamodb_table': table,
        }


@pytest.fixture
def s3_bucket(aws_mock):
    """Get S3 bucket name from aws_mock"""
    return aws_mock['s3_bucket']


@pytest.fixture
def dynamodb_table(aws_mock):
    """Get DynamoDB table from aws_mock"""
    return aws_mock['dynamodb_table']


@pytest.fixture
def large_artifact_data():
    """Large artifact data (>=350KB) for testing"""
    from artifact_writer import compute_content_hash
    
    artifact_data = {
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
            'content': 'x' * (400 * 1024),  # 400KB of data
        },
        'quality_signals': {
            'confidence': 0.9,  # Float - boto3.resource will convert to Decimal for DynamoDB
            'coverage': 'comprehensive',
        },
        'provenance': {
            'sources': [
                {
                    'id': 'source-1',
                    'type': 'web',
                    'uri': 'https://example.com/source1',
                    'snippet': 'Test snippet',
                    'captured_at': datetime.now(timezone.utc).isoformat(),
                }
            ],
            'claims': [
                {
                    'claim': 'test claim',
                    'confidence': 0.9,
                    'source_refs': [0],
                }
            ],
            'tool_calls': [],
            'inputs': {},
        },
    }
    
    # Compute content hash
    artifact_data['meta']['content_hash'] = compute_content_hash(artifact_data)
    
    return artifact_data


@pytest.fixture
def small_artifact_data():
    """Small artifact data (<350KB) for testing"""
    from artifact_writer import compute_content_hash
    
    artifact_data = {
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
            'content': 'Small artifact content',
        },
        'quality_signals': {
            'confidence': 0.9,  # Float - boto3.resource will convert to Decimal for DynamoDB
            'coverage': 'comprehensive',
        },
        'provenance': {
            'sources': [
                {
                    'id': 'source-1',
                    'type': 'web',
                    'uri': 'https://example.com/source1',
                    'snippet': 'Test snippet',
                    'captured_at': datetime.now(timezone.utc).isoformat(),
                }
            ],
            'claims': [
                {
                    'claim': 'test claim',
                    'confidence': 0.9,
                    'source_refs': [0],
                }
            ],
            'tool_calls': [],
            'inputs': {},
        },
    }
    
    # Compute content hash
    artifact_data['meta']['content_hash'] = compute_content_hash(artifact_data)
    
    return artifact_data


class TestArtifactWriteAndReadWorkflow:
    """Test end-to-end artifact write → S3 upload → DynamoDB write → read → S3 download"""
    
    def test_large_artifact_full_workflow(self, s3_bucket, dynamodb_table, large_artifact_data):
        """Test full workflow: write large artifact → S3 upload → DynamoDB write → read → S3 download"""
        job_id = 'test-job-id'
        task_id = 'test_task'
        
        # Write artifact (should trigger S3 upload)
        result = write_artifact(
            artifact_data=large_artifact_data,
            job_id=job_id,
            task_id=task_id,
            artifact_version='v0001',
            return_existing_on_conflict=True,
        )
        
        # Verify write succeeded
        assert result['write_status'] == 'created'
        assert result['s3_overflow'] is True
        
        # Verify S3 object exists
        s3_client = boto3.client('s3', region_name=REGION)
        s3_key = f"{job_id}/{task_id}/v0001/full_artifact.json"
        response = s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        assert response['ContentType'] == 'application/json'
        assert response['ContentEncoding'] == 'gzip'  # Should be compressed
        
        # Verify DynamoDB item exists with overflow metadata
        artifact = dynamodb_table.get_item(
            Key={
                'job_id': job_id,
                'artifact_sk': f"{task_id}#v0001",
            }
        )
        assert 'Item' in artifact
        item = artifact['Item']
        assert 'overflow' in item
        assert item['overflow']['s3_payload_ref'] == s3_key
        assert 'payload_sha256' in item['overflow']
        assert item['overflow']['compressed'] is True
        
        # Read artifact (should download from S3 and merge data back)
        retrieved = get_artifact(job_id, task_id, 'v0001')
        
        assert retrieved is not None
        # Verify data was retrieved from S3 (should match original large content)
        assert 'data' in retrieved
        # The artifact reader downloads from S3 and merges the full data back
        # Verify the full content was restored (not the summary)
        # Check data size - should be large (full content), not small (summary)
        retrieved_data_size = len(json.dumps(retrieved['data']))
        original_data_size = len(json.dumps(large_artifact_data['data']))
        # Should be close to original size (full content restored from S3)
        assert retrieved_data_size >= original_data_size * 0.9  # Allow for some JSON formatting differences
        assert retrieved['overflow']['s3_payload_ref'] == s3_key
    
    def test_small_artifact_no_s3_upload(self, s3_bucket, dynamodb_table, small_artifact_data):
        """Test small artifact (<350KB) stored in DynamoDB only (no S3 upload)"""
        job_id = 'test-job-id'
        task_id = 'test_task'
        
        # Write artifact (should NOT trigger S3 upload)
        result = write_artifact(
            artifact_data=small_artifact_data,
            job_id=job_id,
            task_id=task_id,
            artifact_version='v0001',
            return_existing_on_conflict=True,
        )
        
        # Verify write succeeded
        assert result['write_status'] == 'created'
        assert result['s3_overflow'] is False
        
        # Verify S3 object does NOT exist
        s3_client = boto3.client('s3', region_name=REGION)
        s3_key = f"{job_id}/{task_id}/v0001/full_artifact.json"
        with pytest.raises(Exception):  # Should raise NoSuchKey or similar
            s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        
        # Verify DynamoDB item exists WITHOUT overflow metadata
        artifact = dynamodb_table.get_item(
            Key={
                'job_id': job_id,
                'artifact_sk': f"{task_id}#v0001",
            }
        )
        assert 'Item' in artifact
        item = artifact['Item']
        assert 'overflow' not in item or item.get('overflow', {}).get('s3_payload_ref') is None
        
        # Read artifact (should come from DynamoDB only)
        retrieved = get_artifact(job_id, task_id, 'v0001')
        
        assert retrieved is not None
        assert retrieved['data']['content'] == small_artifact_data['data']['content']


class TestAtomicOperations:
    """Test atomic operations (S3 upload must succeed before DynamoDB write)"""
    
    def test_s3_upload_failure_prevents_dynamodb_write(self, s3_bucket, dynamodb_table, large_artifact_data):
        """Test that S3 upload failure prevents DynamoDB write (atomic operation)"""
        from unittest.mock import patch
        from botocore.exceptions import ClientError
        
        job_id = 'test-job-id'
        task_id = 'test_task'
        
        # Mock S3 client to raise error on upload
        with patch('s3_uploader.s3_client') as mock_s3_client:
            mock_s3_client.put_object.side_effect = ClientError(
                {'Error': {'Code': 'AccessDenied', 'Message': 'Access denied'}},
                'PutObject'
            )
            
            # Write should fail with S3UploadError
            with pytest.raises(ArtifactValidationError) as exc_info:
                write_artifact(
                    artifact_data=large_artifact_data,
                    job_id=job_id,
                    task_id=task_id,
                    artifact_version='v0001',
                    return_existing_on_conflict=True,
                )
            
            assert 'S3 upload failed' in str(exc_info.value)
        
        # Verify DynamoDB item was NOT created
        artifact = dynamodb_table.get_item(
            Key={
                'job_id': job_id,
                'artifact_sk': f"{task_id}#v0001",
            }
        )
        assert 'Item' not in artifact


class TestHashVerification:
    """Test hash verification on download"""
    
    def test_hash_verification_success(self, s3_bucket, large_artifact_data):
        """Test successful hash verification on download"""
        # Upload artifact
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        assert upload_result is not None
        
        # Download with hash verification (should succeed)
        downloaded = download_artifact_from_s3(
            upload_result['s3_key'],
            expected_hash=upload_result['payload_sha256'],
        )
        
        assert downloaded == large_artifact_data
    
    def test_hash_verification_failure(self, s3_bucket, large_artifact_data):
        """Test hash verification failure raises HashMismatchError"""
        # Upload artifact
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        assert upload_result is not None
        
        # Download with wrong hash (should fail)
        with pytest.raises(HashMismatchError) as exc_info:
            download_artifact_from_s3(
                upload_result['s3_key'],
                expected_hash='a' * 64,  # Wrong hash
            )
        
        assert 'Hash mismatch' in str(exc_info.value)


class TestToolResultsUpload:
    """Test tool results upload and retrieval"""
    
    def test_tool_results_large_upload(self, s3_bucket):
        """Test large tool results (>50KB) upload to S3"""
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
        assert 'tool_results/tool_call_123.json' in result['s3_key']
        
        # Verify S3 object exists
        s3_client = boto3.client('s3', region_name=REGION)
        response = s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=result['s3_key'])
        assert response['ContentType'] == 'application/json'
    
    def test_tool_results_small_no_upload(self, s3_bucket):
        """Test small tool results (<=50KB) return None (no S3 upload)"""
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


class TestErrorHandling:
    """Test error handling scenarios"""
    
    def test_missing_s3_object(self, s3_bucket):
        """Test download of missing S3 object raises S3DownloadError"""
        with pytest.raises(S3DownloadError) as exc_info:
            download_artifact_from_s3('nonexistent/key.json')
        
        assert 'not found' in str(exc_info.value).lower()
    
    def test_s3_upload_error_handling(self, s3_bucket, large_artifact_data):
        """Test S3 upload error handling"""
        from unittest.mock import patch
        from botocore.exceptions import ClientError
        
        # Mock S3 client to raise error
        with patch('s3_uploader.s3_client') as mock_s3_client:
            mock_s3_client.put_object.side_effect = ClientError(
                {'Error': {'Code': 'ServiceUnavailable', 'Message': 'Service unavailable'}},
                'PutObject'
            )
            
            with pytest.raises(S3UploadError) as exc_info:
                upload_artifact_to_s3(
                    job_id='test-job-id',
                    task_id='test_task',
                    artifact_version='v0001',
                    artifact_data=large_artifact_data,
                )
            
            assert 'S3 upload failed' in str(exc_info.value)


class TestCompression:
    """Test compression and decompression"""
    
    def test_compression_enabled(self, s3_bucket, large_artifact_data):
        """Test that large artifacts are compressed"""
        upload_result = upload_artifact_to_s3(
            job_id='test-job-id',
            task_id='test_task',
            artifact_version='v0001',
            artifact_data=large_artifact_data,
            compress=True,
        )
        
        assert upload_result is not None
        assert upload_result['compressed'] is True
        
        # Verify S3 object has Content-Encoding: gzip
        s3_client = boto3.client('s3', region_name=REGION)
        response = s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=upload_result['s3_key'])
        assert response['ContentEncoding'] == 'gzip'
    
    def test_decompression_on_download(self, s3_bucket, large_artifact_data):
        """Test that compressed artifacts are decompressed on download"""
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


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
