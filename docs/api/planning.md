# Planning API

AI-assisted task planning: Claude explores the codebase and proposes a task tree, which the user then approves into real tasks. Tauri IPC only.

## Commands
- `start_planning(projectId, topic, model?, effort?, granularity?, context?)` — spawns `claude -p ... --output-format stream-json` in the project's working dir. `model` defaults `sonnet`, `effort` defaults `medium`, `granularity` ∈ `high-level | balanced | detailed` (default `balanced`). Errors if a plan is already active for the project. Returns `{ planId, status: "started" }` immediately; the run streams via events (below) and ends with `plan:completed` carrying **proposals**, not created tasks.
- `approve_plan(projectId, tasks, model?, dependencies?, topic?)` — the user-approved step: creates every proposed task (respecting `parent` indices for the epic→story→task→subtask hierarchy and `[parentIdx, childIdx]` dependency edges), tags them all with an auto-generated `plan:<slug>` tag, and emits `task:created` for each. Returns the created `Task[]`.
- `cancel_planning(projectId)` — kills the running Claude process for that project's active plan and emits `plan:cancelled`. Errors if nothing is active.
- `get_planning_status(projectId)` — `{ active: bool }`.

## Events (emitted via `app.emit`, Tauri-only — see `docs/api/events.md`)
- `plan:started` — `{ projectId, planId, topic, model, effort }`.
- `plan:phase` — `{ projectId, phase }`, phase ∈ `starting → exploring → writing → done`.
- `plan:progress` — streamed text/thinking: `{ projectId, planId, type: "text"|"thinking", content }`.
- `plan:log` — tool calls/results/system/errors: `{ projectId, planId, type: "tool"|"result"|"error"|"system", message }`.
- `plan:stats` — `{ projectId, tokens: { input, output }, toolCalls, turns }`.
- `plan:completed` — `{ projectId, planId, proposals, dependencies, analysis, stats: { elapsed, toolCalls, turns, exitCode } }`.
- `plan:cancelled` — `{ projectId }`.

## Notes
- Model selection per proposed task: an explicit valid alias (`haiku|sonnet|opus`) from the model wins; otherwise `suggest_model` picks a tier from `task_type`/`level`/`story_points` (opus ≥8 points, haiku for `docs`/`chore`/≤2 points, sonnet otherwise). Containers (`epic`/`story`) have no model.
- `client/src/lib/api.ts` defines HTTP fallback paths for this feature (`POST /api/projects/:id/plan`, `/plan/cancel`, `GET /plan/status`), but **`services/http_api.rs` registers no such routes** — planning only works inside the Tauri desktop app, not in web-fallback mode.

## Key code
- `src-tauri/src/commands/planning.rs` — commands, prompt construction, stream-json parsing
