"""
Web Search Tool Wrapper (Python)
Story 3.3: Tool Usage Logging
Story 4.2: Minimal Tool Mode Enforcement

Wrapper for Tavily web search with dual budget enforcement (job-scoped + per-instance) and comprehensive logging.

Dual Budget Enforcement:
- Job-scoped limit (Story 4.1): 10 normal, 2 minimal mode TOTAL per job (tracked in job_budgets table)
- Per-instance limit (Story 3.3): 2 searches per sub-worker instance per iteration (tracked in web_search_guardrails table)
- Reservation ordering: Job-scoped FIRST (scarcer resource), then per-instance
- Both limits must pass before API call
- Structured error responses include job_scope_reserved and instance_scope_reserved flags
"""

import time
import os
import boto3
import requests
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from botocore.exceptions import ClientError

# Import tool logger and decision event logger (Lambda layer provides these)
from tool_wrappers.tool_logger import log_tool_call
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from decision_events.actor import Actor

# Import budget service for cost increment
from budget_service.budget_client import increment_web_search_cost, get_web_search_cost_usd

# Configuration
WEB_SEARCH_GUARDRAILS_TABLE_NAME = os.environ.get('WEB_SEARCH_GUARDRAILS_TABLE_NAME', 'til-web-search-guardrails')
JOB_BUDGETS_TABLE_NAME = os.environ.get('JOB_BUDGETS_TABLE_NAME', 'til-job-budgets')
SSM_PARAMETER_PREFIX = os.environ.get('SSM_PARAMETER_PREFIX', '/conference-abstract/dev')
TAVILY_API_URL = 'https://api.tavily.com/search'
WEB_SEARCH_LIMIT = 2  # Max 2 searches per sub-worker instance per iteration
TAVILY_COST_PER_SEARCH = 0.002  # Fixed cost per search (from Tavily pricing)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
dynamodb_client = boto3.client('dynamodb', region_name='us-east-1')
ssm_client = boto3.client('ssm', region_name='us-east-1')
guardrails_table = dynamodb.Table(WEB_SEARCH_GUARDRAILS_TABLE_NAME)
job_budgets_table = dynamodb.Table(JOB_BUDGETS_TABLE_NAME)

# API Key cache (avoid repeated Parameter Store calls)
_tavily_api_key_cache = None


def get_tavily_api_key() -> str:
    """
    Retrieve Tavily API key from AWS Parameter Store.
    Uses caching to avoid repeated calls within the same Lambda execution.
    
    Returns:
        Tavily API key string
        
    Raises:
        RuntimeError: If Parameter Store retrieval fails
    """
    global _tavily_api_key_cache
    
    # Return cached key if available
    if _tavily_api_key_cache:
        return _tavily_api_key_cache
    
    # Fetch from Parameter Store
    parameter_name = f"{SSM_PARAMETER_PREFIX}/tavily-api-key"
    
    try:
        response = ssm_client.get_parameter(
            Name=parameter_name,
            WithDecryption=True
        )
        _tavily_api_key_cache = response['Parameter']['Value']
        return _tavily_api_key_cache
    except ClientError as e:
        raise RuntimeError(f"Failed to retrieve Tavily API key from Parameter Store ({parameter_name}): {e}")


