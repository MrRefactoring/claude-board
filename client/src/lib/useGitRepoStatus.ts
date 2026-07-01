import { useState, useEffect } from 'react';
import { api } from './api';

export interface GitRepoStatus {
  isRepo: boolean;
  hasRemote: boolean;
  currentBranch: string | null;
  pathExists: boolean;
  detectedProvider: string;
}

interface GitRepoStatusOptions {
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * Probe a directory to learn whether it's a git repo, debounced on the path.
 */
export function useGitRepoStatus(
  path: string | null | undefined,
  { debounceMs = 350, enabled = true }: GitRepoStatusOptions = {},
) {
  const [status, setStatus] = useState<GitRepoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled || !path || !path.trim()) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = (await api.checkGitRepo(path.trim())) as Record<string, unknown> | null;
        if (cancelled) return;
        // Backend uses snake_case; Tauri converts but the camelCase result depends on serde.
        // We normalize to camelCase here.
        const normalized: GitRepoStatus | null = res
          ? {
              isRepo: !!(res.is_repo ?? res.isRepo),
              hasRemote: !!(res.has_remote ?? res.hasRemote),
              currentBranch: (res.current_branch ?? res.currentBranch ?? null) as string | null,
              pathExists: !!(res.path_exists ?? res.pathExists),
              detectedProvider: (res.detected_provider ?? res.detectedProvider ?? 'unknown') as string,
            }
          : null;
        setStatus(normalized);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setStatus(null);
        setError((e as { message?: string })?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [path, debounceMs, enabled, refreshTick]);

  return { status, loading, error, refresh: () => setRefreshTick((n) => n + 1) };
}
