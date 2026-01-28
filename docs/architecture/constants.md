# System Constants

**Authoritative source for system-wide constants and configuration values.**

## Presigned URL Expiry

**Value:** 1 hour (3600 seconds)

**Rationale:**
- Balances security (shorter expiry) with usability (longer expiry for large downloads)
- 1 hour provides sufficient time for clients to download large artifacts (>5MB) without being too permissive
- Aligns with typical download timeouts and retry strategies
- AWS S3 presigned URL maximum is 7 days, but 1 hour is a reasonable security/UX tradeoff

**Implementation:**
- `packages/api/src/handlers/artifacts.ts`: `PRESIGNED_URL_EXPIRY = 3600`
- Used when generating presigned URLs for artifacts >5MB via `GET /api/v1/workflow/{job_id}/artifacts/{artifact_id}/full`

**Note:** This is different from CloudWatch alarm evaluation periods (15 minutes) which are for metrics aggregation, not presigned URL expiry.

## Artifact Version Format

**Format:** `^v\d{4}$` (zero-padded to 4 digits)

**Examples:** `v0001`, `v0002`, `v0003`, `v0100`

**Rationale:**
- Zero-padding ensures lexicographic sorting works correctly (v0002 > v0001)
- Consistent format across all artifact types
- Prevents "v1 vs v0001" mismatch bugs
- Enables efficient DynamoDB sort key queries with `begins_with()` and descending sort

**Enforcement:**
- **Writer:** `packages/shared/artifact-writer/artifact_writer.py` auto-generates `v0001`, `v0002`, etc.
- **Schema:** All JSON Schema files enforce `^v\d{4}$` pattern for `artifact_version`
- **API:** `packages/api/src/handlers/artifacts.ts` validates `^v\d{4}$` format
- **Pydantic:** `packages/shared/artifact-schemas/artifact_envelope.py` enforces `^v\d{4}$` pattern

**Note:** This is different from `schema_version` format (`^v\d+$`, e.g., `v1`, `v2`) which is simpler and doesn't require zero-padding.

## Schema Version Format

**Format:** `^v\d+$` (no zero-padding required)

**Examples:** `v1`, `v2`, `v3`, `v10`

**Rationale:**
- Simpler format for schema evolution (v1 → v2 → v3)
- No need for zero-padding (schemas don't need lexicographic sorting)
- Different from artifact_version to avoid confusion

**Enforcement:**
- **Schema Validator:** `packages/shared/schema-validator/schema_validator.py` validates `schema_version` format
- **JSON Schemas:** All artifact type schemas enforce `^v\d+$` pattern for `schema_version`

## Event Details Size Limit

**Value:** 10KB (10,240 bytes)

**Rationale:**
- DynamoDB item size limit is 400KB, but we enforce 10KB for event details to keep items small and queries fast
- Large event details (>10KB) are uploaded to S3 first, then truncated summary stored in DynamoDB
- 10KB provides sufficient space for most event details while keeping DynamoDB items lean
- S3 overflow path ensures full fidelity replay is possible even for large events

**Implementation:**
- `packages/shared/decision-events/event_logger.py`: `EVENT_DETAILS_SIZE_LIMIT = 10 * 1024`
- Used when writing decision events: if details > 10KB, upload to S3 first, then store truncated summary in DynamoDB
- S3 key format: `decision-events/{job_id}/{event_id}/details.json`
- S3 object includes `details_hash` in metadata for integrity verification

**Hard Requirements for In-Table Summary:**
- `summary`: Human-readable, <=500 chars (always present)
- `details_hash`: SHA-256 hash (always present, computed via canonical JSON)
- `details_truncated`: Boolean (always present)
- `s3_details_ref`: S3 key (only if truncated)

## Seq Counter Storage Pattern

**Storage Location:** `generation_metrics` table (shared infra coupling)

**Table Schema:**
- **Partition Key:** `job_id` (String, UUID)
- **Sort Key:** `record_type_timestamp` (String, format: `seq_counter#{actor}`, e.g., "seq_counter#manager")
- **Attribute:** `seq` (Integer, literal name for `UpdateItem ADD seq :one`)

**Rationale:**
- Reuses existing `generation_metrics` table infrastructure
- Atomic increment via `UpdateItem ADD seq :one` with `if_not_exists(seq, :zero)`
- Per-actor sequence counters (manager, worker, sub_worker, evaluator, system)
- Documented as intentional "shared infra" coupling

**Implementation:**
- `packages/shared/decision-events/event_logger.py`: `increment_seq_counter()` function
- Counter key: `f"seq_counter#{actor}"` (e.g., "seq_counter#manager")
- If transaction fails after seq increment, that seq is "burned" (gaps OK, replay still deterministic)

**Alternative Considered:** Dedicated `job_state` table, but current approach is workable and reduces table proliferation.
