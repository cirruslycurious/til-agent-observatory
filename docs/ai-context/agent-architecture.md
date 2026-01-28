# Agent Architecture Context

## Agent Roles

### Manager Agent

**Location**: `packages/agents/manager/lambda_function.py`

**Responsibilities**:
- Formulates high-level goals for Worker
- Self-assesses Worker's output quality
- Calls dual Nova assessors for independent scoring
- Applies score transforms to break bias
- Applies mechanical penalties (missing tools, decoy susceptibility)
- Makes accept/reject decision (threshold: 7.85)
- Provides feedback for next iteration if rejected

**Key Functions**:
```python
def handler(event, context):
    # Entry point - routes to formulate_goal or evaluate_iteration

def formulate_goal(job_context):
    # Creates goal with conference guidance

def evaluate_iteration(job_context, worker_output):
    # Triple scoring + penalties + decision
```

### Worker Agent

**Location**: `packages/agents/worker/lambda_function.py`

**Responsibilities**:
- Receives goal from Manager
- Autonomously selects tools (ReAct pattern)
- Manages 3-point action budget per iteration
- Writes artifacts with provenance metadata
- Submits final abstract

**Available Tools**:
| Tool | Cost | Purpose |
|------|------|---------|
| `search_abstracts` | 2 pts | SQLite FTS search of 200+ abstracts |
| `web_search` | 1 pt | Tavily API for current info |
| `dynamodb_lookup` | 1 pt | Conference guidance/examples |
| `red_team_review` | 1 pt | Self-critique for improvements |
| `submit_abstract` | 0 pts | Final submission |

### Evaluator Agent

**Location**: `packages/agents/evaluator/lambda_function.py`

**Responsibilities**:
- Receives abstract without knowing target conference
- Predicts which conference it best fits
- Runs asynchronously via SNS/SQS
- Results affect Manager penalties

## Scoring System

### Triple Assessment

1. **Manager Self-Score**: Uses its own LLM (GPT-5.2 or Claude)
2. **Nova Primary**: Amazon Nova via Bedrock (3 dimensions)
3. **Nova Secondary**: Amazon Nova via Bedrock (independent)

### Score Transforms

```python
# Manager: Round up to nearest 0.5
transformed_manager = math.ceil(raw_score * 2) / 2

# Nova 1: Round up to nearest 0.05
transformed_nova1 = math.ceil(raw_score * 20) / 20

# Nova 2: Add 0.25 flat boost
transformed_nova2 = raw_score + 0.25
```

**Why?** Nova models clustered around 7.83. Transforms break this pattern.

### Blended Score

```python
blended = (transformed_manager + transformed_nova1 + transformed_nova2) / 3
```

### Penalties

| Penalty | Amount | Trigger |
|---------|--------|---------|
| Missing red_team_review | -1.0 | Tool not called |
| Evaluator decoy susceptibility | -0.5 to -1.5 | Wrong conference predicted |

### Decision

```python
final_score = blended - penalties
if final_score >= 7.85:
    decision = "accept"
else:
    decision = "reject"  # Iterate if < 4 iterations
```

## Vendor Assignment

Vendors (OpenAI vs Anthropic) are assigned 50/50 randomly based on job_id hash:

```python
def get_vendor(job_id: str) -> str:
    hash_value = int(hashlib.md5(job_id.encode()).hexdigest(), 16)
    return "openai" if hash_value % 2 == 0 else "anthropic"
```

**Important**: Vendor is job-scoped, not iteration-scoped. Same vendor for all iterations.

## Models Used

| Agent | OpenAI | Anthropic |
|-------|--------|-----------|
| Manager | gpt-5.2 | claude-sonnet-4-5 |
| Worker | gpt-5.2 | claude-sonnet-4-5 |
| Nova Assessors | Amazon Nova (Bedrock) | - |
| Evaluator | Amazon Nova (Bedrock) | - |
