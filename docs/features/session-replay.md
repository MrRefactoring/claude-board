# Session Replay

Timeline-based playback of every event recorded during a task's execution — tool calls, results, usage, and system messages — for debugging and post-hoc review.

## Behavior
- Opened from the **Session Replay** button in the Task Detail modal; renders at the bottom of the modal.
- On mount, fetches all events for the task via `getTaskEvents` (Tauri-only; no-op in web mode) and renders them on a scrubbable timeline plus a scrollable event list.
- Play/Pause auto-advances through events at a fixed 300ms interval; clicking the timeline bar jumps to the nearest event by timestamp; clicking an event marker or list row selects it.
- Selecting an event shows its full JSON `data` payload (tool name, input, output preview, duration, etc.) in the detail pane.
- Elapsed time is computed relative to the first event's timestamp.

## Event Types
Color/icon coding by `eventType`:
- `tool_call` — blue, Claude invoked a tool
- `tool_result` — emerald, result returned from tool execution
- `usage_final` — amber, final token/cost summary
- `system` — slate, system messages
- `rate_limit` — red, rate limit events

## Edge cases
- No events recorded → shows an empty state, no timeline.
- Unrecognized `eventType` falls back to `tool_call` styling.

## Key code
- `src-tauri/src/claude/events.rs` — writes rows into `task_events` (`event_type`, `event_data`, `timestamp_ms`)
- `src-tauri/src/db/schema.rs` — `task_events` table definition
- `src-tauri/src/commands/tasks.rs` — `get_task_events` command
- `client/src/features/replay/SessionReplay.tsx` — timeline, playback, event detail UI
- `client/src/features/tasks/TaskDetailModal.tsx` — hosts the Session Replay panel
