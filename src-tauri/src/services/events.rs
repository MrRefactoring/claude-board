//! Global realtime-event bridge.
//!
//! The Axum HTTP API (used by the embedded MCP sidecar) runs without an
//! `AppHandle`, so its handlers could not emit Tauri events — tasks created or
//! mutated over the REST bridge (e.g. from the AI chat's `create_task` tool)
//! only showed up on the board after a manual reload. This module stashes the
//! `AppHandle` once at setup time so any code path — command or HTTP handler —
//! can emit the same events the UI already listens for.
//!
//! In web/dev mode (no Tauri shell) the handle is simply never set and `emit`
//! is a no-op; the Socket.IO transport carries events there instead.

use once_cell::sync::OnceCell;
use tauri::{AppHandle, Emitter};

static APP: OnceCell<AppHandle> = OnceCell::new();

/// Register the app handle. Called once from the Tauri `setup` hook.
pub fn init(app: AppHandle) {
    if APP.set(app).is_err() {
        log::warn!("events::init called more than once — ignoring");
    }
}

/// Emit a realtime event to the webview if the app handle is available.
/// No-op when running without a Tauri shell (web mode).
pub fn emit<T: serde::Serialize + Clone>(event: &str, payload: &T) {
    if let Some(app) = APP.get() {
        if let Err(e) = app.emit(event, payload.clone()) {
            log::warn!("events::emit({}) failed: {}", event, e);
        }
    }
}
