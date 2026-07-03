import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Square,
  RotateCcw,
  ArrowDown,
  Pause,
  Play,
  Trash2,
  Search,
  Cpu,
  Coins,
  Activity,
  Maximize2,
  Minimize2,
  Code,
  CheckCircle2,
  ShieldQuestion,
  Check,
  Ban,
} from 'lucide-react';
import { socket } from '@/lib/socket';
import { tauriListen, IS_TAURI } from '@/lib/tauriEvents';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Task, PendingPermission } from '@/lib/types';

import { fmtTokens, groupToolEntries } from '@/features/terminal/terminalHelpers';
import type { LogLine, LogMeta } from '@/features/terminal/terminalHelpers';
import { ToolCard } from '@/features/terminal/ToolCard';
import { ClaudeText } from '@/features/terminal/ClaudeText';
import { SystemLine } from '@/features/terminal/SystemLine';
import { TurnSeparator } from '@/features/terminal/TurnSeparator';
import { ActivityIndicator } from '@/features/terminal/ActivityIndicator';
import { ElapsedTime } from '@/features/terminal/ElapsedTime';

// Opaque display-only snapshot of a ref-buffered array's length (direct ref
// reads during render are forbidden by react-hooks/refs).
const refLen = (r: { current: unknown[] }) => r.current.length;

interface LiveTerminalProps {
  task: Task;
  onClose: () => void;
  layout?: 'side' | 'bottom';
  onToggleLayout?: () => void;
}

/** Raw `task:log` event payload (typed `unknown` in AppEventMap). */
interface TaskLogEvent {
  taskId?: number;
  message?: string;
  logType?: string;
  created_at?: string;
  meta?: LogMeta | null;
}

interface FilterDef {
  id: string;
  label: string;
  count: number | null;
  alert?: boolean;
}

