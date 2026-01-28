# Conference Abstract Builder - Product Requirements Document (PRD)
## Part 1 of 3: Product Overview, Goals & User Stories

**Product Name:** Conference Abstract Builder  
**Version:** 1.0  
**Date:** January 12, 2026  
**Author:** Product Manager  
**Status:** Draft for Engineering Review

---

## Document Structure

**Part 1 (This Document):**
- Product Overview
- Product Goals & Success Metrics
- User Personas & Journeys
- User Stories with Acceptance Criteria

**Part 2:**
- Functional Requirements (by Epic)
- Non-Functional Requirements
- Technical Architecture Requirements

**Part 3:**
- API Specifications & Data Models
- Error Handling & Edge Cases
- Implementation Phases & Roadmap

---

## 1. Product Overview

### 1.1 Product Vision

The Conference Abstract Builder is an **instrumentation harness for agentic AI behavior** that uses conference abstract generation as a practical demonstration vehicle. The primary product is a comprehensive analytics dashboard showing how different LLM vendors (OpenAI vs. Anthropic) approach autonomous task decomposition, tool usage, and multi-agent coordination.

**Core Value Proposition:**
- For AI Developers: Observable, measurable reference implementation of agentic AI patterns
- For Conference Speakers: Educational tool showing how AI approaches abstract generation (secondary)

### 1.2 Product Scope

**In Scope:**
- Multi-agent system with Manager, Worker, Sub-workers, and Evaluator
- Autonomous sub-worker spawning and coordination
- Observable decision-making through structured decision events
- Real-time workflow visualization (Simple + Deep views)
- Comprehensive analytics dashboard (primary deliverable)
- Topic support: 8 topics (AI/ML/GenAI, Security/Zero Trust, Cloud Architecture, Kubernetes & Containers, Platform/DevOps, Networking/Mesh, Data/Analytics, Leadership/Governance)
- Keyword search tool: API Gateway + Lambda + SQLite FTS index of example abstracts
- 5 curated conferences: Black Hat USA, AWS re:Invent, KubeCon, Gartner IT Symposium, Google Cloud Next
- 2 LLM vendors: OpenAI and Anthropic
- Cost guardrails and monitoring

**Out of Scope (Explicitly):**
- Submission-ready abstracts without human editing
- General-purpose agent framework
- More than 5 conferences (current set covers technical, security, cloud, executive, and AI/ML domains)
- More than 2 LLM vendors for Manager/Worker
- User authentication and accounts
- Real conference submission tracking
- Multi-conference abstract generation
- Social features (sharing, voting, galleries)

### 1.3 Success Criteria

**Primary Success Criteria:**
1. **Dashboard Engagement**: 60%+ of users view analytics dashboard
2. **Comparative Insights**: Publish at least 3 concrete, defensible findings about vendor role strengths from real run data
3. **Decision Event Transparency**: 100% of agent actions captured as structured decision events
4. **System Reliability**: 95%+ job completion rate (including fallback strategies)
5. **Scientific Rigor**: 50/50 vendor split maintained with controlled variables

**Secondary Success Criteria:**
1. **User Acceptance**: 60%+ combined acceptance rate (accept + "would submit with edits")
2. **Evaluator Accuracy**: 70%+ top-3 conference match rate
3. **Cost Efficiency**: Per-generation cost <$1 typical case
4. **Educational Value**: Users report understanding agentic patterns (post-use survey)

---

## 2. Product Goals & Success Metrics

### 2.1 Business Goals

**Primary Goals:**

1. **Create Reference Instrumentation Harness**
   - Definitive example of how to instrument multi-agent AI systems
   - Comprehensive metrics and transparent decision logging
   - Exportable patterns for other agentic systems

2. **Generate Comparative Vendor Insights**
   - OpenAI vs. Anthropic effectiveness in Manager vs. Worker roles
   - Sub-worker orchestration pattern differences
   - Tool selection strategy variations
   - Task decomposition approach comparisons

3. **Demonstrate Production-Grade Agentic Architecture**
   - Multi-agent coordination with autonomous sub-worker spawning
   - Tool usage and parallel execution
   - Iterative refinement patterns
   - Async evaluation patterns

4. **Provide Educational Value**
   - Transparent decision-making (decision events, not raw reasoning)
   - Observable agentic behavior
   - Reference implementation quality

**Secondary Goals:**

