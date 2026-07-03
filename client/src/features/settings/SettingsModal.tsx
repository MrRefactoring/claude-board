import { useState, useEffect, useCallback } from 'react';
import { X, Settings, Bell, Info, Brain } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import { useModels } from '@/lib/useModels';
import GeneralTab from './GeneralTab';
import ModelsTab from './ModelsTab';
import NotificationsTab from './NotificationsTab';
import AboutTab from './AboutTab';
import type { AppSettings, SettingValue } from './types';

const TABS = [
  { key: 'general', icon: Settings, labelKey: 'settings.general' },
  { key: 'models', icon: Brain, labelKey: 'settings.modelsTab' },
  { key: 'notifications', icon: Bell, labelKey: 'settings.notifications' },
  { key: 'about', icon: Info, labelKey: 'settings.about' },
];

const DEFAULT_SETTINGS: AppSettings = {
  launch_at_startup: false,
  minimize_to_tray: false,
  confirm_before_delete: true,
  default_model: 'sonnet',
  default_effort: 'medium',
  language: 'en',
  notify_task_completed: true,
  notify_task_failed: true,
  notify_task_started: false,
  notify_revision_requested: true,
  notify_queue_started: false,
  sound_enabled: true,
  auto_open_terminal: false,
  chat_bypass_permissions: false,
};

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { t, setLang } = useTranslation();
  const [tab, setTab] = useState('general');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { models } = useModels();

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getAppSettings();
      setSettings(data as AppSettings);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: settings load once on mount
    void loadSettings();
  }, [loadSettings]);

  const handleChange = useCallback(
    async (key: string, value: SettingValue) => {
      const updated = { ...settings, [key]: value };
      setSettings(updated);

      // Sync language change
      if (key === 'language') {
        setLang(value as string);
      }

      setSaving(true);
      try {
        await api.updateAppSettings({ [key]: value });
      } catch (e) {
        console.error('Failed to save setting:', e);
      } finally {
        setSaving(false);
      }
    },
    [settings, setLang],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700/50">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-claude" />
            <h2 className="text-base font-semibold">{t('settings.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-surface-500 animate-pulse">{t('common.saving')}</span>}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 gap-1 border-b border-surface-700/30">
          {TABS.map((t_) => {
            const Icon = t_.icon;
            return (
              <button
                key={t_.key}
                onClick={() => setTab(t_.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                  tab === t_.key
                    ? 'text-claude border-claude bg-surface-800/30'
                    : 'text-surface-500 border-transparent hover:text-surface-300 hover:bg-surface-800/20'
                }`}
              >
                <Icon size={13} />
                {t(t_.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-surface-500 text-sm">{t('common.loading')}</div>
          ) : (
            <>
              {tab === 'general' && <GeneralTab settings={settings} onChange={handleChange} t={t} models={models} />}
              {tab === 'models' && <ModelsTab t={t} models={models} />}
              {tab === 'notifications' && <NotificationsTab settings={settings} onChange={handleChange} t={t} />}
              {tab === 'about' && <AboutTab t={t} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
