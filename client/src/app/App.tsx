import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSocket } from '@/hooks/useSocket';
import { useProjects } from '@/hooks/useProjects';
import { useTasks } from '@/hooks/useTasks';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useTerminalTabs } from '@/hooks/useTerminalTabs';
import { useTaskHandlers } from '@/hooks/useTaskHandlers';
import { useProjectHandlers } from '@/hooks/useProjectHandlers';
import { api, onApiError } from '@/lib/api';
import { socket } from '@/lib/socket';
import { queryKeys } from '@/lib/queryKeys';
import { tauriListen, IS_TAURI, IS_MACOS } from '@/lib/tauriEvents';
import { useUIStore } from '@/store/uiStore';
import AppLayout from '@/app/AppLayout';
import { StatusTransitionProvider } from '@/features/board/StatusTransitionContext';
import { I18nProvider, useTranslation } from '@/i18n/I18nProvider';
import OnboardingTour, { useOnboarding } from '@/features/onboarding/OnboardingTour';
import ErrorBoundary from '@/components/ErrorBoundary';
import CommandPalette from '@/features/command-palette/CommandPalette';
import type { Task, Template, Role } from '@/lib/types';

interface UpdateInfo {
  version?: string;
  status?: string;
}

// Stable fallbacks — a `= []` destructuring default would mint a new array
// every render while the queries are disabled (no project selected).
const NO_TEMPLATES: Template[] = [];
const NO_ROLES: Role[] = [];

