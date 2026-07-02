import { useState, useEffect } from 'react';
import { Shield, Bot, CheckCircle2, AlertCircle, Loader2, ArrowUpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { AuthInfo } from './types';
import { LoadingState, InfoRow } from './shared';

// ─── Auth & Version ───
export default function AuthTab() {
  const { t } = useTranslation();
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api.getAuthInfo().catch(() => null), api.getClaudeVersion().catch(() => null)]).then(([a, v]) => {
      setAuth(a as AuthInfo | null);
      setVersion(v as string | null);
      setLoading(false);
    });
  }, []);
  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      setUpdateResult((await api.updateClaudeCli()) as string);
      const v = await api.getClaudeVersion().catch(() => null);
      if (v) setVersion(v as string);
    } catch (e) {
      setUpdateResult((e as Error).message);
    }
    setUpdating(false);
  };
  if (loading) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="bg-surface-800/50 rounded-lg border border-surface-700/30 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-surface-300 flex items-center gap-1.5">
          <Shield size={13} className="text-claude" /> {t('cm.auth.account')}
        </h3>
        {auth && !auth.raw ? (
          <div className="space-y-2">
            {auth.email && <InfoRow label={t('cm.auth.email')} value={auth.email} />}
            {auth.subscriptionType && (
              <InfoRow label={t('cm.auth.plan')} value={<span className="capitalize">{auth.subscriptionType}</span>} />
            )}
            {auth.orgName && <InfoRow label={t('cm.auth.org')} value={auth.orgName} />}
            {auth.authMethod && <InfoRow label={t('cm.auth.method')} value={auth.authMethod} />}
            <InfoRow
              label={t('cm.auth.status')}
              value={
                auth.loggedIn ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 size={11} /> {t('cm.auth.authenticated')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertCircle size={11} /> {t('cm.auth.notLoggedIn')}
                  </span>
                )
              }
            />
          </div>
        ) : (
          <p className="text-xs text-surface-500">{t('cm.auth.loginHint')}</p>
        )}
      </div>
      <div className="bg-surface-800/50 rounded-lg border border-surface-700/30 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-surface-300 flex items-center gap-1.5">
          <Bot size={13} className="text-blue-400" /> {t('cm.auth.cli')}
        </h3>
        <InfoRow label={t('cm.auth.version')} value={version || 'Unknown'} />
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 rounded-lg disabled:opacity-50"
          >
            {updating ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />}
            {updating ? t('cm.auth.checking') : t('cm.auth.checkUpdates')}
          </button>
          {updateResult && <span className="text-[10px] text-surface-400">{updateResult}</span>}
        </div>
      </div>
    </div>
  );
}
