# Conference Abstract Builder - Product Requirements Document (PRD)
## Part 2 of 3: Functional & Non-Functional Requirements

**Product Name:** Conference Abstract Builder  
**Version:** 1.0  
**Document:** Part 2 of 3

---

## Table of Contents

**Part 2 (This Document):**
- Epic 4: Cost Management & Guardrails
- Epic 5: Analytics Dashboard
- Epic 6: Data Management
- Non-Functional Requirements
- Technical Architecture Requirements

---

## Epic 4: Cost Management & Guardrails

### Story 4.1: Per-Job Budget Tracking

**As the** system  
**I need** to track spending per job  
**So that** costs don't exceed acceptable thresholds

**Acceptance Criteria:**

**DynamoDB job_budgets Table:**
- [ ] Table created with partition key: job_id
- [ ] Fields:
  - [ ] job_id (UUID)
  - [ ] web_search_count (number, starts at 0)
  - [ ] web_search_limit (number, default 10)
  - [ ] estimated_cost_usd (running total)
  - [ ] minimal_mode_activated (boolean, default false)
  - [ ] tokens_used (running total)
  - [ ] created_at (ISO timestamp)
  - [ ] updated_at (ISO timestamp)

**Budget Initialization:**
- [ ] When job starts, create job_budgets entry
- [ ] Set web_search_limit = 10 (normal mode)
- [ ] Set estimated_cost_usd = 0
- [ ] Set minimal_mode_activated = false

**Budget Updates:**
- [ ] After each LLM call: increment estimated_cost_usd, tokens_used
- [ ] After each web search: increment web_search_count (atomic operation)
- [ ] **If estimated_cost_usd > $5**: Budget service activates minimal mode:
  - [ ] Set minimal_mode_activated = true
  - [ ] Set web_search_limit = 2
  - [ ] Emit cost_guardrail_triggered decision event
  - [ ] Manager and Worker consume this state (do not manage it)

**Minimal Tool Mode Definition (Concrete):**
- [ ] Minimal tool mode = **2 web searches TOTAL per job** (across all sub-workers, all iterations)
- [ ] web_search_count tracks cumulative searches across entire job lifecycle
- [ ] Budget enforcement is job-scoped, not iteration-scoped
- [ ] **Budget service activates; Manager/Worker consume the constraint**

---

### Story 4.2: Minimal Tool Mode Enforcement

**As the** system  
**I need** to enforce budget limits mechanically in tool wrappers  
**So that** models cannot exceed budgets even if they try

**Acceptance Criteria:**

**Web Search Tool Wrapper Logic:**
```python
def web_search(job_id, query, sub_worker_id):
    # Check budget BEFORE calling API
    job_budget = get_job_budget(job_id)
    
    if job_budget.web_search_count >= job_budget.web_search_limit:
        return {
            "status": "budget_exhausted",
            "error": "Web search budget exhausted for this job",
            "searches_used": job_budget.web_search_count,
            "limit": job_budget.web_search_limit,
            "suggestion": "Use DynamoDB conference data instead"
        }
    
    # Increment counter (atomic) BEFORE calling API
    # NOTE: Failed API calls still count toward budget (by design for cost protection)
    increment_search_count(job_id)
    
    try:
        # Call actual search API
        results = call_search_api(query)
        
        return {
            "status": "success",
            "results": results,
            "searches_remaining": job_budget.web_search_limit - job_budget.web_search_count
        }
    except APIError as e:
        # Search failed but counter already incremented (acceptable for budget protection)
        log_event({
            "event_type": "tool_call_failed",
            "tool": "web_search",
            "job_id": job_id,
            "error": str(e),
            "note": "Search counted toward budget despite failure"
        })
        return {
            "status": "error",
            "error": str(e),
            "searches_remaining": job_budget.web_search_limit - job_budget.web_search_count
        }
```

**Enforcement Rules:**
- [ ] Budget check happens in Lambda tool wrapper, NOT in model compliance
- [ ] DynamoDB atomic increment prevents race conditions
- [ ] **Counter incremented BEFORE API call** (failed searches still count - documented behavior for cost protection)
- [ ] Structured error response (not exception) so Worker can adapt
- [ ] Worker prompt includes budget context: "Web searches remaining: {count}"

