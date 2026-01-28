"""
🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨

MANDATORY PRE-MODIFICATION CHECKLIST:
1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
2. Read .ai-checklists/pre-deployment.md COMPLETELY
3. Read ALL inline comments in THIS file
4. Understand what the CURRENT code does before changing it
5. Check NOVA scoring logic carefully - it's complex and critical

CRITICAL: This Lambda is the Manager Agent - evaluates worker outputs using NOVA dual-assessor scoring.
Changes can break quality assessment for ALL jobs. Test thoroughly!

Documentation: docs/stories/2.1.manager-agent-high-level-orchestration.md

🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THINGS 🚨🚨🚨

---

Manager Agent Lambda Function
Story 2.1: Manager Agent High-Level Orchestration

Handles goal formulation and evaluation using AWS infrastructure.
"""

import json
import os
import sys
import re
from typing import Dict, Any, Optional
from pathlib import Path

# Add shared packages to path
# Lambda Layers are automatically added to sys.path at /opt/python/
# Always add /opt/python first (Lambda Layer location in production)
# Then try local development paths
lambda_dir = Path(__file__).parent
shared_path_layer = Path('/opt/python')  # Lambda Layer path (always exists in Lambda with layers)
shared_path_unbundled = lambda_dir.parent.parent.parent.parent / 'packages' / 'shared'

# Always add Lambda Layer path first (standard location for Python layers)
sys.path.insert(0, str(shared_path_layer))

# Also add local development path if it exists (for local testing)
if shared_path_unbundled.exists():
    sys.path.insert(0, str(shared_path_unbundled))

# Fallback: try bundled structure (if script was run)
shared_path_bundled = lambda_dir / 'packages' / 'shared'
if shared_path_bundled.exists():
    sys.path.insert(0, str(shared_path_bundled))

# Import shared libraries
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from decision_events.actor import Actor
from budget_service.budget_client import get_job_budget, increment_llm_cost
from llm_client.llm_client import call_llm
from llm_client.vendor_assignment import assign_vendor
# REQUIRED_TOOLS_FOR_ACCEPTANCE removed - now using score-based thresholds

# Import Manager-specific modules
from goal_validator import validate_goal, sanitize_goal
from conference_lookup import get_conference_data

# Import Nova Assessor tools (for dual scoring system)
try:
    from tool_wrappers.assess_abstract_primary import assess_abstract_primary
    from tool_wrappers.assess_abstract_secondary import assess_abstract_secondary
except ImportError:
    # Fallback if tool wrappers not in layer yet
    assess_abstract_primary = None
    assess_abstract_secondary = None

# Configuration
JOBS_TABLE_NAME = os.environ.get('JOBS_TABLE_NAME', 'til-jobs')
CONFERENCE_DATA_TABLE_NAME = os.environ.get('CONFERENCE_DATA_TABLE_NAME', 'til-conference-data')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Nova Scoring Configuration (Feature Flag)
USE_NOVA_SCORING = os.environ.get('USE_NOVA_SCORING', 'false').lower() == 'true'
NOVA_ACCEPTANCE_THRESHOLD = float(os.environ.get('NOVA_ACCEPTANCE_THRESHOLD', '7.901'))

