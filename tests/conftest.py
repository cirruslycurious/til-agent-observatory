"""
Shared pytest fixtures for conference abstract builder tests.

This file is automatically loaded by pytest and provides:
- AWS credential mocking
- DynamoDB table fixtures (using moto)
- S3 bucket fixtures
- Sample data fixtures
"""

import os
import sys
import pytest
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add shared packages to path
project_root = Path(__file__).parent.parent
shared_path = project_root / 'packages' / 'shared'
sys.path.insert(0, str(shared_path))

# Check for real AWS mode
REAL_AWS = os.environ.get("REAL_AWS") == "1"

if not REAL_AWS:
    from moto import mock_aws
else:
    from contextlib import contextmanager
    @contextmanager
    def mock_aws():
        yield


# =============================================================================
# Test Configuration
# =============================================================================

REGION = 'us-east-1'
TABLE_NAMES = {
    'jobs': 'til-jobs',
    'conference_data': 'til-conference-data',
    'decision_events_by_job': 'til-decision-events-by-job',
    'decision_event_ids': 'til-decision-event-ids',
    'generation_metrics': 'til-generation-metrics',
    'job_budgets': 'til-job-budgets',
    'artifacts': 'til-artifacts',
    'web_search_guardrails': 'til-web-search-guardrails',
}
S3_BUCKET = 'your-artifacts-bucket'


# =============================================================================
# AWS Credential Fixtures
# =============================================================================

@pytest.fixture
def aws_credentials():
    """Mock AWS credentials for moto."""
    if REAL_AWS:
        yield
    else:
        os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
        os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
        os.environ['AWS_SECURITY_TOKEN'] = 'testing'
        os.environ['AWS_SESSION_TOKEN'] = 'testing'
        os.environ['AWS_DEFAULT_REGION'] = REGION
        
        # Set table name environment variables
        for key, name in TABLE_NAMES.items():
            env_key = f"{key.upper()}_TABLE_NAME"
            os.environ[env_key] = name
        os.environ['ARTIFACTS_BUCKET_NAME'] = S3_BUCKET
        
        yield
        
        # Cleanup
        for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 
                    'AWS_SECURITY_TOKEN', 'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION']:
            os.environ.pop(key, None)


# =============================================================================
# Sample Data Fixtures
# =============================================================================

@pytest.fixture
def sample_job_input():
    """Sample job input for testing."""
    return {
        'job_id': 'test-job-001',
        'conference': 'black_hat',
        'topic': 'ai_ml_genai',
        'iteration': 0,
        'execution_id': 'exec-test-001',
        'state_name': 'TestState',
    }


@pytest.fixture
def sample_abstract():
    """Sample abstract text with all required sections."""
    return """## Problem
Organizations face increasing challenges in detecting and preventing AI-powered cyberattacks that can adapt and evolve faster than traditional security measures.

## Approach  
We developed a novel defensive AI framework that uses adversarial training techniques to anticipate and counter AI-generated threats in real-time.

## Impact
Our system demonstrated a 94% detection rate against previously unseen AI attacks in production environments, with sub-second response times.

## Why this conference
Black Hat attendees are at the forefront of offensive and defensive security research, making this the ideal venue to present breakthrough defensive AI capabilities."""


@pytest.fixture
def sample_worker_output(sample_abstract):
    """Sample worker output for Manager evaluation."""
    return {
        'status': 'success',
        'title': 'Defensive AI: Fighting Fire with Fire Against AI-Powered Attacks',
        'abstract': sample_abstract,
        'evidence_pointers': ['arxiv:2024.12345', 'internal-research-001'],
        'confidence': 0.85,
        'tool_calls': [
            {'tool': 'dynamodb_lookup', 'args': {'conference': 'black_hat', 'data_type': 'rules'}, 'success': True},
            {'tool': 'search_abstracts', 'args': {'query': 'AI security'}, 'success': True},
            {'tool': 'red_team_review', 'args': {}, 'success': True, 'scores': {'overall': 4, 'verdict': 'acceptable'}},
        ],
        'tools_used': ['dynamodb_lookup', 'search_abstracts', 'red_team_review'],
        'action_points_spent': 3,
        'vendor': 'openai',
        'model': 'gpt-4.1',
    }


@pytest.fixture
def sample_evaluator_result():
    """Sample evaluator result for Manager."""
    return {
        'top_3_conferences': ['black_hat', 'rsa_conference', 'defcon'],
        'confidence_scores': [0.65, 0.20, 0.15],
        'reasons': [
            'Technical depth and offensive security focus matches Black Hat',
            'Enterprise security angle could fit RSA',
            'Hacker community relevance for DEF CON',
        ],
        'picked_decoy': False,
    }


@pytest.fixture
def sample_conference_rules():
    """Sample conference rules from DynamoDB."""
    return {
        'conference': 'black_hat',
        'data_type': 'rules',
        'structure_requirements': {
            'sections': ['Problem', 'Approach', 'Impact', 'Why this conference'],
            'min_sections': 4,
        },
        'length_constraints': {
            'min_words': 100,
            'max_words': 400,
        },
        'tone_markers': ['technical', 'precise', 'innovative'],
    }


@pytest.fixture  
def sample_llm_response():
    """Sample LLM response for mocking."""
    return {
        'response': 'This is a test LLM response.',
        'cost_usd': 0.01,
        'total_tokens': 150,
        'temperature': 0.5,
    }


@pytest.fixture
def sample_manager_goal_response(sample_llm_response):
    """Sample LLM response for goal formulation."""
    response = sample_llm_response.copy()
    response['response'] = (
        'Create a compelling abstract that demonstrates innovative defensive AI techniques '
        'for detecting and countering AI-powered cyberattacks, emphasizing practical '
        'implementation and measurable security improvements.'
    )
    return response


@pytest.fixture
def sample_manager_eval_response(sample_llm_response):
    """Sample LLM response for evaluation."""
    response = sample_llm_response.copy()
    response['response'] = json.dumps({
        'decision': 'accept',
        'quality_score': 8,
        'reasoning': 'Strong technical depth with clear structure and compelling narrative.',
        'strengths': ['Clear problem statement', 'Measurable results', 'Conference relevance'],
        'weaknesses': ['Could expand on methodology'],
        'feedback_for_worker': '',
    })
    return response


# =============================================================================
# Mock Fixtures
# =============================================================================

@pytest.fixture
def mock_llm_client():
    """Mock for llm_client.call_llm."""
    with patch('llm_client.llm_client.call_llm') as mock:
        mock.return_value = {
            'response': 'Mocked LLM response',
            'cost_usd': 0.01,
            'total_tokens': 100,
            'temperature': 0.5,
        }
        yield mock


@pytest.fixture
def mock_bedrock_client():
    """Mock for llm_client.call_bedrock."""
    with patch('llm_client.llm_client.call_bedrock') as mock:
        mock.return_value = {
            'response': json.dumps({
                'top_3_conferences': ['black_hat', 'kubecon', 'reinvent'],
                'confidence_scores': [0.6, 0.25, 0.15],
                'reasons': ['Reason 1', 'Reason 2', 'Reason 3'],
            }),
            'cost_usd': 0.005,
            'total_tokens': 200,
        }
        yield mock
