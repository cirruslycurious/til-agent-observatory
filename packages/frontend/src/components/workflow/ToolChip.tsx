import { Check, Clock, X } from 'lucide-react';

interface ToolChipProps {
  tool: {
    name: string;
    status: 'success' | 'failed' | 'timeout' | 'pending';
    duration_ms?: number;
    reasoning?: string;
    result_summary?: string;
  };
  showReason?: boolean;
}

export function ToolChip({ tool, showReason }: ToolChipProps) {
  const statusIcon = {
    success: <Check className="w-3 h-3 text-emerald-500" />,
    pending: <Clock className="w-3 h-3 text-amber-500" />,
    failed: <X className="w-3 h-3 text-red-500" />,
    timeout: <Clock className="w-3 h-3 text-amber-500" />,
  }[tool.status];

  return (
    <div className="space-y-1">
      <div className="inline-flex items-center gap-1.5">
        <span className="tool-chip">
          {tool.name}
        </span>
        <span
          className={
            tool.status === 'success'
              ? 'status-success'
              : tool.status === 'pending' || tool.status === 'timeout'
              ? 'status-pending'
              : 'status-error'
          }
        >
          {statusIcon}
        </span>
        {tool.duration_ms !== undefined && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {tool.duration_ms}ms
          </span>
        )}
      </div>
      {showReason && tool.reasoning && (
        <p className="text-[10px] text-muted-foreground/80 pl-2 border-l border-border font-mono">
          {tool.reasoning}
        </p>
      )}
      {showReason && tool.result_summary && (
        <p className="text-[10px] text-muted-foreground/80 pl-2 border-l border-border font-mono">
          {tool.result_summary}
        </p>
      )}
    </div>
  );
}