1. **Validate Async Evaluation Patterns**
   - Decoupled agent architectures
   - Blind evaluation effectiveness

2. **Establish Instrumentation Best Practices**
   - Decision event capture patterns
   - Artifact tracking methodologies
   - Analytics dashboard design

### 2.2 Key Performance Indicators (KPIs)

**Dashboard & Instrumentation (Primary Product):**

| KPI | Target | Measurement Method |
|-----|--------|-------------------|
| Dashboard engagement rate | 60% | Users who view analytics tab |
| Time on dashboard | 3+ minutes avg | Session analytics |
| Insights generated | 3+ defensible findings | Manual review of patterns |
| Blog-worthy discoveries | 1+ per month | Team assessment |

**Agent Effectiveness Comparison:**

| KPI | Target | Measurement Method |
|-----|--------|-------------------|
| Manager acceptance rate variance | <20% difference | Compare OpenAI vs. Anthropic |
| Worker acceptance rate variance | <20% difference | Compare OpenAI vs. Anthropic |
| Sub-worker pattern diversity | 5+ distinct patterns | Orchestration analysis |
| Tool usage pattern variance | Observable differences | Usage heatmaps |

**System Performance:**

| KPI | Target | Measurement Method |
|-----|--------|-------------------|
| Job completion rate | 95% | Including fallback strategies |
| Avg generation time | <2 minutes | p50 latency |
| Per-generation cost | <$0.50 typical | Cost tracking |
| Vendor split accuracy | 50/50 ±2% | Assignment distribution |

**User Satisfaction:**

| KPI | Target | Measurement Method |
|-----|--------|-------------------|
| Combined acceptance rate | 60% | Accept + "would submit with edits" |
| Evaluator top-3 accuracy | 70% | Conference matching |
| Workflow engagement | 40% | Users who view Workflow tab |

---

## 3. User Personas

### 3.1 Primary Persona: AI/ML Developer (Alex)

**Demographics:**
- Age: 28-40
- Role: Software Engineer, ML Engineer, or AI Researcher
- Technical Level: Advanced (familiar with LLM APIs, cloud architectures)
- Location: Remote or tech hub (SF, NYC, Seattle, etc.)

**Goals:**
- Learn best practices for agentic system design
- Understand vendor selection for multi-agent systems
- See reference implementations of autonomous task decomposition
- Gain insights for building observable, debuggable AI systems
- Learn instrumentation patterns for agent behavior

**Pain Points:**
- Lack of concrete examples beyond simple chatbots
- Difficulty understanding autonomous decision-making
- No visibility into how different vendors perform in specialized roles
- Missing reference implementations with full observability
- Unclear how to measure and compare agent effectiveness

**Use Case:**
Alex is building a multi-agent system for code review automation and needs to understand:
- How to structure Manager/Worker patterns with sub-workers
- Which vendor excels at orchestration vs. execution
- How to instrument decision-making for debugging
- Cost-effective tool usage strategies
- Autonomous task decomposition patterns

**Success Metrics for Alex:**
- Spends 5+ minutes exploring dashboard
- Views both Simple and Deep workflow tabs
- Returns to view multiple generations
- Understands vendor comparison methodology

---

### 3.2 Secondary Persona: Conference Speaker (Jordan)

**Demographics:**
- Age: 32-50
- Role: Senior Engineer, Tech Lead, or Researcher
- Technical Level: Expert in domain (security, cloud, containers)
- Submission Goal: Get accepted to top-tier tech conferences

**Goals:**
- Generate compelling abstract drafts quickly
- Understand what makes abstracts successful for specific conferences
- Get feedback on alignment with conference style
- Accelerate submission process (with heavy editing)

**Pain Points:**
- Abstract writing is time-consuming
- Uncertain if content matches conference expectations
- Difficult to optimize for specific conference cultures
- Need inspiration and structure

**Use Case:**
Jordan has a novel security research finding and wants to submit to Black Hat. Needs:
- Draft abstract that captures technical depth
- Understanding of Black Hat style expectations
- Quick iteration to refine messaging
- Confidence the abstract aligns with conference culture

**Success Metrics for Jordan:**
- Accepts or "would submit with edits" (quality threshold met)
- Views final abstract within 2 minutes of generation
- Provides feedback (accept/reject/intent)
- Returns for additional conferences/topics

---

## 4. User Journeys

### 4.1 Primary Journey: AI Developer Exploring Agentic Patterns

