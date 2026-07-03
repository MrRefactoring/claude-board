# Board & Views

The main project screen offers several ways to look at the same task set. All views update live from realtime events — no polling.

## Views

`client/src/features/board/Board.tsx` drives a `viewMode` toggle with these views:

- **Board** (`board`, default) — Kanban columns, drag-and-drop.
- **List** (`list`) — sortable table: title, status, priority, model, and more (`ListView.tsx`).
- **Pipeline** (`pipeline`) — pipeline/funnel-style stats (`PipelineView.tsx`, `PipelineStats.tsx`).
- **Orchestration** (`orchestration`) — multi-agent command center, with its own sub-tabs: **Graph** (dependency DAG), **Timeline** (Gantt-style), **Live** (tool-call feed with conflict detection), **Battle** (`OrchestrationView.tsx` / `BattleView.tsx`).
- **Analytics** (`analytics`) — usage/cost dashboards (`AnalyticsView.tsx`).
- **Roadmap** — epic/story/task planning view.
- **Terminal** — embedded terminal.

## Kanban columns

Columns come from `client/src/lib/constants.ts` `COLUMNS`, one per `TaskStatus`:

| Column | Status value |
|--------|--------------|
| Backlog | `backlog` |
| In Progress | `in_progress` |
| Testing | `testing` |
| Awaiting Approval | `awaiting_approval` |
| Done | `done` |
| Failed | `failed` |

`awaiting_approval` only becomes reachable when a project has `require_approval` on (see `docs/concepts/review.md`).

## Behavior

- **Drag and drop** (`dnd-kit`, mouse-only): moving a card to a new column calls `change_task_status`. Dropping into **In Progress** spawns a Claude agent (subject to the dependency gate — a task blocked by an unfinished dependency is rejected).
- **Alt-drag**: holding Alt while dragging one task onto another opens a dependency-creation dialog instead of moving it.
- **Mobile** (`< md` breakpoint): columns become a horizontally-scrolling tab strip with tap-to-move instead of drag-and-drop.

## Settings

- `project.max_concurrent` / `project.auto_queue` — govern how many backlog tasks can be picked up automatically (see `docs/concepts/agents.md`).
- `project.require_approval` — adds the Awaiting Approval column to the flow.

## Key code

- `client/src/features/board/Board.tsx` — view switcher, drag-and-drop, alt-drag dependency creation
- `client/src/features/board/Column.tsx`, `TaskCard.tsx` — Kanban rendering
- `client/src/features/board/ListView.tsx`, `PipelineView.tsx`, `OrchestrationView.tsx`, `AnalyticsView.tsx` — other views
- `client/src/lib/constants.ts` — `COLUMNS` (status → label/color)
- `src-tauri/src/commands/tasks.rs::change_task_status` — status transition + side effects
