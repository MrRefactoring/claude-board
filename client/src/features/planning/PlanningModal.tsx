import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, CheckCircle2, StopCircle, Loader2, RotateCcw, Check, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { tauriListen, IS_TAURI } from '@/lib/tauriEvents';
import { useTranslation } from '@/i18n/I18nProvider';
import { getCache } from '@/features/planning/planningHelpers';
import type { PlanProposal, PlanDependency, PlanStats, PlanPhaseName } from '@/features/planning/planningHelpers';
import { StepIndicator } from '@/features/planning/StepIndicator';
import { PlanPhaseDefine } from '@/features/planning/PlanPhaseDefine';
import { PlanPhaseAnalyze } from '@/features/planning/PlanPhaseAnalyze';
import { PlanPhaseReview } from '@/features/planning/PlanPhaseReview';

interface PlanningModalProps {
  projectId: number;
  onClose: () => void;
}

// Realtime `plan:*` payloads are typed `unknown` in AppEventMap; these narrow
// them to just the fields this modal reads.
interface PlanProgressEvent {
  projectId: number;
  content?: string;
}
interface PlanLogEvent {
  projectId: number;
  type: string;
  message: string;
}
interface PlanPhaseEvent {
  projectId: number;
  phase: string;
}
interface PlanStatsEvent {
  projectId: number;
  tokens: { input: number; output: number };
  toolCalls: number;
  turns: number;
}
interface PlanCompletedEvent {
  projectId: number;
  stats?: Partial<PlanStats>;
  analysis?: string;
  proposals?: PlanProposal[];
  dependencies?: PlanDependency[];
}
interface PlanCancelledEvent {
  projectId: number;
}
interface PlanningStatus {
  active?: boolean;
  elapsed?: number;
  phase?: string;
}

