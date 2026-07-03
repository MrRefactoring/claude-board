import { useState, useEffect, useCallback } from 'react';
import { Plug, Trash2, ToggleLeft, ToggleRight, Download, Loader2, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Plugin, Marketplace } from './types';
import { INPUT, LoadingState, EmptyState, ErrorBanner, Badge, RefreshBtn } from './shared';

// ─── Plugins ───
export default function PluginsTab() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [installName, setInstallName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [mpSource, setMpSource] = useState('');
  const [addingMp, setAddingMp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, m] = await Promise.all([api.listPlugins(), api.listMarketplaces()]);
      setPlugins(Array.isArray(p) ? p : []);
      setMarketplaces(Array.isArray(m) ? m : []);
    } catch (e) {
      setError((e as Error).message);
      setPlugins([]);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: the sync loading-flag toggle marks the refetch start
    load();
  }, [load]);
  const handleInstall = async () => {
    if (!installName.trim()) return;
    setInstalling(true);
    setError(null);
    try {
      setPlugins((await api.installPlugin(installName.trim())) as Plugin[]);
      setInstallName('');
    } catch (e) {
      setError((e as Error).message);
    }
    setInstalling(false);
  };
  const handleUninstall = async (name: string) => {
    setActionLoading(name);
    try {
      setPlugins((await api.uninstallPlugin(name)) as Plugin[]);
    } catch (e) {
      setError((e as Error).message);
    }
    setActionLoading(null);
  };
  const handleToggle = async (name: string, enabled: boolean) => {
    setActionLoading(name);
    try {
      setPlugins((await api.togglePlugin(name, enabled)) as Plugin[]);
    } catch (e) {
      setError((e as Error).message);
    }
    setActionLoading(null);
  };
  const handleAddMp = async () => {
    if (!mpSource.trim()) return;
    setAddingMp(true);
    setError(null);
    try {
      setMarketplaces(
        (await (api.addMarketplace as (source: string) => Promise<unknown>)(mpSource.trim())) as Marketplace[],
      );
      setMpSource('');
    } catch (e) {
      setError((e as Error).message);
    }
    setAddingMp(false);
  };
  const handleRemoveMp = async (name: string) => {
    try {
      setMarketplaces((await api.removeMarketplace(name)) as Marketplace[]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const pluginList = Array.isArray(plugins) ? plugins : [];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-surface-500 mb-2">
          {t('cm.plugins.desc')} (<code className="bg-surface-700 px-1 rounded">{t('cm.plugins.placeholder')}</code>)
        </p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Download size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              placeholder={t('cm.plugins.placeholder')}
              className={`${INPUT} w-full pl-8 font-mono`}
            />
          </div>
          <button
            onClick={handleInstall}
            disabled={!installName.trim() || installing}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 rounded-lg disabled:opacity-50"
          >
            {installing ? <Loader2 size={12} className="animate-spin" /> : t('cm.plugins.install')}
          </button>
          <RefreshBtn loading={loading} onClick={load} />
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading && !plugins ? (
        <LoadingState />
      ) : pluginList.length === 0 ? (
        <EmptyState message={t('cm.plugins.empty')} />
      ) : (
        <div className="space-y-1.5">
          <span className="text-[10px] text-surface-500 font-medium">
            {t('cm.plugins.installed')} ({pluginList.length})
          </span>
          {pluginList.map((p, i) => {
            const name = typeof p === 'string' ? p : p.name;
            const enabled = typeof p === 'object' ? p.enabled !== false : true;
            const version = typeof p === 'object' ? p.version : '';
            const scope = typeof p === 'object' ? p.scope : '';
            return (
              <div
                key={i}
                className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-3 py-2.5 border border-surface-700/30"
              >
                <Plug size={14} className={enabled ? 'text-emerald-400' : 'text-surface-600'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${enabled ? 'text-surface-200' : 'text-surface-500'}`}>
                      {name}
                    </span>
                    {version && <Badge color="surface">v{version}</Badge>}
                    {scope && <span className="text-[9px] text-surface-600">{scope}</span>}
                  </div>
                </div>
                <button onClick={() => handleToggle(name, !enabled)} disabled={actionLoading === name} className="p-1">
                  {enabled ? (
                    <ToggleRight size={18} className="text-emerald-400" />
                  ) : (
                    <ToggleLeft size={18} className="text-surface-500" />
                  )}
                </button>
                <button
                  onClick={() => handleUninstall(name)}
                  disabled={actionLoading === name}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-600 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="border-t border-surface-800 pt-4 space-y-2">
        <span className="text-xs font-medium text-surface-400 flex items-center gap-1.5">
          <Store size={12} /> {t('cm.plugins.marketplaces')}
        </span>
        <div className="flex gap-2">
          <input
            value={mpSource}
            onChange={(e) => setMpSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddMp()}
            placeholder={t('cm.plugins.mpPlaceholder')}
            className={`${INPUT} flex-1 font-mono`}
          />
          <button
            onClick={handleAddMp}
            disabled={!mpSource.trim() || addingMp}
            className="px-3 py-1.5 text-xs font-medium bg-claude/15 text-claude hover:bg-claude/25 rounded-lg disabled:opacity-50"
          >
            {addingMp ? <Loader2 size={12} className="animate-spin" /> : t('cm.plugins.addMp')}
          </button>
        </div>
        {marketplaces.map((m, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-surface-800/30 rounded-lg px-3 py-2 border border-surface-700/20"
          >
            <Store size={13} className="text-purple-400" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-surface-300">{m.name}</span>
              {m.source && <p className="text-[10px] text-surface-600 mt-0.5">{m.source}</p>}
            </div>
            <button
              onClick={() => handleRemoveMp(m.name)}
              className="p-1 rounded hover:bg-red-500/20 text-surface-600 hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
