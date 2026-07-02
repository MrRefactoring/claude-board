import { Loader2, Zap, Eye, AlertTriangle, X } from 'lucide-react';
import type { GsdPhase, GsdPlanTask } from '@/features/roadmap/types';

interface PlanPreviewPanelProps {
  phase: GsdPhase;
  preview?: GsdPlanTask[];
  loading: boolean;
  generating: boolean;
  hasGeneratedTasks: boolean;
  onLoad: () => void;
  onGenerate: () => void;
  onClear: () => void;
}

export function PlanPreviewPanel({
  phase,
  preview,
  loading,
  generating,
  hasGeneratedTasks,
  onLoad,
  onGenerate,
  onClear,
}: PlanPreviewPanelProps) {
  if (!preview) {
    return (
      <div className="ml-7 mt-2 pt-2 border-t border-surface-700/20 flex items-center gap-2">
        <button
          onClick={onLoad}
          disabled={loading}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-surface-400 hover:text-surface-200 bg-surface-800/60 hover:bg-surface-700/60 rounded-md transition-colors disabled:opacity-50"
          title="Parse PLAN.md files and preview the tasks that would be generated (without creating them)"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
          {loading ? 'Parsing PLAN files…' : 'Preview parsed tasks'}
        </button>
        {hasGeneratedTasks && <span className="text-[9px] text-emerald-500/70 italic">tasks already generated</span>}
      </div>
    );
  }

  if (preview.length === 0) {
    return (
      <div className="ml-7 mt-2 pt-2 border-t border-surface-700/20">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/20">
          <AlertTriangle size={10} />
          <span className="flex-1">PLAN files parsed but no tasks were extracted. Check the XML task blocks.</span>
          <button onClick={onClear} className="opacity-60 hover:opacity-100" title="Close preview">
            <X size={10} />
          </button>
        </div>
      </div>
    );
  }

  // Group by wave (plain obj — `Map` is shadowed by the lucide-react icon import)
  const waves: Record<number, GsdPlanTask[]> = {};
  for (const t of preview) {
    const w = t.wave ?? 1;
    if (!waves[w]) waves[w] = [];
    waves[w].push(t);
  }
  const sortedWaves = Object.keys(waves)
    .map(Number)
    .sort((a, b) => a - b);

  const typeColors: Record<string, string> = {
    auto: 'bg-blue-500/15 text-blue-400',
    manual: 'bg-purple-500/15 text-purple-400',
    ask: 'bg-amber-500/15 text-amber-400',
    checkpoint: 'bg-emerald-500/15 text-emerald-400',
  };

  return (
    <div className="ml-7 mt-2 pt-2 border-t border-surface-700/20 space-y-2">
      <div className="flex items-center gap-2">
        <Eye size={10} className="text-claude" />
        <span className="text-[10px] font-medium text-surface-300">
          Parsed tasks preview
          <span className="text-surface-600 font-normal">
            {' '}
            · {preview.length} tasks · {sortedWaves.length} waves
          </span>
        </span>
        <button
          onClick={onClear}
          className="ml-auto text-surface-500 hover:text-surface-300 p-0.5"
          title="Close preview"
        >
          <X size={10} />
        </button>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto rounded-md bg-surface-900/40 border border-surface-700/30 p-2">
        {sortedWaves.map((waveNum) => {
          const waveTasks = waves[waveNum];
          if (!waveTasks) return null;
          return (
            <div key={waveNum} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold text-surface-500 uppercase tracking-wider">
                  Wave {waveNum}
                </span>
                <span className="text-[9px] text-surface-600">
                  {waveTasks.length} task{waveTasks.length === 1 ? '' : 's'}
                  {waveNum > 1 ? ' · runs after previous wave' : ' · runs first'}
                </span>
              </div>
              {waveTasks.map((t, i) => {
                const tColor = typeColors[t.task_type] || typeColors.auto;
                return (
                  <div
                    key={`${waveNum}-${i}`}
                    className="px-2 py-1.5 rounded-md bg-surface-800/60 border border-surface-700/40 space-y-0.5"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${tColor}`}>{t.task_type}</span>
                      <span className="text-[11px] text-surface-200 flex-1 font-medium">{t.task_name || 'Untitled'}</span>
                      <span className="text-[9px] text-surface-600 font-mono flex-shrink-0">plan-{t.plan_number}</span>
                    </div>
                    {t.files && (
                      <div className="text-[10px] text-surface-500 font-mono pl-1 truncate" title={t.files}>
                        <span className="text-surface-600">files:</span> {t.files}
                      </div>
                    )}
                    {t.done_criteria && (
                      <div className="text-[10px] text-surface-500 pl-1 line-clamp-2">
                        <span className="text-surface-600">done:</span> {t.done_criteria}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {!hasGeneratedTasks && (
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-claude/15 text-claude hover:bg-claude/25 rounded-md transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
            {generating ? 'Creating…' : `Generate ${preview.length} task${preview.length === 1 ? '' : 's'}`}
          </button>
          <span className="text-[10px] text-surface-600">Phase {phase.number} will be queued for execution</span>
        </div>
      )}
    </div>
  );
}
