# External APIs

## OpenAI API

- **Purpose:** LLM provider for Manager and Worker agents
- **Documentation:** https://platform.openai.com/docs/api-reference
- **Base URL(s):** https://api.openai.com/v1
- **Authentication:** API key (Bearer token)
- **Rate Limits:** Per-account limits, managed via spending caps ($100/month)

**Key Endpoints Used:**
- `POST /chat/completions` - Chat completions (GPT-4, GPT-4 Turbo)

**Integration Notes:** 
- API keys stored in AWS Parameter Store (KMS encrypted)
  - Parameter path: `/conference-abstract/dev/openai-api-key` (SecureString)
  - Status: ✅ Configured (2026-01-14)
- Retry logic with exponential backoff
- Token usage tracked per call for cost monitoring

## Anthropic API

- **Purpose:** LLM provider for Manager and Worker agents
- **Documentation:** https://docs.anthropic.com/claude/reference
- **Base URL(s):** https://api.anthropic.com/v1
- **Authentication:** API key (x-api-key header)
- **Rate Limits:** Per-account limits, managed via spending caps ($100/month)

**Key Endpoints Used:**
- `POST /messages` - Message completions (Claude 3.5 Sonnet)

**Integration Notes:**
- API keys stored in AWS Parameter Store (KMS encrypted)
  - Parameter path: `/conference-abstract/dev/anthropic-api-key` (SecureString)
  - Status: ✅ Configured (2026-01-14)
- Retry logic with exponential backoff
- Token usage tracked per call for cost monitoring

## Amazon Bedrock (Nova)

- **Purpose:** LLM provider for Evaluator agent
- **Documentation:** https://docs.aws.amazon.com/bedrock/
- **Base URL(s):** Bedrock runtime endpoint (region-specific)
- **Authentication:** API key (Bedrock API key)
- **Rate Limits:** Per-model limits, managed via Bedrock quotas

**Key Endpoints Used:**
- `InvokeModel` - Amazon Nova model invocation

**Integration Notes:**
- API keys stored in AWS Parameter Store (KMS encrypted)
  - Parameter path: `/conference-abstract/dev/bedrock-api-key` (SecureString)
  - Status: ✅ Configured (2026-01-14)
- Single async call per generation (no retries)
- 1-minute timeout with graceful degradation

## Tavily API

- **Purpose:** Web search for evidence research
- **Documentation:** https://docs.tavily.com
- **Base URL(s):** https://api.tavily.com/search
- **Authentication:** API key (query parameter or header)
- **Rate Limits:** Per-API-key limits, budget-enforced in tool wrapper (10 normal, 2 minimal mode)

**Key Endpoints Used:**
- `POST /search` - Web search with AI-optimized results

**Integration Notes:**
- API keys stored in AWS Parameter Store (KMS encrypted)
  - Parameter path: `/conference-abstract/dev/tavily-api-key` (SecureString)
  - Status: ✅ Configured (2026-01-14)
- Budget enforcement in tool wrapper (prevents exceeding limits)
- Max 2 calls per sub-worker per iteration (enforced)
- Results stored in S3 if >50KB

---
