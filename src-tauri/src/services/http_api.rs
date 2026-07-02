/// Lightweight HTTP API for MCP server communication.
/// The MCP server (Node.js sidecar) talks to this API to manage tasks.
use axum::{
    Router, Json,
    extract::{Path, Query},
    routing::{get, patch, post},
    http::StatusCode,
    response::IntoResponse,
};
use tower_http::cors::CorsLayer;
use serde::Deserialize;
use crate::db::{self, projects, tasks, stats, activity, attachments, settings, dependencies};

/// Helper: serialize to JSON Value, fallback to empty object on error.
fn to_json<T: serde::Serialize>(val: &T) -> serde_json::Value {
    serde_json::to_value(val).unwrap_or_default()
}

pub async fn start_server(port: u16) {
    let app = Router::new()
        // Projects
        .route("/api/projects", get(list_projects))
        .route("/api/projects/summary", get(projects_summary))
        .route("/api/projects/{id}", get(get_project))
        // Tasks
        .route("/api/projects/{project_id}/tasks", get(list_tasks).post(create_task))
        .route("/api/tasks/{id}", get(get_task).put(update_task).delete(delete_task_handler))
        .route("/api/tasks/{id}/status", patch(change_status))
        .route("/api/tasks/{id}/detail", get(task_detail))
        .route("/api/tasks/{id}/logs", get(task_logs))
        .route("/api/tasks/{id}/revisions", get(task_revisions))
        .route("/api/tasks/{id}/dependencies", post(add_task_dependency_handler))
        .route("/api/tasks/{id}/comments", get(list_task_comments).post(post_task_comment))
        .route("/api/tasks/{id}/pr-intent", post(set_pr_intent_handler))
        .route("/api/projects/{project_id}/roles", get(list_project_roles))
        .route("/api/projects/{project_id}/tasks/bulk", post(create_tasks_bulk))
        // Stats
        .route("/api/projects/{pid}/stats", get(project_stats))
        .route("/api/stats/claude-usage", get(claude_usage))
        .route("/api/projects/{pid}/activity", get(project_activity))
        // Auth
        .route("/api/auth/status", get(auth_status))
        // Settings
        .route("/api/settings", get(get_settings).put(update_settings))
        .layer(CorsLayer::permissive());

    let listener = match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("Failed to bind MCP HTTP API on port {}: {}", port, e);
            return;
        }
    };
    log::info!("MCP HTTP API listening on port {}", port);
    axum::serve(listener, app).await.ok();
}

// ─── Handlers ───

async fn list_projects() -> Json<serde_json::Value> {
    Json(to_json(&projects::get_all(&db::get_db())))
}

async fn projects_summary() -> Json<serde_json::Value> {
    Json(to_json(&projects::get_summary(&db::get_db())))
}

