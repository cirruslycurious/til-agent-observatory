import { cn } from "../../lib/utils";

interface TacticalProgressProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  variant?: "primary" | "accent" | "success" | "warning";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function TacticalProgress({ 
  value, 
  max = 100, 
  label,
  showValue = true,
  variant = "primary",
  size = "md",
  className 
}: TacticalProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  
  const variantStyles = {
    primary: "bg-gradient-to-r from-primary to-primary-glow shadow-[0_0_10px_hsl(var(--primary)/0.5)]",
    accent: "bg-gradient-to-r from-accent to-accent-glow shadow-[0_0_10px_hsl(var(--accent)/0.5)]",
    success: "bg-gradient-to-r from-success to-success-glow shadow-[0_0_10px_hsl(var(--success)/0.5)]",
    warning: "bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]",
  };
  
  const sizeStyles = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && <span className="font-mono text-foreground">{value}</span>}
        </div>
      )}
      <div className={cn("bg-muted rounded-full overflow-hidden", sizeStyles[size])}>
        <div 
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            variantStyles[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
