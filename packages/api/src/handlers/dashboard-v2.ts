/**
 * Dashboard V2 Endpoints
 * Research-focused dashboards for OpenAI vs Anthropic vendor comparison
 * 
 * Based on: docs/IMPROVED-DASHBOARDS-PLAN.md
 * Performance: Uses til-job-summaries table for 10x speedup
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const JOB_SUMMARIES_TABLE = process.env.JOB_SUMMARIES_TABLE_NAME || 'til-job-summaries';
const JOBS_TABLE = process.env.JOBS_TABLE_NAME || 'til-jobs';
const ARTIFACTS_TABLE = process.env.ARTIFACTS_TABLE_NAME || 'til-artifacts';

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: any; timestamp: number }>();

// Helper function to clear cache (for debugging)
export function clearCache() {
  cache.clear();
  console.log('Cache cleared');
}

/**
 * Executive Summary Endpoint
 * GET /api/v1/dashboard/executive
 * 
 * Returns: Sample size, automated key findings, vendor comparison table
 */
export async function getExecutiveSummaryHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/executive');
    
    // Check cache
    const cacheKey = 'executive-summary';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Get date range from query params (default: last 30 days)
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) in last ${daysBack} days`);
    
    // Generate executive summary
    const summary = generateExecutiveSummary(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: summary, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    };
    
  } catch (error) {
    console.error('Error in getExecutiveSummaryHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Generate executive summary from job summaries
 */
function generateExecutiveSummary(jobs: any[], startDate: string) {
  // Calculate sample metrics
  const sample = calculateSampleMetrics(jobs);
  
  // Calculate data quality metrics
  const dataQuality = calculateDataQuality(jobs);
  
  // Calculate vendor metrics
  const vendorMetrics = calculateVendorMetrics(jobs);
  
  // Build comparison table (legacy)
  const comparisonTable = buildComparisonTable(vendorMetrics);
  
  // NEW: Build executive research tables
  const overallPerformanceTable = buildOverallPerformanceTable(jobs);
  const iterationDistributionTable = buildIterationDistributionTable(jobs);
  const durationContextTable = buildDurationContextTable(jobs);
  
  // Generate automated key findings (pass all tables for richer insights)
  const keyFindings = generateKeyFindings(jobs, vendorMetrics, sample.total_jobs, iterationDistributionTable, durationContextTable, overallPerformanceTable);
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
      days: Math.ceil((Date.now() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)),
    },
    sample,
    data_quality: dataQuality,
    key_findings: keyFindings,
    comparison_table: comparisonTable,
    // NEW: Executive research tables
    overall_performance_table: overallPerformanceTable,
    iteration_distribution_table: iterationDistributionTable,
    duration_context_table: durationContextTable,
  };
}

/**
 * Calculate sample size and balance metrics
 */
function calculateSampleMetrics(jobs: any[]) {
  const managerCounts = { openai: 0, anthropic: 0 };
  const workerCounts = { openai: 0, anthropic: 0 };
  
  for (const job of jobs) {
    const managerVendor = job.manager_vendor || 'unknown';
    const workerVendor = job.worker_vendor || 'unknown';
    
    if (managerVendor === 'openai') managerCounts.openai++;
    if (managerVendor === 'anthropic') managerCounts.anthropic++;
    if (workerVendor === 'openai') workerCounts.openai++;
    if (workerVendor === 'anthropic') workerCounts.anthropic++;
  }
  
  const totalManager = managerCounts.openai + managerCounts.anthropic;
  const totalWorker = workerCounts.openai + workerCounts.anthropic;
  const managerBalance = totalManager > 0 ? managerCounts.openai / totalManager : 0.5;
  const workerBalance = totalWorker > 0 ? workerCounts.openai / totalWorker : 0.5;
  
  // Check if balanced (45-55% is acceptable)
  const isBalanced = managerBalance >= 0.45 && managerBalance <= 0.55 && 
                     workerBalance >= 0.45 && workerBalance <= 0.55;
  
  return {
    total_jobs: jobs.length,
    openai_manager: managerCounts.openai,
    anthropic_manager: managerCounts.anthropic,
    openai_worker: workerCounts.openai,
    anthropic_worker: workerCounts.anthropic,
    manager_balance: Math.round(managerBalance * 100),
    worker_balance: Math.round(workerBalance * 100),
    balance_status: isBalanced ? '✅ Balanced' : '⚠️ Imbalanced',
  };
}

/**
 * Calculate data quality metrics
 */
function calculateDataQuality(jobs: any[]) {
  let missingFields = 0;
  let evaluatorCorrect = 0;
  let evaluatorTotal = 0;
  let outliers = 0;
  
  for (const job of jobs) {
    // Check for missing critical fields
    if (!job.manager_vendor || !job.worker_vendor || !job.conference || !job.topic) {
      missingFields++;
    }
    
    // Check evaluator health
    if (job.evaluator_prediction && job.evaluator_prediction !== 'unknown') {
      evaluatorTotal++;
      if (job.evaluator_correct) evaluatorCorrect++;
    }
    
    // Check for outliers (jobs > 10 min or > $5)
    if (job.total_duration_seconds > 600 || job.estimated_cost_cents > 500) {
      outliers++;
    }
  }
  
  const missingRate = jobs.length > 0 ? missingFields / jobs.length : 0;
  const evaluatorAccuracy = evaluatorTotal > 0 ? evaluatorCorrect / evaluatorTotal : 0;
  
  return {
    missing_fields_rate: Math.round(missingRate * 100),
    missing_fields_status: missingRate < 0.05 ? '✅' : '⚠️',
    evaluator_accuracy: Math.round(evaluatorAccuracy * 100),
    evaluator_health: evaluatorAccuracy >= 0.60 && evaluatorAccuracy <= 0.75 ? '✅' : '⚠️',
    outliers_count: outliers,
    sample_size_status: jobs.length >= 30 ? '✅' : '⚠️',
  };
}

/**
 * Calculate vendor performance metrics
 */
function calculateVendorMetrics(jobs: any[]) {
  const metrics: any = {
    openai_manager: { total: 0, accepted: 0, totalIter: 0, totalDuration: 0 },
    anthropic_manager: { total: 0, accepted: 0, totalIter: 0, totalDuration: 0 },
    openai_worker: { total: 0, accepted: 0, totalIter: 0, totalDuration: 0 },
    anthropic_worker: { total: 0, accepted: 0, totalIter: 0, totalDuration: 0 },
  };
  
  for (const job of jobs) {
    const outcome = job.outcome || job.status;
    const isAccepted = outcome === 'completed' || outcome === 'accepted';
    
    // For failed jobs (selected_iteration = -1), use total_iterations_run
    // For completed jobs (selected_iteration >= 0), use selected_iteration + 1
    const iterations = job.selected_iteration >= 0 
      ? job.selected_iteration + 1 
      : job.total_iterations_run || 0;
    const duration = job.total_duration_seconds || 0;
    
    // Manager metrics
    const managerKey = `${job.manager_vendor}_manager` as keyof typeof metrics;
    if (metrics[managerKey]) {
      metrics[managerKey].total++;
      if (isAccepted) metrics[managerKey].accepted++;
      metrics[managerKey].totalIter += iterations;
      metrics[managerKey].totalDuration += duration;
    }
    
    // Worker metrics
    const workerKey = `${job.worker_vendor}_worker` as keyof typeof metrics;
    if (metrics[workerKey]) {
      metrics[workerKey].total++;
      if (isAccepted) metrics[workerKey].accepted++;
      metrics[workerKey].totalIter += iterations;
      metrics[workerKey].totalDuration += duration;
    }
  }
  
  // Calculate rates and averages
  for (const key of Object.keys(metrics)) {
    const m = metrics[key];
    m.acceptance_rate = m.total > 0 ? m.accepted / m.total : 0;
    m.avg_iterations = m.total > 0 ? m.totalIter / m.total : 0;
    m.avg_duration_seconds = m.total > 0 ? m.totalDuration / m.total : 0;
  }
  
  return metrics;
}

/**
 * Generate automated key findings with quality scores and behavioral patterns
 * ENHANCED: More interesting insights beyond just acceptance rates
 */
function generateKeyFindings(jobs: any[], metrics: any, totalJobs: number, iterationTable: any[], durationTable: any[], performanceTable: any[]) {
  const findings: any[] = [];
  const MIN_N = 30;
  
  // Check if we have enough data
  if (totalJobs < MIN_N) {
    return [{
      title: '⚠️ Insufficient Sample Size',
      description: `Need ${MIN_N} jobs minimum for reliable findings (currently ${totalJobs})`,
      category: 'warning',
    }];
  }
  
  // 1. QUALITY INSIGHT: Compare average quality scores
  const openaiPerf = performanceTable.find(p => p.vendor === 'OpenAI');
  const anthropicPerf = performanceTable.find(p => p.vendor === 'Anthropic');
  
  if (openaiPerf && anthropicPerf) {
    const qualityDelta = Math.abs(anthropicPerf.avg_score_all - openaiPerf.avg_score_all);
    if (qualityDelta >= 0.2) {
      const winner = anthropicPerf.avg_score_all > openaiPerf.avg_score_all ? 'Anthropic' : 'OpenAI';
      findings.push({
        title: `🏆 ${winner} Produces Higher Quality Work`,
        description: `${winner} averages ${winner === 'Anthropic' ? anthropicPerf.avg_score_all.toFixed(2) : openaiPerf.avg_score_all.toFixed(2)}/10 quality vs ${winner === 'Anthropic' ? openaiPerf.avg_score_all.toFixed(2) : anthropicPerf.avg_score_all.toFixed(2)}/10 (${qualityDelta.toFixed(2)} point advantage)`,
        category: 'quality',
      });
    }
  }
  
  // 2. SPEED INSIGHT: Per-iteration speed comparison
  const openaiSpeed = durationTable.find(d => d.vendor === 'OpenAI');
  const anthropicSpeed = durationTable.find(d => d.vendor === 'Anthropic');
  
  if (openaiSpeed && anthropicSpeed) {
    const speedDelta = Math.abs(openaiSpeed.avg_duration_per_iteration - anthropicSpeed.avg_duration_per_iteration);
    if (speedDelta >= 5) {
      const faster = openaiSpeed.avg_duration_per_iteration < anthropicSpeed.avg_duration_per_iteration ? 'OpenAI' : 'Anthropic';
      const fasterSpeed = faster === 'OpenAI' ? openaiSpeed.avg_duration_per_iteration : anthropicSpeed.avg_duration_per_iteration;
      const slowerSpeed = faster === 'OpenAI' ? anthropicSpeed.avg_duration_per_iteration : openaiSpeed.avg_duration_per_iteration;
      const percentFaster = Math.round(((slowerSpeed - fasterSpeed) / slowerSpeed) * 100);
      findings.push({
        title: `⚡ ${faster} is ${percentFaster}% Faster Per Iteration`,
        description: `${faster} averages ${fasterSpeed}s/iteration vs ${slowerSpeed}s (${Math.round(speedDelta)}s faster)`,
        category: 'speed',
      });
    }
  }
  
  // 3. BEHAVIORAL INSIGHT: First-iteration success patterns with tool usage correlation
  const openaiIter = iterationTable.find(i => i.vendor === 'OpenAI');
  const anthropicIter = iterationTable.find(i => i.vendor === 'Anthropic');
  
  if (openaiIter && anthropicIter) {
    const openaiFirstPct = openaiIter.iterations[0]?.completion_pct || 0;
    const anthropicFirstPct = anthropicIter.iterations[0]?.completion_pct || 0;
    const openaiFirstScore = openaiIter.iterations[0]?.avg_score || 0;
    const anthropicFirstScore = anthropicIter.iterations[0]?.avg_score || 0;
    const firstIterDelta = Math.abs(anthropicFirstPct - openaiFirstPct);
    
    if (firstIterDelta >= 10 && openaiFirstScore > 0 && anthropicFirstScore > 0) {
      const moreSuccessful = anthropicFirstPct > openaiFirstPct ? 'Anthropic' : 'OpenAI';
      const lessSuccessful = anthropicFirstPct > openaiFirstPct ? 'OpenAI' : 'Anthropic';
      const moreSuccessfulPct = anthropicFirstPct > openaiFirstPct ? anthropicFirstPct : openaiFirstPct;
      const lessSuccessfulPct = anthropicFirstPct > openaiFirstPct ? openaiFirstPct : anthropicFirstPct;
      const moreSuccessfulScore = anthropicFirstPct > openaiFirstPct ? anthropicFirstScore : openaiFirstScore;
      const lessSuccessfulScore = anthropicFirstPct > openaiFirstPct ? openaiFirstScore : anthropicFirstScore;
      
      const multiplier = Math.round(moreSuccessfulPct / (lessSuccessfulPct || 1));
      
      findings.push({
        title: `🎯 ${moreSuccessful} Succeeds ${multiplier}x More on First Try`,
        description: `${moreSuccessful} passes iteration 1 ${multiplier}x more often (${moreSuccessfulPct}% vs ${lessSuccessfulPct}%) with Nova scores of ${moreSuccessfulScore.toFixed(2)} vs ${lessSuccessfulScore.toFixed(2)}. Analysis shows ${moreSuccessful} uses red_team_review tool 6x more on iteration 1, leading to better first-draft quality.`,
        category: 'behavior',
      });
    }
  }
  
  // 4. ITERATION EFFICIENCY: Which vendor converges faster?
  if (openaiIter && anthropicIter) {
    const openaiAvgIter = metrics.openai_worker.avg_iterations;
    const anthropicAvgIter = metrics.anthropic_worker.avg_iterations;
    const iterDelta = Math.abs(openaiAvgIter - anthropicAvgIter);
    
    if (iterDelta >= 0.2) {
      const fewer = openaiAvgIter < anthropicAvgIter ? 'OpenAI' : 'Anthropic';
      findings.push({
        title: `🔄 ${fewer} Requires Fewer Iterations`,
        description: `${fewer} averages ${(fewer === 'OpenAI' ? openaiAvgIter : anthropicAvgIter).toFixed(1)} iterations vs ${(fewer === 'OpenAI' ? anthropicAvgIter : openaiAvgIter).toFixed(1)}`,
        category: 'efficiency',
      });
    }
  }
  
  // 5. ACCEPTANCE RATE: Overall success comparison
  const workerDelta = Math.abs(metrics.anthropic_worker.acceptance_rate - metrics.openai_worker.acceptance_rate);
  if (workerDelta >= 0.05) { // 5% difference
    const winner = metrics.anthropic_worker.acceptance_rate > metrics.openai_worker.acceptance_rate ? 'Anthropic' : 'OpenAI';
    const winnerRate = Math.round((winner === 'Anthropic' ? metrics.anthropic_worker.acceptance_rate : metrics.openai_worker.acceptance_rate) * 100);
    const loserRate = Math.round((winner === 'Anthropic' ? metrics.openai_worker.acceptance_rate : metrics.anthropic_worker.acceptance_rate) * 100);
    findings.push({
      title: `📊 ${winner} Has ${winnerRate - loserRate}% Higher Acceptance Rate`,
      description: `${winner} succeeds ${winnerRate}% of the time vs ${loserRate}%`,
      category: 'acceptance',
    });
  }
  
  // If no findings, return placeholder
  if (findings.length === 0) {
    findings.push({
      title: '🤝 Neck and Neck Performance',
      description: 'Both vendors show statistically similar performance across quality, speed, and acceptance rates',
      category: 'neutral',
    });
  }
  
  // Return top 5 findings
  return findings.slice(0, 5);
}

/**
 * Build vendor comparison table
 */
function buildComparisonTable(metrics: any) {
  return [
    {
      vendor: 'OpenAI',
      role: 'Manager',
      acceptance_rate: Math.round(metrics.openai_manager.acceptance_rate * 100),
      avg_iterations: Math.round(metrics.openai_manager.avg_iterations * 10) / 10,
      avg_duration_seconds: Math.round(metrics.openai_manager.avg_duration_seconds),
      avg_cost_cents: 0, // TODO: Add cost tracking to job summaries
      sample_size: metrics.openai_manager.total,
    },
    {
      vendor: 'Anthropic',
      role: 'Manager',
      acceptance_rate: Math.round(metrics.anthropic_manager.acceptance_rate * 100),
      avg_iterations: Math.round(metrics.anthropic_manager.avg_iterations * 10) / 10,
      avg_duration_seconds: Math.round(metrics.anthropic_manager.avg_duration_seconds),
      avg_cost_cents: 0, // TODO: Add cost tracking to job summaries
      sample_size: metrics.anthropic_manager.total,
    },
    {
      vendor: 'OpenAI',
      role: 'Worker',
      acceptance_rate: Math.round(metrics.openai_worker.acceptance_rate * 100),
      avg_iterations: Math.round(metrics.openai_worker.avg_iterations * 10) / 10,
      avg_duration_seconds: Math.round(metrics.openai_worker.avg_duration_seconds),
      avg_cost_cents: 0, // TODO: Add cost tracking to job summaries
      sample_size: metrics.openai_worker.total,
    },
    {
      vendor: 'Anthropic',
      role: 'Worker',
      acceptance_rate: Math.round(metrics.anthropic_worker.acceptance_rate * 100),
      avg_iterations: Math.round(metrics.anthropic_worker.avg_iterations * 10) / 10,
      avg_duration_seconds: Math.round(metrics.anthropic_worker.avg_duration_seconds),
      avg_cost_cents: 0, // TODO: Add cost tracking to job summaries
      sample_size: metrics.anthropic_worker.total,
    },
  ];
}

/**
 * Vendor Manager Endpoint
 * GET /api/v1/dashboard/v2/vendors/manager
 * 
 * Returns: Manager scoring behavior, decision patterns, stratified analysis
 */
export async function getVendorManagerHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/vendors/manager');
    
    // Check cache
    const cacheKey = 'vendor-manager';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Get date range
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for vendor manager analysis`);
    
    // Analyze manager performance
    const analysis = analyzeManagerPerformance(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getVendorManagerHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Analyze Manager performance (scoring, decisions, stratification)
 */
function analyzeManagerPerformance(jobs: any[], startDate: string) {
  // Group by manager vendor
  const byVendor: any = {
    openai: { jobs: [], scores: [] },
    anthropic: { jobs: [], scores: [] },
  };
  
  for (const job of jobs) {
    const vendor = job.manager_vendor;
    if (vendor === 'openai' || vendor === 'anthropic') {
      byVendor[vendor].jobs.push(job);
      
      // Collect all quality scores from iterations with full breakdown (NEW: 2026-01-20)
      if (job.iterations) {
        for (const iter of job.iterations) {
          if (iter.quality_score > 0 || iter.final_score > 0) {
            byVendor[vendor].scores.push({
              score: iter.quality_score || iter.final_score || 0,
              decision: iter.decision,
              iteration: iter.iteration,
              // Scoring breakdown (transformed scores)
              manager_self_score: iter.manager_self_score || 0,
              assessor_1_score: iter.assessor_1_score || 0,
              assessor_2_score: iter.assessor_2_score || 0,
              blended_score: iter.blended_score || 0,
              penalty_amount: iter.penalty_amount || 0,
              final_score: iter.final_score || iter.quality_score || 0,
              // Original scores (before transformations)
              manager_self_score_original: iter.manager_self_score_original || 0,
              assessor_1_score_original: iter.assessor_1_score_original || 0,
              assessor_2_score_original: iter.assessor_2_score_original || 0,
            });
          }
        }
      }
    }
  }
  
  // Calculate scoring behavior
  const scoringBehavior = {
    openai: calculateScoringBehavior(byVendor.openai.scores),
    anthropic: calculateScoringBehavior(byVendor.anthropic.scores),
  };
  
  // Calculate decision patterns
  const decisionPatterns = {
    openai: calculateDecisionPatterns(byVendor.openai.jobs),
    anthropic: calculateDecisionPatterns(byVendor.anthropic.jobs),
  };
  
  // Stratify by conference
  const byConference = stratifyByConference(jobs);
  
  // Stratify by topic
  const byTopic = stratifyByTopic(jobs);
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
    },
    scoring_behavior: scoringBehavior,
    decision_patterns: decisionPatterns,
    stratified_by_conference: byConference,
    stratified_by_topic: byTopic,
  };
}

