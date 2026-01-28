#!/bin/bash
# Cleanup script for stuck/orphaned jobs
# Marks jobs in "running" state without execution_arn as "failed"

set -e

PROFILE="abstract"
JOBS_TABLE="til-jobs"
DRY_RUN=${1:-"false"}

echo "🔍 Scanning for stuck jobs in til-jobs table..."

# Get all running jobs
RUNNING_JOBS=$(aws dynamodb scan \
  --table-name "$JOBS_TABLE" \
  --filter-expression "#st = :running" \
  --expression-attribute-names '{"#st":"status"}' \
  --expression-attribute-values '{":running":{"S":"running"}}' \
  --profile "$PROFILE" \
  --query 'Items[].{job_id:job_id.S,created:created_at.S,exec:execution_arn.S}' \
  --output json)

# Count jobs
TOTAL=$(echo "$RUNNING_JOBS" | jq 'length')
echo "📊 Found $TOTAL jobs in 'running' state"

if [ "$TOTAL" -eq 0 ]; then
  echo "✅ No stuck jobs found!"
  exit 0
fi

# Filter for jobs without execution_arn (orphaned) or older than 1 hour
NOW=$(date -u +%s)
CUTOFF=$((NOW - 3600))  # 1 hour ago

STUCK_JOBS=$(echo "$RUNNING_JOBS" | jq --arg cutoff "$CUTOFF" '[
  .[] | select(
    .exec == null or .exec == "" or
    (.created != null and (.created | fromdateiso8601) < ($cutoff | tonumber))
  )
]')

STUCK_COUNT=$(echo "$STUCK_JOBS" | jq 'length')
echo "🚨 Found $STUCK_COUNT stuck/orphaned jobs:"
echo "$STUCK_JOBS" | jq -r '.[] | "  - \(.job_id) (created: \(.created // "unknown"))"'

if [ "$DRY_RUN" = "true" ]; then
  echo ""
  echo "🔍 DRY RUN MODE - No changes will be made"
  echo "Run without 'true' argument to actually update jobs"
  exit 0
fi

echo ""
read -p "❓ Mark these $STUCK_COUNT jobs as 'failed'? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Aborted"
  exit 1
fi

echo ""
echo "🔄 Updating jobs to 'failed' status..."

UPDATED=0
ERRORS=0

echo "$STUCK_JOBS" | jq -r '.[] | .job_id' | while read -r JOB_ID; do
  echo -n "  Updating $JOB_ID... "
  
  if aws dynamodb update-item \
    --table-name "$JOBS_TABLE" \
    --key "{\"job_id\":{\"S\":\"$JOB_ID\"}}" \
    --update-expression "SET #st = :failed, updated_at = :now" \
    --expression-attribute-names '{"#st":"status"}' \
    --expression-attribute-values "{\":failed\":{\"S\":\"failed\"},\":now\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}}" \
    --profile "$PROFILE" \
    --output json > /dev/null 2>&1; then
    echo "✅"
    UPDATED=$((UPDATED + 1))
  else
    echo "❌"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "📊 Cleanup Summary:"
echo "  ✅ Updated: $UPDATED"
echo "  ❌ Errors: $ERRORS"
echo ""
echo "🔄 Next step: Re-run backfill to update summaries:"
echo "  npm run backfill-summaries"
