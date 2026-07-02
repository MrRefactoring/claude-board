import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Project, Task } from '@/lib/types';

// Stable fallback: `data ?? []` would mint a fresh array every render while the
// query is disabled, and anything with `tasks` in an effect dep array would
// re-run each render (infinite setState loop via useTerminalTabs).
const NO_TASKS: Task[] = [];

/**
 * Task list for the current project, backed by the query cache.
 * Freshness comes from realtime events (useRealtimeSync), not refetching.
 */
export function useTasks(currentProject: Project | null) {
  const projectId = currentProject?.id ?? null;
  const { data } = useQuery({
    queryKey: queryKeys.tasks(projectId ?? -1),
    queryFn: () => api.getTasks(projectId!),
    enabled: projectId !== null,
  });
  return { tasks: data ?? NO_TASKS };
}
