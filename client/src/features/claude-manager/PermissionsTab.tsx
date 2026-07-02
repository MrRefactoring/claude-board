import { useState, useEffect } from 'react';
import { Check, XCircle, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { PermissionRules } from './types';
import { LoadingState, ErrorBanner } from './shared';

// ─── Permissions ───
export default function PermissionsTab() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PermissionRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .getPermissionRules()
      .then((d) => {
        setRules(d as PermissionRules);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorBanner message={error} />;
  const allowRules = rules?.allow || [];
  const softDenyRules = rules?.soft_deny || [];
  const blockRules = rules?.block || [];
  const RuleCard = ({ rule, icon: Icon, color }: { rule: string; icon: LucideIcon; color: string }) => {
    const [title, ...rest] = rule.split(':');
    const desc = rest.join(':').trim();
    return (
      <div className="bg-surface-800/50 rounded-lg px-3 py-2 border border-surface-700/30">
        <div className="flex items-start gap-2">
          <Icon size={12} className={`${color} flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-xs font-semibold text-surface-200">{title?.trim()}</span>
            {desc && <p className="text-[10px] text-surface-500 mt-0.5 leading-relaxed">{desc}</p>}
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-surface-500">{t('cm.permissions.desc')}</p>
      {allowRules.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
            <Check size={11} /> {t('cm.permissions.allow')} ({allowRules.length})
          </span>
          {allowRules.map((r, i) => (
            <RuleCard key={i} rule={r} icon={Check} color="text-emerald-400" />
          ))}
        </div>
      )}
      {softDenyRules.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
            <HelpCircle size={11} /> {t('cm.permissions.softDeny')} ({softDenyRules.length})
          </span>
          {softDenyRules.map((r, i) => (
            <RuleCard key={i} rule={r} icon={HelpCircle} color="text-amber-400" />
          ))}
        </div>
      )}
      {blockRules.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-red-400 flex items-center gap-1">
            <XCircle size={11} /> {t('cm.permissions.block')} ({blockRules.length})
          </span>
          {blockRules.map((r, i) => (
            <RuleCard key={i} rule={r} icon={XCircle} color="text-red-400" />
          ))}
        </div>
      )}
    </div>
  );
}
