/**
 * Dashboard V2: Executive Summary
 * NEW: Research-focused dashboard with 10x performance improvement
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2ExecutiveResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function ExecutiveDashboardV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2Executive(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2ExecutiveResponse>({
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

  const { 
    sample, 
    overall_performance_table, 
    iteration_distribution_table, 
    duration_context_table,
    key_findings
  } = data;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Table 1: Overall Performance */}
      <TacticalCard header="📊 Overall Worker Performance" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Vendor</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Total Attempts</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Avg Score (All)</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Accepted</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Rejected</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Avg (Accepted)</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Avg (Rejected)</th>
              </tr>
            </thead>
            <tbody>
              {overall_performance_table?.map((row) => (
                <tr key={row.vendor} className="border-b border-border/50">
                  <td className="py-3 px-4 font-mono text-sm font-semibold">{row.vendor}</td>
                  <td className="py-3 px-4 font-mono text-sm">{row.total_attempts}</td>
                  <td className="py-3 px-4 font-mono text-sm">{row.avg_score_all.toFixed(2)}</td>
                  <td className="py-3 px-4 font-mono text-sm text-success">{row.accepted}</td>
                  <td className="py-3 px-4 font-mono text-sm text-muted-foreground">{row.rejected}</td>
                  <td className="py-3 px-4 font-mono text-sm text-success">{row.avg_accepted.toFixed(2)}</td>
                  <td className="py-3 px-4 font-mono text-sm text-muted-foreground">{row.avg_rejected.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TacticalCard>

      {/* Bar Chart: Acceptances by Iteration */}
      <TacticalCard header="📊 Acceptances by Iteration (Stacked by Vendor)" className="mb-6">
        {(() => {
          // Calculate totals by iteration across both vendors
          const openaiData = iteration_distribution_table?.find(v => v.vendor === 'OpenAI');
          const anthropicData = iteration_distribution_table?.find(v => v.vendor === 'Anthropic');
          
          const iterationData = [1, 2, 3].map(iter => {
            const openaiCount = openaiData?.iterations[iter - 1]?.count || 0;
            const anthropicCount = anthropicData?.iterations[iter - 1]?.count || 0;
            const total = openaiCount + anthropicCount;
            return { iter, openai: openaiCount, anthropic: anthropicCount, total };
          });
          
          const maxCount = Math.max(...iterationData.map(d => d.total), 1);
          
          return (
            <div className="space-y-3">
              {iterationData.map(({ iter, openai, anthropic, total }) => (
                <div key={iter} className="flex items-center gap-4">
                  <div className="w-20 text-sm font-mono text-muted-foreground">
                    Iteration {iter}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-8 bg-border/30 rounded-md overflow-hidden flex">
                      {/* OpenAI bar segment */}
                      {openai > 0 && (
                        <div 
                          className="bg-primary/80 flex items-center justify-center text-xs font-mono text-primary-foreground"
                          style={{ width: `${(openai / maxCount) * 100}%` }}
                        >
                          {openai > 0 && <span className="px-2">{openai}</span>}
                        </div>
                      )}
                      {/* Anthropic bar segment */}
                      {anthropic > 0 && (
                        <div 
                          className="bg-accent/80 flex items-center justify-center text-xs font-mono text-accent-foreground"
                          style={{ width: `${(anthropic / maxCount) * 100}%` }}
                        >
                          {anthropic > 0 && <span className="px-2">{anthropic}</span>}
                        </div>
                      )}
                    </div>
                    <div className="w-32 text-sm font-mono">
                      {total > 0 ? (
                        <span>
                          <span className="font-semibold">{total}</span>
                          <span className="text-muted-foreground"> ({openai}/{anthropic})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                <div className="w-20"></div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-primary/80 rounded"></div>
                    <span>OpenAI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-accent/80 rounded"></div>
                    <span>Anthropic</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </TacticalCard>

      {/* Table 2: Iteration Distribution */}
      <TacticalCard header="🔄 Performance by Iteration" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Vendor</th>
                {[1, 2, 3].map(i => (
                  <th key={i} className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Iteration {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {iteration_distribution_table?.map((row) => (
                <tr key={row.vendor} className="border-b border-border/50">
                  <td className="py-3 px-4 font-mono text-sm font-semibold">{row.vendor}</td>
                  {row.iterations.map((iter, idx) => (
                    <td key={idx} className="py-3 px-4 font-mono text-sm">
                      {iter.count > 0 ? (
                        <>
                          <div className="text-foreground">{iter.avg_score.toFixed(2)}</div>
                          <div className="text-xs text-success">({iter.completion_pct}%)</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          * Score shown is average quality score. Percentage shows % of completions at that iteration.
        </div>
      </TacticalCard>

      {/* Table 3: Duration & Context */}
      <TacticalCard header="⏱️ Duration & Context Effects" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Vendor</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Avg Duration/Iteration</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Slowest Conference</th>
                <th className="py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Fastest Conference</th>
              </tr>
            </thead>
            <tbody>
              {duration_context_table?.map((row) => (
                <tr key={row.vendor} className="border-b border-border/50">
                  <td className="py-3 px-4 font-mono text-sm font-semibold">{row.vendor}</td>
                  <td className="py-3 px-4 font-mono text-sm">{row.avg_duration_per_iteration}s</td>
                  <td className="py-3 px-4 font-mono text-sm">
                    {row.slowest_conference ? (
                      <>
                        <div className="text-foreground">{row.slowest_conference.conference}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.slowest_conference.avg_duration}s (n={row.slowest_conference.sample_size})
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-sm">
                    {row.fastest_conference ? (
                      <>
                        <div className="text-foreground">{row.fastest_conference.conference}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.fastest_conference.avg_duration}s (n={row.fastest_conference.sample_size})
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TacticalCard>

      {/* Key Research Insights - PROMINENT */}
      <TacticalCard header="🔬 KEY RESEARCH INSIGHTS" className="mb-6 border-2 border-primary/50">
        <div className="space-y-4">
          {key_findings.map((insight, idx) => {
            // Map categories to colors and icons
            const categoryStyles: Record<string, { bg: string; border: string; icon: string }> = {
              quality: { bg: 'bg-primary/10', border: 'border-primary/30', icon: '🏆' },
              speed: { bg: 'bg-accent/10', border: 'border-accent/30', icon: '⚡' },
              behavior: { bg: 'bg-success/10', border: 'border-success/30', icon: '🎯' },
              efficiency: { bg: 'bg-warning/10', border: 'border-warning/30', icon: '🔄' },
              acceptance: { bg: 'bg-info/10', border: 'border-info/30', icon: '📊' },
              neutral: { bg: 'bg-muted/10', border: 'border-muted/30', icon: '🤝' },
              warning: { bg: 'bg-destructive/10', border: 'border-destructive/30', icon: '⚠️' },
            };
            
            const style = categoryStyles[insight.category] || categoryStyles.neutral;
            
            return (
              <div
                key={idx}
                className={`rounded-lg border-2 ${style.border} ${style.bg} p-5 transition-all hover:scale-[1.02]`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{style.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground mb-2">
                      {insight.title}
                    </h3>
                    <p className="text-base text-foreground/90">
                      {insight.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 text-xs text-muted-foreground text-center">
          Sample: {sample.total_jobs} jobs • Manager: {sample.openai_manager}O/{sample.anthropic_manager}A • Worker: {sample.openai_worker}O/{sample.anthropic_worker}A
        </div>
      </TacticalCard>
    </DashboardLayout>
  );
}
