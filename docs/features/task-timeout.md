# Task Timeout

Per-project limit on how long a task's agent process may run before it's automatically killed — guards against rate-limit stalls and infinite reasoning/editing loops.

## Behavior
- Configured per project as `task_timeout_minutes` (Project Settings > Automation).
- The queue poll thread (runs every 15 seconds) calls `enforce_timeouts` before dispatching new queued tasks. For each active process, it checks elapsed time against the project's timeout.
- On timeout: the process is killed (`SIGTERM` on macOS/Linux, `taskkill /T /F` on Windows), an error log line is added to the task, copied attachment files in the worktree are cleaned up, and a `task_timeout` webhook fires.
- If the task is still `in_progress` (not moved manually), it goes through the normal failure/retry path (`queue::handle_task_failure`) — same as any other process failure, so it consumes a retry attempt and can end in Failed once retries are exhausted.

## Settings
- `task_timeout_minutes` (project) — `0` (default) disables the timeout; any positive value is minutes until auto-kill.

## Edge cases
- A timed-out task is treated identically to a crashed/failed task by the retry system — it is not a separate terminal state.

## Key code
- `src-tauri/src/claude/runner.rs` — `enforce_timeouts`, `kill_process`
- `src-tauri/src/services/queue.rs` — 15s poll loop calling `enforce_timeouts` before `start_next_queued`
- `src-tauri/src/db/projects.rs` — `task_timeout_minutes` field, `update_timeout`
