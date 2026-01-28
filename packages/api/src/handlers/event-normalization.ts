/**
 * Event Normalization Utilities
 * Sprint 7: Server-side event payload normalization
 * 
 * Transforms raw decision events into UI-friendly format with stable types.
 */

// UI-facing event type enum (9 stable values)
export type UIEventType =
  | 'goal_set'           // Manager sets research goal
  | 'plan_created'       // Worker creates execution plan
  | 'tool_call'          // Any tool invocation
  | 'artifact_created'   // Artifact written to storage
  | 'iteration_submitted'// Worker submits abstract for review
  | 'manager_decision'   // Manager accepts/rejects iteration
  | 'budget_update'      // Cost or search budget change
  | 'system_notice'      // System-level info (started, config)
  | 'error';             // Any error event

// Actor enum
export type Actor = 'manager' | 'worker' | 'evaluator' | 'system';

// Actor display labels
export const ACTOR_LABELS: Record<Actor, string> = {
  manager: 'Manager',
  worker: 'Worker',
  evaluator: 'Evaluator',
  system: 'System',
};

// Raw event type → UI event type mapping
const EVENT_TYPE_MAPPING: Record<string, UIEventType> = {
  // Goal-related
  'manager_goal_formulated': 'goal_set',
  'manager_goal_sanitized': 'goal_set',
  
  // Tool calls
  'tool_called': 'tool_call',
  'tool_result': 'tool_call',
  
  // Artifacts
  'artifact_created': 'artifact_created',
  'artifact_consumed': 'artifact_created', // Show consumption as related to artifact
  
  // Worker submissions
  'abstract_submitted': 'iteration_submitted',
  'iteration_completed': 'iteration_submitted',
  
  // Manager decisions
  'manager_accepted': 'manager_decision',
  'manager_rejected': 'manager_decision',
  'manager_selected_best_iteration': 'manager_decision',
  
  // Budget/cost
  'cost_event': 'budget_update',
  'cost_guardrail_triggered': 'budget_update',
  
  // Evaluator
  'evaluator_assessed': 'manager_decision', // Final assessment
  'evaluator_timeout': 'error',
  
  // Planning/reasoning
  'planning_step': 'plan_created',
  
  // System
  'agentic_loop_started': 'system_notice',
  'sub_worker_spawned': 'system_notice',
  
  // Errors
  'timeout_occurred': 'error',
  'artifact_circular_dependency_detected': 'error',
};

// Normalized event payload structure
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

/**
 * Map raw event type to UI event type
 */
export function mapEventType(rawEventType: string): UIEventType {
  return EVENT_TYPE_MAPPING[rawEventType] || 'system_notice';
}

/**
 * Normalize actor string
 */
export function normalizeActor(actor: string): Actor {
  const normalized = actor.toLowerCase() as Actor;
  if (['manager', 'worker', 'evaluator', 'system'].includes(normalized)) {
    return normalized;
  }
  return 'system';
}

/**
 * Generate human-readable summary for an event
 */
export function generateSummary(event: any): string {
  // Use existing summary if present and non-empty
  if (event.summary && event.summary.trim()) {
    return event.summary;
  }
  
  const eventType = event.event_type;
  const actor = event.actor || 'system';
  const details = event.details || {};
  
  switch (eventType) {
    case 'manager_goal_formulated':
    case 'manager_goal_sanitized':
      return 'Research goal established';
      
    case 'tool_called': {
      const toolName = details.tool_name || details.name || 'tool';
      const reasoning = details.reasoning;
      // Show the LLM's reasoning if available, otherwise just the tool name
      if (reasoning && reasoning.length > 10) {
        return `${toolName}: ${reasoning.substring(0, 120)}${reasoning.length > 120 ? '...' : ''}`;
      }
      return `Calling ${toolName}`;
    }
    
    case 'tool_result': {
      const toolName = details.tool_name || 'tool';
      const success = details.success !== false;
      return `${toolName}: ${success ? 'completed' : 'failed'}`;
    }
      
    case 'artifact_created':
      const artifactType = details.artifact_type || 'artifact';
      return `Created ${artifactType}`;
      
    case 'abstract_submitted': {
      const title = details.title || '';
      return title ? `Submitted: "${title.substring(0, 80)}${title.length > 80 ? '...' : ''}"` : 'Submitted abstract for review';
    }
      
    case 'iteration_completed':
      const iteration = event.iteration || 0;
      return `Completed iteration ${iteration + 1}`;
      
    case 'manager_accepted':
      return 'Abstract accepted';
      
    case 'manager_rejected': {
      const feedback = details.feedback_summary || details.rationale || '';
      const creativity = details.creativity || 0;
      const nextCreativity = Math.min(creativity + 0.1, 0.7);
      const tempNote = creativity > 0 ? ` (temperature: ${creativity.toFixed(1)} → ${nextCreativity.toFixed(1)})` : '';
      return feedback ? `Rejected: ${feedback.substring(0, 80)}${tempNote}` : `Abstract rejected for revision${tempNote}`;
    }
      
    case 'manager_selected_best_iteration':
      const selectedIter = details.selected_iteration || 0;
      return `Selected iteration ${selectedIter + 1} as best`;
      
    case 'evaluator_assessed': {
      // top_3 is an array of conference predictions, first element is the top pick
      const top3 = details.top_3 || [];
      const prediction = top3[0] || details.predicted_conference || details.top_prediction || 'unknown';
      const confidence = details.confidence || details.top_confidence;
      const confStr = confidence ? ` (${(confidence * 100).toFixed(0)}% confidence)` : '';
      return `Blind evaluator predicted: ${prediction}${confStr}`;
    }
      
    case 'cost_event': {
      const cost = details.cost_usd || details.amount || 0;
      const tokens = details.tokens || 0;
      return `LLM cost: $${cost.toFixed(4)}${tokens ? ` (${tokens} tokens)` : ''}`;
    }
      
    case 'cost_guardrail_triggered': {
      const pointsSpent = details.action_points_spent;
      const pointsBudget = details.action_points_budget;
      if (pointsSpent && pointsBudget) {
        return `Action points exhausted: ${pointsSpent}/${pointsBudget} used`;
      }
      return 'Budget limit reached';
    }
      
    case 'planning_step': {
      const reasoning = details.reasoning || '';
      return reasoning.substring(0, 150) + (reasoning.length > 150 ? '...' : '');
    }
      
    case 'agentic_loop_started': {
      const ap = details.action_points_budget || details.action_points || 3;
      return `Starting iteration with ${ap} action points`;
    }
      
    case 'timeout_occurred':
      return 'Operation timed out';
      
    default:
      return `${eventType} by ${actor}`;
  }
}

