# DynamoDB Query Patterns

**Authoritative source for all DynamoDB query patterns used in the system.**

## Table: generation_metrics

### Base Table Query: By job_id

**Access Pattern:** Get all metrics for a specific job

**Query:**
```python
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id}
)
```

**Use Cases:**
- Retrieve all metrics (summary, iterations, events) for a job
- Workflow reconstruction for a specific job
- Job-level analytics

**Performance:** O(1) - Single partition query, fast

---

## Table: scratch_artifacts

### Base Table Query: By job_id

**Access Pattern:** Get all artifacts for a specific job

**Query:**
```python
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id}
)
```

**Use Cases:**
- Retrieve all artifacts for a job (for dependency graph construction)
- List artifacts for display
- Artifact traceability queries

**Performance:** O(1) - Single partition query, fast

**Story 3.2:** Used by `build_dependency_graph()` to query all artifacts and build dependency graph from `provenance.upstream_artifacts[]`

---

### GSI1 Query: Time-Series by date_partition

**Access Pattern:** Get time-series data for a date range (for dashboard queries)

**Index:** `date-partition-timestamp-index`
- Partition Key: `date_partition` (String, YYYY-MM-DD)
- Sort Key: `timestamp` (String, ISO 8601 with Z)

**Query:**
```python
# Query for a specific date
response = table.query(
    IndexName='date-partition-timestamp-index',
    KeyConditionExpression='date_partition = :date',
    ExpressionAttributeValues={':date': '2026-01-15'},
    ScanIndexForward=True  # Ascending order (oldest first)
)

# Query for date range (requires multiple queries, one per date)
# For last 30 days:
from datetime import datetime, timedelta
dates = [(datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(30)]
all_items = []
for date in dates:
    response = table.query(
        IndexName='date-partition-timestamp-index',
        KeyConditionExpression='date_partition = :date',
        ExpressionAttributeValues={':date': date}
    )
    all_items.extend(response['Items'])
```

**Use Cases:**
- Dashboard time-series charts (last 30 days)
- Real-time metrics for today's data
- Trend analysis

**Performance:** O(1) per date partition - Efficient for date-based queries

**Note:** For historical data (yesterday and earlier), prefer `daily_metrics` table (precomputed aggregates).

---

### GSI2 Query: Summary Aggregation by date_partition

**Access Pattern:** Get summary records only for a specific date (for nightly aggregation)

**Index:** `date-partition-record-type-index`
- Partition Key: `date_partition` (String, YYYY-MM-DD)
- Sort Key: `record_type_timestamp` (String, e.g., "summary#2026-01-15T10:31:27Z")

**Query:**
```python
# Query summary records only for a specific date
response = table.query(
    IndexName='date-partition-record-type-index',
    KeyConditionExpression='date_partition = :date AND begins_with(record_type_timestamp, :summary_prefix)',
    ExpressionAttributeValues={
        ':date': '2026-01-15',
        ':summary_prefix': 'summary#'
    }
)
```

