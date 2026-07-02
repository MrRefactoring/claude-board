import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ToggleProps {
  enabled?: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ enabled, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${enabled ? 'bg-claude' : 'bg-surface-600'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

interface SettingRowProps {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export function SettingRow({ icon: Icon, label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <Icon size={16} className="text-surface-400 mt-0.5 flex-shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm text-surface-200">{label}</div>
          {description && <div className="text-[11px] text-surface-500 mt-0.5">{description}</div>}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