function AppInner() {
  const { t } = useTranslation();
  const connected = useSocket();
  useRealtimeSync();
  const addToast = useUIStore((s) => s.addToast);
  const { projects, currentProject, initialLoad } = useProjects();
  const { tasks } = useTasks(currentProject);
  const terminal = useTerminalTabs(tasks);

  // Global API error -> toast
  useEffect(() => onApiError((msg) => addToast(msg, 'error')), [addToast]);

  // Onboarding tour
  const { showOnboarding, completeOnboarding } = useOnboarding();

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const currentProjectId = currentProject?.id ?? null;
  // Freshness: entity events invalidate these (useRealtimeSync), plus ModalHost
  // invalidates on modal close as a transport-independent fallback.
  const { data: templates = NO_TEMPLATES } = useQuery({
    queryKey: queryKeys.templates(currentProjectId ?? -1),
    queryFn: () => api.getTemplates(currentProjectId ?? -1),
    enabled: currentProjectId !== null,
  });
  const { data: roles = NO_ROLES } = useQuery({
    queryKey: queryKeys.roles(currentProjectId ?? -1),
    queryFn: () => api.getRoles(currentProjectId ?? -1),
    enabled: currentProjectId !== null,
  });

  const taskActions = useTaskHandlers({ tasks, t, terminal, currentProject });
  const projectActions = useProjectHandlers({ currentProject, t });

  // Listen for app updates
  useEffect(() => {
    if (!IS_TAURI) return;
    const unsubs = [
      tauriListen('update:available', (data) => setUpdateInfo(data as UpdateInfo)),
      tauriListen('update:ready', (data) => setUpdateInfo({ ...(data as UpdateInfo), status: 'ready' })),
      tauriListen('menu:preferences', () => useUIStore.getState().openModal('appSettings')),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  // macOS dock badge: show running task count
  useEffect(() => {
    if (!IS_TAURI || !IS_MACOS) return;
    const count = tasks.filter((t) => t.is_running).length;
    import('@tauri-apps/api/app')
      .then((mod) => {
        // setBadgeCount isn't in this @tauri-apps/api version's type surface but
        // exists at runtime on macOS builds; guard + narrow via cast.
        const setBadgeCount = (mod as { setBadgeCount?: (count: number | null) => Promise<void> }).setBadgeCount;
        if (setBadgeCount) {
          setBadgeCount(count > 0 ? count : null).catch(() => {});
        }
      })
      .catch(() => {});
  }, [tasks]);

  // Auto-open terminal when task NEWLY starts running (respects auto_open_terminal setting)
  const runningIdsRef = useRef<Set<number>>(new Set());
  const suppressRef = useRef(true);
  // Latest-ref pattern: consumers are event handlers, so post-render sync is fine.
  const terminalRef = useRef(terminal);
  useEffect(() => {
    terminalRef.current = terminal;
  });
  const autoOpenRef = useRef(false);

  useEffect(() => {
    api
      .getAppSettings()
      .then((s) => {
        autoOpenRef.current = !!(s as { auto_open_terminal?: boolean } | null)?.auto_open_terminal;
      })
      .catch(() => {});
    const timer = setTimeout(() => {
      suppressRef.current = false;
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    runningIdsRef.current = new Set(tasks.filter((t) => t.is_running).map((t) => t.id));
  }, [tasks]);

  useEffect(() => {
    const handler = (task: Partial<Task> & { id: number }) => {
      if (suppressRef.current || !autoOpenRef.current) return;
      if (task.is_running && !runningIdsRef.current.has(task.id)) {
        runningIdsRef.current.add(task.id);
        terminalRef.current.openTab(task as Task);
        useUIStore.getState().setSelectedTask(task as Task);
        useUIStore.getState().setActivePanel('logs');
      } else if (!task.is_running) {
        runningIdsRef.current.delete(task.id);
      }
    };
    if (IS_TAURI) {
      return tauriListen('task:updated', handler);
    } else {
      socket.on('task:updated', handler);
      return () => socket.off('task:updated', handler);
    }
  }, []);

  // Clear panels/search when switching to another project
  useEffect(() => {
    const ui = useUIStore.getState();
    ui.setActivePanel(null);
    ui.setSelectedTask(null);
    ui.setSearch('');
  }, [currentProjectId]);

  // Keyboard shortcuts — read state via getState() so the listener binds once.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ui = useUIStore.getState();
      // Ctrl/Cmd+K — command palette (works everywhere, even in inputs)
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ui.setCommandPaletteOpen(!ui.commandPaletteOpen);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && ui.currentProjectId !== null) {
        e.preventDefault();
        ui.openModal('task');
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
      if (e.key === 'Escape') {
        if (ui.commandPaletteOpen) {
          ui.setCommandPaletteOpen(false);
        } else if (ui.modals.task) {
          ui.closeModal('task');
        } else if (ui.modals.project) {
          ui.closeModal('project');
        } else if (ui.confirm) {
          ui.confirm.onCancel?.();
        } else if (ui.activePanel) {
          ui.setActivePanel(null);
          ui.setSelectedTask(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const search = useUIStore((s) => s.search);
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [tasks, search]);

  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openModal = useUIStore((s) => s.openModal);
  const navigateToProject = useUIStore((s) => s.navigateToProject);
  const navigateToDashboard = useUIStore((s) => s.navigateToDashboard);

  if (initialLoad) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-950">
        <div className="text-claude text-2xl animate-pulse">&#10022;</div>
      </div>
    );
  }

  return (
    <StatusTransitionProvider>
      {updateInfo && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-3 px-4 py-2 bg-claude text-white text-xs font-medium">
          {updateInfo.status === 'ready' ? (
            <>
              <span>v{updateInfo.version} is ready. Restart to update.</span>
              <button
                onClick={() => {
                  window.__TAURI_INTERNALS__?.invoke('plugin:process|restart').catch(() => window.location.reload());
                }}
                className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs"
              >
                Restart Now
              </button>
            </>
          ) : updateInfo.status === 'downloading' ? (
            <span>Downloading v{updateInfo.version}...</span>
          ) : (
            <span>v{updateInfo.version} available</span>
          )}
          <button onClick={() => setUpdateInfo(null)} className="ml-auto text-white/60 hover:text-white">
            &#x2715;
          </button>
        </div>
      )}
      <AppLayout
        connected={connected}
        projects={projects}
        currentProject={currentProject}
        tasks={tasks}
        filteredTasks={filteredTasks}
        terminal={terminal}
        templates={templates}
        roles={roles}
        taskActions={taskActions}
        projectActions={projectActions}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tasks={tasks}
        projects={projects}
        currentProject={currentProject}
        onNavigateToProject={navigateToProject}
        onNavigateToDashboard={navigateToDashboard}
        onStatusChange={(task, status) => taskActions.onStatusChange(task.id, status)}
        onViewLogs={(task) => taskActions.onViewLogs(task)}
        onViewDetail={(task) => openModal('detail', task)}
        openModal={openModal}
      />
      <OnboardingTour active={showOnboarding} onComplete={completeOnboarding} hasProject={!!currentProject} />
    </StatusTransitionProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppInner />
      </I18nProvider>
    </ErrorBoundary>
  );
}
