# Tasks

The core unit of work: a job for a Claude agent, tracked through a status lifecycle with usage/cost accounting.

## States & transitions

Statuses: `backlog`, `in_progress`, `testing`, `awaiting_approval`, `done`, `failed`. Valid transitions are declared centrally in `state_machine.rs::is_valid_transition` — normal flow (`backlog → in_progress → testing → done`), the approval gate (`testing → awaiting_approval → done`), revision loop (`testing/done → in_progress`), retries (`failed → backlog|in_progress`), and manual overrides (e.g. closing a backlog task straight to `done`/`failed`, reopening a `done` task). Invalid transitions are rejected at the command boundary (`change_task_status`).

Entering `in_progress` starts (or resumes) the smart timer; entering `testing` from `in_progress` pauses it; `done` finalizes it. A task blocked by an unmet dependency cannot move to `in_progress` (manual or auto-queue).

## Task fields

| Field | Notes |
|-------|-------|
| `title`, `description` | Prompt input |
| `status` | See above |
| `priority` | `0`–`3`: `0`=None, `1`=Low, `2`=Medium, `3`=High |
| `task_type` | `feature`, `bugfix`, `refactor`, `docs`, `test`, `chore` |
| `model` | `haiku`, `sonnet`, `opus`, or a configured custom model (Settings → Models) |
| `thinking_effort` | `low`, `medium` (default), `high`, `xhigh`, `max` — passed as `claude --effort` when not `medium` |
| `acceptance_criteria` | Folded into the prompt |
| `depends_on` / dependency graph | Gates auto-start and manual start until the blocker is `done` |
| `task_level` | Optional `epic`/`story`/`task`/`subtask` hierarchy (roadmap) |
| `auto_pr` | Per-task override of the project's `auto_pr` (unset = inherit) |

## Priority

Higher number = higher priority in queue ordering. There is no "Urgent" level in the current schema — the ceiling is `3` (High).

## Edge cases

- Once `in_progress`, only `description`/feedback (via revision) meaningfully changes agent behavior — other fields can still be edited but won't retroactively affect a running process.
- `revision_count` and `TaskRevision` rows accumulate across the review loop; each revision's feedback is appended to a fresh prompt build (see `docs/concepts/review.md`).
- Restarting a task (`restart_task`) clears its logs and force-starts a fresh run regardless of current status.

## Key code

- `src-tauri/src/db/tasks.rs` — `Task` struct, field set
- `src-tauri/src/claude/state_machine.rs` — status enum, transition table, timer/retry config
- `src-tauri/src/commands/tasks.rs` — CRUD + status-change command
- `client/src/lib/constants.ts` — `PRIORITY_OPTIONS`, `TASK_TYPE_OPTIONS`, `MODEL_OPTIONS`, `EFFORT_OPTIONS`
