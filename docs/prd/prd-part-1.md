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
- 3 curated conferences: Black Hat USA, AWS re:Invent, KubeCon
- 2 LLM vendors: OpenAI and Anthropic
- Cost guardrails and monitoring

**Out of Scope (Explicitly):**
- Submission-ready abstracts without human editing
- General-purpose agent framework
- More than 3 conferences
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
- [ ] Conference dropdown shows exactly 3 options: Black Hat USA, AWS re:Invent, KubeCon + CloudNativeCon
- [ ] Topic dropdown shows exactly 5 options: GenAI, Cybersecurity, Containers, Cloud Architecture, DevOps
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
- [ ] Top 3 must be from closed set: [black_hat, reinvent, kubecon] ONLY
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
- **Then:** Part 3 - API Specs, Data Models & Implementation Roadmap