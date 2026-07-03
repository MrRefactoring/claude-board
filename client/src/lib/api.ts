import type {
  Project,
  Task,
  TaskStatus,
  TaskRevision,
  Snippet,
  Template,
  Role,
  Webhook,
  Attachment,
  ActivityEntry,
  Model,
  TaskComment,
  AgentSuggestion,
  PendingPermission,
} from '@/lib/types';

// Detect Tauri environment
const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

// MCP HTTP port (used by Tauri backend for Claude runner)
const MCP_PORT = parseInt(import.meta.env.VITE_MCP_PORT || '4000', 10);

// ─── HTTP fallback (web mode / dev) ───
const BASE = import.meta.env.DEV ? `http://localhost:${MCP_PORT}` : '';

type ApiErrorListener = (msg: string) => void;
const errorListeners = new Set<ApiErrorListener>();
export function onApiError(fn: ApiErrorListener): () => void {
  errorListeners.add(fn);
  return () => {
    errorListeners.delete(fn);
  };
}
export function notifyError(msg: string): void {
  errorListeners.forEach((fn) => fn(msg));
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e) {
    notifyError('Network error — server unreachable');
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.error || `Request failed (${res.status})`;
    if (res.status >= 400) notifyError(msg);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function tauriCall<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await window.__TAURI_INTERNALS__!.invoke<T>(cmd, args);
  } catch (e) {
    const msg = typeof e === 'string' ? e : (e as { message?: string })?.message || 'Unknown error';
    notifyError(msg);
    throw new Error(msg);
  }
}

// ─── Unified dispatch: define each method once ───
function call<T = unknown>(
  cmd: string,
  method: string,
  path: string,
  tauriArgs: Record<string, unknown> = {},
  httpBody?: unknown,
): Promise<T> {
  if (IS_TAURI) return tauriCall<T>(cmd, tauriArgs);
  const opts: RequestInit = { method };
  if (httpBody !== undefined) opts.body = JSON.stringify(httpBody);
  return request<T>(path, opts);
}

