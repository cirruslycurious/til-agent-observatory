# Test Strategy and Standards

## Testing Philosophy

- **Approach:** Test-after (write tests alongside implementation)
- **Coverage Goals:** 80% for business logic, 60% overall
- **Test Pyramid:** 70% unit, 20% integration, 10% E2E

## Test Types and Organization

### Unit Tests

- **Framework:** 
  - Python: pytest 7.4.0
  - TypeScript: Jest 29.7.0
- **File Convention:** 
  - Python: `test_*.py` or `*_test.py`
  - TypeScript: `*.test.ts`
- **Location:** Co-located with source files
- **Mocking Library:** 
  - Python: unittest.mock
  - TypeScript: jest.mock
- **Coverage Requirement:** 80% for business logic

**AI Agent Requirements:**
- Generate tests for all public methods
- Cover edge cases and error conditions
- Follow AAA pattern (Arrange, Act, Assert)
- Mock all external dependencies (DynamoDB, LLM APIs, S3)

### Integration Tests

- **Scope:** Lambda function integration with DynamoDB, S3, Step Functions
- **Location:** `tests/integration/`
- **Test Infrastructure:**
  - **DynamoDB:** LocalStack or DynamoDB Local
  - **S3:** LocalStack or moto (Python)
  - **Step Functions:** AWS SDK mocks or LocalStack
  - **LLM APIs:** Mock responses (no real API calls)

### E2E Tests

- **Framework:** Jest + Supertest (API), Playwright (Frontend)
- **Scope:** Full generation workflow from API request to result
- **Environment:** Deployed dev environment
- **Test Data:** Seeded conference_data, controlled test scenarios

## Test Data Management

- **Strategy:** Fixtures for unit tests, factories for integration tests
- **Fixtures:** `tests/fixtures/` (JSON schemas, sample artifacts)
- **Factories:** `tests/factories/` (Python: factory_boy, TypeScript: custom)
- **Cleanup:** Automatic cleanup in test teardown, TTL for DynamoDB test data

## Continuous Testing

- **CI Integration:** GitHub Actions runs all tests on PR
- **Performance Tests:** Load testing with 10+ concurrent requests (post-MVP)
- **Security Tests:** Dependency scanning (npm audit, pip-audit), SAST (CodeQL)

---
