"""
🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨

MANDATORY PRE-MODIFICATION CHECKLIST:
1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
2. Read .ai-checklists/pre-deployment.md COMPLETELY
3. Read ALL inline comments in THIS file
4. Understand NOVA scoring logic - IDENTICAL to Primary assessor

CRITICAL: This Lambda is Secondary Nova Assessor - evaluates abstracts (2 of 2 assessors).
Returns composite_score (average of 3 dimensions, 7.0-10.0 scale). Changes affect ALL quality scoring!
Logic MUST remain identical to Primary assessor!

🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THINGS 🚨🚨🚨

---

Nova Assessor Lambda - Secondary
Dual Nova Scoring System - Phase 1

Identical to Primary assessor but separate Lambda for:
- Clear audit trail (can see both assessor calls in decision events)
- Prevents caching issues
- Manager explicitly calls two distinct tools

Logic is IDENTICAL to Primary assessor.
"""

import json
import os
import time
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from typing import Dict, Any

import boto3
from botocore.exceptions import ClientError

# Configuration
BEDROCK_MODEL = os.environ.get('BEDROCK_MODEL', 'amazon.nova-pro-v1:0')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize Bedrock client
bedrock_runtime = boto3.client('bedrock-runtime', region_name=REGION)


def build_assessor_prompt(
    title: str,
    abstract: str,
    conference: str,
    conference_description: str,
    goal: str
) -> str:
    """
    Build the Nova assessor prompt with engaged attendee perspective.
    
    Nova 2 uses an "engaged conference attendee" lens rather than program committee rigor.
    Scores on same 3 dimensions but with attendee-value framing.
    """
    return f"""You are an experienced and engaged attendee at an academic or technical conference.
You have attended this conference (or closely related ones) multiple times.

You are technically competent, curious, and selective with your time.
You are NOT a program committee member and are NOT deciding acceptance.
Your goal is to evaluate whether you would choose to attend this talk if it appeared on the conference program.

**Target Conference:** {conference}
**Conference Description:** {conference_description}
**Abstract Title:** {title}

**Abstract Body:**
{abstract}

---

## Your Evaluation Criteria

You value:
- Clear payoff ("What will I learn?")
- Interesting ideas, insights, or perspectives
- Practical or conceptual depth appropriate for a conference audience
- Relevance to the conference themes

You are open-minded and optimistic, but not uncritical.
You do NOT penalize missing citations, formal proofs, or exhaustive experiments unless their absence meaningfully reduces understanding.

## Scoring Philosophy

- Scores of **6.75 to 8.1** indicate a talk you would likely attend and recommend to others
- Scores of **8.1–10** are reserved for must-see or standout sessions
- Scores below **6** should be uncommon unless the abstract is unclear, uninteresting, or off-topic
- When torn between two adjacent scores, prefer the higher score unless there is a clear deficiency

---

Score this abstract on THREE dimensions (1-10 scale for each):

### Dimension 1: Conference Fit & Relevance
Would this talk feel at home in this conference's program? Is it clearly relevant to attendees?

**Scoring Guidelines:**
- 9-10: Perfect match, exactly what I came to this conference to learn about
- 7-8: Strong relevance, clearly belongs here
- 5-6: Somewhat relevant but feels generic or could fit anywhere
- 3-4: Tangentially related, questionable fit
- 1-2: Wrong conference entirely

**Your Score for Conference Fit:** [number 1-10]

---

### Dimension 2: Depth & Substance
Will I learn something meaningful? Does this have enough substance to justify attending?

**Scoring Guidelines:**
- 9-10: Deep insights, I'll walk away with concrete understanding or practical knowledge
- 7-8: Good substance, clear takeaways, worth my time
- 5-6: Adequate but basic, might be review of things I already know
- 3-4: Shallow, "intro to X" without meaningful depth
- 1-2: No substance, just buzzwords or vague claims

**Your Score for Technical Depth & Rigor:** [number 1-10]

---

### Dimension 3: Interest & Appeal
Does this sound interesting? Would I prioritize this over competing sessions?

**Scoring Guidelines:**
- 9-10: Compelling, I'd rearrange my schedule to attend this
- 7-8: Interesting, I'd choose this if timing works out
- 5-6: Mildly interesting, would attend if nothing better available
- 3-4: Not particularly interesting to me
- 1-2: Would actively avoid, sounds boring or irrelevant

**Your Score for Novelty & Interest:** [number 1-10]

---

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
- Each dimension score must be a number between 1.0 and 10.0
- Composite score is the AVERAGE of the three dimensions
- Be optimistic and generous when the abstract is coherent and relevant
- When torn between two adjacent scores, prefer the higher one unless there is a clear deficiency
- Brief rationale should be ONE sentence from your perspective as an attendee

Respond ONLY with valid JSON, no additional text.
"""


