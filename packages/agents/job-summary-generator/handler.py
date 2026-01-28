"""
🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨

MANDATORY PRE-MODIFICATION CHECKLIST:
1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
2. Read .ai-checklists/pre-deployment.md COMPLETELY
3. Read ALL inline comments in THIS file
4. Understand artifact reading logic for tool dashboard data

CRITICAL: This Lambda generates job summaries for Dashboard V2 (10x performance improvement).
Changes can break ALL dashboards. Test thoroughly!

Documentation: docs/DASHBOARD-V2-COMPLETE-ARCHITECTURE.md

🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK THINGS 🚨🚨🚨

---

Job Summary Generator Lambda
Generates pre-aggregated job summaries for dashboard performance optimization (10x speedup)

Triggered by: EventBridge rule on job completion (status = completed/failed/aborted)
Reads from: til-jobs, til-decision-events-by-job, til-generation-metrics, til-artifacts
Writes to: til-job-summaries

Performance: ~500ms per job (acceptable overhead)
"""

import os
import json
import boto3
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Any, Optional
from collections import defaultdict

# AWS clients
dynamodb = boto3.resource('dynamodb')
jobs_table = dynamodb.Table(os.environ['JOBS_TABLE_NAME'])
events_table = dynamodb.Table(os.environ['DECISION_EVENTS_BY_JOB_TABLE_NAME'])
metrics_table = dynamodb.Table(os.environ['GENERATION_METRICS_TABLE_NAME'])
summaries_table = dynamodb.Table(os.environ['JOB_SUMMARIES_TABLE_NAME'])
artifacts_table = dynamodb.Table(os.environ['ARTIFACTS_TABLE_NAME'])
budgets_table = dynamodb.Table(os.environ.get('JOB_BUDGETS_TABLE_NAME', 'til-job-budgets'))


def handler(event, context):
    """
    Lambda handler for job summary generation.
    
    Event format (from EventBridge):
    {
        "detail-type": "Job Completed",
        "detail": {
            "job_id": "uuid",
            "status": "completed" | "failed" | "aborted"
        }
    }
    """
    print(f"Event: {json.dumps(event)}")
    
    # Extract job_id from EventBridge event
    job_id = event['detail']['job_id']
    status = event['detail'].get('status', 'completed')
    
    print(f"Generating summary for job {job_id} (status: {status})")
    
    try:
        # 1. Get job metadata
        job_item = jobs_table.get_item(Key={'job_id': job_id})
        if 'Item' not in job_item:
            print(f"Job {job_id} not found in jobs table")
            return {'statusCode': 404, 'body': 'Job not found'}
        
        job = job_item['Item']
        
        # 2. Get all decision events for job
        events_response = events_table.query(
            KeyConditionExpression='job_id = :jid',
            ExpressionAttributeValues={':jid': job_id}
        )
        events = events_response.get('Items', [])
        print(f"Found {len(events)} events for job {job_id}")
        
        # 3. Get generation metrics
        metrics_response = metrics_table.query(
            KeyConditionExpression='job_id = :jid',
            ExpressionAttributeValues={':jid': job_id}
        )
        metrics_items = metrics_response.get('Items', [])
        
        # 4. Get artifacts (Story 6.1 - for tool usage data)
        artifacts_response = artifacts_table.query(
            KeyConditionExpression='job_id = :jid',
            ExpressionAttributeValues={':jid': job_id}
        )
        artifacts_items = artifacts_response.get('Items', [])
        print(f"Found {len(artifacts_items)} artifacts for job {job_id}")
        
        # 5. Get budget data (for cost tracking)
        try:
            budget_response = budgets_table.get_item(Key={'job_id': job_id})
            budget_item = budget_response.get('Item', {})
            estimated_cost_cents = int(budget_item.get('estimated_cost_cents', 0))
            print(f"Found budget data for job {job_id}: {estimated_cost_cents} cents")
        except Exception as e:
            print(f"Warning: Failed to get budget data for job {job_id}: {e}")
            estimated_cost_cents = 0
        
        # 6. Generate summary
        summary = generate_summary(job, events, metrics_items, artifacts_items, estimated_cost_cents)
        
        # 5. Write to summaries table
        summaries_table.put_item(Item=summary)
        
        print(f"✅ Summary created for job {job_id}")
        return {'statusCode': 200, 'body': json.dumps({'job_id': job_id})}
        
    except Exception as e:
        print(f"❌ Error generating summary for job {job_id}: {e}")
        import traceback
        traceback.print_exc()
        return {'statusCode': 500, 'body': str(e)}