**Entry Point:** Developer blog post or GitHub reference

**Steps:**

1. **Discovery & Landing**
   - Reads: "This is an instrumentation harness for agent behavior"
   - Understands: Primary value is observability and comparison, not abstracts
   - Sees: Conference/topic selection interface

2. **First Generation (Observe Workflow)**
   - Selects: Black Hat + GenAI (familiar domain for validation)
   - Watches: Real-time workflow (Simple view initially)
   - Observes: Manager → Worker → Sub-workers → Evaluator flow
   - Notes: Vendor assignments revealed after start (no bias)

3. **Deep Dive (Explore Decision Events)**
   - Switches: Simple → Deep workflow view
   - Examines: Tool call details, sub-worker spawn decisions
   - Traces: Artifact dependencies and evidence chains
   - Downloads: Complete artifacts for offline review

4. **Dashboard Analysis (Primary Value)**
   - Navigates: To Analytics Dashboard
   - Explores: Tool usage patterns, sub-worker orchestration heatmaps
   - Compares: OpenAI vs. Anthropic effectiveness
   - Identifies: 1-2 interesting patterns for own work

5. **Experimentation (Generate More)**
   - Generates: 2-3 more abstracts (different conferences/topics)
   - Observes: Different vendor combinations
   - Notices: Pattern variations (CFP Extractor + Evidence Researcher parallel execution)

6. **Insight & Application**
   - Realizes: Anthropic Worker spawns more sub-workers in parallel (hypothetical finding)
   - Applies: Insight to own multi-agent architecture decisions
   - Returns: Periodically to check updated dashboard metrics

**Success Indicators:**
- Views dashboard (primary product)
- Generates 3+ abstracts to observe patterns
- Spends 10+ minutes total session time
- Views Deep workflow at least once

---

### 4.2 Secondary Journey: Conference Speaker Generating Abstract

**Entry Point:** Friend recommendation or conference submission deadline

**Steps:**

1. **Urgent Need**
   - Has: Novel technical contribution to share
   - Needs: Abstract draft for re:Invent submission
   - Timeline: Submission due in 3 days

2. **Quick Generation**
   - Selects: AWS re:Invent + Cloud Architecture
   - Waits: 1-2 minutes (monitors Simple workflow)
   - Receives: Abstract with title

3. **Quality Assessment**
   - Reads: Generated abstract
   - Evaluates: Against own knowledge of re:Invent style
   - Decides: "Would submit with edits" (needs refinement but solid foundation)

4. **Optional Exploration**
   - May view: Workflow tab to understand how abstract was created
   - May view: Dashboard briefly (curiosity)
   - Primarily focused: On final output quality

5. **Iteration or Exit**
   - If accepted: Exits with draft to edit offline
   - If rejected: Generates 1-2 more with different parameters
   - Provides feedback: Accept/reject/intent signals

**Success Indicators:**
- Accepts or "would submit with edits" (60%+ target)
- Generation completes in <2 minutes
- Views Results tab (not necessarily workflow/dashboard)
- Provides feedback

---

## 5. User Stories & Acceptance Criteria

### Epic 1: User Interface & Experience

#### Story 1.1: Landing Page & Conference Selection

**As an** AI developer  
**I want to** see a clear explanation that this is an instrumentation harness  
**So that** I understand the primary value is observability, not production abstracts

**Acceptance Criteria:**
- [ ] Landing page displays: "This is an instrumentation harness for agent behavior"
- [ ] Non-goals section visible: "Not intended to produce submission-ready abstracts without editing"
- [ ] Conference dropdown shows exactly 5 options: Black Hat USA, AWS re:Invent, KubeCon, Gartner IT Symposium, Google Cloud Next
- [ ] Topic dropdown shows exactly 8 options: AI/ML & GenAI, Security & Zero Trust, Cloud Architecture & Infrastructure, Kubernetes & Containers, Platform Engineering & DevOps, Networking & Service Mesh, Data & Analytics, Leadership & IT Governance
- [ ] "Generate Abstract" button is prominent and clearly labeled
- [ ] Page loads in <2 seconds
- [ ] Mobile responsive (works on 360px width minimum)

---

#### Story 1.2: Dual-Layer Workflow Visualization

**As an** AI developer  
**I want to** view agent decision-making in both Simple and Deep modes  
**So that** I can choose my level of detail engagement

**Acceptance Criteria:**

