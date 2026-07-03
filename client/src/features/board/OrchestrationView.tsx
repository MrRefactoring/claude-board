import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GitBranch, CalendarRange, Radio, X, Tag, ChevronDown, Loader2, Swords } from 'lucide-react';
import { api } from '@/lib/api';
import { IS_TAURI, tauriListen } from '@/lib/tauriEvents';
import { useTranslation } from '@/i18n/I18nProvider';
import { getTagColor } from '@/lib/constants';
import { parseTags } from '@/features/board/TagBadge';
import PipelineStats from '@/features/board/PipelineStats';
import AgentCard from '@/features/board/AgentCard';
import DependencyGraph from '@/features/board/DependencyGraph';
import TimelineView from '@/features/board/TimelineView';
import ObservabilityPanel from '@/features/board/ObservabilityPanel';
import BattleView from '@/features/board/BattleView';
import type { Task } from '@/lib/types';

const STORAGE_KEY = 'claude-board:dag-positions:';

interface OrchestrationTask extends Task {
  tags?: string | string[] | null;
}

interface GraphNode {
  id: number;
  title: string;
  status?: string;
  task_key?: string;
  model?: string | null;
  is_running?: boolean;
}

interface GraphEdgeData {
  from: number;
  to: number;
  conditionType?: string;
}

interface WaveData {
  taskIds?: number[];
}

interface GraphData {
  tasks: GraphNode[];
  edges: GraphEdgeData[];
  waves: WaveData[];
}

type SavedPositionMap = Record<string, { x: number; y: number }>;

interface OrchestrationViewProps {
  tasks: OrchestrationTask[];
  projectId: number;
  onViewLogs?: (task: Task) => void;
  onStatusChange?: (taskId: number, status: string) => void;
  onViewDetail?: (task: Task) => void;
}

function loadPositions(projectId: number): SavedPositionMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + projectId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePositions(projectId: number, positions: SavedPositionMap) {
  try {
    localStorage.setItem(STORAGE_KEY + projectId, JSON.stringify(positions));
  } catch {}
}

