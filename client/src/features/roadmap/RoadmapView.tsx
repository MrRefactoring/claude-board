import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Flag,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  AlertTriangle,
  X,
  Package,
  RefreshCw,
  Activity,
  XCircle,
  ListTodo,
} from 'lucide-react';
import { api, notifyError } from '@/lib/api';
import { useTranslation } from '@/i18n/I18nProvider';
import { tauriListen } from '@/lib/tauriEvents';
import type { AppEventMap } from '@/lib/events';
import type { Task, Project } from '@/lib/types';
import type { Roadmap, Phase, GsdStatus, StatusMsg, HealthReport, Todo } from '@/features/roadmap/types';
import { MilestoneSection } from '@/features/roadmap/MilestoneSection';
import { PhasePlanningModal } from '@/features/roadmap/PhasePlanningModal';
import { GsdInstallPrompt } from '@/features/roadmap/GsdInstallPrompt';
import { GsdFileRoadmap } from '@/features/roadmap/GsdFileRoadmap';

// ─── Main Component ───

interface RoadmapViewProps {
  projectId: number;
  project?: Project;
}

export default function RoadmapView({ projectId }: RoadmapViewProps) {
  const { t } = useTranslation();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateMs, setShowCreateMs] = useState(false);
  const [newMs, setNewMs] = useState({ version: '', title: '', description: '' });
  const [planningPhase, setPlanningPhase] = useState<Phase | null>(null);
  const [gsdStatus, setGsdStatus] = useState<GsdStatus | null>(null);
  const [gsdLoading, setGsdLoading] = useState(true);

  const loadGsdStatus = useCallback(async () => {
    try {
      const status = (await api.gsdCheckStatus(projectId)) as GsdStatus;
      setGsdStatus(status);
    } catch (e) {
      console.error('Failed to load GSD status:', e);
    }
    setGsdLoading(false);
  }, [projectId]);

  const loadRoadmap = useCallback(async () => {
    try {
      const data = (await api.getRoadmap(projectId)) as Roadmap;
      setRoadmap(data);
    } catch (e) {
      console.error('Failed to load roadmap:', e);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadRoadmap();
    loadGsdStatus();
  }, [loadRoadmap, loadGsdStatus]);

  useEffect(() => {
    return tauriListen('roadmap:updated' as keyof AppEventMap, (payload) => {
      if ((payload as number) === projectId) loadRoadmap();
    });
  }, [projectId, loadRoadmap]);

  const handleCreateMilestone = async () => {
    if (!newMs.title.trim() || !newMs.version.trim()) return;
    try {
      await api.createMilestone(projectId, newMs.version.trim(), newMs.title.trim(), newMs.description);
      setNewMs({ version: '', title: '', description: '' });
      setShowCreateMs(false);
      loadRoadmap();
    } catch (e) {
      console.error('Create milestone failed:', e);
    }
  };

  const handlePlanPhase = (phase: Phase) => {
    setPlanningPhase(phase);
  };

  const [executingPhases, setExecutingPhases] = useState<Set<number>>(() => new Set());
  const handleExecutePhase = async (phase: Phase) => {
    if (executingPhases.has(phase.id)) return;
    if (phase.status === 'in_progress') {
      notifyError(`Phase ${phase.phase_number} is already in progress`);
      return;
    }
    setExecutingPhases((prev) => {
      const next = new Set(prev);
      next.add(phase.id);
      return next;
    });
    try {
      await api.executePhase(projectId, phase.id);
      loadRoadmap();
    } catch (e) {
      console.error('Execute phase failed:', e);
    } finally {
      setExecutingPhases((prev) => {
        const next = new Set(prev);
        next.delete(phase.id);
        return next;
      });
    }
  };

  const [gsdIniting, setGsdIniting] = useState(false);
  const [gsdInitMsg, setGsdInitMsg] = useState<StatusMsg | null>(null);
  const [showGsdForm, setShowGsdForm] = useState(false);
  const [gsdForm, setGsdForm] = useState({ description: '', goals: '', scope: '' });
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [showTodos, setShowTodos] = useState(false);

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    try {
      const report = (await api.gsdHealthCheck(projectId)) as HealthReport;
      setHealthReport(report);
      setShowHealth(true);
    } catch (e) {
      console.error('Health check failed:', e);
    }
    setHealthLoading(false);
  }, [projectId]);

  const loadTodos = useCallback(async () => {
    setTodosLoading(true);
    try {
      const list = (await api.gsdListTodos(projectId)) as Todo[];
      setTodos(list || []);
      setShowTodos(true);
    } catch (e) {
      console.error('Load todos failed:', e);
    }
    setTodosLoading(false);
  }, [projectId]);
  const handleGsdInit = async () => {
    if (gsdIniting) return;
    if (!gsdForm.description.trim()) return;
    setGsdIniting(true);
    setGsdInitMsg(null);
    const context = [
      `## Project Context`,
      gsdForm.description.trim(),
      gsdForm.goals.trim() ? `\n## Goals\n${gsdForm.goals.trim()}` : '',
      gsdForm.scope.trim() ? `\n## Scope / Constraints\n${gsdForm.scope.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const task = await api.createTask(projectId, {
        title: 'Initialize GSD Project',
        description:
          `Create the .planning/ directory for this project with PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, and config.json.\n\n` +
          `${context}\n\n` +
          `## Instructions\n` +
          `1. Analyze the codebase to understand the tech stack and architecture\n` +
          `2. Use the project context above to shape the roadmap\n` +
          `3. Create PROJECT.md with project vision and constraints\n` +
          `4. Create REQUIREMENTS.md with v1 scope (based on goals above)\n` +
          `5. Create ROADMAP.md with **5-8 phases maximum** — each phase should be a meaningful chunk of work, not a single task. Fewer focused phases are better than many granular ones.\n` +
          `6. Create STATE.md tracking current position\n` +
          `7. Create config.json with default GSD settings\n` +
          `8. Each phase in ROADMAP.md must have: ## Phase N: Title, a description, and Status: pending`,
        taskType: 'chore',
        model: 'sonnet',
        tags: 'gsd-init',
      } as Partial<Task>);
      if (task?.id) {
        await api.restartTask(task.id);
        setGsdInitMsg({
          type: 'success',
          text: `Task "${task.task_key || task.title}" created and started. Check the board to track progress.`,
        });
        setShowGsdForm(false);
      }
      loadGsdStatus();
    } catch (e) {
      setGsdInitMsg({
        type: 'error',
        text: typeof e === 'string' ? e : (e as Error)?.message || 'Failed to create task',
      });
    }
    setGsdIniting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={20} className="animate-spin text-surface-500" />
      </div>
    );
  }

  const milestones = roadmap?.milestones || [];

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-100">{t('roadmap.title')}</h2>
          <p className="text-[10px] text-surface-600 mt-0.5">GSD Workflow - Milestone → Phase → Plan → Task</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTodos}
            disabled={todosLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-800 border border-surface-700 text-surface-300 hover:text-surface-100 hover:border-surface-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Show captured todos from .planning/todos/"
          >
            {todosLoading ? <Loader2 size={14} className="animate-spin" /> : <ListTodo size={14} />}
            Todos
          </button>
          <button
            onClick={runHealthCheck}
            disabled={healthLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-800 border border-surface-700 text-surface-300 hover:text-surface-100 hover:border-surface-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Check .planning/ directory integrity"
          >
            {healthLoading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            Health
          </button>
          <button
            onClick={() => setShowCreateMs(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-claude/15 text-claude text-xs font-medium rounded-lg hover:bg-claude/25 transition-colors"
          >
            <Plus size={14} /> {t('roadmap.createMilestone')}
          </button>
        </div>
      </div>

      {/* Todos panel */}
      {showTodos && (
        <div className="border border-surface-700 rounded-xl p-4 space-y-2 bg-surface-850">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo size={14} className="text-amber-400" />
              <h3 className="text-sm font-medium text-surface-100">
                Todos{' '}
                <span className="text-[10px] text-surface-500 font-normal">
                  ({todos.filter((t) => t.status === 'pending').length} pending ·{' '}
                  {todos.filter((t) => t.status === 'done').length} done)
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={loadTodos}
                disabled={todosLoading}
                className="p-1 text-surface-500 hover:text-surface-300 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={12} className={todosLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setShowTodos(false)} className="p-1 text-surface-500 hover:text-surface-300">
                <X size={14} />
              </button>
            </div>
          </div>
          {todos.length === 0 ? (
            <div className="text-[11px] text-surface-500 py-4 text-center">
              No todos captured yet. Use <code className="text-surface-300">/gsd:add-todo</code> in a Claude session to
              capture ideas.
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {todos.map((todo) => (
                <div
                  key={todo.path}
                  className={`flex items-start gap-2 p-2 rounded border border-surface-700/50 ${todo.status === 'done' ? 'bg-surface-900/50 opacity-60' : 'bg-surface-900/80'}`}
                >
                  {todo.status === 'done' ? (
                    <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={11} className="text-surface-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-medium ${todo.status === 'done' ? 'text-surface-400 line-through' : 'text-surface-200'}`}
                      >
                        {todo.title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-500 flex-shrink-0">
                        {todo.area}
                      </span>
                    </div>
                    {todo.preview && <p className="text-[10px] text-surface-500 mt-0.5 line-clamp-2">{todo.preview}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Health report panel */}
      {showHealth && healthReport && (
        <div className="border border-surface-700 rounded-xl p-4 space-y-2 bg-surface-850">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity
                size={14}
                className={
                  healthReport.overall === 'healthy'
                    ? 'text-emerald-400'
                    : healthReport.overall === 'degraded'
                      ? 'text-amber-400'
                      : 'text-red-400'
                }
              />
              <h3 className="text-sm font-medium text-surface-100">
                Planning Directory Health:{' '}
                <span
                  className={
                    healthReport.overall === 'healthy'
                      ? 'text-emerald-400'
                      : healthReport.overall === 'degraded'
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }
                >
                  {healthReport.overall}
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={runHealthCheck}
                disabled={healthLoading}
                className="p-1 text-surface-500 hover:text-surface-300 disabled:opacity-50"
                title="Re-run checks"
              >
                <RefreshCw size={12} className={healthLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setShowHealth(false)} className="p-1 text-surface-500 hover:text-surface-300">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {healthReport.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                {c.status === 'ok' ? (
                  <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : c.status === 'warning' ? (
                  <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="text-surface-200">{c.name}</span>
                  {c.message && <span className="text-surface-500"> — {c.message}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create milestone form */}
      {showCreateMs && (
        <div className="border border-surface-700 rounded-xl p-4 space-y-3 bg-surface-850">
          <h3 className="text-sm font-medium text-surface-200">{t('roadmap.createMilestone')}</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="v1.0"
              value={newMs.version}
              onChange={(e) => setNewMs((p) => ({ ...p, version: e.target.value }))}
              className="w-20 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
              autoFocus
            />
            <input
              type="text"
              placeholder={`${t('roadmap.milestone')} title`}
              value={newMs.title}
              onChange={(e) => setNewMs((p) => ({ ...p, title: e.target.value }))}
              className="flex-1 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateMilestone()}
            />
          </div>
          <input
            type="text"
            placeholder="Description (optional)"
            value={newMs.description}
            onChange={(e) => setNewMs((p) => ({ ...p, description: e.target.value }))}
            className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateMilestone}
              className="px-3 py-1.5 bg-claude text-white text-xs rounded-lg hover:bg-claude/80 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreateMs(false)}
              className="px-3 py-1.5 text-surface-500 text-xs rounded-lg hover:text-surface-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* GSD Package Integration */}
      {!gsdLoading && gsdStatus && !gsdStatus.installed && (
        <GsdInstallPrompt projectId={projectId} onInstalled={loadGsdStatus} />
      )}

      {/* GSD File-Based Roadmap */}
      {gsdStatus?.has_planning && gsdStatus?.has_roadmap && <GsdFileRoadmap projectId={projectId} />}

      {/* GSD Init */}
      {gsdStatus?.installed && !gsdStatus?.has_planning && (
        <div className="space-y-2">
          {!showGsdForm && !gsdInitMsg?.type && (
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-800/40 border border-surface-700/30 rounded-xl">
              <Package size={14} className="text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-surface-400 flex-1">
                GSD installed. <code className="text-surface-300 bg-surface-800 px-1 rounded">.planning/</code>{' '}
                directory needs to be initialized.
              </span>
              <button
                onClick={() => setShowGsdForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-claude/15 text-claude text-xs font-medium rounded-lg hover:bg-claude/25 transition-colors flex-shrink-0"
              >
                <Play size={12} />
                Initialize Project
              </button>
            </div>
          )}

          {showGsdForm && !gsdInitMsg?.type && (
            <div className="border border-surface-700 rounded-xl p-4 space-y-3 bg-surface-850">
              <h3 className="text-sm font-medium text-surface-200">Initialize GSD Project</h3>
              <p className="text-[11px] text-surface-500">
                Describe your project so GSD can create a focused roadmap with the right phases.
              </p>
              <div className="space-y-2">
                <textarea
                  placeholder="What is this project? What does it do? (required)"
                  value={gsdForm.description}
                  onChange={(e) => setGsdForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-xs text-surface-200 placeholder-surface-600 resize-none"
                  rows={3}
                  autoFocus
                />
                <textarea
                  placeholder="What are your goals for v1? What features matter most?"
                  value={gsdForm.goals}
                  onChange={(e) => setGsdForm((f) => ({ ...f, goals: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-xs text-surface-200 placeholder-surface-600 resize-none"
                  rows={2}
                />
                <textarea
                  placeholder="Any constraints or scope limits? (optional)"
                  value={gsdForm.scope}
                  onChange={(e) => setGsdForm((f) => ({ ...f, scope: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-xs text-surface-200 placeholder-surface-600 resize-none"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGsdInit}
                  disabled={gsdIniting || !gsdForm.description.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-claude hover:bg-claude/80 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {gsdIniting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  {gsdIniting ? 'Creating...' : 'Create & Start'}
                </button>
                <button
                  onClick={() => setShowGsdForm(false)}
                  className="px-3 py-2 text-surface-500 text-xs rounded-lg hover:text-surface-300 transition-colors"
                >
                  Cancel
                </button>
                <span className="text-[10px] text-surface-600 ml-auto">5-8 phases will be generated</span>
              </div>
            </div>
          )}

          {gsdInitMsg && (
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs ${
                gsdInitMsg.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {gsdInitMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{gsdInitMsg.text}</span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {milestones.length === 0 && !showCreateMs && !gsdStatus?.has_roadmap && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Flag size={32} className="text-surface-600 mb-3" />
          <p className="text-sm text-surface-400 max-w-md">{t('roadmap.noMilestones')}</p>
          <p className="text-xs text-surface-600 mt-2 max-w-sm">
            Create a milestone to start your GSD workflow. Then add phases with goals and success criteria, and let AI
            plan the implementation.
          </p>
        </div>
      )}

      {/* Milestones */}
      {milestones.map((ms) => (
        <div key={ms.id} className="border border-surface-700/50 rounded-xl p-4 bg-surface-900/30">
          <MilestoneSection
            milestone={ms}
            phases={ms.phases || []}
            projectId={projectId}
            onRefresh={loadRoadmap}
            onPlanPhase={handlePlanPhase}
            onExecutePhase={handleExecutePhase}
            t={t}
          />
        </div>
      ))}

      {/* Phase Planning Modal */}
      {planningPhase && (
        <PhasePlanningModal
          key={`plan-${planningPhase.id}`}
          phase={planningPhase}
          projectId={projectId}
          onClose={() => setPlanningPhase(null)}
          onRefresh={loadRoadmap}
        />
      )}
    </div>
  );
}
