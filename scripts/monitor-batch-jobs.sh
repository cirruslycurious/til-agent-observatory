#!/bin/bash
# Monitor status of all jobs from a batch submission
# Usage: ./scripts/monitor-batch-jobs.sh <batch-directory>

set -e

API_BASE_URL="https://YOUR_API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod"

if [ -z "$1" ]; then
  echo "Usage: $0 <batch-directory>"
  echo ""
  echo "Example: $0 batch-jobs-20260119-213000"
  exit 1
fi

BATCH_DIR="$1"
JOBS_FILE="${BATCH_DIR}/job-ids.txt"

if [ ! -f "${JOBS_FILE}" ]; then
  echo "❌ Jobs file not found: ${JOBS_FILE}"
  exit 1
fi

echo "📊 Monitoring Batch Jobs"
echo "========================"
echo "Batch directory: ${BATCH_DIR}"
echo ""

# Count statuses
TOTAL=$(wc -l < "${JOBS_FILE}" | tr -d ' ')
RUNNING=0
COMPLETED=0
COMPLETED_COMPROMISED=0
FAILED=0
QUEUED=0
UNKNOWN=0

echo "Checking ${TOTAL} jobs..."
echo ""

# Progress counter
CURRENT=0

while IFS='|' read -r job_id token conf topic rep; do
  CURRENT=$((CURRENT + 1))
  
  # Get status
  STATUS=$(curl -s "${API_BASE_URL}/api/v1/jobs/${job_id}/status?token=${token}" | jq -r '.status // "unknown"')
  
  case "${STATUS}" in
    "running")
      RUNNING=$((RUNNING + 1))
      ;;
    "completed")
      COMPLETED=$((COMPLETED + 1))
      ;;
    "completed_with_compromises")
      COMPLETED_COMPROMISED=$((COMPLETED_COMPROMISED + 1))
      ;;
    "failed")
      FAILED=$((FAILED + 1))
      ;;
    "queued")
      QUEUED=$((QUEUED + 1))
      ;;
    *)
      UNKNOWN=$((UNKNOWN + 1))
      ;;
  esac
  
  # Show progress every 10 jobs
  if [ $((CURRENT % 10)) -eq 0 ]; then
    echo "  Checked ${CURRENT}/${TOTAL} jobs..."
  fi
  
done < "${JOBS_FILE}"

echo ""
echo "📈 Status Summary"
echo "================="
echo "Total jobs: ${TOTAL}"
echo "✅ Completed: ${COMPLETED}"
echo "⚠️  Completed with compromises: ${COMPLETED_COMPROMISED}"
echo "🔄 Running: ${RUNNING}"
echo "⏳ Queued: ${QUEUED}"
echo "❌ Failed: ${FAILED}"
echo "❓ Unknown: ${UNKNOWN}"
echo ""

# Calculate completion percentage
COMPLETED_TOTAL=$((COMPLETED + COMPLETED_COMPROMISED))
if [ ${TOTAL} -gt 0 ]; then
  PERCENT=$((COMPLETED_TOTAL * 100 / TOTAL))
  echo "Progress: ${COMPLETED_TOTAL}/${TOTAL} (${PERCENT}%)"
fi

echo ""
echo "💡 Run this script again to refresh status"
echo "💡 Watch mode: watch -n 30 '$0 ${BATCH_DIR}'"
