import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Lightbulb, Download, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { TranslateFn } from '@/lib/types';

const DISMISSED_KEY = 'dismissed_suggestions';

export interface Suggestion {
  id: string;
  type?: string;
  title: string;
  description?: string;
  priority?: string;
  action?: string;
  actionArgs?: string;
}

interface SuggestionBannerProps {
  suggestions: Suggestion[];
  setSuggestions: Dispatch<SetStateAction<Suggestion[]>>;
  t: TranslateFn;
}

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
}

function addDismissed(id: string) {
  const dismissed = getDismissed();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  }
}

export function filterDismissed(suggestions: Suggestion[]): Suggestion[] {
  const dismissed = getDismissed();
  return suggestions.filter((s) => !dismissed.includes(s.id));
}

export function SuggestionBanner({ suggestions, setSuggestions, t }: SuggestionBannerProps) {
  const [installing, setInstalling] = useState<string | null>(null);

  const handleAction = async (s: Suggestion) => {
    if (s.action === 'install_plugin') {
      setInstalling(s.id);
      try {
        await api.installPlugin(s.actionArgs!);
        addDismissed(s.id);
        setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      } catch {}
      setInstalling(null);
    } else if (s.action === 'navigate') {
      addDismissed(s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    }
  };

  const dismiss = (id: string) => {
    addDismissed(id);
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-2 mb-6">
      <div className="flex items-center gap-1.5 mb-1">
        <Lightbulb size={13} className="text-amber-400" />
        <span className="text-xs font-medium text-surface-400">{t('dashboard.suggestions')}</span>
      </div>
      {suggestions.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 bg-surface-800/60 border border-surface-700/30 rounded-lg px-4 py-3"
        >
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.priority === 'high' ? 'bg-claude/15' : 'bg-surface-700/50'}`}
          >
            {s.type === 'plugin' ? (
              <Download size={14} className="text-claude" />
            ) : (
              <Lightbulb size={14} className="text-amber-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-surface-200">{s.title}</p>
            <p className="text-[11px] text-surface-500 mt-0.5">{s.description}</p>
          </div>
          {s.action === 'install_plugin' && (
            <button
              onClick={() => handleAction(s)}
              disabled={installing === s.id}
              className="px-3 py-1.5 text-xs font-medium bg-claude hover:bg-claude-light rounded-lg disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
            >
              {installing === s.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {t('dashboard.install')}
            </button>
          )}
          <button onClick={() => dismiss(s.id)} className="p-1 text-surface-600 hover:text-surface-400 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