export default function OrchestrationView({
  tasks,
  projectId,
  onViewLogs,
  onStatusChange,
  onViewDetail,
}: OrchestrationViewProps) {
  const { t } = useTranslation();
  const [graphData, setGraphData] = useState<GraphData>({ tasks: [], edges: [], waves: [] });
  const [loading, setLoading] = useState(true);
  const [savedPositions, setSavedPositions] = useState<SavedPositionMap | null>(() => loadPositions(projectId));
  const [viewType, setViewType] = useState<'graph' | 'timeline' | 'live' | 'battle'>('graph');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const refreshCounter = useRef(0);

  useEffect(() => {
    if (!tagDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) setTagDropdownOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [tagDropdownOpen]);

  const loadGraph = useCallback(() => {
    if (!IS_TAURI || !projectId) {
      setLoading(false);
      return;
    }
    api
      .getDependencyGraph(projectId)
      .then((data) => setGraphData(data as GraphData))
      .catch((e) => console.error('Failed to load dependency graph:', e))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Reload on task changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: the sync loading-flag toggle marks the refetch start
    loadGraph();
  }, [loadGraph, tasks]);

  // Reload saved positions when project changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate reset from localStorage on project switch; the state is mutated later by drag saves
    setSavedPositions(loadPositions(projectId));
  }, [projectId]);

  // Also reload on task:updated events (covers dependency changes)
  useEffect(() => {
    if (!IS_TAURI) return;
    return tauriListen('task:updated', () => {
      refreshCounter.current++;
      loadGraph();
    });
  }, [loadGraph]);

  // Tag filter
  const { activeTags, tagCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) =>
      parseTags(t.tags).forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      }),
    );
    return { activeTags: Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)), tagCounts: counts };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (tagFilter.length === 0) return tasks;
    return tasks.filter((t) => {
      const tags = parseTags(t.tags);
      return tagFilter.some((f) => tags.includes(f));
    });
  }, [tasks, tagFilter]);

  const filteredIds = useMemo(() => new Set(filteredTasks.map((t) => t.id)), [filteredTasks]);

  const runningTasks = filteredTasks.filter((t) => t.status === 'in_progress' || t.is_running);
  const waves: OrchestrationTask[][] = (graphData.waves || []).map((w) =>
    (w.taskIds || [])
      .map((id) => filteredTasks.find((t) => t.id === id))
      .filter((task): task is OrchestrationTask => Boolean(task)),
  );

  // Filter graph edges to only show filtered tasks
  const filteredEdges = useMemo(() => {
    if (tagFilter.length === 0) return graphData.edges || [];
    return (graphData.edges || []).filter((e) => filteredIds.has(e.from) && filteredIds.has(e.to));
  }, [graphData.edges, filteredIds, tagFilter]);

  const filteredGraphTasks = useMemo(() => {
    if (tagFilter.length === 0) return graphData.tasks || [];
    return (graphData.tasks || []).filter((t) => filteredIds.has(t.id));
  }, [graphData.tasks, filteredIds, tagFilter]);

  const handleStop = useCallback((task: Task) => {
    api.stopTask(task.id).catch((e) => console.error('Failed to stop task:', e));
  }, []);

  const handleAddDependency = useCallback(
    (taskId: number, dependsOnId: number) => {
      if (!IS_TAURI) return;
      api
        .addDependency(taskId, dependsOnId)
        .then(() => loadGraph())
        .catch((e) => console.error('Failed to add dependency:', e));
    },
    [loadGraph],
  );

  const handlePositionsChange = useCallback(
    (positions: SavedPositionMap) => {
      setSavedPositions(positions);
      savePositions(projectId, positions);
    },
    [projectId],
  );

  const handleStartTask = useCallback(
    (task: GraphNode) => {
      if (!onStatusChange) return;
      onStatusChange(task.id, 'in_progress');
    },
    [onStatusChange],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-surface-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-auto">
      {/* Pipeline Stats + Tag Filter + View Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <PipelineStats tasks={filteredTasks} waves={waves} projectId={projectId} />
        </div>
        {/* Tag filter dropdown */}
        {activeTags.length > 0 && (
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
              <div className="absolute top-full right-0 mt-1 bg-surface-800 border border-surface-700 rounded-lg py-1 shadow-xl z-20 min-w-[280px] max-h-[320px] overflow-y-auto">
                {tagFilter.length > 0 && (
                  <button
                    onClick={() => {
                      setTagFilter([]);
                      setTagDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-700 border-b border-surface-700/50"
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
                        isActive ? 'bg-surface-700/50 text-surface-200' : 'text-surface-400 hover:bg-surface-700/30'
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
        )}
        <div className="flex items-center bg-surface-800/50 rounded-lg border border-surface-700/30 p-0.5">
          <button
            onClick={() => setViewType('graph')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewType === 'graph' ? 'bg-claude/15 text-claude' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            <GitBranch size={12} />
            {t('orchestration.graph')}
          </button>
          <button
            onClick={() => setViewType('timeline')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewType === 'timeline' ? 'bg-claude/15 text-claude' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            <CalendarRange size={12} />
            {t('orchestration.timeline')}
          </button>
          <button
            onClick={() => setViewType('live')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewType === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            <Radio size={12} />
            {t('orchestration.live')}
          </button>
          <button
            onClick={() => setViewType('battle')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewType === 'battle' ? 'bg-amber-500/15 text-amber-400' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            <Swords size={12} />
            Battle
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-3 min-h-0">
        {viewType === 'battle' ? (
          <BattleView tasks={filteredTasks} projectId={projectId} />
        ) : viewType === 'live' ? (
          /* Live Observability Panel — full width */
          <div className="flex-1 min-w-0">
            <ObservabilityPanel projectId={projectId} />
          </div>
        ) : (
          <>
            {/* DAG Graph or Timeline */}
            <div className="flex-1 min-w-0">
              {viewType === 'graph' ? (
                <DependencyGraph
                  tasks={filteredGraphTasks}
                  edges={filteredEdges}
                  waves={waves}
                  onTaskClick={(task) => onViewDetail?.(task as Task)}
                  onAddDependency={handleAddDependency}
                  onStartTask={handleStartTask}
                  savedPositions={savedPositions}
                  onPositionsChange={handlePositionsChange}
                />
              ) : (
                <TimelineView tasks={filteredTasks} waves={waves} edges={filteredEdges} onTaskClick={onViewDetail} />
              )}
            </div>

            {/* Live Agent Cards */}
            {runningTasks.length > 0 && (
              <div className="w-72 flex-shrink-0 space-y-2 overflow-y-auto">
                <div className="text-[11px] font-medium text-surface-400 uppercase tracking-wider px-1">
                  {t('orchestration.liveAgents')} ({runningTasks.length})
                </div>
                {runningTasks.map((task) => (
                  <AgentCard key={task.id} task={task} onStop={handleStop} onViewLogs={onViewLogs} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
