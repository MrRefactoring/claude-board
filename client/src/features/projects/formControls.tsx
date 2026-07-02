import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// ─── Shared Components ─────────────────────────────────────────────────────

export function Section({
  title,
  icon: Icon,
  desc,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-800/60">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-surface-400" />}
          <h3 className="text-sm font-medium text-surface-200">{title}</h3>
        </div>
        {desc && <p className="text-xs text-surface-500 mt-1 ml-[22px]">{desc}</p>}
      </div>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: string; children?: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-surface-600 mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function ToggleRow({
  enabled,
  onToggle,
  label,
  desc,
  activeColor = 'emerald',
}: {
  enabled: boolean;
  onToggle: () => void;
  label: ReactNode;
  desc?: ReactNode;
  activeColor?: 'emerald' | 'violet';
}) {
  const colors = {
    emerald: {
      bg: enabled ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'bg-surface-800/60',
      text: enabled ? 'text-emerald-300' : 'text-surface-400 hover:text-surface-300',
      toggle: enabled ? 'bg-emerald-500' : 'bg-surface-600',
      desc: enabled ? 'text-emerald-400/70' : 'text-surface-600',
    },
    violet: {
      bg: enabled ? 'bg-violet-500/10 ring-1 ring-violet-500/30' : 'bg-surface-800/60',
      text: enabled ? 'text-violet-300' : 'text-surface-400 hover:text-surface-300',
      toggle: enabled ? 'bg-violet-500' : 'bg-surface-600',
      desc: enabled ? 'text-violet-400/70' : 'text-surface-600',
    },
  };
  const c = colors[activeColor];

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-all ${c.bg} ${c.text}`}
    >
      <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${c.toggle}`}>
        <div
          className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? 'left-[17px]' : 'left-[3px]'}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className={`text-xs mt-0.5 ${c.desc}`}>{desc}</div>
      </div>
    </button>
  );
}
