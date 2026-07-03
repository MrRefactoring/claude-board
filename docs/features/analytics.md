# Analytics

Per-project cost, token, and performance dashboard, computed client-side from task usage fields plus the `get_project_stats` aggregate.

## Behavior
- Accessible from the board toolbar as the `analytics` view mode (`TrendingUp` icon), rendered by `AnalyticsView`.
- Summary cards: Total Cost, Total Tokens (input/output split), Avg Cost/Task, Avg Tokens/Task — computed from all tasks' `total_cost`, `input_tokens`, `output_tokens` (averages only over tasks with `total_cost > 0`).
- Model Comparison: bar chart grouping tasks by normalized model (`haiku`/`sonnet`/`opus`/`unknown`, matched by substring on `model_used`/`model`), showing task count, tokens, and cost per model, sorted by cost descending.
- Cost Trend: daily bar chart built from `stats.recentCompleted` (from `get_project_stats`), bucketed by day; hover shows cost, tokens, and task count for that day.
- Efficiency metrics:
  - **Throughput** — completed tasks (`status` in `done`/`testing`) per hour of summed `work_duration_ms`.
  - **Success Rate** — `completed / total` tasks, colored green (>80%), amber (>50%), red otherwise.
  - **Cache Rate** — `cache_read_tokens / input_tokens` across all tasks.
  - **Avg Turns** — mean `num_turns` over tasks with cost data.
- Task Performance table: tasks with `started_at` and some usage data, sortable by Cost (default), Tokens, or Duration (click column header, toggles asc/desc), capped to the top 20 rows. Top 3 rows are flagged with a warning icon when sorted by cost descending.
- Data refresh is manual via the refresh button (no polling/live updates).

## Edge cases
- If there are no tasks at all, the view renders an empty state (`analytics.noData`) instead of the dashboard.
- Model Comparison, Cost Trend, and Task Performance sections are hidden entirely when their underlying data is empty.

## Key code
- `client/src/features/board/AnalyticsView.tsx` — all analytics computation and rendering
- `client/src/features/board/Board.tsx` — registers the `analytics` view mode / toolbar entry
- `client/src/lib/api.ts` — `getStats` (backs the cost-trend timeline)
- `src-tauri/src/commands/stats.rs`, `src-tauri/src/db/stats.rs` — `get_project_stats` aggregate endpoint
