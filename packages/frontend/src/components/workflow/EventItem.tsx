/**
 * EventItem Component
 * Sprint 7: Single event display using normalized summary + payload
 * 
 * Shows: actor badge, summary, relative timestamp, optional payload details
 */

import { useState } from 'react';
import {
  Target,
  Wrench,
  Brain,
  FileText,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  MessageSquare,
  Zap,
  Cog,
} from 'lucide-react';
import { NormalizedEvent, Actor, UIEventType } from '../../services/api/workflow';
import { AgentBadge } from './AgentBadge';
import { ToolChip } from './ToolChip';

interface EventItemProps {
  event: NormalizedEvent;
  compact?: boolean;
}

const EVENT_ICONS: Partial<Record<UIEventType, typeof Target>> = {
  goal_set: Target,
  plan_created: Brain,
  tool_call: Wrench,
  artifact_created: FileText,
  iteration_submitted: CheckCircle,
  manager_decision: CheckCircle,
  budget_update: DollarSign,
  error: AlertTriangle,
  system_notice: MessageSquare,
};

const AGENT_BORDER: Record<Actor, string> = {
  manager: 'border-l-amber-600',
  worker: 'border-l-emerald-600',
  evaluator: 'border-l-iris-400',
  system: 'border-l-sky-500',
};

