## Epic 6: Data Management & Infrastructure

### Story 6.1: DynamoDB Scratch Artifacts Storage

**As the** system  
**I need** reliable artifact storage with idempotency  
**So that** race conditions don't corrupt data

**Acceptance Criteria:**

**Table: scratch_artifacts**

**Schema:**
- [ ] Partition key: job_id (String, UUID)
- [ ] Sort key: task_id#artifact_version (String, e.g., "cfp_extract#v1", "cfp_extract#v2")
- [ ] **No GSIs** for MVP (explained below)

**Why No GSIs:**
- [ ] scratch_artifacts is designed for **per-job retrieval**, not cross-job analytics
- [ ] Primary access pattern: Query by job_id to reconstruct workflow
- [ ] GSIs would need different partition keys; since base table uses job_id, GSIs provide minimal value
- [ ] **Analytics queries** (e.g., "all CFP Extractor artifacts", "timeout rates by sub-worker") come from:
  - [ ] Decision events in decision_events table
  - [ ] Precomputed aggregates in daily_metrics table
  - [ ] NOT from querying scratch_artifacts across jobs

**Design Principle:**
- [ ] scratch_artifacts = workflow reconstruction and artifact retrieval for single jobs
- [ ] decision_events + generation_metrics + daily_metrics = analytics and cross-job queries

**Attributes (Standard Envelope):**
```
meta: {
  artifact_id, job_id, iteration, parent_task_id, task_id,
  worker_id, worker_vendor, worker_model, artifact_type,
  artifact_version, schema_version, spawned_at, completed_at, status
}
data: { /* artifact-specific, may be summary if large */ }
quality_signals: { confidence, coverage, validation_passed }
provenance: { sources[], claims[], tool_calls[] }
overflow: { s3_payload_ref, s3_tool_results_ref, payload_sha256, payload_size_bytes }
execution: { tokens_used, execution_time_ms, error }
```

**Idempotency Rules (CRITICAL - Deterministic Versioning):**
- [ ] Sort key uses stable task_id + version: `task_id#v1`, `task_id#v2`, `task_id#v3`
- [ ] task_id represents "the conceptual task" (e.g., "cfp_extract")
- [ ] artifact_version increments for retries with different content
- [ ] Every Lambda write uses ConditionExpression: `attribute_not_exists(PK) AND attribute_not_exists(SK)` for the specific version
- [ ] **Retry behavior (deterministic)**:
  - [ ] First attempt: Write to `task_id#v1`
  - [ ] Retry with same content hash: No-op, return existing `task_id#v1` artifact_id
  - [ ] Retry with different content: Write to `task_id#v2`
  - [ ] Subsequent retries: Increment version (v3, v4, etc.)
- [ ] Never create duplicate artifacts with same sort key
- [ ] Log all duplicate write attempts as `duplicate_write_attempt` events
- [ ] **Advantage**: No inventing new task_id strings mid-stream; stable task identifiers with explicit versioning

**Size Management:**
- [ ] If artifact size < 350KB: Write full artifact to DynamoDB data field
- [ ] If artifact size >= 350KB:
  - [ ] Write summary (max 10KB) to DynamoDB data field
  - [ ] Upload full artifact to S3: `s3://scratch-artifacts/{job_id}/{task_id}/full_artifact.json`
  - [ ] Set overflow.s3_payload_ref = S3 key
  - [ ] Calculate and set overflow.payload_sha256
- [ ] Tool results: Always store summary in provenance.tool_calls[].results_summary
- [ ] If tool results >50KB: Upload to S3, set overflow.s3_tool_results_ref

**Access Patterns:**
- [ ] Get all artifacts for job: Query by job_id (returns all task_ids)
- [ ] Get specific artifact: Get by job_id + task_id
- [ ] Get full artifact if overflowed: Check overflow.s3_payload_ref, fetch from S3

---

### Story 6.2: DynamoDB Generation Metrics Storage

**As the** system  
**I need** comprehensive metrics storage for analytics  
**So that** dashboard can query effectively

**Acceptance Criteria:**

**Table: generation_metrics**

**Schema:**
- [ ] Partition key: generation_id (String, UUID) - NOTE: generation_id == job_id (same value)
- [ ] Sort key: timestamp (String, ISO datetime)
- [ ] GSI: date_partition (String, YYYY-MM-DD) + timestamp (for time-series queries)

