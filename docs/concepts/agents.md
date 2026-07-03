# Agents

An "agent" is a headless Claude Code CLI process Claude Board spawns per task. It runs on the local machine, reads/writes the project's working directory, and streams output back over realtime events.

## Behavior

1. Task moves to **In Progress** (drag-drop, manual status change, or auto-queue pickup).
2. The dependency gate rejects the transition if any blocking task isn't `done`.
3. If `auto_branch` is on, a git worktree + branch is created (`.worktrees/<slug>-<id>` under the project's working dir) so parallel agents don't collide on the same checkout; revisions reuse the existing worktree.
4. The prompt is assembled (`claude/prompt.rs`): role prompt, prompt template, task title/description/acceptance criteria, revision history (if any), parent-dependency context summaries, project context snippets, attachment manifest, a fixed "Claude Board Integration" block describing the MCP tools available, and git/branch instructions derived from `auto_branch`/`auto_push`.
5. Claude Board spawns `claude` (via `env_path::claude_command`, which re-resolves the login-shell `PATH` so GUI-launched processes still find `claude`/nvm/homebrew binaries) with:
   - `-p "<prompt>" --output-format stream-json --verbose --model <model>`
   - `--mcp-config` pointing at the bundled `mcp-server.js` sidecar (env `CLAUDE_BOARD_URL`, `CLAUDE_BOARD_TASK_ID`)
   - permission flags per the project's `permission_mode` (see `docs/configuration/permissions.md`)
   - `--effort <effort>` when thinking effort isn't `medium`
6. Streamed `stream-json` events are parsed per-line and turned into `task:log` entries + `task:usage` updates; tool calls are tracked for live file-conflict detection.
7. On completion: if `auto_test` is enabled the task re-spawns in test mode first; otherwise it goes to **Testing** (or straight to **Done** if `require_approval` is off).

## Concurrency

Concurrency is a **per-project** setting (`max_concurrent`, default 1), not a global cap — there is no app-wide limit on simultaneous agents. The project settings UI offers quick picks of 1/2/3/5/10 and a free field up to 50. The queue poll (every 15s) starts ready backlog tasks up to `max_concurrent - <currently running>` for each project with `auto_queue` on.

> **Note:** Running multiple agents against the same working directory can still conflict on shared files even with worktrees (e.g. lockfiles, generated files outside git). `agent:file_conflict` is emitted when two tasks write-touch the same path.

## Token tracking

Usage is accumulated from the CLI's `assistant`/`result` stream events and persisted on the task row (`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `total_cost`, `num_turns`, `model_used`). Live updates are pushed via the `task:usage` event.

## Realtime events

Actual events emitted by the backend (`claude/events.rs`, `claude/runner.rs`) — not a fixed lifecycle enum:

| Event | Payload / when |
|-------|-----------------|
| `task:updated` | Task row changed (status, usage snapshot, running flag, etc.) |
| `task:usage` | Token/cost delta for a task |
| `task:log` | One line of terminal output (`logType`: `claude`, `tool`, `tool_result`, `system`, `error`, `success`) — tool calls appear here, there is no separate `task:tool_call` event |
| `agent:file_conflict` | A `Write`/`Edit`/`NotebookEdit` call touches a file another task is also touching |
| `claude:limits` | Rate-limit status change (5-hour/session/daily/etc.) |

There are no `task:started`/`task:completed`/`task:failed` realtime events — those strings only exist as webhook event-type identifiers (`services::webhook::fire`), fired alongside the state transition, not as separate WebSocket events.

## Edge cases

- Process timeout: if `task_timeout_minutes` > 0 and exceeded, the process is killed, attachments cleaned up, and the task is retried via `queue::handle_task_failure` (only if still `in_progress`).
- App restart: orphaned `in_progress` tasks are recovered back to `backlog`; tasks mid-`testing` re-trigger auto-test after a 3s delay.
- Worktrees are kept after completion (never force-deleted) so unmerged branches survive; only `auto_merge` attempts a merge, and only when the base branch is the clean checked-out HEAD.

## Key code

- `src-tauri/src/claude/runner.rs` — process spawn, args, worktree/branch management, PR/merge orchestration, timeouts
- `src-tauri/src/claude/prompt.rs` — prompt assembly
- `src-tauri/src/claude/events.rs` — stream-json event parsing, usage tracking, file-conflict detection
- `src-tauri/src/claude/env_path.rs` — login-shell PATH resolution for subprocess spawning
- `src-tauri/src/services/queue.rs` — auto-queue polling, per-project concurrency
- `src-tauri/resources/mcp-server.js` — MCP sidecar exposing task/project tools to the running agent
- `client/src/lib/events.ts` — typed realtime event map (Tauri events / Socket.IO)
