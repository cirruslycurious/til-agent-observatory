# Project Overview

## What Is TIL?

TIL (Agent Workflow Observatory) is a platform for studying multi-agent AI behavior. It uses conference abstract generation as a vehicle to observe, analyze, and compare AI agent workflows.

## Architecture Summary

```
Frontend (React) → API Gateway → Step Functions
                                      ↓
                   Manager Agent (orchestrates)
                                      ↓
                   Worker Agent (executes with tools)
                                      ↓
                   Nova Assessors (scores quality)
                                      ↓
                   Evaluator Agent (blind assessment)
```

## Key Components

| Component | Language | Location | Purpose |
|-----------|----------|----------|---------|
| Manager | Python | `packages/agents/manager/` | Goal formulation, scoring, accept/reject |
| Worker | Python | `packages/agents/worker/` | Tool execution, abstract generation |
| Evaluator | Python | `packages/agents/evaluator/` | Blind conference prediction |
| API | TypeScript | `packages/api/` | REST endpoints |
| Frontend | TypeScript | `packages/frontend/` | React dashboard |
| CDK | TypeScript | `infrastructure/cdk/` | AWS infrastructure |

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: AWS Lambda (Python 3.12), Step Functions
- **Data**: DynamoDB (9 tables), S3
- **AI**: OpenAI GPT-5.2, Anthropic Claude Sonnet 4.5, Amazon Nova

## Primary Documentation

| Topic | Document |
|-------|----------|
| Architecture | `docs/architecture/high-level-architecture.md` |
| Deployment | `docs/guides/DEPLOYMENT.md` |
| Dashboard V2 | `docs/dashboard/DASHBOARD-V2-COMPLETE-ARCHITECTURE.md` |
| API Spec | `docs/architecture/rest-api-spec.md` |

## Quick Commands

```bash
# Build Lambda layers
./scripts/bundle-lambda-layers.sh

# Deploy to AWS
cd infrastructure/cdk && npx cdk deploy --all --profile YOUR_PROFILE

# Start frontend dev
cd packages/frontend && npm run dev
```