**Simple View:**
- [ ] Timeline shows major steps: Manager → Worker → Sub-workers → Evaluator
- [ ] Artifact cards display for each sub-worker with collapsed preview
- [ ] Key decision summaries shown (e.g., "Worker spawned CFP Extractor to analyze conference rules")
- [ ] Visual progress indicators update in real-time
- [ ] Parallel execution visualized (sub-workers running simultaneously)
- [ ] Tab labeled "Workflow (Simple)"
- [ ] Default view on first load

**Deep View:**
- [ ] Complete tool call details with parameters and results summary
- [ ] Raw source snippets (not full payloads, max 200 chars per source)
- [ ] Token usage and timing per step
- [ ] Evaluator full payload and reasoning displayed
- [ ] Artifact dependency graphs (visual tree showing which artifacts feed which)
- [ ] Evidence chains with clickable pointers to sources
- [ ] Tab labeled "Workflow (Deep)"
- [ ] Switch between Simple/Deep without losing place

**Both Views:**
- [ ] Real-time updates via WebSocket (fallback to polling if WS fails)
- [ ] Vendor assignments revealed after generation starts (not before)
- [ ] Clearly labeled which vendor is Manager, which is Worker
- [ ] Logs preserved after generation completes (can review)

---

#### Story 1.3: Results Display & User Feedback

**As a** conference speaker  
**I want to** quickly see the final abstract and provide feedback  
**So that** I can evaluate quality and signal my intent

**Acceptance Criteria:**
- [ ] Results tab shows clean display of final abstract title and content
- [ ] Iteration selected by Manager is displayed (0-4)
- [ ] Vendor assignments shown (Manager: X, Worker: Y)
- [ ] Three feedback options clearly presented:
  - [ ] 👍 Accept button
  - [ ] 👎 Reject button
  - [ ] ⭐ Submission Intent radio buttons: "Would submit with edits" | "Would not submit"
- [ ] Optional comment field (max 500 chars)
- [ ] Feedback submission triggers confirmation message
- [ ] Abstract is copyable (select + copy works)
- [ ] Download button for abstract (plain text)
- [ ] Results tab accessible immediately after generation completes

---

#### Story 1.4: Real-Time Generation Progress

**As a** user  
**I want to** see progress indicators during generation  
**So that** I know the system is working and how long it will take

**Acceptance Criteria:**
- [ ] Loading spinner appears immediately after "Generate Abstract" clicked
- [ ] Progress messages update every 5-10 seconds:
  - "Manager formulating objectives..."
  - "Worker planning execution strategy..."
  - "Spawning sub-workers..."
  - "CFP Extractor analyzing conference style..."
  - "Evidence Researcher gathering recent trends..."
  - "Draft Generator creating candidates..."
  - "Red Team Reviewer validating quality..."
  - "Evaluator assessing conference alignment..."
  - "Manager evaluating output..."
- [ ] Estimated time shown: "This typically takes 1-2 minutes"
- [ ] Progress bar or percentage (if deterministic steps)
- [ ] If generation exceeds 3 minutes, message: "This is taking longer than usual, but still processing..."
- [ ] WebSocket connection status indicator (green dot = connected)
- [ ] Graceful error message if generation fails

---

### Epic 2: Multi-Agent Orchestration

#### Story 2.1: Manager Agent - High-Level Orchestration

**As the** system  
**I need** Manager to formulate high-level objectives and evaluate results  
**So that** abstracts align with conference requirements

**Acceptance Criteria:**
- [ ] Manager receives user input: conference + topic
- [ ] Manager formulates high-level goal (not prescriptive implementation instructions)
- [ ] Goal example: "Generate an abstract for Black Hat on GenAI demonstrating cutting-edge security implications"
- [ ] Manager does NOT tell Worker which tools to use
- [ ] Manager does NOT tell Worker to spawn sub-workers
- [ ] Manager has access to conference requirements lookup tool
- [ ] Manager evaluates Worker output against conference requirements
- [ ] Manager provides specific feedback with cited abstract sections (not just "try again")
- [ ] Feedback format: "Section 2 lacks technical depth in methodology explanation"
- [ ] Manager can reject up to 4 times (5 total iterations hard cap enforced)
- [ ] Creativity increases linearly: 0.3 → 0.4 → 0.5 → 0.6 → 0.7
- [ ] Manager selects best abstract from all 5 iterations
- [ ] All Manager decisions logged as decision events

