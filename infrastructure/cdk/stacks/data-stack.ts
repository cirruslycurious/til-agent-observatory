/**
 * 🚨🚨🚨 STOP - READ THIS BEFORE MODIFYING THIS FILE 🚨🚨🚨
 * 
 * MANDATORY PRE-MODIFICATION CHECKLIST:
 * 1. Read .ai-instructions.md (lines 1-200 minimum, check for ⚠️ CRITICAL warnings)
 * 2. Read .ai-checklists/pre-deployment.md COMPLETELY
 * 3. Read ALL inline comments in THIS file
 * 4. Run `git diff` before deploying to see what's changing
 * 5. Check for breaking schema changes (adding GSI requires backfill!)
 * 
 * CRITICAL: This stack deploys ALL DynamoDB tables and S3 buckets.
 * - til-jobs (main job records)
 * - til-job-summaries (pre-aggregated for Dashboard V2 - has created-at-index GSI!)
 * - til-artifacts (tool provenance for tools dashboard)
 * - til-decision-events-by-job (manager evaluation history)
 * - til-generation-metrics (cost/token tracking)
 * - til-conference-data (conference requirements and example abstracts)
 * - scratch-artifacts-{env} (S3 bucket for artifacts)
 * 
 * DEPLOYMENT: Must deploy FIRST (other stacks depend on tables)
 * TEST AFTER: aws dynamodb list-tables --profile abstract
 * 
 * 🚨🚨🚨 DO NOT SKIP THIS - YOU WILL BREAK DATA LAYER 🚨🚨🚨
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class DataStack extends cdk.Stack {
  public readonly jobsTable: dynamodb.Table;
  public readonly artifactsTable: dynamodb.Table;
  public readonly generationMetricsTable: dynamodb.Table;
  public readonly dailyMetricsTable: dynamodb.Table;
  public readonly decisionEventsByJobTable: dynamodb.Table;
  public readonly decisionEventIdsTable: dynamodb.Table;
  public readonly jobBudgetsTable: dynamodb.Table;
  public readonly webSearchGuardrailsTable: dynamodb.Table;
  public readonly feedbackTable: dynamodb.Table; // Sprint 7
  public readonly jobSummariesTable: dynamodb.Table; // Dashboard optimization
  public readonly conferenceDataTable: dynamodb.Table; // Conference requirements and examples
  public readonly artifactsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Jobs table (Story 6.5)
    // Partition key: job_id (String, UUID)
    // No sort key (single item per job_id)
    // No GSIs (not needed for per-job queries)
    // Billing mode: On-demand (low volume, predictable access patterns)
    // Point-in-time recovery: Enabled (for audit trail and data recovery)
    // TTL: expires_at field (Number, Unix timestamp, 7 days from creation)
    this.jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: 'til-jobs',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      // No sort key - single item per job_id
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand
      pointInTimeRecovery: true, // Enabled for audit trail and data recovery
      timeToLiveAttribute: 'expires_at', // TTL for auto-cleanup (7 days)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Artifacts table (Story 6.1)
    // Partition key: job_id (String, UUID)
    // Sort key: artifact_sk (String) - Value format: "{task_id}#{artifact_version}" (e.g., "cfp_extract#v0001")
    // No GSIs (per-job retrieval only, analytics from decision_events/daily_metrics)
    // Billing mode: On-demand (variable size, unpredictable access patterns)
    // Point-in-time recovery: Enabled (for audit trail and data recovery)
    // TTL: expires_at field (Number, Unix timestamp, 14 days from creation)
    this.artifactsTable = new dynamodb.Table(this, 'ArtifactsTable', {
      tableName: 'til-artifacts',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'artifact_sk', type: dynamodb.AttributeType.STRING }, // Format: "task_id#v0001"
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand
      pointInTimeRecovery: true, // Enabled for audit trail and data recovery
      timeToLiveAttribute: 'expires_at', // TTL for auto-cleanup (14 days)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Generation metrics table (Story 6.2)
    // Partition key: job_id (String, UUID) - Canonical ID name everywhere
    // Sort key: record_type#timestamp (String, e.g., "summary#2026-01-12T10:31:27Z")
    // GSI1 (Time-Series): date_partition (PK) + timestamp (SK, ISO datetime, pure time ordering)
    // GSI2 (Summary Aggregation): date_partition (PK) + record_type#timestamp (SK) for nightly aggregation
    // Billing mode: On-demand (variable size, unpredictable access patterns)
    // Point-in-time recovery: Enabled (for audit trail and data recovery)
    this.generationMetricsTable = new dynamodb.Table(this, 'GenerationMetricsTable', {
      tableName: 'til-generation-metrics',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'record_type_timestamp', type: dynamodb.AttributeType.STRING }, // Format: "summary#2026-01-12T10:31:27Z"
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand
      pointInTimeRecovery: true, // Enabled for audit trail and data recovery
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI1 (Time-Series): date_partition + timestamp for time-series queries
    this.generationMetricsTable.addGlobalSecondaryIndex({
      indexName: 'date-partition-timestamp-index',
      partitionKey: { name: 'date_partition', type: dynamodb.AttributeType.STRING }, // YYYY-MM-DD
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }, // ISO 8601 with Z, pure time ordering
    });

    // GSI2 (Summary Aggregation): date_partition + record_type#timestamp for nightly aggregation
    this.generationMetricsTable.addGlobalSecondaryIndex({
      indexName: 'date-partition-record-type-index',
      partitionKey: { name: 'date_partition', type: dynamodb.AttributeType.STRING }, // YYYY-MM-DD
      sortKey: { name: 'record_type_timestamp', type: dynamodb.AttributeType.STRING }, // Same as base table SK: "summary#2026-01-12T10:31:27Z"
    });

    // Daily metrics table (Story 6.2)
    // Partition key: metric_date (String, YYYY-MM-DD)
    // Sort key: metric_type#schema_version (String, e.g., "acceptance_by_vendor#v1") - includes schema versioning
    // No GSIs (not needed for daily aggregation queries)
    // Billing mode: On-demand (low volume, daily updates)
    // Point-in-time recovery: Enabled (for audit trail)
    this.dailyMetricsTable = new dynamodb.Table(this, 'DailyMetricsTable', {
      tableName: 'til-daily-metrics',
      partitionKey: { name: 'metric_date', type: dynamodb.AttributeType.STRING }, // YYYY-MM-DD
      sortKey: { name: 'metric_type_schema_version', type: dynamodb.AttributeType.STRING }, // Format: "acceptance_by_vendor#v1"
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand
      pointInTimeRecovery: true, // Enabled for audit trail
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Decision events by job (Story 3.1)
    // Sort key: seq#timestamp#event_type (seq-first for deterministic ordering)
    // Format: {zero_padded_seq}#{timestamp}#{event_type} (e.g., "0000000123#2026-01-12T10:30:15.123Z#tool_called")
    // Rationale: seq is the ordering primitive, not timestamp (handles clock skew, collisions, deterministic replay)
    this.decisionEventsByJobTable = new dynamodb.Table(this, 'DecisionEventsByJobTable', {
      tableName: 'til-decision-events-by-job',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'seq_ts_type', type: dynamodb.AttributeType.STRING }, // seq#timestamp#event_type
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Decision event IDs (idempotency) (Story 3.1)
    this.decisionEventIdsTable = new dynamodb.Table(this, 'DecisionEventIdsTable', {
      tableName: 'til-decision-event-ids',
      partitionKey: { name: 'event_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Job budgets table (Story 4.1)
    this.jobBudgetsTable = new dynamodb.Table(this, 'JobBudgetsTable', {
      tableName: 'til-job-budgets',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Web search guardrails table (Story 4.2)
    // Partition key: guardrail_key (String, format: {job_id}#{iteration}#{sub_worker_type}#{sub_worker_instance_id})
    // No sort key (single item per guardrail_key)
    // No GSIs (not needed for per-instance queries)
    // Billing mode: On-demand (per-instance tracking is low volume)
    // Point-in-time recovery: Enabled (for audit trail)
    // Optional TTL: expires_at field (Number, Unix timestamp, for cleanup of old guardrail entries)
    this.webSearchGuardrailsTable = new dynamodb.Table(this, 'WebSearchGuardrailsTable', {
      tableName: 'til-web-search-guardrails',
      partitionKey: { name: 'guardrail_key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expires_at', // Optional TTL for cleanup
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Feedback table (Sprint 7, Story 1.3)
    // Partition key: job_id (String, UUID)
    // Sort key: feedback_id (String, ULID-like)
    // Stores user feedback (thumbs up/down + optional comment)
    // Rate limited: 5 submissions per job per minute
    // Deduped: same (rating, comment_hash) within 60s
    this.feedbackTable = new dynamodb.Table(this, 'FeedbackTable', {
      tableName: 'til-feedback',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'feedback_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Job summaries table (Dashboard performance optimization - Phase 1.0)
    // Partition key: job_id (String, UUID)
    // No sort key (single summary per job)
    // GSI1 (created_at-index): created_at (PK) for time-ordered dashboard queries
    // Pre-aggregated job data to avoid expensive event reconstruction (10x query speedup)
    // Stores: per-iteration breakdown, tool sequences, aggregates, evaluator results
    // Created real-time on job completion, backfilled for existing jobs
    // Billing mode: On-demand (dashboard queries are bursty)
    // Point-in-time recovery: Enabled (for audit trail)
    // TTL: expires_at field (Number, Unix timestamp, 30 days from creation)
    this.jobSummariesTable = new dynamodb.Table(this, 'JobSummariesTable', {
      tableName: 'til-job-summaries',
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      // No sort key - single summary per job
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand
      pointInTimeRecovery: true, // Enabled for audit trail
      timeToLiveAttribute: 'expires_at', // TTL for auto-cleanup (30 days)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI1 (created_at-index): For time-ordered queries in dashboards
    // Enables efficient "get last N jobs" or "get jobs in date range" queries
    this.jobSummariesTable.addGlobalSecondaryIndex({
      indexName: 'created-at-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING }, // Status ('completed', 'failed', 'aborted')
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING }, // ISO timestamp
    });

    // Conference data table (Story 2.1)
    // Stores conference-specific requirements, rules, and example abstracts
    // Partition key: conference (String, e.g., "black_hat", "reinvent", "kubecon")
    // Sort key: data_type (String, e.g., "requirements", "example_abstract_1")
    // No TTL - reference data is persistent
    // Billing mode: On-demand (low volume, read-heavy)
    this.conferenceDataTable = new dynamodb.Table(this, 'ConferenceDataTable', {
      tableName: 'til-conference-data',
      partitionKey: { name: 'conference', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'data_type', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3 bucket for large artifacts (Story 6.3)
    // Bucket name: scratch-artifacts-{environment} (e.g., your-artifacts-bucket, scratch-artifacts-prod)
    const environment = this.node.tryGetContext('environment') || 'dev';
    this.artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: `scratch-artifacts-${environment}`,
      versioned: true, // Protects against accidental overwrites, buggy writers, or future code changes
      encryption: s3.BucketEncryption.S3_MANAGED, // SSE-S3 (upgrade to SSE-KMS in prod if compliance requires)
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Private bucket
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false, // Retention: Indefinite (no automatic deletion, manual cleanup only)
      // Lifecycle policy: Intelligent-Tiering (auto-optimization between Standard and Standard-IA)
      // Archive access: Configure Intelligent-Tiering to move to Archive Access after 365 days of no access
      // Note: Lifecycle policies are configured via lifecycle rules below
    });

    // Lifecycle policy: Intelligent-Tiering with Archive Access
    // Storage class: Intelligent-Tiering (objects stored in INTELLIGENT_TIERING)
    // Archive access: Move to Archive Access after 365 days of no access (based on last access, not creation date)
    this.artifactsBucket.addLifecycleRule({
      id: 'IntelligentTieringWithArchive',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INTELLIGENT_TIERING,
          transitionAfter: cdk.Duration.days(0), // Start in Intelligent-Tiering immediately
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(365), // Move to Archive Access after 365 days of no access
        },
        // Optional: Deep Archive after N days (uncomment if needed)
        // {
        //   storageClass: s3.StorageClass.DEEP_ARCHIVE,
        //   transitionAfter: cdk.Duration.days(730), // Move to Deep Archive after 730 days of no access
        // },
      ],
      // Apply to all objects in bucket (no prefix filters needed)
    });
  }
}
