import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import type { Project, TranslateFn } from '@/lib/types';

interface UseProjectHandlersOptions {
  currentProject: Project | null;
  t: TranslateFn;
}

export function useProjectHandlers({ currentProject, t }: UseProjectHandlersOptions) {
  // Zustand actions are stable references — safe in useCallback deps.
  const navigateToProject = useUIStore((s) => s.navigateToProject);
  const navigateToDashboard = useUIStore((s) => s.navigateToDashboard);
  const addToast = useUIStore((s) => s.addToast);
  const setConfirm = useUIStore((s) => s.setConfirm);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const onCreate = useCallback(
    async (data: Partial<Project>) => {
      const p = await api.createProject(data);
      closeModal('project');
      navigateToProject(p);
      addToast(t('toast.projectCreated'), 'success');
    },
    [navigateToProject, addToast, t, closeModal],
  );

  const onUpdate = useCallback(
    async (editingProject: Project, data: Partial<Project>) => {
      await api.updateProject(editingProject.id, data);
      closeModal('project');
      addToast(t('toast.projectUpdated'), 'success');
      if (data.slug && currentProject && data.slug !== currentProject.slug)
        window.history.replaceState({ slug: data.slug }, '', `/${data.slug}`);
    },
    [currentProject, addToast, t, closeModal],
  );

  const onDelete = useCallback(() => {
    if (!currentProject) return;
    setConfirm({
      title: t('toast.deleteProjectTitle'),
      message: t('toast.deleteProjectConfirm', { name: currentProject.name }),
      danger: true,
      onConfirm: async () => {
        setConfirm(null);
        await api.deleteProject(currentProject.id);
        navigateToDashboard();
        addToast(t('toast.projectDeleted'), 'info');
      },
      onCancel: () => setConfirm(null),
    });
  }, [currentProject, navigateToDashboard, addToast, t, setConfirm]);

  const onDeleteById = useCallback(
    (project: Project, onAfterDelete?: () => void) => {
      if (!project?.id) return;
      setConfirm({
        title: t('toast.deleteProjectTitle'),
        message: t('toast.deleteProjectConfirm', { name: project.name }),
        danger: true,
        onConfirm: async () => {
          setConfirm(null);
          await api.deleteProject(project.id);
          if (currentProject?.id === project.id) navigateToDashboard();
          addToast(t('toast.projectDeleted'), 'info');
          onAfterDelete?.();
        },
        onCancel: () => setConfirm(null),
      });
    },
    [currentProject, navigateToDashboard, addToast, t, setConfirm],
  );

  const onEdit = useCallback(() => {
    if (currentProject) openModal('project', currentProject);
  }, [currentProject, openModal]);

  return { onCreate, onUpdate, onDelete, onDeleteById, onEdit };
}
