# Observability Flow: From Agent Decision to Dashboard

This document traces how agent decisions become analytics insights - the core innovation that makes TIL an "observatory" rather than just a generator.

## Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        AGENT EXECUTION LAYER                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                     │
│  │   Manager   │   │   Worker    │   │  Evaluator  │                     │
│  │   Agent     │   │   Agent     │   │   Agent     │                     │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                     │
│         │                 │                 │                             │
│         ▼                 ▼                 ▼                             │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │              log_decision_event() - Shared Module              │      │
│  │           packages/shared/decision-events/event_logger.py      │      │
│  └────────────────────────────────────────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         EVENT STORAGE LAYER                               │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐       │
│  │  til-decision-events-by-job │   │   til-decision-event-ids    │       │
│  │  PK: job_id                 │   │   PK: event_id (SHA-256)    │       │
│  │  SK: seq#timestamp#type     │   │   (Idempotency table)       │       │
│  └─────────────────────────────┘   └─────────────────────────────┘       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                     (Job completes/fails)
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       AGGREGATION TRIGGER                                 │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                    EventBridge Rule                            │      │
│  │   Source: til.workflow                                         │      │
│  │   Events: "Job Completed" | "Job Failed" | "Job Aborted"       │      │
│  └────────────────────────────────────────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        AGGREGATION LAYER                                  │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │              Job Summary Generator Lambda                       │      │
│  │       packages/agents/job-summary-generator/handler.py         │      │
│  │                                                                 │      │
│  │   Reads from 5 sources:                                         │      │
│  │   • til-jobs (metadata)                                         │      │
│  │   • til-decision-events-by-job (manager decisions)              │      │
│  │   • til-generation-metrics (evaluator results)                  │      │
│  │   • til-artifacts (tool usage)                                  │      │
│  │   • til-job-budgets (cost)                                      │      │
│  └────────────────────────────────────────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       PRE-AGGREGATED STORAGE                              │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                    til-job-summaries                           │      │
│  │   PK: job_id                                                   │      │
│  │   GSI: created-at-index (PK: status, SK: created_at)           │      │
│  │                                                                 │      │
│  │   Contains:                                                     │      │
│  │   • Manager/Worker vendor assignments                           │      │
│  │   • All scoring breakdowns (self, Nova 1, Nova 2, blended)     │      │
│  │   • Tool sequences per iteration                                │      │
│  │   • Evaluator predictions and correctness                       │      │
│  │   • Duration and cost metrics                                   │      │
│  └────────────────────────────────────────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          QUERY LAYER                                      │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                   Dashboard V2 API Lambda                       │      │
│  │         packages/api/src/handlers/dashboard-v2.ts              │      │
│  │                                                                 │      │
│  │   Query Pattern: Parallel GSI queries by status                 │      │
│  │                                                                 │      │
│  │   const [completed, compromised, failed] = await Promise.all([ │      │
│  │     queryAllJobs('completed'),                                  │      │
│  │     queryAllJobs('completed_with_compromises'),                 │      │
│  │     queryAllJobs('failed'),                                     │      │
│  │   ]);                                                           │      │
│  └────────────────────────────────────────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        VISUALIZATION LAYER                                │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                    React Dashboards                             │      │
│  │               packages/frontend/src/pages/dashboard/            │      │
│  │                                                                 │      │
│  │   7 Research Dashboards:                                        │      │
│  │   • Executive Summary                                           │      │
│  │   • Vendor Analysis (Manager)                                   │      │
│  │   • Vendor Analysis (Worker)                                    │      │
│  │   • Context Effects                                             │      │
│  │   • Evaluator Accuracy                                          │      │
│  │   • Tool Patterns                                               │      │
│  │   • Speed & Efficiency                                          │      │
│  └────────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Decision Event Capture

Every significant agent action is logged as a structured decision event.

### Events Logged by Agent

| Agent | Event Types | Key Data Captured |
|-------|------------|-------------------|
| **Manager** | `MANAGER_GOAL_FORMULATED`, `MANAGER_ACCEPTED`, `MANAGER_REJECTED`, `ITERATION_COMPLETED` | Goals, scoring breakdown (self + Nova 1 + Nova 2), penalties, decisions |
| **Worker** | `AGENTIC_LOOP_STARTED`, `TOOL_CALLED`, `ABSTRACT_SUBMITTED`, `COST_GUARDRAIL_TRIGGERED` | Tool calls with inputs/outputs, action points, artifacts |
| **Evaluator** | `EVALUATOR_ASSESSED` | Predicted conference, confidence, top-3 predictions |

### Event Structure

```python
{
    'job_id': 'abc-123',
    'seq_ts_type': '0000000042#2026-01-20T10:30:15Z#tool_called',  # Sort key
    'event_id': 'sha256-hash',                                      # Idempotency
    'event_type': 'tool_called',
    'actor': 'worker',
    'iteration': 2,
    'details': {
        'tool_name': 'search_abstracts',
        'inputs': {'query': 'kubernetes security'},
        'results_summary': 'Found 5 matching abstracts',
        'action_points_remaining': 1
    }
}
```

### Idempotency Pattern

Events use a two-table pattern to prevent duplicates during Lambda retries:

1. Generate deterministic `event_id` via SHA-256 hash of execution context
2. Check `til-decision-event-ids` for existing event
3. If new, write to both `til-decision-event-ids` and `til-decision-events-by-job`

---

## 2. Aggregation Trigger

When a job reaches a terminal state, Step Functions publishes an EventBridge event:

```typescript
// workflow-stack.ts - Terminal states publish events
successState.next(createEventBridgePublishTask('Job Completed', 'completed'))
compromiseState.next(createEventBridgePublishTask('Job Completed', 'completed_with_compromises'))
failureState.next(createEventBridgePublishTask('Job Failed', 'failed'))
```

EventBridge rule routes to the aggregator:

```typescript
// compute-stack.ts
const rule = new events.Rule(this, 'JobCompletionRule', {
  ruleName: 'til-job-completion-summary-trigger',
  eventPattern: {
    source: ['til.workflow'],
    detailType: ['Job Completed', 'Job Failed', 'Job Aborted'],
  },
});
rule.addTarget(new targets.LambdaFunction(jobSummaryGeneratorLambda));
```

---

## 3. Job Summary Generation

The Job Summary Generator Lambda aggregates data from 5 sources:

| Source Table | Data Extracted |
|--------------|----------------|
| `til-jobs` | Job metadata, vendor assignments, timestamps |
| `til-decision-events-by-job` | Manager decisions, scoring per iteration |
| `til-generation-metrics` | Evaluator predictions, sequence counters |
| `til-artifacts` | Tool usage sequences per iteration |
| `til-job-budgets` | Total cost |

### Summary Record

```python
{
    'job_id': 'abc-123',
    'status': 'completed',
    'created_at': '2026-01-20T10:30:00Z',           # GSI sort key
    'conference': 'kubecon',
    'topic': 'k8s_containers',

    # Vendor assignments
    'manager_vendor': 'anthropic',
    'worker_vendor': 'openai',

    # Evaluator data
    'evaluator_prediction': 'kubecon',
    'evaluator_correct': True,
    'evaluator_confidence': 0.87,

    # Aggregate metrics
    'total_iterations_run': 2,
    'total_tool_calls': 8,
    'total_duration_seconds': 45.2,
    'estimated_cost_cents': 150,

    # Per-iteration breakdown
    'iterations': [
        {
            'iteration': 0,
            'decision': 'rejected',
            'manager_self_score': 7.5,
            'assessor_1_score': 7.83,
            'assessor_2_score': 8.08,
            'blended_score': 7.80,
            'final_score': 6.80,          # After -1.0 penalty
            'penalties': ['missing_red_team_review'],
            'tool_sequence': ['dynamodb_lookup', 'search_abstracts', 'submit_abstract']
        },
        {
            'iteration': 1,
            'decision': 'accepted',
            'manager_self_score': 8.5,
            'assessor_1_score': 8.45,
            'assessor_2_score': 8.58,
            'blended_score': 8.51,
            'final_score': 8.51,
            'penalties': [],
            'tool_sequence': ['search_abstracts', 'red_team_review', 'submit_abstract']
        }
    ]
}
```

---

## 4. Dashboard V2 Query Pattern

Dashboard V2 achieves **10x performance improvement** through:

1. **Pre-aggregated data**: No reconstruction from raw events at query time
2. **Parallel GSI queries**: Fetch all statuses simultaneously
3. **Status-partitioned GSI**: Efficient filtering by job outcome

### Query Implementation

```typescript
// dashboard-v2.ts
async function fetchAllJobs(days: number) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries for each status
  const [completed, compromised, failed] = await Promise.all([
    queryByStatus('completed', startDate),
    queryByStatus('completed_with_compromises', startDate),
    queryByStatus('failed', startDate),
  ]);

  return [...completed, ...compromised, ...failed];
}

async function queryByStatus(status: string, startDate: string) {
  return docClient.send(new QueryCommand({
    TableName: 'til-job-summaries',
    IndexName: 'created-at-index',              // GSI
    KeyConditionExpression: '#status = :status AND created_at > :start',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status, ':start': startDate },
    ScanIndexForward: false,                    // Most recent first
  }));
}
```

### Performance Comparison

| Approach | Query Time | Read Units | Scales To |
|----------|-----------|------------|-----------|
| V1 (Scan + reconstruct) | 3,200ms | ~45 RCU | ~100 jobs |
| V2 (GSI + pre-aggregated) | 320ms | ~4 RCU | 10,000+ jobs |

---

## 5. Research Dashboards

Each dashboard answers specific research questions:

| Dashboard | Key Metrics | Research Question |
|-----------|-------------|-------------------|
| **Executive** | Acceptance rate, avg score, cost/job | Overall system performance |
| **Vendors (Manager)** | Score distribution by vendor | Does OpenAI or Anthropic score more generously? |
| **Vendors (Worker)** | Quality score by vendor | Which vendor writes better abstracts? |
| **Context** | Scores by conference/topic | Which contexts are hardest? |
| **Evaluator** | Prediction accuracy, confusion matrix | How reliable is blind assessment? |
| **Tools** | Tool usage patterns, sequences | How do agents use tools differently? |
| **Speed** | Duration by vendor, iteration | Performance characteristics |

---

## Why This Architecture?

### Design Decisions

1. **Event-time capture, not query-time reconstruction**
   - Events are immutable once written
   - No risk of losing data if agents crash
   - Enables debugging via event replay

2. **EventBridge for decoupling**
   - Aggregation doesn't block job execution
   - Can add more consumers (alerts, exports) without changing agents
   - Retry semantics handled by AWS

3. **Pre-aggregation for performance**
   - Analytics queries are read-heavy
   - Job summaries computed once at completion
   - Dashboards stay fast as data grows

4. **GSI partitioned by status**
   - Most queries filter by outcome (completed vs failed)
   - Avoids scanning all jobs
   - Natural time-ordering via sort key
