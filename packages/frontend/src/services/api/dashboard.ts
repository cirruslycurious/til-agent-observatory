/**
 * Dashboard API Service
 * Story 5.1-5.6: Analytics Dashboards
 * 
 * Fetches dashboard data from /api/v1/dashboard/* endpoints.
 */

import { apiClient } from './client';

// ============ Types ============

/** Wilson confidence interval for rate metrics */
export interface RateWithCI {
  rate: number;
  n: number;
  ci_low: number;
  ci_high: number;
  ci_level: number;
}

/** Date range for dashboard queries */
export interface DateRange {
  startDate: string;
  endDate: string;
}

// ============ Overview Types ============

export interface OverviewResponse {
  date_range: DateRange;
  summary: {
    total_jobs: number;
    finished_jobs: number;
    in_progress: number;
    completion_rate: RateWithCI;
  };
  outcomes: {
    accepted: RateWithCI;
    compromised: RateWithCI;
    failed: RateWithCI;
    aborted: RateWithCI;
  };
  iteration_distribution: Record<number, { total: number; openai: number; anthropic: number }>;
  top_combinations: Array<{
    conference: string;
    topic: string;
    count: number;
    avg_iterations: number | null;
    manager_vendors: string;
  }>;
  vendor_summary: {
    openai: {
      as_manager: number;
      as_worker: number;
      acceptance_rate: RateWithCI;
    };
    anthropic: {
      as_manager: number;
      as_worker: number;
      acceptance_rate: RateWithCI;
    };
  };
  cost_summary: {
    estimated_total_usd: string;
    total_tokens: number;
    avg_cost_per_job_usd: string;
  };
  tool_usage: Array<{
    tool_name: string;
    total_calls: number;
    pct_of_iterations: number;
    openai_calls: number;
    anthropic_calls: number;
  }>;
  evaluator_accuracy: {
    total_evaluations: number;
    target_rank_distribution: { rank1: number; rank2: number; rank3: number; notInTop3: number };
    decoy_rank_distribution: { rank1: number; rank2: number; rank3: number; notPicked: number };
  };
  acceptance_by_iteration: {
    openai_total: number;
    anthropic_total: number;
    by_iteration: Record<string, { openai: number; anthropic: number }>;
  };
}

// ============ Vendors Types ============

export interface VendorsResponse {
  date_range: DateRange;
  manager_comparison: {
    openai: {
      acceptance_rate: RateWithCI;
      avg_iterations: number | null;
    };
    anthropic: {
      acceptance_rate: RateWithCI;
      avg_iterations: number | null;
    };
  };
  worker_comparison: {
    openai: {
      acceptance_rate: RateWithCI;
    };
    anthropic: {
      acceptance_rate: RateWithCI;
    };
  };
  cross_role_matrix: Array<{
    combination: string;
    acceptance_rate: RateWithCI;
    compromise_rate: RateWithCI;
    avg_iterations: number | null;
  }>;
  // NEW: Manager scoring analysis
  manager_scoring: {
    openai: {
      rejection_avg: number | null;
      acceptance_avg: number | null;
      n_rejections: number;
      n_acceptances: number;
    };
    anthropic: {
      rejection_avg: number | null;
      acceptance_avg: number | null;
      n_rejections: number;
      n_acceptances: number;
    };
  };
  // NEW: Rejection reasons
  rejection_reasons: Array<{
    message: string;
    count: number;
    openai_count: number;
    anthropic_count: number;
  }>;
  // NEW: Worker tool patterns
  worker_patterns: {
    tool_repeat_rate: { openai: number; anthropic: number };
    multi_search_rate: { openai: number; anthropic: number };
    iterations_analyzed: { openai: number; anthropic: number };
  };
  // NEW: Creativity impact
  creativity_impact: Array<{
    creativity_level: number;
    avg_quality_score: number | null;
    acceptance_rate: number;
    sample_size: number;
  }>;
  _note?: string;
}