---

#### Story 2.2: Worker Agent - Autonomous Execution

**As the** system  
**I need** Worker to autonomously research and coordinate sub-workers  
**So that** task decomposition and tool usage patterns are observable

**Acceptance Criteria:**
- [ ] Worker receives high-level goal from Manager (no implementation details)
- [ ] Worker autonomously decides execution strategy
- [ ] Worker can choose to spawn sub-workers or not (autonomous decision)
- [ ] Worker can choose which sub-workers to spawn (any combination of 4 types)
- [ ] Worker can coordinate parallel vs. sequential execution
- [ ] Worker has access to:
  - [ ] DynamoDB conference data lookup
  - [ ] Web search API (Tavily or SerpAPI)
  - [ ] Ability to spawn sub-workers
- [ ] Worker reads artifacts from DynamoDB scratch space
- [ ] Worker makes decisions about information sufficiency
- [ ] Worker synthesizes final abstract from sub-worker artifacts
- [ ] On retry: Worker interprets Manager feedback and adjusts strategy
- [ ] Worker respects cost guardrails (max 2 web searches per sub-worker per iteration)
- [ ] Worker must include evidence pointers in final output
- [ ] All Worker decisions logged as decision events with rationale

**Hard Constraints Enforced:**
- [ ] Worker may spawn sub-workers
- [ ] Sub-workers may NOT spawn additional workers (hard constraint enforced in prompts)
- [ ] Artifacts must be written to DynamoDB scratch space (no long context memory)

---

#### Story 2.3: Sub-Worker Spawning & Coordination

> **⏸️ SUPERSEDED (2026-01-16):** This story has been replaced by the Worker's native ReAct tool loop.
> Instead of spawning separate Lambda functions, the Worker now calls tools directly within a single
> Lambda execution. This simplifies orchestration while maintaining observability.
> 
> **Replacement:** Worker uses direct tool calls with Action Points system:
> - `dynamodb_lookup` (1pt) - Conference rules/examples
> - `web_search` (1pt) - Tavily API
> - `search_recent_content` (1pt) - Topic-specific search
> - `search_abstracts` (2pt) - SQLite FTS keyword search
> - `red_team_review` (1pt) - LLM quality review
> - `submit_abstract` (0pt) - Terminal action
> 
> Worker gets 3 action points per iteration, ensuring multi-iteration workflows.

<details>
<summary>Original Story (archived for reference)</summary>

**As the** Worker agent  
**I need to** spawn specialized sub-workers for bounded tasks  
**So that** parallel execution and task decomposition are demonstrable

**Acceptance Criteria:**

**General Sub-Worker Behavior:**
- [ ] Sub-workers operate independently with strict contracts
- [ ] Sub-workers write artifacts to DynamoDB scratch space
- [ ] All artifacts follow standard envelope structure (meta, data, quality_signals, provenance, overflow, execution)
- [ ] Sub-workers include evidence pointers in all outputs
- [ ] Sub-workers can execute in parallel where applicable
- [ ] Sub-workers have 30-second timeout
- [ ] Sub-workers cannot spawn additional workers (enforced)

**Cost Guardrails:**
- [ ] Max 2 web search calls per sub-worker per iteration (enforced in tool wrapper)
- [ ] DynamoDB lookups unlimited
- [ ] Token usage tracked per sub-worker
- [ ] If job estimated cost > $5, Worker enters "minimal tool mode"

**Sub-Worker Types (4 available):**

1. **CFP/Style Extractor**
   - [ ] Tools: DynamoDB conference rules, DynamoDB past abstracts
   - [ ] Output: `style_profile_v1.json`
   - [ ] Required fields: structure_requirements, length_constraints, tone_markers, recurring_patterns
   - [ ] Evidence pointers: All claims reference specific past abstracts
   - [ ] Timeout fallback: Use cached style template for conference

2. **Evidence Researcher**
   - [ ] Tools: Web search API (max 2 calls per iteration)
   - [ ] Output: `evidence_bundle_v1.json`
   - [ ] Required fields: top_themes, evidence_items, synthesis, search_queries_used
   - [ ] Evidence pointers: All claims reference URLs
   - [ ] Timeout fallback: Write "evidence unavailable" marker

