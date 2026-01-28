# Data Models

## Job

**Purpose:** Tracks job lifecycle state and metadata for efficient status queries and automatic cleanup.

**Key Attributes:**
- `job_id`: String (UUID) - Primary identifier
- `job_read_token_hash`: String (SHA-256) - Hashed token for access control
- `status`: String enum (queued | running | completed | failed) - Current state
- `created_at`: String (ISO timestamp) - Creation time
- `completed_at`: String (ISO timestamp, nullable) - Completion time
- `expires_at`: Number (Unix timestamp) - TTL for auto-cleanup (7 days)
- `request_context`: JSON (conference, topic, user_session_id) - Original request
- `vendor_assignment`: JSON (manager_vendor, worker_vendor) - LLM vendor assignment
- `error`: String (nullable) - Error message if failed

**Relationships:**
- One-to-many with `decision_events_by_job` (job_id)
- One-to-many with `scratch_artifacts` (job_id)
- One-to-one with `generation_metrics` summary (job_id)

## Decision Event

**Purpose:** Append-only event stream capturing all agent actions for workflow reconstruction and analytics.

**Storage Pattern:** Two-table pattern for optimal idempotency and chronological queries:
- `decision_events_by_job`: PK=job_id, SK=seq_ts_type (format: `{zero_padded_seq}#{timestamp}#{event_type}`) - Seq-first for deterministic ordering
- `decision_event_ids`: PK=event_id (for uniqueness/idempotency check)

**Key Attributes:**
- `job_id`: String (UUID) - Partition key (in decision_events_by_job)
- `seq_ts_type`: String - Sort key (format: `{zero_padded_seq}#{timestamp}#{event_type}`, e.g., "0000000123#2026-01-12T10:30:15.123Z#tool_called")
- `event_id`: String (SHA-256 hash) - **Idempotency key (deterministic, stable across retries)** - Format: `sha256(execution_id|state_name|iteration|event_type|job_id|actor|sub_worker_instance_id|stable_action_id)` (delimiter-separated to avoid ambiguity)
- `event_type`: String (strict enum) - Type of event (13 values: manager_goal_formulated, manager_goal_sanitized, tool_called, sub_worker_spawned, artifact_created, artifact_consumed, manager_rejected, manager_accepted, evaluator_assessed, timeout_occurred, cost_guardrail_triggered, iteration_completed, artifact_circular_dependency_detected)
- `actor`: String (strict enum) - Agent that performed action (manager, worker, sub_worker, evaluator, system)
- `seq`: Integer - Sequence number (first-class attribute, actual sequence number, e.g., 123)
- `seq_padded`: String (optional) - Zero-padded seq (e.g., "0000000123", can derive from seq)
- `timestamp`: String (ISO datetime) - Stored as attribute for display
- `execution_id`: String (optional) - Step Functions execution ID
- `state_name`: String (optional) - Step Functions state name
- `iteration`: Integer (optional, 0-4) - Iteration number
- `sub_worker_instance_id`: String (optional) - Sub-worker instance ID
- `summary`: String - Human-readable summary (max 500 chars, always required)
- `rationale_summary`: String (max 200 chars, optional)
- `inputs_summary`: String (max 200 chars, optional)
- `outputs_summary`: String (max 200 chars, optional)
- `evidence_pointers`: Array of strings (max 10 pointers, format: `{type}:{identifier}`, e.g., `artifact:job-123#task-456#v0001`, `source:source-1`, `tool:tool-inv-789`, `event:event-id`)
- `details`: JSON - Full event details or truncated summary (max 10KB in-table, S3 overflow if larger)
- `details_hash`: String (SHA-256 hash of canonical JSON, always present) - For integrity verification
- `details_truncated`: Boolean (always required) - True if details > 10KB
- `s3_details_ref`: String (S3 key, optional) - Only if details_truncated=true, format: `decision-events/{job_id}/{event_id}/details.json`
- `created_at`: String (ISO datetime) - When event was written

**Idempotency:** Atomic writes via `TransactWriteItems` to both tables. If `event_id` already exists in `decision_event_ids`, return existing event from `decision_events_by_job`.

**Relationships:**
- Many-to-one with `Job` (job_id)

## Generation Metrics

**Purpose:** Job-level aggregated metrics for analytics and dashboard queries.

**Key Attributes:**
- `job_id`: String (UUID) - Partition key - **Canonical ID name everywhere (avoid "generation_id == job_id" confusion)**
- `record_type#timestamp`: String - Sort key ("summary#..." or "iteration#N#...")
- `timestamp`: String (ISO 8601 with Z) - First-class attribute, always present, used for GSI1 sort key
- `date_partition`: String (YYYY-MM-DD) - GSI partition key for time-series queries
- All job metadata, vendor assignments, performance metrics, results

**GSI1 (Time-Series):** `date_partition` (String, YYYY-MM-DD) + `timestamp` (String, ISO datetime, pure time ordering)  
**GSI2 (Summary Aggregation):** `date_partition` (String, YYYY-MM-DD) + `record_type#timestamp` (String, e.g., "summary#2026-01-12T10:31:27Z") for nightly aggregation (summary records only)

**Record Types:**
- `summary`: Final job summary (written once per job on completion)
- `iteration`: Per-iteration snapshot (written once per iteration, 0-4 iterations)
- `event`: Significant events (optional, for detailed timeline reconstruction)

