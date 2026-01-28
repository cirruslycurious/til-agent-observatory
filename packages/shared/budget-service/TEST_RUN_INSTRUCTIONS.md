# Budget Service Test Run Instructions

## Test Files Created

### Python Unit Tests
- **File:** `packages/shared/budget-service/test_budget_client.py`
- **Framework:** pytest
- **Coverage:** ~25 test cases covering:
  - Budget initialization (success, idempotency, atomic creation)
  - Get budget (success, not found, searches_remaining calculation)
  - LLM cost increment (success, minimal mode activation, atomic increment)
  - Web search cost increment (success, minimal mode activation)
  - Minimal mode activation (atomic, idempotency, condition checks)
  - Cost event idempotency (cost_event_id generation)
  - Edge cases (missing fields, negative values, error handling)

### TypeScript Unit Tests
- **File:** `packages/shared/budget-service/budget_client.test.ts`
- **Framework:** vitest
- **Coverage:** ~10 test cases covering:
  - Budget initialization (success, idempotency, error handling)
  - Get budget (success, not found, searches_remaining calculation, missing fields)

### API Handler Tests
- **File:** `packages/api/src/handlers/jobs.test.ts` (updated)
- **Coverage:** Budget initialization integration in job creation
- **File:** `packages/api/src/handlers/artifacts.test.ts` (new)
- **Coverage:** Budget query endpoint (GET /api/v1/workflow/{job_id}/budget)

### Integration Tests
- **File:** `tests/integration/test_budget_tracking.py`
- **Framework:** pytest + moto
- **Coverage:** ~10 test cases covering:
  - Budget initialization on job creation
  - LLM cost tracking and minimal mode activation
  - Web search cost tracking and minimal mode activation
  - Minimal mode activation (atomic, idempotency)
  - Searches remaining calculation
  - Cost event idempotency
  - Budget mutation before event emission

## Running Tests

### Prerequisites

#### Python Tests
```bash
# Install pytest and moto (if not already installed)
pip install pytest pytest-mock moto boto3

# Or install from requirements if available
pip install -r requirements.txt
```

#### TypeScript Tests
```bash
# Dependencies should already be installed via npm install
cd packages/api
npm install  # If needed
```

### Run Python Unit Tests
```bash
cd packages/shared/budget-service
pytest test_budget_client.py -v
```

### Run TypeScript Unit Tests
```bash
cd packages/api
npm test -- budget_client.test.ts
```

### Run API Handler Tests
```bash
cd packages/api
npm test -- jobs.test.ts
npm test -- artifacts.test.ts
```

### Run Integration Tests
```bash
cd tests/integration
pytest test_budget_tracking.py -v
```

### Run All Budget Tests
```bash
# Python tests
pytest packages/shared/budget-service/test_budget_client.py tests/integration/test_budget_tracking.py -v

# TypeScript tests
cd packages/api && npm test -- --run budget jobs.test artifacts.test
```

## Expected Test Results

### Python Unit Tests
- ✅ All initialization tests pass
- ✅ All cost increment tests pass
- ✅ All minimal mode activation tests pass
- ✅ All edge case tests pass

### TypeScript Unit Tests
- ✅ All budget service tests pass
- ✅ All API handler tests pass

### Integration Tests
- ✅ All budget tracking integration tests pass
- ✅ All minimal mode activation integration tests pass

## Test Coverage Summary

- **Budget Initialization:** ✅ Covered (atomic, idempotent)
- **Cost Increments:** ✅ Covered (LLM and web search)
- **Minimal Mode Activation:** ✅ Covered (atomic, idempotent, threshold)
- **Searches Remaining:** ✅ Covered (calculation, prevents negative)
- **Cost Event Idempotency:** ✅ Covered (cost_event_id)
- **Budget Mutation Before Event:** ✅ Covered (order verification)
- **Error Handling:** ✅ Covered (budget not found, event logger failures)
- **API Endpoints:** ✅ Covered (budget query, job creation integration)
- **Edge Cases:** ✅ Covered (missing fields, negative values, rounding)

## Notes

- All tests use `moto` for AWS mocking (no real AWS account needed)
- Event logger failures are tested to ensure budget service works independently
- Tests verify atomic operations using ConditionExpression checks
- Tests verify idempotency for all write operations
