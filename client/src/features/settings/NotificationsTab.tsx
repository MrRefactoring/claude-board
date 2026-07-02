import { Bell, Monitor, BellRing, BellOff, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TranslateFn } from '@/lib/types';
import { Toggle, SettingRow } from './shared';
import type { AppSettings, SettingValue } from './types';

type NotifyKey =
  | 'notify_task_completed'
  | 'notify_task_failed'
  | 'notify_task_started'
  | 'notify_revision_requested'
  | 'notify_queue_started';

const NOTIFICATION_ITEMS: { key: NotifyKey; icon: LucideIcon; labelKey: string; descKey: string }[] = [
  {
    key: 'notify_task_completed',
    icon: BellRing,
    labelKey: 'settings.notifyTaskCompleted',
    descKey: 'settings.notifyTaskCompletedDesc',
  },
  {
    key: 'notify_task_failed',
    icon: BellOff,
    labelKey: 'settings.notifyTaskFailed',
    descKey: 'settings.notifyTaskFailedDesc',
  },
  {
    key: 'notify_task_started',
    icon: Bell,
    labelKey: 'settings.notifyTaskStarted',
    descKey: 'settings.notifyTaskStartedDesc',
  },
  {
    key: 'notify_revision_requested',
    icon: Bell,
    labelKey: 'settings.notifyRevisionRequested',
    descKey: 'settings.notifyRevisionRequestedDesc',
  },
  {
    key: 'notify_queue_started',
    icon: Bell,
    labelKey: 'settings.notifyQueueStarted',
    descKey: 'settings.notifyQueueStartedDesc',
  },
];

interface NotificationsTabProps {
  settings: AppSettings;
  onChange: (key: string, value: SettingValue) => void;
  t: TranslateFn;
}

export default function NotificationsTab({ settings, onChange, t }: NotificationsTabProps) {
  const anyEnabled = NOTIFICATION_ITEMS.some((item) => settings[item.key]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-surface-700/30">
        <Monitor size={14} className="text-surface-400" />
        <span className="text-xs text-surface-400">{t('settings.notificationsDesc')}</span>
      </div>

      <div className="divide-y divide-surface-700/30">
        {NOTIFICATION_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <SettingRow key={item.key} icon={Icon} label={t(item.labelKey)} description={t(item.descKey)}>
              <Toggle enabled={settings[item.key]} onChange={(v) => onChange(item.key, v)} />
            </SettingRow>
          );
        })}

        <SettingRow
          icon={anyEnabled && settings.sound_enabled ? Volume2 : VolumeX}
          label={t('settings.soundEnabled')}
          description={t('settings.soundEnabledDesc')}
        >
          <Toggle enabled={settings.sound_enabled} onChange={(v) => onChange('sound_enabled', v)} />
        </SettingRow>
      </div>
    </div>
  );
}
