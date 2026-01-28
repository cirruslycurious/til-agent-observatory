# CDK Stacks Overview

**Complete guide to all CDK stacks in the project.**

---

## Stack Architecture

```
TilDataStack (Foundation)
    ↓ provides: DynamoDB tables, S3 buckets
    
TilApiStack (API Gateway)
    ↓ provides: REST API, WebSocket API
    
TilWorkflowStack (Backend Logic)
    ↓ uses: TilDataStack
    ↓ provides: Step Functions, Agent Lambdas, Lambda Layers
    ↓ exports: State machine ARN
    
TilComputeStack (API Handlers)
    ↓ uses: TilDataStack, TilApiStack, TilWorkflowStack
    ↓ imports: State machine ARN from TilWorkflowStack
    ↓ provides: API Lambda, Search Lambda, Job Summary Generator Lambda
    ↓ provides: Dashboard V2 endpoints (7 research-focused dashboards)
    
TilFrontendStack (UI)
    ↓ independent (no dependencies)
    ↓ provides: S3 deployment, CloudFront distribution
    
TilMonitoringStack (Observability)
    ↓ uses: TilDataStack, TilApiStack, TilComputeStack
    ↓ provides: CloudWatch dashboards, alarms
```

---

## Stack Details

### 1. TilDataStack

**Purpose:** Data storage foundation

**Resources:**
- 10 DynamoDB tables:
  - `til-jobs` - Job metadata
  - `til-artifacts` - Generated content
  - `til-generation-metrics` - Performance metrics
  - `til-daily-metrics` - Aggregated daily stats
  - `til-decision-events-by-job` - Audit trail
  - `til-decision-event-ids` - Event deduplication
  - `til-job-summaries` - **NEW!** Pre-aggregated job data for Dashboard V2 (10x faster queries)
  - `til-job-budgets` - Cost tracking
  - `til-web-search-guardrails` - Rate limiting
  - `til-feedback` - User feedback
- 1 S3 bucket:
  - `your-artifacts-bucket` - Overflow storage for large artifacts

**Billing Mode:** On-demand (pay per request)

**Export:** None

**Dependencies:** None

**Deploy Time:** 3-5 minutes

---

### 2. TilApiStack

**Purpose:** API Gateway infrastructure

**Resources:**
- REST API: `til-api`
  - CORS enabled
  - 24 routes defined in TilComputeStack
- WebSocket API: `til-websocket-api` (placeholder)

**Export:** None (exports `restApi` object to other stacks)

**Dependencies:** None

**Deploy Time:** 2-3 minutes

---

### 3. TilWorkflowStack

**Purpose:** Agentic workflow orchestration

**Resources:**
- Step Functions state machine: `til-workflow`
  - Manager → Worker → Evaluator loop
  - Max 5 iterations
- 3 Lambda functions:
  - `til-manager` (Python 3.12, 512 MB, 5 min timeout)
  - `til-worker` (Python 3.12, 1024 MB, 15 min timeout)
  - `til-evaluator` (Python 3.12, 512 MB, 5 min timeout)
- 2 Lambda layers:
  - `python-dependencies` (Layer 1: ~36-38 MB)
  - `shared-packages` (Layer 2: ~640 KB)
- SNS topic: `til-evaluator-requests`
- SQS queue: `til-evaluator-queue` + DLQ

**Export:** 
- `TilWorkflowStateMachineArn` (used by TilComputeStack)

**Dependencies:** TilDataStack

**Deploy Time:** 5-8 minutes

**Critical:** Must build Lambda layers BEFORE deploying this stack!

---

### 4. TilComputeStack

**Purpose:** API request handlers + Dashboard V2 infrastructure

**Resources:**

