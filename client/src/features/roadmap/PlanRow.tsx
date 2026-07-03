import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Trash2, Unlink, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import type { TranslateFn } from '@/lib/types';
import type { Plan, PlanTaskLink } from '@/features/roadmap/types';
import { PLAN_STATUS_COLORS, CHECKPOINT_ICONS, CHECKPOINT_COLORS } from '@/features/roadmap/colors';

interface PlanRowProps {
  plan: Plan;
  onRefresh: () => void;
  t: TranslateFn;
}

export function PlanRow({ plan, onRefresh }: PlanRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<PlanTaskLink[]>([]);

  const loadTasks = useCallback(async () => {
    if (!expanded) return;
    try {
      const pts = (await api.getPlanTasks(plan.id)) as PlanTaskLink[];
      setTasks(pts);
    } catch {}
  }, [plan.id, expanded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: the sync loading-flag toggle marks the refetch start
    void loadTasks();
  }, [loadTasks]);

  const handleDeletePlan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deletePlan(plan.id);
      onRefresh();
    } catch {}
  };

  const handleUnlinkTask = async (taskId: number) => {
    try {
      await api.unlinkTaskFromPlan(plan.id, taskId);
      void loadTasks();
      onRefresh();
    } catch {}
  };

  return (
    <div className="bg-surface-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-800 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown size={10} className="text-surface-600" />
        ) : (
          <ChevronRight size={10} className="text-surface-600" />
        )}
        <span className="text-[10px] font-mono text-surface-600">{plan.plan_number}</span>
        <span className="text-xs text-surface-300 flex-1 truncate">{plan.title}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${PLAN_STATUS_COLORS[plan.status] || PLAN_STATUS_COLORS.pending}`}
        >
          {plan.status}
        </span>
        {(plan.task_count ?? 0) > 0 && (
          <span className="text-[10px] text-surface-500">
            {plan.done_count}/{plan.task_count}
          </span>
        )}
        <button
          onClick={handleDeletePlan}
          className="p-1 rounded hover:bg-red-500/20 text-surface-600 hover:text-red-400 transition-colors"
        >
          <Trash2 size={10} />
        </button>
      </button>

      {expanded && tasks.length > 0 && (
        <div className="border-t border-surface-700/50 px-3 py-2 space-y-1">
          {tasks.map((pt) => {
            const Icon = CHECKPOINT_ICONS[pt.checkpoint_type] || Zap;
            const iconColor = CHECKPOINT_COLORS[pt.checkpoint_type] || 'text-surface-500';
            return (
              <div key={pt.id} className="flex items-center gap-2 text-[11px]">
                <Icon size={10} className={iconColor} />
                <span className="text-surface-400">#{pt.task_id}</span>
                {pt.checkpoint_type !== 'auto' && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-surface-700 text-surface-500">
                    {pt.checkpoint_type}
                  </span>
                )}
                <button
                  onClick={() => handleUnlinkTask(pt.task_id)}
                  className="ml-auto p-0.5 rounded hover:bg-red-500/20 text-surface-700 hover:text-red-400 transition-colors"
                  title="Unlink task"
                >
                  <Unlink size={9} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
