# Dashboard V2 Context

## Overview

Dashboard V2 is a research analytics system with 10x performance improvement over V1 (320ms vs 3.2s).

**Key Innovation**: Pre-aggregated data in `til-job-summaries` table instead of query-time aggregation.

## API Endpoints

All endpoints support `?days=N` parameter (default: 30):

```
GET /api/v1/dashboard/v2/executive        # Executive summary
GET /api/v1/dashboard/v2/vendors/manager  # Manager vendor analysis
GET /api/v1/dashboard/v2/vendors/worker   # Worker vendor analysis
GET /api/v1/dashboard/v2/context          # Conference/topic effects
GET /api/v1/dashboard/v2/evaluator        # Evaluator accuracy
GET /api/v1/dashboard/v2/tools            # Tool usage patterns
GET /api/v1/dashboard/v2/speed            # Performance timings
```

## Infrastructure

| Component | Purpose |
|-----------|---------|
| `til-job-summaries` table | Pre-aggregated job data |
| `created-at-index` GSI | Query by status + date |
| `til-job-summary-generator` Lambda | Triggered by EventBridge on job completion |
| `til-dashboard-v2-handler` Lambda | Serves Dashboard V2 endpoints |

## Query Pattern

**Always use parallel GSI queries**, never table scan:

```typescript
const [completedResult, failedResult] = await Promise.all([
  docClient.send(new QueryCommand({
    TableName: 'til-job-summaries',
    IndexName: 'created-at-index',
    KeyConditionExpression: '#status = :status AND created_at > :startDate',
    ExpressionAttributeValues: { ':status': 'completed', ':startDate': startDate }
  })),
  docClient.send(new QueryCommand({
    // Same for 'failed' status
  }))
]);
```

## Key Fields in Job Summaries

| Field | Description |
|-------|-------------|
| `manager_vendor` | OpenAI or Anthropic (orchestrator) |
| `worker_vendor` | OpenAI or Anthropic (abstract writer) |
| `manager_self_score` | Manager's self-assessment (1-10) |
| `assessor_1_score` | Nova primary score |
| `assessor_2_score` | Nova secondary score |
| `blended_score` | Average of all 3 scores |
| `final_score` | Blended minus penalties |
| `evaluator_prediction` | Predicted conference |
| `evaluator_correct` | Whether prediction matched target |

## Frontend Integration

```typescript
import { dashboardService } from '@/services/api/dashboard';
import { useDashboardData } from '@/hooks/useDashboardData';

const { data, loading, error } = useDashboardData({
  fetchFn: useCallback(() => dashboardService.getV2Executive(30), []),
  autoRefresh: true,
});
```

## Backfilling Existing Jobs

After deploying Dashboard V2, backfill existing jobs:

```bash
npm run backfill-summaries
```

## Caching

Dashboard V2 Lambda has 5-minute cache. To force refresh:
- Update a Lambda environment variable
- Or wait for cache expiry
