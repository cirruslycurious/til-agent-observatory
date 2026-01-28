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

