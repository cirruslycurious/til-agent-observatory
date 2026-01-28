# Deployment Guide

This guide covers deploying the TIL Agent Workflow Observatory to AWS.

## Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend build, CDK |
| Python | 3.12+ | Lambda functions |
| Docker | Latest | Lambda layer builds |
| AWS CLI | 2.x | AWS operations |
| AWS CDK | 2.120+ | Infrastructure deployment |

### AWS Account Setup

1. **Create an AWS Account** (if you don't have one)

2. **Configure AWS CLI Profile**:
   ```bash
   aws configure --profile your-profile-name
   # Enter your Access Key ID, Secret Access Key, and region (us-east-1 recommended)
   ```

3. **Store API Keys in Parameter Store**:
   ```bash
   # OpenAI API Key
   aws ssm put-parameter \
     --name "/conference-abstract/dev/openai-api-key" \
     --value "sk-your-openai-key" \
     --type SecureString \
     --profile your-profile-name

   # Anthropic API Key
   aws ssm put-parameter \
     --name "/conference-abstract/dev/anthropic-api-key" \
     --value "sk-ant-your-anthropic-key" \
     --type SecureString \
     --profile your-profile-name

   # Tavily API Key (for web search)
   aws ssm put-parameter \
     --name "/conference-abstract/dev/tavily-api-key" \
     --value "tvly-your-tavily-key" \
     --type SecureString \
     --profile your-profile-name
   ```

4. **Bootstrap CDK** (first time only):
   ```bash
   cd infrastructure/cdk
   npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1 --profile your-profile-name
   ```

---

## External Dependencies (Not Created by CDK)

The following resources must be created **manually** before deploying CDK stacks:

### Required

| Resource | Purpose | How to Create |
|----------|---------|---------------|
| **SSM Parameters** | API keys for LLM providers | See "Store API Keys" above |
| **Frontend S3 Bucket** | Static website hosting | See below |

#### Create Frontend S3 Bucket

```bash
# Create bucket (name must be globally unique)
aws s3 mb s3://your-frontend-bucket-name --profile your-profile-name

# Enable static website hosting
aws s3 website s3://your-frontend-bucket-name --index-document index.html --error-document index.html --profile your-profile-name
```

Then update `infrastructure/cdk/stacks/frontend-stack.ts` line 47 with your bucket name.

### Optional (for Custom Domain)

| Resource | Purpose | How to Create |
|----------|---------|---------------|
| **ACM Certificate** | HTTPS for custom domain | Must be in `us-east-1` for CloudFront |
| **Route 53 Hosted Zone** | DNS management | Or use external DNS provider |

See [Custom Domain](#custom-domain-optional) section below for details.

### SSM Parameters Reference

The system reads these parameters at runtime:

| Parameter Path | Required | Description |
|----------------|----------|-------------|
| `/conference-abstract/dev/openai-api-key` | Yes | OpenAI API key |
| `/conference-abstract/dev/anthropic-api-key` | Yes | Anthropic API key |
| `/conference-abstract/dev/tavily-api-key` | Yes | Tavily web search API key |
| `/conference-abstract/system-enabled` | No | Kill switch (default: enabled) |

---

## Configuration

### 1. Environment Variables

Set these before deploying:

```bash
export SERVER_SECRET="your-random-secret-for-token-signing"
export SEARCH_ABSTRACTS_API_URL="https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/api/v1/search-abstracts"
```

**Note**: `SEARCH_ABSTRACTS_API_URL` can be set after first deploy once you know your API Gateway ID.

### 2. CDK Context Variables (Optional)

For custom domain deployment, pass these via `-c` flags:

```bash
npx cdk deploy --all --profile your-profile-name \
  -c acmCertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID \
  -c frontendBucketName=your-frontend-bucket
```

### 3. Update Placeholder Values

Edit `infrastructure/cdk/stacks/frontend-stack.ts` line 47:
```typescript
// Replace with your S3 bucket name
this.bucket = s3.Bucket.fromBucketName(this, 'FrontendBucket', 'your-frontend-bucket');
```

### 2. Create Frontend Environment

```bash
cp packages/frontend/.env.example packages/frontend/.env.production
# Edit with your API Gateway URL (available after first deploy)
```

---

## Deployment Steps

### Step 1: Build Lambda Layers

**Important**: Docker must be running for this step.

```bash
# Verify Docker is running
docker ps

# Build both Lambda layers
./scripts/bundle-lambda-layers.sh

# Verify layer sizes
du -sh packages/agents/layers/*/python
# Expected:
# 36-38M  python-dependencies/python  (Layer 1)
# ~640K   shared-packages/python      (Layer 2)
```

### Step 2: Deploy Infrastructure

```bash
cd infrastructure/cdk

# Install CDK dependencies
npm install

# Preview changes (recommended)
npx cdk diff --all --profile your-profile-name

# Deploy all stacks
npx cdk deploy --all --profile your-profile-name --require-approval never
```

**Deployment order** (handled automatically by CDK):
1. `TilDataStack` - DynamoDB tables, S3 bucket
2. `TilApiStack` - API Gateway
3. `TilWorkflowStack` - Lambda functions, Step Functions
4. `TilComputeStack` - API handler Lambda
5. `TilFrontendStack` - CloudFront, S3 deployment

### Step 3: Note Your API Gateway URL

After deployment, CDK outputs your API Gateway URL:

```
Outputs:
TilApiStack.ApiEndpoint = https://xxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
```

Update `packages/frontend/.env.production`:
```env
VITE_API_BASE_URL=https://xxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
```

### Step 4: Deploy Frontend (with API URL)

```bash
# Rebuild frontend with correct API URL
cd packages/frontend
npm run build

# Redeploy frontend stack
cd ../../infrastructure/cdk
npx cdk deploy TilFrontendStack --profile your-profile-name
```

---

## CDK Stacks Reference

| Stack | Resources | Deploy When |
|-------|-----------|-------------|
| **TilDataStack** | 9 DynamoDB tables, S3 bucket | Schema changes |
| **TilApiStack** | API Gateway, CORS config | API config changes |
| **TilWorkflowStack** | Lambda layers, 6 Lambdas, Step Functions | Code changes |
| **TilComputeStack** | API handler Lambda, Search Lambda | API code changes |
| **TilFrontendStack** | CloudFront, S3 deployment | Frontend changes |

### Deploying Individual Stacks

```bash
# Just the workflow (most common)
npx cdk deploy TilWorkflowStack --profile your-profile-name

# Just the frontend
npx cdk deploy TilFrontendStack --profile your-profile-name

# Data stack only
npx cdk deploy TilDataStack --profile your-profile-name
```

---

## Verifying Deployment

### Check API Health

```bash
curl https://YOUR_API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod/api/v1/system/health
```

Expected response:
```json
{"status": "healthy", "version": "1.0.0"}
```

### Check Lambda Functions

```bash
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `til-`)].FunctionName' --profile your-profile-name
```

Expected functions:
- `til-manager-agent`
- `til-worker-agent`
- `til-evaluator-agent`
- `til-api-handler`
- `til-job-summary-generator`
- `til-assess-abstract-primary`
- `til-assess-abstract-secondary`

### Check Step Functions

```bash
aws stepfunctions list-state-machines --query 'stateMachines[?contains(name, `til`)].name' --profile your-profile-name
```

---

## Troubleshooting

### Lambda Layer Build Failures

**Symptom**: Layer 1 is only 12MB instead of 36-38MB

**Cause**: Docker not running or network issues

**Solution**:
```bash
docker ps  # Verify Docker is running
./scripts/bundle-lambda-layers.sh  # Rebuild
```

### Import Errors in Lambda

**Symptom**: `Runtime.ImportModuleError: No module named 'xxx'`

**Cause**: Layer not deployed or wrong architecture

**Solution**:
```bash
# Rebuild layers with Docker
./scripts/bundle-lambda-layers.sh

# Redeploy workflow stack
npx cdk deploy TilWorkflowStack --profile your-profile-name
```

### Frontend 404 Errors

**Symptom**: Frontend loads but API calls return 404

**Cause**: Missing or incorrect `VITE_API_BASE_URL`

**Solution**:
1. Check `.env.production` has correct API Gateway URL
2. Rebuild: `npm run build`
3. Redeploy: `npx cdk deploy TilFrontendStack --profile your-profile-name`

### Step Functions Execution Failures

**Symptom**: Jobs fail immediately

**Diagnosis**:
```bash
# List recent executions
aws stepfunctions list-executions \
  --state-machine-arn "arn:aws:states:us-east-1:YOUR_ACCOUNT_ID:stateMachine:til-workflow" \
  --profile your-profile-name \
  --max-items 5

# Get execution details
aws stepfunctions describe-execution \
  --execution-arn "arn:aws:states:us-east-1:YOUR_ACCOUNT_ID:execution:til-workflow:job-xxx" \
  --profile your-profile-name
```

---

## Custom Domain (Optional)

To use a custom domain:

1. **Request ACM Certificate** (in us-east-1):
   ```bash
   aws acm request-certificate \
     --domain-name your-domain.example.com \
     --validation-method DNS \
     --region us-east-1 \
     --profile your-profile-name
   ```

2. **Validate Certificate** via DNS (add CNAME record)

3. **Update `frontend-stack.ts`** with certificate ARN

4. **Configure Route 53** to point to CloudFront

---

## Estimated Costs

For development/testing (< 100 jobs/day):

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Lambda | $5-15 |
| DynamoDB | $5-10 |
| S3 | < $1 |
| API Gateway | $3-5 |
| Step Functions | $5-10 |
| CloudFront | < $1 |
| **Total** | **~$20-40/month** |

**Note**: LLM API costs (OpenAI, Anthropic) are separate and depend on usage.