// ============ Agentic Types ============

export interface AgenticResponse {
  date_range: DateRange;
  tool_usage: {
    total_calls: number;
    by_tool: Array<{
      tool_name: string;
      action_points: number;
      call_count: number;
      pct_of_total: number;
    }>;
    total_action_points_spent: number;
  };
  tool_by_vendor: {
    openai_worker: Record<string, number>;
    anthropic_worker: Record<string, number>;
  };
  tool_by_iteration?: Record<string, Record<number, number>>;
  iteration_distribution: Record<string, {
    accepted: number;
    compromised: number;
    failed: number;
  }>;
  iteration_stats: {
    total_finished: number;
    avg_iterations: number;
  };
  _note?: string;
}

// ============ Tools Types ============

export interface ToolByIterBreakdown {
  tool: string;
  total: number;
  iter_1: number;
  iter_2: number;
  iter_3: number;
  iter_4: number;
  iter_5: number;
}

export interface ToolsResponse {
  date_range: DateRange;
  tool_metrics: Array<{
    tool_name: string;
    total_calls: number;
    success_rate: RateWithCI;
    avg_duration_ms: number | null;
  }>;
  tool_by_conference: Array<{
    conference: string;
    tools: ToolByIterBreakdown[];
  }>;
  tool_by_topic: Array<{
    topic: string;
    tools: ToolByIterBreakdown[];
  }>;
  web_search_queries: {
    openai: string[];
    anthropic: string[];
  };
  _note?: string;
}

// ============ Evaluator Types ============

export interface EvaluatorResponse {
  date_range: DateRange;
  accuracy: {
    top_1_match_rate: RateWithCI;
    sample_size: number;
  };
  confusion_matrix: Record<string, Record<string, number>>;
  decoy_analysis: {
    decoy_pick_rate: RateWithCI;
    decoys: string[];
    _note: string;
  };
  confidence_stats: {
    mean: number | null;
    min: number | null;
    max: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
  };
}

// ============ System Types ============

interface TimingStats {
  p50: number | null;
  p90: number | null;
  p99: number | null;
  avg: number | null;
  n: number;
}

export interface SystemResponse {
  date_range: DateRange;
  timing: {
    sample_size: number;
    p50_seconds: number | null;
    p90_seconds: number | null;
    p99_seconds: number | null;
    avg_seconds: number | null;
  };
  timing_by_vendor?: {
    openai: TimingStats;
    anthropic: TimingStats;
  };
  timing_by_conf?: Record<string, TimingStats>;
  timing_by_topic?: Record<string, TimingStats>;
  timing_by_iteration?: Record<string, TimingStats>;
}

// ============ Dashboard V2 Types ============
// NEW: Research-focused dashboards with 10x performance improvement
// Uses til-job-summaries table instead of scanning all raw data

export interface DashboardV2ExecutiveResponse {
  date_range: { start_date: string; end_date: string; days: number };
  sample: {
    total_jobs: number;
    openai_manager: number;
    anthropic_manager: number;
    openai_worker: number;
    anthropic_worker: number;
    manager_balance: number;
    worker_balance: number;
    balance_status: string;
  };
  comparison_table: Array<{
    vendor: string;
    role: string;
    acceptance_rate: number;
    avg_iterations: number;
    avg_duration_seconds: number;
    avg_cost_cents: number;
    sample_size: number;
  }>;
  key_findings: Array<{
    title: string;
    description: string;
    category: string;
  }>;
  data_quality: {
    missing_fields_rate: number;
    missing_fields_status: string;
    evaluator_accuracy: number;
    evaluator_health: string;
    outliers_count: number;
    sample_size_status: string;
  };
  // NEW: Executive research tables
  overall_performance_table: Array<{
    vendor: string;
    total_attempts: number;
    avg_score_all: number;
    accepted: number;
    rejected: number;
    avg_accepted: number;
    avg_rejected: number;
  }>;
  iteration_distribution_table: Array<{
    vendor: string;
    total_completions: number;
    iterations: Array<{
      iteration: number;
      avg_score: number;
      completion_pct: number;
      count: number;
    }>;
  }>;
  duration_context_table: Array<{
    vendor: string;
    avg_duration_per_iteration: number;
    slowest_conference: { conference: string; avg_duration: number; sample_size: number } | null;
    fastest_conference: { conference: string; avg_duration: number; sample_size: number } | null;
  }>;
}

