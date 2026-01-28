# Conference Abstract Builder - Product Requirements Document (PRD)
## Part 3 of 3: API Specs, Data Models & Implementation Roadmap

**Product Name:** Conference Abstract Builder  
**Version:** 1.0  
**Document:** Part 3 of 3 (Final)

---

## Table of Contents

**Part 3 (This Document):**
- API Specifications
- Data Models & Schemas
- Error Handling & Edge Cases
- Implementation Phases & Roadmap
- Success Metrics & Launch Criteria

---

## API Specifications

### API-1: Generate Abstract (POST /generate)

**Purpose:** Initiate abstract generation with selected conference and topic

**Endpoint:** `POST /api/v1/generate`

**Request:**
```json
{
  "conference": "black_hat | reinvent | kubecon",
  "topic": "genai | cybersecurity | containers | cloud | devops",
  "user_session_id": "uuid (optional, generated if not provided)"
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_read_token": "a7f3c8e9d2b1...",
  "status": "processing",
  "estimated_time_seconds": 90,
  "websocket_url": "wss://api.example.com/ws?job_id=550e8400...&token=a7f3c8e9d2b1..."
}
```

**Token Storage & Verification:**

**Table: jobs**
- [ ] **PK**: job_id (String, UUID)
- [ ] **Attributes**:
  - [ ] job_read_token_hash (String, SHA-256 hash of token)
  - [ ] created_at (String, ISO timestamp)
  - [ ] expires_at (Number, Unix timestamp - DynamoDB TTL)
  - [ ] request_context (JSON: conference, topic, user_session_id)
  - [ ] vendor_assignment (JSON: manager_vendor, worker_vendor)
- [ ] **DynamoDB TTL**: expires_at field (7 days from creation)

**Token Lifecycle:**
- [ ] job_read_token generated on job creation (random UUID)
- [ ] Hashed (SHA-256) and stored in jobs table
- [ ] Token valid for 7 days (configurable: 7-30 days for MVP)
- [ ] After expiry: DynamoDB TTL automatically deletes job record
- [ ] Expired token access: Returns 410 Gone (resource expired)

**Token Verification Flow:**
- [ ] /status, /workflow, /feedback first verify token:
  1. Lookup job_id in jobs table
  2. Hash provided token
  3. Compare with job_read_token_hash
  4. Check expires_at > current time
  5. If valid: Proceed with request
  6. If invalid/expired: Return 403 Forbidden or 410 Gone

**Security Note:**
- [ ] Lightweight capability-based access control (no user auth required)
- [ ] Token acts as capability URL - possession grants access
- [ ] Users should not share tokens publicly
- [ ] 7-day TTL balances usability with security

**Status Codes:**
- 202: Accepted, processing started
- 400: Bad request (invalid conference or topic)
- 429: Rate limited (too many requests)
- 503: System disabled (maintenance mode)

**Validation:**
- [ ] Conference must be in closed set: [black_hat, reinvent, kubecon]
- [ ] Topic must be in closed set: [genai, cybersecurity, containers, cloud, devops]
- [ ] **Rate limits (two layers):**
  - [ ] **Global API Gateway**: 100 requests/minute per IP (all endpoints)
  - [ ] **/generate endpoint-specific**: 10 generations/minute per IP (server-side guard)
  - [ ] Rationale: /generate is expensive; additional throttle protects against abuse
- [ ] Global kill switch check: system-enabled flag

---

### API-2: Get Job Status (GET /status/{job_id})

**Purpose:** Poll for job status (fallback if WebSocket unavailable)

**Endpoint:** `GET /api/v1/status/{job_id}?token={job_read_token}`

**Authentication:**
- [ ] Requires job_read_token (query param or Authorization header)
- [ ] Returns 403 if token missing or invalid

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing | completed | failed",
  "progress": {
    "current_stage": "worker_execution",
    "sub_workers_spawned": ["cfp_extractor", "evidence_researcher"],
    "iteration": 0,
    "estimated_remaining_seconds": 45
  },
  "vendor_assignment": {
    "manager": "openai",
    "worker": "anthropic"
  }
}
```

**If Completed:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "title": "Abstract title here",
    "abstract": "Full abstract text here",
    "iteration_selected": 2,
    "manager_vendor": "openai",
    "worker_vendor": "anthropic",
    "sub_workers_used": ["cfp_extractor", "evidence_researcher", "draft_generator", "red_team_reviewer"],
    "total_time_seconds": 87,
    "total_tokens": 12450,
    "estimated_cost_usd": 0.42
  }
}
```

**Status Codes:**
- 200: Success
- 404: Job not found
- 500: Internal error

---

### API-3: Submit Feedback (POST /feedback/{job_id})

**Purpose:** Record user acceptance/rejection and intent

**Endpoint:** `POST /api/v1/feedback/{job_id}?token={job_read_token}`

**Authentication:**
- [ ] Requires job_read_token (query param or Authorization header)
- [ ] Returns 403 if token missing or invalid

