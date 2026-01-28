/**
 * MetricCard Component
 * Displays a single metric with optional trend indicator
 */

interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function MetricCard({ 
  label, 
  value, 
  sublabel, 
  trend,
  variant = 'default' 
}: MetricCardProps) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-emerald-500/40',
    warning: 'border-amber-500/40',
    error: 'border-red-500/40',
  };

  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-[color:var(--secondary)]',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  return (
    <div className={`tactical-panel border ${variantStyles[variant]} p-4`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-foreground leading-none">
          {value}
        </span>
        {trend && (
          <span className={`text-sm ${trendColors[trend]}`}>
            {trendIcons[trend]}
          </span>
        )}
      </div>
      {sublabel && (
        <p className="mt-1 text-[12px] text-muted">{sublabel}</p>
      )}
    </div>
  );
}
