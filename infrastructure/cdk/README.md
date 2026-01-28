# Infrastructure (AWS CDK)

AWS CDK infrastructure as code for the TIL Agent Workflow Observatory.

## Stacks

| Stack | Resources | Depends On |
|-------|-----------|------------|
| **TilDataStack** | 11 DynamoDB tables, S3 bucket | - |
| **TilApiStack** | REST API Gateway, WebSocket API | - |
| **TilWorkflowStack** | Step Functions, Agent Lambdas (manager, worker, evaluator) | DataStack |
| **TilComputeStack** | API handler Lambdas, EventBridge rules | DataStack, ApiStack, WorkflowStack |
| **TilFrontendStack** | CloudFront distribution, S3 website | ApiStack |
| **TilMonitoringStack** | CloudWatch dashboards (placeholder) | All |

## Quick Start

```bash
# Install dependencies
npm install

# Preview changes
npx cdk diff --all --profile YOUR_PROFILE

# Deploy all stacks
npx cdk deploy --all --profile YOUR_PROFILE
```

## Prerequisites

See [DEPLOYMENT.md](../../docs/guides/DEPLOYMENT.md) for complete setup instructions including:
- Required SSM parameters (API keys)
- Frontend S3 bucket creation
- Lambda layer builds

## Commands

```bash
npx cdk synth          # Generate CloudFormation templates
npx cdk diff           # Show pending changes
npx cdk deploy --all   # Deploy all stacks
npx cdk destroy --all  # Tear down all stacks
```

## First-Time Setup

```bash
# Bootstrap CDK (once per account/region)
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1 --profile YOUR_PROFILE
```
