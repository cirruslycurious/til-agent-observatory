/**
 * Workflow API Service
 * Sprint 7: Generation Flow UI
 * 
 * Handles job status, events, result, and feedback API calls.
 */

import { apiClient } from './client';

// Phase types (matching backend phase-mapping.ts)
// Workflow: Goal → Worker → Blind Eval (Nova) → Manager Review → (loop or complete)
export type Phase = 
  | 'goal_formulation'
  | 'worker_execution'
  | 'blind_evaluation'  // Nova evaluator - runs every iteration before Manager Review
  | 'manager_review'
  | 'completed'
  | 'failed';

export type TerminalReason = 
  | 'timeout'
  | 'validation_failed'
  | 'budget_exhausted'
  | 'user_aborted'
  | 'internal_error';

// Phase history entry
export interface PhaseHistoryEntry {
  phase: Phase;
  label: string;
  started_at: string;
  ended_at?: string;
}

// Job status response (enhanced with phase projection)
export interface JobStatusResponse {
  status: string;
  created_at: string;
  completed_at?: string;
  error_code?: string;
  
  // Request context
  conference: string;
  topic: string;
  
  // Phase projection
  current_phase: Phase;
  current_phase_label: string;
  phase_started_at: string;
  iteration: number;
  max_iterations: number;
  last_event_at: string | null;
  phase_history: PhaseHistoryEntry[];
  is_terminal: boolean;
  terminal_reason?: TerminalReason;
  stepfn_state?: string;
  
  // Final output (for completed jobs)
  final_title?: string;
  final_abstract?: string;
  selected_iteration?: number;
  evaluator_prediction?: string;
  evaluator_confidence?: number;
  evaluator_agreement?: boolean;
}

// UI Event Type (matching backend event-normalization.ts)
export type UIEventType =
  | 'goal_set'
  | 'plan_created'
  | 'tool_call'
  | 'artifact_created'
  | 'iteration_submitted'
  | 'manager_decision'
  | 'budget_update'
  | 'system_notice'
  | 'error';

export type Actor = 'manager' | 'worker' | 'evaluator' | 'system';

// Normalized event payload
export interface NormalizedEventPayload {
  tool?: {
    name: string;
    status: 'success' | 'failed' | 'timeout';
    duration_ms?: number;
    result_summary?: string;
    reasoning?: string;
  };
  artifact?: {
    artifact_id: string;
    artifact_type?: string;
    title?: string;
  };
  decision?: {
    accepted: boolean;
    feedback_summary?: string;
    reasoning?: string;
    // Scoring breakdown (added 2026-01-20)
    manager_self_score?: number;
    manager_self_score_original?: number;
    assessor_1_score?: number;
    assessor_1_score_original?: number;
    assessor_2_score?: number;
    assessor_2_score_original?: number;
    blended_score?: number;
    penalty_amount?: number;
    penalties?: string[];
    final_score?: number;
    threshold?: number;
    // Evaluator predictions for penalty transparency
    evaluator_prediction?: string;
    evaluator_confidence?: number;
    evaluator_top_3?: string[];
  };
  budget?: {
    cost_usd?: number;
    action_points_remaining?: number;
  };
  reasoning?: string;
  submission?: {
    title: string;
    abstract_preview?: string;
    confidence?: number;
  };
  evaluator?: {
    predicted_conference: string;
    confidence?: number;
    matches_target?: boolean;
  };
}

// Normalized event
export interface NormalizedEvent {
  event_id: string;
  timestamp: string;
  iteration: number;
  actor: Actor;
  actor_label: string;
  event_type: UIEventType;
  raw_event_type?: string;
  summary: string;
  payload?: NormalizedEventPayload;
}

// Events response
export interface EventsResponse {
  events: NormalizedEvent[];
  next_cursor: string | null;
  server_event_count: number;
  truncated: boolean;
}

// Iteration submission (for result page)
export interface IterationSubmission {
  iteration: number;
  title: string;
  abstract: string;
  manager_feedback: string | null;
  accepted: boolean;
}

// Detailed iteration submission (from decision events)
export interface DetailedIterationSubmission {
  iteration: number;
  title: string;
  abstract: string;
  confidence?: number;
  tools_used?: string[];
  decision: 'accept' | 'reject' | 'pending';
  // Full manager scoring
  quality_score?: number;
  strengths?: string[];
  weaknesses?: string[];
  reasoning?: string;
  feedback?: string;
  creativity?: number;
  goal?: string;
}

// Iterations response
export interface IterationsResponse {
  job_id: string;
  iterations: DetailedIterationSubmission[];
  selected_iteration?: number;
  final_title?: string;
  final_abstract?: string;
}

// Provenance
export interface Provenance {
  artifacts_used: Array<{ artifact_id: string; purpose: string }>;
  sources: Array<{ kind: 'conference_rules' | 'web' | 'internal'; ref: string; note?: string }>;
}

// Result response
export interface ResultResponse {
  job_id: string;
  status: string;
  conference: string;
  topic: string;
  
  // Final output
  final_title: string | null;
  final_abstract: string | null;
  selected_iteration: number | null;
  
  // Iteration history
  iterations: IterationSubmission[];
  
  // Evaluator
  evaluator: {
    predicted_conference: string;
    confidence: number | null;
    matches_target: boolean;
  } | null;
  
  // Summary stats
  summary: {
    total_iterations: number;
    duration_seconds: number;
    total_tool_calls: number;
    estimated_cost_usd: string;
  };
  
  // Provenance
  provenance?: Provenance;
}

// Feedback request/response
export interface FeedbackRequest {
  rating: 1 | -1;
  comment?: string;
}

export interface FeedbackResponse {
  feedback_id: string;
  message: string;
}

class WorkflowService {
  /**
   * Get job status with phase projection
   */
  async getStatus(jobId: string, token: string): Promise<JobStatusResponse> {
    return apiClient.get<JobStatusResponse>(`/api/v1/jobs/${jobId}/status?token=${encodeURIComponent(token)}`);
  }
  
  /**
   * Get events with normalization
   */
  async getEvents(jobId: string, token: string, limit?: number): Promise<EventsResponse> {
    let url = `/api/v1/workflow/${jobId}/events?token=${encodeURIComponent(token)}`;
    if (limit) {
      url += `&limit=${limit}`;
    }
    return apiClient.get<EventsResponse>(url);
  }
  
  /**
   * Get complete result for results page
   */
  async getResult(jobId: string, token: string): Promise<ResultResponse> {
    return apiClient.get<ResultResponse>(`/api/v1/jobs/${jobId}/result?token=${encodeURIComponent(token)}`);
  }
  
  /**
   * Submit feedback
   */
  async submitFeedback(jobId: string, token: string, feedback: FeedbackRequest): Promise<FeedbackResponse> {
    return apiClient.post<FeedbackResponse>(
      `/api/v1/jobs/${jobId}/feedback?token=${encodeURIComponent(token)}`,
      feedback
    );
  }
  
  /**
   * Get iteration submissions (title/abstract history)
   */
  async getIterations(jobId: string, token: string): Promise<IterationsResponse> {
    return apiClient.get<IterationsResponse>(`/api/v1/workflow/${jobId}/iterations?token=${encodeURIComponent(token)}`);
  }
}

export const workflowService = new WorkflowService();
