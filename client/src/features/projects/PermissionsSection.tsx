import type { LucideIcon } from 'lucide-react';
import { Shield, ShieldAlert, ShieldCheck, Info, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { Section, Field } from './formControls';
import type { ProjectForm } from './useProjectForm';

interface PermissionMode {
  value: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  warning?: string;
}

const PERMISSION_MODES: PermissionMode[] = [
  {
    value: 'auto-accept',
    label: 'Auto Accept',
    desc: 'Full autonomy — all tools allowed',
    icon: ShieldCheck,
    color: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
  },
  {
    value: 'allow-tools',
    label: 'Allowed Tools',
    desc: 'Only specified tools allowed',
    icon: Shield,
    color: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  },
  {
    value: 'default',
    label: 'Default',
    desc: "Claude's built-in permissions",
    icon: ShieldAlert,
    color: 'bg-red-500/20 text-red-300 ring-red-500/30',
    warning:
      'Claude runs with --no-input, so it cannot ask for permission interactively. Tasks will fail if they need unapproved tools.',
  },
];

// ─── Permissions ──
export default function PermissionsSection({ form }: { form: ProjectForm }) {
  const { t } = useTranslation();
  const { permissionMode, setPermissionMode, allowedTools, setAllowedTools } = form;
  const selectedMode = PERMISSION_MODES.find((m) => m.value === permissionMode);
  return (
    <div className="space-y-4">
      <Section title={t('projectModal.permissionMode')} icon={Shield}>
        <div className="grid gap-2">
          {PERMISSION_MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = permissionMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => setPermissionMode(mode.value)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all ${
                  isActive
                    ? `${mode.color} ring-1`
                    : 'bg-surface-800/60 text-surface-500 hover:text-surface-300 hover:bg-surface-800'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/10' : 'bg-surface-700/50'}`}
                >
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className={`text-xs mt-0.5 ${isActive ? 'opacity-75' : 'text-surface-600'}`}>{mode.desc}</div>
                </div>
                {isActive && <CheckCircle2 size={16} className="flex-shrink-0 opacity-60" />}
              </button>
            );
          })}
        </div>

        {selectedMode?.warning && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <Info size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-300 leading-relaxed">{selectedMode.warning}</p>
          </div>
        )}

        {permissionMode === 'allow-tools' && (
          <Field
            label={t('projectModal.allowedTools')}
            hint="Bash, Read, Write, Edit, Glob, Grep, Agent, WebSearch, WebFetch, NotebookEdit"
          >
            <input
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              placeholder="Bash, Read, Write, Edit, Glob, Grep"
              className="input-field font-mono"
            />
          </Field>
        )}
      </Section>
    </div>
  );
}
