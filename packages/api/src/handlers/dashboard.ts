/**
 * Dashboard Handlers
 * Epic 5 / Sprint 6: Analytics Dashboard
 * 
 * Endpoints:
 * - GET /api/v1/dashboard/overview - Executive metrics summary
 * - GET /api/v1/dashboard/agentic - Tool usage and behavior analysis
 * - GET /api/v1/dashboard/vendors - Vendor comparison metrics
 * - GET /api/v1/dashboard/tools - Tool deep dive metrics
 * - GET /api/v1/dashboard/evaluator - Evaluator analysis
 * - GET /api/v1/dashboard/system - System performance metrics
 * 
 * Data Spec: docs/dashboard-data-spec.md
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME || 'til-jobs';
const GENERATION_METRICS_TABLE_NAME = process.env.GENERATION_METRICS_TABLE_NAME || 'til-generation-metrics';
const DECISION_EVENTS_BY_JOB_TABLE_NAME = process.env.DECISION_EVENTS_BY_JOB_TABLE_NAME || 'til-decision-events-by-job';
const JOB_BUDGETS_TABLE_NAME = process.env.JOB_BUDGETS_TABLE_NAME || 'til-job-budgets';
const DASHBOARD_TOKEN_PARAMETER = process.env.DASHBOARD_TOKEN_PARAMETER || '/conference-abstract/dashboard-token';

// =============================================================================
// CANONICAL OUTCOME TAXONOMY (see docs/dashboard-data-spec.md)
// =============================================================================

/**
 * Canonical outcome states - use ONLY these across all dashboards
 */
type JobOutcome = 'accepted' | 'compromised' | 'failed' | 'aborted' | 'in_progress';

/**
 * Map DynamoDB job status to canonical outcome
 */
function getOutcome(job: { status: string; failure_reason?: string }): JobOutcome {
  switch (job.status) {
    case 'completed':
      return 'accepted';
    case 'completed_with_compromises':
      return 'compromised';
    case 'failed':
      // Distinguish between failure and abort
      if (job.failure_reason === 'budget_exceeded' || job.failure_reason === 'kill_switch') {
        return 'aborted';
      }
      return 'failed';
    case 'running':
    case 'queued':
      return 'in_progress';
    default:
      return 'failed';
  }
}

// Conferences and topics for aggregation
const CONFERENCES = ['black_hat', 'reinvent', 'kubecon', 'gartner_symposium', 'google_cloud_next'] as const;
const TOPICS = [
  'ai_ml_genai', 'security_zero_trust', 'cloud_arch_infra', 'k8s_containers',
  'platform_devops', 'networking_mesh', 'data_analytics', 'leadership_governance',
] as const;

// Action point costs (canonical source: packages/shared/llm-client/tool_definitions.py)
const TOOL_ACTION_POINTS: Record<string, number> = {
  dynamodb_lookup: 1,
  web_search: 1,
  search_recent_content: 1,
  search_abstracts: 2,
  red_team_review: 1,
  submit_abstract: 0,
};

interface DateRange {
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string;   // ISO date YYYY-MM-DD
}

// =============================================================================
// WILSON CONFIDENCE INTERVAL (see docs/dashboard-data-spec.md)
// =============================================================================

interface RateWithCI {
  rate: number;
  n: number;
  ci_low: number;
  ci_high: number;
  ci_level: number;
}

/**
 * Calculate Wilson score confidence interval for a proportion.
 * Returns rate with 95% CI bounds.
 */
function wilsonInterval(successes: number, total: number, z: number = 1.96): RateWithCI {
  if (total === 0) {
    return { rate: 0, n: 0, ci_low: 0, ci_high: 1, ci_level: 0.95 };
  }

  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  const lower = Math.max(0, (center - spread) / denominator);
  const upper = Math.min(1, (center + spread) / denominator);

  return {
    rate: Math.round(p * 1000) / 1000,
    n: total,
    ci_low: Math.round(lower * 1000) / 1000,
    ci_high: Math.round(upper * 1000) / 1000,
    ci_level: 0.95,
  };
}

/**
 * Parse date range from query parameters
 * Default: last 30 days
 */
function parseDateRange(event: APIGatewayProxyEvent): DateRange {
  const now = new Date();
  const defaultEnd = now.toISOString().split('T')[0];
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return {
    startDate: event.queryStringParameters?.start_date || defaultStart,
    endDate: event.queryStringParameters?.end_date || defaultEnd,
  };
}

/**
 * CORS headers for dashboard API
 */
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Scan jobs table with date filtering
 */
async function scanJobs(dateRange: DateRange): Promise<any[]> {
  const jobs: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: JOBS_TABLE_NAME,
      FilterExpression: 'created_at >= :start AND created_at <= :end',
      ExpressionAttributeValues: {
        ':start': dateRange.startDate,
        ':end': dateRange.endDate + 'T23:59:59.999Z',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    if (result.Items) {
      jobs.push(...result.Items);
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return jobs;
}

/**
 * Scan decision events for tool analysis
 */
async function scanEvaluatorEvents(jobIds: string[]): Promise<any[]> {
  if (jobIds.length === 0) return [];

  const events: any[] = [];
  
  for (const jobId of jobIds.slice(0, 100)) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
        KeyConditionExpression: 'job_id = :job_id',
        FilterExpression: 'event_type = :evaluator_assessed',
        ExpressionAttributeValues: {
          ':job_id': jobId,
          ':evaluator_assessed': 'evaluator_assessed',
        },
        Limit: 20,
      }));

      if (result.Items) {
        events.push(...result.Items);
      }
    } catch (err) {
      console.warn(`Failed to query evaluator events for job ${jobId}:`, err);
    }
  }

  return events;
}

async function scanToolEvents(jobIds: string[]): Promise<any[]> {
  if (jobIds.length === 0) return [];

  const events: any[] = [];
  
  // Query each job's events (more efficient than scan with filter)
  for (const jobId of jobIds.slice(0, 100)) { // Limit to 100 jobs for performance
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
        KeyConditionExpression: 'job_id = :job_id',
        FilterExpression: 'event_type = :tool_called',
        ExpressionAttributeValues: {
          ':job_id': jobId,
          ':tool_called': 'tool_called',
        },
        Limit: 50, // Max 50 tool events per job
      }));

      if (result.Items) {
        events.push(...result.Items);
      }
    } catch (err) {
      console.warn(`Failed to query events for job ${jobId}:`, err);
    }
  }

  return events;
}

/**
 * Scan manager events (rejected and accepted) for vendor analysis
 */
