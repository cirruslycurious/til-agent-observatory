"""
🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨

MANDATORY PRE-MODIFICATION CHECKLIST:
1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
2. Read .ai-checklists/pre-deployment.md COMPLETELY
3. Read ALL inline comments in THIS file
4. Understand what the CURRENT code does before changing it
5. Run tests after changes: pytest tests/

CRITICAL: This Lambda is the Worker Agent - core of the agentic workflow.
Changes can break abstract generation for ALL jobs. Test thoroughly!

Documentation: docs/stories/2.2.worker-agent-autonomous-execution.md

🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THINGS 🚨🚨🚨

---

Worker Agent Lambda Function
Story 2.2: Worker Agent - Autonomous Execution

Agentic tool loop: LLM decides which tools to call and when to submit.
Tools: dynamodb_lookup, search_abstracts, web_search, search_recent_content, red_team_review, submit_abstract
"""

import json
import os
import sys
import time
from typing import Dict, Any, Optional, List
from pathlib import Path

# Add shared packages to path (Lambda Layers + local dev)
lambda_dir = Path(__file__).parent
shared_path_layer = Path('/opt/python')
shared_path_unbundled = lambda_dir.parent.parent.parent.parent / 'packages' / 'shared'

sys.path.insert(0, str(shared_path_layer))
if shared_path_unbundled.exists():
    sys.path.insert(0, str(shared_path_unbundled))

shared_path_bundled = lambda_dir / 'packages' / 'shared'
if shared_path_bundled.exists():
    sys.path.insert(0, str(shared_path_bundled))

# Import shared libraries
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from decision_events.actor import Actor
from budget_service.budget_client import get_job_budget, increment_llm_cost
from llm_client.llm_client import call_llm_with_tools
from llm_client.tool_definitions import (
    get_tools_for_openai,
    get_tools_for_anthropic,
    TERMINAL_TOOLS,
    TOOL_COSTS,
    ACTION_POINTS_PER_ITERATION,
)
from llm_client.vendor_assignment import assign_vendor
from tool_wrappers.dynamodb_lookup import dynamodb_lookup
from tool_wrappers.web_search import web_search
from tool_wrappers.search_abstracts import search_abstracts
from tool_wrappers.search_recent_content import search_recent_content
from tool_wrappers.red_team_review import red_team_review
from artifact_writer.artifact_writer import write_artifact
from datetime import datetime, timezone

# Configuration
JOBS_TABLE_NAME = os.environ.get('JOBS_TABLE_NAME', 'til-jobs')
ARTIFACTS_TABLE_NAME = os.environ.get('ARTIFACTS_TABLE_NAME', 'til-artifacts')
REGION = os.environ.get('AWS_REGION', 'us-east-1')
MAX_LOOP_SECONDS = 240  # 4 minutes safety timeout