export interface DashboardV2VendorManagerResponse {
  date_range: { start_date: string; end_date: string };
  scoring_behavior: {
    openai: {
      rejection_scores: { 
        mean: number; 
        count: number;
        avg_manager_self: number;
        avg_nova_1: number;
        avg_nova_2: number;
        avg_blended: number;
        avg_penalty: number;
        avg_final: number;
        avg_manager_self_original: number;
        avg_nova_1_original: number;
        avg_nova_2_original: number;
      };
      acceptance_scores: { 
        mean: number; 
        count: number;
        avg_manager_self: number;
        avg_nova_1: number;
        avg_nova_2: number;
        avg_blended: number;
        avg_penalty: number;
        avg_final: number;
        avg_manager_self_original: number;
        avg_nova_1_original: number;
        avg_nova_2_original: number;
      };
      all_scores: { 
        mean: number; 
        count: number;
        avg_manager_self: number;
        avg_nova_1: number;
        avg_nova_2: number;
        avg_blended: number;
        avg_penalty: number;
        avg_final: number;
        avg_manager_self_original: number;
        avg_nova_1_original: number;
        avg_nova_2_original: number;
      };
    };
    anthropic: {
      rejection_scores: { 
        mean: number; 
        count: number;
        avg_manager_self: number;
        avg_nova_1: number;
        avg_nova_2: number;
        avg_blended: number;
        avg_penalty: number;
        avg_final: number;
        avg_manager_self_original: number;
        avg_nova_1_original: number;
        avg_nova_2_original: number;
      };
      acceptance_scores: { 
        mean: number; 
        count: number;
        avg_manager_self: number;
        avg_nova_1: number;
        avg_nova_2: number;
        avg_blended: number;
        avg_penalty: number;
        avg_final: number;
        avg_manager_self_original: number;
        avg_nova_1_original: number;
        avg_nova_2_original: number;
      };
      all_scores: { 
        mean: number; 
        count: number;
        avg_manager_self: number;
        avg_nova_1: number;
        avg_nova_2: number;
        avg_blended: number;
        avg_penalty: number;
        avg_final: number;
        avg_manager_self_original: number;
        avg_nova_1_original: number;
        avg_nova_2_original: number;
      };
    };
  };
  decision_patterns: {
    openai: {
      first_iteration_acceptance: { rate: number; count: number; total: number };
      avg_iterations: number;
      total_jobs: number;
    };
    anthropic: {
      first_iteration_acceptance: { rate: number; count: number; total: number };
      avg_iterations: number;
      total_jobs: number;
    };
  };
  stratified_by_conference: Array<{
    conference: string;
    openai_acceptance_rate: number;
    anthropic_acceptance_rate: number;
    delta: number;
    openai_sample_size: number;
    anthropic_sample_size: number;
    openai_avg_manager_self?: number;
    openai_avg_nova_1?: number;
    openai_avg_nova_2?: number;
    openai_avg_blended?: number;
    openai_avg_penalty?: number;
    openai_avg_final?: number;
    anthropic_avg_manager_self?: number;
    anthropic_avg_nova_1?: number;
    anthropic_avg_nova_2?: number;
    anthropic_avg_blended?: number;
    anthropic_avg_penalty?: number;
    anthropic_avg_final?: number;
  }>;
  stratified_by_topic: Array<{
    topic: string;
    openai_acceptance_rate: number;
    anthropic_acceptance_rate: number;
    delta: number;
    openai_sample_size: number;
    anthropic_sample_size: number;
    openai_avg_manager_self?: number;
    openai_avg_nova_1?: number;
    openai_avg_nova_2?: number;
    openai_avg_blended?: number;
    openai_avg_penalty?: number;
    openai_avg_final?: number;
    anthropic_avg_manager_self?: number;
    anthropic_avg_nova_1?: number;
    anthropic_avg_nova_2?: number;
    anthropic_avg_blended?: number;
    anthropic_avg_penalty?: number;
    anthropic_avg_final?: number;
  }>;
}

