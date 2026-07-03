import { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Agent } from './types';
import { LoadingState, EmptyState, ErrorBanner } from './shared';

// ─── Agents ───
export default function AgentsTab() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .listAgents()
      .then((d) => {
        setAgents(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, []);
  if (loading) return <LoadingState />;
  if (error) return <ErrorBanner message={error} />;
  const userAgents = (agents || []).filter((a) => a.type === 'user');
  const builtinAgents = (agents || []).filter((a) => a.type === 'builtin');
  return (
    <div className="space-y-4">
      <p className="text-xs text-surface-500">{t('cm.agents.desc')}</p>
      {userAgents.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-surface-500 font-medium">
            {t('cm.agents.user')} ({userAgents.length})
          </span>
          {userAgents.map((a, i) => (
            <AgentCard key={i} agent={a} />
          ))}
        </div>
      )}
      {builtinAgents.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-surface-500 font-medium">
            {t('cm.agents.builtin')} ({builtinAgents.length})
          </span>
          {builtinAgents.map((a, i) => (
            <AgentCard key={i} agent={a} />
          ))}
        </div>
      )}
      {(agents || []).length === 0 && <EmptyState message={t('cm.agents.empty')} />}
    </div>
  );
}
function AgentCard({ agent }: { agent: Agent }) {
  const colors: Record<string, string> = {
    haiku: 'text-green-400',
    sonnet: 'text-blue-400',
    opus: 'text-purple-400',
    inherit: 'text-surface-400',
  };
  return (
    <div className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-3 py-2.5 border border-surface-700/30">
      <Bot size={14} className={agent.type === 'builtin' ? 'text-blue-400' : 'text-claude'} />
      <span className="text-sm font-medium text-surface-200 flex-1">{agent.name}</span>
      <span className={`text-[10px] font-mono ${colors[agent.model] || 'text-surface-400'}`}>{agent.model}</span>
    </div>
  );
}
