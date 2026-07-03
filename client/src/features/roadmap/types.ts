import type { LucideIcon } from 'lucide-react';

// ─── Local domain shapes ───
// The GSD roadmap is served over Tauri-only IPC commands that return `Promise<unknown>`
// (see lib/api.ts). These interfaces describe the fields this view actually reads;
// awaited results are narrowed/cast to them at each call site.

export type MsgType = 'success' | 'error';

export interface StatusMsg {
  type: MsgType;
  text: string;
}

export interface ProgressData {
  total: number;
  done: number;
  in_progress: number;
  failed: number;
}

export interface Criterion {
  text?: string;
  criterion?: string;
  verified?: boolean;
}

export interface Plan {
  id: number;
  plan_number: string;
  title: string;
  status: string;
  task_count?: number;
  done_count?: number;
}

export interface PlanTaskLink {
  id: number;
  task_id: number;
  checkpoint_type: string;
}

export interface Phase {
  id: number;
  phase_number: string;
  title: string;
  goal: string | null;
  description: string | null;
  status: string;
  success_criteria?: string;
  plans?: Plan[];
  progress?: ProgressData;
}

export interface Milestone {
  id: number;
  version: string;
  title: string;
  description: string | null;
  status: string;
  phases?: Phase[];
}

export interface Roadmap {
  milestones?: Milestone[];
}

export interface Proposal {
  title: string;
  task_type?: string;
  description?: string;
  acceptance_criteria?: string;
}

export interface PlanLog {
  type?: string;
  content?: string;
  message?: string;
}

/** Payload shape for the `plan:*` Tauri events (typed `unknown` in AppEventMap). */
export interface PlanEvent {
  projectId?: number;
  type?: string;
  content?: string;
  message?: string;
  phase?: string;
  proposals?: Proposal[];
  dependencies?: unknown[];
  error?: string;
}

export interface GsdStatus {
  installed?: boolean;
  has_planning?: boolean;
  has_roadmap?: boolean;
}

export interface GsdPhase {
  number: string;
  title: string;
  status: string;
  description?: string;
}

export interface GsdRoadmap {
  phases?: GsdPhase[];
  raw?: string;
}

export interface GsdState {
  current_phase?: string;
  current_step?: string;
  raw?: string;
}

export interface GsdProject {
  name?: string;
  raw?: string;
}

export interface GsdFileEntry {
  name: string;
  content: string;
}

export interface GsdPhaseDetail {
  number: string;
  files?: GsdFileEntry[];
}

export interface GsdPlanTask {
  wave?: number;
  task_type: string;
  task_name?: string;
  plan_number: string;
  files?: string;
  done_criteria?: string;
}

export interface HealthCheckItem {
  name: string;
  status: string;
  message?: string;
}

export interface HealthReport {
  overall: string;
  checks: HealthCheckItem[];
}

export interface Todo {
  path: string;
  status: string;
  title: string;
  area: string;
  preview?: string;
}

export interface PhaseTableData {
  headers: string[];
  rows: string[][];
}

export interface ParsedPhaseDescription {
  goal: string;
  dependsOn: string;
  requirements: string[];
  successCriteria: string[];
  plans: string[];
  executionOrder: string;
  tables: PhaseTableData[];
  other: string[];
}

export interface GsdAction {
  label: string;
  icon: LucideIcon;
  command: string;
  color: string;
  prompt: (n: string, title: string) => string;
}
