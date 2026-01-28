# Job Lifecycle Management

**Story:** 6.5 - Job Lifecycle & Metadata Table  
**Last Updated:** 2026-01-14

---

## Overview

The jobs table serves as the single source of truth for job state in the TIL Agent Workflow Observatory. It enables cheap `/status` queries, automatic cleanup via TTL, and centralized job metadata.

## Job Lifecycle States

### State Definitions

1. **queued**: Job enqueued, waiting for Step Functions capacity (or initial state if SFN starts immediately)
2. **running**: Step Functions execution in progress (Manager → Worker → Evaluator → Manager state machine)
3. **completed**: Job finished successfully, results available (final abstract generated, evaluator assessment complete)
4. **failed**: Job failed (timeout, error, max retries exceeded, validation failure, budget exceeded)

### State Transitions

```
┌─────────┐
│ queued  │ ──┐
└────┬────┘   │
     │        │ (idempotent)
     │        │
     ▼        │
┌─────────┐   │
│ running │ ──┘
└────┬────┘
     │
     ├──► ┌──────────┐
     │    │completed │
     │    └──────────┘
     │
     └──► ┌────────┐
          │ failed │
          └────────┘
```

**Valid Transitions:**
- `queued` → `running` (when Step Functions starts)
- `running` → `completed` (on successful completion)
- `running` → `failed` (on failure)
- `running` → `running` (idempotent, valid for heartbeat updates)
- `completed` → `completed` (idempotent, valid for status updates)
- `failed` → `failed` (idempotent, valid for status updates)

**Invalid Transitions:**
- Any transition that moves backwards (e.g., `completed` → `running`)
- Any transition from terminal states to non-terminal states

**Conditional Updates:**
All state transitions use `ConditionExpression` in DynamoDB `UpdateItem` to prevent regression:
- Only set `running` if current status is `queued` or `running`
- Only set `completed`/`failed` if current status is `running` or already in terminal state

## Token Security

### Token Generation
- `job_read_token`: Random string, 64+ characters, high entropy (UUID + UUID concatenated)
- `job_read_token_hash`: HMAC-SHA256 hash of `job_read_token` with `server_secret`
- Token only returned once (on job creation)
- `server_secret`: Stored in AWS Parameter Store (encrypted, KMS key)

### Token Verification
- Compute `HMAC-SHA256(server_secret, provided_token)`
- Compare with stored `job_read_token_hash` using constant-time comparison (`crypto.timingSafeEqual` in Node.js, `hmac.compare_digest` in Python)
- Prevents timing attacks

### Token Expiration
- Jobs expire after 7 days (configurable 7-30 days for MVP)
- Expired jobs return `410 Gone` even if item not yet deleted by TTL
- Makes token invalidation deterministic

## TTL and Retention Strategy

### TTL Configuration
- **Field:** `expires_at` (Number, Unix timestamp)
- **Default:** 7 days from creation
- **Configurable:** 7-30 days for MVP
- **Deletion:** DynamoDB auto-deletes expired items (eventual, within 48 hours of `expires_at`)

### Retention Semantics
- **Jobs table:** 7 days (auto-deleted via TTL)
- **Artifacts table:** Indefinite (for analysis)
- **Decision events table:** Indefinite (for analysis)
- **Generation metrics table:** Indefinite (for dashboards)

### Retention Mismatch
Jobs expire but artifacts/events remain forever. This may accumulate S3/DDB artifacts indefinitely even when jobs disappear. Artifacts retention policy is separate; may add TTL/lifecycle later.

## Access Patterns

### Get Job Status
```typescript
// Single GetItem by job_id (cheap and fast)
const result = await docClient.send(new GetCommand({
  TableName: 'til-jobs',
  Key: { job_id: jobId },
}));
```

### Verify Token
```typescript
// 1. GetItem by job_id
const job = await getJob(jobId);

// 2. Compute hash and compare (constant-time)
const isValid = verifyJobTokenHash(token, job.job_read_token_hash);
```

### List Failed Jobs (Admin)
```typescript
// Bounded scan with date filter (admin/debug only, low volume)
const result = await docClient.send(new ScanCommand({
  TableName: 'til-jobs',
  FilterExpression: '#status = :status AND created_at >= :cutoff',
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: {
    ':status': 'failed',
    ':cutoff': cutoffTimestamp,
  },
  Limit: 100,
}));
```

**Note:** If admin scan becomes common, add GSI on `status + created_at` for efficient queries.

## Integration Points

### Story 1.1 (Landing Page)
- Job creation writes to jobs table
- Returns `job_id` and `job_read_token`
- Token stored in sessionStorage

### Story 1.2 (Workflow Visualization)
- `/status` endpoint queries jobs table for job status
- Status used to determine UI state (queued, running, completed, failed)

### Story 2.1 (Manager Agent)
- Step Functions updates jobs table status (queued → running → completed/failed)
- Step Functions execution ARN stored in jobs table for debugging

### Story 3.1 (Decision Event Capture)
- Job lifecycle events logged to `decision_events_by_job` table: `job_created`, `job_started`, `job_completed`, `job_failed`
- Decision events provide detailed timeline, jobs table provides current state

### Story 6.2 (Generation Metrics)
- `generation_metrics` table uses `job_id` as `generation_id` (same value)
- Jobs table provides metadata, generation_metrics provides aggregated metrics

## Error Handling

### Deterministic Error Codes
Status endpoint uses deterministic return code order (prevents probing):
1. If item missing → `404 Not Found`
2. If `expires_at <= now` → `410 Gone` (don't leak whether token is valid)
3. Else if token mismatch → `403 Forbidden`
4. Else → `200 OK` with public status response shape

### Error Messages
- `error`: String (max 500 chars, truncated) - Short error message if status = failed
- `failure_reason`: Enum (timeout | validation_failed | budget_exceeded | internal_error | unknown)
- Error messages truncated to avoid leaking sensitive details

## Best Practices

1. **Always use conditional updates** for state transitions to prevent regression
2. **Use constant-time comparison** for token verification to prevent timing attacks
3. **Check expiration before token verification** to return 410 Gone deterministically
4. **Log all state transitions** as decision events for audit trail
5. **Store Step Functions execution ARN** for debugging and correlation
6. **Use public_status shape** for API responses (stable, doesn't leak internal details)

---