import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle2,
  Loader2,
  Play,
  Brain,
  Zap,
  Eye,
  AlertTriangle,
  X,
  RefreshCw,
  Map,
  BookOpen,
  FolderOpen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { tauriListen } from '@/lib/tauriEvents';
import type { Task } from '@/lib/types';
import type {
  StatusMsg,
  PlanLog,
  PlanEvent,
  GsdPhase,
  GsdRoadmap,
  GsdState,
  GsdProject,
  GsdPhaseDetail,
  GsdPlanTask,
  GsdAction,
} from '@/features/roadmap/types';
import { GSD_PHASE_STATUS_COLORS } from '@/features/roadmap/colors';
import { ProgressBar } from '@/features/roadmap/ProgressBar';
import { PhaseDescription } from '@/features/roadmap/phaseDescription';
import { GsdProjectOverview } from '@/features/roadmap/GsdProjectOverview';
import { PlanPreviewPanel } from '@/features/roadmap/PlanPreviewPanel';

// Normalize phase number: "01" → "1", "001" → "1", "0" → "0"
const normalizePhaseNum = (n: string | number): string => {
  const s = String(n).replace(/^0+/, '');
  return s || '0';
};

const GSD_ACTIONS = {
  pending: {
    label: 'Plan Phase',
    icon: Brain,
    command: 'plan-phase',
    color: 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
    prompt: (n, title) =>
      `Run /gsd:plan-phase ${n} for phase "${title}". Research how to implement this phase, create detailed execution plans with task breakdown, dependencies, and verification criteria. Write the plans to .planning/phases/.`,
  },
  planning: {
    label: 'Execute Phase',
    icon: Play,
    command: 'execute-phase',
    color: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    prompt: (n, title) =>
      `Run /gsd:execute-phase ${n} for phase "${title}". Read the plans from .planning/phases/ and execute them in wave order. Make atomic commits for each completed task. Update STATE.md with progress.`,
  },
  in_progress: {
    label: 'Continue',
    icon: Play,
    command: 'execute-phase',
    color: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    prompt: (n, title) =>
      `Continue executing /gsd:execute-phase ${n} for phase "${title}". Check STATE.md and .planning/phases/ for remaining tasks and pick up where we left off.`,
  },
  completed: {
    label: 'Verify',
    icon: Eye,
    command: 'verify-work',
    color: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
    prompt: (n, title) =>
      `Run /gsd:verify-work ${n} for phase "${title}". Verify the implementation against the success criteria and acceptance tests defined in the phase plans. Write verification results to .planning/phases/.`,
  },
  failed: {
    label: 'Retry',
    icon: RefreshCw,
    command: 'execute-phase',
    color: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
    prompt: (n, title) =>
      `Run /gsd:execute-phase ${n} for phase "${title}". The previous execution failed. Check .planning/phases/ for error context and retry the failed tasks.`,
  },
} satisfies Record<string, GsdAction>;

