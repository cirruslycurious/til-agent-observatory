/**
 * Phase Mapping Utilities
 * Sprint 7: Server-computed phase projection
 * 
 * Maps Step Functions state names to UI-friendly phases.
 */

// Phase enum - reflects actual workflow order
// Goal → Worker → Blind Eval (Nova) → Manager Review → (loop or complete)
export type Phase = 
  | 'goal_formulation'
  | 'worker_execution'
  | 'blind_evaluation'  // Nova evaluator - happens EVERY iteration
  | 'manager_review'
  | 'completed'
  | 'failed';

// Phase labels for UI display
export const PHASE_LABELS: Record<Phase, string> = {
  goal_formulation: 'Goal Formulation',
  worker_execution: 'Drafting & Research',
  blind_evaluation: 'Blind Evaluation',  // Nova - runs every iteration
  manager_review: 'Manager Review',
  completed: 'Completed',
  failed: 'Failed',
};

// Step Functions state → Phase mapping
// Workflow: Goal → Worker → Blind Eval (Nova) → Manager Review → (loop or complete)
const STATE_TO_PHASE: Record<string, Phase> = {
  // State names (PascalCase as used in state machine definition)
  'ManagerGoalFormulation': 'goal_formulation',
  'WorkerExecution': 'worker_execution',
  // Blind evaluator polling states
  'SendEvaluatorRequest': 'blind_evaluation',
  'InitEvaluatorPoll': 'blind_evaluation',
  'WaitForEvaluatorResponse': 'blind_evaluation',
  'CheckEvaluatorResult': 'blind_evaluation',
  'CheckEvaluatorComplete': 'blind_evaluation',
  'ExtractEvaluatorResult': 'blind_evaluation',
  'ContinueWithoutEvaluator': 'blind_evaluation',
  // Manager review (after blind eval)
  'ManagerEvaluation': 'manager_review',
  'CheckIteration': 'manager_review',
  // Terminal states
  'CompleteJob': 'completed',
  'CompleteJobWithCompromises': 'completed',
  'Success': 'completed',
  'Failed': 'failed',
  // Lowercase variants
  'managergoalformulation': 'goal_formulation',
  'workerexecution': 'worker_execution',
  'managerevaluation': 'manager_review',
  'success': 'completed',
  'failed': 'failed',
  // Step Functions execution statuses (returned by DescribeExecution)
  'RUNNING': 'worker_execution', // Default to worker_execution while running
  'SUCCEEDED': 'completed',
  'FAILED': 'failed',
  'TIMED_OUT': 'failed',
  'ABORTED': 'failed',
};

// Job status → Phase mapping (fallback when no Step Functions state)
const STATUS_TO_PHASE: Record<string, Phase> = {
  'queued': 'goal_formulation',
  'running': 'worker_execution',  // Default to worker_execution if no state
  'completed': 'completed',
  'completed_with_compromises': 'completed',
  'failed': 'failed',
};

// Terminal reasons mapping
export type TerminalReason = 
  | 'timeout'
  | 'validation_failed'
  | 'budget_exhausted'
  | 'user_aborted'
  | 'internal_error';

const FAILURE_REASON_TO_TERMINAL: Record<string, TerminalReason> = {
  'timeout': 'timeout',
  'validation_failed': 'validation_failed',
  'budget_exceeded': 'budget_exhausted',
  'internal_error': 'internal_error',
  'no_acceptance_after_5_iterations': 'validation_failed',
  'unknown': 'internal_error',
};

export interface PhaseHistoryEntry {
  phase: Phase;
  label: string;
  started_at: string;
  ended_at?: string;
}

export interface PhaseProjection {
  current_phase: Phase;
  current_phase_label: string;
  phase_started_at: string;
  iteration: number;
  max_iterations: number;
  last_event_at: string | null;
  stepfn_state?: string;
  phase_history: PhaseHistoryEntry[];
  is_terminal: boolean;
  terminal_reason?: TerminalReason;
}

