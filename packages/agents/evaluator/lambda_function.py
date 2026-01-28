"""
🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨

MANDATORY PRE-MODIFICATION CHECKLIST:
1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
2. Read .ai-checklists/pre-deployment.md COMPLETELY
3. Read ALL inline comments in THIS file
4. Understand what the CURRENT code does before changing it

CRITICAL: This Lambda is the Evaluator Agent - performs blind conference assessment.
Changes can affect evaluation metrics. Test thoroughly!

🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THINGS 🚨🚨🚨

---

Evaluator Agent Lambda Function
Story 2.4: Evaluator Agent Blind Assessment

Performs blind conference prediction - receives ONLY title and abstract,
predicts which conference the abstract was written for.

Uses Amazon Nova via Bedrock (third vendor for unbiased evaluation).
Includes 2 decoy conferences to test prediction quality.
"""

import json
import os
import time
import re
import boto3
from decimal import Decimal
from typing import Dict, Any, List, Optional

# Import shared packages (Lambda layer provides these)
from llm_client.llm_client import call_bedrock
from decision_events.event_logger import log_decision_event
from decision_events.event_types import EventType
from decision_events.actor import Actor

# Configuration
GENERATION_METRICS_TABLE = os.environ.get('GENERATION_METRICS_TABLE_NAME', 'til-generation-metrics')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Bedrock model - Amazon Nova Pro for quality predictions
BEDROCK_MODEL = os.environ.get('EVALUATOR_MODEL', 'amazon.nova-pro-v1:0')

# Conference set (5 active + 2 decoys)
VALID_CONFERENCES = [
    'black_hat',
    'reinvent', 
    'kubecon',
    'gartner_symposium',
    'google_cloud_next',
    'microsoft_ignite',  # DECOY - we never generate for this
    'rsa_conference',     # DECOY - we never generate for this
]

DECOY_CONFERENCES = ['microsoft_ignite', 'rsa_conference']

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb', region_name=REGION)
generation_metrics_table = dynamodb.Table(GENERATION_METRICS_TABLE)


EVALUATOR_SYSTEM_PROMPT = """You are an expert at identifying which tech conference an abstract belongs to.
Your task is to analyze the title and abstract content and predict which conference it was written for.

Consider these factors:
- Tone and writing style (hacker culture vs. enterprise vs. technical)
- Technical depth and specificity
- Target audience (security researchers vs. executives vs. developers)
- Topic focus and terminology
- Conference-specific patterns and expectations

Available conferences (7 total):
- black_hat: Security/hacking focus, offensive techniques, vulnerability research, exploit development, hacker culture, irreverent tone
- reinvent: AWS cloud services, enterprise scale, business value, Amazon ecosystem, re:Invent sessions
- kubecon: Kubernetes, cloud-native, containers, CNCF ecosystem, DevOps, platform engineering
- gartner_symposium: Executive audience, business strategy, analyst-style, C-suite focus, governance, digital transformation
- google_cloud_next: GCP services, AI/ML, data analytics, Google ecosystem, BigQuery, Vertex AI
- microsoft_ignite: Microsoft Azure, enterprise IT, Microsoft 365, Windows ecosystem, .NET, Teams
- rsa_conference: Enterprise security, compliance, risk management, CISO audience, vendor-neutral security

You MUST return a valid JSON object with exactly this structure:
{
  "top_3": ["conference1", "conference2", "conference3"],
  "confidence_scores": [0.X, 0.Y, 0.Z],
  "reasons": ["reason for #1", "reason for #2", "reason for #3"]
}

Rules:
- top_3 must contain exactly 3 conference IDs from the list above
- confidence_scores must be 3 numbers that sum to 1.0 (within 0.01 tolerance)
- reasons must explain why each conference is a match
- Be honest about uncertainty - distribute confidence if unclear"""