// ─── Core API (available in both Tauri and web/HTTP mode) ───
const coreApi = {
  // ─── Projects ───
  getProjects: (): Promise<Project[]> => call('get_projects', 'GET', '/api/projects'),
  getProjectsSummary: (): Promise<Project[]> => call('get_projects_summary', 'GET', '/api/projects/summary'),
  createProject: (data: Partial<Project>): Promise<Project> =>
    call('create_project', 'POST', '/api/projects', data, data),
  updateProject: (id: number, data: Partial<Project>): Promise<Project> =>
    call('update_project', 'PUT', `/api/projects/${id}`, { id, ...data }, data),
  deleteProject: (id: number): Promise<void> => call('delete_project', 'DELETE', `/api/projects/${id}`, { id }),

  // ─── Tasks ───
  getTasks: (projectId: number): Promise<Task[]> =>
    call('get_tasks', 'GET', `/api/projects/${projectId}/tasks`, { projectId }),
  createTask: (projectId: number, data: Partial<Task>): Promise<Task> =>
    call('create_task', 'POST', `/api/projects/${projectId}/tasks`, { projectId, ...data }, data),
  updateTask: (id: number, data: Partial<Task>): Promise<Task> =>
    call('update_task', 'PUT', `/api/tasks/${id}`, { id, ...data }, data),
  updateStatus: (id: number, status: TaskStatus): Promise<Task> =>
    call('change_task_status', 'PATCH', `/api/tasks/${id}/status`, { id, status, mcpPort: MCP_PORT }, { status }),
  deleteTask: (id: number): Promise<void> => call('delete_task', 'DELETE', `/api/tasks/${id}`, { id }),
  getTaskLogs: (id: number, limit = 500): Promise<unknown> =>
    call('get_task_logs', 'GET', `/api/tasks/${id}/logs?limit=${limit}`, { id, limit }),
  stopTask: (id: number): Promise<void> => call('stop_task', 'POST', `/api/tasks/${id}/stop`, { id }),
  restartTask: (id: number): Promise<void> =>
    call('restart_task', 'POST', `/api/tasks/${id}/restart`, { id, mcpPort: MCP_PORT }),
  requestChanges: (id: number, feedback: string): Promise<Task> =>
    call(
      'request_changes',
      'POST',
      `/api/tasks/${id}/request-changes`,
      { id, feedback, mcpPort: MCP_PORT },
      { feedback },
    ),
  getRevisions: (id: number): Promise<TaskRevision[]> =>
    call('get_revisions', 'GET', `/api/tasks/${id}/revisions`, { id }),
  getTaskDetail: (id: number): Promise<unknown> => call('get_task_detail', 'GET', `/api/tasks/${id}/detail`, { id }),
  getTaskComments: (id: number): Promise<TaskComment[]> =>
    call('get_task_comments', 'GET', `/api/tasks/${id}/comments`, { id }),
  addTaskComment: (taskId: number, body: string, authorName?: string | null): Promise<TaskComment> =>
    call(
      'add_task_comment',
      'POST',
      `/api/tasks/${taskId}/comments`,
      { taskId, body, authorName: authorName || null },
      { body, author_type: 'user' },
    ),
  // Per-task PR intent: true = always open a PR, false = never, null = inherit project default.
  setTaskAutoPr: (id: number, autoPr: boolean | null): Promise<Task> =>
    call('set_task_auto_pr', 'POST', `/api/tasks/${id}/pr-intent`, { id, autoPr }, { auto_pr: autoPr }),

  // ─── Planning ───
  startPlanning: (projectId: number, data: Record<string, unknown>): Promise<unknown> =>
    call('start_planning', 'POST', `/api/projects/${projectId}/plan`, { projectId, ...data }, data),
  cancelPlanning: (projectId: number): Promise<unknown> =>
    call('cancel_planning', 'POST', `/api/projects/${projectId}/plan/cancel`, { projectId }),
  getPlanningStatus: (projectId: number): Promise<unknown> =>
    call('get_planning_status', 'GET', `/api/projects/${projectId}/plan/status`, { projectId }),

  // ─── Stats & Activity ───
  getStats: (projectId: number): Promise<unknown> =>
    call('get_project_stats', 'GET', `/api/projects/${projectId}/stats`, { projectId }),
  getActivity: (projectId: number, limit = 50, offset = 0): Promise<ActivityEntry[]> =>
    call('get_activity', 'GET', `/api/projects/${projectId}/activity?limit=${limit}&offset=${offset}`, {
      projectId,
      limit,
      offset,
    }),
  getClaudeUsage: (): Promise<unknown> => call('get_claude_usage', 'GET', '/api/stats/claude-usage'),

  // ─── CLAUDE.md ───
  getClaudeMd: (projectId: number): Promise<unknown> =>
    call('get_claude_md', 'GET', `/api/projects/${projectId}/claude-md`, { projectId }),
  saveClaudeMd: (projectId: number, content: string): Promise<void> =>
    call('save_claude_md', 'PUT', `/api/projects/${projectId}/claude-md`, { projectId, content }, { content }),

  // ─── Snippets ───
  getSnippets: (projectId: number): Promise<Snippet[]> =>
    call('get_snippets', 'GET', `/api/projects/${projectId}/snippets`, { projectId }),
  createSnippet: (projectId: number, data: Partial<Snippet>): Promise<Snippet> =>
    call('create_snippet', 'POST', `/api/projects/${projectId}/snippets`, { projectId, ...data }, data),
  updateSnippet: (id: number, data: Partial<Snippet>): Promise<Snippet> =>
    call('update_snippet', 'PUT', `/api/snippets/${id}`, { id, ...data }, data),
  deleteSnippet: (id: number): Promise<void> => call('delete_snippet', 'DELETE', `/api/snippets/${id}`, { id }),

  // ─── Templates ───
  getTemplates: (projectId: number): Promise<Template[]> =>
    call('get_templates', 'GET', `/api/projects/${projectId}/templates`, { projectId }),
  createTemplate: (projectId: number, data: Partial<Template>): Promise<Template> =>
    call('create_template', 'POST', `/api/projects/${projectId}/templates`, { projectId, ...data }, data),
  updateTemplate: (id: number, data: Partial<Template>): Promise<Template> =>
    call('update_template', 'PUT', `/api/templates/${id}`, { id, ...data }, data),
  deleteTemplate: (id: number): Promise<void> => call('delete_template', 'DELETE', `/api/templates/${id}`, { id }),

  // ─── Attachments ───
  uploadAttachments: IS_TAURI
    ? async (taskId: number, files: File[]): Promise<Attachment[]> => {
        const results: Attachment[] = [];
        for (const file of files) {
          const arrayBuffer = await file.arrayBuffer();
          const fileData = Array.from(new Uint8Array(arrayBuffer));
          const result = await tauriCall<Attachment>('upload_attachment', {
            taskId,
            fileData,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
          });
          results.push(result);
        }
        return results;
      }
    : async (taskId: number, files: File[]): Promise<Attachment[]> => {
        const formData = new FormData();
        for (const file of files) formData.append('files', file);
        const res = await fetch(`${BASE}/api/tasks/${taskId}/attachments`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('Upload failed');
        return res.json() as Promise<Attachment[]>;
      },
  deleteAttachment: (id: number): Promise<void> =>
    call('delete_attachment', 'DELETE', `/api/attachments/${id}`, { id }),

  // ─── Roles ───
  getRoles: (projectId: number): Promise<Role[]> =>
    call('get_roles', 'GET', `/api/projects/${projectId}/roles`, { projectId }),
  createRole: (projectId: number, data: Partial<Role>): Promise<Role> =>
    call('create_role', 'POST', `/api/projects/${projectId}/roles`, { projectId, ...data }, data),
  updateRole: (id: number, data: Partial<Role>): Promise<Role> =>
    call('update_role', 'PUT', `/api/roles/${id}`, { id, ...data }, data),
  deleteRole: (id: number): Promise<void> => call('delete_role', 'DELETE', `/api/roles/${id}`, { id }),
  getAgentSuggestions: (projectId: number): Promise<AgentSuggestion[]> =>
    call('get_agent_suggestions', 'GET', `/api/projects/${projectId}/agent-suggestions`, { projectId }),

  // ─── Webhooks ───
  getWebhooks: (projectId: number): Promise<Webhook[]> =>
    call('get_webhooks', 'GET', `/api/projects/${projectId}/webhooks`, { projectId }),
  createWebhook: (projectId: number, data: Partial<Webhook>): Promise<Webhook> =>
    call('create_webhook', 'POST', `/api/projects/${projectId}/webhooks`, { projectId, ...data }, data),
  updateWebhook: (id: number, data: Partial<Webhook>): Promise<Webhook> =>
    call('update_webhook', 'PUT', `/api/webhooks/${id}`, { id, ...data }, data),
  deleteWebhook: (id: number): Promise<void> => call('delete_webhook', 'DELETE', `/api/webhooks/${id}`, { id }),
  testWebhook: (id: number): Promise<unknown> => call('test_webhook', 'POST', `/api/webhooks/${id}/test`, { id }),

  // ─── Auth ───

  // ─── App Settings ───
  getAppSettings: (): Promise<unknown> => call('get_app_settings', 'GET', '/api/settings'),
  updateAppSettings: (data: Record<string, unknown>): Promise<unknown> =>
    call('update_app_settings', 'PUT', '/api/settings', { data }, data),

  // ─── Tool-permission approval (Yes / Always / Deny) ───
  getPendingPermissions: (): Promise<PendingPermission[]> =>
    call('get_pending_permissions', 'GET', '/api/permission/pending'),
  resolvePermission: (id: string, decision: 'allow' | 'deny', remember = false): Promise<boolean> =>
    call('resolve_permission', 'POST', `/api/permission/${id}/resolve`, { id, decision, remember }, { decision, remember }),

  // ─── Git utilities ───
  checkGitRepo: (path: string): Promise<unknown> =>
    call('check_git_repo', 'GET', `/api/git/check?path=${encodeURIComponent(path)}`, { path }),
  initGitRepo: (path: string, initialBranch = 'main'): Promise<unknown> =>
    call('init_git_repo', 'POST', '/api/git/init', { path, initialBranch }, { path, initialBranch }),

  // ─── Models registry ───
  listModels: (): Promise<Model[]> => call('list_models', 'GET', '/api/models'),
  addCustomModel: (data: Partial<Model>): Promise<Model> => call('add_custom_model', 'POST', '/api/models', data, data),
  updateCustomModel: (id: number, data: Partial<Model>): Promise<Model> =>
    call('update_custom_model', 'PUT', `/api/models/${id}`, { id, ...data }, data),
  deleteCustomModel: (id: number): Promise<void> => call('delete_custom_model', 'DELETE', `/api/models/${id}`, { id }),

  // ─── Logs (bug reports) ───
  // Tauri-only: the HTTP shim has no filesystem access.
  getLogsDir: (): Promise<unknown> => (IS_TAURI ? tauriCall('get_logs_dir') : Promise.reject(new Error('Tauri-only'))),
  openLogsDir: (): Promise<unknown> =>
    IS_TAURI ? tauriCall('open_logs_dir') : Promise.reject(new Error('Tauri-only')),

  // ─── GitHub Issues sync ───
  githubDetectRepo: (workingDir: string): Promise<unknown> =>
    call('github_detect_repo', 'POST', '/api/github/detect-repo', { workingDir }, { workingDir }),
  githubCheckStatus: (repo: unknown): Promise<unknown> =>
    call('github_check_status', 'POST', '/api/github/check-status', { repo }, { repo }),
  githubFetchIssues: (projectId: number): Promise<unknown> =>
    call('github_fetch_issues', 'POST', `/api/projects/${projectId}/github/issues`, { projectId }, {}),
  githubImportIssues: (projectId: number, issueNumbers: number[]): Promise<unknown> =>
    call(
      'github_import_issues',
      'POST',
      `/api/projects/${projectId}/github/import`,
      { projectId, issueNumbers },
      { issueNumbers },
    ),
};

// ─── Tauri-only: Claude Manager, roadmap/GSD, MCP, skills, chat ───
// Present at runtime only in the desktop app; the type keeps them always-present
// since every caller lives behind Tauri-only UI (matches prior JS behavior).
const tauriApi = {
  getProjectGroups: () => tauriCall('get_project_groups'),
  reorderQueue: (projectId: number, taskIds: number[]) => tauriCall('reorder_queue', { projectId, taskIds }),
  reorderTasks: (taskIds: number[]) => tauriCall('reorder_tasks', { taskIds }),
  addDependency: (taskId: number, dependsOnId: number, conditionType?: string | null) =>
    tauriCall('add_task_dependency', {
      taskId: taskId,
      dependsOnId: dependsOnId,
      conditionType: conditionType || null,
    }),
  removeDependency: (taskId: number, dependsOnId: number) =>
    tauriCall('remove_task_dependency', { taskId: taskId, dependsOnId: dependsOnId }),
  getTaskDependencies: (taskId: number) => tauriCall('get_task_dependencies', { taskId: taskId }),
  getTaskEvents: (taskId: number, limit = 500) => tauriCall('get_task_events', { taskId: taskId, limit }),
  getDependencyGraph: (projectId: number) => tauriCall('get_dependency_graph', { projectId }),
  getPipelineStatus: (projectId: number) => tauriCall('get_pipeline_status', { projectId }),
  getAgentActivity: (projectId: number) => tauriCall('get_agent_activity', { projectId }),
  getTaskDiff: (taskId: number) => tauriCall('get_task_diff', { taskId: taskId }),
  approvePlan: (projectId: number, tasks: unknown, model: string, dependencies: unknown, topic: string) =>
    tauriCall('approve_plan', { projectId, tasks, model, dependencies, topic }),
  getAuthInfo: () => tauriCall('get_auth_info'),
  listMcpServers: () => tauriCall('list_mcp_servers'),
  addMcpServer: (name: string, commandStr: string, args: unknown, scope: string, env: unknown) =>
    tauriCall('add_mcp_server', { name, commandStr, args, scope, env }),
  removeMcpServer: (name: string, scope: string) => tauriCall('remove_mcp_server', { name, scope }),
  listPlugins: () => tauriCall('list_plugins'),
  installPlugin: (name: string) => tauriCall('install_plugin', { name }),
  uninstallPlugin: (name: string) => tauriCall('uninstall_plugin', { name }),
  togglePlugin: (name: string, enabled: boolean) => tauriCall('toggle_plugin', { name, enabled }),
  listMarketplaces: () => tauriCall('list_marketplaces'),
  addMarketplace: (source: string, scope: string) => tauriCall('add_marketplace', { source, scope }),
  removeMarketplace: (name: string) => tauriCall('remove_marketplace', { name }),
  getClaudeSettings: () => tauriCall('get_claude_settings'),
  saveClaudeSettings: (settings: unknown) => tauriCall('save_claude_settings', { settings }),
  listAgents: () => tauriCall('list_agents'),
  getClaudeVersion: () => tauriCall('get_claude_version'),
  updateClaudeCli: () => tauriCall('update_claude_cli'),
  getHooks: () => tauriCall('get_hooks'),
  saveHooks: (hooks: unknown) => tauriCall('save_hooks', { hooks }),
  listSessions: () => tauriCall('list_sessions'),
  getPermissionRules: () => tauriCall('get_permission_rules'),
  prescanStats: (projectId: number) => tauriCall('prescan_stats', { projectId }),
  scanCodebase: (projectId: number, scanType = 'detailed', customPrompt: string | null = null) =>
    tauriCall('scan_codebase', { projectId, scanType, customPrompt }),
  saveScanResult: (projectId: number, content: string, scanType: string | null = null, mode = 'overwrite') =>
    tauriCall('save_scan_result', { projectId, content, scanType, mode }),
  getScanHistory: (projectId: number) => tauriCall('get_scan_history', { projectId }),
  getScanDetail: (id: number) => tauriCall('get_scan_detail', { id }),
  deleteScan: (id: number) => tauriCall('delete_scan', { id }),
  getSuggestions: () => tauriCall('get_suggestions'),
  listCustomCommands: () => tauriCall('list_custom_commands'),
  listCustomSkills: () => tauriCall('list_custom_skills'),
  saveCustomSkill: (name: string, content: string) => tauriCall('save_custom_skill', { name, content }),
  deleteCustomSkill: (name: string) => tauriCall('delete_custom_skill', { name }),
  fetchGithubSkills: (repoUrl: string, path?: string | null) =>
    tauriCall('fetch_github_skills', { repoUrl, path: path || null }),
  fetchSkillContent: (url: string) => tauriCall('fetch_skill_content', { url }),
  // ─── Circuit Breaker ───
  resetCircuitBreaker: (id: number) => tauriCall('reset_circuit_breaker', { id }),
  // ─── AI Chat ───
  chatSend: (
    projectId: number,
    message: string,
    model?: string | null,
    history?: { role: string; content: string }[],
  ) =>
    tauriCall('chat_send', {
      projectId,
      message,
      model: model || null,
      mcpPort: MCP_PORT,
      history: history || null,
    }),
  // ─── Roadmap (GSD) ───
  createMilestone: (projectId: number, version: string, title: string, description?: string | null) =>
    tauriCall('create_milestone', { projectId, version, title, description: description || null }),
  updateMilestone: (id: number, version: string, title: string, description: string | null, status: string) =>
    tauriCall('update_milestone', { id, version, title, description: description || null, status }),
  deleteMilestone: (id: number) => tauriCall('delete_milestone', { id }),
  createPhase: (
    milestoneId: number,
    projectId: number,
    phaseNumber: number,
    title: string,
    description?: string | null,
    goal?: string | null,
    successCriteria?: unknown,
  ) =>
    tauriCall('create_phase', {
      milestoneId,
      projectId,
      phaseNumber,
      title,
      description: description || null,
      goal: goal || null,
      successCriteria: successCriteria || null,
    }),
  updatePhase: (
    id: number,
    title: string,
    description: string | null,
    goal: string | null,
    successCriteria: unknown,
    status: string,
  ) =>
    tauriCall('update_phase', {
      id,
      title,
      description: description || null,
      goal: goal || null,
      successCriteria: successCriteria || null,
      status,
    }),
  deletePhase: (id: number) => tauriCall('delete_phase', { id }),
  insertPhase: (
    milestoneId: number,
    projectId: number,
    afterPhaseNumber: number,
    title: string,
    description: string | null,
    goal: string | null,
    successCriteria: unknown,
  ) =>
    tauriCall('insert_phase', {
      milestoneId,
      projectId,
      afterPhaseNumber,
      title,
      description: description || null,
      goal: goal || null,
      successCriteria: successCriteria || null,
    }),
  createPlan: (
    phaseId: number,
    planNumber: number,
    title: string,
    description: string | null,
    waveIndex: number | null,
  ) =>
    tauriCall('create_plan', {
      phaseId,
      planNumber,
      title,
      description: description || null,
      waveIndex: waveIndex || null,
    }),
  deletePlan: (id: number) => tauriCall('delete_plan', { id }),
  linkTaskToPlan: (planId: number, taskId: number, checkpointType?: string | null) =>
    tauriCall('link_task_to_plan', { planId, taskId, checkpointType: checkpointType || null }),
  unlinkTaskFromPlan: (planId: number, taskId: number) => tauriCall('unlink_task_from_plan', { planId, taskId }),
  getPlanTasks: (planId: number) => tauriCall('get_plan_tasks', { planId }),
  getRoadmap: (projectId: number) => tauriCall('get_roadmap', { projectId }),
  updateSuccessCriterion: (phaseId: number, criterionIndex: number, verified: boolean) =>
    tauriCall('update_success_criterion', { phaseId, criterionIndex, verified }),
  planPhase: (projectId: number, phaseId: number, model?: string | null, effort?: string | null) =>
    tauriCall('plan_phase', { projectId, phaseId, model: model || null, effort: effort || null }),
  approvePhasePlan: (
    projectId: number,
    phaseId: number,
    planTitle: string,
    tasks: unknown,
    model?: string | null,
    dependenciesEdges?: unknown,
  ) =>
    tauriCall('approve_phase_plan', {
      projectId,
      phaseId,
      planTitle,
      tasks,
      model: model || null,
      dependenciesEdges: dependenciesEdges || null,
    }),
  executePhase: (projectId: number, phaseId: number) => tauriCall('execute_phase', { projectId, phaseId }),
  // ─── GSD Package Integration ───
  gsdCheckStatus: (projectId: number) => tauriCall('gsd_check_status', { projectId }),
  gsdHealthCheck: (projectId: number) => tauriCall('gsd_health_check', { projectId }),
  gsdListTodos: (projectId: number) => tauriCall('gsd_list_todos', { projectId }),
  gsdInstall: (projectId: number, scope?: string | null) =>
    tauriCall('gsd_install', { projectId, scope: scope || null }),
  gsdGetRoadmap: (projectId: number) => tauriCall('gsd_get_roadmap', { projectId }),
  gsdGetState: (projectId: number) => tauriCall('gsd_get_state', { projectId }),
  gsdGetProject: (projectId: number) => tauriCall('gsd_get_project', { projectId }),
  gsdGetPhaseDetails: (projectId: number) => tauriCall('gsd_get_phase_details', { projectId }),
  gsdParsePhasePlans: (projectId: number, phaseNumber: number) =>
    tauriCall('gsd_parse_phase_plans', { projectId, phaseNumber }),
  gsdCreateTasksFromPlans: (projectId: number, phaseNumber: number, phaseTitle: string, autoStart?: boolean) =>
    tauriCall('gsd_create_tasks_from_plans', {
      projectId,
      phaseNumber,
      phaseTitle,
      autoStart: autoStart ?? true,
    }),
};

export const api = {
  ...coreApi,
  ...(IS_TAURI ? tauriApi : ({} as unknown as typeof tauriApi)),
};