def reserve_job_scoped_budget_atomically(job_id: str) -> Dict[str, Any]:
    """
    Atomically reserve job-scoped web search budget (BEFORE API call).
    
    Story 4.1: Job-scoped limit (10 normal, 2 minimal mode TOTAL per job).
    Reservation happens FIRST (scarcer resource in minimal mode).
    
    Args:
        job_id: Job identifier (UUID)
        
    Returns:
        Dict with:
        - success: bool
        - web_search_count: int (if success)
        - web_search_limit: int
        - searches_remaining: int
        - minimal_mode_activated: bool
        - error: str (if failed)
        - reason: str (if failed, diagnosis reason)
    """
    try:
        # Atomic reservation: UpdateItem ADD web_search_count :one with ConditionExpression
        response = job_budgets_table.update_item(
            Key={'job_id': job_id},
            UpdateExpression='ADD web_search_count :one SET updated_at = :now',
            ConditionExpression='attribute_exists(job_id) AND web_search_count < web_search_limit',
            ExpressionAttributeValues={
                ':one': 1,
                ':now': datetime.now(timezone.utc).isoformat(),
            },
            ReturnValues='ALL_NEW'
        )
        
        # Get updated values
        attributes = response['Attributes']
        web_search_count = int(attributes.get('web_search_count', 0))
        web_search_limit = int(attributes.get('web_search_limit', 10))
        searches_remaining = max(0, web_search_limit - web_search_count)
        minimal_mode_activated = bool(attributes.get('minimal_mode_activated', False))
        
        return {
            'success': True,
            'web_search_count': web_search_count,
            'web_search_limit': web_search_limit,
            'searches_remaining': searches_remaining,
            'minimal_mode_activated': minimal_mode_activated,
        }
    
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        
        if error_code == 'ConditionalCheckFailedException':
            # Budget exceeded or job doesn't exist - perform lightweight GetItem for diagnosis
            try:
                response = job_budgets_table.get_item(Key={'job_id': job_id})
                if 'Item' not in response:
                    return {
                        'success': False,
                        'web_search_count': 0,
                        'web_search_limit': 0,
                        'searches_remaining': 0,
                        'minimal_mode_activated': False,
                        'error': 'Job budget not found',
                        'reason': 'job_not_found',
                    }
                
                item = response['Item']
                web_search_count = int(item.get('web_search_count', 0))
                web_search_limit = int(item.get('web_search_limit', 10))
                minimal_mode_activated = bool(item.get('minimal_mode_activated', False))
                
                if web_search_count >= web_search_limit:
                    reason = 'minimal_mode' if minimal_mode_activated else 'job_limit_exceeded'
                    return {
                        'success': False,
                        'web_search_count': web_search_count,
                        'web_search_limit': web_search_limit,
                        'searches_remaining': 0,
                        'minimal_mode_activated': minimal_mode_activated,
                        'error': f'Web search budget exceeded for job: {web_search_count}/{web_search_limit} searches used',
                        'reason': reason,
                    }
                else:
                    # Should not happen, but handle gracefully
                    return {
                        'success': False,
                        'web_search_count': web_search_count,
                        'web_search_limit': web_search_limit,
                        'searches_remaining': max(0, web_search_limit - web_search_count),
                        'minimal_mode_activated': minimal_mode_activated,
                        'error': 'Condition check failed (unknown reason)',
                        'reason': 'unknown',
                    }
            except Exception as get_error:
                # GetItem failed - return generic error
                return {
                    'success': False,
                    'web_search_count': 0,
                    'web_search_limit': 0,
                    'searches_remaining': 0,
                    'minimal_mode_activated': False,
                    'error': f'Failed to diagnose budget state: {str(get_error)}',
                    'reason': 'diagnosis_failed',
                }
        else:
            # Other error
            return {
                'success': False,
                'web_search_count': 0,
                'web_search_limit': 0,
                'searches_remaining': 0,
                'minimal_mode_activated': False,
                'error': f'Job-scoped budget reservation failed: {error_code}',
                'reason': 'reservation_failed',
            }


