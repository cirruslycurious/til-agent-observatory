# Non-Functional Requirements

## NFR-1: Performance

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

## NFR-2: Reliability

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

## NFR-3: Scalability

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

## NFR-4: Security

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

## NFR-5: Observability

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

## NFR-6: Maintainability

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

