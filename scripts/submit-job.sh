#!/bin/bash
# Simple script to submit a job to the TIL system
# Usage: ./scripts/submit-job.sh [conference] [topic]

set -e

# Configuration
API_BASE_URL="https://YOUR_API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod"
AWS_PROFILE="abstract"
AWS_REGION="us-east-1"

# Default values
CONFERENCE="${1:-kubecon}"
TOPIC="${2:-ai_ml_genai}"

# Valid options for reference
VALID_CONFERENCES="black_hat, reinvent, kubecon, gartner_symposium, google_cloud_next"
VALID_TOPICS="ai_ml_genai, security_zero_trust, cloud_arch_infra, k8s_containers, platform_devops, networking_mesh, data_analytics, leadership_governance"

echo "🚀 Submitting Job to TIL System"
echo "================================"
echo "Conference: ${CONFERENCE}"
echo "Topic: ${TOPIC}"
echo ""

# Create job
echo "📤 Sending request to API..."
CURL_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${API_BASE_URL}/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -d "{\"conference\": \"${CONFERENCE}\", \"topic\": \"${TOPIC}\"}")

# Parse response body and HTTP code
CREATE_JOB_RESPONSE=$(echo "${CURL_RESPONSE}" | sed -e 's/HTTP_CODE\:.*//g')
HTTP_CODE=$(echo "${CURL_RESPONSE}" | tr -d '\n' | sed -e 's/.*HTTP_CODE://')

if [[ "${HTTP_CODE}" == "202" ]]; then
  JOB_ID=$(echo "${CREATE_JOB_RESPONSE}" | jq -r '.job_id')
  JOB_TOKEN=$(echo "${CREATE_JOB_RESPONSE}" | jq -r '.job_read_token')
  SFN_ARN=$(echo "${CREATE_JOB_RESPONSE}" | jq -r '.step_functions_execution_arn // empty')
  
  echo "✅ Job created successfully!"
  echo ""
  echo "📋 Job Details:"
  echo "   Job ID: ${JOB_ID}"
  echo "   Job Token: ${JOB_TOKEN}"
  echo "   Status: running"
  echo "   Step Functions ARN: ${SFN_ARN}"
  echo ""
  echo "🔗 View Job Status:"
  echo "   API: ${API_BASE_URL}/api/v1/jobs/${JOB_ID}/status?token=${JOB_TOKEN}"
  echo "   Frontend: https://your-domain.example.com/workflow/${JOB_ID}?token=${JOB_TOKEN}"
  echo ""
  echo "🔍 Monitor in AWS Console:"
  echo "   Step Functions: https://console.aws.amazon.com/states/home?region=${AWS_REGION}#/executions/details/${SFN_ARN}"
  echo "   DynamoDB: https://console.aws.amazon.com/dynamodbv2/home?region=${AWS_REGION}#table?name=til-jobs&tab=items"
  echo ""
  echo "⏱️  Estimated completion: ~90-120 seconds"
  echo ""
  echo "💡 Track progress with:"
  echo "   watch -n 5 'curl -s \"${API_BASE_URL}/api/v1/jobs/${JOB_ID}/status?token=${JOB_TOKEN}\" | jq .status'"
  
elif [[ "${HTTP_CODE}" == "503" ]]; then
  echo "⚠️  System temporarily unavailable (kill switch enabled)"
  echo "${CREATE_JOB_RESPONSE}" | jq .
  exit 1
  
elif [[ "${HTTP_CODE}" == "400" ]]; then
  echo "❌ Invalid request (check conference and topic)"
  echo "${CREATE_JOB_RESPONSE}" | jq .
  echo ""
  echo "Valid conferences: ${VALID_CONFERENCES}"
  echo "Valid topics: ${VALID_TOPICS}"
  exit 1
  
else
  echo "❌ Job creation failed (HTTP ${HTTP_CODE})"
  echo "${CREATE_JOB_RESPONSE}" | jq .
  exit 1
fi