export interface DashboardV2VendorWorkerResponse {
  date_range: { start_date: string; end_date: string };
  acceptance_outcomes: {
    openai: {
      iteration_1: { count: number; rate: number };
      iteration_2_3: { count: number; rate: number };
      iteration_4_5: { count: number; rate: number };
      never: { count: number; rate: number };
      total: number;
    };
    anthropic: {
      iteration_1: { count: number; rate: number };
      iteration_2_3: { count: number; rate: number };
      iteration_4_5: { count: number; rate: number };
      never: { count: number; rate: number };
      total: number;
    };
  };
  tool_patterns: {
    openai: {
      avg_tools_per_job: number;
      total_tool_calls: number;
      top_tools: Array<{ tool: string; count: number; rate: number }>;
      unique_tools_count: number;
    };
    anthropic: {
      avg_tools_per_job: number;
      total_tool_calls: number;
      top_tools: Array<{ tool: string; count: number; rate: number }>;
      unique_tools_count: number;
    };
  };
  speed_comparison: {
    openai: { p50_duration_seconds: number; p90_duration_seconds: number; avg_duration_seconds: number; sample_size: number };
    anthropic: { p50_duration_seconds: number; p90_duration_seconds: number; avg_duration_seconds: number; sample_size: number };
  };
  score_progression: Array<{
    iteration: number;
    avg_score: number;
    sample_size: number;
  }>;
}

export interface DashboardV2ContextResponse {
  date_range: { start_date: string; end_date: string };
  difficulty_ranking: Array<{
    conference: string;
    topic: string;
    avg_iterations: number;
    acceptance_rate: number;
    failure_rate: number;
    difficulty_score: number;
    sample_size: number;
  }>;
  by_conference: Array<{
    conference: string;
    overall_acceptance_rate: number;
    openai_acceptance_rate: number;
    anthropic_acceptance_rate: number;
    delta: number;
    overall_avg_duration: number;
    openai_avg_duration: number;
    anthropic_avg_duration: number;
    sample_size: number;
  }>;
  by_topic: Array<{
    topic: string;
    overall_acceptance_rate: number;
    openai_acceptance_rate: number;
    anthropic_acceptance_rate: number;
    delta: number;
    overall_avg_duration: number;
    sample_size: number;
  }>;
  tools_by_context: {
    by_conference: Array<{
      conference: string;
      top_tools: Array<{ tool: string; count: number }>;
    }>;
    by_topic: Array<{
      topic: string;
      top_tools: Array<{ tool: string; count: number }>;
    }>;
  };
}

export interface DashboardV2EvaluatorResponse {
  date_range: { start_date: string; end_date: string };
  overall_accuracy: {
    top_1_accuracy: number;
    top_3_accuracy: number;
    sample_size: number;
  };
  vendor_bias_check: {
    openai: { accuracy: number; avg_confidence: number; sample_size: number };
    anthropic: { accuracy: number; avg_confidence: number; sample_size: number };
    delta_accuracy: number;
    bias_status: string;
  };
  confusion_matrix: Array<{
    actual_conference: string;
    predictions: Array<{ predicted_conference: string; count: number }>;
  }>;
  accuracy_by_conference: Array<{
    conference: string;
    accuracy: number;
    sample_size: number;
  }>;
  accuracy_by_topic: Array<{
    topic: string;
    accuracy: number;
    sample_size: number;
  }>;
  decoy_analysis: {
    overall_decoy_rate: number;
    total_decoys: number;
    by_conference: Array<{ conference: string; decoy_count: number }>;
    by_topic: Array<{ topic: string; decoy_count: number }>;
  };
}

