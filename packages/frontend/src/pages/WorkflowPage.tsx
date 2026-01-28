import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useJobStatus } from '../hooks/useJobStatus';
import { useJobEvents } from '../hooks/useJobEvents';
import { useIterations } from '../hooks/useIterations';
import { TrustIndicator } from '../components/workflow/TrustIndicator';
import { EventItem } from '../components/workflow/EventItem';
import { SubwayMap } from '../components/workflow/SubwayMap';
import { WorkflowHeader } from '../components/workflow/WorkflowHeader';
import { ViewToggle } from '../components/workflow/ViewToggle';
import { getJobToken, clearJobToken } from '../utils/tokenStorage';

// View modes
type ViewMode = 'narrative' | 'trace';

export function WorkflowPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('narrative');
  const [roleFilters, setRoleFilters] = useState<Set<string>>(
    new Set(['system', 'manager', 'worker', 'evaluator'])
  );

  // Get token from storage
  const token = jobId ? getJobToken(jobId) : null;

  // Hooks for polling
  const { status, loading: statusLoading, error: statusError } = useJobStatus({
    jobId: jobId || '',
    token: token || '',
    enabled: !!jobId && !!token,
  });

  const { events } = useJobEvents({
    jobId: jobId || '',
    token: token || '',
    enabled: !!jobId && !!token,
    isTerminal: status?.is_terminal,
  });

  // Fetch iteration submissions (title/abstract history)
  const { iterations: iterationsData } = useIterations({
    jobId: jobId || '',
    token: token || '',
    enabled: !!jobId && !!token,
  });

  // Persist view mode preference
  useEffect(() => {
    const saved = localStorage.getItem('workflowViewMode');
    if (saved === 'narrative' || saved === 'trace') {
      setViewMode(saved);
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('workflowViewMode', mode);
  };

  const toggleRoleFilter = (role: string) => {
    setRoleFilters(prev => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  // Filter events by selected roles
  const filteredEvents = events.filter(event => roleFilters.has(event.actor));

  // Handle missing token
  if (!token) {
    return (
      <div className="min-h-screen text-white p-6">
        <div className="max-w-2xl mx-auto text-center py-20">
          <h1 className="text-2xl font-bold mb-4">Session Expired</h1>
          <p className="text-muted mb-6">
            Your access token for this job has expired or is invalid.
          </p>
          <Link
            to="/"
            className="inline-block bg-panel hover:border-accent text-white px-6 py-3 rounded-lg border border-border transition-colors"
          >
            Start New Generation
          </Link>
        </div>
      </div>
    );
  }

  // Handle "Try Again" for failed jobs
  const handleTryAgain = () => {
    if (status?.conference && status?.topic) {
      // Clear the old token
      if (jobId) clearJobToken(jobId);
      // Navigate to observatory with pre-filled values
      navigate(`/observatory?conference=${status.conference}&topic=${status.topic}`);
    } else {
      navigate('/observatory');
    }
  };

  // Loading state
  if (statusLoading && !status) {
    return (
      <div className="min-h-screen text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted">Loading workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white tactical-grid relative overflow-hidden">
      {/* Ambient glow effects */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Scan line effect */}
      <div className="fixed inset-0 pointer-events-none scanline opacity-30" />

      <WorkflowHeader status={status} />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Trust Indicator */}
        {status && (
          <TrustIndicator
            currentPhaseLabel={status.current_phase_label}
            currentPhase={status.current_phase}
            iteration={status.iteration}
            maxIterations={status.max_iterations}
            lastEventAt={status.last_event_at}
            isTerminal={status.is_terminal}
            terminalReason={status.terminal_reason}
            error={statusError}
          />
        )}

        {/* View toggle + CTA */}
        <div className="flex items-center justify-between">
          <ViewToggle mode={viewMode} onChange={handleViewModeChange} />

          {status?.is_terminal && (
            <button
              onClick={handleTryAgain}
              className="px-4 py-2 rounded-lg border border-border bg-panel text-white hover:border-accent transition-colors"
            >
              Restart with same params
            </button>
          )}
        </div>

        {/* Main content */}
        {viewMode === 'narrative' ? (
          /* Subway Map View */
          status && (
            <SubwayMap
              currentPhase={status.current_phase}
              phaseHistory={status.phase_history}
              iteration={status.iteration}
              maxIterations={status.max_iterations}
              isTerminal={status.is_terminal}
              conference={status.conference}
              topic={status.topic}
            />
          )
        ) : (
          /* Trace View */
          <div className="space-y-4">
              {/* Trace Header with Role Filters */}
              <div className="tactical-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <h3 className="tactical-header">EVENT LOG</h3>
                      <span className="text-xs text-muted-foreground font-mono">
                        {filteredEvents.length} of {events.length} events
                      </span>
                    </div>
                    
                    {/* Role Filters */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono mr-2">FILTER:</span>
                      {(['system', 'manager', 'worker', 'evaluator'] as const).map((role) => (
                        <button
                          key={role}
                          onClick={() => toggleRoleFilter(role)}
                          className={cn(
                            "px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider transition-all border",
                            roleFilters.has(role) 
                              ? cn(
                                  role === "system" && "bg-primary/20 text-primary border-primary/30",
                                  role === "manager" && "bg-accent/20 text-accent border-accent/30",
                                  role === "worker" && "bg-success/20 text-success border-success/30",
                                  role === "evaluator" && "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                )
                              : "bg-muted/20 text-muted-foreground border-border hover:border-primary/30"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Event List with Iteration Markers */}
                <div className="divide-y divide-border/30 max-h-[700px] overflow-y-auto">
                  {filteredEvents.length === 0 ? (
                    <div className="px-6 py-8 text-center text-muted">
                      No events match the selected filters
                    </div>
                  ) : (
                    filteredEvents.map((event, index) => {
                      const showIterationBreak = index > 0 && event.iteration !== filteredEvents[index - 1]?.iteration;
                      
                      return (
                        <div key={event.event_id}>
                          {showIterationBreak && (
                            <div className="px-6 py-3 bg-primary/5 flex items-center justify-center border-y border-primary/20">
                              <span className="text-xs font-mono text-primary tracking-widest">
                                ──── ITERATION {event.iteration + 1} ────
                              </span>
                            </div>
                          )}
                          <EventItem event={event} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
        )}

        {/* Results section */}
        {status?.is_terminal && (
          <div className="border border-border bg-panel rounded-xl p-4 shadow-tactical">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[11px] text-muted uppercase tracking-[0.14em]">Outcome</p>
                <h3 className="text-lg font-semibold text-white">
                  {status.status === 'completed' ? 'Abstract Submitted' : 'Workflow Ended'}
                </h3>
              </div>
              <div className="text-sm text-muted">
                Iterations used: {status.iteration + 1} / {status.max_iterations}
              </div>
            </div>

            {iterationsData && iterationsData.iterations.length > 0 ? (
              <div className="space-y-3">
                {iterationsData.iterations.map((iteration) => (
                  <div
                    key={iteration.iteration}
                    className="border border-border rounded-lg p-4 bg-background/40 backdrop-blur-sm hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-mono text-foreground tracking-wider">
                        Iteration {iteration.iteration + 1}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded uppercase tracking-[0.1em] font-mono ${
                          iteration.decision === 'accept'
                            ? 'bg-emerald/15 text-emerald border border-emerald/50'
                            : iteration.decision === 'pending'
                            ? 'bg-amber/15 text-amber border border-amber/40'
                            : 'bg-card text-muted-foreground border border-border'
                        }`}
                      >
                        {iteration.decision}
                      </span>
                    </div>
                    <p className="text-accent font-semibold text-base mb-2">{iteration.title}</p>
                    <p className="text-foreground/90 text-sm leading-relaxed line-clamp-3">{iteration.abstract}</p>
                    {iteration.feedback && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Manager Feedback</p>
                        <p className="text-muted-foreground text-sm leading-relaxed">{iteration.feedback}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No iteration summaries available.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
