import { create } from 'zustand';
import { TOAST_TIMEOUT_MS } from '@/lib/constants';
import type { ConfirmState, Project, Task, Toast, ToastType } from '@/lib/types';

export type ModalName =
  | 'task'
  | 'project'
  | 'detail'
  | 'review'
  | 'claudeMd'
  | 'snippets'
  | 'templates'
  | 'webhooks'
  | 'roles'
  | 'planning'
  | 'commands'
  | 'skills'
  | 'scan'
  | 'appSettings'
  | 'chat';

export type PanelName = 'logs' | 'stats' | 'activity';

interface UIState {
  /** Value is the sentinel `true` (opened plain) or the entity payload being edited. */
  modals: Partial<Record<ModalName, unknown>>;
  openModal: (name: ModalName, data?: unknown) => void;
  closeModal: (name: ModalName) => void;
  /** Planning survives reloads while active — mirrored into sessionStorage. */
  openPlanning: () => void;
  closePlanning: () => void;

  activePanel: PanelName | null;
  setActivePanel: (panel: PanelName | null) => void;
  togglePanel: (panel: PanelName) => void;

  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;

  search: string;
  setSearch: (value: string) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  confirm: ConfirmState | null;
  setConfirm: (value: ConfirmState | null) => void;

  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;

  /** Selection is the id only — the Project object lives in the projects query/list. */
  currentProjectId: number | null;
  /** Plain selection change (popstate / realtime events) — no history side effects. */
  setCurrentProjectId: (id: number | null) => void;
  /** User navigation — pushes the project slug onto the history stack. */
  navigateToProject: (project: Project | null) => void;
  navigateToDashboard: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  modals: { planning: sessionStorage.getItem('planning:active') === 'true' || undefined },
  openModal: (name, data = true) => set((s) => ({ modals: { ...s.modals, [name]: data } })),
  closeModal: (name) => set((s) => ({ modals: { ...s.modals, [name]: undefined } })),
  openPlanning: () => {
    sessionStorage.setItem('planning:active', 'true');
    get().openModal('planning');
  },
  closePlanning: () => {
    sessionStorage.removeItem('planning:active');
    get().closeModal('planning');
  },

  activePanel: null,
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) => set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),

  selectedTask: null,
  setSelectedTask: (task) => set({ selectedTask: task }),

  search: '',
  setSearch: (value) => set({ search: value }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  confirm: null,
  setConfirm: (value) => set({ confirm: value }),

  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_TIMEOUT_MS);
  },

  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  navigateToProject: (project) => {
    set({ currentProjectId: project?.id ?? null });
    if (project) window.history.pushState({ slug: project.slug }, '', `/${project.slug}`);
  },
  navigateToDashboard: () => {
    set({ currentProjectId: null });
    window.history.pushState({}, '', '/');
  },
}));