/**
 * Get phase from Step Functions state name
 */
export function getPhaseFromState(stateName: string | undefined): Phase | null {
  if (!stateName) return null;
  return STATE_TO_PHASE[stateName] || STATE_TO_PHASE[stateName.toLowerCase()] || null;
}

/**
 * Get phase from job status (fallback)
 */
export function getPhaseFromStatus(status: string): Phase {
  return STATUS_TO_PHASE[status] || 'worker_execution';
}

/**
 * Check if a phase is terminal
 */
export function isTerminalPhase(phase: Phase): boolean {
  return phase === 'completed' || phase === 'failed';
}

/**
 * Get terminal reason from failure_reason
 */
export function getTerminalReason(failureReason: string | undefined): TerminalReason | undefined {
  if (!failureReason) return undefined;
  return FAILURE_REASON_TO_TERMINAL[failureReason] || 'internal_error';
}

// Phase order for history building (matches actual workflow)
// Goal → Worker → Blind Eval → Manager Review → (loop or complete)
const PHASE_ORDER: Phase[] = [
  'goal_formulation',
  'worker_execution', 
  'blind_evaluation',
  'manager_review',
  'completed',
];

/**
 * Build phase projection from job data and events
 */
export function buildPhaseProjection(
  job: {
    status: string;
    created_at: string;
    completed_at?: string;
    failure_reason?: string;
  },
  lastEventTimestamp: string | null,
  currentIteration: number,
  stepFnState?: string
): PhaseProjection {
  // Determine current phase
  let currentPhase: Phase;
  
  if (stepFnState) {
    currentPhase = getPhaseFromState(stepFnState) || getPhaseFromStatus(job.status);
  } else {
    currentPhase = getPhaseFromStatus(job.status);
  }
  
  const isTerminal = isTerminalPhase(currentPhase);
  const terminalReason = job.failure_reason ? getTerminalReason(job.failure_reason) : undefined;
  
  // Build phase history based on current phase
  // All phases before current are complete
  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase);
  const phaseHistory: PhaseHistoryEntry[] = [];
  
  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const phase = PHASE_ORDER[i];
    
    // Skip 'completed' as a phase entry unless it's the current phase
    if (phase === 'completed' && currentPhase !== 'completed') {
      continue;
    }
    
    // Stop if we've gone past the current phase
    if (i > currentPhaseIndex && currentPhase !== 'failed') {
      break;
    }
    
    // Determine phase status
    const isPast = i < currentPhaseIndex || (currentPhase === 'failed' && i < currentPhaseIndex);
    const isCurrent = i === currentPhaseIndex;
    
    phaseHistory.push({
      phase,
      label: PHASE_LABELS[phase],
      started_at: job.created_at, // Simplified - ideally derived from events
      ended_at: isPast || (isCurrent && isTerminal) 
        ? (job.completed_at || lastEventTimestamp || new Date().toISOString()) 
        : undefined,
    });
  }
  
  // Handle failed state - show which phases completed
  if (currentPhase === 'failed') {
    phaseHistory.push({
      phase: 'failed',
      label: PHASE_LABELS.failed,
      started_at: lastEventTimestamp || job.created_at,
      ended_at: job.completed_at || new Date().toISOString(),
    });
  }
  
  return {
    current_phase: currentPhase,
    current_phase_label: PHASE_LABELS[currentPhase],
    phase_started_at: phaseHistory.length > 0 ? phaseHistory[phaseHistory.length - 1].started_at : job.created_at,
    iteration: currentIteration,
    max_iterations: 5,
    last_event_at: lastEventTimestamp,
    stepfn_state: stepFnState,
    phase_history: phaseHistory,
    is_terminal: isTerminal,
    terminal_reason: isTerminal && currentPhase === 'failed' ? terminalReason : undefined,
  };
}
