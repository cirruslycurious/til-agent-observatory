# Tech Stack

## Cloud Infrastructure

- **Provider:** AWS (Amazon Web Services)
- **Key Services:** 
  - Lambda (compute)
  - Step Functions (orchestration)
  - DynamoDB (database)
  - S3 (object storage)
  - API Gateway (REST API)
  - WebSocket API (real-time)
  - EventBridge (event routing)
  - SNS/SQS (async messaging)
  - CloudWatch (monitoring)
  - Parameter Store (secrets)
  - Bedrock (Amazon Nova for Evaluator)
- **Deployment Regions:** us-east-1 (primary)

## Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| **Language (Agents)** | Python | 3.11 | Agent Lambda functions | Better LLM SDK support, rich AI libraries |
| **Language (API)** | Node.js | 20.11.0 | API Gateway Lambdas, Frontend | Better ecosystem for web services, faster cold starts |
| **Language (Frontend)** | TypeScript | 5.3.3 | React frontend | Strong typing, excellent tooling |
| **Runtime** | Node.js | 20.11.0 | JavaScript runtime | LTS version, stable performance |
| **Frontend Framework** | React | 18.2.0 | UI framework | Industry standard, large ecosystem |
| **Build Tool** | Vite | 5.0.0 | Frontend build tool | Faster dev server, simpler than Next.js for SPA |
| **State Management** | Zustand | 4.4.0 | Frontend state | Lightweight, simple API |
| **Charting Library** | Recharts | 2.10.0 | Dashboard visualizations | React-native, composable, better for complex dashboards |
| **Styling** | Tailwind CSS | 3.4.0 | CSS framework | Utility-first, fast development |
| **Infrastructure as Code** | AWS CDK | 2.120.0 | Infrastructure definition | Better TypeScript/Python integration, native AWS support |
| **Database** | DynamoDB | On-Demand | Primary data store | Serverless, auto-scaling, fast |
| **Object Storage** | S3 | Intelligent-Tiering | Large artifact storage | Cost-effective, automatic optimization |
| **Orchestration** | Step Functions | Standard | Job state machine | Reliable, visual workflow, built-in error handling |
| **Message Queue** | SQS | Standard | Job queue, Evaluator queue | Reliable, serverless, integrates with Lambda |
| **Pub/Sub** | SNS | Standard | Event notifications | Decouples components, fan-out patterns |
| **Event Router** | EventBridge | Standard | Decision event routing | Event-driven architecture, rule-based routing |
| **API Gateway** | API Gateway | REST + WebSocket | API endpoints | Rate limiting, authentication, WebSocket support |
| **LLM Provider** | OpenAI | API v1 | Manager/Worker LLM | GPT-4, GPT-4 Turbo models |
| **LLM Provider** | Anthropic | API v1 | Manager/Worker LLM | Claude 3.5 Sonnet models |
| **LLM Provider** | Amazon Bedrock | Nova | Evaluator LLM | Amazon Nova via Bedrock for blind evaluation |
| **Web Search** | Tavily | API v1 | External research | Better for AI applications, structured results |
| **Schema Validation** | Pydantic | 2.5.0 | Python artifact validation | Runtime validation, type safety |
| **Schema Validation** | AJV | 8.12.0 | Node.js validation | Fast JSON schema validation |
| **Logging** | CloudWatch Logs | Native | Operational logging | Structured JSON logs, queryable |
| **Tracing** | X-Ray | Native | Distributed tracing | End-to-end request tracing |
| **Monitoring** | CloudWatch | Native | Metrics and alarms | Cost monitoring, error tracking |

---
