# Lambda Layer Build Requirements

## Overview

Lambda Layers for Python dependencies (especially those with native extensions like `pydantic_core`) must be built for the **Linux x86_64** architecture that AWS Lambda uses.

## Problem

When building on macOS or Windows, `pip install` will install packages compiled for your local architecture. Native extensions like `pydantic_core` (used by `pydantic`) will be compiled for macOS/Windows, not Linux, causing runtime errors in Lambda:

```
Runtime.ImportModuleError: No module named 'pydantic_core._pydantic_core'
```

## Solution: Docker

Use Docker with the AWS SAM build image to build layers with the correct architecture.

### Prerequisites

1. **Docker Desktop** must be installed and running
2. Docker must be accessible in your PATH

### Build Steps

1. **Ensure Docker is running:**
   ```bash
   docker ps
   ```

2. **Build the layers:**
   ```bash
   ./scripts/bundle-lambda-layers.sh
   ```

   The script will:
   - Detect if Docker is available
   - Use Docker to build Python dependencies with correct Linux x86_64 architecture
   - Copy shared packages and rename directories (hyphens to underscores)
   - Create two layers:
     - `python-dependencies`: External Python packages (openai, anthropic, pydantic, etc.)
     - `shared-packages`: Internal shared Python modules

3. **Verify layer sizes:**
   ```bash
   du -sh packages/agents/layers/*/python
   ```
   
   Expected sizes:
   - `python-dependencies`: ~36-38 MB (Layer 1)
   - `shared-packages`: ~640 KB (Layer 2, after cleanup)

## ⚠️ CRITICAL: Import Pattern for Shared Modules

**Problem:** Shared modules that import other shared modules must handle two different environments:
- **Development:** Modules in `packages/shared/{module-name}/` (hyphenated directories)
- **Lambda layer:** Modules in `/opt/python/{module_name}/` (underscored directories)

**Solution:** Use try/except to handle both environments:

```python
# ✅ CORRECT: Works in both Lambda and local development
try:
    # Lambda layer structure (underscored module names)
    from artifact_schemas.artifact_envelope import ArtifactEnvelope
    from s3_utils.s3_uploader import upload_artifact_to_s3
    from decision_events.event_logger import log_decision_event
except ImportError:
    # Fallback for local development (hyphenated directory names)
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent / 'artifact-schemas'))
    from artifact_envelope import ArtifactEnvelope
    sys.path.append(str(Path(__file__).parent.parent / 's3-utils'))
    from s3_uploader import upload_artifact_to_s3
    sys.path.append(str(Path(__file__).parent.parent / 'decision-events'))
    from event_logger import log_decision_event
```

**Why this is required:**
1. Bundle script renames directories: `artifact-schemas` → `artifact_schemas` 
2. Lambda layers place modules at `/opt/python/` with underscored names
3. Using only `sys.path.append` causes `Runtime.ImportModuleError` in Lambda
4. Try/except allows local testing while ensuring Lambda compatibility

**When you'll see this error:**
```
Runtime.ImportModuleError: Unable to import module 'lambda_function': No module named 'artifact_envelope'
```

**Modules that need updating:**
- [x] `artifact_writer.py` - **FIXED** (2026-01-18)
- [ ] `metrics_writer.py` - imports from `enums`
- [ ] `artifact_reader.py` - imports from `s3_utils`
- [ ] `dependency_graph.py` - imports from `decision_events`
- [ ] `enhanced_validator.py` - imports from `schema_validator`

---

## Layer 2: Complete Module Inventory

Layer 2 contains all internal shared Python modules from `packages/shared/`. Here's what's included and why:

### Currently Active Modules (Used in Production)