def write_worker_artifact(
    job_id: str,
    iteration: int,
    title: str,
    abstract: str,
    evidence_pointers: List[str],
    confidence: float,
    tool_calls_log: List[Dict[str, Any]],
    vendor: str,
    model: str,
    conference: str,
    topic: str,
    manager_feedback: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Write worker artifact to til-artifacts table (Story 6.1).
    
    Returns artifact_id if successful, None if failed (non-blocking).
    """
    try:
        # Convert tool_calls_log to artifact ToolCall format
        tool_calls_for_artifact = []
        for tc in tool_calls_log:
            tool_calls_for_artifact.append({
                'tool_name': tc.get('tool', 'unknown'),
                'tool_invocation_id': tc.get('tool_call_id', f"call_{len(tool_calls_for_artifact)}"),
                'success_status': 'success' if tc.get('success', False) else ('skipped' if tc.get('error') == 'insufficient_action_points' else 'failure'),
                'results_summary': str(tc.get('result', {}).get('results', ''))[:200] if tc.get('result') else 'No result',
                's3_tool_results_ref': None,  # Not implemented yet
            })
        
        # Build artifact envelope
        now = datetime.now(timezone.utc)
        artifact_data = {
            'meta': {
                'artifact_id': '',  # Will be set by write_artifact
                'job_id': job_id,
                'iteration': iteration,
                'parent_task_id': 'worker_execution',
                'task_id': f'worker_iter_{iteration}',
                'worker_id': 'til-worker-agent',
                'worker_vendor': vendor,
                'worker_model': model,
                'artifact_type': 'final',  # Worker output is always final for that iteration
                'artifact_version': 'v0001',  # Will auto-increment if needed
                'content_hash': '',  # Will be computed by write_artifact
                'schema_version': 'v1',  # Maps to schema file: final_v1.schema.json
                'spawned_at': now.isoformat(),
                'completed_at': now.isoformat(),
                'status': 'completed',
            },
            'data': {
                'title': title,
                'abstract': abstract,
                'evidence_pointers': evidence_pointers,
            },
            'quality_signals': {
                'confidence': confidence,
                'coverage': 'comprehensive' if len(tool_calls_log) >= 3 else ('moderate' if len(tool_calls_log) >= 1 else 'limited'),
            },
            'provenance': {
                'sources': [],  # Can be enhanced later with evidence_pointers parsing
                'tool_calls': tool_calls_for_artifact,
                'inputs': {
                    'conference': conference,
                    'topic': topic,
                    'manager_feedback': manager_feedback,
                },
            },
            'execution': {
                'tokens_used': None,  # Not tracked per-iteration yet
                'execution_time_ms': None,  # Not tracked per-iteration yet
            },
        }
        
        # Write artifact
        result = write_artifact(
            artifact_data=artifact_data,
            job_id=job_id,
            task_id=f'worker_iter_{iteration}',
            artifact_version='v0001',  # Auto-increments if conflict
            return_existing_on_conflict=True,
        )
        
        print(f"✅ Artifact written: {result.get('artifact_id')}")
        return result
        
    except Exception as e:
        # Non-blocking: Log error but don't fail the worker
        print(f"⚠️ Warning: Failed to write artifact: {e}")
        # If it's an ArtifactValidationError, print detailed errors
        if hasattr(e, 'errors') and e.errors:
            print(f"Validation errors ({len(e.errors)}):")
            for i, err in enumerate(e.errors, 1):
                print(f"  {i}. {err}")
        import traceback
        traceback.print_exc()
        return None


WORKER_SYSTEM_PROMPT = """You are a Worker agent writing a conference abstract.

You have access to tools to research and refine your work. You have **{action_points} action points** this iteration.

Your goal: Write a compelling conference abstract for {conference} on the topic of {topic}.

**Action Point Costs:**
- dynamodb_lookup: 1 point (quick lookup)
- web_search: 1 point (web search)
- search_recent_content: 1 point (recent blogs/articles)
- search_abstracts: 2 points (keyword search across abstracts)
- red_team_review: 1 point (quality critique of your draft)
- submit_abstract: FREE (use when ready)

**IMPORTANT: Think out loud before each action.**
Before calling any tool, briefly explain:
1. What you're trying to accomplish
2. Why this specific tool will help
3. What you expect to learn

Example: "I need to understand the conference's expected format and tone, so I'll look up the guidance for {conference}. This will help me structure my abstract correctly."

**Strategy tips:**
- Start by looking up conference GUIDANCE to understand the expected format and tone
- Search for similar abstracts to see what works well
- Use web search sparingly for current trends or specific technical details
- IMPORTANT: Use red_team_review to validate your draft - it has the actual submission requirements that guidance doesn't include
- You may not be able to do everything in one iteration - that's OK!

**CRITICAL RULES - DO NOT VIOLATE:**
- ❌ DO NOT mention "{conference}" in your title
- ❌ DO NOT mention "{topic}" in your title
- ❌ DO NOT mention "{conference}" in your abstract text
- ✅ DO demonstrate conference fit through content, not declarations

**Output requirements:**
Your final abstract MUST include these sections:
- Problem: What challenge or opportunity are you addressing?
- Approach: What is your solution or methodology?
- Impact: What results or value does this provide?
- Why this conference: Why is this relevant to {conference}?

When you're satisfied with your abstract, call submit_abstract with:
- title: A compelling title
- abstract: The full text with all four sections
- evidence_pointers: References to sources you used
- confidence: Your confidence score (0.0 to 1.0)
"""


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Worker agent executes autonomous tool loop.
    
    Step Functions input:
    {
        "job_id": "uuid",
        "conference": "black_hat",
        "topic": "ai_ml_genai", 
        "iteration": 0,
        "manager_feedback": "...",
        "previous_artifacts": [...],
        "execution_id": "exec-123",
        "state_name": "WorkerExecution"
    }
    """
    try:
        job_id = event.get('job_id')
        conference = event.get('conference')
        topic = event.get('topic')
        iteration = event.get('iteration', 0)
        manager_feedback = event.get('manager_feedback', '')
        previous_artifacts = event.get('previous_artifacts', [])
        execution_id = event.get('execution_id', 'unknown')
        state_name = event.get('state_name', 'WorkerExecution')
        
        if not job_id or not conference or not topic:
            raise ValueError("job_id, conference, and topic are required")
        
        # Calculate creativity (0.3 → 0.7 based on iteration)
        creativity = min(0.3 + (iteration * 0.1), 0.7)
        
        # Get budget state (initialize if needed for test jobs)
        budget = get_job_budget(job_id)
        if budget is None:
            # Initialize budget for test jobs or first-time access
            from budget_service.budget_client import initialize_job_budget
            budget = initialize_job_budget(job_id)
        web_budget_remaining = max(0, budget.get('web_search_limit', 10) - budget.get('web_search_count', 0))
        
        # Assign vendor (worker role is always opposite of manager)
        vendor, model = assign_vendor(job_id, iteration, role="worker")
        
        # Execute agentic loop
        return execute_agentic_loop(
            job_id=job_id,
            conference=conference,
            topic=topic,
            iteration=iteration,
            manager_feedback=manager_feedback,
            previous_artifacts=previous_artifacts,
            creativity=creativity,
            vendor=vendor,
            model=model,
            web_budget_remaining=web_budget_remaining,
            execution_id=execution_id,
            state_name=state_name,
        )
        
    except Exception as e:
        error_message = str(e)[:500]
        return {
            'error': error_message,
            'status': 'failed',
        }


def execute_agentic_loop(
    job_id: str,
    conference: str,
    topic: str,
    iteration: int,
    manager_feedback: str,
    previous_artifacts: List[Dict[str, Any]],
    creativity: float,
    vendor: str,
    model: str,
    web_budget_remaining: int,
    execution_id: str,
    state_name: str,
) -> Dict[str, Any]:
    """
    Execute the agentic tool loop.
    
    LLM decides which tools to call. Loop continues until:
    - submit_abstract is called (success)
    - Action points exhausted
    - Time limit reached
    """
    start_time = time.time()
    action_points_spent = 0
    tool_calls_log = []
    tools_used = set()  # Track which tools were used this iteration
    
    # Build system prompt with budget info
    system_prompt = WORKER_SYSTEM_PROMPT.format(
        action_points=ACTION_POINTS_PER_ITERATION,
        web_budget=web_budget_remaining,
        conference=conference,
        topic=topic,
    )
    
    # Build initial user message
    user_content = f"""Generate a conference abstract for:
- Conference: {conference}
- Topic: {topic}
- Iteration: {iteration + 1} of 3

Action points available this iteration: {ACTION_POINTS_PER_ITERATION}
"""
    
    if manager_feedback and iteration > 0:
        user_content += f"\n\n## Manager Feedback from Previous Iteration:\n{manager_feedback}"
    
    # Include previous tool calls history
    if previous_artifacts and iteration > 0:
        user_content += "\n\n## Previous Iterations Summary:"
        for i, prev in enumerate(previous_artifacts):
            if isinstance(prev, dict):
                # Handle nested Payload from Step Functions
                payload = prev.get('Payload', prev)
                if isinstance(payload, dict):
                    prev_title = payload.get('title', 'No title')
                    prev_tools = payload.get('tool_calls', [])
                    user_content += f"\n\n### Iteration {i + 1}:"
                    user_content += f"\n- Title: {prev_title[:100]}"
                    if prev_tools:
                        user_content += f"\n- Tools used:"
                        for tc in prev_tools[:5]:  # Limit to 5 tools
                            tool_name = tc.get('tool', 'unknown')
                            success = 'success' if tc.get('success') else 'failed'
                            args_summary = str(tc.get('args', {}))[:80]
                            user_content += f"\n  - {tool_name} ({success}): {args_summary}"
        user_content += "\n\nBuild on this previous work. Avoid repeating tools that already succeeded unless manager feedback requires it."
    
    # Initialize messages
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    
    # Get tools for vendor
    tools = get_tools_for_openai() if vendor == "openai" else get_tools_for_anthropic()
    
    # Log loop start
    log_decision_event(
        event_type=EventType.AGENTIC_LOOP_STARTED.value,
        details={
            'action_points_budget': ACTION_POINTS_PER_ITERATION,
            'web_search_budget': web_budget_remaining,
            'vendor': vendor,
            'model': model,
        },
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        actor=Actor.WORKER.value,
        summary=f"Starting iteration {iteration + 1} for {conference} {topic}",
    )
    
    # Agentic loop - continue while we have budget OR can still call free tools (like submit_abstract)
    # The loop will exit when the LLM successfully calls a terminal tool (submit_abstract)
    at_budget_attempts = 0  # Track attempts when at budget limit to prevent infinite loops
    max_at_budget_attempts = 3  # Give LLM 3 chances to call submit_abstract when out of points
    
    while action_points_spent <= ACTION_POINTS_PER_ITERATION:  # <= allows calling 0-cost tools at budget limit
        # If we're at the budget limit, track attempts
        if action_points_spent >= ACTION_POINTS_PER_ITERATION:
            at_budget_attempts += 1
            if at_budget_attempts > max_at_budget_attempts:
                break  # Force exit if LLM won't call submit_abstract
        
        # Check time limit
        elapsed = time.time() - start_time
        if elapsed > MAX_LOOP_SECONDS:
            # Time limit reached - force submit with what we have
            return {
                'status': 'timeout',
                'title': f'[Draft] {topic} for {conference}',
                'abstract': f'[Incomplete - time limit reached after {elapsed:.0f}s]',
                'evidence_pointers': [],
                'confidence': 0.1,
                'tool_calls': tool_calls_log,
                'tools_used': list(tools_used),
                'action_points_spent': action_points_spent,
                'vendor': vendor,
                'model': model,
            }
        
        # Call LLM with tools
        try:
            llm_response = call_llm_with_tools(
                messages=messages,
                vendor=vendor,
                model=model,
                creativity=creativity,
                tools=tools,
                max_tokens=4000,
            )
        except Exception as e:
            return {
                'status': 'llm_error',
                'title': f'[Draft] {topic} for {conference}',
                'abstract': f'[Incomplete - LLM error: {str(e)[:200]}]',
                'evidence_pointers': [],
                'confidence': 0.1,
                'tool_calls': tool_calls_log,
                'tools_used': list(tools_used),
                'action_points_spent': action_points_spent,
                'vendor': vendor,
                'model': model,
            }
        
        # Track LLM cost
        try:
            increment_llm_cost(
                job_id=job_id,
                cost_usd=llm_response['cost_usd'],
                tokens=llm_response['total_tokens'],
                provider=vendor,
                model=model,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
            )
        except Exception as e:
            print(f"Warning: Failed to track LLM cost: {e}")
        
        # Capture LLM reasoning (text response before/with tool calls)
        reasoning_text = (llm_response.get('response') or '').strip()
        if reasoning_text and len(reasoning_text) > 10:
            # Log planning step with the LLM's reasoning
            log_decision_event(
                event_type=EventType.PLANNING_STEP.value,
                details={
                    'reasoning': reasoning_text[:1000],  # Truncate long reasoning
                    'action_points_spent': action_points_spent,
                    'action_points_remaining': ACTION_POINTS_PER_ITERATION - action_points_spent,
                },
                job_id=job_id,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                actor=Actor.WORKER.value,
                summary=f"Planning: {reasoning_text[:100]}...",
            )
        
        # Check if LLM wants to call tools
        if llm_response.get('tool_calls'):
            for tool_call in llm_response['tool_calls']:
                tool_name = tool_call['name']
                tool_args = json.loads(tool_call['arguments']) if isinstance(tool_call['arguments'], str) else tool_call['arguments']
                tool_call_id = tool_call.get('id', f'call_{len(tool_calls_log)}')
                
                # Check if terminal tool (submit_abstract)
                if tool_name in TERMINAL_TOOLS:
                    # Submit abstract - success!
                    log_decision_event(
                        event_type=EventType.ABSTRACT_SUBMITTED.value,
                        details={
                            'title': tool_args.get('title', ''),
                            'abstract': tool_args.get('abstract', ''),  # Include full abstract text
                            'confidence': tool_args.get('confidence', 0),
                            'action_points_spent': action_points_spent,
                            'tools_used': list(tools_used),
                        },
                        job_id=job_id,
                        execution_id=execution_id,
                        state_name=state_name,
                        iteration=iteration,
                        actor=Actor.WORKER.value,
                        summary=f"Abstract submitted: {tool_args.get('title', 'Untitled')[:50]}",
                    )
                    
                    # Write artifact to til-artifacts (Story 6.1)
                    write_worker_artifact(
                        job_id=job_id,
                        iteration=iteration,
                        title=tool_args.get('title', ''),
                        abstract=tool_args.get('abstract', ''),
                        evidence_pointers=tool_args.get('evidence_pointers', []),
                        confidence=tool_args.get('confidence', 0.5),
                        tool_calls_log=tool_calls_log,
                        vendor=vendor,
                        model=model,
                        conference=conference,
                        topic=topic,
                        manager_feedback=manager_feedback,
                    )
                    
                    return {
                        'status': 'success',
                        'title': tool_args.get('title', ''),
                        'abstract': tool_args.get('abstract', ''),
                        'evidence_pointers': tool_args.get('evidence_pointers', []),
                        'confidence': tool_args.get('confidence', 0.5),
                        'tool_calls': tool_calls_log,
                        'tools_used': list(tools_used),
                        'action_points_spent': action_points_spent,
                        'vendor': vendor,
                        'model': model,
                    }
                
                # Check if we have enough action points for this tool
                tool_cost = TOOL_COSTS.get(tool_name, 1)
                points_remaining = ACTION_POINTS_PER_ITERATION - action_points_spent
                
                if tool_cost > points_remaining:
                    # Not enough points - tell LLM to submit
                    if points_remaining == 0:
                        feedback_msg = f"You have NO action points remaining. You MUST call submit_abstract now (it costs 0 points). No other tools are available."
                    else:
                        feedback_msg = f"You only have {points_remaining} action points remaining. {tool_name} costs {tool_cost}. Please call submit_abstract to finish (costs 0) or choose a cheaper tool."
                    
                    tool_result = {
                        'status': 'error',
                        'error': f'Not enough action points. {tool_name} costs {tool_cost} but you only have {points_remaining} remaining. Call submit_abstract to finish.',
                    }
                    tool_calls_log.append({
                        'tool': tool_name,
                        'args': tool_args,
                        'success': False,
                        'error': 'insufficient_action_points',
                    })
                    # Continue loop to let LLM respond with submit_abstract
                    messages.append({"role": "assistant", "content": f"I tried to call {tool_name} but don't have enough action points."})
                    messages.append({"role": "user", "content": feedback_msg})
                    continue
                
                # Execute non-terminal tool
                action_points_spent += tool_cost
                tools_used.add(tool_name)
                
                # Generate unique tool invocation ID
                import uuid
                tool_invocation_id = f"tool-{uuid.uuid4().hex[:12]}"
                
                tool_result = execute_tool(
                    tool_name=tool_name,
                    tool_args=tool_args,
                    job_id=job_id,
                    conference=conference,
                    topic=topic,
                    iteration=iteration,
                    vendor=vendor,
                    execution_id=execution_id,
                    state_name=state_name,
                )
                
                tool_success = tool_result.get('status') != 'error'
                results_summary = str(tool_result.get('results', {}))[:200] if tool_success else f"Error: {tool_result.get('error', 'unknown')}"
                
                # Extract reasoning from tool arguments (now a required parameter)
                tool_reasoning = tool_args.get('reasoning', f'Calling {tool_name}')
                
                # Log tool call with required schema fields
                log_decision_event(
                    event_type=EventType.TOOL_CALLED.value,
                    details={
                        'tool_name': tool_name,
                        'tool_invocation_id': tool_invocation_id,
                        'parameters': tool_args,
                        'results_summary': results_summary,
                        'reasoning': tool_reasoning,
                        'action_points_remaining': ACTION_POINTS_PER_ITERATION - action_points_spent,
                    },
                    job_id=job_id,
                    execution_id=execution_id,
                    state_name=state_name,
                    iteration=iteration,
                    actor=Actor.WORKER.value,
                    summary=f"Tool: {tool_name} - {'success' if tool_success else 'failed'}",
                )
                
                tool_log_entry = {
                    'tool': tool_name,
                    'args': tool_args,
                    'success': tool_success,
                }
                
                # Include red team scores in log
                if tool_name == 'red_team_review':
                    results = tool_result.get('results', {})
                    tool_log_entry['scores'] = {
                        'overall': results.get('overall_score'),
                        'structure': results.get('structure_score'),
                        'requirements': results.get('requirements_score'),
                        'tone': results.get('tone_score'),
                        'verdict': results.get('verdict'),
                    }
                
                tool_calls_log.append(tool_log_entry)
                
                # Calculate remaining budget
                points_remaining = ACTION_POINTS_PER_ITERATION - action_points_spent
                
                # Update web budget if web search was used
                if tool_name in ['web_search', 'search_recent_content']:
                    web_budget_remaining = tool_result.get('results', {}).get('searches_remaining', web_budget_remaining)
                
                # Build tool result message with budget context
                result_with_context = {
                    'result': tool_result.get('results', {}),
                    'action_points_remaining': points_remaining,
                    'web_searches_remaining': web_budget_remaining,
                }
                
                # Append tool call and result to messages
                if vendor == "openai":
                    messages.append({
                        "role": "assistant",
                        "tool_calls": [{
                            "id": tool_call_id,
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps(tool_args),
                            }
                        }]
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": json.dumps(result_with_context),
                    })
                else:  # anthropic
                    messages.append({
                        "role": "assistant",
                        "content": [{
                            "type": "tool_use",
                            "id": tool_call_id,
                            "name": tool_name,
                            "input": tool_args,
                        }]
                    })
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": json.dumps(result_with_context),
                        }]
                    })
        
        else:
            # LLM responded with text but no tool call
            # This shouldn't happen with good prompting, but handle it
            response_text = llm_response.get('response', '')
            
            if response_text:
                # Append as assistant message and prompt to continue
                messages.append({"role": "assistant", "content": response_text})
                messages.append({
                    "role": "user", 
                    "content": f"Please continue. You have {ACTION_POINTS_PER_ITERATION - action_points_spent} action points remaining. When ready, call submit_abstract to finish."
                })
    
    # Action points exhausted - still need to submit something
    # Generate a placeholder submission so the workflow can continue
    log_decision_event(
        event_type=EventType.COST_GUARDRAIL_TRIGGERED.value,
        details={
            'event': 'action_points_exhausted',
            'action_points_spent': action_points_spent,
            'action_points_budget': ACTION_POINTS_PER_ITERATION,
            'tools_used': list(tools_used),
        },
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        actor=Actor.WORKER.value,
        summary=f"Action points exhausted: {action_points_spent}/{ACTION_POINTS_PER_ITERATION} points used",
    )
    
    # Return incomplete status with empty title/abstract so workflow can continue
    return {
        'status': 'incomplete',
        'title': f'[Draft] {topic} for {conference}',
        'abstract': f'[Incomplete - ran out of action points after {action_points_spent} points spent]',
        'evidence_pointers': [],
        'confidence': 0.1,
        'tool_calls': tool_calls_log,
        'tools_used': list(tools_used),
        'action_points_spent': action_points_spent,
        'vendor': vendor,
        'model': model,
    }


