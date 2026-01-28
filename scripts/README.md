# Scripts Directory

Utility scripts for deploying and operating TIL Agent Observatory.

## Deployment Scripts

### `bundle-lambda-layers.sh`
Builds Lambda layers for Python dependencies and shared packages. **Required before CDK deployment.**

```bash
./scripts/bundle-lambda-layers.sh
```

**Requirements:**
- Docker must be running (for native extensions)
- Python 3.12 installed

### `bundle-lambda-dependencies.sh`
Alternative dependency bundling script.

### `setup-local.sh`
Sets up local development environment.

---

## Operations Scripts

### `submit-job.sh`
Submit a single job to the system.

```bash
./scripts/submit-job.sh <conference> <topic>
```

### `batch-submit-jobs.sh`
Submit multiple jobs for batch processing.

### `monitor-batch-jobs.sh`
Monitor running batch jobs.

### `retry-failed-jobs.sh`
Retry jobs that failed due to transient errors.

### `cleanup-stuck-jobs.sh` / `cleanup_error_jobs.sh`
Clean up jobs stuck in error states.

### `clear-all-job-data.sh`
**Caution:** Clears all job data from DynamoDB tables.

---

## Data Scripts

### `build_abstract_index.py`
Builds the SQLite FTS index for abstract search functionality.

```bash
python scripts/build_abstract_index.py
```
