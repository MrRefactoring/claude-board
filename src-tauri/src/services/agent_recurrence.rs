//! Reusable-agent recurrence detection (req #5).
//!
//! When the same ad-hoc configuration (a model + task type, with no saved role)
//! keeps showing up across a project's tasks, that's a signal the user is
//! re-creating the same agent by hand. We surface it as a suggestion to save a
//! reusable agent (a `roles` row) so it can be reused and assigned by the chat.

use serde::Serialize;
use rusqlite::params;
use crate::db::DbPool;

#[derive(Debug, Clone, Serialize)]
pub struct AgentSuggestion {
    pub model: String,
    pub task_type: String,
    pub count: i64,
    pub sample_titles: Vec<String>,
}

/// Find recurring (model, task_type) configurations among ad-hoc tasks
/// (role_id IS NULL) that occur at least `threshold` times and aren't already
/// covered by a saved agent pinning that model.
pub fn suggest(db: &DbPool, project_id: i64, threshold: i64) -> Vec<AgentSuggestion> {
    let conn = db.lock();

    // Models already pinned by an existing agent (project-local or global) →
    // don't re-suggest; the user already has a reusable agent for them.
    let mut existing_models: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT model FROM roles WHERE model IS NOT NULL AND model != '' \
         AND (project_id = ?1 OR project_id IS NULL)",
    ) {
        if let Ok(rows) = stmt.query_map(params![project_id], |r| r.get::<_, String>(0)) {
            for m in rows.flatten() {
                existing_models.insert(m);
            }
        }
    }

    let mut stmt = match conn.prepare(
        "SELECT model, COALESCE(task_type,'feature') AS tt, COUNT(*) AS cnt, \
                GROUP_CONCAT(title, '||') AS titles \
         FROM tasks \
         WHERE project_id = ?1 AND role_id IS NULL AND model IS NOT NULL AND model != '' \
           AND (task_level IS NULL OR task_level NOT IN ('epic','story')) \
         GROUP BY model, tt HAVING cnt >= ?2 ORDER BY cnt DESC",
    ) {
        Ok(s) => s,
        Err(e) => {
            log::error!("agent_recurrence: {}", e);
            return vec![];
        }
    };

    let rows = stmt.query_map(params![project_id, threshold], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, Option<String>>(3)?,
        ))
    });

    let mut out = vec![];
    if let Ok(rows) = rows {
        for (model, task_type, count, titles) in rows.flatten() {
            if existing_models.contains(&model) {
                continue;
            }
            let sample_titles = titles
                .unwrap_or_default()
                .split("||")
                .filter(|s| !s.is_empty())
                .take(3)
                .map(|s| s.to_string())
                .collect();
            out.push(AgentSuggestion { model, task_type, count, sample_titles });
        }
    }
    out
}
