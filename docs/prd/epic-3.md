### Epic 3: Instrumentation & Observability

#### Story 3.1: Decision Event Capture

**As an** AI developer  
**I want** all agent actions captured as structured decision events  
**So that** I can analyze decision-making patterns

**Acceptance Criteria:**

**Decision Event Definition:**
A structured record of an agent action that changes state (spawn, tool call, artifact read/write, accept/reject) including actor, rationale summary, inputs, outputs, and pointers to evidence.

**Decision Event Types to Capture:**
- [ ] `tool_called`: Worker or sub-worker calls tool (tool name, params, results_summary, reasoning, tokens, time)
- [ ] `sub_worker_spawned`: Worker spawns sub-worker (type, reasoning, inputs provided)
- [ ] `artifact_created`: Sub-worker writes artifact (artifact_id, type, quality_signals)
- [ ] `artifact_consumed`: Worker reads artifact (artifact_id, how used in synthesis)
- [ ] `manager_rejected`: Manager rejects output (iteration, sections_cited, reasoning)
- [ ] `manager_accepted`: Manager accepts output (iteration selected, why chosen)
- [ ] `evaluator_assessed`: Evaluator provides conference predictions (top_3, confidence, reasons)
- [ ] `timeout_occurred`: Sub-worker or Evaluator times out (fallback strategy applied)
- [ ] `cost_guardrail_triggered`: Minimal tool mode activated (budget exceeded)
- [ ] `iteration_completed`: Full iteration cycle done (iteration number, outcome)

**Storage & Retrieval:**
- [ ] All decision events written to DynamoDB Metrics table (NOT CloudWatch)
- [ ] Each event includes: event_type, job_id, timestamp, actor (agent), rationale_summary, inputs_summary, outputs_summary, evidence_pointers
- [ ] Events queryable by job_id for workflow reconstruction
- [ ] Events aggregatable for dashboard analytics
- [ ] UI reads events from DynamoDB (not CloudWatch parsing)

**Separation from Operational Logs:**
- [ ] Decision events: DynamoDB Metrics (product analytics)
- [ ] Operational logs: CloudWatch (debugging, errors, performance)
- [ ] Clear separation enforced in Lambda functions

---

#### Story 3.2: Artifact Traceability

**As an** AI developer  
**I want** complete artifact lineage and evidence chains  
**So that** I can trace how decisions were made

**Acceptance Criteria:**

**Standard Artifact Envelope (All Artifacts):**
```json
{
  "meta": {
    "artifact_id": "string",
    "job_id": "string",
    "iteration": 0-4,
    "parent_task_id": "string",
    "task_id": "string",
    "worker_id": "string",
    "worker_vendor": "openai|anthropic",
    "worker_model": "string",
    "artifact_type": "string",
    "artifact_version": "v1|v2|v3",
    "schema_version": "1.0",
    "spawned_at": "ISO timestamp",
    "completed_at": "ISO timestamp",
    "status": "completed|failed|timeout"
  },
  "data": { /* artifact-specific content */ },
  "quality_signals": {
    "confidence": 0-1,
    "coverage": "comprehensive|moderate|limited",
    "validation_passed": boolean
  },
  "provenance": {
    "sources": [{"type": "string", "ref": "string"}],
    "claims": [{"claim": "string", "source_pointer": "string"}],
    "tool_calls": [/* tool call details */]
  },
  "overflow": {
    "s3_payload_ref": "string (optional)",
    "s3_tool_results_ref": "string (optional)",
    "payload_sha256": "string (optional)",
    "payload_size_bytes": number
  },
  "execution": {
    "tokens_used": number,
    "execution_time_ms": number,
    "error": "string (optional)"
  }
}
```

**Artifact Requirements:**
- [ ] All artifacts follow standard envelope structure
- [ ] All artifacts include sources array (non-empty)
- [ ] All artifacts include claims array (at least one claim)
- [ ] Each claim has source_pointer to sources array element
- [ ] Tool calls include results_summary (50-200 chars), not full results
- [ ] Full tool results stored in S3 if >350KB
- [ ] Artifacts >350KB: summary in DynamoDB data field, full in S3
- [ ] S3 references include SHA-256 hash for integrity

**Artifact Dependency Graph:**
- [ ] System can reconstruct which artifacts fed which decisions
- [ ] UI displays dependency graph in Deep View
- [ ] Worker's final abstract includes pointers to all input artifacts

---

#### Story 3.3: Tool Usage Logging

**As an** AI developer  
**I want** detailed tool usage logs with reasoning  
**So that** I can analyze autonomous tool selection patterns

**Acceptance Criteria:**

**Tool Call Logging (Every Call):**
- [ ] Calling agent/sub-worker ID and vendor
- [ ] Tool name (dynamodb_lookup | web_search)
- [ ] Parameters sent (summary if large, full if <100 chars)
- [ ] Results_summary (50-200 chars, NOT full results)
- [ ] Full results stored in S3 via s3_tool_results_ref
- [ ] Reasoning for call (why this tool, why now)
- [ ] Tokens used
- [ ] Execution time (milliseconds)
- [ ] Cost estimated (if applicable)
- [ ] Success status (success | timeout | error | budget_exhausted)

**Tool Call Storage:**
- [ ] Logged as decision event: `tool_called`
- [ ] Stored in artifact provenance.tool_calls array
- [ ] Full tool results in S3, reference in artifact.overflow.s3_tool_results_ref

**Cost Guardrail Enforcement:**
- [ ] Web search tool checks job budget BEFORE calling API
- [ ] Budget counter in DynamoDB job_budgets table
- [ ] If budget exceeded, returns structured error: {status: "budget_exhausted", error: "...", searches_used: N, limit: N}
- [ ] Worker receives budget status in context
- [ ] Logging: cost_guardrail_triggered event when budget hit

---

## End of Part 1

**Continue to Part 2** for complete Functional Requirements by Epic, Non-Functional Requirements, and Technical Architecture Requirements.

---

**Document Navigation:**
- **Current:** Part 1 - Overview, Goals & User Stories
- **Next:** Part 2 - Functional & Non-Functional Requirements
- **Then:** Part 3 - API Specs, Data Models & Implementation Roadmap# Conference Abstract Builder - Product Requirements Document (PRD)
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

