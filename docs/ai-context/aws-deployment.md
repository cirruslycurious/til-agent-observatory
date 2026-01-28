# AWS Deployment Context

## CDK Stacks

| Stack | Purpose | Deploy When |
|-------|---------|-------------|
| TilDataStack | DynamoDB tables, S3 | Schema changes |
| TilApiStack | API Gateway | API config changes |
| TilWorkflowStack | Lambdas, Step Functions, Layers | Code changes |
| TilComputeStack | API Lambda, Search Lambda | API code changes |
| TilFrontendStack | CloudFront, S3 | Frontend changes |

## Common Deployment Commands

```bash
# Preview changes
npx cdk diff TilWorkflowStack --profile YOUR_PROFILE

# Deploy specific stack
npx cdk deploy TilWorkflowStack --profile YOUR_PROFILE

# Deploy all
npx cdk deploy --all --profile YOUR_PROFILE
```

## Lambda Functions

| Function | Purpose |
|----------|---------|
| `til-manager-agent` | Goal formulation, scoring |
| `til-worker-agent` | Tool execution, generation |
| `til-evaluator-agent` | Blind assessment |
| `til-api-handler` | REST API endpoints |
| `til-job-summary-generator` | Dashboard aggregation |
| `til-assess-abstract-primary` | Nova scorer 1 |
| `til-assess-abstract-secondary` | Nova scorer 2 |

## DynamoDB Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `til-jobs` | Job records | job_id (PK) |
| `til-job-summaries` | Pre-aggregated analytics | job_id (PK), status (GSI) |
| `til-generation-metrics` | Iteration metrics | job_id (PK), iteration (SK) |
| `til-decision-events-by-job` | Event log | job_id (PK), event_id (SK) |
| `til-artifacts` | Tool outputs | job_id (PK), artifact_id (SK) |
| `til-job-budgets` | Budget tracking | job_id (PK) |
| `til-conference-data` | Conference examples | conference (PK), data_type (SK) |

## Secrets (Parameter Store)

API keys are stored in AWS Parameter Store (SecureString):

```
/conference-abstract/dev/openai-api-key
/conference-abstract/dev/anthropic-api-key
/conference-abstract/dev/tavily-api-key
```

## Important Notes

1. **Always build layers before deploying** - `./scripts/bundle-lambda-layers.sh`
2. **Never update Lambda layers manually** - Causes CloudFormation drift
3. **Use `cdk diff` before deploy** - Preview changes
4. **Layers are immutable** - Each deploy creates new versions
