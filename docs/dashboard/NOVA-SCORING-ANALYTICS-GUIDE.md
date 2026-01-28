# Nova Scoring Analytics Guide

## Overview

As of 2026-01-19, the Manager Lambda logs comprehensive Nova scoring data to `til-decision-events-by-job` table, enabling rich analytics in Dashboard V2.

## Data Structure

Every Manager accept/reject decision includes:

```json
{
  "details": {
    // Nova Score Breakdown
    "assessor_1_score": 7.8,
    "assessor_2_score": 8.2,
    "blended_score": 8.0,
    "penalty_amount": 0.5,
    "final_score": 7.5,
    "quality_score": 7.5,
    "threshold": 7.5,
    
    // Context for Analytics
    "worker_vendor": "anthropic",
    "worker_model": "claude-sonnet-4-5",
    "conference": "reinvent",
    "topic": "k8s_containers",
    "manager_vendor": "nova",
    "manager_model": "amazon.nova-pro-v1:0",
    
    // Decision
    "decision": "accept",
    "iteration": 2,
    "penalties": ["Evaluator decoy susceptibility: -0.5"]
  }
}
```

## Analytics Queries

### 1. Overall Nova Performance

**Question:** How is Nova scoring overall?

```sql
-- Average scores by iteration
SELECT 
  iteration,
  AVG(final_score) as avg_final,
  AVG(blended_score) as avg_blended,
  COUNT(*) as samples
FROM decision_events
WHERE manager_vendor = 'nova'
GROUP BY iteration
ORDER BY iteration
```

**Dashboard V2 Chart:** Line graph showing score progression by iteration

---

### 2. Worker LLM Performance

**Question:** Does OpenAI or Anthropic produce better abstracts?

```sql
-- Scores by worker vendor
SELECT 
  worker_vendor,
  worker_model,
  AVG(final_score) as avg_score,
  AVG(blended_score) as avg_blended,
  COUNT(*) as total_abstracts,
  SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END) as accepted
FROM decision_events
WHERE manager_vendor = 'nova'
GROUP BY worker_vendor, worker_model
ORDER BY avg_score DESC
```

**Dashboard V2 Chart:** Bar chart comparing vendors

**Example Insights:**
- `anthropic/claude-sonnet-4-5`: Avg 7.8 (65% accept rate)
- `openai/gpt-5.2`: Avg 7.6 (58% accept rate)

---

### 3. Conference Performance

**Question:** Which conferences get the best abstracts?

```sql
-- Scores by conference
SELECT 
  conference,
  AVG(final_score) as avg_score,
  AVG(assessor_1_score) as avg_assessor_1,
  AVG(assessor_2_score) as avg_assessor_2,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END) as accepted
FROM decision_events
WHERE manager_vendor = 'nova'
GROUP BY conference
ORDER BY avg_score DESC
```

**Dashboard V2 Chart:** Horizontal bar chart

**Example Insights:**
- `reinvent`: Avg 8.1 (highly technical, good fit)
- `gartner_symposium`: Avg 7.4 (more variable quality)

---

### 4. Topic Performance

**Question:** Which topics consistently score well?

```sql
-- Scores by topic
SELECT 
  topic,
  AVG(final_score) as avg_score,
  STDDEV(final_score) as score_stddev,
  COUNT(*) as samples
FROM decision_events
WHERE manager_vendor = 'nova'
  AND topic != 'unknown'
GROUP BY topic
HAVING COUNT(*) >= 3
ORDER BY avg_score DESC
```

**Dashboard V2 Chart:** Scatter plot (avg vs consistency)

**Example Insights:**
- `k8s_containers`: Avg 8.2 ± 0.4 (consistent)
- `data_analytics`: Avg 7.6 ± 1.2 (variable)

---

### 5. Assessor Agreement

**Question:** Do the two Nova assessors generally agree?

```sql
-- Assessor disagreement analysis
SELECT 
  ABS(assessor_1_score - assessor_2_score) as score_diff,
  COUNT(*) as frequency
FROM decision_events
WHERE manager_vendor = 'nova'
  AND assessor_1_score IS NOT NULL
  AND assessor_2_score IS NOT NULL
GROUP BY score_diff
ORDER BY score_diff
```

**Dashboard V2 Chart:** Histogram of score differences

**Example Insights:**
- 68% agree within ±0.5 points
- 92% agree within ±1.0 points
- Outlier: 3% differ by 2+ points (flag for review)

---

### 6. Penalty Impact

**Question:** How often do penalties affect decisions?