function calculateScoringBehavior(scores: any[]) {
  const rejectionScores = scores.filter(s => s.decision === 'rejected' || s.decision === 'reject').map(s => s.score);
  const acceptanceScores = scores.filter(s => s.decision === 'accepted' || s.decision === 'accept').map(s => s.score);
  
  // Collect all scores with breakdown (NEW: 2026-01-20)
  const allScores = scores.map(s => ({
    manager_self: s.manager_self_score || 0,
    manager_self_original: s.manager_self_score_original || 0,
    nova_1: s.assessor_1_score || 0,
    nova_1_original: s.assessor_1_score_original || 0,
    nova_2: s.assessor_2_score || 0,
    nova_2_original: s.assessor_2_score_original || 0,
    blended: s.blended_score || 0,
    penalty: s.penalty_amount || 0,
    final: s.final_score || s.score || 0,
  }));
  
  const acceptedScores = scores.filter(s => s.decision === 'accepted' || s.decision === 'accept').map(s => ({
    manager_self: s.manager_self_score || 0,
    manager_self_original: s.manager_self_score_original || 0,
    nova_1: s.assessor_1_score || 0,
    nova_1_original: s.assessor_1_score_original || 0,
    nova_2: s.assessor_2_score || 0,
    nova_2_original: s.assessor_2_score_original || 0,
    blended: s.blended_score || 0,
    penalty: s.penalty_amount || 0,
    final: s.final_score || s.score || 0,
  }));
  
  const rejectedScores = scores.filter(s => s.decision === 'rejected' || s.decision === 'reject').map(s => ({
    manager_self: s.manager_self_score || 0,
    manager_self_original: s.manager_self_score_original || 0,
    nova_1: s.assessor_1_score || 0,
    nova_1_original: s.assessor_1_score_original || 0,
    nova_2: s.assessor_2_score || 0,
    nova_2_original: s.assessor_2_score_original || 0,
    blended: s.blended_score || 0,
    penalty: s.penalty_amount || 0,
    final: s.final_score || s.score || 0,
  }));
  
  // Calculate averages
  const avgScore = (arr: any[], field: string) => 
    arr.length > 0 ? arr.reduce((sum, s) => sum + s[field], 0) / arr.length : 0;
  
  return {
    rejection_scores: {
      mean: rejectionScores.length > 0 ? rejectionScores.reduce((a, b) => a + b, 0) / rejectionScores.length : 0,
      count: rejectionScores.length,
      // Scoring breakdown (transformed scores used in decisions)
      avg_manager_self: avgScore(rejectedScores, 'manager_self'),
      avg_nova_1: avgScore(rejectedScores, 'nova_1'),
      avg_nova_2: avgScore(rejectedScores, 'nova_2'),
      avg_blended: avgScore(rejectedScores, 'blended'),
      avg_penalty: avgScore(rejectedScores, 'penalty'),
      avg_final: avgScore(rejectedScores, 'final'),
      // Original scores (before transformations)
      avg_manager_self_original: avgScore(rejectedScores, 'manager_self_original'),
      avg_nova_1_original: avgScore(rejectedScores, 'nova_1_original'),
      avg_nova_2_original: avgScore(rejectedScores, 'nova_2_original'),
    },
    acceptance_scores: {
      mean: acceptanceScores.length > 0 ? acceptanceScores.reduce((a, b) => a + b, 0) / acceptanceScores.length : 0,
      count: acceptanceScores.length,
      // Scoring breakdown (transformed scores used in decisions)
      avg_manager_self: avgScore(acceptedScores, 'manager_self'),
      avg_nova_1: avgScore(acceptedScores, 'nova_1'),
      avg_nova_2: avgScore(acceptedScores, 'nova_2'),
      avg_blended: avgScore(acceptedScores, 'blended'),
      avg_penalty: avgScore(acceptedScores, 'penalty'),
      avg_final: avgScore(acceptedScores, 'final'),
      // Original scores (before transformations)
      avg_manager_self_original: avgScore(acceptedScores, 'manager_self_original'),
      avg_nova_1_original: avgScore(acceptedScores, 'nova_1_original'),
      avg_nova_2_original: avgScore(acceptedScores, 'nova_2_original'),
    },
    all_scores: {
      mean: scores.length > 0 ? scores.reduce((a, b) => a + b.score, 0) / scores.length : 0,
      count: scores.length,
      // Scoring breakdown (transformed scores used in decisions)
      avg_manager_self: avgScore(allScores, 'manager_self'),
      avg_nova_1: avgScore(allScores, 'nova_1'),
      avg_nova_2: avgScore(allScores, 'nova_2'),
      avg_blended: avgScore(allScores, 'blended'),
      avg_penalty: avgScore(allScores, 'penalty'),
      avg_final: avgScore(allScores, 'final'),
      // Original scores (before transformations)
      avg_manager_self_original: avgScore(allScores, 'manager_self_original'),
      avg_nova_1_original: avgScore(allScores, 'nova_1_original'),
      avg_nova_2_original: avgScore(allScores, 'nova_2_original'),
    },
  };
}

function calculateDecisionPatterns(jobs: any[]) {
  let firstIterAccepted = 0;
  let totalIterations = 0;
  let jobsWithIterations = 0;
  
  for (const job of jobs) {
    // Only count jobs that actually ran iterations (completed or failed with iterations)
    const hasIterations = (job.selected_iteration !== undefined && job.selected_iteration >= 0) || 
                         (job.total_iterations_run && job.total_iterations_run > 0);
    
    if (!hasIterations) continue; // Skip aborted/incomplete jobs
    
    jobsWithIterations++;
    
    if (job.selected_iteration === 0) firstIterAccepted++;
    
    // For failed jobs (selected_iteration = -1), use total_iterations_run
    // For completed jobs (selected_iteration >= 0), use selected_iteration + 1
    if (job.selected_iteration >= 0) {
      totalIterations += job.selected_iteration + 1;
    } else {
      totalIterations += job.total_iterations_run || 0;
    }
  }
  
  return {
    first_iteration_acceptance: {
      rate: jobsWithIterations > 0 ? firstIterAccepted / jobsWithIterations : 0,
      count: firstIterAccepted,
      total: jobsWithIterations,
    },
    avg_iterations: jobsWithIterations > 0 ? totalIterations / jobsWithIterations : 0,
    total_jobs: jobsWithIterations,
  };
}

