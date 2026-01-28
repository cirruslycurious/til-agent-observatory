import { ReactNode } from "react";

interface TacticalCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "primary" | "accent" | "success";
  header?: string;
  headerAction?: ReactNode;
}

export function TacticalCard({ 
  children, 
  className = "", 
  glowColor,
  header,
  headerAction 
}: TacticalCardProps) {
  const glowClasses = {
    primary: "glow-primary",
    accent: "glow-accent",
    success: "glow-success",
  };

  return (
    <div 
      className={`
        tactical-card relative p-5
        ${glowColor ? glowClasses[glowColor] : ""}
        ${className}
      `}
    >
      {header && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="tactical-header">{header}</h3>
          {headerAction}
        </div>
      )}
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  variant?: "primary" | "accent" | "success";
}

export function TacticalMetricCard({ label, value, subValue, variant = "primary" }: MetricCardProps) {
  const variantClasses = {
    primary: "text-primary text-glow-primary",
    accent: "text-accent",
    success: "text-success",
  };

  return (
    <TacticalCard className="min-h-[120px]">
      <div className="space-y-2">
        <p className="tactical-header">{label}</p>
        <p className={`font-mono text-3xl font-bold tracking-tight ${variantClasses[variant]}`}>
          {value}
        </p>
        {subValue && (
          <p className="text-sm text-muted-foreground font-mono">{subValue}</p>
        )}
      </div>
    </TacticalCard>
  );
}
