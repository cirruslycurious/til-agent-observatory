# Database Schema

## DynamoDB Tables

### jobs

**Partition Key:** `job_id` (String, UUID)  
**Sort Key:** None  
**GSIs:** None (not needed for per-job queries)  
**TTL:** `expires_at` (Number, Unix timestamp, 7 days from creation, configurable 7-30 days)  
**Billing Mode:** On-demand (low volume, predictable access patterns)  
**Point-in-Time Recovery:** Enabled (for audit trail and data recovery)

**Attributes:**
- `job_id`: String (UUID, partition key)
- `job_read_token_hash`: String (HMAC-SHA256 hash of job_read_token with server_secret) - Used for access control (prevents hash reuse if token generation weakens)
- `status`: String enum (queued | running | completed | failed) - Current job state
- `failure_reason`: String enum (nullable) - Failure reason if status = failed: timeout | validation_failed | budget_exceeded | internal_error | unknown
- `created_at`: String (ISO timestamp) - Job creation time
- `updated_at`: String (ISO timestamp) - Last status update time (set on every status transition)
- `completed_at`: String (ISO timestamp, nullable) - Job completion time (set when status = completed or failed)
- `last_heartbeat_at`: String (ISO timestamp, optional) - Last heartbeat from Step Functions (for detecting stuck jobs, optional for MVP)
- `expires_at`: Number (Unix timestamp) - TTL for auto-cleanup (7 days from creation, configurable 7-30 days for MVP)
- `request_context`: JSON object - Original request data:
  - `conference`: String (black_hat | reinvent | kubecon | gartner_symposium | google_cloud_next) - **snake_case for consistency**
  - `topic`: String (ai_ml_genai | security_zero_trust | cloud_arch_infra | k8s_containers | platform_devops | networking_mesh | data_analytics | leadership_governance) - **snake_case for consistency**
  - `user_session_id`: String (optional, for analytics)
- `vendor_assignment`: JSON object - LLM vendor assignment:
  - `manager_vendor`: String (openai | anthropic)
  - `manager_model`: String (e.g., "gpt-4", "claude-3-opus")
  - `worker_vendor`: String (openai | anthropic)
  - `worker_model`: String (e.g., "gpt-4", "claude-3-opus")
  - `evaluator_model`: String (optional, e.g., "amazon.nova-pro-v1:0")
- `error`: String (nullable, max 500 chars, truncated) - Short error message if status = failed (truncated to avoid leaking details)
- `step_functions_execution_arn`: String (optional) - Step Functions execution ARN for job orchestration
- `public_status`: JSON object (optional, stable API response shape) - Public-facing status fields:
  - `status`: String (queued | running | completed | failed)
  - `created_at`: String (ISO timestamp)
  - `completed_at`: String (ISO timestamp, nullable)
  - `error_code`: String (nullable, failure_reason enum value)

**Job Lifecycle States:**
- **queued**: Job enqueued, waiting for Step Functions capacity (or initial state if SFN starts immediately)
- **running**: Step Functions execution in progress (Manager → Worker → Evaluator → Manager state machine)
- **completed**: Job finished successfully, results available (final abstract generated, evaluator assessment complete)
- **failed**: Job failed (timeout, error, max retries exceeded, validation failure, budget exceeded)

**State Transitions:**
- Create job: status = queued (if SFN at capacity) or running (if started immediately) - **Always emit `job_created` event, emit `job_started` event if status = running on create**
- SFN starts: status = running (set when Step Functions execution starts) - **Only if current status is queued** (ConditionExpression: status = queued)
- SFN completes successfully: status = completed, set completed_at = current timestamp - **Only if current status is running** (ConditionExpression: status = running)
- SFN fails: status = failed, set completed_at = current timestamp, set error = error message (truncated to 500 chars), set failure_reason - **Only if current status is running** (ConditionExpression: status = running)
- All state transitions update `updated_at` = current ISO timestamp
- All state transitions logged as decision events (from Story 3.1): `job_created`, `job_started`, `job_completed`, `job_failed`
- **Conditional updates prevent regression:** Use ConditionExpression in UpdateItem to prevent moving status backwards (e.g., only set running if status = queued, only set completed/failed if status = running)

