# Projects API

Project CRUD plus per-project automation/git/test/GitHub settings.

## Endpoints / commands
- `GET /api/projects` — all projects (`projects::get_all`).
- `GET /api/projects/summary` — all projects with per-status task counts (`projects::get_summary`).
- `GET /api/projects/{id}` — single project with full settings, 404 if missing.
- Tauri command `get_projects()` / `get_projects_summary()` / `get_project(id)` — same data, IPC form.
- Tauri command `create_project(name, slug, workingDir, icon?, iconSeed?, permissionMode?, allowedTools?, ...automation/git/test/timeout/retry/github/engine/circuitBreaker/approval/prProvider fields)` — validates `name`/`slug`/`workingDir` non-empty and `slug` unique; only writes the grouped settings whose fields were actually supplied (others keep DB defaults). Emits `project:created`.
- Tauri command `update_project(id, ...same fields, all optional)` — partial update, same grouped-write behavior. Emits `project:updated`.
- Tauri command `delete_project(id)` — stops any running agents for the project's tasks, deletes the project (cascades tasks/logs/webhooks/snippets/templates/attachments), emits `project:deleted`.
- Tauri command `reset_circuit_breaker(id)` — clears the circuit-breaker-active flag, emits `project:circuit_breaker` + `project:updated`, and resumes the queue.
- Tauri command `get_project_groups()` — groups all projects by detected namespace (git remote org/group, else parent directory name); used for the project picker.

## Notes
- **`POST /api/projects`, `PUT /api/projects/{id}`, and `DELETE /api/projects/{id}` do not exist in `services/http_api.rs`** — only the three `GET` routes above are registered. `client/src/lib/api.ts`'s `createProject`/`updateProject`/`deleteProject` HTTP fallbacks will 404; project mutation only works inside the Tauri app.
- Settings are grouped server-side: queue (`autoQueue`/`maxConcurrent`), git/PR (`autoBranch`/`autoPr`/`autoPush`/`autoMerge`/`prBaseBranch`), auto-test (`autoTest`/`testPrompt`), timeout, retries, GitHub sync (`githubRepo`/`githubSyncEnabled`), engine (`maxAutoRevisions`/retry backoff/`autoTestModel`), circuit breaker threshold, `requireApproval`, `prProvider`. Each group only writes if at least one of its fields is present in the call.
- Deleting a project is destructive and cascades everything under it — no soft-delete.

## Key code
- `src-tauri/src/services/http_api.rs` — the 3 read-only HTTP routes
- `src-tauri/src/commands/projects.rs` — full Tauri CRUD + settings + namespace grouping