def call_bedrock_nova(prompt: str, temperature: float = 0.3) -> Dict[str, Any]:
    """
    Call Amazon Nova Pro via Bedrock.
    
    Args:
        prompt: The assessor prompt
        temperature: Model temperature (0.3 = fairly deterministic)
        
    Returns:
        Dict with 'response_text', 'input_tokens', 'output_tokens', 'cost_usd'
    """
    start_time = time.time()
    
    try:
        # Nova API format
        request_body = {
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}]
                }
            ],
            "inferenceConfig": {
                "temperature": temperature,
                "maxTokens": 500  # Enough for JSON response
            }
        }
        
        response = bedrock_runtime.converse(
            modelId=BEDROCK_MODEL,
            messages=request_body["messages"],
            inferenceConfig=request_body["inferenceConfig"]
        )
        
        # Extract response
        response_text = response['output']['message']['content'][0]['text']
        
        # Extract token usage
        usage = response.get('usage', {})
        input_tokens = usage.get('inputTokens', 0)
        output_tokens = usage.get('outputTokens', 0)
        
        # Calculate cost (Nova Pro pricing: $0.80 per 1M input, $3.20 per 1M output)
        cost_usd = (input_tokens / 1_000_000 * 0.80) + (output_tokens / 1_000_000 * 3.20)
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        print(f"Nova call successful: {input_tokens} input tokens, {output_tokens} output tokens, {response_time_ms}ms")
        
        return {
            'response_text': response_text,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'cost_usd': cost_usd,
            'response_time_ms': response_time_ms
        }
        
    except ClientError as e:
        print(f"Bedrock API error: {e}")
        raise RuntimeError(f"Failed to call Nova model: {e}")


def parse_nova_response(response_text: str) -> Dict[str, Any]:
    """
    Parse Nova's JSON response and extract scores.
    
    Expected format:
    {
      "dimension_1_conference_fit": 7.5,
      "dimension_2_technical_depth": 8.0,
      "dimension_3_novelty": 6.5,
      "composite_score": 7.33,
      "brief_rationale": "..."
    }
    """
    try:
        # Try to extract JSON from response (Nova might add extra text)
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        
        if start_idx == -1 or end_idx == 0:
            raise ValueError("No JSON object found in response")
        
        json_str = response_text[start_idx:end_idx]
        parsed = json.loads(json_str)
        
        # Validate required fields
        required_fields = ['dimension_1_conference_fit', 'dimension_2_technical_depth', 
                          'dimension_3_novelty', 'composite_score']
        for field in required_fields:
            if field not in parsed:
                raise ValueError(f"Missing required field: {field}")
        
        # Validate scores are in range
        for field in required_fields:
            score = float(parsed[field])
            if not (1.0 <= score <= 10.0):
                raise ValueError(f"{field} out of range: {score}")
        
        return parsed
        
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Failed to parse Nova response: {e}")
        print(f"Response text: {response_text}")
        
        # Fallback: neutral score
        return {
            'dimension_1_conference_fit': 5.0,
            'dimension_2_technical_depth': 5.0,
            'dimension_3_novelty': 5.0,
            'composite_score': 5.0,
            'brief_rationale': 'Parse error - using neutral score',
            'parse_error': str(e)
        }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Secondary Nova Assessor Lambda Handler.
    
    Input:
    {
      "title": "Abstract title",
      "abstract": "Abstract body",
      "conference": "NeurIPS",
      "conference_description": "...",
      "goal": "User's submission goal"
    }
    
    Output:
    {
      "statusCode": 200,
      "body": {
        "composite_score": 7.33,
        "assessment_id": "uuid",
        "timestamp": "ISO-8601",
        "assessor": "secondary",
        "model": "amazon.nova-pro-v1:0"
      }
    }
    """
    start_time = time.time()
    
    print(f"Secondary Nova Assessor invoked: {json.dumps(event)}")
    
    try:
        # Extract input
        title = event.get('title', '')
        abstract = event.get('abstract', '')
        conference = event.get('conference', '')
        conference_description = event.get('conference_description', '')
        goal = event.get('goal', '')
        
        if not title or not abstract:
            raise ValueError("title and abstract are required")
        
        # Build prompt
        prompt = build_assessor_prompt(title, abstract, conference, conference_description, goal)
        
        # Call Nova (temperature increased 2026-01-19 to get more score variance)
        nova_response = call_bedrock_nova(prompt, temperature=0.5)
        
        # Parse response
        scores = parse_nova_response(nova_response['response_text'])
        
        # Generate assessment ID
        assessment_id = f"secondary-{str(uuid.uuid4())[:8]}"
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Build response (return ONLY composite score - hide dimensions from Manager)
        response_body = {
            'composite_score': float(scores['composite_score']),
            'assessment_id': assessment_id,
            'timestamp': timestamp,
            'assessor': 'secondary',
            'model': BEDROCK_MODEL,
            # Internal metadata (not returned to Manager)
            '_internal': {
                'dimension_1': scores['dimension_1_conference_fit'],
                'dimension_2': scores['dimension_2_technical_depth'],
                'dimension_3': scores['dimension_3_novelty'],
                'rationale': scores.get('brief_rationale', ''),
                'input_tokens': nova_response['input_tokens'],
                'output_tokens': nova_response['output_tokens'],
                'cost_usd': nova_response['cost_usd'],
                'response_time_ms': nova_response['response_time_ms']
            }
        }
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        print(f"Assessment complete: score={scores['composite_score']}, elapsed={elapsed_ms}ms")
        
        return {
            'statusCode': 200,
            'body': response_body
        }
        
    except Exception as e:
        print(f"Error in Secondary Nova Assessor: {e}")
        
        # Fallback: return neutral score
        return {
            'statusCode': 500,
            'body': {
                'composite_score': 5.0,
                'assessment_id': f"secondary-error-{str(uuid.uuid4())[:8]}",
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'assessor': 'secondary',
                'model': BEDROCK_MODEL,
                'error': str(e),
                'fallback': True
            }
        }
