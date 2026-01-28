"""
Tool Logger Library (Python)
Story 3.3: Tool Usage Logging

Source of truth for tool call logging.
Handles tool invocation ID generation, results summary, S3 overflow, and decision event logging.
"""

import json
import hashlib
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone

# Import shared utilities (Lambda layer provides these at /opt/python/)
from s3_uploader import canonical_json_serialize, upload_tool_results_to_s3, TOOL_RESULTS_SIZE_THRESHOLD

# Import decision event logger
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from decision_events.actor import Actor

# Import enums
from artifact_schemas.artifact_envelope import ToolName, SuccessStatus

# Configuration
TOOL_RESULTS_SIZE_LIMIT = 50 * 1024  # 50KB
RESULTS_SUMMARY_MIN_LENGTH = 50
RESULTS_SUMMARY_MAX_LENGTH = 200


def generate_tool_invocation_id(
    execution_id: str,
    state_name: str,
    iteration: int,
    tool_name: str,
    actor: str,
    sub_worker_instance_id: Optional[str],
    canonical_params_hash: str
) -> str:
    """
    Generate deterministic tool_invocation_id (retry-stable, no timestamp).
    
    Format: sha256(execution_id + state_name + iteration + tool_name + actor + (sub_worker_instance_id or "") + canonical_params_hash)
    
    Args:
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number (0-4)
        tool_name: Tool name (e.g., "web_search")
        actor: Actor (worker | sub_worker)
        sub_worker_instance_id: Sub-worker instance ID (optional)
        canonical_params_hash: SHA-256 hash of canonical JSON params
        
    Returns:
        SHA-256 hash (hex string, 64 characters)
    """
    # Build input string (delimiter-separated to avoid ambiguity)
    sub_worker_id = sub_worker_instance_id or ""
    input_string = f"{execution_id}|{state_name}|{iteration}|{tool_name}|{actor}|{sub_worker_id}|{canonical_params_hash}"
    
    # Convert to UTF-8 bytes and hash
    input_bytes = input_string.encode('utf-8')
    return hashlib.sha256(input_bytes).hexdigest()


def compute_canonical_params_hash(params: Dict[str, Any]) -> str:
    """
    Compute canonical hash of tool parameters (deterministic).
    
    Args:
        params: Tool parameters dict
        
    Returns:
        SHA-256 hash (hex string, 64 characters)
    """
    canonical_bytes = canonical_json_serialize(params)
    return hashlib.sha256(canonical_bytes).hexdigest()


def generate_results_summary(results: Dict[str, Any], tool_name: str) -> str:
    """
    Generate deterministic results summary (50-200 chars, no model calls).
    
    Pattern per tool:
    - web_search: Top N result titles + one-line relevance conclusion
    - dynamodb_lookup: Data type + count + key fields
    
    Args:
        results: Tool results dict
        tool_name: Tool name (e.g., "web_search")
        
    Returns:
        Results summary (50-200 chars, hard truncated to 200)
    """
    if tool_name == "web_search":
        # Extract top N result titles
        items = results.get('results', [])
        if not items:
            return "No search results found"
        
        # Get top 3 titles
        titles = []
        for item in items[:3]:
            title = item.get('title', '')
            if title:
                titles.append(title)
        
        # Build summary
        if titles:
            summary = f"Found {len(items)} results. Top: {', '.join(titles[:2])}"
            if len(titles) > 2:
                summary += f", {titles[2]}"
        else:
            summary = f"Found {len(items)} search results"
        
        # Hard truncate to 200 chars
        if len(summary) > RESULTS_SUMMARY_MAX_LENGTH:
            summary = summary[:RESULTS_SUMMARY_MAX_LENGTH - 3] + "..."
        
        # Ensure minimum length
        if len(summary) < RESULTS_SUMMARY_MIN_LENGTH:
            summary = summary + " " * (RESULTS_SUMMARY_MIN_LENGTH - len(summary))
        
        return summary
    
    elif tool_name == "dynamodb_lookup":
        # Extract data type and count
        data_type = results.get('data_type', 'unknown')
        items = results.get('items', [])
        count = len(items) if isinstance(items, list) else 0
        
        # Extract key fields if available
        key_fields = []
        if items and isinstance(items, list) and len(items) > 0:
            first_item = items[0]
            if isinstance(first_item, dict):
                # Get first few keys
                key_fields = list(first_item.keys())[:3]
        
        summary = f"{data_type}: {count} items"
        if key_fields:
            summary += f" (keys: {', '.join(key_fields[:2])})"
        
        # Hard truncate to 200 chars
        if len(summary) > RESULTS_SUMMARY_MAX_LENGTH:
            summary = summary[:RESULTS_SUMMARY_MAX_LENGTH - 3] + "..."
        
        # Ensure minimum length
        if len(summary) < RESULTS_SUMMARY_MIN_LENGTH:
            summary = summary + " " * (RESULTS_SUMMARY_MIN_LENGTH - len(summary))
        
        return summary
    
    else:
        # Generic fallback
        summary = f"Tool {tool_name} completed successfully"
        if len(summary) < RESULTS_SUMMARY_MIN_LENGTH:
            summary = summary + " " * (RESULTS_SUMMARY_MIN_LENGTH - len(summary))
        return summary[:RESULTS_SUMMARY_MAX_LENGTH]


