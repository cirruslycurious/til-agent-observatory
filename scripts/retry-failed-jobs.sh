#!/bin/bash
# Retry failed jobs and submit remaining jobs from a previous batch
# Usage: ./scripts/retry-failed-jobs.sh <batch-directory>

set -e

API_BASE_URL="https://YOUR_API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod"
SLEEP_SECONDS=5

if [ -z "$1" ]; then
  echo "Usage: $0 <batch-directory>"
  echo ""
  echo "Example: $0 batch-jobs-20260119-163852"
  exit 1
fi

BATCH_DIR="$1"
LOG_FILE="${BATCH_DIR}/submission-log.txt"

if [ ! -f "${LOG_FILE}" ]; then
  echo "❌ Log file not found: ${LOG_FILE}"
  exit 1
fi

echo "🔄 Retry Failed Jobs"
echo "===================="
echo "Original batch: ${BATCH_DIR}"
echo ""

# All conferences and topics
CONFERENCES=("black_hat" "reinvent" "kubecon" "gartner_symposium" "google_cloud_next")
TOPICS=("ai_ml_genai" "security_zero_trust" "cloud_arch_infra" "k8s_containers" "platform_devops" "networking_mesh" "data_analytics" "leadership_governance")
REPETITIONS=5

# Create retry log directory
RETRY_DIR="${BATCH_DIR}/retry-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${RETRY_DIR}"

RETRY_LOG="${RETRY_DIR}/retry-log.txt"
RETRY_JOBS="${RETRY_DIR}/job-ids.txt"

echo "📁 Retry directory: ${RETRY_DIR}"
echo ""

# Track what needs to be retried
TOTAL_TO_RETRY=0
SUCCESSFUL=0
FAILED=0

# Build list of what was successful
declare -A successful_jobs
while IFS=' ' read -r timestamp status conf topic rep jobid; do
  if [[ "${status}" == "SUCCESS" ]]; then
    key="${conf}_${topic}_${rep}"
    successful_jobs["${key}"]=1
  fi
done < "${LOG_FILE}"

echo "📊 Found ${#successful_jobs[@]} successful jobs from previous run"
echo ""

# Check each combination
JOBS_TO_SUBMIT=()
for conference in "${CONFERENCES[@]}"; do
  for topic in "${TOPICS[@]}"; do
    for rep in $(seq 1 ${REPETITIONS}); do
      key="${conference}_${topic}_rep${rep}"
      if [[ -z "${successful_jobs[${key}]}" ]]; then
        JOBS_TO_SUBMIT+=("${conference}|${topic}|${rep}")
        TOTAL_TO_RETRY=$((TOTAL_TO_RETRY + 1))
      fi
    done
  done
done

echo "🎯 Found ${TOTAL_TO_RETRY} jobs to submit (failed + not attempted)"
echo ""

if [[ ${TOTAL_TO_RETRY} -eq 0 ]]; then
  echo "✨ No jobs to retry - all were successful!"
  exit 0
fi

read -p "Press Enter to submit ${TOTAL_TO_RETRY} jobs or Ctrl+C to cancel..."
echo ""

# Start timer
START_TIME=$(date +%s)
CURRENT_JOB=0

# Submit jobs
for job_spec in "${JOBS_TO_SUBMIT[@]}"; do
  CURRENT_JOB=$((CURRENT_JOB + 1))
  
  IFS='|' read -r conference topic rep <<< "${job_spec}"
  
  echo "[$CURRENT_JOB/$TOTAL_TO_RETRY] Submitting: ${conference} + ${topic} (rep ${rep})"
  
  # Submit job
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${API_BASE_URL}/api/v1/jobs" \
    -H "Content-Type: application/json" \
    -d "{\"conference\": \"${conference}\", \"topic\": \"${topic}\"}")
  
  # Parse response
  BODY=$(echo "${RESPONSE}" | sed -e 's/HTTP_CODE\:.*//g')
  HTTP_CODE=$(echo "${RESPONSE}" | tr -d '\n' | sed -e 's/.*HTTP_CODE://')
  
  if [[ "${HTTP_CODE}" == "202" ]]; then
    JOB_ID=$(echo "${BODY}" | jq -r '.job_id')
    JOB_TOKEN=$(echo "${BODY}" | jq -r '.job_read_token')
    
    SUCCESSFUL=$((SUCCESSFUL + 1))
    
    echo "   ✅ Job created: ${JOB_ID}"
    
    # Log to files
    echo "${JOB_ID}|${JOB_TOKEN}|${conference}|${topic}|${rep}" >> "${RETRY_JOBS}"
    echo "$(date -Iseconds) SUCCESS ${conference} ${topic} rep${rep} ${JOB_ID}" >> "${RETRY_LOG}"
    
  elif [[ "${HTTP_CODE}" == "503" ]]; then
    FAILED=$((FAILED + 1))
    echo "   ⚠️  System unavailable (kill switch)"
    echo "$(date -Iseconds) FAILED_503 ${conference} ${topic} rep${rep}" >> "${RETRY_LOG}"
    
  else
    FAILED=$((FAILED + 1))
    ERROR_MSG=$(echo "${BODY}" | jq -r '.error // "Unknown error"')
    echo "   ❌ Failed (HTTP ${HTTP_CODE}): ${ERROR_MSG}"
    echo "$(date -Iseconds) FAILED_${HTTP_CODE} ${conference} ${topic} rep${rep} ${ERROR_MSG}" >> "${RETRY_LOG}"
  fi
  
  # Sleep between submissions (except for last job)
  if [[ ${CURRENT_JOB} -lt ${TOTAL_TO_RETRY} ]]; then
    sleep ${SLEEP_SECONDS}
  fi
done

# End timer
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
ELAPSED_MIN=$((ELAPSED / 60))
ELAPSED_SEC=$((ELAPSED % 60))

echo ""
echo "🎉 Retry Complete!"
echo "=================="
echo "Total attempted: ${CURRENT_JOB}"
echo "Successful: ${SUCCESSFUL}"
echo "Failed: ${FAILED}"
echo "Time elapsed: ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
echo ""
echo "📁 Results saved to: ${RETRY_DIR}/"
echo ""

# Update the original batch with retry results
if [[ -f "${RETRY_JOBS}" ]]; then
  cat "${RETRY_JOBS}" >> "${BATCH_DIR}/job-ids.txt"
  cat "${RETRY_LOG}" >> "${BATCH_DIR}/submission-log.txt"
  
  echo "✅ Updated original batch files:"
  echo "   ${BATCH_DIR}/job-ids.txt"
  echo "   ${BATCH_DIR}/submission-log.txt"
  echo ""
fi

# Create summary
TOTAL_SUCCESS=$(grep -c "SUCCESS" "${BATCH_DIR}/submission-log.txt" || echo 0)
TOTAL_FAILED=$(grep -c "FAILED" "${BATCH_DIR}/submission-log.txt" || echo 0)

echo "📊 Overall Batch Status:"
echo "   Total successful: ${TOTAL_SUCCESS}"
echo "   Total failed: ${TOTAL_FAILED}"
echo ""
echo "💡 Monitor jobs with:"
echo "   ./scripts/monitor-batch-jobs.sh ${BATCH_DIR}"