**Request:**
```json
{
  "accepted": true,
  "intent": "would_submit_with_edits | would_not_submit",
  "comment": "Optional feedback text (max 500 chars)"
}
```

**Response (200 OK):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "feedback_recorded": true,
  "timestamp": "2026-01-12T10:35:00Z"
}
```

**Validation:**
- [ ] job_id must exist
- [ ] accepted must be boolean
- [ ] intent must be in closed set if provided
- [ ] comment max length: 500 characters

---

### API-4: Get Dashboard Data (GET /dashboard/{metric_type})

**Purpose:** Retrieve precomputed dashboard metrics

**Endpoint:** `GET /api/v1/dashboard/{metric_type}`

**Security Stance:**
- [ ] **Public dashboard endpoints** (no authentication required)
- [ ] Aggregated data only (no individual job details without token)
- [ ] Cost/token totals are aggregate system-wide metrics (acceptable to expose publicly)
- [ ] Future: If admin/private metrics needed, introduce `/admin/dashboard/*` with API key or Cognito

**Metric Types:**
- `executive_overview`
- `tool_usage`
- `sub_worker_patterns`
- `vendor_comparison`
- `evaluator_analysis`
- `system_performance`

**Query Parameters:**
- `date_from`: YYYY-MM-DD (optional, default: 30 days ago)
- `date_to`: YYYY-MM-DD (optional, default: today)
- `vendor`: openai | anthropic (optional filter)
- `conference`: black_hat | reinvent | kubecon (optional filter)

**Response Example (executive_overview):**
```json
{
  "metric_type": "executive_overview",
  "date_range": {
    "from": "2025-12-13",
    "to": "2026-01-12"
  },
  "data": {
    "total_generations": 247,
    "acceptance_rate": {
      "accept": 0.32,
      "would_submit_with_edits": 0.28,
      "would_not_submit": 0.22,
      "reject": 0.18,
      "combined_positive": 0.60
    },
    "popular_combinations": [
      {"conference": "black_hat", "topic": "genai", "count": 45},
      {"conference": "reinvent", "topic": "cloud", "count": 38},
      ...
    ],
    "avg_generation_time_seconds": 92,
    "total_cost_usd": 103.74,
    "total_tokens": 3067500
  }
}
```

---

### API-5: Get Workflow Events (GET /workflow/{job_id})

**Purpose:** Retrieve detailed decision events for workflow visualization

**Endpoint:** `GET /api/v1/workflow/{job_id}?token={job_read_token}`

**Authentication:**
- [ ] Requires job_read_token (query param or Authorization header)
- [ ] Returns 403 if token missing or invalid

**Query Parameters:**
- `view`: simple | deep (default: simple)
- `token`: job_read_token (required)

**Response (Simple View):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "view": "simple",
  "timeline": [
    {
      "stage": "manager_goal_formulation",
      "timestamp": "2026-01-12T10:30:00Z",
      "duration_ms": 2500,
      "summary": "Manager formulated high-level objective for Black Hat GenAI abstract"
    },
    {
      "stage": "worker_planning",
      "timestamp": "2026-01-12T10:30:02.5Z",
      "duration_ms": 1200,
      "summary": "Worker decided to spawn CFP Extractor and Evidence Researcher in parallel"
    },
    {
      "stage": "sub_worker_execution",
      "timestamp": "2026-01-12T10:30:03.7Z",
      "duration_ms": 18000,
      "sub_workers": [
        {"type": "cfp_extractor", "status": "completed", "parallel": true},
        {"type": "evidence_researcher", "status": "completed", "parallel": true},
        {"type": "draft_generator", "status": "completed", "parallel": false},
        {"type": "red_team_reviewer", "status": "completed", "parallel": false}
      ],
      "artifacts": [
        {"artifact_id": "cfp_extract_550e8400_v1", "type": "style_profile"},
        {"artifact_id": "evidence_550e8400_v1", "type": "evidence_bundle"},
        {"artifact_id": "drafts_550e8400_v1", "type": "draft_candidates"},
        {"artifact_id": "review_550e8400_v1", "type": "review_feedback"}
      ]
    },
    ...
  ]
}
```

**Data Source:**
- [ ] Timeline constructed from decision_events table (query by job_id)
- [ ] Events filtered and aggregated by stage for Simple view
- [ ] Full event details included in Deep view

**Response (Deep View):**
Includes all decision events with full details: tool calls, reasoning, token usage, sources, etc.
- [ ] Retrieved from decision_events table with no filtering
- [ ] Each event includes: event_type, actor, summary, details (full JSON), timestamp

---

### WebSocket Protocol

**Connection:** `wss://api.example.com/ws?job_id={job_id}&token={job_read_token}`

**Authentication:**
- [ ] Token verified on connection establishment
- [ ] Connection rejected (4003 Forbidden) if token invalid/expired

**Server → Client Messages:**

**Progress Update:**
```json
{
  "type": "progress",
  "job_id": "550e8400...",
  "stage": "worker_execution",
  "message": "Worker spawning sub-workers...",
  "stage_index": 3,
  "stage_total": 7,
  "timestamp": "2026-01-12T10:30:15Z"
}
```

**Note on Progress:**
- [ ] progress_percent is a UI heuristic, not true completion percentage
- [ ] System cannot deterministically calculate completion (autonomous sub-worker spawning)
- [ ] UI can estimate: `(stage_index / stage_total) * 100` for visual progress bar
- [ ] Stages: 1=manager_goal, 2=worker_planning, 3=sub_worker_execution, 4=evaluator, 5=manager_evaluation, 6=decision, 7=complete

**Decision Event (Real-time):**
```json
{
  "type": "decision_event",
  "job_id": "550e8400...",
  "event_type": "sub_worker_spawned",
  "actor": "worker",
  "summary": "Worker spawned CFP Extractor to analyze Black Hat conference style",
  "details": {
    "sub_worker_type": "cfp_extractor",
    "reasoning": "Need to understand Black Hat's technical depth expectations and required structure",
    "inputs_provided": ["conference_name", "example_count_target"]
  },
  "timestamp": "2026-01-12T10:30:15.3Z"
}
```

**Job Completed:**
```json
{
  "type": "completed",
  "job_id": "550e8400...",
  "result": { /* same as GET /status response */ },
  "timestamp": "2026-01-12T10:31:27Z"
}
```

**Job Failed:**
```json
{
  "type": "failed",
  "job_id": "550e8400...",
  "error": "Worker exceeded max retries after 3 timeouts",
  "timestamp": "2026-01-12T10:31:27Z"
}
```

---

## Data Models & Schemas

### Decision Events Storage Architecture

**Three-Table Design:**

**1. decision_events (High-volume append-only event stream)**
- **Purpose**: Store all decision events for workflow reconstruction and deep analysis
- **Partition Key**: job_id (String, UUID)
- **Sort Key**: timestamp#event_type#seq (String, e.g., "2026-01-12T10:30:15.123Z#tool_called#001")
- **Attributes**: event_type, actor, summary, details (JSON), timestamp
- **Access Pattern**: Query by job_id to get all events for workflow visualization
- **Volume**: ~20-50 events per job

**2. generation_metrics (One summary row per job + per-iteration metadata)**
- **Purpose**: Job-level aggregated metrics for analytics and dashboard queries
- **Partition Key**: generation_id (String, UUID) - NOTE: generation_id == job_id
- **Sort Key**: record_type#timestamp (String, e.g., "summary#2026-01-12T10:31:27Z" or "iteration#2#2026-01-12T10:31:01Z")
- **Record Types**:
  - `summary#timestamp`: One row per job with final aggregated metrics
  - `iteration#N#timestamp`: One row per iteration (0-4) with iteration-specific data