def summarize_params(params: Dict[str, Any]) -> str:
    """
    Summarize tool parameters (full if <100 chars, summary if large).
    
    Args:
        params: Tool parameters dict
        
    Returns:
        Parameter summary string
    """
    # Serialize to JSON
    params_json = json.dumps(params, sort_keys=True, separators=(',', ':'))
    
    if len(params_json) <= 100:
        return params_json
    
    # Summarize large params
    # Extract key-value pairs, truncate long values
    summary_parts = []
    for key, value in params.items():
        value_str = str(value)
        if len(value_str) > 50:
            value_str = value_str[:47] + "..."
        summary_parts.append(f"{key}: {value_str}")
    
    summary = ", ".join(summary_parts)
    if len(summary) > 200:
        summary = summary[:197] + "..."
    
    return summary


def log_tool_call(
    tool_name: str,
    params: Dict[str, Any],
    results: Dict[str, Any],
    reasoning: str,
    job_id: str,
    actor: str,
    worker_id: str,
    worker_vendor: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    sub_worker_instance_id: Optional[str] = None,
    tokens_used: int = 0,
    execution_time_ms: Optional[int] = None,
    cost_usd: float = 0.0,
    success_status: str = "success",
    start_time: Optional[float] = None
) -> Dict[str, Any]:
    """
    Log a tool call as decision event and return tool call record for artifact.
    
    Args:
        tool_name: Name of tool (dynamodb_lookup | web_search)
        params: Tool parameters
        results: Tool results
        reasoning: Why this tool, why now (max 200 chars)
        job_id: Job identifier (UUID)
        actor: Agent that called tool (worker | sub_worker)
        worker_id: Worker identifier
        worker_vendor: Worker vendor (openai | anthropic)
        execution_id: Step Functions execution ID
        state_name: Step Functions state name
        iteration: Iteration number (0-4)
        sub_worker_instance_id: Sub-worker instance ID (optional)
        tokens_used: Tokens used (default: 0 for non-LLM tools)
        execution_time_ms: Execution time in milliseconds (optional, computed from start_time if not provided)
        cost_usd: Cost in USD (default: 0.0)
        success_status: Success status (success | timeout | error | budget_exhausted | skipped)
        start_time: Start timestamp (optional, for computing execution_time_ms)
        
    Returns:
        Tool call record for artifact provenance.tool_calls array
    """
    # Validate inputs
    if len(reasoning) > 200:
        reasoning = reasoning[:197] + "..."
    
    # Compute execution time if not provided
    if execution_time_ms is None and start_time is not None:
        execution_time_ms = int((time.time() - start_time) * 1000)
    elif execution_time_ms is None:
        execution_time_ms = 0
    
    # Generate canonical params hash
    canonical_params_hash = compute_canonical_params_hash(params)
    
    # Generate tool_invocation_id (deterministic, retry-stable)
    tool_invocation_id = generate_tool_invocation_id(
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        tool_name=tool_name,
        actor=actor,
        sub_worker_instance_id=sub_worker_instance_id,
        canonical_params_hash=canonical_params_hash
    )
    
    # Generate results summary (deterministic, 50-200 chars)
    results_summary = generate_results_summary(results, tool_name)
    
    # Summarize params
    params_summary = summarize_params(params)
    
    # Check if results need S3 storage (>50KB)
    results_json_bytes = canonical_json_serialize(results)
    results_size = len(results_json_bytes)
    s3_tool_results_ref = None
    
    if results_size > TOOL_RESULTS_SIZE_LIMIT:
        # Upload to S3
        # Story 3.3 format: tool-results/{job_id}/{tool_invocation_id}/results.json
        # Use existing function but adjust parameters to match story format
        # The existing function creates: {job_id}/{task_id}/{artifact_version}/tool_results/{tool_call_id}.json
        # We want: tool-results/{job_id}/{tool_invocation_id}/results.json
        # So we'll use: task_id="tool-results", artifact_version=tool_invocation_id, tool_call_id="results"
        task_id = "tool-results"
        artifact_version = tool_invocation_id
        tool_call_id = "results"
        
        try:
            upload_result = upload_tool_results_to_s3(
                job_id=job_id,
                task_id=task_id,
                artifact_version=artifact_version,
                tool_results=results,
                tool_name=tool_name,
                tool_call_id=tool_call_id
            )
            if upload_result:
                # The function returns s3_key in format: {job_id}/{task_id}/{artifact_version}/tool_results/{tool_call_id}.json
                # We need: tool-results/{job_id}/{tool_invocation_id}/results.json
                # So we'll construct it manually to match story format
                s3_tool_results_ref = f"tool-results/{job_id}/{tool_invocation_id}/results.json"
        except Exception as e:
            # Log error but continue (S3 upload failure shouldn't block event logging)
            print(f"Warning: Failed to upload tool results to S3: {e}")
    
    # Build tool_called event details
    event_details = {
        'tool_name': tool_name,
        'tool_invocation_id': tool_invocation_id,
        'params_summary': params_summary,
        'results_summary': results_summary,
        'reasoning': reasoning,
        'tokens_used': tokens_used,
        'execution_time_ms': execution_time_ms,
        'cost_usd': cost_usd,
        'success_status': success_status,
        'worker_id': worker_id,
        'worker_vendor': worker_vendor,
        'sub_worker_instance_id': sub_worker_instance_id,
        's3_tool_results_ref': s3_tool_results_ref,
    }
    
    # Log tool_called decision event
    try:
        event_result = log_decision_event(
            event_type=EventType.TOOL_CALLED.value,
            details=event_details,
            job_id=job_id,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            actor=actor,
            sub_worker_instance_id=sub_worker_instance_id,
            summary=f"{actor.capitalize()} called {tool_name} tool",
            rationale_summary=reasoning,
            inputs_summary=params_summary[:200] if len(params_summary) > 200 else params_summary,
            outputs_summary=results_summary,
        )
    except Exception as e:
        # Log error but continue (event logging failure shouldn't block tool call)
        print(f"Warning: Failed to log tool_called decision event: {e}")
        event_result = {'event_id': tool_invocation_id, 'job_id': job_id}
    
    # Build tool call record for artifact provenance.tool_calls array
    tool_call_record = {
        'tool_name': tool_name,
        'tool_invocation_id': tool_invocation_id,
        'params_summary': params_summary,
        'results_summary': results_summary,
        'reasoning': reasoning,
        'tokens_used': tokens_used,
        'execution_time_ms': execution_time_ms,
        'cost_usd': cost_usd,
        'success_status': success_status,
        's3_tool_results_ref': s3_tool_results_ref,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'actor': actor,
        'worker_id': worker_id,
        'worker_vendor': worker_vendor,
        'sub_worker_instance_id': sub_worker_instance_id,
    }
    
    return tool_call_record
