#!/bin/bash

# Bundle Lambda Layers for dependencies and shared packages
# This reduces Lambda package size by separating dependencies into layers
# Note: boto3/botocore are already in Lambda runtime, so we exclude them

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📦 Bundling Lambda Layers..."

# Create layer directories
LAYERS_DIR="$PROJECT_ROOT/packages/agents/layers"
rm -rf "$LAYERS_DIR"
mkdir -p "$LAYERS_DIR"

# Layer 1: Python dependencies (excluding boto3/botocore which are in Lambda runtime)
echo "📦 Creating Python dependencies layer..."
DEPS_LAYER_DIR="$LAYERS_DIR/python-dependencies/python"
mkdir -p "$DEPS_LAYER_DIR"

# Create a minimal requirements file without boto3
TMP_REQ=$(mktemp)
grep -v "^boto3" "$PROJECT_ROOT/packages/agents/manager/requirements.txt" > "$TMP_REQ" || true

# Install dependencies to layer directory using Docker (for correct Linux x86_64 architecture)
# This ensures native extensions like pydantic_core are compiled for Lambda's architecture
if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
  echo "🐳 Using Docker to build Python dependencies layer (Linux x86_64)..."
  echo "   Note: Using --platform linux/amd64 to ensure x86_64 architecture for Lambda"
  docker run --rm --platform linux/amd64 \
    -v "$PROJECT_ROOT:/var/task" \
    -w /var/task \
    public.ecr.aws/sam/build-python3.12:latest \
    /bin/bash -c "
      pip install openai anthropic jsonschema pydantic requests \
        -t /var/task/packages/agents/layers/python-dependencies/python \
        --quiet \
        --disable-pip-version-check
      # Remove boto3/botocore if they were installed (they're in Lambda runtime)
      rm -rf /var/task/packages/agents/layers/python-dependencies/python/boto3 \
             /var/task/packages/agents/layers/python-dependencies/python/botocore \
             /var/task/packages/agents/layers/python-dependencies/python/boto3-*.dist-info \
             /var/task/packages/agents/layers/python-dependencies/python/botocore-*.dist-info 2>/dev/null || true
    "
else
  echo "⚠️  Docker not available. Attempting local install (may fail for native extensions)..."
  echo "   For production builds, use Docker to ensure correct Linux x86_64 architecture."
  cd "$DEPS_LAYER_DIR"
  python3 -m pip install openai anthropic jsonschema pydantic requests \
    -t . \
    --platform manylinux2014_x86_64 \
    --platform linux_x86_64 \
    --only-binary=:all: \
    --quiet \
    --disable-pip-version-check || true
  
  # Remove boto3/botocore if they were installed
  rm -rf boto3 botocore boto3-*.dist-info botocore-*.dist-info 2>/dev/null || true
fi

# Layer 2: Shared packages
echo "📦 Creating shared packages layer..."
SHARED_LAYER_DIR="$LAYERS_DIR/shared-packages/python"
mkdir -p "$SHARED_LAYER_DIR"

# Copy shared packages (with error handling for non-existent files)
cp -r "$PROJECT_ROOT/packages/shared"/* "$SHARED_LAYER_DIR/" 2>&1 | grep -v "No such file or directory" || true

# Rename directories with hyphens to underscores (Python can't import modules with hyphens)
# e.g., decision-events -> decision_events
cd "$SHARED_LAYER_DIR"
for dir in *-*; do
    if [ -d "$dir" ]; then
        new_name=$(echo "$dir" | sed 's/-/_/g')
        if [ "$dir" != "$new_name" ]; then
            mv "$dir" "$new_name"
            echo "Renamed: $dir -> $new_name"
        fi
    fi
done

# Create top-level imports for s3_uploader (from s3_utils/s3_uploader.py)
# This allows "from s3_uploader import ..." to work without path manipulation
if [ -f "s3_utils/s3_uploader.py" ]; then
    # Create a symlink or copy s3_uploader.py to root level
    cp "s3_utils/s3_uploader.py" "s3_uploader.py"
    echo "Created top-level s3_uploader.py (from s3_utils)"
fi

cd "$PROJECT_ROOT"

# Clean up development artifacts and duplicates
echo "🧹 Cleaning up Layer 2..."

# Remove .venv and __pycache__ directories
find "$SHARED_LAYER_DIR" -type d -name ".venv" -exec rm -rf {} + 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# Remove nested duplicate directories (hyphenated versions inside renamed directories)
# e.g., tool_wrappers/tool-wrappers/, budget_service/budget-service/
find "$SHARED_LAYER_DIR" -mindepth 2 -maxdepth 2 -type d -name "*-*" -exec rm -rf {} + 2>/dev/null || true

# Remove test files (Python and TypeScript)
find "$SHARED_LAYER_DIR" -type f -name "test_*.py" -delete 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type f -name "*_test.py" -delete 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type f -name "*.test.ts" -delete 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type f -name "*.test.py" -delete 2>/dev/null || true

# Remove TypeScript files (not needed in Python Lambda)
find "$SHARED_LAYER_DIR" -type f -name "*.ts" -delete 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type f -name "*.tsx" -delete 2>/dev/null || true

# Remove documentation files
find "$SHARED_LAYER_DIR" -type f -name "README.md" -delete 2>/dev/null || true
find "$SHARED_LAYER_DIR" -type f -name "*.md" -delete 2>/dev/null || true

# Remove package.json files (not needed for Python)
find "$SHARED_LAYER_DIR" -type f -name "package.json" -delete 2>/dev/null || true

echo "✅ Layer 2 cleaned (removed duplicates, tests, TypeScript files)"

rm -f "$TMP_REQ"

echo "✅ Lambda Layers created:"
echo "   - Python dependencies: $DEPS_LAYER_DIR"
echo "   - Shared packages: $SHARED_LAYER_DIR"
echo ""
echo "Checking layer sizes..."
du -sh "$DEPS_LAYER_DIR" "$SHARED_LAYER_DIR" 2>/dev/null || true
