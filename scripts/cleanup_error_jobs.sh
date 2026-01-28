#!/bin/bash
# Clean up error jobs from all DynamoDB tables

set -e

PROFILE="abstract"
JOBS_FILE="/tmp/jobs_to_delete.txt"

if [ ! -f "$JOBS_FILE" ]; then
    echo "Error: $JOBS_FILE not found"
    exit 1
fi

TOTAL_JOBS=$(wc -l < "$JOBS_FILE")
echo "Found $TOTAL_JOBS jobs to delete"
echo "================================================================================"

CURRENT=0
DELETED_JOBS=0
DELETED_SUMMARIES=0
DELETED_EVENTS=0
DELETED_METRICS=0
DELETED_ARTIFACTS=0

while IFS= read -r JOB_ID; do
    CURRENT=$((CURRENT + 1))
    echo -n "[$CURRENT/$TOTAL_JOBS] Cleaning up job: ${JOB_ID:0:8}... "
    
    # Delete from til-jobs
    aws dynamodb delete-item \
        --table-name til-jobs \
        --key "{\"job_id\": {\"S\": \"$JOB_ID\"}}" \
        --profile "$PROFILE" \
        --output json > /dev/null 2>&1 && DELETED_JOBS=$((DELETED_JOBS + 1))
    
    # Delete from til-job-summaries
    aws dynamodb delete-item \
        --table-name til-job-summaries \
        --key "{\"job_id\": {\"S\": \"$JOB_ID\"}}" \
        --profile "$PROFILE" \
        --output json > /dev/null 2>&1 && DELETED_SUMMARIES=$((DELETED_SUMMARIES + 1))
    
    # Delete from til-decision-events-by-job (need to query first to get sort keys)
    EVENTS=$(aws dynamodb query \
        --table-name til-decision-events-by-job \
        --key-condition-expression "job_id = :job_id" \
        --expression-attribute-values "{\":job_id\": {\"S\": \"$JOB_ID\"}}" \
        --profile "$PROFILE" \
        --output json 2>/dev/null | jq -r '.Items[].record_type_timestamp.S' || echo "")
    
    EVENT_COUNT=0
    for TIMESTAMP in $EVENTS; do
        aws dynamodb delete-item \
            --table-name til-decision-events-by-job \
            --key "{\"job_id\": {\"S\": \"$JOB_ID\"}, \"record_type_timestamp\": {\"S\": \"$TIMESTAMP\"}}" \
            --profile "$PROFILE" \
            --output json > /dev/null 2>&1 && EVENT_COUNT=$((EVENT_COUNT + 1))
    done
    DELETED_EVENTS=$((DELETED_EVENTS + EVENT_COUNT))
    
    # Delete from til-generation-metrics
    METRICS=$(aws dynamodb query \
        --table-name til-generation-metrics \
        --key-condition-expression "job_id = :job_id" \
        --expression-attribute-values "{\":job_id\": {\"S\": \"$JOB_ID\"}}" \
        --profile "$PROFILE" \
        --output json 2>/dev/null | jq -r '.Items[].record_type_timestamp.S' || echo "")
    
    METRIC_COUNT=0
    for TIMESTAMP in $METRICS; do
        aws dynamodb delete-item \
            --table-name til-generation-metrics \
            --key "{\"job_id\": {\"S\": \"$JOB_ID\"}, \"record_type_timestamp\": {\"S\": \"$TIMESTAMP\"}}" \
            --profile "$PROFILE" \
            --output json > /dev/null 2>&1 && METRIC_COUNT=$((METRIC_COUNT + 1))
    done
    DELETED_METRICS=$((DELETED_METRICS + METRIC_COUNT))
    
    # Delete from til-artifacts
    ARTIFACTS=$(aws dynamodb query \
        --table-name til-artifacts \
        --key-condition-expression "job_id = :job_id" \
        --expression-attribute-values "{\":job_id\": {\"S\": \"$JOB_ID\"}}" \
        --profile "$PROFILE" \
        --output json 2>/dev/null | jq -r '.Items[].artifact_type_iteration.S' || echo "")
    
    ARTIFACT_COUNT=0
    for ARTIFACT_KEY in $ARTIFACTS; do
        aws dynamodb delete-item \
            --table-name til-artifacts \
            --key "{\"job_id\": {\"S\": \"$JOB_ID\"}, \"artifact_type_iteration\": {\"S\": \"$ARTIFACT_KEY\"}}" \
            --profile "$PROFILE" \
            --output json > /dev/null 2>&1 && ARTIFACT_COUNT=$((ARTIFACT_COUNT + 1))
    done
    DELETED_ARTIFACTS=$((DELETED_ARTIFACTS + ARTIFACT_COUNT))
    
    TOTAL_FOR_JOB=$((1 + 1 + EVENT_COUNT + METRIC_COUNT + ARTIFACT_COUNT))
    echo "✓ Deleted: $TOTAL_FOR_JOB records"
    
done < "$JOBS_FILE"

echo "================================================================================"
echo ""
echo "Summary:"
echo "  Total jobs processed: $TOTAL_JOBS"
echo ""
echo "Records deleted by table:"
echo "  til-jobs: $DELETED_JOBS"
echo "  til-job-summaries: $DELETED_SUMMARIES"
echo "  til-decision-events-by-job: $DELETED_EVENTS"
echo "  til-generation-metrics: $DELETED_METRICS"
echo "  til-artifacts: $DELETED_ARTIFACTS"
echo ""
TOTAL_DELETED=$((DELETED_JOBS + DELETED_SUMMARIES + DELETED_EVENTS + DELETED_METRICS + DELETED_ARTIFACTS))
echo "Total records deleted: $TOTAL_DELETED"