async function scanManagerEvents(jobIds: string[]): Promise<{ rejected: any[]; accepted: any[] }> {
  if (jobIds.length === 0) return { rejected: [], accepted: [] };

  const rejected: any[] = [];
  const accepted: any[] = [];
  
  for (const jobId of jobIds.slice(0, 100)) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
        KeyConditionExpression: 'job_id = :job_id',
        FilterExpression: 'event_type IN (:rejected, :accepted)',
        ExpressionAttributeValues: {
          ':job_id': jobId,
          ':rejected': 'manager_rejected',
          ':accepted': 'manager_accepted',
        },
        Limit: 20,
      }));

      if (result.Items) {
        for (const item of result.Items) {
          if (item.event_type === 'manager_rejected') {
            rejected.push({ ...item, job_id: jobId });
          } else if (item.event_type === 'manager_accepted') {
            accepted.push({ ...item, job_id: jobId });
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to query manager events for job ${jobId}:`, err);
    }
  }

  return { rejected, accepted };
}

/**
 * GET /api/v1/dashboard/overview
 * Story 5.1: Executive Overview Dashboard
 * 
 * Uses canonical outcome taxonomy and Wilson confidence intervals.
 */
export async function getDashboardOverviewHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const dateRange = parseDateRange(event);
    const jobs = await scanJobs(dateRange);

    // Count by canonical outcome
    const outcomeCounts: Record<JobOutcome, number> = {
      accepted: 0,
      compromised: 0,
      failed: 0,
      aborted: 0,
      in_progress: 0,
    };

    for (const job of jobs) {
      const outcome = getOutcome(job);
      outcomeCounts[outcome]++;
    }

    // Finished jobs (exclude in_progress)
    const finishedJobs = jobs.filter(j => getOutcome(j) !== 'in_progress');
    const totalFinished = finishedJobs.length;
    const totalJobs = jobs.length;

    // Iteration distribution by vendor (how many jobs finished in 1, 2, 3, 4, 5 iterations)
    const iterationDistribution: Record<number, { total: number; openai: number; anthropic: number }> = {
      1: { total: 0, openai: 0, anthropic: 0 },
      2: { total: 0, openai: 0, anthropic: 0 },
      3: { total: 0, openai: 0, anthropic: 0 },
      4: { total: 0, openai: 0, anthropic: 0 },
      5: { total: 0, openai: 0, anthropic: 0 },
    };
    for (const job of finishedJobs) {
      const iterations = (job.selected_iteration ?? 0) + 1; // selected_iteration is 0-indexed
      const bucket = Math.min(Math.max(iterations, 1), 5); // Clamp to 1-5
      const workerVendor = (job.vendor_assignment?.worker_vendor || 'unknown').toLowerCase();
      iterationDistribution[bucket].total++;
      if (workerVendor.includes('openai')) iterationDistribution[bucket].openai++;
      if (workerVendor.includes('anthropic')) iterationDistribution[bucket].anthropic++;
    }

    // Conference/topic popularity with enhanced metrics
    const conferenceTopicStats: Record<string, { 
      count: number; 
      totalIterations: number;
      managerOpenAI: number;
      managerAnthropic: number;
    }> = {};
    
    for (const job of jobs) {
      const key = `${job.request_context?.conference || 'unknown'}/${job.request_context?.topic || 'unknown'}`;
      if (!conferenceTopicStats[key]) {
        conferenceTopicStats[key] = { count: 0, totalIterations: 0, managerOpenAI: 0, managerAnthropic: 0 };
      }
      conferenceTopicStats[key].count++;
      
      // Only count iterations and vendor for finished jobs
      const outcome = getOutcome(job);
      if (outcome !== 'in_progress') {
        const iterations = (job.selected_iteration ?? 0) + 1;
        conferenceTopicStats[key].totalIterations += iterations;
        
        const managerVendor = job.vendor_assignment?.manager_vendor?.toLowerCase() || '';
        if (managerVendor.includes('openai')) {
          conferenceTopicStats[key].managerOpenAI++;
        } else if (managerVendor.includes('anthropic')) {
          conferenceTopicStats[key].managerAnthropic++;
        }
      }
    }
    
    const topCombinations = Object.entries(conferenceTopicStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, stats]) => {
        const [conference, topic] = key.split('/');
        const finishedCount = stats.managerOpenAI + stats.managerAnthropic;
        return { 
          conference, 
          topic, 
          count: stats.count,
          avg_iterations: finishedCount > 0 ? +(stats.totalIterations / finishedCount).toFixed(1) : null,
          manager_vendors: `${stats.managerOpenAI}/${stats.managerAnthropic}`,
        };
      });

    // Vendor breakdown with confidence intervals
    const vendorStats: Record<string, { asManager: number; asWorker: number; accepted: number }> = {
      openai: { asManager: 0, asWorker: 0, accepted: 0 },
      anthropic: { asManager: 0, asWorker: 0, accepted: 0 },
    };

    for (const job of finishedJobs) {
      const managerVendor = job.vendor_assignment?.manager_vendor || 'unknown';
      const workerVendor = job.vendor_assignment?.worker_vendor || 'unknown';
      const outcome = getOutcome(job);

      if (vendorStats[managerVendor]) {
        vendorStats[managerVendor].asManager++;
        if (outcome === 'accepted') vendorStats[managerVendor].accepted++;
      }
      if (vendorStats[workerVendor]) {
        vendorStats[workerVendor].asWorker++;
      }
    }

    // Cost estimation (from completed jobs)
    let totalCostCents = 0;
    let totalTokens = 0;
    for (const job of finishedJobs) {
      const iterations = job.selected_iteration || 1;
      totalCostCents += iterations * 10; // Estimate: $0.10 per iteration
      totalTokens += iterations * 2000;  // Estimate: 2k tokens per iteration
    }

    // Tool usage summary (scan tool events from finished jobs)
    const finishedJobIds = finishedJobs.map(j => j.job_id);
    const toolEvents = await scanToolEvents(finishedJobIds);
    
    // Build job_id -> worker_vendor lookup
    const jobWorkerVendor: Record<string, string> = {};
    for (const job of finishedJobs) {
      jobWorkerVendor[job.job_id] = (job.vendor_assignment?.worker_vendor || 'unknown').toLowerCase();
    }
    
    // Count total iterations across all finished jobs
    const totalIterations = finishedJobs.reduce((sum, j) => sum + ((j.selected_iteration ?? 0) + 1), 0);
    
    // Aggregate tool usage by tool name and vendor
    const toolUsage: Record<string, { 
      total: number; 
      openai: number; 
      anthropic: number;
    }> = {};
    
    for (const evt of toolEvents) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      // Handle both Map format from DynamoDB and plain object
      const toolName = details?.tool_name?.S || details?.tool_name || 'unknown';
      const jobId = evt.job_id;
      const workerVendor = jobWorkerVendor[jobId] || 'unknown';
      
      if (!toolUsage[toolName]) {
        toolUsage[toolName] = { total: 0, openai: 0, anthropic: 0 };
      }
      toolUsage[toolName].total++;
      if (workerVendor.includes('openai')) toolUsage[toolName].openai++;
      if (workerVendor.includes('anthropic')) toolUsage[toolName].anthropic++;
    }
    
    // Convert to array sorted by total calls
    const toolUsageArray = Object.entries(toolUsage)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, stats]) => ({
        tool_name: name,
        total_calls: stats.total,
        pct_of_iterations: totalIterations > 0 ? +((stats.total / totalIterations) * 100).toFixed(1) : 0,
        openai_calls: stats.openai,
        anthropic_calls: stats.anthropic,
      }));

    // Evaluator prediction accuracy (scan evaluator events)
    const evaluatorEvents = await scanEvaluatorEvents(finishedJobIds);
    
    // Build job_id -> target conference lookup
    const jobTargetConf: Record<string, string> = {};
    for (const job of finishedJobs) {
      jobTargetConf[job.job_id] = job.request_context?.conference || 'unknown';
    }
    
    // Count target conference rank distribution
    const targetRankDist = { rank1: 0, rank2: 0, rank3: 0, notInTop3: 0 };
    const decoyRankDist = { rank1: 0, rank2: 0, rank3: 0, notPicked: 0 };
    let evalCount = 0;
    
    for (const evt of evaluatorEvents) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      const top3Raw = details?.top_3?.L || details?.top_3 || [];
      const top3 = top3Raw.map((x: any) => x?.S || x);
      const targetConf = jobTargetConf[evt.job_id] || 'unknown';
      const pickedDecoy = details?.picked_decoy?.BOOL ?? details?.picked_decoy ?? false;
      const decoyRank = details?.decoy_rank?.N ? parseInt(details.decoy_rank.N) : details?.decoy_rank;
      
      evalCount++;
      
      // Target conference rank
      const targetIdx = top3.indexOf(targetConf);
      if (targetIdx === 0) targetRankDist.rank1++;
      else if (targetIdx === 1) targetRankDist.rank2++;
      else if (targetIdx === 2) targetRankDist.rank3++;
      else targetRankDist.notInTop3++;
      
      // Decoy rank
      if (pickedDecoy && decoyRank) {
        if (decoyRank === 1) decoyRankDist.rank1++;
        else if (decoyRank === 2) decoyRankDist.rank2++;
        else if (decoyRank === 3) decoyRankDist.rank3++;
      } else {
        decoyRankDist.notPicked++;
      }
    }
    
    // Acceptance by iteration (as worker) - how many jobs escaped at each iteration
    // Total is always the same: total jobs for that vendor as worker
    const iterAcceptance: Record<string, { openai: number; anthropic: number }> = {
      '1': { openai: 0, anthropic: 0 },
      '2': { openai: 0, anthropic: 0 },
      '3': { openai: 0, anthropic: 0 },
      '4': { openai: 0, anthropic: 0 },
      '5': { openai: 0, anthropic: 0 },
    };
    const vendorTotals = { openai: 0, anthropic: 0 };
    
    for (const job of finishedJobs) {
      const workerVendor = (job.vendor_assignment?.worker_vendor || 'unknown').toLowerCase();
      const finalIter = (job.selected_iteration ?? 4) + 1; // 0-indexed to 1-indexed
      const outcome = getOutcome(job);
      const iterKey = String(finalIter);
      
      // Count which iteration each job escaped at (accepted jobs only)
      if (workerVendor.includes('openai')) {
        vendorTotals.openai++;
        if (outcome === 'accepted') iterAcceptance[iterKey].openai++;
      } else if (workerVendor.includes('anthropic')) {
        vendorTotals.anthropic++;
        if (outcome === 'accepted') iterAcceptance[iterKey].anthropic++;
      }
    }

    const response = {
      date_range: dateRange,
      summary: {
        total_jobs: totalJobs,
        finished_jobs: totalFinished,
        in_progress: outcomeCounts.in_progress,
        // "Combined" = accepted + compromised (jobs that produced output)
        completion_rate: wilsonInterval(
          outcomeCounts.accepted + outcomeCounts.compromised,
          totalFinished
        ),
      },
      // Canonical outcome breakdown with confidence intervals
      outcomes: {
        accepted: wilsonInterval(outcomeCounts.accepted, totalFinished),
        compromised: wilsonInterval(outcomeCounts.compromised, totalFinished),
        failed: wilsonInterval(outcomeCounts.failed, totalFinished),
        aborted: wilsonInterval(outcomeCounts.aborted, totalFinished),
      },
      // Iteration distribution
      iteration_distribution: iterationDistribution,
      top_combinations: topCombinations,
      vendor_summary: {
        openai: {
          as_manager: vendorStats.openai.asManager,
          as_worker: vendorStats.openai.asWorker,
          acceptance_rate: wilsonInterval(
            vendorStats.openai.accepted,
            vendorStats.openai.asManager
          ),
        },
        anthropic: {
          as_manager: vendorStats.anthropic.asManager,
          as_worker: vendorStats.anthropic.asWorker,
          acceptance_rate: wilsonInterval(
            vendorStats.anthropic.accepted,
            vendorStats.anthropic.asManager
          ),
        },
      },
      cost_summary: {
        estimated_total_usd: (totalCostCents / 100).toFixed(2),
        total_tokens: totalTokens,
        avg_cost_per_job_usd: totalFinished > 0
          ? (totalCostCents / 100 / totalFinished).toFixed(3)
          : '0',
      },
      tool_usage: toolUsageArray,
      evaluator_accuracy: {
        total_evaluations: evalCount,
        target_rank_distribution: targetRankDist,
        decoy_rank_distribution: decoyRankDist,
      },
      acceptance_by_iteration: {
        openai_total: vendorTotals.openai,
        anthropic_total: vendorTotals.anthropic,
        by_iteration: iterAcceptance,
      },
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Dashboard overview error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/dashboard/vendors
 * Story 5.3: Vendor Comparison Dashboard
 * 
 * All rates include Wilson confidence intervals.
 * Extended with manager scoring, rejection reasons, worker patterns, creativity impact.
 */
export async function getDashboardVendorsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const dateRange = parseDateRange(event);
    const jobs = await scanJobs(dateRange);

    // Filter to finished jobs only
    const finishedJobs = jobs.filter(j => getOutcome(j) !== 'in_progress');
    const finishedJobIds = finishedJobs.map(j => j.job_id);

    // Build job_id -> vendor lookup
    const jobVendors: Record<string, { manager: string; worker: string }> = {};
    for (const job of finishedJobs) {
      jobVendors[job.job_id] = {
        manager: job.vendor_assignment?.manager_vendor || 'unknown',
        worker: job.vendor_assignment?.worker_vendor || 'unknown',
      };
    }

    // Group by vendor combination
    const combinations: Record<string, {
      count: number;
      accepted: number;
      compromised: number;
      totalIterations: number;
    }> = {};

    for (const job of finishedJobs) {
      const managerVendor = job.vendor_assignment?.manager_vendor || 'unknown';
      const workerVendor = job.vendor_assignment?.worker_vendor || 'unknown';
      const key = `${managerVendor}_manager_${workerVendor}_worker`;
      const outcome = getOutcome(job);

      if (!combinations[key]) {
        combinations[key] = { count: 0, accepted: 0, compromised: 0, totalIterations: 0 };
      }

      combinations[key].count++;
      if (outcome === 'accepted') combinations[key].accepted++;
      if (outcome === 'compromised') combinations[key].compromised++;
      combinations[key].totalIterations += job.selected_iteration || 1;
    }

    // Manager effectiveness
    const managerStats: Record<string, {
      total: number;
      accepted: number;
      totalIterations: number;
    }> = {
      openai: { total: 0, accepted: 0, totalIterations: 0 },
      anthropic: { total: 0, accepted: 0, totalIterations: 0 },
    };

    for (const job of finishedJobs) {
      const vendor = job.vendor_assignment?.manager_vendor;
      const outcome = getOutcome(job);
      if (vendor && managerStats[vendor]) {
        managerStats[vendor].total++;
        if (outcome === 'accepted') managerStats[vendor].accepted++;
        managerStats[vendor].totalIterations += job.selected_iteration || 1;
      }
    }

    // Worker effectiveness
    const workerStats: Record<string, {
      total: number;
      accepted: number;
    }> = {
      openai: { total: 0, accepted: 0 },
      anthropic: { total: 0, accepted: 0 },
    };

    for (const job of finishedJobs) {
      const vendor = job.vendor_assignment?.worker_vendor;
      const outcome = getOutcome(job);
      if (vendor && workerStats[vendor]) {
        workerStats[vendor].total++;
        if (outcome === 'accepted') workerStats[vendor].accepted++;
      }
    }

    // =========================================================================
    // NEW: Manager Scoring Analysis
    // =========================================================================
    const managerEvents = await scanManagerEvents(finishedJobIds);
    
    // Build job_id -> manager_vendor lookup from job records
    const jobManagerVendor: Record<string, string> = {};
    for (const job of finishedJobs) {
      const managerVendor = (job.vendor_assignment?.manager_vendor || 'unknown').toLowerCase();
      jobManagerVendor[job.job_id] = managerVendor.includes('openai') ? 'openai' : 
                                      managerVendor.includes('anthropic') ? 'anthropic' : 'unknown';
    }
    
    // Manager scoring by vendor
    const managerScoring: Record<string, { 
      rejectionScores: number[]; 
      acceptanceScores: number[];
    }> = {
      openai: { rejectionScores: [], acceptanceScores: [] },
      anthropic: { rejectionScores: [], acceptanceScores: [] },
    };

    // Rejection reasons frequency
    const rejectionReasons: Record<string, { total: number; openai: number; anthropic: number }> = {};

    // Creativity impact data
    const creativityBuckets: Record<string, { scores: number[]; accepted: number; total: number }> = {};

    // Process rejected events
    for (const evt of managerEvents.rejected) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      // Get manager vendor from job lookup (events don't have vendor field)
      const managerVendor = jobManagerVendor[evt.job_id] || 'unknown';
      const score = typeof details?.quality_score === 'number' 
        ? details.quality_score 
        : (details?.quality_score?.N ? parseFloat(details.quality_score.N) : undefined);
      const feedback = details?.feedback_for_worker?.S || details?.feedback_for_worker || '';
      const creativity = typeof details?.creativity === 'number'
        ? details.creativity
        : (details?.creativity?.N ? parseFloat(details.creativity.N) : undefined);

      // Score tracking
      if (typeof score === 'number' && managerScoring[managerVendor]) {
        managerScoring[managerVendor].rejectionScores.push(score);
      }

      // Rejection reason tracking
      if (feedback && feedback.length < 100) { // Only track short templated messages
        if (!rejectionReasons[feedback]) {
          rejectionReasons[feedback] = { total: 0, openai: 0, anthropic: 0 };
        }
        rejectionReasons[feedback].total++;
        if (managerVendor === 'openai') rejectionReasons[feedback].openai++;
        if (managerVendor === 'anthropic') rejectionReasons[feedback].anthropic++;
      }

      // Creativity tracking (rejections)
      if (typeof creativity === 'number' && typeof score === 'number') {
        const bucket = creativity.toFixed(1);
        if (!creativityBuckets[bucket]) {
          creativityBuckets[bucket] = { scores: [], accepted: 0, total: 0 };
        }
        creativityBuckets[bucket].scores.push(score);
        creativityBuckets[bucket].total++;
      }
    }

    // Process accepted events
    for (const evt of managerEvents.accepted) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      // Get manager vendor from job lookup
      const managerVendor = jobManagerVendor[evt.job_id] || 'unknown';
      const score = typeof details?.quality_score === 'number' 
        ? details.quality_score 
        : (details?.quality_score?.N ? parseFloat(details.quality_score.N) : undefined);
      const creativity = typeof details?.creativity === 'number'
        ? details.creativity
        : (details?.creativity?.N ? parseFloat(details.creativity.N) : undefined);

      if (typeof score === 'number' && managerScoring[managerVendor]) {
        managerScoring[managerVendor].acceptanceScores.push(score);
      }

      // Creativity tracking (acceptances)
      if (typeof creativity === 'number' && typeof score === 'number') {
        const bucket = creativity.toFixed(1);
        if (!creativityBuckets[bucket]) {
          creativityBuckets[bucket] = { scores: [], accepted: 0, total: 0 };
        }
        creativityBuckets[bucket].scores.push(score);
        creativityBuckets[bucket].accepted++;
        creativityBuckets[bucket].total++;
      }
    }

    // =========================================================================
    // NEW: Worker Tool Patterns
    // =========================================================================
    const toolEvents = await scanToolEvents(finishedJobIds);
    
    // Group tool calls by job_id + iteration
    const iterationTools: Record<string, { tools: string[]; workerVendor: string }> = {};
    for (const evt of toolEvents) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      const toolName = details?.tool_name?.S || details?.tool_name || 'unknown';
      const iteration = evt.iteration ?? 0;
      const key = `${evt.job_id}:${iteration}`;
      const workerVendor = jobVendors[evt.job_id]?.worker || 'unknown';
      
      if (!iterationTools[key]) {
        iterationTools[key] = { tools: [], workerVendor };
      }
      iterationTools[key].tools.push(toolName);
    }

    // Calculate patterns
    const workerPatterns = {
      openai: { iterations: 0, toolRepeats: 0, multiSearch: 0 },
      anthropic: { iterations: 0, toolRepeats: 0, multiSearch: 0 },
    };

    for (const [, data] of Object.entries(iterationTools)) {
      const vendor = data.workerVendor;
      if (!workerPatterns[vendor as keyof typeof workerPatterns]) continue;
      
      workerPatterns[vendor as keyof typeof workerPatterns].iterations++;
      
      // Check for tool repeats (same tool called 2+ times)
      const toolCounts = data.tools.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {} as Record<string, number>);
      if (Object.values(toolCounts).some(c => c >= 2)) {
        workerPatterns[vendor as keyof typeof workerPatterns].toolRepeats++;
      }
      
      // Check for multi-search (both web_search and search_recent_content)
      if (data.tools.includes('web_search') && data.tools.includes('search_recent_content')) {
        workerPatterns[vendor as keyof typeof workerPatterns].multiSearch++;
      }
    }

    // =========================================================================
    // Build Response
    // =========================================================================
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const response = {
      date_range: dateRange,
      manager_comparison: {
        openai: {
          acceptance_rate: wilsonInterval(managerStats.openai.accepted, managerStats.openai.total),
          avg_iterations: managerStats.openai.total > 0
            ? Math.round(managerStats.openai.totalIterations / managerStats.openai.total * 100) / 100
            : null,
        },
        anthropic: {
          acceptance_rate: wilsonInterval(managerStats.anthropic.accepted, managerStats.anthropic.total),
          avg_iterations: managerStats.anthropic.total > 0
            ? Math.round(managerStats.anthropic.totalIterations / managerStats.anthropic.total * 100) / 100
            : null,
        },
      },
      worker_comparison: {
        openai: {
          acceptance_rate: wilsonInterval(workerStats.openai.accepted, workerStats.openai.total),
        },
        anthropic: {
          acceptance_rate: wilsonInterval(workerStats.anthropic.accepted, workerStats.anthropic.total),
        },
      },
      cross_role_matrix: Object.entries(combinations).map(([key, stats]) => ({
        combination: key,
        acceptance_rate: wilsonInterval(stats.accepted, stats.count),
        compromise_rate: wilsonInterval(stats.compromised, stats.count),
        avg_iterations: stats.count > 0
          ? Math.round(stats.totalIterations / stats.count * 100) / 100
          : null,
      })),
      
      // NEW: Manager scoring analysis
      manager_scoring: {
        openai: {
          rejection_avg: avg(managerScoring.openai.rejectionScores),
          acceptance_avg: avg(managerScoring.openai.acceptanceScores),
          n_rejections: managerScoring.openai.rejectionScores.length,
          n_acceptances: managerScoring.openai.acceptanceScores.length,
        },
        anthropic: {
          rejection_avg: avg(managerScoring.anthropic.rejectionScores),
          acceptance_avg: avg(managerScoring.anthropic.acceptanceScores),
          n_rejections: managerScoring.anthropic.rejectionScores.length,
          n_acceptances: managerScoring.anthropic.acceptanceScores.length,
        },
      },
      
      // NEW: Rejection reasons (top 10)
      rejection_reasons: Object.entries(rejectionReasons)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([message, counts]) => ({
          message,
          count: counts.total,
          openai_count: counts.openai,
          anthropic_count: counts.anthropic,
        })),
      
      // NEW: Worker tool patterns
      worker_patterns: {
        tool_repeat_rate: {
          openai: workerPatterns.openai.iterations > 0 
            ? Math.round(workerPatterns.openai.toolRepeats / workerPatterns.openai.iterations * 1000) / 10 
            : 0,
          anthropic: workerPatterns.anthropic.iterations > 0 
            ? Math.round(workerPatterns.anthropic.toolRepeats / workerPatterns.anthropic.iterations * 1000) / 10 
            : 0,
        },
        multi_search_rate: {
          openai: workerPatterns.openai.iterations > 0 
            ? Math.round(workerPatterns.openai.multiSearch / workerPatterns.openai.iterations * 1000) / 10 
            : 0,
          anthropic: workerPatterns.anthropic.iterations > 0 
            ? Math.round(workerPatterns.anthropic.multiSearch / workerPatterns.anthropic.iterations * 1000) / 10 
            : 0,
        },
        iterations_analyzed: {
          openai: workerPatterns.openai.iterations,
          anthropic: workerPatterns.anthropic.iterations,
        },
      },
      
      // NEW: Creativity impact
      creativity_impact: Object.entries(creativityBuckets)
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .map(([level, data]) => ({
          creativity_level: parseFloat(level),
          avg_quality_score: avg(data.scores),
          acceptance_rate: data.total > 0 ? Math.round(data.accepted / data.total * 1000) / 10 : 0,
          sample_size: data.total,
        })),
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Dashboard vendors error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/dashboard/evaluator
 * Story 5.5: Evaluator Analysis Dashboard
 * 
 * Includes decoy conference detection analysis.
 */
export async function getDashboardEvaluatorHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const dateRange = parseDateRange(event);
    
    // Query generation_metrics table for evaluator records directly
    // This is the source of truth for evaluator predictions
    
    // Scan for evaluator records (record_type_timestamp starts with "evaluator#")
    let evaluatorRecords: any[] = [];
    let lastEvaluatedKey: any = undefined;

    // Paginate through all evaluator records
    do {
      const result = await docClient.send(new ScanCommand({
        TableName: GENERATION_METRICS_TABLE_NAME,
        FilterExpression: 'begins_with(record_type_timestamp, :prefix) AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':prefix': 'evaluator#',
          ':status': 'success',
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      if (result.Items) {
        evaluatorRecords = evaluatorRecords.concat(result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Found ${evaluatorRecords.length} evaluator records in generation_metrics`);

    // Get job details to match evaluator predictions with actual conferences
    const jobIds = [...new Set(evaluatorRecords.map(r => r.job_id))];
    const jobsMap = new Map<string, any>();

    // Get jobs individually (no BatchGet in SDK v3 DynamoDB DocumentClient)
    for (const jobId of jobIds) {
      try {
        const result = await docClient.send(new QueryCommand({
          TableName: JOBS_TABLE_NAME,
          KeyConditionExpression: 'job_id = :jid',
          ExpressionAttributeValues: {
            ':jid': jobId,
          },
        }));

        if (result.Items && result.Items.length > 0) {
          jobsMap.set(jobId, result.Items[0]);
        }
      } catch (error) {
        console.error(`Failed to get job ${jobId}:`, error);
      }
    }

    // All conferences including decoys
    const DECOY_CONFERENCES = ['microsoft_ignite', 'rsa_conference'] as const;
    const allConferences = [...CONFERENCES, ...DECOY_CONFERENCES];

    // Initialize confusion matrix
    const confusionMatrix: Record<string, Record<string, number>> = {};
    for (const conf of allConferences) {
      confusionMatrix[conf] = {};
      for (const pred of allConferences) {
        confusionMatrix[conf][pred] = 0;
      }
    }

    let correctPredictions = 0;
    let decoyPicks = 0;
    const confidences: number[] = [];

    // Process each evaluator record
    for (const evalRecord of evaluatorRecords) {
      const job = jobsMap.get(evalRecord.job_id);
      if (!job?.request_context?.conference) continue;

      const actual = job.request_context.conference;
      
      // Extract predicted conference from top_3_conferences
      const top3 = evalRecord.top_3_conferences;
      const predicted = Array.isArray(top3) ? top3[0] : null;
      
      if (!predicted) continue;

      // Update confusion matrix
      if (confusionMatrix[actual]?.[predicted] !== undefined) {
        confusionMatrix[actual][predicted]++;
      }

      // Check correctness
      if (actual === predicted) {
        correctPredictions++;
      }

      // Check decoy selection
      if (DECOY_CONFERENCES.includes(predicted as typeof DECOY_CONFERENCES[number])) {
        decoyPicks++;
      }

      // Extract confidence score
      const scores = evalRecord.confidence_scores;
      if (Array.isArray(scores) && scores.length > 0) {
        const conf = typeof scores[0] === 'number' ? scores[0] : parseFloat(scores[0]);
        if (!isNaN(conf)) {
          confidences.push(conf);
        }
      }
    }

    const sampleSize = evaluatorRecords.length;

    // Compute confidence statistics
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // Sort confidences for percentiles
    confidences.sort((a, b) => a - b);
    const p25Index = Math.floor(confidences.length * 0.25);
    const p75Index = Math.floor(confidences.length * 0.75);

    const response = {
      date_range: dateRange,
      accuracy: {
        top_1_match_rate: wilsonInterval(correctPredictions, sampleSize),
        sample_size: sampleSize,
      },
      decoy_analysis: {
        decoy_pick_rate: wilsonInterval(decoyPicks, sampleSize),
        decoys: DECOY_CONFERENCES as unknown as string[],
        _note: 'Decoy picks indicate abstract may not clearly match target conference',
      },
      confidence_stats: {
        mean: confidences.length > 0 ? Math.round(avgConfidence * 1000) / 1000 : null,
        min: confidences.length > 0 ? Math.min(...confidences) : null,
        p25: confidences.length > 0 ? confidences[p25Index] : null,
        p75: confidences.length > 0 ? confidences[p75Index] : null,
        max: confidences.length > 0 ? Math.max(...confidences) : null,
        sample_size: confidences.length,
      },
      confusion_matrix: confusionMatrix,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Dashboard evaluator error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/dashboard/agentic
 * Story 5.2: Agentic Behavior Analysis Dashboard
 * 
 * Note: Tool usage patterns show ASSOCIATION, not causation.
 * Jobs using certain tools may differ in difficulty.
 */
export async function getDashboardAgenticHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const dateRange = parseDateRange(event);
    const jobs = await scanJobs(dateRange);

    // Filter to finished jobs
    const finishedJobs = jobs.filter(j => getOutcome(j) !== 'in_progress');
    const finishedJobIds = finishedJobs.map(j => j.job_id);

    const toolEvents = await scanToolEvents(finishedJobIds);

    // Build job_id -> worker_vendor lookup
    const jobWorkerVendor: Record<string, string> = {};
    for (const job of finishedJobs) {
      jobWorkerVendor[job.job_id] = (job.vendor_assignment?.worker_vendor || 'unknown').toLowerCase();
    }

    // Analyze tool usage with action point costs
    const toolCounts: Record<string, number> = {
      dynamodb_lookup: 0,
      web_search: 0,
      search_abstracts: 0,
      search_recent_content: 0,
      red_team_review: 0,
    };

    const vendorToolUsage: Record<string, Record<string, number>> = {
      openai_worker: { ...toolCounts },
      anthropic_worker: { ...toolCounts },
    };

    // Tool usage by iteration
    const toolByIteration: Record<string, Record<number, number>> = {};
    for (const toolName of Object.keys(toolCounts)) {
      toolByIteration[toolName] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    }

    for (const evt of toolEvents) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      const toolName = details?.tool_name?.S || details?.tool_name || 'unknown';
      const vendor = jobWorkerVendor[evt.job_id] || 'unknown';
      const iteration = Math.min(Math.max((evt.iteration ?? 0) + 1, 1), 5);

      if (toolCounts[toolName] !== undefined) {
        toolCounts[toolName]++;
        toolByIteration[toolName][iteration]++;
      }

      const vendorKey = `${vendor}_worker`;
      if (vendorToolUsage[vendorKey] && toolCounts[toolName] !== undefined) {
        vendorToolUsage[vendorKey][toolName]++;
      }
    }

    // Iteration distribution by outcome
    const iterationByOutcome: Record<number, { accepted: number; compromised: number; failed: number }> = {};
    for (let i = 1; i <= 5; i++) {
      iterationByOutcome[i] = { accepted: 0, compromised: 0, failed: 0 };
    }

    for (const job of finishedJobs) {
      const iteration = Math.min(job.selected_iteration || 1, 5);
      const outcome = getOutcome(job);
      if (iterationByOutcome[iteration] && (outcome === 'accepted' || outcome === 'compromised' || outcome === 'failed')) {
        iterationByOutcome[iteration][outcome]++;
      }
    }

    // Calculate total action points
    let totalActionPoints = 0;
    for (const [tool, count] of Object.entries(toolCounts)) {
      totalActionPoints += count * (TOOL_ACTION_POINTS[tool] || 1);
    }

    const totalToolCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);

    const response = {
      date_range: dateRange,
      _note: 'Tool usage shows ASSOCIATION with outcomes, not causation. Jobs differ in difficulty.',
      tool_usage: {
        total_calls: totalToolCalls,
        by_tool: Object.entries(toolCounts).map(([name, count]) => ({
          tool_name: name,
          action_points: TOOL_ACTION_POINTS[name] || 1,
          call_count: count,
          pct_of_total: totalToolCalls > 0
            ? Math.round(count / totalToolCalls * 1000) / 10
            : 0,
        })),
        total_action_points_spent: totalActionPoints,
      },
      tool_by_vendor: vendorToolUsage,
      tool_by_iteration: toolByIteration,
      iteration_distribution: iterationByOutcome,
      iteration_stats: {
        total_finished: finishedJobs.length,
        avg_iterations: finishedJobs.length > 0
          ? Math.round(
              finishedJobs.reduce((sum, j) => sum + (j.selected_iteration || 1), 0) /
              finishedJobs.length * 100
            ) / 100
          : null,
      },
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Dashboard agentic error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * GET /api/v1/dashboard/tools
 * Story 5.4: Tool Usage Deep Dive Dashboard
 * 
 * Stratified by iteration number to reduce confounding.
 * See docs/dashboard-data-spec.md for causal disclaimer.
 */
export async function getDashboardToolsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const dateRange = parseDateRange(event);
    const jobs = await scanJobs(dateRange);

    const finishedJobs = jobs.filter(j => getOutcome(j) !== 'in_progress');
    const finishedJobIds = finishedJobs.map(j => j.job_id);

    const toolEvents = await scanToolEvents(finishedJobIds);

    // Build lookups from job records
    const jobContext: Record<string, { conference: string; topic: string; workerVendor: string }> = {};
    for (const job of finishedJobs) {
      jobContext[job.job_id] = {
        conference: job.request_context?.conference || 'unknown',
        topic: job.request_context?.topic || 'unknown',
        workerVendor: (job.vendor_assignment?.worker_vendor || 'unknown').toLowerCase().includes('openai') ? 'openai' : 'anthropic',
      };
    }

    // Tool metrics with duration tracking
    const toolMetrics: Record<string, {
      calls: number;
      successes: number;
      totalDurationMs: number;
      callsWithDuration: number;
    }> = {};

    // Tool usage by Conference: { conf -> { tool -> { total, iter1, iter2, ... } } }
    const toolByConf: Record<string, Record<string, { total: number; byIter: Record<number, number> }>> = {};
    
    // Tool usage by Topic: { topic -> { tool -> { total, iter1, iter2, ... } } }
    const toolByTopic: Record<string, Record<string, { total: number; byIter: Record<number, number> }>> = {};
    
    // Web search arguments by vendor
    const webSearchArgs: { openai: string[]; anthropic: string[] } = { openai: [], anthropic: [] };

    for (const evt of toolEvents) {
      const details = typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details;
      const toolName = details?.tool_name || 'unknown';
      const success = details?.success !== false;
      const durationMs = details?.duration_ms;
      const iteration = Math.min((evt.iteration ?? 0) + 1, 5); // 1-indexed, cap at 5
      const ctx = jobContext[evt.job_id] || { conference: 'unknown', topic: 'unknown', workerVendor: 'unknown' };

      // Basic metrics
      if (!toolMetrics[toolName]) {
        toolMetrics[toolName] = { calls: 0, successes: 0, totalDurationMs: 0, callsWithDuration: 0 };
      }
      toolMetrics[toolName].calls++;
      if (success) toolMetrics[toolName].successes++;
      if (typeof durationMs === 'number') {
        toolMetrics[toolName].totalDurationMs += durationMs;
        toolMetrics[toolName].callsWithDuration++;
      }

      // Tool by Conference
      if (!toolByConf[ctx.conference]) toolByConf[ctx.conference] = {};
      if (!toolByConf[ctx.conference][toolName]) {
        toolByConf[ctx.conference][toolName] = { total: 0, byIter: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
      }
      toolByConf[ctx.conference][toolName].total++;
      toolByConf[ctx.conference][toolName].byIter[iteration]++;

      // Tool by Topic
      if (!toolByTopic[ctx.topic]) toolByTopic[ctx.topic] = {};
      if (!toolByTopic[ctx.topic][toolName]) {
        toolByTopic[ctx.topic][toolName] = { total: 0, byIter: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
      }
      toolByTopic[ctx.topic][toolName].total++;
      toolByTopic[ctx.topic][toolName].byIter[iteration]++;

      // Web search arguments - stored in details.parameters.query
      if (toolName === 'web_search' && details?.parameters) {
        const params = details.parameters;
        // Handle both DocumentClient format and raw DynamoDB format
        const query = params?.query?.S || params?.query || params?.search_term?.S || params?.search_term;
        if (query && typeof query === 'string' && query.length < 200) {
          if (ctx.workerVendor === 'openai') {
            webSearchArgs.openai.push(query);
          } else {
            webSearchArgs.anthropic.push(query);
          }
        }
      }
    }

    // Format tool by conference for response (sorted by total descending)
    const toolByConfResponse = Object.entries(toolByConf).map(([conf, tools]) => ({
      conference: conf,
      tools: Object.entries(tools)
        .map(([tool, data]) => ({
          tool,
          total: data.total,
          iter_1: data.byIter[1],
          iter_2: data.byIter[2],
          iter_3: data.byIter[3],
          iter_4: data.byIter[4],
          iter_5: data.byIter[5],
        }))
        .sort((a, b) => b.total - a.total),
    }));

    // Format tool by topic for response
    const toolByTopicResponse = Object.entries(toolByTopic).map(([topic, tools]) => ({
      topic,
      tools: Object.entries(tools)
        .map(([tool, data]) => ({
          tool,
          total: data.total,
          iter_1: data.byIter[1],
          iter_2: data.byIter[2],
          iter_3: data.byIter[3],
          iter_4: data.byIter[4],
          iter_5: data.byIter[5],
        }))
        .sort((a, b) => b.total - a.total),
    }));

    const response = {
      date_range: dateRange,
      _note: 'Tool metrics show usage patterns, not causal effectiveness.',
      tool_metrics: Object.entries(toolMetrics).map(([name, metrics]) => ({
        tool_name: name,
        total_calls: metrics.calls,
        success_rate: wilsonInterval(metrics.successes, metrics.calls),
        avg_duration_ms: metrics.callsWithDuration > 0
          ? Math.round(metrics.totalDurationMs / metrics.callsWithDuration)
          : null,
      })),
      tool_by_conference: toolByConfResponse,
      tool_by_topic: toolByTopicResponse,
      web_search_queries: {
        openai: webSearchArgs.openai.slice(0, 50), // Limit to 50 most recent
        anthropic: webSearchArgs.anthropic.slice(0, 50),
      },
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Dashboard tools error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * Scan iteration timing events (goal start -> manager decision end)
 */
async function scanIterationTimingEvents(jobIds: string[]): Promise<Map<string, Array<{ iteration: number; startTs: string; endTs: string }>>> {
  const jobIterations = new Map<string, Array<{ iteration: number; startTs: string; endTs: string }>>();
  
  for (const jobId of jobIds.slice(0, 100)) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: DECISION_EVENTS_BY_JOB_TABLE_NAME,
        KeyConditionExpression: 'job_id = :job_id',
        FilterExpression: 'event_type IN (:goal, :rejected, :accepted)',
        ExpressionAttributeValues: {
          ':job_id': jobId,
          ':goal': 'manager_goal_formulated',
          ':rejected': 'manager_rejected',
          ':accepted': 'manager_accepted',
        },
        Limit: 50,
      }));

      if (result.Items && result.Items.length > 0) {
        // Group events by iteration
        const iterEvents: Record<number, { start?: string; end?: string }> = {};
        
        for (const item of result.Items) {
          const iteration = item.iteration ?? 0;
          if (!iterEvents[iteration]) {
            iterEvents[iteration] = {};
          }
          
          if (item.event_type === 'manager_goal_formulated') {
            iterEvents[iteration].start = item.timestamp;
          } else if (item.event_type === 'manager_rejected' || item.event_type === 'manager_accepted') {
            iterEvents[iteration].end = item.timestamp;
          }
        }
        
        // Convert to array of complete iterations
        const iterations: Array<{ iteration: number; startTs: string; endTs: string }> = [];
        for (const [iter, events] of Object.entries(iterEvents)) {
          if (events.start && events.end) {
            iterations.push({
              iteration: parseInt(iter) + 1, // 0-indexed to 1-indexed
              startTs: events.start,
              endTs: events.end,
            });
          }
        }
        
        if (iterations.length > 0) {
          jobIterations.set(jobId, iterations);
        }
      }
    } catch (err) {
      console.warn(`Failed to query iteration timing for job ${jobId}:`, err);
    }
  }
  
  return jobIterations;
}

