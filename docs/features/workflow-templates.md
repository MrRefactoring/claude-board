# Workflow Templates

Reusable, dependency-wired task chains — define a sequence of steps once, then apply it to a project to create all the tasks with dependencies already set up.

## Behavior
- A template stores `steps` as a JSON array (`title`, `description`, `task_type`, `model`, `acceptance_criteria`, `depends_on_steps` (indices into the array), `condition_type`).
- Applying a template (`apply_workflow_template`) creates all step tasks immediately (defaults: `task_type` "feature", `model` "sonnet", `thinking_effort` "medium" — the effort is not configurable per step), then wires a dependency edge for each `depends_on_steps` index using the step's `condition_type`.
- After creation, `task:created` fires for each task and the queue is nudged (`start_next_queued`) in case auto-queue is on for the project — actual ordering/gating is enforced by the normal dependency system, not by the template application step itself.
- No dedicated UI yet — templates are created/applied via the Tauri API (`api.createWorkflowTemplate`, `api.applyWorkflowTemplate`).

## Step Fields
- `depends_on_steps` — indices of steps this step depends on
- `condition_type` — `always` (default) / `on_success` / `on_failure` / `on_any`, evaluated the same way as regular task dependencies: `always`/`on_success` require the parent Done, `on_failure` requires the parent Failed, `on_any` requires the parent finished either way

## Key code
- `src-tauri/src/db/workflows.rs` — `WorkflowTemplate`/`WorkflowStep`, `workflow_templates` table
- `src-tauri/src/commands/workflows.rs` — `apply_workflow_template` (task creation + dependency wiring)
- `src-tauri/src/db/dependencies.rs` — condition_type evaluation shared with regular task dependencies