def execute_tool(
    tool_name: str,
    tool_args: Dict[str, Any],
    job_id: str,
    conference: str,
    topic: str,
    iteration: int,
    vendor: str,
    execution_id: str,
    state_name: str,
) -> Dict[str, Any]:
    """
    Execute a tool and return results.
    """
    worker_id = f"worker-{job_id}"
    
    try:
        if tool_name == "dynamodb_lookup":
            result = dynamodb_lookup(
                conference=tool_args.get('conference', conference),
                data_type=tool_args.get('data_type', 'guidance'),
                filters=tool_args.get('filters', {}),
                job_id=job_id,
                actor=Actor.WORKER.value,
                worker_id=worker_id,
                worker_vendor=vendor,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                reasoning=f"Looking up {tool_args.get('data_type', 'rules')} for {tool_args.get('conference', conference)}",
            )
            return result
        
        elif tool_name == "search_abstracts":
            result = search_abstracts(
                query=tool_args.get('query', ''),
                conference=tool_args.get('conference'),
                limit=tool_args.get('limit', 5),
                job_id=job_id,
                actor=Actor.WORKER.value,
                worker_id=worker_id,
                worker_vendor=vendor,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
            )
            return result
        
        elif tool_name == "web_search":
            result = web_search(
                query=tool_args.get('query', ''),
                job_id=job_id,
                actor=Actor.WORKER.value,
                worker_id=worker_id,
                worker_vendor=vendor,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                sub_worker_type='worker',
                sub_worker_instance_id=worker_id,
                reasoning=f"Web search: {tool_args.get('query', '')[:100]}",
            )
            return result
        
        elif tool_name == "search_recent_content":
            result = search_recent_content(
                topic=tool_args.get('topic', ''),
                job_id=job_id,
                actor=Actor.WORKER.value,
                worker_id=worker_id,
                worker_vendor=vendor,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                content_type=tool_args.get('content_type', 'all'),
                reasoning=f"Search recent {tool_args.get('content_type', 'all')} on: {tool_args.get('topic', '')[:100]}",
            )
            return result
        
        elif tool_name == "red_team_review":
            result = red_team_review(
                draft_abstract=tool_args.get('draft_abstract', ''),
                job_id=job_id,
                actor=Actor.WORKER.value,
                worker_id=worker_id,
                worker_vendor=vendor,
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
                conference=conference,
                topic=topic,
                focus_areas=tool_args.get('focus_areas'),
                reasoning="Red team review of draft",
            )
            return result
        
        else:
            return {
                'status': 'error',
                'error': f'Unknown tool: {tool_name}',
            }
    
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)[:500],
        }