def parse_evaluator_response(response: str) -> Dict[str, Any]:
    """
    Parse the Evaluator LLM response into structured format.
    """
    if not response:
        return _fallback_result("Empty response")
    
    # Try to extract JSON from response
    # Handle markdown code blocks
    code_block_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
    json_str = None
    
    if code_block_match:
        json_str = code_block_match.group(1)
    else:
        # Find raw JSON
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
            
            # Validate and normalize
            top_3 = result.get('top_3', [])
            confidence_scores = result.get('confidence_scores', [])
            reasons = result.get('reasons', [])
            
            # Validate conferences are in closed set
            valid_top_3 = [c for c in top_3 if c in VALID_CONFERENCES][:3]
            
            # Pad if needed
            while len(valid_top_3) < 3:
                for conf in VALID_CONFERENCES:
                    if conf not in valid_top_3:
                        valid_top_3.append(conf)
                        break
            
            # Normalize confidence scores
            if len(confidence_scores) >= 3:
                scores = [float(s) for s in confidence_scores[:3]]
            else:
                scores = [0.5, 0.3, 0.2]
            
            # Ensure they sum to 1.0
            total = sum(scores)
            if total > 0:
                scores = [s / total for s in scores]
            else:
                scores = [0.5, 0.3, 0.2]
            
            # Normalize reasons
            if len(reasons) >= 3:
                valid_reasons = reasons[:3]
            else:
                valid_reasons = reasons + ['No reason provided'] * (3 - len(reasons))
            
            return {
                'top_3': valid_top_3,
                'confidence_scores': scores,
                'reasons': valid_reasons,
            }
        
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            print(f"JSON parse error: {e}")
    
    return _fallback_result(response[:200])


def _fallback_result(summary: str) -> Dict[str, Any]:
    """Return fallback result when parsing fails."""
    return {
        'top_3': ['reinvent', 'kubecon', 'black_hat'],  # Safe defaults
        'confidence_scores': [0.34, 0.33, 0.33],
        'reasons': [
            f'Parse failed: {summary}',
            'Fallback prediction',
            'Fallback prediction',
        ],
        'parse_failed': True,
    }


def check_decoy_selection(top_3: List[str]) -> Dict[str, Any]:
    """
    Check if any decoy conferences were selected.
    """
    decoy_info = {
        'picked_decoy': False,
        'decoy_rank': None,
        'decoy_conference': None,
    }
    
    for i, conf in enumerate(top_3, 1):
        if conf in DECOY_CONFERENCES:
            decoy_info['picked_decoy'] = True
            decoy_info['decoy_rank'] = i
            decoy_info['decoy_conference'] = conf
            break
    
    return decoy_info


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Evaluator agent performs blind conference prediction.
    
    Input (from SQS):
    {
        "job_id": "...",
        "title": "...",
        "abstract": "...",
        "execution_id": "...",  # For correlation
    }
    
    Output (written to generation_metrics):
    {
        "job_id": "...",
        "record_type": "evaluator#timestamp",
        "top_3_conferences": [...],
        "confidence_scores": [...],
        "reasons": [...],
        ...
    }
    """
    start_time = time.time()
    print(f"Evaluator Lambda invoked with event keys: {list(event.keys())}")
    
    # Parse SQS message if present
    if 'Records' in event:
        # SQS trigger
        record = event['Records'][0]
        body = json.loads(record['body'])
        
        # Handle SNS-wrapped message
        if 'Message' in body:
            body = json.loads(body['Message'])
    else:
        # Direct invocation (for testing)
        body = event
    
    # Extract input
    job_id = body.get('job_id')
    title = body.get('title', '')
    abstract = body.get('abstract', '')
    execution_id = body.get('execution_id', 'unknown')
    
    # Validate blind input - reject if conference info is present
    if body.get('conference') or body.get('target_conference'):
        raise ValueError("Evaluator received conference info - violates blind evaluation!")
    
    if not job_id:
        raise ValueError("job_id is required")
    
    if not title and not abstract:
        raise ValueError("At least title or abstract is required")
    
    print(f"Evaluating abstract for job {job_id}: '{title[:50]}...'")
    
    # Build prompt
    prompt = f"""Analyze this conference abstract and predict which conference it was written for.

TITLE: {title}

ABSTRACT:
{abstract}

Based on the tone, technical depth, target audience, and topic focus, which conference is this abstract most likely written for?

