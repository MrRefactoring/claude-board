import Board from '@/features/board/Board';
import Dashboard from '@/features/dashboard/Dashboard';
import Header from '@/features/projects/Header';
import LiveTerminal from '@/features/terminal/LiveTerminal';
import StatsPanel from '@/features/stats/StatsPanel';
import ActivityTimeline from '@/features/activity/ActivityTimeline';
import ChatSidebar from '@/features/chat/ChatSidebar';
import TerminalBottomPanel from '@/app/TerminalBottomPanel';
import ModalHost from '@/app/ModalHost';
import { useUIStore } from '@/store/uiStore';
import type { Project, Task, Template, Role } from '@/lib/types';
import type { useTerminalTabs } from '@/hooks/useTerminalTabs';
import type { useTaskHandlers } from '@/hooks/useTaskHandlers';
import type { useProjectHandlers } from '@/hooks/useProjectHandlers';

interface AppLayoutProps {
  connected: boolean;
  projects: Project[];
  currentProject: Project | null;
  tasks: Task[];
  filteredTasks: Task[];
  terminal: ReturnType<typeof useTerminalTabs>;
  templates: Template[];
  roles: Role[];
  taskActions: ReturnType<typeof useTaskHandlers>;
  projectActions: ReturnType<typeof useProjectHandlers>;
}

export default function AppLayout({
  connected,
  projects,
  currentProject,
  tasks,
  filteredTasks,
  terminal,
  templates,
  roles,
  taskActions,
  projectActions,
}: AppLayoutProps) {
  const activePanel = useUIStore((s) => s.activePanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const selectedTask = useUIStore((s) => s.selectedTask);
  const setSelectedTask = useUIStore((s) => s.setSelectedTask);
  const chatOpen = useUIStore((s) => !!s.modals.chat);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const openPlanning = useUIStore((s) => s.openPlanning);
  const navigateToProject = useUIStore((s) => s.navigateToProject);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <Header
        connected={connected}
        tasks={tasks}
        projects={projects}
        currentProject={currentProject}
        projectActions={projectActions}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Board or Dashboard */}
          <div className="flex-1 overflow-hidden transition-all duration-300">
            {currentProject ? (
              <Board
                tasks={filteredTasks}
                projectId={currentProject.id}
                project={currentProject}
                onStatusChange={taskActions.onStatusChange as (taskId: number, status: string) => void}
                onViewLogs={taskActions.onViewLogs}
                onEditTask={(task) => openModal('task', task)}
                onDeleteTask={taskActions.onDelete}
                onBulkDelete={taskActions.onBulkDelete}
                onReviewTask={taskActions.onReview}
                onViewDetail={(task) => openModal('detail', task)}
                onReorderTasks={taskActions.onReorderTasks}
              />
            ) : (
              <Dashboard
                projects={projects}
                onSelectProject={navigateToProject}
                onNewProject={() => openModal('project')}
                onOpenSettings={() => openModal('appSettings')}
                onDeleteProject={projectActions.onDeleteById}
              />
            )}
          </div>

          {/* Side panels */}
          {activePanel === 'logs' && terminal.activeTab && terminal.layout === 'side' && (
            <div className="absolute inset-0 md:relative md:inset-auto z-20 md:z-auto h-full">
              <LiveTerminal
                key={terminal.activeTabId}
                task={terminal.activeTab}
                layout="side"
                onClose={() => terminal.closeTab(terminal.activeTabId)}
                onToggleLayout={() => terminal.setLayout('bottom')}
              />
            </div>
          )}
          {activePanel === 'stats' && currentProject && (
            <div className="absolute inset-0 md:relative md:inset-auto z-20 md:z-auto h-full">
              <StatsPanel projectId={currentProject.id} onClose={() => setActivePanel(null)} />
            </div>
          )}
          {activePanel === 'activity' && currentProject && (
            <div className="absolute inset-0 md:relative md:inset-auto z-20 md:z-auto h-full">
              <ActivityTimeline projectId={currentProject.id} onClose={() => setActivePanel(null)} />
            </div>
          )}

          {/* AI Chat Sidebar */}
          {chatOpen && currentProject && (
            <ChatSidebar
              projectId={currentProject.id}
              projectName={currentProject.name}
              onClose={() => closeModal('chat')}
              onDecompose={(goal) => {
                // Prefill the planning modal's topic (read once on mount) and open it.
                if (goal) sessionStorage.setItem('planning:topic', goal);
                openPlanning();
              }}
            />
          )}
        </div>

        {/* Bottom terminal panel */}
        {activePanel === 'logs' && terminal.hasOpenTabs && terminal.layout === 'bottom' && (
          <TerminalBottomPanel terminal={terminal} selectedTask={selectedTask} onSetSelectedTask={setSelectedTask} />
        )}
      </div>

      <ModalHost
        currentProject={currentProject}
        tasks={tasks}
        templates={templates}
        roles={roles}
        taskActions={taskActions}
        projectActions={projectActions}
      />
    </div>
  );
}
