/**
 * Tools Dashboard Page
 * Story 5.4: Tool Usage Deep Dive Dashboard
 * Shows tool usage by Conference, Topic, with iteration breakdowns
 */

import { useCallback } from 'react';
import { DashboardLayout, RateDisplay } from '../../components/dashboard';
import { dashboardService, type ToolsResponse, type ToolByIterBreakdown } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardContext } from '../../context/DashboardContext';

// Conference display names
const CONF_LABELS: Record<string, string> = {
  black_hat: 'Black Hat',
  reinvent: 're:Invent',
  kubecon: 'KubeCon',
  gartner_symposium: 'Gartner',
  google_cloud_next: 'Google Cloud',
};

// Topic display names  
const TOPIC_LABELS: Record<string, string> = {
  ai_ml_genai: 'AI/ML',
  security_zero_trust: 'Security',
  cloud_arch_infra: 'Cloud Arch',
  k8s_containers: 'K8s',
  platform_devops: 'DevOps',
  networking_mesh: 'Networking',
  data_analytics: 'Data',
  leadership_governance: 'Leadership',
};

function ToolBreakdownTable({ tools }: { tools: ToolByIterBreakdown[] }) {
  if (!tools || tools.length === 0) return null;
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-2 px-2 text-[color:var(--secondary)]">Tool</th>
            <th className="text-right py-2 px-2 text-[color:var(--secondary)]">Total</th>
            <th className="text-right py-2 px-2 text-[color:var(--secondary)]">Iter 1</th>
            <th className="text-right py-2 px-2 text-[color:var(--secondary)]">Iter 2</th>
            <th className="text-right py-2 px-2 text-[color:var(--secondary)]">Iter 3</th>
            <th className="text-right py-2 px-2 text-[color:var(--secondary)]">Iter 4</th>
            <th className="text-right py-2 px-2 text-[color:var(--secondary)]">Iter 5</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.tool} className="border-b border-white/5 hover:bg-white/5">
              <td className="py-2 px-2 font-mono text-xs">{t.tool}</td>
              <td className="py-2 px-2 text-right font-semibold">{t.total}</td>
              <td className="py-2 px-2 text-right text-gray-400">{t.iter_1 || '-'}</td>
              <td className="py-2 px-2 text-right text-gray-400">{t.iter_2 || '-'}</td>
              <td className="py-2 px-2 text-right text-gray-400">{t.iter_3 || '-'}</td>
              <td className="py-2 px-2 text-right text-gray-400">{t.iter_4 || '-'}</td>
              <td className="py-2 px-2 text-right text-gray-400">{t.iter_5 || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ToolsPage() {
  const { startDate, endDate } = useDashboardContext();
  
  const fetchFn = useCallback(
    (start?: string, end?: string) => dashboardService.getTools(start, end),
    []
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<ToolsResponse>({
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

  const formatDuration = (ms: number | null) => {
    if (ms === null) return 'N/A';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      <div className="space-y-8">

        {/* Tool Metrics Summary */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Tool Metrics</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(data.tool_metrics || []).map((metrics) => (
              <div 
                key={metrics.tool_name}
                className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4"
              >
                <h3 className="font-mono text-sm font-medium mb-3">{metrics.tool_name}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--secondary)]">Calls:</span>
                    <span className="font-semibold">{metrics.total_calls}</span>
                  </div>
                  <RateDisplay data={metrics.success_rate} label="Success" size="sm" />
                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--secondary)]">Avg:</span>
                    <span>{formatDuration(metrics.avg_duration_ms)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tool Usage by Conference */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Tool Usage by Conference</h2>
          <p className="text-sm text-[color:var(--secondary)] mb-4">
            Descending by total, with iteration breakdown
          </p>
          <div className="space-y-6">
            {(data.tool_by_conference || []).map((conf) => (
              <div key={conf.conference} className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
                <h3 className="font-semibold mb-3">{CONF_LABELS[conf.conference] || conf.conference}</h3>
                <ToolBreakdownTable tools={conf.tools} />
              </div>
            ))}
          </div>
        </section>

        {/* Tool Usage by Topic */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Tool Usage by Topic</h2>
          <p className="text-sm text-[color:var(--secondary)] mb-4">
            Descending by total, with iteration breakdown
          </p>
          <div className="space-y-6">
            {(data.tool_by_topic || []).map((topic) => (
              <div key={topic.topic} className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
                <h3 className="font-semibold mb-3">{TOPIC_LABELS[topic.topic] || topic.topic}</h3>
                <ToolBreakdownTable tools={topic.tools} />
              </div>
            ))}
          </div>
        </section>

        {/* Web Search Arguments by Vendor */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Web Search Queries by Vendor</h2>
          <p className="text-sm text-[color:var(--secondary)] mb-4">
            What are OpenAI vs Anthropic workers searching for?
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* OpenAI */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="font-semibold mb-3 text-teal-400">OpenAI Worker Searches</h3>
              {data.web_search_queries?.openai?.length ? (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {data.web_search_queries.openai.map((q, i) => (
                    <li key={i} className="text-sm text-gray-300 border-b border-white/5 pb-2">
                      {q}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No web searches recorded</p>
              )}
            </div>
            
            {/* Anthropic */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="font-semibold mb-3 text-orange-400">Anthropic Worker Searches</h3>
              {data.web_search_queries?.anthropic?.length ? (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {data.web_search_queries.anthropic.map((q, i) => (
                    <li key={i} className="text-sm text-gray-300 border-b border-white/5 pb-2">
                      {q}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No web searches recorded</p>
              )}
            </div>
          </div>
        </section>

      </div>
    </DashboardLayout>
  );
}