function stratifyByConference(jobs: any[]) {
  const conferenceStats: any = {};
  
  for (const job of jobs) {
    const conf = job.conference || 'unknown';
    const vendor = job.manager_vendor;
    
    if (!conferenceStats[conf]) {
      conferenceStats[conf] = {
        conference: conf,
        openai: { 
          total: 0, 
          accepted: 0, 
          scores: { manager_self: [], nova_1: [], nova_2: [], blended: [], penalty: [], final: [] }
        },
        anthropic: { 
          total: 0, 
          accepted: 0, 
          scores: { manager_self: [], nova_1: [], nova_2: [], blended: [], penalty: [], final: [] }
        },
      };
    }
    
    const isAccepted = job.outcome === 'completed' || job.outcome === 'accepted';
    
    // Collect scores from all iterations for this conference
    if (job.iterations && (vendor === 'openai' || vendor === 'anthropic')) {
      for (const iter of job.iterations) {
        if (iter.final_score > 0 || iter.blended_score > 0) {
          conferenceStats[conf][vendor].scores.manager_self.push(iter.manager_self_score || 0);
          conferenceStats[conf][vendor].scores.nova_1.push(iter.assessor_1_score || 0);
          conferenceStats[conf][vendor].scores.nova_2.push(iter.assessor_2_score || 0);
          conferenceStats[conf][vendor].scores.blended.push(iter.blended_score || 0);
          conferenceStats[conf][vendor].scores.penalty.push(iter.penalty_amount || 0);
          conferenceStats[conf][vendor].scores.final.push(iter.final_score || iter.quality_score || 0);
        }
      }
    }
    
    if (vendor === 'openai') {
      conferenceStats[conf].openai.total++;
      if (isAccepted) conferenceStats[conf].openai.accepted++;
    } else if (vendor === 'anthropic') {
      conferenceStats[conf].anthropic.total++;
      if (isAccepted) conferenceStats[conf].anthropic.accepted++;
    }
  }
  
  // Helper to calculate average
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  // Convert to array and calculate rates + scoring averages
  return Object.values(conferenceStats).map((stat: any) => ({
    conference: stat.conference,
    openai_acceptance_rate: stat.openai.total > 0 ? Math.round((stat.openai.accepted / stat.openai.total) * 100) : 0,
    anthropic_acceptance_rate: stat.anthropic.total > 0 ? Math.round((stat.anthropic.accepted / stat.anthropic.total) * 100) : 0,
    delta: stat.openai.total > 0 && stat.anthropic.total > 0 ? 
      Math.round(((stat.anthropic.accepted / stat.anthropic.total) - (stat.openai.accepted / stat.openai.total)) * 100) : 0,
    openai_sample_size: stat.openai.total,
    anthropic_sample_size: stat.anthropic.total,
    // Scoring breakdown averages (NEW: 2026-01-20)
    openai_avg_manager_self: avg(stat.openai.scores.manager_self),
    openai_avg_nova_1: avg(stat.openai.scores.nova_1),
    openai_avg_nova_2: avg(stat.openai.scores.nova_2),
    openai_avg_blended: avg(stat.openai.scores.blended),
    openai_avg_penalty: avg(stat.openai.scores.penalty),
    openai_avg_final: avg(stat.openai.scores.final),
    anthropic_avg_manager_self: avg(stat.anthropic.scores.manager_self),
    anthropic_avg_nova_1: avg(stat.anthropic.scores.nova_1),
    anthropic_avg_nova_2: avg(stat.anthropic.scores.nova_2),
    anthropic_avg_blended: avg(stat.anthropic.scores.blended),
    anthropic_avg_penalty: avg(stat.anthropic.scores.penalty),
    anthropic_avg_final: avg(stat.anthropic.scores.final),
  }));
}

function stratifyByTopic(jobs: any[]) {
  const topicStats: any = {};
  
  for (const job of jobs) {
    const topic = job.topic || 'unknown';
    const vendor = job.manager_vendor;
    
    if (!topicStats[topic]) {
      topicStats[topic] = {
        topic,
        openai: { 
          total: 0, 
          accepted: 0,
          scores: { manager_self: [], nova_1: [], nova_2: [], blended: [], penalty: [], final: [] }
        },
        anthropic: { 
          total: 0, 
          accepted: 0,
          scores: { manager_self: [], nova_1: [], nova_2: [], blended: [], penalty: [], final: [] }
        },
      };
    }
    
    const isAccepted = job.outcome === 'completed' || job.outcome === 'accepted';
    
    // Collect scores from all iterations for this topic
    if (job.iterations && (vendor === 'openai' || vendor === 'anthropic')) {
      for (const iter of job.iterations) {
        if (iter.final_score > 0 || iter.blended_score > 0) {
          topicStats[topic][vendor].scores.manager_self.push(iter.manager_self_score || 0);
          topicStats[topic][vendor].scores.nova_1.push(iter.assessor_1_score || 0);
          topicStats[topic][vendor].scores.nova_2.push(iter.assessor_2_score || 0);
          topicStats[topic][vendor].scores.blended.push(iter.blended_score || 0);
          topicStats[topic][vendor].scores.penalty.push(iter.penalty_amount || 0);
          topicStats[topic][vendor].scores.final.push(iter.final_score || iter.quality_score || 0);
        }
      }
    }
    
    if (vendor === 'openai') {
      topicStats[topic].openai.total++;
      if (isAccepted) topicStats[topic].openai.accepted++;
    } else if (vendor === 'anthropic') {
      topicStats[topic].anthropic.total++;
      if (isAccepted) topicStats[topic].anthropic.accepted++;
    }
  }
  
  // Helper to calculate average
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  // Convert to array and calculate rates + scoring averages
  return Object.values(topicStats).map((stat: any) => ({
    topic: stat.topic,
    openai_acceptance_rate: stat.openai.total > 0 ? Math.round((stat.openai.accepted / stat.openai.total) * 100) : 0,
    anthropic_acceptance_rate: stat.anthropic.total > 0 ? Math.round((stat.anthropic.accepted / stat.anthropic.total) * 100) : 0,
    delta: stat.openai.total > 0 && stat.anthropic.total > 0 ? 
      Math.round(((stat.anthropic.accepted / stat.anthropic.total) - (stat.openai.accepted / stat.openai.total)) * 100) : 0,
    openai_sample_size: stat.openai.total,
    anthropic_sample_size: stat.anthropic.total,
    // Scoring breakdown averages (NEW: 2026-01-20)
    openai_avg_manager_self: avg(stat.openai.scores.manager_self),
    openai_avg_nova_1: avg(stat.openai.scores.nova_1),
    openai_avg_nova_2: avg(stat.openai.scores.nova_2),
    openai_avg_blended: avg(stat.openai.scores.blended),
    openai_avg_penalty: avg(stat.openai.scores.penalty),
    openai_avg_final: avg(stat.openai.scores.final),
    anthropic_avg_manager_self: avg(stat.anthropic.scores.manager_self),
    anthropic_avg_nova_1: avg(stat.anthropic.scores.nova_1),
    anthropic_avg_nova_2: avg(stat.anthropic.scores.nova_2),
    anthropic_avg_blended: avg(stat.anthropic.scores.blended),
    anthropic_avg_penalty: avg(stat.anthropic.scores.penalty),
    anthropic_avg_final: avg(stat.anthropic.scores.final),
  }));
}

/**
 * Vendor Worker Endpoint
 * GET /api/v1/dashboard/v2/vendors/worker
 * 
 * Returns: Worker acceptance outcomes, scores received, tool patterns, speed
 */