**Attributes:**
```
Request Context:
- generation_id, user_session_id, conference, topic, timestamp, date_partition

Vendor Assignment:
- manager_vendor, manager_model, worker_vendor, worker_model, evaluator_model

Iteration Control:
- total_iterations (1-5), selected_iteration (0-4), creativity_progression[], iteration_details[]

User Feedback:
- user_accepted (boolean), user_intent (string), user_feedback_time, user_comment

Sub-Worker Data:
- sub_workers_spawned[], sub_worker_patterns, parallel_executions, sub_worker_time_ms

Tool Usage:
- tool_calls_made[], tool_sequences[], tool_effectiveness, cost_guardrail_triggered, minimal_tool_mode_activated

Manager Data:
- manager_feedback[], manager_evaluation_time_ms

Evaluator Data:
- evaluator_result {top_3, confidence_scores, reasons}, evaluator_timeout, evaluator_response_time_ms, evaluator_agreement

Performance:
- total_tokens, tokens_by_component, total_cost_usd, total_time_seconds

Artifacts:
- scratch_artifacts[] (references), evidence_quality, final_output (summary), final_output_s3_ref
```

**Key Constraints:**
- [ ] Conference field: CLOSED SET ["black_hat", "reinvent", "kubecon"] - validate before write
- [ ] Evaluator top_3: CLOSED SET (same 3 conferences) - validate before write
- [ ] User intent: CLOSED SET ["would_submit_with_edits", "would_not_submit"] - validate
- [ ] Total iterations: 1-5 hard cap - validate before write

**Dashboard Query Optimization:**
- [ ] Precomputed daily aggregates in separate table: daily_metrics
- [ ] Lambda runs nightly to aggregate metrics by date_partition
- [ ] Dashboard reads from daily_metrics for historical data (fast)
- [ ] Dashboard reads from generation_metrics for today's data (real-time)

**Table: daily_metrics**
- [ ] Partition key: metric_date (String, YYYY-MM-DD)
- [ ] Sort key: metric_type (String, e.g., "acceptance_by_vendor", "tool_usage", "evaluator_accuracy")
- [ ] Attributes: precomputed_data (JSON, chart-ready)
- [ ] Updated: Nightly Lambda aggregation job

---

### Story 6.3: S3 Storage for Large Artifacts

**As the** system  
**I need** S3 storage for artifacts exceeding DynamoDB limits  
**So that** large tool results and artifacts don't fail

**Acceptance Criteria:**

**Bucket: scratch-artifacts-{environment}**

**Structure:**
```
s3://scratch-artifacts/
  {job_id}/
    {task_id}/
      full_artifact.json         # Complete artifact if >350KB
      tool_results.json          # Raw tool outputs if >50KB
      metadata.json              # Envelope copy for audit
```

**Upload Logic:**
- [ ] If artifact size >= 350KB:
  - [ ] Upload full artifact to S3
  - [ ] Generate SHA-256 hash
  - [ ] Write summary + S3 ref + hash to DynamoDB
- [ ] If tool results >50KB:
  - [ ] Upload tool results to S3
  - [ ] Write results_summary (50-200 chars) + S3 ref to DynamoDB

**Lifecycle:**
- [ ] Storage class: Intelligent-Tiering (auto-optimization)
- [ ] Transition to Glacier after 365 days
- [ ] Retention: Indefinite (until manual cleanup)

**Access:**
- [ ] Lambdas have IAM read/write permissions to bucket
- [ ] Frontend gets pre-signed URLs for download (if needed)
- [ ] Dashboard Deep View can fetch full artifacts via API Gateway → Lambda → S3

---

### Story 6.4: Schema Validation as Runtime Gate

**As the** system  
**I need** schema validation before writing artifacts  
**So that** bad data doesn't enter the system

**Acceptance Criteria:**

**Shared Schema Validator Library:**
- [ ] Centralized library (Python: pydantic, Node.js: ajv)
- [ ] Imported by all Lambda functions that write artifacts
- [ ] JSON schemas defined for each artifact type:
  - [ ] style_profile_v1.schema.json
  - [ ] evidence_bundle_v1.schema.json
  - [ ] draft_candidates_v1.schema.json
  - [ ] review_feedback_v1.schema.json
