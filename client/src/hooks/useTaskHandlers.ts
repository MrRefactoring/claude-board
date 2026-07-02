import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { emitStatusTransition } from '@/features/board/StatusTransitionContext';
import { pendingUpdates } from '@/hooks/useRealtimeSync';
import { queryKeys } from '@/lib/queryKeys';
import { useUIStore } from '@/store/uiStore';
import type { Task, Project, TaskStatus, TranslateFn } from '@/lib/types';

/** Extra fields the task modal tacks onto the payload before create/update. */
type TaskFormData = Partial<Task> & { _files?: File[]; _pendingDeps?: number[] };

interface UseTaskHandlersOptions {
  tasks: Task[];
  t: TranslateFn;
  terminal: { openTab: (task: Task) => void };
  currentProject: Project | null;
}

export function useTaskHandlers({ tasks, t, terminal, currentProject }: UseTaskHandlersOptions) {
  const queryClient = useQueryClient();
  const projectId = currentProject?.id ?? null;

  // Optimistic updates write straight into the current project's task cache;
  // realtime events (useRealtimeSync) keep it fresh from the backend side.
  const setTasks = useCallback(
    (updater: (prev: Task[]) => Task[]) => {
      if (projectId === null) return;
      queryClient.setQueryData<Task[]>(queryKeys.tasks(projectId), (prev) => updater(prev ?? []));
    },
    [queryClient, projectId],
  );

  // Zustand actions are stable references — safe in useCallback deps.
  const addToast = useUIStore((s) => s.addToast);
  const setConfirm = useUIStore((s) => s.setConfirm);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const setSelectedTask = useUIStore((s) => s.setSelectedTask);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const onStatusChange = useCallback(
    async (taskId: number, newStatus: TaskStatus) => {
      const task = tasks.find((x) => x.id === taskId);
      if (!task) return;
      const fromStatus: TaskStatus = task.status || 'backlog';

      if (newStatus === 'in_progress' && fromStatus !== 'in_progress') {
        setConfirm({
          title: t('toast.startClaude'),
          message: `Moving "${task.title}" to In Progress will automatically start Claude. Continue?`,
          onConfirm: async () => {
            setConfirm(null);
            emitStatusTransition(taskId, fromStatus, newStatus);
            pendingUpdates.add(taskId);
            setTasks((prev) => prev.map((x) => (x.id === taskId ? { ...x, status: newStatus } : x)));
            try {
              const updated = await api.updateStatus(taskId, newStatus);
              setTasks((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
              addToast(t('toast.claudeStarted', { title: task.title }), 'success');
            } catch (e) {
              setTasks((prev) => prev.map((x) => (x.id === taskId ? { ...x, status: fromStatus } : x)));
              addToast((e as Error).message, 'error');
            } finally {
              pendingUpdates.delete(taskId);
            }
          },
          onCancel: () => setConfirm(null),
        });
        return;
      }

      emitStatusTransition(taskId, fromStatus, newStatus);
      pendingUpdates.add(taskId);
      setTasks((prev) => prev.map((x) => (x.id === taskId ? { ...x, status: newStatus } : x)));
      try {
        const updated = await api.updateStatus(taskId, newStatus);
        setTasks((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      } catch (e) {
        setTasks((prev) => prev.map((x) => (x.id === taskId ? { ...x, status: fromStatus } : x)));
        addToast((e as Error).message, 'error');
      } finally {
        pendingUpdates.delete(taskId);
      }
    },
    [tasks, addToast, t, setTasks, setConfirm],
  );

  const onCreate = useCallback(
    async (data: TaskFormData) => {
      if (!currentProject) return;
      const files = data._files;
      const pendingDeps = data._pendingDeps;
      delete data._files;
      delete data._pendingDeps;
      const task = await api.createTask(currentProject.id, data);
      setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev : [...prev, task]));
      if (files && files.length > 0) {
        try {
          await api.uploadAttachments(task.id, files);
        } catch (e) {
          addToast('File upload failed: ' + (e as Error).message, 'error');
        }
      }
      if (pendingDeps && pendingDeps.length > 0) {
        let depOk = 0;
        for (const depId of pendingDeps) {
          try {
            await api.addDependency(task.id, depId);
            depOk++;
          } catch (e) {
            addToast(`Dependency failed: ${(e as Error).message || String(e)}`, 'error');
          }
        }
        if (depOk > 0) addToast(`${depOk} dependency added`, 'info');
      }
      closeModal('task');
      addToast(t('toast.taskCreated'), 'success');
    },
    [currentProject, addToast, t, setTasks, closeModal],
  );

  const onUpdate = useCallback(
    async (editingTask: Task, data: TaskFormData) => {
      const files = data._files;
      delete data._files;
      const updated = await api.updateTask(editingTask.id, data);
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      if (files && files.length > 0) {
        try {
          await api.uploadAttachments(editingTask.id, files);
        } catch (e) {
          addToast('File upload failed: ' + (e as Error).message, 'error');
        }
      }
      closeModal('task');
      addToast(t('toast.taskUpdated'), 'success');
    },
    [addToast, t, setTasks, closeModal],
  );

  const onDelete = useCallback(
    (task: Task) => {
      setConfirm({
        title: t('toast.deleteTaskTitle'),
        message: t('toast.deleteTaskConfirm', { title: task.title }),
        danger: true,
        onConfirm: async () => {
          setConfirm(null);
          await api.deleteTask(task.id);
          setTasks((prev) => prev.filter((x) => x.id !== task.id));
          addToast(t('toast.taskDeleted'), 'info');
        },
        onCancel: () => setConfirm(null),
      });
    },
    [addToast, t, setTasks, setConfirm],
  );

  const onBulkDelete = useCallback(
    (selectedTasks: Task[]) => {
      if (!selectedTasks?.length) return;
      setConfirm({
        title: t('toast.bulkDeleteTitle'),
        message: t('toast.bulkDeleteMessage', { count: selectedTasks.length }),
        danger: true,
        onConfirm: async () => {
          setConfirm(null);
          const ids = selectedTasks.map((task) => task.id);
          const results = await Promise.allSettled(ids.map((id) => api.deleteTask(id)));
          const deletedIds = ids.filter((_, i) => results[i]?.status === 'fulfilled');
          const failCount = ids.length - deletedIds.length;
          if (deletedIds.length > 0) {
            setTasks((prev) => prev.filter((x) => !deletedIds.includes(x.id)));
          }
          if (failCount > 0) {
            addToast(t('toast.bulkDeletePartial', { count: failCount }), 'error');
          }
          if (deletedIds.length > 0) {
            addToast(t('toast.bulkDeleted', { count: deletedIds.length }), 'info');
          }
        },
        onCancel: () => setConfirm(null),
      });
    },
    [addToast, t, setTasks, setConfirm],
  );

  const onViewLogs = useCallback(
    (task: Task) => {
      setSelectedTask(task);
      setActivePanel('logs');
      terminal.openTab(task);
    },
    [terminal, setSelectedTask, setActivePanel],
  );

  const onReview = useCallback((task: Task) => openModal('review', task), [openModal]);

  const onApprove = useCallback(
    async (taskId: number) => {
      const updated = await api.updateStatus(taskId, 'done');
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      closeModal('review');
      addToast(t('toast.taskApproved'), 'success');
    },
    [addToast, t, setTasks, closeModal],
  );

  const onRequestChanges = useCallback(
    async (taskId: number, feedback: string) => {
      const updated = await api.requestChanges(taskId, feedback);
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      closeModal('review');
      addToast(t('toast.revisionRequested'), 'info');
    },
    [addToast, t, setTasks, closeModal],
  );

  const onReorderTasks = useCallback(
    async (orderedIds: number[]) => {
      const orderedSet = new Set(orderedIds);
      // Optimistic: reorder only within the affected status group
      setTasks((prev) => {
        const byId = new Map(prev.map((task) => [task.id, task]));
        const reordered = orderedIds.map((id) => byId.get(id)).filter((x): x is Task => Boolean(x));
        // Replace matching tasks in-place, preserve order of everything else
        const result: Task[] = [];
        let inserted = false;
        for (const task of prev) {
          if (orderedSet.has(task.id)) {
            if (!inserted) {
              result.push(...reordered);
              inserted = true;
            }
          } else {
            result.push(task);
          }
        }
        return result;
      });
      try {
        await api.reorderTasks(orderedIds);
      } catch {
        // Optimistic reorder failed on the backend — refetch server order.
        if (projectId !== null) queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      }
    },
    [setTasks, projectId, queryClient],
  );

  return {
    onStatusChange,
    onCreate,
    onUpdate,
    onDelete,
    onBulkDelete,
    onViewLogs,
    onReview,
    onApprove,
    onRequestChanges,
    onReorderTasks,
  };
}
