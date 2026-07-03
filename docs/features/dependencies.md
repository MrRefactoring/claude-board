# Task Dependencies

DAG-based ordering between tasks: a task only becomes eligible to run once its dependencies are satisfied. Supports conditional edges (success/failure branching), cycle prevention, and sub-task spawning with parent rollup.

## Behavior

- Add a dependency two ways:
  1. Task Options panel (`DependencySelector`) — search and pick a parent/child task. No condition control here; always creates an `always` edge.
  2. Task Detail modal → dependency tab (`TaskDependenciesTab`) — same, "always" only, and **only while the task is in `backlog`** (add/remove buttons are hidden once a task has started).
  3. Orchestration Graph view (`DependencyGraph`) — Shift+drag from one node to another to create an edge.
- Setting a non-default `condition_type` (`on_success`, `on_failure`, `on_any`) is only possible through the API/MCP `add_dependency` call — there is no UI control for it yet.
- Self-dependency and cycles are rejected server-side: `add_dependency` walks ancestors of the proposed parent via DFS and errors if the dependent task would become reachable (`detect_cycle` in `src-tauri/src/db/dependencies.rs`).

## Conditional dependencies

`condition_type` on a `task_dependencies` row, one of:

| Condition | Dependency met when |
|-----------|----------|
| `always` (default) | parent status = `done` |
| `on_success` | parent status = `done` |
| `on_failure` | parent status = `failed` |
| `on_any` | parent status = `done` or `failed` |

> **Note:** A parent in `testing` does **not** satisfy `always`/`on_success` — only `done` does. This is intentional (see `dep_met_predicate` in `src-tauri/src/db/dependencies.rs`): the parent's PR merges into the base branch at `done`, not `testing`, so a child started earlier would branch off a base missing the parent's code. The in-app MCP tool description for `add_dependency` currently says "done/testing", which does not match this behavior.

## Sub-task spawning

1. A running agent calls the MCP `create_task` tool with `parent_task_id` set to its own task ID.
2. The new task is linked via `tasks.parent_task_id` and created in `backlog`; the parent gets `awaiting_subtasks = 1`.
3. The parent does **not** move to a distinct status for this — it stays in whatever status it's in (typically `in_progress`) with the `awaiting_subtasks` flag set.
4. When all of a parent's direct sub-tasks reach `done`/`testing`, `roll_up_parent` (`src-tauri/src/services/queue.rs`) resolves the parent: container levels (`epic`/`story`) move to `done`; a leaf task that was awaiting sub-tasks moves to `testing`. Rollup walks up the `parent_task_id` chain, so grandparents resolve too.

## Cycle detection

DFS from the proposed `depends_on_id`, walking existing parent edges; if the dependent task is reachable, the edge is rejected with a validation error. A task cannot depend on itself.

## Ready-task selection

`get_ready_tasks` (used by the queue) pulls `backlog` tasks where: `task_level` is not `epic`/`story`, `retry_count` is within the project's `max_retries`, any `retry_after` backoff has elapsed, and every parent dependency's condition is met. `get_execution_waves` groups pending (`backlog`/`in_progress`) tasks into waves by dependency depth, treating `done`/`testing` tasks as already resolved.

## API

Client wrappers (`client/src/lib/api.ts`) over Tauri commands (`src-tauri/src/commands/tasks.rs`):

- `addDependency(taskId, dependsOnId, conditionType?)` → `add_task_dependency`
- `removeDependency(taskId, dependsOnId)` → `remove_task_dependency`
- `getTaskDependencies(taskId)` → `get_task_dependencies` — `{ parents, children }`
- `getDependencyGraph(projectId)` → `get_dependency_graph` — `{ tasks, edges: [{from, to, conditionType}], waves }`
- `getExecutionWaves(projectId)` → `get_execution_waves`

MCP tool: `add_dependency(task_id, depends_on_id, condition_type?)` in `src-tauri/resources/mcp-server.js`.

## Key code

- `src-tauri/src/db/dependencies.rs` — edges, `dep_met_predicate`, cycle detection, `get_ready_tasks`, `get_execution_waves`, `get_graph_data`
- `src-tauri/src/commands/tasks.rs` — `add_task_dependency`, `remove_task_dependency`, `get_task_dependencies`, `get_dependency_graph`, `get_execution_waves`
- `src-tauri/src/services/queue.rs` — `roll_up_parent` (sub-task completion rollup)
- `src-tauri/src/db/schema.rs` — `parent_task_id`, `awaiting_subtasks` columns
- `src-tauri/resources/mcp-server.js` — `create_task` (`parent_task_id`), `add_dependency` MCP tools
- `client/src/features/tasks/DependencySelector.tsx` — dependency editor in Task Options panel
- `client/src/features/tasks/TaskDependenciesTab.tsx` — dependency editor in Task Detail modal
- `client/src/features/board/DependencyGraph.tsx` — Orchestration Graph view, Shift+drag edge creation