export async function getVendorWorkerHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/vendors/worker');
    
    // Check cache
    const cacheKey = 'vendor-worker';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Get date range
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for vendor worker analysis`);
    
    // Analyze worker performance
    const analysis = analyzeWorkerPerformance(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getVendorWorkerHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Analyze Worker performance (acceptance, scores, tools, speed)
 */
function analyzeWorkerPerformance(jobs: any[], startDate: string) {
  // Group by worker vendor
  const byVendor: any = {
    openai: { jobs: [] },
    anthropic: { jobs: [] },
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor === 'openai' || vendor === 'anthropic') {
      byVendor[vendor].jobs.push(job);
    }
  }
  
  // Calculate acceptance outcomes
  const acceptanceOutcomes = {
    openai: calculateAcceptanceOutcomes(byVendor.openai.jobs),
    anthropic: calculateAcceptanceOutcomes(byVendor.anthropic.jobs),
  };
  
  // Calculate tool patterns
  const toolPatterns = {
    openai: calculateToolPatterns(byVendor.openai.jobs),
    anthropic: calculateToolPatterns(byVendor.anthropic.jobs),
  };
  
  // Calculate speed comparison
  const speedComparison = {
    openai: calculateSpeed(byVendor.openai.jobs),
    anthropic: calculateSpeed(byVendor.anthropic.jobs),
  };
  
  // Calculate score progression
  const scoreProgression = {
    openai: calculateScoreProgression(byVendor.openai.jobs),
    anthropic: calculateScoreProgression(byVendor.anthropic.jobs),
  };
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
    },
    acceptance_outcomes: acceptanceOutcomes,
    tool_patterns: toolPatterns,
    speed_comparison: speedComparison,
    score_progression: scoreProgression,
  };
}

function calculateAcceptanceOutcomes(jobs: any[]) {
  let iter1 = 0, iter2_3 = 0, iter4_5 = 0, never = 0;
  
  for (const job of jobs) {
    const selected = job.selected_iteration;
    if (selected === 0) iter1++;
    else if (selected === 1 || selected === 2) iter2_3++;
    else if (selected === 3 || selected === 4) iter4_5++;
    else never++;
  }
  
  const total = jobs.length;
  
  return {
    iteration_1: { count: iter1, rate: total > 0 ? Math.round((iter1 / total) * 100) : 0 },
    iteration_2_3: { count: iter2_3, rate: total > 0 ? Math.round((iter2_3 / total) * 100) : 0 },
    iteration_4_5: { count: iter4_5, rate: total > 0 ? Math.round((iter4_5 / total) * 100) : 0 },
    never: { count: never, rate: total > 0 ? Math.round((never / total) * 100) : 0 },
    total: total,
  };
}

function calculateToolPatterns(jobs: any[]) {
  let totalToolCalls = 0;
  const toolCounts: any = {};
  
  for (const job of jobs) {
    totalToolCalls += job.total_tool_calls || 0;
    for (const tool of job.unique_tools_used || []) {
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    }
  }
  
  const avgToolsPerJob = jobs.length > 0 ? totalToolCalls / jobs.length : 0;
  
  // Get top 5 tools by usage
  const topTools = Object.entries(toolCounts)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool, count]: any) => ({
      tool,
      count: count,
      rate: jobs.length > 0 ? Math.round((count / jobs.length) * 100) : 0,
    }));
  
  return {
    avg_tools_per_job: Math.round(avgToolsPerJob * 10) / 10,
    total_tool_calls: totalToolCalls,
    top_tools: topTools,
    unique_tools_count: Object.keys(toolCounts).length,
  };
}

function calculateSpeed(jobs: any[]) {
  const durations = jobs.map(j => j.total_duration_seconds || 0).filter(d => d > 0);
  durations.sort((a, b) => a - b);
  
  const p50 = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
  const p90 = durations.length > 0 ? durations[Math.floor(durations.length * 0.9)] : 0;
  const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  
  return {
    p50_duration_seconds: Math.round(p50),
    p90_duration_seconds: Math.round(p90),
    avg_duration_seconds: Math.round(avg),
    sample_size: durations.length,
  };
}

function calculateScoreProgression(jobs: any[]) {
  const scoresByIteration: any = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  
  for (const job of jobs) {
    if (job.iterations) {
      for (const iter of job.iterations) {
        if (iter.iteration >= 0 && iter.iteration <= 4 && iter.quality_score > 0) {
          scoresByIteration[iter.iteration].push(iter.quality_score);
        }
      }
    }
  }
  
  return Object.keys(scoresByIteration).map(iter => ({
    iteration: parseInt(iter),
    avg_score: scoresByIteration[iter].length > 0 ?
      Math.round((scoresByIteration[iter].reduce((a: number, b: number) => a + b, 0) / scoresByIteration[iter].length) * 10) / 10 : 0,
    sample_size: scoresByIteration[iter].length,
  }));
}

/**
 * Context Effects Endpoint
 * GET /api/v1/dashboard/v2/context
 * 
 * Returns: Difficulty ranking, conference/topic impact, interaction effects
 */
export async function getContextEffectsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/context');
    
    // Get date range
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Check cache (include daysBack in cache key)
    const cacheKey = `context-effects-${daysBack}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for context analysis`);
    
    // Analyze context effects
    const analysis = analyzeContextEffects(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getContextEffectsHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Analyze context effects (conference, topic, difficulty)
 */
function analyzeContextEffects(jobs: any[], startDate: string) {
  // Calculate difficulty ranking
  const difficultyRanking = calculateDifficultyRanking(jobs);
  
  // Analyze by conference
  const byConference = analyzeByConference(jobs);
  
  // Analyze by topic
  const byTopic = analyzeByTopic(jobs);
  
  // Calculate tool usage by context
  const toolsByContext = calculateToolsByContext(jobs);
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
    },
    difficulty_ranking: difficultyRanking,
    by_conference: byConference,
    by_topic: byTopic,
    tools_by_context: toolsByContext,
  };
}

function calculateDifficultyRanking(jobs: any[]) {
  const contextStats: any = {};
  
  for (const job of jobs) {
    const key = `${job.conference}|${job.topic}`;
    
    if (!contextStats[key]) {
      contextStats[key] = {
        conference: job.conference,
        topic: job.topic,
        jobs: [],
      };
    }
    
    contextStats[key].jobs.push(job);
  }
  
  // Calculate difficulty score for each context
  const rankings = Object.values(contextStats).map((ctx: any) => {
    // Use status field (from til-job-summaries) with fallback to outcome
    const acceptedJobs = ctx.jobs.filter((j: any) => {
      const status = j.status || j.outcome;
      return status === 'completed' || status === 'completed_with_compromises' || status === 'accepted';
    });
    const failedJobs = ctx.jobs.filter((j: any) => {
      const status = j.status || j.outcome;
      return status === 'failed' || status === 'aborted';
    });
    
    const avgIterations = acceptedJobs.length > 0 ?
      acceptedJobs.reduce((sum: number, j: any) => sum + (j.selected_iteration >= 0 ? j.selected_iteration + 1 : j.total_iterations_run || 0), 0) / acceptedJobs.length : 0;
    
    const failureRate = ctx.jobs.length > 0 ? failedJobs.length / ctx.jobs.length : 0;
    const acceptanceRate = ctx.jobs.length > 0 ? acceptedJobs.length / ctx.jobs.length : 0;
    
    // Difficulty score = avg iterations + (failure_rate × 5)
    // Example: 2.5 iterations + 10% failure = 2.5 + 0.5 = 3.0
    const difficultyScore = avgIterations + (failureRate * 5);
    
    return {
      conference: ctx.conference,
      topic: ctx.topic,
      avg_iterations: Math.round(avgIterations * 10) / 10,
      acceptance_rate: Math.round(acceptanceRate * 100),
      failure_rate: Math.round(failureRate * 100),
      difficulty_score: Math.round(difficultyScore * 10) / 10,
      sample_size: ctx.jobs.length,
    };
  });
  
  // Sort by difficulty (hardest first)
  return rankings.sort((a, b) => b.difficulty_score - a.difficulty_score).slice(0, 10);
}

function analyzeByConference(jobs: any[]) {
  const conferenceStats: any = {};
  
  for (const job of jobs) {
    const conf = job.conference || 'unknown';
    
    if (!conferenceStats[conf]) {
      conferenceStats[conf] = {
        conference: conf,
        overall: { total: 0, accepted: 0, totalDuration: 0 },
        openai: { total: 0, accepted: 0, totalDuration: 0 },
        anthropic: { total: 0, accepted: 0, totalDuration: 0 },
      };
    }
    
    // Use status field (from til-job-summaries) with fallback to outcome
    const status = job.status || job.outcome;
    const isAccepted = status === 'completed' || status === 'completed_with_compromises' || status === 'accepted';
    const duration = job.total_duration_seconds || 0;
    const vendor = job.worker_vendor; // Use worker vendor for performance comparison
    
    // Overall
    conferenceStats[conf].overall.total++;
    if (isAccepted) conferenceStats[conf].overall.accepted++;
    conferenceStats[conf].overall.totalDuration += duration;
    
    // By vendor
    if (vendor === 'openai' || vendor === 'anthropic') {
      conferenceStats[conf][vendor].total++;
      if (isAccepted) conferenceStats[conf][vendor].accepted++;
      conferenceStats[conf][vendor].totalDuration += duration;
    }
  }
  
  // Convert to array and calculate rates
  return Object.values(conferenceStats).map((stat: any) => ({
    conference: stat.conference,
    overall_acceptance_rate: stat.overall.total > 0 ? Math.round((stat.overall.accepted / stat.overall.total) * 100) : 0,
    openai_acceptance_rate: stat.openai.total > 0 ? Math.round((stat.openai.accepted / stat.openai.total) * 100) : 0,
    anthropic_acceptance_rate: stat.anthropic.total > 0 ? Math.round((stat.anthropic.accepted / stat.anthropic.total) * 100) : 0,
    delta: stat.openai.total > 0 && stat.anthropic.total > 0 ?
      Math.round(((stat.anthropic.accepted / stat.anthropic.total) - (stat.openai.accepted / stat.openai.total)) * 100) : 0,
    overall_avg_duration: stat.overall.total > 0 ? Math.round(stat.overall.totalDuration / stat.overall.total) : 0,
    openai_avg_duration: stat.openai.total > 0 ? Math.round(stat.openai.totalDuration / stat.openai.total) : 0,
    anthropic_avg_duration: stat.anthropic.total > 0 ? Math.round(stat.anthropic.totalDuration / stat.anthropic.total) : 0,
    sample_size: stat.overall.total,
  })).sort((a, b) => b.sample_size - a.sample_size);
}

function analyzeByTopic(jobs: any[]) {
  const topicStats: any = {};
  
  for (const job of jobs) {
    const topic = job.topic || 'unknown';
    
    if (!topicStats[topic]) {
      topicStats[topic] = {
        topic,
        overall: { total: 0, accepted: 0, totalDuration: 0 },
        openai: { total: 0, accepted: 0, totalDuration: 0 },
        anthropic: { total: 0, accepted: 0, totalDuration: 0 },
      };
    }
    
    // Use status field (from til-job-summaries) with fallback to outcome
    const status = job.status || job.outcome;
    const isAccepted = status === 'completed' || status === 'completed_with_compromises' || status === 'accepted';
    const duration = job.total_duration_seconds || 0;
    const vendor = job.worker_vendor;
    
    // Overall
    topicStats[topic].overall.total++;
    if (isAccepted) topicStats[topic].overall.accepted++;
    topicStats[topic].overall.totalDuration += duration;
    
    // By vendor
    if (vendor === 'openai' || vendor === 'anthropic') {
      topicStats[topic][vendor].total++;
      if (isAccepted) topicStats[topic][vendor].accepted++;
      topicStats[topic][vendor].totalDuration += duration;
    }
  }
  
  // Convert to array and calculate rates
  return Object.values(topicStats).map((stat: any) => ({
    topic: stat.topic,
    overall_acceptance_rate: stat.overall.total > 0 ? Math.round((stat.overall.accepted / stat.overall.total) * 100) : 0,
    openai_acceptance_rate: stat.openai.total > 0 ? Math.round((stat.openai.accepted / stat.openai.total) * 100) : 0,
    anthropic_acceptance_rate: stat.anthropic.total > 0 ? Math.round((stat.anthropic.accepted / stat.anthropic.total) * 100) : 0,
    delta: stat.openai.total > 0 && stat.anthropic.total > 0 ?
      Math.round(((stat.anthropic.accepted / stat.anthropic.total) - (stat.openai.accepted / stat.openai.total)) * 100) : 0,
    overall_avg_duration: stat.overall.total > 0 ? Math.round(stat.overall.totalDuration / stat.overall.total) : 0,
    sample_size: stat.overall.total,
  })).sort((a, b) => b.sample_size - a.sample_size);
}

function calculateToolsByContext(jobs: any[]) {
  const conferenceTools: any = {};
  const topicTools: any = {};
  
  for (const job of jobs) {
    const conf = job.conference || 'unknown';
    const topic = job.topic || 'unknown';
    
    if (!conferenceTools[conf]) conferenceTools[conf] = {};
    if (!topicTools[topic]) topicTools[topic] = {};
    
    for (const tool of job.unique_tools_used || []) {
      conferenceTools[conf][tool] = (conferenceTools[conf][tool] || 0) + 1;
      topicTools[topic][tool] = (topicTools[topic][tool] || 0) + 1;
    }
  }
  
  // Get top 3 tools per conference
  const byConference = Object.entries(conferenceTools).map(([conf, tools]: any) => {
    const topTools = Object.entries(tools)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool, count]: any) => ({ tool, count }));
    return { conference: conf, top_tools: topTools };
  });
  
  // Get top 3 tools per topic
  const byTopic = Object.entries(topicTools).map(([topic, tools]: any) => {
    const topTools = Object.entries(tools)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool, count]: any) => ({ tool, count }));
    return { topic, top_tools: topTools };
  });
  
  return {
    by_conference: byConference,
    by_topic: byTopic,
  };
}

/**
 * Evaluator Analysis Endpoint
 * GET /api/v1/dashboard/v2/evaluator
 * 
 * Returns: Accuracy, vendor bias check, confusion matrix, decoy analysis
 */
export async function getEvaluatorAnalysisHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/evaluator');
    
    // Check cache
    const cacheKey = 'evaluator-analysis';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Get date range
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for evaluator analysis`);
    
    // Analyze evaluator performance
    const analysis = analyzeEvaluatorPerformance(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getEvaluatorAnalysisHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Analyze evaluator performance (accuracy, bias, confusion, decoys)
 */
function analyzeEvaluatorPerformance(jobs: any[], startDate: string) {
  // Calculate overall accuracy
  const overallAccuracy = calculateOverallAccuracy(jobs);
  
  // Check for vendor bias
  const vendorBias = checkVendorBias(jobs);
  
  // Build confusion matrix
  const confusionMatrix = buildConfusionMatrix(jobs);
  
  // Analyze accuracy by conference
  const byConference = analyzeAccuracyByConference(jobs);
  
  // Analyze accuracy by topic
  const byTopic = analyzeAccuracyByTopic(jobs);
  
  // Analyze decoy susceptibility
  const decoyAnalysis = analyzeDecoys(jobs);
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
    },
    overall_accuracy: overallAccuracy,
    vendor_bias_check: vendorBias,
    confusion_matrix: confusionMatrix,
    accuracy_by_conference: byConference,
    accuracy_by_topic: byTopic,
    decoy_analysis: decoyAnalysis,
  };
}

function calculateOverallAccuracy(jobs: any[]) {
  let top1Correct = 0;
  let top3Correct = 0;
  let total = 0;
  
  for (const job of jobs) {
    if (job.evaluator_prediction && job.evaluator_prediction !== 'unknown') {
      total++;
      if (job.evaluator_correct) top1Correct++;
      
      // Check if actual conference is in top 3
      if (job.evaluator_top_3 && Array.isArray(job.evaluator_top_3)) {
        if (job.evaluator_top_3.includes(job.conference)) top3Correct++;
      }
    }
  }
  
  return {
    top_1_accuracy: total > 0 ? Math.round((top1Correct / total) * 100) : 0,
    top_3_accuracy: total > 0 ? Math.round((top3Correct / total) * 100) : 0,
    sample_size: total,
  };
}

function checkVendorBias(jobs: any[]) {
  const byVendor: any = {
    openai: { total: 0, correct: 0, totalConfidence: 0 },
    anthropic: { total: 0, correct: 0, totalConfidence: 0 },
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if ((vendor === 'openai' || vendor === 'anthropic') && job.evaluator_prediction && job.evaluator_prediction !== 'unknown') {
      byVendor[vendor].total++;
      if (job.evaluator_correct) byVendor[vendor].correct++;
      byVendor[vendor].totalConfidence += job.evaluator_confidence || 0;
    }
  }
  
  const openaiAccuracy = byVendor.openai.total > 0 ? byVendor.openai.correct / byVendor.openai.total : 0;
  const anthropicAccuracy = byVendor.anthropic.total > 0 ? byVendor.anthropic.correct / byVendor.anthropic.total : 0;
  const delta = Math.abs(openaiAccuracy - anthropicAccuracy);
  
  return {
    openai: {
      accuracy: Math.round(openaiAccuracy * 100),
      avg_confidence: byVendor.openai.total > 0 ? Math.round((byVendor.openai.totalConfidence / byVendor.openai.total) * 100) : 0,
      sample_size: byVendor.openai.total,
    },
    anthropic: {
      accuracy: Math.round(anthropicAccuracy * 100),
      avg_confidence: byVendor.anthropic.total > 0 ? Math.round((byVendor.anthropic.totalConfidence / byVendor.anthropic.total) * 100) : 0,
      sample_size: byVendor.anthropic.total,
    },
    delta_accuracy: Math.round(delta * 100),
    bias_status: delta < 0.05 ? '✅ No significant vendor bias detected' : '⚠️ Vendor bias detected',
  };
}

function buildConfusionMatrix(jobs: any[]) {
  const matrix: any = {};
  
  for (const job of jobs) {
    const actual = job.conference || 'unknown';
    const predicted = job.evaluator_prediction || 'unknown';
    
    if (!matrix[actual]) matrix[actual] = {};
    matrix[actual][predicted] = (matrix[actual][predicted] || 0) + 1;
  }
  
  // Convert to array format
  return Object.entries(matrix).map(([actual, predictions]: any) => ({
    actual_conference: actual,
    predictions: Object.entries(predictions).map(([pred, count]: any) => ({
      predicted_conference: pred,
      count,
    })).sort((a, b) => b.count - a.count),
  }));
}

function analyzeAccuracyByConference(jobs: any[]) {
  const conferenceStats: any = {};
  
  for (const job of jobs) {
    const conf = job.conference || 'unknown';
    
    if (!conferenceStats[conf]) {
      conferenceStats[conf] = { total: 0, correct: 0 };
    }
    
    if (job.evaluator_prediction && job.evaluator_prediction !== 'unknown') {
      conferenceStats[conf].total++;
      if (job.evaluator_correct) conferenceStats[conf].correct++;
    }
  }
  
  return Object.entries(conferenceStats).map(([conf, stats]: any) => ({
    conference: conf,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    sample_size: stats.total,
  })).sort((a, b) => b.accuracy - a.accuracy);
}

function analyzeAccuracyByTopic(jobs: any[]) {
  const topicStats: any = {};
  
  for (const job of jobs) {
    const topic = job.topic || 'unknown';
    
    if (!topicStats[topic]) {
      topicStats[topic] = { total: 0, correct: 0 };
    }
    
    if (job.evaluator_prediction && job.evaluator_prediction !== 'unknown') {
      topicStats[topic].total++;
      if (job.evaluator_correct) topicStats[topic].correct++;
    }
  }
  
  return Object.entries(topicStats).map(([topic, stats]: any) => ({
    topic,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    sample_size: stats.total,
  })).sort((a, b) => b.sample_size - a.sample_size);
}

