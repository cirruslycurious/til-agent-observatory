#!/bin/bash

# Bundle Lambda dependencies locally (without Docker)
# This script pre-installs Python dependencies so CDK doesn't need Docker

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📦 Bundling Lambda dependencies..."

# Create temporary directories for bundling
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Bundle Manager Lambda
echo "📦 Bundling Manager Lambda..."
MANAGER_BUNDLE_DIR="$TMP_DIR/manager"
mkdir -p "$MANAGER_BUNDLE_DIR"

# Copy Manager code
MANAGER_SOURCE="$PROJECT_ROOT/packages/agents/manager"
if [ ! -d "$MANAGER_SOURCE" ]; then
  echo "❌ Error: $MANAGER_SOURCE directory not found"
  exit 1
fi
find "$MANAGER_SOURCE" -mindepth 1 -maxdepth 1 -not -name '.*' -exec cp -r {} "$MANAGER_BUNDLE_DIR/" \;

# Install dependencies
cd "$MANAGER_BUNDLE_DIR"
pip install -r requirements.txt -t . --quiet --disable-pip-version-check

# Copy shared packages
mkdir -p "$MANAGER_BUNDLE_DIR/packages/shared"
cp -r "$PROJECT_ROOT/packages/shared"/* "$MANAGER_BUNDLE_DIR/packages/shared/"

# Create final bundle directory
MANAGER_FINAL_DIR="$PROJECT_ROOT/packages/agents/manager-bundled"
rm -rf "$MANAGER_FINAL_DIR"
mkdir -p "$MANAGER_FINAL_DIR"
cp -r "$MANAGER_BUNDLE_DIR"/* "$MANAGER_FINAL_DIR/"

echo "✅ Manager Lambda bundled to: $MANAGER_FINAL_DIR"

# Bundle Worker Lambda
echo "📦 Bundling Worker Lambda..."
WORKER_BUNDLE_DIR="$TMP_DIR/worker"
mkdir -p "$WORKER_BUNDLE_DIR"

# Copy Worker code
WORKER_SOURCE="$PROJECT_ROOT/packages/agents/worker"
if [ ! -d "$WORKER_SOURCE" ]; then
  echo "❌ Error: $WORKER_SOURCE directory not found"
  exit 1
fi
find "$WORKER_SOURCE" -mindepth 1 -maxdepth 1 -not -name '.*' -exec cp -r {} "$WORKER_BUNDLE_DIR/" \;

# Install dependencies
cd "$WORKER_BUNDLE_DIR"
pip install -r requirements.txt -t . --quiet --disable-pip-version-check

# Copy shared packages
mkdir -p "$WORKER_BUNDLE_DIR/packages/shared"
cp -r "$PROJECT_ROOT/packages/shared"/* "$WORKER_BUNDLE_DIR/packages/shared/"

# Create final bundle directory
WORKER_FINAL_DIR="$PROJECT_ROOT/packages/agents/worker-bundled"
rm -rf "$WORKER_FINAL_DIR"
mkdir -p "$WORKER_FINAL_DIR"
cp -r "$WORKER_BUNDLE_DIR"/* "$WORKER_FINAL_DIR/"

echo "✅ Worker Lambda bundled to: $WORKER_FINAL_DIR"

echo "🎉 All Lambda dependencies bundled successfully!"
echo ""
echo "Next step: Deploy with CDK:"
echo "  cd infrastructure/cdk"
echo "  npx cdk deploy TilWorkflowStack --profile abstract"
