/**
 * Dashboard V2: Vendor Worker Deep Dive
 * Analyzes Worker acceptance outcomes, tool patterns, speed, score progression
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard, TacticalMetricCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2VendorWorkerResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function VendorWorkerV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2VendorWorker(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2VendorWorkerResponse>({
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

  const { acceptance_outcomes, tool_patterns, speed_comparison, score_progression } = data;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Speed Comparison */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <TacticalCard header="OpenAI Worker Speed">
          <div className="space-y-2">
            <TacticalMetricCard label="P50 Duration" value={`${speed_comparison.openai.p50_duration_seconds}s`} />
            <TacticalMetricCard label="P90 Duration" value={`${speed_comparison.openai.p90_duration_seconds}s`} />
            <TacticalMetricCard label="Average" value={`${speed_comparison.openai.avg_duration_seconds}s`} />
            <p className="text-xs text-muted-foreground">Sample: {speed_comparison.openai.sample_size}</p>
          </div>
        </TacticalCard>
        <TacticalCard header="Anthropic Worker Speed">
          <div className="space-y-2">
            <TacticalMetricCard label="P50 Duration" value={`${speed_comparison.anthropic.p50_duration_seconds}s`} />
            <TacticalMetricCard label="P90 Duration" value={`${speed_comparison.anthropic.p90_duration_seconds}s`} />
            <TacticalMetricCard label="Average" value={`${speed_comparison.anthropic.avg_duration_seconds}s`} />
            <p className="text-xs text-muted-foreground">Sample: {speed_comparison.anthropic.sample_size}</p>
          </div>
        </TacticalCard>
      </div>

      {/* Acceptance Outcomes by Iteration Bucket */}
      <TacticalCard header="📈 Acceptance Outcomes by Iteration" className="mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="tactical-header mb-3">OpenAI</h4>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Iteration 1:</span>
              <span className="font-mono font-bold">{acceptance_outcomes.openai.iteration_1.rate}% (n={acceptance_outcomes.openai.iteration_1.count})</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Iterations 2-3:</span>
              <span className="font-mono font-bold">{acceptance_outcomes.openai.iteration_2_3.rate}% (n={acceptance_outcomes.openai.iteration_2_3.count})</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Never Accepted:</span>
              <span className="font-mono font-bold text-red-400">{acceptance_outcomes.openai.never.rate}% (n={acceptance_outcomes.openai.never.count})</span>
            </div>
            <div className="flex justify-between py-2 font-semibold">
              <span>Total:</span>
              <span className="font-mono">{acceptance_outcomes.openai.total}</span>
            </div>
          </div>
          <div>
            <h4 className="tactical-header mb-3">Anthropic</h4>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Iteration 1:</span>
              <span className="font-mono font-bold">{acceptance_outcomes.anthropic.iteration_1.rate}% (n={acceptance_outcomes.anthropic.iteration_1.count})</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Iterations 2-3:</span>
              <span className="font-mono font-bold">{acceptance_outcomes.anthropic.iteration_2_3.rate}% (n={acceptance_outcomes.anthropic.iteration_2_3.count})</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Never Accepted:</span>
              <span className="font-mono font-bold text-red-400">{acceptance_outcomes.anthropic.never.rate}% (n={acceptance_outcomes.anthropic.never.count})</span>
            </div>
            <div className="flex justify-between py-2 font-semibold">
              <span>Total:</span>
              <span className="font-mono">{acceptance_outcomes.anthropic.total}</span>
            </div>
          </div>
        </div>
      </TacticalCard>

      {/* Tool Usage Patterns */}
      <TacticalCard header="🔧 Tool Usage Patterns" className="mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="tactical-header mb-3">OpenAI Tools</h4>
            <div className="mb-2 text-sm text-muted-foreground">
              Avg tools/job: {tool_patterns.openai.avg_tools_per_job.toFixed(1)} | 
              Total calls: {tool_patterns.openai.total_tool_calls}
            </div>
            {tool_patterns.openai.top_tools.length > 0 ? (
              tool_patterns.openai.top_tools.slice(0, 5).map((t, idx) => (
                <div key={idx} className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">{t.tool}:</span>
                  <span className="font-mono">{t.rate}% ({t.count})</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">No tool usage recorded</p>
            )}
          </div>
          <div>
            <h4 className="tactical-header mb-3">Anthropic Tools</h4>
            <div className="mb-2 text-sm text-muted-foreground">
              Avg tools/job: {tool_patterns.anthropic.avg_tools_per_job.toFixed(1)} | 
              Total calls: {tool_patterns.anthropic.total_tool_calls}
            </div>
            {tool_patterns.anthropic.top_tools.length > 0 ? (
              tool_patterns.anthropic.top_tools.slice(0, 5).map((t, idx) => (
                <div key={idx} className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">{t.tool}:</span>
                  <span className="font-mono">{t.rate}% ({t.count})</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">No tool usage recorded</p>
            )}
          </div>
        </div>
      </TacticalCard>

      {/* Score Progression */}
      {score_progression.length > 0 && (
        <TacticalCard header="📊 Quality Score Progression" className="mb-6">
          {score_progression.map((s) => (
            <div key={s.iteration} className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Iteration {s.iteration}:</span>
              <span className="font-mono font-bold">{s.avg_score} (n={s.sample_size})</span>
            </div>
          ))}
        </TacticalCard>
      )}
    </DashboardLayout>
  );
}
