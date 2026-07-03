# claude-board

Tauri v2 desktop app: React 19 + TS (strict) client in `client/`, Rust/Axum + SQLite backend in `src-tauri/`, embedded MCP sidecar at `src-tauri/resources/mcp-server.js`. The client also runs in a web fallback mode (socket.io + REST) when not inside Tauri.

## Engineering Principles

Apply these to **everything** written in this repo — production code, tests, scripts, config.

- **KISS** — keep it simple. Prefer the most straightforward solution that works. No clever code where plain code does the job.
- **YAGNI** — build only what the current task requires. No speculative features, options, abstractions, or "future-proofing" for requirements that don't exist yet.
- **DRY** — no duplicated knowledge. Extract a shared helper when the *same* logic appears in multiple places — but don't over-DRY: two superficially similar lines that may diverge are not duplication. KISS/YAGNI win ties.
- **SOLID**
  - **S** — Single responsibility: each module, component, hook, or function does one thing.
  - **O** — Open/closed: extend behavior via new code (new ports, props, variants), not by editing stable internals.
  - **L** — Liskov substitution: implementations of a port/interface must be interchangeable without surprising callers.
  - **I** — Interface segregation: keep props and trait surfaces narrow; don't force consumers to depend on what they don't use.
  - **D** — Dependency inversion: depend on abstractions — in the client that means `client/src/lib/api.ts` and `lib/socket.ts` (the dual Tauri/HTTP transport shims), never raw Tauri `invoke`, `fetch`, or socket.io directly from components; in Rust, traits over concrete services.

Principle conflicts resolve toward simplicity: KISS and YAGNI take precedence over premature SOLID/DRY structure.

## Architecture notes

- **Realtime events are the data-freshness mechanism.** The backend emits typed events (`client/src/lib/events.ts`) over Tauri events / socket.io; the client updates state from them. Do not add polling for data that has an event.
- Reusable client patterns: `lib/tauriEvents.ts` (safe listen/unlisten with cancelled-flag), `lib/constants.ts` (shared color/status maps), `lib/formatters.ts` (date/number formatting).

## Verification

From the repo root, all must pass before a change is done:

```bash
npm run type-check && npm run lint && npm run test && npm run build
```

Rust side (when `src-tauri/` is touched): `cargo check` and `cargo test` in `src-tauri/`.

Lint policy is **zero-warning** (`--max-warnings 0` in scripts and the pre-commit
hook): every rule is either `error` or `off` with a rationale comment in
`client/eslint.config.js`. An `eslint-disable` is only acceptable as a targeted
`eslint-disable-next-line <rule> -- <reason>`; never blanket-disable a rule for
a file and never disable without the reason.

## Documentation

`docs/` is **internal engineering documentation** — plain markdown (`.md`), no
site generator, no build step, no translations. It is the source of truth for
**how things should behave**. Structure:

- `docs/concepts/` — the core model (agents, board, tasks, review).
- `docs/features/` — one concise spec per feature.
- `docs/configuration/` — project/permission/environment settings.
- `docs/api/` — internal reference for the Tauri IPC commands and the `/api/*`
  HTTP bridge.
- `docs/desktop/` — build & setup.
- `docs/README.md` — index linking the above.

Every functional change ships with its spec **in the same change**. Each spec is
short and behavioral (not marketing, not code internals), following this shape —
omit sections that don't apply:

```
# <Title>

<1–2 line purpose.>

## Behavior
## States & transitions   (if any)
## Settings               (real project/task setting names)
## Edge cases
## Key code               (paths + role)
```

The doc is the contract: the code must match it. New feature or behavior change →
create/update the matching `docs/features/<name>.md` (or `concepts/`) and link it
from `docs/README.md`. A behavior change that leaves its spec stale is a bug —
update the spec, don't let it drift.
