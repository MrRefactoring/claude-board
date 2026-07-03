# Token Counter

Live estimated token count and input cost shown in the task creation form, to help gauge API cost before running a task.

## Behavior
- Computed from the combined title + description + acceptance criteria text: `tokens = ceil(chars / 4)`.
- Rendered below the description field once the estimate reaches 10 tokens; below that it renders nothing.
- Cost is `tokens / 1e6 * inputCostPerMillion` for the currently selected model, using dynamic per-model pricing if available (`getModelCosts`) and falling back to a static table.

## Settings
Static fallback pricing (`MODEL_COSTS`, USD per 1M input tokens): Haiku `$1.00`, Sonnet `$3.00`, Opus `$5.00`.

> **Note:** corrected from a previous doc revision that listed Haiku `$0.25` / Opus `$15.00` — those don't match the code's pricing table.

## Edge cases
- Estimate is input-tokens-only; actual task cost also includes output tokens, cache tokens, and tool usage.

## Key code
- `client/src/features/tasks/TokenEstimate.tsx` — `estimateTokens`, cost calculation, render threshold
- `client/src/lib/constants.ts` — `MODEL_COSTS` fallback table
- `client/src/lib/useModels.ts` — dynamic per-model `input_cost_per_mtok` / `output_cost_per_mtok`
