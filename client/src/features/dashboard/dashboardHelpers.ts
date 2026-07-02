import type { Project } from '../../lib/types';

/** Project row enriched with the aggregate counters returned by getProjectsSummary. */
export interface ProjectSummary extends Project {
  total_tasks?: number;
  done_tasks?: number;
  active_tasks?: number;
  backlog_tasks?: number;
  testing_tasks?: number;
  total_tokens?: number;
  total_cost?: number;
  last_activity?: string | null;
}

export function normalizeModelName(raw?: string | null): string {
  if (!raw || !raw.trim()) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return raw;
}