# Decoy conferences (for penalty calculation)
DECOY_CONFERENCES = {
    "International Conference on Blockchain for Social Good",
    "Global Summit on Quantum Ethics in AI",
    "Workshop on Interpretable Machine Learning for Astronomy",
    "Symposium on Neuromorphic Computing and Art",
    "Forum on Digital Twins for Healthcare Equity"
}


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Manager agent orchestrates high-level workflow decisions.
    
    Step Functions input format:
    {
        "job_id": "uuid",
        "conference": "black_hat",
        "topic": "genai",
        "iteration": 0,
        "action": "formulate_goal" | "evaluate_output",
        "previous_outputs": [...],  # For evaluation
        "worker_output": {...},  # For evaluation
        "execution_id": "exec-123",
        "state_name": "ManagerGoalFormulation" | "ManagerEvaluation"
    }
    
    Returns:
        Step Functions output with goal or evaluation result
    """
    try:
        # Parse input
        job_id = event.get('job_id')
        action = event.get('action', 'formulate_goal')
        iteration = event.get('iteration', 0)
        execution_id = event.get('execution_id', 'unknown')
        state_name = event.get('state_name', 'ManagerGoalFormulation')
        
        if not job_id:
            raise ValueError("job_id is required")
        
        # Calculate creativity (0.3 → 0.7 linearly)
        creativity = 0.3 + (iteration * 0.1)
        creativity = min(creativity, 0.7)  # Cap at 0.7
        
        # Get budget state (for awareness, not control)
        budget = get_job_budget(job_id)
        
        if action == 'formulate_goal':
            return handle_goal_formulation(
                job_id=job_id,
                conference=event.get('conference'),
                topic=event.get('topic'),
                iteration=iteration,
                creativity=creativity,
                execution_id=execution_id,
                state_name=state_name,
            )
        elif action == 'evaluate_output':
            return handle_evaluation(
                job_id=job_id,
                worker_output=event.get('worker_output'),
                iteration=iteration,
                previous_outputs=event.get('previous_outputs', []),
                previous_artifacts=event.get('previous_artifacts', []),
                creativity=creativity,
                execution_id=execution_id,
                state_name=state_name,
                evaluator_result=event.get('evaluator_result'),
                target_conference=event.get('conference'),
                topic=event.get('topic'),
            )
        else:
            raise ValueError(f"Unknown action: {action}")
    
    except Exception as e:
        # Log error and return failure
        error_message = str(e)[:500]  # Truncate to 500 chars
        return {
            'error': error_message,
            'status': 'failed',
        }


def handle_goal_formulation(
    job_id: str,
    conference: str,
    topic: str,
    iteration: int,
    creativity: float,
    execution_id: str,
    state_name: str,
) -> Dict[str, Any]:
    """
    Handle goal formulation with mechanical validation.
    
    Returns:
        {
            "goal": "...",
            "reasoning": "...",
            "sanitized": false,
            "violated_rules": [],
            "vendor": "openai" | "anthropic",
            "model": "...",
            "temperature": 0.5,
        }
    """
    # Step 1: Assign vendor (needed for tool call logging) - manager role
    vendor, model = assign_vendor(job_id, iteration, role="manager")
    
    # Step 2: Lookup conference data (with tool call logging)
    conference_data = get_conference_data(
        conference=conference,
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        creativity=creativity,
        vendor=vendor,
        model=model,
    )
    rules = conference_data.get('rules', {})
    example_abstracts = conference_data.get('example_abstracts', [])
    
    # Step 3: Build prompt template
    prompt = build_goal_formulation_prompt(
        conference=conference,
        topic=topic,
        rules=rules,
        example_abstracts=example_abstracts,
        iteration=iteration,
        creativity=creativity,
        vendor=vendor,
        model=model,
    )
    
    # Step 4: Call LLM
    llm_response = call_llm(
        prompt=prompt,
        vendor=vendor,
        model=model,
        creativity=creativity,
        max_tokens=500,  # Goals should be concise
    )
    
    # Step 5: Parse LLM response
    goal_text = llm_response['response'].strip()
    reasoning = f"Formulated goal for {conference} on {topic}"
    
    # Step 6: Track cost
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
    
    # Step 7: Mechanical validation
    is_valid, violated_rules = validate_goal(goal_text)
    
    sanitized_goal = goal_text
    was_sanitized = False
    
    if not is_valid:
        # Sanitize goal
        sanitized_goal = sanitize_goal(goal_text, violated_rules)
        was_sanitized = True
        
        # Log manager_goal_sanitized event
        log_decision_event(
            event_type=EventType.MANAGER_GOAL_SANITIZED.value,
            details={
                'original_goal': goal_text,
                'sanitized_goal': sanitized_goal,
                'violated_rules': violated_rules,
            },
            job_id=job_id,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            actor=Actor.MANAGER.value,
            summary=f"Goal sanitized: {len(violated_rules)} rules violated",
            rationale_summary="Mechanical validation detected prescriptive instructions",
            inputs_summary=f"Original goal: {goal_text[:200]}",
            outputs_summary=f"Sanitized goal: {sanitized_goal[:200]}",
            evidence_pointers=[],
        )
    
    # Step 8: Log manager_goal_formulated event (with creativity metadata)
    log_decision_event(
        event_type=EventType.MANAGER_GOAL_FORMULATED.value,
        details={
            'goal': sanitized_goal,
            'reasoning': reasoning,
            'sanitized': was_sanitized,
            'violated_rules': violated_rules if was_sanitized else [],
            'creativity': creativity,
            'vendor': vendor,
            'model': model,
            'temperature': llm_response['temperature'],
        },
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        actor=Actor.MANAGER.value,
        summary=f"Goal formulated for {conference} on {topic}",
        rationale_summary=reasoning,
        inputs_summary=f"Conference: {conference}, Topic: {topic}",
        outputs_summary=f"Goal: {sanitized_goal[:200]}",
        evidence_pointers=[],
    )
    
    return {
        'goal': sanitized_goal,
        'reasoning': reasoning,
        'sanitized': was_sanitized,
        'violated_rules': violated_rules,
        'vendor': vendor,
        'model': model,
        'temperature': llm_response['temperature'],
        'creativity': creativity,
    }


def build_goal_formulation_prompt(
    conference: str,
    topic: str,
    rules: Dict[str, Any],
    example_abstracts: list,
    iteration: int,
    creativity: float,
    vendor: str,
    model: str,
) -> str:
    """
    Build prompt template for goal formulation.
    
    Enforces high-level goal (no prescriptive instructions) and encodes guardrails.
    """
    rules_text = ""
    if rules:
        rules_text = f"""
Conference Requirements:
- Structure: {rules.get('structure_requirements', {})}
- Length: {rules.get('length_constraints', {})}
- Tone: {rules.get('tone_markers', [])}
"""
    
    examples_text = ""
    if example_abstracts:
        examples_text = "\nExample Abstracts:\n"
        for i, example in enumerate(example_abstracts[:3], 1):  # Limit to 3 examples
            examples_text += f"\nExample {i}:\n"
            examples_text += f"Title: {example.get('title', 'N/A')}\n"
            examples_text += f"Abstract: {example.get('abstract', 'N/A')[:500]}...\n"
    
    prompt = f"""You are a Manager agent responsible for formulating high-level goals for abstract generation.

Run context:
- Conference: {conference}
- Topic: {topic}
- Iteration: {iteration + 1} of 3
- Vendor/Model: {vendor} / {model}
- Creativity: {creativity:.2f} (higher = more exploratory)

{rules_text}
{examples_text}

Acceptance checklist (keep in mind as you write the goal):
- Address conference fit and topic relevance.
- Respect structure requirements at a high level (Problem, Approach, Impact, Why this conference).
- Be mindful of length/tone expectations (do not include word counts; stay concise).
- Keep the goal audience-aware (conference reviewers).

DO NOT:
- Specify tools, agents, or operational steps (e.g., "search the web", "spawn a worker", "collect data").
- Copy, quote, or paraphrase example abstracts; use them only for context.
- Include PII or fictional claims; avoid unverifiable specifics.
- Name the target conference in the title or abstract (demonstrate fit through content, not declarations).

Output format:
- One concise goal (1–2 sentences), no bullet points, no JSON, no headers.
- Focus on WHAT to achieve, never HOW to do it.

