/**
 * Dashboard V2: Vendor Manager Deep Dive
 * Analyzes Manager scoring behavior, decision patterns, stratified by conference/topic
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2VendorManagerResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function VendorManagerV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2VendorManager(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2VendorManagerResponse>({
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

  const { scoring_behavior, decision_patterns, stratified_by_conference, stratified_by_topic } = data;

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Scoring Behavior - Full Breakdown */}
      <TacticalCard header="🎯 Manager Scoring Behavior" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 text-muted-foreground font-normal">Vendor</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Rejection</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Acceptance</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Manager Self</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Nova 1</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Nova 2</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Blended</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Penalty</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Avg Final</th>
                <th className="text-right py-2 text-muted-foreground font-normal">Total Scores</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/30">
                <td className="py-2 font-bold">OpenAI</td>
                <td className="text-right font-mono">
                  {scoring_behavior.openai.rejection_scores.mean > 0 
                    ? scoring_behavior.openai.rejection_scores.mean.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono text-green-400">
                  {scoring_behavior.openai.acceptance_scores.mean > 0 
                    ? scoring_behavior.openai.acceptance_scores.mean.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.openai.all_scores.avg_manager_self > 0 
                    ? scoring_behavior.openai.all_scores.avg_manager_self.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.openai.all_scores.avg_nova_1 > 0 
                    ? scoring_behavior.openai.all_scores.avg_nova_1.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.openai.all_scores.avg_nova_2 > 0 
                    ? scoring_behavior.openai.all_scores.avg_nova_2.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.openai.all_scores.avg_blended > 0 
                    ? scoring_behavior.openai.all_scores.avg_blended.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className={`text-right font-mono ${scoring_behavior.openai.all_scores.avg_penalty > 0 ? 'text-red-400' : scoring_behavior.openai.all_scores.avg_penalty < 0 ? 'text-green-400' : ''}`}>
                  {scoring_behavior.openai.all_scores.avg_penalty > 0 
                    ? '+' + scoring_behavior.openai.all_scores.avg_penalty.toFixed(2) 
                    : scoring_behavior.openai.all_scores.avg_penalty < 0 
                    ? scoring_behavior.openai.all_scores.avg_penalty.toFixed(2) 
                    : '0.00'}
                </td>
                <td className="text-right font-mono font-bold">
                  {scoring_behavior.openai.all_scores.avg_final > 0 
                    ? scoring_behavior.openai.all_scores.avg_final.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">{scoring_behavior.openai.all_scores.count}</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">Anthropic</td>
                <td className="text-right font-mono">
                  {scoring_behavior.anthropic.rejection_scores.mean > 0 
                    ? scoring_behavior.anthropic.rejection_scores.mean.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono text-green-400">
                  {scoring_behavior.anthropic.acceptance_scores.mean > 0 
                    ? scoring_behavior.anthropic.acceptance_scores.mean.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.anthropic.all_scores.avg_manager_self > 0 
                    ? scoring_behavior.anthropic.all_scores.avg_manager_self.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.anthropic.all_scores.avg_nova_1 > 0 
                    ? scoring_behavior.anthropic.all_scores.avg_nova_1.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.anthropic.all_scores.avg_nova_2 > 0 
                    ? scoring_behavior.anthropic.all_scores.avg_nova_2.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">
                  {scoring_behavior.anthropic.all_scores.avg_blended > 0 
                    ? scoring_behavior.anthropic.all_scores.avg_blended.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className={`text-right font-mono ${scoring_behavior.anthropic.all_scores.avg_penalty > 0 ? 'text-red-400' : scoring_behavior.anthropic.all_scores.avg_penalty < 0 ? 'text-green-400' : ''}`}>
                  {scoring_behavior.anthropic.all_scores.avg_penalty > 0 
                    ? '+' + scoring_behavior.anthropic.all_scores.avg_penalty.toFixed(2) 
                    : scoring_behavior.anthropic.all_scores.avg_penalty < 0 
                    ? scoring_behavior.anthropic.all_scores.avg_penalty.toFixed(2) 
                    : '0.00'}
                </td>
                <td className="text-right font-mono font-bold">
                  {scoring_behavior.anthropic.all_scores.avg_final > 0 
                    ? scoring_behavior.anthropic.all_scores.avg_final.toFixed(2) 
                    : 'N/A'}
                </td>
                <td className="text-right font-mono">{scoring_behavior.anthropic.all_scores.count}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          <p><strong>Manager Self:</strong> Manager's own assessment | <strong>Nova 1/2:</strong> Dual Nova assessor scores | <strong>Blended:</strong> Average of all 3 | <strong>Penalty:</strong> Mechanical adjustments (positive = penalty, negative = bonus) | <strong>Final:</strong> Blended minus penalties</p>
        </div>
      </TacticalCard>

      {/* Decision Patterns */}
      <TacticalCard header="⚖️ Decision Patterns" className="mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <h4 className="tactical-header">OpenAI Manager</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">First Iter Acceptance:</span>
              <span className="font-mono font-bold text-green-400">
                {(decision_patterns.openai.first_iteration_acceptance.rate * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Iterations:</span>
              <span className="font-mono">{decision_patterns.openai.avg_iterations.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Jobs:</span>
              <span className="font-mono">{decision_patterns.openai.total_jobs}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="tactical-header">Anthropic Manager</h4>
            <div className="flex justify-between">
              <span className="text-muted-foreground">First Iter Acceptance:</span>
              <span className="font-mono font-bold text-green-400">
                {(decision_patterns.anthropic.first_iteration_acceptance.rate * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Iterations:</span>
              <span className="font-mono">{decision_patterns.anthropic.avg_iterations.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Jobs:</span>
              <span className="font-mono">{decision_patterns.anthropic.total_jobs}</span>
            </div>
          </div>
        </div>
      </TacticalCard>

      {/* Performance by Conference with Scoring Breakdown */}
      {stratified_by_conference.length > 0 && (
        <TacticalCard header="🏛️ Performance by Conference" className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 text-muted-foreground font-normal">Conference</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Vendor</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Accept %</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Mgr Self</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Nova 1</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Nova 2</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Blended</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Penalty</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Final</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">n</th>
                </tr>
              </thead>
              <tbody>
                {stratified_by_conference.slice(0, 10).map((c, idx) => (
                  <>
                    <tr key={`${idx}-openai`} className="border-b border-border/20">
                      {idx === 0 || stratified_by_conference[idx - 1].conference !== c.conference ? (
                        <td rowSpan={2} className="py-2 font-bold align-top">{c.conference}</td>
                      ) : null}
                      <td className="text-right py-1 text-blue-400">OpenAI</td>
                      <td className="text-right font-mono py-1">{c.openai_acceptance_rate}%</td>
                      <td className="text-right font-mono py-1">{c.openai_avg_manager_self?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.openai_avg_nova_1?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.openai_avg_nova_2?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.openai_avg_blended?.toFixed(2) || 'N/A'}</td>
                      <td className={`text-right font-mono py-1 ${c.openai_avg_penalty && c.openai_avg_penalty > 0 ? 'text-red-400' : c.openai_avg_penalty && c.openai_avg_penalty < 0 ? 'text-green-400' : ''}`}>
                        {c.openai_avg_penalty ? ((c.openai_avg_penalty > 0 ? '+' : '') + c.openai_avg_penalty.toFixed(2)) : 'N/A'}
                      </td>
                      <td className="text-right font-mono py-1 font-bold">{c.openai_avg_final?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.openai_sample_size}</td>
                    </tr>
                    <tr key={`${idx}-anthropic`} className="border-b border-border/50">
                      <td className="text-right py-1 text-purple-400">Anthropic</td>
                      <td className="text-right font-mono py-1">{c.anthropic_acceptance_rate}%</td>
                      <td className="text-right font-mono py-1">{c.anthropic_avg_manager_self?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.anthropic_avg_nova_1?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.anthropic_avg_nova_2?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.anthropic_avg_blended?.toFixed(2) || 'N/A'}</td>
                      <td className={`text-right font-mono py-1 ${c.anthropic_avg_penalty && c.anthropic_avg_penalty > 0 ? 'text-red-400' : c.anthropic_avg_penalty && c.anthropic_avg_penalty < 0 ? 'text-green-400' : ''}`}>
                        {c.anthropic_avg_penalty ? ((c.anthropic_avg_penalty > 0 ? '+' : '') + c.anthropic_avg_penalty.toFixed(2)) : 'N/A'}
                      </td>
                      <td className="text-right font-mono py-1 font-bold">{c.anthropic_avg_final?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{c.anthropic_sample_size}</td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </TacticalCard>
      )}

      {/* Performance by Topic with Scoring Breakdown */}
      {stratified_by_topic && stratified_by_topic.length > 0 && (
        <TacticalCard header="📚 Performance by Topic" className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 text-muted-foreground font-normal">Topic</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Vendor</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Accept %</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Mgr Self</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Nova 1</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Nova 2</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Blended</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Penalty</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">Final</th>
                  <th className="text-right py-2 text-muted-foreground font-normal">n</th>
                </tr>
              </thead>
              <tbody>
                {stratified_by_topic.slice(0, 10).map((t, idx) => (
                  <>
                    <tr key={`${idx}-openai`} className="border-b border-border/20">
                      {idx === 0 || stratified_by_topic[idx - 1].topic !== t.topic ? (
                        <td rowSpan={2} className="py-2 font-bold align-top">{t.topic}</td>
                      ) : null}
                      <td className="text-right py-1 text-blue-400">OpenAI</td>
                      <td className="text-right font-mono py-1">{t.openai_acceptance_rate}%</td>
                      <td className="text-right font-mono py-1">{t.openai_avg_manager_self?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.openai_avg_nova_1?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.openai_avg_nova_2?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.openai_avg_blended?.toFixed(2) || 'N/A'}</td>
                      <td className={`text-right font-mono py-1 ${t.openai_avg_penalty && t.openai_avg_penalty > 0 ? 'text-red-400' : t.openai_avg_penalty && t.openai_avg_penalty < 0 ? 'text-green-400' : ''}`}>
                        {t.openai_avg_penalty ? ((t.openai_avg_penalty > 0 ? '+' : '') + t.openai_avg_penalty.toFixed(2)) : 'N/A'}
                      </td>
                      <td className="text-right font-mono py-1 font-bold">{t.openai_avg_final?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.openai_sample_size}</td>
                    </tr>
                    <tr key={`${idx}-anthropic`} className="border-b border-border/50">
                      <td className="text-right py-1 text-purple-400">Anthropic</td>
                      <td className="text-right font-mono py-1">{t.anthropic_acceptance_rate}%</td>
                      <td className="text-right font-mono py-1">{t.anthropic_avg_manager_self?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.anthropic_avg_nova_1?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.anthropic_avg_nova_2?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.anthropic_avg_blended?.toFixed(2) || 'N/A'}</td>
                      <td className={`text-right font-mono py-1 ${t.anthropic_avg_penalty && t.anthropic_avg_penalty > 0 ? 'text-red-400' : t.anthropic_avg_penalty && t.anthropic_avg_penalty < 0 ? 'text-green-400' : ''}`}>
                        {t.anthropic_avg_penalty ? ((t.anthropic_avg_penalty > 0 ? '+' : '') + t.anthropic_avg_penalty.toFixed(2)) : 'N/A'}
                      </td>
                      <td className="text-right font-mono py-1 font-bold">{t.anthropic_avg_final?.toFixed(2) || 'N/A'}</td>
                      <td className="text-right font-mono py-1">{t.anthropic_sample_size}</td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </TacticalCard>
      )}
    </DashboardLayout>
  );
}
