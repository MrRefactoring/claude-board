# Webhooks API

Outbound notifications (Slack/Discord/custom) fired on task lifecycle events. Tauri IPC only — no HTTP route exists.

## Commands
- `get_webhooks(projectId)` — all webhooks for a project.
- `create_webhook(projectId, name, url, platform?, events?)` — `platform` and `events` (list of event-type strings to filter on; empty = all) are optional. Emits `webhook:created`.
- `update_webhook(id, name, url, platform?, events?, enabled?)` — `enabled` defaults `true`. Emits `webhook:updated`.
- `delete_webhook(id)` — emits `webhook:deleted`.
- `test_webhook(id)` — POSTs a synthetic `{ event: "test", message, timestamp }` payload to the webhook URL, returns `"Status: <code>"`.

## Notes
- `create_webhook` requires `name` — the record isn't just `platform`/`url`/`events`.
- Delivery (`services::webhook::fire`) is called from the task runner and queue, not from a generic event bus. The real `event_type` strings dispatched (and matchable in a webhook's `events` filter) are: `task_started`, `task_completed`, `task_failed`, `task_timeout`, `test_started`, `test_passed`, `test_failed`, `revision_requested`, `queue_auto_started`, `circuit_breaker_activated` — **not** colon-namespaced names like `task:completed`.
- Payload shape depends on `platform`: `discord` → Discord embed (color-coded by event type), `slack` → Slack `blocks` section, anything else (`custom`/unset) → `{ event, message, timestamp, metadata }`.
- No HTTP route exists under `/api/.../webhooks` — CRUD and test-send are Tauri-only.

## Key code
- `src-tauri/src/commands/webhooks.rs` — Tauri CRUD + `test_webhook`
- `src-tauri/src/services/webhook.rs` — `fire`/`dispatch`, per-platform payload building
- `src-tauri/src/claude/runner.rs`, `src-tauri/src/commands/tasks.rs`, `src-tauri/src/services/queue.rs` — call sites for `webhook::fire`
