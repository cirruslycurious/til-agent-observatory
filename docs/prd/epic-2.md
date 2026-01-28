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

