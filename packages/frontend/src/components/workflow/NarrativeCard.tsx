import { NormalizedEvent } from '../../services/api/workflow';
import { AgentBadge } from './AgentBadge';

interface NarrativeCardProps {
  event: NormalizedEvent;
}

export function NarrativeCard({ event }: NarrativeCardProps) {
  return (
    <div className="border border-border bg-card rounded-xl p-4 shadow-tactical hover:border-accent/50 transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <AgentBadge actor={event.actor} label={event.actor_label} />
        <span className="uppercase tracking-[0.12em] text-[11px] text-muted">
          Iteration {event.iteration + 1}
        </span>
        <span className="ml-auto text-xs text-muted">
          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="text-sm text-slate-100">{event.summary}</div>
      {event.payload?.reasoning && (
        <div className="mt-3 text-xs text-muted border-l-2 border-accent/60 pl-3">
          {event.payload.reasoning}
        </div>
      )}
      {event.payload?.tool && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span className="font-mono bg-ink/60 px-2 py-1 rounded border border-border">
            {event.payload.tool.name}
          </span>
          <span
            className={
              event.payload.tool.status === 'success' ? 'text-emerald font-semibold' : 'text-amber'
            }
          >
            {event.payload.tool.status}
          </span>
          {event.payload.tool.duration_ms && (
            <span className="text-muted">({event.payload.tool.duration_ms}ms)</span>
          )}
        </div>
      )}
    </div>
  );
}
