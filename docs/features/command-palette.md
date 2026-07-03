# Command Palette

Fuzzy-search launcher for tasks, projects, and app actions, bound to `Ctrl+K`/`Cmd+K`.

## Behavior

- Toggled by `Ctrl+K` (Windows/Linux) or `Cmd+K` (Mac) — this shortcut is captured at the `window` level before the input-field guard, so it works even while focus is inside a text input or textarea.
- On open, query and selection reset, and the search input auto-focuses.
- Results (in order): quick actions matching the query, up to 5 matching projects, and — only once the query is non-empty — up to 8 matching tasks.
- Quick actions: New Task (also bound separately to the `N` key, but only when a project is open and focus is not in an input/textarea), New Project, Go to Dashboard, Project Settings (hidden with no project open), Edit CLAUDE.md (hidden with no project open), Prompt Templates (hidden with no project open), Workflow Templates (hidden with no project open — opens the same templates modal as Prompt Templates), App Settings.
- Task results show a status icon/color from the shared status color map and expose inline sub-actions on hover/selection: Start (backlog → in_progress), Approve (awaiting_approval → done), Logs.
- Project results are matched by name or slug.
- Task results are matched by title, task key, or description.

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `Enter` | Execute selected item |
| `Escape` | Close palette |

Executing any item (main action or sub-action) closes the palette.

## Edge cases

- With an empty query, only quick actions and projects show — tasks never appear until the user types something.
- Sub-action buttons are only rendered for the currently-selected result.

## Key code

- `client/src/features/command-palette/CommandPalette.tsx` — search/filter logic, keyboard handling, rendering.
- `client/src/app/App.tsx` — global `Ctrl/Cmd+K` toggle and the separate `N`-key shortcut for new task.
- `client/src/store/uiStore.ts` — `commandPaletteOpen` state and modal-open actions invoked by palette items.