export interface DashboardV2ToolsResponse {
  date_range: { start_date: string; end_date: string };
  tool_effectiveness: Array<{
    tool: string;
    usage_count: number;
    usage_rate: number;
    acceptance_rate_when_used: number;
    baseline_acceptance_rate: number;
    delta: number;
  }>;
  tool_sequences: Array<{
    sequence: string;
    usage_count: number;
    acceptance_rate: number;
  }>;
  vendor_strategies: Array<{
    tool: string;
    openai_usage_rate: number;
    anthropic_usage_rate: number;
    delta: number;
  }>;
  tool_timing: Array<{
    tool: string;
    by_iteration: Array<{
      iteration: number;
      count: number;
      rate: number;
    }>;
  }>;
}

export interface DashboardV2SpeedResponse {
  date_range: { start_date: string; end_date: string };
  overall_timings: {
    openai: { p50: number; p90: number; p99: number; avg: number; sample_size: number };
    anthropic: { p50: number; p90: number; p99: number; avg: number; sample_size: number };
  };
  per_iteration_timing: {
    openai: Array<{ iteration: number; p50_duration_seconds: number; sample_size: number }>;
    anthropic: Array<{ iteration: number; p50_duration_seconds: number; sample_size: number }>;
  };
  timing_by_context: {
    by_conference: Array<{
      conference: string;
      openai_p50: number;
      anthropic_p50: number;
      delta: number;
    }>;
    by_topic: Array<{
      topic: string;
      openai_p50: number;
      anthropic_p50: number;
      delta: number;
    }>;
  };
  cost_analysis: {
    openai: {
      avg_cost_per_job_cents: number;
      avg_cost_per_accepted_cents: number;
      total_cost_cents: number;
      sample_size: number;
    };
    anthropic: {
      avg_cost_per_job_cents: number;
      avg_cost_per_accepted_cents: number;
      total_cost_cents: number;
      sample_size: number;
    };
    total_cost_cents: number;
  };
  throughput: {
    jobs_completed: number;
    jobs_per_day: number;
    avg_iterations_per_minute: number;
    total_iterations: number;
  };
}

// ============ Tool Behavior Analysis Types (NEW) ============

export interface DashboardV2ToolBehaviorResponse {
  meta: {
    sample_size: number;
    date_range: {
      start: string;
      end: string;
      days: number;
    };
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    generated_at: string;
  };
  overall_tool_usage: {
    tools: Array<{
      tool: string;
      usage_count: number;
      usage_rate: number;
    }>;
    total_jobs: number;
    unique_tools: number;
  };
  tool_usage_by_iteration: {
    tools: Array<{
      tool: string;
      by_iteration: Array<{
        iteration: number;
        usage_count: number;
        usage_rate: number;
        sample_size: number;
      }>;
    }>;
    iteration_sample_sizes: Array<{
      iteration: number;
      sample_size: number;
    }>;
  };
  tool_usage_by_vendor: {
    comparison: Array<{
      tool: string;
      openai_usage_rate: number;
      anthropic_usage_rate: number;
      delta: number;
      interpretation: string;
    }>;
    sample_sizes: {
      openai: number;
      anthropic: number;
    };
  };
  vendor_learning_curves: {
    curves: Array<{
      tool: string;
      openai_curve: Array<{
        iteration: number;
        usage_rate: number;
      }>;
      anthropic_curve: Array<{
        iteration: number;
        usage_rate: number;
      }>;
      learning_velocity: {
        openai: number;
        anthropic: number;
        delta: number;
      };
    }>;
    sample_sizes: {
      openai: Record<string, number>;
      anthropic: Record<string, number>;
    };
    iteration_breakdown?: {
      openai: Record<number, { accepted: number; rejected: number; failed: number; total: number }>;
      anthropic: Record<number, { accepted: number; rejected: number; failed: number; total: number }>;
    };
  };
  tool_usage_by_conference: Array<{
    conference: string;
    sample_size: number;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    tools: Array<{
      tool: string;
      usage_count: number;
      usage_rate: number;
    }>;
    variance: number;
  }>;
  tool_usage_by_topic: Array<{
    topic: string;
    sample_size: number;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    tools: Array<{
      tool: string;
      usage_count: number;
      usage_rate: number;
    }>;
  }>;
  vendor_conference_strategies: Array<{
    conference: string;
    sample_size: number;
    vendor_sample_sizes: {
      openai: number;
      anthropic: number;
    };
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    convergence_score: number | null;
    tools: Array<{
      tool: string;
      openai_usage_rate: number;
      anthropic_usage_rate: number;
      delta: number;
      interpretation: string;
    }>;
    interpretation: string;
  }>;
  key_insights: Array<{
    text: string;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    sample_size: number;
    category: string;
  }>;
}