3. **Draft Generator** (renamed from Abstract Composer)
   - [ ] Inputs: Style profile, Evidence bundle, High-level goal
   - [ ] Output: `draft_candidates_v1.json`
   - [ ] Generates 3-5 distinct candidates
   - [ ] Required fields: candidates array, rationale per candidate, style_alignment scores
   - [ ] Evidence pointers: All claims reference artifacts
   - [ ] Timeout fallback: Worker generates draft itself

4. **Red Team Reviewer**
   - [ ] Inputs: Selected draft, Style profile, Evidence bundle
   - [ ] Output: `review_feedback_v1.json`
   - [ ] Required fields: hallucination_risks, missing_evidence, claims_to_soften, style_compliance_issues
   - [ ] Evidence pointers: All issues reference specific locations
   - [ ] Timeout fallback: Worker runs lightweight self-check prompt

**Parallel Execution Patterns (Worker chooses):**
- [ ] Pattern 1: CFP Extractor + Evidence Researcher in parallel, then Composer, then Reviewer
- [ ] Pattern 2: Sequential (CFP → Evidence → Composer → Reviewer)
- [ ] Pattern 3: Parallel composer candidates + parallel reviewers
- [ ] Logging: Which pattern chosen and why

</details>

---

#### Story 2.4: Evaluator Agent - Blind Assessment

**As the** system  
**I need** an independent evaluator to assess conference alignment  
**So that** decoupled evaluation patterns are demonstrated

**Acceptance Criteria:**
- [ ] Evaluator listens to SNS/SQS queue for evaluation requests
- [ ] Evaluator receives ONLY: {title: string, abstract: string}
- [ ] Evaluator does NOT receive: conference target, user request, system context, vendor info
- [ ] Evaluator answers: "Which conference is this most likely for?"
- [ ] Evaluator returns: {top_3_conferences: [string], confidence_scores: [number], reasons: [string]}
- [ ] Top 5 must be from closed set: [black_hat, reinvent, kubecon, gartner_symposium, google_cloud_next] ONLY
- [ ] Confidence scores sum to 1.0
- [ ] Timeout: 1 minute maximum
- [ ] If timeout: Manager proceeds without Evaluator input (graceful degradation)
- [ ] Evaluator uses Amazon Nova via Bedrock
- [ ] Single async call per generation (no retries to Evaluator)
- [ ] Output logged as decision event with full reasoning

**Single Responsibility (Enforced):**
- [ ] Evaluator does NOT assess quality
- [ ] Evaluator does NOT provide suggestions
- [ ] Evaluator does NOT perform any other tasks

---

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
- [ ] Confusion matrix (5x5 for all conferences):
  
  |  | Pred: Black Hat | Pred: re:Invent | Pred: KubeCon | Pred: Gartner | Pred: GCN |
  |---|-----------------|-----------------|---------------|---------------|-----------|
  | **Actual: Black Hat** | XX | XX | XX | XX | XX |
  | **Actual: re:Invent** | XX | XX | XX | XX | XX |
  | **Actual: KubeCon** | XX | XX | XX | XX | XX |
  | **Actual: Gartner** | XX | XX | XX | XX | XX |
  | **Actual: GCN** | XX | XX | XX | XX | XX |

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
- [ ] Conference field: CLOSED SET ["black_hat", "reinvent", "kubecon", "gartner_symposium", "google_cloud_next"] - validate before write
- [ ] Evaluator top_3: CLOSED SET (same 5 conferences) - validate before write
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
- **Next:** Part 3 - API Specs, Data Models & Implementation Roadmap# Conference Abstract Builder - Product Requirements Document (PRD)
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
  "conference": "black_hat | reinvent | kubecon | gartner_symposium | google_cloud_next",
  "topic": "ai_ml_genai | security_zero_trust | cloud_arch_infra | k8s_containers | platform_devops | networking_mesh | data_analytics | leadership_governance",
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
- [ ] Conference must be in closed set: [black_hat, reinvent, kubecon, gartner_symposium, google_cloud_next]
- [ ] Topic must be in closed set: [ai_ml_genai, security_zero_trust, cloud_arch_infra, k8s_containers, platform_devops, networking_mesh, data_analytics, leadership_governance]
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
- `conference`: black_hat | reinvent | kubecon | gartner_symposium | google_cloud_next (optional filter)

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
      {"conference": "black_hat", "topic": "security_zero_trust", "count": 45},
      {"conference": "reinvent", "topic": "cloud_arch_infra", "count": 38},
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