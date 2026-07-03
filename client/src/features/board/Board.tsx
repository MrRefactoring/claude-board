import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { DndContext, DragOverlay, MouseSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { computeReorder } from '@/features/board/reorder';
import {
  LayoutGrid,
  List,
  X,
  GitBranch,
  Workflow,
  TrendingUp,
  Tag,
  ChevronDown,
  Link2,
  ArrowRight,
  Github,
  Map as MapIcon,
  Terminal,
  Rows3,
  Zap,
} from 'lucide-react';
import Column from '@/features/board/Column';
import ListView from '@/features/board/ListView';
const PipelineView = lazy(() => import('@/features/board/PipelineView'));
const OrchestrationView = lazy(() => import('@/features/board/OrchestrationView'));
const AnalyticsView = lazy(() => import('@/features/board/AnalyticsView'));
import { COLUMNS, MODELS, MODEL_COLORS, MODEL_DOT_COLORS, MODEL_BG_ACTIVE, getTagColor } from '@/lib/constants';
import { notifyError } from '@/lib/api';
import { IS_TAURI } from '@/lib/tauriEvents';
import GitHubIssuesPanel from '@/features/board/GitHubIssuesPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
const RoadmapView = lazy(() => import('@/features/roadmap/RoadmapView'));
const ProjectTerminal = lazy(() => import('@/features/terminal/ProjectTerminal'));
import { useTranslation } from '@/i18n/I18nProvider';
import { parseTags } from '@/features/board/TagBadge';
import { api } from '@/lib/api';
import type { ProjectFormValues } from '@/features/projects/useProjectForm';
import type { Task, Project } from '@/lib/types';

interface BoardTask extends Task {
  tags?: string | string[] | null;
}

interface BoardProject extends Project {
  require_approval?: boolean | number;
  github_sync_enabled?: boolean | number;
}

interface BoardProps {
  tasks: BoardTask[];
  projectId: number;
  project?: BoardProject;
  onStatusChange: (taskId: number, status: string) => void;
  onViewLogs: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onBulkDelete?: (tasks: Task[]) => void;
  onReviewTask: (task: Task) => void;
  onViewDetail: (task: Task) => void;
  onReorderTasks?: (taskIds: number[]) => void;
}

const VIEWS = [
  { id: 'board', labelKey: 'board.board', icon: LayoutGrid },
  { id: 'list', labelKey: 'board.list', icon: List },
  { id: 'pipeline', labelKey: 'board.pipeline', icon: GitBranch },
  { id: 'orchestration', labelKey: 'board.orchestration', icon: Workflow },
  { id: 'analytics', labelKey: 'board.analytics', icon: TrendingUp },
  { id: 'roadmap', labelKey: 'board.roadmap', icon: MapIcon },
  { id: 'terminal', labelKey: 'board.terminal', icon: Terminal },
];

const MODEL_DOT = MODEL_DOT_COLORS;

export default function Board({
  tasks,
  projectId,
  project,
  onStatusChange,
  onViewLogs,
  onEditTask,
  onDeleteTask,
  onBulkDelete,
  onReviewTask,
  onViewDetail,
  onReorderTasks,
}: BoardProps) {
  const { t } = useTranslation();
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [altDrag, setAltDrag] = useState(false);
  const altRef = useRef(false);
  const [mobileTab, setMobileTab] = useState('backlog');
  const [viewMode, setViewMode] = useState('board');
  const [groupByEpic, setGroupByEpic] = useState(false);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [showGithubPanel, setShowGithubPanel] = useState(false);
  const [depDialog, setDepDialog] = useState<{ from: Task; to: Task } | null>(null);
  const [queuePending, setQueuePending] = useState(false);

  const handleReorder = useCallback(
    (taskIds: number[]) => {
      if (onReorderTasks) onReorderTasks(taskIds);
    },
    [onReorderTasks],
  );

  const handleDepDrop = useCallback((fromTask: Task, toTask: Task) => {
    if (fromTask.id === toTask.id) return;
    setDepDialog({ from: fromTask, to: toTask });
  }, []);

  // Quick Auto Queue toggle from the board toolbar. Partial update — only
  // `auto_queue` is sent, so `max_concurrent` is preserved (see update_project).
  // The project prop refreshes from the `project:updated` event, so no optimistic
  // state is needed; `queuePending` just blocks double-sends. Tauri-only (the
  // HTTP updateProject route doesn't exist in web mode).
  const toggleAutoQueue = useCallback(async () => {
    if (!project || queuePending) return;
    const next = !project.auto_queue;
    setQueuePending(true);
    try {
      // `auto_queue` reads as number but the update command takes the form's
      // camelCase boolean write-shape (ProjectFormValues), same as the settings modal.
      const payload: Partial<ProjectFormValues> = { autoQueue: next };
      await api.updateProject(projectId, payload);
    } catch (e) {
      notifyError((e as Error).message || 'Failed to toggle auto queue');
    } finally {
      setQueuePending(false);
    }
  }, [project, projectId, queuePending]);

  // ─── Drag & drop (dnd-kit) ───
  // Mouse-only on purpose: mobile uses the tap-to-move status buttons, and a
  // touch sensor would fight the column scroll gesture.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  // dnd-kit events don't expose modifier keys, so Alt (dependency drop,
  // see handleDragEnd) is tracked via window key events while a drag runs.
  useEffect(() => {
    if (!draggedTask) return;
    const setAlt = (value: boolean) => {
      altRef.current = value;
      setAltDrag(value);
    };
    const down = (e: KeyboardEvent) => e.key === 'Alt' && setAlt(true);
    const up = (e: KeyboardEvent) => e.key === 'Alt' && setAlt(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      setAlt(false);
    };
  }, [draggedTask]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const task = e.active.data.current?.task as Task | undefined;
    setDraggedTask(task ?? null);
    const alt = !!(e.activatorEvent as globalThis.MouseEvent | undefined)?.altKey;
    altRef.current = alt;
    setAltDrag(alt);
  }, []);

  const handleDragOver = useCallback((e: DragOverEvent) => {
    setOverColumnId((e.over?.data.current?.columnId as string | undefined) ?? null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setDraggedTask(null);
    setOverColumnId(null);
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const task = e.active.data.current?.task as Task | undefined;
      const over = e.over;
      setDraggedTask(null);
      setOverColumnId(null);
      if (!task || !over) return;

      const overTask = over.data.current?.task as Task | undefined;
      // Alt+drop onto another card — create a dependency instead of moving.
      if (overTask && altRef.current && overTask.id !== task.id) {
        handleDepDrop(task, overTask);
        return;
      }
      const overColumn = (over.data.current?.columnId as string | undefined) ?? null;
      if (!overColumn) return;
      const status = task.status || 'backlog';
      if (overColumn !== status) {
        onStatusChange(task.id, overColumn);
        return;
      }
      if (overTask && overTask.id !== task.id) {
        const ids = computeReorder(columnTasksRef.current(status), task.id, overTask.id);
        if (ids) handleReorder(ids);
      }
    },
    [onStatusChange, handleReorder, handleDepDrop],
  );

  const confirmDep = useCallback(
    async (direction: string) => {
      if (!depDialog) return;
      const { from, to } = depDialog;
      try {
        if (direction === 'depends') {
          // "from" depends on "to" (to must complete first)
          await api.addDependency(from.id, to.id);
        } else {
          // "to" depends on "from" (from must complete first)
          await api.addDependency(to.id, from.id);
        }
      } catch (e) {
        notifyError((e as Error).message || 'Failed to create dependency');
      }
      setDepDialog(null);
    },
    [depDialog],
  );

  useEffect(() => {
    if (!tagDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) setTagDropdownOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [tagDropdownOpen]);

  // Models actually present in current tasks
  const { activeModels, modelCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      const m = t.model_used || t.model || 'sonnet';
      counts[m] = (counts[m] || 0) + 1;
    });
    return { activeModels: MODELS.filter((m) => counts[m]), modelCounts: counts };
  }, [tasks]);

  // Collect all tags across tasks
  const { activeTags, tagCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      const tags = parseTags(t.tags);
      tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    const sorted = Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
    return { activeTags: sorted, tagCounts: counts };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (modelFilter) result = result.filter((t) => (t.model_used || t.model || 'sonnet') === modelFilter);
    if (tagFilter.length > 0)
      result = result.filter((t) => {
        const tags = parseTags(t.tags);
        return tagFilter.some((f) => tags.includes(f));
      });
    return result;
  }, [tasks, modelFilter, tagFilter]);

  const groupedTasks = useMemo(() => {
    const grouped: Record<string, BoardTask[]> = {
      backlog: [],
      in_progress: [],
      testing: [],
      done: [],
      failed: [],
      awaiting_approval: [],
    };
    for (const t of filteredTasks) {
      const s = t.status || 'backlog';
      if (grouped[s]) grouped[s].push(t);
    }
    return grouped;
  }, [filteredTasks]);
  const columnTasks = useCallback((colId: string) => groupedTasks[colId] || [], [groupedTasks]);
  // Drag handlers are declared above this memo — reach the current grouping via
  // a latest-ref (synced post-render; consumers only run during drag events,
  // which cannot happen before the first effect pass).
  const columnTasksRef = useRef<(colId: string) => Task[]>(() => []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- latest-ref pattern: post-render ref sync is sanctioned (identical to terminalRef in App.tsx, which the rule accepts)
    columnTasksRef.current = columnTasks;
  });

  // Only show awaiting_approval column when require_approval is enabled
  const visibleColumns = useMemo(
    () => COLUMNS.filter((col) => col.id !== 'awaiting_approval' || project?.require_approval),
    [project?.require_approval],
  );
  const mobileColumn = visibleColumns.find((c) => c.id === mobileTab) || visibleColumns[0];

  // ─── Epic swimlanes ───
  // Leaf progress within a lane (containers are excluded from the count).
  const laneRollup = (laneTasks: BoardTask[]) => {
    const leaves = laneTasks.filter(
      (t) => t.task_level == null || t.task_level === 'task' || t.task_level === 'subtask',
    );
    const done = leaves.filter((t) => t.status === 'done' || t.status === 'testing').length;
    return { done, total: leaves.length };
  };

  // Group filtered tasks by their epic ancestor. Epics themselves become lane
  // headers (not cards); tasks with no epic ancestor fall into a "No epic" lane.
  const epicLanes = useMemo(() => {
    if (!groupByEpic) return null;
    const byId = new Map<number, BoardTask>();
    for (const t of tasks) byId.set(t.id, t);
    const epicOf = (t: BoardTask): BoardTask | null => {
      let cur: BoardTask | undefined = t;
      const seen = new Set<number>();
      while (cur) {
        if (cur.task_level === 'epic') return cur;
        if (cur.parent_task_id == null || seen.has(cur.id)) break;
        seen.add(cur.id);
        cur = byId.get(cur.parent_task_id);
      }
      return null;
    };
    const laneMap = new Map<number | 'none', { epic: BoardTask | null; tasks: BoardTask[] }>();
    for (const t of filteredTasks) {
      if (t.task_level === 'epic' && !laneMap.has(t.id)) laneMap.set(t.id, { epic: t, tasks: [] });
    }
    for (const t of filteredTasks) {
      if (t.task_level === 'epic') continue;
      const epic = epicOf(t);
      const key: number | 'none' = epic ? epic.id : 'none';
      let lane = laneMap.get(key);
      if (!lane) {
        lane = { epic, tasks: [] };
        laneMap.set(key, lane);
      }
      lane.tasks.push(t);
    }
    return Array.from(laneMap.values());
  }, [groupByEpic, tasks, filteredTasks]);

  const renderColumn = (col: (typeof COLUMNS)[number], tasksForCol: BoardTask[], dndPrefix = '') => (
    <Column
      key={col.id}
      column={col}
      tasks={tasksForCol}
      highlight={overColumnId === col.id}
      altDrag={altDrag}
      dndPrefix={dndPrefix}
      onViewLogs={onViewLogs}
      onEditTask={onEditTask}
      onDeleteTask={onDeleteTask}
      onStatusChange={onStatusChange}
      onReviewTask={onReviewTask}
      onViewDetail={onViewDetail}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-full flex">
        <div className="flex-1 flex flex-col min-w-0">
          {/* View toggle + model filter bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-wrap" data-tour="view-tabs">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    viewMode === v.id
                      ? 'bg-claude/15 text-claude'
                      : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{t(v.labelKey)}</span>
                </button>
              );
            })}

            {/* Group by epic (kanban view only) */}
            {viewMode === 'board' && (
              <button
                onClick={() => setGroupByEpic((v) => !v)}
                title="Group the board into epic swimlanes"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  groupByEpic
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
                }`}
              >
                <Rows3 size={13} />
                <span className="hidden sm:inline">Epics</span>
              </button>
            )}

            {/* Separator */}
            {activeModels.length > 1 && <div className="w-px h-5 bg-surface-700/50 mx-1.5" />}

            {/* Model filter chips */}
            {activeModels.length > 1 &&
              activeModels.map((m) => {
                const isActive = modelFilter === m;
                const count = modelCounts[m] || 0;
                return (
                  <button
                    key={m}
                    onClick={() => setModelFilter(isActive ? null : m)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? `${MODEL_BG_ACTIVE[m as keyof typeof MODEL_BG_ACTIVE] || 'bg-surface-700/50'} ring-1 ${
                            MODEL_COLORS[m as keyof typeof MODEL_COLORS] || 'text-surface-300'
                          }`
                        : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: MODEL_DOT[m as keyof typeof MODEL_DOT] || '#94a3b8' }}
                    />
                    <span className="capitalize">{m}</span>
                    <span
                      className={`text-[10px] px-1 py-px rounded-full ${isActive ? 'bg-white/10' : 'bg-surface-800'}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

            {/* Clear model filter */}
            {modelFilter && (
              <button
                onClick={() => setModelFilter(null)}
                className="flex items-center gap-1 px-1.5 py-1.5 rounded-lg text-[10px] text-surface-500 hover:text-surface-300 hover:bg-surface-800/50 transition-colors"
                title={t('board.clearFilter')}
              >
                <X size={12} />
              </button>
            )}

            {/* Tag filter dropdown */}
            {activeTags.length > 0 && (
              <>
                <div className="w-px h-5 bg-surface-700/50 mx-1.5" />
                <div className="relative" ref={tagDropdownRef}>
                  <button
                    onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      tagFilter.length > 0
                        ? 'bg-claude/15 text-claude'
                        : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
                    }`}
                  >
                    <Tag size={12} />
                    {t('task.tags')}
                    {tagFilter.length > 0 && (
                      <span className="text-[10px] bg-claude/20 px-1.5 py-px rounded-full">{tagFilter.length}</span>
                    )}
                    <ChevronDown size={10} />
                  </button>
                  {tagDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-surface-800 border border-surface-700 rounded-lg py-1 shadow-xl z-20 min-w-[280px] max-h-[320px] overflow-y-auto">
                      {tagFilter.length > 0 && (
                        <button
                          onClick={() => {
                            setTagFilter([]);
                            setTagDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-700 border-b border-surface-700/50 transition-colors"
                        >
                          <X size={10} /> {t('common.clearAll')}
                        </button>
                      )}
                      {activeTags.map((tag) => {
                        const isActive = tagFilter.includes(tag);
                        const color = getTagColor(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() =>
                              setTagFilter((prev) => (isActive ? prev.filter((t) => t !== tag) : [...prev, tag]))
                            }
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                              isActive
                                ? 'bg-surface-700/50 text-surface-200'
                                : 'text-surface-400 hover:bg-surface-700/30'
                            }`}
                          >
                            <div
                              className={`w-3 h-3 rounded border flex items-center justify-center ${
                                isActive ? 'bg-claude border-claude' : 'border-surface-600'
                              }`}
                            >
                              {isActive && <span className="text-[8px] text-white font-bold">✓</span>}
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${color}`}>{tag}</span>
                            <span className="ml-auto text-[10px] text-surface-600">{tagCounts[tag]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* GitHub Issues panel toggle (Tauri only — no HTTP routes for GitHub) */}
            {IS_TAURI && !!project?.github_sync_enabled && (
              <>
                <div className="w-px h-5 bg-surface-700/50 mx-1.5" />
                <button
                  onClick={() => setShowGithubPanel((p) => !p)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    showGithubPanel
                      ? 'text-claude bg-claude/10'
                      : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
                  }`}
                  title="GitHub Issues"
                >
                  {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- lucide brand-icon deprecation; no non-brand replacement conveys GitHub — revisit when lucide removes it */}
                  <Github size={13} />
                  <span className="hidden sm:inline">Issues</span>
                </button>
              </>
            )}

            {/* Auto Queue toggle (Tauri only — updateProject has no HTTP route) */}
            {IS_TAURI && project && (
              <>
                <div className="w-px h-5 bg-surface-700/50 mx-1.5" />
                <button
                  onClick={() => void toggleAutoQueue()}
                  disabled={queuePending}
                  title={t('projectModal.autoQueueDesc')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    project.auto_queue
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
                  }`}
                >
                  <Zap size={13} />
                  <span className="hidden sm:inline">{t('board.autoQueue')}</span>
                </button>
              </>
            )}
          </div>

          {/* Board view */}
          {viewMode === 'board' && (
            <>
              {/* Mobile tab bar */}
              <div className="flex md:hidden border-b border-surface-800 bg-surface-900/80 overflow-x-auto">
                {visibleColumns.map((col) => {
                  const count = columnTasks(col.id).length;
                  return (
                    <button
                      key={col.id}
                      onClick={() => setMobileTab(col.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                        mobileTab === col.id ? `${col.color} border-current` : 'text-surface-500 border-transparent'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${col.bg}`} />
                      {t('status.' + col.id)}
                      {count > 0 && (
                        <span className="text-[10px] bg-surface-800 px-1.5 py-0.5 rounded-full">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Mobile: single column */}
              <div className="flex-1 overflow-y-auto md:hidden p-3">
                {mobileColumn && (
                  <Column
                    column={mobileColumn}
                    tasks={columnTasks(mobileTab)}
                    highlight={overColumnId === mobileTab}
                    altDrag={altDrag}
                    dndPrefix="m:"
                    onViewLogs={onViewLogs}
                    onEditTask={onEditTask}
                    onDeleteTask={onDeleteTask}
                    onStatusChange={onStatusChange}
                    onReviewTask={onReviewTask}
                    onViewDetail={onViewDetail}
                    isMobile
                  />
                )}
              </div>

              {/* Desktop: grouped into epic swimlanes, or a single columns row */}
              {groupByEpic && epicLanes ? (
                <div className="hidden md:flex flex-col flex-1 gap-5 p-4 overflow-y-auto">
                  {epicLanes.length === 0 && <div className="text-xs text-surface-500 px-1">No tasks to group.</div>}
                  {epicLanes.map((lane) => {
                    const { done, total } = laneRollup(lane.tasks);
                    return (
                      <div key={lane.epic ? lane.epic.id : 'none'} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 px-1">
                          {lane.epic ? (
                            <>
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">
                                Epic
                              </span>
                              <span className="text-sm font-medium text-surface-200 truncate">{lane.epic.title}</span>
                              {lane.epic.task_key && (
                                <span className="text-[10px] text-surface-500 font-mono">{lane.epic.task_key}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-sm font-medium text-surface-400">No epic</span>
                          )}
                          {total > 0 && (
                            <span className="text-[10px] text-surface-500 tabular-nums ml-auto">
                              {done}/{total} done
                            </span>
                          )}
                        </div>
                        <div className="flex gap-4 overflow-x-auto">
                          {visibleColumns.map((col) =>
                            renderColumn(
                              col,
                              lane.tasks.filter((t) => (t.status || 'backlog') === col.id),
                              // Same column repeats in every lane — keep dnd ids unique.
                              `lane${lane.epic ? lane.epic.id : 'none'}:`,
                            ),
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="hidden md:flex flex-1 gap-4 p-4 overflow-x-auto">
                  {visibleColumns.map((col) => renderColumn(col, columnTasks(col.id)))}
                </div>
              )}
            </>
          )}

          {/* List view */}
          {viewMode === 'list' && (
            <ErrorBoundary>
              <div className="flex-1 overflow-hidden">
                <ListView
                  tasks={filteredTasks}
                  onStatusChange={onStatusChange}
                  onViewLogs={onViewLogs}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                  onBulkDelete={onBulkDelete}
                  onReviewTask={onReviewTask}
                  onViewDetail={onViewDetail}
                />
              </div>
            </ErrorBoundary>
          )}

          {viewMode === 'pipeline' && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Loading...</div>
                }
              >
                <div className="flex-1 overflow-hidden">
                  <PipelineView
                    tasks={filteredTasks}
                    onStatusChange={onStatusChange}
                    onViewLogs={onViewLogs}
                    onViewDetail={onViewDetail}
                  />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}

          {viewMode === 'orchestration' && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Loading...</div>
                }
              >
                <div className="flex-1 overflow-hidden">
                  <OrchestrationView
                    tasks={tasks}
                    projectId={projectId}
                    onViewLogs={onViewLogs}
                    onStatusChange={onStatusChange}
                    onViewDetail={onViewDetail}
                  />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}

          {viewMode === 'analytics' && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Loading...</div>
                }
              >
                <div className="flex-1 overflow-hidden">
                  <AnalyticsView tasks={filteredTasks} projectId={projectId} />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}

          {viewMode === 'roadmap' && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Loading...</div>
                }
              >
                <div className="flex-1 overflow-auto">
                  <RoadmapView projectId={projectId} project={project} />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}

          {viewMode === 'terminal' && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Loading...</div>
                }
              >
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ProjectTerminal tasks={filteredTasks} />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}
          {/* Dependency creation dialog */}
          {depDialog && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setDepDialog(null)}
            >
              <div
                className="bg-surface-800 border border-surface-700 rounded-xl p-5 w-[380px] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Link2 size={16} className="text-blue-400" />
                  <h3 className="text-sm font-medium text-surface-100">{t('board.createDependency')}</h3>
                </div>
                <p className="text-xs text-surface-400 mb-4">{t('board.depDialogDesc')}</p>

                <div className="space-y-2">
                  <button
                    onClick={() => confirmDep('depends')}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-700/50 hover:bg-surface-700 border border-surface-600/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-surface-200 truncate">{depDialog.from.title}</div>
                      <div className="text-[10px] text-surface-500">{depDialog.from.task_key}</div>
                    </div>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <ArrowRight size={14} className="text-blue-400" />
                      <span className="text-[9px] text-blue-400 mt-0.5">{t('board.dependsOn')}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-xs font-medium text-surface-200 truncate">{depDialog.to.title}</div>
                      <div className="text-[10px] text-surface-500">{depDialog.to.task_key}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => confirmDep('blocks')}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-700/50 hover:bg-surface-700 border border-surface-600/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-surface-200 truncate">{depDialog.to.title}</div>
                      <div className="text-[10px] text-surface-500">{depDialog.to.task_key}</div>
                    </div>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <ArrowRight size={14} className="text-blue-400" />
                      <span className="text-[9px] text-blue-400 mt-0.5">{t('board.dependsOn')}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-xs font-medium text-surface-200 truncate">{depDialog.from.title}</div>
                      <div className="text-[10px] text-surface-500">{depDialog.from.task_key}</div>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => setDepDialog(null)}
                  className="w-full mt-3 py-2 text-xs text-surface-500 hover:text-surface-300 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
        {/* GitHub Issues side panel */}
        {IS_TAURI && showGithubPanel && (
          <div className="w-[340px] flex-shrink-0 border-l border-surface-800">
            <GitHubIssuesPanel projectId={projectId} onClose={() => setShowGithubPanel(false)} />
          </div>
        )}
      </div>
      <DragOverlay>
        {draggedTask && (
          <div
            className={`bg-surface-800 rounded-lg p-3 border shadow-xl shadow-black/40 text-sm text-surface-200 opacity-95 ${
              altDrag ? 'border-blue-400 ring-1 ring-blue-400/30' : 'border-claude/50'
            }`}
          >
            {altDrag && <div className="text-[9px] font-semibold uppercase text-blue-400 mb-1">Link dependency</div>}
            {draggedTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