```sql
-- Penalty impact on accept/reject
SELECT 
  CASE 
    WHEN blended_score >= threshold AND final_score < threshold THEN 'Penalty caused rejection'
    WHEN penalty_amount > 0 THEN 'Penalty applied, still accepted'
    ELSE 'No penalty'
  END as scenario,
  COUNT(*) as occurrences,
  AVG(penalty_amount) as avg_penalty
FROM decision_events
WHERE manager_vendor = 'nova'
GROUP BY scenario
```

**Dashboard V2 Chart:** Pie chart

**Example Insights:**
- 15% had penalty-driven rejections
- 22% had penalties but still accepted
- 63% had no penalties

---

### 7. Worker + Conference Combinations

**Question:** Which LLM works best for which conference?

```sql
-- Performance matrix
SELECT 
  worker_vendor,
  conference,
  AVG(final_score) as avg_score,
  COUNT(*) as samples
FROM decision_events
WHERE manager_vendor = 'nova'
GROUP BY worker_vendor, conference
HAVING COUNT(*) >= 2
ORDER BY worker_vendor, avg_score DESC
```

**Dashboard V2 Chart:** Heatmap (vendor × conference)

**Example Insights:**
- Anthropic + re:Invent: 8.3 (best combo)
- OpenAI + Gartner: 7.2 (weaker fit)

---

### 8. Scoring Trends Over Time

**Question:** Are scores improving as the system learns?

```sql
-- Temporal analysis
SELECT 
  DATE(created_at) as date,
  AVG(final_score) as avg_score,
  COUNT(*) as jobs_per_day
FROM decision_events
WHERE manager_vendor = 'nova'
GROUP BY DATE(created_at)
ORDER BY date
```

**Dashboard V2 Chart:** Line graph with trend line

**Example Insights:**
- Week 1: Avg 7.2
- Week 2: Avg 7.6 (+0.4 improvement)
- Trend: +0.1 points/week

---

## Sample Dashboard V2 Queries (DynamoDB)

### Get Recent Nova Assessments

```bash
aws dynamodb query \
  --table-name til-decision-events-by-job \
  --key-condition-expression "job_id = :jid" \
  --expression-attribute-values '{":jid":{"S":"<JOB_ID>"}}' \
  --filter-expression "details.M.manager_vendor.S = :nova" \
  --expression-attribute-values '{":nova":{"S":"nova"}}'
```

### Aggregate Scores by Worker Vendor

```bash
aws dynamodb scan \
  --table-name til-decision-events-by-job \
  --filter-expression "details.M.manager_vendor.S = :nova" \
  --expression-attribute-values '{":nova":{"S":"nova"}}' \
  --projection-expression "details.M.final_score, details.M.worker_vendor, details.M.conference"
```

---

## Dashboard V2 Implementation Checklist

To implement these analytics in Dashboard V2:

1. **Create Nova Scoring Endpoint** ✅ (Ready for implementation)
   - Route: `GET /api/v1/dashboard/v2/nova-scoring`
   - Query params: `?days=30&conference=reinvent&worker_vendor=anthropic`

2. **Data Aggregation Functions** (Needed)
   - `calculateNovaScoresByVendor()`
   - `calculateNovaScoresByConference()`
   - `calculateNovaScoresByTopic()`
   - `calculateAssessorAgreement()`
   - `calculatePenaltyImpact()`

3. **Frontend Charts** (Needed)
   - Vendor comparison bar chart
   - Conference performance heatmap
   - Assessor agreement histogram
   - Penalty impact pie chart
   - Temporal trends line graph

4. **Key Metrics Cards** (Needed)
   - Average Nova score (overall)
   - Assessor agreement rate
   - Penalty rejection rate
   - Best worker+conference combo

---

## Next Steps

1. ✅ **DONE:** Enhanced Manager logging (deployed 2026-01-19)
2. **TODO:** Create Dashboard V2 `/nova-scoring` endpoint
3. **TODO:** Implement aggregation functions
4. **TODO:** Build frontend charts
5. **TODO:** Add real-time score monitoring

---

## Data Availability

**Starting:** 2026-01-19 10:03 AM (after Manager deployment)

**All jobs after this timestamp** will have complete Nova scoring data with full traceability.

**Historical jobs** (before 2026-01-19) will have partial data:
- ✅ `quality_score` (final score)
- ❌ `assessor_1_score`, `assessor_2_score`, `blended_score` (not logged)
- ❌ `worker_vendor`, `conference`, `topic` (not logged)

For best results, run new test jobs to generate complete data.
