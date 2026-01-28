"""
Abstract Assessor Tool - Secondary
Tool wrapper for Nova Assessor Secondary Lambda

Allows Manager to invoke the secondary Nova assessor and get a composite score.
Logs the tool call for auditability.
"""

import json
import time
import boto3
from typing import Dict, Any
from datetime import datetime, timezone

# Import tool logger
from tool_wrappers.tool_logger import log_tool_call

# Configuration
ASSESSOR_SECONDARY_FUNCTION = 'til-assess-abstract-secondary'
REGION = 'us-east-1'

# Initialize Lambda client
lambda_client = boto3.client('lambda', region_name=REGION)


def assess_abstract_secondary(
    title: str,
    abstract: str,
    conference: str,
    conference_description: str,
    goal: str,
    job_id: str,
    execution_id: str,
    state_name: str,
    iteration: int
) -> Dict[str, Any]:
    """
    Call Secondary Nova Assessor to score an abstract.
    
    Args:
        title: Abstract title
        abstract: Abstract body text
        conference: Target conference name
        conference_description: Conference themes/audience description
        goal: User's submission goal
        job_id: Job ID for logging
        execution_id: Step Functions execution ID
        state_name: Current state name (for logging)
        iteration: Current iteration number
        
    Returns:
        {
            "composite_score": 7.5,
            "assessment_id": "secondary-uuid",
            "assessor": "secondary"
        }
    """
    start_time = time.time()
    
    print(f"assess_abstract_secondary called: conference={conference}, iteration={iteration}")
    
    try:
        # Build Lambda payload
        payload = {
            'title': title,
            'abstract': abstract,
            'conference': conference,
            'conference_description': conference_description,
            'goal': goal
        }
        
        # Invoke Secondary Assessor Lambda
        response = lambda_client.invoke(
            FunctionName=ASSESSOR_SECONDARY_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        # Parse response
        response_payload = json.loads(response['Payload'].read())
        
        if response_payload.get('statusCode') != 200:
            raise RuntimeError(f"Assessor returned non-200 status: {response_payload}")
        
        # Body might be a string (if API Gateway-style) or dict (direct Lambda-to-Lambda)
        body = response_payload.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)
        
        composite_score = body.get('composite_score')
        assessment_id = body.get('assessment_id')
        
        if composite_score is None:
            raise RuntimeError(f"Assessor returned no composite_score: {body}")
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        
        # Log tool call
        log_tool_call(
            tool_name='assess_abstract_secondary',
            params={
                'conference': conference,
                'title_length': len(title),
                'abstract_length': len(abstract)
            },
            results={
                'composite_score': composite_score,
                'assessment_id': assessment_id
            },
            reasoning=f'Assess abstract quality for {conference}',
            job_id=job_id,
            actor='manager',
            worker_id='manager',
            worker_vendor='manager',
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            execution_time_ms=elapsed_ms,
            cost_usd=0.0
        )
        
        # Note: Decision event logging removed - EventType.MANAGER_ASSESSED doesn't exist
        # Tool call logging above is sufficient for auditability
        
        print(f"Secondary assessor returned score: {composite_score}, elapsed: {elapsed_ms}ms")
        
        return {
            'composite_score': composite_score,
            'assessment_id': assessment_id,
            'assessor': 'secondary'
        }
        
    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        
        print(f"assess_abstract_secondary error: {error_msg}")
        
        # Log failed tool call
        log_tool_call(
            tool_name='assess_abstract_secondary',
            params={
                'conference': conference,
                'title_length': len(title),
                'abstract_length': len(abstract),
                'error': error_msg
            },
            results={},
            reasoning=f'Assess abstract quality for {conference} (FAILED)',
            job_id=job_id,
            actor='manager',
            worker_id='manager',
            worker_vendor='manager',
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            execution_time_ms=elapsed_ms,
            cost_usd=0.0
        )
        
        # Return fallback neutral score
        return {
            'composite_score': 5.0,
            'assessment_id': 'secondary-error',
            'assessor': 'secondary',
            'error': error_msg,
            'fallback': True
        }
