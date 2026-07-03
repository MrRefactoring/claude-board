# App Settings

Centralized configuration panel for startup behavior, defaults, and desktop preferences. Opened from the gear icon on the Dashboard or the project dropdown's App Settings entry.

## Behavior
- Settings are stored as key-value pairs in the `app_settings` SQLite table and applied immediately on toggle — there is no explicit Save step.
- `launch_at_startup` is additionally synced with the OS autostart mechanism (`tauri-plugin-autostart`) on both read and write; the stored value is corrected to match actual OS state on every `get_app_settings` call.
- `minimize_to_tray`, when enabled, hides the window to the system tray on close instead of quitting; the app is restored via tray left-click or "Claude Board" in the tray menu, and fully quit via the tray's Quit item.

## Settings
- `launch_at_startup` — auto-launch the app on system login (desktop only, hidden in web mode)
- `minimize_to_tray` — close hides to tray instead of quitting (desktop only)
- `confirm_before_delete` — show a confirmation dialog before deleting tasks/projects (default `true`)
- `auto_open_terminal` — automatically open the terminal panel when a task starts
- `chat_bypass_permissions` — when enabled, the AI chat runs with `--dangerously-skip-permissions` (no approval cards); when disabled, tool use outside the read-only whitelist prompts a Yes/Always/Deny card
- `default_model` — default Claude model for new tasks (default `sonnet`)
- `default_effort` — default thinking effort for new tasks: `low` / `medium` / `high` (default `medium`)
- `language` — UI display language: `en` or `tr`

> **Note:** Notification toggles (`notify_task_completed`, `notify_task_failed`, etc.) and `sound_enabled` also live in `app_settings` but are covered by the Notifications feature doc, not here.

## Key code
- `src-tauri/src/db/settings.rs` — `AppSettings` struct, defaults, get/set/update against `app_settings`
- `src-tauri/src/commands/settings.rs` — `get_app_settings` / `update_app_settings` commands, autostart sync
- `src-tauri/src/services/http_api.rs` — `GET`/`PUT /api/settings` for web mode
- `client/src/features/settings/GeneralTab.tsx` — general settings UI
- `client/src/features/settings/SettingsModal.tsx` — modal shell, defaults, persistence
- `client/src/lib/api.ts` — `getAppSettings` / `updateAppSettings`
