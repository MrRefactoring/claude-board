import { useState, useEffect } from 'react';
import { History } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Session } from './types';
import { LoadingState, EmptyState, ErrorBanner } from './shared';

// ─── Sessions ───
export default function SessionsTab() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .listSessions()
      .then((d) => {
        setSessions(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorBanner message={error} />;
  const list = sessions || [];
  const formatSize = (bytes: number) => {
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };
  const formatDate = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
  };
  // Group by project
  const grouped: Record<string, Session[]> = {};
  list.forEach((s) => {
    if (!grouped[s.project]) grouped[s.project] = [];
    grouped[s.project]?.push(s);
  });
  return (
    <div className="space-y-4">
      <p className="text-xs text-surface-500">{t('cm.sessions.desc')}</p>
      {list.length === 0 ? (
        <EmptyState message={t('cm.sessions.empty')} />
      ) : (
        Object.entries(grouped).map(([project, sessions]) => (
          <div key={project} className="space-y-1.5">
            <span className="text-[10px] text-surface-500 font-medium font-mono truncate block">{project}</span>
            {sessions.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-3 py-2 border border-surface-700/30"
              >
                <History size={13} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-surface-300 truncate block">{s.sessionId}</span>
                </div>
                <span className="text-[10px] text-surface-500">
                  {s.lines} {t('cm.sessions.lines')}
                </span>
                <span className="text-[10px] text-surface-600">{formatSize(s.size)}</span>
                <span className="text-[10px] text-surface-600">{formatDate(s.modified)}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
