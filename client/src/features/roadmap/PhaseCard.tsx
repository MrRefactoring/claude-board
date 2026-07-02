import { useState } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Target,
  FileText,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Brain,
  Trash2,
  Edit3,
  Link2,
  Eye,
  AlertTriangle,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Task, TranslateFn } from '@/lib/types';
import type { Phase, Plan, ProgressData, Criterion } from '@/features/roadmap/types';
import { PHASE_STATUS_COLORS } from '@/features/roadmap/colors';
import { ProgressBar } from '@/features/roadmap/ProgressBar';
import { PlanRow } from '@/features/roadmap/PlanRow';

interface PhaseCardProps {
  phase: Phase;
  plans: Plan[];
  progress: ProgressData;
  onToggle: () => void;
  expanded: boolean;
  onPlanPhase: (phase: Phase) => void;
  onExecute: (phase: Phase) => void;
  onInsertPhase: (phase: Phase) => void;
  onRefresh: () => void;
  projectId: number;
  t: TranslateFn;
}

export function PhaseCard({
  phase,
  plans,
  progress,
  onToggle,
  expanded,
  onPlanPhase,
  onExecute,
  onInsertPhase,
  onRefresh,
  projectId,
  t,
}: PhaseCardProps) {
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ title: '' });
  const [showLinkTask, setShowLinkTask] = useState<number | null>(null); // plan_id
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkCheckpoint, setLinkCheckpoint] = useState('auto');
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [newCriterion, setNewCriterion] = useState('');
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    title: phase.title,
    goal: phase.goal || '',
    description: phase.description || '',
  });

  const criteria: Criterion[] = (() => {
    try {
      return JSON.parse(phase.success_criteria || '[]') as Criterion[];
    } catch {
      return [];
    }
  })();
  const verifiedCount = criteria.filter((c) => c.verified).length;

  const handleAddPlan = async () => {
    if (!newPlan.title.trim()) return;
    const existingCount = plans.length;
    const planNum = `${phase.phase_number.replace('.', '')}-${String(existingCount + 1).padStart(2, '0')}`;
    try {
      await api.createPlan(phase.id, planNum as unknown as number, newPlan.title.trim(), '', 0);
      setNewPlan({ title: '' });
      setShowAddPlan(false);
      onRefresh();
    } catch {}
  };

  const handleLinkTask = async (planId: number) => {
    if (!linkTaskId.trim()) return;
    try {
      await api.linkTaskToPlan(planId, Number(linkTaskId), linkCheckpoint);
      setShowLinkTask(null);
      setLinkTaskId('');
      setLinkCheckpoint('auto');
      onRefresh();
    } catch {}
  };

  const handleToggleCriterion = async (index: number) => {
    const criterion = criteria[index];
    if (!criterion) return;
    try {
      await api.updateSuccessCriterion(phase.id, index, !criterion.verified);
      onRefresh();
    } catch {}
  };

  const handleAddCriterion = async () => {
    if (!newCriterion.trim()) return;
    const updated: Criterion[] = [...criteria, { text: newCriterion.trim(), verified: false }];
    try {
      await api.updatePhase(
        phase.id,
        phase.title,
        phase.description,
        phase.goal,
        JSON.stringify(updated),
        phase.status,
      );
      setNewCriterion('');
      onRefresh();
    } catch {}
  };

  const handleDeletePhase = async () => {
    try {
      await api.deletePhase(phase.id);
      onRefresh();
    } catch {}
  };

  const handleSaveEdit = async () => {
    try {
      await api.updatePhase(
        phase.id,
        editFields.title,
        editFields.description,
        editFields.goal,
        phase.success_criteria,
        phase.status,
      );
      setEditing(false);
      onRefresh();
    } catch {}
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.updatePhase(phase.id, phase.title, phase.description, phase.goal, phase.success_criteria, newStatus);
      onRefresh();
    } catch (e) {
      console.error('Phase status change failed:', e);
    }
  };

  // /gsd:list-phase-assumptions equivalent — surface risky assumptions Claude
  // would be making about this phase before AI planning kicks off. Writes
  // .planning/phase-N/ASSUMPTIONS.md that the user can review/edit before /gsd:plan-phase.
  const [surfacing, setSurfacing] = useState(false);
  const handleSurfaceAssumptions = async () => {
    if (surfacing) return;
    setSurfacing(true);
    const criteriaList = criteria.map((c, i) => `${i + 1}. ${c.text || c.criterion || ''}`).join('\n');
    const description =
      `Surface the implicit assumptions Claude would make if asked to plan Phase ${phase.phase_number} — "${phase.title}" — and write them to .planning/phase-${phase.phase_number}/ASSUMPTIONS.md.\n\n` +
      `## Phase Goal\n${phase.goal || '(no goal specified)'}\n\n` +
      `## Success Criteria\n${criteriaList || '(none defined)'}\n\n` +
      `## Instructions\n` +
      `1. Read the phase goal and success criteria above\n` +
      `2. Inspect the project codebase briefly (entry points, relevant modules)\n` +
      `3. List the implicit assumptions that an AI planner would make, including:\n` +
      `   - Which files/components are in scope vs. out of scope\n` +
      `   - Which libraries/patterns should be used\n` +
      `   - Which edge cases or non-goals are deferred\n` +
      `   - Any ambiguous terms in the goal that have multiple interpretations\n` +
      `4. Write .planning/phase-${phase.phase_number}/ASSUMPTIONS.md with:\n` +
      `   - Numbered list of assumptions, each marked [RISKY] or [SAFE]\n` +
      `   - Open questions the user should answer before planning`;
    try {
      const task = await api.createTask(projectId, {
        title: `Surface assumptions — Phase ${phase.phase_number}`,
        description,
        taskType: 'docs',
        model: 'sonnet',
        acceptanceCriteria: `ASSUMPTIONS.md exists at .planning/phase-${phase.phase_number}/ with numbered assumptions and open questions`,
        tags: JSON.stringify([`phase:${phase.phase_number}`, 'gsd-assumptions']),
      } as Partial<Task>);
      if (task?.id) {
        await api.restartTask(task.id);
      }
      onRefresh();
    } catch (e) {
      console.error('Surface assumptions failed:', e);
    }
    setSurfacing(false);
  };

  // /gsd:validate-phase equivalent — creates & starts a task that drives claude to
  // audit the phase's implementation against its success criteria and emit
  // .planning/phase-N/VALIDATION.md.
  const [validating, setValidating] = useState(false);
  const handleValidatePhase = async () => {
    if (validating) return;
    setValidating(true);
    const criteriaList = criteria
      .map((c, i) => `${i + 1}. [${c.verified ? 'VERIFIED' : 'UNVERIFIED'}] ${c.text || c.criterion || ''}`)
      .join('\n');
    const description =
      `Validate Phase ${phase.phase_number} — "${phase.title}" against its success criteria and produce .planning/phase-${phase.phase_number}/VALIDATION.md.\n\n` +
      `## Goal\n${phase.goal || '(no goal specified)'}\n\n` +
      `## Success Criteria\n${criteriaList || '(none defined)'}\n\n` +
      `## Instructions\n` +
      `1. Read the phase description, goal, and success criteria above\n` +
      `2. Inspect the actual code/artifacts in the project to confirm each criterion is met\n` +
      `3. Run any relevant tests/builds\n` +
      `4. Write .planning/phase-${phase.phase_number}/VALIDATION.md with:\n` +
      `   - Status per criterion (MET / PARTIAL / FAILED)\n` +
      `   - Evidence (file paths, test output) for each\n` +
      `   - Gaps or follow-up work needed\n` +
      `   - Overall verdict: ready / needs-work / failed`;
    try {
      const task = await api.createTask(projectId, {
        title: `Validate Phase ${phase.phase_number}: ${phase.title}`,
        description,
        taskType: 'test',
        model: 'sonnet',
        acceptanceCriteria: `VALIDATION.md exists at .planning/phase-${phase.phase_number}/ with a verdict on each success criterion`,
        tags: JSON.stringify([`phase:${phase.phase_number}`, 'gsd-validate']),
      } as Partial<Task>);
      if (task?.id) {
        await api.restartTask(task.id);
      }
      onRefresh();
    } catch (e) {
      console.error('Validate phase failed:', e);
    }
    setValidating(false);
  };

  return (
    <div className="border border-surface-700 rounded-lg overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-surface-800/50 transition-colors text-left"
        >
          {expanded ? (
            <ChevronDown size={14} className="text-surface-500 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-surface-500 shrink-0" />
          )}
          <span className="text-xs font-mono text-surface-500 shrink-0 w-8">{phase.phase_number}</span>
          <span className="text-sm font-medium text-surface-200 flex-1 truncate">{phase.title}</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${PHASE_STATUS_COLORS[phase.status] || PHASE_STATUS_COLORS.pending}`}
          >
            {phase.status}
          </span>
          {progress.total > 0 && (
            <span className="text-[10px] text-surface-500">
              {progress.done}/{progress.total}
            </span>
          )}
        </button>

        {/* Phase actions */}
        <div className="flex items-center gap-1 pr-3">
          {(phase.status === 'pending' || phase.status === 'planning') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSurfaceAssumptions();
              }}
              disabled={surfacing}
              className="p-1.5 rounded hover:bg-amber-500/20 text-surface-500 hover:text-amber-400 transition-colors disabled:opacity-50"
              title="Surface assumptions before planning (ASSUMPTIONS.md)"
            >
              {surfacing ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            </button>
          )}
          {(phase.status === 'pending' || phase.status === 'planning') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlanPhase(phase);
              }}
              className="p-1.5 rounded hover:bg-blue-500/20 text-surface-500 hover:text-blue-400 transition-colors"
              title="AI Plan Phase"
            >
              <Brain size={14} />
            </button>
          )}
          {plans.length > 0 && phase.status !== 'completed' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExecute(phase);
              }}
              className="p-1.5 rounded hover:bg-emerald-500/20 text-surface-500 hover:text-emerald-400 transition-colors"
              title="Execute Phase"
            >
              <Play size={14} />
            </button>
          )}
          {(phase.status === 'in_progress' || phase.status === 'verifying' || phase.status === 'completed') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleValidatePhase();
              }}
              disabled={validating}
              className="p-1.5 rounded hover:bg-purple-500/20 text-surface-500 hover:text-purple-400 transition-colors disabled:opacity-50"
              title="Validate Phase against success criteria"
            >
              {validating ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInsertPhase(phase);
            }}
            className="p-1.5 rounded hover:bg-amber-500/20 text-surface-500 hover:text-amber-400 transition-colors"
            title="Insert Phase After"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="p-1.5 rounded hover:bg-surface-700 text-surface-600 hover:text-surface-400 transition-colors"
            title="Edit Phase"
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeletePhase();
            }}
            className="p-1.5 rounded hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-colors"
            title="Delete Phase"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-700 px-4 py-3 space-y-3">
          {/* Edit form */}
          {editing ? (
            <div className="space-y-2 p-2 border border-surface-600 rounded-lg bg-surface-800/50">
              <input
                type="text"
                value={editFields.title}
                onChange={(e) => setEditFields((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                placeholder="Phase title"
              />
              <input
                type="text"
                value={editFields.goal}
                onChange={(e) => setEditFields((f) => ({ ...f, goal: e.target.value }))}
                className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                placeholder="Goal"
              />
              <textarea
                value={editFields.description}
                onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 resize-none"
                rows={2}
                placeholder="Description"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 bg-claude/20 text-claude text-xs rounded hover:bg-claude/30"
                >
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="px-3 py-1 text-surface-500 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {phase.goal && (
                <div className="flex items-start gap-2">
                  <Target size={12} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-surface-400">{phase.goal}</p>
                </div>
              )}
              {phase.description && <p className="text-xs text-surface-500">{phase.description}</p>}
            </>
          )}

          {/* Manual status change */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-surface-600">Status:</span>
            <select
              value={phase.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-1.5 py-0.5 bg-surface-800 border border-surface-700 rounded text-[10px] text-surface-300"
            >
              <option value="pending">{t('roadmap.pending')}</option>
              <option value="planning">{t('roadmap.planning')}</option>
              <option value="in_progress">{t('roadmap.inProgress')}</option>
              <option value="verifying">{t('roadmap.verifying')}</option>
              <option value="completed">{t('roadmap.completed')}</option>
              <option value="failed">{t('roadmap.failed')}</option>
            </select>
          </div>

          {progress.total > 0 && (
            <ProgressBar
              total={progress.total}
              done={progress.done}
              inProgress={progress.in_progress}
              failed={progress.failed}
            />
          )}

          {/* Success criteria - interactive */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={10} />
                {t('roadmap.successCriteria')} ({verifiedCount}/{criteria.length})
              </div>
              <button
                onClick={() => setEditingCriteria(!editingCriteria)}
                className="text-surface-600 hover:text-surface-400 transition-colors"
              >
                <Edit3 size={10} />
              </button>
            </div>
            {criteria.map((c, i) => (
              <button
                key={i}
                onClick={() => handleToggleCriterion(i)}
                className="flex items-center gap-2 text-xs w-full text-left hover:bg-surface-800/30 rounded px-1 py-0.5 transition-colors"
              >
                {c.verified ? (
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                ) : (
                  <Circle size={12} className="text-surface-600 shrink-0" />
                )}
                <span className={c.verified ? 'text-surface-400 line-through' : 'text-surface-300'}>
                  {c.text || c.criterion || (c as unknown as string)}
                </span>
              </button>
            ))}
            {editingCriteria && (
              <div className="flex gap-1 mt-1">
                <input
                  type="text"
                  placeholder={t('roadmap.addCriterion')}
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCriterion()}
                  className="flex-1 px-2 py-1 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
                  autoFocus
                />
                <button
                  onClick={handleAddCriterion}
                  className="px-2 py-1 bg-claude/20 text-claude text-xs rounded hover:bg-claude/30"
                >
                  <Plus size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Plans */}
          {plans.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={10} /> {t('roadmap.plan')}s ({plans.length})
              </div>
              {plans.map((p) => (
                <div key={p.id}>
                  <PlanRow plan={p} onRefresh={onRefresh} t={t} />
                  {/* Link task button */}
                  {showLinkTask === p.id ? (
                    <div className="flex gap-1 mt-1 ml-4">
                      <input
                        type="number"
                        placeholder="Task ID"
                        value={linkTaskId}
                        onChange={(e) => setLinkTaskId(e.target.value)}
                        className="w-20 px-2 py-1 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                        autoFocus
                      />
                      <select
                        value={linkCheckpoint}
                        onChange={(e) => setLinkCheckpoint(e.target.value)}
                        className="px-1 py-1 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                      >
                        <option value="auto">auto</option>
                        <option value="human-verify">human-verify</option>
                        <option value="decision">decision</option>
                        <option value="human-action">human-action</option>
                      </select>
                      <button
                        onClick={() => handleLinkTask(p.id)}
                        className="px-2 py-1 bg-claude/20 text-claude text-xs rounded"
                      >
                        <Link2 size={10} />
                      </button>
                      <button onClick={() => setShowLinkTask(null)} className="px-2 py-1 text-surface-500 text-xs">
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowLinkTask(p.id)}
                      className="ml-4 mt-1 flex items-center gap-1 text-[10px] text-surface-600 hover:text-surface-400 transition-colors"
                    >
                      <Link2 size={9} /> {t('roadmap.linkTask')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add plan */}
          {showAddPlan ? (
            <div className="flex gap-1">
              <input
                type="text"
                placeholder={`${t('roadmap.plan')} title`}
                value={newPlan.title}
                onChange={(e) => setNewPlan({ title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPlan()}
                className="flex-1 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
                autoFocus
              />
              <button
                onClick={handleAddPlan}
                className="px-2 py-1.5 bg-claude/20 text-claude text-xs rounded hover:bg-claude/30"
              >
                {t('roadmap.addPlan')}
              </button>
              <button onClick={() => setShowAddPlan(false)} className="px-2 py-1.5 text-surface-500 text-xs">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddPlan(true)}
              className="flex items-center gap-1 text-[10px] text-surface-600 hover:text-surface-400 transition-colors"
            >
              <Plus size={10} /> {t('roadmap.addPlan')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
