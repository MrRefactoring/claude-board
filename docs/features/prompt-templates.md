# Prompt Templates

Reusable, per-task-type instruction blocks injected into Claude's prompt. Used to enforce coding standards, framework conventions, and quality guidelines without repeating them per task.

## Behavior

A template is a project-scoped row with `name`, `template` (body text, may contain `{{variable}}` placeholders), `task_type`, `model`, `thinking_effort`, and an optional `variables` JSON array (`{name, label, placeholder, default}`).

Two independent mechanisms use templates:

1. **Automatic server-side injection.** When an agent starts, `templates::find_for_task` looks up the template whose `task_type` exactly matches the task's `task_type` (`SELECT ... WHERE project_id=? AND task_type=? ORDER BY id DESC LIMIT 1`). If found, its `name`, `description`, and `template` body are injected into the prompt. If no template matches, the prompt is built without one — no error, no fallback to another template.
2. **Manual client-side description generation.** In the task creation modal, the user can explicitly pick a template from the selector. Its `{{variable}}` placeholders (declared in `variables`) are substituted client-side from user input (or each variable's `default`), and the resulting text is appended to the task's `description` field before the task is created. Selecting a template also pre-fills `task_type`, `model`, and `thinking_effort` from the template.

These are independent: the automatic injection (1) fires for *any* task of a matching type regardless of whether the user manually picked a template in the modal (2).

## Settings

- `task_type` — one of `feature`, `bugfix`, `refactor`, `test`, `docs`, `chore` (`client/src/lib/constants.ts` `TASK_TYPES`); matched exactly, no partial/fallback matching despite the `find_for_task` doc comment implying one.
- `model`, `thinking_effort` — carried on the template; applied to the task when the template is selected in the UI (not part of server-side auto-injection).

## Edge cases

- No matching template for a task's type → prompt has no template section, task proceeds normally.
- Template `variables` fails to parse as JSON → treated as empty; `{{var}}` placeholders in the body are left unsubstituted (client-side path only).

## Key code

- `src-tauri/src/db/templates.rs` — `Template` model, CRUD, `find_for_task` (exact `task_type` match).
- `src-tauri/src/commands/templates.rs` — Tauri commands (`get_templates`, `create_template`, `update_template`, `delete_template`) + `template:created/updated/deleted` events.
- `src-tauri/src/claude/runner.rs` (~line 1638) — loads the matching template via `find_for_task` before building the prompt.
- `src-tauri/src/claude/prompt.rs` (`build_prompt`) — actual injection order: Role → Prompt Template → Task title/description/acceptance criteria → revision history → parent-dependency context → Project Context (snippets) → Attached Files → Claude Board Integration tools → Instructions.
- `client/src/features/tasks/TaskModal.tsx` — client-side `{{variable}}` substitution (`generatedDescription`), appended to the task description on submit.
- `client/src/features/tasks/TemplateSelector.tsx` — template picker + variable inputs in the task creation modal.
- `client/src/features/templates/TemplatesModal.tsx` — template CRUD UI, including the variable editor.
