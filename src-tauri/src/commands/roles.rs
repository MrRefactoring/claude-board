use tauri::{AppHandle, Emitter};
use crate::db::{self, roles as rq};

#[tauri::command]
pub fn get_roles(project_id: i64) -> Vec<rq::Role> {
    rq::get_by_project(&db::get_db(), project_id)
}

#[tauri::command]
pub fn get_global_roles() -> Vec<rq::Role> {
    rq::get_global(&db::get_db())
}

#[tauri::command]
pub fn create_role(
    app: AppHandle, project_id: Option<i64>,
    name: String, description: Option<String>, prompt: Option<String>, color: Option<String>,
    model: Option<String>, allowed_tools: Option<String>, task_type_affinity: Option<String>,
) -> Result<rq::Role, String> {
    let db = db::get_db();
    let id = rq::create(&db, project_id, &name,
        description.as_deref().unwrap_or(""),
        prompt.as_deref().unwrap_or(""),
        color.as_deref().unwrap_or("#6B7280"),
        model.as_deref(), allowed_tools.as_deref(), task_type_affinity.as_deref());
    let role = rq::get_by_id(&db, id).ok_or("Role not found")?;
    app.emit("role:created", &role).ok();
    Ok(role)
}

#[tauri::command]
pub fn update_role(
    app: AppHandle, id: i64,
    name: String, description: Option<String>, prompt: Option<String>, color: Option<String>,
    model: Option<String>, allowed_tools: Option<String>, task_type_affinity: Option<String>,
) -> Result<rq::Role, String> {
    let db = db::get_db();
    rq::update(&db, id, &name,
        description.as_deref().unwrap_or(""),
        prompt.as_deref().unwrap_or(""),
        color.as_deref().unwrap_or("#6B7280"),
        model.as_deref(), allowed_tools.as_deref(), task_type_affinity.as_deref());
    let role = rq::get_by_id(&db, id).ok_or("Role not found")?;
    app.emit("role:updated", &role).ok();
    Ok(role)
}

#[tauri::command]
pub fn delete_role(app: AppHandle, id: i64) {
    rq::delete(&db::get_db(), id);
    app.emit("role:deleted", &serde_json::json!({"id": id})).ok();
}

/// Recurring ad-hoc (model, task_type) configs worth saving as a reusable agent.
#[tauri::command]
pub fn get_agent_suggestions(project_id: i64) -> Vec<crate::services::agent_recurrence::AgentSuggestion> {
    crate::services::agent_recurrence::suggest(&db::get_db(), project_id, 4)
}