**Access Patterns:**
- Get job status: Query jobs table by job_id (GetItem, cheap and fast)
- Verify token: Query jobs table by job_id, compute HMAC-SHA256(server_secret, provided_token), compare with job_read_token_hash
- List failed jobs: Scan jobs table with filter status = failed AND created_at >= (now - N days) - **Bounded scan by date filter** (admin/debug only, low volume) - **Note:** If admin scan becomes common, add GSI on status + created_at
- Job creation: PutItem with ConditionExpression: attribute_not_exists(job_id) - **Note:** UUID collisions are extremely rare; ConditionExpression is defensive but not true idempotency. For true idempotency (e.g., user double-clicks), accept idempotency_key from client or implement server-side debouncing (optional for MVP)

**Retention:**
- TTL: 7 days (configurable 7-30 days for MVP)
- After expiry: DynamoDB auto-deletes job record (eventual, not immediate - deletion happens within 48 hours of expires_at)
- **TTL vs 410 Gone semantics:**
  - If item missing → 404 Not Found (or 410 Gone, implementation choice)
  - If item exists but current_time > expires_at → return 410 Gone (treat as expired even if not yet deleted by TTL, makes token invalidation deterministic)
- Artifact and event data remains (indefinite) for analysis (scratch_artifacts, decision_events_by_job, generation_metrics)
- **Retention mismatch consequence:** Jobs expire but artifacts/events remain forever - may accumulate S3/DDB artifacts indefinitely even when jobs disappear. Artifacts retention policy is separate; may add TTL/lifecycle later.

### scratch_artifacts

**Partition Key:** `job_id` (String, UUID)  
**Sort Key:** `task_id#artifact_version` (String, e.g., "cfp_extract#v0001")  
**GSIs:** None

**Attributes:** Standard artifact envelope (meta, data, quality_signals, provenance, overflow, execution)

**Idempotency:** Write uses `ConditionExpression: attribute_not_exists(artifact_id)` where `artifact_id = job_id + "#" + task_id + "#" + artifact_version`

### generation_metrics

**Partition Key:** `job_id` (String, UUID) - **Canonical ID name everywhere (avoid "generation_id == job_id" confusion)**  
**Sort Key:** `record_type#timestamp` (String, e.g., "summary#2026-01-12T10:31:27Z")  
**GSI1 (Time-Series):** `date_partition` (String, YYYY-MM-DD) + `timestamp` (String, ISO datetime, pure time ordering)  
**GSI2 (Summary Aggregation):** `date_partition` (String, YYYY-MM-DD) + `record_type#timestamp` (String, e.g., "summary#2026-01-12T10:31:27Z") for nightly aggregation (summary records only)

**Attributes:** All job metadata, vendor assignments, performance metrics, results

**Note:** `timestamp` is a first-class attribute (String, ISO 8601 with Z, always present) used for GSI1 sort key.

### decision_events_by_job

**Partition Key:** `job_id` (String, UUID)  
**Sort Key:** `seq_ts_type` (String, format: `{zero_padded_seq}#{timestamp}#{event_type}`, e.g., "0000000123#2026-01-12T10:30:15.123Z#tool_called")  
**GSIs:** None

**Rationale for seq-first sort key:** Sequence number is the ordering primitive (not timestamp) to handle clock skew, collisions, and ensure deterministic replay. Zero-padded to 10 digits for lexicographical sorting.