async fn get_project(Path(id): Path<i64>) -> impl IntoResponse {
    match projects::get_by_id(&db::get_db(), id) {
        Some(p) => Json(to_json(&p)).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn list_tasks(Path(project_id): Path<i64>) -> Json<serde_json::Value> {
    Json(to_json(&tasks::get_by_project(&db::get_db(), project_id)))
}

#[derive(Deserialize)]
struct CreateTaskBody {
    title: String,
    description: Option<String>,
    priority: Option<i64>,
    task_type: Option<String>,
    acceptance_criteria: Option<String>,
    model: Option<String>,
    thinking_effort: Option<String>,
    tags: Option<String>,
    parent_task_id: Option<i64>,
    // AI orchestration extensions
    task_level: Option<String>,
    story_points: Option<i64>,
    role_id: Option<i64>,
    auto_pr: Option<i64>,
}

async fn create_task(Path(project_id): Path<i64>, Json(body): Json<CreateTaskBody>) -> impl IntoResponse {
    let db = db::get_db();
    let id = tasks::create(&db, project_id, &body.title,
        body.description.as_deref().unwrap_or(""),
        body.priority.unwrap_or(0),
        body.task_type.as_deref().unwrap_or("feature"),
        body.acceptance_criteria.as_deref().unwrap_or(""),
        body.model.as_deref().unwrap_or("sonnet"),
        body.thinking_effort.as_deref().unwrap_or("medium"),
        body.role_id,
        body.tags.as_deref(),
    );
    apply_task_extras(&db, id, body.task_level.as_deref(), body.story_points, body.auto_pr);
    // Link as sub-task if parent_task_id provided
    if let Some(parent_id) = body.parent_task_id {
        if tasks::get_by_id(&db, parent_id).is_some() {
            tasks::set_parent_task_id(&db, id, parent_id);
            tasks::set_awaiting_subtasks(&db, parent_id, true);
        }
    }
    match tasks::get_by_id(&db, id) {
        Some(task) => (StatusCode::CREATED, Json(to_json(&task))).into_response(),
        None => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// Apply the AI-orchestration columns after a task is created. `task_level`
/// defaults to `task` at the DB layer, so we only set it when explicitly given.
fn apply_task_extras(db: &db::DbPool, id: i64, task_level: Option<&str>, story_points: Option<i64>, auto_pr: Option<i64>) {
    if let Some(level) = task_level {
        tasks::set_task_level(db, id, level);
    }
    if story_points.is_some() {
        tasks::set_story_points(db, id, story_points);
    }
    if auto_pr.is_some() {
        tasks::set_auto_pr(db, id, auto_pr);
    }
}

// ─── Dependencies ───

#[derive(Deserialize)]
struct AddDependencyBody {
    depends_on_id: i64,
    condition_type: Option<String>,
}

/// POST /api/tasks/{id}/dependencies — task {id} depends on {depends_on_id}.
async fn add_task_dependency_handler(Path(id): Path<i64>, Json(body): Json<AddDependencyBody>) -> impl IntoResponse {
    let db = db::get_db();
    match dependencies::add_dependency(&db, id, body.depends_on_id, body.condition_type.as_deref()) {
        Ok(_) => Json(serde_json::json!({"ok": true, "task_id": id, "depends_on_id": body.depends_on_id})).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── Comments ───

async fn list_task_comments(Path(id): Path<i64>) -> Json<serde_json::Value> {
    Json(to_json(&db::comments::get_by_task(&db::get_db(), id)))
}

#[derive(Deserialize)]
struct CommentBody {
    body: String,
    author_type: Option<String>,
    author_name: Option<String>,
    pr_url: Option<String>,
}

/// POST /api/tasks/{id}/comments — used by the MCP add_task_comment tool.
async fn post_task_comment(Path(id): Path<i64>, Json(b): Json<CommentBody>) -> impl IntoResponse {
    let db = db::get_db();
    let cid = db::comments::add(
        &db, id,
        b.author_type.as_deref().unwrap_or("agent"),
        b.author_name.as_deref(),
        &b.body,
        b.pr_url.as_deref(),
    );
    if cid > 0 {
        (StatusCode::CREATED, Json(serde_json::json!({"id": cid, "task_id": id}))).into_response()
    } else {
        StatusCode::INTERNAL_SERVER_ERROR.into_response()
    }
}

// ─── Per-task PR intent ───

#[derive(Deserialize)]
struct PrIntentBody {
    /// true = always open a PR for this task, false = never, null = inherit project.
    auto_pr: Option<bool>,
}

/// POST /api/tasks/{id}/pr-intent — set the per-task auto_pr override (req #4).
async fn set_pr_intent_handler(Path(id): Path<i64>, Json(b): Json<PrIntentBody>) -> impl IntoResponse {
    let db = db::get_db();
    let value = b.auto_pr.map(|v| if v { 1 } else { 0 });
    db::tasks::set_auto_pr(&db, id, value);
    (StatusCode::OK, Json(serde_json::json!({"id": id, "auto_pr": value}))).into_response()
}

// ─── Reusable agents (roles) ───

/// GET /api/projects/{project_id}/roles — lets the chat/decompose pick an agent by id.
async fn list_project_roles(Path(project_id): Path<i64>) -> Json<serde_json::Value> {
    Json(to_json(&db::roles::get_by_project(&db::get_db(), project_id)))
}

// ─── Bulk decompose ───

#[derive(Deserialize)]
struct BulkNode {
    title: String,
    description: Option<String>,
    priority: Option<i64>,
    task_type: Option<String>,
    acceptance_criteria: Option<String>,
    model: Option<String>,
    thinking_effort: Option<String>,
    tags: Option<String>,
    task_level: Option<String>,
    story_points: Option<i64>,
    role_id: Option<i64>,
    auto_pr: Option<i64>,
    /// Index (into `nodes`) of this node's hierarchy parent (epic→story→task→subtask).
    parent: Option<usize>,
}

#[derive(Deserialize)]
struct BulkBody {
    nodes: Vec<BulkNode>,
    /// Dependency edges as `[parent_index, child_index]`: child depends on parent
    /// (same index convention as the planning pipeline's approve_plan).
    #[serde(default)]
    edges: Vec<[usize; 2]>,
}

/// POST /api/projects/{project_id}/tasks/bulk — atomically create a hierarchy of
/// tasks (epic/story/task/subtask) with tree links and dependency edges in one call.
async fn create_tasks_bulk(Path(project_id): Path<i64>, Json(body): Json<BulkBody>) -> impl IntoResponse {
    let db = db::get_db();

    // Pass 1: create every node, remembering ids by index.
    let mut ids: Vec<i64> = Vec::with_capacity(body.nodes.len());
    for n in &body.nodes {
        let task_type = n.task_type.as_deref().unwrap_or("feature");
        // Per-task model: an explicit valid alias wins; otherwise auto-pick a tier
        // by task_type/level/size (same heuristic as the planning pipeline).
        let task_model = n
            .model
            .as_deref()
            .filter(|m| crate::commands::planning::is_valid_model(m))
            .map(str::to_string)
            .unwrap_or_else(|| {
                crate::commands::planning::suggest_model(
                    task_type,
                    n.task_level.as_deref(),
                    n.story_points,
                    "sonnet",
                )
            });
        let id = tasks::create(&db, project_id, &n.title,
            n.description.as_deref().unwrap_or(""),
            n.priority.unwrap_or(0),
            task_type,
            n.acceptance_criteria.as_deref().unwrap_or(""),
            &task_model,
            n.thinking_effort.as_deref().unwrap_or("medium"),
            n.role_id,
            n.tags.as_deref(),
        );
        apply_task_extras(&db, id, n.task_level.as_deref(), n.story_points, n.auto_pr);
        ids.push(id);
    }

    // Pass 2: wire tree parents (parent_task_id + awaiting_subtasks on the container).
    for (i, n) in body.nodes.iter().enumerate() {
        if let Some(pidx) = n.parent {
            if let (Some(&child_id), Some(&parent_id)) = (ids.get(i), ids.get(pidx)) {
                if child_id > 0 && parent_id > 0 {
                    tasks::set_parent_task_id(&db, child_id, parent_id);
                    tasks::set_awaiting_subtasks(&db, parent_id, true);
                }
            }
        }
    }

    // Pass 3: dependency edges — child (edge[1]) depends on parent (edge[0]).
    for [pidx, cidx] in &body.edges {
        if let (Some(&parent_id), Some(&child_id)) = (ids.get(*pidx), ids.get(*cidx)) {
            if parent_id > 0 && child_id > 0 {
                dependencies::add_dependency(&db, child_id, parent_id, None).ok();
            }
        }
    }

    let created: Vec<serde_json::Value> = ids.iter()
        .filter_map(|&id| tasks::get_by_id(&db, id).map(|t| to_json(&t)))
        .collect();
    (StatusCode::CREATED, Json(serde_json::json!({"tasks": created}))).into_response()
}

async fn get_task(Path(id): Path<i64>) -> impl IntoResponse {
    match tasks::get_by_id(&db::get_db(), id) {
        Some(t) => Json(to_json(&t)).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateTaskBody {
    title: Option<String>,
    description: Option<String>,
    priority: Option<i64>,
    task_type: Option<String>,
    acceptance_criteria: Option<String>,
    model: Option<String>,
    thinking_effort: Option<String>,
    tags: Option<String>,
}

async fn update_task(Path(id): Path<i64>, Json(body): Json<UpdateTaskBody>) -> impl IntoResponse {
    let db = db::get_db();
    let task = match tasks::get_by_id(&db, id) {
        Some(t) => t,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    tasks::update(&db, id,
        body.title.as_deref().unwrap_or(&task.title),
        body.description.as_deref().unwrap_or(task.description.as_deref().unwrap_or("")),
        body.priority.unwrap_or(task.priority.unwrap_or(0)),
        body.task_type.as_deref().unwrap_or(task.task_type.as_deref().unwrap_or("feature")),
        body.acceptance_criteria.as_deref().unwrap_or(task.acceptance_criteria.as_deref().unwrap_or("")),
        body.model.as_deref().unwrap_or(task.model.as_deref().unwrap_or("sonnet")),
        body.thinking_effort.as_deref().unwrap_or(task.thinking_effort.as_deref().unwrap_or("medium")),
        task.role_id,
        body.tags.as_deref().or(task.tags.as_deref()),
    );
    match tasks::get_by_id(&db, id) {
        Some(updated) => Json(to_json(&updated)).into_response(),
        None => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn delete_task_handler(Path(id): Path<i64>) -> impl IntoResponse {
    tasks::delete(&db::get_db(), id);
    Json(serde_json::json!({"ok": true}))
}

#[derive(Deserialize)]
struct StatusBody {
    status: String,
}

async fn change_status(Path(id): Path<i64>, Json(body): Json<StatusBody>) -> impl IntoResponse {
    let db = db::get_db();
    tasks::update_status(&db, id, &body.status);
    // Keep GSD roadmap (DB + ROADMAP.md) in sync when task status is changed
    // via the MCP HTTP bridge. No AppHandle here → UI refresh is skipped but
    // the file/DB state stays consistent.
    crate::services::gsd::apply_task_status_cascade(&db, None, id);
    match tasks::get_by_id(&db, id) {
        Some(t) => Json(to_json(&t)).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn task_detail(Path(id): Path<i64>) -> impl IntoResponse {
    let db = db::get_db();
    let task = match tasks::get_by_id(&db, id) {
        Some(t) => t,
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let revisions = tasks::get_revisions(&db, id);
    let atts = attachments::get_by_task(&db, id);
    let commits: serde_json::Value = task.commits.as_deref()
        .and_then(|c| serde_json::from_str(c).ok())
        .unwrap_or(serde_json::json!([]));

    let mut val = to_json(&task);
    if let Some(obj) = val.as_object_mut() {
        obj.insert("commits".into(), commits);
        obj.insert("revisions".into(), to_json(&revisions));
        obj.insert("attachments".into(), to_json(&atts));
    }
    Json(val).into_response()
}

#[derive(Deserialize)]
struct LogsQuery { limit: Option<i64> }

async fn task_logs(Path(id): Path<i64>, Query(q): Query<LogsQuery>) -> Json<serde_json::Value> {
    let mut logs = tasks::get_recent_logs(&db::get_db(), id, q.limit.unwrap_or(500));
    logs.reverse();
    Json(to_json(&logs))
}

async fn task_revisions(Path(id): Path<i64>) -> Json<serde_json::Value> {
    Json(to_json(&tasks::get_revisions(&db::get_db(), id)))
}

async fn project_stats(Path(pid): Path<i64>) -> Json<serde_json::Value> {
    Json(to_json(&stats::get_project_stats(&db::get_db(), pid)))
}

async fn claude_usage() -> Json<serde_json::Value> {
    let db = db::get_db();
    Json(serde_json::json!({
        "usage": stats::get_global_usage(&db),
        "models": stats::get_global_model_breakdown(&db),
        "timeline": stats::get_usage_timeline(&db),
        "limits": stats::get_claude_limits(&db),
    }))
}

#[derive(Deserialize)]
struct ActivityQuery { limit: Option<i64>, offset: Option<i64> }

async fn project_activity(Path(pid): Path<i64>, Query(q): Query<ActivityQuery>) -> Json<serde_json::Value> {
    Json(to_json(&activity::get_by_project(&db::get_db(), pid, q.limit.unwrap_or(50), q.offset.unwrap_or(0))))
}

async fn auth_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({"enabled": crate::db::auth::is_auth_enabled(&db::get_db())}))
}

async fn get_settings() -> Json<serde_json::Value> {
    Json(to_json(&settings::get(&db::get_db())))
}

async fn update_settings(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    let db = db::get_db();
    let mut current = settings::get(&db);
    if let Some(v) = body.get("confirm_before_delete").and_then(|v| v.as_bool()) { current.confirm_before_delete = v; }
    if let Some(v) = body.get("default_model").and_then(|v| v.as_str()) { current.default_model = v.to_string(); }
    if let Some(v) = body.get("default_effort").and_then(|v| v.as_str()) { current.default_effort = v.to_string(); }
    if let Some(v) = body.get("language").and_then(|v| v.as_str()) { current.language = v.to_string(); }
    if let Some(v) = body.get("auto_open_terminal").and_then(|v| v.as_bool()) { current.auto_open_terminal = v; }
    if let Some(v) = body.get("sound_enabled").and_then(|v| v.as_bool()) { current.sound_enabled = v; }
    settings::update(&db, &current);
    Json(to_json(&current))
}
