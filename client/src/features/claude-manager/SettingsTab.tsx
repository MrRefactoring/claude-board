import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import { BTN_PRIMARY, LoadingState, ErrorBanner } from './shared';

// ─── Settings ───
export default function SettingsTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    api
      .getClaudeSettings()
      .then((d) => {
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
      await api.saveClaudeSettings(JSON.parse(raw));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };
  if (loading) return <LoadingState />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-surface-500">
          {t('cm.settings.desc')} <code className="bg-surface-700 px-1 rounded">~/.claude/settings.json</code>
        </p>
        <div className="flex items-center gap-2">
          {success && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={10} /> {t('cm.settings.saved')}
            </span>
          )}
          <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : t('cm.settings.save')}
          </button>
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={20}
        className="w-full px-3 py-2 bg-surface-950 border border-surface-700 rounded-lg text-xs font-mono text-surface-300 focus:outline-none focus:ring-1 focus:ring-claude resize-y leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}
