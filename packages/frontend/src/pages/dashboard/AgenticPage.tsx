/**
 * Agentic Dashboard Page
 * Story 5.2: Agentic Behavior Analysis Dashboard
 * Focused on tool usage patterns
 */

import { useCallback } from 'react';
import { DashboardLayout, MetricCard, DataTable, ExportButton } from '../../components/dashboard';
import { dashboardService, type AgenticResponse } from '../../services/api/dashboard';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardContext } from '../../context/DashboardContext';

export function AgenticPage() {
  const { startDate, endDate } = useDashboardContext();
  
  const fetchFn = useCallback(
    (start?: string, end?: string) => dashboardService.getAgentic(start, end),
    []
  );

  const { data, loading, error, lastUpdated, refresh } = useDashboardData<AgenticResponse>({
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

  // Calculate totals by vendor
  const openaiTotal = Object.values(data.tool_by_vendor?.openai_worker || {}).reduce((a, b) => a + b, 0);
  const anthropicTotal = Object.values(data.tool_by_vendor?.anthropic_worker || {}).reduce((a, b) => a + b, 0);

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      <div className="space-y-6">

        {/* Causal Disclaimer */}
        {data._note && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
            <strong>Note:</strong> {data._note}
          </div>
        )}

        {/* Summary */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Tool Usage Summary</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Total Tool Calls"
              value={data.tool_usage?.total_calls || 0}
            />
            <MetricCard
              label="OpenAI Worker Calls"
              value={openaiTotal}
              sublabel={`${((openaiTotal / (data.tool_usage?.total_calls || 1)) * 100).toFixed(0)}% of total`}
            />
            <MetricCard
              label="Anthropic Worker Calls"
              value={anthropicTotal}
              sublabel={`${((anthropicTotal / (data.tool_usage?.total_calls || 1)) * 100).toFixed(0)}% of total`}
            />
          </div>
        </section>

        {/* Tool Usage Table */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tool Usage</h2>
            <ExportButton data={data.tool_usage?.by_tool || []} filename="tool-usage" />
          </div>
          <DataTable
            columns={[
              { key: 'tool_name', header: 'Tool' },
              { key: 'call_count', header: 'Total Calls', align: 'right' },
              { 
                key: 'pct_of_total', 
                header: '% of Total', 
                align: 'right',
                render: (row) => `${row.pct_of_total}%`
              },
            ]}
            data={data.tool_usage?.by_tool || []}
            emptyMessage="No tool usage data"
          />
        </section>

        {/* Tool Usage by Vendor */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Tool Usage by Vendor</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* OpenAI Worker */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="mb-3 font-medium text-[#74AA9C]">OpenAI Worker</h3>
              <div className="space-y-2">
                {Object.entries(data.tool_by_vendor?.openai_worker || {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([tool, count]) => (
                    <div key={tool} className="flex justify-between text-sm">
                      <span className="font-mono text-[color:var(--secondary)]">{tool}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                {Object.keys(data.tool_by_vendor?.openai_worker || {}).length === 0 && (
                  <p className="text-sm text-[color:var(--secondary)]">No data</p>
                )}
              </div>
            </div>

            {/* Anthropic Worker */}
            <div className="rounded-xl border border-white/10 bg-[color:var(--graphite)] p-4">
              <h3 className="mb-3 font-medium text-[#D4A574]">Anthropic Worker</h3>
              <div className="space-y-2">
                {Object.entries(data.tool_by_vendor?.anthropic_worker || {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([tool, count]) => (
                    <div key={tool} className="flex justify-between text-sm">
                      <span className="font-mono text-[color:var(--secondary)]">{tool}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                {Object.keys(data.tool_by_vendor?.anthropic_worker || {}).length === 0 && (
                  <p className="text-sm text-[color:var(--secondary)]">No data</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Tool Usage by Iteration */}
        {data.tool_by_iteration && Object.keys(data.tool_by_iteration).length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Tool Usage by Iteration</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[color:var(--graphite)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--secondary)]">Tool</th>
                    {[1, 2, 3].map(iter => (
                      <th key={iter} className="px-4 py-3 text-right text-sm font-medium text-[color:var(--secondary)]">
                        Iter {iter}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.tool_by_iteration).map(([tool, counts]) => (
                    <tr key={tool} className="border-b border-white/5">
                      <td className="px-4 py-2 text-sm font-mono">{tool}</td>
                      {[1, 2, 3].map(iter => (
                        <td key={iter} className="px-4 py-2 text-sm text-right">
                          {counts[iter] || 0}
                        </td>
                      ))}
                    </tr>
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
