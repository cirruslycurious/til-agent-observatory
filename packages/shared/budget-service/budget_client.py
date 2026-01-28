"""
Budget Service (Python)
Story 4.1: Per-Job Budget Tracking

Source of truth for budget tracking.
Handles budget initialization, cost increments, and minimal mode activation.
"""

import boto3
import os
import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone
# Removed Decimal import - using integer cents instead
from botocore.exceptions import ClientError

# Imports (Lambda layer provides these)
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from decision_events.actor import Actor

# Configuration
JOB_BUDGETS_TABLE_NAME = os.environ.get('JOB_BUDGETS_TABLE_NAME', 'til-job-budgets')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Budget thresholds (in cents to avoid float precision issues)
MINIMAL_MODE_THRESHOLD_CENTS = 500  # $5.00 threshold for minimal mode activation (500 cents)
COST_WARNING_THRESHOLD_CENTS = 200  # $2.00 threshold for cost warning (200 cents, non-blocking telemetry)

# Default limits
DEFAULT_WEB_SEARCH_LIMIT = 10  # Normal mode: 10 web searches per job
MINIMAL_WEB_SEARCH_LIMIT = 2   # Minimal mode: 2 web searches per job

# Web search cost (configurable via env var, defaults to Tavily pricing)
# Cost in cents per search (0.2 cents = $0.002 per search)
WEB_SEARCH_COST_CENTS_STR = os.environ.get('WEB_SEARCH_COST_CENTS', '0')
WEB_SEARCH_COST_CENTS = int(WEB_SEARCH_COST_CENTS_STR) if WEB_SEARCH_COST_CENTS_STR else 0  # Default: 0 (must be set)

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name=REGION)
dynamodb_client = boto3.client('dynamodb', region_name=REGION)
job_budgets_table = dynamodb.Table(JOB_BUDGETS_TABLE_NAME)


class BudgetError(Exception):
    """Raised when budget operation fails"""
    pass


def get_current_timestamp() -> str:
    """Get current ISO timestamp"""
    return datetime.now(timezone.utc).isoformat()


def initialize_job_budget(job_id: str) -> Dict[str, Any]:
    """
    Initialize budget tracking for a new job.
    
    Creates job_budgets entry atomically (ConditionExpression: attribute_not_exists(job_id)).
    Idempotent: If budget already exists, returns existing budget.
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        Budget state dict with all fields
        
    Raises:
        BudgetError: If initialization fails (non-idempotent errors)
    """
    now = get_current_timestamp()
    
    budget_item = {
        'job_id': job_id,
        'web_search_count': 0,
        'web_search_limit': DEFAULT_WEB_SEARCH_LIMIT,
        'estimated_cost_cents': 0,  # Store as integer cents (not float)
        'minimal_mode_activated': False,
        'minimal_mode_activated_at': None,  # Timestamp when minimal mode was activated
        'tokens_used': 0,
        'created_at': now,
        'updated_at': now,
        'last_cost_event_at': None,
        'last_cost_event_id': None,  # UUID of last cost event (for idempotency)
        'job_created_at': now  # Store job creation date for daily cost attribution
    }
    
    try:
        # Atomic creation with ConditionExpression to prevent duplicates
        job_budgets_table.put_item(
            Item=budget_item,
            ConditionExpression='attribute_not_exists(job_id)'
        )
        return budget_item
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Budget already exists - return existing (idempotent behavior)
            return get_job_budget(job_id)
        else:
            raise BudgetError(f"Failed to initialize budget for job {job_id}: {e}")