/**
 * Helper to compute P50/P90/P99/Avg from an array of durations (in ms)
 */
function computeTimingStats(durations: number[]): { p50: number | null; p90: number | null; p99: number | null; avg: number | null; n: number } {
  if (durations.length === 0) {
    return { p50: null, p90: null, p99: null, avg: null, n: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p90Index = Math.floor(sorted.length * 0.9);
  const p99Index = Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1);
  
  return {
    p50: Math.round(sorted[p50Index] / 1000),
    p90: Math.round(sorted[p90Index] / 1000),
    p99: Math.round(sorted[p99Index] / 1000),
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length / 1000),
    n: sorted.length,
  };
}

/**
 * GET /api/v1/dashboard/system
 * Story 5.6: System Performance Dashboard
 * 
 * Focused on timing metrics with breakdowns by vendor, conference, topic, iteration.
 */
export async function getDashboardSystemHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const dateRange = parseDateRange(event);
    const jobs = await scanJobs(dateRange);

    // Filter to finished jobs with timing
    const finishedJobs = jobs.filter(j => getOutcome(j) !== 'in_progress');
    const jobsWithTiming = finishedJobs.filter(j => j.created_at && j.completed_at);
    
    // Calculate overall durations
    const allDurations: number[] = [];
    for (const job of jobsWithTiming) {
      const start = new Date(job.created_at).getTime();
      const end = new Date(job.completed_at).getTime();
      allDurations.push(end - start);
    }

    // Group durations by vendor (worker)
    const durationsByVendor: Record<string, number[]> = { openai: [], anthropic: [] };
    for (const job of jobsWithTiming) {
      const vendor = (job.vendor_assignment?.worker_vendor || 'unknown').toLowerCase();
      const duration = new Date(job.completed_at).getTime() - new Date(job.created_at).getTime();
      if (vendor.includes('openai')) durationsByVendor.openai.push(duration);
      if (vendor.includes('anthropic')) durationsByVendor.anthropic.push(duration);
    }

    // Group durations by conference
    const durationsByConf: Record<string, number[]> = {};
    for (const job of jobsWithTiming) {
      const conf = job.request_context?.conference || 'unknown';
      if (!durationsByConf[conf]) durationsByConf[conf] = [];
      durationsByConf[conf].push(new Date(job.completed_at).getTime() - new Date(job.created_at).getTime());
    }

    // Group durations by topic
    const durationsByTopic: Record<string, number[]> = {};
    for (const job of jobsWithTiming) {
      const topic = job.request_context?.topic || 'unknown';
      if (!durationsByTopic[topic]) durationsByTopic[topic] = [];
      durationsByTopic[topic].push(new Date(job.completed_at).getTime() - new Date(job.created_at).getTime());
    }

    // Get per-iteration timing (how long each iteration takes)
    const finishedJobIds = finishedJobs.map(j => j.job_id);
    const iterationTimingData = await scanIterationTimingEvents(finishedJobIds);
    
    // Calculate duration for each iteration across all jobs
    const durationsByIteration: Record<string, number[]> = {
      '1': [], '2': [], '3': [], '4': [], '5': [],
    };
    
    for (const [_jobId, iterations] of iterationTimingData) {
      for (const iter of iterations) {
        const duration = new Date(iter.endTs).getTime() - new Date(iter.startTs).getTime();
        if (duration > 0 && duration < 10 * 60 * 1000) { // Sanity check: 0-10 minutes
          const key = String(Math.min(iter.iteration, 5));
          if (durationsByIteration[key]) {
            durationsByIteration[key].push(duration);
          }
        }
      }
    }

    // Compute overall stats
    const overallStats = computeTimingStats(allDurations);

    const response = {
      date_range: dateRange,
      timing: {
        sample_size: overallStats.n,
        p50_seconds: overallStats.p50,
        p90_seconds: overallStats.p90,
        p99_seconds: overallStats.p99,
        avg_seconds: overallStats.avg,
      },
      timing_by_vendor: {
        openai: computeTimingStats(durationsByVendor.openai),
        anthropic: computeTimingStats(durationsByVendor.anthropic),
      },
      timing_by_conf: Object.fromEntries(
        Object.entries(durationsByConf)
          .filter(([_, durations]) => durations.length > 0)
          .map(([conf, durations]) => [conf, computeTimingStats(durations)])
      ),
      timing_by_topic: Object.fromEntries(
        Object.entries(durationsByTopic)
          .filter(([_, durations]) => durations.length > 0)
          .map(([topic, durations]) => [topic, computeTimingStats(durations)])
      ),
      timing_by_iteration: Object.fromEntries(
        Object.entries(durationsByIteration)
          .filter(([_, durations]) => durations.length > 0)
          .map(([iter, durations]) => [iter, computeTimingStats(durations)])
      ),
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Dashboard system error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

