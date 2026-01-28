# Shared Packages Directory

This directory contains all shared Python modules used across Lambda functions (Manager, Worker, Evaluator) and the TypeScript API.

## ⚠️ CRITICAL: Import Pattern for New Modules

**When creating new shared modules that import other shared modules, you MUST use this pattern:**

```python
# ✅ CORRECT: Works in both Lambda layers and local development
try:
    # Lambda layer structure: /opt/python/{module_name}
    from artifact_schemas.artifact_envelope import ArtifactEnvelope
    from s3_utils.s3_uploader import upload_artifact_to_s3
    from decision_events.event_logger import log_decision_event
except ImportError:
    # Fallback for local development
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent / 'artifact-schemas'))
    from artifact_envelope import ArtifactEnvelope
    sys.path.append(str(Path(__file__).parent.parent / 's3-utils'))
    from s3_uploader import upload_artifact_to_s3
    sys.path.append(str(Path(__file__).parent.parent / 'decision-events'))
    from event_logger import log_decision_event
```

**Why this matters:**
- **Development:** Directories named `artifact-schemas` with relative paths work
- **Lambda layer:** Renamed to `artifact_schemas` at `/opt/python/artifact_schemas/`
- **Using only `sys.path.append`** will cause `Runtime.ImportModuleError` in Lambda

**Modules that need updating:**
- [ ] `metrics_writer.py` - imports from `enums`
- [ ] `artifact_reader.py` - imports from `s3_utils`
- [ ] `dependency_graph.py` - imports from `decision_events`
- [ ] `enhanced_validator.py` - imports from `schema_validator`
- [x] `artifact_writer.py` - **FIXED** (2026-01-18)

---

## Lambda Layer 2: Shared Internal Packages

All Python modules in this directory are packaged into Lambda Layer 2 (`shared-packages`).

**Layer Size:** ~640 KB (after cleanup)  
**Build Script:** `scripts/bundle-lambda-layers.sh`  
**Deployment:** Via AWS CDK (`infrastructure/cdk/`)

## Module Inventory

### Currently Active in Production

