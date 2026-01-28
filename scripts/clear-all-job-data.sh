#!/bin/bash
# Clear all transactional job data from DynamoDB tables
# This preserves reference data (conference guidance, examples, etc.)

set -e

PROFILE="abstract"
REGION="us-east-1"

echo "🧹 DynamoDB Data Cleanup - Fresh Start"
echo "======================================"
echo ""
echo "⚠️  WARNING: This will DELETE ALL job data from the following tables:"
echo "   - til-jobs (main job records)"
echo "   - til-job-summaries (dashboard aggregated data)"
echo "   - til-generation-metrics (iteration metrics)"
echo "   - til-decision-events-by-job (decision logs)"
echo "   - til-artifacts (worker tool outputs)"
echo "   - til-evaluator-jobs (evaluator queue)"
echo "   - til-evaluator-results (evaluator predictions)"
echo ""
echo "✅ This will PRESERVE reference data:"
echo "   - til-conference-data (guidance, examples, rules)"
echo ""
read -p "Type 'DELETE ALL DATA' to proceed: " confirmation

if [ "$confirmation" != "DELETE ALL DATA" ]; then
    echo "❌ Cleanup cancelled."
    exit 0
fi

echo ""
echo "Starting cleanup..."
echo ""

# Function to scan and delete all items from a table
delete_all_items() {
    local table=$1
    local key_name=$2
    local sort_key=$3
    
    echo "🗑️  Clearing table: $table"
    
    # Scan table and get all keys
    if [ -z "$sort_key" ]; then
        # Single key
        aws dynamodb scan \
            --table-name "$table" \
            --projection-expression "$key_name" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --output json \
            | jq -r ".Items[] | .$key_name.S // .$key_name.N" \
            | while read -r key_value; do
                if [ -n "$key_value" ]; then
                    aws dynamodb delete-item \
                        --table-name "$table" \
                        --key "{\"$key_name\": {\"S\": \"$key_value\"}}" \
                        --profile "$PROFILE" \
                        --region "$REGION" \
                        > /dev/null 2>&1
                    echo "   Deleted: $key_value"
                fi
            done
    else
        # Composite key (partition + sort)
        aws dynamodb scan \
            --table-name "$table" \
            --projection-expression "$key_name,$sort_key" \
            --profile "$PROFILE" \
            --region "$REGION" \
            --output json \
            | jq -r ".Items[] | {pk: (.$key_name.S // .$key_name.N), sk: (.$sort_key.S // .$sort_key.N)} | @json" \
            | while read -r keys_json; do
                if [ -n "$keys_json" ]; then
                    pk=$(echo "$keys_json" | jq -r '.pk')
                    sk=$(echo "$keys_json" | jq -r '.sk')
                    
                    aws dynamodb delete-item \
                        --table-name "$table" \
                        --key "{\"$key_name\": {\"S\": \"$pk\"}, \"$sort_key\": {\"S\": \"$sk\"}}" \
                        --profile "$PROFILE" \
                        --region "$REGION" \
                        > /dev/null 2>&1
                    echo "   Deleted: $pk | $sk"
                fi
            done
    fi
    
    # Get final count
    local count=$(aws dynamodb scan --table-name "$table" --select "COUNT" --profile "$PROFILE" --region "$REGION" --query 'Count' --output text)
    echo "   ✅ Table $table cleared. Remaining items: $count"
    echo ""
}

# Clear each table
echo "1/7 Clearing til-jobs..."
delete_all_items "til-jobs" "job_id"

echo "2/7 Clearing til-job-summaries..."
delete_all_items "til-job-summaries" "job_id"

echo "3/7 Clearing til-generation-metrics..."
delete_all_items "til-generation-metrics" "job_id" "iteration"

echo "4/7 Clearing til-decision-events-by-job..."
delete_all_items "til-decision-events-by-job" "job_id" "event_id"

echo "5/7 Clearing til-artifacts..."
delete_all_items "til-artifacts" "job_id" "artifact_id"

echo "6/7 Clearing til-evaluator-jobs..."
delete_all_items "til-evaluator-jobs" "job_id"

echo "7/7 Clearing til-evaluator-results..."
delete_all_items "til-evaluator-results" "job_id"

echo ""
echo "🎉 Cleanup Complete!"
echo "==================="
echo ""
echo "All job data has been deleted. Tables are now empty and ready for fresh data."
echo ""
echo "Reference data (til-conference-data) was preserved."
echo ""
echo "Next steps:"
echo "  1. Add credits to Anthropic account"
echo "  2. Run batch submission: python3 scripts/batch-submit-jobs.py"
echo "  3. Monitor progress: ./scripts/monitor-batch-jobs.sh <batch-dir>"
echo ""