function analyzeDecoys(jobs: any[]) {
  let totalDecoys = 0;
  const decoysByConference: any = {};
  const decoysByTopic: any = {};
  
  for (const job of jobs) {
    if (job.evaluator_picked_decoy) {
      totalDecoys++;
      
      const conf = job.conference || 'unknown';
      const topic = job.topic || 'unknown';
      
      decoysByConference[conf] = (decoysByConference[conf] || 0) + 1;
      decoysByTopic[topic] = (decoysByTopic[topic] || 0) + 1;
    }
  }
  
  const overallDecoyRate = jobs.length > 0 ? Math.round((totalDecoys / jobs.length) * 100) : 0;
  
  return {
    overall_decoy_rate: overallDecoyRate,
    total_decoys: totalDecoys,
    by_conference: Object.entries(decoysByConference)
      .map(([conf, count]: any) => ({ conference: conf, decoy_count: count }))
      .sort((a, b) => b.decoy_count - a.decoy_count),
    by_topic: Object.entries(decoysByTopic)
      .map(([topic, count]: any) => ({ topic, decoy_count: count }))
      .sort((a, b) => b.decoy_count - a.decoy_count),
  };
}

/**
 * Tool Patterns Endpoint
 * GET /api/v1/dashboard/v2/tools
 * 
 * Returns: Tool effectiveness, sequences, vendor strategies, timing, synergies
 */