- **Attributes**: All job metadata, vendor assignments, performance metrics, results
- **GSI**: 
  - GSI1PK: date_partition (String, YYYY-MM-DD)
  - GSI1SK: timestamp (String, ISO datetime)
  - Filter: record_type begins_with "summary" for dashboard time-series queries
- **Access Pattern**: 
  - Per-job summary: Get by generation_id + record_type begins_with "summary"
  - Time-series aggregation: Query GSI by date_partition, filter to summary records
  - Iteration details: Query by generation_id + record_type begins_with "iteration"
- **Volume**: 1 summary row + 1-5 iteration rows per job (6 rows max)

**Design Rationale:**
- record_type prefix prevents dashboard double-counting (filter to "summary" only)
- Iteration records enable iteration-level analysis without bloating summary
- GSI on date_partition enables efficient time-series queries for dashboard

**3. daily_metrics (Precomputed aggregates)**
- **Purpose**: Dashboard chart data, computed nightly
- **Partition Key**: metric_date (String, YYYY-MM-DD)
- **Sort Key**: metric_type (String, e.g., "acceptance_by_vendor")
- **Attributes**: precomputed_data (JSON, chart-ready)
- **Access Pattern**: Dashboard queries by date range
- **Volume**: ~20 metric types × 365 days/year

**Design Rationale:**
- decision_events = high-volume, append-only, per-job workflow reconstruction
- generation_metrics = one summary per job for cross-job analytics
- daily_metrics = precomputed for fast dashboard rendering
- Clear separation prevents overloading single table

---

### Conference Data Model

**Table:** `conference_data`

**Item Structure:**
```json
{
  "conference": "black_hat",
  "data_type": "rules",
  "title_requirements": {
    "min_words": 5,
    "max_words": 15,
    "format": "Technical and specific, avoid marketing language"
  },
  "abstract_requirements": {
    "min_words": 200,
    "max_words": 500,
    "required_sections": ["Problem", "Approach", "Results/Demo"],
    "optional_sections": ["Future Work"]
  },
  "tone_guidelines": {
    "technical_depth": "deep",
    "audience_level": "expert",
    "voice": "authoritative",
    "avoid": ["marketing buzzwords", "unsubstantiated claims"]
  },
  "topics_covered": ["Application Security", "Network Security", "Cryptography", "AI/ML Security"],
  "source_url": "https://www.blackhat.com/call-for-papers.html",
  "last_updated": "2026-01-01"
}
```

