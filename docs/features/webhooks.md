# Webhooks

Per-project outbound notifications to Slack, Discord, Teams, or a custom HTTP endpoint when task events happen.

## Behavior
- Configured per project: platform, target URL, and an event subscription list (empty list = all events).
- On a subscribed event, `webhook::fire` spawns an async dispatch that POSTs a platform-shaped JSON payload to every enabled, matching webhook for the project, with a 10s send timeout. Delivery failures are logged, not retried.
- A **Test** button (`test_webhook`) sends a sample payload to verify the URL/platform before relying on it.

## Events
Selectable in the UI (`ALL_EVENTS`): `task_created`, `task_started`, `task_approved` (task moved to Done), `revision_requested`, `queue_auto_started`. Additional internal events (`task_timeout`, `circuit_breaker_activated`, and the git lifecycle events `branch_pushed`/`pr_created`/`pr_merged`) also fire and are delivered under "All Events," but aren't individually selectable in the events list.

> **Note:** event ids use underscore names (`task_started`, `task_approved`, ...), not the colon-style (`task:started`) names in an earlier version of this doc.

## Payload Formats
- **Slack** (`platform: "slack"`) — Block Kit `section` block with event type + message.
- **Discord** (`platform: "discord"`) — embed with title/description, color keyed off event type, timestamp, footer.
- **Teams** and **Custom** — both fall through to the same generic JSON shape: `{ event, message, timestamp, metadata }`. Teams does not currently get an Adaptive Card payload — it's selectable in the UI but rendered identically to Custom.

## Key code
- `src-tauri/src/services/webhook.rs` — `fire`/`dispatch`, `build_payload` per platform
- `src-tauri/src/db/webhooks.rs` — webhook CRUD, `get_enabled_by_project`
- `src-tauri/src/commands/webhooks.rs` — `test_webhook` and other commands
- `client/src/features/webhooks/WebhooksModal.tsx` — platform list, `ALL_EVENTS`, test button
