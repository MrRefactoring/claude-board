# Circuit Breaker

Pauses a project's task queue after too many consecutive permanent task failures, so a systemic problem doesn't burn through retries and cost unattended.

## Behavior
1. A task permanently fails (retries exhausted, status → `failed`): if `circuit_breaker_threshold` > 0, the project's `consecutive_failures` counter increments.
2. If `consecutive_failures >= circuit_breaker_threshold`, the breaker activates: `circuit_breaker_active` is set, a `project:circuit_breaker` event is emitted, and a `circuit_breaker_activated` webhook fires.
3. While active, the queue refuses to start any new task for the project (`start_next_queued` returns early). Tasks already running are unaffected.
4. Any task reaching `done` resets `consecutive_failures` to 0 — this does not by itself deactivate an already-active breaker.
5. Manual reset (Reset button, or the `reset_circuit_breaker` command) deactivates the breaker and zeroes the counter, letting the queue resume.

## Settings
- `circuit_breaker_threshold` (Engine tab) — consecutive failures required to activate. `0` disables the feature entirely.

## Edge cases
- Threshold `0` → failures are never counted and the breaker never activates.
- The breaker only gates new task starts; it does not cancel or pause tasks already in progress.

## Key code
- `src-tauri/src/services/queue.rs` — `handle_task_failure` (counting/activation), `start_next_queued` (queue gate), `on_task_completed` (counter reset).
- `src-tauri/src/db/projects.rs` — `increment_consecutive_failures`, `activate_circuit_breaker`, `deactivate_circuit_breaker`, `reset_consecutive_failures`.
- `src-tauri/src/commands/projects.rs` — `reset_circuit_breaker` command.
- `client/src/features/projects/EngineSection.tsx` — threshold setting UI.
- `client/src/features/board/PipelineStats.tsx` — active-breaker alert banner and Reset action.
