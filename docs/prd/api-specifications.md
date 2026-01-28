# API Specifications

## API-1: Generate Abstract (POST /generate)

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

## API-2: Get Job Status (GET /status/{job_id})

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

## API-3: Submit Feedback (POST /feedback/{job_id})

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

## API-4: Get Dashboard Data (GET /dashboard/{metric_type})

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

## API-5: Get Workflow Events (GET /workflow/{job_id})

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

## WebSocket Protocol

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

