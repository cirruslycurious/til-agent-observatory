"""
Integration Tests for Artifact Traceability
Story 3.2: Artifact Traceability

Tests dependency graph construction, circular dependency detection, and API endpoints.
"""

import pytest
import boto3
from moto import mock_dynamodb
import json
from datetime import datetime, timezone

# Import modules under test
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent / 'packages' / 'shared' / 'artifact-validator'))
from enhanced_validator import (
    validate_artifact_envelope_enhanced,
    validate_evidence_pointer_format,
    EnhancedArtifactValidationError,
)

sys.path.append(str(Path(__file__).parent.parent.parent / 'packages' / 'shared' / 'artifact-reader'))
from dependency_graph import (
    build_dependency_graph,
    get_artifact_lineage,
    get_artifact_descendants,
    get_all_artifacts_for_job,
)

# Test configuration
ARTIFACTS_TABLE_NAME = 'til-artifacts-test'


@pytest.fixture
def aws_mock():
    """Mock AWS services"""
    with mock_dynamodb():
        # Create artifacts table
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
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
        
        # Set environment variable
        import os
        os.environ['ARTIFACTS_TABLE_NAME'] = ARTIFACTS_TABLE_NAME
        
        yield table


def create_test_artifact(job_id: str, task_id: str, artifact_version: str, upstream_artifacts=None, sources=None):
    """Helper to create a test artifact"""
    artifact_id = f"{job_id}#{task_id}#{artifact_version}"
    now = datetime.now(timezone.utc).isoformat()
    
    artifact = {
        'job_id': job_id,
        'artifact_sk': f"{task_id}#{artifact_version}",
        'meta': {
            'artifact_id': artifact_id,
            'job_id': job_id,
            'task_id': task_id,
            'artifact_version': artifact_version,
            'artifact_type': 'evidence_bundle',
            'status': 'completed',
            'spawned_at': now,
            'completed_at': now,
        },
        'provenance': {
            'sources': sources or [
                {
                    'id': 'source-1',
                    'type': 'web',
                    'uri': 'https://example.com',
                    'snippet': 'Test source',
                    'captured_at': now,
                }
            ],
            'claims': [
                {
                    'claim_text': 'Test claim',
                    'source_pointer': 'source:source-1',
                }
            ],
            'tool_calls': [],
            'inputs': {},
            'upstream_artifacts': upstream_artifacts or [],
        },
        'data': {},
        'quality_signals': {
            'confidence': 0.8,
            'coverage': 'moderate',
        },
    }
    return artifact


class TestEvidencePointerValidation:
    """Test evidence pointer grammar validation"""
    
    def test_valid_evidence_pointers(self):
        """Test valid evidence pointer formats"""
        valid_pointers = [
            'artifact:job-123#task-456#v0001',
            'source:source-1',
            'tool:tool-inv-789',
            'event:event-id-123',
            'web:search_123#result:0',
            'conf:black_hat#abstract:123',
        ]
        
        for pointer in valid_pointers:
            assert validate_evidence_pointer_format(pointer), f"Pointer should be valid: {pointer}"
    
    def test_invalid_evidence_pointers(self):
        """Test invalid evidence pointer formats"""
        invalid_pointers = [
            'invalid',  # No colon
            'artifact:',  # Missing identifier
            ':source-1',  # Missing type
            'ARTIFACT:job-123',  # Uppercase type
            'artifact:job-123',  # Missing version
        ]
        
        for pointer in invalid_pointers:
            assert not validate_evidence_pointer_format(pointer), f"Pointer should be invalid: {pointer}"


class TestEnhancedValidator:
    """Test enhanced artifact validator"""
    
    def test_validate_sources_non_empty(self, aws_mock):
        """Test that sources array must be non-empty"""
        artifact = create_test_artifact('job-1', 'task-1', 'v0001')
        artifact['provenance']['sources'] = []
        
        with pytest.raises(EnhancedArtifactValidationError) as exc_info:
            validate_artifact_envelope_enhanced(artifact)
        
        assert 'provenance.sources: array must be non-empty' in str(exc_info.value)
    
    def test_validate_claims_non_empty(self, aws_mock):
        """Test that claims array must be non-empty"""
        artifact = create_test_artifact('job-1', 'task-1', 'v0001')
        artifact['provenance']['claims'] = []
        
        with pytest.raises(EnhancedArtifactValidationError) as exc_info:
            validate_artifact_envelope_enhanced(artifact)
        
        assert 'provenance.claims: array must be non-empty' in str(exc_info.value)
    
    def test_validate_source_pointer_references(self, aws_mock):
        """Test that claim source_pointer must reference a valid source"""
        artifact = create_test_artifact('job-1', 'task-1', 'v0001')
        artifact['provenance']['claims'][0]['source_pointer'] = 'source:invalid-source'
        
        with pytest.raises(EnhancedArtifactValidationError) as exc_info:
            validate_artifact_envelope_enhanced(artifact)
        
        assert 'does not match any source.source_pointer' in str(exc_info.value)
    
    def test_validate_source_id_uniqueness(self, aws_mock):
        """Test that source.id must be unique"""
        artifact = create_test_artifact('job-1', 'task-1', 'v0001')
        artifact['provenance']['sources'].append({
            'id': 'source-1',  # Duplicate
            'type': 'web',
            'uri': 'https://example.com/2',
            'snippet': 'Test source 2',
            'captured_at': datetime.now(timezone.utc).isoformat(),
        })
        
        with pytest.raises(EnhancedArtifactValidationError) as exc_info:
            validate_artifact_envelope_enhanced(artifact)
        
        assert 'is not unique' in str(exc_info.value)
    
    def test_validate_upstream_artifacts(self, aws_mock):
        """Test upstream_artifacts validation"""
        artifact = create_test_artifact('job-1', 'task-1', 'v0001')
        artifact['provenance']['upstream_artifacts'] = [
            {
                'artifact_id': 'job-1#task-2#v0001',
                'reason': 'Used for synthesis',
                'pointers': ['artifact:job-1#task-2#v0001'],
            }
        ]
        
        # Should pass validation
        result = validate_artifact_envelope_enhanced(artifact)
        assert result.is_valid


