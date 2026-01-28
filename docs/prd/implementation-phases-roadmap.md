# Implementation Phases & Roadmap

**Timeline Note:** Phases labeled as "Sprints" (2-week iterations) rather than literal calendar weeks to allow for flexibility and actual team velocity.

---

## Phase 1: Core Infrastructure (Sprint 1)

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

## Phase 2: Manager & Worker Agents (Sprints 2-3)

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

## Phase 3: Sub-Worker Implementation (Sprints 4-5)

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

## Phase 4: Evaluator & Cost Controls (Sprint 6)

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

## Phase 5: Frontend & Visualization (Sprints 7-8)

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

## Phase 6: Analytics Dashboard (Sprints 9-10)

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

## Phase 7: Integration Testing & Optimization (Sprint 11))

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

## Phase 8: Beta Launch & Iteration (Sprints 12-13)

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

## Phase 9: Public Launch (Sprint 14))

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

