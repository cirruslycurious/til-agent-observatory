"""
Metrics Writer Library (Python)
Story 6.2: DynamoDB Generation Metrics Storage

Source of truth for metrics writing logic.
Handles validation, GSI attributes, and item size management.
"""

import json
import boto3
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal

# Import shared enums
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent / 'enums'))
from conference import Conference
from user_intent import UserIntent

# Configuration
GENERATION_METRICS_TABLE_NAME = os.environ.get('GENERATION_METRICS_TABLE_NAME', 'til-generation-metrics')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Size thresholds
DYNAMODB_SIZE_LIMIT = 350 * 1024  # 350KB (below 400KB DynamoDB limit)

# Initialize clients
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(GENERATION_METRICS_TABLE_NAME)


class ValidationError(Exception):
    """Raised when metrics validation fails"""
    pass


def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert floats to Decimal for DynamoDB compatibility.
    DynamoDB doesn't support float types - must use Decimal.
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


def validate_conference(conference: str) -> bool:
    """
    Validate conference is in closed set.
    
    Args:
        conference: Conference value to validate
        
    Returns:
        True if valid, False otherwise
    """
    return Conference.is_valid(conference)


def validate_evaluator_top_3(top_3: list[str]) -> bool:
    """
    Validate evaluator top_3 is in closed set (same 3 conferences).
    
    Args:
        top_3: List of 3 conference values
        
    Returns:
        True if valid (all 3 values are valid conferences), False otherwise
    """
    if not isinstance(top_3, list) or len(top_3) != 3:
        return False
    
    return all(Conference.is_valid(conf) for conf in top_3)


def validate_user_intent(intent: str) -> bool:
    """
    Validate user_intent is in closed set.
    
    Args:
        intent: User intent value to validate
        
    Returns:
        True if valid, False otherwise
    """
    return UserIntent.is_valid(intent)


def validate_total_iterations(iterations: int) -> bool:
    """
    Validate total_iterations is in valid range (1-5).
    
    Args:
        iterations: Total iterations value
        
    Returns:
        True if valid (1-5), False otherwise
    """
    return isinstance(iterations, int) and 1 <= iterations <= 5


def estimate_item_size(item: Dict[str, Any]) -> int:
    """
    Estimate DynamoDB item size in bytes.
    
    Args:
        item: DynamoDB item dict
        
    Returns:
        Estimated size in bytes
    """
    return len(json.dumps(item, separators=(',', ':')).encode('utf-8'))


def truncate_arrays_if_needed(metrics_data: Dict[str, Any], max_size: int = DYNAMODB_SIZE_LIMIT) -> Dict[str, Any]:
    """
    Truncate arrays in metrics_data if item size exceeds limit.
    
    Args:
        metrics_data: Metrics data dict
        max_size: Maximum size in bytes
        
    Returns:
        Truncated metrics_data dict
    """
    # Create a copy to avoid modifying original
    truncated = json.loads(json.dumps(metrics_data))  # Deep copy via JSON
    
    # Arrays to truncate (keep first N items)
    array_fields = [
        'creativity_progression',
        'iteration_details',
        'sub_workers_spawned',
        'tool_calls_made',
        'tool_sequences',
        'manager_feedback',
        'scratch_artifacts',
    ]
    
    # Truncate arrays if item size exceeds limit
    current_size = estimate_item_size(truncated)
    
    if current_size >= max_size:
        # Truncate arrays to reduce size
        for field in array_fields:
            if field in truncated and isinstance(truncated[field], list):
                # Keep first 10 items (or fewer if still too large)
                truncated[field] = truncated[field][:10]
        
        # Re-check size
        current_size = estimate_item_size(truncated)
        
        if current_size >= max_size:
            # Log warning (in production, use structured logging)
            print(f"Warning: Metrics item size ({current_size} bytes) still exceeds limit after truncation")
    
    return truncated


