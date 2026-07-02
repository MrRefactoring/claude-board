use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::DbPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub id: i64,
    pub project_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub prompt: Option<String>,
    pub color: Option<String>,
    // Reusable-agent config (all nullable; late columns → `.ok().flatten()`).
    pub model: Option<String>,
    pub allowed_tools: Option<String>,
    pub task_type_affinity: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

fn row_to(row: &rusqlite::Row) -> rusqlite::Result<Role> {
    Ok(Role {
        id: row.get("id")?, project_id: row.get("project_id")?,
        name: row.get("name")?, description: row.get("description")?,
        prompt: row.get("prompt")?, color: row.get("color")?,
        model: row.get("model").ok().flatten(),
        allowed_tools: row.get("allowed_tools").ok().flatten(),
        task_type_affinity: row.get("task_type_affinity").ok().flatten(),
        created_at: row.get("created_at")?, updated_at: row.get("updated_at")?,
    })
}

pub fn get_by_project(db: &DbPool, pid: i64) -> Vec<Role> {
    let conn = db.lock();
    let mut stmt = match conn.prepare("SELECT * FROM roles WHERE project_id=?1 OR project_id IS NULL ORDER BY project_id IS NULL, name") {
        Ok(s) => s,
        Err(e) => { log::error!("get_by_project: {}", e); return vec![]; }
    };
    let result = match stmt.query_map(params![pid], row_to) {
        Ok(rows) => rows.flatten().collect(),
        Err(e) => { log::error!("get_by_project: {}", e); vec![] }
    };
    result
}

pub fn get_global(db: &DbPool) -> Vec<Role> {
    let conn = db.lock();
    let mut stmt = match conn.prepare("SELECT * FROM roles WHERE project_id IS NULL ORDER BY name") {
        Ok(s) => s,
        Err(e) => { log::error!("get_global: {}", e); return vec![]; }
    };
    let result = match stmt.query_map([], row_to) {
        Ok(rows) => rows.flatten().collect(),
        Err(e) => { log::error!("get_global: {}", e); vec![] }
    };
    result
}

pub fn get_by_id(db: &DbPool, id: i64) -> Option<Role> {
    let conn = db.lock();
    let mut stmt = match conn.prepare("SELECT * FROM roles WHERE id=?1") {
        Ok(s) => s,
        Err(e) => { log::error!("get_by_id: {}", e); return None; }
    };
    stmt.query_row(params![id], row_to).ok()
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    db: &DbPool, pid: Option<i64>, name: &str, description: &str, prompt: &str, color: &str,
    model: Option<&str>, allowed_tools: Option<&str>, task_type_affinity: Option<&str>,
) -> i64 {
    let conn = db.lock();
    match conn.execute(
        "INSERT INTO roles (project_id,name,description,prompt,color,model,allowed_tools,task_type_affinity) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![pid, name, description, prompt, color, model, allowed_tools, task_type_affinity],
    ) {
        Ok(_) => {},
        Err(e) => { log::error!("create: {}", e); return 0; }
    };
    conn.last_insert_rowid()
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    db: &DbPool, id: i64, name: &str, description: &str, prompt: &str, color: &str,
    model: Option<&str>, allowed_tools: Option<&str>, task_type_affinity: Option<&str>,
) {
    let conn = db.lock();
    if let Err(e) = conn.execute(
        "UPDATE roles SET name=?1,description=?2,prompt=?3,color=?4,model=?5,allowed_tools=?6,\
         task_type_affinity=?7,updated_at=datetime('now','localtime') WHERE id=?8",
        params![name, description, prompt, color, model, allowed_tools, task_type_affinity, id],
    ) { log::error!("update: {}", e); }
}

pub fn delete(db: &DbPool, id: i64) {
    let conn = db.lock();
    if let Err(e) = conn.execute("DELETE FROM roles WHERE id=?1", params![id]) { log::error!("delete: {}", e); }
}
