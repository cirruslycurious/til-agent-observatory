"""
Tool Query Utilities (Python)
Story 3.3: Tool Usage Logging

Query utilities for retrieving and analyzing tool calls from decision events.
"""

import boto3
import os
from typing import Dict, Any, List, Optional
from collections import defaultdict
from datetime import datetime

# Configuration
DECISION_EVENTS_BY_JOB_TABLE_NAME = os.environ.get('DECISION_EVENTS_BY_JOB_TABLE_NAME', 'til-decision-events-by-job')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name=REGION)
dynamodb_client = boto3.client('dynamodb', region_name=REGION)
events_by_job_table = dynamodb.Table(DECISION_EVENTS_BY_JOB_TABLE_NAME)


def get_tool_calls_by_job_id(job_id: str) -> List[Dict[str, Any]]:
    """
    Get all tool calls for a job in chronological order.
    
    Queries decision_events_by_job table by job_id, filters by event_type="tool_called",
    sorts by sort key (seq-first ensures deterministic order).
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        List of tool call events (chronological order by seq)
    """
    tool_calls = []
    
    # Query decision_events_by_job table by job_id
    # Filter by event_type="tool_called" (client-side filtering for MVP)
    # Sort by sort key (ascending, seq-first ensures deterministic order)
    response = events_by_job_table.query(
        KeyConditionExpression='job_id = :job_id',
        ExpressionAttributeValues={
            ':job_id': job_id,
        },
        ScanIndexForward=True,  # Ascending order
    )
    
    # Filter for tool_called events
    for item in response.get('Items', []):
        if item.get('event_type') == 'tool_called':
            tool_calls.append(item)
    
    # Handle pagination if needed
    while 'LastEvaluatedKey' in response:
        response = events_by_job_table.query(
            KeyConditionExpression='job_id = :job_id',
            ExpressionAttributeValues={
                ':job_id': job_id,
            },
            ScanIndexForward=True,
            ExclusiveStartKey=response['LastEvaluatedKey'],
        )
        
        for item in response.get('Items', []):
            if item.get('event_type') == 'tool_called':
                tool_calls.append(item)
    
    # Sort by seq (already sorted by SK, but ensure seq order for safety)
    tool_calls.sort(key=lambda x: x.get('seq', 0))
    
    return tool_calls


def get_tool_call_sequences(job_id: str) -> List[Dict[str, Any]]:
    """
    Get tool call sequences grouped by actor and sub_worker_instance_id.
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        List of sequences, each with:
        - actor: str
        - sub_worker_instance_id: str (optional)
        - tool_calls: List of tool call events (chronological order)
    """
    # Get all tool calls
    all_tool_calls = get_tool_calls_by_job_id(job_id)
    
    # Group by actor and sub_worker_instance_id
    sequences_dict = {}
    
    for tool_call in all_tool_calls:
        actor = tool_call.get('actor', 'unknown')
        sub_worker_instance_id = tool_call.get('sub_worker_instance_id')
        
        # Create sequence key
        sequence_key = f"{actor}#{sub_worker_instance_id or 'none'}"
        
        if sequence_key not in sequences_dict:
            sequences_dict[sequence_key] = {
                'actor': actor,
                'sub_worker_instance_id': sub_worker_instance_id,
                'tool_calls': [],
            }
        
        # Extract relevant fields for sequence
        details = tool_call.get('details', {})
        sequences_dict[sequence_key]['tool_calls'].append({
            'tool_name': details.get('tool_name'),
            'reasoning': details.get('reasoning'),
            'timestamp': tool_call.get('timestamp'),
            'success_status': details.get('success_status'),
            'seq': tool_call.get('seq'),
        })
    
    # Convert to list and sort tool_calls within each sequence by seq
    sequences = []
    for sequence_key, sequence_data in sequences_dict.items():
        sequence_data['tool_calls'].sort(key=lambda x: x.get('seq', 0))
        sequences.append(sequence_data)
    
    # Sort sequences by first tool call seq
    sequences.sort(key=lambda x: x['tool_calls'][0].get('seq', 0) if x['tool_calls'] else 0)
    
    return sequences


def get_tool_effectiveness_metrics(job_id: str) -> Dict[str, Dict[str, Any]]:
    """
    Calculate tool effectiveness metrics (success rate, avg_time, avg_cost per tool).
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        Dict mapping tool_name to metrics:
        {
            "web_search": {
                "success_rate": 0.95,
                "avg_time_ms": 1250,
                "avg_cost_usd": 0.002,
                "total_calls": 8
            },
            ...
        }
    """
    # Get all tool calls
    all_tool_calls = get_tool_calls_by_job_id(job_id)
    
    # Group by tool_name
    tool_stats = defaultdict(lambda: {
        'total_calls': 0,
        'successful_calls': 0,
        'total_time_ms': 0,
        'total_cost_usd': 0.0,
    })
    
    for tool_call in all_tool_calls:
        details = tool_call.get('details', {})
        tool_name = details.get('tool_name')
        
        if not tool_name:
            continue
        
        stats = tool_stats[tool_name]
        stats['total_calls'] += 1
        
        # Count successful calls
        success_status = details.get('success_status', 'error')
        if success_status == 'success':
            stats['successful_calls'] += 1
        
        # Accumulate time and cost
        execution_time_ms = details.get('execution_time_ms', 0)
        if execution_time_ms:
            stats['total_time_ms'] += execution_time_ms
        
        cost_usd = details.get('cost_usd', 0.0)
        if cost_usd:
            stats['total_cost_usd'] += cost_usd
    
    # Calculate metrics
    metrics = {}
    for tool_name, stats in tool_stats.items():
        total_calls = stats['total_calls']
        successful_calls = stats['successful_calls']
        
        # Calculate success rate
        success_rate = successful_calls / total_calls if total_calls > 0 else 0.0
        
        # Calculate average time
        avg_time_ms = stats['total_time_ms'] / total_calls if total_calls > 0 else 0
        
        # Calculate average cost
        avg_cost_usd = stats['total_cost_usd'] / total_calls if total_calls > 0 else 0.0
        
        metrics[tool_name] = {
            'success_rate': round(success_rate, 3),
            'avg_time_ms': round(avg_time_ms, 0),
            'avg_cost_usd': round(avg_cost_usd, 4),
            'total_calls': total_calls,
        }
    
    return metrics


def get_tool_call_by_invocation_id(job_id: str, tool_invocation_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a specific tool call by tool_invocation_id.
    
    Args:
        job_id: Job identifier (UUID)
        tool_invocation_id: Tool invocation ID
        
    Returns:
        Tool call event if found, None otherwise
    """
    # Get all tool calls for job
    all_tool_calls = get_tool_calls_by_job_id(job_id)
    
    # Find tool call with matching tool_invocation_id
    for tool_call in all_tool_calls:
        details = tool_call.get('details', {})
        if details.get('tool_invocation_id') == tool_invocation_id:
            return tool_call
    
    return None
