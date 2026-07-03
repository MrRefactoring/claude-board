# Status Animations

Short CSS overlay animations played on a task card when its status changes, for visual feedback on drag-and-drop, button, or voice-driven transitions.

## Behavior
1. Any status change calls `emitStatusTransition(taskId, fromStatus, toStatus)`, which records the transition in `StatusTransitionContext` (module-level event bus, usable outside the React tree).
2. Each `TaskCard` reads the context for its own task ID; if a transition is active, it renders a `StatusTransitionEffect` overlay.
3. The transition record — and its rendered effect — auto-clears after 2 seconds (per-task timeout, reset on a new transition for the same task).

## Animation Types
Effect is chosen by the target status: In Progress (amber sparks), Testing (shimmer wave), Done (confetti burst), Awaiting Approval (violet stars), Failed (red flash), and any backward transition (gray rewind sweep). All transitions also apply a glow pulse in the target status color and a card pop scale.

## Key code
- `client/src/features/board/StatusTransitionContext.tsx` — transition state, `emitStatusTransition`, 2s auto-clear
- `client/src/features/board/StatusTransitionEffect.tsx` — per-transition CSS animation overlay
- `client/src/features/board/TaskCard.tsx` — reads context, renders the effect
- `client/src/hooks/useTaskHandlers.ts` — calls `emitStatusTransition` on status changes