**Example Abstract Item:**
```json
{
  "conference": "black_hat",
  "data_type": "abstract_example",
  "example_id": "bh_2023_042",
  "year": 2023,
  "title": "Breaking LLM Guardrails: Novel Jailbreak Techniques",
  "abstract": "Full abstract text...",
  "topic_tags": ["AI Security", "Red Team"],
  "characteristics": {
    "technical_depth": "deep",
    "novel_contribution": "New attack vector",
    "structure": "Threat → Technique → Demo"
  },
  "acceptance_signals": ["Strong methodology", "Real-world impact", "Reproducible demo"]
}
```

---

### Artifact Schema Examples

**CFP/Style Extractor Output:**
```json
{
  "meta": {
    "artifact_id": "cfp_extract_550e8400_v1",
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "iteration": 0,
    "parent_task_id": "main",
    "task_id": "cfp_extract_1",
    "worker_id": "cfp_extractor",
    "worker_vendor": "anthropic",
    "worker_model": "claude-3-5-sonnet",
    "artifact_type": "style_profile",
    "artifact_version": "v1",
    "schema_version": "1.0",
    "spawned_at": "2026-01-12T10:30:15Z",
    "completed_at": "2026-01-12T10:30:28Z",
    "status": "completed"
  },
  "data": {
    "structure_requirements": {
      "title_format": "Technical, specific, avoids marketing",
      "required_sections": ["Threat Landscape", "Technical Approach", "Demonstration"],
      "optional_sections": ["Future Research"]
    },
    "length_constraints": {
      "title_min_words": 5,
      "title_max_words": 15,
      "abstract_min_words": 200,
      "abstract_max_words": 500
    },
    "tone_markers": {
      "technical_depth": "deep",
      "audience_level": "expert",
      "voice": "authoritative",
      "key_phrases": ["novel technique", "demonstrates", "real-world impact"]
    },
    "recurring_patterns": [
      "Abstracts open with threat/problem statement",
      "Technical methodology section required",
      "Reproducible demo or proof-of-concept expected"
    ]
  },
  "quality_signals": {
    "confidence": 0.87,
    "coverage": "comprehensive",
    "validation_passed": true,
    "examples_analyzed": 28
  },
  "provenance": {
    "sources": [
      {"type": "dynamodb_key", "ref": "black_hat_abstract_2023_042"},
      {"type": "dynamodb_key", "ref": "black_hat_abstract_2022_018"},
      {"type": "dynamodb_key", "ref": "black_hat_rules"}
    ],
    "claims": [
      {
        "claim": "Black Hat requires deep technical detail in methodology",
        "source_pointer": "black_hat_abstract_2023_042"
      },
      {
        "claim": "Title should be 5-15 words and avoid marketing language",
        "source_pointer": "black_hat_rules"
      }
    ],
    "tool_calls": [
      {
        "tool": "dynamodb_lookup",
        "params": {"conference": "black_hat", "data_type": "abstract_example", "limit": 30},
        "results_summary": "Retrieved 28 past accepted abstracts (2022-2024)",
        "results_s3_ref": null,
        "reasoning": "Needed examples to extract recurring style patterns",
        "tokens": 450,
        "time_ms": 120
      }
    ]
  },
  "overflow": {
    "s3_payload_ref": null,
    "s3_tool_results_ref": null,
    "payload_sha256": null,
    "payload_size_bytes": 3850
  },
  "execution": {
    "tokens_used": 1650,
    "execution_time_ms": 13000,
    "error": null
  }
}
```

---

## Error Handling & Edge Cases

### Error-1: Sub-Worker Timeout

**Scenario:** Sub-worker exceeds 30-second timeout

**Handling:**
- [ ] Sub-worker Lambda times out after 30 seconds
- [ ] Step Functions detects timeout, logs timeout event
- [ ] Worker applies deterministic fallback strategy (see ARCH-3)
- [ ] Job continues with fallback artifact
- [ ] Decision event logged: `sub_worker_timeout` with fallback strategy

**User Impact:** Generation completes but may have lower quality (e.g., generic evidence if Evidence Researcher times out)

**Metrics Tracked:**
- Timeout frequency by sub-worker type
- Impact on acceptance rate when fallback used

---

### Error-2: Evaluator Timeout

**Scenario:** Evaluator doesn't respond within 1 minute

**Step Functions Async Pattern:**
- [ ] Step Functions sends Evaluator request to SNS topic
- [ ] SNS → SQS → Evaluator Lambda processes request
- [ ] **Evaluator writes result to generation_metrics table** with record_type = "evaluator#timestamp"
- [ ] **Step Functions polls generation_metrics** (every 3 seconds) checking for evaluator record
- [ ] Polling loop: Query by job_id + record_type begins_with "evaluator", up to 20 attempts (60 seconds total)
- [ ] If result found: Continue to Manager evaluation with Evaluator input
- [ ] If 60 seconds elapsed with no result: Continue without Evaluator input (graceful degradation)