Return your prediction as a JSON object with top_3, confidence_scores (summing to 1.0), and reasons."""
    
    # Call Bedrock (Amazon Nova)
    try:
        llm_response = call_bedrock(
            prompt=prompt,
            model=BEDROCK_MODEL,
            temperature=0.2,  # Low temperature for consistent predictions
            max_tokens=1000,
            system_prompt=EVALUATOR_SYSTEM_PROMPT,
        )
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Parse response
        prediction = parse_evaluator_response(llm_response['response'])
        
        # Check for decoy selection
        decoy_info = check_decoy_selection(prediction['top_3'])
        
        # Build result
        result = {
            'status': 'success',
            'job_id': job_id,
            'top_3_conferences': prediction['top_3'],
            'confidence_scores': prediction['confidence_scores'],
            'reasons': prediction['reasons'],
            'response_time_ms': response_time_ms,
            'model': BEDROCK_MODEL,
            'input_tokens': llm_response.get('input_tokens', 0),
            'output_tokens': llm_response.get('output_tokens', 0),
            'cost_usd': llm_response.get('cost_usd', 0),
            'picked_decoy': decoy_info['picked_decoy'],
            'decoy_rank': decoy_info['decoy_rank'],
            'decoy_conference': decoy_info['decoy_conference'],
            'parse_failed': prediction.get('parse_failed', False),
        }
        
    except Exception as e:
        response_time_ms = int((time.time() - start_time) * 1000)
        print(f"Evaluator error: {e}")
        
        result = {
            'status': 'error',
            'job_id': job_id,
            'error': str(e)[:500],
            'response_time_ms': response_time_ms,
            'top_3_conferences': ['reinvent', 'kubecon', 'black_hat'],
            'confidence_scores': [0.34, 0.33, 0.33],
            'reasons': [f'Error: {str(e)[:100]}', 'Fallback', 'Fallback'],
        }
    
    # Write result to generation_metrics for Step Functions polling
    timestamp = int(time.time() * 1000)
    try:
        # Convert floats to Decimal for DynamoDB
        result_for_dynamo = {}
        for k, v in result.items():
            if v is None:
                continue
            elif isinstance(v, float):
                result_for_dynamo[k] = Decimal(str(v))
            elif isinstance(v, list):
                # Convert lists of floats to lists of Decimals
                result_for_dynamo[k] = [
                    Decimal(str(item)) if isinstance(item, float) else item 
                    for item in v
                ]
            else:
                result_for_dynamo[k] = v
        
        generation_metrics_table.put_item(
            Item={
                'job_id': job_id,
                'record_type_timestamp': f'evaluator#{timestamp}',  # Sort key
                **result_for_dynamo,
            }
        )
        print(f"Wrote evaluator result to generation_metrics: job_id={job_id}")
    except Exception as e:
        print(f"Failed to write to generation_metrics: {e}")
    
    # Log decision event
    try:
        # Use import uuid for request ID
        import uuid
        evaluator_request_id = str(uuid.uuid4())
        
        top_3 = result.get('top_3_conferences', [])
        confidence_scores = result.get('confidence_scores', [])
        
        log_decision_event(
            event_type=EventType.EVALUATOR_ASSESSED.value,
            details={
                'evaluator_request_id': evaluator_request_id,
                'top_3': top_3,  # Schema requires 'top_3', not 'top_3_conferences'
                'confidence': confidence_scores[0] if confidence_scores else None,
                'reasons': result.get('reasons'),
                # Extra fields not in strict schema (will be included)
                'picked_decoy': result.get('picked_decoy', False),
                'decoy_rank': result.get('decoy_rank'),
                'decoy_conference': result.get('decoy_conference'),
                'response_time_ms': result.get('response_time_ms'),
                'model': BEDROCK_MODEL,
            },
            job_id=job_id,
            execution_id=execution_id,
            state_name='EvaluatorAssessment',
            iteration=0,
            actor=Actor.EVALUATOR.value if hasattr(Actor, 'EVALUATOR') else 'evaluator',
            summary=f"Evaluator prediction: {top_3[0] if top_3 else '?'} ({confidence_scores[0]:.0%} confidence)"
                    + (f" [DECOY: {result.get('decoy_conference')}]" if result.get('picked_decoy') else ""),
        )
    except Exception as e:
        print(f"Failed to log decision event: {e}")
    
    return result
