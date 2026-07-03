# Planning Mode

AI-assisted task breakdown: Claude explores the codebase and proposes a structured set of tasks (with dependency edges) that the user reviews and approves onto the board.

> **Note:** despite the similar name, this is unrelated to `services/gsd.rs` / `commands/gsd.rs`, which sync `ROADMAP.md`/`.planning` phase status for the separate Roadmap tab. Planning Mode is self-contained in `commands/planning.rs` and `client/src/features/planning/`.

## Behavior
1. **Define** — topic (required) + optional extra context + granularity/model/effort config.
2. **Analyze** — `start_planning` spawns a Claude CLI subprocess with a built "senior software architect" prompt; tool-call/thinking/text events stream to the UI as they arrive; the backend detects sub-phase transitions and emits `plan:phase`.
3. **Review** — parsed task list + dependency DAG shown as cards; tasks can be deleted before approval (dependency indices are re-indexed accordingly).
4. **Complete** — `approve_plan` bulk-creates the tasks and dependency edges in the DB.

Session persistence: active-session state (a `planning:active` flag + the preserved topic) is kept in `sessionStorage`; reloading the page reconnects the modal to the still-running backend session.

## States & transitions
Sub-phase (`plan:phase` events, UI labels in `planningConstants.ts::SUB_PHASES`):
- `starting` ("Starting"/"Analyzing") — process spawned
- `exploring` ("Exploring") — first `tool_use` block
- `writing` ("Planning" in UI) — first text block once tool_calls > 2
- `done` ("Finalizing"/"Review" in UI) — process exits

## Settings
Per-session, passed to `start_planning`:
- `granularity`: `high-level` (3-5 tasks) | `balanced` (5-10, default) | `detailed` (10-20)
- `model`: `haiku` | `sonnet` (default) | `opus` — plan-level baseline; `suggest_model` fills in a per-task override when the LLM omits one or gives an invalid alias (opus for `story_points >= 8` or heavy refactors, else the baseline)
- `effort`: `low` | `medium` (default) | `high` — forwarded as `--effort` only when non-default

Generated task fields: `title`, `description`, `task_type` (`feature`|`bugfix`|`refactor`|`docs`|`test`|`chore`), `priority` (0 highest – 3 lowest), `model`, `acceptance_criteria`, optional dependency edges (index pairs).

## Task parsing
`parse_tasks_from_output` tries 3 strategies in order:
1. ```json fenced code block(s), tried last-to-first
2. Raw `{"tasks": [...]}` object via brace-depth scan (no fences)
3. Plain JSON array fallback

## Edge cases
- Dependency indices are 0-based against the proposed list; deleting a task in Review shifts remaining dependency references.
- If none of the 3 parse strategies find a valid tasks array, the plan returns empty and the UI shows 0 tasks.
- `cancel_planning` kills the subprocess by PID if the user aborts mid-analysis.

## Key code
- `src-tauri/src/commands/planning.rs` — subprocess spawn, phase detection/emission, prompt construction, output parsing, `approve_plan`
- `client/src/features/planning/PlanningModal.tsx` — wizard state machine, session persistence
- `client/src/features/planning/planningConstants.ts` — granularity/sub-phase/step definitions
- `client/src/features/planning/PlanPhaseAnalyze.tsx`, `SubPhaseIndicator.tsx` — live analyze UI
