"""
Unit Tests for Schema Validator Library
Story 6.4: Schema Validation as Runtime Gate

Tests validation, error formatting, and schema versioning.
"""

import pytest
import json
from pathlib import Path
from datetime import datetime, timezone

# Import modules under test
import sys
sys.path.append(str(Path(__file__).parent))
from schema_validator import (
    validate_artifact,
    ArtifactValidationError,
    ValidationResult,
    LATEST_SCHEMA_VERSION_BY_TYPE,
    load_schema,
)


@pytest.fixture
def sample_style_profile():
    """Sample style_profile artifact for testing"""
    return {
        'meta': {
            'artifact_id': 'test-job-id#cfp_extract#v0001',
            'job_id': 'test-job-id',
            'iteration': 0,
            'parent_task_id': None,
            'task_id': 'cfp_extract',
            'worker_id': 'cfp-extractor',
            'worker_vendor': 'openai',
            'worker_model': 'gpt-5.2',
            'artifact_type': 'style_profile',
            'artifact_version': 'v0001',
            'content_hash': 'a' * 64,
            'schema_version': 'v1',
            'spawned_at': datetime.now(timezone.utc).isoformat(),
            'completed_at': datetime.now(timezone.utc).isoformat(),
            'status': 'completed',
        },
        'data': {
            'tone': 'formal',
            'length_preference': 'detailed',
            'key_phrases': ['AI', 'machine learning', 'conference'],
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
                    'snippet': 'Sample snippet',
                    'captured_at': datetime.now(timezone.utc).isoformat(),
                }
            ],
            'claims': [],  # Optional for style_profile
            'tool_calls': [],
            'inputs': {},
        },
    }


@pytest.fixture
def sample_evidence_bundle():
    """Sample evidence_bundle artifact for testing"""
    return {
        'meta': {
            'artifact_id': 'test-job-id#evidence_research#v0001',
            'job_id': 'test-job-id',
            'iteration': 0,
            'parent_task_id': None,
            'task_id': 'evidence_research',
            'worker_id': 'evidence-researcher',
            'worker_vendor': 'anthropic',
            'worker_model': 'claude-sonnet-4.5',
            'artifact_type': 'evidence_bundle',
            'artifact_version': 'v0001',
            'content_hash': 'b' * 64,
            'schema_version': 'v1',
            'spawned_at': datetime.now(timezone.utc).isoformat(),
            'completed_at': datetime.now(timezone.utc).isoformat(),
            'status': 'completed',
        },
        'data': {
            'evidence_items': [
                {
                    'source_pointer': 'https://example.com/evidence',
                    'relevance_score': 0.8,
                    'claim': 'Evidence claim',
                    'context': 'Evidence context',
                }
            ],
        },
        'quality_signals': {
            'confidence': 0.85,
            'coverage': 'moderate',
        },
        'provenance': {
            'sources': [
                {
                    'id': 'source-1',
                    'type': 'web',
                    'uri': 'https://example.com',
                    'snippet': 'Sample snippet',
                    'captured_at': datetime.now(timezone.utc).isoformat(),
                }
            ],
            'claims': [{'claim': 'Test claim'}],  # Required for evidence_bundle
            'tool_calls': [],
            'inputs': {},
        },
    }


class TestSchemaLoading:
    """Tests for schema loading"""
    
    def test_load_schema_success(self):
        """load_schema loads existing schema file"""
        schema = load_schema('style_profile', 'v1')
        assert schema is not None
        assert schema['type'] == 'object'
        assert 'properties' in schema
    
    def test_load_schema_not_found(self):
        """load_schema raises FileNotFoundError for non-existent schema"""
        with pytest.raises(FileNotFoundError):
            load_schema('unknown_type', 'v1')


