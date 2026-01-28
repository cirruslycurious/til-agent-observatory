/**
 * Vendors Dashboard Page
 * Story 5.3: Vendor Comparison Dashboard
 * Extended with manager scoring, rejection reasons, worker patterns, creativity impact
 */

import { useCallback } from 'react';
import { XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts';
import { DashboardLayout } from '../../components/dashboard';
import { dashboardService, type VendorsResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardContext } from '../../context/DashboardContext';

export function VendorsPage() {
  const { startDate, endDate } = useDashboardContext();
  
  const fetchFn = useCallback(
    (start?: string, end?: string) => dashboardService.getVendors(start, end),
    []
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<VendorsResponse>({
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

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      <div className="space-y-6">

        {/* Note */}
        {data._note && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
            {data._note}
          </div>
        )}

        {/* 1. Manager Scoring (Quality Scores) */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Manager Scoring</h2>
          <p className="mb-3 text-sm text-[color:var(--secondary)]">
            Single quality score (1-10 scale) given by each vendor as manager when evaluating worker submissions
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* OpenAI */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="mb-3 font-medium text-[#74AA9C]">OpenAI as Manager</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {data.manager_scoring?.openai?.rejection_avg?.toFixed(1) ?? '-'}
                  </div>
                  <div className="text-xs text-[color:var(--secondary)]">
                    Rejection Avg ({data.manager_scoring?.openai?.n_rejections || 0})
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {data.manager_scoring?.openai?.acceptance_avg?.toFixed(1) ?? '-'}
                  </div>
                  <div className="text-xs text-[color:var(--secondary)]">
                    Acceptance Avg ({data.manager_scoring?.openai?.n_acceptances || 0})
                  </div>
                </div>
              </div>
            </div>

            {/* Anthropic */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="mb-3 font-medium text-[#D4A574]">Anthropic as Manager</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {data.manager_scoring?.anthropic?.rejection_avg?.toFixed(1) ?? '-'}
                  </div>
                  <div className="text-xs text-[color:var(--secondary)]">
                    Rejection Avg ({data.manager_scoring?.anthropic?.n_rejections || 0})
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {data.manager_scoring?.anthropic?.acceptance_avg?.toFixed(1) ?? '-'}
                  </div>
                  <div className="text-xs text-[color:var(--secondary)]">
                    Acceptance Avg ({data.manager_scoring?.anthropic?.n_acceptances || 0})
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Rejection Reasons */}
        {data.rejection_reasons && data.rejection_reasons.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Rejection Reason Distribution</h2>
            <p className="mb-3 text-sm text-[color:var(--secondary)]">
              Most common feedback messages when rejecting submissions
            </p>
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <div className="space-y-3">
                {data.rejection_reasons.slice(0, 6).map((reason, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm truncate" title={reason.message}>
                        {reason.message.length > 60 ? reason.message.slice(0, 60) + '...' : reason.message}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-[#74AA9C]">OpenAI: {reason.openai_count}</span>
                        <span className="text-xs text-[#D4A574]">Anthropic: {reason.anthropic_count}</span>
                      </div>
                    </div>
                    <div className="w-16 text-right">
                      <span className="text-lg font-bold">{reason.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 3. Worker Tool Patterns */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Worker Tool Patterns</h2>
          <p className="mb-3 text-sm text-[color:var(--secondary)]">
            How workers use tools within iterations
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* OpenAI */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="mb-3 font-medium text-[#74AA9C]">OpenAI as Worker</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--secondary)]">Same Tool Repeated:</span>
                  <span>{data.worker_patterns?.tool_repeat_rate?.openai ?? 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--secondary)]">Both Web Searches:</span>
                  <span>{data.worker_patterns?.multi_search_rate?.openai ?? 0}%</span>
                </div>
                <div className="text-xs text-[color:var(--muted)] pt-2">
                  Based on {data.worker_patterns?.iterations_analyzed?.openai || 0} iterations
                </div>
              </div>
            </div>

            {/* Anthropic */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="mb-3 font-medium text-[#D4A574]">Anthropic as Worker</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--secondary)]">Same Tool Repeated:</span>
                  <span>{data.worker_patterns?.tool_repeat_rate?.anthropic ?? 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--secondary)]">Both Web Searches:</span>
                  <span>{data.worker_patterns?.multi_search_rate?.anthropic ?? 0}%</span>
                </div>
                <div className="text-xs text-[color:var(--muted)] pt-2">
                  Based on {data.worker_patterns?.iterations_analyzed?.anthropic || 0} iterations
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Creativity/Temperature Impact */}
        {data.creativity_impact && data.creativity_impact.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Creativity Level Impact</h2>
            <p className="mb-3 text-sm text-[color:var(--secondary)]">
              How creativity (temperature) affects quality scores and acceptance
            </p>
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.creativity_impact}>
                    <XAxis 
                      dataKey="creativity_level" 
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <YAxis 
                      yAxisId="score"
                      domain={[0, 10]} 
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                      label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}
                    />
                    <YAxis 
                      yAxisId="rate"
                      orientation="right"
                      domain={[0, 100]} 
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                      label={{ value: 'Accept %', angle: 90, position: 'insideRight', fill: '#9ca3af', fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#141821', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => [
                        name === 'avg_quality_score' ? value?.toFixed(1) : `${value}%`,
                        name === 'avg_quality_score' ? 'Avg Score' : 'Accept Rate'
                      ]}
                      labelFormatter={(label) => `Creativity: ${label}`}
                    />
                    <Line 
                      yAxisId="score"
                      type="monotone" 
                      dataKey="avg_quality_score" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      name="avg_quality_score"
                    />
                    <Line 
                      yAxisId="rate"
                      type="monotone" 
                      dataKey="acceptance_rate" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={{ fill: '#22c55e', r: 4 }}
                      name="acceptance_rate"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-blue-500"></span> Avg Quality Score
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-green-500"></span> Acceptance Rate %
                </span>
              </div>
              <div className="mt-3 text-xs text-[color:var(--secondary)]">
                Sample sizes: {data.creativity_impact.map(c => `${c.creativity_level}: n=${c.sample_size}`).join(', ')}
              </div>
            </div>
          </section>
        )}

      </div>
    </DashboardLayout>
  );
}
