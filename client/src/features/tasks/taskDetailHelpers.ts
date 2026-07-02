import type { Task, Commit, TaskRevision, Attachment } from '@/lib/types';

// Shared palette lives in lib/constants — re-exported so existing imports keep working.
export { TYPE_COLORS, STATUS_TEXT_COLORS as STATUS_COLORS } from '@/lib/constants';

export function getDiffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-surface-300 font-semibold px-4 py-0';
  if (line.startsWith('@@')) return 'text-cyan-400 bg-cyan-500/5 px-4 py-0.5';
  if (line.startsWith('diff --git'))
    return 'text-surface-200 font-semibold bg-surface-800/80 px-4 py-1 border-t border-surface-700/50';
  if (line.startsWith('+')) return 'text-emerald-400 bg-emerald-500/5 px-4 py-0';
  if (line.startsWith('-')) return 'text-red-400 bg-red-500/5 px-4 py-0';
  return 'text-surface-500 px-4 py-0';
}

/** A single verification check within a parsed test report. */
export interface TestCheck {
  name?: string;
  status?: string;
  detail?: string;
}

/** Parsed shape of Task.test_report (stored as a JSON string at rest). */
export interface TestReport {
  verdict?: string;
  summary?: string;
  feedback?: string;
  checks?: TestCheck[];
}

export function parseTestReport(testReport?: string | TestReport | null): TestReport | null {
  if (!testReport) return null;
  if (typeof testReport !== 'string') return testReport;
  try {
    return JSON.parse(testReport) as TestReport;
  } catch {
    return null;
  }
}

export function getCheckStatusColors(status?: string): string {
  if (status === 'pass') return 'bg-emerald-500/15 text-emerald-400';
  if (status === 'fail') return 'bg-red-500/15 text-red-400';
  if (status === 'warn') return 'bg-amber-500/15 text-amber-400';
  return 'bg-surface-700/50 text-surface-500';
}

export function getCheckCardBorder(status?: string): string {
  if (status === 'fail') return 'bg-red-500/5 border-red-500/20';
  if (status === 'warn') return 'bg-amber-500/5 border-amber-500/20';
  if (status === 'pass') return 'bg-emerald-500/5 border-emerald-500/20';
  return 'bg-surface-800/30 border-surface-700/30';
}

/** Parents/children dependency ids for a task (from api.getTaskDependencies). */
export interface TaskDependencies {
  parents: number[];
  children: number[];
}

/**
 * The task-detail payload returned by `api.getTaskDetail` (typed `unknown`).
 * It is a Task row plus parsed/joined fields the bare DB row doesn't carry —
 * notably `commits` arrives as a parsed `Commit[]` (vs the raw JSON string on Task).
 */
export interface TaskDetail extends Omit<Task, 'commits'> {
  commits?: Commit[];
  revisions?: TaskRevision[];
  attachments?: Attachment[];
  diff_stat?: string;
  test_report?: string | TestReport | null;
  lifecycle_summary?: string;
  tags?: string | string[];
}
