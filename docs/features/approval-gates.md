# Approval Gates

Optional manual review step between a task passing verification and being marked done.

## Behavior
- Governed by the per-project `require_approval` flag (**Project Settings → Engine tab → Approval Gate** toggle: "Approval required" vs. "Auto-approve", default off).
- With auto-test enabled and `require_approval` on: when auto-test passes, the task moves `testing → awaiting_approval` instead of `testing → done`. The "Awaiting Approval" board column only renders when `require_approval` is set on the project.
- With auto-test **disabled** and `require_approval` on: the task simply stays in `testing` for manual review (it does not transition to `awaiting_approval`) — approval and auto-test-triggered approval are two separate code paths, and only the auto-test path uses the `awaiting_approval` status.
- With `require_approval` off (default): auto-test passing (or manual completion with no auto-test) promotes the task straight to `done`.
- From `awaiting_approval`, the task moves on generic status-update transitions (drag-and-drop, board actions, or the command palette's "Approve" action, which calls the same status-change path):
  - → `done` (approved) — triggers the normal done-transition side effects: PR creation/merge, branch cleanup, GitHub issue close.
  - → `in_progress` (rejected, rework)
  - → `backlog` (returns to queue)
  - → `failed` (rejected permanently)

## States & transitions
Valid transitions involving the gate (`src-tauri/src/claude/state_machine.rs`):
```
testing          → awaiting_approval   (auto-test passed, approval required)
awaiting_approval → done               (approved)
awaiting_approval → in_progress        (rejected, needs rework)
awaiting_approval → backlog            (moved back to queue)
awaiting_approval → failed             (rejected permanently)
```

## Settings
- `require_approval` (`projects` table, `INTEGER DEFAULT 0`) — 1 enables the gate for the project.

## Edge cases
- Toggling the flag doesn't affect tasks already in flight — it's read at the point auto-test/completion resolves.
- The "Awaiting Approval" column is hidden client-side (`Board.tsx` filters `COLUMNS`) when the project flag is off, but a task already in that status would still be filtered out of view if the flag is turned off mid-flight.

## Key code
- `src-tauri/src/claude/state_machine.rs` — `TaskStatus::AwaitingApproval`, valid transitions
- `src-tauri/src/claude/runner.rs` — auto-test completion handler branching on `require_approval` (sets `awaiting_approval` or `done`)
- `src-tauri/src/commands/tasks.rs` — generic status-update command that applies transitions and done-side-effects (PR/branch/issue)
- `src-tauri/src/db/projects.rs` — `require_approval` field, `update_approval_settings`
- `client/src/features/projects/EngineSection.tsx` — Approval Gate toggle UI
- `client/src/features/board/Board.tsx` — conditional "Awaiting Approval" column
- `client/src/lib/constants.ts` — `awaiting_approval` column definition (violet)
