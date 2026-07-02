use std::process::Stdio;
use crate::claude::env_path;
use crate::db::{self, projects, tasks};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Board MCP tools the chat assistant may call: read the board and edit task
/// descriptions/titles. Task creation/decomposition is intentionally excluded —
/// that goes through the review-first planning flow, not the chat.
const CHAT_ALLOWED_TOOLS: &[&str] = &[
    "mcp__claude-board__list_projects",
    "mcp__claude-board__list_tasks",
    "mcp__claude-board__list_task_summary",
    "mcp__claude-board__get_task_detail",
    "mcp__claude-board__update_task",
    "mcp__claude-board__add_task_comment",
    "mcp__claude-board__set_pr_intent",
];

/// Resolve the bundled MCP sidecar path (mirrors the resolution in runner.rs).
fn resolve_mcp_server_path() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .and_then(|exe_dir| {
            let mut candidates = vec![exe_dir.join("resources").join("mcp-server.js")];
            #[cfg(target_os = "macos")]
            candidates.push(
                exe_dir.join("..").join("Resources").join("resources").join("mcp-server.js"),
            );
            candidates.push(exe_dir.join("mcp-server.js"));
            candidates.into_iter().find(|p| p.exists())
        })
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Send a chat message to Claude with access to the Claude Board MCP tools
/// (read the board + edit task descriptions/titles). One-shot; returns text.
/// Runs in the project's working directory.
#[tauri::command]
pub async fn chat_send(
    project_id: i64,
    message: String,
    model: Option<String>,
    mcp_port: Option<u16>,
) -> Result<String, String> {
    let db = db::get_db();
    let project = projects::get_by_id(&db, project_id).ok_or("Project not found")?;
    let port = mcp_port.unwrap_or(crate::config::DEFAULT_PORT);

    // Build context about current project state
    let all_tasks = tasks::get_by_project(&db, project_id);
    let running = all_tasks.iter().filter(|t| t.status.as_deref() == Some("in_progress")).count();
    let backlog = all_tasks.iter().filter(|t| t.status.as_deref() == Some("backlog")).count();
    let done = all_tasks.iter().filter(|t| t.status.as_deref() == Some("done")).count();
    let failed = all_tasks.iter().filter(|t| t.status.as_deref() == Some("failed")).count();

    let task_summary: String = all_tasks.iter().take(40).map(|t| {
        format!("- [{}] {} ({})", t.task_key.as_deref().unwrap_or(""), t.title, t.status.as_deref().unwrap_or("backlog"))
    }).collect::<Vec<_>>().join("\n");

    let system_context = format!(
        r#"You are Claude Board's AI assistant, embedded in the kanban board. You help the user understand and manage their development tasks.

## Current Project: {}
- Working directory: {}
- Tasks: {} total ({} running, {} queued, {} done, {} failed)

## Task List (task_key — title — status)
{}

## Your tools (Claude Board MCP)
- get_task_detail / list_tasks / list_task_summary / list_projects — inspect the board.
- update_task — edit a task's title, description, type, priority or acceptance criteria.

## Rules
- Answer concisely in the user's language, using markdown.
- When asked to summarize or analyze tasks, read them with the board tools first.
- When asked to rewrite, tighten, translate or summarize a task's description or title, apply the change with update_task, then confirm what you changed (quote the new text briefly).
- To break a goal into epics/stories/tasks, do NOT create tasks yourself — tell the user to use the board's Decompose / Planning action, which produces a review-first breakdown they can approve.
- Never move tasks into in_progress and never delete anything."#,
        project.name, project.working_dir,
        all_tasks.len(), running, backlog, done, failed,
        task_summary,
    );

    let prompt = format!("{}\n\n## User Message\n{}", system_context, message);
    let model_str = model.unwrap_or_else(|| "sonnet".to_string());

    // Wire the Claude Board MCP sidecar so the assistant can read/update tasks.
    let mcp_server_path = resolve_mcp_server_path();
    let mcp_config = serde_json::json!({
        "mcpServers": {
            "claude-board": {
                "command": "node",
                "args": [mcp_server_path],
                "env": { "CLAUDE_BOARD_URL": format!("http://localhost:{}", port) }
            }
        }
    }).to_string();
    let working_dir = project.working_dir.clone();

    // Run Claude CLI in one-shot mode with the board MCP tools whitelisted.
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = env_path::claude_command();
        cmd.args([
            "-p", &prompt,
            "--model", &model_str,
            "--output-format", "text",
            "--mcp-config", &mcp_config,
        ]);
        for tool in CHAT_ALLOWED_TOOLS {
            cmd.args(["--allowedTools", tool]);
        }
        cmd.current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = cmd.output().map_err(|e| format!("Failed to run Claude CLI: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Claude CLI error: {}", stderr.trim()))
        }
    }).await.map_err(|e| format!("Task join error: {}", e))?;

    result
}
