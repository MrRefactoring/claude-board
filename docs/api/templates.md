# Templates API

Prompt templates for pre-filling new tasks. Tauri IPC only — no HTTP route exists.

## Commands
- `get_templates(projectId)` — all templates for a project.
- `create_template(projectId, name, description?, template, variables?, taskType?, model?, thinkingEffort?)` — `taskType` defaults `feature`, `model` defaults `sonnet`, `thinkingEffort` defaults `medium`. Emits `template:created`.
- `update_template(id, name, description?, template, variables?, taskType?, model?, thinkingEffort?)` — same shape, emits `template:updated`.
- `delete_template(id)` — emits `template:deleted`.

## Notes
- The template body field is `template`, not `content`; there's also a separate `variables` field (not templated substitution done server-side — variable resolution, if any, happens client-side).
- `services/http_api.rs` defines no `/api/.../templates` routes — despite `client/src/lib/api.ts` shaping calls as `GET/POST /api/projects/:id/templates` and `PUT/DELETE /api/templates/:id`, those only resolve in the Tauri app.

## Key code
- `src-tauri/src/commands/templates.rs` — Tauri commands
- `src-tauri/src/db/templates.rs` — `Template` struct
