import { useState, useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { api } from '@/lib/api';
import type { TranslateFn } from '@/lib/types';
import { IS_TAURI } from '@/lib/tauriEvents';

interface AboutTabProps {
  t: TranslateFn;
}

export default function AboutTab({ t }: AboutTabProps) {
  const [logsPath, setLogsPath] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;
    api
      .getLogsDir()
      .then((p) => setLogsPath(p as string))
      .catch(() => setLogsPath(null));
  }, []);

  const handleOpenLogs = async () => {
    if (!IS_TAURI || opening) return;
    setOpening(true);
    try {
      await api.openLogsDir();
    } catch (e) {
      console.error('Failed to open logs directory:', e);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-800/60 border border-surface-700/30">
        <span className="text-claude text-3xl">&#10022;</span>
        <div>
          <h3 className="text-base font-semibold text-surface-100">Claude Board</h3>
          <p className="text-xs text-surface-500 mt-0.5">{t('settings.aboutTagline')}</p>
        </div>
        <span className="ml-auto text-xs text-surface-600 font-mono bg-surface-700/50 px-2 py-1 rounded">
          v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-surface-500">{t('settings.version')}</span>
          <span className="text-surface-300 font-mono">
            {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-surface-500">{t('settings.platform')}</span>
          <span className="text-surface-300 font-mono">{navigator.platform || 'unknown'}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-surface-500">{t('settings.runtime')}</span>
          <span className="text-surface-300 font-mono">{IS_TAURI ? 'Tauri Desktop' : 'Web'}</span>
        </div>
      </div>

      {IS_TAURI && (
        <div className="pt-4 border-t border-surface-700/30 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-surface-500 font-semibold">
            {t('settings.diagnostics')}
          </div>
          <div className="text-[11px] text-surface-500">{t('settings.logsDescription')}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenLogs}
              disabled={opening}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700/50 disabled:opacity-50 transition-colors"
            >
              <FolderOpen size={12} />
              {opening ? t('common.loading') : t('settings.openLogsDir')}
            </button>
            {logsPath && (
              <span className="text-[10px] text-surface-600 font-mono truncate" title={logsPath}>
                {logsPath}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-surface-700/30">
        <p className="text-[11px] text-surface-600 text-center">{t('settings.madeBy')}</p>
      </div>
    </div>
  );
}