**Minimal Tool Mode Trigger:**
- [ ] When estimated_cost > $5, **budget service** (not Manager) sets minimal_mode_activated = true
- [ ] Budget service updates web_search_limit from 10 to 2
- [ ] Budget service emits cost_guardrail_triggered decision event
- [ ] Worker notified via context: "Minimal tool mode active. Limit: 2 web searches total for this job."
- [ ] Worker must adapt strategy (use DynamoDB, be conservative)

**Concrete Definition:**
- [ ] Minimal tool mode = 2 web searches TOTAL per job (across all sub-workers, all iterations)
- [ ] Job-scoped limit, not iteration-scoped

---

### Story 4.3: Global Cost Protection

**As the** system administrator  
**I need** global spending controls  
**So that** total costs don't exceed budget

**Acceptance Criteria:**

**Provider-Level Spending Caps:**
- [ ] OpenAI API key has spending cap: $100/month
- [ ] Anthropic API key has spending cap: $100/month
- [ ] Configured in provider dashboards

**Daily Cost Monitoring:**
- [ ] CloudWatch alarm: Daily cost > $20
- [ ] Alarm triggers SNS notification to admin
- [ ] Alarm triggers Lambda to flip Parameter Store flag: /conference-abstract/system-enabled = false
- [ ] System checks flag at job start; if false, return "System temporarily unavailable for maintenance"
- [ ] Auto-resume next day (or manual override via Parameter Store)

**Global Kill Switch:**
- [ ] Parameter Store flag: /conference-abstract/system-enabled (boolean)
- [ ] Manager Lambda checks flag before starting job
- [ ] If false: Return graceful message to user
- [ ] Dashboard shows system status (enabled/disabled)
- [ ] Can be flipped manually for instant system pause

**API Gateway Rate Limiting:**
- [ ] Usage plan: 100 requests/minute per IP
- [ ] Burst limit: 200 requests
- [ ] Quota: 10,000 requests per day per IP
- [ ] Throttled requests return HTTP 429 with Retry-After header

**Lambda Concurrency Limits:**
- [ ] Manager Lambda: Reserved concurrency = 10
- [ ] Worker Lambda: Reserved concurrency = 20
- [ ] Sub-worker Lambdas: Share remaining account concurrency
- [ ] Evaluator Lambda: Reserved concurrency = 5

---

## Epic 5: Analytics Dashboard (Primary Product)

### Story 5.1: Dashboard Landing Page (Executive Overview)

**As an** AI developer  
**I want** a high-level overview of system performance  
**So that** I can quickly understand key metrics

**Acceptance Criteria:**

**Executive Overview Metrics:**
- [ ] Total generations completed (number)
- [ ] Overall acceptance rate (percentage + pie chart)
  - [ ] Accept (green)
  - [ ] Would submit with edits (yellow)
  - [ ] Would not submit (orange)
  - [ ] Reject (red)
- [ ] Most popular conference/topic combinations (top 5 table)
- [ ] Average generation time (seconds)
- [ ] Total cost and token usage (running totals)

**Acceptance Rate Trend Chart:**
- [ ] Line chart: Acceptance rate over time (last 30 days or all time)
- [ ] X-axis: Date
- [ ] Y-axis: Percentage
- [ ] Separate lines: Accept, "Would submit with edits", Combined

**Vendor Performance Summary:**
- [ ] 2x2 comparison table:
  - [ ] OpenAI as Manager: Acceptance rate, avg iterations
  - [ ] Anthropic as Manager: Acceptance rate, avg iterations
  - [ ] OpenAI as Worker: Acceptance rate, sub-worker spawn rate
  - [ ] Anthropic as Worker: Acceptance rate, sub-worker spawn rate

**Sub-Worker Usage Frequency:**
- [ ] Bar chart: Count of times each sub-worker type spawned
- [ ] Bars: CFP Extractor, Evidence Researcher, Draft Generator, Red Team Reviewer

---

### Story 5.2: Agentic Behavior Analysis Dashboard

**As an** AI developer  
**I want** detailed analysis of tool usage and sub-worker patterns  
**So that** I can understand autonomous decision-making

