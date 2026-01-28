"""
DynamoDB Lookup Tool Wrapper (Python)
Story 3.3: Tool Usage Logging

Wrapper for DynamoDB conference data lookups with comprehensive logging.
"""

import time
import boto3
import json
from decimal import Decimal
from typing import Dict, Any, Optional
from datetime import datetime, timezone

# Import tool logger (Lambda layer provides this)
from tool_wrappers.tool_logger import log_tool_call

# Configuration
CONFERENCE_DATA_TABLE_NAME = 'til-conference-data'  # From architecture
REGION = 'us-east-1'

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name=REGION)
dynamodb_client = boto3.client('dynamodb', region_name=REGION)
conference_data_table = dynamodb.Table(CONFERENCE_DATA_TABLE_NAME)


def convert_decimals(obj):
    """
    Recursively convert Decimal objects to float for JSON serialization.
    DynamoDB returns Decimal for all numbers.
    """
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(item) for item in obj]
    else:
        return obj


def dynamodb_lookup(
    conference: str,
    data_type: str,
    filters: Dict[str, Any],
    job_id: str,
    actor: str,
    worker_id: str,
    worker_vendor: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    sub_worker_instance_id: Optional[str] = None,
    reasoning: Optional[str] = None
) -> Dict[str, Any]:
    """
    Perform DynamoDB lookup for conference data with comprehensive logging.
    
    Args:
        conference: Conference identifier (e.g., "black_hat", "reinvent", "kubecon")
        data_type: Data type to query (e.g., "requirements", "example_abstracts")
        filters: Query filters (dict)
        job_id: Job identifier (UUID)
        actor: Agent that called tool (worker | sub_worker)
        worker_id: Worker identifier
        worker_vendor: Worker vendor (openai | anthropic)
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number (0-4)
        sub_worker_instance_id: Sub-worker instance ID (optional)
        reasoning: Why this tool was called (optional)
        
    Returns:
        Dict with:
        - results: Tool results
        - tool_call_record: Tool call record for artifact provenance.tool_calls array
    """
    # Start timing
    start_time = time.time()
    
    # Build tool parameters
    params = {
        'conference': conference,
        'data_type': data_type,
        'filters': filters,
    }
    
    # Default reasoning if not provided
    if not reasoning:
        reasoning = f"Lookup {data_type} for {conference} conference"
    
    # Perform DynamoDB query
    results = {}
    success_status = "success"
    error_message = None
    
    try:
        # Query conference_data table
        # This is a simplified implementation - actual query logic depends on table structure
        # For now, we'll do a simple GetItem or Query based on data_type
        
        if data_type == "requirements":
            # Get conference requirements
            response = conference_data_table.get_item(
                Key={
                    'conference': conference,
                    'data_type': 'requirements'
                }
            )
            if 'Item' in response:
                results = {
                    'data_type': 'requirements',
                    'items': [convert_decimals(response['Item'])],
                }
            else:
                results = {
                    'data_type': 'requirements',
                    'items': [],
                }
        
        elif data_type == "example_abstracts" or data_type == "abstract_example":
            # Query example abstracts (may have sort key)
            # Note: Data is stored with compound keys like "abstract_example#reinvent_2023_001"
            # so we use begins_with to match all examples
            response = conference_data_table.query(
                KeyConditionExpression='conference = :conf AND begins_with(data_type, :dt)',
                ExpressionAttributeValues={
                    ':conf': conference,
                    ':dt': 'abstract_example'
                }
            )
            results = {
                'data_type': data_type,  # Return whatever was requested
                'items': convert_decimals(response.get('Items', [])),
            }
        
        else:
            # Generic query - use both conference (partition key) and data_type (sort key) in KeyConditionExpression
            response = conference_data_table.query(
                KeyConditionExpression='conference = :conf AND data_type = :dt',
                ExpressionAttributeValues={
                    ':conf': conference,
                    ':dt': data_type
                }
            )
            results = {
                'data_type': data_type,
                'items': convert_decimals(response.get('Items', [])),
            }
        
    except Exception as e:
        # Handle errors
        success_status = "error"
        error_message = str(e)
        results = {
            'data_type': data_type,
            'items': [],
            'error': error_message,
        }
    
    # Log tool call
    tool_call_record = log_tool_call(
        tool_name="dynamodb_lookup",
        params=params,
        results=results,
        reasoning=reasoning,
        job_id=job_id,
        actor=actor,
        worker_id=worker_id,
        worker_vendor=worker_vendor,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        sub_worker_instance_id=sub_worker_instance_id,
        tokens_used=0,  # DynamoDB lookups don't use tokens
        cost_usd=0.0,  # Effectively 0 for analysis (Lambda invocation costs exist but not tracked)
        success_status=success_status,
        start_time=start_time,
    )
    
    # Return results with tool call record
    return {
        'results': results,
        'tool_call_record': tool_call_record,
    }
