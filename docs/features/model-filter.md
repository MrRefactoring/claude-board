# Model Filter

Toolbar chips that filter the current project's tasks down to one Claude model family, applied client-side across the views that consume the filtered task list.

## Behavior

- Chips are computed from the models actually present in the project's tasks (`activeModels`), each labeled with the task count for that model. Chips only render when more than one distinct model is present (`activeModels.length > 1`).
- A task's model for filtering/counting purposes is `model_used || model || 'sonnet'` (prefers the model actually used during the run over the assigned model, defaults to `sonnet`).
- Click a chip to set the filter to that model; click the active chip again, or the separate clear (X) button, to reset to no filter.
- Filter state (`modelFilter`) is local component state — not persisted, resets on remount/navigation.

## Scope

`filteredTasks` (post model + tag filter) feeds: **Board**, **List**, **Pipeline**, **Analytics**, and **Terminal** views. **Orchestration** and **Roadmap** views consume the unfiltered task list and are unaffected by the model filter — the old doc's claim of "all views" is inaccurate; there is also no view literally named "Timeline" (closest is Pipeline).

## Model Colors

| Model | Dot color |
|-------|-----------|
| Haiku | `#4ade80` (green) |
| Sonnet | `#60a5fa` (blue) |
| Opus | `#c084fc` (purple) |

## Key code

- `client/src/features/board/Board.tsx` — `activeModels`/`modelCounts` computation, chip rendering, `filteredTasks` memo, per-view wiring.
- `client/src/lib/constants.ts` — `MODELS`, `MODEL_DOT_COLORS`, `MODEL_COLORS`, `MODEL_BG_ACTIVE`.