**Lambda Functions:**
- `til-api-handler` (Node.js 20, 256 MB, 30s timeout)
  - Handles 24 API routes: jobs, workflow, dashboard V1, system
  - Routes: POST/GET /jobs, GET /workflow, GET /dashboard/* (V1 only), GET /system/status
- `til-dashboard-v2-handler` (Node.js 20, 512 MB, 30s timeout) **NEW!**
  - Handles 7 Dashboard V2 routes (research analytics)
  - **Why Separate?** Main API Lambda hit 20 KB policy size limit
  - Minimal permissions: Read-only access to `til-job-summaries` table
  - Routes: All `/api/v1/dashboard/v2/*` endpoints
- `til-abstract-search` (Python 3.12, 512 MB, 30s timeout)
  - SQLite FTS search
  - Route: POST /search-abstracts
- `til-job-summary-generator` (Python 3.12, 256 MB, 30s timeout) **NEW!**
  - Generates pre-aggregated job summaries for Dashboard V2
  - Triggered by EventBridge on job completion/failure/abortion
  - Reads from: `til-jobs`, `til-decision-events`, `til-metrics`
  - Writes to: `til-job-summaries`

**EventBridge Rule:**
- `til-job-completion-summary-trigger` **NEW!**
  - Event pattern: Step Functions execution status change (SUCCEEDED, FAILED, ABORTED)
  - Target: `til-job-summary-generator` Lambda

**API Gateway Routes (31 total):**
- 24 routes → `til-api-handler` (main API Lambda)
- 7 routes → `til-dashboard-v2-handler` (Dashboard V2 Lambda):
  - `GET /api/v1/dashboard/v2/executive` - Executive Summary
  - `GET /api/v1/dashboard/v2/vendors/manager` - Manager Deep Dive
  - `GET /api/v1/dashboard/v2/vendors/worker` - Worker Deep Dive
  - `GET /api/v1/dashboard/v2/context` - Context Effects
  - `GET /api/v1/dashboard/v2/evaluator` - Evaluator Analysis
  - `GET /api/v1/dashboard/v2/tools` - Tool Patterns
  - `GET /api/v1/dashboard/v2/speed` - Speed & Efficiency

**Import:**
- State machine ARN from TilWorkflowStack (via CloudFormation export)

**Dependencies:** TilDataStack, TilApiStack, TilWorkflowStack

**Deploy Time:** 3-5 minutes

**Post-Deploy:** Run `npm run backfill-summaries` to generate summaries for existing jobs

**Lambda Separation Rationale:**
Dashboard V2 uses a separate Lambda to avoid AWS Lambda resource policy size limits (20 KB). With 31 total routes, the main API Lambda's policy exceeded this limit. Splitting Dashboard V2 into its own Lambda with minimal permissions solved the issue.

---

### 5. TilFrontendStack

**Purpose:** React frontend deployment

**Resources:**
- S3 bucket: `your-frontend-bucket` (imported, not created)
- CloudFront distribution:
  - Origin Access Identity (OAI)
  - HTTPS redirect
  - SPA routing (404 → index.html)
  - Cache policy: Optimized
  - Price class: 100 (North America + Europe)
- S3 BucketDeployment:
  - Uploads `packages/frontend/dist/`
  - Automatic cache invalidation

**Export:**
- `TilFrontendURL` - CloudFront domain (your CloudFront distribution URL)
- **Custom Domain:** https://your-domain.example.com (primary URL) ✅
- `TilFrontendDistributionId` - For manual invalidation
- `TilFrontendBucketName` - S3 bucket name

**Dependencies:** None

**Deploy Time:** 
- First: 10-15 minutes (CloudFront creation)
- Updates: 2-3 minutes

**Critical:** Must run `npm run build` in `packages/frontend` BEFORE deploying!

---

### 6. TilMonitoringStack

**Purpose:** Observability and alerting

**Resources:**
- (Placeholder - to be implemented)
- Planned: CloudWatch dashboards, alarms, SNS topics

**Dependencies:** TilDataStack, TilApiStack, TilComputeStack

**Deploy Time:** N/A (not yet implemented)

---

## Deployment Order

### Required Order (Dependencies)

```
1. TilDataStack (no dependencies)
2. TilApiStack (no dependencies)
3. TilWorkflowStack (depends on TilDataStack)
4. TilComputeStack (depends on TilDataStack, TilApiStack, TilWorkflowStack)
5. TilFrontendStack (no dependencies - can deploy anytime)
6. TilMonitoringStack (depends on TilDataStack, TilApiStack, TilComputeStack)
```

### Deploy All (Correct Order)

```bash
npx cdk deploy TilDataStack TilApiStack TilWorkflowStack TilComputeStack TilFrontendStack --profile abstract
```

CDK will automatically handle the dependency order.

---

## File Locations

| Stack | File |
|-------|------|
| **TilDataStack** | `infrastructure/cdk/stacks/data-stack.ts` |
| **TilApiStack** | `infrastructure/cdk/stacks/api-stack.ts` |
| **TilWorkflowStack** | `infrastructure/cdk/stacks/workflow-stack.ts` |
| **TilComputeStack** | `infrastructure/cdk/stacks/compute-stack.ts` |
| **TilFrontendStack** | `infrastructure/cdk/stacks/frontend-stack.ts` |
| **TilMonitoringStack** | `infrastructure/cdk/stacks/monitoring-stack.ts` |
| **App** | `infrastructure/cdk/app.ts` |

---

## Common Operations

### View Stack Status

```bash
aws cloudformation list-stacks \
  --profile abstract \
  --query 'StackSummaries[?starts_with(StackName, `Til`)].{Name:StackName,Status:StackStatus}' \
  --output table
```

### View Stack Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name TilFrontendStack \
  --profile abstract \
  --query 'Stacks[0].Outputs'
```

### Diff Before Deploy

```bash
npx cdk diff TilWorkflowStack --profile abstract
```

### Destroy Stack (DANGER)

```bash
npx cdk destroy TilFrontendStack --profile abstract
```

---

## Stack Outputs Summary

### TilWorkflowStack
- `TilWorkflowStateMachineArn` - Step Functions ARN (exported)

### TilFrontendStack
- `TilFrontendURL` - CloudFront URL
- `TilFrontendDistributionId` - CloudFront ID
- `TilFrontendBucketName` - S3 bucket

---

## Resource Naming Convention

| Resource Type | Pattern | Example |
|---------------|---------|---------|
| **Lambda** | `til-{role}` | `til-manager`, `til-worker` |
| **DynamoDB** | `til-{purpose}` | `til-jobs`, `til-artifacts` |
| **S3** | `{name}` | `your-artifacts-bucket`, `your-frontend-bucket` |
| **Step Functions** | `til-{purpose}` | `til-workflow` |
| **API Gateway** | `til-{type}` | `til-api`, `til-websocket-api` |
| **SNS/SQS** | `til-{purpose}` | `til-evaluator-requests` |

---

## Cost Breakdown by Stack

| Stack | Monthly Cost (Dev) | Monthly Cost (Prod) |
|-------|--------------------|---------------------|
| **TilDataStack** | $5-10 (DynamoDB on-demand) | $20-50 |
| **TilApiStack** | $3-5 (API Gateway) | $10-30 |
| **TilWorkflowStack** | $5-10 (Lambda + Step Functions) | $30-100 |
| **TilComputeStack** | $3-5 (Lambda invocations) | $10-30 |
| **TilFrontendStack** | $5-10 (CloudFront + S3) | $10-30 |
| **Total** | **$20-40/month** | **$80-240/month** |

*Costs vary based on usage. Development assumes ~50 jobs/month, Production assumes ~1000 jobs/month.*

---

## Troubleshooting

### Cross-Stack Reference Errors

**Error:** `Export TilWorkflowStateMachineArn cannot be deleted as it is in use by...`

**Fix:** Deploy stacks in dependency order, or use `--exclusively` flag:
```bash
npx cdk deploy TilWorkflowStack --exclusively --profile abstract
```

---

### Lambda Layer Not Found

**Error:** `Could not find layer version arn:aws:lambda:...`

**Cause:** Layer wasn't built before deployment

**Fix:**
```bash
./scripts/bundle-lambda-layers.sh
npx cdk deploy TilWorkflowStack --profile abstract
```

---

### Frontend Deployment Fails

**Error:** `Cannot find asset at packages/frontend/dist`

**Cause:** Frontend not built before CDK deploy

**Fix:**
```bash
cd packages/frontend
npm run build
cd ../../infrastructure/cdk
npx cdk deploy TilFrontendStack --profile abstract
```

---

## Related Documentation

- **Deployment Checklist:** `docs/DEPLOYMENT-CHECKLIST.md`
- **Frontend CDK Guide:** `docs/frontend-cdk-deployment-guide.md`
- **Backend Deployment:** `docs/deployment-guide.md`
- **Quick Start:** `QUICK-START-DEPLOYMENT.md`