| Module | Size | Used By | Purpose | Story |
|--------|------|---------|---------|-------|
| **decision_events** | 60 KB | Manager, Worker, Evaluator | Event logging, decision capture, S3 overflow for large event details | Story 3.1 |
| **budget_service** | 72 KB | Manager, Worker | Job budget tracking, LLM cost increments, web search cost tracking, minimal mode activation | Story 4.1, 4.2 |
| **llm_client** | 44 KB | Manager, Worker, Evaluator | LLM API calls (OpenAI, Anthropic, Bedrock), vendor assignment, model pricing, creativity-to-temperature mapping | Story 2.1, 2.2, 2.4 |
| **tool_wrappers** | 160 KB | Worker | Tool implementations: web_search, search_abstracts, search_recent_content, dynamodb_lookup, red_team_review | Story 2.2, 3.3 |
| **s3_utils** | 48 KB | decision_events, tool_wrappers | S3 uploads/downloads for large artifacts, canonical JSON serialization, gzip compression | Story 6.3 |
| **artifact_schemas** | 32 KB | tool_wrappers | Pydantic schemas for artifact envelopes, ToolName enum, SuccessStatus enum | Story 3.2, 6.1 |

**Active Total:** ~400 KB

### Planned Integration Modules (Story 6.1, 6.2, 6.4)

| Module | Size | Planned Use | Purpose | Story |
|--------|------|-------------|---------|-------|
| **artifact_reader** | 76 KB | API Lambda (TS version active), Python planned | Read artifacts from DynamoDB with S3 overflow handling, dependency graph queries | Story 6.1 (Task 6) |
| **artifact_writer** | 64 KB | Worker Lambda (Story 6.1 Task 4) | Write artifacts to DynamoDB with idempotency, content-aware versioning, S3 overflow for large artifacts | Story 6.1 (Task 2, 4) |
| **artifact_validator** | 20 KB | Worker Lambda | Enhanced validation for evidence pointers, sources/claims validation, dependency tracking | Story 3.2 |
| **schema_validator** | 68 KB | artifact_writer | JSON Schema validation against versioned schema files, runtime gate for artifact writes | Story 6.4 |
| **metrics_writer** | 28 KB | All agents (Manager, Worker, Evaluator) | Write generation metrics to DynamoDB with closed set validation (Conference, UserIntent enums) | Story 6.2 |
| **enums** | 24 KB | metrics_writer | Conference and UserIntent closed set enums with validation methods | Story 6.2 |
| **auth** | 16 KB | Planned for Python, API uses TS | Token verification and hashing for job read tokens | Story 5.1 |

**Planned Total:** ~328 KB

### Special Files

| File | Size | Purpose |
|------|------|---------|
| **s3_uploader.py** (root) | 16 KB | Root-level import for S3 operations (copied from s3-utils/ for import compatibility) |

**Grand Total:** ~728 KB ≈ 640 KB documented

### Why Include Planned Modules?

**Rationale:**
1. **Infrastructure Ready:** Layer 2 is deployed with all modules, avoiding rebuild during Story 6.1/6.2 implementation
2. **API Lambda Uses Them:** TypeScript versions of artifact_reader, auth already active in API
3. **Deployment Cost:** Layer update requires full CDK deployment and Lambda restart (expensive operation)
4. **Integration Path:** Worker Lambda will import artifact_writer when Story 6.1 Task 4 is implemented
5. **Metrics Collection:** All agents will import metrics_writer when Story 6.2 is implemented

### What's Excluded by Build Script

The build script automatically removes these to achieve ~640 KB target:
- **Test files:** `test_*.py`, `*_test.py`, `*.test.ts`, `*.test.py` (~428 KB)
- **TypeScript files:** `*.ts`, `*.tsx` (~160 KB) - not needed for Python Lambda
- **Nested duplicates:** `tool_wrappers/tool-wrappers/` nested directories (~660 KB total duplicates)
- **Documentation:** `README.md`, `*.md`
- **Node.js files:** `package.json`
- **Build artifacts:** `.venv/`, `__pycache__/`, `.pytest_cache/`

### Manual Docker Build (if script fails)

If the script doesn't detect Docker, you can build manually:

