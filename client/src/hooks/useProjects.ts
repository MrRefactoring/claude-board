import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useUIStore } from '@/store/uiStore';

/**
 * Projects list (query cache; realtime patches come from useRealtimeSync)
 * plus URL slug resolution. The *selection* lives in the UI store as
 * `currentProjectId`; `currentProject` here is derived from the list.
 */
export function useProjects() {
  const currentProjectId = useUIStore((s) => s.currentProjectId);
  const { data, isLoading } = useQuery({ queryKey: queryKeys.projects, queryFn: () => api.getProjects() });
  const projects = useMemo(() => data ?? [], [data]);

  // Resolve the URL slug once after the first load (deep link / reload).
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (isLoading || booted) return;
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (path && projects.length > 0) {
      const match = projects.find((p) => p.slug === path);
      if (match) {
        useUIStore.getState().setCurrentProjectId(match.id);
        window.history.replaceState({ slug: match.slug }, '', `/${match.slug}`);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot boot latch after initial slug resolution; guarded by booted
    setBooted(true);
  }, [isLoading, booted, projects]);

  // Browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const slug = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const match = slug ? projects.find((p) => p.slug === slug) : undefined;
      useUIStore.getState().setCurrentProjectId(match?.id ?? null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [projects]);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  );

  return { projects, currentProject, initialLoad: isLoading || !booted };
}
