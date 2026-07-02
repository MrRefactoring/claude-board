import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import type { GsdProject, GsdState } from '@/features/roadmap/types';

function extractProjectSummary(raw: string | undefined): string {
  if (!raw) return '';
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('```')) continue;
    return trimmed.length > 240 ? trimmed.slice(0, 240) + '…' : trimmed;
  }
  return '';
}

interface GsdProjectOverviewProps {
  project: GsdProject | null;
  state: GsdState | null;
}

export function GsdProjectOverview({ project, state }: GsdProjectOverviewProps) {
  const [expanded, setExpanded] = useState(false);
  if (!project) return null;
  const summary = extractProjectSummary(project.raw);

  return (
    <div className="border border-surface-700/50 rounded-xl bg-surface-900/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-surface-500 flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-surface-500 flex-shrink-0" />
        )}
        <BookOpen size={14} className="text-claude flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-surface-200 truncate">{project.name || 'Project Overview'}</h3>
            <span className="text-[9px] text-surface-600 font-mono flex-shrink-0">PROJECT.md</span>
            {state?.current_phase && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full flex-shrink-0">
                {state.current_phase}
              </span>
            )}
          </div>
          {summary && !expanded && <p className="text-[11px] text-surface-500 mt-0.5 line-clamp-1">{summary}</p>}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-surface-700/20">
          {(state?.current_phase || state?.current_step) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              {state.current_phase && (
                <div>
                  <span className="text-surface-500">Phase: </span>
                  <span className="text-amber-400">{state.current_phase}</span>
                </div>
              )}
              {state.current_step && (
                <div>
                  <span className="text-surface-500">Step: </span>
                  <span className="text-surface-300">{state.current_step}</span>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="text-[9px] font-mono text-surface-500 mb-1 uppercase tracking-wider">PROJECT.md</div>
            <pre className="p-3 bg-surface-900 rounded-lg text-[11px] text-surface-400 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto border border-surface-700/30">
              {project.raw}
            </pre>
          </div>
          {state?.raw && (
            <div>
              <div className="text-[9px] font-mono text-surface-500 mb-1 uppercase tracking-wider">STATE.md</div>
              <pre className="p-3 bg-surface-900 rounded-lg text-[11px] text-surface-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-surface-700/30">
                {state.raw}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
