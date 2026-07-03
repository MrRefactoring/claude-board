import { useState } from 'react';
import { Loader2, Package, Download } from 'lucide-react';
import { api } from '@/lib/api';

interface GsdInstallPromptProps {
  projectId: number;
  onInstalled: () => void;
}

export function GsdInstallPrompt({ projectId, onInstalled }: GsdInstallPromptProps) {
  const [installing, setInstalling] = useState(false);
  const [scope, setScope] = useState('global');
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await api.gsdInstall(projectId, scope);
      onInstalled();
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error | undefined)?.message || 'Installation failed');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="border border-surface-700 rounded-xl p-5 bg-gradient-to-br from-surface-800/80 to-surface-900 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-claude/10 flex items-center justify-center flex-shrink-0">
          <Package size={20} className="text-claude" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-surface-100">GSD (Get Shit Done)</h3>
          <p className="text-xs text-surface-500 mt-1">
            GSD is a spec-driven development framework that manages planning phases, roadmaps, and execution through
            structured <code className="text-surface-400 bg-surface-800 px-1 rounded">.planning/</code> files.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex bg-surface-800 rounded-lg p-0.5">
          <button
            onClick={() => setScope('global')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scope === 'global' ? 'bg-surface-700 text-surface-200' : 'text-surface-500 hover:text-surface-300'}`}
          >
            Global (~/.claude)
          </button>
          <button
            onClick={() => setScope('local')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scope === 'local' ? 'bg-surface-700 text-surface-200' : 'text-surface-500 hover:text-surface-300'}`}
          >
            Local (.claude/)
          </button>
        </div>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex items-center gap-1.5 px-4 py-2 bg-claude hover:bg-claude/80 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {installing ? 'Installing...' : 'Install GSD'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  );
}