// ═══════════════════════════════════════════════════════════
// ─── Main component ───
// ═══════════════════════════════════════════════════════════
export default function LiveTerminal({ task, onClose, layout = 'side', onToggleLayout }: LiveTerminalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [perms, setPerms] = useState<PendingPermission[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedLogsRef = useRef<LogLine[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Read via ref inside the log handler so toggling pause doesn't tear down
  // and recreate the subscription (logs arriving in that gap would be lost).
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ─── Data loading ───
  useEffect(() => {
    api
      .getTaskLogs(task.id)
      .then((data) => {
        setLogs((data as LogLine[]).map((l) => ({ ...l, meta: l.meta || null })));
      })
      .catch((e: unknown) => console.error('Failed to load task logs:', e));
  }, [task.id]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const d = data as TaskLogEvent;
      if (d.taskId !== task.id) return;
      const entry: LogLine = {
        message: d.message,
        log_type: d.logType,
        created_at: d.created_at,
        meta: d.meta || null,
      };
      if (pausedRef.current) {
        pausedLogsRef.current.push(entry);
      } else {
        setLogs((prev) => (prev.length > 2000 ? [...prev.slice(-1500), entry] : [...prev, entry]));
      }
    };
    if (IS_TAURI) {
      return tauriListen('task:log', handler);
    } else {
      socket.on('task:log', handler);
      return () => socket.off('task:log', handler);
    }
  }, [task.id]);

  // While the task runs, poll for tool-permission requests it raised so the user
  // can approve (Yes / Always / Deny) — the runner blocks until they decide.
  useEffect(() => {
    if (!task.is_running) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate clear of permission cards when the run ends
      setPerms([]);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const all = await api.getPendingPermissions();
        if (alive) setPerms(all.filter((p) => p.task_id === task.id));
      } catch {
        /* transient — retry next tick */
      }
    };
    void tick();
    const iv = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [task.is_running, task.id]);

  const resolvePerm = async (id: string, decision: 'allow' | 'deny', remember = false) => {
    setPerms((prev) => prev.filter((p) => p.id !== id));
    try {
      await api.resolvePermission(id, decision, remember);
    } catch {
      /* the poll re-surfaces it if the resolve didn't land */
    }
  };

  const resumeLogs = useCallback(() => {
    setPaused(false);
    setLogs((prev) => {
      const merged = [...prev, ...pausedLogsRef.current];
      return merged.length > 2000 ? merged.slice(-1500) : merged;
    });
    pausedLogsRef.current = [];
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const handleStop = async () => {
    try {
      await api.stopTask(task.id);
    } catch {}
  };
  const handleRestart = async () => {
    try {
      setLogs([]);
      await api.restartTask(task.id);
    } catch {}
  };

  const toggleToolExpand = useCallback((index: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    setExpandAll((prev) => {
      if (!prev) {
        const idxs = new Set<number>();
        logs.forEach((l, i) => {
          if (l.log_type === 'tool' && l.meta) idxs.add(i);
        });
        setExpandedTools(idxs);
      } else {
        setExpandedTools(new Set());
      }
      return !prev;
    });
  }, [logs]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  // ─── Filtering ───
  const filteredLogs = useMemo(() => {
    let r = logs;
    if (filter === 'claude') r = r.filter((l) => l.log_type === 'claude' && !l.meta?.isThinking);
    else if (filter === 'thinking') r = r.filter((l) => l.log_type === 'claude' && l.meta?.isThinking);
    else if (filter === 'tools') r = r.filter((l) => l.log_type === 'tool' || l.log_type === 'tool_result');
    else if (filter === 'system') r = r.filter((l) => l.log_type === 'system' || l.log_type === 'info');
    else if (filter === 'errors') r = r.filter((l) => l.log_type === 'error');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((l) => (l.message ?? '').toLowerCase().includes(q));
    }
    return r;
  }, [logs, filter, searchQuery]);

  // Group entries
  const groupedEntries = useMemo(() => groupToolEntries(filteredLogs), [filteredLogs]);

  // ─── Stats ───
  const stats = useMemo(() => {
    const tools = logs.filter((l) => l.log_type === 'tool' && !l.meta?.isResult).length;
    const errors = logs.filter((l) => l.log_type === 'error').length;
    const turns = logs.filter((l) => l.log_type === 'claude' && !l.meta?.isThinking).length;
    const thinking = logs.filter((l) => l.log_type === 'claude' && l.meta?.isThinking).length;
    return { tools, errors, turns, thinking };
  }, [logs]);

  const totalTokens = (task.input_tokens || 0) + (task.output_tokens || 0);
  const totalCost = task.total_cost ?? 0;
  const isBottom = layout === 'bottom';
  const panelClass = isBottom
    ? 'relative flex flex-col bg-surface-900 border-t border-surface-800 h-full overflow-hidden'
    : 'relative w-full md:w-[540px] h-full flex-shrink-0 flex flex-col bg-surface-900 md:border-l border-surface-800 overflow-hidden';

  const FILTERS: FilterDef[] = [
    { id: 'all', label: 'All', count: null },
    { id: 'claude', label: 'Claude', count: stats.turns || null },
    { id: 'thinking', label: 'Thinking', count: stats.thinking || null },
    { id: 'tools', label: 'Tools', count: stats.tools || null },
    { id: 'system', label: 'System', count: null },
    { id: 'errors', label: 'Errors', count: stats.errors || null, alert: stats.errors > 0 },
  ];

  // Best-effort snapshot for the pause badge — buffered pushes deliberately do
  // NOT re-render (that is the point of pausing), so the count refreshes on the
  // next unrelated render.
  // eslint-disable-next-line react-hooks/refs -- display-only snapshot of the ref-buffered queue; mirroring it in state would re-render per buffered log and defeat pausing
  const pausedBufferedCount = refLen(pausedLogsRef);

  return (
    <div className={panelClass}>
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-800 bg-surface-900">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold truncate text-surface-100">{task.title}</h3>
            <span className="text-[9px] text-surface-600 font-mono flex-shrink-0">
              {task.task_key || `#${task.id}`}
            </span>
            {task.is_running && (
              <span className="flex items-center gap-1 text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                <Activity size={9} className="animate-pulse" />
                <span className="hidden sm:inline">{t('terminal.running')}</span>
              </span>
            )}
            {!task.is_running && logs.some((l) => l.log_type === 'success') && (
              <span className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                <CheckCircle2 size={9} />
                <span className="hidden sm:inline">{t('terminal.done')}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ActivityIndicator logs={logs} isRunning={task.is_running} />
            {/* Inline stats on mobile */}
            <div className="flex items-center gap-1.5 text-[10px] text-surface-500 sm:hidden">
              <ElapsedTime
                startedAt={task.started_at}
                isRunning={task.is_running}
                workDurationMs={task.work_duration_ms || 0}
                lastResumedAt={task.last_resumed_at}
              />
              {totalTokens > 0 && (
                <span className="flex items-center gap-0.5">
                  <Cpu size={9} />
                  {fmtTokens(totalTokens)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live stats bar - desktop only */}
        <div className="hidden sm:flex items-center gap-2.5 text-[10px] text-surface-500 flex-shrink-0">
          <ElapsedTime
            startedAt={task.started_at}
            isRunning={task.is_running}
            workDurationMs={task.work_duration_ms || 0}
            lastResumedAt={task.last_resumed_at}
          />
          {totalTokens > 0 && (
            <span className="flex items-center gap-0.5">
              <Cpu size={9} />
              {fmtTokens(totalTokens)}
            </span>
          )}
          {totalCost > 0 && (
            <span className="flex items-center gap-0.5">
              <Coins size={9} />${totalCost.toFixed(4)}
            </span>
          )}
          {stats.tools > 0 && (
            <span className={`flex items-center gap-0.5 text-purple-400/60`}>
              <Code size={9} />
              {stats.tools}
            </span>
          )}
          {stats.errors > 0 && <span className="text-red-400/70">{stats.errors} err</span>}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => {
              setShowSearch((s) => !s);
              if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-surface-700 text-claude' : 'text-surface-500 hover:text-surface-200 hover:bg-surface-800'}`}
            title={t('terminal.searchShortcut')}
          >
            <Search size={12} />
          </button>
          {onToggleLayout && (
            <button
              onClick={onToggleLayout}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 hover:text-surface-200 transition-colors"
              title={isBottom ? t('terminal.sidePanel') : t('terminal.bottomPanel')}
            >
              {isBottom ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          {task.is_running && (
            <button
              onClick={handleStop}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-colors"
              title={t('terminal.stop')}
            >
              <Square size={12} />
            </button>
          )}
          <button
            onClick={handleRestart}
            className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 hover:text-amber-400 transition-colors"
            title={t('terminal.restart')}
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ═══ Search ═══ */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surface-800 bg-surface-800/50">
          <Search size={11} className="text-surface-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 bg-transparent text-xs text-surface-200 placeholder-surface-600 outline-none"
          />
          {searchQuery && <span className="text-[10px] text-surface-500">{filteredLogs.length} matches</span>}
          <button
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            className="text-surface-500 hover:text-surface-300"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-surface-800">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
              filter === f.id ? 'bg-surface-700 text-surface-200' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            {f.label}
            {f.count && <span className={f.alert ? 'text-red-400' : 'text-surface-600'}>{f.count}</span>}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={toggleExpandAll}
          className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${expandAll ? 'text-purple-400 bg-purple-500/10' : 'text-surface-500 hover:text-surface-300'}`}
          title={expandAll ? t('terminal.collapseAll') : t('terminal.expandAll')}
        >
          {expandAll ? t('terminal.collapse') : t('terminal.expand')}
        </button>
        <button
          onClick={() => (paused ? resumeLogs() : setPaused(true))}
          className={`p-1 rounded transition-colors ${paused ? 'text-amber-400 bg-amber-500/10' : 'text-surface-500 hover:text-surface-300'}`}
          title={paused ? `${t('terminal.resume')} (${pausedBufferedCount})` : t('terminal.pause')}
        >
          {paused ? <Play size={10} /> : <Pause size={10} />}
        </button>
        {paused && pausedBufferedCount > 0 && (
          <span className="text-[10px] text-amber-400">{pausedBufferedCount}</span>
        )}
        <button
          onClick={() => setLogs([])}
          className="p-1 rounded text-surface-500 hover:text-surface-300 transition-colors"
          title="Clear"
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* ═══ Tool-permission requests ═══ */}
      {perms.length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2">
          {perms.map((p) => (
            <div key={p.id} className="flex items-center gap-2 flex-wrap">
              <ShieldQuestion size={12} className="text-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-surface-200">
                Claude wants <span className="font-mono text-amber-200 break-all">{p.tool_name}</span>
              </span>
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={() => resolvePerm(p.id, 'allow')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium transition-colors"
                >
                  <Check size={10} /> Yes
                </button>
                <button
                  onClick={() => resolvePerm(p.id, 'allow', true)}
                  title="Allow this tool for the rest of the session"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[10px] font-medium transition-colors"
                >
                  <CheckCircle2 size={10} /> Always
                </button>
                <button
                  onClick={() => resolvePerm(p.id, 'deny')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-surface-400 hover:text-surface-200 hover:bg-surface-800 text-[10px] font-medium transition-colors"
                >
                  <Ban size={10} /> Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Content ═══ */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 text-xs leading-relaxed"
      >
        {groupedEntries.length === 0 ? (
          <div className="text-center text-surface-600 py-12">
            {task.is_running ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full border-2 border-claude/20 border-t-claude animate-spin" />
                </div>
                <span className="text-surface-500">{t('terminal.waitingForClaude')}</span>
              </div>
            ) : (
              <span>{t('terminal.noOutput')}</span>
            )}
          </div>
        ) : (
          groupedEntries.map((entry, i) => {
            if (entry.type === 'turn_separator') {
              return <TurnSeparator key={`turn-${i}`} turn={entry.turn} time={entry.time} t={t} />;
            }

            if (entry.type === 'tool_group') {
              return (
                <ToolCard
                  key={`tool-${entry.index}`}
                  call={entry.call}
                  result={entry.result}
                  isExpanded={expandAll || expandedTools.has(entry.index)}
                  onToggle={() => toggleToolExpand(entry.index)}
                />
              );
            }

            // Regular log entries
            const log = entry.log;
            if (log.log_type === 'claude') {
              const isThinking = log.meta?.isThinking === true;
              return (
                <ClaudeText
                  key={`log-${entry.index}`}
                  message={log.message}
                  time={log.created_at}
                  isThinking={isThinking}
                />
              );
            }
            return <SystemLine key={`log-${entry.index}`} log={log} />;
          })
        )}
      </div>

      {/* ═══ Scroll button ═══ */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-4 right-4 p-2 rounded-full bg-claude shadow-lg hover:bg-claude-light transition-colors z-10"
        >
          <ArrowDown size={14} />
        </button>
      )}
    </div>
  );
}
