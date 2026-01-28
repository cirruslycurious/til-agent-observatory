import { NormalizedEvent } from '../../services/api/workflow';
import { NarrativeCard } from './NarrativeCard';

interface NarrativeViewProps {
  events: NormalizedEvent[];
}

/**
 * NarrativeView
 * Shows one highlighted card per iteration (latest event in that iteration),
 * giving a story-first view.
 */
export function NarrativeView({ events }: NarrativeViewProps) {
  if (!events.length) {
    return (
      <div className="border border-border bg-panel rounded-xl p-6 text-center text-muted">
        Waiting for the first narrative event…
      </div>
    );
  }

  // Group by iteration and take the latest event per iteration
  const byIteration = new Map<number, NormalizedEvent>();
  for (const event of events) {
    const current = byIteration.get(event.iteration);
    const currentTs = current ? new Date(current.timestamp).getTime() : 0;
    const nextTs = new Date(event.timestamp).getTime();
    if (!current || nextTs > currentTs) {
      byIteration.set(event.iteration, event);
    }
  }

  const ordered = Array.from(byIteration.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, ev]) => ev);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ordered.map((event) => (
        <NarrativeCard key={event.event_id} event={event} />
      ))}
    </div>
  );
}
