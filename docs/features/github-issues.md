# GitHub Issues Sync

Browse a project's open GitHub issues from the board and selectively import them as tasks (one-directional: import + auto-close-on-approve; no live two-way sync).

## Behavior

1. **Auth** — no separate token is stored. Every request shells out to `gh auth token` for the credential; requires the `gh` CLI installed and `gh auth login` run once.
2. **Browse** — the Issues panel (board toolbar) fetches open issues for the project's configured repo, showing number, title, a 200-char body preview, labels, a suggested task type (from label mapping), and whether already imported (matched by `github_issue_number` on existing tasks).
3. **Import** — selected issues are inserted as `backlog` tasks in one transaction (all-or-nothing): title = issue title, description = issue body, `task_type` = label mapping, `tags` = `["github"]`, plus `github_issue_number`/`github_issue_url` linking back. Already-imported issues are skipped. Imported tasks are not auto-queued — started manually like any task.
4. **Auto-close on approve** — when an imported task transitions to **Done**, if `github_sync_enabled` is on, the linked issue is closed on GitHub and a comment is posted referencing the task key and PR URL (if any).

## Settings

Project-level:
- `github_repo` — `owner/repo`, auto-detected from the git remote.
- `github_sync_enabled` — gates both fetch/import (`get_project_repo` errors if off) and the auto-close-on-approve side effect.

## Label Mapping

Case-insensitive **substring** match on label name (not exact match) — a label containing `bug` or `fix` → `bugfix`; `refactor` → `refactor`; `doc` → `docs`; `test` → `test`; `chore` or `maintenance` → `chore`; no match → `feature`. First matching label wins.

## Edge cases

- Import is all-or-nothing per batch (DB transaction) — a failure mid-import rolls back the whole batch, not just the failing issue.
- `github_close_issue`/auto-close silently no-ops if `github_repo` is empty or the task has no linked issue number.
- `github_check_status` reports 5 states in code: `not_installed`, `not_authenticated`, `no_access`, `ready` ("Connected"), and `authenticated` (logged in but no repo configured — not surfaced in the old doc's table).

## Key code

- `src-tauri/src/commands/github.rs` — `github_fetch_issues`, `github_import_issues`, `github_close_issue`, `github_check_status`, `map_labels_to_type`.
- `src-tauri/src/services/github.rs` — GitHub REST calls (`fetch_issues`, `close_issue`, `validate_token`).
- `src-tauri/src/services/github_sync.rs` — `close_and_comment` (issue close + comment on approve).
- `src-tauri/src/commands/tasks.rs` — `execute_done_side_effects` wires auto-close into the Done transition.
- `client/src/features/board/GitHubIssuesPanel.tsx` — browse/select/import UI.