// ============ Top Abstracts Types ============

export interface TopAbstractsResponse {
  filter: string;
  count: number;
  abstracts: Array<{
    rank: number;
    job_id: string;
    title: string;
    abstract: string;
    score: number;
    conference: string;
    topic: string;
    worker_vendor: string;
    selected_iteration: number;
    created_at: string;
  }>;
}

// ============ Service ============

class DashboardService {
  private basePath = '/api/v1/dashboard';

  private buildUrl(endpoint: string, startDate?: string, endDate?: string, days?: number): string {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (days) params.append('days', days.toString());
    const queryString = params.toString();
    return queryString 
      ? `${this.basePath}/${endpoint}?${queryString}` 
      : `${this.basePath}/${endpoint}`;
  }

  // ============ V1 Endpoints (Legacy) ============

  async getOverview(startDate?: string, endDate?: string): Promise<OverviewResponse> {
    return apiClient.get<OverviewResponse>(this.buildUrl('overview', startDate, endDate));
  }

  async getVendors(startDate?: string, endDate?: string): Promise<VendorsResponse> {
    return apiClient.get<VendorsResponse>(this.buildUrl('vendors', startDate, endDate));
  }

  async getAgentic(startDate?: string, endDate?: string): Promise<AgenticResponse> {
    return apiClient.get<AgenticResponse>(this.buildUrl('agentic', startDate, endDate));
  }

  async getTools(startDate?: string, endDate?: string): Promise<ToolsResponse> {
    return apiClient.get<ToolsResponse>(this.buildUrl('tools', startDate, endDate));
  }

  async getEvaluator(startDate?: string, endDate?: string): Promise<EvaluatorResponse> {
    return apiClient.get<EvaluatorResponse>(this.buildUrl('evaluator', startDate, endDate));
  }

  async getSystem(startDate?: string, endDate?: string): Promise<SystemResponse> {
    return apiClient.get<SystemResponse>(this.buildUrl('system', startDate, endDate));
  }

  // ============ V2 Endpoints (NEW - 10x Faster) ============
  // Uses til-job-summaries table for pre-aggregated data

  /**
   * Executive Summary Dashboard
   * GET /api/v1/dashboard/v2/executive
   * Automated key findings, data quality, vendor comparison
   */
  async getV2Executive(days: number = 30): Promise<DashboardV2ExecutiveResponse> {
    return apiClient.get<DashboardV2ExecutiveResponse>(
      this.buildUrl('v2/executive', undefined, undefined, days)
    );
  }

