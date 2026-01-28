# Coding Standards

## Core Standards

- **Languages & Runtimes:** Python 3.11 (agents), Node.js 20.11.0 (API/Frontend), TypeScript 5.3.3 (Frontend)
- **Style & Linting:** 
  - Python: Black formatter, pylint
  - TypeScript/JavaScript: ESLint, Prettier
- **Test Organization:** 
  - Unit tests: Co-located with source (`*.test.ts`, `test_*.py`)
  - Integration tests: `tests/integration/`
  - E2E tests: `tests/e2e/`

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Lambda Functions | kebab-case | `manager-lambda`, `cfp-extractor` |
| DynamoDB Tables | snake_case | `generation_metrics`, `scratch_artifacts` |
| Environment Variables | UPPER_SNAKE_CASE | `OPENAI_API_KEY`, `DYNAMODB_TABLE_NAME` |
| Python Functions | snake_case | `formulate_goal`, `write_artifact` |
| TypeScript Functions | camelCase | `getJobStatus`, `submitFeedback` |

## Critical Rules

- **Never use console.log in production code** - Use structured logger (CloudWatch)
- **All DynamoDB writes MUST use ConditionExpression** - Prevents duplicate writes, ensures idempotency
- **All artifact writes MUST validate schema first** - Runtime validation gate prevents bad data
- **All LLM API calls MUST track tokens and cost** - Required for budget monitoring
- **All sub-worker spawns MUST enforce 30s timeout** - Prevents runaway costs
- **All decision events MUST be logged to decision_events table** - Required for observability
- **Never hardcode API keys** - Use Parameter Store with KMS encryption
- **All job_read_token access MUST verify hash** - Security requirement
- **Sub-workers MUST NOT spawn additional workers** - Enforced in tool router, not just prompts

## Language-Specific Guidelines

### Python Specifics

- **Type Hints:** Required for all function signatures
- **Async/Await:** Use for parallel sub-worker invocations
- **Error Handling:** Use specific exception types, not bare `except:`

### TypeScript Specifics

- **Strict Mode:** Enabled in tsconfig.json
- **No `any` types:** Use `unknown` if type is truly unknown
- **Async/Await:** Prefer over Promises.then()

---
