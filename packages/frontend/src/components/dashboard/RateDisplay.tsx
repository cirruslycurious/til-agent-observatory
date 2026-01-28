/**
 * RateDisplay Component
 * Displays a rate metric with Wilson confidence interval
 */

import type { RateWithCI } from '../../services/api/dashboard';

interface RateDisplayProps {
  data: RateWithCI;
  label: string;
  showCI?: boolean;
  asPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function RateDisplay({ 
  data, 
  label, 
  showCI = true, 
  asPercentage = true,
  size = 'md' 
}: RateDisplayProps) {
  const formatRate = (rate: number) => {
    if (asPercentage) {
      return `${(rate * 100).toFixed(1)}%`;
    }
    return rate.toFixed(3);
  };

  const sizeStyles = {
    sm: { value: 'text-lg', label: 'text-xs', ci: 'text-xs' },
    md: { value: 'text-2xl', label: 'text-sm', ci: 'text-xs' },
    lg: { value: 'text-3xl', label: 'text-base', ci: 'text-sm' },
  };

  const styles = sizeStyles[size];
  const isLowN = data.n < 20;

  return (
    <div className="space-y-1">
      <p className={`${styles.label} text-[color:var(--secondary)]`}>{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={`${styles.value} font-semibold text-[color:var(--primary)]`}>
          {formatRate(data.rate)}
        </span>
        <span className={`${styles.ci} text-[color:var(--muted)]`}>
          n={data.n}
        </span>
      </div>
      {showCI && data.n > 0 && (
        <p className={`${styles.ci} text-[color:var(--muted)]`}>
          CI: [{formatRate(data.ci_low)}, {formatRate(data.ci_high)}]
          {isLowN && (
            <span className="ml-2 text-amber-400" title="Low sample size - interpret with caution">
              (low N)
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Compact rate display for tables
 */
interface CompactRateProps {
  data: RateWithCI;
  showN?: boolean;
}

export function CompactRate({ data, showN = true }: CompactRateProps) {
  const percentage = (data.rate * 100).toFixed(1);
  const isLowN = data.n < 20;

  return (
    <span className={isLowN ? 'text-amber-400' : ''} title={
      `${percentage}% [${(data.ci_low * 100).toFixed(1)}%, ${(data.ci_high * 100).toFixed(1)}%] n=${data.n}`
    }>
      {percentage}%
      {showN && <span className="ml-1 text-[color:var(--muted)]">({data.n})</span>}
    </span>
  );
}