  /**
   * Vendor Manager Deep Dive
   * GET /api/v1/dashboard/v2/vendors/manager
   * Scoring behavior, decision patterns, stratified by conference/topic
   */
  async getV2VendorManager(days: number = 30): Promise<DashboardV2VendorManagerResponse> {
    return apiClient.get<DashboardV2VendorManagerResponse>(
      this.buildUrl('v2/vendors/manager', undefined, undefined, days)
    );
  }

  /**
   * Vendor Worker Deep Dive
   * GET /api/v1/dashboard/v2/vendors/worker
   * Acceptance by iteration, tool patterns, speed, score progression
   */
  async getV2VendorWorker(days: number = 30): Promise<DashboardV2VendorWorkerResponse> {
    return apiClient.get<DashboardV2VendorWorkerResponse>(
      this.buildUrl('v2/vendors/worker', undefined, undefined, days)
    );
  }

  /**
   * Context Effects Dashboard
   * GET /api/v1/dashboard/v2/context
   * Difficulty ranking, conference/topic impact, tool usage by context
   */
  async getV2Context(days: number = 30): Promise<DashboardV2ContextResponse> {
    return apiClient.get<DashboardV2ContextResponse>(
      this.buildUrl('v2/context', undefined, undefined, days)
    );
  }

  /**
   * Evaluator Analysis Dashboard
   * GET /api/v1/dashboard/v2/evaluator
   * Accuracy, vendor bias check, confusion matrix, decoy analysis
   */
  async getV2Evaluator(days: number = 30): Promise<DashboardV2EvaluatorResponse> {
    return apiClient.get<DashboardV2EvaluatorResponse>(
      this.buildUrl('v2/evaluator', undefined, undefined, days)
    );
  }

  /**
   * Tool Patterns Dashboard
   * GET /api/v1/dashboard/v2/tools
   * Tool effectiveness, sequences, vendor strategies, timing
   */
  async getV2Tools(days: number = 30): Promise<DashboardV2ToolsResponse> {
    return apiClient.get<DashboardV2ToolsResponse>(
      this.buildUrl('v2/tools', undefined, undefined, days)
    );
  }

  /**
   * Speed & Efficiency Dashboard
   * GET /api/v1/dashboard/v2/speed
   * Overall timings, per-iteration timing, cost analysis, throughput
   */
  async getV2Speed(days: number = 30): Promise<DashboardV2SpeedResponse> {
    return apiClient.get<DashboardV2SpeedResponse>(
      this.buildUrl('v2/speed', undefined, undefined, days)
    );
  }

  /**
   * Tool Behavior Analysis Dashboard (NEW)
   * GET /api/v1/dashboard/v2/tools/behavior
   * Agent cognitive behavior patterns, learning curves, vendor styles, context adaptation
   */
  async getV2ToolBehavior(days: number = 30): Promise<DashboardV2ToolBehaviorResponse> {
    return apiClient.get<DashboardV2ToolBehaviorResponse>(
      this.buildUrl('v2/tools/behavior', undefined, undefined, days)
    );
  }

  /**
   * Top Abstracts
   * GET /api/v1/dashboard/v2/top-abstracts
   * 
   * Returns top 10 abstracts by score with optional filters
   */
  async getTopAbstracts(params: {
    filter?: 'all' | 'openai' | 'anthropic' | 'conference' | 'topic';
    conference?: string;
    topic?: string;
    limit?: number;
  }): Promise<TopAbstractsResponse> {
    const queryParams = new URLSearchParams();
    if (params.filter) queryParams.set('filter', params.filter);
    if (params.conference) queryParams.set('conference', params.conference);
    if (params.topic) queryParams.set('topic', params.topic);
    if (params.limit) queryParams.set('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    const url = queryString 
      ? `${this.basePath}/v2/top-abstracts?${queryString}` 
      : `${this.basePath}/v2/top-abstracts`;
    
    return apiClient.get<TopAbstractsResponse>(url);
  }
}

export const dashboardService = new DashboardService();