**Attributes:**
- `job_id`: String (UUID, partition key)
- `seq_ts_type`: String (sort key, format: `{zero_padded_seq}#{timestamp}#{event_type}`)
- `event_id`: String (SHA-256 hash, idempotency key) - Format: `sha256(execution_id|state_name|iteration|event_type|job_id|actor|sub_worker_instance_id|stable_action_id)` (delimiter-separated to avoid ambiguity)
- `event_type`: String (strict enum: manager_goal_formulated, manager_goal_sanitized, tool_called, sub_worker_spawned, artifact_created, artifact_consumed, manager_rejected, manager_accepted, evaluator_assessed, timeout_occurred, cost_guardrail_triggered, iteration_completed, artifact_circular_dependency_detected)
- `actor`: String (strict enum: manager, worker, sub_worker, evaluator, system)
- `seq`: Integer (first-class attribute, actual sequence number, e.g., 123)
- `seq_padded`: String (optional, zero-padded seq, e.g., "0000000123", can derive from seq)
- `timestamp`: String (ISO datetime, stored as attribute for display)
- `execution_id`: String (optional, Step Functions execution ID)
- `state_name`: String (optional, Step Functions state name)
- `iteration`: Integer (optional, 0-4)
- `sub_worker_instance_id`: String (optional)
- `summary`: String (max 500 chars, human-readable, always required)
- `rationale_summary`: String (max 200 chars, optional)
- `inputs_summary`: String (max 200 chars, optional)
- `outputs_summary`: String (max 200 chars, optional)
- `evidence_pointers`: Array of strings (max 10 pointers, format: `{type}:{identifier}`, e.g., `artifact:job-123#task-456#v0001`, `source:source-1`, `tool:tool-inv-789`, `event:event-id`)
- `details`: JSON (full event details or truncated summary if >10KB)
- `details_hash`: String (SHA-256 hash of canonical JSON, always present for integrity verification)
- `details_truncated`: Boolean (always required, true if details > 10KB)
- `s3_details_ref`: String (S3 key, optional, only if details_truncated=true, format: `decision-events/{job_id}/{event_id}/details.json`)
- `created_at`: String (ISO datetime, when event was written)

**Purpose:** Chronological event stream for workflow reconstruction and analytics queries. Seq-first ordering ensures deterministic replay even with clock skew or concurrent writes.

**Seq Counter Storage:** Sequence counters stored in `generation_metrics` table (PK=job_id, SK=`seq_counter#{actor}`) as "shared infra" coupling. Attribute name is literally `seq` for `UpdateItem ADD seq :one` consistency.

### decision_event_ids

**Partition Key:** `event_id` (String, SHA-256 hash)  
**Sort Key:** None  
**GSIs:** None

**Attributes:**
- `event_id`: String (SHA-256 hash, partition key)
- `job_id`: String (UUID)
- `sk`: String (sort key from decision_events_by_job: `seq_ts_type`, format: `{zero_padded_seq}#{timestamp}#{event_type}`)
- `created_at`: String (ISO timestamp)

**Idempotency:** Write uses `ConditionExpression: attribute_not_exists(event_id)` to prevent duplicates on Step Functions retries. Atomic writes via `TransactWriteItems` to both tables.

**Return Shape:** On duplicate event, always return `{event_id, job_id, sk}` at minimum (consistent pointer tuple). Optionally return fully materialized event if available.

**Purpose:** Uniqueness check for idempotency. Used in conjunction with `decision_events_by_job` via `TransactWriteItems` for atomic writes.

**Note:** Two-table pattern ensures both chronological queries (from `decision_events_by_job`) and idempotency checks (from `decision_event_ids`) work correctly without conflicts.

### daily_metrics

**Partition Key:** `metric_date` (String, YYYY-MM-DD)  
**Sort Key:** `metric_type` (String, e.g., "acceptance_by_vendor")  
**GSIs:** None

**Attributes:**
- `precomputed_data`: JSON (chart-ready)

### conference_data

**Partition Key:** `conference` (String: kubecon | black_hat | reinvent | gartner_symposium | google_cloud_next)  
**Sort Key:** `data_type` (String, e.g., "rules" or "abstract_example#kubecon_2024_001")  
**GSIs:** None

**Attributes:** Conference rules, example abstracts, tone guidelines

**Supported Conferences (5):**

| Conference | Focus | Tone |
|------------|-------|------|
| `kubecon` | Cloud-native, Kubernetes | Technical, community-focused |
| `black_hat` | Security research, exploits | Research-focused, adversarial |
| `reinvent` | AWS cloud services | Practical, solution-oriented |
| `gartner_symposium` | Executive strategy, digital transformation | Strategic, executive-focused |
| `google_cloud_next` | GCP, Gemini AI, Vertex AI | Innovative, developer-focused |

**Data Population:** 205 total items (5 rules + 200 abstract examples, 40 per conference)

### job_budgets

**Partition Key:** `job_id` (String, UUID)  
**Sort Key:** None  
**GSIs:** None

