# GitHub API

Issue import/sync and repo detection via the `gh` CLI — Tauri IPC only, no HTTP route. Requires `gh` installed and authenticated (`gh auth login`).

## Commands
- `github_detect_repo(workingDir)` — reads `git remote get-url origin` in `workingDir`, returns `"owner/repo"`. Errors if there's no remote, or it isn't a GitHub URL.
- `github_check_status(repo)` — checks `gh` installed → authenticated → repo accessible, in order. Returns `{ status, message, repo? }` with `status` ∈ `not_installed | not_authenticated | authenticated | no_access | ready`.
- `github_fetch_issues(projectId)` — requires the project's `github_repo` + `github_sync_enabled=1` (Project Settings). Fetches open issues via `gh auth token` + GitHub API, returns `{ issues: [...], repo }` where each issue carries `already_imported` (matched by issue number already on a task) and `suggested_type` (mapped from labels: `bug/fix`→`bugfix`, `refactor`→`refactor`, `doc`→`docs`, `test`→`test`, `chore/maintenance`→`chore`, else `feature`). Does not create tasks.
- `github_import_issues(projectId, issueNumbers)` — imports the selected issues as `backlog` tasks in one DB transaction (all-or-nothing); duplicates (by issue number) are skipped. Each task is tagged `["github"]`, description = issue body, type from `suggested_type`. Emits `task:created` per imported task. Returns `{ imported: <count> }`.
- `github_close_issue(projectId, taskId)` — closes the GitHub issue linked to `taskId` (via its `github_issue_number`). No-op if no repo configured or task has no linked issue. Called automatically from `commands/tasks.rs` when a task with a linked issue reaches `done`.

## Notes
- All of these require `github_sync_enabled = 1` and a non-empty `github_repo` on the project (except `detect_repo`, which just reads the local git remote).
- Nothing here is reachable over `/api/*` — `services/http_api.rs` defines no GitHub routes; `client/src/lib/api.ts`'s `githubDetectRepo` / `githubCheckStatus` / `githubFetchIssues` / `githubImportIssues` only work inside the Tauri app.

## Key code
- `src-tauri/src/commands/github.rs` — Tauri commands
- `src-tauri/src/services/github.rs` — GitHub REST client (`fetch_issues`, `close_issue`, `validate_token`)
