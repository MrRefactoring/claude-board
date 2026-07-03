# Snippets API

Reusable text blocks injected into an agent's prompt context. Tauri IPC only — no HTTP route exists.

## Commands
- `get_snippets(projectId)` — all snippets for a project.
- `create_snippet(projectId, title, content)` — creates and returns the `Snippet`, emits `snippet:created`.
- `update_snippet(id, title, content, enabled)` — all three fields required (no partial update), emits `snippet:updated`.
- `delete_snippet(id)` — emits `snippet:deleted`.

## Notes
- The field is `title`, not `name`. There is no `enabled` default on create — `update_snippet` requires it explicitly on every call.
- `services/http_api.rs` defines no `/api/.../snippets` routes at all — snippet CRUD only works inside the Tauri app, unlike what a REST-style `/api/projects/:id/snippets` path might suggest.

## Key code
- `src-tauri/src/commands/snippets.rs` — Tauri commands
- `src-tauri/src/db/snippets.rs` — `Snippet` struct
