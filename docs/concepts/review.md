# Review System

Human-in-the-loop gate between an agent finishing work and a task being accepted. Lets you approve or send work back with feedback.

## Behavior

- A task reaches **Testing** when its agent run finishes (or, if `require_approval` is on and auto-test passed, **Awaiting Approval** — see below).
- Entering Testing auto-opens a PR for the task's branch if `auto_pr` is on (idempotent — skipped if a PR already exists).
- `ReviewModal` (`client/src/features/tasks/ReviewModal.tsx`) offers two actions:
  - **Approve** → `change_task_status(id, "done")`. Accepting a task merges its open PR if `auto_merge` is on, closes the linked GitHub issue if github sync is enabled, and finalizes the timer.
  - **Request Changes** → `request_changes(id, feedback)`. Requires non-empty feedback; stops any running auto-test process, increments `revision_count`, stores the feedback as a `TaskRevision`, appends it to a fresh prompt (previous work is *not* discarded — the agent is told to build on top of it), and respawns the agent in **In Progress**.
- `request_changes` is valid from **Testing or Done** — you can reopen an already-approved task with feedback, not only one still awaiting review.

## States & transitions

- `testing → in_progress` (revision requested)
- `testing → done` (approved) / `testing → awaiting_approval` (auto-test passed + `require_approval`)
- `awaiting_approval → done` (approved) / `awaiting_approval → in_progress` (rejected)
- Full transition table: `src-tauri/src/claude/state_machine.rs::is_valid_transition`.

## Settings

- `project.require_approval` — when on, a passing auto-test lands in **Awaiting Approval** instead of auto-completing; without auto-test, the finished task simply stays in Testing for manual review instead of auto-promoting to Done.
- `project.auto_pr` / `project.auto_merge` — control whether Approve opens/merges a pull request as part of accepting the task.

## Edge cases

- Denying/approving a task with no active PR is a no-op for the PR steps (silently skipped).
- A failed PR merge on Approve never blocks the Done transition — the PR is left open and the error is logged to the task.

## Key code

- `client/src/features/tasks/ReviewModal.tsx` — approve / request-changes UI, revision history list
- `src-tauri/src/commands/tasks.rs::request_changes` — revision flow
- `src-tauri/src/commands/tasks.rs::change_task_status` / `execute_done_side_effects` — approval flow, PR merge, branch cleanup, GitHub issue close
- `src-tauri/src/claude/prompt.rs` — how revision feedback is folded into the next prompt
