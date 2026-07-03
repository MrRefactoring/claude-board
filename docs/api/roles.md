# Roles API

Reusable agent configs (name + prompt + optional model/allowed-tools/color) assignable to tasks.

## Endpoints / commands
- `GET /api/projects/{project_id}/roles` — roles for a project (`db::roles::get_by_project`; includes global roles, `project_id IS NULL`).
- Tauri command `get_roles(projectId)` — same, IPC form.
- Tauri command `get_global_roles()` — roles with no `project_id`.
- Tauri command `create_role(projectId?, name, description?, prompt?, color?, model?, allowedTools?, taskTypeAffinity?)` — `color` defaults `#6B7280`. Emits `role:created`.
- Tauri command `update_role(id, name, description?, prompt?, color?, model?, allowedTools?, taskTypeAffinity?)` — emits `role:updated`.
- Tauri command `delete_role(id)` — emits `role:deleted`. Tasks previously assigned this role keep their `role_id` reference but lose the associated prompt.
- Tauri command `get_agent_suggestions(projectId)` — recurring ad-hoc `(model, task_type)` combos used often enough to be worth saving as a role (`services::agent_recurrence::suggest`, top 4).

## Notes
- The real `Role` record has `description`, `prompt`, `color`, `model`, `allowed_tools`, `task_type_affinity` — there is no `systemPrompt` or `isGlobal` field; "global" is simply `project_id IS NULL`.
- Role mutation (`create`/`update`/`delete`) is **Tauri-only** — `services/http_api.rs` exposes just the one `GET` list route.

## Key code
- `src-tauri/src/services/http_api.rs` — `GET /api/projects/{id}/roles`
- `src-tauri/src/commands/roles.rs` — Tauri CRUD + suggestions
- `src-tauri/src/db/roles.rs` — `Role` struct