Goal:"""
    
    return prompt


def evaluate_with_dual_nova(
    job_id: str,
    title: str,
    abstract: str,
    conference: str,
    conference_description: str,
    goal: str,
    execution_id: str,
    state_name: str,
    iteration: int,
    all_tools_used: set,
    evaluator_result: Optional[Dict[str, Any]] = None,
    worker_vendor: Optional[str] = None,
    worker_model: Optional[str] = None,
    topic: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Dual Nova Scoring System - Phase 3
    
    Uses two independent Nova assessors + mechanical penalties/bonuses.
    Returns accept/reject decision based on adjusted score >= threshold.
    
    Args:
        job_id: Job ID
        title: Abstract title
        abstract: Abstract body
        conference: Target conference
        conference_description: Conference description
        goal: User's goal
        execution_id: Step Functions execution ID
        state_name: Current state
        iteration: Current iteration (0-indexed)
        all_tools_used: Set of all tools used across all iterations
        evaluator_result: Evaluator prediction (optional)
        worker_vendor: Worker LLM vendor (openai/anthropic) for traceability
        worker_model: Worker LLM model name for traceability
        topic: Topic for analytics
        
    Returns:
        {
            "decision": "accept" | "reject",
            "feedback_for_worker": "...",
            "assessor_1_score": 7.5,
            "assessor_2_score": 8.0,
            "blended_score": 7.75,
            "penalties": [...],
            "final_score": 7.25,
            "threshold": 8.05,
            ...
        }
    """
    print(f"[NOVA SCORING] Starting triple assessment (Manager + dual Nova) for iteration {iteration}")
    
    # Step 0: Extract evaluator prediction (if available)
    evaluator_prediction = None
    evaluator_confidence = None
    evaluator_top_3 = []
    if evaluator_result:
        # Parse DynamoDB format if needed
        if isinstance(evaluator_result.get('top_3_conferences'), dict):
            # DynamoDB format: {'L': [{'S': 'conf1'}, {'S': 'conf2'}, ...]}
            top_3 = [item.get('S') for item in evaluator_result.get('top_3_conferences', {}).get('L', [])]
        else:
            top_3 = evaluator_result.get('top_3_conferences', [])
        
        if top_3:
            evaluator_top_3 = top_3  # Save full list for logging
            evaluator_prediction = top_3[0]
            
            # Get confidence scores
            scores = evaluator_result.get('confidence_scores', [])
            if isinstance(scores, dict):
                # DynamoDB format: {'L': [{'N': '0.6'}, {'N': '0.2'}, ...]}
                scores = [float(s.get('N', s)) for s in scores.get('L', [])]
            evaluator_confidence = scores[0] if scores else None
    
    # Step 1: Manager Self-Assessment (NEW 2026-01-19)
    # Manager uses its own LLM (OpenAI/Anthropic) to score the abstract
    # This is logged but NOT used in decision logic (only Nova scores matter for decisions)
    manager_score = None
    manager_assessment_error = None
    try:
        manager_assessment_prompt = f"""You are evaluating a conference abstract for {conference}.

**Conference Description:** {conference_description}

**Title:** {title}

**Abstract:** {abstract}

**User's Goal:** {goal}

---

## Scoring Instructions

Score this abstract on THREE dimensions (1-10 scale for each):

### Dimension 1: Conference Fit (1-10)
Does this abstract match the conference's themes, audience, and expectations?
- 9-10: Perfect fit, keynote-worthy
- 7-8: Strong match expected for accepted submissions
- 5-6: Acceptable fit, somewhat generic
- 3-4: Weak fit
- 1-2: Wrong conference

### Dimension 2: Technical Depth & Rigor (1-10)
Does this demonstrate rigorous thinking and non-trivial contribution?
- 9-10: Exceptional rigor
- 7-8: Solid rigor for peer review
- 5-6: Adequate rigor
- 3-4: Shallow treatment
- 1-2: No rigor

### Dimension 3: Novelty & Interest (1-10)
Is this worth the audience's time? Does it offer new insights?
- 9-10: Highly novel
- 7-8: Meaningful contribution
- 5-6: Incremental
- 3-4: Derivative
- 1-2: Boring

## Response Format

Provide your response in this EXACT JSON format:

{{
  "dimension_1_conference_fit": 7.5,
  "dimension_2_technical_depth": 8.0,
  "dimension_3_novelty": 6.5,
  "composite_score": 7.33,
  "brief_rationale": "One sentence explaining the composite score."
}}

**Important:**
- Composite score is the AVERAGE of the three dimensions
- Most competent conference-ready abstracts score 6.5-8.0
- Respond ONLY with valid JSON, no additional text."""

        # Get Manager's vendor and model
        manager_vendor = os.environ.get('MANAGER_VENDOR', 'openai')
        manager_model = 'gpt-5.2' if manager_vendor == 'openai' else 'claude-sonnet-4-5'
        
        print(f"[MANAGER ASSESSMENT] Calling {manager_vendor}/{manager_model} for self-assessment")
        
        manager_response = call_llm(
            prompt=manager_assessment_prompt,
            vendor=manager_vendor,
            model=manager_model,
            creativity=0.4  # Same as Nova 1 for consistency
        )
        
        # Track cost for Manager self-assessment
        increment_llm_cost(
            job_id=job_id,
            cost_usd=manager_response['cost_usd'],
            tokens=manager_response['total_tokens'],
            provider=manager_vendor,
            model=manager_model,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
        )
        
        # Parse JSON response
        import json
        import re
        
        # Extract JSON from response text (LLM might add extra text)
        response_text = manager_response['response']
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            manager_assessment_data = json.loads(json_match.group())
            manager_score = float(manager_assessment_data.get('composite_score', 5.0))
            print(f"[MANAGER ASSESSMENT] Score: {manager_score:.2f}")
        else:
            print(f"[MANAGER ASSESSMENT] Failed to parse JSON, defaulting to 5.0")
            manager_score = 5.0
            manager_assessment_error = "JSON parse error"
            
    except Exception as e:
        print(f"[MANAGER ASSESSMENT] Error: {e}")
        manager_score = 5.0  # Neutral fallback
        manager_assessment_error = str(e)
    
    # Step 1: Call Primary Nova Assessor
    assessor_1_result = assess_abstract_primary(
        title=title,
        abstract=abstract,
        conference=conference,
        conference_description=conference_description,
        goal=goal,
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration
    )
    assessor_1_score = assessor_1_result.get('composite_score', 5.0)
    
    # Step 2: Call Secondary Nova Assessor  
    assessor_2_result = assess_abstract_secondary(
        title=title,
        abstract=abstract,
        conference=conference,
        conference_description=conference_description,
        goal=goal,
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration
    )
    assessor_2_score = assessor_2_result.get('composite_score', 5.0)
    
    # Step 3: Apply score transformations to break Nova's 7.83 bias and rebalance perspectives
    # Store original scores for logging
    original_manager_score = manager_score
    original_assessor_1_score = assessor_1_score
    original_assessor_2_score = assessor_2_score
    
    # Manager: Round up to nearest 0.5 (e.g., 7.83 → 8.0, 8.17 → 8.5)
    # Most generous boost - values strategic judgment
    import math
    manager_score_transformed = math.ceil(manager_score * 2) / 2
    
    # Nova 1 (Primary): Round up to nearest 0.05 (e.g., 7.83 → 7.85)
    # Minimal boost - maintains rigor floor
    assessor_1_score_transformed = math.ceil(assessor_1_score * 20) / 20
    
    # Nova 2 (Secondary): Add 0.25 to final score (e.g., 7.83 → 8.08)
    # Medium boost - rewards attendee appeal
    assessor_2_score_transformed = assessor_2_score + 0.25
    
    print(f"[SCORE TRANSFORMS] Manager: {original_manager_score:.2f} → {manager_score_transformed:.2f}")
    print(f"[SCORE TRANSFORMS] Nova 1: {original_assessor_1_score:.2f} → {assessor_1_score_transformed:.2f}")
    print(f"[SCORE TRANSFORMS] Nova 2: {original_assessor_2_score:.2f} → {assessor_2_score_transformed:.2f}")
    
    # Use transformed scores for decision logic
    manager_score = manager_score_transformed
    assessor_1_score = assessor_1_score_transformed
    assessor_2_score = assessor_2_score_transformed
    
    # Step 4: Compute blended score (average of all three assessors: Manager + Nova 1 + Nova 2)
    blended_score = (manager_score + assessor_1_score + assessor_2_score) / 3
    print(f"[BLENDED SCORE] Average of 3 assessors: {blended_score:.2f}")
    
    # Step 6: Apply mechanical penalties and bonuses
    # Using intuitive system: negative = penalty (bad), positive = bonus (good)
    adjustments = []
    score_adjustment = 0.0
    
    # Penalty system: Evaluator should correctly identify target conference
    # - No penalty if evaluator correctly identifies target (GOOD!)
    # - Small penalty if evaluator picks wrong conference (not ideal, regardless if real or decoy)
    if evaluator_result:
        # Get evaluator's top prediction
        top_3 = evaluator_result.get('top_3_conferences', [])
        if isinstance(top_3, dict):
            # DynamoDB format
            top_3 = [c.get('S', c) for c in top_3.get('L', [])]
        
        if top_3 and len(top_3) > 0:
            top_prediction = top_3[0]
            
            # Check if evaluator picked wrong conference (doesn't matter if real or decoy)
            if top_prediction != conference:
                score_adjustment -= 0.05
                adjustments.append(f"Evaluator incorrectly identified as '{top_prediction}' instead of target '{conference}' (-0.05)")
            
            # If top_prediction == conference: No penalty! (This is what we want!)
    
    # Step 7: Compute final score
    final_score = blended_score + score_adjustment
    
    # Step 8: Decision logic
    decision = 'accept' if final_score >= NOVA_ACCEPTANCE_THRESHOLD else 'reject'
    
    # Step 9: Generate feedback for Worker
    if decision == 'accept':
        feedback = (
            f"Excellent work! The abstract meets the quality bar. "
            f"Final score: {final_score:.2f}/10 (threshold: {NOVA_ACCEPTANCE_THRESHOLD})"
        )
    else:
        # High-level feedback (not prescriptive)
        feedback_parts = [
            f"The abstract needs improvement to meet the quality bar (current: {final_score:.2f}/10, required: {NOVA_ACCEPTANCE_THRESHOLD})."
        ]
        
        # Add high-level guidance based on penalties/bonuses
        if any('decoy' in adj for adj in adjustments):
            feedback_parts.append("Consider: Does this abstract clearly demonstrate conference fit? Review how accepted abstracts align with conference themes.")
        if not any('red team' in adj for adj in adjustments):  # Only suggest if NOT used (no bonus)
            feedback_parts.append("Suggestion: Use red team review to validate submission quality against conference standards.")
        
        # Generic improvement guidance
        if blended_score < 7.0:
            feedback_parts.append("Focus on: Conference relevance, technical depth, and novelty. Study accepted abstracts for this conference.")
        
        feedback = " ".join(feedback_parts)
    
    print(f"[NOVA SCORING] Decision: {decision}, Final score: {final_score:.2f}, Blended: {blended_score:.2f}, Adjustment: {score_adjustment:+.2f}")
    
    # Log decision event with full context for Dashboard V2 analytics
    event_type = EventType.MANAGER_ACCEPTED.value if decision == 'accept' else EventType.MANAGER_REJECTED.value
    log_decision_event(
        event_type=event_type,
        details={
            'decision': decision,
            'iteration': iteration,
            # Manager self-assessment (transformed + original)
            'manager_self_score': manager_score,  # Transformed (used in decisions)
            'manager_self_score_original': original_manager_score,  # Original (for analytics)
            'manager_self_assessment_error': manager_assessment_error,
            # Nova scoring breakdown (transformed + original)
            'assessor_1_score': assessor_1_score,  # Transformed Nova 1
            'assessor_1_score_original': original_assessor_1_score,  # Original Nova 1
            'assessor_2_score': assessor_2_score,  # Transformed Nova 2
            'assessor_2_score_original': original_assessor_2_score,  # Original Nova 2
            'blended_score': blended_score,  # Average of 3 transformed scores
            'penalties': adjustments,  # Renamed to adjustments but keep field name for compatibility
            'penalty_amount': score_adjustment,  # Now stores negative for penalties, positive for bonuses
            'final_score': final_score,
            'quality_score': final_score,  # Alias for backward compatibility
            'threshold': NOVA_ACCEPTANCE_THRESHOLD,
            # Evaluator details for penalty transparency
            'evaluator_prediction': evaluator_prediction,
            'evaluator_confidence': evaluator_confidence,
            'evaluator_top_3': evaluator_top_3,  # Full list to show decoy detection
            # Context for analytics (worker, conference, topic)
            'worker_vendor': worker_vendor or 'unknown',
            'worker_model': worker_model or 'unknown',
            'conference': conference,
            'topic': topic or 'unknown',
            # Manager vendor (OpenAI/Anthropic) - the LLM doing the managing
            'manager_vendor': os.environ.get('MANAGER_VENDOR', 'openai'),
            'manager_model': 'gpt-5.2' if os.environ.get('MANAGER_VENDOR', 'openai') == 'openai' else 'claude-sonnet-4-5',
        },
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        actor='manager',
        summary=f"Nova scoring: {decision} (final_score={final_score:.2f}, worker={worker_vendor}/{worker_model}, conf={conference}, topic={topic})"
    )
    
    return {
        'decision': decision,
        'feedback': feedback,  # For Step Functions workflow compatibility
        'feedback_for_worker': feedback,  # Keep both for backward compat
        'quality_score': final_score,  # For backward compatibility with workflow
        # Manager self-assessment (transformed + original)
        'manager_self_score': manager_score,  # Transformed (used in decisions)
        'manager_self_score_original': original_manager_score,  # Original (for analytics)
        'manager_self_assessment_error': manager_assessment_error,
        # Nova scoring breakdown (transformed + original)
        'assessor_1_score': assessor_1_score,  # Transformed Nova 1
        'assessor_1_score_original': original_assessor_1_score,  # Original Nova 1
        'assessor_2_score': assessor_2_score,  # Transformed Nova 2
        'assessor_2_score_original': original_assessor_2_score,  # Original Nova 2
        'blended_score': blended_score,  # Average of 3 transformed scores
        'penalties': adjustments,  # Now includes both penalties and bonuses
        'penalty_amount': score_adjustment,  # Negative = penalty, positive = bonus
        'final_score': final_score,
        'threshold': NOVA_ACCEPTANCE_THRESHOLD,
        # Context for analytics
        'worker_vendor': worker_vendor or 'unknown',
        'worker_model': worker_model or 'unknown',
        'conference': conference,
        'topic': topic or 'unknown',
        # Evaluator prediction (for Step Functions workflow)
        'evaluator_prediction': evaluator_prediction,
        'evaluator_confidence': evaluator_confidence,
        # Manager vendor (Nova)
        'selected_iteration': iteration if decision == 'accept' else -1,  # -1 indicates no iteration selected (rejected)
        'is_compromise': False,
        'vendor': 'nova',  # Manager using Nova for scoring
        'model': 'amazon.nova-pro-v1:0',
        'nova_scoring_used': True
    }


