# Git Automation

Automatic git worktree/branch creation, PR creation, and merge handling for tasks, so agents work in isolation and reviewable branches without manual git steps.

## Behavior

1. **Branch/worktree creation** — when a task run starts (transition to In Progress), and `auto_branch` is on, the runner creates an isolated git worktree at `.worktrees/<slug>-<id>` off `pr_base_branch` and checks out a branch named `<task_type>/<slug>` (slug = task title lowercased, Turkish-char-folded, non-alphanumeric replaced with `-`, truncated to 40 chars; `task_type` defaults to `feature`). If not in a git repo, or `auto_branch` is off, the agent just runs in the project's working directory on the current branch.
   - Revisions of the same task reuse the existing worktree if it still exists.
   - A pre-existing worktree/branch dir is removed and recreated fresh at run start.
2. **PR creation** — when a task enters **Testing**, if `auto_pr` (effective: per-task override else project default) is on, the branch is pushed and a PR is opened via the detected PR provider CLI (title = task title, body = task description, base = `pr_base_branch`, head = task branch). Skipped if a PR already exists. Also re-attempted as a fallback on the Done transition if it didn't happen at Testing.
3. **PR merge** — when a task reaches **Done** (approval), if an open PR exists it is merged via the provider CLI. Merge failure never blocks Done — the PR is left open and the error is logged to the task.
4. **Branch cleanup** — after Done, the branch/worktree is never force-deleted (avoids orphaning commits). If `auto_pr` is on, the branch is left alone (owned by the PR). If `auto_merge` is on, the branch is merged into the base with `git merge --no-ff` — but only if the base branch is the clean, checked-out HEAD of the main working dir; otherwise (or on conflict) the merge is skipped/aborted and the branch is kept.

## Settings

Project-level (`projects` table / Project Settings > Automation):
- `auto_branch` — create an isolated worktree+branch per task run. **Default: on** (doc previously said off — code default is `1`).
- `auto_pr` — open a PR when a task enters Testing. Default: off.
- `auto_push` — (exposed in UI; not read by the branch/PR/merge flow in `runner.rs` — pushing happens implicitly as part of `auto_pr`).
- `auto_merge` — merge the task branch into base on Done. Default: off.
- `pr_base_branch` — base branch for worktrees and PRs. Default: `main`.
- `pr_provider` — `auto` (detect from git remote), or an explicit provider (`github`, `gitlab`, `azure_devops`, `gitea`), or `none`.

Task-level:
- `auto_pr` (nullable) — per-task override of the project's `auto_pr`; `NULL` inherits the project setting.

## Edge cases

- PR provider is auto-detected from the project's `pr_provider` setting or the git remote URL — supports GitHub (`gh`), GitLab (`glab`), Azure DevOps (`az`), and Gitea/Forgejo (`tea`), not just `gh`.
- Branch name prefix comes from the task's `task_type` field (e.g. `bugfix/`, `refactor/`), not parsed from the title text as the old doc implied.
- `auto_merge` only fires if the working tree is clean and checked out on the base branch; a dirty tree or wrong HEAD skips the merge (branch kept for manual merge), logged to the task.

## Key code

- `src-tauri/src/claude/runner.rs` — `ensure_task_worktree` (branch/worktree creation), `auto_create_pr`/`auto_create_pr_public` (PR open), `merge_task_pr` (PR merge on Done), `cleanup_task_branch` (post-Done branch handling), `effective_auto_pr`/`effective_auto_merge`.
- `src-tauri/src/commands/tasks.rs` — status-transition wiring: PR open on `Testing`, PR merge + branch cleanup on `Done` (`execute_done_side_effects`).
- `src-tauri/src/services/pr_providers.rs` — multi-provider PR create/merge (`gh`/`glab`/`az`/`tea`), provider auto-detection.
- `src-tauri/src/db/schema.rs` — `auto_branch`, `auto_pr`, `auto_push`, `auto_merge`, `pr_base_branch` column definitions/defaults.
- `client/src/features/projects/AutomationSection.tsx` — project settings UI for these toggles.
