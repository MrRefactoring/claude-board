use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::DbPool;

/// A task comment / work-log entry. Authored by a `user` or an `agent`
/// (author_type), optionally carrying a PR link.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskComment {
    pub id: i64,
    pub task_id: i64,
    pub author_type: Option<String>,
    pub author_name: Option<String>,
    pub body: String,
    pub pr_url: Option<String>,
    pub created_at: Option<String>,
}

fn row_to(row: &rusqlite::Row) -> rusqlite::Result<TaskComment> {
    Ok(TaskComment {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        author_type: row.get("author_type")?,
        author_name: row.get("author_name")?,
        body: row.get("body")?,
        pr_url: row.get("pr_url")?,
        created_at: row.get("created_at")?,
    })
}

pub fn get_by_task(db: &DbPool, task_id: i64) -> Vec<TaskComment> {
    let conn = db.lock();
    let mut stmt = match conn.prepare("SELECT * FROM task_comments WHERE task_id=?1 ORDER BY id") {
        Ok(s) => s,
        Err(e) => { log::error!("comments::get_by_task: {}", e); return vec![]; }
    };
    let result = match stmt.query_map(params![task_id], row_to) {
        Ok(rows) => rows.flatten().collect(),
        Err(e) => { log::error!("comments::get_by_task: {}", e); vec![] }
    };
    result
}

/// Insert a comment. Returns the new row id (0 on error).
pub fn add(
    db: &DbPool,
    task_id: i64,
    author_type: &str,
    author_name: Option<&str>,
    body: &str,
    pr_url: Option<&str>,
) -> i64 {
    let conn = db.lock();
    match conn.execute(
        "INSERT INTO task_comments (task_id,author_type,author_name,body,pr_url) VALUES (?1,?2,?3,?4,?5)",
        params![task_id, author_type, author_name, body, pr_url],
    ) {
        Ok(_) => conn.last_insert_rowid(),
        Err(e) => { log::error!("comments::add: {}", e); 0 }
    }
}