def write_generation_metrics(
    job_id: str,
    metrics_data: Dict[str, Any],
    record_type: str = "summary"
) -> Dict[str, Any]:
    """
    Writes generation metrics to DynamoDB with validation.
    
    Args:
        job_id: Job identifier (UUID, canonical ID name everywhere)
        metrics_data: Full metrics data (all attribute fields)
        record_type: Record type (summary|iteration|event, default: summary)
        
    Returns:
        dict with write_status
        
    Raises:
        ValidationError: If closed set fields are invalid (does NOT write)
    """
    # Validate record_type
    valid_record_types = ["summary", "iteration", "event"]
    if record_type not in valid_record_types:
        raise ValidationError(f"Invalid record_type: {record_type}. Must be one of {valid_record_types}")
    
    # Validate closed set fields
    if 'conference' in metrics_data:
        if not validate_conference(metrics_data['conference']):
            raise ValidationError(f"Invalid conference: {metrics_data['conference']}. Must be one of {Conference.values()}")
    
    if 'evaluator_result' in metrics_data and 'top_3' in metrics_data['evaluator_result']:
        if not validate_evaluator_top_3(metrics_data['evaluator_result']['top_3']):
            raise ValidationError(f"Invalid evaluator top_3: {metrics_data['evaluator_result']['top_3']}. Must be 3 valid conferences")
    
    if 'user_intent' in metrics_data and metrics_data['user_intent'] is not None:
        if not validate_user_intent(metrics_data['user_intent']):
            raise ValidationError(f"Invalid user_intent: {metrics_data['user_intent']}. Must be one of {UserIntent.values()}")
    
    if 'total_iterations' in metrics_data:
        if not validate_total_iterations(metrics_data['total_iterations']):
            raise ValidationError(f"Invalid total_iterations: {metrics_data['total_iterations']}. Must be 1-5")
    
    # Generate timestamp (ISO 8601 with Z)
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    # Generate date_partition (YYYY-MM-DD)
    date_partition = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Generate sort key: record_type#timestamp
    record_type_timestamp = f"{record_type}#{timestamp}"
    
    # Prepare item for DynamoDB
    item = {
        'job_id': job_id,
        'record_type_timestamp': record_type_timestamp,
        'timestamp': timestamp,  # First-class attribute, always present, used for GSI1 sort key
        'date_partition': date_partition,  # GSI1 and GSI2 partition key
        'record_type': record_type,
        **metrics_data,
    }
    
    # Item size check: Warn if >=350KB, truncate arrays if needed
    item_size = estimate_item_size(item)
    if item_size >= DYNAMODB_SIZE_LIMIT:
        # Truncate arrays to reduce size
        item = truncate_arrays_if_needed(item, DYNAMODB_SIZE_LIMIT)
        # Log warning (in production, use structured logging)
        print(f"Warning: Metrics item size ({item_size} bytes) exceeds limit, truncated arrays")
    
    # Convert floats to Decimal for DynamoDB compatibility
    item = convert_floats_to_decimal(item)
    
    # Write to DynamoDB
    table.put_item(Item=item)
    
    return {
        'write_status': 'created',
        'job_id': job_id,
        'record_type': record_type,
        'record_type_timestamp': record_type_timestamp,  # Include for retrieval
        'timestamp': timestamp,
        'date_partition': date_partition,
    }


def write_iteration_metrics(
    job_id: str,
    iteration: int,
    iteration_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Writes iteration metrics to DynamoDB.
    
    Args:
        job_id: Job identifier (UUID)
        iteration: Iteration number (0-4)
        iteration_data: Iteration-specific metrics data
        
    Returns:
        dict with write_status
        
    Raises:
        ValidationError: If iteration is invalid (0-4) or closed set fields are invalid
    """
    # Validate iteration is 0-4
    if not isinstance(iteration, int) or not (0 <= iteration <= 4):
        raise ValidationError(f"Invalid iteration: {iteration}. Must be 0-4")
    
    # Add iteration number to iteration_data
    iteration_data['iteration'] = iteration
    
    # Write with record_type = "iteration"
    return write_generation_metrics(
        job_id=job_id,
        metrics_data=iteration_data,
        record_type="iteration"
    )