**Handling:**
- [ ] Decision event logged: `evaluator_timeout` if no response within 60s
- [ ] Manager proceeds with evaluation (Evaluator is optional signal, not required)

**User Impact:** None visible (graceful degradation)

**Metrics Tracked:**
- Evaluator timeout rate
- Correlation between Evaluator absence and Manager decisions

**Alternative Implementation (Post-MVP):**
- [ ] Step Functions callback token pattern (Evaluator calls SendTaskSuccess)
- [ ] Requires Evaluator to handle callback token, more complex

---

### Error-3: Budget Exceeded

**Scenario:** Job estimated cost exceeds $5 soft limit

**Handling:**
- [ ] **Budget service** detects cost estimate > $5 after iteration
- [ ] Budget service sets minimal_mode_activated = true in job_budgets table
- [ ] Updates web_search_limit from 10 to 2 (for entire job, not per iteration)
- [ ] Emits cost_guardrail_triggered decision event
- [ ] Worker notified via context on next iteration: "Minimal tool mode active. 2 web searches remaining for this job."
- [ ] Worker adapts: Relies on DynamoDB, minimizes web searches
- [ ] **Note**: Failed web search calls still decrement budget (by design for cost protection)

**Minimal Tool Mode Definition (Consistent):**
- [ ] web_search_limit = 10 initially (per job total)
- [ ] If estimated_cost_usd > $5: web_search_limit = 2 (per job total, across all iterations)
- [ ] Tool wrapper enforces mechanically (not model compliance)
- [ ] Job-scoped counter tracks cumulative searches

**User Impact:** Potentially lower quality due to limited external research

**Metrics Tracked:**
- Frequency of minimal tool mode activation
- Acceptance rate when minimal mode active vs. normal

---

### Error-4: All Sub-Workers Timeout

**Scenario:** All 4 sub-workers time out (extremely rare)

**Handling:**
- [ ] Worker applies all 4 fallback strategies
- [ ] Uses: Cached style template + No evidence + Worker-generated draft + Worker self-check
- [ ] Job completes with heavily fallback-dependent abstract
- [ ] Decision event logged: `multiple_timeouts` with severity = "critical"
- [ ] Alert sent to admin (unusual situation)

**User Impact:** Low-quality abstract, likely rejected by user

**Metrics Tracked:**
- Frequency (should be <0.1%)
- Root cause analysis (Lambda cold starts? Network issues?)

---

### Error-5: Manager Rejects All 5 Iterations

**Scenario:** Manager rejects iterations 0-4 (hard cap reached)

**Handling:**
- [ ] Manager must select best of 5 iterations (even if all inadequate)
- [ ] Manager selects iteration with highest quality score
- [ ] Decision event logged: `max_iterations_reached` with rationale for selection
- [ ] User sees abstract with note: "Generated after 5 iterations (maximum)"

**User Impact:** User sees abstract that Manager deemed "best available" but may still reject

**Metrics Tracked:**
- Frequency of max iterations reached
- Acceptance rate when max iterations reached
- Which iterations typically selected (hypothesis: iteration 2-3 optimal)

---

### Error-6: Invalid Artifact Schema

**Scenario:** Sub-worker produces artifact that fails schema validation

**Handling:**
- [ ] Schema validator rejects artifact before DynamoDB write
- [ ] ValidationError raised
- [ ] Worker catches error, treats as sub-worker failure
- [ ] Worker applies appropriate fallback strategy (same as timeout)
- [ ] Decision event logged: `artifact_validation_failed` with errors
- [ ] Alert sent if validation failure rate >5% for any sub-worker

**User Impact:** Gracefully handled via fallback

**Metrics Tracked:**
- Validation failure rate by sub-worker type
- Common validation errors (improve prompts)

---

### Error-7: API Rate Limit Hit

**Scenario:** User exceeds rate limits

**Two-Layer Rate Limiting:**

**Layer 1: Global API Gateway (100 req/min per IP)**
- [ ] API Gateway returns HTTP 429 Too Many Requests
- [ ] Response includes Retry-After header (e.g., 60 seconds)
- [ ] Applies to all endpoints

**Layer 2: /generate Endpoint-Specific (10 generations/min per IP)**
- [ ] Server-side guard in /generate Lambda
- [ ] Tracks generation requests separately (more expensive operation)
- [ ] Returns HTTP 429 with Retry-After header
- [ ] Error message: "Generation rate limit exceeded (10/min). Please wait {N} seconds."
- [ ] Frontend disables "Generate" button for {N} seconds

**Handling:**
- [ ] User sees error message with specific wait time
- [ ] Frontend disables "Generate" button for cooldown period
- [ ] Other endpoints (status, dashboard) still accessible

**User Impact:** Temporary delay, clear guidance on when to retry

**Metrics Tracked:**
- Rate limit hit frequency (global vs. /generate-specific)
- Per-IP throttle patterns (identify abuse)

