# REST API Spec

See `docs/prd/api-specifications.md` for complete OpenAPI specification. Key endpoints:

## Job Lifecycle Endpoints (Story 6.5)

### Create Job
- **Endpoint:** `POST /api/v1/jobs`
- **Authentication:** None (public endpoint)
- **Request Body:**
  ```json
  {
    "conference": "black_hat | reinvent | kubecon | gartner_symposium | google_cloud_next",
    "topic": "ai_ml_genai | security_zero_trust | cloud_arch_infra | k8s_containers | platform_devops | networking_mesh | data_analytics | leadership_governance",
    "user_session_id": "string (optional)"
  }
  ```
- **Response (202 Accepted):**
  ```json
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "job_read_token": "64-character-random-token-only-returned-once",
    "status": "queued",
    "estimated_time_seconds": 90
  }
  ```
- **Idempotency:** Uses ConditionExpression: attribute_not_exists(job_id) (defensive, UUID collisions are extremely rare)

### Get Job Status
- **Endpoint:** `GET /api/v1/jobs/{job_id}/status?token={job_read_token}`
- **Authentication:** job_read_token (hash verification)
- **Query Parameters:**
  - `token`: job_read_token (required, hash verified)
- **Response (200 OK):**
  ```json
  {
    "status": "queued | running | completed | failed",
    "created_at": "2026-01-14T10:00:00Z",
    "completed_at": "2026-01-14T10:05:00Z (nullable)",
    "error_code": "timeout | validation_failed | budget_exceeded | internal_error | unknown (nullable)"
  }
  ```
- **Error Responses:**
  - `404 Not Found`: Job not found (item missing)
  - `410 Gone`: Job expired (item exists but current_time > expires_at, or item missing after TTL deletion)
  - `403 Forbidden`: Invalid token

### Admin: List Failed Jobs
- **Endpoint:** `GET /api/v1/admin/jobs/failed?days={N}`
- **Authentication:** Admin API key (x-admin-api-key header) or IAM role
- **Query Parameters:**
  - `days`: Number (optional, default 7, max 30) - Number of days to look back
- **Response (200 OK):**
  ```json
  {
    "jobs": [
      {
        "job_id": "550e8400-e29b-41d4-a716-446655440000",
        "created_at": "2026-01-14T10:00:00Z",
        "updated_at": "2026-01-14T10:05:00Z",
        "completed_at": "2026-01-14T10:05:00Z",
        "error": "Job timed out after 90 seconds",
        "failure_reason": "timeout",
        "step_functions_execution_arn": "arn:aws:states:us-east-1:123456789012:execution:til-state-machine:abc123"
      }
    ],
    "count": 1,
    "days": 7,
    "cutoff_date": "2026-01-07T10:00:00Z"
  }
  ```
- **Pagination:** Limit 100 jobs per request

## Artifact Endpoints (Story 3.2, Story 6.1)

### Get Artifact
- **Endpoint:** `GET /api/v1/workflow/{job_id}/artifacts/{artifact_id}?token={job_read_token}[&full=true]`
- **Authentication:** job_read_token (hash verification)
- **Query Parameters:**
  - `token`: job_read_token (required, hash verified)
  - `full`: Boolean (optional, default false) - If true, return full artifact including S3 payload
- **Response (200 OK):** Full artifact envelope or summary (if >350KB, full payload in S3)

### List Artifacts
- **Endpoint:** `GET /api/v1/workflow/{job_id}/artifacts?token={job_read_token}`
- **Authentication:** job_read_token (hash verification)
- **Response (200 OK):**
  ```json
  {
    "artifacts": [...],
    "total": 10,
    "returned": 10,
    "has_more": false
  }
  ```

### Get Dependency Graph
- **Endpoint:** `GET /api/v1/workflow/{job_id}/artifacts/dependencies?token={job_read_token}`
- **Authentication:** job_read_token (hash verification)
- **Response (200 OK):**
  ```json
  {
    "nodes": [
      {
        "artifact_id": "job-123#task-1#v0001",
        "artifact_type": "evidence_bundle",
        "task_id": "task-1",
        "created_at": "2026-01-14T10:00:00Z",
        "status": "completed"
      }
    ],
    "edges": [
      {
        "from_artifact_id": "job-123#task-1#v0001",
        "to_artifact_id": "job-123#task-2#v0001",
        "reason": "Used for synthesis",
        "pointers": ["artifact:job-123#task-1#v0001"]
      }
    ],
    "circular_dependencies": []
  }
  ```
- **Story 3.2:** Artifact Traceability - Builds dependency graph from `provenance.upstream_artifacts[]`

## Other Endpoints

- `POST /api/v1/generate` - Initiate abstract generation (deprecated, use POST /api/v1/jobs)
- `GET /api/v1/status/{job_id}` - Poll job status (deprecated, use GET /api/v1/jobs/{job_id}/status)
- `POST /api/v1/feedback/{job_id}` - Submit user feedback
- `GET /api/v1/dashboard/{metric_type}` - Dashboard metrics
- `GET /api/v1/workflow/{job_id}/events` - Decision events (Story 3.1)
- `GET /api/v1/workflow/{job_id}/tools` - Tool usage (Story 3.3)
- `WebSocket /ws` - Real-time updates

## Examples

### Example: Create Job
```bash
curl -X POST https://api.example.com/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "conference": "black_hat",
    "topic": "genai"
  }'

# Response:
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_read_token": "64-character-random-token-only-returned-once",
  "status": "queued",
  "estimated_time_seconds": 90
}
```

### Example: Get Job Status
```bash
curl "https://api.example.com/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status?token=64-character-random-token-only-returned-once"

# Response:
{
  "status": "running",
  "created_at": "2026-01-14T10:00:00Z",
  "completed_at": null,
  "error_code": null
}
```

### Example: Get Completed Job Status
```bash
curl "https://api.example.com/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status?token=64-character-random-token-only-returned-once"

# Response:
{
  "status": "completed",
  "created_at": "2026-01-14T10:00:00Z",
  "completed_at": "2026-01-14T10:05:00Z",
  "error_code": null
}
```

### Example: Get Failed Job Status
```bash
curl "https://api.example.com/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status?token=64-character-random-token-only-returned-once"

# Response:
{
  "status": "failed",
  "created_at": "2026-01-14T10:00:00Z",
  "completed_at": "2026-01-14T10:05:00Z",
  "error_code": "timeout"
}
```

### Example: Expired Job (410 Gone)
```bash
curl "https://api.example.com/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status?token=64-character-random-token-only-returned-once"

# Response (410 Gone):
{
  "error": "Job expired"
}
```

### Example: Invalid Token (403 Forbidden)
```bash
curl "https://api.example.com/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000/status?token=wrong-token"

# Response (403 Forbidden):
{
  "error": "Invalid token"
}
```

---
