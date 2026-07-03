# Project Terminal

Aggregates `task:log` output from every task in a project into one live-scrolling view, so a swarm of parallel agents can be watched without opening a terminal per task.

## Behavior
- Tab sits next to Roadmap in the board's top view tabs (`Board.tsx`, `viewMode === 'terminal'`); lazy-loaded. Nothing to start — it subscribes to `task:log` on mount and streams as events arrive.
- Every line shows a `[TASK-KEY]` badge colored by `task_type` (shared `TYPE_COLORS` map) and a fixed-width timestamp column.
- **Unified** (default) — single auto-scrolling feed ordered by arrival time.
- **Split** — one pane per visible task in a responsive grid (`gridColsFor`): 1 task → 1 col, 2 → 2 cols, 3-4 → 2 cols (2×2), 5-9 → 3 cols, 10+ → 4 cols. Each pane auto-scrolls independently.
- **Active only** filter (default on) — shows tasks where `is_running` is true OR `status` is `in_progress`, `review`, or `verifying`.
- **Pause** freezes the view; new events buffer in a ref (not React state, so pausing doesn't re-render) with a queued-count badge. **Resume** flushes the buffer in order, trimming to the cap if exceeded. **Clear** empties the current view and buffer only — backend log history is untouched (still visible in the per-task Live Terminal).
- Auto-scroll sticks to bottom while within 40px of it; scrolling away shows a jump-to-bottom button.
- The `task:log` listener is registered once in an empty-deps `useEffect` and reads the live task list from a ref rather than a dependency, so it never re-subscribes (and never drops events) as the task list updates.

## Settings
None — no persisted configuration; mode/filter/pause state is local component state.

## Edge cases
- No active tasks with "Active only" on → empty-state prompt to start a task or switch to "All tasks".
- A `task:log` event for a task not in the project's current task list is dropped (ref lookup miss).
- In-memory cap: `MAX_LOGS = 3000` lines; on overflow, trims to `TRIM_TO = floor(3000 * 0.7) = 2100`. Older lines scroll out but remain in per-task DB history.

## Key code
- `client/src/features/terminal/ProjectTerminal.tsx` — aggregation, unified/split rendering, pause/resume/clear, filters
- `client/src/features/board/Board.tsx` — tab wiring (`viewMode === 'terminal'`)
- `src-tauri/src/claude/runner.rs` — emits the `task:log` events this view consumes (piped subprocess stdout/stderr — this repo has no PTY crate; it is not a real terminal/PTY session)
- `client/src/features/terminal/LiveTerminal.tsx` — per-task counterpart consuming the same event

Not involved: `src-tauri/src/commands/claude_manager.rs` — that module handles Claude CLI account/plugin/marketplace/MCP-server management, not task terminal output.
