"""
Red Team Review Tool Wrapper
Story 2.2: Worker Agent - Autonomous Execution

Enhanced adversarial critique tool that auto-fetches conference context.
Evaluates drafts against:
1. Structure (title, required sections)
2. Conference requirements (rules, word limits, topics)
3. Tone/style match (comparing to example abstracts)

Returns a 1-5 score with detailed feedback.

⚠️ ⚠️ ⚠️ CRITICAL: BEFORE CHANGING MODELS ⚠️ ⚠️ ⚠️

This tool uses LLMs for red team evaluation. Model selection is at line ~381.

DO NOT change model names without validating at official docs:
    - OpenAI Models:    https://platform.openai.com/docs/models
    - Anthropic Models: https://platform.claude.com/docs/en/about-claude/models/overview

IMPORTANT:
    - Current models: gpt-5.2 (OpenAI), claude-sonnet-4-5 (Anthropic)
    - Anthropic model aliases use DASHES (claude-sonnet-4-5) NOT DOTS (claude-sonnet-4.5)
    - Using incorrect model names will cause 404 errors from the API
    - After changing models, rebuild Lambda layers: ./scripts/bundle-lambda-layers.sh
    - Then deploy: npx cdk deploy TilWorkflowStack --profile abstract

⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
"""

import time
import json
import re
import os
import boto3
import traceback
from typing import Dict, Any, Optional, List

# Imports (Lambda layer provides these)
from tool_wrappers.tool_logger import log_tool_call
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from llm_client.llm_client import call_llm
from budget_service.budget_client import increment_llm_cost

# Configuration
CONFERENCE_DATA_TABLE_NAME = os.environ.get('CONFERENCE_DATA_TABLE_NAME', 'til-conference-data')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize DynamoDB (lazy)
_dynamodb = None
_conference_data_table = None


def _get_conference_table():
    """Get DynamoDB table (lazy initialization)."""
    global _dynamodb, _conference_data_table
    if _conference_data_table is None:
        _dynamodb = boto3.resource('dynamodb', region_name=REGION)
        _conference_data_table = _dynamodb.Table(CONFERENCE_DATA_TABLE_NAME)
    return _conference_data_table


def _fetch_conference_rules(conference: str) -> Dict[str, Any]:
    """
    Fetch conference rules/requirements (internal, not logged as tool call).
    """
    try:
        table = _get_conference_table()
        response = table.get_item(
            Key={
                'conference': conference,
                'data_type': 'rules'
            }
        )
        if 'Item' in response:
            return response['Item']
    except Exception as e:
        print(f"Warning: Failed to fetch rules for {conference}: {e}")
    return {}