**Acceptance Criteria:**

**Tool Usage Heatmap:**
- [ ] 2D heatmap visualization
- [ ] X-axis: Tool types (DynamoDB Lookup, Web Search)
- [ ] Y-axis: Vendor-Role combinations (OpenAI-Worker, Anthropic-Worker, OpenAI-Manager, Anthropic-Manager)
- [ ] Color intensity: Frequency of tool usage (darker = more frequent)
- [ ] Hover: Exact count and percentage

**Sub-Worker Orchestration Sunburst Chart:**
- [ ] Center: Main Worker
- [ ] Inner ring: Sub-worker types spawned
- [ ] Outer ring: Parallel vs. Sequential execution
- [ ] Size: Frequency of pattern
- [ ] Color: Acceptance rate correlation (green = high, red = low)
- [ ] Click: Drill down to individual job examples

**Tool Call Sequence Sankey Diagram:**
- [ ] Flow visualization showing: Worker decision → Tools called → Sub-workers spawned → Outcome
- [ ] Thickness: Frequency of path
- [ ] Color: Success rate (green = accepted, red = rejected)
- [ ] Interactive: Click path to see examples

**Task Decomposition Analysis:**
- [ ] Table showing orchestration patterns:
  - [ ] Pattern name (e.g., "Parallel CFP + Evidence")
  - [ ] Frequency count
  - [ ] Acceptance rate
  - [ ] Avg tokens used
  - [ ] Avg time saved vs. sequential
- [ ] Sort by: Frequency, Acceptance rate, Efficiency

**Autonomous Decision Quality Scores:**
- [ ] Manual expert review scores (1-5) for sample decisions:
  - [ ] Tool selection appropriateness
  - [ ] Sub-worker spawn timing
  - [ ] Strategy adaptation on retries
  - [ ] Cost-consciousness
- [ ] Aggregate scores by vendor

---

### Story 5.3: Vendor Comparison Dashboard

**As an** AI developer  
**I want** side-by-side vendor comparison metrics  
**So that** I can make informed vendor selection decisions

**Acceptance Criteria:**

**Manager Effectiveness Comparison:**
- [ ] Side-by-side table:
  
  | Metric | OpenAI as Manager | Anthropic as Manager |
  |--------|-------------------|---------------------|
  | Acceptance rate | X% | Y% |
  | Avg iterations before accept | X.X | Y.Y |
  | Feedback quality score | X.X/5 | Y.Y/5 |
  | Citation specificity | X% | Y% |
  | Evaluator agreement rate | X% | Y% |
  | Sample size | N | N |

- [ ] Bar chart: Acceptance rate by vendor (with confidence intervals if N>50)
- [ ] Scatter plot: Iterations required × Acceptance rate (color by vendor)

**Worker Effectiveness Comparison:**
- [ ] Side-by-side table:
  
  | Metric | OpenAI as Worker | Anthropic as Worker |
  |--------|------------------|---------------------|
  | Acceptance rate | X% | Y% |
  | Avg sub-workers spawned | X.X | Y.Y |
  | Parallel execution rate | X% | Y% |
  | Tool diversity (unique tools) | X | Y |
  | Avg tokens used | X,XXX | Y,YYY |
  | Sample size | N | N |

- [ ] Grouped bar chart: Sub-worker spawn frequency by vendor
- [ ] Radar chart: Tool usage patterns (DynamoDB vs. Web Search balance)

**Cross-Role Analysis:**
- [ ] 2x2 matrix showing acceptance rates:
  - [ ] OpenAI-Manager + Anthropic-Worker: X%
  - [ ] Anthropic-Manager + OpenAI-Worker: Y%
  - [ ] OpenAI-Manager + OpenAI-Worker: Z% (edge case, should be rare)
  - [ ] Anthropic-Manager + Anthropic-Worker: W% (edge case)
- [ ] Sample sizes for each combination
- [ ] Best and worst combinations highlighted