export function GsdFileRoadmap({ projectId }: { projectId: number }) {
  const [gsdRoadmap, setGsdRoadmap] = useState<GsdRoadmap | null>(null);
  const [gsdState, setGsdState] = useState<GsdState | null>(null);
  const [gsdProject, setGsdProject] = useState<GsdProject | null>(null);
  const [phaseDetails, setPhaseDetails] = useState<GsdPhaseDetail[]>([]);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyPhase, setBusyPhase] = useState<string | null>(null);
  const [planningPhase, setPlanningPhase] = useState<GsdPhase | null>(null);
  const [planLogs, setPlanLogs] = useState<PlanLog[]>([]);
  const [phaseMsg, setPhaseMsg] = useState<StatusMsg | null>(null);
  const [generatedPhases, setGeneratedPhases] = useState<Set<string>>(new Set()); // phases that already have board tasks
  const [planPreviews, setPlanPreviews] = useState<Record<string, GsdPlanTask[]>>({}); // phaseNum → parsed GsdPlanTask[]
  const [previewLoadingPhase, setPreviewLoadingPhase] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [roadmap, state, project, details, tasks] = await Promise.all([
        api.gsdGetRoadmap(projectId) as Promise<GsdRoadmap>,
        api.gsdGetState(projectId) as Promise<GsdState>,
        api.gsdGetProject(projectId).catch(() => null) as Promise<GsdProject | null>,
        api.gsdGetPhaseDetails(projectId) as Promise<GsdPhaseDetail[]>,
        api.getTasks(projectId).catch(() => [] as Task[]),
      ]);
      setGsdRoadmap(roadmap);
      setGsdState(state);
      setGsdProject(project);
      setPhaseDetails(details);
      // Check which phases already have generated board tasks (tag: "phase-N")
      const generated = new Set<string>();
      for (const t of tasks) {
        const tags = (t as { tags?: string }).tags || '';
        const match = tags.match(/phase-(\d+)/);
        if (match?.[1] && tags.includes('gsd')) generated.add(normalizePhaseNum(match[1]));
      }
      setGeneratedPhases(generated);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: the sync loading-flag toggle marks the refetch start
    void load();
  }, [load]);

  // Listen for planning events
  useEffect(() => {
    const unsubs = [
      tauriListen('plan:log', (payload) => {
        const p = payload as PlanEvent | undefined;
        if (p?.projectId !== projectId || !planningPhase) return;
        setPlanLogs((prev) => [...prev.slice(-100), { type: p.type, message: p.message }]);
      }),
      tauriListen('plan:phase', (payload) => {
        const p = payload as PlanEvent | undefined;
        if (p?.projectId !== projectId || !planningPhase) return;
        setPlanLogs((prev) => [...prev, { type: 'phase', message: `Phase: ${p.phase}` }]);
      }),
      // Listener contract is void-returning — run the async completion flow detached.
      tauriListen('plan:completed', (payload) => {
        void (async () => {
          const p = payload as PlanEvent | undefined;
          if (p?.projectId !== projectId || !planningPhase) return;
          const finishedPhase = planningPhase;
          setPlanningPhase(null);
          if (p.error) {
            await load();
            setPhaseMsg({ type: 'error', text: `Planning failed: ${p.error}` });
            return;
          }
          // Pick up PLAN.md files the agent just wrote, then auto-generate tasks.
          let details: GsdPhaseDetail[] = [];
          try {
            details = (await api.gsdGetPhaseDetails(projectId)) as GsdPhaseDetail[];
          } catch {}
          const phaseNum = normalizePhaseNum(finishedPhase.number);
          const hasPlan = details.some((d) => {
            const dNum = normalizePhaseNum(d.number);
            return dNum === phaseNum && d.files?.some((f) => f.name.toLowerCase().includes('plan'));
          });
          await load();
          if (!hasPlan) {
            setPhaseMsg({
              type: 'error',
              text: `Planning finished but no PLAN.md files were written to .planning/phases/. Try again with a clearer phase goal.`,
            });
            return;
          }
          try {
            const created = (await api.gsdCreateTasksFromPlans(
              projectId,
              finishedPhase.number as unknown as number,
              finishedPhase.title,
              true,
            )) as unknown[];
            if (created.length > 0) {
              setGeneratedPhases((prev) => new Set([...prev, phaseNum]));
              setPhaseMsg({
                type: 'success',
                text: `Phase ${finishedPhase.number}: ${created.length} tasks created and queued for execution.`,
              });
            } else {
              setPhaseMsg({
                type: 'error',
                text: `No tasks could be extracted from PLAN files for Phase ${finishedPhase.number}.`,
              });
            }
          } catch (e) {
            setPhaseMsg({
              type: 'error',
              text: typeof e === 'string' ? e : (e as Error | undefined)?.message || 'Failed to generate tasks',
            });
          }
        })();
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [projectId, planningPhase, load]);

  // Plan Phase: run via start_planning (inline, no worktree)
  const handlePlanPhase = async (phase: GsdPhase) => {
    if (busyPhase || planningPhase) return;
    setBusyPhase(phase.number);
    setPlanningPhase(phase);
    setPlanLogs([]);
    setPhaseMsg(null);
    try {
      const topic = `GSD plan-phase ${phase.number}: ${phase.title}`;
      const context = [
        `## GSD Phase Planning`,
        `Phase ${phase.number}: ${phase.title}`,
        phase.description ? `Description: ${phase.description}` : '',
        ``,
        `## Instructions`,
        `Research how to implement this phase and create detailed execution plans.`,
        `Write PLAN.md files to .planning/phases/ directory following GSD format:`,
        `- YAML front matter with: phase, plan, wave, depends_on, files_modified, autonomous`,
        `- <tasks> section with <task type="auto"> elements containing: <name>, <files>, <action>, <verify>, <done>`,
        `- Create 2-4 plans per phase, grouped by wave for parallel execution`,
        `- Each task should be an atomic unit of work (15-60 min)`,
      ]
        .filter(Boolean)
        .join('\n');
      await api.startPlanning(projectId, { topic, context, model: 'sonnet' });
    } catch (e) {
      setPhaseMsg({
        type: 'error',
        text: typeof e === 'string' ? e : (e as Error | undefined)?.message || 'Failed to start planning',
      });
      setPlanningPhase(null);
    }
    setBusyPhase(null);
  };

  // Other actions: verify, retry — creates a single task
  const handleOtherAction = async (phase: GsdPhase, action: GsdAction) => {
    if (busyPhase) return;
    setBusyPhase(phase.number);
    setPhaseMsg(null);
    try {
      const task = await api.createTask(projectId, {
        title: `GSD ${action.command}: Phase ${phase.number} - ${phase.title}`,
        description: action.prompt(phase.number, phase.title),
        taskType: 'chore',
        model: 'sonnet',
        tags: `gsd,gsd-${action.command},phase-${phase.number}`,
      } as Partial<Task>);
      if (task.id) {
        await api.restartTask(task.id);
        setPhaseMsg({
          type: 'success',
          text: `${action.label} started for Phase ${phase.number}. Task: ${task.task_key || task.title}`,
        });
      }
    } catch (e) {
      setPhaseMsg({ type: 'error', text: typeof e === 'string' ? e : (e as Error | undefined)?.message || 'Failed' });
    }
    setBusyPhase(null);
  };

  // Preview Tasks: parse PLAN files without creating anything
  const handlePreviewTasks = async (phase: GsdPhase) => {
    if (previewLoadingPhase) return;
    setPreviewLoadingPhase(phase.number);
    setPhaseMsg(null);
    try {
      const parsed = (await api.gsdParsePhasePlans(projectId, phase.number as unknown as number)) as GsdPlanTask[] | undefined;
      const key = normalizePhaseNum(phase.number);
      setPlanPreviews((prev) => ({ ...prev, [key]: parsed || [] }));
      if (!parsed || parsed.length === 0) {
        setPhaseMsg({
          type: 'error',
          text: `No tasks could be parsed from PLAN files for Phase ${phase.number}. Check the PLAN.md syntax.`,
        });
      }
    } catch (e) {
      setPhaseMsg({
        type: 'error',
        text: typeof e === 'string' ? e : (e as Error | undefined)?.message || 'Failed to parse PLAN files',
      });
    }
    setPreviewLoadingPhase(null);
  };

  const clearPreview = (phaseNumber: string) => {
    const key = normalizePhaseNum(phaseNumber);
    setPlanPreviews((prev) => {
      const next = { ...prev };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- intentional eviction from a local copied preview map
      delete next[key];
      return next;
    });
  };

  // Generate Tasks: parse PLAN files → create board tasks → queue
  const handleGenerateTasks = async (phase: GsdPhase) => {
    if (busyPhase) return;
    setBusyPhase(phase.number);
    setPhaseMsg(null);
    try {
      const created = (await api.gsdCreateTasksFromPlans(
        projectId,
        phase.number as unknown as number,
        phase.title,
        true,
      )) as unknown[];
      if (created.length > 0) {
        setGeneratedPhases((prev) => new Set([...prev, normalizePhaseNum(phase.number)]));
        clearPreview(phase.number);
        setPhaseMsg({
          type: 'success',
          text: `Phase ${phase.number}: ${created.length} tasks created and queued for execution.`,
        });
      } else {
        setPhaseMsg({ type: 'error', text: `No tasks could be extracted from PLAN files for Phase ${phase.number}.` });
      }
    } catch (e) {
      setPhaseMsg({ type: 'error', text: typeof e === 'string' ? e : (e as Error | undefined)?.message || 'Failed' });
    }
    setBusyPhase(null);
  };

  if (loading) return null;
  if (!gsdRoadmap) return null;

  const phases = gsdRoadmap.phases || [];
  const completed = phases.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-3">
      <GsdProjectOverview project={gsdProject} state={gsdState} />
      <div className="border border-surface-700/50 rounded-xl bg-surface-900/30 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-700/30 flex items-center gap-2">
          <Map size={14} className="text-claude" />
          <h3 className="text-sm font-semibold text-surface-200">.planning/ Roadmap</h3>
          <span className="text-[10px] text-surface-500">
            {completed}/{phases.length} phases
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {gsdState?.current_phase && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
                {gsdState.current_phase}
              </span>
            )}
            {gsdState?.current_step && <span className="text-[10px] text-surface-500">{gsdState.current_step}</span>}
            <button onClick={load} className="p-1 text-surface-500 hover:text-surface-300 transition-colors">
              <RefreshCw size={12} />
            </button>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className={`p-1 transition-colors ${showRaw ? 'text-claude' : 'text-surface-500 hover:text-surface-300'}`}
              title="Show raw ROADMAP.md"
            >
              <FileText size={12} />
            </button>
          </div>
        </div>

        {/* Phase action feedback */}
        {phaseMsg && (
          <div
            className={`mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              phaseMsg.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {phaseMsg.type === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            <span className="flex-1">{phaseMsg.text}</span>
            <button onClick={() => setPhaseMsg(null)} className="opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Planning in progress */}
        {planningPhase && (
          <div className="mx-3 mt-3 border border-blue-500/20 rounded-lg bg-blue-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-500/10">
              <Loader2 size={12} className="animate-spin text-blue-400" />
              <span className="text-xs font-medium text-blue-400">
                Planning Phase {planningPhase.number}: {planningPhase.title}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto p-2 space-y-0.5">
              {planLogs.map((log, i) => (
                <div
                  key={i}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'tool'
                        ? 'text-surface-400'
                        : log.type === 'phase'
                          ? 'text-blue-400 font-medium'
                          : 'text-surface-500'
                  }`}
                >
                  {log.message}
                </div>
              ))}
              {planLogs.length === 0 && (
                <div className="text-[10px] text-surface-600 px-2">Starting planning agent...</div>
              )}
            </div>
          </div>
        )}

        {showRaw ? (
          <pre className="p-4 text-xs text-surface-400 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
            {gsdRoadmap.raw}
          </pre>
        ) : (
          <div className="p-3 space-y-1">
            {/* Progress bar */}
            {phases.length > 0 && (
              <div className="mb-3">
                <ProgressBar
                  total={phases.length}
                  done={completed}
                  inProgress={phases.filter((p) => p.status === 'in_progress').length}
                  failed={phases.filter((p) => p.status === 'failed').length}
                />
              </div>
            )}

            {phases.map((phase) => {
              const phaseNum = normalizePhaseNum(phase.number);
              const detail = phaseDetails.find((d) => {
                const dNum = normalizePhaseNum(d.number);
                return dNum === phaseNum;
              });
              const isExpanded = expandedPhase === phase.number;
              const hasPlan = detail?.files?.some((f) => f.name.toLowerCase().includes('plan'));
              const hasGeneratedTasks = generatedPhases.has(phaseNum);
              const isBusy = busyPhase === phase.number;

              return (
                <div
                  key={phase.number}
                  className="rounded-lg border border-surface-700/30 bg-surface-800/30 overflow-hidden"
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : phase.number)}
                      className="flex-1 flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-800/60 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown size={12} className="text-surface-500" />
                      ) : (
                        <ChevronRight size={12} className="text-surface-500" />
                      )}
                      <span className="text-[10px] font-mono text-surface-500 w-6">{phase.number}</span>
                      <span className="text-xs text-surface-200 flex-1">{phase.title}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${GSD_PHASE_STATUS_COLORS[phase.status] || GSD_PHASE_STATUS_COLORS.pending}`}
                      >
                        {phase.status}
                      </span>
                      {detail && (
                        <span className="text-[10px] text-surface-600">
                          <FolderOpen size={10} className="inline -mt-0.5" /> {detail.files?.length ?? 0}
                        </span>
                      )}
                    </button>

                    {/* Phase action buttons — state machine */}
                    <div className="flex items-center gap-1 mr-2">
                      {/* No PLAN files yet → Plan Phase */}
                      {!hasPlan && (phase.status === 'pending' || phase.status === 'planning') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handlePlanPhase(phase);
                          }}
                          disabled={!!busyPhase || !!planningPhase}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                        >
                          {isBusy || planningPhase?.number === phase.number ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Brain size={10} />
                          )}
                          {planningPhase?.number === phase.number ? 'Planning...' : 'Plan Phase'}
                        </button>
                      )}

                      {/* Has PLAN files but no board tasks yet → Generate Tasks */}
                      {hasPlan && !hasGeneratedTasks && (phase.status === 'pending' || phase.status === 'planning') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleGenerateTasks(phase);
                          }}
                          disabled={!!busyPhase}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40 bg-claude/15 text-claude hover:bg-claude/25"
                        >
                          {isBusy ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                          Generate Tasks
                        </button>
                      )}

                      {/* Completed → Verify */}
                      {phase.status === 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOtherAction(phase, GSD_ACTIONS.completed);
                          }}
                          disabled={!!busyPhase}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        >
                          <Eye size={10} />
                          Verify
                        </button>
                      )}

                      {/* Failed → Retry */}
                      {phase.status === 'failed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleGenerateTasks(phase);
                          }}
                          disabled={!!busyPhase}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                        >
                          <RefreshCw size={10} />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-surface-700/20">
                      <PhaseDescription description={phase.description} />

                      {/* Phase files */}
                      {detail &&
                        (detail.files ?? []).map((file) => {
                          const fileKey = `${phase.number}-${file.name}`;
                          const isFileExpanded = expandedFile === fileKey;
                          const fileType = file.name.includes('PLAN')
                            ? 'plan'
                            : file.name.includes('CONTEXT')
                              ? 'context'
                              : file.name.includes('RESEARCH')
                                ? 'research'
                                : file.name.includes('VERIFICATION')
                                  ? 'verify'
                                  : file.name.includes('SUMMARY')
                                    ? 'summary'
                                    : 'other';
                          const typeColors = {
                            plan: 'text-blue-400',
                            context: 'text-purple-400',
                            research: 'text-amber-400',
                            verify: 'text-emerald-400',
                            summary: 'text-surface-400',
                            other: 'text-surface-500',
                          };

                          return (
                            <div key={file.name} className="ml-7">
                              <button
                                onClick={() => setExpandedFile(isFileExpanded ? null : fileKey)}
                                className="flex items-center gap-2 w-full text-left py-1 hover:bg-surface-800/40 rounded px-2 -mx-2"
                              >
                                <BookOpen size={10} className={typeColors[fileType]} />
                                <span className="text-[11px] font-mono text-surface-400">{file.name}</span>
                                <span className="text-[10px] text-surface-600 ml-auto">
                                  {Math.round(file.content.length / 100) / 10}k
                                </span>
                              </button>
                              {isFileExpanded && (
                                <pre className="mt-1 p-3 bg-surface-900 rounded-lg text-[11px] text-surface-400 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto border border-surface-700/30">
                                  {file.content}
                                </pre>
                              )}
                            </div>
                          );
                        })}

                      {/* Parsed-task preview — shows what tasks would be generated from PLAN.md files */}
                      {hasPlan && (
                        <PlanPreviewPanel
                          phase={phase}
                          preview={planPreviews[phaseNum]}
                          loading={previewLoadingPhase === phase.number}
                          generating={busyPhase === phase.number}
                          hasGeneratedTasks={hasGeneratedTasks}
                          onLoad={() => handlePreviewTasks(phase)}
                          onGenerate={() => handleGenerateTasks(phase)}
                          onClear={() => clearPreview(phase.number)}
                        />
                      )}

                      {!detail && (
                        <p className="text-[10px] text-surface-600 mt-2 pl-7 italic">
                          No phase files yet — click &quot;Plan Phase&quot; to start.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
