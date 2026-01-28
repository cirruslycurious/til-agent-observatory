# Security

## Input Validation

- **Validation Library:** 
  - Python: pydantic
  - TypeScript: zod
- **Validation Location:** API Gateway request validation + Lambda handler validation
- **Required Rules:**
  - All external inputs MUST be validated
  - Validation at API boundary before processing
  - Whitelist approach preferred over blacklist
  - Conference/topic must be in closed sets

## Authentication & Authorization

**Security Model (Clarified):**

**Option A: Public Demo MVP (Selected)**
- **Public read endpoints:** No API key required (`/dashboard/*`, `/status/*` with token)
- **Job-specific endpoints:** Protected by `job_read_token` capability token (Authorization: Bearer)
- **Write endpoints:** Protected by AWS WAF + rate limiting + bot detection
- **Rationale:** Browser-based public demo cannot securely store API keys. Capability tokens provide sufficient security for job-specific access.

**Option B: API Key (Server-to-Server Only)**
- **API key required:** Only for server-to-server or internal testing
- **Public site:** Uses CloudFront + Lambda@Edge proxy to inject API key (hides key from browser)
- **Rationale:** More secure but adds complexity. Not recommended for MVP.

**Selected Approach: Option A**

- **No user authentication:** Anonymous usage (acceptable for MVP)
- **Public endpoints:** `/dashboard/*` only (aggregated data, no job-level trace exposure)
- **Token-protected endpoints:** `/status/{job_id}`, `/workflow/{job_id}`, `/feedback/{job_id}` require `job_read_token` (not public, prevents enumeration)
- **Capability-based access:** `job_read_token` required for job-specific data
- **Rate limiting:** AWS WAF + API Gateway rate limits (100 req/min per IP globally, 10 gen/min per IP for `/generate`)
- **Bot protection:** AWS WAF rules for common bot patterns
- **Session Management:** No sessions (stateless)
- **Token Verification:** DynamoDB lookup and SHA-256 hash comparison

## Secrets Management

- **Development:** AWS Parameter Store (encrypted with KMS)
- **Production:** AWS Parameter Store with KMS encryption (same as dev)
- **Code Requirements:**
  - NEVER hardcode secrets
  - Access via boto3/SSM Parameter Store only
  - No secrets in logs or error messages
  - API keys rotated manually (MVP)

## API Security

- **Rate Limiting:** 
  - Global: 100 requests/minute per IP (API Gateway)
  - /generate specific: 10 generations/minute per IP (Lambda guard)
- **CORS Policy:** Allow specific origins (configured in API Gateway)
- **Security Headers:** 
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Strict-Transport-Security: max-age=31536000
- **HTTPS Enforcement:** All traffic via HTTPS (API Gateway default)

## Data Protection

- **Encryption at Rest:** AWS managed keys (DynamoDB, S3 default encryption)
- **Encryption in Transit:** TLS 1.2+ (API Gateway, all AWS service calls)
- **PII Handling:** No PII intentionally collected. Incidental PII from tool outputs sanitized in UI (regex for emails, phones)
- **Logging Restrictions:** No API keys, tokens, or sensitive data in CloudWatch logs

## Dependency Security

- **Scanning Tool:** 
  - npm audit (Node.js)
  - pip-audit or safety (Python)
- **Update Policy:** Monthly dependency updates, security patches immediately
- **Approval Process:** All new dependencies require PR review

## Security Testing

- **SAST Tool:** GitHub CodeQL (automated on PR)
- **DAST Tool:** Not implemented for MVP
- **Penetration Testing:** Manual review post-MVP

---
