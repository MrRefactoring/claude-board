# Settings API

Application-wide settings. Two surfaces exist with different field coverage: the HTTP bridge (used by the MCP sidecar / web fallback) and the fuller Tauri command (used by the desktop Settings UI).

## Endpoints / commands
- `GET /api/settings` — returns the full `AppSettings` row (`settings::get`).
- `PUT /api/settings` — accepts a partial JSON body; only recognizes and updates: `confirm_before_delete`, `default_model`, `default_effort`, `language`, `auto_open_terminal`, `sound_enabled`, `chat_bypass_permissions`. Returns the full updated settings object.
- Tauri command `get_app_settings()` — same base settings, plus syncs `launch_at_startup` with the OS autostart plugin state on read.
- Tauri command `update_app_settings(data)` — superset of the HTTP fields: also `launch_at_startup` (toggles OS autostart), `minimize_to_tray`, `notify_task_completed`, `notify_task_failed`, `notify_task_started`, `notify_revision_requested`, `notify_queue_started`.

## Notes
- The HTTP `PUT /api/settings` body uses snake_case keys directly (`default_model`, not `defaultModel`); the Tauri command's `data` argument uses the same snake_case keys internally.
- Fields not present in a partial update are left unchanged (both surfaces).
- Notification-toggle fields and `launch_at_startup`/`minimize_to_tray` are Tauri-only — not reachable over `/api/settings`.

## Key code
- `src-tauri/src/services/http_api.rs` — `GET`/`PUT /api/settings`
- `src-tauri/src/commands/settings.rs` — Tauri `get_app_settings` / `update_app_settings`
- `src-tauri/src/db/settings.rs` — `AppSettings` struct + persistence
