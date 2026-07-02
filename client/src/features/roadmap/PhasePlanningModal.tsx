import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, Brain, AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { tauriListen } from '@/lib/tauriEvents';
import type { Phase, Proposal, PlanLog, PlanEvent } from '@/features/roadmap/types';

// ─── Planning Modal ───

interface PhasePlanningModalProps {
  phase: Phase;
  projectId: number;
  onClose: () => void;
  onRefresh: () => void;
}

export function PhasePlanningModal({ phase, projectId, onClose, onRefresh }: PhasePlanningModalProps) {
  const [status, setStatus] = useState('idle'); // idle, planning, proposals, approving
  const [model, setModel] = useState('sonnet');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [deps, setDeps] = useState<unknown[]>([]);
  const [logs, setLogs] = useState<PlanLog[]>([]);
  const [planTitle, setPlanTitle] = useState(`Plan for Phase ${phase.phase_number}`);
  const [, setActivePlanId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startPlanning = async () => {
    setStatus('planning');
    setLogs([]);
    setProposals([]);
    setErrorMsg(null);
    try {
      const result = (await api.planPhase(projectId, phase.id, model, 'medium')) as { planId?: string };
      if (result?.planId) setActivePlanId(result.planId);
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error)?.message || 'Failed to start planning';
      setErrorMsg(msg);
      setStatus('idle');
    }
  };

  const cancelPlanning = async () => {
    try {
      await api.cancelPlanning(projectId);
    } catch (e) {
      console.error('Cancel planning failed:', e);
    }
    setStatus('idle');
    setActivePlanId(null);
  };

  // Listen for planning events - filtered by projectId
  useEffect(() => {
    const unsubs = [
      tauriListen('plan:progress', (payload) => {
        const p = payload as PlanEvent;
        if (p.projectId !== projectId) return;
        if (p.type === 'text') {
          setLogs((prev) => [...prev.slice(-50), { type: 'text', content: p.content }]);
        }
      }),
      tauriListen('plan:log', (payload) => {
        const p = payload as PlanEvent;
        if (p.projectId !== projectId) return;
        setLogs((prev) => [...prev.slice(-50), { type: p.type, content: p.message }]);
      }),
      tauriListen('plan:phase', (payload) => {
        const p = payload as PlanEvent;
        if (p.projectId !== projectId) return;
        if (p.phase === 'exploring' || p.phase === 'writing') {
          setLogs((prev) => [...prev.slice(-50), { type: 'phase', content: `Phase: ${p.phase}` }]);
        }
      }),
      tauriListen('plan:completed', (payload) => {
        const p = payload as PlanEvent;
        if (p.projectId !== projectId) return;
        if (p.proposals && p.proposals.length > 0) {
          setProposals(p.proposals);
          setDeps(p.dependencies || []);
          setStatus('proposals');
        } else {
          const hint = p.error
            ? `Planning failed: ${p.error}`
            : 'Planning finished but no tasks were parsed. Try again with more detail in the phase goal.';
          setErrorMsg(hint);
          setLogs((prev) => [...prev, { type: 'error', content: hint }]);
          setStatus('idle');
        }
      }),
      tauriListen('plan:cancelled', (payload) => {
        const p = payload as PlanEvent;
        if (p.projectId !== projectId) return;
        setStatus('idle');
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [projectId]);

  const handleApprove = async () => {
    setStatus('approving');
    setErrorMsg(null);
    try {
      await api.approvePhasePlan(projectId, phase.id, planTitle, proposals, model, deps);
      onRefresh();
      onClose();
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error)?.message || 'Failed to approve plan';
      setErrorMsg(msg);
      setStatus('proposals');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-850 border border-surface-700 rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-700">
          <Brain size={18} className="text-blue-400" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-surface-100">
              AI Plan: Phase {phase.phase_number} - {phase.title}
            </h3>
            <p className="text-[10px] text-surface-500 mt-0.5">{phase.goal}</p>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-[11px] text-red-300">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1">{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-red-400/60 hover:text-red-300">
                <X size={12} />
              </button>
            </div>
          )}
          {status === 'idle' && (
            <>
              <div className="space-y-2">
                <label className="text-xs text-surface-400">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                >
                  <option value="haiku">Haiku (Fast)</option>
                  <option value="sonnet">Sonnet (Balanced)</option>
                  <option value="opus">Opus (Best)</option>
                </select>
              </div>
              <button
                onClick={startPlanning}
                className="w-full py-2 bg-blue-500/20 text-blue-400 text-sm font-medium rounded-lg hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <Brain size={16} /> Start AI Planning
              </button>
            </>
          )}

          {status === 'planning' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-blue-400">
                  <Loader2 size={14} className="animate-spin" />
                  Planning in progress...
                </div>
                <button
                  onClick={cancelPlanning}
                  className="text-[11px] px-2 py-1 bg-surface-800 border border-surface-700 text-surface-400 hover:text-red-400 hover:border-red-500/40 rounded"
                >
                  Cancel
                </button>
              </div>
              <div className="bg-surface-900 rounded-lg p-3 max-h-48 overflow-auto">
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className={`text-[10px] font-mono ${l.type === 'error' ? 'text-red-400' : l.type === 'tool' ? 'text-amber-400' : 'text-surface-500'}`}
                  >
                    {l.content?.substring(0, 200)}
                  </div>
                ))}
                {logs.length === 0 && <div className="text-[10px] text-surface-600">Waiting for output...</div>}
              </div>
            </div>
          )}

          {status === 'proposals' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-surface-300">{proposals.length} tasks proposed</span>
                <input
                  type="text"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="px-2 py-1 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 w-48"
                  placeholder="Plan title"
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {proposals.map((p, i) => (
                  <div key={i} className="bg-surface-800/50 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-surface-600">#{i + 1}</span>
                      <span className="text-xs font-medium text-surface-200">{p.title}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-surface-700 text-surface-500">
                        {p.task_type || 'feature'}
                      </span>
                    </div>
                    {p.description && <p className="text-[10px] text-surface-500 line-clamp-2">{p.description}</p>}
                    {p.acceptance_criteria && (
                      <p className="text-[10px] text-emerald-400/70">
                        <CheckCircle2 size={9} className="inline mr-1" />
                        {p.acceptance_criteria}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {deps.length > 0 && (
                <div className="text-[10px] text-surface-500">
                  {deps.length} dependency edge{deps.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {status === 'approving' && (
            <div className="flex items-center justify-center py-8 gap-2 text-surface-400">
              <Loader2 size={16} className="animate-spin" />
              Creating tasks...
            </div>
          )}
        </div>

        {/* Footer */}
        {status === 'proposals' && (
          <div className="flex gap-2 px-5 py-4 border-t border-surface-700">
            <button
              onClick={handleApprove}
              className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={14} /> Approve & Create Tasks
            </button>
            <button
              onClick={() => {
                setStatus('idle');
                setProposals([]);
              }}
              className="px-4 py-2 text-surface-500 text-sm rounded-lg hover:text-surface-300 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