def generate_summary(job: Dict, events: List[Dict], metrics: List[Dict], artifacts: List[Dict], estimated_cost_cents: int = 0) -> Dict:
    """Generate aggregated job summary from raw events, metrics, and artifacts."""
    
    job_id = job['job_id']
    
    # Parse vendor assignment
    vendor_assignment = job.get('vendor_assignment', {})
    manager_vendor = vendor_assignment.get('manager_vendor', 'unknown')
    worker_vendor = vendor_assignment.get('worker_vendor', 'unknown')
    
    # Parse request context
    request_context = job.get('request_context', {})
    conference = request_context.get('conference', 'unknown')
    topic = request_context.get('topic', 'unknown')
    
    # Parse timestamps
    created_at = job.get('created_at', datetime.utcnow().isoformat())
    completed_at = job.get('updated_at', datetime.utcnow().isoformat())
    
    # Calculate duration
    try:
        created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        completed_dt = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))
        total_duration_seconds = (completed_dt - created_dt).total_seconds()
    except:
        total_duration_seconds = 0
    
    # Parse outcome
    outcome = job.get('status', 'unknown')
    selected_iteration = job.get('selected_iteration')
    # Convert Decimal to int if needed (from DynamoDB)
    if selected_iteration is not None:
        selected_iteration = int(selected_iteration)
    
    # Aggregate events by iteration (legacy, for decisions)
    iterations_data = aggregate_events_by_iteration(events)
    
    # Extract tool data from artifacts (Story 6.1)
    artifacts_data = extract_artifacts_data(artifacts, iterations_data)
    
    # Extract evaluator results from metrics (for selected iteration)
    evaluator_data = extract_evaluator_data(metrics, selected_iteration)
    
    # Calculate evaluator correctness (compare prediction to actual conference)
    evaluator_correct = (
        evaluator_data.get('prediction') == conference and 
        evaluator_data.get('prediction') != 'unknown'
    )
    
    # Build summary
    summary = {
        'job_id': job_id,
        'created_at': created_at,
        'completed_at': completed_at,
        'status': outcome,
        'conference': conference,
        'topic': topic,
        'manager_vendor': manager_vendor,
        'worker_vendor': worker_vendor,
        'outcome': outcome,
        'selected_iteration': selected_iteration if selected_iteration is not None else -1,
        'total_iterations_run': len(artifacts_data),
        'iterations': artifacts_data,  # Use artifacts_data (has tool usage)
        'total_duration_seconds': Decimal(str(total_duration_seconds)),
        'total_tool_calls': sum(len(it.get('tool_sequence', [])) for it in artifacts_data),  # Count all calls including duplicates
        'unique_tools_used': list(set(
            tool for it in artifacts_data for tool in it.get('tools_used', [])
        )),
        # Evaluator data
        'evaluator_prediction': evaluator_data.get('prediction', 'unknown'),
        'evaluator_confidence': Decimal(str(evaluator_data.get('confidence', 0))),
        'evaluator_top_3': evaluator_data.get('top_3', []),
        'evaluator_correct': evaluator_correct,
        'evaluator_picked_decoy': evaluator_data.get('picked_decoy', False),
        # Quality scores
        'final_quality_score': Decimal(str(get_final_quality_score(iterations_data, selected_iteration))),
        'avg_quality_score': Decimal(str(get_avg_quality_score(iterations_data))),
        # Cost (from budget table - source of truth)
        'estimated_cost_cents': estimated_cost_cents,
        # TTL: 30 days from now
        'expires_at': int((datetime.utcnow() + timedelta(days=30)).timestamp()),
    }
    
    return summary


