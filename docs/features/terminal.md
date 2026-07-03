# Live Terminal

Real-time, filterable log stream of everything a Claude agent does during a task run.

## Behavior
- Opened from the terminal icon on a task card; streams `task:log` events over the realtime transport (Tauri events / socket.io) as the agent runs, and auto-scrolls unless the user has scrolled up.
- All logs persist to the database, so completed tasks (including ones moved to Done) can be reopened for review.
- Layout toggles between a side panel (wide screens, board + terminal visible together) and a bottom panel (narrow screens or full board width); the bottom panel additionally supports split terminal.

## Log Types
Each log has a `log_type` used for styling and filtering: `claude` (reasoning/text, with a separate `isThinking` sub-flag), `tool` (tool calls), `tool_result`, `system`/`info`, `error`.

## Filters
Filter chips: **All**, **Claude**, **Thinking**, **Tools** (tool + tool_result), **System** (system + info), **Errors** — each shows a live count. A search box filters the visible logs by message text.

## Key code
- `src-tauri/src/claude/events.rs` — `add_log`, emits `task:log`
- `client/src/features/terminal/LiveTerminal.tsx` — filters, search, log rendering, side/bottom layout
- `client/src/features/terminal/terminalConstants.ts` — tool icon/color registry
