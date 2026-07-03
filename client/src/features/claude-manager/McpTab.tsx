import { useState, useEffect, useCallback } from 'react';
import { Server, Trash2, Plus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { McpServer } from './types';
import { INPUT, BTN_PRIMARY, LoadingState, EmptyState, ErrorBanner, Badge, RefreshBtn } from './shared';

// ─── MCP Servers ───
export default function McpTab() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServers((await api.listMcpServers()) as McpServer[]);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: the sync loading-flag toggle marks the refetch start
    load();
  }, [load]);
  const handleRemove = async (name: string) => {
    try {
      setServers((await (api.removeMcpServer as (n: string) => Promise<unknown>)(name)) as McpServer[]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const serverList = Array.isArray(servers) ? servers : [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-surface-500">{t('cm.mcp.desc')}</p>
        <div className="flex gap-2">
          <RefreshBtn loading={loading} onClick={load} />
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-claude/15 text-claude hover:bg-claude/25"
          >
            <Plus size={12} /> {t('cm.mcp.add')}
          </button>
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {showAdd && (
        <AddMcpForm
          onDone={(d) => {
            setServers(d);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {loading && !servers ? (
        <LoadingState />
      ) : serverList.length === 0 ? (
        <EmptyState message={t('cm.mcp.empty')} />
      ) : (
        <div className="space-y-1.5">
          {serverList.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-3 py-2.5 border border-surface-700/30"
            >
              <Server size={14} className={s.connected ? 'text-emerald-400' : 'text-amber-400'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-surface-200">{s.name}</span>
                  {s.connected ? (
                    <Badge color="emerald">{t('cm.mcp.connected')}</Badge>
                  ) : (
                    <Badge color="amber">{s.status || t('cm.mcp.disconnected')}</Badge>
                  )}
                </div>
                <p className="text-[11px] text-surface-500 truncate mt-0.5 font-mono">{s.detail}</p>
              </div>
              <button
                onClick={() => handleRemove(s.name)}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-600 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMcpForm({ onDone, onCancel }: { onDone: (d: McpServer[]) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [scope, setScope] = useState('local');
  const [env, setEnv] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSubmit = async () => {
    if (!name.trim() || !command.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const parts = command.trim().split(/\s+/);
      const envList = env.trim() ? env.trim().split('\n').filter(Boolean) : [];
      onDone((await api.addMcpServer(name.trim(), parts[0] ?? '', parts.slice(1), scope, envList)) as McpServer[]);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };
  return (
    <div className="bg-surface-800/50 rounded-lg border border-surface-700/30 p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-surface-500 mb-1 block">{t('cm.mcp.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-server"
            className={`${INPUT} w-full`}
          />
        </div>
        <div>
          <label className="text-[10px] text-surface-500 mb-1 block">{t('cm.mcp.scope')}</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={`${INPUT} w-full`}>
            <option value="local">Local</option>
            <option value="project">Project</option>
            <option value="user">User</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-surface-500 mb-1 block">{t('cm.mcp.command')}</label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="npx -y @modelcontextprotocol/server-memory"
          className={`${INPUT} w-full font-mono`}
        />
      </div>
      <div>
        <label className="text-[10px] text-surface-500 mb-1 block">{t('cm.mcp.envLabel')}</label>
        <textarea
          value={env}
          onChange={(e) => setEnv(e.target.value)}
          rows={2}
          placeholder="API_KEY=xxx"
          className={`${INPUT} w-full font-mono resize-none`}
        />
      </div>
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200">
          {t('cm.cancel')}
        </button>
        <button onClick={handleSubmit} disabled={!name.trim() || !command.trim() || saving} className={BTN_PRIMARY}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : t('cm.mcp.add')}
        </button>
      </div>
    </div>
  );
}
