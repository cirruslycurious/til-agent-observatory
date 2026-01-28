#!/bin/bash
# Setup script for local development environment

set -e

echo "🚀 Setting up TIL Agent Workflow Observatory development environment..."
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Prerequisites check passed!"
echo ""

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install workspace dependencies
echo "📦 Installing workspace dependencies..."
npm install --workspaces

echo ""
echo "🐳 Setting up local services..."
echo ""

# Start DynamoDB Local
if ! docker ps | grep -q dynamodb-local; then
  echo "Starting DynamoDB Local..."
  docker run -d -p 8000:8000 --name dynamodb-local amazon/dynamodb-local
else
  echo "✅ DynamoDB Local already running"
fi

# Start LocalStack
if ! docker ps | grep -q localstack; then
  echo "Starting LocalStack..."
  docker run -d -p 4566:4566 --name localstack localstack/localstack
else
  echo "✅ LocalStack already running"
fi

echo ""
echo "📝 Creating .env.local from template..."
if [ ! -f .env.local ]; then
  cat > .env.local << EOF
# Local Development Environment Variables
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_REGION=us-east-1
S3_ENDPOINT=http://localhost:4566
AWS_REGION=us-east-1
OPENAI_API_KEY=test-key
ANTHROPIC_API_KEY=test-key
TAVILY_API_KEY=test-key
SERVER_SECRET=local-dev-secret-change-in-production
WEBSOCKET_URL=ws://localhost:3001
API_BASE_URL=http://localhost:3001
EOF
  echo "✅ Created .env.local"
else
  echo "✅ .env.local already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review and update .env.local with your API keys"
echo "  2. Run 'npm run dev:frontend' to start the frontend"
echo "  3. Run 'npm run dev:api' to start the API (when implemented)"
echo "  4. See docs/development-setup-guide.md for more details"
