/**
 * Dashboard Overview Page
 * Story 5.1: Executive Overview Dashboard
 */

import { useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { DashboardLayout, TacticalCard, TacticalMetricCard, TacticalTable, ExportButton } from '../../components/dashboard';
import { dashboardService, type OverviewResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardContext } from '../../context/DashboardContext';

export function OverviewPage() {
  const { startDate, endDate } = useDashboardContext();
  
  const fetchFn = useCallback(
    (start?: string, end?: string) => dashboardService.getOverview(start, end),
    []
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<OverviewResponse>({
    fetchFn,
    startDate,
    endDate,
  });

  if (loading && !data) {
    return (
      <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
        <div className="flex h-64 items-center justify-center">
          <div className="text-[color:var(--secondary)]">Loading...</div>
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

  // Prepare iteration distribution data for stacked bar chart by vendor
  const iterData = [1, 2, 3].map(iter => {
    const dist = data.iteration_distribution?.[iter];
    return {
      iteration: iter,
      total: dist?.total || 0,
      openai: dist?.openai || 0,
      anthropic: dist?.anthropic || 0,
    };
  });

  // Prepare evaluator accuracy data
  const evalData = data.evaluator_accuracy;
  const targetTotal = evalData?.target_rank_distribution ? 
    (evalData.target_rank_distribution.rank1 || 0) + 
    (evalData.target_rank_distribution.rank2 || 0) + 
    (evalData.target_rank_distribution.rank3 || 0) + 
    (evalData.target_rank_distribution.notInTop3 || 0) : 0;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      <div className="space-y-6">

        {/* Summary Metrics */}
        <section>
          <h2 className="tactical-header mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TacticalMetricCard
              label="Total Jobs"
              value={data.summary?.total_jobs ?? 0}
              subValue={`${data.summary?.in_progress ?? 0} in progress`}
            />
            <TacticalMetricCard
              label="Finished Jobs"
              value={data.summary?.finished_jobs ?? 0}
              variant="success"
            />
            <TacticalMetricCard
              label="Estimated Cost"
              value={`$${data.cost_summary?.estimated_total_usd ?? 0}`}
              subValue={`${data.cost_summary?.total_tokens?.toLocaleString() ?? 0} tokens`}
              variant="accent"
            />
            <TacticalMetricCard
              label="Avg Cost/Job"
              value={`$${data.cost_summary?.avg_cost_per_job_usd ?? 0}`}
              variant="accent"
            />
          </div>
        </section>

        {/* Iteration Distribution - Stacked by Vendor */}
        <section>
          <TacticalCard header="Iteration Distribution (by Worker Vendor)">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={iterData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                  <XAxis 
                    dataKey="iteration" 
                    axisLine={{ stroke: 'hsl(200 15% 18%)' }}
                    tickLine={false}
                    tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{
                      background: 'hsl(220 16% 10%)',
                      border: '1px solid hsl(185 80% 50% / 0.3)',
                      borderRadius: '4px',
                      fontFamily: 'JetBrains Mono',
                      fontSize: '12px',
                      boxShadow: '0 0 20px hsl(185 80% 50% / 0.2)',
                    }}
                    labelStyle={{ color: 'hsl(210 20% 92%)' }}
                    cursor={{ fill: 'hsl(185 80% 50% / 0.05)' }}
                    formatter={(value: number, name: string) => [
                      value, 
                      name === 'openai' ? 'OpenAI' : name === 'anthropic' ? 'Anthropic' : name
                    ]}
                    labelFormatter={(label) => `Iteration ${label}`}
                  />
                  <Bar 
                    dataKey="openai" 
                    name="OpenAI" 
                    stackId="a" 
                    fill="hsl(185 80% 50%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar 
                    dataKey="anthropic" 
                    name="Anthropic" 
                    stackId="a" 
                    fill="hsl(38 92% 55%)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-primary" />
                <span className="text-muted-foreground">OpenAI</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-accent" />
                <span className="text-muted-foreground">Anthropic</span>
              </div>
            </div>
          </TacticalCard>
        </section>

        {/* Evaluator (Nova) Accuracy */}
        {evalData && evalData.total_evaluations > 0 && (
          <section>
            <h2 className="tactical-header mb-4">Blind Evaluator (Nova) Accuracy</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Target Conference Prediction */}
              <TacticalCard header={`Target Conference Rank (${evalData.total_evaluations} evals)`}>
                <div className="space-y-3">
                  {[
                    { label: 'Rank 1 (correct)', value: evalData.target_rank_distribution?.rank1 || 0, isCorrect: true },
                    { label: 'Rank 2', value: evalData.target_rank_distribution?.rank2 || 0 },
                    { label: 'Rank 3', value: evalData.target_rank_distribution?.rank3 || 0 },
                    { label: 'Not in Top 3', value: evalData.target_rank_distribution?.notInTop3 || 0 },
                  ].map(rank => (
                    <div key={rank.label} className="flex items-center gap-3">
                      <span className={`text-xs font-mono w-20 ${rank.isCorrect ? 'text-success' : 'text-muted-foreground'}`}>
                        {rank.label}
                        {rank.isCorrect && <span className="text-success ml-1">(correct)</span>}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${rank.isCorrect ? 'bg-success' : 'bg-primary'}`}
                          style={{ 
                            width: `${targetTotal > 0 ? (rank.value / targetTotal) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span className="font-mono text-sm w-8 text-right">{rank.value}</span>
                    </div>
                  ))}
                </div>
              </TacticalCard>

              {/* Decoy Detection */}
              <TacticalCard header="Decoy Conference Picks">
                <div className="space-y-3">
                  {[
                    { label: 'Decoy Rank 1', value: evalData.decoy_rank_distribution?.rank1 || 0 },
                    { label: 'Decoy Rank 2', value: evalData.decoy_rank_distribution?.rank2 || 0 },
                    { label: 'Decoy Rank 3', value: evalData.decoy_rank_distribution?.rank3 || 0 },
                    { label: 'No Decoy Picked', value: evalData.decoy_rank_distribution?.notPicked || 0 },
                  ].map(pick => (
                    <div key={pick.label} className="flex items-center gap-3">
                      <span className="text-xs font-mono w-24 text-muted-foreground">{pick.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${pick.label === "No Decoy Picked" ? 'bg-success' : 'bg-accent'}`}
                          style={{ 
                            width: `${targetTotal > 0 ? (pick.value / targetTotal) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span className="font-mono text-sm w-8 text-right">{pick.value}</span>
                    </div>
                  ))}
                </div>
              </TacticalCard>
            </div>
          </section>
        )}

        {/* Top Combinations */}
        <section>
          <TacticalCard 
            header="Top Conference/Topic Combinations"
            headerAction={
              <ExportButton 
                data={data.top_combinations || []} 
                filename="top-combinations"
                columns={[
                  { key: 'conference', header: 'Conference' },
                  { key: 'topic', header: 'Topic' },
                  { key: 'count', header: 'Count' },
                  { key: 'avg_iterations', header: 'Avg Iterations' },
                  { key: 'manager_vendors', header: 'Manager (O/A)' },
                ]}
              />
            }
          >
            <TacticalTable
              columns={[
                { key: "conference", header: "Conference" },
                { key: "topic", header: "Topic" },
                { key: "count", header: "Count", align: "center" },
                { key: "avg_iterations", header: "Avg Iterations", align: "center" },
                { key: "manager_vendors", header: "Manager (O/A)", align: "right" },
              ]}
              data={data.top_combinations || []}
            />
          </TacticalCard>
        </section>

        {/* Tool Usage */}
        <section>
          <TacticalCard header="Tool Usage">
            <TacticalTable
              columns={[
                { key: "tool_name", header: "Tool" },
                { key: "total_calls", header: "Total Calls", align: "right" },
                { 
                  key: "pct_of_iterations", 
                  header: "% of Iterations", 
                  align: "right",
                  render: (value: any) => `${value}%`
                },
                { 
                  key: "vendor_breakdown", 
                  header: "OpenAI / Anthropic", 
                  align: "right",
                  render: (_value: any, row: any) => `${row.openai_calls || 0} / ${row.anthropic_calls || 0}`
                },
              ]}
              data={data.tool_usage || []}
            />
          </TacticalCard>
        </section>

        {/* Vendor Summary with Acceptance by Iteration */}
        <section>
          <h2 className="tactical-header mb-4">Vendor Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OpenAI */}
            <TacticalCard header="OpenAI (as Worker)" glowColor="primary">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Iterations</p>
                    <p className="text-2xl font-mono font-bold">{data.acceptance_by_iteration?.openai_total || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Success Rate</p>
                    <p className="text-2xl font-mono font-bold text-success">100%</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground mb-2">Escaped at Iteration:</div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[1, 2, 3].map(iter => {
                      const accepted = data.acceptance_by_iteration?.by_iteration?.[String(iter)]?.openai || 0;
                      const total = data.acceptance_by_iteration?.openai_total || 0;
                      return (
                        <div key={iter} className="flex flex-col">
                          <span className="text-xs text-muted-foreground">{iter}</span>
                          <span className={`text-sm font-medium ${accepted > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                            {accepted}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            /{total}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TacticalCard>

            {/* Anthropic */}
            <TacticalCard header="Anthropic (as Worker)" glowColor="accent">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Iterations</p>
                    <p className="text-2xl font-mono font-bold">{data.acceptance_by_iteration?.anthropic_total || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Success Rate</p>
                    <p className="text-2xl font-mono font-bold text-success">100%</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground mb-2">Escaped at Iteration:</div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[1, 2, 3].map(iter => {
                      const accepted = data.acceptance_by_iteration?.by_iteration?.[String(iter)]?.anthropic || 0;
                      const total = data.acceptance_by_iteration?.anthropic_total || 0;
                      return (
                        <div key={iter} className="flex flex-col">
                          <span className="text-xs text-muted-foreground">{iter}</span>
                          <span className={`text-sm font-medium ${accepted > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                            {accepted}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            /{total}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TacticalCard>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