def _fetch_example_abstracts(conference: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Fetch example abstracts for tone/style reference (internal, not logged).
    """
    try:
        table = _get_conference_table()
        response = table.query(
            KeyConditionExpression='conference = :conf AND begins_with(data_type, :prefix)',
            ExpressionAttributeValues={
                ':conf': conference,
                ':prefix': 'abstract_example'
            },
            Limit=limit
        )
        return response.get('Items', [])
    except Exception as e:
        print(f"Warning: Failed to fetch examples for {conference}: {e}")
    return []


RED_TEAM_SYSTEM_PROMPT = """You are a senior conference program committee reviewer with deep expertise in evaluating abstracts.

Your job is to provide a thorough, fair, but critical evaluation. You want to help the author succeed, but you won't lower your standards.

Evaluate against three dimensions:
1. STRUCTURE - Does it have required elements?
2. REQUIREMENTS - Does it meet conference-specific rules?
3. TONE/STYLE - Does it match this conference's voice and expectations?

Be specific, cite examples from the draft, and provide actionable feedback."""


def build_evaluation_prompt(
    draft_abstract: str,
    conference: str,
    topic: str,
    rules: Dict[str, Any],
    examples: List[Dict[str, Any]],
    focus_areas: Optional[List[str]] = None,
) -> str:
    """
    Build comprehensive evaluation prompt with conference context.
    """
    # Format rules section
    rules_text = "No specific rules available."
    if rules:
        rules_parts = []
        if rules.get('description'):
            rules_parts.append(f"Conference: {rules.get('description')}")
        if rules.get('audience'):
            rules_parts.append(f"Audience: {rules.get('audience')}")
        if rules.get('tone'):
            rules_parts.append(f"Expected Tone: {rules.get('tone')}")
        if rules.get('abstract_requirements'):
            rules_parts.append(f"Requirements: {rules.get('abstract_requirements')}")
        if rules.get('topics'):
            rules_parts.append(f"Typical Topics: {rules.get('topics')}")
        if rules.get('dos'):
            rules_parts.append(f"Do: {rules.get('dos')}")
        if rules.get('donts'):
            rules_parts.append(f"Don't: {rules.get('donts')}")
        rules_text = "\n".join(rules_parts)
    
    # Format example abstracts for tone reference
    examples_text = "No examples available."
    if examples:
        example_parts = []
        for i, ex in enumerate(examples[:3], 1):
            title = ex.get('title', 'Untitled')
            abstract = ex.get('abstract', '')[:400]
            example_parts.append(f"Example {i}: \"{title}\"\n{abstract}...")
        examples_text = "\n\n".join(example_parts)
    
    # Focus areas
    focus_text = ""
    if focus_areas:
        focus_text = f"\n\n**Pay special attention to:** {', '.join(focus_areas)}"
    
    return f"""Evaluate this draft abstract for **{conference.upper().replace('_', ' ')}** conference.

## CONFERENCE CONTEXT

### Rules & Requirements
{rules_text}

### Example Abstracts (for tone/style reference)
{examples_text}

---

## DRAFT TO EVALUATE

{draft_abstract}

---
{focus_text}

## EVALUATION CRITERIA

Score each dimension 1-5:
- 1 = Abysmal (major problems, likely reject)
- 2 = Poor (significant issues, needs major revision)
- 3 = Acceptable (meets minimum bar, some improvements needed)
- 4 = Good (solid submission, minor tweaks only)
- 5 = Excellent (standout submission, ready as-is)

Provide your evaluation in this exact JSON format:
{{
    "overall_score": <1-5 integer - weighted average>,
    
    "structure_score": <1-5>,
    "structure_feedback": {{
        "has_title": <true/false>,
        "has_problem_section": <true/false>,
        "has_approach_section": <true/false>,
        "has_impact_section": <true/false>,
        "has_why_conference_section": <true/false>,
        "issues": ["<specific structural issues>"]
    }},
    
    "requirements_score": <1-5>,
    "requirements_feedback": {{
        "meets_topic_fit": <true/false>,
        "meets_format": <true/false>,
        "issues": ["<specific requirement violations>"]
    }},
    
    "tone_score": <1-5>,
    "tone_feedback": {{
        "matches_conference_voice": <true/false>,
        "appropriate_technical_depth": <true/false>,
        "issues": ["<specific tone/style issues>"]
    }},
    
    "top_weaknesses": [
        {{
            "issue": "<specific problem>",
            "severity": "high" | "medium" | "low",
            "fix": "<how to fix it>"
        }}
    ],
    
    "strengths": ["<what works well>"],
    
    "verdict": "reject" | "major_revisions" | "minor_revisions" | "ready",
    
    "summary": "<2-3 sentence overall assessment>"
}}

Be thorough but fair. Compare against the example abstracts for tone calibration."""


def parse_evaluation_response(response: str) -> Dict[str, Any]:
    """
    Parse the red team LLM response into structured format.
    Handles JSON wrapped in markdown code blocks (common with Claude).
    """
    if not response:
        return _fallback_result("Empty response")
    
    # First, try to extract JSON from markdown code blocks
    # Claude often does: ```json\n{...}\n```
    code_block_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
    json_str = None
    
    if code_block_match:
        json_str = code_block_match.group(1)
    else:
        # Try to find raw JSON (greedy match for outermost braces)
        # Use a more careful approach to handle nested objects
        brace_match = re.search(r'\{', response)
        if brace_match:
            start = brace_match.start()
            depth = 0
            end = start
            for i, c in enumerate(response[start:], start):
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if depth == 0 and end > start:
                json_str = response[start:end]
    
    if json_str:
        # Clean up common JSON issues
        cleaned = json_str
        # Remove trailing commas before } or ]
        cleaned = re.sub(r',\s*}', '}', cleaned)
        cleaned = re.sub(r',\s*]', ']', cleaned)
        
        try:
            result = json.loads(cleaned)
            
            # Ensure required fields with defaults
            result.setdefault('overall_score', 3)
            result.setdefault('structure_score', 3)
            result.setdefault('requirements_score', 3)
            result.setdefault('tone_score', 3)
            result.setdefault('verdict', 'major_revisions')
            result.setdefault('top_weaknesses', [])
            result.setdefault('strengths', [])
            result.setdefault('summary', 'Unable to generate summary')
            
            # Clamp scores to 1-5
            for key in ['overall_score', 'structure_score', 'requirements_score', 'tone_score']:
                if key in result:
                    try:
                        result[key] = max(1, min(5, int(result[key])))
                    except (ValueError, TypeError):
                        result[key] = 3
            
            return result
            
        except json.JSONDecodeError as e:
            # Log position info for debugging
            error_pos = getattr(e, 'pos', 0)
            context_start = max(0, error_pos - 50)
            context_end = min(len(cleaned), error_pos + 50)
            error_context = cleaned[context_start:context_end].replace('\n', ' ')
            print(f"JSON parse error at pos {error_pos}: {e.msg}")
            print(f"Context around error: ...{error_context}...")
            pass
    
    print(f"FALLBACK: Could not parse JSON from response (len={len(response)})")
    return _fallback_result(response[:300] if response else "No response")


def _fallback_result(summary: str) -> Dict[str, Any]:
    """Return fallback result when parsing fails."""
    return {
        'overall_score': 3,
        'structure_score': 3,
        'requirements_score': 3,
        'tone_score': 3,
        'verdict': 'major_revisions',
        'top_weaknesses': [{'issue': 'Could not parse structured feedback', 'severity': 'medium', 'fix': 'Review raw response'}],
        'strengths': [],
        'summary': summary,
        'parse_failed': True,
    }


def red_team_review(
    draft_abstract: str,
    job_id: str,
    actor: str,
    worker_id: str,
    worker_vendor: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    conference: str,
    topic: str,
    focus_areas: Optional[List[str]] = None,
    reasoning: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get adversarial critique of a draft abstract with full conference context.
    
    Auto-fetches:
    - Conference rules/requirements
    - Example abstracts for tone/style reference
    
    Evaluates:
    - Structure (title, required sections)
    - Requirements compliance
    - Tone/style match
    
    Returns:
    - overall_score: 1-5 (1=abysmal, 5=excellent)
    - Detailed feedback by dimension
    - Actionable improvement suggestions
    """
    start_time = time.time()
    
    # 1. Auto-fetch conference context (internal, not logged as tool calls)
    print(f"Red team: Fetching context for {conference}...")
    rules = _fetch_conference_rules(conference)
    examples = _fetch_example_abstracts(conference, limit=3)
    
    params = {
        'draft_abstract': draft_abstract[:500] + '...' if len(draft_abstract) > 500 else draft_abstract,
        'focus_areas': focus_areas,
        'conference': conference,
        'topic': topic,
        'context_loaded': {
            'has_rules': bool(rules),
            'example_count': len(examples),
        }
    }
    
    if not reasoning:
        reasoning = f"Red team review of draft for {conference}"
    
    # 2. Build evaluation prompt with full context
    prompt = build_evaluation_prompt(
        draft_abstract=draft_abstract,
        conference=conference,
        topic=topic,
        rules=rules,
        examples=examples,
        focus_areas=focus_areas,
    )
    
    results = {}
    success_status = "success"
    cost_usd = 0.0
    tokens_used = 0
    
    try:
        # 3. Call LLM for evaluation
        # ============================================================================
        # ⚠️ MODEL SELECTION - VALIDATE AT OFFICIAL DOCS BEFORE CHANGING:
        #    - https://platform.openai.com/docs/models
        #    - https://platform.claude.com/docs/en/about-claude/models/overview
        # ============================================================================
        model = "gpt-5.2" if worker_vendor == "openai" else "claude-sonnet-4-5"
        
        llm_response = call_llm(
            prompt=prompt,
            vendor=worker_vendor,
            model=model,
            creativity=0.2,  # Low creativity for consistent evaluation
            max_tokens=2500,
            system_prompt=RED_TEAM_SYSTEM_PROMPT,
        )
        
        # Track cost
        cost_usd = llm_response['cost_usd']
        tokens_used = llm_response['total_tokens']
        
        try:
            increment_llm_cost(
                job_id=job_id,
                cost_usd=cost_usd,
                tokens=tokens_used,
                provider=worker_vendor,
                model=llm_response['model'],
                execution_id=execution_id,
                state_name=state_name,
                iteration=iteration,
            )
        except Exception as e:
            print(f"Warning: Failed to increment LLM cost: {e}")
        
        # 4. Parse evaluation
        # Replace newlines for logging (CloudWatch splits on newlines)
        response_preview = llm_response['response'][:500].replace('\n', ' ')
        print(f"Red team LLM response: {response_preview}")
        evaluation = parse_evaluation_response(llm_response['response'])
        print(f"Parsed evaluation: overall={evaluation.get('overall_score')}, struct={evaluation.get('structure_score')}, req={evaluation.get('requirements_score')}, tone={evaluation.get('tone_score')}, verdict={evaluation.get('verdict')}")
        
        results = {
            'status': 'success',
            'overall_score': evaluation.get('overall_score', 3),
            'structure_score': evaluation.get('structure_score', 3),
            'requirements_score': evaluation.get('requirements_score', 3),
            'tone_score': evaluation.get('tone_score', 3),
            'verdict': evaluation.get('verdict', 'major_revisions'),
            'top_weaknesses': evaluation.get('top_weaknesses', []),
            'strengths': evaluation.get('strengths', []),
            'structure_feedback': evaluation.get('structure_feedback', {}),
            'requirements_feedback': evaluation.get('requirements_feedback', {}),
            'tone_feedback': evaluation.get('tone_feedback', {}),
            'summary': evaluation.get('summary', ''),
            'context_used': {
                'rules_loaded': bool(rules),
                'examples_compared': len(examples),
            },
            'llm_vendor': worker_vendor,
            'llm_model': llm_response['model'],
        }
        
    except Exception as e:
        print(f"RED TEAM ERROR: {e}")
        print(f"RED TEAM TRACEBACK: {traceback.format_exc()}")
        success_status = "error"
        results = {
            'status': 'error',
            'error': str(e)[:500],
            'overall_score': 0,
        }
    
    # Log decision event
    try:
        log_decision_event(
            event_type=EventType.TOOL_CALLED.value,
            details={
                'tool_name': 'red_team_review',
                'overall_score': results.get('overall_score', 0),
                'structure_score': results.get('structure_score', 0),
                'requirements_score': results.get('requirements_score', 0),
                'tone_score': results.get('tone_score', 0),
                'verdict': results.get('verdict', 'unknown'),
                'weakness_count': len(results.get('top_weaknesses', [])),
                'context_rules': bool(rules),
                'context_examples': len(examples),
            },
            job_id=job_id,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            actor=actor,
            summary=f"Red team: {results.get('verdict', 'unknown')} (score: {results.get('overall_score', 0)}/5, struct:{results.get('structure_score', 0)} req:{results.get('requirements_score', 0)} tone:{results.get('tone_score', 0)})",
        )
    except Exception as e:
        print(f"Warning: Failed to log red_team_review event: {e}")
    
    # Log tool call
    tool_call_record = log_tool_call(
        tool_name="red_team_review",
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
        tokens_used=tokens_used,
        cost_usd=cost_usd,
        success_status=success_status,
        start_time=start_time,
    )
    
    return {
        'results': results,
        'tool_call_record': tool_call_record,
    }