**Statistical Significance Indicators:**
- [ ] Show confidence intervals when sample size >50 (if feasible to compute)
- [ ] Flag differences <5% as "Small difference - may not be significant"
- [ ] Display sample sizes prominently for all comparisons
- [ ] Add "insufficient data" labels when N <20 for a comparison
- [ ] **Optional/Future**: Calculate and display p-values for key comparisons (not required for MVP)
- [ ] Focus: Clear data presentation with caveats, not rigorous statistical testing

**Design Principle:**
- [ ] Prioritize shipping insights over statistical rigor
- [ ] Let data speak for itself with appropriate caveats
- [ ] Avoid building complex stats infrastructure for MVP

---

### Story 5.4: Sub-Worker Deep Dive Dashboard

**As an** AI developer  
**I want** detailed metrics on sub-worker effectiveness  
**So that** I can understand task decomposition patterns

**Acceptance Criteria:**

**Artifact Quality Analysis:**
- [ ] Table per sub-worker type:
  
  **CFP/Style Extractor:**
  | Metric | Value |
  |--------|-------|
  | Avg confidence score | X.XX |
  | Avg examples analyzed | XX |
  | Coverage: Comprehensive | X% |
  | Timeout rate | X% |
  | Acceptance correlation | +X.XX |
  
  **Evidence Researcher:**
  | Metric | Value |
  |--------|-------|
  | Avg confidence score | X.XX |
  | Avg sources per bundle | XX |
  | Web searches per run | X.X |
  | Timeout rate | X% |
  | Acceptance correlation | +X.XX |
  
  **Draft Generator:**
  | Metric | Value |
  |--------|-------|
  | Avg candidates generated | X.X |
  | Avg confidence score | X.XX |
  | Style alignment avg | X.XX |
  | Timeout rate | X% |
  | Acceptance correlation | +X.XX |
  
  **Red Team Reviewer:**
  | Metric | Value |
  |--------|-------|
  | Avg issues found | X.X |
  | Hallucination catch rate | X% |
  | False positive rate | X% |
  | Timeout rate | X% |
  | Effectiveness score | X.XX/5 |

**Coordination Effectiveness:**
- [ ] Parallel execution time savings chart:
  - [ ] X-axis: Pattern type
  - [ ] Y-axis: Time saved (seconds)
  - [ ] Bars: Avg time saved vs. sequential
- [ ] Artifact dependency graph examples (visual tree)
- [ ] Bottleneck identification: Which sub-workers delay most often

**Cost-Benefit Analysis:**
- [ ] Table showing ROI per sub-worker:
  
  | Sub-Worker | Avg Tokens | Avg Cost | Acceptance Lift | ROI Score |
  |------------|------------|----------|-----------------|-----------|
  | CFP Extractor | XXX | $X.XX | +X% | X.XX |
  | Evidence Researcher | XXX | $X.XX | +X% | X.XX |
  | Draft Generator | XXX | $X.XX | +X% | X.XX |
  | Red Team Reviewer | XXX | $X.XX | +X% | X.XX |

- [ ] "When NOT spawning sub-workers worked better" analysis (counter-intuitive findings)

---

### Story 5.5: Evaluator Analysis Dashboard

**As an** AI developer  
**I want** to understand Evaluator accuracy and patterns  
**So that** I can assess blind evaluation effectiveness

**Acceptance Criteria:**

**Accuracy Metrics:**
- [ ] Top-1 conference match rate: X% (target >50%)
- [ ] Top-3 conference match rate: X% (target >70%)
- [ ] Confusion matrix:
  
  |  | Predicted: Black Hat | Predicted: re:Invent | Predicted: KubeCon |
  |---|---------------------|---------------------|-------------------|
  | **Actual: Black Hat** | XX | XX | XX |
  | **Actual: re:Invent** | XX | XX | XX |
  | **Actual: KubeCon** | XX | XX | XX |

**Confidence Calibration:**
- [ ] Scatter plot: Confidence score (X) × Actual match (Y)
- [ ] Calibration curve: Are 80% confidence predictions correct 80% of the time?
- [ ] Confidence distribution histogram

**Disagreement Patterns:**
- [ ] Table: When Evaluator disagrees with target conference:
  
  | Target | Evaluator Pick | Frequency | Manager Override Rate |
  |--------|----------------|-----------|----------------------|
  | Black Hat | re:Invent | XX | XX% |
  | re:Invent | KubeCon | XX | XX% |
  | ... | ... | ... | ... |

