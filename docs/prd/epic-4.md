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