**Attributes:**
- `job_id`: String (UUID, partition key)
- `web_search_count`: Number (starts at 0)
- `web_search_limit`: Number (10 normal mode, 2 minimal mode)
- `estimated_cost_cents`: Number (integer, stores cost in cents to avoid float precision issues)
- `minimal_mode_activated`: Boolean (default false)
- `minimal_mode_activated_at`: String (ISO timestamp, optional) - Timestamp when minimal mode was activated
- `tokens_used`: Number (running total, starts at 0)
- `last_cost_event_at`: String (ISO timestamp, optional) - Last cost event timestamp for cost velocity tracking
- `last_cost_event_id`: String (UUID, optional) - UUID of last cost event (for idempotency, prevents double-logging on retries)
- `created_at`: String (ISO timestamp)
- `updated_at`: String (ISO timestamp)
- `job_created_at`: String (ISO timestamp) - Job creation date for daily cost attribution (job-creation-day scoped, not execution-day scoped)

**Note:** `estimated_cost_usd` is computed at the API boundary (estimated_cost_cents / 100.0) and not stored in DynamoDB. This ensures exact comparisons at thresholds (e.g., > 500 cents = > $5.00) without float precision issues.

### ws_connections

**Partition Key:** `job_id` (String, UUID)  
**Sort Key:** `connection_id` (String, API Gateway connection ID)  
**TTL:** `expires_at` (Number, Unix timestamp, 1 day)  
**GSIs:** None

**Attributes:**
- `connection_id`: String (API Gateway connection ID)
- `created_at`: String (ISO timestamp)
- `expires_at`: Number (Unix timestamp for TTL)

### web_search_guardrails

**Partition Key:** `guardrail_key` (String, format: `{job_id}#{iteration}#{sub_worker_type}#{sub_worker_instance_id}`)  
**Sort Key:** None  
**GSIs:** None

**Attributes:**
- `web_search_count`: Number (starts at 0)
- `web_search_limit`: Number (fixed at 2)
- `created_at`: String (ISO timestamp)
- `updated_at`: String (ISO timestamp)

**Purpose:** Track per-sub-worker-instance web search limits (2 per instance per iteration), separate from job-scoped limits in `job_budgets` table.

**Note:** Optional TTL can be added for cleanup of old guardrail entries.

### evaluation_results

**Partition Key:** `job_id` (String, UUID)  
**Sort Key:** `evaluator_request_id` (String, format: `{job_id}#iteration#{iteration}`)  
**GSIs:** None

**Attributes:**
- `status`: String (completed | failed)
- `top_3_conferences`: Array of strings (from closed set: black_hat, reinvent, kubecon, gartner_symposium, google_cloud_next)
- `confidence_scores`: Array of numbers (0-1, must sum to 1.0 within 0.01 tolerance)
- `reasons`: Array of strings (max 500 chars each, exactly 3 elements, maps 1:1 to top_3_conferences)
- `tokens_used`: Number (nullable, present when status="completed")
- `cost_usd`: Number (nullable, present when status="completed")
- `error_type`: String (nullable, present when status="failed")
- `error_message`: String (nullable, truncated, present when status="failed")
- `timestamp`: String (ISO timestamp)

**Idempotency:** Write uses `ConditionExpression: attribute_not_exists(#sk)` with ExpressionAttributeNames mapping #sk to sort key attribute name (PK/SK immutability).

**Purpose:** Dedicated table for evaluator results (cleaner queries and schema separation). Evaluator data is also denormalized into `generation_metrics` summary for dashboard queries.

### cold_start_metrics

**Partition Key:** `function_name` (String, e.g., "manager", "worker", "sub-worker", "evaluator")  
**Sort Key:** None  
**GSIs:** None

**Attributes:**
- `cold_start_data`: JSON (precomputed cold start metrics: request_sequence, latency_ms, is_cold_start)
- `last_updated_at`: String (ISO timestamp)

**Purpose:** Cached precomputed Lambda cold start data (updated every 5 minutes by scheduled Lambda). Avoids querying CloudWatch Logs Insights in hot path.

### health_indicators

**Partition Key:** `indicator_type` (String, e.g., "system_status", "daily_cost")  
**Sort Key:** None  
**GSIs:** None

**Attributes:**
- `indicator_data`: JSON (precomputed health indicator values)
- `last_updated_at`: String (ISO timestamp)

**Purpose:** Cached precomputed health indicators (updated every minute by scheduled Lambda or on config change). Avoids querying CloudWatch directly from frontend.

---