- [ ] Analysis: Does Manager trust Evaluator or override often?
- [ ] Correlation: Evaluator confidence × Manager acceptance rate

**Performance Metrics:**
- [ ] Response time distribution histogram (target <60 seconds)
- [ ] Timeout frequency: X% (target <5%)
- [ ] Reasoning quality (sample review): X.X/5

---

### Story 5.6: System Performance Dashboard

**As a** system administrator  
**I want** operational metrics and health indicators  
**So that** I can monitor system reliability and costs

**Acceptance Criteria:**

**Timing Analysis:**
- [ ] End-to-end generation time:
  - [ ] p50: X seconds
  - [ ] p90: X seconds
  - [ ] p99: X seconds
- [ ] Breakdown by stage (stacked bar chart):
  - [ ] Manager goal formulation
  - [ ] Worker execution planning
  - [ ] Sub-worker execution (parallel)
  - [ ] Tool calls
  - [ ] Evaluator wait
  - [ ] Manager evaluation
- [ ] Lambda cold start impact chart (first request vs. warm)

**Cost Analysis:**
- [ ] Total token usage trends (line chart over time)
- [ ] Cost per generation by vendor combination (box plot)
- [ ] Tool call costs breakdown:
  - [ ] DynamoDB: $X (minimal)
  - [ ] Web search: $X (primary external cost)
  - [ ] LLM API: $X (primary cost)
- [ ] Sub-worker token efficiency (tokens per acceptance)
- [ ] Cost guardrail effectiveness:
  - [ ] How often triggered: X%
  - [ ] Impact on quality (acceptance rate when triggered vs. normal)

**Reliability:**
- [ ] Success rate by component (gauges):
  - [ ] Manager: XX%
  - [ ] Worker: XX%
  - [ ] Sub-workers (aggregate): XX%
  - [ ] Evaluator: XX%
- [ ] Failure patterns table (top 5 failure types with counts)
- [ ] Timeout analysis:
  - [ ] Sub-worker timeouts: X%
  - [ ] Evaluator timeouts: X%
  - [ ] Fallback strategy success: X%
- [ ] Retry frequency histogram

**Health Indicators:**
- [ ] Current system status: Enabled / Disabled (green / red)
- [ ] Daily cost progress bar (current / $20 limit)
- [ ] API rate limit usage (current / limit)
- [ ] Lambda concurrency usage (current / reserved)

---

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

## Non-Functional Requirements

### NFR-1: Performance

**Target Metrics:**
- [ ] End-to-end generation time: <2 minutes (p50), <5 minutes (p99)
- [ ] API response time (non-generation): <500ms (p95)
- [ ] Dashboard load time: <3 seconds (p95)
- [ ] Real-time workflow updates: <2 second latency
- [ ] Concurrent users supported: 10+ simultaneous generations

**Acceptance Criteria:**
- [ ] Load testing validates 10 concurrent generation requests complete successfully
- [ ] Cold start impact on first request acceptable (<10 seconds with clear progress messages)
- [ ] WebSocket connections stable for duration of generation (with fallback to polling)
- [ ] Dashboard queries complete in <2 seconds for aggregated data

---

### NFR-2: Reliability

**Target Metrics:**
- [ ] System uptime: 99% (excludes planned maintenance)
- [ ] Job completion rate: 95% (including fallback strategies)
- [ ] Data persistence: 100% (no data loss)
- [ ] Idempotency: 100% (retries never create duplicates)

**Acceptance Criteria:**
- [ ] All Lambda functions have retry logic with exponential backoff
- [ ] All DynamoDB writes are idempotent (ConditionExpression enforced)
- [ ] Sub-worker timeouts trigger deterministic fallbacks (100% of time)
- [ ] Evaluator timeouts allow graceful degradation (Manager proceeds)
- [ ] Global kill switch can pause system in <30 seconds
- [ ] System recovers automatically from transient API failures

---

### NFR-3: Scalability

**Target Metrics:**
- [ ] Support 500 generations/day at launch
- [ ] Scale to 2,000 generations/day within 3 months
- [ ] DynamoDB read/write capacity: On-Demand (auto-scaling)
- [ ] Lambda concurrency: Configurable reservations

