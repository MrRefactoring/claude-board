# Retry & Backoff

Automatic retry of failed tasks with exponential backoff and jitter, so transient failures and rate limits get a delay before the queue retries them.

## Behavior

- On task failure, `handle_task_failure` compares `task.retry_count` against `EngineConfig.max_retries` (resolved per project).
  - If `retry_count < max_retries`: increments `retry_count`, moves the task to `backlog`, computes a backoff delay, stamps `retry_after = now + delay`, and logs it. The queue poller/`get_ready_tasks` skips the task until `retry_after` passes, then it's picked up like any other ready task.
  - If exhausted: increments `retry_count` once more, moves the task to `failed` permanently, and feeds the project's circuit-breaker consecutive-failure counter.
- **Delay formula:** `delay = min(retry_base_delay_secs * 2^retry_count, retry_max_delay_secs)`, then ±20% jitter is applied and the result is floored at 10s. Defaults: base 30s, max 600s (matches the doc's schedule: 1st ~30s, 2nd ~60s, 3rd ~120s, 4th ~240s, 5th+ capped at 600s).
- Both `retry_base_delay_secs` and `retry_max_delay_secs` are **per-project configurable**, not fixed constants — see Settings.

## Settings

Project settings (Engine section):

| Setting | Field | Default | Range |
|---|---|---|---|
| Max Retries | `max_retries` | 2 (0 in form = "use default") | 0–10 |
| Retry Base Delay | `retry_base_delay_secs` | 30s | 0–3600 |
| Retry Max Delay | `retry_max_delay_secs` | 600s | 0–7200 |

`0`/unset for any of these means "use the built-in default," per `EngineConfig::resolve`. Setting Max Retries to 0 disables retrying — failed tasks go straight to `failed`.

## Edge cases

- Manually moving a task to `backlog`, or to `in_progress` from `failed`, resets `retry_count` to 0 and clears `retry_after` (`reset_retry_count`) — matches the doc's manual-reset behavior.
- Auto-test rejection follows a separate auto-revision cycle (`max_auto_revisions`, default 3) before a task ever reaches the retry/backoff path described here.
- Circuit breaker: once `max_retries` is exhausted, the project's consecutive-failure counter increments; if it reaches `circuit_breaker_threshold`, the queue pauses (see `docs/features/circuit-breaker.md`).

## Key code

- `src-tauri/src/services/queue.rs` — `handle_task_failure` (retry vs. permanent-fail branch, circuit-breaker hook).
- `src-tauri/src/claude/state_machine.rs` — `EngineConfig` (defaults, `from_project`, `retry_delay` formula).
- `src-tauri/src/db/dependencies.rs` — `get_ready_tasks` filters on `retry_count`/`retry_after`.
- `src-tauri/src/db/tasks.rs` — `increment_retry`, `set_retry_after`, `reset_retry_count`.
- `src-tauri/src/commands/tasks.rs` — resets `retry_count` on manual status change to `backlog`/`in_progress`.
- `client/src/features/projects/EngineSection.tsx` — Retry Base/Max Delay fields.
- `client/src/features/projects/AutomationSection.tsx` — Max Retries field.
