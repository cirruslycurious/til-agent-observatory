# Known Issues & Solutions

This document catalogs common issues encountered during development with their root causes and fixes.

## Lambda Import Errors

### ImportModuleError: pydantic_core._pydantic_core

**Symptoms**: Lambda fails on cold start with native extension error

**Cause**: Layer 1 built without Docker (wrong architecture)

**Fix**:
```bash
docker ps  # Verify Docker running
./scripts/bundle-lambda-layers.sh
npx cdk deploy TilWorkflowStack --profile YOUR_PROFILE
```

### ImportModuleError: No module named 'artifact_envelope'

**Cause**: Import path doesn't work in Lambda layer structure

**Fix**: Use try/except pattern:
```python
try:
    from artifact_schemas.artifact_envelope import ArtifactEnvelope
except ImportError:
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent / 'artifact-schemas'))
    from artifact_envelope import ArtifactEnvelope
```

---

## Dashboard Issues

### Dashboard showing 0 evaluations

**Cause**: `til-job-summaries` has stale/missing data

**Fix**:
```bash
npm run backfill-summaries
```

### Dashboard data is stale after code fix

**Cause**: Lambda 5-minute cache

**Fix**: Update a Lambda environment variable to force new containers

---

## Scoring Issues

### Nova scoring always returning 5.0

**Cause**: Event logging using non-existent EventType

**Prevention**: Verify EventType exists in `event_types.py` before using

### Vendor flipping between iterations

**Cause**: Vendor assignment seeded with `job_id + iteration`

**Fix**: Seed only with `job_id` (vendor is job-scoped)

---

## Tool Issues

### search_abstracts returns "no such column" error

**Cause**: FTS5 interprets hyphens as minus operators

**Fix**: Quote words containing special characters:
```python
# "multi-account" becomes '"multi-account"'
sanitized = f'"{word}"' if any(c in word for c in '-:()\"*') else word
```

### dynamodb_lookup returns ValidationException

**Cause**: Using FilterExpression for sort key

**Fix**: Use KeyConditionExpression for both partition and sort key:
```python
KeyConditionExpression='conference = :conf AND data_type = :dt'
```

---

## Frontend Issues

### Frontend API calls returning 404

**Cause**: Missing `VITE_API_BASE_URL` in production build

**Fix**:
1. Update `.env.production` with correct API Gateway URL
2. Rebuild: `npm run build`
3. Redeploy: `npx cdk deploy TilFrontendStack`

---

## Step Functions Issues

### JSONPath not found error

**Cause**: Lambda return payload missing expected field

**Example**: `$.manager_evaluation_result.Payload.feedback`

**Fix**: Ensure Lambda returns all expected fields:
```python
return {
    'decision': decision,
    'feedback': feedback,  # Must match Step Functions JSONPath
    'feedback_for_worker': feedback,  # Also include for compatibility
    ...
}
```

---

## Layer Build Issues

### Layer 1 is only 12 MB (should be 36-38 MB)

**Cause**: pip failed, network issue, or no Docker

**Fix**:
```bash
docker ps  # Verify Docker
./scripts/bundle-lambda-layers.sh
du -sh packages/agents/layers/*/python  # Verify sizes
```

### Layer 2 is 1.3 MB (should be ~640 KB)

**Cause**: Duplicate directories or test files not cleaned

**Fix**: Build script now cleans automatically. Rebuild:
```bash
./scripts/bundle-lambda-layers.sh
```

---

## Debugging Commands

### Check Lambda logs
```bash
aws logs tail /aws/lambda/til-manager-agent --follow --profile YOUR_PROFILE
```

### Check Step Functions execution
```bash
aws stepfunctions describe-execution \
  --execution-arn "arn:aws:states:us-east-1:ACCOUNT:execution:til-workflow:job-xxx" \
  --profile YOUR_PROFILE
```

### Check DynamoDB job record
```bash
aws dynamodb get-item \
  --table-name til-jobs \
  --key '{"job_id": {"S": "xxx"}}' \
  --profile YOUR_PROFILE
```
