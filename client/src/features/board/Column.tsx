import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from '@/features/board/TaskCard';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Task } from '@/lib/types';

interface ColumnDef {
  id: string;
  label: string;
  color: string;
  bg: string;
  dot: string;
}

interface ColumnProps {
  column: ColumnDef;
  tasks: Task[];
  /** The pointer is currently dragging a card over this column. */
  highlight?: boolean;
  /** Alt is held during the drag — cards show the dependency-drop affordance. */
  altDrag?: boolean;
  /** Uniquifies dnd ids when the same column renders twice (desktop + mobile DOM). */
  dndPrefix?: string;
  onViewLogs: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onStatusChange?: (taskId: number, status: string) => void;
  onReviewTask: (task: Task) => void;
  onViewDetail: (task: Task) => void;
  isMobile?: boolean;
}

const Column = memo(function Column({
  column,
  tasks,
  highlight,
  altDrag,
  dndPrefix = '',
  onViewLogs,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onReviewTask,
  onViewDetail,
  isMobile,
}: ColumnProps) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({
    id: `${dndPrefix}${column.id}`,
    data: { columnId: column.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl bg-surface-900/50 border transition-all duration-200 ${
        highlight ? 'border-claude/50 bg-claude/5' : 'border-surface-800'
      } ${isMobile ? 'flex-1' : 'flex-1 min-w-[260px] max-w-[360px]'}`}
    >
      {!isMobile && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${column.bg}`} />
            <h2 className={`text-sm font-medium ${column.color}`}>{t('status.' + column.id)}</h2>
          </div>
          {tasks.length > 0 && (
            <span className="text-xs text-surface-500 bg-surface-800 px-2 py-0.5 rounded-full">{tasks.length}</span>
          )}
        </div>
      )}

      <div className={`flex-1 overflow-y-auto space-y-2 ${isMobile ? '' : 'p-3'}`}>
        <SortableContext items={tasks.map((task) => `${dndPrefix}${task.id}`)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              dndId={`${dndPrefix}${task.id}`}
              altDrag={altDrag}
              onViewLogs={() => onViewLogs(task)}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task)}
              onStatusChange={onStatusChange}
              onReview={() => onReviewTask(task)}
              onViewDetail={() => onViewDetail(task)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && <div className="text-center py-8 text-surface-600 text-sm">{t('board.noTasks')}</div>}
      </div>
    </div>
  );
});

export default Column;