| Module | Size | Used By | Purpose | Story |
|--------|------|---------|---------|-------|
| **decision-events/** | 60 KB | Manager, Worker, Evaluator | Decision event logging with S3 overflow for large details | Story 3.1 |
| **budget-service/** | 72 KB | Manager, Worker | Job budget tracking, LLM cost increments, web search cost tracking, minimal mode activation | Story 4.1, 4.2 |
| **llm-client/** | 44 KB | Manager, Worker, Evaluator | LLM API calls (OpenAI, Anthropic, Bedrock), vendor assignment, model pricing, creativity-to-temperature mapping | Story 2.1, 2.2, 2.4 |
| **tool-wrappers/** | 160 KB | Worker | Tool implementations: web_search, search_abstracts, search_recent_content, dynamodb_lookup, red_team_review | Story 2.2, 3.3 |
| **s3-utils/** | 48 KB | decision_events, tool_wrappers, artifact_reader | S3 uploads/downloads for large artifacts, canonical JSON serialization, gzip compression | Story 6.3 |
| **artifact-schemas/** | 32 KB | tool_wrappers | Pydantic schemas for artifact envelopes, ToolName enum, SuccessStatus enum | Story 3.2, 6.1 |

**Active Total:** ~400 KB

### Planned for Integration (Story 6.1, 6.2, 6.4)

| Module | Size | Planned Use | Purpose | Story |
|--------|------|-------------|---------|-------|
| **artifact-reader/** | 76 KB | API Lambda (TS version active), Python planned | Read artifacts from DynamoDB with S3 overflow handling, dependency graph queries | Story 6.1 (Task 6) |
| **artifact-writer/** | 64 KB | Worker Lambda (Story 6.1 Task 4) | Write artifacts to DynamoDB with idempotency, content-aware versioning, S3 overflow for large artifacts | Story 6.1 (Task 2, 4) |
| **artifact-validator/** | 20 KB | Worker Lambda | Enhanced validation for evidence pointers, sources/claims validation, dependency tracking | Story 3.2 |
| **schema-validator/** | 68 KB | artifact_writer | JSON Schema validation against versioned schema files, runtime gate for artifact writes | Story 6.4 |
| **metrics-writer/** | 28 KB | All agents (Manager, Worker, Evaluator) | Write generation metrics to DynamoDB with closed set validation (Conference, UserIntent enums) | Story 6.2 |
| **enums/** | 24 KB | metrics_writer | Conference and UserIntent closed set enums with validation methods | Story 6.2 |
| **auth/** | 16 KB | Planned for Python, API uses TS | Token verification and hashing for job read tokens | Story 5.1 |

**Planned Total:** ~328 KB

**Grand Total:** ~728 KB ≈ 640 KB documented

## Why Include Planned Modules in Layer 2?

1. **Infrastructure Ready:** Layer 2 is deployed with all modules, avoiding rebuild during Story 6.1/6.2 implementation
2. **API Lambda Uses Them:** TypeScript versions of artifact_reader, auth already active in API
3. **Deployment Cost:** Layer update requires full CDK deployment and Lambda restart (expensive operation)
4. **Integration Path:** Worker Lambda will import artifact_writer when Story 6.1 Task 4 is implemented
5. **Metrics Collection:** All agents will import metrics_writer when Story 6.2 is implemented

## Build Process

**Script:** `scripts/bundle-lambda-layers.sh`

**Steps:**
1. Copy all directories from `packages/shared/` to `packages/agents/layers/shared-packages/python/`
2. Rename hyphenated directories to underscores (e.g., `decision-events` → `decision_events`)
3. Copy `s3_uploader.py` to root for import compatibility
4. **Cleanup (removes ~660 KB of waste):**
   - Remove `.venv/`, `__pycache__/`, `.pytest_cache/`
   - Remove nested duplicate directories (e.g., `tool_wrappers/tool-wrappers/`)
   - Remove test files: `test_*.py`, `*_test.py`, `*.test.ts`, `*.test.py`
   - Remove TypeScript files: `*.ts`, `*.tsx` (not needed for Python Lambda)
   - Remove documentation: `README.md`, `*.md`
   - Remove Node.js files: `package.json`

**Result:** Clean Layer 2 with only Python runtime code (~640 KB)

## Verification

### Check Layer 2 Size
```bash
du -sh packages/agents/layers/shared-packages/python/
# Expected: ~640-700 KB (if much larger, duplicates weren't cleaned)
```

### Check for Unwanted Files
```bash
# Should find NO test files
find packages/agents/layers/shared-packages/python/ -name "test_*.py"

# Should find NO TypeScript files
find packages/agents/layers/shared-packages/python/ -name "*.ts"

# Should find NO nested duplicates
find packages/agents/layers/shared-packages/python/ -mindepth 2 -maxdepth 2 -type d -name "*-*"
```

### Verify Required Modules
```bash
# Check all 13 modules exist
ls -1 packages/agents/layers/shared-packages/python/ | grep -v "\.py$"
# Expected output:
# decision_events
# budget_service
# llm_client
# tool_wrappers
# s3_utils
# artifact_schemas
# artifact_reader
# artifact_writer
# artifact_validator
# schema_validator
# metrics_writer
# enums
# auth

# Check s3_uploader.py at root
ls packages/agents/layers/shared-packages/python/s3_uploader.py
```

## Module Dependencies

### Internal Dependencies (within Layer 2)

```
Manager Lambda:
  → decision_events
  → budget_service
  → llm_client

Worker Lambda:
  → decision_events
  → budget_service
  → llm_client
  → tool_wrappers
      → artifact_schemas (ToolName, SuccessStatus)
      → budget_service (cost tracking)
      → decision_events (tool logging)
      → llm_client (red_team_review)
      → s3_uploader (large results)

Evaluator Lambda:
  → decision_events
  → llm_client

decision_events:
  → s3_uploader (large event details)

artifact_writer (planned):
  → artifact_schemas
  → schema_validator
  → s3_utils
```

### External Dependencies (Layer 1)

All modules import from Layer 1 (`python-dependencies`):
- boto3, botocore (AWS SDK)
- openai (OpenAI API client)
- anthropic (Anthropic API client)
- pydantic (Data validation)
- jsonschema (Schema validation)
- requests (HTTP requests for web search)

## Naming Convention

**Source Directory:** `packages/shared/my-module/` (hyphenated)  
**Layer 2 Directory:** `packages/agents/layers/shared-packages/python/my_module/` (underscored)

Python imports use underscores:
```python
from decision_events.event_logger import log_decision_event
from budget_service.budget_client import get_job_budget
from artifact_schemas.artifact_envelope import ArtifactEnvelope
```

## Adding a New Module

1. Create directory in `packages/shared/my-new-module/`
2. Add `__init__.py` and module code
3. Add tests in same directory: `test_my_module.py`
4. Run `./scripts/bundle-lambda-layers.sh` (auto-copies to Layer 2)
5. Deploy with `npx cdk deploy --all`
6. Import in Lambda: `from my_new_module.my_file import my_function`

**Note:** No need to modify build script - it copies all directories automatically.

## Related Documentation

- **Lambda Layer Build Requirements:** `docs/lambda-layer-build-requirements.md`
- **Architecture:** `docs/architecture.md`
- **Data Models:** `docs/architecture/data-models.md`
- **Story 6.1 (Artifact Storage):** `docs/stories/6.1.dynamodb-scratch-artifacts-storage.md`
- **Story 6.2 (Generation Metrics):** Referenced in `docs/prd.md`
- **AI Agent Instructions:** `.ai-instructions.md` (includes Layer 2 module table)