**Use Cases:**
- Nightly aggregation Lambda (queries yesterday's summary records)
- Dashboard aggregation queries (summary records only, excludes iteration/event records)
- Cost-efficient aggregation (only reads summary records, not all record types)

**Performance:** O(1) per date partition - Efficient, only reads summary records

**Key Benefit:** `begins_with(record_type_timestamp, "summary#")` filter ensures only summary records are read, avoiding iteration and event records (cost-efficient).

---

## Table: scratch_artifacts

### Base Table Query: By job_id

**Access Pattern:** Get all artifacts for a job

**Query:**
```python
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id}
)
```

**Use Cases:**
- Workflow reconstruction (get all artifacts for a job)
- Artifact listing API endpoint
- Job-level artifact analysis

**Performance:** O(1) - Single partition query, fast

---

### Base Table Query: Get specific artifact

**Access Pattern:** Get a specific artifact by job_id + task_id + artifact_version

**Query:**
```python
artifact_sk = f"{task_id}#{artifact_version}"  # e.g., "cfp_extract#v0001"
response = table.get_item(
    Key={
        'job_id': job_id,
        'artifact_sk': artifact_sk
    }
)
```

**Use Cases:**
- Artifact retrieval API endpoint
- Specific artifact access

**Performance:** O(1) - Direct GetItem, fastest

---

### Base Table Query: Get latest artifact version

**Access Pattern:** Get the latest artifact version for a task (using latest index or Query)

**Option 1: Using latest index (fastest)**
```python
# Get latest index item
latest_item = table.get_item(
    Key={
        'job_id': job_id,
        'artifact_sk': f'latest#{task_id}'
    }
)

if latest_item.get('Item'):
    artifact_version = latest_item['Item']['artifact_version']
    # Then get the actual artifact
    artifact = table.get_item(
        Key={
            'job_id': job_id,
            'artifact_sk': f"{task_id}#{artifact_version}"
        }
    )
```

**Option 2: Query with begins_with (fallback if index missing)**
```python
# Query by job_id, filter by task_id prefix, sort descending
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    FilterExpression='begins_with(artifact_sk, :task_prefix)',
    ExpressionAttributeValues={
        ':job_id': job_id,
        ':task_prefix': f'{task_id}#'
    },
    ScanIndexForward=False,  # Descending order (v0002 > v0001 lexicographically)
    Limit=1
)

if response['Items']:
    artifact = response['Items'][0]
```

**Use Cases:**
- Get latest artifact version (when version not specified)
- Artifact retrieval API endpoint (default behavior)

**Performance:** 
- Option 1: O(1) - Single GetItem (fastest)
- Option 2: O(N) where N = number of artifacts for task (slower, but works if index missing)

**Note:** Zero-padded artifact versions (v0001, v0002) ensure lexicographic sorting works correctly.

---

## Table: jobs

### Base Table Query: Get job status

**Access Pattern:** Get job by job_id

**Query:**
```python
response = table.get_item(
    Key={'job_id': job_id}
)
```

**Use Cases:**
- Job status API endpoint
- Token verification (single-read pattern)

**Performance:** O(1) - Direct GetItem, fastest

---

### GSI Query: List failed jobs (if GSI exists)

**Access Pattern:** Get failed jobs for admin/debug

**Index:** `status-created_at-index` (optional, can be added later)
- Partition Key: `status` (String, e.g., "failed")
- Sort Key: `created_at` (String, ISO timestamp)

**Query:**
```python
response = table.query(
    IndexName='status-created_at-index',
    KeyConditionExpression='#status = :status AND created_at >= :since',
    ExpressionAttributeNames={'#status': 'status'},
    ExpressionAttributeValues={
        ':status': 'failed',
        ':since': (datetime.now() - timedelta(days=7)).isoformat()
    }
)
```

**Use Cases:**
- Admin endpoint: List failed jobs
- Debugging and monitoring

**Performance:** O(1) per status partition - Efficient for status-based queries

**Note:** This GSI is optional for MVP. Can use Scan with filter if needed (low volume for admin queries).

---

## Table: decision_events_by_job

### Base Table Query: Get events for job (chronological order)

**Access Pattern:** Get all events for a job in chronological order (seq-first ensures deterministic ordering)

**Query:**
```python
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id},
    ScanIndexForward=True  # Ascending order (seq-first ensures deterministic order)
)
```

**Use Cases:**
- Event replay API endpoint: `GET /api/v1/workflow/{job_id}/events`
- Workflow reconstruction for a specific job
- Event timeline visualization

**Performance:** O(1) - Single partition query, fast

**Note:** Seq-first sort key ensures deterministic ordering even with clock skew or concurrent writes.

---

### Base Table Query: Get events with pagination

**Access Pattern:** Get events for a job with cursor-based pagination

**Query:**
```python
# First page
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id},
    ScanIndexForward=True,
    Limit=200  # Default limit
)

# Next page (if LastEvaluatedKey exists)
if 'LastEvaluatedKey' in response:
    next_cursor = base64.b64encode(json.dumps(response['LastEvaluatedKey']).encode()).decode()
    # Client sends cursor in next request
    # Server decodes cursor and uses as ExclusiveStartKey
    last_key = json.loads(base64.b64decode(next_cursor).decode())
    response = table.query(
        KeyConditionExpression='job_id = :job_id',
        ExpressionAttributeValues={':job_id': job_id},
        ScanIndexForward=True,
        Limit=200,
        ExclusiveStartKey=last_key
    )
```

**Cursor Encoding:** Base64-encoded JSON of `LastEvaluatedKey` (opaque to client)

**Use Cases:**
- Paginated event retrieval API
- Large job event streams (>200 events)

**Performance:** O(1) per page - Efficient pagination

---

### Base Table Query: Get events by event type (client-side filter)

**Access Pattern:** Get events for a job, filter by event_type client-side

**Query:**
```python
response = table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id},
    ScanIndexForward=True
)

# Filter client-side (no GSI needed for MVP)
filtered_events = [e for e in response['Items'] if e['event_type'] == 'tool_called']
```

**Use Cases:**
- Filter events by type (e.g., all `tool_called` events)
- Event type-specific analytics

**Performance:** O(1) query + O(n) filter - Acceptable for MVP (can add GSI later if needed)

**Note:** Client-side filtering is acceptable for MVP. Can add GSI on `event_type` later if needed.

---

## Table: decision_event_ids

### Base Table Query: Check event idempotency

**Access Pattern:** Check if event_id already exists (idempotency check)

**Query:**
```python
response = table.get_item(
    Key={'event_id': event_id}
)

if 'Item' in response:
    # Event already exists, return existing event pointer
    existing_item = response['Item']
    # Use existing_item['job_id'] and existing_item['sk'] to fetch full event
```

**Use Cases:**
- Idempotency check before writing new event
- Deduplication on Step Functions retries

**Performance:** O(1) - Direct GetItem, fastest

**Note:** Used in conjunction with `decision_events_by_job` via `TransactWriteItems` for atomic writes.

---

## Table: daily_metrics

### Base Table Query: Get precomputed metrics for a date

**Access Pattern:** Get precomputed daily aggregates

**Query:**
```python
# Get all metrics for a specific date
response = table.query(
    KeyConditionExpression='metric_date = :date',
    ExpressionAttributeValues={':date': '2026-01-15'}
)

# Get specific metric type for a date
response = table.get_item(
    Key={
        'metric_date': '2026-01-15',
        'metric_type_schema_version': 'acceptance_by_vendor#v1'
    }
)
```

**Use Cases:**
- Dashboard historical data (yesterday and earlier)
- Precomputed aggregation queries
- Fast dashboard responses

**Performance:** O(1) - Direct GetItem or Query, very fast

**Note:** Daily metrics are precomputed by nightly Lambda, providing fast dashboard queries without real-time aggregation.

---

## Query Performance Best Practices

1. **Use GSIs for cross-partition queries:** Base table queries are fastest, but GSIs enable efficient queries across partitions.

2. **Prefer daily_metrics for historical data:** For dashboard queries, use `daily_metrics` for historical data (yesterday and earlier) and `generation_metrics` GSI1 for today's data.

3. **Use GSI2 for aggregation:** GSI2 with `begins_with()` filter ensures only summary records are read (cost-efficient).

4. **Batch queries for date ranges:** For time-series queries over multiple dates, query each date partition separately (one query per date).

5. **Use latest index for artifact retrieval:** Prefer latest index over Query for getting latest artifact version (faster).

6. **Single-read pattern for auth:** Job status endpoint uses single GetItem for both auth and status (prevents probing attacks).

---

## Query Examples by Use Case

### Dashboard: Last 30 days time-series

```python
# Strategy: Query daily_metrics for historical (yesterday and earlier)
# Query generation_metrics GSI1 for today

from datetime import datetime, timedelta

today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')

# Get historical data (yesterday and earlier) from daily_metrics
historical = []
for i in range(1, 30):  # Last 29 days (excluding today)
    date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime('%Y-%m-%d')
    response = daily_metrics_table.query(
        KeyConditionExpression='metric_date = :date',
        ExpressionAttributeValues={':date': date}
    )
    historical.extend(response['Items'])

# Get today's data from generation_metrics GSI1
today_data = generation_metrics_table.query(
    IndexName='date-partition-timestamp-index',
    KeyConditionExpression='date_partition = :date',
    ExpressionAttributeValues={':date': today}
)

# Merge and return
return {'historical': historical, 'today': today_data['Items']}
```

### Nightly Aggregation: Summary records only

```python
# Query GSI2 for yesterday's summary records only
yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')

response = generation_metrics_table.query(
    IndexName='date-partition-record-type-index',
    KeyConditionExpression='date_partition = :date AND begins_with(record_type_timestamp, :summary_prefix)',
    ExpressionAttributeValues={
        ':date': yesterday,
        ':summary_prefix': 'summary#'
    }
)

# Aggregate summary records
summary_records = response['Items']
# ... aggregation logic ...
```

### Workflow Reconstruction: All artifacts for a job

```python
# Query all artifacts for a job
response = scratch_artifacts_table.query(
    KeyConditionExpression='job_id = :job_id',
    ExpressionAttributeValues={':job_id': job_id}
)

artifacts = response['Items']
# Sort by artifact_sk to get chronological order
artifacts.sort(key=lambda x: x['artifact_sk'])
```