**Acceptance Criteria:**
- [ ] DynamoDB On-Demand pricing handles variable load
- [ ] Lambda reserved concurrency prevents account-level throttling
- [ ] S3 Intelligent-Tiering optimizes storage costs as volume grows
- [ ] API Gateway rate limits prevent abuse (100 req/min per IP)
- [ ] Cost monitoring alerts at 80% of daily budget ($20)

---

### NFR-4: Security

**Security Model (Three-Layer):**

**1. API Key (Coarse Protection)**
- [ ] Protects entire service from casual abuse
- [ ] API Gateway requires x-api-key header for all requests
- [ ] Single key for MVP (rotate manually)
- [ ] Prevents automated scraping/abuse

**2. job_read_token (Capability-Based)**
- [ ] Protects job data from enumeration attacks
- [ ] Generated per job (random UUID)
- [ ] Required for: /status, /workflow, /feedback
- [ ] 7-day TTL (expires_at in jobs table)
- [ ] **Preferred transport: Authorization: Bearer {token}** (prevents log leakage)
- [ ] Query param allowed for dev/testing only (leaks into logs, analytics, referrers)

**3. No User Authentication**
- [ ] Anonymous usage (acceptable for MVP)
- [ ] No user accounts, login, or session management
- [ ] User identified by user_session_id (optional, client-generated UUID)

**Token Transport Best Practices:**
```
# Preferred (Production)
Authorization: Bearer a7f3c8e9d2b1...

# Acceptable (Dev/Testing)
?token=a7f3c8e9d2b1...
```

**Rationale:**
- Query params appear in server logs, CloudWatch, referrer headers
- Authorization header is more secure, doesn't leak

**Authentication & Authorization:**
- [ ] No user authentication required (anonymous usage)
- [ ] API Gateway API key for basic protection
- [ ] CloudFront for DDoS protection

**Data Protection:**
- [ ] All data in transit: HTTPS/TLS 1.2+
- [ ] All data at rest: Encrypted (AWS managed keys)
- [ ] API keys: Parameter Store with KMS encryption
- [ ] IAM roles: Least privilege principle enforced
- [ ] No PII intentionally collected
- [ ] Incidental PII from tool outputs: Sanitized in UI (emails/phones redacted)

**Acceptance Criteria:**
- [ ] All API endpoints require HTTPS
- [ ] API keys never logged or exposed
- [ ] Lambda functions have minimal IAM permissions
- [ ] S3 buckets are private (no public read)
- [ ] CloudWatch logs do not contain API keys or sensitive data
- [ ] UI redacts common PII patterns (regex for emails, phones)

---

### NFR-5: Observability

**Logging:**
- [ ] Structured JSON logs in CloudWatch (operational)
- [ ] Decision events in decision_events table (product analytics, append-only event stream)
- [ ] Clear separation: debugging vs. analytics
- [ ] Log retention: 30 days (CloudWatch), indefinite (decision_events table)

**Three-Table Architecture:**
- [ ] decision_events = append-only event stream (workflow reconstruction)
- [ ] generation_metrics = per-job summary + iteration rows (analytics)
- [ ] daily_metrics = nightly aggregates (dashboard)

**Monitoring:**
- [ ] CloudWatch dashboards for operational metrics
- [ ] Custom metrics: tokens, cost, acceptance rate, timeouts
- [ ] CloudWatch alarms: Error rates, cost thresholds, timeouts
- [ ] X-Ray tracing enabled for all Lambdas (distributed tracing)

**Acceptance Criteria:**
- [ ] All Lambda errors trigger CloudWatch alarms
- [ ] Daily cost exceeding $20 triggers alarm and auto-disable
- [ ] Dashboard metrics update within 5 minutes of generation completion
- [ ] X-Ray traces show complete request flow (Manager → Worker → Sub-workers → Evaluator)
- [ ] Operational logs queryable via CloudWatch Insights
- [ ] Decision events queryable via DynamoDB

---

### NFR-6: Maintainability

