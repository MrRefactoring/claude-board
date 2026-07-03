# Realtime Events

Typed event bus shared by the Tauri desktop shell (native events) and the web fallback (Socket.IO), keyed by name in `client/src/lib/events.ts` (`AppEventMap`).

## How it's emitted
- Tauri command handlers call `app.emit(name, payload)` directly.
- Code without an `AppHandle` (e.g. the Axum HTTP handlers used by the MCP sidecar) goes through `services::events::emit(name, payload)`, a global bridge that stashes the `AppHandle` at startup (`services/events.rs`) and no-ops if no Tauri shell is attached.
- Listen on the frontend via `lib/tauriEvents.ts` (Tauri) or `lib/socket.ts` (web); both are typed against `AppEventMap`.

## Task events
- `task:created` — payload: full `Task`.
- `task:updated` — payload: `Partial<Task> & { id }`.
- `task:deleted` — `{ id }`.
- `task:log` — streamed agent output: `{ taskId, message, logType, meta? }`. `logType` ∈ `claude | tool | system | error | success | info`.
- `task:usage` — `{ taskId, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_tokens, total_cost? }` (cost only on the final usage event).
- `task:attachments` — `{ taskId, attachments: Attachment[] }` (full list, after an upload).
- `task:attachmentDeleted` — `{ taskId, id }`.
- `task:test_started` — `{ taskId, model }` (auto-test run begins).
- `task:test_completed` — `{ taskId, verdict, summary?, autoRevision?, maxRevisionsReached? }`. `verdict` ∈ `approve | reject | error | skipped | unknown`.
- `comment:created` — `{ taskId, comment: TaskComment }`.

## Agent / process events
- `claude:finished` — `{ taskId, exitCode }` (Claude process exited).
- `claude:limits` — `{ rateLimitType, status, resets_at, overageStatus, isUsingOverage }`.
- `agent:file_conflict` — emitted on a Write/Edit tool call when another task is already touching the same file: `{ taskId, conflictingTaskId, filePath, toolName }`.
- `chat:activity` — Tauri-only, compact AI-chat activity log: `{ kind, label }`.

## Project / CRUD events
- `project:created` / `project:updated` — full `Project`. `project:deleted` — `{ id }`.
- `project:circuit_breaker` — `{ projectId, active }`.
- `snippet:created` / `snippet:updated` / `snippet:deleted` — `Snippet` / `Snippet` / `{ id }`.
- `template:created` / `template:updated` / `template:deleted` — `Template` / `Template` / `{ id }`.
- `role:created` / `role:updated` / `role:deleted` — `Role` / `Role` / `{ id }`.
- `webhook:created` / `webhook:updated` / `webhook:deleted` — `Webhook` / `Webhook` / `{ id }`.

## Planning events (Tauri-only)
`plan:started`, `plan:phase`, `plan:progress`, `plan:log`, `plan:stats`, `plan:completed`, `plan:cancelled` — see `docs/api/planning.md` for payload shapes. Emitted directly via `app.emit` from `commands/planning.rs`, not through the shared `services::events` bridge, and not in the Socket.IO fallback list in `socket.ts`.

## Other
- `gsd:installing` / `gsd:installed` / `gsd:install_failed`, `roadmap:updated`, `scan:started` / `scan:stats` / `scan:progress` / `scan:completed` — roadmap/GSD and codebase-scan progress events (see `docs/api/claude-manager.md`).
- `menu:preferences`, `update:available`, `update:ready` — desktop-shell only, not part of the Socket.IO event set.

> **Note:** Filter by `taskId` / `projectId` on the frontend — events are broadcast globally, not scoped per subscriber.

## Key code
- `client/src/lib/events.ts` — `AppEventMap` (source of truth for payload types)
- `src-tauri/src/services/events.rs` — cross-context emit bridge
- `src-tauri/src/claude/events.rs`, `src-tauri/src/claude/runner.rs` — task/agent event emission
