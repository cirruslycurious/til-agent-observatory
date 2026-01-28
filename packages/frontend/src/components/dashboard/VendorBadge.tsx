import { cn } from "../../lib/utils";
import { Sparkles, Brain } from "lucide-react";

type Vendor = "openai" | "anthropic";

interface VendorBadgeProps {
  vendor: Vendor;
  className?: string;
  showIcon?: boolean;
}

const vendorConfig: Record<Vendor, { label: string; icon: typeof Sparkles; className: string }> = {
  openai: {
    label: "GPT",
    icon: Sparkles,
    className: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400",
  },
  anthropic: {
    label: "Claude",
    icon: Brain,
    className: "bg-amber-500/20 border-amber-500/50 text-amber-400",
  },
};

export function VendorBadge({ vendor, className, showIcon = true }: VendorBadgeProps) {
  const config = vendorConfig[vendor];
  const Icon = config.icon;

  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono font-medium",
        config.className,
        className
      )}
    >
      {showIcon && <Icon className="w-3 h-3" />}
      {config.label}
    </span>
  );
}