**Code Quality:**
- [ ] Modular Lambda functions (single responsibility)
- [ ] Shared libraries for: schema validation, DynamoDB access, S3 access, decision event logging
- [ ] Infrastructure as Code: AWS CDK or Terraform
- [ ] Monorepo structure with clear organization

**Testing:**
- [ ] Unit tests: 80% coverage for business logic
- [ ] Integration tests: All agent interactions
- [ ] Contract tests: All artifact schemas
- [ ] Load tests: 10+ concurrent users

**Documentation:**
- [ ] README: Setup, deployment, architecture overview
- [ ] API documentation: All endpoints, request/response schemas
- [ ] Runbook: Common issues, debugging steps, cost monitoring
- [ ] Architecture diagrams: System overview, data flow, agent interaction

**Acceptance Criteria:**
- [ ] New developer can set up local environment in <30 minutes
- [ ] Deployment via single command: `cdk deploy` or `terraform apply`
- [ ] All PRs require passing tests
- [ ] Code reviews required for all changes

---

## Technical Architecture Requirements

### ARCH-1: Orchestration Control Flow (CRITICAL)

**Requirement:**
- [ ] **Step Functions orchestrates the job state machine** (Manager → Worker → Evaluator → Manager)
- [ ] **EventBridge used ONLY for**: Decision event emissions (observability), Async Evaluator request trigger
- [ ] EventBridge is NOT used for primary job flow orchestration

**Rationale:** Prevents "two captains" problem where both Step Functions and EventBridge try to control flow, creating debugging nightmares.

**Acceptance Criteria:**
- [ ] Step Functions state machine defined with explicit states:
  - [ ] Start → Manager Goal Formulation
  - [ ] Manager Goal Formulation → Worker Execution
  - [ ] Worker Execution → Evaluator Request (async via SNS)
  - [ ] Evaluator Request → Wait for Response (1 min timeout, polling generation_metrics)
  - [ ] Evaluator Response → Manager Evaluation
  - [ ] Manager Evaluation → Decision (Accept/Reject)
  - [ ] If Reject + iterations <5: Loop to Worker Execution (increment creativity)
  - [ ] If Accept or iterations ==5: End
- [ ] **EventBridge rules defined ONLY for**:
  - [ ] Decision events emission (tool_called, sub_worker_spawned, etc.) → decision_events table
  - [ ] NOT used for Evaluator trigger (Step Functions → SNS directly is simpler)
- [ ] No EventBridge rules for Manager → Worker or Worker → Evaluator flow

**Evaluator Async Pattern:**
- [ ] Step Functions → SNS topic directly (no EventBridge for trigger)
- [ ] SNS → SQS → Evaluator Lambda
- [ ] Evaluator writes to generation_metrics (record_type = "evaluator")
- [ ] Step Functions polls generation_metrics for result (every 3s, up to 60s)

**Rationale:** Direct SNS trigger from Step Functions is simpler than adding EventBridge layer for Evaluator. EventBridge reserved for decision event emission only.

---

### ARCH-2: Vendor Assignment

**Requirement:**
- [ ] 50/50 randomized split between OpenAI and Anthropic for Manager/Worker roles
- [ ] Manager and Worker must be opposite vendors
- [ ] Assignment happens at job start, before any LLM calls
- [ ] Assignment logged for analytics

**Logic:**
```python
def assign_vendors(job_id):
    # True random (not seeded by job_id for even distribution)
    # NOTE: Random assignment, not balanced per-N-jobs
    # May result in streaks or uneven distribution in small samples
    manager_vendor = random.choice(["openai", "anthropic"])
    worker_vendor = "anthropic" if manager_vendor == "openai" else "openai"
    
    # Log assignment
    log_event({
        "event_type": "vendor_assignment",
        "job_id": job_id,
        "manager_vendor": manager_vendor,
        "worker_vendor": worker_vendor
    })
    
    return manager_vendor, worker_vendor
```

**Acceptance Criteria:**
- [ ] Assignment is truly random (not deterministic by user session)
- [ ] Over 100 generations, OpenAI as Manager: 45-55% (statistical expectation)
- [ ] Manager vendor ≠ Worker vendor (enforced)
- [ ] Dashboard tracks vendor split distribution and displays sample size
- [ ] **Caveat**: True random (not balanced), so small samples may show streaks
- [ ] Dashboard shows distribution with note: "Random assignment; see sample size for statistical confidence"

