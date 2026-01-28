/**
 * Dashboard V2: Evaluator Analysis
 * Accuracy, vendor bias check, confusion matrix, decoy analysis
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard, TacticalMetricCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2EvaluatorResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function EvaluatorV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2Evaluator(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2EvaluatorResponse>({
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

  const { overall_accuracy, vendor_bias_check, confusion_matrix, decoy_analysis } = data;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Overall Accuracy Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <TacticalMetricCard
          label="Top-1 Accuracy"
          value={`${overall_accuracy.top_1_accuracy}%`}
          variant="primary"
        />
        <TacticalMetricCard
          label="Top-3 Accuracy"
          value={`${overall_accuracy.top_3_accuracy}%`}
          variant="success"
        />
        <TacticalMetricCard
          label="Sample Size"
          value={overall_accuracy.sample_size}
        />
      </div>

      {/* Vendor Bias Check */}
      <TacticalCard header="⚖️ Vendor Bias Check" className="mb-6">
        <div className="mb-4">
          <div className={`inline-block rounded-full px-4 py-2 text-sm font-semibold ${
            vendor_bias_check.delta_accuracy < 5 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {vendor_bias_check.bias_status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <h4 className="tactical-header">OpenAI Worker</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accuracy:</span>
              <span className="font-mono font-bold">{vendor_bias_check.openai.accuracy}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Confidence:</span>
              <span className="font-mono">{vendor_bias_check.openai.avg_confidence}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sample:</span>
              <span className="font-mono">{vendor_bias_check.openai.sample_size}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="tactical-header">Anthropic Worker</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accuracy:</span>
              <span className="font-mono font-bold">{vendor_bias_check.anthropic.accuracy}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Confidence:</span>
              <span className="font-mono">{vendor_bias_check.anthropic.avg_confidence}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sample:</span>
              <span className="font-mono">{vendor_bias_check.anthropic.sample_size}</span>
            </div>
          </div>
        </div>
      </TacticalCard>

      {/* Confusion Matrix */}
      {confusion_matrix.length > 0 && (
        <TacticalCard header="🎯 Confusion Matrix (Top Predictions)" className="mb-6">
          {confusion_matrix.slice(0, 5).map((row, idx) => (
            <div key={idx} className="mb-4 p-4 rounded border border-border">
              <div className="mb-2 font-semibold">Actual: {row.actual_conference}</div>
              <div className="flex flex-wrap gap-2">
                {row.predictions.slice(0, 3).map((pred, pidx) => (
                  <div key={pidx} className="rounded bg-card px-3 py-1 text-sm font-mono">
                    {pred.predicted_conference}: <span className="font-bold">{pred.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </TacticalCard>
      )}

      {/* Decoy Analysis */}
      <TacticalCard header="🎭 Decoy Susceptibility" className="mb-6">
        <div className="text-center mb-4">
          <div className="text-4xl font-bold font-mono text-red-400">
            {decoy_analysis.overall_decoy_rate}%
          </div>
          <div className="text-sm text-muted-foreground">
            Overall Decoy Rate ({decoy_analysis.total_decoys} decoys picked)
          </div>
        </div>
      </TacticalCard>
    </DashboardLayout>
  );
}
