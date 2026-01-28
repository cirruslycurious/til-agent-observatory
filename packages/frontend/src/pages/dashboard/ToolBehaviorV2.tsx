/**
 * Tool Behavior Analysis Dashboard V2
 * Agent Cognitive Behavior Patterns
 * 
 * Research Focus: How do agents think? (not "what wins?")
 * - Tool preferences & strategies
 * - Learning & adaptation across iterations
 * - Vendor cognitive styles (OpenAI vs Anthropic)
 * - Context-driven strategy changes
 */

import { useCallback } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { dashboardService, type DashboardV2ToolBehaviorResponse } from '../../services/api/dashboard';
import { DashboardLayout, TacticalCard } from '../../components/dashboard';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Brain, TrendingUp, Target } from 'lucide-react';

export default function ToolBehaviorV2() {
  const { data, loading, error, lastUpdated, refresh } = useDashboardData<DashboardV2ToolBehaviorResponse>({
    fetchFn: useCallback(() => dashboardService.getV2ToolBehavior(30), []),
    autoRefresh: true,
  });

  if (loading && !data) {
    return (
      <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground font-mono">ANALYZING AGENT COGNITION...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">{error || 'Failed to load tool behavior data'}</p>
        </div>
      </DashboardLayout>
    );
  }

  const confidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-500/20 text-green-400 border-green-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      insufficient: 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-mono border ${colors[confidence as keyof typeof colors]}`}>
        {confidence.toUpperCase()}
      </span>
    );
  };

  const formatToolName = (tool: string) => {
    return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <DashboardLayout lastUpdated={lastUpdated} onRefresh={refresh} loading={loading}>
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono text-primary flex items-center gap-2">
              <Brain className="w-6 h-6" />
              TOOL BEHAVIOR ANALYSIS // AGENT COGNITION
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Research: How do agents think? (not "what wins?")
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground font-mono">SAMPLE SIZE</div>
            <div className="text-2xl font-bold font-mono">{data.meta.sample_size}</div>
            {confidenceBadge(data.meta.confidence)}
          </div>
        </div>

        {/* Key Insights */}
        {data.key_insights.length > 0 && (
          <TacticalCard header="🔍 KEY FINDINGS">
            <div className="space-y-3">
              {data.key_insights.map((insight: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-muted/30 rounded border border-border">
                  <Target className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm">{insight.text}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Confidence: {insight.confidence} (n={insight.sample_size})
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Category: {insight.category}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TacticalCard>
        )}

        {/* Section 1: Overall Tool Usage */}
        <TacticalCard header="📊 OVERALL TOOL USAGE">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.overall_tool_usage.tools}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 15% 18%)" />
                  <XAxis 
                    dataKey="tool" 
                    tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    tickFormatter={formatToolName}
                  />
                  <YAxis tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(220 16% 10%)', 
                      border: '1px solid hsl(185 80% 50% / 0.3)',
                      borderRadius: '4px',
                      fontFamily: 'JetBrains Mono',
                      fontSize: '12px',
                      boxShadow: '0 0 20px hsl(185 80% 50% / 0.2)'
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'usage_rate' ? `${value}%` : value,
                      name === 'usage_rate' ? 'Usage Rate' : 'Count'
                    ]}
                  />
                  <Bar dataKey="usage_rate" fill="hsl(185 80% 50%)" name="Usage Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <MetricCard
                label="Total Jobs"
                value={data.overall_tool_usage.total_jobs.toString()}
              />
              <MetricCard
                label="Unique Tools"
                value={data.overall_tool_usage.unique_tools.toString()}
                variant="success"
              />
              <div className="p-3 rounded bg-muted/30 border border-border">
                <div className="text-xs text-muted-foreground mb-2">Top Tool</div>
                <div className="text-sm font-mono font-bold text-primary">
                  {data.overall_tool_usage.tools[0]?.tool ? formatToolName(data.overall_tool_usage.tools[0].tool) : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.overall_tool_usage.tools[0]?.usage_rate}% usage rate
                </div>
              </div>
            </div>
          </div>
        </TacticalCard>

        {/* Section 2: Strategy Evolution by Iteration */}
        <TacticalCard header="📈 STRATEGY EVOLUTION // LEARNING PATTERNS">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 15% 18%)" />
              <XAxis 
                dataKey="iteration" 
                type="number"
                domain={[1, 3]}
                ticks={[1, 2, 3]}
                tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                label={{ value: 'Iteration', position: 'insideBottom', offset: -5, fill: 'hsl(210 12% 50%)' }}
              />
              <YAxis 
                tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                label={{ value: 'Usage Rate %', angle: -90, position: 'insideLeft', fill: 'hsl(210 12% 50%)' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(220 16% 10%)', 
                  border: '1px solid hsl(185 80% 50% / 0.3)',
                  borderRadius: '4px',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '12px',
                  boxShadow: '0 0 20px hsl(185 80% 50% / 0.2)'
                }}
              />
              <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: 'hsl(210 12% 50%)' }} />
              {data.tool_usage_by_iteration.tools.slice(0, 5).map((toolData: any, idx: number) => {
                const colors = ['hsl(185 80% 50%)', 'hsl(38 92% 55%)', 'hsl(152 70% 45%)', 'hsl(280 65% 55%)', 'hsl(200 80% 60%)'];
                return (
                  <Line
                    key={toolData.tool}
                    data={toolData.by_iteration}
                    type="monotone"
                    dataKey="usage_rate"
                    stroke={colors[idx]}
                    strokeWidth={2}
                    name={formatToolName(toolData.tool)}
                    dot={{ r: 4 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 text-xs text-muted-foreground text-center">
            Iteration sample sizes: {data.tool_usage_by_iteration.iteration_sample_sizes.map((s: any) => 
              `Iter ${s.iteration}: ${s.sample_size}`
            ).join(' | ')}
          </div>
        </TacticalCard>

        {/* Section 3: Vendor Cognitive Styles */}
        <TacticalCard header="🤖 VENDOR COGNITIVE STYLES // OpenAI vs Anthropic">
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-4">
              <span>Sample: OpenAI ({data.tool_usage_by_vendor.sample_sizes.openai}) | Anthropic ({data.tool_usage_by_vendor.sample_sizes.anthropic})</span>
            </div>
            
            <div className="space-y-3">
              {data.tool_usage_by_vendor.comparison.map((comp: any, idx: number) => {
                const maxRate = Math.max(comp.openai_usage_rate, comp.anthropic_usage_rate, 1);
                const deltaColor = Math.abs(comp.delta) > 15 ? 'text-red-400' : 
                                  Math.abs(comp.delta) > 5 ? 'text-yellow-400' : 
                                  'text-green-400';
                
                return (
                  <div key={idx} className="p-3 bg-muted/30 rounded border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono font-bold">{formatToolName(comp.tool)}</span>
                      <span className={`text-sm font-mono font-bold ${deltaColor}`}>
                        Δ {comp.delta > 0 ? '+' : ''}{comp.delta}%
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-primary">OpenAI</span>
                          <span>{comp.openai_usage_rate}%</span>
                        </div>
                        <div className="h-2 bg-background rounded overflow-hidden">
                          <div 
                            className="h-full bg-primary" 
                            style={{ width: `${(comp.openai_usage_rate / maxRate) * 100}%` }}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-accent">Anthropic</span>
                          <span>{comp.anthropic_usage_rate}%</span>
                        </div>
                        <div className="h-2 bg-background rounded overflow-hidden">
                          <div 
                            className="h-full bg-accent" 
                            style={{ width: `${(comp.anthropic_usage_rate / maxRate) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      {comp.interpretation}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </TacticalCard>

        {/* Section 4: Vendor Learning Curves */}
        {data.vendor_learning_curves.curves.length > 0 && (
          <TacticalCard header="🔄 VENDOR LEARNING CURVES // ADAPTATION VELOCITY">
            <div className="text-xs text-muted-foreground mb-4 italic">
              ⚠️ Note: Sample sizes differ per iteration (jobs that fail early don't reach later iterations)
            </div>
            <div className="space-y-6">
              {data.vendor_learning_curves.curves.map((curve: any, idx: number) => (
                <div key={idx} className="p-4 bg-muted/30 rounded border border-border">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-sm font-mono font-bold">{formatToolName(curve.tool)}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Learning Velocity: OpenAI {curve.learning_velocity.openai > 0 ? '+' : ''}{curve.learning_velocity.openai}% | 
                        Anthropic {curve.learning_velocity.anthropic > 0 ? '+' : ''}{curve.learning_velocity.anthropic}% | 
                        Delta: {curve.learning_velocity.delta}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Sample sizes: OpenAI Iter1={data.vendor_learning_curves.sample_sizes?.openai?.[1] || 'N/A'}, 
                        Iter2={data.vendor_learning_curves.sample_sizes?.openai?.[2] || 'N/A'}, 
                        Iter3={data.vendor_learning_curves.sample_sizes?.openai?.[3] || 'N/A'} | 
                        Anthropic Iter1={data.vendor_learning_curves.sample_sizes?.anthropic?.[1] || 'N/A'}, 
                        Iter2={data.vendor_learning_curves.sample_sizes?.anthropic?.[2] || 'N/A'}, 
                        Iter3={data.vendor_learning_curves.sample_sizes?.anthropic?.[3] || 'N/A'}
                      </p>
                    </div>
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 15% 18%)" />
                      <XAxis 
                        dataKey="iteration" 
                        type="number"
                        domain={[1, 3]}
                        ticks={[1, 2, 3]}
                        tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        label={{ value: 'Iteration', position: 'insideBottom', offset: -5, fill: 'hsl(210 12% 50%)' }}
                      />
                      <YAxis tick={{ fill: 'hsl(210 12% 50%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(220 16% 10%)', 
                          border: '1px solid hsl(185 80% 50% / 0.3)',
                          borderRadius: '4px',
                          fontFamily: 'JetBrains Mono',
                          fontSize: '12px',
                          boxShadow: '0 0 20px hsl(185 80% 50% / 0.2)'
                        }}
                      />
                      <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: '11px' }} />
                      <Line
                        data={curve.openai_curve}
                        type="monotone"
                        dataKey="usage_rate"
                        stroke="hsl(185 80% 50%)"
                        strokeWidth={2}
                        name="OpenAI"
                        dot={{ r: 4, fill: 'hsl(185 80% 50%)' }}
                      />
                      <Line
                        data={curve.anthropic_curve}
                        type="monotone"
                        dataKey="usage_rate"
                        stroke="hsl(38 92% 55%)"
                        strokeWidth={2}
                        name="Anthropic"
                        dot={{ r: 4, fill: 'hsl(38 92% 55%)' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </TacticalCard>
        )}

        {/* Section 5: Conference Context Effects */}
        <TacticalCard header="🏛️ CONFERENCE CONTEXT EFFECTS // STRATEGY ADAPTATION">
          <div className="text-xs text-muted-foreground mb-4">
            Sorted by variance (higher = more diverse tool strategies)
          </div>
          <div className="space-y-3">
            {data.tool_usage_by_conference.slice(0, 5).map((conf: any, idx: number) => (
              <div key={idx} className="p-3 bg-muted/30 rounded border border-border">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="text-sm font-mono font-bold">{conf.conference}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      (n={conf.sample_size}, variance={conf.variance})
                    </span>
                  </div>
                  {confidenceBadge(conf.confidence)}
                </div>
                
                <div className="grid grid-cols-5 gap-2">
                  {conf.tools.slice(0, 5).map((tool: any, tidx: number) => (
                    <div key={tidx} className="text-center p-2 bg-background rounded">
                      <div className="text-xs text-muted-foreground truncate" title={formatToolName(tool.tool)}>
                        {formatToolName(tool.tool).split(' ')[0]}
                      </div>
                      <div className="text-lg font-mono font-bold text-primary">{tool.usage_rate}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TacticalCard>

        {/* Section 6: Vendor × Conference Strategies */}
        {data.vendor_conference_strategies.length > 0 && (
          <TacticalCard header="🎯 VENDOR × CONFERENCE STRATEGIES // INTERACTION EFFECTS">
            <div className="space-y-4">
              {data.vendor_conference_strategies.slice(0, 3).map((strategy: any, idx: number) => (
                <div key={idx} className="p-4 bg-muted/30 rounded border border-border">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-sm font-mono font-bold">{strategy.conference}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        OpenAI: {strategy.vendor_sample_sizes.openai} | Anthropic: {strategy.vendor_sample_sizes.anthropic} | 
                        Convergence: {strategy.convergence_score !== null ? `${strategy.convergence_score}%` : 'N/A'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {confidenceBadge(strategy.confidence)}
                      {strategy.convergence_score !== null && (
                        <span className={`px-2 py-1 rounded text-xs font-mono border ${
                          strategy.convergence_score > 80 ? 'bg-green-500/20 text-green-400 border-green-500/50' :
                          strategy.convergence_score > 60 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                          'bg-red-500/20 text-red-400 border-red-500/50'
                        }`}>
                          {strategy.convergence_score > 80 ? 'CONVERGE' : 
                           strategy.convergence_score > 60 ? 'MODERATE' : 'DIVERGE'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground italic mb-3">
                    {strategy.interpretation}
                  </p>
                  
                  {strategy.tools.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono text-muted-foreground">Tool Usage Deltas:</div>
                      {strategy.tools.slice(0, 3).map((tool: any, tidx: number) => (
                        <div key={tidx} className="flex justify-between text-xs">
                          <span className="font-mono">{formatToolName(tool.tool)}</span>
                          <span className={`font-mono font-bold ${
                            Math.abs(tool.delta) > 15 ? 'text-red-400' : 
                            Math.abs(tool.delta) > 5 ? 'text-yellow-400' : 
                            'text-green-400'
                          }`}>
                            Δ {tool.delta > 0 ? '+' : ''}{tool.delta}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TacticalCard>
        )}

        {/* Section 7: Topic Impact */}
        <TacticalCard header="📚 TOPIC IMPACT // CONTENT-DRIVEN STRATEGIES">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.tool_usage_by_topic.slice(0, 6).map((topic: any, idx: number) => (
              <div key={idx} className="p-3 bg-muted/30 rounded border border-border">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="text-sm font-mono font-bold">{topic.topic}</span>
                    <span className="text-xs text-muted-foreground ml-2">(n={topic.sample_size})</span>
                  </div>
                  {confidenceBadge(topic.confidence)}
                </div>
                
                <div className="space-y-1">
                  {topic.tools.slice(0, 3).map((tool: any, tidx: number) => (
                    <div key={tidx} className="flex justify-between text-xs">
                      <span className="truncate">{formatToolName(tool.tool)}</span>
                      <span className="font-mono font-bold text-primary ml-2">{tool.usage_rate}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TacticalCard>
    </DashboardLayout>
  );
}
