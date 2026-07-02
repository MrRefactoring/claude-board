import { Code } from 'lucide-react';
import { TOOL_ICONS, TOOL_COLORS } from './planningConstants';

/** A single Claude-proposed task from the planning session. */
export interface PlanProposal {
  title: string;
  description?: string;
  acceptance_criteria?: string;
  task_type?: string;
  priority?: number;
}

/** Index-based dependency edge: [parentIndex, childIndex]. */
export type PlanDependency = [number, number];

/** One activity-feed log entry streamed during planning. */
export interface PlanLog {
  type: string;
  message: string;
  ts: number;
}

/** Live/aggregate stats for the planning run. */
export interface PlanStats {
  elapsed: number;
  tokens: { input: number; output: number };
  toolCalls: number;
  turns: number;
}

/** Top-level modal phase. */
export type PlanPhaseName = 'idle' | 'thinking' | 'review' | 'approved' | 'error';

/** Persisted per-project planning state. */
export interface PlanCache {
  phase: PlanPhaseName;
  planPhase: string;
  logs: PlanLog[];
  analysis: string;
  proposals: PlanProposal[];
  dependencies: PlanDependency[];
  stats: PlanStats;
  error: string | null;
  topic: string;
  context: string;
  model: string;
  effort: string;
  granularity: string;
}

/** Compute execution waves from index-based dependency pairs for DAG layout */
export function computeWaves(proposals: PlanProposal[], deps: PlanDependency[]): { id: number }[][] {
  const n = proposals.length;
  if (n === 0) return [];
  // Build parent set for each task index
  const parents = Array.from({ length: n }, () => new Set<number>());
  for (const [parentIdx, childIdx] of deps) {
    if (childIdx >= 0 && childIdx < n && parentIdx >= 0 && parentIdx < n) {
      parents[childIdx].add(parentIdx);
    }
  }
  const assigned = new Set<number>();
  const waves: { id: number }[][] = [];
  // Iteratively find tasks whose parents are all assigned
  for (let iter = 0; iter < n; iter++) {
    const wave: number[] = [];
    for (let i = 0; i < n; i++) {
      if (assigned.has(i)) continue;
      const allMet = [...parents[i]].every((p) => assigned.has(p));
      if (allMet) wave.push(i);
    }
    if (wave.length === 0) break; // remaining tasks form a cycle — skip
    for (const id of wave) assigned.add(id);
    waves.push(wave.map((id) => ({ id })));
  }
  // Any unassigned (cyclic) tasks go into last wave
  const remaining: { id: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (!assigned.has(i)) remaining.push({ id: i });
  }
  if (remaining.length > 0) waves.push(remaining);
  return waves;
}

export function getToolIcon(name: string) {
  if (!name) return Code;
  for (const [k, I] of Object.entries(TOOL_ICONS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return I;
  }
  return Code;
}

export function getToolColor(name: string): string {
  if (!name) return 'text-purple-400';
  for (const [k, c] of Object.entries(TOOL_COLORS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return c;
  }
  return 'text-purple-400';
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function getStepIndex(phase: string): number {
  if (phase === 'idle' || phase === 'error') return 0;
  if (phase === 'thinking') return 1;
  if (phase === 'review') return 2;
  if (phase === 'approved') return 3;
  return 0;
}

// Persist planning state across modal open/close
const planCache: Record<number, PlanCache> = {};
export function getCache(pid: number): PlanCache {
  if (!planCache[pid])
    planCache[pid] = {
      phase: 'idle',
      planPhase: 'starting',
      logs: [],
      analysis: '',
      proposals: [],
      dependencies: [],
      stats: { elapsed: 0, tokens: { input: 0, output: 0 }, toolCalls: 0, turns: 0 },
      error: null,
      topic: '',
      context: '',
      model: 'sonnet',
      effort: 'medium',
      granularity: 'balanced',
    };
  return planCache[pid];
}
