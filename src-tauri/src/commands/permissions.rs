//! Tauri commands backing the interactive tool-permission UI (Yes / Always / Deny).
//! The desktop webview uses these; web mode hits the equivalent HTTP routes in
//! services::http_api. Both delegate to services::permissions.

use crate::services::permissions::{self, PermissionRequest};

/// The chat / task view polls this while a run is active to render approval cards.
#[tauri::command]
pub fn get_pending_permissions() -> Vec<PermissionRequest> {
    permissions::list_pending()
}

/// Apply the user's choice for a pending request. `decision` is "allow" or "deny";
/// `remember` (allow only) auto-approves that tool for the rest of the session.
#[tauri::command]
pub fn resolve_permission(id: String, decision: String, remember: bool) -> Result<bool, String> {
    Ok(permissions::resolve(&id, &decision, remember))
}
