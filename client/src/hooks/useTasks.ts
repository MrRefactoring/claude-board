import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Project } from '@/lib/types';

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
  return { tasks: data ?? [] };
}