def extract_artifacts_data(artifacts: List[Dict], iterations_data: List[Dict]) -> List[Dict]:
    """
    Extract tool usage from artifacts (Story 6.1) and merge into iterations_data.
    
    Returns updated iterations_data with tool usage from artifacts.
    """
    # Build iteration map for quick lookup
    iterations_map = {it['iteration']: it for it in iterations_data}
    
    # Process each artifact
    for artifact in artifacts:
        meta = artifact.get('meta', {})
        iteration = meta.get('iteration', 0)
        provenance = artifact.get('provenance', {})
        tool_calls = provenance.get('tool_calls', [])
        
        # Initialize iteration if not exists
        if iteration not in iterations_map:
            iterations_map[iteration] = {
                'iteration': iteration,
                'duration_seconds': 0,
                'decision': 'pending',
                'quality_score': 0,
                'tools_used': [],
                'tool_sequence': [],
                'tool_counts': {}
            }
        
        # Extract tool data from artifact
        for tool_call in tool_calls:
            tool_name = tool_call.get('tool_name', 'unknown')
            
            # Add to tools_used (unique list)
            if tool_name not in iterations_map[iteration]['tools_used']:
                iterations_map[iteration]['tools_used'].append(tool_name)
            
            # Add to tool_sequence (preserves order, allows duplicates)
            iterations_map[iteration]['tool_sequence'].append(tool_name)
            
            # Increment tool count
            iterations_map[iteration]['tool_counts'][tool_name] = \
                iterations_map[iteration]['tool_counts'].get(tool_name, 0) + 1
    
    # Convert back to sorted list
    result = sorted(iterations_map.values(), key=lambda x: x['iteration'])
    
    # Convert Decimals to floats for JSON serialization
    for it in result:
        it['quality_score'] = Decimal(str(it.get('quality_score', 0)))
        it['duration_seconds'] = Decimal(str(it.get('duration_seconds', 0)))
    
    return result


def aggregate_events_by_iteration(events: List[Dict]) -> List[Dict]:
    """Aggregate events into per-iteration summaries (legacy, for manager decisions)."""
    
    iterations = defaultdict(lambda: {
        'iteration': 0,
        'duration_seconds': 0,
        'decision': 'pending',
        'quality_score': 0,
        'tools_used': [],
        'tool_sequence': [],
        'tool_counts': {},
        # Manager scoring breakdown (NEW: 2026-01-20)
        'manager_self_score': 0,
        'manager_self_score_original': 0,
        'assessor_1_score': 0,
        'assessor_1_score_original': 0,
        'assessor_2_score': 0,
        'assessor_2_score_original': 0,
        'blended_score': 0,
        'penalty_amount': 0,
        'penalties': [],
        'final_score': 0,
    })
    
    for event in events:
        details = event.get('details', {})
        iteration = event.get('iteration', details.get('iteration', 0))  # iteration is top-level
        event_type = event.get('event_type', '')  # event_type is top-level, not in details
        
        # Track manager decisions (still from events)
        if event_type in ['manager_accepted', 'manager_rejected']:
            iterations[iteration]['decision'] = 'accepted' if event_type == 'manager_accepted' else 'rejected'
            iterations[iteration]['quality_score'] = details.get('final_score', details.get('quality_score', 0))
            
            # Extract scoring breakdown (NEW: 2026-01-20)
            # Manager self-assessment
            iterations[iteration]['manager_self_score'] = details.get('manager_self_score', 0)
            iterations[iteration]['manager_self_score_original'] = details.get('manager_self_score_original', 0)
            # Nova assessors
            iterations[iteration]['assessor_1_score'] = details.get('assessor_1_score', 0)
            iterations[iteration]['assessor_1_score_original'] = details.get('assessor_1_score_original', 0)
            iterations[iteration]['assessor_2_score'] = details.get('assessor_2_score', 0)
            iterations[iteration]['assessor_2_score_original'] = details.get('assessor_2_score_original', 0)
            # Blended and final
            iterations[iteration]['blended_score'] = details.get('blended_score', 0)
            iterations[iteration]['penalty_amount'] = details.get('penalty_amount', 0)
            iterations[iteration]['penalties'] = details.get('penalties', [])
            iterations[iteration]['final_score'] = details.get('final_score', details.get('quality_score', 0))
        
        # Track iteration number
        iterations[iteration]['iteration'] = iteration
    
    # Convert to sorted list
    result = sorted(iterations.values(), key=lambda x: x['iteration'])
    
    # Convert Decimals to floats for JSON serialization
    for it in result:
        it['quality_score'] = Decimal(str(it['quality_score']))
        it['duration_seconds'] = Decimal(str(it.get('duration_seconds', 0)))
        # Convert all scoring fields to Decimal for DynamoDB
        it['manager_self_score'] = Decimal(str(it.get('manager_self_score', 0)))
        it['manager_self_score_original'] = Decimal(str(it.get('manager_self_score_original', 0)))
        it['assessor_1_score'] = Decimal(str(it.get('assessor_1_score', 0)))
        it['assessor_1_score_original'] = Decimal(str(it.get('assessor_1_score_original', 0)))
        it['assessor_2_score'] = Decimal(str(it.get('assessor_2_score', 0)))
        it['assessor_2_score_original'] = Decimal(str(it.get('assessor_2_score_original', 0)))
        it['blended_score'] = Decimal(str(it.get('blended_score', 0)))
        it['penalty_amount'] = Decimal(str(it.get('penalty_amount', 0)))
        it['final_score'] = Decimal(str(it.get('final_score', 0)))
    
    return result