---

### Error-8: Global Kill Switch Activated

**Scenario:** Daily cost exceeds $20, system auto-disables

**Handling:**
- [ ] CloudWatch alarm triggers at $20 daily cost
- [ ] Lambda flips Parameter Store flag: system-enabled = false
- [ ] SNS notification sent to admin
- [ ] All new requests return: "System temporarily unavailable for maintenance. Please check back later."
- [ ] In-progress jobs complete normally
- [ ] Dashboard shows status: "System Disabled (Cost Limit)"

**User Impact:** Cannot generate new abstracts until re-enabled

**Recovery:**
- [ ] Manual: Admin flips flag to true
- [ ] Automatic: Resets at midnight UTC (new day, new budget)

---

## Implementation Phases & Roadmap

**Timeline Note:** Phases labeled as "Sprints" (2-week iterations) rather than literal calendar weeks to allow for flexibility and actual team velocity.

---

### Phase 1: Core Infrastructure (Sprint 1)

**Goal:** Set up AWS infrastructure and basic orchestration

**Duration:** 2 weeks (Sprint 1)

**Deliverables:**
- [ ] AWS CDK/Terraform infrastructure code
- [ ] DynamoDB tables created: conference_data, scratch_artifacts, generation_metrics, job_budgets
- [ ] S3 buckets created with lifecycle policies
- [ ] Parameter Store setup for API keys (KMS encrypted)
- [ ] Step Functions state machine defined (basic flow)
- [ ] Lambda skeletons created (no LLM logic yet)
- [ ] API Gateway setup with rate limiting
- [ ] CloudWatch alarms configured

**Testing:**
- [ ] Infrastructure deploys successfully
- [ ] DynamoDB tables accessible
- [ ] Parameter Store keys retrievable
- [ ] Step Functions can invoke Lambdas

---

### Phase 2: Manager & Worker Agents (Sprints 2-3)

**Goal:** Implement core agent logic without sub-workers

**Duration:** 2 sprints (4 weeks)

**Deliverables:**
- [ ] Manager Lambda with LLM integration (OpenAI + Anthropic)
- [ ] Manager prompt engineering for goal formulation
- [ ] Manager evaluation logic with citation extraction
- [ ] Worker Lambda with LLM integration
- [ ] Worker prompt engineering for autonomous decision-making
- [ ] Tool wrappers: DynamoDB lookup, web search (Tavily/SerpAPI)
- [ ] Decision event logging to DynamoDB Metrics
- [ ] Vendor assignment logic (50/50 randomized)
- [ ] Iteration loop in Step Functions (up to 5 iterations)
- [ ] Creativity progression (0.3 → 0.7)

**Testing:**
- [ ] Manager can formulate high-level goals
- [ ] Worker can call tools autonomously
- [ ] Manager can evaluate and provide feedback
- [ ] Iteration loop works correctly
- [ ] Decision events captured in DynamoDB
- [ ] Basic end-to-end flow: User request → Manager → Worker → Manager → Result

---

### Phase 3: Sub-Worker Implementation (Sprints 4-5)

**Goal:** Add sub-worker spawning and coordination

**Duration:** 2 sprints (4 weeks)

**Deliverables:**
- [ ] 4 sub-worker Lambdas:
  - [ ] CFP/Style Extractor
  - [ ] Evidence Researcher
  - [ ] Draft Generator
  - [ ] Red Team Reviewer
- [ ] Sub-worker prompt engineering with strict contracts
- [ ] Artifact schema validation library (pydantic/ajv)
- [ ] Runtime schema validation enforcement
- [ ] Worker logic to spawn sub-workers (autonomous decisions)
- [ ] **Sub-worker spawn constraint enforcement** (infrastructure layer):
  - [ ] Tool router validates caller_role before allowing spawn_sub_worker
  - [ ] If caller_role == "worker": Allow spawn
  - [ ] If caller_role == "sub_worker": Reject with error
  - [ ] Prevents sub-workers from spawning additional workers (enforced mechanically, not via model compliance)
- [ ] Parallel execution support (async invocations)
- [ ] Timeout handling with deterministic fallbacks
- [ ] Standard artifact envelope structure
- [ ] S3 overflow handling (artifacts >350KB)

**Testing:**
- [ ] Each sub-worker can produce valid artifacts
- [ ] Schema validation rejects invalid artifacts
- [ ] Worker can spawn sub-workers in parallel
- [ ] Timeouts trigger correct fallbacks
- [ ] Artifacts stored correctly (DynamoDB + S3)
- [ ] End-to-end with sub-workers: Full workflow works

---

### Phase 4: Evaluator & Cost Controls (Sprint 6)

**Goal:** Add async Evaluator and cost guardrails

**Duration:** 1 sprint (2 weeks)