- [ ] Version-aware validation (validates against artifact_version field)

**Runtime Enforcement Logic:**
```python
def write_artifact(artifact_data, job_id, task_id):
    # Validate before writing
    validation_result = schema_validator.validate(
        artifact_data,
        artifact_type=artifact_data['artifact_type'],
        version=artifact_data['artifact_version']
    )
    
    if not validation_result.is_valid:
        # Log validation failure
        log_event({
            "event_type": "artifact_validation_failed",
            "job_id": job_id,
            "task_id": task_id,
            "artifact_type": artifact_data['artifact_type'],
            "errors": validation_result.errors,
            "severity": "critical"
        })
        
        # Do NOT write invalid artifact
        raise ArtifactValidationError(validation_result.errors)
    
    # Write only if valid
    dynamodb.put_item(artifact_data)
```

**Worker Fallback Handling:**
- [ ] If sub-worker produces invalid artifact, Worker receives ArtifactValidationError
- [ ] Worker treats as if artifact is missing (equivalent to timeout)
- [ ] Worker applies appropriate fallback strategy (same as sub-worker timeout)
- [ ] Logs: "Sub-worker {type} produced invalid schema, applying fallback"

**Validation Event Tracking:**
- [ ] All artifact_validation_failed events logged to Metrics table
- [ ] Dashboard shows validation failure rate by sub-worker type
- [ ] Alerts if validation failure rate >5% for any sub-worker type

**Required Field Enforcement:**
- [ ] meta.artifact_id, job_id, iteration, parent_task_id (always required)
- [ ] provenance.sources[] (must be non-empty array)
- [ ] provenance.claims[] (must have at least one claim)
- [ ] quality_signals.confidence (must be 0-1 number)
- [ ] quality_signals.coverage (must be enum: "comprehensive" | "moderate" | "limited")

---

### Story 6.5: Job Lifecycle & Metadata Table

**As the** system  
**I need** centralized job lifecycle state tracking  
**So that** /status queries are cheap and job cleanup is automated

**Acceptance Criteria:**

**Table: jobs**

**Schema:**
- [ ] Partition key: job_id (String, UUID)
- [ ] **Attributes**:
  - [ ] job_read_token_hash (String, SHA-256 of token)
  - [ ] status (String enum: queued | running | completed | failed)
  - [ ] created_at (String, ISO timestamp)
  - [ ] completed_at (String, ISO timestamp, nullable)
  - [ ] expires_at (Number, Unix timestamp - DynamoDB TTL)
  - [ ] request_context (JSON: conference, topic, user_session_id)
  - [ ] vendor_assignment (JSON: manager_vendor, worker_vendor)
  - [ ] error (String, nullable - if failed)
- [ ] **DynamoDB TTL**: expires_at field (7 days from creation)

**Job Lifecycle States:**
- [ ] **queued**: Job enqueued, waiting for Step Functions capacity
- [ ] **running**: Step Functions execution in progress
- [ ] **completed**: Job finished successfully, results available
- [ ] **failed**: Job failed (timeout, error, max retries exceeded)

**State Transitions:**
- [ ] Create job: status = queued (if SFN at capacity) or running (if started immediately)
- [ ] SFN starts: status = running
- [ ] SFN completes: status = completed, set completed_at
- [ ] SFN fails: status = failed, set error message

**Benefits:**
- [ ] **/status endpoint queries jobs table only** (cheap, no scanning event streams)
- [ ] Job metadata centralized (token, status, context, vendors)
- [ ] Automatic cleanup via TTL (7 days - configurable)
- [ ] Failed job tracking (can retry or investigate)

**Access Patterns:**
- [ ] Get job status: Query jobs table by job_id
- [ ] Verify token: Query jobs table, compare hashed token
- [ ] List failed jobs: Scan jobs table with filter status = failed (admin/debug only)

**Retention:**
- [ ] TTL: 7 days (configurable 7-30 days for MVP)
- [ ] After expiry: DynamoDB auto-deletes job record
- [ ] Artifact and event data remains (indefinite) for analysis
- [ ] Expired token access returns 410 Gone

---

