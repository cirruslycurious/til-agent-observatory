import { BookOpenText, Terminal } from 'lucide-react';

type ViewMode = 'narrative' | 'trace';

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { mode: ViewMode; label: string; desc: string; icon: JSX.Element }[] = [
  { mode: 'narrative', label: 'Narrative', desc: 'Story first', icon: <BookOpenText className="w-4 h-4" /> },
  { mode: 'trace', label: 'Trace', desc: 'Full event log', icon: <Terminal className="w-4 h-4" /> },
];

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex bg-panel border border-border p-1 shadow-tactical">
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          onClick={() => onChange(opt.mode)}
          className={`flex-1 px-3 py-2 text-left transition-colors border border-transparent ${
            mode === opt.mode
              ? 'bg-ink text-orange-500 border-border'
              : 'text-white hover:text-orange-500/80'
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold">
            {opt.icon}
            {opt.label}
          </div>
          <div className={`text-xs ${mode === opt.mode ? 'text-orange-500/80' : 'text-white/70'}`}>{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}