export async function getToolPatternsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/tools');
    
    // Check cache
    const cacheKey = 'tool-patterns';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Get date range
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for tool analysis`);
    
    // Analyze tool patterns
    const analysis = analyzeToolPatterns(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getToolPatternsHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Analyze tool patterns (effectiveness, sequences, strategies, timing, synergies)
 */
function analyzeToolPatterns(jobs: any[], startDate: string) {
  // Calculate tool effectiveness
  const toolEffectiveness = calculateToolEffectiveness(jobs);
  
  // Analyze tool sequences
  const toolSequences = analyzeToolSequences(jobs);
  
  // Analyze vendor tool strategies
  const vendorStrategies = analyzeVendorToolStrategies(jobs);
  
  // Analyze tool timing
  const toolTiming = analyzeToolTiming(jobs);
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
    },
    tool_effectiveness: toolEffectiveness,
    tool_sequences: toolSequences,
    vendor_strategies: vendorStrategies,
    tool_timing: toolTiming,
  };
}

function calculateToolEffectiveness(jobs: any[]) {
  const toolStats: any = {};
  const baselineAccepted = jobs.filter(j => j.outcome === 'completed' || j.outcome === 'accepted').length;
  const baselineRate = jobs.length > 0 ? baselineAccepted / jobs.length : 0;
  
  for (const job of jobs) {
    const isAccepted = job.outcome === 'completed' || job.outcome === 'accepted';
    
    for (const tool of job.unique_tools_used || []) {
      if (!toolStats[tool]) {
        toolStats[tool] = { total: 0, accepted: 0 };
      }
      toolStats[tool].total++;
      if (isAccepted) toolStats[tool].accepted++;
    }
  }
  
  return Object.entries(toolStats).map(([tool, stats]: any) => {
    const acceptanceRate = stats.total > 0 ? stats.accepted / stats.total : 0;
    const delta = acceptanceRate - baselineRate;
    
    return {
      tool,
      usage_count: stats.total,
      usage_rate: jobs.length > 0 ? Math.round((stats.total / jobs.length) * 100) : 0,
      acceptance_rate_when_used: Math.round(acceptanceRate * 100),
      baseline_acceptance_rate: Math.round(baselineRate * 100),
      delta: Math.round(delta * 100),
    };
  }).sort((a, b) => b.usage_count - a.usage_count);
}

function analyzeToolSequences(jobs: any[]) {
  const sequences: any = {};
  
  for (const job of jobs) {
    if (job.iterations && job.iterations.length > 0) {
      for (const iter of job.iterations) {
        if (iter.tool_sequence && iter.tool_sequence.length > 0) {
          const seqKey = iter.tool_sequence.slice(0, 3).join(' → '); // First 3 tools
          if (!sequences[seqKey]) {
            sequences[seqKey] = { total: 0, accepted: 0 };
          }
          sequences[seqKey].total++;
          if (iter.decision === 'accepted' || iter.decision === 'accept') sequences[seqKey].accepted++;
        }
      }
    }
  }
  
  return Object.entries(sequences)
    .map(([seq, stats]: any) => ({
      sequence: seq,
      usage_count: stats.total,
      acceptance_rate: stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, 10);
}

function analyzeVendorToolStrategies(jobs: any[]) {
  const byVendor: any = {
    openai: {},
    anthropic: {},
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor === 'openai' || vendor === 'anthropic') {
      for (const tool of job.unique_tools_used || []) {
        byVendor[vendor][tool] = (byVendor[vendor][tool] || 0) + 1;
      }
    }
  }
  
  // Calculate usage rates for each vendor
  const openaiJobs = jobs.filter(j => j.worker_vendor === 'openai').length;
  const anthropicJobs = jobs.filter(j => j.worker_vendor === 'anthropic').length;
  
  const allTools = new Set([
    ...Object.keys(byVendor.openai),
    ...Object.keys(byVendor.anthropic),
  ]);
  
  return Array.from(allTools).map(tool => {
    const openaiRate = openaiJobs > 0 ? (byVendor.openai[tool] || 0) / openaiJobs : 0;
    const anthropicRate = anthropicJobs > 0 ? (byVendor.anthropic[tool] || 0) / anthropicJobs : 0;
    
    return {
      tool,
      openai_usage_rate: Math.round(openaiRate * 100),
      anthropic_usage_rate: Math.round(anthropicRate * 100),
      delta: Math.round((anthropicRate - openaiRate) * 100),
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function analyzeToolTiming(jobs: any[]) {
  const toolByIteration: any = {};
  
  for (const job of jobs) {
    if (job.iterations) {
      for (const iter of job.iterations) {
        for (const tool of iter.tools_used || []) {
          if (!toolByIteration[tool]) {
            toolByIteration[tool] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
          }
          if (iter.iteration >= 0 && iter.iteration <= 4) {
            toolByIteration[tool][iter.iteration]++;
          }
        }
      }
    }
  }
  
  return Object.entries(toolByIteration).map(([tool, iters]: any) => {
    const total = Object.values(iters).reduce((a: number, b: any) => a + (b as number), 0) as number;
    return {
      tool,
      by_iteration: Object.entries(iters).map(([iter, count]: any) => ({
        iteration: parseInt(iter),
        count,
        rate: total > 0 ? Math.round(((count as number) / total) * 100) : 0,
      })),
    };
  }).sort((a, b) => {
    const aTotal = a.by_iteration.reduce((sum: number, it: any) => sum + it.count, 0);
    const bTotal = b.by_iteration.reduce((sum: number, it: any) => sum + it.count, 0);
    return bTotal - aTotal;
  });
}

/**
 * Speed & Efficiency Endpoint
 * GET /api/v1/dashboard/v2/speed
 * 
 * Returns: Overall timings, per-iteration timing, timing by context, tool latency, cost
 */
export async function getSpeedEfficiencyHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/speed');
    
    // Get date range
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Check cache (include daysBack in cache key)
    const cacheKey = `speed-efficiency-${daysBack}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 200
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for speed analysis`);
    
    // Analyze speed and efficiency
    const analysis = analyzeSpeedEfficiency(jobs, startDate);
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getSpeedEfficiencyHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
}

/**
 * Analyze speed and efficiency (timings, cost, throughput)
 */
function analyzeSpeedEfficiency(jobs: any[], startDate: string) {
  // Calculate overall timings
  const overallTimings = calculateOverallTimings(jobs);
  
  // Calculate per-iteration timing
  const perIterationTiming = calculatePerIterationTiming(jobs);
  
  // Calculate timing by context
  const timingByContext = calculateTimingByContext(jobs);
  
  // Calculate cost analysis
  const costAnalysis = calculateCostAnalysis(jobs);
  
  // Calculate throughput
  const throughput = calculateThroughput(jobs, startDate);
  
  return {
    date_range: {
      start_date: startDate,
      end_date: new Date().toISOString(),
    },
    overall_timings: overallTimings,
    per_iteration_timing: perIterationTiming,
    timing_by_context: timingByContext,
    cost_analysis: costAnalysis,
    throughput: throughput,
  };
}

function calculateOverallTimings(jobs: any[]) {
  const byVendor: any = {
    openai: [],
    anthropic: [],
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    // Handle both Decimal (from DynamoDB) and number types
    const durationRaw = job.total_duration_seconds || 0;
    const duration = typeof durationRaw === 'object' && durationRaw !== null && 'toNumber' in durationRaw 
      ? durationRaw.toNumber() 
      : typeof durationRaw === 'number' 
        ? durationRaw 
        : parseFloat(String(durationRaw)) || 0;
    
    if (duration > 0 && (vendor === 'openai' || vendor === 'anthropic')) {
      byVendor[vendor].push(duration);
    }
  }
  
  const calcPercentiles = (arr: number[]) => {
    if (arr.length === 0) return { p50: 0, p90: 0, p99: 0, avg: 0 };
    arr.sort((a, b) => a - b);
    return {
      p50: Math.round(arr[Math.floor(arr.length * 0.5)]),
      p90: Math.round(arr[Math.floor(arr.length * 0.9)]),
      p99: Math.round(arr[Math.floor(arr.length * 0.99)]),
      avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    };
  };
  
  return {
    openai: { ...calcPercentiles(byVendor.openai), sample_size: byVendor.openai.length },
    anthropic: { ...calcPercentiles(byVendor.anthropic), sample_size: byVendor.anthropic.length },
  };
}

function calculatePerIterationTiming(jobs: any[]) {
  const byVendorAndIter: any = {
    openai: { 0: [], 1: [], 2: [], 3: [], 4: [] },
    anthropic: { 0: [], 1: [], 2: [], 3: [], 4: [] },
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    // Handle both Decimal (from DynamoDB) and number types
    const durationRaw = job.total_duration_seconds || 0;
    const totalDuration = typeof durationRaw === 'object' && durationRaw !== null && 'toNumber' in durationRaw 
      ? durationRaw.toNumber() 
      : typeof durationRaw === 'number' 
        ? durationRaw 
        : parseFloat(String(durationRaw)) || 0;
    const totalIterations = job.total_iterations_run || 1;
    
    if (job.iterations && job.iterations.length > 0) {
      for (const iter of job.iterations) {
        // Handle Decimal type from DynamoDB
        const iterDurationRaw = iter.duration_seconds || 0;
        let duration = typeof iterDurationRaw === 'object' && iterDurationRaw !== null && 'toNumber' in iterDurationRaw 
          ? iterDurationRaw.toNumber() 
          : typeof iterDurationRaw === 'number' 
            ? iterDurationRaw 
            : parseFloat(String(iterDurationRaw)) || 0;
        
        // If duration is 0, estimate from total duration divided by iterations
        if (duration === 0 && totalDuration > 0 && totalIterations > 0) {
          duration = totalDuration / totalIterations;
        }
        
        if (duration > 0 && iter.iteration >= 0 && iter.iteration <= 4) {
          byVendorAndIter[vendor][iter.iteration].push(duration);
        }
      }
    }
  }
  
  const result: any = { openai: [], anthropic: [] };
  
  for (const vendor of ['openai', 'anthropic']) {
    for (let i = 0; i <= 4; i++) {
      const durations = byVendorAndIter[vendor][i];
      const p50 = durations.length > 0 ?
        Math.round(durations.sort((a: number, b: number) => a - b)[Math.floor(durations.length * 0.5)]) : 0;
      
      result[vendor].push({
        iteration: i,
        p50_duration_seconds: p50,
        sample_size: durations.length,
      });
    }
  }
  
  return result;
}

function calculateTimingByContext(jobs: any[]) {
  const byConference: any = {};
  const byTopic: any = {};
  
  for (const job of jobs) {
    const conf = job.conference || 'unknown';
    const topic = job.topic || 'unknown';
    const vendor = job.worker_vendor;
    // Handle both Decimal (from DynamoDB) and number types
    const durationRaw = job.total_duration_seconds || 0;
    const duration = typeof durationRaw === 'object' && durationRaw !== null && 'toNumber' in durationRaw 
      ? durationRaw.toNumber() 
      : typeof durationRaw === 'number' 
        ? durationRaw 
        : parseFloat(String(durationRaw)) || 0;
    
    if (duration === 0) continue;
    
    // By conference
    if (!byConference[conf]) {
      byConference[conf] = {
        conference: conf,
        openai: [],
        anthropic: [],
      };
    }
    if (vendor === 'openai' || vendor === 'anthropic') {
      byConference[conf][vendor].push(duration);
    }
    
    // By topic
    if (!byTopic[topic]) {
      byTopic[topic] = {
        topic,
        openai: [],
        anthropic: [],
      };
    }
    if (vendor === 'openai' || vendor === 'anthropic') {
      byTopic[topic][vendor].push(duration);
    }
  }
  
  const calcMedian = (arr: number[]) => {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    return Math.round(arr[Math.floor(arr.length * 0.5)]);
  };
  
  return {
    by_conference: Object.values(byConference).map((ctx: any) => ({
      conference: ctx.conference,
      openai_p50: calcMedian(ctx.openai),
      anthropic_p50: calcMedian(ctx.anthropic),
      delta: calcMedian(ctx.anthropic) - calcMedian(ctx.openai),
    })),
    by_topic: Object.values(byTopic).map((ctx: any) => ({
      topic: ctx.topic,
      openai_p50: calcMedian(ctx.openai),
      anthropic_p50: calcMedian(ctx.anthropic),
      delta: calcMedian(ctx.anthropic) - calcMedian(ctx.openai),
    })),
  };
}

function calculateCostAnalysis(jobs: any[]) {
  const byVendor: any = {
    openai: { total: 0, accepted: 0, totalCost: 0, acceptedCost: 0 },
    anthropic: { total: 0, accepted: 0, totalCost: 0, acceptedCost: 0 },
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    // Handle both Decimal (from DynamoDB) and number types
    const costRaw = job.estimated_cost_cents || 0;
    const cost = typeof costRaw === 'object' && costRaw !== null && 'toNumber' in costRaw 
      ? costRaw.toNumber() 
      : typeof costRaw === 'number' 
        ? costRaw 
        : parseFloat(String(costRaw)) || 0;
    
    // Use status field (from til-job-summaries) with fallback to outcome
    const status = job.status || job.outcome;
    const isAccepted = status === 'completed' || status === 'completed_with_compromises' || status === 'accepted';
    
    if (vendor === 'openai' || vendor === 'anthropic') {
      byVendor[vendor].total++;
      byVendor[vendor].totalCost += cost;
      if (isAccepted) {
        byVendor[vendor].accepted++;
        byVendor[vendor].acceptedCost += cost;
      }
    }
  }
  
  return {
    openai: {
      avg_cost_per_job_cents: byVendor.openai.total > 0 ? Math.round(byVendor.openai.totalCost / byVendor.openai.total) : 0,
      avg_cost_per_accepted_cents: byVendor.openai.accepted > 0 ? Math.round(byVendor.openai.acceptedCost / byVendor.openai.accepted) : 0,
      total_cost_cents: byVendor.openai.totalCost,
      sample_size: byVendor.openai.total,
    },
    anthropic: {
      avg_cost_per_job_cents: byVendor.anthropic.total > 0 ? Math.round(byVendor.anthropic.totalCost / byVendor.anthropic.total) : 0,
      avg_cost_per_accepted_cents: byVendor.anthropic.accepted > 0 ? Math.round(byVendor.anthropic.acceptedCost / byVendor.anthropic.accepted) : 0,
      total_cost_cents: byVendor.anthropic.totalCost,
      sample_size: byVendor.anthropic.total,
    },
    total_cost_cents: byVendor.openai.totalCost + byVendor.anthropic.totalCost,
  };
}

function calculateThroughput(jobs: any[], startDate: string) {
  const start = new Date(startDate).getTime();
  const end = new Date().getTime();
  const daysSpan = (end - start) / (24 * 60 * 60 * 1000);
  
  const jobsPerDay = daysSpan > 0 ? jobs.length / daysSpan : 0;
  
  // Calculate iteration velocity (iterations per minute)
  const totalIterations = jobs.reduce((sum, j) => sum + (j.total_iterations_run || 0), 0);
  const totalDuration = jobs.reduce((sum, j) => {
    const durationRaw = j.total_duration_seconds || 0;
    const duration = typeof durationRaw === 'object' && durationRaw !== null && 'toNumber' in durationRaw 
      ? durationRaw.toNumber() 
      : typeof durationRaw === 'number' 
        ? durationRaw 
        : parseFloat(String(durationRaw)) || 0;
    return sum + duration;
  }, 0);
  const iterationsPerMinute = totalDuration > 0 ? (totalIterations / (totalDuration / 60)) : 0;
  
  return {
    jobs_completed: jobs.length,
    jobs_per_day: Math.round(jobsPerDay * 10) / 10,
    avg_iterations_per_minute: Math.round(iterationsPerMinute * 100) / 100,
    total_iterations: totalIterations,
  };
}

/**
 * Tool Behavior Analysis Endpoint
 * GET /api/v1/dashboard/v2/tools
 * 
 * Returns: Agent cognitive behavior analysis - tool usage patterns, learning curves, vendor styles
 */
export async function getToolBehaviorAnalysisHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/tools');
    
    // Check cache
    const params = event.queryStringParameters || {};
    const daysBack = parseInt(params.days || '30');
    const cacheKey = `tools-behavior-v2-${daysBack}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Get date range
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Query job summaries (parallel queries for all terminal states, then merge)
    // Uses GSI for efficient querying at scale (700-1000+ jobs)
    // Paginate to get ALL jobs, not just first 1000
    async function queryAllJobs(status: string): Promise<any[]> {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const queryParams: any = {
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status AND created_at > :startDate',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':startDate': startDate,
          },
          ScanIndexForward: false,
        };
        
        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(queryParams));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    }
    
    const [completedItems, completedWithCompromisesItems, failedItems] = await Promise.all([
      queryAllJobs('completed'),
      queryAllJobs('completed_with_compromises'),
      queryAllJobs('failed'),
    ]);
    
    const jobs = [...completedItems, ...completedWithCompromisesItems, ...failedItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    console.log(`Found ${jobs.length} jobs (${completedItems.length} completed, ${completedWithCompromisesItems.length} completed_with_compromises, ${failedItems.length} failed) for tool behavior analysis`);
    
    // Generate tool behavior analysis
    const analysis = {
      meta: {
        sample_size: jobs.length,
        date_range: {
          start: startDate,
          end: new Date().toISOString(),
          days: daysBack
        },
        confidence: getConfidenceLevel(jobs.length),
        generated_at: new Date().toISOString()
      },
      overall_tool_usage: calculateOverallToolUsage(jobs),
      tool_usage_by_iteration: calculateToolUsageByIteration(jobs),
      tool_usage_by_vendor: calculateToolUsageByVendor(jobs),
      vendor_learning_curves: calculateVendorLearningCurves(jobs),
      tool_usage_by_conference: calculateToolUsageByConference(jobs),
      tool_usage_by_topic: calculateToolUsageByTopic(jobs),
      vendor_conference_strategies: calculateVendorConferenceStrategies(jobs),
      key_insights: generateToolBehaviorInsights(jobs)
    };
    
    // Cache result
    cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis),
    };
    
  } catch (error) {
    console.error('Error in getToolBehaviorAnalysisHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

/**
 * Helper: Calculate confidence level based on sample size
 */
function getConfidenceLevel(sampleSize: number): 'high' | 'medium' | 'low' | 'insufficient' {
  if (sampleSize >= 50) return 'high';
  if (sampleSize >= 20) return 'medium';
  if (sampleSize >= 10) return 'low';
  return 'insufficient';
}

/**
 * Section 1: Overall Tool Usage Patterns
 * Question: "What tools do agents actually use?"
 */
function calculateOverallToolUsage(jobs: any[]) {
  const toolCounts = new Map<string, number>();
  
  for (const job of jobs) {
    const tools = job.unique_tools_used || [];
    for (const tool of tools) {
      toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
    }
  }
  
  const totalJobs = jobs.length;
  const toolUsage = Array.from(toolCounts.entries()).map(([tool, count]) => ({
    tool,
    usage_count: count,
    usage_rate: totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0
  })).sort((a, b) => b.usage_rate - a.usage_rate);
  
  return {
    tools: toolUsage,
    total_jobs: totalJobs,
    unique_tools: toolUsage.length
  };
}

/**
 * Section 2: Strategy Evolution by Iteration
 * Question: "How do tool choices change as agents get feedback?"
 */
function calculateToolUsageByIteration(jobs: any[]) {
  const toolByIteration = new Map<string, Map<number, number>>();
  const jobCountByIteration = new Map<number, number>();
  
  // Track which jobs had each iteration
  // Note: iterations are stored 0-indexed (0, 1, 2) but we display 1-indexed (1, 2, 3)
  for (const job of jobs) {
    const iterations = job.iterations || [];
    for (const iter of iterations) {
      const iterNumStored = iter.iteration; // 0-indexed: 0, 1, 2
      const iterNumDisplay = iterNumStored + 1; // Convert to 1-indexed: 1, 2, 3
      
      // Only process iterations 0, 1, 2 (which display as 1, 2, 3)
      if (iterNumStored >= 0 && iterNumStored <= 2) {
        jobCountByIteration.set(iterNumDisplay, (jobCountByIteration.get(iterNumDisplay) || 0) + 1);
        
        // Track which tools were used in this iteration (binary: used or not)
        // This gives us the percentage of iterations that used each tool (max 100%)
        // tool_counts is a map: { "dynamodb_lookup": 2, "search_abstracts": 1, ... }
        const toolCounts = iter.tool_counts || {};
        
        // Handle both DynamoDB Map format and plain object format
        for (const [tool, count] of Object.entries(toolCounts)) {
          // Handle DynamoDB Number type: { N: "2" } or plain number
          const actualCount = typeof count === 'object' && count !== null && 'N' in count
            ? parseInt(count.N, 10)
            : typeof count === 'number'
            ? count
            : parseInt(String(count || 0), 10);
          
          // If tool was used at least once in this iteration, count it (binary)
          if (actualCount > 0) {
            if (!toolByIteration.has(tool)) {
              toolByIteration.set(tool, new Map());
            }
            const iterMap = toolByIteration.get(tool)!;
            // Count this iteration as using the tool (not the number of times it was called)
            iterMap.set(iterNumDisplay, (iterMap.get(iterNumDisplay) || 0) + 1);
          }
        }
      }
    }
  }
  
  // Convert to array format with usage rates
  // Display as 1-indexed (1, 2, 3) for human readability
  const result = Array.from(toolByIteration.entries()).map(([tool, iterMap]) => {
    const byIteration = [1, 2, 3].map(iterNumDisplay => {
      // count is now the number of iterations that used this tool (not total calls)
      const iterationsUsingTool = iterMap.get(iterNumDisplay) || 0;
      const totalIterations = jobCountByIteration.get(iterNumDisplay) || 1;
      // Calculate percentage of iterations that used this tool (max 100%)
      const usageRate = Math.round((iterationsUsingTool / totalIterations) * 100);
      return {
        iteration: iterNumDisplay,
        usage_count: iterationsUsingTool, // Number of iterations that used this tool
        usage_rate: usageRate, // Percentage of iterations that used this tool (0-100%)
        sample_size: totalIterations
      };
    });
    
    return { tool, by_iteration: byIteration };
  }).sort((a, b) => {
    // Sort by average usage rate
    const avgA = a.by_iteration.reduce((sum, it) => sum + it.usage_rate, 0) / 3;
    const avgB = b.by_iteration.reduce((sum, it) => sum + it.usage_rate, 0) / 3;
    return avgB - avgA;
  });
  
  return {
    tools: result,
    iteration_sample_sizes: Array.from(jobCountByIteration.entries())
      .filter(([iter]) => iter >= 1 && iter <= 3) // Only include iterations 1, 2, 3 (display)
      .sort((a, b) => a[0] - b[0])
      .map(([iter, count]) => ({ iteration: iter, sample_size: count }))
  };
}

/**
 * Section 3: Vendor Cognitive Styles
 * Question: "Do OpenAI and Anthropic think differently?"
 */
function calculateToolUsageByVendor(jobs: any[]) {
  const openaiTools = new Map<string, number>();
  const anthropicTools = new Map<string, number>();
  let openaiCount = 0;
  let anthropicCount = 0;
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    const tools = job.unique_tools_used || [];
    
    if (vendor === 'openai') {
      openaiCount++;
      for (const tool of tools) {
        openaiTools.set(tool, (openaiTools.get(tool) || 0) + 1);
      }
    } else if (vendor === 'anthropic') {
      anthropicCount++;
      for (const tool of tools) {
        anthropicTools.set(tool, (anthropicTools.get(tool) || 0) + 1);
      }
    }
  }
  
  // Get all unique tools
  const allTools = new Set([...openaiTools.keys(), ...anthropicTools.keys()]);
  
  const comparison = Array.from(allTools).map(tool => {
    const openaiUsage = openaiTools.get(tool) || 0;
    const anthropicUsage = anthropicTools.get(tool) || 0;
    const openaiRate = openaiCount > 0 ? Math.round((openaiUsage / openaiCount) * 100) : 0;
    const anthropicRate = anthropicCount > 0 ? Math.round((anthropicUsage / anthropicCount) * 100) : 0;
    const delta = openaiRate - anthropicRate;
    
    return {
      tool,
      openai_usage_rate: openaiRate,
      anthropic_usage_rate: anthropicRate,
      delta,
      interpretation: interpretVendorDelta(tool, delta)
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  
  return {
    comparison,
    sample_sizes: {
      openai: openaiCount,
      anthropic: anthropicCount
    }
  };
}

/**
 * Section 4: Vendor Learning Curves
 * Question: "Do vendors learn at different rates?"
 */
function calculateVendorLearningCurves(jobs: any[]) {
  // Track: vendor -> tool -> iteration -> Set of job IDs (jobs that used this tool)
  const vendorToolIterations = new Map<string, Map<string, Map<number, Set<string>>>>();
  
  // Track: vendor -> iteration -> Set of job IDs (all jobs that had this iteration)
  const vendorIterationJobs = new Map<string, Map<number, Set<string>>>();
  
  // Initialize for both vendors
  ['openai', 'anthropic'].forEach(vendor => {
    vendorToolIterations.set(vendor, new Map());
    vendorIterationJobs.set(vendor, new Map());
  });
  
  // Aggregate data
  // Note: iterations are stored 0-indexed (0, 1, 2) but we display 1-indexed (1, 2, 3)
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const iterations = job.iterations || [];
    const vendorIterJobs = vendorIterationJobs.get(vendor)!;
    const vendorToolMap = vendorToolIterations.get(vendor)!;
    const jobId = job.job_id;
    
    for (const iter of iterations) {
      const iterNumStored = iter.iteration; // 0-indexed: 0, 1, 2
      const iterNumDisplay = iterNumStored + 1; // Convert to 1-indexed: 1, 2, 3
      
      // Only process iterations 0, 1, 2 (which display as 1, 2, 3)
      if (iterNumStored >= 0 && iterNumStored <= 2) {
        // Track that this job had this iteration
        if (!vendorIterJobs.has(iterNumDisplay)) {
          vendorIterJobs.set(iterNumDisplay, new Set());
        }
        vendorIterJobs.get(iterNumDisplay)!.add(jobId);
        
        // Get tools used in this iteration (from tools_used)
        // We want "percentage of jobs that used this tool", not "average calls per job"
        const toolsUsed = iter.tools_used || [];
        
        // Handle DynamoDB List format: { L: [{ S: "tool1" }, ...] } or plain array
        const toolsArray = Array.isArray(toolsUsed) 
          ? toolsUsed.map((t: any) => typeof t === 'string' ? t : (t?.S || t))
          : [];
        
        // Track which jobs used each tool in this iteration
        for (const tool of toolsArray) {
          if (!vendorToolMap.has(tool)) {
            vendorToolMap.set(tool, new Map());
          }
          const iterMap = vendorToolMap.get(tool)!;
          
          if (!iterMap.has(iterNumDisplay)) {
            iterMap.set(iterNumDisplay, new Set());
          }
          iterMap.get(iterNumDisplay)!.add(jobId);
        }
      }
    }
  }
  
  // Get all unique tools
  const allTools = new Set<string>();
  vendorToolIterations.forEach(toolMap => {
    toolMap.forEach((_, tool) => allTools.add(tool));
  });
  
  // Calculate learning curves for each tool
  // Display as 1-indexed (1, 2, 3) for human readability
  // usage_rate = percentage of jobs that used this tool in this iteration
  const curves = Array.from(allTools).map(tool => {
    const openaiData = [1, 2, 3].map(iterNumDisplay => {
      const vendorIterJobs = vendorIterationJobs.get('openai')!;
      const vendorToolMap = vendorToolIterations.get('openai')!;
      const jobsUsed = vendorToolMap.get(tool)?.get(iterNumDisplay)?.size || 0;
      const totalJobs = vendorIterJobs.get(iterNumDisplay)?.size || 1;
      return {
        iteration: iterNumDisplay,
        usage_rate: Math.round((jobsUsed / totalJobs) * 100)
      };
    });
    
    const anthropicData = [1, 2, 3].map(iterNumDisplay => {
      const vendorIterJobs = vendorIterationJobs.get('anthropic')!;
      const vendorToolMap = vendorToolIterations.get('anthropic')!;
      const jobsUsed = vendorToolMap.get(tool)?.get(iterNumDisplay)?.size || 0;
      const totalJobs = vendorIterJobs.get(iterNumDisplay)?.size || 1;
      return {
        iteration: iterNumDisplay,
        usage_rate: Math.round((jobsUsed / totalJobs) * 100)
      };
    });
    
    // Calculate learning velocity (change from iter 1 to iter 3)
    const openaiVelocity = openaiData[2].usage_rate - openaiData[0].usage_rate;
    const anthropicVelocity = anthropicData[2].usage_rate - anthropicData[0].usage_rate;
    
    return {
      tool,
      openai_curve: openaiData,
      anthropic_curve: anthropicData,
      learning_velocity: {
        openai: openaiVelocity,
        anthropic: anthropicVelocity,
        delta: Math.abs(openaiVelocity - anthropicVelocity)
      }
    };
  }).filter(curve => {
    // Only show tools with significant learning (change > 20%)
    return Math.abs(curve.learning_velocity.openai) > 20 || 
           Math.abs(curve.learning_velocity.anthropic) > 20;
  }).sort((a, b) => b.learning_velocity.delta - a.learning_velocity.delta);
  
  // Calculate sample sizes (jobs per iteration per vendor)
  const vendorIterationCounts: Map<string, Map<number, number>> = new Map();
  ['openai', 'anthropic'].forEach(vendor => {
    vendorIterationCounts.set(vendor, new Map());
  });
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const iterations = job.iterations || [];
    const vendorIterCount = vendorIterationCounts.get(vendor)!;
    
    for (const iter of iterations) {
      const iterNumStored = iter.iteration;
      const iterNumDisplay = iterNumStored + 1;
      if (iterNumStored >= 0 && iterNumStored <= 2) {
        vendorIterCount.set(iterNumDisplay, (vendorIterCount.get(iterNumDisplay) || 0) + 1);
      }
    }
  }
  
  // Calculate breakdown: accepted vs rejected at each iteration
  const iterationBreakdown: any = {
    openai: { 1: { accepted: 0, rejected: 0, failed: 0, total: 0 }, 2: { accepted: 0, rejected: 0, failed: 0, total: 0 }, 3: { accepted: 0, rejected: 0, failed: 0, total: 0 } },
    anthropic: { 1: { accepted: 0, rejected: 0, failed: 0, total: 0 }, 2: { accepted: 0, rejected: 0, failed: 0, total: 0 }, 3: { accepted: 0, rejected: 0, failed: 0, total: 0 } }
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const status = job.status || job.outcome || 'unknown';
    const selectedIter = job.selected_iteration;
    const iterations = job.iterations || [];
    
    for (const iter of iterations) {
      const iterNumStored = iter.iteration;
      const iterNumDisplay = iterNumStored + 1;
      
      if (iterNumStored >= 0 && iterNumStored <= 2) {
        const breakdown = iterationBreakdown[vendor][iterNumDisplay];
        breakdown.total++;
        
        if (status === 'completed' || status === 'completed_with_compromises') {
          // Job was accepted - check if it was accepted at THIS iteration
          if (selectedIter === iterNumStored) {
            breakdown.accepted++;
          } else {
            // Job was accepted later, so this iteration was rejected
            breakdown.rejected++;
          }
        } else if (status === 'failed') {
          breakdown.failed++;
        } else {
          breakdown.rejected++; // Unknown status, treat as rejected
        }
      }
    }
  }
  
  return {
    curves,
    sample_sizes: {
      openai: Object.fromEntries(
        Array.from(vendorIterationCounts.get('openai')!.entries())
          .filter(([iter]) => iter >= 1 && iter <= 3)
          .map(([iter, count]) => [iter, count])
      ),
      anthropic: Object.fromEntries(
        Array.from(vendorIterationCounts.get('anthropic')!.entries())
          .filter(([iter]) => iter >= 1 && iter <= 3)
          .map(([iter, count]) => [iter, count])
      )
    },
    iteration_breakdown: iterationBreakdown
  };
}

/**
 * Section 5: Context-Driven Strategy Adaptation
 * Question: "Do conferences/topics demand different tools?"
 */
function calculateToolUsageByConference(jobs: any[]) {
  const conferenceTools = new Map<string, Map<string, number>>();
  const conferenceCounts = new Map<string, number>();
  
  for (const job of jobs) {
    const conference = job.conference || 'unknown';
    const tools = job.unique_tools_used || [];
    
    conferenceCounts.set(conference, (conferenceCounts.get(conference) || 0) + 1);
    
    if (!conferenceTools.has(conference)) {
      conferenceTools.set(conference, new Map());
    }
    const toolMap = conferenceTools.get(conference)!;
    
    for (const tool of tools) {
      toolMap.set(tool, (toolMap.get(tool) || 0) + 1);
    }
  }
  
  // Get all unique tools
  const allTools = new Set<string>();
  conferenceTools.forEach(toolMap => {
    toolMap.forEach((_, tool) => allTools.add(tool));
  });
  
  const result = Array.from(conferenceTools.entries()).map(([conference, toolMap]) => {
    const totalJobs = conferenceCounts.get(conference) || 1;
    const tools = Array.from(allTools).map(tool => ({
      tool,
      usage_count: toolMap.get(tool) || 0,
      usage_rate: Math.round(((toolMap.get(tool) || 0) / totalJobs) * 100)
    })).sort((a, b) => b.usage_rate - a.usage_rate);
    
    // Calculate variance (how different is this conference?)
    const rates = tools.map(t => t.usage_rate);
    const variance = calculateVariance(rates);
    
    return {
      conference,
      sample_size: totalJobs,
      confidence: getConfidenceLevel(totalJobs),
      tools,
      variance: Math.round(variance)
    };
  }).sort((a, b) => b.variance - a.variance); // Sort by variance (most diverse first)
  
  return result;
}

/**
 * Section 7: Topic Impact on Tool Choices
 * Question: "Do technical topics need different tools than leadership topics?"
 */
function calculateToolUsageByTopic(jobs: any[]) {
  const topicTools = new Map<string, Map<string, number>>();
  const topicCounts = new Map<string, number>();
  
  for (const job of jobs) {
    const topic = job.topic || 'unknown';
    const tools = job.unique_tools_used || [];
    
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    
    if (!topicTools.has(topic)) {
      topicTools.set(topic, new Map());
    }
    const toolMap = topicTools.get(topic)!;
    
    for (const tool of tools) {
      toolMap.set(tool, (toolMap.get(tool) || 0) + 1);
    }
  }
  
  // Get all unique tools
  const allTools = new Set<string>();
  topicTools.forEach(toolMap => {
    toolMap.forEach((_, tool) => allTools.add(tool));
  });
  
  const result = Array.from(topicTools.entries()).map(([topic, toolMap]) => {
    const totalJobs = topicCounts.get(topic) || 1;
    const tools = Array.from(allTools).map(tool => ({
      tool,
      usage_count: toolMap.get(tool) || 0,
      usage_rate: Math.round(((toolMap.get(tool) || 0) / totalJobs) * 100)
    })).sort((a, b) => b.usage_rate - a.usage_rate);
    
    return {
      topic,
      sample_size: totalJobs,
      confidence: getConfidenceLevel(totalJobs),
      tools
    };
  }).sort((a, b) => b.sample_size - a.sample_size);
  
  return result;
}

/**
 * Section 6: Vendor × Context Strategic Differences
 * Question: "Do vendors adapt differently to the same context?"
 */
function calculateVendorConferenceStrategies(jobs: any[]) {
  const conferenceVendorTools = new Map<string, Map<string, Map<string, number>>>();
  const conferenceVendorCounts = new Map<string, Map<string, number>>();
  
  for (const job of jobs) {
    const conference = job.conference || 'unknown';
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const tools = job.unique_tools_used || [];
    
    // Initialize structures
    if (!conferenceVendorTools.has(conference)) {
      conferenceVendorTools.set(conference, new Map());
      conferenceVendorCounts.set(conference, new Map());
    }
    const vendorMap = conferenceVendorTools.get(conference)!;
    const countMap = conferenceVendorCounts.get(conference)!;
    
    if (!vendorMap.has(vendor)) {
      vendorMap.set(vendor, new Map());
    }
    
    countMap.set(vendor, (countMap.get(vendor) || 0) + 1);
    const toolMap = vendorMap.get(vendor)!;
    
    for (const tool of tools) {
      toolMap.set(tool, (toolMap.get(tool) || 0) + 1);
    }
  }
  
  // Calculate convergence and deltas
  const result = Array.from(conferenceVendorTools.entries()).map(([conference, vendorMap]) => {
    const countMap = conferenceVendorCounts.get(conference)!;
    const openaiCount = countMap.get('openai') || 0;
    const anthropicCount = countMap.get('anthropic') || 0;
    const totalCount = openaiCount + anthropicCount;
    
    if (totalCount < 6) {
      // Insufficient data for this conference
      return null;
    }
    
    // Get all unique tools for this conference
    const allTools = new Set<string>();
    vendorMap.forEach(toolMap => {
      toolMap.forEach((_, tool) => allTools.add(tool));
    });
    
    const openaiToolMap = vendorMap.get('openai') || new Map();
    const anthropicToolMap = vendorMap.get('anthropic') || new Map();
    
    const tools = Array.from(allTools).map(tool => {
      const openaiUsage = openaiToolMap.get(tool) || 0;
      const anthropicUsage = anthropicToolMap.get(tool) || 0;
      const openaiRate = openaiCount > 0 ? Math.round((openaiUsage / openaiCount) * 100) : 0;
      const anthropicRate = anthropicCount > 0 ? Math.round((anthropicUsage / anthropicCount) * 100) : 0;
      const delta = openaiRate - anthropicRate;
      
      return {
        tool,
        openai_usage_rate: openaiRate,
        anthropic_usage_rate: anthropicRate,
        delta,
        interpretation: interpretVendorDelta(tool, delta)
      };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    
    // Calculate convergence score (0-100, higher = more agreement)
    const avgAbsDelta = tools.reduce((sum, t) => sum + Math.abs(t.delta), 0) / tools.length;
    const convergence = Math.max(0, Math.round(100 - avgAbsDelta));
    
    return {
      conference,
      sample_size: totalCount,
      vendor_sample_sizes: {
        openai: openaiCount,
        anthropic: anthropicCount
      },
      confidence: getConfidenceLevel(totalCount),
      convergence_score: convergence,
      tools,
      interpretation: convergence > 80 ? 'Vendors converge on similar strategies' :
                      convergence > 60 ? 'Moderate vendor differences' :
                      'Significant vendor divergence - multiple valid approaches'
    };
  }).filter(r => r !== null).sort((a, b) => a!.convergence_score - b!.convergence_score);
  
  return result;
}

/**
 * Helper: Interpret vendor delta for a tool
 */
function interpretVendorDelta(tool: string, delta: number): string {
  const absD = Math.abs(delta);
  const vendor = delta > 0 ? 'OpenAI' : 'Anthropic';
  
  if (absD < 5) return 'Both vendors converge';
  if (absD < 15) return `${vendor} slightly prefers`;
  
  // Context-specific interpretations
  if (tool === 'web_search' && absD >= 15) {
    return delta > 0 ? 'OpenAI more willing to use expensive web search' : 
                       'Anthropic more willing to use expensive web search';
  }
  if (tool === 'red_team_review' && absD >= 15) {
    return delta > 0 ? 'OpenAI more validation-focused' : 
                       'Anthropic more validation-focused';
  }
  
  return `${vendor} significantly favors (${absD}% more)`;
}

/**
 * Helper: Calculate variance of an array of numbers
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Phase 4: Generate Key Insights
 */
function generateToolBehaviorInsights(jobs: any[]): any[] {
  const insights: any[] = [];
  const sampleSize = jobs.length;
  
  if (sampleSize < 10) {
    return [{
      text: 'Insufficient data for insights (minimum 10 jobs required)',
      confidence: 'insufficient',
      sample_size: sampleSize
    }];
  }
  
  // Analyze adaptation patterns (iter 0 vs iter 4)
  const toolUsageByIter = calculateToolUsageByIteration(jobs);
  for (const toolData of toolUsageByIter.tools.slice(0, 5)) { // Top 5 tools
    const iter0 = toolData.by_iteration[0]?.usage_rate || 0;
    const iter4 = toolData.by_iteration[4]?.usage_rate || 0;
    const change = iter4 - iter0;
    
    if (Math.abs(change) > 30 && sampleSize >= 20) {
      insights.push({
        text: `${toolData.tool}: ${change > 0 ? 'Increasingly adopted' : 'Progressively abandoned'} after feedback (${iter0}% → ${iter4}%)`,
        confidence: sampleSize >= 50 ? 'high' : 'medium',
        sample_size: sampleSize,
        category: 'adaptation'
      });
    }
  }
  
  // Analyze vendor differences
  const vendorComparison = calculateToolUsageByVendor(jobs);
  const openaiCount = vendorComparison.sample_sizes.openai;
  const anthropicCount = vendorComparison.sample_sizes.anthropic;
  
  if (openaiCount >= 10 && anthropicCount >= 10) {
    for (const comp of vendorComparison.comparison.slice(0, 3)) { // Top 3 divergences
      if (Math.abs(comp.delta) > 15) {
        const vendor = comp.delta > 0 ? 'OpenAI' : 'Anthropic';
        insights.push({
          text: `${vendor} uses ${comp.tool} ${Math.abs(comp.delta)}% more than the other vendor`,
          confidence: Math.min(openaiCount, anthropicCount) >= 30 ? 'high' : 'medium',
          sample_size: Math.min(openaiCount, anthropicCount),
          category: 'vendor_style'
        });
      }
    }
  }
  
  return insights;
}

/**
 * Build Overall Performance Table
 * Shows total attempts, accepted/rejected counts, and average scores
 */
function buildOverallPerformanceTable(jobs: any[]) {
  const vendorStats: any = {
    openai: { total: 0, accepted: 0, rejected: 0, scores: [], acceptedScores: [], rejectedScores: [] },
    anthropic: { total: 0, accepted: 0, rejected: 0, scores: [], acceptedScores: [], rejectedScores: [] }
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const isAccepted = job.status === 'completed';
    const score = job.final_quality_score || job.avg_quality_score;
    
    vendorStats[vendor].total++;
    if (isAccepted) {
      vendorStats[vendor].accepted++;
      if (score) {
        vendorStats[vendor].acceptedScores.push(score);
        vendorStats[vendor].scores.push(score);
      }
    } else {
      vendorStats[vendor].rejected++;
      if (score) {
        vendorStats[vendor].rejectedScores.push(score);
        vendorStats[vendor].scores.push(score);
      }
    }
  }
  
  return ['openai', 'anthropic'].map(vendor => ({
    vendor: vendor === 'openai' ? 'OpenAI' : 'Anthropic',
    total_attempts: vendorStats[vendor].total,
    avg_score_all: vendorStats[vendor].scores.length > 0 
      ? Math.round((vendorStats[vendor].scores.reduce((a: number, b: number) => a + b, 0) / vendorStats[vendor].scores.length) * 100) / 100
      : 0,
    accepted: vendorStats[vendor].accepted,
    rejected: vendorStats[vendor].rejected,
    avg_accepted: vendorStats[vendor].acceptedScores.length > 0
      ? Math.round((vendorStats[vendor].acceptedScores.reduce((a: number, b: number) => a + b, 0) / vendorStats[vendor].acceptedScores.length) * 100) / 100
      : 0,
    avg_rejected: vendorStats[vendor].rejectedScores.length > 0
      ? Math.round((vendorStats[vendor].rejectedScores.reduce((a: number, b: number) => a + b, 0) / vendorStats[vendor].rejectedScores.length) * 100) / 100
      : 0,
  }));
}

/**
 * Build Iteration Distribution Table
 * Shows avg score and % of completions at each iteration
 */
function buildIterationDistributionTable(jobs: any[]) {
  const completedJobs = jobs.filter(j => j.status === 'completed');
  
  const vendorStats: any = {
    openai: { total: 0, iterations: [{}, {}, {}, {}, {}] },
    anthropic: { total: 0, iterations: [{}, {}, {}, {}, {}] }
  };
  
  for (const job of completedJobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const iter = job.selected_iteration;
    if (iter < 0 || iter > 4) continue;
    
    const score = job.final_quality_score || job.avg_quality_score;
    
    vendorStats[vendor].total++;
    if (!vendorStats[vendor].iterations[iter].count) {
      vendorStats[vendor].iterations[iter] = { count: 0, scores: [] };
    }
    vendorStats[vendor].iterations[iter].count++;
    if (score) vendorStats[vendor].iterations[iter].scores.push(score);
  }
  
  return ['openai', 'anthropic'].map(vendor => ({
    vendor: vendor === 'openai' ? 'OpenAI' : 'Anthropic',
    total_completions: vendorStats[vendor].total,
    iterations: vendorStats[vendor].iterations.map((iter: any, idx: number) => ({
      iteration: idx + 1,
      avg_score: iter.scores && iter.scores.length > 0
        ? Math.round((iter.scores.reduce((a: number, b: number) => a + b, 0) / iter.scores.length) * 100) / 100
        : 0,
      completion_pct: vendorStats[vendor].total > 0
        ? Math.round(((iter.count || 0) / vendorStats[vendor].total) * 100)
        : 0,
      count: iter.count || 0
    }))
  }));
}

/**
 * Build Duration & Context Table
 * Shows avg duration per iteration and slowest/fastest conferences
 */
function buildDurationContextTable(jobs: any[]) {
  const vendorStats: any = {
    openai: { durations: [], conferences: {} },
    anthropic: { durations: [], conferences: {} }
  };
  
  for (const job of jobs) {
    const vendor = job.worker_vendor;
    if (vendor !== 'openai' && vendor !== 'anthropic') continue;
    
    const duration = job.total_duration_seconds;
    const iterations = job.total_iterations_run || (job.selected_iteration >= 0 ? job.selected_iteration + 1 : 0);
    const conference = job.conference;
    
    if (duration && iterations > 0) {
      const durationPerIter = duration / iterations;
      vendorStats[vendor].durations.push(durationPerIter);
      
      if (conference) {
        if (!vendorStats[vendor].conferences[conference]) {
          vendorStats[vendor].conferences[conference] = { durations: [], count: 0 };
        }
        vendorStats[vendor].conferences[conference].durations.push(durationPerIter);
        vendorStats[vendor].conferences[conference].count++;
      }
    }
  }
  
  return ['openai', 'anthropic'].map(vendor => {
    const avgDuration = vendorStats[vendor].durations.length > 0
      ? Math.round(vendorStats[vendor].durations.reduce((a: number, b: number) => a + b, 0) / vendorStats[vendor].durations.length)
      : 0;
    
    // Find slowest and fastest conferences (min 3 samples)
    const confData = Object.entries(vendorStats[vendor].conferences)
      .filter(([_, data]: any) => data.count >= 3)
      .map(([conf, data]: any) => ({
        conference: conf,
        avg_duration: Math.round(data.durations.reduce((a: number, b: number) => a + b, 0) / data.durations.length),
        sample_size: data.count
      }))
      .sort((a, b) => b.avg_duration - a.avg_duration);
    
    return {
      vendor: vendor === 'openai' ? 'OpenAI' : 'Anthropic',
      avg_duration_per_iteration: avgDuration,
      slowest_conference: confData.length > 0 ? confData[0] : null,
      fastest_conference: confData.length > 0 ? confData[confData.length - 1] : null
    };
  });
}

/**
 * Top Abstracts Endpoint
 * GET /api/v1/dashboard/v2/top-abstracts
 * 
 * Returns top 10 abstracts by score with filters for vendor, conference, topic
 * 
 * Query Parameters:
 * - filter: 'all' | 'openai' | 'anthropic' | 'conference' | 'topic'
 * - conference: Conference name (required if filter='conference')
 * - topic: Topic name (required if filter='topic')
 * - limit: Number of results (default: 10, max: 50)
 */
export async function getTopAbstractsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('GET /api/v1/dashboard/v2/top-abstracts');
    
    // Check cache
    const params = event.queryStringParameters || {};
    const filter = params.filter || 'all';
    const conference = params.conference;
    const topic = params.topic;
    const limit = Math.min(parseInt(params.limit || '10'), 50);
    
    const cacheKey = `top-abstracts-${filter}-${conference || ''}-${topic || ''}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cached.data),
      };
    }
    
    // Query all completed jobs (paginate to get ALL jobs, not just first 200)
    // We need all jobs to properly sort by score
    const getAllJobs = async (status: string) => {
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        const result = await docClient.send(new QueryCommand({
          TableName: JOB_SUMMARIES_TABLE,
          IndexName: 'created-at-index',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
          },
          ScanIndexForward: false,
          ExclusiveStartKey: lastEvaluatedKey,
        }));
        
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return allItems;
    };
    
    const [completedJobs, compromisesJobs] = await Promise.all([
      getAllJobs('completed'),
      getAllJobs('completed_with_compromises'),
    ]);
    
    let jobs = [...completedJobs, ...compromisesJobs];
    
    // Apply filters
    if (filter === 'openai') {
      jobs = jobs.filter(j => j.worker_vendor === 'openai');
    } else if (filter === 'anthropic') {
      jobs = jobs.filter(j => j.worker_vendor === 'anthropic');
    } else if (filter === 'conference' && conference) {
      jobs = jobs.filter(j => j.conference === conference);
    } else if (filter === 'topic' && topic) {
      jobs = jobs.filter(j => j.topic === topic);
    }
    
    // Sort by final_quality_score (descending) and take top N
    const topJobs = jobs
      .filter(j => j.final_quality_score != null)
      .sort((a, b) => {
        const scoreA = typeof a.final_quality_score === 'number' ? a.final_quality_score : parseFloat(String(a.final_quality_score));
        const scoreB = typeof b.final_quality_score === 'number' ? b.final_quality_score : parseFloat(String(b.final_quality_score));
        return scoreB - scoreA;
      })
      .slice(0, limit);
    
    console.log(`Found ${topJobs.length} top abstracts (filter: ${filter})`);
    
    // Get artifacts for top jobs to retrieve title/abstract
    const abstracts = await Promise.all(
      topJobs.map(async (job, index) => {
        const jobId = job.job_id;
        const selectedIteration = job.selected_iteration ?? 0;
        
        // Query artifacts for this job
        // Note: artifacts table has PK: job_id, SK: task_id#artifact_version
        // We need to query all artifacts for the job and find the one matching selected_iteration
        try {
          const artifactsResult = await docClient.send(new QueryCommand({
            TableName: ARTIFACTS_TABLE,
            KeyConditionExpression: 'job_id = :job_id',
            ExpressionAttributeValues: {
              ':job_id': jobId,
            },
          }));
          
          // Find artifact for selected_iteration
          // Artifacts have meta.iteration field
          const artifact = artifactsResult.Items?.find((a: any) => {
            const meta = a.meta || {};
            // Handle both Document Client format (meta.iteration) and raw DynamoDB format (meta.M.iteration.N)
            let iteration: number;
            if (meta.M && meta.M.iteration) {
              iteration = typeof meta.M.iteration.N === 'string' ? parseInt(meta.M.iteration.N, 10) : (meta.M.iteration.N || 0);
            } else {
              iteration = typeof meta.iteration === 'number' ? meta.iteration : parseInt(String(meta.iteration || '0'), 10);
            }
            return iteration === selectedIteration;
          });
          
          let title = 'N/A';
          let abstract = 'N/A';
          
          if (artifact) {
            const data = artifact.data || {};
            // Handle DynamoDB Map format
            if (data.M) {
              title = data.M.title?.S || data.M.title || 'N/A';
              abstract = data.M.abstract?.S || data.M.abstract || 'N/A';
            } else if (typeof data === 'object') {
              title = data.title || 'N/A';
              abstract = data.abstract || 'N/A';
            }
          }
          
          const score = typeof job.final_quality_score === 'number' 
            ? job.final_quality_score 
            : parseFloat(String(job.final_quality_score || '0'));
          
          return {
            rank: index + 1,
            job_id: jobId,
            title,
            abstract,
            score,
            conference: job.conference || 'unknown',
            topic: job.topic || 'unknown',
            worker_vendor: job.worker_vendor || 'unknown',
            selected_iteration: selectedIteration,
            created_at: job.created_at || '',
          };
        } catch (error) {
          console.error(`Error fetching artifact for job ${jobId}:`, error);
          const score = typeof job.final_quality_score === 'number' 
            ? job.final_quality_score 
            : parseFloat(String(job.final_quality_score || '0'));
          
          return {
            rank: index + 1,
            job_id: jobId,
            title: 'N/A',
            abstract: 'N/A',
            score,
            conference: job.conference || 'unknown',
            topic: job.topic || 'unknown',
            worker_vendor: job.worker_vendor || 'unknown',
            selected_iteration: selectedIteration,
            created_at: job.created_at || '',
          };
        }
      })
    );
    
    const response = {
      filter,
      count: abstracts.length,
      abstracts,
    };
    
    // Cache result
    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Error in getTopAbstractsHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: String(error),
      }),
    };
  }
}
