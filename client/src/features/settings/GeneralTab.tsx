import { Power, Minimize2, Trash2, Brain, Gauge, Terminal, Globe, Zap } from 'lucide-react';
import type { Model, TranslateFn } from '@/lib/types';
import { IS_TAURI } from '@/lib/tauriEvents';
import { EFFORT_OPTIONS } from '@/lib/constants';
import { Toggle, SettingRow } from './shared';
import type { AppSettings, SettingValue } from './types';

const EFFORTS = EFFORT_OPTIONS.map((e) => ({ value: e.value, labelKey: `effort.${e.value}` }));

interface GeneralTabProps {
  settings: AppSettings;
  onChange: (key: string, value: SettingValue) => void;
  t: TranslateFn;
  models: Model[];
}

export default function GeneralTab({ settings, onChange, t, models }: GeneralTabProps) {
  return (
    <div className="divide-y divide-surface-700/30">
      {IS_TAURI && (
        <SettingRow icon={Power} label={t('settings.launchAtStartup')} description={t('settings.launchAtStartupDesc')}>
          <Toggle enabled={settings.launch_at_startup} onChange={(v) => onChange('launch_at_startup', v)} />
        </SettingRow>
      )}

      {IS_TAURI && (
        <SettingRow
          icon={Minimize2}
          label={t('settings.minimizeToTray')}
          description={t('settings.minimizeToTrayDesc')}
        >
          <Toggle enabled={settings.minimize_to_tray} onChange={(v) => onChange('minimize_to_tray', v)} />
        </SettingRow>
      )}

      <SettingRow
        icon={Trash2}
        label={t('settings.confirmBeforeDelete')}
        description={t('settings.confirmBeforeDeleteDesc')}
      >
        <Toggle enabled={settings.confirm_before_delete} onChange={(v) => onChange('confirm_before_delete', v)} />
      </SettingRow>

      <SettingRow
        icon={Terminal}
        label={t('settings.autoOpenTerminal')}
        description={t('settings.autoOpenTerminalDesc')}
      >
        <Toggle enabled={settings.auto_open_terminal} onChange={(v) => onChange('auto_open_terminal', v)} />
      </SettingRow>

      <SettingRow
        icon={Zap}
        label={t('settings.chatBypassPermissions')}
        description={t('settings.chatBypassPermissionsDesc')}
      >
        <Toggle enabled={settings.chat_bypass_permissions} onChange={(v) => onChange('chat_bypass_permissions', v)} />
      </SettingRow>

      <SettingRow icon={Brain} label={t('settings.defaultModel')} description={t('settings.defaultModelDesc')}>
        <select
          value={settings.default_model}
          onChange={(e) => onChange('default_model', e.target.value)}
          className="bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 text-xs text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude"
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
              {m.source === 'custom' ? ' (custom)' : ''}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow icon={Gauge} label={t('settings.defaultEffort')} description={t('settings.defaultEffortDesc')}>
        <select
          value={settings.default_effort}
          onChange={(e) => onChange('default_effort', e.target.value)}
          className="bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 text-xs text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude"
        >
          {EFFORTS.map((e) => (
            <option key={e.value} value={e.value}>
              {t(e.labelKey)}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow icon={Globe} label={t('settings.language')} description={t('settings.languageDesc')}>
        <select
          value={settings.language}
          onChange={(e) => onChange('language', e.target.value)}
          className="bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 text-xs text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude"
        >
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </select>
      </SettingRow>
    </div>
  );
}
