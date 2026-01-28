"""
Search Recent Content Tool Wrapper
Story 2.2: Worker Agent - Autonomous Execution

Directed web search for recent blog posts, talks, and articles.
Automatically filters to last 6 months and prioritizes practitioner content.

Shares web search budget with web_search tool.
"""

import time
import os
import boto3
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

# Imports (Lambda layer provides these)
from tool_wrappers.web_search import (
    reserve_job_scoped_budget_atomically,
    reserve_per_instance_budget_atomically,
    initialize_guardrail_key,
    WEB_SEARCH_LIMIT,
    TAVILY_API_URL,
)
from tool_wrappers.tool_logger import log_tool_call
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from budget_service.budget_client import increment_web_search_cost, get_web_search_cost_usd

# Configuration
SSM_PARAMETER_PREFIX = os.environ.get('SSM_PARAMETER_PREFIX', '/conference-abstract/dev')

# Initialize SSM client for Parameter Store
ssm_client = boto3.client('ssm', region_name='us-east-1')

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
        from botocore.exceptions import ClientError
        response = ssm_client.get_parameter(
            Name=parameter_name,
            WithDecryption=True
        )
        _tavily_api_key_cache = response['Parameter']['Value']
        return _tavily_api_key_cache
    except ClientError as e:
        raise RuntimeError(f"Failed to retrieve Tavily API key from Parameter Store ({parameter_name}): {e}")

# Content type query augmentations
CONTENT_TYPE_HINTS = {
    "blogs": "blog post dev.to medium hashnode substack",
    "talks": "conference talk presentation youtube keynote",
    "articles": "article tutorial guide documentation",
    "all": "blog article talk tutorial",
}


def build_recent_content_query(topic: str, content_type: str = "all") -> str:
    """
    Build an augmented query for finding recent content.
    
    Args:
        topic: The topic to search for
        content_type: Type of content (blogs, talks, articles, all)
        
    Returns:
        Augmented query string
    """
    type_hint = CONTENT_TYPE_HINTS.get(content_type, CONTENT_TYPE_HINTS["all"])
    
    # Add year hints for recency
    current_year = datetime.now().year
    year_hint = f"{current_year} {current_year - 1}"
    
    return f"{topic} {type_hint} {year_hint}"


def call_tavily_api_with_recency(query: str, days: int = 180) -> Dict[str, Any]:
    """
    Call Tavily API with recency filter.
    
    Args:
        query: Search query string
        days: Number of days to look back (default: 180 = 6 months)
        
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
            'max_results': 10,  # Fewer results for focused search
            'search_depth': 'advanced',  # Better quality results
            'include_domains': [],  # No domain restriction
            'exclude_domains': [],
            # Tavily supports time-based filtering via query augmentation
            # The query is already augmented with year hints
        },
        timeout=30
    )
    
    response.raise_for_status()
    return response.json()


def search_recent_content(
    topic: str,
    job_id: str,
    actor: str,
    worker_id: str,
    worker_vendor: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    content_type: str = "all",
    reasoning: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search for recent blog posts, talks, and articles on a topic.
    
    Shares budget with web_search tool (job-scoped limit).
    Simplified: no per-instance limit for Worker agentic loop.
    
    Args:
        topic: The topic to search for
        job_id: Job identifier (UUID)
        actor: Agent that called tool
        worker_id: Worker identifier
        worker_vendor: Worker vendor (openai | anthropic)
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number
        content_type: Type of content (blogs, talks, articles, all)
        reasoning: Why this tool was called (optional)
        
    Returns:
        Dict with:
        - results: Tool results (or error if budget exceeded)
        - tool_call_record: Tool call record
    """
    start_time = time.time()
    
    # Build augmented query
    augmented_query = build_recent_content_query(topic, content_type)
    
    params = {
        'topic': topic,
        'content_type': content_type,
        'augmented_query': augmented_query,
    }
    
    if not reasoning:
        reasoning = f"Search recent {content_type} content on: {topic[:100]}"
    
    # Reserve job-scoped budget (shares with web_search)
    job_budget_result = reserve_job_scoped_budget_atomically(job_id)
    
    if not job_budget_result['success']:
        error_result = {
            'status': 'budget_exhausted',
            'error': job_budget_result['error'],
            'reason': job_budget_result.get('reason', 'unknown'),
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'web_search_count': job_budget_result.get('web_search_count', 0),
            'web_search_limit': job_budget_result.get('web_search_limit', 0),
            'minimal_mode_activated': job_budget_result.get('minimal_mode_activated', False),
            'api_called': False,
        }
        
        try:
            log_decision_event(
                event_type=EventType.COST_GUARDRAIL_TRIGGERED.value,
                details={
                    'tool_name': 'search_recent_content',
                    'job_id': job_id,
                    'web_search_count': job_budget_result.get('web_search_count', 0),
                    'web_search_limit': job_budget_result.get('web_search_limit', 0),
                    'reason': job_budget_result.get('reason', 'unknown'),
                },
                job_id=job_id,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                actor=actor,
                summary=f"search_recent_content blocked: budget exceeded ({job_budget_result.get('web_search_count', 0)}/{job_budget_result.get('web_search_limit', 0)})",
            )
        except Exception as e:
            print(f"Warning: Failed to log cost_guardrail_triggered event: {e}")
        
        tool_call_record = log_tool_call(
            tool_name="search_recent_content",
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
            tokens_used=0,
            cost_usd=0.0,
            success_status="skipped",
            start_time=start_time,
        )
        
        return {
            'results': error_result,
            'tool_call_record': tool_call_record,
        }
    
    # Call Tavily API with recency focus
    results = {}
    success_status = "success"
    
    try:
        api_response = call_tavily_api_with_recency(augmented_query)
        
        # Format results with metadata
        formatted_results = []
        for item in api_response.get('results', []):
            formatted_results.append({
                'title': item.get('title', ''),
                'url': item.get('url', ''),
                'content': item.get('content', '')[:500],  # Truncate content
                'score': item.get('score', 0),
            })
        
        results = {
            'status': 'success',
            'topic': topic,
            'content_type': content_type,
            'results': formatted_results,
            'result_count': len(formatted_results),
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'api_called': True,
        }
        
    except requests.Timeout:
        success_status = "timeout"
        results = {
            'status': 'timeout',
            'topic': topic,
            'results': [],
            'error': "Search request timed out",
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'api_called': True,
        }
        
    except requests.RequestException as e:
        success_status = "error"
        results = {
            'status': 'error',
            'topic': topic,
            'results': [],
            'error': f"Search request failed: {str(e)}",
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'api_called': True,
        }
        
    except Exception as e:
        success_status = "error"
        results = {
            'status': 'error',
            'topic': topic,
            'results': [],
            'error': f"Unexpected error: {str(e)}",
            'searches_remaining': job_budget_result.get('searches_remaining', 0),
            'api_called': True,
        }
    
    # Track cost if successful
    if success_status == "success":
        try:
            cost_usd = get_web_search_cost_usd()
            increment_web_search_cost(
                job_id=job_id,
                cost_usd=cost_usd,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration
            )
        except Exception as e:
            print(f"Warning: Failed to increment web search cost: {e}")
    
    # Log tool call
    tool_call_record = log_tool_call(
        tool_name="search_recent_content",
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
        tokens_used=0,
        cost_usd=get_web_search_cost_usd() if success_status == "success" else 0.0,
        success_status=success_status,
        start_time=start_time,
    )
    
    return {
        'results': results,
        'tool_call_record': tool_call_record,
    }
