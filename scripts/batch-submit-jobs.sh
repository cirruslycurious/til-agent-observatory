#!/bin/bash
# Batch submit jobs: all conferences × all topics × 5 repetitions
# Total: 5 conferences × 8 topics × 5 reps = 200 jobs

set -e

# Configuration
API_BASE_URL="https://YOUR_API_GATEWAY_ID.execute-api.us-east-1.amazonaws.com/prod"
SLEEP_SECONDS=5
REPETITIONS=5

# All conferences and topics
CONFERENCES=("black_hat" "reinvent" "kubecon" "gartner_symposium" "google_cloud_next")
TOPICS=("ai_ml_genai" "security_zero_trust" "cloud_arch_infra" "k8s_containers" "platform_devops" "networking_mesh" "data_analytics" "leadership_governance")

# Calculate totals
TOTAL_JOBS=$((${#CONFERENCES[@]} * ${#TOPICS[@]} * REPETITIONS))

# Track results
SUCCESSFUL=0
FAILED=0
JOB_IDS=()

echo "🚀 Batch Job Submission"
echo "======================="
echo "Conferences: ${#CONFERENCES[@]}"
echo "Topics: ${#TOPICS[@]}"
echo "Repetitions: ${REPETITIONS}"
echo "Total jobs to submit: ${TOTAL_JOBS}"
echo "Sleep between jobs: ${SLEEP_SECONDS}s"
echo ""
echo "⚠️  This will take approximately $((TOTAL_JOBS * SLEEP_SECONDS / 60)) minutes to submit all jobs"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

# Create output directory for job tracking
OUTPUT_DIR="batch-jobs-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${OUTPUT_DIR}"

# Log file
LOG_FILE="${OUTPUT_DIR}/submission-log.txt"
JOBS_FILE="${OUTPUT_DIR}/job-ids.txt"

echo "📁 Output directory: ${OUTPUT_DIR}"
echo ""

# Start timer
START_TIME=$(date +%s)
CURRENT_JOB=0

# Loop through all combinations
for conference in "${CONFERENCES[@]}"; do
  for topic in "${TOPICS[@]}"; do
    for rep in $(seq 1 ${REPETITIONS}); do
      CURRENT_JOB=$((CURRENT_JOB + 1))
      
      echo "[$CURRENT_JOB/$TOTAL_JOBS] Submitting: ${conference} + ${topic} (rep ${rep}/${REPETITIONS})"
      
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
        JOB_IDS+=("${JOB_ID}")
        
        echo "   ✅ Job created: ${JOB_ID}"
        
        # Log to file
        echo "${JOB_ID}|${JOB_TOKEN}|${conference}|${topic}|${rep}" >> "${JOBS_FILE}"
        echo "$(date -Iseconds) SUCCESS ${conference} ${topic} rep${rep} ${JOB_ID}" >> "${LOG_FILE}"
        
      elif [[ "${HTTP_CODE}" == "503" ]]; then
        FAILED=$((FAILED + 1))
        echo "   ⚠️  System unavailable (kill switch)"
        echo "$(date -Iseconds) FAILED_503 ${conference} ${topic} rep${rep}" >> "${LOG_FILE}"
        
      else
        FAILED=$((FAILED + 1))
        ERROR_MSG=$(echo "${BODY}" | jq -r '.error // "Unknown error"')
        echo "   ❌ Failed (HTTP ${HTTP_CODE}): ${ERROR_MSG}"
        echo "$(date -Iseconds) FAILED_${HTTP_CODE} ${conference} ${topic} rep${rep} ${ERROR_MSG}" >> "${LOG_FILE}"
      fi
      
      # Sleep between submissions (except for last job)
      if [[ ${CURRENT_JOB} -lt ${TOTAL_JOBS} ]]; then
        sleep ${SLEEP_SECONDS}
      fi
    done
  done
done

# End timer
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
ELAPSED_MIN=$((ELAPSED / 60))
ELAPSED_SEC=$((ELAPSED % 60))

echo ""
echo "🎉 Batch Submission Complete!"
echo "=============================="
echo "Total submitted: ${CURRENT_JOB}"
echo "Successful: ${SUCCESSFUL}"
echo "Failed: ${FAILED}"
echo "Time elapsed: ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
echo ""
echo "📁 Results saved to: ${OUTPUT_DIR}/"
echo "   - ${JOBS_FILE} (job IDs and tokens)"
echo "   - ${LOG_FILE} (submission log)"
echo ""

# Create summary file
SUMMARY_FILE="${OUTPUT_DIR}/summary.txt"
cat > "${SUMMARY_FILE}" << EOF
Batch Job Submission Summary
============================
Date: $(date)
Total jobs submitted: ${CURRENT_JOB}
Successful: ${SUCCESSFUL}
Failed: ${FAILED}
Time elapsed: ${ELAPSED_MIN}m ${ELAPSED_SEC}s

Configuration:
- Conferences: ${CONFERENCES[@]}
- Topics: ${TOPICS[@]}
- Repetitions: ${REPETITIONS}
- Sleep between jobs: ${SLEEP_SECONDS}s

Job IDs:
$(printf '%s\n' "${JOB_IDS[@]}")

View jobs:
- Frontend: https://your-domain.example.com/
- DynamoDB: https://console.aws.amazon.com/dynamodbv2/home?region=us-east-1#table?name=til-jobs&tab=items
- Step Functions: https://console.aws.amazon.com/states/home?region=us-east-1#/statemachines

Monitor progress:
cat ${LOG_FILE}
EOF

echo "📊 Summary saved to: ${SUMMARY_FILE}"
echo ""
echo "💡 Monitor all jobs with:"
echo "   cat ${JOBS_FILE} | while IFS='|' read -r job_id token conf topic rep; do"
echo "     echo \"Job \$job_id (\$conf/\$topic rep\$rep): \$(curl -s \"${API_BASE_URL}/api/v1/jobs/\$job_id/status?token=\$token\" | jq -r .status)\""
echo "   done"
