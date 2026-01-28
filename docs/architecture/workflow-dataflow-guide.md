# Workflow & Data Flow Guide

## Overview

This document explains the complete data flow from when a user requests a job through the entire agentic loop until completion.

**State Machine:** `til-workflow` (AWS Step Functions)  
**ARN:** `arn:aws:states:us-east-1:YOUR_AWS_ACCOUNT_ID:stateMachine:til-workflow`

---

## 📝 Table of Contents

1. [Job Request (User Initiates)](#1-job-request-user-initiates)
2. [Step Functions Workflow Execution](#2-step-functions-workflow-execution)
3. [The Agentic Loop (Iteration 0-4)](#3-the-agentic-loop-iteration-0-4)
4. [Job Completion](#4-job-completion)
5. [Data Flow Summary](#5-data-flow-summary)
6. [DynamoDB Tables & Purpose](#6-dynamodb-tables--purpose)
7. [Decision Events (Audit Trail)](#7-decision-events-audit-trail)
8. [Error Handling](#8-error-handling)

---

## 1. Job Request (User Initiates)

### User Action: POST /api/v1/jobs

**Request:**
```json
{
  "conference": "black_hat",
  "topic": "ai_ml_genai",
  "user_session_id": "optional-uuid"
}
```

**What Happens:**

1. **API Lambda** (`til-api-handler`) receives request
   - Handler: `packages/api/src/handlers/jobs.ts` → `createJobHandler()`

2. **Kill Switch Check** (Story 4.3)
   ```typescript
   const systemEnabled = await checkSystemEnabled();
   // Checks SSM Parameter Store: /conference-abstract/system-enabled
   if (!systemEnabled) {
     return 503; // Service Unavailable
   }
   ```

3. **Generate Job ID & Token**
   ```typescript
   const jobId = randomUUID();  // UUIDv4
   const jobReadToken = randomUUID() + randomUUID();  // 64 chars
   const jobReadTokenHash = HMAC-SHA256(SERVER_SECRET, jobReadToken);
   ```

4. **Create Job Record in DynamoDB** (`til-jobs` table)
   ```typescript
   {
     job_id: "2f47f1e3-502e-4897-a25f-3e25cca1fef7",
     job_read_token_hash: "abc123...",
     status: "queued",
     conference: "black_hat",
     topic: "ai_ml_genai",
     created_at: "2026-01-18T10:30:00Z",
     expires_at: 1737291000  // Unix timestamp (7 days TTL)
   }
   ```

5. **Initialize Job Budget** (`til-job-budgets` table)
   ```typescript
   {
     job_id: "2f47f1e3...",
     estimated_cost_cents: 0,
     tokens_used: 0,
     web_search_count: 0,
     minimal_mode_activated: false
   }
   ```

6. **Start Step Functions Execution**
   ```typescript
   const executionInput = {
     job_id: "2f47f1e3...",
     conference: "black_hat",
     topic: "ai_ml_genai",
     iteration: 0,
     previous_outputs: [],
     previous_artifacts: []
   };
   
   await sfnClient.send(new StartExecutionCommand({
     stateMachineArn: "arn:aws:states:us-east-1:YOUR_AWS_ACCOUNT_ID:stateMachine:til-workflow",
     name: "job-2f47f1e3...",  // Unique execution name
     input: JSON.stringify(executionInput)
   }));
   ```

7. **Response to User**
   ```json
   {
     "job_id": "2f47f1e3-502e-4897-a25f-3e25cca1fef7",
     "job_read_token": "d4e5f6...",  // ONLY returned once!
     "status": "running",
     "estimated_time_seconds": 90,
     "step_functions_execution_arn": "arn:aws:states:us-east-1:..."
   }
   ```

**User must save `job_read_token` - it's never returned again!**

---

## 2. Step Functions Workflow Execution

### State Machine Entry: `InitializeJob`

**Action:** Update job status in DynamoDB

```json
// DynamoDB UpdateItem: til-jobs table
{
  "job_id": "2f47f1e3...",
  "status": "running",
  "updated_at": "2026-01-18T10:30:01Z"
}
```

### State: `SetInitialValues`

**Action:** Initialize loop variables

```json
{
  "job_id": "2f47f1e3...",
  "conference": "black_hat",
  "topic": "ai_ml_genai",
  "iteration": 0,
  "manager_feedback": "",
  "previous_outputs": [],
  "previous_artifacts": []
}
```

---

## 3. The Agentic Loop (Iteration 0-4)

The workflow loops up to 5 times (iteration 0-4), with the Manager deciding accept/reject at each iteration.

### Loop Structure:

```
Manager Goal Formulation
     ↓
Worker Execution (Agentic tool loop)
     ↓
Send to Evaluator (SNS → SQS → Lambda)
     ↓
Poll for Evaluator Result (up to 60 seconds)
     ↓
Manager Evaluation (accept/reject decision)
     ↓
  Decision:
    - Accept → Complete Job ✅
    - Reject + iteration < 4 → Increment Iteration, loop back to Manager
    - Reject + iteration == 4 → Complete with Compromises ⚠️
```

---

### Step 1: Manager Goal Formulation

**Lambda:** `til-manager-agent`  
**State:** `ManagerGoalFormulation`  
**Timeout:** 30 seconds

**Input:**
```json
{
  "job_id": "2f47f1e3...",
  "conference": "black_hat",
  "topic": "ai_ml_genai",
  "iteration": 0,
  "action": "formulate_goal",
  "execution_id": "arn:aws:states:...",
  "state_name": "ManagerGoalFormulation"
}
```

**What Manager Does:**

1. **Looks up conference requirements** (DynamoDB: `til-conference-data`)
   ```typescript
   const conferenceData = await getConferenceData("black_hat");
   // Returns: cfp_requirements, guidelines, style preferences
   ```

2. **Validates goal** (mechanical validation, no LLM)
   - Checks for prescriptive instructions (forbidden keywords)
   - Sanitizes goal text

3. **Formulates goal with LLM** (OpenAI or Anthropic)
   - Prompt includes: conference requirements, topic, iteration, previous feedback
   - LLM generates high-level goal (what to achieve, not how)

4. **Logs decision event** (`til-decision-events-by-job`)
   ```json
   {
     "job_id": "2f47f1e3...",
     "seq_ts_type": "0000000001#2026-01-18T10:30:02.123Z#goal_formulated",
     "event_type": "goal_formulated",
     "actor": "manager",
     "iteration": 0,
     "details": {
       "goal": "Create a Black Hat abstract about adversarial attacks on LLMs...",
       "vendor": "openai",
       "model": "gpt-4",
       "tokens_used": 1234,
       "cost_usd": 0.0456
     }
   }
   ```

5. **Updates budget** (`til-job-budgets`)
   ```typescript
   estimated_cost_cents += 456;  // $0.0456
   tokens_used += 1234;
   ```

**Output:**
```json
{
  "Payload": {
    "goal": "Create a Black Hat abstract...",
    "vendor": "openai",
    "model": "gpt-4",
    "tokens_used": 1234,
    "cost_usd": 0.0456
  }
}
```

---

### Step 2: Worker Execution (Agentic Tool Loop)

**Lambda:** `til-worker-agent`  
**State:** `WorkerExecution`  
**Timeout:** 5 minutes (allows for multiple LLM + tool calls)

**Input:**
```json
{
  "job_id": "2f47f1e3...",
  "conference": "black_hat",
  "topic": "ai_ml_genai",
  "goal": "Create a Black Hat abstract...",
  "iteration": 0,
  "manager_feedback": "",  // Empty on first iteration
  "previous_artifacts": [],
  "execution_id": "arn:aws:states:...",
  "state_name": "WorkerExecution"
}
```

**What Worker Does (Agentic Loop):**

Worker runs an autonomous tool loop where the LLM decides which tools to call and when to submit.

**Iteration 1:**
```typescript
// LLM call with tools
const response = await call_llm_with_tools({
  messages: [
    { role: "system", content: WORKER_SYSTEM_PROMPT },
    { role: "user", content: goal }
  ],
  tools: [
    { name: "web_search", ... },
    { name: "search_abstracts", ... },
    { name: "search_recent_content", ... },
    { name: "dynamodb_lookup", ... },
    { name: "red_team_review", ... },
    { name: "submit_abstract", ... }  // Terminal tool
  ]
});

// LLM decides: "I'll search for recent Black Hat abstracts about AI/ML"
tool_call = {
  name: "search_abstracts",
  arguments: {
    query: "adversarial attacks machine learning",
    conference: "black_hat",
    limit: 5
  }
};
```

**Tool Execution:**
```typescript
// Worker calls tool wrapper
const result = await search_abstracts({
  query: "adversarial attacks machine learning",
  conference: "black_hat",
  limit: 5
});

// Tool wrapper logs decision event
log_decision_event({
  event_type: "tool_called",
  tool_name: "search_abstracts",
  tool_invocation_id: "uuid",
  inputs: { query: "adversarial...", ... },
  results_summary: "Found 5 abstracts...",
  success: true,
  tokens_used: 0,  // No LLM for tool
  cost_usd: 0.05   // Web search cost if applicable
});

// If results > 50 KB, upload to S3
if (results.length > 50000) {
  upload_tool_results_to_s3(job_id, tool_invocation_id, results);
  // Store s3_key in decision event
}
```

**Budget Update:**
```typescript
// If web search
increment_web_search_cost(job_id, 0.05);

// Check web search guardrail
const guardrail = await getWebSearchGuardrail(job_id, iteration, "worker", sub_worker_id);
if (guardrail.web_search_count >= 2) {
  // No more web searches allowed for this instance
}
```

**Iteration 2, 3, ... N:**

Worker continues calling LLM with tool results until:
- **Terminal tool called:** `submit_abstract` (LLM decides draft is ready)
- **Budget exceeded:** Cost > $10 (hard limit)
- **Max iterations:** 50 LLM calls (safety limit)
- **Timeout:** 5 minutes elapsed

**Final LLM Call (Submit):**
```typescript
// LLM decides to submit
tool_call = {
  name: "submit_abstract",
  arguments: {
    title: "Adversarial Attacks on Large Language Models: A Black Hat Perspective",
    abstract: "This talk explores novel adversarial techniques...",
    word_count: 247,
    confidence_score: 0.85
  }
};

// Worker validates and logs
log_decision_event({
  event_type: "abstract_submitted",
  actor: "worker",
  details: {
    title: "...",
    abstract: "...",
    word_count: 247,
    confidence_score: 0.85,
    tools_used: ["search_abstracts", "web_search", "red_team_review"],
    total_tool_calls: 5,
    llm_iterations: 12
  }
});
```

**Output:**
```json
{
  "Payload": {
    "title": "Adversarial Attacks on Large Language Models...",
    "abstract": "This talk explores novel adversarial techniques...",
    "word_count": 247,
    "confidence_score": 0.85,
    "tools_used": ["search_abstracts", "web_search", "red_team_review"],
    "total_cost_usd": 1.23,
    "total_tokens_used": 45678
  }
}
```

---

### Step 3: Send to Evaluator (Async)

**State:** `SendEvaluatorRequest` (SNS Publish)

**Action:** Publish message to SNS topic `til-evaluator-requests`

**Message (Blind Input - No Conference!):**
```json
{
  "job_id": "2f47f1e3...",
  "title": "Adversarial Attacks on Large Language Models...",
  "abstract": "This talk explores novel adversarial techniques...",
  "execution_id": "arn:aws:states:..."
}
```

**Flow:**
```
SNS Topic (til-evaluator-requests)
     ↓
SQS Queue (til-evaluator-queue)
     ↓
Evaluator Lambda (til-evaluator-agent)
```

**Evaluator Lambda** (triggered by SQS):

1. **Calls Amazon Nova (Bedrock) for blind prediction**
   ```typescript
   const response = await call_bedrock({
     model: "amazon.nova-pro-v1:0",
     prompt: `Which conference is this abstract for?
     
     Title: ${title}
     Abstract: ${abstract}
     
     Choose from: black_hat, reinvent, kubecon, gartner_symposium, google_cloud_next, microsoft_ignite, rsa_conference
     
     Provide top 3 predictions with confidence scores.`
   });
   ```

2. **Writes result to DynamoDB** (`til-generation-metrics`)
   ```json
   {
     "job_id": "2f47f1e3...",
     "record_type_timestamp": "evaluator#2026-01-18T10:30:45Z",
     "timestamp": "2026-01-18T10:30:45Z",
     "evaluator_result": {
       "predicted_conference": "black_hat",
       "confidence": 0.87,
       "top_3": ["black_hat", "rsa_conference", "reinvent"],
       "is_correct": null,  // Set by Manager later
       "is_decoy_predicted": false
     }
   }
   ```

3. **Logs decision event**
   ```json
   {
     "event_type": "evaluator_assessed",
     "actor": "evaluator",
     "details": {
       "predicted_conference": "black_hat",
       "confidence": 0.87,
       "top_3": ["black_hat", "rsa_conference", "reinvent"],
       "model": "amazon.nova-pro-v1:0"
     }
   }
   ```

---

### Step 4: Poll for Evaluator Result

**State:** `InitEvaluatorPoll` → Loop

**Polling Logic:**

```typescript
// Initialize poll counter
evaluator_poll_count = 0;

// Loop (up to 20 polls * 3 seconds = 60 seconds)
while (evaluator_poll_count < 20) {
  // Wait 3 seconds
  await wait(3000);
  
  // Query DynamoDB for evaluator result
  const result = await dynamodb.query({
    TableName: "til-generation-metrics",
    KeyConditionExpression: "job_id = :jid AND begins_with(record_type_timestamp, :prefix)",
    ExpressionAttributeValues: {
      ":jid": job_id,
      ":prefix": "evaluator#"
    },
    ScanIndexForward: false,  // Most recent first
    Limit: 1
  });
  
  if (result.Count > 0) {
    // Found evaluator result!
    evaluator_result = result.Items[0];
    break;
  }
  
  evaluator_poll_count++;
}

if (evaluator_poll_count >= 20) {
  // Timeout after 60 seconds
  evaluator_result = { timeout: true };
}
```

**Why Polling?**

- Evaluator is async (SNS → SQS → Lambda)
- May take 5-30 seconds to complete
- Polling allows Step Functions to wait without blocking
- Graceful degradation if evaluator times out (Manager continues without evaluator input)

---

### Step 5: Manager Evaluation (Accept/Reject)

**Lambda:** `til-manager-agent`  
**State:** `ManagerEvaluation`  
**Timeout:** 30 seconds

**Input:**
```json
{
  "job_id": "2f47f1e3...",
  "conference": "black_hat",
  "topic": "ai_ml_genai",
  "iteration": 0,
  "action": "evaluate_output",
  "worker_output": {
    "Payload": {
      "title": "...",
      "abstract": "...",
      "word_count": 247,
      "confidence_score": 0.85
    }
  },
  "previous_outputs": [],
  "evaluator_result": {
    "predicted_conference": "black_hat",
    "confidence": 0.87,
    "top_3": ["black_hat", "rsa_conference", "reinvent"]
  },
  "execution_id": "arn:aws:states:...",
  "state_name": "ManagerEvaluation"
}
```

**What Manager Does:**

1. **Calls LLM for evaluation**
   ```typescript
   const response = await call_llm({
     messages: [
       { role: "system", content: MANAGER_EVALUATION_PROMPT },
       { role: "user", content: JSON.stringify({
         conference: "black_hat",
         topic: "ai_ml_genai",
         title: worker_output.title,
         abstract: worker_output.abstract,
         evaluator_prediction: evaluator_result.predicted_conference,
         evaluator_confidence: evaluator_result.confidence,
         iteration: 0
       })}
     ]
   });
   ```

2. **Extracts decision** (accept/reject)
   ```json
   {
     "decision": "accept",
     "confidence": 0.90,
     "feedback": "Excellent abstract. Strong technical depth...",
     "acceptance_score": 8.5,
     "improvements_needed": []
   }
   ```

3. **Logs decision event**
   ```json
   {
     "event_type": "manager_evaluated",
     "actor": "manager",
     "details": {
       "decision": "accept",
       "confidence": 0.90,
       "evaluator_was_correct": true,
       "acceptance_score": 8.5,
       "iteration": 0
     }
   }
   ```

4. **Updates budget**
   ```typescript
   estimated_cost_cents += 123;  // LLM call cost
   tokens_used += 2345;
   ```

**Output:**
```json
{
  "Payload": {
    "decision": "accept",
    "confidence": 0.90,
    "feedback": "Excellent abstract...",
    "acceptance_score": 8.5,
    "title": "...",
    "abstract": "..."
  }
}
```

---

### Step 6: Decision - Accept/Reject/Continue

**State:** `CheckIteration` (Choice)

**Logic:**

```typescript
if (decision === "accept") {
  // ✅ Complete job successfully
  goto CompleteJob;
  
} else if (decision === "reject" && iteration < 4) {
  // 🔄 Continue iteration
  iteration++;
  manager_feedback = evaluation.feedback;
  previous_outputs.push(worker_output);
  goto ManagerGoalFormulation;  // Loop back
  
} else if (iteration === 4) {
  // ⚠️ Max iterations reached, complete with compromises
  goto CompleteJobWithCompromises;
  
} else {
  // ❌ Unexpected state
  goto FailJob;
}
```

---

## 4. Job Completion

### Scenario A: Accept (Success) ✅

**State:** `CompleteJob`

**Action:** Update job status in DynamoDB

```json
// DynamoDB UpdateItem: til-jobs table
{
  "job_id": "2f47f1e3...",
  "status": "completed",
  "completed_at": "2026-01-18T10:32:00Z",
  "updated_at": "2026-01-18T10:32:00Z",
  "title": "Adversarial Attacks on Large Language Models...",
  "abstract": "This talk explores novel adversarial techniques...",
  "word_count": 247,
  "total_iterations": 1,
  "acceptance_score": 8.5,
  "total_cost_usd": 1.50,
  "total_tokens_used": 50000
}
```

**Decision Event:**
```json
{
  "event_type": "job_completed",
  "actor": "system",
  "details": {
    "final_iteration": 0,
    "total_iterations": 1,
    "acceptance_score": 8.5,
    "evaluator_correct": true,
    "total_cost_usd": 1.50
  }
}
```

---

### Scenario B: Complete with Compromises ⚠️

**State:** `CompleteJobWithCompromises`

**Action:** Update job status in DynamoDB

```json
// DynamoDB UpdateItem: til-jobs table
{
  "job_id": "2f47f1e3...",
  "status": "completed",
  "completed_at": "2026-01-18T10:35:00Z",
  "updated_at": "2026-01-18T10:35:00Z",
  "title": "...",  // Best attempt from iteration 4
  "abstract": "...",
  "word_count": 250,
  "total_iterations": 5,  // All 5 iterations used
  "acceptance_score": 6.0,  // Lower score
  "total_cost_usd": 4.50,
  "total_tokens_used": 180000,
  "completion_note": "Completed after max iterations without full acceptance"
}
```

---

### Scenario C: Failure ❌

**State:** `FailJob_timeout` or `FailJob_internal_error`

**Action:** Update job status in DynamoDB

```json
// DynamoDB UpdateItem: til-jobs table
{
  "job_id": "2f47f1e3...",
  "status": "failed",
  "failed_at": "2026-01-18T10:31:00Z",
  "updated_at": "2026-01-18T10:31:00Z",
  "failure_reason": "timeout",  // or "internal_error"
  "error": "Manager Lambda timed out after 30 seconds"
}
```

**Decision Event:**
```json
{
  "event_type": "job_failed",
  "actor": "system",
  "details": {
    "failure_reason": "timeout",
    "iteration": 0,
    "state_name": "ManagerGoalFormulation",
    "error": "Lambda timeout"
  }
}
```

---

## 5. Data Flow Summary

### Data Flow Diagram

```
User (Frontend)
     ↓ POST /api/v1/jobs
API Lambda (til-api-handler)
     ↓ Write
DynamoDB (til-jobs) - Status: "queued"
     ↓ Write
DynamoDB (til-job-budgets) - Initialize budget
     ↓ Start Execution
Step Functions (til-workflow)
     ↓ Update
DynamoDB (til-jobs) - Status: "running"
     ↓
┌────────────────────────────────────────────────┐
│  Agentic Loop (Iteration 0-4)                  │
│                                                 │
│  Manager Lambda                                 │
│     ↓ Read conference data                     │
│  DynamoDB (til-conference-data)                │
│     ↓ Call LLM (OpenAI/Anthropic)              │
│  LLM API                                        │
│     ↓ Log decision event                       │
│  DynamoDB (til-decision-events-by-job)         │
│     ↓ Update budget                            │
│  DynamoDB (til-job-budgets)                    │
│     ↓ Output goal                              │
│                                                 │
│  Worker Lambda (Agentic Tool Loop)             │
│     ↓ Call LLM with tools                      │
│  LLM API                                        │
│     ↓ Execute tools (web_search, etc.)         │
│  Tool Wrappers                                  │
│     ├─→ Web Search API                         │
│     ├─→ DynamoDB (search abstracts)            │
│     ├─→ S3 (large tool results)                │
│     └─→ DynamoDB (red_team_review)             │
│     ↓ Log tool calls                           │
│  DynamoDB (til-decision-events-by-job)         │
│     ↓ Check guardrails                         │
│  DynamoDB (til-web-search-guardrails)          │
│     ↓ Update budget                            │
│  DynamoDB (til-job-budgets)                    │
│     ↓ Submit abstract                          │
│                                                 │
│  SNS Topic (til-evaluator-requests)            │
│     ↓                                           │
│  SQS Queue (til-evaluator-queue)               │
│     ↓                                           │
│  Evaluator Lambda                               │
│     ↓ Call Amazon Nova (Bedrock)               │
│  Bedrock (Nova Pro)                             │
│     ↓ Write result                             │
│  DynamoDB (til-generation-metrics)             │
│     ↓ Log decision event                       │
│  DynamoDB (til-decision-events-by-job)         │
│                                                 │
│  Step Functions (Poll for Evaluator)           │
│     ↓ Query (20 polls * 3s = 60s max)          │
│  DynamoDB (til-generation-metrics)             │
│     ↓ Extract result                           │
│                                                 │
│  Manager Lambda (Evaluation)                    │
│     ↓ Call LLM (OpenAI/Anthropic)              │
│  LLM API                                        │
│     ↓ Decide accept/reject                     │
│  Decision: Accept or Reject?                   │
│     ├─→ Accept → Complete ✅                   │
│     └─→ Reject → Loop (if iteration < 4) 🔄   │
│                                                 │
└────────────────────────────────────────────────┘
     ↓ Final Update
DynamoDB (til-jobs) - Status: "completed" or "failed"
     ↓
User (Frontend)
     ↓ GET /api/v1/jobs/{job_id}/status?token={job_read_token}
API Lambda
     ↓ Read
DynamoDB (til-jobs) - Return job status + results
     ↓
User (Frontend) - Display final abstract
```

---

## 6. DynamoDB Tables & Purpose

| Table | Purpose | Written By | Read By |
|-------|---------|------------|---------|
| **til-jobs** | Job status, results | API Lambda, Step Functions | API Lambda |
| **til-job-budgets** | Cost tracking, guardrails | Manager, Worker | Manager, Worker |
| **til-decision-events-by-job** | Audit trail, event stream | Manager, Worker, Evaluator | API Lambda (events endpoint) |
| **til-decision-event-ids** | Event idempotency | Manager, Worker, Evaluator | Manager, Worker, Evaluator |
| **til-generation-metrics** | Evaluator results, metrics | Evaluator | Step Functions (polling), API Lambda |
| **til-web-search-guardrails** | Per-instance web search limits | Worker | Worker |
| **til-conference-data** | Conference requirements | Manual/seed script | Manager |
| **til-artifacts** | Large artifacts (future) | Worker | API Lambda, Worker |

---

## 7. Decision Events (Audit Trail)

Every significant action is logged as a **decision event** in `til-decision-events-by-job`.

### Event Types

| Event Type | Actor | When | Details |
|------------|-------|------|---------|
| `goal_formulated` | Manager | After LLM call | goal, vendor, model, tokens, cost |
| `tool_called` | Worker | Each tool call | tool_name, inputs, results_summary, success, cost |
| `abstract_submitted` | Worker | Terminal tool | title, abstract, word_count, confidence |
| `evaluator_assessed` | Evaluator | After Bedrock call | predicted_conference, confidence, top_3 |
| `manager_evaluated` | Manager | After evaluation LLM | decision, acceptance_score, feedback |
| `cost_event` | Budget | After cost update | cost_increment, total_cost |
| `cost_guardrail_triggered` | Budget | Minimal mode activated | budget_limit, minimal_mode_activated |
| `job_completed` | System | Job success | total_iterations, total_cost, acceptance_score |
| `job_failed` | System | Job failure | failure_reason, error |

### Event Schema

```json
{
  "job_id": "2f47f1e3...",
  "seq_ts_type": "0000000123#2026-01-18T10:30:15.123Z#tool_called",
  "event_id": "uuid",
  "event_type": "tool_called",
  "actor": "worker",
  "iteration": 0,
  "execution_id": "arn:aws:states:...",
  "state_name": "WorkerExecution",
  "timestamp": "2026-01-18T10:30:15.123Z",
  "seq": 123,
  "details": {
    "tool_name": "web_search",
    "tool_invocation_id": "uuid",
    "inputs": { "query": "adversarial attacks", "limit": 5 },
    "results_summary": "Found 5 results...",
    "success": true,
    "cost_usd": 0.05
  },
  "details_size_bytes": 245,
  "details_hash": "sha256...",
  "s3_details_ref": null  // Or S3 key if details > 10 KB
}
```

### Why Seq-Based Ordering?

```json
// Sort key: seq_ts_type
"0000000123#2026-01-18T10:30:15.123Z#tool_called"
```

**Rationale:**
- `seq` is deterministic (atomic increment, no clock skew)
- Timestamp for readability
- Event type for filtering
- Lexicographic ordering: `seq` sorts first (primary), then timestamp, then event_type

---

## 8. Error Handling

### Lambda Timeout

**Scenario:** Manager Lambda times out after 30 seconds

**Flow:**
```
Manager Lambda (timeout after 30s)
     ↓ Catch: States.Timeout
FailJob_timeout (DynamoDB Update)
     ↓ Write
DynamoDB (til-jobs)
  status: "failed"
  failure_reason: "timeout"
  error: "Manager Lambda timed out"
```

### Lambda Error

**Scenario:** Worker Lambda crashes (e.g., null pointer exception)

**Flow:**
```
Worker Lambda (exception)
     ↓ Catch: States.ALL
FailJob_internal_error (DynamoDB Update)
     ↓ Write
DynamoDB (til-jobs)
  status: "failed"
  failure_reason: "internal_error"
  error: "Worker Lambda exception: ..."
```

### Evaluator Timeout

**Scenario:** Evaluator doesn't respond within 60 seconds

**Flow:**
```
Poll for Evaluator (20 polls * 3s)
     ↓ No result after 60s
ContinueWithoutEvaluator
     ↓ Set evaluator_result = { timeout: true }
Manager Evaluation (proceeds without evaluator input)
     ↓ Decision: accept/reject (without evaluator confidence)
```

**Graceful Degradation:** Manager can still make accept/reject decision without evaluator input.

### Budget Exceeded

**Scenario:** Job cost exceeds $10

**Flow:**
```
Worker Lambda (after LLM call)
     ↓ Update budget
increment_llm_cost(job_id, 2.50)
     ↓ Check budget
if (estimated_cost_cents > 1000) {  // $10
  throw BudgetExceededError();
}
     ↓ Catch in Lambda
return { error: "budget_exceeded", ... };
     ↓ Step Functions catches
FailJob_internal_error
     ↓ Write
DynamoDB (til-jobs)
  status: "failed"
  failure_reason: "budget_exceeded"
```

---

## 9. User Retrieves Result

### User Action: GET /api/v1/jobs/{job_id}/status

**Request:**
```
GET /api/v1/jobs/2f47f1e3.../status?token={job_read_token}
```

**What Happens:**

1. **API Lambda validates token**
   ```typescript
   const jobRecord = await dynamodb.get({ job_id });
   const isValid = verifyJobTokenHash(job_read_token, jobRecord.job_read_token_hash);
   if (!isValid) return 403;
   ```

2. **API Lambda reads job status**
   ```typescript
   const job = await dynamodb.get({
     TableName: "til-jobs",
     Key: { job_id }
   });
   ```

3. **API Lambda builds phase projection** (Sprint 7)
   ```typescript
   // Query decision events to determine current phase
   const events = await dynamodb.query({
     TableName: "til-decision-events-by-job",
     KeyConditionExpression: "job_id = :jid",
     Limit: 10,
     ScanIndexForward: false  // Most recent first
   });
   
   const phaseProjection = buildPhaseProjection(job, events);
   ```

4. **Response:**
   ```json
   {
     "job_id": "2f47f1e3...",
     "status": "completed",
     "title": "Adversarial Attacks on Large Language Models...",
     "abstract": "This talk explores novel adversarial techniques...",
     "word_count": 247,
     "total_iterations": 1,
     "acceptance_score": 8.5,
     "total_cost_usd": 1.50,
     "current_phase": "completed",
     "current_phase_label": "Completed",
     "phase_started_at": "2026-01-18T10:32:00Z",
     "is_terminal": true,
     "iteration": 0,
     "max_iterations": 5,
     "created_at": "2026-01-18T10:30:00Z",
     "completed_at": "2026-01-18T10:32:00Z"
   }
   ```

---

## 10. Key Insights

### Why Async Evaluator?

**Problem:** Evaluator call takes 5-30 seconds (Bedrock API latency)

**Solution:** Async via SNS → SQS → Lambda
- Step Functions doesn't block on evaluator
- Polling allows graceful degradation (timeout after 60s)
- Manager can proceed without evaluator if needed

### Why Seq-Based Ordering for Events?

**Problem:** Timestamp collisions, clock skew, out-of-order events

**Solution:** Atomic sequence number (DynamoDB)
- `seq` is deterministic (increments atomically)
- Sort key: `seq#timestamp#event_type` (seq sorts first)
- Guarantees correct ordering for workflow reconstruction

### Why Poll Instead of SNS/EventBridge?

**Problem:** Step Functions needs evaluator result to proceed

**Solutions Considered:**
1. **Callback pattern:** Evaluator calls Step Functions callback (complex)
2. **EventBridge:** Evaluator publishes event, Step Functions waits (complex)
3. **Polling:** Step Functions polls DynamoDB every 3 seconds (simple ✅)

**Chosen:** Polling (simpler, more reliable)

### Why DynamoDB + S3 (Hybrid Storage)?

**Problem:** DynamoDB item size limit (400 KB), large artifacts (1+ MB)

**Solution:** Hybrid storage
- **Small data (<350 KB):** Store in DynamoDB (fast, queryable)
- **Large data (>350 KB):** Store in S3, reference in DynamoDB
- **Best of both worlds:** Fast queries + unlimited storage

---

## Related Documentation

- **Deployment Guide:** `docs/deployment-guide.md`
- **S3 Buckets Guide:** `docs/s3-buckets-guide.md`
- **Lambda Layers:** `docs/lambda-layer-build-requirements.md`
- **Architecture:** `docs/architecture/high-level-architecture.md`
- **Story 2.1 (Manager):** `docs/stories/2.1.manager-agent-high-level-orchestration.md`
- **Story 2.2 (Worker):** `docs/stories/2.2.worker-agent-autonomous-execution.md`
- **Story 2.4 (Evaluator):** Referenced in PRD
- **Story 3.1 (Decision Events):** Referenced in PRD
- **Story 4.1 (Budget Tracking):** Referenced in PRD
- **Story 6.5 (Job Lifecycle):** Referenced in PRD
