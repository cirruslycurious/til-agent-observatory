"""
Keyword Search Tool Wrapper

Calls the API Gateway endpoint backed by the SQLite FTS index for abstracts.
"""

import os
import time
import json
import requests
from typing import Dict, Any, Optional

# Import tool logger (Lambda layer provides this)
from tool_wrappers.tool_logger import log_tool_call

SEARCH_API_URL = os.environ.get("SEARCH_ABSTRACTS_API_URL")  # e.g., https://xyz.execute-api.us-east-1.amazonaws.com/api/v1/search-abstracts


def search_abstracts(
    query: str,
    job_id: str,
    actor: str,
    worker_id: str,
    worker_vendor: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    conference: Optional[str] = None,
    track: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 5,
    reasoning: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Perform keyword search over example abstracts (SQLite FTS).

    Args:
        query: Search query string (required)
        conference: Optional conference filter
        track: Optional track filter
        year: Optional year filter
        limit: Max results (default 5)
    """
    if not SEARCH_API_URL:
        raise ValueError("SEARCH_ABSTRACTS_API_URL is not set")

    start_time = time.time()
    params = {
        "query": query,
        "conference": conference,
        "track": track,
        "year": year,
        "limit": limit,
    }

    success_status = "success"
    error_message = None
    results: Dict[str, Any] = {}

    try:
        resp = requests.post(
            SEARCH_API_URL,
            data=json.dumps({k: v for k, v in params.items() if v is not None}),
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
    except Exception as e:
        success_status = "error"
        error_message = str(e)
        results = {"error": error_message}

    tool_call_record = log_tool_call(
        tool_name="search_abstracts",
        params={k: v for k, v in params.items() if v is not None},
        results=results,
        reasoning=reasoning or f"Keyword search for query: {query}",
        job_id=job_id,
        actor=actor,
        worker_id=worker_id,
        worker_vendor=worker_vendor,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        sub_worker_instance_id=None,
        tokens_used=0,
        cost_usd=0.0,
        success_status=success_status,
        start_time=start_time,
    )

    return {
        "results": results,
        "tool_call_record": tool_call_record,
    }