class TestDependencyGraph:
    """Test dependency graph construction"""
    
    def test_build_simple_dependency_graph(self, aws_mock):
        """Test building a simple dependency graph"""
        job_id = 'job-123'
        
        # Create artifacts with dependencies
        artifact1 = create_test_artifact(job_id, 'task-1', 'v0001')
        artifact2 = create_test_artifact(job_id, 'task-2', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-1#v0001",
                'reason': 'Used for synthesis',
                'pointers': ['artifact:job-123#task-1#v0001'],
            }
        ])
        
        # Write artifacts to DynamoDB
        aws_mock.put_item(Item=artifact1)
        aws_mock.put_item(Item=artifact2)
        
        # Build dependency graph
        graph = build_dependency_graph(job_id)
        
        assert len(graph['nodes']) == 2
        assert len(graph['edges']) == 1
        assert graph['edges'][0]['from_artifact_id'] == f"{job_id}#task-1#v0001"
        assert graph['edges'][0]['to_artifact_id'] == f"{job_id}#task-2#v0001"
    
    def test_detect_circular_dependencies(self, aws_mock):
        """Test circular dependency detection"""
        job_id = 'job-123'
        
        # Create circular dependency: task-1 -> task-2 -> task-1
        artifact1 = create_test_artifact(job_id, 'task-1', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-2#v0001",
                'reason': 'Circular reference',
                'pointers': [],
            }
        ])
        artifact2 = create_test_artifact(job_id, 'task-2', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-1#v0001",
                'reason': 'Circular reference',
                'pointers': [],
            }
        ])
        
        # Write artifacts to DynamoDB
        aws_mock.put_item(Item=artifact1)
        aws_mock.put_item(Item=artifact2)
        
        # Build dependency graph
        graph = build_dependency_graph(job_id)
        
        # Should detect circular dependencies
        assert len(graph['circular_dependencies']) > 0
        assert f"{job_id}#task-1#v0001" in graph['circular_dependencies']
        assert f"{job_id}#task-2#v0001" in graph['circular_dependencies']
    
    def test_get_artifact_lineage(self, aws_mock):
        """Test artifact lineage tracing"""
        job_id = 'job-123'
        
        # Create chain: task-1 -> task-2 -> task-3
        artifact1 = create_test_artifact(job_id, 'task-1', 'v0001')
        artifact2 = create_test_artifact(job_id, 'task-2', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-1#v0001",
                'reason': 'Used for synthesis',
                'pointers': [],
            }
        ])
        artifact3 = create_test_artifact(job_id, 'task-3', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-2#v0001",
                'reason': 'Used for synthesis',
                'pointers': [],
            }
        ])
        
        # Write artifacts to DynamoDB
        aws_mock.put_item(Item=artifact1)
        aws_mock.put_item(Item=artifact2)
        aws_mock.put_item(Item=artifact3)
        
        # Get lineage for task-3
        lineage = get_artifact_lineage(f"{job_id}#task-3#v0001", job_id)
        
        # Should include task-1 and task-2
        lineage_ids = [a['artifact_id'] for a in lineage]
        assert f"{job_id}#task-1#v0001" in lineage_ids
        assert f"{job_id}#task-2#v0001" in lineage_ids
    
    def test_get_artifact_descendants(self, aws_mock):
        """Test artifact descendants lookup"""
        job_id = 'job-123'
        
        # Create chain: task-1 -> task-2, task-1 -> task-3
        artifact1 = create_test_artifact(job_id, 'task-1', 'v0001')
        artifact2 = create_test_artifact(job_id, 'task-2', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-1#v0001",
                'reason': 'Used for synthesis',
                'pointers': [],
            }
        ])
        artifact3 = create_test_artifact(job_id, 'task-3', 'v0001', upstream_artifacts=[
            {
                'artifact_id': f"{job_id}#task-1#v0001",
                'reason': 'Used for synthesis',
                'pointers': [],
            }
        ])
        
        # Write artifacts to DynamoDB
        aws_mock.put_item(Item=artifact1)
        aws_mock.put_item(Item=artifact2)
        aws_mock.put_item(Item=artifact3)
        
        # Get descendants for task-1
        descendants = get_artifact_descendants(f"{job_id}#task-1#v0001", job_id)
        
        # Should include task-2 and task-3
        descendant_ids = [a['artifact_id'] for a in descendants]
        assert f"{job_id}#task-2#v0001" in descendant_ids
        assert f"{job_id}#task-3#v0001" in descendant_ids
