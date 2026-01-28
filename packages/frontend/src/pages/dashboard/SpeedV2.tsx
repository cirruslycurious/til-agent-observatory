/**
 * Dashboard V2: Speed & Efficiency
 * Overall timings, per-iteration timing, cost analysis, throughput
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard, TacticalMetricCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2SpeedResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function SpeedV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2Speed(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2SpeedResponse>({
    fetchFn,
    autoRefresh: true,
  });

  if (loading && !data) {
    return (
      <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">{error || 'Failed to load data'}</p>
        </div>
      </DashboardLayout>
    );
  }

  const { overall_timings, per_iteration_timing, cost_analysis, throughput } = data;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Throughput Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <TacticalMetricCard
          label="Jobs Completed"
          value={throughput.jobs_completed}
          variant="primary"
        />
        <TacticalMetricCard
          label="Jobs/Day"
          value={throughput.jobs_per_day.toFixed(1)}
          variant="success"
        />
        <TacticalMetricCard
          label="Total Iterations"
          value={throughput.total_iterations}
        />
        <TacticalMetricCard
          label="Iterations/Min"
          value={throughput.avg_iterations_per_minute.toFixed(2)}
          variant="accent"
        />
      </div>

      {/* Overall Timings */}
      <TacticalCard header="⏱️ Overall Timings (seconds)" className="mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <h4 className="tactical-header">OpenAI</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P50:</span>
              <span className="font-mono font-bold">{overall_timings.openai.p50}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P90:</span>
              <span className="font-mono">{overall_timings.openai.p90}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P99:</span>
              <span className="font-mono">{overall_timings.openai.p99}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average:</span>
              <span className="font-mono">{overall_timings.openai.avg}s</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="tactical-header">Anthropic</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P50:</span>
              <span className="font-mono font-bold">{overall_timings.anthropic.p50}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P90:</span>
              <span className="font-mono">{overall_timings.anthropic.p90}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P99:</span>
              <span className="font-mono">{overall_timings.anthropic.p99}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average:</span>
              <span className="font-mono">{overall_timings.anthropic.avg}s</span>
            </div>
          </div>
        </div>
      </TacticalCard>

      {/* Per-Iteration Timing */}
      <TacticalCard header="📊 Timing by Iteration (P50 seconds)" className="mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="tactical-header mb-3">OpenAI</h4>
            {per_iteration_timing.openai.map((iter) => (
              <div key={iter.iteration} className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Iteration {iter.iteration}:</span>
                <span className="font-mono">{iter.p50_duration_seconds}s (n={iter.sample_size})</span>
              </div>
            ))}
          </div>
          <div>
            <h4 className="tactical-header mb-3">Anthropic</h4>
            {per_iteration_timing.anthropic.map((iter) => (
              <div key={iter.iteration} className="flex justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Iteration {iter.iteration}:</span>
                <span className="font-mono">{iter.p50_duration_seconds}s (n={iter.sample_size})</span>
              </div>
            ))}
          </div>
        </div>
      </TacticalCard>

      {/* Cost Analysis */}
      <TacticalCard header="💰 Cost Analysis" className="mb-6">
        <div className="grid grid-cols-2 gap-6 mb-4">
          <div className="space-y-2">
            <h4 className="tactical-header">OpenAI</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Cost/Job:</span>
              <span className="font-mono font-bold">{cost_analysis.openai.avg_cost_per_job_cents}¢</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Cost/Accepted:</span>
              <span className="font-mono font-bold">{cost_analysis.openai.avg_cost_per_accepted_cents}¢</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="font-mono">${(cost_analysis.openai.total_cost_cents / 100).toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="tactical-header">Anthropic</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Cost/Job:</span>
              <span className="font-mono font-bold">{cost_analysis.anthropic.avg_cost_per_job_cents}¢</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Cost/Accepted:</span>
              <span className="font-mono font-bold">{cost_analysis.anthropic.avg_cost_per_accepted_cents}¢</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="font-mono">${(cost_analysis.anthropic.total_cost_cents / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="text-center pt-4 border-t border-border">
          <div className="text-3xl font-bold font-mono">${(cost_analysis.total_cost_cents / 100).toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">Total System Cost</div>
        </div>
      </TacticalCard>
    </DashboardLayout>
  );
}
