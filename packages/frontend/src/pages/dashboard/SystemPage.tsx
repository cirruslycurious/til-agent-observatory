/**
 * System Dashboard Page
 * Story 5.6: System Performance Dashboard
 * Focused on timing metrics (P50/P90/P99/Avg) with breakdowns
 */

import { useCallback } from 'react';
import { DashboardLayout, MetricCard } from '../../components/dashboard';
import { dashboardService, type SystemResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardContext } from '../../context/DashboardContext';

export function SystemPage() {
  const { startDate, endDate } = useDashboardContext();
  
  const fetchFn = useCallback(
    (start?: string, end?: string) => dashboardService.getSystem(start, end),
    []
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<SystemResponse>({
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

  const formatSeconds = (s: number | null) => {
    if (s === null) return 'N/A';
    if (s < 60) return `${s.toFixed(1)}s`;
    return `${(s / 60).toFixed(1)}m`;
  };

  // Helper to render timing row
  const TimingRow = ({ label, timing, highlight }: { 
    label: string; 
    timing: { p50: number | null; p90: number | null; p99: number | null; avg: number | null; n: number };
    highlight?: boolean;
  }) => (
    <tr className={highlight ? 'bg-white/5' : ''}>
      <td className="px-4 py-2 text-sm font-medium">{label}</td>
      <td className="px-4 py-2 text-sm text-right">{formatSeconds(timing.p50)}</td>
      <td className="px-4 py-2 text-sm text-right">{formatSeconds(timing.p90)}</td>
      <td className="px-4 py-2 text-sm text-right">{formatSeconds(timing.p99)}</td>
      <td className="px-4 py-2 text-sm text-right">{formatSeconds(timing.avg)}</td>
      <td className="px-4 py-2 text-sm text-right text-[color:var(--secondary)]">{timing.n}</td>
    </tr>
  );

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      <div className="space-y-6">

        {/* Overall Timing */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Overall Timing</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label="Sample Size"
              value={data.timing.sample_size}
              sublabel="jobs with timing"
            />
            <MetricCard
              label="P50 (Median)"
              value={formatSeconds(data.timing.p50_seconds)}
            />
            <MetricCard
              label="P90"
              value={formatSeconds(data.timing.p90_seconds)}
            />
            <MetricCard
              label="P99"
              value={formatSeconds(data.timing.p99_seconds)}
            />
            <MetricCard
              label="Average"
              value={formatSeconds(data.timing.avg_seconds)}
            />
          </div>
        </section>

        {/* Timing by Vendor */}
        {data.timing_by_vendor && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Timing by Vendor (Worker)</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[color:var(--graphite)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--secondary)]">Vendor</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P50</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P90</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P99</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">Avg</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">n</th>
                  </tr>
                </thead>
                <tbody>
                  {data.timing_by_vendor.openai && (
                    <TimingRow label="OpenAI" timing={data.timing_by_vendor.openai} />
                  )}
                  {data.timing_by_vendor.anthropic && (
                    <TimingRow label="Anthropic" timing={data.timing_by_vendor.anthropic} />
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Timing by Conference */}
        {data.timing_by_conf && Object.keys(data.timing_by_conf).length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Timing by Conference</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[color:var(--graphite)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--secondary)]">Conference</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P50</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P90</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P99</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">Avg</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">n</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.timing_by_conf).map(([conf, timing]) => (
                    <TimingRow key={conf} label={conf.replace(/_/g, ' ')} timing={timing} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Timing by Topic */}
        {data.timing_by_topic && Object.keys(data.timing_by_topic).length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Timing by Topic</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[color:var(--graphite)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--secondary)]">Topic</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P50</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P90</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P99</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">Avg</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">n</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.timing_by_topic).map(([topic, timing]) => (
                    <TimingRow key={topic} label={topic.replace(/_/g, ' ')} timing={timing} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Timing by Iteration */}
        {data.timing_by_iteration && Object.keys(data.timing_by_iteration).length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Timing per Iteration</h2>
            <p className="mb-3 text-sm text-[color:var(--secondary)]">
              How long each iteration takes (from goal formulation to manager decision)
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[color:var(--graphite)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--secondary)]">Iteration</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P50</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P90</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">P99</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">Avg</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">n</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.timing_by_iteration)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([iter, timing]) => (
                      <TimingRow key={iter} label={`Iteration ${iter}`} timing={timing} />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
