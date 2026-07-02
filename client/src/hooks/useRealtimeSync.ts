import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { socket } from '@/lib/socket';
import { tauriListen, IS_TAURI } from '@/lib/tauriEvents';
import { queryKeys } from '@/lib/queryKeys';
import { useUIStore } from '@/store/uiStore';
import type { Task, Project } from '@/lib/types';
import type { AppEventMap, AppEventName } from '@/lib/events';

/**
 * Task ids with an in-flight mutation. Realtime `task:updated` events for
 * these are skipped so a racing event can't clobber optimistic state.
 */
export const pendingUpdates = new Set<number>();

/** Patch a task across every cached per-project task list (events don't always carry project_id). */
function patchTaskLists(queryClient: QueryClient, updater: (prev: Task[]) => Task[]) {
  queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (prev) => (prev ? updater(prev) : prev));
}

/**
 * The single place realtime events are turned into query-cache updates.
 * Mounted once in AppInner; covers both transports (Tauri events / Socket.IO).
 *
 * High-frequency events with full payloads patch the cache directly
 * (setQueryData); rare entity events just invalidate and let the next
 * render refetch.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = (prefix: string) => () => queryClient.invalidateQueries({ queryKey: [prefix] });

    const handlers: { [K in AppEventName]?: (payload: AppEventMap[K]) => void } = {
      // ─── Tasks: patch in place ───
      'task:created': (task) => {
        // Function updater returning undefined leaves a missing cache untouched —
        // never seed a partial list for a project that hasn't been opened.
        queryClient.setQueryData<Task[]>(queryKeys.tasks(task.project_id), (prev) =>
          prev ? (prev.some((t) => t.id === task.id) ? prev : [...prev, task]) : prev,
        );
      },
      'task:updated': (task) => {
        if (pendingUpdates.has(task.id)) return;
        patchTaskLists(queryClient, (prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));
      },
      'task:usage': (usage) => {
        const patch: Partial<Task> = {};
        if (usage.input_tokens !== undefined) patch.input_tokens = usage.input_tokens;
        if (usage.output_tokens !== undefined) patch.output_tokens = usage.output_tokens;
        if (usage.cache_read_tokens !== undefined) patch.cache_read_tokens = usage.cache_read_tokens;
        if (usage.cache_creation_tokens !== undefined) patch.cache_creation_tokens = usage.cache_creation_tokens;
        if (usage.total_cost != null) patch.total_cost = usage.total_cost;
        patchTaskLists(queryClient, (prev) => prev.map((t) => (t.id === usage.taskId ? { ...t, ...patch } : t)));
      },
      'task:deleted': ({ id }) => {
        patchTaskLists(queryClient, (prev) => prev.filter((t) => t.id !== id));
      },

      // ─── Projects: patch in place ───
      'project:created': (project) => {
        queryClient.setQueryData<Project[]>(queryKeys.projects, (prev) =>
          prev ? (prev.some((p) => p.id === project.id) ? prev : [...prev, project]) : prev,
        );
      },
      'project:updated': (project) => {
        queryClient.setQueryData<Project[]>(queryKeys.projects, (prev) =>
          prev?.map((p) => (p.id === project.id ? project : p)),
        );
      },
      'project:deleted': ({ id }) => {
        queryClient.setQueryData<Project[]>(queryKeys.projects, (prev) => prev?.filter((p) => p.id !== id));
        if (useUIStore.getState().currentProjectId === id) useUIStore.getState().navigateToDashboard();
      },

      // ─── Rare entity events: invalidate, next render refetches ───
      'template:created': invalidate('templates'),
      'template:updated': invalidate('templates'),
      'template:deleted': invalidate('templates'),
      'role:created': invalidate('roles'),
      'role:updated': invalidate('roles'),
      'role:deleted': invalidate('roles'),
      'snippet:created': invalidate('snippets'),
      'snippet:updated': invalidate('snippets'),
      'snippet:deleted': invalidate('snippets'),
    };

    const entries = Object.entries(handlers) as [AppEventName, (payload: unknown) => void][];
    if (IS_TAURI) {
      const unsubs = entries.map(([event, handler]) => tauriListen(event, handler));
      return () => unsubs.forEach((fn) => fn());
    }
    for (const [event, handler] of entries) socket.on(event, handler);
    return () => {
      for (const [event, handler] of entries) socket.off(event, handler);
    };
  }, [queryClient]);
}
