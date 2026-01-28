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