**Relationships:**
- One-to-one with `Job` (job_id)
- Aggregated into `daily_metrics` via nightly Lambda (uses GSI2 to query summary records only)

## Scratch Artifact

**Purpose:** Stores artifacts produced by sub-workers and workers for workflow reconstruction.

**Key Attributes:**
- `job_id`: String (UUID) - Partition key
- `task_id#artifact_version`: String - Sort key (e.g., "cfp_extract#v0001")
- Standard envelope structure: meta, data, quality_signals, provenance, overflow, execution

**Relationships:**
- Many-to-one with `Job` (job_id)
- Referenced by `generation_metrics` (scratch_artifacts array)

**Artifact Envelope Schema:**

Canonical schema defined in `packages/shared/artifact-schemas/artifact-envelope.schema.json`:

```json
{
  "meta": {
    "artifact_id": "string (required)",
    "job_id": "string (UUID, required)",
    "iteration": "number (0-4, required)",
    "parent_task_id": "string (required)",
    "task_id": "string (required)",
    "worker_id": "string (required)",
    "worker_vendor": "string (openai|anthropic, required)",
    "worker_model": "string (required)",
    "artifact_type": "string (style_profile|evidence_bundle|draft_candidates|review_feedback, required)",
    "artifact_version": "string (v0001|v0002|..., required, zero-padded to 4 digits)",
    "schema_version": "string (1.0, required)",
    "spawned_at": "string (ISO timestamp, required)",
    "completed_at": "string (ISO timestamp, required)",
    "status": "string (completed|failed|timeout, required)"
  },
  "data": {
    "type": "object",
    "description": "Artifact-specific data (summary if >350KB, full payload in S3)"
  },
  "quality_signals": {
    "confidence": "number (0-1, required)",
    "coverage": "string (comprehensive|moderate|limited, required)",
    "validation_passed": "boolean (required)"
  },
  "provenance": {
    "sources": ["array of external source references (required, non-empty)"],
    "claims": ["array of claim objects (required, at least one)"],
    "tool_calls": ["array of tool call objects (required)"],
    "inputs": "object (required)",
    "upstream_artifacts": [
      {
        "artifact_id": "string (format: job_id#task_id#v0001, required)",
        "reason": "string (required)",
        "pointers": ["array of evidence pointers (optional)"]
      }
    ]
  },
  "overflow": {
    "s3_payload_ref": "string (S3 key, optional)",
    "s3_tool_results_ref": "string (S3 key, optional)",
    "payload_sha256": "string (optional)",
    "payload_size_bytes": "number (required)"
  },
  "execution": {
    "tokens_used": "number (required)",
    "execution_time_ms": "number (required)",
    "model": "string (required)",
    "error": "string (nullable)"
  }
}
```

**Required Fields Enforcement:**
- Runtime validation via Pydantic (Python) or AJV (Node.js)
- All required fields must be present or validation fails
- Invalid artifacts trigger fallback strategy (same as timeout)

## Conference Data

**Purpose:** Stores conference rules and example abstracts for agent reference.

**Key Attributes:**
- `conference`: String (kubecon | black_hat | reinvent | gartner_symposium | google_cloud_next)
- `data_type`: String (rules | abstract_example#<example_id>)
- Conference-specific requirements, tone guidelines, example abstracts

**Supported Conferences (5):**

| Conference | Focus | Audience |
|------------|-------|----------|
| `kubecon` | Cloud-native, Kubernetes, containers | Platform engineers, SREs, DevOps |
| `black_hat` | Security research, exploits, vulnerabilities | Security researchers, pen testers |
| `reinvent` | AWS cloud services, architecture | Cloud architects, developers |
| `gartner_symposium` | Executive strategy, digital transformation | CIOs, CTOs, IT executives |
| `google_cloud_next` | GCP services, Gemini AI, Vertex AI | Cloud architects, ML engineers |

**Data Population:** 205 total items (5 rules entries + 200 abstract examples)

**Relationships:**
- Referenced by sub-workers via DynamoDB lookups

## Topic Catalog (Generic)

**Purpose:** Generic topic metadata aligned to frontend selection; used for prompt/context and future validation.

**Key Attributes:**
- `pk`: `topic_generic`
- `sk`: `topic_id` (ai_ml_genai | security_zero_trust | cloud_arch_infra | k8s_containers | platform_devops | networking_mesh | data_analytics | leadership_governance)
- `topic_name`: Human-friendly label
- `summary`, `keywords[]`, `example_focus`, `dos`, `donts`

**Relationships:**
- Referenced by Worker/Manager prompts and potential validators/red-team tools.

## Abstract Search Index (SQLite FTS)

**Purpose:** Keyword search over conference example abstracts (title + abstract + metadata).

**Storage Pattern:**
- SQLite DB with FTS5 table; packaged with Lambda or downloaded from S3.
- Source data: `til-conference-data` abstract examples (title, abstract, conference, track if present, year).

**Access Pattern:**
- API Gateway → Lambda → SQLite query; returns top N matches with score and metadata.
- Optional filters: conference, track, year; limit default 5.

**Relationships:**
- Used by Worker tool `search_abstracts`; complements DynamoDB lookup (rules/examples) for keyword/topic retrieval.

---
