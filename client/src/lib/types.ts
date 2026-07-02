// Core domain entities. Field shapes mirror the SQLite rows / Tauri IPC payloads
// exactly (e.g. boolean-ish flags arrive as 0/1 numbers, and JSON columns arrive
// as raw strings — see Commit / TemplateVariable for the parsed counterparts).

export interface Project {
  id: number;
  name: string;
  slug: string;
  working_dir: string;
  icon?: string;
  icon_seed?: string;
  permission_mode?: string;
  allowed_tools?: string;
  auto_queue?: number;
  max_concurrent?: number;
  auto_branch?: number;
  auto_pr?: number;
  pr_base_branch?: string;
  project_key?: string;
  task_counter?: number;
  created_at?: string;
  updated_at?: string;
}

export type TaskStatus = 'backlog' | 'in_progress' | 'testing' | 'done' | 'failed';

export type TaskType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'chore';

/** Jira-style hierarchy level. `epic`/`story` are containers (they roll up from
 *  their children and are not executed by agents); `task`/`subtask` are leaves. */
export type TaskLevel = 'epic' | 'story' | 'task' | 'subtask';

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: number;
  task_type?: TaskType;
  acceptance_criteria?: string;
  model?: string;
  thinking_effort?: string;
  sort_order?: number;
  queue_position?: number;
  branch_name?: string;
  claude_session_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  total_cost?: number;
  num_turns?: number;
  rate_limit_hits?: number;
  revision_count?: number;
  model_used?: string;
  started_at?: string;
  completed_at?: string;
  work_duration_ms?: number;
  last_resumed_at?: string;
  /** JSON string of a Commit[] (raw DB column; getTaskDetail returns it parsed). */
  commits?: string;
  pr_url?: string;
  diff_stat?: string;
  role_id?: number;
  task_key?: string;
  /** Parent in the epic→story→task→subtask tree (raw DB column). */
  parent_task_id?: number;
  /** Hierarchy level; defaults to `task` when absent. */
  task_level?: TaskLevel;
  story_points?: number;
  /** Per-task PR intent override (0/1); absent/undefined = inherit project.auto_pr. */
  auto_pr?: number;
  created_at?: string;
  updated_at?: string;
  /** Computed at runtime, not persisted. */
  is_running?: boolean;
}

export interface Template {
  id: number;
  project_id: number;
  name: string;
  description?: string;
  template: string;
  /** JSON string of a TemplateVariable[]. */
  variables?: string;
  task_type?: string;
  model?: string;
  thinking_effort?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Snippet {
  id: number;
  project_id: number;
  title: string;
  content: string;
  enabled?: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Role {
  id: number;
  project_id?: number;
  name: string;
  description?: string;
  prompt?: string;
  color?: string;
  // Reusable-agent config: pinned model, tool allow-list (comma-separated), and
  // a task-type affinity hint (comma-separated task types this agent is good at).
  model?: string;
  allowed_tools?: string;
  task_type_affinity?: string;
  created_at?: string;
  updated_at?: string;
}

/** A recurring ad-hoc config the app suggests saving as a reusable agent (role). */
export interface AgentSuggestion {
  model: string;
  task_type: string;
  count: number;
  sample_titles: string[];
}

/** A pending tool-permission request awaiting a Yes / Always / Deny decision. */
export interface PendingPermission {
  id: string;
  tool_name: string;
  /** Raw tool input Claude wants to run (opaque). */
  input: unknown;
  /** "chat" or "task". */
  origin: string;
  /** Set when origin === "task". */
  task_id: number | null;
  /** "pending" | "allow" | "deny". */
  status: string;
  message: string | null;
  created_at: number;
}

/** A webhook event type identifier, e.g. 'task:completed'. */
export type WebhookEventType = string;

export interface Webhook {
  id: number;
  project_id: number;
  name: string;
  url: string;
  platform?: string;
  /** JSON string of a WebhookEventType[]. */
  events?: string;
  enabled?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at?: string;
}

export interface TaskRevision {
  id: number;
  task_id: number;
  revision_number: number;
  feedback: string;
  created_at?: string;
}

/** A task comment / work-log entry, authored by the user or an agent. */
export interface TaskComment {
  id: number;
  task_id: number;
  author_type?: 'user' | 'agent';
  author_name?: string;
  body: string;
  pr_url?: string;
  created_at?: string;
}

export interface ActivityEntry {
  id: number;
  project_id: number;
  task_id?: number;
  event_type: string;
  message: string;
  /** JSON string. */
  metadata?: string;
  created_at?: string;
}

// ─── Parsed shapes for the JSON-string columns above ───

/** Parsed element of Task.commits (JSON string). */
export interface Commit {
  hash?: string;
  short?: string;
  message?: string;
  author?: string;
  date?: string;
}

/** Parsed element of Template.variables (JSON string). */
export interface TemplateVariable {
  name: string;
  label?: string;
  default?: string;
  placeholder?: string;
}

// ─── Model catalogue (mirrors src-tauri models.rs default_seed_models) ───

/** A selectable Claude model with display + cost metadata. */
export interface Model {
  value: string;
  label: string;
  source: string;
  color?: string;
  input_cost_per_mtok?: number;
  output_cost_per_mtok?: number;
}

// ─── Shared UI types (used across hooks, App shell, and components) ───

export type ToastType = 'info' | 'error' | 'success' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

/** Adds a transient toast notification. */
export type AddToast = (message: string, type?: ToastType) => void;

/** Known translation keys, derived from the English locale. */
export type I18nKey = keyof typeof import('@/i18n/locales/en').default;

/**
 * Translation function from the i18n provider: key + optional interpolation params.
 * Soft-typed: known keys get IDE autocomplete, while dynamic keys
 * (e.g. `'status.' + col.id`) stay accepted via `string & {}`.
 */
export type TranslateFn = (key: I18nKey | (string & {}), params?: Record<string, string | number>) => string;

/** Payload passed to the global confirm dialog. */
export interface ConfirmState {
  title: string;
  message: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}