/**
 * Extract normalized payload from raw event
 */
export function extractPayload(event: any): NormalizedEventPayload | undefined {
  const eventType = event.event_type;
  const details = event.details || {};
  
  switch (eventType) {
    case 'planning_step':
      return {
        reasoning: details.reasoning,
      };
    
    case 'tool_called':
      return {
        tool: {
          name: details.tool_name || details.name || 'unknown',
          status: 'success', // tool_called is emitted after successful execution
          duration_ms: details.duration_ms,
          result_summary: details.results_summary?.substring?.(0, 200),
          reasoning: details.reasoning,
        },
      };
    
    case 'tool_result':
      return {
        tool: {
          name: details.tool_name || 'unknown',
          status: details.success === false ? 'failed' : 'success',
          duration_ms: details.duration_ms,
          result_summary: details.result_preview?.substring?.(0, 200),
        },
      };
      
    case 'artifact_created':
    case 'artifact_consumed':
      return {
        artifact: {
          artifact_id: details.artifact_id || '',
          artifact_type: details.artifact_type,
          title: details.title,
        },
      };
      
    case 'abstract_submitted':
      return {
        submission: {
          title: details.title || '',
          abstract_preview: details.abstract?.substring?.(0, 300),
          confidence: details.confidence,
        },
      };
    
    case 'evaluator_assessed': {
      const evalTop3 = details.top_3 || [];
      return {
        evaluator: {
          predicted_conference: evalTop3[0] || details.predicted_conference || details.top_prediction || 'unknown',
          confidence: details.confidence || details.top_confidence,
          matches_target: details.matches_target,
        },
      };
    }
    
    case 'manager_accepted':
    case 'manager_rejected':
    case 'manager_selected_best_iteration':
      return {
        decision: {
          accepted: eventType === 'manager_accepted' || eventType === 'manager_selected_best_iteration',
          feedback_summary: details.feedback_for_worker || details.feedback_summary || details.rationale,
          reasoning: details.reasoning || details.why_chosen,
          // Scoring breakdown (added 2026-01-20)
          manager_self_score: details.manager_self_score,
          manager_self_score_original: details.manager_self_score_original,
          assessor_1_score: details.assessor_1_score,
          assessor_1_score_original: details.assessor_1_score_original,
          assessor_2_score: details.assessor_2_score,
          assessor_2_score_original: details.assessor_2_score_original,
          blended_score: details.blended_score,
          penalty_amount: details.penalty_amount,
          penalties: details.penalties,
          final_score: details.final_score,
          threshold: details.threshold,
          // Evaluator predictions for penalty transparency
          evaluator_prediction: details.evaluator_prediction,
          evaluator_confidence: details.evaluator_confidence,
          evaluator_top_3: details.evaluator_top_3,
        },
      };
      
    case 'cost_event':
    case 'cost_guardrail_triggered':
      return {
        budget: {
          cost_usd: details.cost_usd || details.amount,
          action_points_remaining: details.action_points_remaining,
        },
      };
      
    default:
      return undefined;
  }
}

/**
 * Normalize a raw event to UI-friendly format
 */
export function normalizeEvent(rawEvent: any): NormalizedEvent {
  const actor = normalizeActor(rawEvent.actor || 'system');
  const uiEventType = mapEventType(rawEvent.event_type);
  
  return {
    event_id: rawEvent.event_id,
    timestamp: rawEvent.timestamp,
    iteration: rawEvent.iteration ?? 0,
    actor,
    actor_label: ACTOR_LABELS[actor],
    event_type: uiEventType,
    raw_event_type: rawEvent.event_type,
    summary: generateSummary(rawEvent),
    payload: extractPayload(rawEvent),
  };
}

/**
 * Normalize an array of raw events
 */
export function normalizeEvents(rawEvents: any[]): NormalizedEvent[] {
  return rawEvents.map(normalizeEvent);
}

/**
 * Build cursor string from event (locked format: timestamp|event_id)
 */
export function buildCursor(event: NormalizedEvent): string {
  return `${event.timestamp}|${event.event_id}`;
}
