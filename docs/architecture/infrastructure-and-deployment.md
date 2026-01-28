# Infrastructure and Deployment

## Infrastructure as Code

- **Tool:** AWS CDK 2.120.0
- **Location:** `infrastructure/cdk/`
- **Approach:** TypeScript CDK app with multiple stacks (API, Compute, Data, Monitoring)

## Deployment Strategy

- **Strategy:** Blue/Green deployment for Lambda functions, direct updates for infrastructure
- **CI/CD Platform:** GitHub Actions
- **Pipeline Configuration:** `.github/workflows/deploy.yml`

## Environments

- **dev:** Development environment for testing - us-east-1, minimal resources
- **prod:** Production environment - us-east-1, full resources, monitoring enabled

## Environment Promotion Flow

```
Code Push → GitHub Actions
  ↓
Run Tests (unit, integration)
  ↓
Build Lambda Packages
  ↓
CDK Synth
  ↓
Deploy to dev
  ↓
Run Integration Tests
  ↓
Manual Approval
  ↓
Deploy to prod
```

## Rollback Strategy

- **Primary Method:** CDK rollback via previous deployment
- **Trigger Conditions:** Error rate >5%, cost spike, critical bugs
- **Recovery Time Objective:** <15 minutes

---