**Future Enhancement (Post-MVP):**
- [ ] Consider per-day or per-100 balancing if strict 50/50 required for science
- [ ] For MVP: Accept natural randomness, document in analytics

---

### ARCH-3: Sub-Worker Timeout Fallbacks (Deterministic)

**Requirement:** Every sub-worker timeout must have a deterministic fallback strategy

**Fallback Rules:**

1. **CFP/Style Extractor Timeout:**
   - [ ] Fallback: Use cached style template for conference
   - [ ] Template source: Pre-loaded baseline in DynamoDB
   - [ ] Artifact: style_profile_fallback_v1.json with source = "cached_template"

2. **Evidence Researcher Timeout:**
   - [ ] Fallback: Write "evidence unavailable" marker artifact
   - [ ] Worker constraint: Avoid numeric claims, no external citations
   - [ ] Artifact: evidence_bundle_unavailable_v1.json with status = "timeout"

3. **Draft Generator Timeout:**
   - [ ] Fallback: Worker generates one draft itself (no sub-worker)
   - [ ] Worker uses available artifacts (style + evidence if available)
   - [ ] Artifact: Generated by main Worker, not sub-worker

4. **Red Team Reviewer Timeout:**
   - [ ] Fallback: Worker runs lightweight self-check prompt (in-process)
   - [ ] Self-check questions: Claims without evidence? Tone appropriate? Hallucination risks?
   - [ ] Artifact: review_feedback_self_check_v1.json with source = "worker_self_check"

**Acceptance Criteria:**
- [ ] All fallback strategies implemented in Worker Lambda
- [ ] Timeout events logged with fallback strategy used
- [ ] Fallback artifacts clearly marked with fallback = true flag
- [ ] Dashboard tracks timeout frequency by sub-worker type
- [ ] Job always completes even if all sub-workers timeout

---

### ARCH-4: Concurrency & Rate Limiting

**Requirements:**

**API Gateway:**
- [ ] Usage plan: 100 requests/minute per IP
- [ ] Burst limit: 200 requests
- [ ] Daily quota: 10,000 requests per IP
- [ ] HTTP 429 response with Retry-After header when throttled

**Step Functions:**
- [ ] Max concurrent executions: 50
- [ ] Job queue (SQS) if limit reached:
  - [ ] API Gateway → Lambda (job-enqueue) → SQS queue
  - [ ] Lambda (sfn-worker) polls SQS, starts Step Functions executions
  - [ ] Processes FIFO with backpressure handling
  - [ ] Queue visibility timeout: 15 minutes (exceeds max job duration)
- [ ] Execution timeout: 10 minutes per job

**Job Queue Flow:**
```
User Request → API Gateway → POST /generate
  ↓
Lambda (job-enqueue):
  - Check Step Functions current executions
  - If < 50: Start Step Functions directly
  - If >= 50: Enqueue to SQS
  - Return 202 Accepted with job_id
  ↓
SQS Queue (job-queue)
  ↓
Lambda (sfn-worker) polls every 10 seconds:
  - Check Step Functions capacity
  - If available: Start execution for next job in queue
  - If still at limit: Leave message in queue
```

**Lambda:**
- [ ] Manager: Reserved concurrency = 10
- [ ] Worker: Reserved concurrency = 20
- [ ] Sub-workers: Share remaining concurrency
- [ ] Evaluator: Reserved concurrency = 5

**Acceptance Criteria:**
- [ ] Load test with 60 requests in 1 minute: 40 succeed immediately, 20 are throttled
- [ ] Throttled requests receive clear error message with retry guidance
- [ ] Step Functions queue handles backpressure gracefully
- [ ] Lambda concurrency limits prevent account-level throttling

---

## End of Part 2

**Continue to Part 3** for API Specifications, Data Models, Error Handling, and Implementation Roadmap.

---

**Document Navigation:**
- **Previous:** Part 1 - Overview, Goals & User Stories
- **Current:** Part 2 - Functional & Non-Functional Requirements
- **Next:** Part 3 - API Specs, Data Models & Implementation Roadmap