# Pipeline & Auto-Queue

DAG-aware task auto-queue with crash recovery and periodic polling. Enable per project; the queue starts ready backlog tasks up to a concurrency limit and reacts to completions/failures without manual intervention.

## Behavior

- **Trigger points:** app startup (`startup_recovery`), a background poll thread every 15s, and immediately on task completion/failure (event-driven, not just polling).
- **Slot counting uses real process state, not DB status:** `slots = max_concurrent - count(tasks that are InProgress AND have a live/starting process)`. A task whose process crashed doesn't block a slot even if its DB row still says `in_progress`.
- **Readiness (`dependencies::get_ready_tasks`):** a backlog task is ready when: it is not an `epic`/`story` container, its `retry_count` is within the project's retry limit, its `retry_after` timestamp (if any) has passed, and all of its dependencies are met per their `condition_type`.
- **Dependency condition types:** `always` / `on_success` (default) — blocker must be `done`; `on_failure` — blocker must be `failed`; `on_any` — blocker must be `done` or `failed`.
- **Selection order for ready tasks** (`ORDER BY` in `get_ready_tasks`): 1) number of dependents blocked by the task (critical path) descending, 2) `priority` descending, 3) `queue_position` ascending, 4) `id` ascending (FIFO). Critical-path count is the primary sort key, not a tiebreaker.
- **Priority values:** High = 3, Medium = 2, Low = 1, None = 0.
- **Sub-task awaiting:** when a task spawns sub-tasks, its process exits but the task stays `in_progress` with `awaiting_subtasks=1`. Sub-tasks run and queue normally. Once all children reach `done`/`testing`, the parent auto-rolls up: container (`epic`/`story`) → `done`; awaiting leaf → `testing`. Roll-up recurses up the parent chain, one DB transaction per level (idempotent under concurrent completions).
- **Crash recovery on startup:** orphaned `in_progress` tasks (no live process) reset to `backlog`; tasks left in `testing` re-trigger auto-test if `auto_test` is enabled on the project; auto-queue is then kicked immediately for every project with it enabled.
- **Retries and circuit breaker:** see `docs/features/retry-backoff.md` and `docs/features/circuit-breaker.md`.

## Settings

- `auto_queue` — enables the queue for a project.
- `max_concurrent` — concurrent running-task cap. UI offers quick picks 1/2/3/5/10 plus a free-form field, range **1–50**.
- `circuit_breaker_threshold` — consecutive failures before the queue pauses (0 = disabled); see circuit-breaker doc.

## Edge cases

- Dependencies always override manual queue position — a task at position #1 still waits for unmet parents.
- `epic`/`story` container tasks are never picked up directly by the queue; they only complete via child roll-up.
- A failed task with `retry_count` beyond the project's `max_retries` is excluded from `get_ready_tasks` even if manually moved back to backlog with a stale count (see retry-backoff doc for the reset rule).

## Key code

- `src-tauri/src/services/queue.rs` — `startup_recovery` (crash recovery + poll thread), `start_next_queued` (slot counting + start), `on_task_completed`, `roll_up_parent`, `handle_task_failure`.
- `src-tauri/src/db/dependencies.rs` — `get_ready_tasks` (readiness + ordering SQL), `dep_met_predicate` (condition-type semantics), `get_execution_waves` (wave grouping for preview/DAG visualization).
- `src-tauri/src/db/tasks.rs` — `get_auto_queue_project_ids`, `recover_orphaned_tasks`, `awaiting_subtasks` column.
- `src-tauri/src/db/projects.rs` — `max_concurrent`, `circuit_breaker_threshold` fields and setters.
- `client/src/features/projects/AutomationSection.tsx` — Auto-Queue toggle and Max Concurrent control.