def reserve_per_instance_budget_atomically(
    guardrail_key: str,
    limit: int = WEB_SEARCH_LIMIT
) -> Dict[str, Any]:
    """
    Atomically reserve per-instance web search budget (BEFORE API call).
    
    Story 3.3: Per-sub-worker-instance limit (2 per instance per iteration).
    Reservation happens SECOND (after job-scoped succeeds).
    
    Args:
        guardrail_key: Guardrail key (format: {job_id}#{iteration}#{sub_worker_type}#{sub_worker_instance_id})
        limit: Search limit (default: 2)
        
    Returns:
        Dict with:
        - success: bool
        - searches_used: int (if success)
        - limit: int
        - error: str (if failed)
    """
    try:
        # Atomic reservation: UpdateItem ADD web_search_count :one with ConditionExpression
        response = guardrails_table.update_item(
            Key={'guardrail_key': guardrail_key},
            UpdateExpression='ADD web_search_count :one SET web_search_limit = if_not_exists(web_search_limit, :limit), updated_at = :now',
            ConditionExpression='attribute_not_exists(web_search_count) OR web_search_count < :limit',
            ExpressionAttributeValues={
                ':one': 1,
                ':limit': limit,
                ':now': datetime.now(timezone.utc).isoformat(),
            },
            ReturnValues='ALL_NEW'
        )
        
        # Get updated count
        searches_used = response['Attributes'].get('web_search_count', 0)
        
        return {
            'success': True,
            'searches_used': searches_used,
            'limit': limit,
        }
    
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        
        if error_code == 'ConditionalCheckFailedException':
            # Budget exceeded - get current count
            try:
                response = guardrails_table.get_item(
                    Key={'guardrail_key': guardrail_key}
                )
                searches_used = response.get('Item', {}).get('web_search_count', 0)
            except:
                searches_used = limit  # Assume limit reached if we can't read
            
            return {
                'success': False,
                'searches_used': searches_used,
                'limit': limit,
                'error': f'Web search budget exceeded for sub-worker instance: {searches_used}/{limit} searches used',
            }
        else:
            # Other error
            return {
                'success': False,
                'searches_used': 0,
                'limit': limit,
                'error': f'Per-instance budget reservation failed: {error_code}',
            }


def initialize_guardrail_key(guardrail_key: str) -> None:
    """
    Initialize guardrail key if it doesn't exist (idempotent).
    
    Args:
        guardrail_key: Guardrail key
    """
    try:
        guardrails_table.put_item(
            Item={
                'guardrail_key': guardrail_key,
                'web_search_count': 0,
                'web_search_limit': WEB_SEARCH_LIMIT,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
            },
            ConditionExpression='attribute_not_exists(guardrail_key)'
        )
    except ClientError as e:
        # Ignore if already exists (idempotent)
        if e.response.get('Error', {}).get('Code') != 'ConditionalCheckFailedException':
            raise


def call_tavily_api(query: str) -> Dict[str, Any]:
    """
    Call Tavily API for web search.
    
    Args:
        query: Search query string
        
    Returns:
        Dict with search results
    """
    # Fetch Tavily API key from Parameter Store
    try:
        tavily_api_key = get_tavily_api_key()
    except RuntimeError as e:
        raise ValueError(str(e))
    
    response = requests.post(
        TAVILY_API_URL,
        json={
            'api_key': tavily_api_key,
            'query': query,
            'max_results': 20,  # Max results per search
        },
        timeout=30  # 30 second timeout
    )
    
    response.raise_for_status()
    return response.json()


