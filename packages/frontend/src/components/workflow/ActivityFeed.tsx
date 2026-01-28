/**
 * ActivityFeed Component
 * Sprint 7: Live event feed (last 15 events)
 * 
 * Features:
 * - Shows last 15 events using normalized summary
 * - Actor badges (Manager=blue, Worker=green, Evaluator=purple)
 * - Relative timestamps
 * - Auto-scroll with "scroll lock" detection
 * - Iteration dividers
 */

import { useRef, useEffect, useState } from 'react';
import { NormalizedEvent } from '../../services/api/workflow';
import { EventItem } from './EventItem';

interface ActivityFeedProps {
  events: NormalizedEvent[];
  maxEvents?: number;
}

export function ActivityFeed({ events, maxEvents = 15 }: ActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  // Get last N events
  const displayEvents = events.slice(-maxEvents);

  // Group events by iteration
  const groupedEvents: { iteration: number; events: NormalizedEvent[] }[] = [];
  let currentGroup: { iteration: number; events: NormalizedEvent[] } | null = null;

  for (const event of displayEvents) {
    if (!currentGroup || currentGroup.iteration !== event.iteration) {
      currentGroup = { iteration: event.iteration, events: [] };
      groupedEvents.push(currentGroup);
    }
    currentGroup.events.push(event);
  }

  // Handle scroll detection
  const handleScroll = () => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
    
    setIsUserScrolled(!isAtBottom);
  };

  // Auto-scroll to bottom when new events arrive (unless user scrolled)
  useEffect(() => {
    if (!containerRef.current || isUserScrolled) return;
    
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [events.length, isUserScrolled]);

  // Scroll to bottom button handler
  const scrollToBottom = () => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
    setIsUserScrolled(false);
  };

  if (events.length === 0) {
    return (
      <div className="border border-border bg-panel rounded-xl p-4 text-center text-muted">
        Waiting for events...
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="border border-border bg-panel rounded-xl p-4 max-h-96 overflow-y-auto space-y-1 shadow-tactical"
      >
        {groupedEvents.map((group, groupIndex) => (
          <div key={group.iteration}>
            {/* Iteration divider (except for first group) */}
            {groupIndex > 0 && (
              <div className="flex items-center gap-2 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  Iteration {group.iteration + 1}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            
            {/* Events in this iteration */}
            {group.events.map((event) => (
              <EventItem key={event.event_id} event={event} compact />
            ))}
          </div>
        ))}
      </div>
      
      {/* Scroll to bottom button (shown when user scrolled) */}
      {isUserScrolled && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 right-2 bg-accent text-ink text-xs px-3 py-1.5 rounded-full shadow-lg transition-colors"
        >
          ↓ New events
        </button>
      )}
    </div>
  );
}
