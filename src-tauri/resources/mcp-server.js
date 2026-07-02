#!/usr/bin/env node

/**
 * Claude Board MCP Server
 *
 * Exposes task management tools to Claude via the Model Context Protocol.
 * Runs as a stdio server — Claude Code spawns it as a subprocess.
 *
 * Tools: list_projects, list_tasks, create_task, update_task, change_task_status,
 *        get_task_detail, delete_task, list_task_summary
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.CLAUDE_BOARD_URL || 'http://localhost:4000';

async function api(path, options = {}) {
  // eslint-disable-next-line no-undef
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

const server = new McpServer({
  name: 'claude-board',
  version: '4.3.0',
});

// ─── list_projects ───
server.tool('list_projects', 'List all projects with task counts and stats', {}, async () => {
  const projects = await api('/api/projects/summary');
  const text = projects
    .map(
      (p) =>
        `[${p.id}] ${p.name} (${p.slug}) — ${p.total_tasks} tasks (${p.active_tasks} active, ${p.done_tasks} done, ${p.backlog_tasks} backlog)`,
    )
    .join('\n');
  return { content: [{ type: 'text', text: text || 'No projects found.' }] };
});

// ─── list_tasks ───
server.tool(
  'list_tasks',
  'List all tasks for a project. Returns task keys, titles, status, type, and model.',
  { project_id: z.number().describe('Project ID') },
  async ({ project_id }) => {
    const tasks = await api(`/api/projects/${project_id}/tasks`);
    if (tasks.length === 0) return { content: [{ type: 'text', text: 'No tasks in this project.' }] };

    const lines = tasks.map(
      (t) =>
        `[${t.task_key || '#' + t.id}] ${t.title} — status: ${t.status}, type: ${t.task_type}, model: ${t.model || 'sonnet'}${t.is_running ? ' (RUNNING)' : ''}`,
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ─── list_agents ───
server.tool(
  'list_agents',
  'List reusable agents (roles) for a project. Each has an id, a persona, an optional pinned model, and a task-type affinity. Pass its id as role_id to create_task/decompose to run a task as that agent.',
  { project_id: z.number().describe('Project ID') },
  async ({ project_id }) => {
    const roles = (await api(`/api/projects/${project_id}/roles`)) || [];
    if (roles.length === 0) return { content: [{ type: 'text', text: 'No agents defined for this project.' }] };
    const lines = roles.map(
      (r) =>
        `#${r.id} ${r.name}${r.model ? ` [${r.model}]` : ''}${r.task_type_affinity ? ` — good at: ${r.task_type_affinity}` : ''}${r.description ? ` — ${r.description}` : ''}`,
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ─── create_task ───
server.tool(
  'create_task',
  'Create a new task in a project. Use parent_task_id to create sub-tasks that are linked to a parent — the parent will automatically wait for all sub-tasks to complete.',
  {
    project_id: z.number().describe('Project ID to create the task in'),
    title: z.string().describe('Task title — clear and concise'),
    description: z.string().optional().describe('Detailed description or prompt for Claude'),
    task_type: z
      .enum(['feature', 'bugfix', 'refactor', 'docs', 'test', 'chore'])
      .optional()
      .default('feature')
      .describe('Task type'),
    priority: z.number().min(0).max(3).optional().default(0).describe('Priority: 0=none, 1=low, 2=medium, 3=high'),
    model: z.enum(['haiku', 'sonnet', 'opus']).optional().default('sonnet').describe('Claude model to use'),
    acceptance_criteria: z.string().optional().describe('Definition of done — what must be true when task completes'),
    parent_task_id: z.number().optional().describe('Parent task ID — creates a sub-task linked to the parent. The parent will wait for all sub-tasks to complete before finishing.'),
    tags: z.array(z.string()).optional().describe('Tags/labels for the task (e.g. ["backend", "security"])'),
    task_level: z
      .enum(['epic', 'story', 'task', 'subtask'])
      .optional()
      .describe('Jira-style hierarchy level. epic/story are containers that roll up from their children and are NOT executed; task/subtask are the executable leaves. Defaults to task.'),
    story_points: z.number().optional().describe('Estimation in story points'),
    role_id: z.number().optional().describe('Assign a saved agent/role (its persona, model and tools) to this task'),
    auto_pr: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Per-task PR intent: 1 = open a PR when done, 0 = do not. Omit to inherit the project setting.'),
  },
  async ({ project_id, title, description, task_type, priority, model, acceptance_criteria, parent_task_id, tags, task_level, story_points, role_id, auto_pr }) => {
    const task = await api(`/api/projects/${project_id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: description || '',
        task_type: task_type || 'feature',
        priority: priority || 0,
        model: model || 'sonnet',
        acceptance_criteria: acceptance_criteria || '',
        parent_task_id: parent_task_id || null,
        tags: tags ? JSON.stringify(tags) : '[]',
        task_level: task_level || null,
        story_points: story_points ?? null,
        role_id: role_id ?? null,
        auto_pr: auto_pr ?? null,
      }),
    });
    const parentInfo = parent_task_id ? ` (sub-task of #${parent_task_id})` : '';
    return {
      content: [
        {
          type: 'text',
          text: `Task created: ${task.task_key || '#' + task.id} — "${task.title}" (${task.task_type}, ${task.model}, priority: ${task.priority})${parentInfo}`,
        },
      ],
    };
  },
);

// ─── add_dependency ───
server.tool(
  'add_dependency',
  'Add a dependency edge so a task waits for another to finish. `task_id` only becomes ready once `depends_on_id` is done. Use this to order work in the right sequence.',
  {
    task_id: z.number().describe('The task that should wait'),
    depends_on_id: z.number().describe('The task that must complete first'),
    condition_type: z
      .enum(['always', 'on_success', 'on_failure', 'on_any'])
      .optional()
      .describe('When the dependency is satisfied. Default: always (parent must reach done/testing).'),
  },
  async ({ task_id, depends_on_id, condition_type }) => {
    await api(`/api/tasks/${task_id}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ depends_on_id, condition_type: condition_type || null }),
    });
    return { content: [{ type: 'text', text: `Task #${task_id} now depends on #${depends_on_id}.` }] };
  },
);

// ─── decompose ───
server.tool(
  'decompose',
  'Atomically create a whole hierarchy of tasks (epic → story → task → subtask) with parent links and dependency edges in a single call. Use this to break a goal into a runnable plan. Nodes are created in array order; reference hierarchy parents and dependency edges by array index. Only task/subtask leaves are executed by agents — epic/story containers roll up from their children.',
  {
    project_id: z.number().describe('Project ID to create the tasks in'),
    nodes: z
      .array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          task_type: z.enum(['feature', 'bugfix', 'refactor', 'docs', 'test', 'chore']).optional(),
          priority: z.number().min(0).max(3).optional(),
          model: z.enum(['haiku', 'sonnet', 'opus']).optional(),
          acceptance_criteria: z.string().optional(),
          task_level: z.enum(['epic', 'story', 'task', 'subtask']).optional(),
          story_points: z.number().optional(),
          role_id: z.number().optional().describe('Assign a saved agent/role'),
          tags: z.array(z.string()).optional(),
          parent: z.number().optional().describe('Index (into nodes) of this node hierarchy parent'),
        }),
      )
      .describe('The tasks to create, in order'),
    edges: z
      .array(z.tuple([z.number(), z.number()]))
      .optional()
      .describe('Dependency edges as [parentIndex, childIndex]: the child waits for the parent'),
  },
  async ({ project_id, nodes, edges }) => {
    const payload = {
      nodes: nodes.map((n) => ({
        ...n,
        tags: n.tags ? JSON.stringify(n.tags) : undefined,
      })),
      edges: edges || [],
    };
    const res = await api(`/api/projects/${project_id}/tasks/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = res.tasks || [];
    const lines = created.map((t) => `[${t.task_key || '#' + t.id}] ${t.title} (${t.task_level || 'task'})`);
    return {
      content: [{ type: 'text', text: `Created ${created.length} tasks:\n${lines.join('\n')}` }],
    };
  },
);

// ─── add_task_comment ───
server.tool(
  'add_task_comment',
  'Post a work-log comment on a task — what you did, decisions you made, or a link to a PR you opened. Leave a trail of your work so the human can follow along.',
  {
    task_id: z.number().describe('Task ID to comment on'),
    body: z.string().describe('Comment text (markdown supported)'),
    pr_url: z.string().optional().describe('Optional link to a pull request'),
  },
  async ({ task_id, body, pr_url }) => {
    await api(`/api/tasks/${task_id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, pr_url: pr_url || null, author_type: 'agent' }),
    });
    return { content: [{ type: 'text', text: `Comment posted on task #${task_id}.` }] };
  },
);

// ─── set_pr_intent ───
server.tool(
  'set_pr_intent',
  "Set whether a task should open a pull request when it finishes. Use this when the user implies they want a PR for a specific task (e.g. 'open a PR for TASK-12'). enabled=true forces a PR, false disables it; omit to reset to the project default.",
  {
    task_id: z.number().describe('Task ID'),
    enabled: z
      .boolean()
      .optional()
      .describe('true = open a PR, false = never; omit to inherit the project default'),
  },
  async ({ task_id, enabled }) => {
    await api(`/api/tasks/${task_id}/pr-intent`, {
      method: 'POST',
      body: JSON.stringify({ auto_pr: enabled === undefined ? null : enabled }),
    });
    const label = enabled === undefined ? 'inherit project default' : enabled ? 'open a PR' : 'no PR';
    return { content: [{ type: 'text', text: `Task #${task_id} PR intent: ${label}.` }] };
  },
);

// ─── update_task ───
server.tool(
  'update_task',
  'Update an existing task (title, description, type, priority, model).',
  {
    task_id: z.number().describe('Task ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    task_type: z.enum(['feature', 'bugfix', 'refactor', 'docs', 'test', 'chore']).optional().describe('New type'),
    priority: z.number().min(0).max(3).optional().describe('New priority'),
    model: z.enum(['haiku', 'sonnet', 'opus']).optional().describe('New model'),
    acceptance_criteria: z.string().optional().describe('New acceptance criteria'),
  },
  async ({ task_id, ...updates }) => {
    // Get current task to merge with updates
    const current = await api(`/api/tasks/${task_id}`);
    const data = {
      title: updates.title || current.title,
      description: updates.description !== undefined ? updates.description : current.description,
      task_type: updates.task_type || current.task_type,
      priority: updates.priority !== undefined ? updates.priority : current.priority,
      model: updates.model || current.model,
      acceptance_criteria:
        updates.acceptance_criteria !== undefined ? updates.acceptance_criteria : current.acceptance_criteria,
    };
    await api(`/api/tasks/${task_id}`, { method: 'PUT', body: JSON.stringify(data) });
    return { content: [{ type: 'text', text: `Task #${task_id} updated.` }] };
  },
);

// ─── change_task_status ───
server.tool(
  'change_task_status',
  'Move a task to a different status column (backlog, in_progress, testing, done).',
  {
    task_id: z.number().describe('Task ID'),
    status: z
      .enum(['backlog', 'in_progress', 'testing', 'done'])
      .describe('New status. WARNING: moving to in_progress will start Claude automatically.'),
  },
  async ({ task_id, status }) => {
    await api(`/api/tasks/${task_id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    const labels = { backlog: 'Backlog', in_progress: 'In Progress', testing: 'Testing', done: 'Done' };
    return { content: [{ type: 'text', text: `Task #${task_id} moved to ${labels[status]}.` }] };
  },
);

// ─── get_task_detail ───
server.tool(
  'get_task_detail',
  'Get full details of a task including commits, revisions, attachments, and usage stats.',
  { task_id: z.number().describe('Task ID') },
  async ({ task_id }) => {
    const d = await api(`/api/tasks/${task_id}/detail`);
    const lines = [
      `# ${d.task_key || '#' + d.id} — ${d.title}`,
      `Status: ${d.status} | Type: ${d.task_type} | Model: ${d.model} | Priority: ${d.priority}`,
      d.description ? `\nDescription:\n${d.description}` : '',
      d.acceptance_criteria ? `\nAcceptance Criteria:\n${d.acceptance_criteria}` : '',
      d.branch_name ? `Branch: ${d.branch_name}` : '',
      d.is_running ? '⚡ Currently running' : '',
      `\nTokens: ${(d.input_tokens || 0).toLocaleString()} in / ${(d.output_tokens || 0).toLocaleString()} out`,
      d.total_cost > 0 ? `Cost: $${d.total_cost.toFixed(4)}` : '',
      d.commits && JSON.parse(d.commits || '[]').length > 0 ? `Commits: ${JSON.parse(d.commits).join(', ')}` : '',
      d.revisions?.length > 0
        ? `\nRevisions (${d.revisions.length}):\n${d.revisions.map((r) => `  #${r.revision_number}: ${r.feedback}`).join('\n')}`
        : '',
    ].filter(Boolean);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ─── delete_task ───
server.tool(
  'delete_task',
  'Permanently delete a task. This cannot be undone.',
  { task_id: z.number().describe('Task ID to delete') },
  async ({ task_id }) => {
    await api(`/api/tasks/${task_id}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: `Task #${task_id} deleted.` }] };
  },
);

// ─── list_task_summary ───
server.tool(
  'list_task_summary',
  'Get a summary of tasks grouped by status for a project.',
  { project_id: z.number().describe('Project ID') },
  async ({ project_id }) => {
    const tasks = await api(`/api/projects/${project_id}/tasks`);
    const groups = { backlog: [], in_progress: [], testing: [], done: [] };
    tasks.forEach((t) => {
      if (groups[t.status]) groups[t.status].push(t);
    });

    const lines = [];
    for (const [status, items] of Object.entries(groups)) {
      const label = { backlog: 'Backlog', in_progress: 'In Progress', testing: 'Testing', done: 'Done' }[status];
      lines.push(`\n## ${label} (${items.length})`);
      items.forEach((t) => {
        lines.push(`  - [${t.task_key || '#' + t.id}] ${t.title} (${t.task_type}, ${t.model})`);
      });
    }
    return { content: [{ type: 'text', text: `# Project Tasks\nTotal: ${tasks.length}${lines.join('\n')}` }] };
  },
);

// ─── Start server ───
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
