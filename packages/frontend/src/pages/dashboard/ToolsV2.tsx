/**
 * Dashboard V2: Tool Patterns
 * Tool effectiveness, sequences, vendor strategies
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2ToolsResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function ToolsV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2Tools(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2ToolsResponse>({
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

  const { tool_effectiveness, tool_sequences, vendor_strategies } = data;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Tool Effectiveness */}
      <TacticalCard header="🎯 Tool Effectiveness" className="mb-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Acceptance rate when tool is used vs baseline
        </p>
        {tool_effectiveness.slice(0, 10).map((t, idx) => (
          <div key={idx} className="flex justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">{t.tool}:</span>
            <span className="font-mono text-sm">
              Used: {t.acceptance_rate_when_used}% | Baseline: {t.baseline_acceptance_rate}%
              <span className={t.delta > 0 ? 'text-green-400' : t.delta < 0 ? 'text-red-400' : ''}>
                {' '}({t.delta > 0 ? '+' : ''}{t.delta}%)
              </span>
            </span>
          </div>
        ))}
      </TacticalCard>

      {/* Tool Sequences */}
      {tool_sequences.length > 0 && (
        <TacticalCard header="🔗 Common Tool Sequences" className="mb-6">
          {tool_sequences.map((seq, idx) => (
            <div key={idx} className="flex justify-between py-3 border-b border-border/50">
              <span className="font-mono text-sm">{seq.sequence}</span>
              <span className="text-sm">
                {seq.acceptance_rate}% accepted · {seq.usage_count} uses
              </span>
            </div>
          ))}
        </TacticalCard>
      )}

      {/* Vendor Tool Strategies */}
      <TacticalCard header="⚔️ Vendor Tool Strategies" className="mb-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Tool usage rate differences between vendors
        </p>
        {vendor_strategies.slice(0, 10).map((s, idx) => (
          <div key={idx} className="flex justify-between py-2 border-b border-border/50">
            <span className="text-muted-foreground">{s.tool}:</span>
            <span className="font-mono text-sm">
              OpenAI {s.openai_usage_rate}% | Anthropic {s.anthropic_usage_rate}%
              <span className={Math.abs(s.delta) > 10 ? 'font-bold' : ''}>
                {' '}({s.delta > 0 ? '+' : ''}{s.delta}%)
              </span>
            </span>
          </div>
        ))}
      </TacticalCard>
    </DashboardLayout>
  );
}
