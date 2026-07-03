# Roles

Reusable agent personas — a name plus a system prompt (and optionally a pinned model / tool allowlist) that can be assigned to a task so Claude's instructions are specialized for that task.

## Behavior
- Managed from the Roles modal (project menu): create/edit/delete. Fields: `name`, `description`, `prompt`, `color`, `model`, `allowed_tools`, `task_type_affinity`.
- A task optionally carries a `role_id`. When set, the assigned role's prompt is prepended to Claude's instructions as a `## Role: <name>` section, ahead of prompt templates, revisions, and snippets (`build_prompt` in `src-tauri/src/claude/prompt.rs`). A role with an empty prompt contributes nothing.
- Role `model` is a fallback, not an override: resolution order is `task.model → role.model → "sonnet"`.
- Role `allowed_tools` (non-empty) overrides the project default: resolution order is `role.allowed_tools → project.allowed_tools → "" (all tools)`.
- `task_type_affinity` is a free-text tag (e.g. "bugfix, refactor") shown as a badge on the role in the list UI. It is stored and displayed only — no scheduling or assignment logic reads it.
- Reusable-agent suggestions: `get_agent_suggestions` scans a project's ad-hoc tasks (no `role_id`) for repeated `(model, task_type)` combinations not already covered by an existing role's pinned model, and surfaces "save as role" suggestions (`services/agent_recurrence.rs`).

## Settings
- `role_id` (task field, nullable) — assigns a role to a task; no FK constraint, so it is not cleared when the role is deleted (see Edge cases).
- `project_id` (role field, nullable) — `NULL` = global role (available to every project); non-null = project-scoped role. Project-scoped roles are listed alongside global ones for that project.
- `roles.model` — pinned model; only used when the task itself has no explicit model.
- `roles.allowed_tools` — comma-separated tool allowlist; blank means inherit the project default.
- `roles.task_type_affinity` — descriptive only, no runtime effect.

## Edge cases
- Deleting a role does not null out `role_id` on tasks referencing it (no cascading FK). A dangling `role_id` simply fails the lookup at task-run time and the task runs with no role.
- A role's `prompt` may be empty/absent — the "## Role:" section is only emitted if the prompt is non-empty.

## Key code
- `src-tauri/src/db/roles.rs` — `Role` model, CRUD
- `src-tauri/src/commands/roles.rs` — `get_roles`, `get_global_roles`, `create_role`, `update_role`, `delete_role`, `get_agent_suggestions`
- `src-tauri/src/claude/prompt.rs` — `build_prompt`, prepends the role's prompt
- `src-tauri/src/claude/runner.rs` — resolves `role_id` to a `Role`, applies model/tool precedence
- `src-tauri/src/services/agent_recurrence.rs` — recurring ad-hoc config → role suggestions
- `client/src/features/roles/RolesModal.tsx` — role CRUD UI, global/project toggle
- `client/src/features/tasks/TaskOptionsPanel.tsx` — role picker on a task