def web_search(
    query: str,
    job_id: str,
    actor: str,
    worker_id: str,
    worker_vendor: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    sub_worker_type: str,
    sub_worker_instance_id: str,
    reasoning: Optional[str] = None
) -> Dict[str, Any]:
    """
    Perform web search with atomic budget enforcement and comprehensive logging.
    
    Args:
        query: Search query string
        job_id: Job identifier (UUID)
        actor: Agent that called tool (worker | sub_worker)
        worker_id: Worker identifier
        worker_vendor: Worker vendor (openai | anthropic)
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number (0-4)
        sub_worker_type: Sub-worker type (e.g., "evidence_researcher")
        sub_worker_instance_id: Sub-worker instance ID
        reasoning: Why this tool was called (optional)
        
    Returns:
        Dict with:
        - results: Tool results (or error if budget exceeded)
        - tool_call_record: Tool call record for artifact provenance.tool_calls array
    """
    # Start timing
    start_time = time.time()
    
    # Build guardrail key
    guardrail_key = f"{job_id}#{iteration}#{sub_worker_type}#{sub_worker_instance_id}"
    
    # Initialize guardrail key if needed (idempotent)
    try:
        initialize_guardrail_key(guardrail_key)
    except Exception as e:
        # Log warning but continue (initialization failure shouldn't block)
        print(f"Warning: Failed to initialize guardrail key: {e}")
    
    # Build tool parameters
    params = {
        'query': query,
    }
    
    # Default reasoning if not provided
    if not reasoning:
        reasoning = f"Search for: {query[:100]}"  # Truncate to 100 chars for default
    
    # **Dual budget enforcement: Job-scoped FIRST, then per-instance**
    # Reservation ordering: Job-scoped FIRST (scarcer resource in minimal mode), then per-instance
    # (prevents wasting per-instance capacity if job is already exhausted)
    
    # Step 1: Reserve job-scoped limit (atomic, no read-then-reserve)
    job_budget_result = reserve_job_scoped_budget_atomically(job_id)
    
    if not job_budget_result['success']:
        # Job-scoped budget exceeded - return structured error
        error_result = {
            'status': 'budget_exhausted',
            'error': job_budget_result['error'],
            'reason': job_budget_result.get('reason', 'unknown'),
            'job_scope_reserved': False,
            'instance_scope_reserved': False,
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'web_search_count': job_budget_result.get('web_search_count', 0),
            'web_search_limit': job_budget_result.get('web_search_limit', 0),
            'minimal_mode_activated': job_budget_result.get('minimal_mode_activated', False),
            'api_called': False,
        }
        
        # Log cost_guardrail_triggered decision event
        try:
            log_decision_event(
                event_type=EventType.COST_GUARDRAIL_TRIGGERED.value,
                details={
                    'tool_name': 'web_search',
                    'job_id': job_id,
                    'web_search_count': job_budget_result.get('web_search_count', 0),
                    'web_search_limit': job_budget_result.get('web_search_limit', 0),
                    'minimal_mode_activated': job_budget_result.get('minimal_mode_activated', False),
                    'reason': job_budget_result.get('reason', 'unknown'),
                    'job_scope_reserved': False,
                    'instance_scope_reserved': False,
                },
                job_id=job_id,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                actor=actor,
                sub_worker_instance_id=sub_worker_instance_id,
                summary=f"Web search blocked: job-scoped limit exceeded ({job_budget_result.get('web_search_count', 0)}/{job_budget_result.get('web_search_limit', 0)})",
            )
        except Exception as e:
            # Log error but continue (event logging failure shouldn't block)
            print(f"Warning: Failed to log cost_guardrail_triggered event: {e}")
        
        # Log tool call with skipped status
        tool_call_record = log_tool_call(
            tool_name="web_search",
            params=params,
            results=error_result,
            reasoning=reasoning,
            job_id=job_id,
            actor=actor,
            worker_id=worker_id,
            worker_vendor=worker_vendor,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            sub_worker_instance_id=sub_worker_instance_id,
            tokens_used=0,
            cost_usd=0.0,
            success_status="skipped",  # Skipped if guardrails block before any attempt
            start_time=start_time,
        )
        
        return {
            'results': error_result,
            'tool_call_record': tool_call_record,
        }
    
    # Step 2: Reserve per-instance limit (atomic, after job-scoped succeeds)
    instance_budget_result = reserve_per_instance_budget_atomically(guardrail_key, WEB_SEARCH_LIMIT)
    
    if not instance_budget_result['success']:
        # Per-instance budget exceeded - return structured error
        # NOTE: Job-scoped reservation is NOT refunded (preserves single-pass, race-safe design)
        error_result = {
            'status': 'budget_exhausted',
            'error': instance_budget_result['error'],
            'reason': 'instance_limit_exceeded',
            'job_scope_reserved': True,  # Job-scoped reservation succeeded
            'instance_scope_reserved': False,  # Per-instance reservation failed
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'web_search_count': job_budget_result.get('web_search_count', 0),
            'web_search_limit': job_budget_result.get('web_search_limit', 0),
            'minimal_mode_activated': job_budget_result.get('minimal_mode_activated', False),
            'instance_searches_used': instance_budget_result.get('searches_used', 0),
            'instance_limit': instance_budget_result.get('limit', WEB_SEARCH_LIMIT),
            'api_called': False,
        }
        
        # Log cost_guardrail_triggered decision event
        try:
            log_decision_event(
                event_type=EventType.COST_GUARDRAIL_TRIGGERED.value,
                details={
                    'tool_name': 'web_search',
                    'guardrail_key': guardrail_key,
                    'searches_used': instance_budget_result.get('searches_used', 0),
                    'limit': instance_budget_result.get('limit', WEB_SEARCH_LIMIT),
                    'reason': 'Web search budget exceeded for sub-worker instance',
                    'job_scope_reserved': True,
                    'instance_scope_reserved': False,
                },
                job_id=job_id,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                actor=actor,
                sub_worker_instance_id=sub_worker_instance_id,
                summary=f"Web search blocked: per-instance limit exceeded ({instance_budget_result.get('searches_used', 0)}/{instance_budget_result.get('limit', WEB_SEARCH_LIMIT)})",
            )
        except Exception as e:
            # Log error but continue (event logging failure shouldn't block)
            print(f"Warning: Failed to log cost_guardrail_triggered event: {e}")
        
        # Log tool call with skipped status
        tool_call_record = log_tool_call(
            tool_name="web_search",
            params=params,
            results=error_result,
            reasoning=reasoning,
            job_id=job_id,
            actor=actor,
            worker_id=worker_id,
            worker_vendor=worker_vendor,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            sub_worker_instance_id=sub_worker_instance_id,
            tokens_used=0,
            cost_usd=0.0,
            success_status="skipped",  # Skipped if guardrails block before any attempt
            start_time=start_time,
        )
        
        return {
            'results': error_result,
            'tool_call_record': tool_call_record,
        }
    
    # **If both reservations succeed: API call happens AFTER successful reservations**
    results = {}
    success_status = "success"
    error_message = None
    api_called = True
    
    try:
        # Call Tavily API
        api_response = call_tavily_api(query)
        
        # Format results
        results = {
            'status': 'success',
            'query': query,
            'results': api_response.get('results', []),
            'response_time': api_response.get('response_time', 0),
            'api_called': True,
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
        }
        
    except requests.Timeout:
        success_status = "timeout"
        error_message = "Tavily API request timed out"
        results = {
            'status': 'timeout',
            'query': query,
            'results': [],
            'error': error_message,
            'api_called': True,  # API was called, but timed out
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
        }
        # Note: Budget count already incremented by reservation (NOT refunded)
    
    except requests.RequestException as e:
        success_status = "error"
        error_message = f"Tavily API request failed: {str(e)}"
        results = {
            'status': 'error',
            'query': query,
            'results': [],
            'error': error_message,
            'api_called': True,  # API was called, but failed
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
        }
        # Note: Budget count already incremented by reservation (NOT refunded)
    
    except Exception as e:
        success_status = "error"
        error_message = f"Unexpected error: {str(e)}"
        results = {
            'status': 'error',
            'query': query,
            'results': [],
            'error': error_message,
            'api_called': True,  # API was attempted
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
        }
        # Note: Budget count already incremented by reservation (NOT refunded)
    
    # **After successful API call (or failure): Increment web search cost in budget service**
    # This tracks cost separately from the count (for cost monitoring)
    if success_status == "success":
        try:
            # Get web search cost from config
            cost_usd = get_web_search_cost_usd()
            # Increment cost in budget service (best effort - doesn't fail if event logger fails)
            increment_web_search_cost(
                job_id=job_id,
                cost_usd=cost_usd,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration
            )
        except Exception as e:
            # Log warning but continue (cost tracking failure shouldn't block tool call)
            print(f"Warning: Failed to increment web search cost: {e}")
    
    # Log tool call
    tool_call_record = log_tool_call(
        tool_name="web_search",
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
        tokens_used=0,  # Web search doesn't use tokens
        cost_usd=get_web_search_cost_usd() if success_status == "success" else 0.0,
        success_status=success_status,
        start_time=start_time,
    )
    
    # Return results with tool call record
    return {
        'results': results,
        'tool_call_record': tool_call_record,
    }