```bash
# Clean previous layers
rm -rf packages/agents/layers

# Build Python dependencies layer with Docker
docker run --rm \
  -v "$(pwd):/var/task" \
  -w /var/task \
  public.ecr.aws/sam/build-python3.12:latest \
  /bin/bash -c "
    mkdir -p packages/agents/layers/python-dependencies/python
    pip install openai anthropic jsonschema pydantic \
      -t /var/task/packages/agents/layers/python-dependencies/python \
      --quiet --disable-pip-version-check
    rm -rf /var/task/packages/agents/layers/python-dependencies/python/boto3 \
           /var/task/packages/agents/layers/python-dependencies/python/botocore \
           /var/task/packages/agents/layers/python-dependencies/python/boto3-*.dist-info \
           /var/task/packages/agents/layers/python-dependencies/python/botocore-*.dist-info 2>/dev/null || true
  "

# Build shared packages layer (no Docker needed, just copying files)
mkdir -p packages/agents/layers/shared-packages/python
cp -r packages/shared/* packages/agents/layers/shared-packages/python/

# Rename directories (hyphens to underscores)
cd packages/agents/layers/shared-packages/python
for dir in *-*; do
  if [ -d "$dir" ]; then
    new_name=$(echo "$dir" | sed 's/-/_/g')
    if [ "$dir" != "$new_name" ]; then
      mv "$dir" "$new_name"
    fi
  fi
done
```

### Verification

After building, verify the layers contain the expected packages:

```bash
# Check Python dependencies (Layer 1)
ls packages/agents/layers/python-dependencies/python/ | grep -E "(pydantic|openai|anthropic)"

# Verify pydantic_core exists (critical native extension)
ls packages/agents/layers/python-dependencies/python/pydantic_core/

# Check shared packages (Layer 2)
ls packages/agents/layers/shared-packages/python/ | grep -E "(decision_events|llm_client|tool_wrappers)"

# Verify s3_uploader.py at root level
test -f packages/agents/layers/shared-packages/python/s3_uploader.py && echo "✅ s3_uploader.py found"

# Check Layer 2 size (should be ~640 KB after cleanup)
du -sh packages/agents/layers/shared-packages/python
# Expected: 640K-700K (if much larger, duplicates weren't cleaned)

# Verify no test files or TypeScript files
find packages/agents/layers/shared-packages/python -name "test_*.py" -o -name "*.ts" | wc -l
# Expected: 0

# Verify no nested duplicate directories
find packages/agents/layers/shared-packages/python -mindepth 2 -maxdepth 2 -type d -name "*-*" | wc -l
# Expected: 0
```

## Common Issues

### Issue: Layer 2 is 1.3 MB instead of 640 KB

**Cause:** Nested duplicate directories and test files not cleaned up

**Symptoms:**
- Layer 2 size is ~1.3 MB
- Nested directories like `tool_wrappers/tool-wrappers/`
- Test files (`test_*.py`, `*.test.ts`) present
- TypeScript files present

**Solution:** The build script now cleans these automatically. If you see this:
```bash
# Check for nested duplicates
find packages/agents/layers/shared-packages/python -mindepth 2 -maxdepth 2 -type d -name "*-*"

# If found, rebuild layers
./scripts/bundle-lambda-layers.sh
```

### Issue: Symlinks in source directory causing duplicates

**Cause:** `packages/shared/` has both hyphenated directories AND underscore symlinks

**Example:**
```bash
# Source has both:
packages/shared/budget-service/     (actual directory)
packages/shared/budget_service      (symlink → budget-service/)

# Copy operation copies BOTH, creating nested duplicate:
layer/python/budget_service/budget-service/  (duplicate!)
```

**Solution:** Build script now removes nested duplicates after renaming

## Deployment

After building the layers, deploy with CDK:

```bash
cd infrastructure/cdk
npx cdk synth --profile abstract
npx cdk deploy --all --profile abstract
```

The CDK stack will automatically package the layers and attach them to the Lambda functions.
