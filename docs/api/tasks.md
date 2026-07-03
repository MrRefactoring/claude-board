# Tasks API

CRUD, status transitions (which drive the Claude agent lifecycle), dependencies, comments, and observability.

## Endpoints / commands — CRUD & status
- `GET /api/projects/{project_id}/tasks` — all tasks for a project.
- `POST /api/projects/{project_id}/tasks` — create; body: `title` (required), `description?`, `priority?` (default 0), `task_type?` (default `feature`), `acceptance_criteria?`, `model?` (default `sonnet`), `thinking_effort?` (default `medium`), `tags?`, `parent_task_id?`, plus AI-orchestration extras `task_level?`, `story_points?`, `role_id?`, `auto_pr?`. Emits `task:created` (and `task:updated` on the parent if `parent_task_id` set).
- `POST /api/projects/{project_id}/tasks/bulk` — atomically creates a hierarchy: body `{ nodes: [...], edges: [[parentIdx, childIdx], ...] }`; wires `parent`-index hierarchy and dependency edges in one call. Returns `{ tasks: [...] }`, `201`.
- `GET /api/tasks/{id}` / `PUT /api/tasks/{id}` / `DELETE /api/tasks/{id}` — read / partial update / delete.
- `PATCH /api/tasks/{id}/status` — body `{ status }`. Valid: `backlog | in_progress | testing | done | failed | awaiting_approval`. Rejects `in_progress` with `409` if any dependency is unmet (not `done`). Also cascades the GSD roadmap state.
- `GET /api/tasks/{id}/detail` — task + `commits` (parsed JSON), `revisions`, `attachments`.
- `GET /api/tasks/{id}/logs?limit=500` — recent agent log lines, chronological.
- `GET /api/tasks/{id}/revisions` — change-request history.
- `GET /api/projects/{project_id}/roles` — see `docs/api/roles.md`.

## Endpoints / commands — dependencies, comments, PR intent
- `POST /api/tasks/{id}/dependencies` — body `{ depends_on_id, condition_type? }` (`always | on_success | on_failure`); `{id}` depends on `{depends_on_id}`. Errors (`400`) on cycles. Emits `task:updated`.
- `GET /api/tasks/{id}/comments` / `POST /api/tasks/{id}/comments` — work-log comments; POST body `{ body, author_type?, author_name?, pr_url? }`, emits `comment:created`.
- `POST /api/tasks/{id}/pr-intent` — body `{ auto_pr: true|false|null }` (per-task override; `null` = inherit project default).

## Tauri-only commands
- `create_task` / `update_task` / `get_tasks` / `get_task` / `delete_task` / `get_task_logs` — IPC equivalents of the HTTP CRUD above (arg names camelCase, e.g. `parentTaskId`).
- `change_task_status(id, status, mcpPort)` — same validation/gating as the HTTP route, plus it actually **starts/stops the Claude agent process** (`claude::runner::start`/`stop`) and auto-creates/merges the PR on `testing`/`done`. The HTTP `PATCH .../status` route only flips DB state — it does not spawn a runner (no `mcpPort`/`AppHandle` available there).
- `stop_task(id)` / `restart_task(id, mcpPort)` / `request_changes(id, feedback, mcpPort)` — kill / restart-fresh / resume-with-feedback the agent process. `request_changes` only valid from `testing`/`done`.
- `get_task_diff(taskId)` — `git diff` across the task's commit range on its feature branch/worktree, truncated at ~200KB.
- `get_task_dependencies(taskId)` / `add_task_dependency(taskId, dependsOnId, conditionType?)` / `remove_task_dependency(taskId, dependsOnId)` — dependency graph edits (distinct from the HTTP add-dependency route above, which is what the MCP `add_task_dependency` tool uses).
- `get_execution_waves(projectId)` / `get_dependency_graph(projectId)` / `get_pipeline_status(projectId)` — DAG views: wave-grouped parallel tasks, `{ tasks, edges, waves }`, and a status/cost/bottleneck/circuit-breaker summary respectively.
- `reorder_queue(projectId, taskIds)` / `reorder_tasks(taskIds)` — set queue position / sort order from an ordered id list.
- `get_active_file_map()` / `get_agent_activity(projectId)` — live observability: file→task-ids map, and per-running-task `{ elapsedSec, tokens, cost, toolCallCount, recentTools, activeFiles, isRunning, awaitingSubtasks }` plus detected file conflicts.
- `get_task_events(taskId, limit?)` — structured `task_events` table rows: `{ id, eventType, data, timestampMs }`.
- `get_task_comments(id)` / `add_task_comment(taskId, body, authorName?)` — IPC form of comments (author fixed to `"user"`).
- `set_task_auto_pr(id, autoPr)` — IPC form of the pr-intent endpoint.

## Notes
- `client/src/lib/api.ts` defines HTTP fallback paths for `stop`/`restart`/`request-changes` (`/api/tasks/:id/stop` etc.), but **no such routes exist in `services/http_api.rs`** — agent lifecycle control (stop/restart/request-changes) is Tauri-only, as is everything under "Tauri-only commands" above.
- `set_parent_task_id` + `set_awaiting_subtasks` link sub-tasks: a parent auto-enters "awaiting sub-tasks" and completes once all children finish.

## Key code
- `src-tauri/src/services/http_api.rs` — HTTP routes
- `src-tauri/src/commands/tasks.rs` — Tauri commands + agent lifecycle wiring
- `src-tauri/src/claude/runner.rs` — process spawn/stop, PR automation
- `src-tauri/src/claude/state_machine.rs` — `TaskStatus` + valid transitions