**Deliverables:**
- [ ] Evaluator Lambda (Amazon Nova via Bedrock)
- [ ] SNS topic for Evaluator requests
- [ ] SQS queue for Evaluator processing
- [ ] Evaluator blind assessment logic (conference matching only)
- [ ] Step Functions async Evaluator integration (1 min timeout)
- [ ] Cost tracking in job_budgets table
- [ ] Minimal tool mode enforcement in tool wrappers
- [ ] Budget check logic in web search tool
- [ ] Global kill switch implementation (Parameter Store flag)
- [ ] Daily cost alarm with auto-disable

**Testing:**
- [ ] Evaluator receives requests via SNS/SQS
- [ ] Evaluator returns top-3 predictions (closed set)
- [ ] Evaluator timeout handled gracefully
- [ ] Cost tracking accurate per job
- [ ] Minimal tool mode activates at $5 threshold
- [ ] Budget exhausted responses work correctly
- [ ] Global kill switch can pause system

---

### Phase 5: Frontend & Visualization (Sprints 7-8)

**Goal:** Build React frontend with workflow visualization

**Deliverables:**
- [ ] React app with Tailwind CSS
- [ ] Landing page with conference/topic selection
- [ ] Generate Abstract button with loading states
- [ ] WebSocket connection for real-time updates
- [ ] Dual-layer Workflow Tab (Simple + Deep views)
- [ ] Timeline visualization (Simple view)
- [ ] Decision event display (Deep view)
- [ ] Results Tab with abstract display
- [ ] User feedback interface (Accept/Reject/Intent)
- [ ] Zustand state management
- [ ] API integration (generate, status, feedback)
- [ ] Error handling and user messages

**Testing:**
- [ ] Frontend loads in <3 seconds
- [ ] WebSocket real-time updates work
- [ ] Fallback to polling if WebSocket fails
- [ ] Simple/Deep view toggle works
- [ ] User can submit feedback
- [ ] Mobile responsive (360px width minimum)

---

### Phase 6: Analytics Dashboard (Sprints 9-10)

**Goal:** Build comprehensive analytics dashboard (primary product)

**Deliverables:**
- [ ] Dashboard landing page (Executive Overview)
- [ ] Acceptance rate charts and trends
- [ ] Tool usage heatmap
- [ ] Sub-worker orchestration sunburst chart
- [ ] Tool call sequence Sankey diagram
- [ ] Vendor comparison side-by-side tables
- [ ] Sub-worker effectiveness metrics
- [ ] Evaluator analysis (confusion matrix, calibration)
- [ ] System performance metrics
- [ ] Recharts visualizations
- [ ] Dashboard data aggregation Lambda (nightly job)
- [ ] daily_metrics DynamoDB table
- [ ] Dashboard API endpoints

**Testing:**
- [ ] All dashboard sections load correctly
- [ ] Charts render with real data
- [ ] Filters work (date range, vendor, conference)
- [ ] Nightly aggregation Lambda runs successfully
- [ ] Dashboard queries complete in <2 seconds

---

### Phase 7: Integration Testing & Optimization (Sprint 11))

**Goal:** End-to-end testing, bug fixes, performance tuning

**Deliverables:**
- [ ] Load testing (10+ concurrent users)
- [ ] Integration test suite (all flows)
- [ ] Bug fixes from testing
- [ ] Performance optimization:
  - [ ] Lambda cold start mitigation (provisioned concurrency if needed)
  - [ ] DynamoDB query optimization
  - [ ] WebSocket connection stability improvements
- [ ] Cost analysis and optimization
- [ ] Documentation:
  - [ ] Architecture diagrams
  - [ ] API documentation
  - [ ] Runbook
  - [ ] README with setup instructions

**Testing:**
- [ ] 10 concurrent generations complete successfully
- [ ] All user journeys work end-to-end
- [ ] Error scenarios handled gracefully
- [ ] Performance meets NFR targets
- [ ] Cost per generation within expected range

---

### Phase 8: Beta Launch & Iteration (Sprints 12-13)

**Goal:** Limited beta launch, gather feedback, iterate

**Deliverables:**
- [ ] Beta launch to 20-30 AI developer community members
- [ ] User feedback collection (surveys + analytics)
- [ ] Bug fixes from beta feedback
- [ ] Feature refinements based on feedback
- [ ] Content for blog post (insights from beta data)
- [ ] Documentation updates

**Success Criteria:**
- [ ] 60%+ beta users view dashboard
- [ ] At least 3 concrete insights identified from data
- [ ] Acceptance rate meets 60% target (combined)
- [ ] System reliability 95%+ (job completion rate)
- [ ] Beta users report understanding agentic patterns

---

### Phase 9: Public Launch (Sprint 14))

**Goal:** Public launch with blog post and community outreach

**Deliverables:**
- [ ] Final bug fixes and polish
- [ ] Blog post: "Building an Instrumentation Harness for Agentic AI"
- [ ] Code repository public (if applicable)
- [ ] Public dashboard with sample data
- [ ] Monitoring and alerting active
- [ ] Cost controls validated

**Launch Checklist:**
- [ ] All Phase 8 success criteria met
- [ ] Blog post published
- [ ] System monitoring active
- [ ] Runbook finalized
- [ ] Cost alarms working
- [ ] Global kill switch tested

