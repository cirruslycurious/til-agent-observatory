/**
 * Jobs List Page
 * Displays all jobs in a tactical card layout matching reference design
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hexagon, Clock, CheckCircle, XCircle, Loader2, Target, Zap } from 'lucide-react';
import { jobsService, type JobListItem } from '../services/api/jobs';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatConference(conf?: string): string {
  if (!conf) return 'Unknown';
  return conf
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTopic(topic?: string): string {
  if (!topic) return 'Unknown';
  return topic
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'completed_with_compromises':
      return 'bg-success';
    case 'running':
      return 'bg-success animate-pulse';
    case 'failed':
      return 'bg-red-500';
    case 'queued':
      return 'bg-accent';
    default:
      return 'bg-muted-foreground';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
    case 'completed_with_compromises':
      return CheckCircle;
    case 'running':
      return Loader2;
    case 'failed':
      return XCircle;
    default:
      return Clock;
  }
}

export function JobsListPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await jobsService.listJobs(100);
        setJobs(response.jobs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
    // Refresh every 10 seconds
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle grid overlay */}
      <div 
        className="fixed inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary/10 border border-primary/40 flex items-center justify-center">
            <Hexagon className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-widest text-foreground">Jobs Monitor</h1>
            <p className="text-xs text-muted-foreground tracking-wide">All Workflow Executions</p>
          </div>
        </div>

        {/* Loading state */}
        {loading && jobs.length === 0 && (
          <div className="tactical-card p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading jobs...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="tactical-card p-6 border-red-500/30 bg-red-500/10">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Jobs list */}
        {!loading && jobs.length === 0 && !error && (
          <div className="tactical-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No jobs found</p>
          </div>
        )}

        {jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map((job) => {
              const StatusIcon = getStatusIcon(job.status);
              const statusColor = getStatusColor(job.status);

              return (
                <Link
                  key={job.job_id}
                  to={`/jobs/${job.job_id}`}
                  className="block"
                >
                  <div className="tactical-card p-5 hover:border-primary/50 transition-colors">
                    {/* Status bar */}
                    <div className="flex items-center justify-between pb-4 border-b border-border">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {job.status}
                        </span>
                        {job.error_code && (
                          <span className="text-xs status-error font-mono">
                            {job.error_code}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <Clock className="w-3 h-3" />
                        {formatTime(job.created_at)}
                      </div>
                    </div>

                    {/* Job info */}
                    <div className="space-y-3 mt-4">
                      <div className="flex items-start gap-3">
                        <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {job.final_title ? (
                            <h3 className="text-base font-semibold text-foreground leading-tight mb-1">
                              {job.final_title}
                            </h3>
                          ) : (
                            <h3 className="text-base font-semibold text-foreground leading-tight mb-1">
                              {formatTopic(job.topic)}
                            </h3>
                          )}
                          <p className="text-xs text-muted-foreground">
                            TARGET: <span className="text-primary font-semibold">{formatConference(job.conference)}</span>
                            {job.topic && !job.final_title && (
                              <> • TOPIC: <span className="text-accent font-semibold">{formatTopic(job.topic)}</span></>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Metrics row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="metric-box">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Job ID</div>
                          <div className="text-xs font-mono font-semibold truncate">{job.job_id}</div>
                        </div>

                        <div className="metric-box">
                          <StatusIcon className={`w-4 h-4 ${
                            job.status === 'completed' || job.status === 'completed_with_compromises' 
                              ? 'text-success' 
                              : job.status === 'running' 
                              ? 'text-primary' 
                              : job.status === 'failed' 
                              ? 'status-error' 
                              : 'text-accent'
                          }`} />
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider">Status</div>
                            <div className="text-xs font-mono font-semibold capitalize">{job.status}</div>
                          </div>
                        </div>

                        {job.completed_at && (
                          <div className="metric-box">
                            <Zap className="w-4 h-4 text-accent" />
                            <div>
                              <div className="text-xs text-muted-foreground uppercase tracking-wider">Completed</div>
                              <div className="text-xs font-mono font-semibold">{formatTime(job.completed_at)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
