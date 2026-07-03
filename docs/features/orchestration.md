# Orchestration View

Mission control for multi-agent parallel execution: visualizes the task DAG, execution timeline, and live agent activity, kept fresh via realtime events instead of polling.

## Behavior
- Four view modes toggled top-right (`OrchestrationView.tsx`): **Graph**, **Timeline**, **Live**, **Battle**.
- **Graph** (`DependencyGraph.tsx`) — SVG DAG. Nodes colored by status: backlog gray, in_progress amber, testing purple, done green, failed red. Edges colored/dashed by `condition_type`: `always` (gray solid), `on_success` (green dashed), `on_failure` (red dashed). Hover highlights a node's edges; click opens task detail; shift+drag between nodes creates a dependency edge; plain drag repositions a node and persists its position.
- **Timeline** (`TimelineView.tsx`) — Gantt-style bars grouped by wave, auto-scaling time axis, "NOW" marker, dependency overlays.
- **Live** (`ObservabilityPanel.tsx`) — per-agent activity cards (task, model, elapsed time, tool-call count, tokens, cost, active files), a file heatmap, and a chronological tool-call feed with pause.
- **Battle** (`BattleView.tsx`) — gamified arena view (avatar sprites, HP bars driven by token usage, conflict duels); separate feature, not detailed here.
- View auto-refreshes on the `task:updated` event (status changes, dependency edits, new tasks) — no polling.

## Wave execution & dispatch
- `db/dependencies.rs::get_execution_waves` groups tasks into waves: wave 0 = no unmet dependencies, wave N = deps satisfied by waves `0..N-1`. Used for the Graph/Timeline visualization.
- Actual runtime dispatch does **not** walk waves directly: `services/queue.rs::start_next_queued` repeatedly pulls `dependencies::get_ready_tasks` (DAG-ready backlog tasks) and starts up to the number of free concurrency slots.

## Agent identity
- Each started task gets a random name from a themed pool (`Nova`, `Atlas`, `Spark`, `Echo`, ... — `claude/runner.rs::AGENT_NAMES`, 30 names) via `assign_agent_name`, persisted on `tasks.agent_name`. UI displays "Agent \<name\>", falling back to `Agent <id>` if unset.

## File conflict detection
- `claude/events.rs` emits `agent:file_conflict` when multiple agents touch the same file. `ObservabilityPanel.tsx` listens for it (the event is cast at the call site since it isn't part of the shared `AppEventMap`) and highlights conflicts in the Live heatmap and on agent cards.

## Settings
Project-level (`db/projects.rs` / `schema.rs`):
- `max_concurrent` (int, default 1) — concurrency cap enforced in `queue::start_next_queued`; counts only tasks whose process is actually alive (`runner::is_running`/`is_starting`), not just DB status
- `auto_queue` (bool) — must be on for `start_next_queued` to do anything
- `circuit_breaker_threshold` / `circuit_breaker_active` / `consecutive_failures` — after N consecutive task failures the queue auto-pauses (`activate_circuit_breaker`) until manually reset

## Edge cases
- An edge with no `condition_type` defaults to `"always"`.
- On failure, a task retries up to `EngineConfig.max_retries` with backoff (`retry_delay`) before permanently moving to `failed`; permanent failures increment the circuit-breaker counter.
- A background queue-poll thread runs every 15s, calling `runner::enforce_timeouts` before each dispatch pass, so a hung/timed-out task frees its concurrency slot without requiring a UI action.

## Key code
- `src-tauri/src/services/queue.rs` — concurrency slots, DAG-ready dispatch, retry/circuit-breaker, parent-task roll-up
- `src-tauri/src/db/dependencies.rs` — wave computation, ready-task query, `condition_type` semantics
- `src-tauri/src/claude/runner.rs` — agent name assignment, process tracking
- `src-tauri/src/claude/events.rs` — `agent:file_conflict` emission
- `client/src/features/board/OrchestrationView.tsx` — view-mode switch, event subscriptions
- `client/src/features/board/DependencyGraph.tsx`, `TimelineView.tsx`, `ObservabilityPanel.tsx`, `BattleView.tsx`, `AgentCard.tsx` — per-mode rendering
