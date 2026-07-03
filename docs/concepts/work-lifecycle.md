# Task Work Lifecycle

How an agent's work travels from a task to the remote: worktree → branch → commits → push → PR → merge → worktree removal. This is the contract for where work lives at every moment and how each transition is surfaced to the user. The point is that work is **never invisible** — at any stage the UI can answer "where is my work and what happened to it".

## Stages

1. **Worktree created** — at run start, `ensure_task_worktree` creates an isolated git worktree at `<repo>/.worktrees/<slug>-<id>` on branch `<task_type>/<slug>` (`git worktree add -b`). `.worktrees` is added to `.git/info/exclude` so it doesn't clutter `git status`. The worktree **path is persisted on the task** (`worktree_path`) and the branch name (`branch_name`) — both survive an app restart.
2. **Commits** — the agent works and commits inside the worktree. `scan_git_info` records the commit list (`commits`) and `diff_stat` on completion.
3. **Push** — the branch reaches the remote in one of two ways only: (a) automatically as part of PR creation (`auto_pr=1`), or (b) a **manual "Push branch" action** in Testing. There is no automatic push without a PR. Every push logs its outcome and sets `pushed=1`.
4. **PR opened (Testing)** — on entering Testing, if `auto_pr=1` a PR is opened automatically (idempotent); otherwise the user can open one with the **manual "Create PR" action**. Creating a PR pushes the branch first, then opens the PR via the provider CLI (`gh`/`glab`/`az`/`tea`) and stores `pr_url`.
5. **Merge (Done)** — accepting the task (→ Done) merges the open PR (`merge_task_pr`); merge failure never blocks the transition (PR stays open, error surfaced).
6. **Worktree removed** — on Done, **if the work is safe on the remote** (`pr_url` set OR `pushed=1`), the worktree is removed (`git worktree remove --force` + `prune`) and `worktree_path` cleared. The branch ref is kept (it, and the remote, hold the commits). If the work never reached the remote, the worktree is **kept** — it is the only copy — and its path stays visible.

## Worktree removal rule

- Removal happens **at acceptance (Done)**, not at push/PR time — the worktree stays available through the whole review + revision cycle.
- Removal is gated on **work being safe on the remote**: `pr_url` present, or the branch was pushed (`pushed=1`).
- Removal never loses commits: the branch ref survives (`cleanup_task_branch` never force-deletes a branch), and the commits are on the remote.
- Revisions recreate a worktree on demand from the existing branch (`git worktree add <dir> <branch>`), so removal is safe even if a task is later reopened.

## Manual actions (Testing)

A task in **Testing** exposes two on-demand buttons (Tauri only — no HTTP route), so the user is never stuck waiting on automation:

- **Push branch** — pushes the task's branch to `origin` from its worktree. Always available (re-push updates the remote). Sets `pushed=1`.
- **Create PR** — pushes and opens a PR **even when `auto_pr=0`**. Hidden once `pr_url` exists.

These make an `auto_pr=0` project's work reachable without changing project settings, and let the user drive the branch/PR when they choose.

## Persisted state (on the task)

| Field | Meaning |
|-------|---------|
| `branch_name` | the task's branch |
| `worktree_path` | where the work is checked out (cleared when the worktree is removed) |
| `pushed` | branch has been pushed to the remote (1/0) |
| `pr_url` | open/merged PR URL |
| `commits`, `diff_stat` | commit list and diff summary from the last run |

## Transparency touchpoints

Every transition is recorded and (for push/PR/merge) announced loudly, so nothing happens silently:

- **Activity log + task log:** `worktree_created`, `branch_pushed` (with push outcome), `pr_created`, `pr_merged`, `worktree_removed` (reason: safe on remote).
- **Native notification + toast:** on `pr_created` (toast links to the PR, click to open), `pr_merged`, `branch_pushed`.
- **Webhooks:** `pr_created`, `pr_merged`, `branch_pushed` (payload includes `taskId` and `pr_url`/`branch`).
- **UI "Work location" panel** (task detail, Git tab): branch (copyable), push/PR status, PR link, worktree path — including the explicit local-only case: *"committed locally on branch X, not pushed — worktree at Y"*. Once removed: *"worktree removed — work safe on the remote"*.
- **Task card:** a PR badge (`#N`, click to open) alongside the branch.

## The local-only case (why this exists)

A project with `auto_pr=0` and no manual push leaves work committed only on a local branch inside a git-excluded worktree. Previously the worktree path lived only in memory and was lost on restart, so completed work became undiscoverable (this happened to the Atlassian Track B work). Under this contract that path is persisted and shown, the state reads "local, not pushed", and the Testing actions let the user push/PR it in one click. Work is always locatable.

## States & transitions (summary)

| Task status | Worktree | Typical git state |
|-------------|----------|-------------------|
| in_progress | live | commits accumulating locally |
| testing | live | PR open (auto or manual), or local/pushed awaiting review; manual push/PR available |
| done | removed if safe on remote, else kept | PR merged, or branch pushed, or local-only (kept) |

## Key code

- `src-tauri/src/claude/runner.rs` — `ensure_task_worktree` (create + persist path, recreate on revision), `push_task_branch` (push helper, logs outcome, sets `pushed`), `do_create_pr`/`auto_create_pr`/`auto_create_pr_public`, `merge_task_pr`, `remove_task_worktree` (Done-time removal), `get_task_worktree` (DB-backed fallback).
- `src-tauri/src/commands/tasks.rs` — Done side-effects (merge → conditional worktree removal); manual `push_task_branch_cmd` / `create_task_pr_cmd`.
- `src-tauri/src/db/tasks.rs` + `schema.rs` — `worktree_path`, `pushed` columns and setters.
- `src-tauri/src/services/notification.rs` / `webhook.rs` — PR/push notifications and webhook events.
- `client/src/features/tasks/TaskGitTab.tsx` — Work location panel + Testing action buttons.
- `client/src/features/board/TaskCard.tsx` — PR badge.
- `client/src/features/activity/ActivityTimeline.tsx` — git event rendering.

## Related

- `../features/auto-pr.md` — automatic PR creation/merge and provider dispatch.
- `../features/git-automation.md` — branch/push/merge settings.
- `../features/queue.md` — where completion/acceptance transitions originate.
- `review.md` — the accept / request-changes gate that drives Testing → Done.
