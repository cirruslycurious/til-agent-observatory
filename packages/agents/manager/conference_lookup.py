"""
Conference Data Lookup Helper
Story 2.1: Manager Agent

Simplified helper for Manager to lookup conference requirements.
Logs tool calls as decision events.
"""

import boto3
import os
from typing import Dict, Any, Optional

# Configuration
CONFERENCE_DATA_TABLE_NAME = os.environ.get('CONFERENCE_DATA_TABLE_NAME', 'til-conference-data')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name=REGION)
conference_data_table = dynamodb.Table(CONFERENCE_DATA_TABLE_NAME)

# Import decision event logger (optional - only if available)
try:
    import sys
    from pathlib import Path
    # Try to import from Lambda layer or local path
    lambda_dir = Path(__file__).parent
    shared_path_layer = Path('/opt/python')
    shared_path_unbundled = lambda_dir.parent.parent.parent.parent / 'packages' / 'shared'
    
    sys.path.insert(0, str(shared_path_layer))
    if shared_path_unbundled.exists():
        sys.path.insert(0, str(shared_path_unbundled))
    
    from decision_events.event_logger import log_decision_event
    from decision_events.event_types import EventType
    from decision_events.actor import Actor
    EVENT_LOGGING_AVAILABLE = True
except ImportError:
    EVENT_LOGGING_AVAILABLE = False
    Actor = type('Actor', (), {'MANAGER': 'manager'})  # Fallback


def get_conference_data(
    conference: str,
    job_id: Optional[str] = None,
    execution_id: Optional[str] = None,
    state_name: Optional[str] = None,
    iteration: int = 0,
    actor: str = Actor.MANAGER.value if EVENT_LOGGING_AVAILABLE else 'manager',
    creativity: Optional[float] = None,
    vendor: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get conference requirements and example abstracts.
    Logs tool call as decision event if logging is available.
    
    Args:
        conference: Conference identifier (e.g., "black_hat", "reinvent", "kubecon")
        job_id: Job identifier (for event logging)
        execution_id: Step Functions execution ID (for event logging)
        state_name: Step Functions state name (for event logging)
        iteration: Iteration number (for event logging)
        actor: Actor name (default: "manager")
        creativity: Creativity value (for event logging)
        vendor: Vendor name (for event logging)
        model: Model name (for event logging)
    
    Returns:
        Dict with:
        - rules: Conference rules/guidelines
        - example_abstracts: List of example abstracts
    """
    try:
        # Query for requirements
        requirements_response = conference_data_table.get_item(
            Key={
                'conference': conference,
                'data_type': 'requirements'
            }
        )
        
        rules = {}
        if 'Item' in requirements_response:
            item = requirements_response['Item']
            rules = {
                'structure_requirements': item.get('structure_requirements', {}),
                'length_constraints': item.get('length_constraints', {}),
                'tone_markers': item.get('tone_markers', []),
                'recurring_patterns': item.get('recurring_patterns', []),
            }
        
        # Query for example abstracts
        examples_response = conference_data_table.query(
            KeyConditionExpression='conference = :conf AND begins_with(data_type, :prefix)',
            ExpressionAttributeValues={
                ':conf': conference,
                ':prefix': 'example_abstract_'
            }
        )
        
        example_abstracts = []
        if 'Items' in examples_response:
            example_abstracts = [
                {
                    'abstract_id': item.get('abstract_id'),
                    'title': item.get('title'),
                    'abstract': item.get('abstract'),
                    'sections': item.get('sections', {}),
                }
                for item in examples_response['Items']
            ]
        
        result = {
            'rules': rules,
            'example_abstracts': example_abstracts,
        }
        
        # Log tool call as decision event (if logging available and job_id provided)
        if EVENT_LOGGING_AVAILABLE and job_id and execution_id:
            try:
                log_decision_event(
                    event_type=EventType.TOOL_CALLED.value,
                    details={
                        'tool_name': 'conference_data_lookup',
                        'parameters': {'conference': conference},
                        'results_summary': f"Found {len(example_abstracts)} example abstracts",
                        'creativity': creativity,
                        'vendor': vendor,
                        'model': model,
                    },
                    job_id=job_id,
                    execution_id=execution_id,
                    state_name=state_name or 'ManagerGoalFormulation',
                    iteration=iteration,
                    actor=actor,
                    summary=f"Looked up conference data for {conference}",
                    rationale_summary="Conference requirements needed for goal formulation",
                    inputs_summary=f"Conference: {conference}",
                    outputs_summary=f"Found {len(example_abstracts)} examples, {len(rules)} rule categories",
                    evidence_pointers=[],
                )
            except Exception as log_error:
                # Don't fail on logging errors
                pass
        
        return result
    
    except Exception as e:
        # Return empty result on error (graceful degradation)
        return {
            'rules': {},
            'example_abstracts': [],
            'error': str(e),
        }