def handle_evaluation(
    job_id: str,
    worker_output: Dict[str, Any],
    iteration: int,
    previous_outputs: list,
    previous_artifacts: list,
    creativity: float,
    execution_id: str,
    state_name: str,
    evaluator_result: Optional[Dict[str, Any]] = None,
    target_conference: Optional[str] = None,
    topic: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Handle output evaluation with creativity logging and Evaluator signal.
    
    Returns:
        {
            "decision": "accept" | "reject",
            "feedback": "...",
            "sections_cited": [...],
            "reasoning": "...",
            "vendor": "openai" | "anthropic",
            "model": "...",
            "temperature": 0.5,
            "evaluator_agreement": bool | None,
            "selected_iteration": int | None,
            "is_compromise": bool,
        }
    """
    # Extract Worker output - handle nested Payload structure from Step Functions
    if 'Payload' in worker_output:
        worker_payload = worker_output['Payload']
    else:
        worker_payload = worker_output
    
    # Step 1: Extract Worker output fields
    abstract = worker_payload.get('abstract', '')
    title = worker_payload.get('title', '')
    current_tools = set(worker_payload.get('tools_used', []))
    
    # Collect ALL tools used across ALL iterations (cumulative)
    # BUG FIX 2026-01-19: previous_outputs contains MANAGER evaluations (no tools_used)
    # We need previous_artifacts which contains WORKER results (has tools_used)
    all_tools_used = set(current_tools)
    for prev_artifact in previous_artifacts:
        # Skip if not a dict (e.g., initial empty array from States.Array)
        if not isinstance(prev_artifact, dict):
            continue
        prev_payload = prev_artifact.get('Payload', prev_artifact)
        if not isinstance(prev_payload, dict):
            continue
        prev_tools = prev_payload.get('tools_used', [])
        if prev_tools:
            all_tools_used.update(prev_tools)
    
    # FEATURE FLAG: Dual Nova Scoring System
    if USE_NOVA_SCORING and assess_abstract_primary and assess_abstract_secondary:
        print(f"[FEATURE FLAG] USE_NOVA_SCORING=true, using dual Nova assessors")
        
        # Get conference info
        conference = target_conference or worker_payload.get('conference', 'unknown')
        conference_data = get_conference_data(
            conference=conference,
            job_id=job_id,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            creativity=creativity,
            vendor='nova',  # Nova is the assessor
            model='amazon.nova-pro-v1:0',
        )
        conference_description = conference_data.get('description', '')
        goal_text = topic or 'Create compelling abstract for conference'
        
        # Extract worker context for traceability
        worker_vendor = worker_payload.get('vendor', 'unknown')
        worker_model = worker_payload.get('model', 'unknown')
        
        # Use dual Nova scoring
        return evaluate_with_dual_nova(
            job_id=job_id,
            title=title,
            abstract=abstract,
            conference=conference,
            conference_description=conference_description,
            goal=goal_text,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            all_tools_used=all_tools_used,
            evaluator_result=evaluator_result,
            worker_vendor=worker_vendor,
            worker_model=worker_model,
            topic=topic
        )
    
    # LEGACY: Old vibes-based scoring system
    print(f"[FEATURE FLAG] USE_NOVA_SCORING=false, using legacy scoring")
    
    # SECRET RULE v2: Score-based thresholds
    # - Iteration 1 (index 0): Must score >= 9/10 to accept
    # - Iterations 2-3 (index 1-2): Must score >= 7/10 to accept
    # This ensures only the very best get accepted on first try
    SCORE_THRESHOLD_FIRST_ITERATION = 9
    SCORE_THRESHOLD_SUBSEQUENT = 7
    
    # Step 2: Assign vendor (needed for tool call logging)
    vendor, model = assign_vendor(job_id, iteration)
    
    # Step 3: Get conference data for comparison (with tool call logging)
    conference = target_conference or worker_payload.get('conference', 'unknown')
    conference_data = get_conference_data(
        conference=conference,
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        creativity=creativity,
        vendor=vendor,
        model=model,
    )
    rules = conference_data.get('rules', {})
    
    # Step 4: Process Evaluator signal (if available)
    evaluator_agreement = None
    evaluator_prediction = None
    evaluator_confidence = None
    if evaluator_result:
        # Parse DynamoDB format if needed
        if isinstance(evaluator_result.get('top_3_conferences'), dict):
            # DynamoDB format: {'L': [{'S': 'black_hat'}, ...]}
            top_3 = [c.get('S', c) for c in evaluator_result['top_3_conferences'].get('L', [])]
        else:
            top_3 = evaluator_result.get('top_3_conferences', [])
        
        if top_3:
            evaluator_prediction = top_3[0] if top_3 else None
            evaluator_agreement = (evaluator_prediction == conference) if evaluator_prediction else None
            
            # Get confidence
            scores = evaluator_result.get('confidence_scores', [])
            if isinstance(scores, dict):
                scores = [float(s.get('N', s)) for s in scores.get('L', [])]
            evaluator_confidence = scores[0] if scores else None
    
    # Step 5: Build comprehensive evaluation prompt
    prompt = build_evaluation_prompt(
        worker_output=worker_payload,
        evaluator_output=evaluator_result,
        conference=conference,
        topic=topic or 'unknown',
        iteration=iteration,
        previous_feedback=previous_outputs[-1].get('feedback_for_worker', '') if previous_outputs else '',
        rules=rules,
    )
    
    # Step 6: Call LLM
    llm_response = call_llm(
        prompt=prompt,
        vendor=vendor,
        model=model,
        creativity=creativity,
        max_tokens=1000,  # Evaluation responses can be longer
    )
    
    # Step 7: Parse LLM response
    evaluation_result = parse_evaluation_response(llm_response['response'])
    
    # Step 8: Track cost
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
    
    decision = evaluation_result['decision']
    quality_score = evaluation_result.get('quality_score', 5)
    selected_iteration = None
    is_compromise = False
    
    # SECRET RULE v2: Apply score thresholds
    # Iteration 1 (index 0): Must score >= 9/10 to accept
    # Iterations 2-5 (index 1-4): Must score >= 7/10 to accept
    score_threshold = SCORE_THRESHOLD_FIRST_ITERATION if iteration == 0 else SCORE_THRESHOLD_SUBSEQUENT
    
    if decision == 'accept' and quality_score < score_threshold:
        # LLM said accept but score doesn't meet threshold - override to reject
        decision = 'reject'
        evaluation_result['decision'] = 'reject'
        evaluation_result['feedback_for_worker'] = (
            f"Good progress, but the submission needs to reach a higher quality bar. "
            f"Current score: {quality_score}/10, required: {score_threshold}/10. "
            f"{evaluation_result.get('feedback_for_worker', '')}"
        )
        evaluation_result['_score_threshold_applied'] = True
    
    # Step 9: Handle partial success (iteration 4, rejected → select best)
    if iteration == 4 and decision == 'reject':
        # Final iteration rejected - select best from all 3
        is_compromise = True
        decision = 'accept'  # Force acceptance with compromise
        selected_iteration = select_best_iteration(
            current_abstract=abstract,
            current_title=title,
            previous_outputs=previous_outputs,
            worker_payload=worker_payload,
        )
        
        log_decision_event(
            event_type=EventType.MANAGER_SELECTED_BEST_ITERATION.value,
            details={
                'selected_iteration': selected_iteration,
                'compromise': True,
                'why_chosen': f"No acceptance after 3 iterations, selected best from iteration {selected_iteration + 1}",
                'creativity': creativity,
                'vendor': vendor,
                'model': model,
                'evaluator_agreement': evaluator_agreement,
            },
            job_id=job_id,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            actor=Actor.MANAGER.value,
            summary=f"Compromise: Selected best abstract from iteration {selected_iteration + 1}",
            rationale_summary="No acceptance after 3 iterations",
            inputs_summary=f"All 3 iterations evaluated",
            outputs_summary=f"Selected iteration {selected_iteration + 1} as best",
            evidence_pointers=[],
        )
    
    elif decision == 'accept':
        selected_iteration = iteration
        quality_score = evaluation_result.get('quality_score', 5)
        strengths = evaluation_result.get('strengths', [])
        reasoning = evaluation_result.get('reasoning', '')
        log_decision_event(
            event_type=EventType.MANAGER_SELECTED_BEST_ITERATION.value,
            details={
                'selected_iteration': selected_iteration,
                'compromise': False,
                'why_chosen': f"Quality score {quality_score}/10 with {len(strengths)} strengths. {reasoning[:200]}",
                'reasoning': reasoning,
                'quality_score': quality_score,
                'creativity': creativity,
                'vendor': vendor,
                'model': model,
                'evaluator_agreement': evaluator_agreement,
            },
            job_id=job_id,
            execution_id=execution_id,
            state_name=state_name,
            iteration=iteration,
            actor=Actor.MANAGER.value,
            summary=f"Selected best abstract from iteration {selected_iteration + 1}",
            rationale_summary=f"Accepted on iteration {iteration + 1}",
            inputs_summary=f"All iterations: {len(previous_outputs) + 1} total",
            outputs_summary=f"Selected iteration {selected_iteration + 1}",
            evidence_pointers=[],
        )
    
    # Step 10: Log decision event (with full evaluation details)
    event_type = EventType.MANAGER_ACCEPTED if decision == 'accept' else EventType.MANAGER_REJECTED
    
    log_decision_event(
        event_type=event_type.value,
        details={
            'iteration': iteration,
            'decision': decision,
            'quality_score': evaluation_result.get('quality_score', 5),
            'reasoning': evaluation_result.get('reasoning', ''),
            'strengths': evaluation_result.get('strengths', []),
            'weaknesses': evaluation_result.get('weaknesses', []),
            'feedback_for_worker': evaluation_result.get('feedback_for_worker', ''),
            'selected_iteration': selected_iteration,
            'is_compromise': is_compromise,
            'creativity': creativity,
            'vendor': vendor,
            'model': model,
            'temperature': llm_response['temperature'],
            'evaluator_agreement': evaluator_agreement,
            'evaluator_prediction': evaluator_prediction,
            'evaluator_confidence': evaluator_confidence,
        },
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        actor=Actor.MANAGER.value,
        summary=f"Manager {decision}s the Title and Abstract for {conference} {topic}. {evaluation_result.get('quality_score', '?')}/10 {'meets the bar' if decision == 'accept' else 'does not meet minimum acceptable bar'}. Provided Feedback: {feedback[:100]}{'...' if len(feedback) > 100 else ''}",
        rationale_summary=evaluation_result.get('reasoning', ''),
        inputs_summary=f"Title: {title[:100]}...",
        outputs_summary=f"Decision: {decision}, Strengths: {len(evaluation_result.get('strengths', []))}, Weaknesses: {len(evaluation_result.get('weaknesses', []))}",
        evidence_pointers=[],
    )
    
    # Step 11: Log iteration_completed event
    log_decision_event(
        event_type=EventType.ITERATION_COMPLETED.value,
        details={
            'iteration': iteration,
            'manager_decision': decision,
            'quality_score': evaluation_result.get('quality_score', 5),
            'is_compromise': is_compromise,
            'evaluator_prediction': evaluator_prediction,
            'evaluator_agreement': evaluator_agreement,
            'creativity': creativity,
        },
        job_id=job_id,
        execution_id=execution_id,
        state_name=state_name,
        iteration=iteration,
        actor=Actor.SYSTEM.value,
        summary=f"Iteration {iteration + 1} completed: {decision} (score: {evaluation_result.get('quality_score', '?')}/10)" + (" (compromise)" if is_compromise else ""),
        rationale_summary=f"Manager decision: {decision}",
        inputs_summary=f"Title: {title[:100]}",
        outputs_summary=f"Abstract length: {len(abstract)} chars",
        evidence_pointers=[],
    )
    
    return {
        'decision': decision,
        'quality_score': evaluation_result.get('quality_score', 5),
        'reasoning': evaluation_result.get('reasoning', ''),
        'strengths': evaluation_result.get('strengths', []),
        'weaknesses': evaluation_result.get('weaknesses', []),
        'feedback': evaluation_result.get('feedback_for_worker', ''),  # Keep 'feedback' for backward compat
        'selected_iteration': selected_iteration if selected_iteration is not None else -1,  # -1 indicates no iteration selected
        'is_compromise': is_compromise,
        'vendor': vendor,
        'model': model,
        'temperature': llm_response['temperature'],
        'creativity': creativity,
        'evaluator_agreement': evaluator_agreement,
        'evaluator_prediction': evaluator_prediction,
        'evaluator_confidence': evaluator_confidence,
        'title': title,
        'abstract': abstract,
        'tools_used': list(current_tools),  # For tracking across iterations
        'all_tools_used': list(all_tools_used),  # Cumulative
    }


def select_best_iteration(
    current_abstract: str,
    current_title: str,
    previous_outputs: list,
    worker_payload: Dict[str, Any],
) -> int:
    """
    Select the best iteration when no acceptance after 3 iterations.
    
    Simple heuristic: Select iteration with longest abstract (more complete).
    In production, could use more sophisticated comparison.
    """
    best_iteration = len(previous_outputs)  # Current iteration (0-indexed)
    best_length = len(current_abstract)
    
    for i, prev_output in enumerate(previous_outputs):
        prev_payload = prev_output.get('Payload', prev_output) if prev_output else {}
        prev_abstract = prev_payload.get('abstract', '')
        if len(prev_abstract) > best_length:
            best_length = len(prev_abstract)
            best_iteration = i
    
    return best_iteration


def parse_abstract_sections(abstract: str) -> Dict[str, str]:
    """
    Parse abstract into sections: Problem, Approach, Impact, Why this conference.
    
    Uses simple heuristics to find section headings.
    """
    sections = {
        'Problem': '',
        'Approach': '',
        'Impact': '',
        'Why this conference': '',
    }
    
    # Simple parsing: Look for section headings (case-insensitive)
    import re
    
    # Split by section headings and extract content
    # Pattern matches: ## SectionName or SectionName followed by content
    # Handle "Why this conference" as a multi-word section name
    section_patterns = [
        (r'(?:^|\n)\s*(?:##\s*)?Problem[:\.]?\s*\n(.*?)(?=\n\s*(?:##\s*)?(?:Approach|Impact|Why|$))', 'Problem'),
        (r'(?:^|\n)\s*(?:##\s*)?Approach[:\.]?\s*\n(.*?)(?=\n\s*(?:##\s*)?(?:Problem|Impact|Why|$))', 'Approach'),
        (r'(?:^|\n)\s*(?:##\s*)?Impact[:\.]?\s*\n(.*?)(?=\n\s*(?:##\s*)?(?:Problem|Approach|Why|$))', 'Impact'),
        (r'(?:^|\n)\s*(?:##\s*)?Why\s+this\s+conference[:\.]?\s*\n(.*?)(?=\n\s*(?:##\s*)?(?:Problem|Approach|Impact|$)|$)', 'Why this conference'),
    ]
    
    for pattern, section_name in section_patterns:
        match = re.search(pattern, abstract, re.IGNORECASE | re.DOTALL | re.MULTILINE)
        if match:
            section_content = match.group(1).strip()
            sections[section_name] = section_content
    
    return sections


def build_evaluation_prompt(
    worker_output: Dict[str, Any],
    evaluator_output: Optional[Dict[str, Any]],
    conference: str,
    topic: str,
    iteration: int,
    previous_feedback: str,
    rules: Dict[str, Any],
) -> str:
    """
    Build comprehensive evaluation prompt with full context from Worker and Evaluator.
    """
    # === 1. WORKER OUTPUT ===
    title = worker_output.get('title', '[No title provided]')
    abstract = worker_output.get('abstract', '[No abstract provided]')
    confidence = worker_output.get('confidence', 0)
    evidence_pointers = worker_output.get('evidence_pointers', [])
    tool_calls = worker_output.get('tool_calls', [])
    
    # Format tool calls (just names and success status)
    tools_used = []
    for tc in tool_calls:
        tool_name = tc.get('tool', 'unknown')
        success = '✓' if tc.get('success', False) else '✗'
        # Include red team scores if available
        if tool_name == 'red_team_review' and tc.get('scores'):
            scores = tc.get('scores', {})
            tools_used.append(f"  - {tool_name} {success} (scores: overall={scores.get('overall')}, verdict={scores.get('verdict')})")
        else:
            tools_used.append(f"  - {tool_name} {success}")
    
    tools_text = "\n".join(tools_used) if tools_used else "  - No tools used"
    
    # === 2. EVALUATOR OUTPUT (BLIND ASSESSMENT) ===
    evaluator_text = ""
    if evaluator_output and not evaluator_output.get('timeout'):
        # Parse DynamoDB format if needed
        top_3 = evaluator_output.get('top_3_conferences', [])
        if isinstance(top_3, dict):
            top_3 = [c.get('S', c) for c in top_3.get('L', [])]
        
        scores = evaluator_output.get('confidence_scores', [])
        if isinstance(scores, dict):
            scores = [float(s.get('N', s)) for s in scores.get('L', [])]
        
        reasons = evaluator_output.get('reasons', [])
        if isinstance(reasons, dict):
            reasons = [r.get('S', r) for r in reasons.get('L', [])]
        
        if top_3:
            predicted = top_3[0]
            agreement = "✓ MATCH" if predicted == conference else "✗ MISMATCH"
            
            evaluator_text = f"""
## BLIND EVALUATOR ASSESSMENT (Amazon Nova - saw only title and abstract)
- **Top prediction:** {predicted} ({scores[0]*100:.0f}% confidence) {agreement}
- **2nd choice:** {top_3[1] if len(top_3) > 1 else 'N/A'} ({scores[1]*100:.0f}% if len(scores) > 1 else 'N/A')
- **3rd choice:** {top_3[2] if len(top_3) > 2 else 'N/A'} ({scores[2]*100:.0f}% if len(scores) > 2 else 'N/A')
- **Reasoning:** {reasons[0] if reasons else 'N/A'}
"""
    else:
        evaluator_text = "\n## BLIND EVALUATOR: Timed out or unavailable\n"
    
    # === 3. CONFERENCE RULES ===
    rules_text = ""
    if rules:
        rules_text = f"""
## CONFERENCE REQUIREMENTS ({conference})
- Structure: {rules.get('structure_requirements', 'Standard 4-section format')}
- Length: {rules.get('length_constraints', 'Typical conference abstract length')}
- Tone: {rules.get('tone_markers', 'Conference-appropriate')}
"""
    
    # === 4. PREVIOUS FEEDBACK ===
    previous_text = ""
    if previous_feedback and iteration > 0:
        previous_text = f"\n## PREVIOUS FEEDBACK (from iteration {iteration}):\n{previous_feedback}\n"
    
    # === BUILD FULL PROMPT ===
    prompt = f"""You are the Manager agent responsible for quality control of conference abstracts.

## CONTEXT
- **Target Conference:** {conference}
- **Topic:** {topic}
- **Iteration:** {iteration + 1} of 3
{rules_text}

## WORKER OUTPUT

### Title
{title}

### Abstract
{abstract}

### Worker Confidence: {confidence*100:.0f}%

### Evidence/Sources Used
{', '.join(evidence_pointers) if evidence_pointers else 'None cited'}

### Tools Called by Worker
{tools_text}
{evaluator_text}
{previous_text}

## YOUR EVALUATION CRITERIA

You must evaluate this abstract on these dimensions:

1. **STRUCTURE** - Does it have clear Problem, Approach, Impact, and Why-This-Conference sections?
2. **CONTENT QUALITY** - Is there substance and depth, not just generic statements?
3. **CONFERENCE FIT** - Does the tone, terminology, and focus match {conference}?
4. **TECHNICAL CREDIBILITY** - Are claims specific and believable? Any red flags?
5. **BLIND EVALUATOR AGREEMENT** - If the Evaluator disagreed, why might that be?

## DECISION GUIDELINES

**ACCEPT if:**
- All 4 sections are present with real content
- The abstract would be competitive at {conference}
- Worker confidence is reasonable (>70%) and supported by tool usage
- No major red flags

**REJECT if:**
- Missing or empty sections
- Generic/vague content that could apply to any conference
- Blind Evaluator strongly predicted a different conference (indicates poor fit)
- Worker used few tools or shows low confidence
- Content has obvious issues (too short, too generic, wrong tone)

## REQUIRED OUTPUT (JSON)

{{
    "decision": "accept" or "reject",
    "quality_score": 1-10,
    "reasoning": "2-3 sentence explanation of your decision",
    "strengths": ["list", "of", "strengths"],
    "weaknesses": ["list", "of", "weaknesses"],
    "feedback_for_worker": "If rejecting, specific actionable feedback. If accepting, leave empty."
}}

Respond with ONLY the JSON object:"""
    
    return prompt


def parse_evaluation_response(response: str) -> Dict[str, Any]:
    """
    Parse LLM evaluation response.
    
    Expected format:
    {
        "decision": "accept" or "reject",
        "quality_score": 1-10,
        "reasoning": "...",
        "strengths": [...],
        "weaknesses": [...],
        "feedback_for_worker": "..."
    }
    """
    import json
    import re
    
    # Try to extract JSON from response (handle markdown code blocks)
    json_str = None
    
    # First try markdown code block
    code_block_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
    if code_block_match:
        json_str = code_block_match.group(1)
    else:
        # Find raw JSON - match outermost braces
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
        cleaned = re.sub(r',\s*}', '}', json_str)
        cleaned = re.sub(r',\s*]', ']', cleaned)
        
        try:
            result = json.loads(cleaned)
            
            # Validate and normalize decision
            decision = result.get('decision', 'reject').lower()
            if decision not in ['accept', 'reject']:
                decision = 'reject'
            
            return {
                'decision': decision,
                'quality_score': result.get('quality_score', 5),
                'reasoning': result.get('reasoning', ''),
                'strengths': result.get('strengths', []),
                'weaknesses': result.get('weaknesses', []),
                'feedback_for_worker': result.get('feedback_for_worker', ''),
            }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"JSON parse error: {e}")
            pass
    
    # Fallback: Parse natural language response
    decision = 'reject'  # Default to reject if unclear
    if 'accept' in response.lower() and 'reject' not in response.lower():
        decision = 'accept'
    
    return {
        'decision': decision,
        'quality_score': 5,
        'reasoning': response[:300] if response else 'Parse failed',
        'strengths': [],
        'weaknesses': ['Could not parse structured response'],
        'feedback_for_worker': response[:500] if response else '',
    }
