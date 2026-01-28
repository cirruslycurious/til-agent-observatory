# Lambda Layers Context

## Overview

Lambda functions use two layers for Python dependencies:

| Layer | Contents | Size | Build |
|-------|----------|------|-------|
| Layer 1 | External packages (openai, anthropic, pydantic) | 36-38 MB | Docker required |
| Layer 2 | Internal modules (llm_client, tool_wrappers) | ~640 KB | No Docker |

## Building Layers

```bash
# Verify Docker is running
docker ps

# Build both layers
./scripts/bundle-lambda-layers.sh

# Verify sizes
du -sh packages/agents/layers/*/python
# Expected:
# 36-38M  python-dependencies/python
# ~640K   shared-packages/python
```

## Layer 1: Python Dependencies

**Location**: `packages/agents/layers/python-dependencies/python/`

**Includes**:
- openai >= 1.12.0
- anthropic >= 0.18.0
- pydantic >= 2.5.0 (has native extensions!)
- jsonschema >= 4.20.0
- requests >= 2.31.0

**Excludes** (already in Lambda runtime):
- boto3
- botocore

**Why Docker?** Pydantic has native C extensions that must be compiled for Linux x86_64.

## Layer 2: Shared Packages

**Location**: `packages/agents/layers/shared-packages/python/`

**Modules**:
| Module | Purpose |
|--------|---------|
| `llm_client/` | OpenAI/Anthropic/Bedrock abstraction |
| `decision_events/` | Event logging |
| `budget_service/` | Action point tracking |
| `tool_wrappers/` | Tool implementations |
| `artifact_schemas/` | Pydantic models |
| `s3_utils/` | S3 operations |
| `schema_validator/` | JSON Schema validation |

## Troubleshooting

### Layer 1 is only 12 MB (should be 36-38 MB)

**Cause**: Docker not running or pip failed

**Fix**:
```bash
docker ps  # Verify Docker
./scripts/bundle-lambda-layers.sh  # Rebuild
```

### ImportModuleError: pydantic_core._pydantic_core

**Cause**: Native extension compiled for wrong architecture

**Fix**: Rebuild with Docker (see above)

### ImportModuleError: No module named 'xxx'

**Cause**: Module missing from layer or import path wrong

**Fix Pattern** (use try/except for Lambda + local dev):
```python
try:
    from artifact_schemas.artifact_envelope import ArtifactEnvelope
except ImportError:
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent / 'artifact-schemas'))
    from artifact_envelope import ArtifactEnvelope
```

## After Building Layers

Always redeploy the workflow stack:

```bash
cd infrastructure/cdk
npx cdk deploy TilWorkflowStack --profile YOUR_PROFILE
```