export function EventItem({ event, compact = false }: EventItemProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = EVENT_ICONS[event.event_type] || AlertTriangle;
  const agentBorder = AGENT_BORDER[event.actor] || 'border-l-border';

  // Determine if this is an agentic (worker-chosen) or workflow (system-driven) event
  const isAgentic = 
    (event.event_type === 'tool_call' && event.actor === 'worker') ||
    (event.event_type === 'plan_created' && event.actor === 'worker');

  const formatRelativeTime = (timestamp: string) => {
    const now = Date.now();
    const eventTime = new Date(timestamp).getTime();
    const diffSeconds = Math.floor((now - eventTime) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
    return `${Math.floor(diffSeconds / 86400)}d`;
  };

  const hasDetails =
    !!event.payload?.reasoning ||
    !!event.payload?.tool ||
    !!event.payload?.artifact ||
    !!event.payload?.decision ||
    !!event.payload?.submission ||
    !!event.payload?.evaluator ||
    !!event.payload?.budget;

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm">
        <span className="flex items-center justify-center w-5 h-5 rounded bg-muted/60 text-muted-foreground">
          <Icon className="w-3 h-3" />
        </span>
        <AgentBadge actor={event.actor} size="sm" />
        <span className="text-foreground flex-1 truncate">{event.summary}</span>
        <span className="text-muted text-xs whitespace-nowrap">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  return (
    <div className={`tactical-panel p-4 border-l-2 ${agentBorder}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-muted/40 text-foreground">
          <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <AgentBadge actor={event.actor} size="sm" />
            
            {/* Agentic vs Workflow indicator */}
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
              isAgentic 
                ? 'bg-accent/10 text-accent border border-accent/20' 
                : 'bg-muted/30 text-muted-foreground border border-border'
            }`}>
              {isAgentic ? (
                <>
                  <Zap className="w-2.5 h-2.5" />
                  Agent
                </>
              ) : (
                <>
                  <Cog className="w-2.5 h-2.5" />
                  Flow
                </>
              )}
            </div>
            
            <span className="text-[10px] text-muted-foreground font-mono">
              ITR-{event.iteration + 1}
            </span>
            <span className="text-[10px] text-muted-foreground/60 ml-auto font-mono">
              {formatRelativeTime(event.timestamp)}
            </span>
          </div>

          <h4 className="text-sm font-medium text-foreground leading-tight mb-1">
            {event.summary}
          </h4>

          {/* Preview of tools when collapsed */}
          {event.payload?.tool && !expanded && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ToolChip tool={event.payload.tool} />
            </div>
          )}

          {/* Expandable details */}
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}

          {expanded && (
            <div className="mt-3 space-y-3">
              {event.payload?.tool && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">TOOL DETAILS</p>
                  <ToolChip tool={event.payload.tool} showReason />
                </div>
              )}

              {event.payload?.reasoning && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">REASONING</p>
                  <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {event.payload.reasoning.length > 175 
                      ? event.payload.reasoning.substring(0, 175) + '...' 
                      : event.payload.reasoning}
                  </pre>
                </div>
              )}

              {event.payload?.artifact && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">ARTIFACT</p>
                  <div className="flex items-center gap-2">
                    <span className="tool-chip">
                      {event.payload.artifact.artifact_type || 'artifact'}
                    </span>
                    {event.payload.artifact.title && (
                      <span className="text-xs text-muted-foreground">
                        {event.payload.artifact.title}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {event.payload?.decision && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">DECISION DETAILS</p>
                  
                  {/* Scoring Breakdown */}
                  {event.payload.decision.final_score !== undefined && (
                    <div className="mb-3 p-3 bg-muted/20 rounded border border-border">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Manager Self:</span>
                          <span className="text-foreground font-semibold">
                            {event.payload.decision.manager_self_score?.toFixed(2) || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nova 1:</span>
                          <span className="text-foreground font-semibold">
                            {event.payload.decision.assessor_1_score?.toFixed(2) || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nova 2:</span>
                          <span className="text-foreground font-semibold">
                            {event.payload.decision.assessor_2_score?.toFixed(2) || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Blended:</span>
                          <span className="text-foreground font-semibold">
                            {event.payload.decision.blended_score?.toFixed(2) || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Score Adjustment:</span>
                          <span className={`font-semibold ${
                            event.payload.decision.penalty_amount && event.payload.decision.penalty_amount < 0 
                              ? 'text-red-400' 
                              : event.payload.decision.penalty_amount && event.payload.decision.penalty_amount > 0 
                              ? 'text-green-400' 
                              : 'text-foreground'
                          }`}>
                            {event.payload.decision.penalty_amount !== undefined
                              ? (event.payload.decision.penalty_amount >= 0 ? '+' : '') + event.payload.decision.penalty_amount.toFixed(2)
                              : '0.00'}
                          </span>
                        </div>
                        <div className="flex justify-between col-span-2 pt-1.5 border-t border-border">
                          <span className="text-muted-foreground font-bold">Final Score:</span>
                          <span className="text-foreground font-bold text-sm">
                            {event.payload.decision.final_score?.toFixed(2) || 'N/A'}
                            {event.payload.decision.threshold && (
                              <span className="text-muted-foreground text-xs ml-1">
                                / {event.payload.decision.threshold.toFixed(2)}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      {event.payload.decision.penalties && event.payload.decision.penalties.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Adjustments:</p>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {event.payload.decision.penalties.map((p, i) => (
                              <li key={i} className="leading-tight">• {p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {event.payload.decision.evaluator_top_3 && event.payload.decision.evaluator_top_3.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Blind Evaluator Predictions:</p>
                          <ol className="text-xs space-y-0.5">
                            {event.payload.decision.evaluator_top_3.map((conf, i) => (
                              <li key={i} className="leading-tight flex items-center gap-2">
                                <span className="text-muted-foreground font-mono">#{i + 1}:</span>
                                <span className="text-foreground">{conf}</span>
                                {event.payload?.decision?.evaluator_confidence !== undefined && i === 0 && (
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    ({(event.payload.decision.evaluator_confidence * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Reasoning and Feedback */}
                  <div className="space-y-1 text-sm text-foreground">
                    {event.payload.decision.reasoning && (
                      <p>{event.payload.decision.reasoning}</p>
                    )}
                    {event.payload.decision.feedback_summary && (
                      <p className="text-muted-foreground">
                        Feedback: {event.payload.decision.feedback_summary}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {event.payload?.submission && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">SUBMISSION</p>
                  <p className="text-accent font-semibold mb-1">"{event.payload.submission.title}"</p>
                  {event.payload.submission.abstract_preview && (
                    <p className="text-sm text-foreground">
                      {event.payload.submission.abstract_preview}
                    </p>
                  )}
                  {event.payload.submission.confidence !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      Confidence: {(event.payload.submission.confidence * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              )}

              {event.payload?.evaluator && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">EVALUATOR ASSESSMENT</p>
                  <div className="inline-flex items-center gap-2 px-2 py-1 bg-muted/30 border border-border rounded">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Predicted:</span>
                    <span className="text-xs font-semibold text-foreground">
                      {event.payload.evaluator.predicted_conference}
                    </span>
                    {event.payload.evaluator.confidence !== undefined && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {(event.payload.evaluator.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              )}

              {event.payload?.budget && (
                <div className="p-4 rounded bg-background border border-primary/20 shadow-lg shadow-primary/5">
                  <p className="tactical-header mb-2">BUDGET</p>
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    {event.payload.budget.cost_usd !== undefined && (
                      <span className="font-mono">Cost: ${event.payload.budget.cost_usd.toFixed(4)}</span>
                    )}
                    {event.payload.budget.action_points_remaining !== undefined && (
                      <span className="font-mono">
                        AP: {event.payload.budget.action_points_remaining}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
