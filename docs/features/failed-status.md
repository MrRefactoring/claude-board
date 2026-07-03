# Failed Status

Terminal task status (`failed`) for tasks that exhausted retries or were manually marked as failed. Recoverable by moving back to `backlog`/`in_progress`, which resets the retry counter.

## Behavior

`failed` is reached one of two ways:

1. **Automatic, via `handle_task_failure`** (`src-tauri/src/services/queue.rs`), triggered when the Claude process exits non-zero/crashes or a task times out (`src-tauri/src/claude/runner.rs`):
   - If `retry_count < project.max_retries`: increment `retry_count`, move the task back to `backlog`, and set `retry_after` using exponential backoff with jitter (`EngineConfig::retry_delay`).
   - Once `retry_count >= max_retries`: increment `retry_count` once more and move the task to `failed` permanently. The task will not auto-start again; it requires a manual status move.
2. **Manual**, via `change_task_status`: a user can move a task straight to `failed` from `backlog` (cancel a queued task), `testing` (mark as failed), or `awaiting_approval` (reject permanently).

Each permanent failure also increments the project's `consecutive_failures` counter; if it reaches `circuit_breaker_threshold`, the circuit breaker activates and the queue stops auto-starting new tasks for that project (`project:circuit_breaker` event, `circuit_breaker_activated` webhook).

## States & transitions

Status enum: `backlog`, `in_progress`, `testing`, `done`, `failed`, `awaiting_approval` (`TaskStatus` in `src-tauri/src/claude/state_machine.rs`). `failed` and `done` are the only terminal states (`is_terminal`).

Valid transitions into `failed`: `in_progress → failed`, `testing → failed`, `backlog → failed`, `awaiting_approval → failed`.

Valid transitions out of `failed`: `failed → backlog`, `failed → in_progress`. Both reset `retry_count` to 0 and clear `retry_after` (`reset_retry_count`).

## Settings

Project-level, resolved via `EngineConfig::from_project` (0/unset falls back to the default):

- `max_retries` — retry attempts before permanent failure (default 2)
- `retry_base_delay_secs` / `retry_max_delay_secs` — exponential backoff bounds (defaults 30s / 600s), applied with ±20% jitter
- `circuit_breaker_threshold` — consecutive permanent failures before the queue pauses for the project (0 = disabled)

## UI indicators

- Board (Kanban): dedicated red **Failed** column (`COLUMNS` in `client/src/lib/constants.ts`)
- List view: red status dot (`ListView.tsx`)
- Orchestration Graph: red-filled, red-stroke node (`DependencyGraph.tsx` `STATUS_COLORS.failed`)
- Timeline view: red bar segment (`TimelineView.tsx`)
- Pipeline view: collapsible red "Failed" section

## Edge cases

- Reopening a failed task (to `backlog` or `in_progress`) always resets `retry_count` to 0 — there's no way to retry without resetting the counter.
- An `on_failure` dependency (see `dependencies.md`) is satisfied by `status = 'failed'` regardless of whether the parent got there via retry exhaustion or a manual fail/cancel.
- Timeout-triggered failure only calls `handle_task_failure` if the task is still `in_progress` when the timeout fires — if the user already moved it elsewhere, the timeout is a no-op for retry purposes.

## Key code

- `src-tauri/src/claude/state_machine.rs` — `TaskStatus` enum, `is_valid_transition`, `EngineConfig` (retry/backoff)
- `src-tauri/src/services/queue.rs` — `handle_task_failure` (retry vs. permanent fail), circuit breaker increment/activation
- `src-tauri/src/claude/runner.rs` — calls `handle_task_failure` on process crash/non-zero exit and on task timeout
- `src-tauri/src/commands/tasks.rs` — `change_task_status` (manual transitions, retry reset on leaving `failed`)
- `src-tauri/src/db/tasks.rs` — `retry_count`/`retry_after` columns, `increment_retry`, `reset_retry_count`, `set_retry_after`
- `client/src/lib/constants.ts` — `COLUMNS` (board column labels/colors)
- `client/src/features/board/PipelineView.tsx`, `ListView.tsx`, `TimelineView.tsx`, `DependencyGraph.tsx` — status visualization
