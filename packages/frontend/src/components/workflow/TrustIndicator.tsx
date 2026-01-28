/**
 * TrustIndicator Component
 * Sprint 7: Shows current state, iteration, and "last update" time
 * 
 * Displays:
 * - Phase label and iteration: "Worker Execution • Iteration 2/3"
 * - Last update time: "Last update: 4s ago"
 * - Stale warnings at 30s and 60s thresholds
 */

import { useMemo, useState, useEffect } from 'react';
import { Phase, TerminalReason } from '../../services/api/workflow';

interface TrustIndicatorProps {
  currentPhaseLabel: string;
  currentPhase: Phase;
  iteration: number;
  maxIterations: number;
  lastEventAt: string | null;
  isTerminal: boolean;
  terminalReason?: TerminalReason;
  error?: Error | null;
}

// Stale warning thresholds
const STALE_WARNING_THRESHOLD_MS = 30 * 1000; // 30 seconds
const STALE_CRITICAL_THRESHOLD_MS = 60 * 1000; // 60 seconds

export function TrustIndicator({
  currentPhaseLabel,
  currentPhase,
  iteration,
  maxIterations,
  lastEventAt,
  isTerminal,
  terminalReason,
  error,
}: TrustIndicatorProps) {
  const [now, setNow] = useState(Date.now());

  // Update "now" every second for relative time display
  useEffect(() => {
    if (isTerminal) return; // Don't update if terminal
    
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isTerminal]);

  // Calculate seconds since last event
  const secondsSinceLastEvent = useMemo(() => {
    if (!lastEventAt) return null;
    const lastEventTime = new Date(lastEventAt).getTime();
    return Math.floor((now - lastEventTime) / 1000);
  }, [lastEventAt, now]);

  // Determine stale state
  const staleState = useMemo(() => {
    if (isTerminal) return 'none';
    if (secondsSinceLastEvent === null) return 'unknown';
    if (secondsSinceLastEvent * 1000 >= STALE_CRITICAL_THRESHOLD_MS) return 'critical';
    if (secondsSinceLastEvent * 1000 >= STALE_WARNING_THRESHOLD_MS) return 'warning';
    return 'none';
  }, [secondsSinceLastEvent, isTerminal]);

  // Format relative time
  const formatRelativeTime = (seconds: number | null) => {
    if (seconds === null) return 'unknown';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  // Get status color
  const getStatusColor = () => {
    if (error) return 'text-red-400';
    if (isTerminal && currentPhase === 'failed') return 'text-red-400';
    if (isTerminal && currentPhase === 'completed') return 'text-green-400';
    if (staleState === 'critical') return 'text-amber-400';
    if (staleState === 'warning') return 'text-amber-300';
    return 'text-blue-400';
  };

  // Get indicator dot class
  const getDotClass = () => {
    if (error || (isTerminal && currentPhase === 'failed')) return 'bg-red-400';
    if (isTerminal && currentPhase === 'completed') return 'bg-green-400';
    if (staleState === 'critical' || staleState === 'warning') return 'bg-amber-400';
    return 'bg-blue-400 animate-pulse';
  };

  // Get stale message
  const getStaleMessage = () => {
    if (staleState === 'critical') return 'This is taking longer than usual...';
    if (staleState === 'warning') return 'Waiting on LLM response...';
    return null;
  };

  // Get terminal reason message
  const getTerminalReasonMessage = (reason: TerminalReason) => {
    switch (reason) {
      case 'timeout': return 'Operation timed out';
      case 'validation_failed': return 'Validation failed';
      case 'budget_exhausted': return 'Budget exhausted';
      case 'user_aborted': return 'Aborted by user';
      case 'internal_error': return 'Internal error';
      default: return 'Unknown error';
    }
  };

  return (
    <div className="tactical-card p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="tactical-header mb-2">ACTIVE MISSION</p>
          <div className="flex items-center gap-3">
            {/* Status dot with glow */}
            <div className={`w-2 h-2 rounded-full ${getDotClass()}`} style={{
              boxShadow: isTerminal && currentPhase === 'completed' 
                ? '0 0 8px hsl(var(--success)), 0 0 16px hsl(var(--success) / 0.5)'
                : !isTerminal 
                  ? '0 0 8px hsl(var(--primary)), 0 0 16px hsl(var(--primary) / 0.5)'
                  : undefined
            }} />
            
            {/* Phase and iteration */}
            <div className={getStatusColor()}>
              <span className="font-semibold text-lg">{currentPhaseLabel}</span>
              {!isTerminal && iteration >= 0 && (
                <span className="text-muted-foreground font-mono text-sm ml-3">
                  • Iteration {iteration + 1}/{maxIterations}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Status and messages */}
        <div className="flex items-center gap-4">
          {/* Stale warning */}
          {!isTerminal && getStaleMessage() && (
            <div className="px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
              <span className="text-amber-400 text-sm font-mono">{getStaleMessage()}</span>
            </div>
          )}
          
          {/* Terminal reason */}
          {isTerminal && terminalReason && (
            <div className="px-3 py-1.5 rounded bg-destructive/10 border border-destructive/30">
              <span className="text-destructive text-sm font-mono">{getTerminalReasonMessage(terminalReason)}</span>
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div className="px-3 py-1.5 rounded bg-destructive/10 border border-destructive/30">
              <span className="text-destructive text-sm font-mono">{error.message}</span>
            </div>
          )}
          
          {/* Last update time */}
          {!isTerminal && secondsSinceLastEvent !== null && (
            <span className="text-muted-foreground text-sm font-mono">
              Last update: {formatRelativeTime(secondsSinceLastEvent)}
            </span>
          )}

          {/* Terminal status badge */}
          {isTerminal && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded border ${
              currentPhase === 'completed' 
                ? 'bg-success/10 border-success/30' 
                : 'bg-destructive/10 border-destructive/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                currentPhase === 'completed' ? 'bg-success' : 'bg-destructive'
              }`} />
              <span className={`font-mono text-sm uppercase tracking-wider ${
                currentPhase === 'completed' ? 'text-success' : 'text-destructive'
              }`}>
                {currentPhase === 'completed' ? 'Complete' : 'Failed'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
