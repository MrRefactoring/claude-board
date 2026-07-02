import { useState } from 'react';
import { Plus, Flag, Loader2, Trash2, Edit3, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import type { Task, TranslateFn } from '@/lib/types';
import type { Milestone, Phase, ProgressData } from '@/features/roadmap/types';
import { MS_STATUS_COLORS } from '@/features/roadmap/colors';
import { ProgressBar } from '@/features/roadmap/ProgressBar';
import { PhaseCard } from '@/features/roadmap/PhaseCard';

interface MilestoneSectionProps {
  milestone: Milestone;
  phases: Phase[];
  onRefresh: () => void;
  projectId: number;
  onPlanPhase: (phase: Phase) => void;
  onExecutePhase: (phase: Phase) => void;
  t: TranslateFn;
}

export function MilestoneSection({
  milestone,
  phases,
  onRefresh,
  projectId,
  onPlanPhase,
  onExecutePhase,
  t,
}: MilestoneSectionProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhase, setNewPhase] = useState({ number: '', title: '', goal: '' });
  const [editingMs, setEditingMs] = useState(false);
  const [msEdit, setMsEdit] = useState({
    version: milestone.version,
    title: milestone.title,
    description: milestone.description || '',
  });
  const [insertAfter, setInsertAfter] = useState<string | null>(null); // phase_number to insert after
  const [insertFields, setInsertFields] = useState({ title: '', goal: '' });

  const togglePhase = (id: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddPhase = async () => {
    if (!newPhase.title.trim()) return;
    try {
      await api.createPhase(
        milestone.id,
        projectId,
        (newPhase.number || String(phases.length + 1)) as unknown as number,
        newPhase.title,
        '',
        newPhase.goal,
        '[]',
      );
      setNewPhase({ number: '', title: '', goal: '' });
      setShowAddPhase(false);
      onRefresh();
    } catch {}
  };

  const handleDeleteMilestone = async () => {
    try {
      await api.deleteMilestone(milestone.id);
      onRefresh();
    } catch {}
  };

  const handleSaveMs = async () => {
    try {
      await api.updateMilestone(milestone.id, msEdit.version, msEdit.title, msEdit.description, milestone.status);
      setEditingMs(false);
      onRefresh();
    } catch {}
  };

  const handleMsStatus = async (status: string) => {
    try {
      await api.updateMilestone(milestone.id, milestone.version, milestone.title, milestone.description, status);
      onRefresh();
    } catch (e) {
      console.error('Milestone status change failed:', e);
    }
  };

  // /gsd:audit-milestone equivalent — dispatches a Claude task that audits the
  // milestone for completeness against its original intent before archival.
  const [auditing, setAuditing] = useState(false);
  const handleAuditMilestone = async () => {
    if (auditing) return;
    setAuditing(true);
    const phaseList = phases.map((p: Phase) => `  - Phase ${p.phase_number}: ${p.title} [${p.status}]`).join('\n');
    const description =
      `Audit milestone ${milestone.version} — "${milestone.title}" against its original intent before archival.\n\n` +
      `## Description\n${milestone.description || '(none)'}\n\n` +
      `## Phases in this milestone\n${phaseList || '(none)'}\n\n` +
      `## Instructions\n` +
      `1. Read PROJECT.md and REQUIREMENTS.md under .planning/\n` +
      `2. Cross-reference the milestone's original scope with the phases above\n` +
      `3. Identify any unmet goals, deferred features, or scope drift\n` +
      `4. Write .planning/milestone-${milestone.version}/AUDIT.md with:\n` +
      `   - Requirements vs. delivered (table)\n` +
      `   - Gaps (should-be-fixed / acceptable-debt / out-of-scope)\n` +
      `   - Ready-to-archive verdict (YES / CONDITIONAL / NO + reasons)`;
    try {
      const task = await api.createTask(projectId, {
        title: `Audit Milestone ${milestone.version}: ${milestone.title}`,
        description,
        taskType: 'test',
        model: 'sonnet',
        acceptanceCriteria: `AUDIT.md exists at .planning/milestone-${milestone.version}/ with verdict`,
        tags: JSON.stringify([`milestone:${milestone.version}`, 'gsd-audit']),
      } as Partial<Task>);
      if (task?.id) {
        await api.restartTask(task.id);
      }
      onRefresh();
    } catch (e) {
      console.error('Audit milestone failed:', e);
    }
    setAuditing(false);
  };

  const handleInsertPhase = async () => {
    if (!insertFields.title.trim() || !insertAfter) return;
    try {
      await api.insertPhase(
        milestone.id,
        projectId,
        insertAfter as unknown as number,
        insertFields.title,
        '',
        insertFields.goal,
        '[]',
      );
      setInsertAfter(null);
      setInsertFields({ title: '', goal: '' });
      onRefresh();
    } catch {}
  };

  const totalProgress = phases.reduce<ProgressData>(
    (acc, p) => ({
      total: acc.total + (p.progress?.total ?? 0),
      done: acc.done + (p.progress?.done ?? 0),
      in_progress: acc.in_progress + (p.progress?.in_progress ?? 0),
      failed: acc.failed + (p.progress?.failed ?? 0),
    }),
    { total: 0, done: 0, in_progress: 0, failed: 0 },
  );

  const completedPhases = phases.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-3">
      {/* Milestone header */}
      {editingMs ? (
        <div className="space-y-2 p-3 border border-surface-600 rounded-lg bg-surface-800/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={msEdit.version}
              onChange={(e) => setMsEdit((f) => ({ ...f, version: e.target.value }))}
              className="w-20 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
              placeholder="v1.0"
            />
            <input
              type="text"
              value={msEdit.title}
              onChange={(e) => setMsEdit((f) => ({ ...f, title: e.target.value }))}
              className="flex-1 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
            />
          </div>
          <input
            type="text"
            value={msEdit.description}
            onChange={(e) => setMsEdit((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
            placeholder="Description"
          />
          <div className="flex gap-2">
            <button onClick={handleSaveMs} className="px-3 py-1 bg-claude/20 text-claude text-xs rounded">
              Save
            </button>
            <button onClick={() => setEditingMs(false)} className="px-3 py-1 text-surface-500 text-xs">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${MS_STATUS_COLORS[milestone.status] || MS_STATUS_COLORS.active}`}
            >
              <Flag size={12} />
              {milestone.version}
            </div>
            <h3 className="text-sm font-semibold text-surface-200 flex-1">{milestone.title}</h3>
            <span className="text-[10px] text-surface-500">
              {completedPhases}/{phases.length} phases
              {totalProgress.total > 0 && ` \u00b7 ${totalProgress.done}/${totalProgress.total} ${t('roadmap.tasks')}`}
            </span>
            <select
              value={milestone.status}
              onChange={(e) => handleMsStatus(e.target.value)}
              className="px-1.5 py-0.5 bg-surface-800 border border-surface-700 rounded text-[10px] text-surface-400"
            >
              <option value="active">{t('roadmap.active')}</option>
              <option value="completed">{t('roadmap.completed')}</option>
              <option value="archived">{t('roadmap.archived')}</option>
            </select>
            <button
              onClick={handleAuditMilestone}
              disabled={auditing}
              className="p-1 rounded hover:bg-purple-500/20 text-surface-600 hover:text-purple-400 transition-colors disabled:opacity-50"
              title="Audit milestone completeness"
            >
              {auditing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
            </button>
            <button
              onClick={() => setEditingMs(true)}
              className="p-1 rounded hover:bg-surface-700 text-surface-600 hover:text-surface-400 transition-colors"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={handleDeleteMilestone}
              className="p-1 rounded hover:bg-red-500/20 text-surface-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {milestone.description && <p className="text-xs text-surface-500 ml-1">{milestone.description}</p>}
        </>
      )}

      {totalProgress.total > 0 && (
        <ProgressBar
          total={totalProgress.total}
          done={totalProgress.done}
          inProgress={totalProgress.in_progress}
          failed={totalProgress.failed}
        />
      )}

      {/* Phases */}
      <div className="space-y-2 ml-1">
        {phases.map((phaseData) => (
          <div key={phaseData.id}>
            <PhaseCard
              phase={phaseData}
              plans={phaseData.plans || []}
              progress={phaseData.progress || { total: 0, done: 0, in_progress: 0, failed: 0 }}
              expanded={expandedPhases.has(phaseData.id)}
              onToggle={() => togglePhase(phaseData.id)}
              onPlanPhase={onPlanPhase}
              onExecute={onExecutePhase}
              onInsertPhase={(ph) => setInsertAfter(ph.phase_number)}
              onRefresh={onRefresh}
              projectId={projectId}
              t={t}
            />
            {/* Insert phase form after this phase */}
            {insertAfter === phaseData.phase_number && (
              <div className="ml-4 mt-1 mb-1 border border-amber-500/30 rounded-lg p-2 space-y-1 bg-amber-500/5">
                <div className="text-[10px] text-amber-400">Insert phase after {insertAfter}</div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Phase title"
                    value={insertFields.title}
                    onChange={(e) => setInsertFields((f) => ({ ...f, title: e.target.value }))}
                    className="flex-1 px-2 py-1 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleInsertPhase()}
                  />
                  <input
                    type="text"
                    placeholder="Goal"
                    value={insertFields.goal}
                    onChange={(e) => setInsertFields((f) => ({ ...f, goal: e.target.value }))}
                    className="flex-1 px-2 py-1 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200"
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={handleInsertPhase}
                    className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded"
                  >
                    {t('roadmap.insertPhase')}
                  </button>
                  <button onClick={() => setInsertAfter(null)} className="px-2 py-1 text-surface-500 text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add phase */}
      {showAddPhase ? (
        <div className="ml-1 border border-surface-700 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('roadmap.phaseNumber')}
              value={newPhase.number}
              onChange={(e) => setNewPhase((p) => ({ ...p, number: e.target.value }))}
              className="w-16 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
            />
            <input
              type="text"
              placeholder={`${t('roadmap.phase')} title`}
              value={newPhase.title}
              onChange={(e) => setNewPhase((p) => ({ ...p, title: e.target.value }))}
              className="flex-1 px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddPhase()}
            />
          </div>
          <input
            type="text"
            placeholder={t('roadmap.goal')}
            value={newPhase.goal}
            onChange={(e) => setNewPhase((p) => ({ ...p, goal: e.target.value }))}
            className="w-full px-2 py-1.5 bg-surface-800 border border-surface-600 rounded text-xs text-surface-200 placeholder-surface-600"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddPhase}
              className="px-3 py-1 bg-claude/20 text-claude text-xs rounded hover:bg-claude/30 transition-colors"
            >
              {t('roadmap.addPhase')}
            </button>
            <button
              onClick={() => setShowAddPhase(false)}
              className="px-3 py-1 text-surface-500 text-xs rounded hover:text-surface-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddPhase(true)}
          className="ml-1 flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-300 transition-colors"
        >
          <Plus size={12} /> {t('roadmap.addPhase')}
        </button>
      )}
    </div>
  );
}
