use std::io::{BufRead, BufReader};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use crate::claude::env_path;
use crate::db::{self, projects, tasks};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Board MCP tools pre-allowed for the chat (read-only, never prompt). Everything
/// else the assistant tries — web/files/shell, plus board WRITE tools like
/// create_task / decompose / add_dependency — routes through the approval card
/// (or runs freely when full-autonomy bypass is on). Edits to existing tasks are
/// still offered as `board:action` blocks for a lightweight review.
const CHAT_ALLOWED_TOOLS: &[&str] = &[
    "mcp__claude-board__list_projects",
    "mcp__claude-board__list_tasks",
    "mcp__claude-board__list_task_summary",
    "mcp__claude-board__get_task_detail",
    "mcp__claude-board__list_agents",
];

/// The MCP tool Claude calls to ask for permission (via `--permission-prompt-tool`)
/// when it wants a tool outside the read-only whitelist. Must itself be allowed so
/// invoking it never recurses into another permission prompt.
const PERMISSION_PROMPT_TOOL: &str = "mcp__claude-board__approve_permission";

/// One prior turn of the conversation, sent from the client so the assistant
/// keeps context across messages (the chat itself is stateless / one-shot).
#[derive(serde::Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

/// Render the recent conversation into a prompt block (last N turns, oldest
/// first). Empty history → empty string.
fn build_history_block(history: Option<&[ChatTurn]>) -> String {
    let turns = match history {
        Some(h) if !h.is_empty() => h,
        _ => return String::new(),
    };
    const MAX_TURNS: usize = 12;
    let recent = if turns.len() > MAX_TURNS { &turns[turns.len() - MAX_TURNS..] } else { turns };
    let lines: Vec<String> = recent
        .iter()
        .filter(|t| !t.content.trim().is_empty())
        .map(|t| {
            let who = if t.role == "user" { "User" } else { "Assistant" };
            format!("**{}:** {}", who, t.content.trim())
        })
        .collect();
    if lines.is_empty() {
        String::new()
    } else {
        format!("\n\n## Conversation so far\n{}", lines.join("\n\n"))
    }
}

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

/// Emit a compact activity line to the chat UI — a small live log of what the
/// assistant is doing during a run (which tool it called, whether it succeeded).
fn emit_chat_activity(app: &AppHandle, kind: &str, label: String) {
    app.emit("chat:activity", &serde_json::json!({ "kind": kind, "label": label })).ok();
}

/// One-line summary of a tool call for the activity log: the short tool name plus
/// a telling input field (command / query / title / path …) when present.
fn summarize_tool(name: &str, input: &serde_json::Value) -> String {
    let short = name.rsplit("__").next().unwrap_or(name);
    let detail = ["command", "query", "title", "prompt", "pattern", "path", "file_path", "url"]
        .iter()
        .find_map(|k| input.get(*k).and_then(|v| v.as_str()))
        .map(|d| {
            let d = d.trim();
            let clipped: String = d.chars().take(80).collect();
            if d.chars().count() > 80 { format!("{}…", clipped) } else { clipped }
        });
    match detail {
        Some(d) if !d.is_empty() => format!("{} · {}", short, d),
        _ => short.to_string(),
    }
}

/// Parse one `stream-json` line: emit compact activity events and capture the
/// final assistant text (from the `result` event, with assistant text as fallback).
fn handle_stream_line(app: &AppHandle, line: &str, final_text: &mut String, assistant_buf: &mut String) {
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return,
    };
    match v.get("type").and_then(|t| t.as_str()) {
        Some("assistant") => {
            if let Some(content) = v.pointer("/message/content").and_then(|c| c.as_array()) {
                for item in content {
                    match item.get("type").and_then(|t| t.as_str()) {
                        Some("tool_use") => {
                            let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                            // The permission gate and tool-discovery are internal plumbing — hide them.
                            if name.ends_with("approve_permission") || name == "ToolSearch" {
                                continue;
                            }
                            let input = item.get("input").cloned().unwrap_or_else(|| serde_json::json!({}));
                            emit_chat_activity(app, "tool", summarize_tool(name, &input));
                        }
                        Some("text") => {
                            if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                                assistant_buf.push_str(t);
                            }
                        }
                        Some("thinking") => emit_chat_activity(app, "thinking", "thinking…".to_string()),
                        _ => {}
                    }
                }
            }
        }
        Some("user") => {
            if let Some(content) = v.pointer("/message/content").and_then(|c| c.as_array()) {
                for item in content {
                    if item.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                        let is_err = item.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false);
                        emit_chat_activity(app, "tool_result", if is_err { "error".into() } else { "done".into() });
                    }
                }
            }
        }
        Some("result") => {
            if let Some(r) = v.get("result").and_then(|r| r.as_str()) {
                *final_text = r.to_string();
            }
        }
        _ => {}
    }
}