def extract_evaluator_data(metrics: List[Dict], selected_iteration: Optional[int] = None) -> Dict:
    """Extract evaluator results from generation metrics for the selected iteration.
    
    Args:
        metrics: List of generation metrics records
        selected_iteration: The iteration that was selected (0-indexed). If None, uses first evaluator record found.
    
    Returns:
        Dict with evaluator prediction data
    """
    
    evaluator_data = {
        'prediction': 'unknown',
        'confidence': 0,
        'top_3': [],
        'correct': False,
        'picked_decoy': False
    }
    
    # Find evaluator record for the selected iteration
    # Note: Evaluator records don't have 'iteration' field, but they correspond to iterations by timestamp order
    evaluator_records = []
    for metric in metrics:
        record_type = metric.get('record_type_timestamp', '')
        if record_type.startswith('evaluator#'):
            evaluator_records.append(metric)
    
    # Sort by timestamp (embedded in record_type_timestamp after 'evaluator#')
    evaluator_records.sort(key=lambda x: x.get('record_type_timestamp', ''))
    
    # Select the evaluator record matching the selected iteration (0-indexed)
    if evaluator_records:
        if selected_iteration is not None and 0 <= selected_iteration < len(evaluator_records):
            target_record = evaluator_records[selected_iteration]
        else:
            # Fallback: use the last evaluator record (most recent)
            target_record = evaluator_records[-1]
        
        # Extract top prediction (evaluator writes top_3_conferences as a list)
        top_3 = target_record.get('top_3_conferences', [])
        if top_3 and len(top_3) > 0:
            evaluator_data['prediction'] = top_3[0]
            evaluator_data['top_3'] = top_3
        
        # Extract confidence (evaluator writes confidence_scores as a list)
        confidence_scores = target_record.get('confidence_scores', [])
        if confidence_scores and len(confidence_scores) > 0:
            evaluator_data['confidence'] = float(confidence_scores[0])
        
        # Read picked_decoy directly from evaluator record (source of truth)
        # The evaluator Lambda already calculates this correctly
        evaluator_data['picked_decoy'] = target_record.get('picked_decoy', False)
        # Handle DynamoDB boolean type (can be BOOL or boolean)
        if isinstance(evaluator_data['picked_decoy'], dict) and 'BOOL' in evaluator_data['picked_decoy']:
            evaluator_data['picked_decoy'] = evaluator_data['picked_decoy']['BOOL']
        evaluator_data['picked_decoy'] = bool(evaluator_data['picked_decoy'])
        
        # Note: 'correct' is calculated later by comparing to actual conference
        # Don't try to read it from the metric (evaluator is blind, doesn't know target)
    
    return evaluator_data


def get_final_quality_score(iterations: List[Dict], selected_iteration: Optional[int]) -> float:
    """Get final quality score from selected iteration."""
    if selected_iteration is None or selected_iteration < 0:
        return 0.0
    
    for it in iterations:
        if it['iteration'] == selected_iteration:
            return float(it.get('quality_score', 0))
    
    return 0.0


def get_avg_quality_score(iterations: List[Dict]) -> float:
    """Calculate average quality score across all iterations."""
    scores = [float(it.get('quality_score', 0)) for it in iterations if it.get('quality_score', 0) > 0]
    return sum(scores) / len(scores) if scores else 0.0
