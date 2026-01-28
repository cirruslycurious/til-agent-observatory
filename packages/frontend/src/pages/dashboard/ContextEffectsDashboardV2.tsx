/**
 * Dashboard V2: Context Effects
 * Difficulty ranking, conference impact, topic impact
 */

import { useCallback, useState } from 'react';
import { DashboardLayout, TacticalCard } from '../../components/dashboard';
import { dashboardService, type DashboardV2ContextResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';

export function ContextEffectsDashboardV2() {
  const [daysBack] = useState(30);
  
  const fetchFn = useCallback(
    () => dashboardService.getV2Context(daysBack),
    [daysBack]
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2ContextResponse>({
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

  const { difficulty_ranking, by_conference, by_topic } = data;

  const getColorForDifficulty = (score: number) => {
    if (score > 3.5) return 'text-red-400';
    if (score > 2.5) return 'text-orange-400';
    if (score > 1.5) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Difficulty Ranking */}
      <TacticalCard header="🎯 Difficulty Ranking (Hardest Contexts)" className="mb-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Difficulty Score = Avg Iterations + (Failure Rate × 5)
        </p>
        {difficulty_ranking.slice(0, 10).map((d, idx) => (
          <div key={idx} className="flex justify-between py-3 border-b border-border/50">
            <div>
              <div className="font-semibold">{d.conference}</div>
              <div className="text-xs text-muted-foreground">{d.topic}</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold font-mono ${getColorForDifficulty(d.difficulty_score)}`}>
                {d.difficulty_score.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.avg_iterations.toFixed(1)} iters · {d.acceptance_rate}% accept · n={d.sample_size}
              </div>
            </div>
          </div>
        ))}
      </TacticalCard>

      {/* Conference Impact */}
      {by_conference.length > 0 && (
        <TacticalCard header="🏛️ Performance by Conference" className="mb-6">
          {by_conference.slice(0, 8).map((c, idx) => (
            <div key={idx} className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">{c.conference}:</span>
              <span className="font-mono text-sm">
                OpenAI {c.openai_acceptance_rate}% | Anthropic {c.anthropic_acceptance_rate}%
                <span className={c.delta > 0 ? 'text-green-400' : c.delta < 0 ? 'text-red-400' : ''}>
                  {' '}({c.delta > 0 ? '+' : ''}{c.delta}%)
                </span>
              </span>
            </div>
          ))}
        </TacticalCard>
      )}

      {/* Topic Impact */}
      {by_topic.length > 0 && (
        <TacticalCard header="📚 Performance by Topic" className="mb-6">
          {by_topic.slice(0, 8).map((t, idx) => (
            <div key={idx} className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">{t.topic}:</span>
              <span className="font-mono text-sm">
                OpenAI {t.openai_acceptance_rate}% | Anthropic {t.anthropic_acceptance_rate}%
                <span className={t.delta > 0 ? 'text-green-400' : t.delta < 0 ? 'text-red-400' : ''}>
                  {' '}({t.delta > 0 ? '+' : ''}{t.delta}%)
                </span>
              </span>
            </div>
          ))}
        </TacticalCard>
      )}
    </DashboardLayout>
  );
}
