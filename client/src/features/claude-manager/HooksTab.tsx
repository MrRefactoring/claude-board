import { useState, useEffect } from 'react';
import { Zap, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { HooksConfig, HookCommand } from './types';
import { BTN_PRIMARY, LoadingState, ErrorBanner, Badge } from './shared';

// ─── Hooks ───
export default function HooksTab() {
  const { t } = useTranslation();
  const [hooks, setHooks] = useState<HooksConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    api
      .getHooks()
      .then((d) => {
        setHooks(d as HooksConfig);
        setRaw(JSON.stringify(d, null, 2));
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, []);
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const parsed = JSON.parse(raw);
      await api.saveHooks(parsed);
      setHooks(parsed);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };
  if (loading) return <LoadingState />;
  const hookEntries = hooks && typeof hooks === 'object' ? Object.entries(hooks) : [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-surface-500">{t('cm.hooks.desc')}</p>
        <div className="flex items-center gap-2">
          {success && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={10} /> {t('cm.hooks.saved')}
            </span>
          )}
          <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : t('cm.save')}
          </button>
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {hookEntries.length > 0 && (
        <div className="space-y-1.5">
          {hookEntries.map(([event, config]) => {
            const commands = (Array.isArray(config) ? config : [config]) as HookCommand[];
            return (
              <div key={event} className="bg-surface-800/50 rounded-lg px-3 py-2.5 border border-surface-700/30">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={12} className="text-amber-400" />
                  <span className="text-xs font-semibold text-surface-300">{event}</span>
                  <Badge color="surface">{commands.length}</Badge>
                </div>
                {commands.map((cmd, i) => (
                  <p key={i} className="text-[11px] text-surface-500 font-mono ml-5 truncate">
                    {typeof cmd === 'string' ? cmd : cmd.command || JSON.stringify(cmd)}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div>
        <label className="text-[10px] text-surface-500 mb-1 block">{t('cm.hooks.editor')}</label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 bg-surface-950 border border-surface-700 rounded-lg text-xs font-mono text-surface-300 focus:outline-none focus:ring-1 focus:ring-claude resize-y leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
