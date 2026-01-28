# Testing Patterns & Infrastructure

**Authoritative guide for testing patterns, infrastructure setup, and best practices.**

## Test Framework Setup

### Python Testing

**Framework:** pytest 7.4.0+

**Installation:**
```bash
pip install pytest pytest-mock moto boto3
```

**Test Structure:**
```
packages/shared/{module}/
  - {module}.py
  - test_{module}.py  # Unit tests (co-located)
```

**Example:**
```python
import pytest
from unittest.mock import Mock, patch
from moto import mock_aws

@mock_aws
def test_example():
    # Test code here
    pass
```

### TypeScript Testing

**Framework:** Vitest (or Jest)

**Installation:**
```bash
npm install --save-dev vitest @vitest/ui
```

**Test Structure:**
```
packages/{module}/
  - {module}.ts
  - {module}.test.ts  # Unit tests (co-located)
```

---

## Testing Infrastructure

### DynamoDB Testing

**Strategy:** Use `moto` (Python) for mocking DynamoDB

**Setup:**
```python
from moto import mock_aws

@mock_aws
def test_dynamodb_operation():
    # Create table
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.create_table(
        TableName='test-table',
        KeySchema=[
            {'AttributeName': 'pk', 'KeyType': 'HASH'},
            {'AttributeName': 'sk', 'KeyType': 'RANGE'},
        ],
        AttributeDefinitions=[
            {'AttributeName': 'pk', 'AttributeType': 'S'},
            {'AttributeName': 'sk', 'AttributeType': 'S'},
        ],
        BillingMode='PAY_PER_REQUEST',
    )
    table.wait_until_exists()
    
    # Test operations
    table.put_item(Item={'pk': 'test', 'sk': 'test', 'data': 'value'})
    response = table.get_item(Key={'pk': 'test', 'sk': 'test'})
    assert response['Item']['data'] == 'value'
```

**Benefits:**
- No AWS account needed
- Fast test execution
- Deterministic results
- Works in CI/CD

### S3 Testing

**Strategy:** Use `moto` for mocking S3

**Setup:**
```python
from moto import mock_aws

@mock_aws
def test_s3_operation():
    s3_client = boto3.client('s3', region_name='us-east-1')
    s3_client.create_bucket(Bucket='test-bucket')
    
    # Test operations
    s3_client.put_object(
        Bucket='test-bucket',
        Key='test-key',
        Body=b'test data'
    )
    response = s3_client.get_object(Bucket='test-bucket', Key='test-key')
    assert response['Body'].read() == b'test data'
```

**Note:** Use `mock_aws()` for both DynamoDB and S3 (newer moto API).

---

## Test Patterns

### AAA Pattern (Arrange, Act, Assert)

**Structure:**
```python
def test_example():
    # Arrange: Set up test data and mocks
    test_data = {'key': 'value'}
    mock_table = Mock()
    
    # Act: Execute the code under test
    result = function_under_test(test_data, mock_table)
    
    # Assert: Verify the results
    assert result['status'] == 'success'
    mock_table.put_item.assert_called_once()
```

### Mocking External Dependencies

**Pattern:** Mock all external dependencies (DynamoDB, S3, external APIs)

**Example:**
```python
@patch('module.dynamodb_table')
def test_with_mock(mock_table):
    mock_table.put_item.return_value = {}
    result = write_function(data)
    mock_table.put_item.assert_called_once()
```

### Integration Tests

**Location:** `tests/integration/`

**Pattern:** Test end-to-end workflows with mocked AWS services

**Example:**
```python
from moto import mock_aws

@mock_aws
def test_end_to_end_workflow():
    # Set up DynamoDB and S3
    # Execute full workflow
    # Verify end state
    pass
```

---

## Code Review Rules

### Hot Endpoint Performance Rule

**Rule:** Hot endpoints must do ≤1 DynamoDB read and ≤1 DynamoDB write per request (unless explicitly documented).

**Enforcement:**
- Code review checklist
- Add comment in code if exception: `# PERFORMANCE: 2 reads for [reason]`
- Document in API endpoint documentation

**Examples:**
- ✅ `GET /api/v1/jobs/{job_id}/status` - Single GetItem (read only)
- ✅ `POST /api/v1/jobs` - Single PutItem (write only)
- ❌ Multiple GetItem calls in hot path (refactor to single read)

**Rationale:** Prevents performance degradation and cost increases as system scales.

---

## Test Coverage Requirements

### Unit Tests
- **Target:** 80%+ code coverage
- **Focus:** Business logic, validation, error handling
- **Location:** Co-located with source code

### Integration Tests
- **Target:** All critical paths covered
- **Focus:** End-to-end workflows, cross-component interactions
- **Location:** `tests/integration/`

### Test Data Management
- Use fixtures for common test data
- Use `copy.deepcopy()` for nested structures (prevents test interference)
- Clean up test data after tests (moto handles this automatically)

---

## Running Tests

### Python
```bash
# Run all tests
pytest

# Run specific test file
pytest packages/shared/artifact-writer/test_artifact_writer.py

# Run with coverage
pytest --cov=packages/shared/artifact-writer

# Run with verbose output
pytest -v
```

### TypeScript
```bash
# Run all tests
npm test

# Run with watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

---

## Test Fixtures Best Practices

### Deep Copy for Nested Structures

**Problem:** Shallow copy shares nested dictionaries, causing test interference.

**Solution:**
```python
import copy

# ❌ Bad: Shallow copy
test_data = sample_data.copy()

# ✅ Good: Deep copy
test_data = copy.deepcopy(sample_data)
```

**Rule:** Always use `copy.deepcopy()` when creating test fixtures that modify nested structures.

---

## Common Test Patterns

### Testing Idempotency

```python
def test_idempotency():
    # First write
    result1 = write_artifact(data, job_id, task_id, 'v0001')
    
    # Second write (same data)
    result2 = write_artifact(data, job_id, task_id, 'v0001')
    
    # Should return existing artifact
    assert result1['artifact_id'] == result2['artifact_id']
```

### Testing Validation

```python
def test_validation_error():
    invalid_data = {'missing': 'required_field'}
    
    with pytest.raises(ValidationError) as exc_info:
        validate_artifact(invalid_data)
    
    assert 'required_field' in str(exc_info.value)
```

### Testing GSI Queries

```python
@mock_aws
def test_gsi_query():
    # Set up table with GSI
    # Write test data
    # Query GSI
    # Verify results
    pass
```

---

## Continuous Integration

**Test Execution:**
- Run all tests on every PR
- Fail PR if tests fail
- Require 80%+ code coverage

**Test Environment:**
- Use moto for AWS service mocking (no AWS account needed)
- Fast test execution (< 1 minute for full suite)
- Deterministic results