export default function PlanningModal({ projectId, onClose }: PlanningModalProps) {
  const { t } = useTranslation();
  const c = getCache(projectId);
  const [topic, setTopic] = useState<string>(c.topic);
  const [context, setContext] = useState<string>(c.context);
  const [model, setModel] = useState<string>(c.model);
  const [effort, setEffort] = useState<string>(c.effort);
  const [granularity, setGranularity] = useState<string>(c.granularity);
  const [phase, setPhase] = useState<PlanPhaseName>(c.phase);
  const [planPhase, setPlanPhase] = useState<string>(c.planPhase);
  const [logs, setLogs] = useState(c.logs);
  const [analysis, setAnalysis] = useState<string>(c.analysis);
  const [proposals, setProposals] = useState(c.proposals);
  const [dependencies, setDependencies] = useState(c.dependencies);
  const [stats, setStats] = useState<PlanStats>(c.stats);
  const [error, setError] = useState<string | null>(c.error);
  const [showLogs, setShowLogs] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [showDag, setShowDag] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Save state to cache on every change
  useEffect(() => {
    Object.assign(getCache(projectId), {
      phase,
      planPhase,
      logs,
      analysis,
      proposals,
      dependencies,
      stats,
      error,
      topic,
      context,
      model,
      effort,
      granularity,
    });
  }, [
    projectId,
    phase,
    planPhase,
    logs,
    analysis,
    proposals,
    dependencies,
    stats,
    error,
    topic,
    context,
    model,
    effort,
    granularity,
  ]);

  // Resume active session
  useEffect(() => {
    let cancelled = false;
    api
      .getPlanningStatus(projectId)
      .then((data) => {
        if (cancelled) return;
        const status = data as PlanningStatus;
        if (status.active) {
          startTimeRef.current = Date.now() - (status.elapsed || 0);
          setPhase('thinking');
          setPlanPhase(status.phase || 'starting');
        } else {
          sessionStorage.removeItem('planning:active');
        }
      })
      .catch((e) => console.error('Failed to load planning status:', e));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Elapsed timer — restore from cached elapsed on remount
  useEffect(() => {
    if (phase === 'thinking') {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - (stats.elapsed || 0);
      }
      timerRef.current = setInterval(() => {
        setStats((s) => ({ ...s, elapsed: Date.now() - (startTimeRef.current ?? 0) }));
      }, 1000);
    } else {
      startTimeRef.current = null;
    }
    return () => clearInterval(timerRef.current ?? undefined);
  }, [phase, stats.elapsed]);

  // Events
  useEffect(() => {
    const pid = projectId;

    const onProgress = (data: unknown) => {
      const evt = data as PlanProgressEvent;
      if (evt.projectId !== pid) return;
      setPhase('thinking');
      // Stream all content types to analysis (text, thinking)
      if (evt.content) {
        setAnalysis((prev) => prev + evt.content);
      }
    };

    const onLog = (data: unknown) => {
      const evt = data as PlanLogEvent;
      if (evt.projectId !== pid || evt.type === 'phase') return;
      setLogs((prev) => [...prev, { type: evt.type, message: evt.message, ts: Date.now() }]);
      // Also update stats from tool/result logs
      if (evt.type === 'tool') setStats((prev) => ({ ...prev, toolCalls: (prev.toolCalls || 0) + 1 }));
    };

    const onPhase = (data: unknown) => {
      const evt = data as PlanPhaseEvent;
      if (evt.projectId !== pid) return;
      setPlanPhase(evt.phase);
    };

    const onStats = (data: unknown) => {
      const evt = data as PlanStatsEvent;
      if (evt.projectId !== pid) return;
      setStats((prev) => ({ ...prev, tokens: evt.tokens, toolCalls: evt.toolCalls, turns: evt.turns }));
    };

    const onCompleted = (data: unknown) => {
      const evt = data as PlanCompletedEvent;
      if (evt.projectId !== pid) return;
      clearInterval(timerRef.current ?? undefined);
      sessionStorage.removeItem('planning:active');
      if (evt.stats) setStats((prev) => ({ ...prev, ...evt.stats }));
      if (evt.analysis) setAnalysis(evt.analysis);
      if (evt.proposals && evt.proposals.length > 0) {
        setProposals(evt.proposals);
        setDependencies(evt.dependencies || []);
        setPhase('review');
        setPlanPhase('done');
      } else {
        setPhase('error');
        setError('Claude could not generate structured tasks. Try rephrasing or adding more context.');
      }
    };

    const onCancelled = (data: unknown) => {
      const evt = data as PlanCancelledEvent;
      if (evt.projectId !== pid) return;
      clearInterval(timerRef.current ?? undefined);
      sessionStorage.removeItem('planning:active');
      setPhase('idle');
      setPlanPhase('starting');
      setLogs([]);
      setAnalysis('');
    };

    if (IS_TAURI) {
      const unsubs = [
        tauriListen('plan:progress', onProgress),
        tauriListen('plan:log', onLog),
        tauriListen('plan:phase', onPhase),
        tauriListen('plan:stats', onStats),
        tauriListen('plan:completed', onCompleted),
        tauriListen('plan:cancelled', onCancelled),
      ];
      return () => unsubs.forEach((fn) => fn());
    } else {
      socket.on('plan:progress', onProgress);
      socket.on('plan:log', onLog);
      socket.on('plan:phase', onPhase);
      socket.on('plan:stats', onStats);
      socket.on('plan:completed', onCompleted);
      socket.on('plan:cancelled', onCancelled);
      return () => {
        socket.off('plan:progress', onProgress);
        socket.off('plan:log', onLog);
        socket.off('plan:phase', onPhase);
        socket.off('plan:stats', onStats);
        socket.off('plan:completed', onCompleted);
        socket.off('plan:cancelled', onCancelled);
      };
    }
  }, [projectId]);

  const handleStart = async () => {
    if (!topic.trim()) return;
    setPhase('thinking');
    setPlanPhase('starting');
    setLogs([]);
    setAnalysis('');
    setProposals([]);
    setDependencies([]);
    setError(null);
    setStats({ elapsed: 0, tokens: { input: 0, output: 0 }, toolCalls: 0, turns: 0 });
    startTimeRef.current = Date.now();
    try {
      sessionStorage.setItem('planning:active', 'true');
      await api.startPlanning(projectId, { topic: topic.trim(), model, effort, granularity, context: context.trim() });
    } catch (e) {
      setPhase('error');
      setError((e as Error).message);
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelPlanning(projectId);
    } catch {}
    clearInterval(timerRef.current ?? undefined);
    setPhase('idle');
  };

  const handleRemoveProposal = (idx: number) => {
    setProposals((prev) => prev.filter((_, i) => i !== idx));
    // Adjust dependency indices: remove edges referencing idx, shift indices above idx
    setDependencies((prev) =>
      prev
        .filter(([a, b]) => a !== idx && b !== idx)
        .map(([a, b]): PlanDependency => [a > idx ? a - 1 : a, b > idx ? b - 1 : b]),
    );
  };

  const handleApprove = async () => {
    if (proposals.length === 0) return;
    setApproving(true);
    try {
      await api.approvePlan(
        projectId,
        proposals,
        model,
        dependencies.length > 0 ? dependencies : null,
        (topic || null) as string,
      );
      setPhase('approved');
    } catch (e) {
      setError((e as Error).message);
    }
    setApproving(false);
  };

  const handleRevise = () => {
    setPhase('idle');
    setPlanPhase('starting');
    setProposals([]);
    setDependencies([]);
    setLogs([]);
    setAnalysis('');
    // Keep topic and context so user can modify
  };

  const isActive = phase === 'thinking';

  const handleClose = () => {
    if (phase === 'approved') {
      Object.assign(getCache(projectId), {
        phase: 'idle',
        planPhase: 'starting',
        logs: [],
        analysis: '',
        proposals: [],
        dependencies: [],
        stats: { elapsed: 0, tokens: { input: 0, output: 0 }, toolCalls: 0, turns: 0 },
        error: null,
        topic: '',
        context: '',
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-surface-900 border border-surface-700/50 rounded-2xl w-full max-w-3xl mx-4 shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-claude" />
            <h2 className="text-sm font-semibold">{t('planning.title')}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator phase={phase} t={t} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4 min-h-0">
          {/* STEP 1: Define Phase (idle / error) */}
          {(phase === 'idle' || phase === 'error') && (
            <PlanPhaseDefine
              topic={topic}
              setTopic={setTopic}
              context={context}
              setContext={setContext}
              model={model}
              setModel={setModel}
              effort={effort}
              setEffort={setEffort}
              granularity={granularity}
              setGranularity={setGranularity}
              error={error}
              analysis={analysis}
              showAnalysis={showAnalysis}
              setShowAnalysis={setShowAnalysis}
              showContext={showContext}
              setShowContext={setShowContext}
              t={t}
            />
          )}

          {/* STEP 2: Analyze Phase (thinking) */}
          {isActive && (
            <PlanPhaseAnalyze
              stats={stats}
              topic={topic}
              planPhase={planPhase}
              logs={logs}
              analysis={analysis}
              showAnalysis={showAnalysis}
              setShowAnalysis={setShowAnalysis}
              isActive={isActive}
              t={t}
            />
          )}

          {/* STEP 3: Review Phase */}
          {phase === 'review' && (
            <PlanPhaseReview
              proposals={proposals}
              dependencies={dependencies}
              stats={stats}
              logs={logs}
              analysis={analysis}
              showAnalysis={showAnalysis}
              setShowAnalysis={setShowAnalysis}
              showLogs={showLogs}
              setShowLogs={setShowLogs}
              expandedTask={expandedTask}
              setExpandedTask={setExpandedTask}
              showDag={showDag}
              setShowDag={setShowDag}
              handleRemoveProposal={handleRemoveProposal}
              t={t}
            />
          )}

          {/* STEP 4: Complete Phase (approved) */}
          {phase === 'approved' && (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-5 ring-2 ring-emerald-500/20">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-surface-200 mb-2">
                {t('planning.tasksCreated').replace('{count}', String(proposals.length))}
              </h3>
              <p className="text-xs text-surface-500 text-center max-w-sm">{t('planning.allCreated')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3 border-t border-surface-800 flex-shrink-0">
          {isActive ? (
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors"
            >
              <StopCircle size={14} /> {t('planning.cancelBtn')}
            </button>
          ) : phase === 'review' ? (
            <>
              <button
                onClick={handleRevise}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-xl transition-colors"
              >
                <RotateCcw size={14} /> {t('planning.revise')}
              </button>
              <button
                onClick={handleApprove}
                disabled={proposals.length === 0 || approving}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl transition-colors"
              >
                {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {approving
                  ? t('planning.creating')
                  : t('planning.approveCreate').replace('{count}', String(proposals.length))}
              </button>
            </>
          ) : phase === 'approved' ? (
            <>
              <button
                onClick={() => {
                  setPhase('idle');
                  setProposals([]);
                  setLogs([]);
                  setAnalysis('');
                }}
                className="px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-xl transition-colors"
              >
                {t('planning.planAgain')}
              </button>
              <button
                onClick={handleClose}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
              >
                <ArrowRight size={14} /> {t('planning.doneViewBoard')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-xl transition-colors"
              >
                {t('planning.cancelBtn')}
              </button>
              <button
                onClick={handleStart}
                disabled={!topic.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-claude hover:bg-claude-light disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
              >
                <Sparkles size={14} /> {t('planning.startPlanning')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