---

## Success Metrics & Launch Criteria

### Pre-Launch Criteria (Must Meet All)

**Functional:**
- [ ] User can generate abstract for all 3 conferences
- [ ] User can select all 5 topics
- [ ] Manager/Worker agents work with both vendors
- [ ] All 4 sub-worker types functional
- [ ] Evaluator returns conference predictions
- [ ] User can provide feedback (accept/reject/intent)
- [ ] Dashboard displays all 6 sections
- [ ] Real-time workflow visualization works

**Non-Functional:**
- [ ] 95% job completion rate (10+ test generations)
- [ ] <2 minute average generation time (p50)
- [ ] <$1 per generation (typical case)
- [ ] 50/50 vendor split achieved (±5% over 20 generations)
- [ ] Cost guardrails tested and working
- [ ] Global kill switch tested and working

**Quality:**
- [ ] 60%+ acceptance rate (combined) in internal testing
- [ ] **All required decision events captured per job:**
  - [ ] vendor_assignment (always)
  - [ ] iteration_completed (1-5 times per job)
  - [ ] tool_called (if any tools used)
  - [ ] sub_worker_spawned (if any sub-workers spawned)
  - [ ] artifact_created (for each artifact produced)
  - [ ] artifact_consumed (when Worker reads artifacts)
  - [ ] manager_accepted OR manager_rejected (each iteration)
  - [ ] evaluator_assessed OR evaluator_timeout (always)
  - [ ] cost_guardrail_triggered (if minimal mode activated)
  - [ ] timeout_occurred (if any sub-worker timeouts)
- [ ] All artifacts have valid schemas (pass schema validation)
- [ ] Idempotency tested (Lambda retries don't create duplicates)
- [ ] Error handling graceful (no crash logs)

**Event Validation:**
- [ ] Sample 10 completed jobs
- [ ] Verify all required events present in decision_events table
- [ ] Check event sequence logical (vendor_assignment first, manager_accepted/rejected last, etc.)

---

### Post-Launch Success Metrics (30 Days)

**Primary Metrics:**
- [ ] **Dashboard Engagement**: 60%+ of users view analytics dashboard
- [ ] **Comparative Insights**: At least 3 defensible findings published in blog post
- [ ] **System Reliability**: 95%+ job completion rate
- [ ] **Scientific Rigor**: 50/50 vendor split maintained (±2%)

**Secondary Metrics:**
- [ ] **User Acceptance**: 60%+ combined acceptance rate (accept + "would submit with edits")
- [ ] **Evaluator Accuracy**: 70%+ top-3 conference match rate
- [ ] **Cost Efficiency**: <$0.50 per generation (typical case)
- [ ] **User Retention**: 30%+ of users generate 3+ abstracts

**Operational Metrics:**
- [ ] **Uptime**: 99%+ (excluding planned maintenance)
- [ ] **Performance**: <2 minutes p50 generation time
- [ ] **Cost Control**: Daily costs <$20 (never trigger auto-disable)

---

## Appendix: Open Questions for Engineering

**Note:** These recommendations optimize for MVP simplicity and shipping speed. Post-MVP, any of these can be revisited based on actual usage patterns.

1. **Tool Choice:** Tavily vs. SerpAPI for web search?
   - Recommendation: Tavily (better for AI applications, more structured results)

2. **Infrastructure:** AWS CDK vs. Terraform?
   - Recommendation: AWS CDK (better TypeScript/Python integration, native AWS support)

3. **Frontend Framework:** React + Vite or Next.js?
   - Recommendation: React + Vite (simpler for SPA, faster dev server, no SSR complexity)

4. **Charting Library:** Recharts vs. Chart.js?
   - Recommendation: Recharts (React-native, composable, better for complex dashboards)

5. **Lambda Runtime:** Node.js vs. Python?
   - Recommendation: Python for agent Lambdas (better LLM SDK support), Node.js for API/Frontend

6. **Sub-Worker Invocation:** Async Lambda invocation vs. SQS?
   - Recommendation: Async Lambda invocation (simpler, Step Functions handles orchestration)

7. **Provisioned Concurrency:** Worth the cost?
   - Recommendation: Start without, add only if cold starts become problem (measure first)

8. **Real-Time:** WebSocket vs. SSE?
   - Recommendation: WebSocket (bidirectional, better for multi-stage updates, fallback to polling)

---

## End of PRD

**Complete Product Requirements Document v1.0**

All 3 parts ready for engineering implementation.

---

**Document Navigation:**
- **Part 1:** Overview, Goals & User Stories
- **Part 2:** Functional & Non-Functional Requirements
- **Part 3:** API Specs, Data Models & Implementation Roadmap (Current - Final)

---

**Ready for:** Architecture design, task breakdown, and sprint planning

**Next Steps:**
1. Architecture team reviews PRD
2. Create detailed technical architecture document
3. Break down into JIRA stories
4. Begin Phase 1: Core Infrastructure