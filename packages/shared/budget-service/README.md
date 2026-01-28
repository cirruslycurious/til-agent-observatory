# Budget Service

**Story 4.1: Per-Job Budget Tracking**

This service provides budget tracking and cost management for individual jobs, including minimal tool mode activation and cost event emission.

## Overview

The budget service tracks:
- **Estimated cost** (stored as integer cents to avoid float precision issues)
- **Web search usage** (count and limit, with automatic reduction in minimal mode)
- **Token usage** (for LLM calls)
- **Minimal mode state** (activated when cost exceeds $5.00)

## Key Design Decisions

1. **Integer Cents Storage**: All monetary values stored as integer cents (`estimated_cost_cents`) to prevent float rounding issues
2. **Budget Mutation First**: Budget updates happen before cost event emission (budget is source of truth)
3. **Idempotent Event Emission**: Uses `last_cost_event_id` to prevent duplicate cost events
4. **Best Effort Event Logging**: Budget service works independently - event emission failures don't break budget tracking
5. **Atomic Minimal Mode Activation**: Uses DynamoDB ConditionExpression to atomically activate minimal mode

## API

### Python (`budget_client.py`)

```python
from packages.shared.budget_service.budget_client import (
    initialize_job_budget,
    get_job_budget,
    increment_llm_cost,
    increment_web_search_cost,
)

# Initialize budget for new job
budget = initialize_job_budget(job_id="job-123")

# Get current budget state
budget = get_job_budget(job_id="job-123")
# Returns: {
#   "job_id": "job-123",
#   "estimated_cost_cents": 0,
#   "estimated_cost_usd": 0.0,  # Computed at API boundary
#   "web_search_count": 0,
#   "web_search_limit": 10,  # 2 in minimal mode
#   "searches_remaining": 10,
#   "minimal_mode_activated": False,
#   "tokens_used": 0,
#   ...
# }

# Increment LLM cost
increment_llm_cost(
    job_id="job-123",
    cost_usd=0.05,  # Will be converted to 5 cents
    tokens=1000,
)

# Increment web search cost
increment_web_search_cost(
    job_id="job-123",
    cost_usd=0.01,  # Will be converted to 1 cent
)
```

### TypeScript (`budget_client.ts`)

```typescript
import {
  initializeJobBudget,
  getJobBudget,
  BudgetState,
} from '../../../shared/budget-service/budget_client';

// Initialize budget for new job
const budget = await initializeJobBudget('job-123');

// Get current budget state
const budget = await getJobBudget('job-123');
```

## Minimal Mode Activation

**Threshold**: $5.00 (500 cents)

When `estimated_cost_cents > 500` AND `minimal_mode_activated = false`:
- Atomically sets `minimal_mode_activated = true`
- Sets `web_search_limit = 2` (from 10)
- Sets `minimal_mode_activated_at` timestamp
- Emits `cost_guardrail_triggered` decision event (best effort)

**Enforcement Rule**: If `minimal_mode_activated = true` AND `web_search_count >= web_search_limit`, no further web searches are permitted.

## Cost Attribution

- **Job-scoped**: Total cost per job (not per execution)
- **Daily attribution**: Uses `job_created_at` timestamp (job-creation-day scoped, not execution-day scoped)
- **Rationale**: Long-running jobs started yesterday but incurring cost today are attributed to yesterday's budget

## Environment Variables

- `WEB_SEARCH_COST_CENTS`: Cost per web search in cents (default: calculated from Tavily pricing)
- `JOB_BUDGETS_TABLE_NAME`: DynamoDB table name (default: `til-job-budgets`)

## Error Handling

- **Budget initialization failures**: Logged but don't fail job creation (best effort)
- **Event emission failures**: Logged but don't fail budget updates (best effort)
- **Idempotency**: All operations are idempotent (safe to retry)

## Testing

- **Unit tests**: `test_budget_client.py` (24 tests)
- **Integration tests**: `tests/integration/test_budget_tracking.py` (12 tests)
- **TypeScript tests**: `budget_client.test.ts`

---
