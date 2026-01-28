import { Crown, Wrench, Eye, ServerCog } from 'lucide-react';
import { Actor } from '../../services/api/workflow';

type Size = 'sm' | 'md';

const ICONS: Record<Actor, JSX.Element> = {
  manager: <Crown className="w-3 h-3" />,
  worker: <Wrench className="w-3 h-3" />,
  evaluator: <Eye className="w-3 h-3" />,
  system: <ServerCog className="w-3 h-3" />,
};

const LABELS: Record<Actor, string> = {
  manager: 'MGR',
  worker: 'WRK',
  evaluator: 'EVL',
  system: 'SYS',
};

interface AgentBadgeProps {
  actor: Actor;
  size?: Size;
  label?: string;
}

export function AgentBadge({ actor, size = 'md', label }: AgentBadgeProps) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';
  const className = {
    manager: 'agent-badge agent-badge-manager',
    worker: 'agent-badge agent-badge-worker',
    evaluator: 'agent-badge agent-badge-evaluator',
    system: 'agent-badge agent-badge-system',
  }[actor] || 'agent-badge';

  return (
    <span className={`${className} ${padding}`}>
      {ICONS[actor] || ICONS.system}
      {label || LABELS[actor] || actor}
    </span>
  );
}