/// Send a chat message to Claude with access to the Claude Board MCP tools. Runs
/// `stream-json` under the hood and emits a compact `chat:activity` log to the UI
/// while it works; returns the final assistant text. Runs in the project's dir.
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    project_id: i64,
    message: String,
    model: Option<String>,
    mcp_port: Option<u16>,
    history: Option<Vec<ChatTurn>>,
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

    let task_summary: String = all_tasks.iter().take(60).map(|t| {
        format!("- id {} [{}] {} ({})", t.id, t.task_key.as_deref().unwrap_or(""), t.title, t.status.as_deref().unwrap_or("backlog"))
    }).collect::<Vec<_>>().join("\n");

    let system_context = format!(
        r#"You are Claude Board's AI assistant, embedded in the kanban board. You help the user understand and manage their development tasks.

## Current Project: {}
- Working directory: {}
- Tasks: {} total ({} running, {} queued, {} done, {} failed)

## Task List (id — task_key — title — status)
{}

## Your tools
- Board (read): get_task_detail / list_tasks / list_task_summary / list_projects / list_agents — inspect the board.
- Board (create): create_task, decompose (break a goal into an epic → story → task → subtask tree), add_dependency (make one task wait for another) — use these to CREATE tasks and wire dependencies yourself.
- Other tools (web search, files, shell, notes/Obsidian, etc.): use them when the task genuinely needs it.
Any tool outside the read-only board set triggers an approval card in this chat with Yes / Always / Deny the FIRST time you use it — there is NO separate terminal dialog, so never tell the user to "confirm a dialog". If the user enabled full autonomy, tools just run.
To EDIT an existing task (status, title, description, priority, PR intent, comment), do NOT call a tool — propose a `board:action` block (below) that the user approves with a button.

## Proposing board changes (confirm-first)
When the user asks you to change the board — close a task, change its status, edit its title/description/type/priority/acceptance criteria, toggle its PR intent, or add a comment — do NOT try to do it yourself. Instead:
1. Briefly say, in one line, what you will do.
2. End your reply with EXACTLY ONE fenced code block tagged `board:action`, containing a single JSON object. Example (closing a task):

```board:action
{{ "action": "set_status", "task_id": 42, "params": {{ "status": "done" }}, "summary": "Close TASK-42 (mark as done)" }}
```

Actions and their `params`:
- "update_task" — any of `title`, `description`, `task_type` (feature|bugfix|refactor|docs|test|chore), `priority` (0-3), `acceptance_criteria`.
- "set_status" — `status` (backlog|in_progress|testing|done|failed). Use "done" to close/finish a task.
- "set_pr_intent" — `enabled` (true = open a PR, false = never; omit to inherit the project default).
- "add_comment" — `body` (markdown).

Rules for actions:
- Exactly ONE action block per reply, and only when the user actually asked for a change.
- Use the numeric `task_id` from the task list above (the `id N`). If a task isn't listed, call list_tasks to find its id. Never put a task_key in task_id.
- For a description/title rewrite, put the FULL new text in `params` so the user sees it before approving.
- If you are only answering, summarizing or analyzing, do NOT include an action block.

## Rules
- Answer concisely in the user's language, using markdown.
- When asked to summarize or analyze tasks, read them with the board tools first.
- To create tasks, or break a goal into epics/stories/tasks, use the create_task / decompose / add_dependency tools directly (each asks for the user's approval unless full autonomy is on). Do this yourself — do NOT tell the user to go to Decompose/Planning. For a large, review-heavy breakdown you MAY additionally suggest the board's Decompose/Planning flow."#,
        project.name, project.working_dir,
        all_tasks.len(), running, backlog, done, failed,
        task_summary,
    );

    let history_block = build_history_block(history.as_deref());
    let prompt = format!("{}{}\n\n## User Message\n{}", system_context, history_block, message);
    let model_str = model.unwrap_or_else(|| "sonnet".to_string());
    // Full-autonomy toggle: bypass ON → skip all permission prompts; OFF → route
    // tool use outside the read-only whitelist through the approval card.
    let bypass = db::settings::get(&db).chat_bypass_permissions;

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

    // Log the invocation's internals so the whole chat "inside" is inspectable in
    // the app log file afterwards (full prompt at debug; summary at info).
    log::info!(
        "[chat] project={} model={} bypass_permissions={} allowed_tools={} permission_prompt={}",
        project_id,
        model_str,
        bypass,
        if bypass { 0 } else { CHAT_ALLOWED_TOOLS.len() + 1 },
        !bypass,
    );
    log::debug!("[chat] prompt:\n{}", prompt);

    // Run Claude CLI streaming. bypass ON → full autonomy; OFF → read-only board
    // tools are pre-allowed and anything else prompts via the approval card. We
    // read stream-json line by line to emit a live activity log to the UI.
    let result = tauri::async_runtime::spawn_blocking(move || {
        let started = std::time::Instant::now();
        let mut cmd = env_path::claude_command();
        cmd.args([
            "-p", &prompt,
            "--model", &model_str,
            "--output-format", "stream-json",
            "--verbose",
            "--mcp-config", &mcp_config,
        ]);
        if bypass {
            cmd.arg("--dangerously-skip-permissions");
        } else {
            for tool in CHAT_ALLOWED_TOOLS {
                cmd.args(["--allowedTools", tool]);
            }
            cmd.args(["--allowedTools", PERMISSION_PROMPT_TOOL]);
            cmd.args(["--permission-prompt-tool", PERMISSION_PROMPT_TOOL]);
        }
        cmd.current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().map_err(|e| format!("Failed to run Claude CLI: {}", e))?;

        // Drain stderr on a side thread to avoid a pipe-buffer deadlock.
        let stderr_thread = child.stderr.take().map(|se| {
            std::thread::spawn(move || {
                let mut buf = String::new();
                let mut reader = BufReader::new(se);
                let mut line = String::new();
                while reader.read_line(&mut line).unwrap_or(0) > 0 {
                    buf.push_str(&line);
                    line.clear();
                }
                buf
            })
        });

        // Parse stream-json events line by line: emit the compact activity log and
        // capture the final assistant text.
        let mut final_text = String::new();
        let mut assistant_buf = String::new();
        if let Some(out) = child.stdout.take() {
            let reader = BufReader::new(out);
            for line in reader.lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                handle_stream_line(&app, &line, &mut final_text, &mut assistant_buf);
            }
        }

        let status = child.wait().map_err(|e| format!("Failed to wait on Claude CLI: {}", e))?;
        let elapsed = started.elapsed();
        let stderr = stderr_thread.and_then(|h| h.join().ok()).unwrap_or_default();
        if !stderr.trim().is_empty() {
            log::debug!("[chat] stderr:\n{}", stderr.trim());
        }

        // Prefer the `result` event text; fall back to concatenated assistant text.
        let text = if !final_text.trim().is_empty() {
            final_text.trim().to_string()
        } else {
            assistant_buf.trim().to_string()
        };

        if status.success() {
            log::info!("[chat] done exit=0 text_len={} elapsed={:?}", text.len(), elapsed);
            log::debug!("[chat] final text:\n{}", text);
            Ok(text)
        } else if !text.is_empty() {
            log::info!("[chat] exit={:?} but text present ({} chars) elapsed={:?}", status.code(), text.len(), elapsed);
            Ok(text)
        } else {
            log::info!("[chat] failed exit={:?} elapsed={:?} stderr={}", status.code(), elapsed, stderr.trim());
            Err(format!("Claude CLI error: {}", stderr.trim()))
        }
    }).await.map_err(|e| format!("Task join error: {}", e))?;

    result
}
