# Data Models & Schemas

## Decision Events Storage Architecture

**Three-Table Design:**

**1. decision_events (High-volume append-only event stream)**
- **Purpose**: Store all decision events for workflow reconstruction and deep analysis
- **Partition Key**: job_id (String, UUID)
- **Sort Key**: timestamp#event_type#seq (String, e.g., "2026-01-12T10:30:15.123Z#tool_called#001")
- **Attributes**: event_type, actor, summary, details (JSON), timestamp
- **Access Pattern**: Query by job_id to get all events for workflow visualization
- **Volume**: ~20-50 events per job

**2. generation_metrics (One summary row per job + per-iteration metadata)**
- **Purpose**: Job-level aggregated metrics for analytics and dashboard queries
- **Partition Key**: generation_id (String, UUID) - NOTE: generation_id == job_id
- **Sort Key**: record_type#timestamp (String, e.g., "summary#2026-01-12T10:31:27Z" or "iteration#2#2026-01-12T10:31:01Z")
- **Record Types**:
  - `summary#timestamp`: One row per job with final aggregated metrics
  - `iteration#N#timestamp`: One row per iteration (0-4) with iteration-specific data
- **Attributes**: All job metadata, vendor assignments, performance metrics, results
- **GSI**: 
  - GSI1PK: date_partition (String, YYYY-MM-DD)
  - GSI1SK: timestamp (String, ISO datetime)
  - Filter: record_type begins_with "summary" for dashboard time-series queries
- **Access Pattern**: 
  - Per-job summary: Get by generation_id + record_type begins_with "summary"
  - Time-series aggregation: Query GSI by date_partition, filter to summary records
  - Iteration details: Query by generation_id + record_type begins_with "iteration"
- **Volume**: 1 summary row + 1-5 iteration rows per job (6 rows max)

**Design Rationale:**
- record_type prefix prevents dashboard double-counting (filter to "summary" only)
- Iteration records enable iteration-level analysis without bloating summary
- GSI on date_partition enables efficient time-series queries for dashboard

**3. daily_metrics (Precomputed aggregates)**
- **Purpose**: Dashboard chart data, computed nightly
- **Partition Key**: metric_date (String, YYYY-MM-DD)
- **Sort Key**: metric_type (String, e.g., "acceptance_by_vendor")
- **Attributes**: precomputed_data (JSON, chart-ready)
- **Access Pattern**: Dashboard queries by date range
- **Volume**: ~20 metric types × 365 days/year

**Design Rationale:**
- decision_events = high-volume, append-only, per-job workflow reconstruction
- generation_metrics = one summary per job for cross-job analytics
- daily_metrics = precomputed for fast dashboard rendering
- Clear separation prevents overloading single table

---

## Conference Data Model

**Table:** `conference_data`

**Item Structure:**
```json
{
  "conference": "black_hat",
  "data_type": "rules",
  "title_requirements": {
    "min_words": 5,
    "max_words": 15,
    "format": "Technical and specific, avoid marketing language"
  },
  "abstract_requirements": {
    "min_words": 200,
    "max_words": 500,
    "required_sections": ["Problem", "Approach", "Results/Demo"],
    "optional_sections": ["Future Work"]
  },
  "tone_guidelines": {
    "technical_depth": "deep",
    "audience_level": "expert",
    "voice": "authoritative",
    "avoid": ["marketing buzzwords", "unsubstantiated claims"]
  },
  "topics_covered": ["Application Security", "Network Security", "Cryptography", "AI/ML Security"],
  "source_url": "https://www.blackhat.com/call-for-papers.html",
  "last_updated": "2026-01-01"
}
```

**Example Abstract Item:**
```json
{
  "conference": "black_hat",
  "data_type": "abstract_example",
  "example_id": "bh_2023_042",
  "year": 2023,
  "title": "Breaking LLM Guardrails: Novel Jailbreak Techniques",
  "abstract": "Full abstract text...",
  "topic_tags": ["AI Security", "Red Team"],
  "characteristics": {
    "technical_depth": "deep",
    "novel_contribution": "New attack vector",
    "structure": "Threat → Technique → Demo"
  },
  "acceptance_signals": ["Strong methodology", "Real-world impact", "Reproducible demo"]
}
```

---

## Artifact Schema Examples

**CFP/Style Extractor Output:**
```json
{
  "meta": {
    "artifact_id": "cfp_extract_550e8400_v1",
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "iteration": 0,
    "parent_task_id": "main",
    "task_id": "cfp_extract_1",
    "worker_id": "cfp_extractor",
    "worker_vendor": "anthropic",
    "worker_model": "claude-3-5-sonnet",
    "artifact_type": "style_profile",
    "artifact_version": "v1",
    "schema_version": "1.0",
    "spawned_at": "2026-01-12T10:30:15Z",
    "completed_at": "2026-01-12T10:30:28Z",
    "status": "completed"
  },
  "data": {
    "structure_requirements": {
      "title_format": "Technical, specific, avoids marketing",
      "required_sections": ["Threat Landscape", "Technical Approach", "Demonstration"],
      "optional_sections": ["Future Research"]
    },
    "length_constraints": {
      "title_min_words": 5,
      "title_max_words": 15,
      "abstract_min_words": 200,
      "abstract_max_words": 500
    },
    "tone_markers": {
      "technical_depth": "deep",
      "audience_level": "expert",
      "voice": "authoritative",
      "key_phrases": ["novel technique", "demonstrates", "real-world impact"]
    },
    "recurring_patterns": [
      "Abstracts open with threat/problem statement",
      "Technical methodology section required",
      "Reproducible demo or proof-of-concept expected"
    ]
  },
  "quality_signals": {
    "confidence": 0.87,
    "coverage": "comprehensive",
    "validation_passed": true,
    "examples_analyzed": 28
  },
  "provenance": {
    "sources": [
      {"type": "dynamodb_key", "ref": "black_hat_abstract_2023_042"},
      {"type": "dynamodb_key", "ref": "black_hat_abstract_2022_018"},
      {"type": "dynamodb_key", "ref": "black_hat_rules"}
    ],
    "claims": [
      {
        "claim": "Black Hat requires deep technical detail in methodology",
        "source_pointer": "black_hat_abstract_2023_042"
      },
      {
        "claim": "Title should be 5-15 words and avoid marketing language",
        "source_pointer": "black_hat_rules"
      }
    ],
    "tool_calls": [
      {
        "tool": "dynamodb_lookup",
        "params": {"conference": "black_hat", "data_type": "abstract_example", "limit": 30},
        "results_summary": "Retrieved 28 past accepted abstracts (2022-2024)",
        "results_s3_ref": null,
        "reasoning": "Needed examples to extract recurring style patterns",
        "tokens": 450,
        "time_ms": 120
      }
    ]
  },
  "overflow": {
    "s3_payload_ref": null,
    "s3_tool_results_ref": null,
    "payload_sha256": null,
    "payload_size_bytes": 3850
  },
  "execution": {
    "tokens_used": 1650,
    "execution_time_ms": 13000,
    "error": null
  }
}
```

---