def get_job_budget(job_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve current budget state for a job.
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        Budget state dict or None if not found
    """
    try:
        response = job_budgets_table.get_item(Key={'job_id': job_id})
        if 'Item' not in response:
            return None
        
        item = response['Item']
        
        # Calculate searches_remaining
        web_search_limit = int(item.get('web_search_limit', DEFAULT_WEB_SEARCH_LIMIT))
        web_search_count = int(item.get('web_search_count', 0))
        searches_remaining = max(0, web_search_limit - web_search_count)
        
        # Convert to API-friendly format (cents -> dollars at boundary)
        estimated_cost_cents = int(item.get('estimated_cost_cents', 0))
        budget_state = {
            'job_id': item['job_id'],
            'web_search_count': int(item.get('web_search_count', 0)),
            'web_search_limit': web_search_limit,
            'estimated_cost_cents': estimated_cost_cents,  # Internal: cents (integer)
            'estimated_cost_usd': estimated_cost_cents / 100.0,  # API boundary: dollars (computed)
            'minimal_mode_activated': bool(item.get('minimal_mode_activated', False)),
            'minimal_mode_activated_at': item.get('minimal_mode_activated_at'),
            'tokens_used': int(item.get('tokens_used', 0)),
            'searches_remaining': searches_remaining,
            'created_at': item.get('created_at'),
            'updated_at': item.get('updated_at'),
            'last_cost_event_at': item.get('last_cost_event_at'),
            'last_cost_event_id': item.get('last_cost_event_id'),  # For idempotency
            'job_created_at': item.get('job_created_at')  # For daily cost attribution
        }
        
        return budget_state
    except ClientError as e:
        raise BudgetError(f"Failed to get budget for job {job_id}: {e}")


def _activate_minimal_mode(job_id: str, execution_id: Optional[str] = None, state_name: Optional[str] = None, iteration: Optional[int] = None) -> bool:
    """
    Activate minimal mode atomically.
    
    Sets minimal_mode_activated = true, web_search_limit = 2, and minimal_mode_activated_at timestamp.
    Emits cost_guardrail_triggered decision event only after successful activation.
    
    Args:
        job_id: Job identifier (UUID)
        execution_id: Step Functions execution ID (optional, for event logging)
        state_name: Step Functions state name (optional, for event logging)
        iteration: Iteration number (optional, for event logging)
        
    Returns:
        True if minimal mode was activated (or already activated), False if condition not met
    """
    now = get_current_timestamp()
    
    try:
        # Atomic activation: Only activate if estimated_cost_cents > 500 AND minimal_mode_activated = false
        # Single conditional UpdateItem ensures idempotency
        job_budgets_table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='SET minimal_mode_activated = :true, web_search_limit = :limit, minimal_mode_activated_at = :now, updated_at = :now',
            ConditionExpression='estimated_cost_cents > :threshold AND minimal_mode_activated = :false',
            ExpressionAttributeValues={
                ':true': True,
                ':limit': MINIMAL_WEB_SEARCH_LIMIT,
                ':now': now,
                ':threshold': MINIMAL_MODE_THRESHOLD_CENTS,
                ':false': False
            }
        )
        
        # Emit cost_guardrail_triggered decision event only after successful activation
        try:
            budget = get_job_budget(job_id)
            log_decision_event(
                event_type=EventType.COST_GUARDRAIL_TRIGGERED.value,
                details={
                    'budget_exceeded': True,
                    'minimal_mode_activated': True,
                    'estimated_cost_cents': budget['estimated_cost_cents'],
                    'estimated_cost_usd': budget['estimated_cost_usd'],
                    'threshold_cents': MINIMAL_MODE_THRESHOLD_CENTS,
                    'threshold_usd': MINIMAL_MODE_THRESHOLD_CENTS / 100.0
                },
                job_id=job_id,
                execution_id=execution_id or '',
                state_name=state_name or '',
                iteration=iteration or 0,
                actor=Actor.SYSTEM.value,
                summary=f"Minimal tool mode activated: cost exceeded ${MINIMAL_MODE_THRESHOLD_CENTS / 100.0:.2f} threshold"
            )
        except Exception as e:
            # Log warning but don't fail budget update (event logging is optional)
            print(f"Warning: Failed to log cost_guardrail_triggered event: {e}")
        
        return True
            
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Minimal mode already activated or cost not yet exceeded - no-op (idempotent)
            # Check if already activated
            budget = get_job_budget(job_id)
            return budget and budget.get('minimal_mode_activated', False)
        else:
            raise BudgetError(f"Failed to activate minimal mode for job {job_id}: {e}")


def increment_llm_cost(
    job_id: str,
    cost_usd: float,
    tokens: int,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    execution_id: Optional[str] = None,
    state_name: Optional[str] = None,
    iteration: Optional[int] = None
) -> Dict[str, Any]:
    """
    Increment LLM cost and tokens for a job.
    
    **Budget mutation happens first; cost_event is emitted only after a successful budget update**
    (ensures budget is source of truth, decision events reflect committed state, retries don't double-log cost events)
    
    Activates minimal mode if cost > $5 (500 cents).
    
    Args:
        job_id: Job identifier (UUID)
        cost_usd: Cost in USD (will be converted to cents internally)
        tokens: Total tokens used
        provider: LLM provider (optional, for event logging)
        model: LLM model (optional, for event logging)
        execution_id: Step Functions execution ID (optional, for event logging)
        state_name: Step Functions state name (optional, for event logging)
        iteration: Iteration number (optional, for event logging)
        
    Returns:
        Updated budget state dict
        
    Raises:
        BudgetError: If increment fails
    """
    now = get_current_timestamp()
    
    # Convert USD to cents (round to nearest cent to avoid precision issues)
    cost_cents = int(round(cost_usd * 100))
    
    try:
        # **Budget mutation happens first:** Atomic increment (using integer cents)
        response = job_budgets_table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='ADD estimated_cost_cents :cost, tokens_used :tokens SET updated_at = :now, last_cost_event_at = :now',
            ExpressionAttributeValues={
                ':cost': cost_cents,
                ':tokens': tokens,
                ':now': now
            },
            ReturnValues='ALL_NEW'
        )
        
        updated_item = response['Attributes']
        new_cost_cents = int(updated_item['estimated_cost_cents'])
        new_tokens = int(updated_item['tokens_used'])
        minimal_mode_activated = bool(updated_item.get('minimal_mode_activated', False))
        
        # Check minimal mode activation (atomic check-and-activate)
        if new_cost_cents > MINIMAL_MODE_THRESHOLD_CENTS and not minimal_mode_activated:
            _activate_minimal_mode(job_id, execution_id, state_name, iteration)
            # Re-fetch to get updated minimal_mode_activated and web_search_limit
            updated_item = job_budgets_table.get_item(Key={'job_id': job_id})['Item']
        
        # **After successful budget update:** Emit cost_event decision event (best effort)
        # Generate cost_event_id for idempotency (prevents double-logging on retries)
        cost_event_id = str(uuid.uuid4())
        
        # Update last_cost_event_id in budget (for idempotency tracking)
        try:
            job_budgets_table.update_item(
                Key={'job_id': job_id},
                UpdateExpression='SET last_cost_event_id = :event_id',
                ExpressionAttributeValues={':event_id': cost_event_id}
            )
        except Exception as e:
            # Log warning but continue (idempotency tracking failure shouldn't block)
            print(f"Warning: Failed to update last_cost_event_id: {e}")
        
        # Emit cost_event (best effort - budget service works even if event logger fails)
        try:
            log_decision_event(
                event_type=EventType.COST_EVENT.value,
                details={
                    'cost_event_id': cost_event_id,  # Include for idempotency
                    'estimated_cost_cents': new_cost_cents,
                    'estimated_cost_usd': new_cost_cents / 100.0,
                    'tokens_used': new_tokens,
                    'provider': provider,
                    'model': model,
                    'cost_type': 'llm'
                },
                job_id=job_id,
                execution_id=execution_id or '',
                state_name=state_name or '',
                iteration=iteration or 0,
                actor=Actor.SYSTEM.value,
                summary=f"LLM cost: ${new_cost_cents / 100.0:.4f} ({new_tokens} tokens)"
            )
        except Exception as e:
            # Log warning but don't fail budget update (event logging is optional/best effort)
            # Budget mutation already succeeded - event emission is telemetry only
            print(f"Warning: Failed to log cost_event (budget mutation succeeded): {e}")
        
        # **Optional enhancement:** Cost warning at $2 threshold (non-blocking telemetry)
        # TODO: Implement cost_warning_event if needed
        
        # Return updated budget state
        return get_job_budget(job_id)
        
    except ClientError as e:
        raise BudgetError(f"Failed to increment LLM cost for job {job_id}: {e}")


def increment_web_search_cost(
    job_id: str,
    cost_usd: float,
    execution_id: Optional[str] = None,
    state_name: Optional[str] = None,
    iteration: Optional[int] = None
) -> Dict[str, Any]:
    """
    Increment web search cost for a job.
    
    **Budget mutation happens first; cost_event is emitted only after a successful budget update**
    (ensures budget is source of truth, decision events reflect committed state, retries don't double-log cost events)
    
    Activates minimal mode if cost > $5 (500 cents).
    
    Args:
        job_id: Job identifier (UUID)
        cost_usd: Cost in USD (will be converted to cents internally)
        execution_id: Step Functions execution ID (optional, for event logging)
        state_name: Step Functions state name (optional, for event logging)
        iteration: Iteration number (optional, for event logging)
        
    Returns:
        Updated budget state dict
        
    Raises:
        BudgetError: If increment fails
    """
    now = get_current_timestamp()
    
    # Convert USD to cents (round to nearest cent to avoid precision issues)
    cost_cents = int(round(cost_usd * 100))
    
    try:
        # **Budget mutation happens first:** Atomic increment (using integer cents)
        response = job_budgets_table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='ADD estimated_cost_cents :cost SET updated_at = :now, last_cost_event_at = :now',
            ExpressionAttributeValues={
                ':cost': cost_cents,
                ':now': now
            },
            ReturnValues='ALL_NEW'
        )
        
        updated_item = response['Attributes']
        new_cost_cents = int(updated_item['estimated_cost_cents'])
        minimal_mode_activated = bool(updated_item.get('minimal_mode_activated', False))
        
        # Check minimal mode activation (atomic check-and-activate)
        if new_cost_cents > MINIMAL_MODE_THRESHOLD_CENTS and not minimal_mode_activated:
            _activate_minimal_mode(job_id, execution_id, state_name, iteration)
            # Re-fetch to get updated minimal_mode_activated and web_search_limit
            updated_item = job_budgets_table.get_item(Key={'job_id': job_id})['Item']
        
        # **After successful budget update:** Emit cost_event decision event (best effort)
        # Generate cost_event_id for idempotency (prevents double-logging on retries)
        cost_event_id = str(uuid.uuid4())
        
        # Update last_cost_event_id in budget (for idempotency tracking)
        try:
            job_budgets_table.update_item(
                Key={'job_id': job_id},
                UpdateExpression='SET last_cost_event_id = :event_id',
                ExpressionAttributeValues={':event_id': cost_event_id}
            )
        except Exception as e:
            # Log warning but continue (idempotency tracking failure shouldn't block)
            print(f"Warning: Failed to update last_cost_event_id: {e}")
        
        # Emit cost_event (best effort - budget service works even if event logger fails)
        try:
            log_decision_event(
                event_type=EventType.COST_EVENT.value,
                details={
                    'cost_event_id': cost_event_id,  # Include for idempotency
                    'estimated_cost_cents': new_cost_cents,
                    'estimated_cost_usd': new_cost_cents / 100.0,
                    'cost_type': 'web_search'
                },
                job_id=job_id,
                execution_id=execution_id or '',
                state_name=state_name or '',
                iteration=iteration or 0,
                actor=Actor.SYSTEM.value,
                summary=f"Web search cost: ${new_cost_cents / 100.0:.4f}"
            )
        except Exception as e:
            # Log warning but don't fail budget update (event logging is optional/best effort)
            # Budget mutation already succeeded - event emission is telemetry only
            print(f"Warning: Failed to log cost_event (budget mutation succeeded): {e}")
        
        # **Optional enhancement:** Cost warning at $2 threshold (non-blocking telemetry)
        # TODO: Implement cost_warning_event if needed
        
        # Return updated budget state
        return get_job_budget(job_id)
        
    except ClientError as e:
        raise BudgetError(f"Failed to increment web search cost for job {job_id}: {e}")


def get_web_search_cost_usd() -> float:
    """
    Get web search cost in USD (from configurable cents).
    
    Returns:
        Cost in USD (cents / 100.0)
    """
    return WEB_SEARCH_COST_CENTS / 100.0


def check_minimal_mode_activation(job_id: str) -> bool:
    """
    Check and activate minimal mode if cost > $5 (500 cents).
    
    This is a convenience function for checking activation outside of increment functions.
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        True if minimal mode is activated (or was just activated), False otherwise
    """
    budget = get_job_budget(job_id)
    if not budget:
        return False
    
    if budget['estimated_cost_cents'] > MINIMAL_MODE_THRESHOLD_CENTS and not budget['minimal_mode_activated']:
        _activate_minimal_mode(job_id)
        return True
    
    return budget['minimal_mode_activated']
