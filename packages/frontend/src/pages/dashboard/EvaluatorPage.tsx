/**
 * Evaluator Dashboard Page
 * Story 5.5: Evaluator Analysis Dashboard
 */

import { useCallback } from 'react';
import { DashboardLayout, MetricCard, RateDisplay, ExportButton } from '../../components/dashboard';
import { dashboardService, type EvaluatorResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardContext } from '../../context/DashboardContext';

const CONFERENCES = [
  'black_hat',
  'reinvent',
  'kubecon',
  'gartner_symposium',
  'google_cloud_next',
  'microsoft_ignite',
  'rsa_conference',
];

const DECOYS = ['microsoft_ignite', 'rsa_conference'];

export function EvaluatorPage() {
  const { startDate, endDate } = useDashboardContext();
  
  const fetchFn = useCallback(
    (start?: string, end?: string) => dashboardService.getEvaluator(start, end),
    []
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<EvaluatorResponse>({
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

  // Get max value for heatmap coloring
  const allValues = Object.values(data.confusion_matrix)
    .flatMap(row => Object.values(row));
  const maxValue = Math.max(...allValues, 1);

  const getHeatmapColor = (value: number) => {
    if (value === 0) return 'bg-white/5';
    const intensity = Math.min(value / maxValue, 1);
    if (intensity < 0.33) return 'bg-blue-500/20';
    if (intensity < 0.66) return 'bg-blue-500/40';
    return 'bg-blue-500/60';
  };

  const formatConference = (conf: string) => {
    return conf.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Prepare confusion matrix export data
  const confusionMatrixExport = CONFERENCES.flatMap(target =>
    CONFERENCES.map(predicted => ({
      target,
      predicted,
      count: data.confusion_matrix[target]?.[predicted] ?? 0,
    }))
  ).filter(row => row.count > 0);

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      <div className="space-y-6">

        {/* Accuracy Metrics */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Accuracy</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <RateDisplay 
                data={data.accuracy.top_1_match_rate} 
                label="Top-1 Match Rate"
              />
              <p className="mt-2 text-xs text-[color:var(--muted)]">
                Target: &gt;50%
              </p>
            </div>
            <MetricCard
              label="Sample Size"
              value={data.accuracy.sample_size}
              sublabel="evaluations with predictions"
            />
          </div>
        </section>

        {/* Decoy Analysis */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Decoy Detection</h2>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <RateDisplay 
                  data={data.decoy_analysis.decoy_pick_rate} 
                  label="Decoy Pick Rate"
                />
              </div>
              <div>
                <p className="text-sm text-[color:var(--secondary)] mb-2">Decoy Conferences:</p>
                <ul className="text-sm space-y-1">
                  {data.decoy_analysis.decoys.map(decoy => (
                    <li key={decoy} className="font-mono text-amber-400">
                      {decoy}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-xs text-amber-300">
              {data.decoy_analysis._note}
            </p>
          </div>
        </section>

        {/* Confusion Matrix */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Confusion Matrix</h2>
            <ExportButton data={confusionMatrixExport} filename="confusion-matrix" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left text-[color:var(--secondary)]">
                    Target ↓ / Predicted →
                  </th>
                  {CONFERENCES.map(conf => (
                    <th 
                      key={conf} 
                      className={`px-2 py-2 text-center ${
                        DECOYS.includes(conf) ? 'text-amber-400' : 'text-[color:var(--secondary)]'
                      }`}
                    >
                      {conf.slice(0, 6)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CONFERENCES.map(target => (
                  <tr key={target}>
                    <td className={`px-2 py-2 font-mono ${
                      DECOYS.includes(target) ? 'text-amber-400' : ''
                    }`}>
                      {formatConference(target)}
                    </td>
                    {CONFERENCES.map(predicted => {
                      const value = data.confusion_matrix[target]?.[predicted] ?? 0;
                      const isDiagonal = target === predicted;
                      return (
                        <td 
                          key={predicted}
                          className={`px-2 py-2 text-center ${getHeatmapColor(value)} ${
                            isDiagonal ? 'ring-1 ring-emerald-500/50' : ''
                          }`}
                        >
                          {value > 0 ? value : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-[color:var(--muted)]">
              Diagonal (green outline) shows correct predictions. Decoy rows/columns highlighted in amber.
            </p>
          </div>
        </section>

        {/* Confidence Stats */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Confidence Distribution</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label="Mean"
              value={data.confidence_stats.mean?.toFixed(2) ?? 'N/A'}
            />
            <MetricCard
              label="Min"
              value={data.confidence_stats.min?.toFixed(2) ?? 'N/A'}
            />
            <MetricCard
              label="25th %ile"
              value={data.confidence_stats.p25?.toFixed(2) ?? 'N/A'}
            />
            <MetricCard
              label="75th %ile"
              value={data.confidence_stats.p75?.toFixed(2) ?? 'N/A'}
            />
            <MetricCard
              label="Max"
              value={data.confidence_stats.max?.toFixed(2) ?? 'N/A'}
            />
          </div>
          <p className="mt-2 text-xs text-[color:var(--muted)]">
            Based on {data.confidence_stats.sample_size} evaluations with confidence scores
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