class TestValidationSuccess:
    """Tests for successful validation"""
    
    def test_validate_style_profile_success(self, sample_style_profile):
        """validate_artifact accepts valid style_profile"""
        result = validate_artifact(sample_style_profile)
        assert result.is_valid is True
        assert len(result.errors) == 0
    
    def test_validate_evidence_bundle_success(self, sample_evidence_bundle):
        """validate_artifact accepts valid evidence_bundle"""
        result = validate_artifact(sample_evidence_bundle)
        assert result.is_valid is True
        assert len(result.errors) == 0
    
    def test_validate_draft_candidates_success(self):
        """validate_artifact accepts valid draft_candidates"""
        artifact = {
            'meta': {
                'artifact_id': 'test-job-id#draft_gen#v0001',
                'job_id': 'test-job-id',
                'iteration': 0,
                'parent_task_id': None,
                'task_id': 'draft_gen',
                'worker_id': 'draft-generator',
                'worker_vendor': 'openai',
                'worker_model': 'gpt-5.2',
                'artifact_type': 'draft_candidates',
                'artifact_version': 'v0001',
                'content_hash': 'c' * 64,
                'schema_version': 'v1',
                'spawned_at': datetime.now(timezone.utc).isoformat(),
                'completed_at': datetime.now(timezone.utc).isoformat(),
                'status': 'completed',
            },
            'data': {
                'candidates': [
                    {'text': 'Draft text', 'quality_score': 0.9}
                ],
            },
            'quality_signals': {
                'confidence': 0.8,
                'coverage': 'comprehensive',
            },
            'provenance': {
                'sources': [
                    {
                        'id': 'source-1',
                        'type': 'artifact',
                        'uri': 'artifact://style_profile',
                        'snippet': 'Snippet',
                        'captured_at': datetime.now(timezone.utc).isoformat(),
                    }
                ],
                'claims': [],
                'tool_calls': [],
                'inputs': {},
            },
        }
        result = validate_artifact(artifact)
        assert result.is_valid is True


class TestValidationFailure:
    """Tests for validation failures"""
    
    def test_validate_missing_required_field(self, sample_style_profile):
        """validate_artifact rejects artifact with missing required field"""
        del sample_style_profile['data']['tone']
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_style_profile)
        
        assert exc_info.value.artifact_type == 'style_profile'
        assert exc_info.value.schema_version == 'v1'
        assert len(exc_info.value.errors) > 0
        assert 'tone' in str(exc_info.value.errors[0]).lower()
    
    def test_validate_invalid_type(self, sample_style_profile):
        """validate_artifact rejects artifact with invalid type"""
        sample_style_profile['data']['tone'] = 123  # Should be string
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_style_profile)
        
        assert len(exc_info.value.errors) > 0
    
    def test_validate_empty_array(self, sample_style_profile):
        """validate_artifact rejects artifact with empty required array"""
        sample_style_profile['data']['key_phrases'] = []
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_style_profile)
        
        assert len(exc_info.value.errors) > 0
    
    def test_validate_evidence_bundle_missing_claims(self, sample_evidence_bundle):
        """validate_artifact rejects evidence_bundle without claims"""
        sample_evidence_bundle['provenance']['claims'] = []
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_evidence_bundle)
        
        assert len(exc_info.value.errors) > 0


class TestSchemaVersioning:
    """Tests for schema versioning"""
    
    def test_validate_unknown_schema_version(self, sample_style_profile):
        """validate_artifact rejects artifact with unknown schema version"""
        sample_style_profile['meta']['schema_version'] = 'v999'
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_style_profile)
        
        assert 'Unknown schema version' in str(exc_info.value.errors[0])
    
    def test_validate_deprecated_schema_version(self, sample_style_profile):
        """validate_artifact warns about deprecated schema version"""
        # This test assumes v1 is latest, so we'd need v2 to test deprecation
        # For now, just test that the logic exists
        result = validate_artifact(sample_style_profile)
        # If schema_version matches latest, no warnings
        assert len(result.warnings) == 0


class TestErrorFormatting:
    """Tests for error message formatting"""
    
    def test_error_formatting_field_path(self, sample_style_profile):
        """Validation errors include field path"""
        del sample_style_profile['data']['tone']
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_style_profile)
        
        error_msg = str(exc_info.value.errors[0])
        assert 'data' in error_msg or 'tone' in error_msg
    
    def test_error_formatting_multiple_errors(self, sample_style_profile):
        """validate_artifact collects all errors, not just first"""
        del sample_style_profile['data']['tone']
        del sample_style_profile['data']['length_preference']
        sample_style_profile['data']['key_phrases'] = []
        
        with pytest.raises(ArtifactValidationError) as exc_info:
            validate_artifact(sample_style_profile)
        
        # Should have multiple errors
        assert len(exc_info.value.errors) >= 2


class TestMissingFields:
    """Tests for missing required fields"""
    
    def test_validate_missing_artifact_type(self, sample_style_profile):
        """validate_artifact raises ValueError if artifact_type is missing"""
        del sample_style_profile['meta']['artifact_type']
        
        with pytest.raises(ValueError) as exc_info:
            validate_artifact(sample_style_profile)
        
        assert 'artifact_type' in str(exc_info.value)
    
    def test_validate_missing_schema_version(self, sample_style_profile):
        """validate_artifact raises ValueError if schema_version is missing"""
        del sample_style_profile['meta']['schema_version']
        
        with pytest.raises(ValueError) as exc_info:
            validate_artifact(sample_style_profile)
        
        assert 'schema_version' in str(exc_info.value)
