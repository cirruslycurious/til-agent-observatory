# Error Handling & Edge Cases

## Error-1: Sub-Worker Timeout

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

## Error-2: Evaluator Timeout

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

## Error-3: Budget Exceeded

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

## Error-4: All Sub-Workers Timeout

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

## Error-5: Manager Rejects All 5 Iterations

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

## Error-6: Invalid Artifact Schema

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

## Error-7: API Rate Limit Hit

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

## Error-8: Global Kill Switch Activated

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

