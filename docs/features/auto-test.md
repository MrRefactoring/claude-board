# Auto Test

Runs an automated QA verification agent on a task before it reaches Done.

## Behavior
1. Task completes (`in_progress` → `testing`). If `auto_test` is enabled, a verification agent starts automatically (model from `auto_test_model`, effort `low`).
2. The agent runs 4 checks sequentially, one Bash command at a time — parallel calls are avoided because a cancelled sibling call would corrupt verification, and to sidestep Windows parallel-tool-call cancellation errors: Build Check, Test Suite (skipped if no test suite found), Code Review, Acceptance Criteria (skipped if none specified).
3. Progress is logged/emitted as `[STEP N/4] <name>` and surfaced on the task card as step indicators.
4. The agent must emit a final JSON report: `{"verdict": "approve"|"reject", "summary", "checks": [{"name", "status": "pass"|"fail"|"skip"|"warn", "detail"}...], "feedback"}`, stored on `tasks.test_report`.
5. Uses the same event/log pipeline as normal task execution — tool call grouping, duration, token/cost tracking. Auto-test tokens are added on top of the task's existing usage baseline (not reset), so totals reflect build + verification combined.

## States & transitions
- Verdict `approve`, `require_approval` off → `testing` → `done`.
- Verdict `approve`, `require_approval` on → `testing` → `awaiting_approval` (needs manual accept/reject).
- Verdict `reject`, revision count below `max_auto_revisions` → auto-revision: feedback is recorded, status moves `testing` → `in_progress`, and the task restarts automatically with the feedback as context.
- Verdict `reject`, revision limit reached → task stays in `testing` for manual review.
- Unparseable report or agent process error → task stays in `testing`, logged as `unknown`/`error`.

## Settings
- `auto_test` — enables the feature (Automation tab).
- `test_prompt` — free-text custom instructions appended to the verification prompt (Automation tab).
- `auto_test_model` — model for the verification agent (Engine tab). Empty string resolves to default `sonnet`.
- `max_auto_revisions` — cap on automatic reject→revise cycles (Engine tab, default 3).
- `require_approval` — whether an `approve` verdict still needs manual sign-off (Engine tab, "Approval Gate").

## Edge cases
- App restart while a task is in `testing`: crash recovery re-triggers auto-test for those tasks after a 3s startup delay, only if `auto_test` is still enabled on the project.
- Task manually moved off `testing` while auto-test is running: the verdict is logged and skipped rather than force-applied.

## Key code
- `src-tauri/src/claude/runner.rs` — `start_test` (builds the verification prompt and launches the agent), verdict/report parsing and revision handling.
- `src-tauri/src/services/queue.rs` — `startup_recovery` (crash-recovery re-trigger for tasks stuck in `testing`).
- `src-tauri/src/claude/state_machine.rs` — `TaskStatus` transitions, `EngineConfig` (`auto_test_model` default, `max_auto_revisions`).
- `client/src/features/tasks/TaskTestTab.tsx` — verdict banner and per-check cards.
- `client/src/features/projects/AutomationSection.tsx`, `client/src/features/projects/EngineSection.tsx` — settings UI.
