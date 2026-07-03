import TaskModal from '@/features/tasks/TaskModal';
import ReviewModal from '@/features/tasks/ReviewModal';
import TaskDetailModal from '@/features/tasks/TaskDetailModal';
import ProjectModal from '@/features/projects/ProjectModal';
import ClaudeMdEditor from '@/features/editor/ClaudeMdEditor';
import SnippetsModal from '@/features/snippets/SnippetsModal';
import TemplatesModal from '@/features/templates/TemplatesModal';
import WebhooksModal from '@/features/webhooks/WebhooksModal';
import RolesModal from '@/features/roles/RolesModal';
import PlanningModal from '@/features/planning/PlanningModal';
import CommandsModal from '@/features/commands/CommandsModal';
import SkillsModal from '@/features/skills/SkillsModal';
import ScanModal from '@/features/scan/ScanModal';
import SettingsModal from '@/features/settings/SettingsModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Toast from '@/components/Toast';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/uiStore';
import type { Project, Task, Template, Role } from '@/lib/types';
import type { useTaskHandlers } from '@/hooks/useTaskHandlers';
import type { useProjectHandlers } from '@/hooks/useProjectHandlers';

interface ModalHostProps {
  currentProject: Project | null;
  tasks: Task[];
  templates: Template[];
  roles: Role[];
  taskActions: ReturnType<typeof useTaskHandlers>;
  projectActions: ReturnType<typeof useProjectHandlers>;
}

/** Renders every app-level modal off the UI store — keeps AppLayout to layout only. */
export default function ModalHost({
  currentProject,
  tasks,
  templates,
  roles,
  taskActions,
  projectActions,
}: ModalHostProps) {
  const queryClient = useQueryClient();
  const modals = useUIStore((s) => s.modals);
  const closeModal = useUIStore((s) => s.closeModal);
  const closePlanning = useUIStore((s) => s.closePlanning);
  const confirm = useUIStore((s) => s.confirm);
  const toasts = useUIStore((s) => s.toasts);

  // Editor modals mutate these lists; invalidating on close is a
  // transport-independent freshness fallback next to the entity events.
  const closeAndInvalidate = (name: 'templates' | 'roles') => {
    closeModal(name);
    void queryClient.invalidateQueries({ queryKey: [name] });
  };

  // Values are either the sentinel `true` (opened without a payload) or the entity being edited.
  const editingTask = (modals.task === true ? null : modals.task) as Task | null;
  const editingProject = (modals.project === true ? null : modals.project) as Project | null;

  return (
    <>
      {modals.task && currentProject && (
        <ErrorBoundary>
          <TaskModal
            task={editingTask}
            onSubmit={editingTask ? (data) => taskActions.onUpdate(editingTask, data) : taskActions.onCreate}
            onClose={() => closeModal('task')}
            templates={templates}
            roles={roles}
            allTasks={tasks}
          />
        </ErrorBoundary>
      )}
      {modals.project && (
        <ErrorBoundary>
          <ProjectModal
            project={editingProject}
            onSubmit={
              editingProject ? (data) => projectActions.onUpdate(editingProject, data) : projectActions.onCreate
            }
            onClose={() => closeModal('project')}
          />
        </ErrorBoundary>
      )}
      {modals.claudeMd && currentProject && (
        <ErrorBoundary>
          <ClaudeMdEditor
            projectId={currentProject.id}
            projectName={currentProject.name}
            onClose={() => closeModal('claudeMd')}
          />
        </ErrorBoundary>
      )}
      {modals.snippets && currentProject && (
        <ErrorBoundary>
          <SnippetsModal
            projectId={currentProject.id}
            projectName={currentProject.name}
            onClose={() => closeModal('snippets')}
          />
        </ErrorBoundary>
      )}
      {modals.templates && currentProject && (
        <ErrorBoundary>
          <TemplatesModal
            projectId={currentProject.id}
            projectName={currentProject.name}
            onClose={() => closeAndInvalidate('templates')}
          />
        </ErrorBoundary>
      )}
      {modals.webhooks && currentProject && (
        <ErrorBoundary>
          <WebhooksModal
            projectId={currentProject.id}
            projectName={currentProject.name}
            onClose={() => closeModal('webhooks')}
          />
        </ErrorBoundary>
      )}
      {modals.roles && currentProject && (
        <ErrorBoundary>
          <RolesModal
            projectId={currentProject.id}
            projectName={currentProject.name}
            onClose={() => closeAndInvalidate('roles')}
          />
        </ErrorBoundary>
      )}
      {modals.review && (
        <ErrorBoundary>
          <ReviewModal
            task={modals.review as Task}
            onApprove={taskActions.onApprove}
            onRequestChanges={taskActions.onRequestChanges}
            onClose={() => closeModal('review')}
          />
        </ErrorBoundary>
      )}
      {modals.detail && (
        <ErrorBoundary>
          <TaskDetailModal
            task={modals.detail as Task}
            onClose={() => closeModal('detail')}
            onStatusChange={taskActions.onStatusChange}
          />
        </ErrorBoundary>
      )}
      {modals.planning && currentProject && (
        <ErrorBoundary>
          <PlanningModal projectId={currentProject.id} onClose={closePlanning} />
        </ErrorBoundary>
      )}
      {modals.commands && (
        <ErrorBoundary>
          <CommandsModal onClose={() => closeModal('commands')} />
        </ErrorBoundary>
      )}
      {modals.skills && (
        <ErrorBoundary>
          <SkillsModal onClose={() => closeModal('skills')} />
        </ErrorBoundary>
      )}
      {modals.scan && currentProject && (
        <ErrorBoundary>
          <ScanModal projectId={currentProject.id} onClose={() => closeModal('scan')} />
        </ErrorBoundary>
      )}
      {modals.appSettings && (
        <ErrorBoundary>
          <SettingsModal onClose={() => closeModal('appSettings')} />
        </ErrorBoundary>
      )}
      {confirm && <ConfirmDialog {...confirm} />}
      <Toast toasts={toasts} />
    </>
  );
}
