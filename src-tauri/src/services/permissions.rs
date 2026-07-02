//! In-memory registry of pending tool-permission requests for the interactive
//! Yes / Yes-always / Deny flow shared by the AI chat and the task runner.
//!
//! Flow: Claude (headless `-p`) is launched with
//! `--permission-prompt-tool mcp__claude-board__approve_permission`. When it wants
//! a tool that isn't pre-allowed, it calls that MCP tool, which POSTs a request
//! here (`create`) and polls `get` until the status flips. The UI polls
//! `list_pending`, shows a card, and calls `resolve`. Nothing is persisted —
//! "always allow" (`remembered`) lasts only for the app session.

use std::collections::{HashMap, HashSet};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;

/// A single pending (or just-resolved) permission request.
#[derive(Clone, Serialize)]
pub struct PermissionRequest {
    pub id: String,
    pub tool_name: String,
    /// Raw tool input Claude wants to run (opaque JSON, shown to the user).
    pub input: serde_json::Value,
    /// "chat" or "task".
    pub origin: String,
    /// Set when `origin == "task"` so the UI can attach the card to that task.
    pub task_id: Option<i64>,
    /// "pending" | "allow" | "deny".
    pub status: String,
    /// Reason shown back to Claude on deny.
    pub message: Option<String>,
    /// Epoch millis when created (ordering + stale cleanup).
    pub created_at: u128,
}

struct PermState {
    pending: HashMap<String, PermissionRequest>,
    /// Tools the user chose "always allow" for, this session.
    remembered: HashSet<String>,
}

static STATE: Lazy<Mutex<PermState>> = Lazy::new(|| {
    Mutex::new(PermState {
        pending: HashMap::new(),
        remembered: HashSet::new(),
    })
});

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Register a new permission request. If the tool was already "always allowed"
/// this session, the request is created pre-resolved to `allow` (no user prompt).
pub fn create(
    tool_name: &str,
    input: serde_json::Value,
    origin: &str,
    task_id: Option<i64>,
) -> PermissionRequest {
    let id = uuid::Uuid::new_v4().to_string();
    let mut st = STATE.lock();
    cleanup(&mut st); // opportunistic — keep the map from growing forever
    let auto = st.remembered.contains(tool_name);
    let req = PermissionRequest {
        id: id.clone(),
        tool_name: tool_name.to_string(),
        input,
        origin: origin.to_string(),
        task_id,
        status: if auto { "allow".into() } else { "pending".into() },
        message: None,
        created_at: now_millis(),
    };
    st.pending.insert(id, req.clone());
    log::info!(
        "[permission] request {} tool={} origin={} task={:?} -> {}",
        req.id, req.tool_name, req.origin, req.task_id, req.status
    );
    req
}

/// Current status of a request (the MCP sidecar polls this).
pub fn get(id: &str) -> Option<PermissionRequest> {
    STATE.lock().pending.get(id).cloned()
}

/// All requests still awaiting a decision (the UI polls this), oldest first.
pub fn list_pending() -> Vec<PermissionRequest> {
    let st = STATE.lock();
    let mut v: Vec<PermissionRequest> = st
        .pending
        .values()
        .filter(|r| r.status == "pending")
        .cloned()
        .collect();
    v.sort_by_key(|r| r.created_at);
    v
}

/// Resolve a request from the UI. `remember` (only meaningful for allow) adds the
/// tool to the session allow-set so future requests for it auto-allow.
/// Returns false if the id is unknown.
pub fn resolve(id: &str, decision: &str, remember: bool) -> bool {
    let mut st = STATE.lock();
    let tool_name = match st.pending.get(id) {
        Some(r) => r.tool_name.clone(),
        None => return false,
    };
    let allow = decision != "deny";
    if remember && allow {
        st.remembered.insert(tool_name.clone());
    }
    if let Some(r) = st.pending.get_mut(id) {
        r.status = if allow { "allow".into() } else { "deny".into() };
        r.message = if allow { None } else { Some("Denied by user".into()) };
    }
    log::info!(
        "[permission] resolve {} tool={} decision={} remember={}",
        id, tool_name, if allow { "allow" } else { "deny" }, remember
    );
    true
}

/// Drop resolved requests after ~2 min and pending after ~10 min (the sidecar
/// times out at ~5 min, so anything older is dead).
fn cleanup(st: &mut PermState) {
    let now = now_millis();
    st.pending.retain(|_, r| {
        let age = now.saturating_sub(r.created_at);
        match r.status.as_str() {
            "pending" => age < 10 * 60 * 1000,
            _ => age < 2 * 60 * 1000,
        }
    });
}
