# Diff Viewer

Shows the git diff produced by a task's commits, inline in the Task Detail modal's Git tab.

## Behavior

1. Open a task with git activity (has commits, a PR URL, or a diff stat) — the Git tab (`TaskGitTab`) becomes visible.
2. The **File Changes** section renders `task.diff_stat` (a `git diff --stat` summary), with the trailing `+`/`-` bar segments colored green/red.
3. Clicking **View Full Diff** lazily calls `getTaskDiff(task.id)` → Tauri command `get_task_diff`, which shells out to `git diff` in the project's working directory and returns the raw unified diff. Result is cached in component state after the first load.
4. Each line is colored client-side by `getDiffLineClass` (`client/src/features/tasks/taskDetailHelpers.ts`):
   - `+++`/`---` file headers — bold/semibold
   - `@@` hunk headers — cyan
   - `diff --git` — bold, distinct background
   - `+` lines — green (emerald)
   - `-` lines — red
   - everything else — muted gray, with a line-number gutter

## Commit range

`get_task_diff` (`src-tauri/src/commands/tasks.rs`) picks the diff range from the task's stored `commits` JSON:

- 2+ commits → `{first}~1..{last}` (oldest commit's parent to newest)
- 1 commit → `{hash}~1..{hash}`
- no commits recorded → falls back to `HEAD~1..HEAD`

## Limitations

- Diff output is truncated at 200,000 bytes (UTF-8 boundary-safe), with a trailing truncation notice appended.
- If `git diff` fails or returns nothing (e.g. not a git repo, no prior commit), the command returns an empty diff string rather than an error — the viewer shows an empty-state message ("no diff").

## Key code

- `src-tauri/src/commands/tasks.rs` — `get_task_diff` (shells out to `git diff`, truncates at 200KB)
- `src-tauri/src/claude/runner.rs` — populates `task.diff_stat` via `git diff --stat HEAD~1..HEAD` after a task's commits land
- `client/src/features/tasks/TaskGitTab.tsx` — diff stat display, "View Full Diff" toggle and lazy load
- `client/src/features/tasks/taskDetailHelpers.ts` — `getDiffLineClass` line coloring
- `client/src/lib/api.ts` — `getTaskDiff(taskId)` wrapper
