use super::env_path;
use super::events::{EventContext, UsageBaseline, UsageSession, UsageTracker};
use super::prompt::build_prompt;
use super::state_machine::{EngineConfig, TaskStatus};
use crate::db::{self, DbPool};
use crate::db::{activity, attachments, projects, roles, snippets, tasks, templates};
use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Active process info: PID and start instant for timeout enforcement.
struct ProcessInfo {
    pid: u32,
    started_at: std::time::Instant,
    project_id: i64,
    working_dir: String,
}

type ProcessMap = Mutex<HashMap<i64, ProcessInfo>>;
type StartingSet = Mutex<HashSet<i64>>;
type WorktreeMap = Mutex<HashMap<i64, String>>;

static ACTIVE_PROCESSES: once_cell::sync::Lazy<ProcessMap> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));
static STARTING_TASKS: once_cell::sync::Lazy<StartingSet> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashSet::new()));
static EVENT_CTX: once_cell::sync::Lazy<EventContext> =
    once_cell::sync::Lazy::new(EventContext::new);
/// Maps task_id → worktree directory path. Persists across start/test phases so auto-test reuses the same worktree.
static TASK_WORKTREES: once_cell::sync::Lazy<WorktreeMap> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

const AGENT_NAMES: &[&str] = &[
    "Nova", "Atlas", "Spark", "Echo", "Pulse", "Drift", "Flux", "Blaze", "Cipher", "Nexus",
    "Orbit", "Prism", "Surge", "Volt", "Apex", "Helix", "Pixel", "Byte", "Quark", "Zephyr", "Onyx",
    "Jade", "Iris", "Sol", "Astra", "Cosmo", "Flare", "Rune", "Vega", "Luna",
];

fn assign_agent_name(task_id: i64, db: &crate::db::DbPool) -> String {
    let idx = (task_id as usize + rand::random::<usize>()) % AGENT_NAMES.len();
    let name = AGENT_NAMES[idx].to_string();
    crate::db::tasks::set_agent_name(db, task_id, &name);
    name
}

pub fn is_running(task_id: i64) -> bool {
    ACTIVE_PROCESSES.lock().contains_key(&task_id)
}

pub fn is_starting(task_id: i64) -> bool {
    STARTING_TASKS.lock().contains(&task_id)
}

/// Fetch task and set is_running field, then emit task:updated event.
fn emit_task_updated(db: &DbPool, app: &AppHandle, task_id: i64) {
    if let Some(mut task) = tasks::get_by_id(db, task_id) {
        task.is_running = is_running(task_id);
        app.emit("task:updated", &task).ok();
    }
}

pub fn stop(task_id: i64, db: &DbPool, app: &AppHandle) {
    if let Some(info) = ACTIVE_PROCESSES.lock().remove(&task_id) {
        kill_process(info.pid);
        STARTING_TASKS.lock().remove(&task_id);
        EVENT_CTX.task_usage.lock().remove(&task_id);
        EVENT_CTX
            .active_tool_calls
            .lock()
            .retain(|_, tc| tc.task_id != task_id);
        super::events::clear_task_file_access(task_id);
        tasks::add_log(
            db,
            task_id,
            "Claude process stopped by user.",
            "system",
            None,
        );
        app.emit(
            "task:log",
            &serde_json::json!({
                "taskId": task_id, "message": "Claude process stopped by user.", "logType": "system"
            }),
        )
        .ok();
    }
}

/// Check active processes for timeout violations and kill them.
/// Called periodically from queue poll thread.
pub fn enforce_timeouts(app: &AppHandle) {
    let db = crate::db::get_db();

    // Collect tasks that exceeded timeout (snapshot under lock, then act outside lock)
    let timed_out: Vec<(i64, u32, String)> = {
        let procs = ACTIVE_PROCESSES.lock();
        let mut result = Vec::new();
        for (task_id, info) in procs.iter() {
            let project = projects::get_by_id(&db, info.project_id);
            let timeout_min = project
                .as_ref()
                .and_then(|p| p.task_timeout_minutes)
                .unwrap_or(0);
            if timeout_min > 0 {
                let elapsed_min = info.started_at.elapsed().as_secs() / 60;
                if elapsed_min >= timeout_min as u64 {
                    result.push((*task_id, info.pid, info.working_dir.clone()));
                }
            }
        }
        result
    };

    for (task_id, _pid, working_dir) in timed_out {
        let task = tasks::get_by_id(&db, task_id);
        let title = task.as_ref().map(|t| t.title.as_str()).unwrap_or("unknown");
        let project_id = task.as_ref().map(|t| t.project_id).unwrap_or(0);

        log::warn!("Task {} ({}) timed out — killing process", task_id, title);
        tasks::add_log(
            &db,
            task_id,
            "Task timed out — process killed.",
            "error",
            None,
        );
        app.emit(
            "task:log",
            &serde_json::json!({
                "taskId": task_id, "message": "Task timed out — process killed.", "logType": "error"
            }),
        )
        .ok();

        // Stop the process (this removes from ACTIVE_PROCESSES and cleans up)
        stop(task_id, &db, app);

        // Clean up attachments copied to working dir
        let attach_dir = Path::new(&working_dir).join(".claude-attachments");
        if attach_dir.exists() {
            std::fs::remove_dir_all(&attach_dir).ok();
        }

        // Only retry if task is still in_progress (not manually moved by user)
        let current_status = task
            .as_ref()
            .and_then(|t| t.status.as_deref())
            .unwrap_or("");
        if current_status == TaskStatus::InProgress.as_str() {
            crate::services::queue::handle_task_failure(&db, app, project_id, task_id);
        }
        crate::services::webhook::fire(
            project_id,
            "task_timeout",
            &format!("Task timed out: {}", title),
            serde_json::json!({"taskId": task_id, "title": title}),
        );
    }
}

/// Cleanup all process tracking state. Called on app shutdown.
pub fn cleanup_all() {
    ACTIVE_PROCESSES.lock().clear();
    STARTING_TASKS.lock().clear();
    TASK_WORKTREES.lock().clear();
    EVENT_CTX.task_usage.lock().clear();
    EVENT_CTX.active_tool_calls.lock().clear();
}

fn kill_process(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = Command::new("taskkill")
            .args(["/pid", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            log::warn!("Failed to kill process {}: {}", pid, e);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
}

/// Sanitize a branch name to only allow safe git ref characters.
/// Permits alphanumeric, dash, underscore, slash, and dot.
fn sanitize_branch_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '/' || *c == '.')
        .collect::<String>()
}

/// Transliterate Cyrillic (Russian) letters to Latin so branch names stay
/// readable ASCII/English instead of carrying raw Cyrillic. Input is expected
/// lowercased; non-Cyrillic characters pass through unchanged.
fn transliterate_cyrillic(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        let mapped: &str = match ch {
            'а' => "a", 'б' => "b", 'в' => "v", 'г' => "g", 'д' => "d",
            'е' => "e", 'ё' => "yo", 'ж' => "zh", 'з' => "z", 'и' => "i",
            'й' => "y", 'к' => "k", 'л' => "l", 'м' => "m", 'н' => "n",
            'о' => "o", 'п' => "p", 'р' => "r", 'с' => "s", 'т' => "t",
            'у' => "u", 'ф' => "f", 'х' => "kh", 'ц' => "ts", 'ч' => "ch",
            'ш' => "sh", 'щ' => "shch", 'ъ' => "", 'ы' => "y", 'ь' => "",
            'э' => "e", 'ю' => "yu", 'я' => "ya",
            other => {
                out.push(other);
                continue;
            }
        };
        out.push_str(mapped);
    }
    out
}

fn generate_branch_slug(title: &str) -> String {
    let normalized = title
        .to_lowercase()
        .replace(['ç', 'Ç'], "c")
        .replace(['ğ', 'Ğ'], "g")
        .replace(['ı', 'İ'], "i")
        .replace(['ö', 'Ö'], "o")
        .replace(['ş', 'Ş'], "s")
        .replace(['ü', 'Ü'], "u");
    // Latinize Cyrillic, then keep only ASCII alphanumerics so branch names are
    // always English/ASCII (anything still non-ASCII is dropped; an all-dropped
    // title falls back to `task-<id>` at the call site).
    transliterate_cyrillic(&normalized)
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace() || *c == '-')
        .collect::<String>()
        .trim()
        .replace(char::is_whitespace, "-")
        .replace("--", "-")
        .trim_matches('-')
        .to_string()
        .chars()
        .take(40)
        .collect::<String>()
        .trim_end_matches('-')
        .to_string()
}

/// Resolve the effective working directory for a task.
/// If auto_branch is enabled, creates a git worktree for isolation.
/// Returns (effective_working_dir, Option<branch_name>).
fn ensure_task_worktree(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
    _app: &AppHandle,
) -> (String, Option<String>) {
    if project.auto_branch.unwrap_or(1) == 0 {
        return (working_dir.to_string(), None);
    }

    let git_hidden = |args: &[&str], dir: &str| -> std::io::Result<std::process::Output> {
        let mut c = Command::new("git");
        c.args(args)
            .current_dir(dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        c.creation_flags(CREATE_NO_WINDOW);
        c.output()
    };

    let git_ok = |args: &[&str], dir: &str| -> bool {
        git_hidden(args, dir)
            .map(|o| o.status.success())
            .unwrap_or(false)
    };

    // Check if we're in a git repo
    if !git_ok(&["rev-parse", "--is-inside-work-tree"], working_dir) {
        return (working_dir.to_string(), None);
    }

    let is_revision = task.revision_count.unwrap_or(0) > 0;
    let slug = generate_branch_slug(&task.title);
    let slug = if slug.is_empty() {
        format!("task-{}", task.id)
    } else {
        slug
    };
    let branch_name = sanitize_branch_name(&task.branch_name.clone().unwrap_or_else(|| {
        format!(
            "{}/{}",
            task.task_type.as_deref().unwrap_or("feature"),
            slug
        )
    }));
    let base = project.pr_base_branch.as_deref().unwrap_or("main");

    // For revisions, reuse existing worktree
    if is_revision {
        let existing = TASK_WORKTREES.lock().get(&task.id).cloned();
        if let Some(wt_dir) = existing {
            if Path::new(&wt_dir).exists() {
                tasks::update_branch(db, task.id, &branch_name);
                tasks::set_worktree_path(db, task.id, Some(&wt_dir));
                return (wt_dir, Some(branch_name));
            }
        }
    }

    // Worktree directory: .worktrees/<slug>-<id> relative to repo root (the id
    // suffix keeps names unique across tasks with identical titles; the empty-slug
    // fallback is already "task-{id}", so don't double the id there).
    let dir_name = if slug == format!("task-{}", task.id) {
        slug.clone()
    } else {
        format!("{}-{}", slug, task.id)
    };
    let worktree_dir = Path::new(working_dir).join(".worktrees").join(&dir_name);
    let worktree_str = worktree_dir.to_string_lossy().to_string();

    // If worktree already exists (e.g. from a previous run — worktrees persist
    // after completion), remove it first so a fresh run starts clean. Also sweep
    // the legacy pre-rename path (.worktrees/task-{id}).
    let legacy_dir = Path::new(working_dir)
        .join(".worktrees")
        .join(format!("task-{}", task.id));
    for stale in [&worktree_dir, &legacy_dir] {
        if stale.exists() {
            let stale_str = stale.to_string_lossy().to_string();
            let _ = git_hidden(&["worktree", "remove", "--force", &stale_str], working_dir);
            // Fallback: remove directory manually if git worktree remove failed
            if stale.exists() {
                std::fs::remove_dir_all(stale).ok();
            }
            // Prune stale worktree references
            let _ = git_hidden(&["worktree", "prune"], working_dir);
        }
    }

    // Ensure .worktrees directory exists and is git-ignored
    let worktrees_parent = Path::new(working_dir).join(".worktrees");
    if !worktrees_parent.exists() {
        std::fs::create_dir_all(&worktrees_parent).ok();
        // Add .worktrees to .git/info/exclude so it doesn't show as untracked
        let exclude_file = Path::new(working_dir)
            .join(".git")
            .join("info")
            .join("exclude");
        if let Ok(content) = std::fs::read_to_string(&exclude_file) {
            if !content.contains(".worktrees") {
                let mut new_content = content.trim_end().to_string();
                new_content.push_str("\n.worktrees\n");
                std::fs::write(&exclude_file, new_content).ok();
            }
        }
    }

    // Create worktree with branch
    let branch_exists = git_ok(&["rev-parse", "--verify", &branch_name], working_dir);
    let created = if branch_exists {
        // Branch exists — create worktree checking out that branch
        git_ok(
            &["worktree", "add", &worktree_str, &branch_name],
            working_dir,
        )
    } else {
        // New branch — create worktree with new branch from base
        git_ok(
            &["worktree", "add", "-b", &branch_name, &worktree_str, base],
            working_dir,
        ) || git_ok(
            &["worktree", "add", "-b", &branch_name, &worktree_str],
            working_dir,
        )
    };

    if created {
        TASK_WORKTREES.lock().insert(task.id, worktree_str.clone());
        tasks::update_branch(db, task.id, &branch_name);
        tasks::set_worktree_path(db, task.id, Some(&worktree_str));
        activity::add(
            db,
            task.project_id,
            Some(task.id),
            "worktree_created",
            &format!("Worktree created on branch {}", branch_name),
            None,
        );
        log::info!(
            "Created worktree for task {} at {} (branch: {})",
            task.id,
            worktree_str,
            branch_name
        );
        (worktree_str, Some(branch_name))
    } else {
        // Fallback: use main working dir with branch checkout (legacy behavior)
        log::warn!(
            "Failed to create worktree for task {}, falling back to shared working dir",
            task.id
        );
        if branch_exists {
            let _ = git_hidden(&["checkout", &branch_name], working_dir);
        } else if !git_ok(&["checkout", "-b", &branch_name, base], working_dir) {
            let _ = git_hidden(&["checkout", "-b", &branch_name], working_dir);
        }
        tasks::update_branch(db, task.id, &branch_name);
        (working_dir.to_string(), Some(branch_name))
    }
}

/// Get the worktree directory for a task, if one still exists on disk.
///
/// The in-memory map is the fast path (populated on creation this session);
/// the persisted `worktree_path` is the fallback so a worktree survives an app
/// restart (the map is empty then). Either way the directory must still exist —
/// a removed worktree returns `None` so callers fall back to the project dir.
pub fn get_task_worktree(db: &DbPool, task_id: i64) -> Option<String> {
    if let Some(p) = TASK_WORKTREES.lock().get(&task_id).cloned() {
        if Path::new(&p).exists() {
            return Some(p);
        }
    }
    let persisted = tasks::get_by_id(db, task_id).and_then(|t| t.worktree_path);
    if let Some(p) = persisted {
        if !p.is_empty() && Path::new(&p).exists() {
            TASK_WORKTREES.lock().insert(task_id, p.clone());
            return Some(p);
        }
    }
    None
}

/// Remove the task's worktree once its work is safe on the remote (a PR exists
/// or the branch was pushed). The branch ref is kept — commits stay reachable
/// there and on the remote — so nothing is lost; a revision recreates the
/// worktree from the branch on demand. No-op when the work isn't on the remote
/// (local-only work keeps its worktree) or no worktree is recorded.
/// See docs/concepts/work-lifecycle.md.
pub fn remove_task_worktree_if_safe(
    task: &tasks::Task,
    working_dir: &str,
    db: &DbPool,
    app: &AppHandle,
) {
    let safe_on_remote = task.pr_url.as_deref().map(|u| !u.is_empty()).unwrap_or(false)
        || task.pushed.unwrap_or(0) == 1;
    if !safe_on_remote {
        return;
    }
    let Some(wt_dir) = get_task_worktree(db, task.id) else {
        return;
    };
    let run_git = |args: &[&str]| {
        let mut c = Command::new("git");
        c.args(args)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        c.creation_flags(CREATE_NO_WINDOW);
        c.output().ok();
    };
    run_git(&["worktree", "remove", "--force", &wt_dir]);
    if Path::new(&wt_dir).exists() {
        std::fs::remove_dir_all(&wt_dir).ok();
    }
    run_git(&["worktree", "prune"]);
    TASK_WORKTREES.lock().remove(&task.id);
    tasks::set_worktree_path(db, task.id, None);

    let reason = task
        .pr_url
        .as_deref()
        .filter(|u| !u.is_empty())
        .map(|u| format!("PR {}", u))
        .unwrap_or_else(|| format!("branch {}", task.branch_name.as_deref().unwrap_or("")));
    let msg = format!("Worktree removed — work safe on remote ({})", reason);
    activity::add(
        db,
        task.project_id,
        Some(task.id),
        "worktree_removed",
        &msg,
        None,
    );
    tasks::add_log(db, task.id, &msg, "info", None);
    emit_task_updated(db, app, task.id);
    log::info!("Removed worktree for task {} ({})", task.id, reason);
}

fn scan_git_info(working_dir: &str, task_id: i64, db: &DbPool) {
    let exec = |args: &[&str]| -> Option<String> {
        let mut cmd = Command::new("git");
        cmd.args(args)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };

    let log_output = exec(&[
        "log",
        "--oneline",
        "-10",
        "--no-merges",
        "--format=%H|%h|%s|%an|%ai",
    ])
    .unwrap_or_default();
    let commits: Vec<serde_json::Value> = log_output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            serde_json::json!({
                "hash": parts.first().unwrap_or(&""),
                "short": parts.get(1).unwrap_or(&""),
                "message": parts.get(2).unwrap_or(&""),
                "author": parts.get(3).unwrap_or(&""),
                "date": parts.get(4).unwrap_or(&""),
            })
        })
        .collect();

    let diff_stat = exec(&["diff", "--stat", "HEAD~1..HEAD"]);
    let pr_url = exec(&["branch", "--show-current"]).and_then(|branch| {
        if branch == "main" || branch == "master" {
            return None;
        }
        exec(&["gh", "pr", "view", &branch, "--json", "url", "--jq", ".url"])
            .filter(|u| u.starts_with("http"))
    });

    let commits_json = serde_json::to_string(&commits).unwrap_or_else(|_| "[]".into());
    tasks::update_git_info(
        db,
        task_id,
        &commits_json,
        pr_url.as_deref(),
        diff_stat.as_deref(),
    );
}

/// Effective PR intent for a task: the per-task `auto_pr` override wins, falling
/// back to the project default when the task leaves it unset (NULL = inherit).
fn effective_auto_pr(task: &tasks::Task, project: &projects::Project) -> i64 {
    task.auto_pr.unwrap_or_else(|| project.auto_pr.unwrap_or(0))
}

/// Effective auto-merge intent — project-level toggle only (default off).
fn effective_auto_merge(_task: &tasks::Task, project: &projects::Project) -> i64 {
    project.auto_merge.unwrap_or(0)
}

/// Post-completion branch handling. The worktree is intentionally KEPT — it
/// stays in `.worktrees/` for inspection and is only recreated on the task's
/// next fresh run. Critically, this NEVER force-deletes an unmerged task
/// branch — that used to orphan the agent's commits (dangling, lost at the
/// next `git gc`). Behaviour:
/// - `auto_pr` on   → keep the branch (an open PR owns it).
/// - `auto_merge` on → try to merge the branch into the base branch. The merge
///   is *skipped* (branch kept) unless the base branch is the clean,
///   checked-out HEAD of the main working dir; on conflict we `merge --abort`
///   and keep the branch. The branch always survives — it is checked out in
///   the persistent worktree, so git would refuse to delete it anyway.
/// - otherwise → keep the branch so the user can merge/inspect it manually.
pub fn cleanup_task_branch(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
) {
    if project.auto_branch.unwrap_or(1) == 0 {
        return;
    }
    // An open PR owns the branch — never touch it here.
    if effective_auto_pr(task, project) == 1 {
        return;
    }
    let branch = match task.branch_name.as_deref() {
        Some(b) if !b.is_empty() => b,
        _ => return,
    };
    let base = project.pr_base_branch.as_deref().unwrap_or("main");
    if branch == base {
        return;
    }

    // auto_merge disabled → KEEP the branch (deleting it here was the data-loss bug).
    if effective_auto_merge(task, project) == 0 {
        log::info!(
            "Task {} finished on branch {} (auto_merge off) — branch kept for manual merge",
            task.id,
            branch
        );
        return;
    }

    // auto_merge enabled → attempt a safe, non-destructive merge into the base.
    let git_ok = |args: &[&str]| -> bool {
        let mut cmd = Command::new("git");
        cmd.args(args)
            .current_dir(working_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output().map(|o| o.status.success()).unwrap_or(false)
    };
    let git_out = |args: &[&str]| -> Option<String> {
        let mut cmd = Command::new("git");
        cmd.args(args)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };

    // Guard: never disturb the user's working tree — only merge when the base
    // branch is the current HEAD and the tree is clean.
    let head = git_out(&["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let dirty = git_out(&["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(true);
    if head != base || dirty {
        let msg = format!(
            "auto_merge пропущен: рабочее дерево не на «{}» или содержит незакоммиченные изменения — ветка {} сохранена для ручного слияния",
            base, branch
        );
        log::info!("Task {}: {}", task.id, msg);
        tasks::add_log(db, task.id, &msg, "info", None);
        return;
    }

    // --no-ff keeps a visible merge commit; on conflict abort and keep the branch.
    if git_ok(&["merge", "--no-ff", "--no-edit", branch]) {
        // The branch stays: it is checked out in the persistent worktree
        // (git refuses to delete a checked-out branch), and it now points at
        // merged history anyway.
        let msg = format!("auto_merge: ветка {} влита в {}", branch, base);
        log::info!("Task {}: {}", task.id, msg);
        tasks::add_log(db, task.id, &msg, "success", None);
    } else {
        git_ok(&["merge", "--abort"]);
        let msg = format!(
            "auto_merge: конфликт при слиянии {} в {} — ветка сохранена для ручного слияния",
            branch, base
        );
        log::info!("Task {}: {}", task.id, msg);
        tasks::add_log(db, task.id, &msg, "error", None);
    }
}

/// Public wrapper for auto_create_pr (called from commands/tasks.rs on manual done transition)
pub fn auto_create_pr_public(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
    app: &AppHandle,
) {
    auto_create_pr(task, working_dir, project, db, app);
}

/// Manual "Push branch" action (Testing) — push the task's branch to origin.
/// Works even when auto_pr is off. Errors if the task has no branch yet.
pub fn manual_push_branch(
    task: &tasks::Task,
    working_dir: &str,
    db: &DbPool,
    app: &AppHandle,
) -> Result<(), String> {
    let branch = task
        .branch_name
        .as_deref()
        .filter(|b| !b.is_empty())
        .ok_or("Task has no branch yet")?;
    if push_task_branch(task, working_dir, branch, db, app) {
        Ok(())
    } else {
        Err(format!("Failed to push branch {}", branch))
    }
}

/// Manual "Create PR" action (Testing) — push and open a PR even when auto_pr
/// is off. Idempotent: a no-op when a PR already exists.
pub fn manual_create_pr(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
    app: &AppHandle,
) -> Result<(), String> {
    let branch = task
        .branch_name
        .as_deref()
        .filter(|b| !b.is_empty())
        .ok_or("Task has no branch yet")?;
    let base = project.pr_base_branch.as_deref().unwrap_or("main");
    if branch == base {
        return Err("Task is on the base branch — nothing to open a PR for".into());
    }
    do_create_pr(task, working_dir, project, db, app);
    Ok(())
}

/// Merge the task's open PR (created at the Testing stage). Called when the
/// task reaches Done — accepting a task merges its PR. A failed merge never
/// blocks the Done transition: the PR stays open for a manual merge and the
/// error is surfaced via task log + notification.
pub fn merge_task_pr(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
    app: &AppHandle,
) {
    use crate::services::pr_providers::{self, PrMergeOutcome};

    let Some(pr_url) = task.pr_url.as_deref().filter(|u| !u.is_empty()) else {
        return;
    };
    let provider =
        pr_providers::detect_remote_provider(working_dir, project.pr_provider.as_deref());
    let (msg, log_type) = match pr_providers::merge_pr(provider, working_dir, pr_url) {
        PrMergeOutcome::Merged { provider } => {
            crate::db::comments::add(
                db,
                task.id,
                "agent",
                Some(provider.display_name()),
                &format!("Merged the pull request: {}", pr_url),
                Some(pr_url),
            );
            activity::add(
                db,
                task.project_id,
                Some(task.id),
                "pr_merged",
                &format!("PR merged: {}", task.title),
                None,
            );
            crate::services::notification::notify_pr_merged(
                app,
                &crate::services::notification::TaskNotification::new(&task.title, task.task_key.as_deref()),
                pr_url,
            );
            crate::services::webhook::fire(
                task.project_id,
                "pr_merged",
                &format!("PR merged: {}", task.title),
                serde_json::json!({"taskId": task.id, "pr_url": pr_url}),
            );
            (
                format!("PR merged on {}: {}", provider.display_name(), pr_url),
                "success",
            )
        }
        PrMergeOutcome::Skipped { reason } => {
            (format!("PR merge skipped: {}", reason), "info")
        }
        PrMergeOutcome::CliMissing {
            provider,
            install_url,
        } => (
            format!(
                "PR merge failed: {} CLI not installed ({}). PR left open: {}",
                provider.display_name(),
                install_url,
                pr_url
            ),
            "error",
        ),
        PrMergeOutcome::NotAuthenticated {
            provider,
            login_hint,
        } => (
            format!(
                "PR merge failed: {} CLI not authenticated (run `{}`). PR left open: {}",
                provider.display_name(),
                login_hint,
                pr_url
            ),
            "error",
        ),
        PrMergeOutcome::Failed { provider, error } => (
            format!(
                "PR merge failed on {}: {}. PR left open: {}",
                provider.display_name(),
                error,
                pr_url
            ),
            "error",
        ),
    };
    log::info!("Task {}: {}", task.id, msg);
    tasks::add_log(db, task.id, &msg, log_type, None);
    app.emit(
        "task:log",
        &serde_json::json!({"taskId": task.id, "message": msg, "logType": log_type}),
    )
    .ok();
}

/// Push the task's branch to origin. Logs the outcome (previously silent) and,
/// on success, marks the task pushed and records the milestone (activity +
/// notification + webhook). Shared by the auto-PR flow and the manual "Push
/// branch" action. Returns whether the push succeeded.
/// See docs/concepts/work-lifecycle.md.
fn push_task_branch(
    task: &tasks::Task,
    working_dir: &str,
    branch: &str,
    db: &DbPool,
    app: &AppHandle,
) -> bool {
    let mut push_cmd = Command::new("git");
    push_cmd
        .args(["push", "-u", "origin", branch])
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    push_cmd.creation_flags(CREATE_NO_WINDOW);
    let output = push_cmd.output();
    let success = output.as_ref().map(|o| o.status.success()).unwrap_or(false);
    if success {
        tasks::set_pushed(db, task.id, true);
        let msg = format!("Pushed branch {} to origin", branch);
        tasks::add_log(db, task.id, &msg, "success", None);
        app.emit("task:log", &serde_json::json!({"taskId": task.id, "message": msg, "logType": "success"})).ok();
        activity::add(
            db,
            task.project_id,
            Some(task.id),
            "branch_pushed",
            &format!("Branch pushed: {}", branch),
            None,
        );
        crate::services::notification::notify_branch_pushed(
            app,
            &crate::services::notification::TaskNotification::new(&task.title, task.task_key.as_deref()),
            branch,
        );
        crate::services::webhook::fire(
            task.project_id,
            "branch_pushed",
            &format!("Branch pushed: {}", branch),
            serde_json::json!({"taskId": task.id, "branch": branch}),
        );
        emit_task_updated(db, app, task.id);
    } else {
        let detail = output
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stderr).trim().to_string())
            .unwrap_or_default();
        let msg = if detail.is_empty() {
            format!("Push failed for branch {}", branch)
        } else {
            format!("Push failed for branch {}: {}", branch, detail)
        };
        tasks::add_log(db, task.id, &msg, "error", None);
        app.emit("task:log", &serde_json::json!({"taskId": task.id, "message": msg, "logType": "error"})).ok();
        log::warn!("Task {}: push failed for branch {}", task.id, branch);
    }
    success
}

/// Auto-create a PR/MR when auto_pr is enabled. The push+create body lives in
/// `do_create_pr`, shared with the manual "Create PR" action.
fn auto_create_pr(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
    app: &AppHandle,
) {
    if effective_auto_pr(task, project) == 0 {
        return;
    }
    do_create_pr(task, working_dir, project, db, app);
}

/// Push the branch and open a PR/MR — with **no** auto_pr gate (the gate lives
/// in `auto_create_pr`). The manual "Create PR" action calls this directly, so
/// it works even when auto_pr is off. Idempotent: skips when a PR already
/// exists. Provider is detected from `pr_provider` or the origin URL.
fn do_create_pr(
    task: &tasks::Task,
    working_dir: &str,
    project: &projects::Project,
    db: &DbPool,
    app: &AppHandle,
) {
    use crate::services::pr_providers::{self, PrCreateContext, PrCreateOutcome};

    let branch = match task.branch_name.as_deref() {
        Some(b) if !b.is_empty() => b,
        _ => return,
    };
    let base = project.pr_base_branch.as_deref().unwrap_or("main");
    if branch == base {
        return;
    }
    if task.pr_url.as_deref().map(|u| !u.is_empty()).unwrap_or(false) {
        return;
    }

    // Push branch first (any provider needs the branch on the remote).
    push_task_branch(task, working_dir, branch, db, app);

    let provider =
        pr_providers::detect_remote_provider(working_dir, project.pr_provider.as_deref());

    let title = format!(
        "{}: {}",
        task.task_type.as_deref().unwrap_or("feat"),
        task.title
    );
    let body = format!(
        "## {}\n\n{}\n\n**Task Key:** {}\n**Type:** {}\n**Model:** {}",
        task.title,
        task.description.as_deref().unwrap_or(""),
        task.task_key.as_deref().unwrap_or(""),
        task.task_type.as_deref().unwrap_or("feature"),
        task.model_used
            .as_deref()
            .or(task.model.as_deref())
            .unwrap_or("sonnet"),
    );
    let ctx = PrCreateContext {
        working_dir,
        branch,
        base,
        title: &title,
        body: &body,
    };

    let outcome = pr_providers::create_pr(provider, &ctx);
    match outcome {
        PrCreateOutcome::Created { url, provider } => {
            tasks::update_git_info(
                db,
                task.id,
                task.commits.as_deref().unwrap_or("[]"),
                Some(&url),
                task.diff_stat.as_deref(),
            );
            // Leave a work-log comment with the PR link (req #6 ↔ #4).
            let provider_name = provider.display_name().to_string();
            crate::db::comments::add(
                db,
                task.id,
                "agent",
                Some(provider_name.as_str()),
                &format!("Opened a pull request: {}", url),
                Some(&url),
            );
            let msg = format!("PR created on {}: {}", provider.display_name(), url);
            tasks::add_log(db, task.id, &msg, "success", None);
            app.emit("task:log", &serde_json::json!({"taskId": task.id, "message": msg.clone(), "logType": "success"})).ok();
            activity::add(
                db,
                task.project_id,
                Some(task.id),
                "pr_created",
                &format!("PR opened: {}", task.title),
                None,
            );
            crate::services::notification::notify_pr_created(
                app,
                &crate::services::notification::TaskNotification::new(&task.title, task.task_key.as_deref()),
                &url,
            );
            crate::services::webhook::fire(
                task.project_id,
                "pr_created",
                &format!("PR opened: {}", task.title),
                serde_json::json!({"taskId": task.id, "pr_url": url}),
            );
            // Live-update the board (PR badge + Work location) and trigger the
            // client's PR toast (fires on pr_url null→value).
            emit_task_updated(db, app, task.id);
            log::info!(
                "PR created for task {} on {}: {}",
                task.id,
                provider.display_name(),
                url
            );
        }
        PrCreateOutcome::CliMissing {
            provider,
            install_url,
        } => {
            let msg = format!(
                "Auto-PR skipped: {} CLI ({}) not installed. Install: {}",
                provider.display_name(),
                provider.cli_tool().unwrap_or(""),
                install_url
            );
            tasks::add_log(db, task.id, &msg, "info", None);
            log::warn!("Auto-PR for task {}: {}", task.id, msg);
        }
        PrCreateOutcome::NotAuthenticated {
            provider,
            login_hint,
        } => {
            let msg = format!(
                "Auto-PR skipped: not authenticated to {}. Run: {}",
                provider.display_name(),
                login_hint
            );
            tasks::add_log(db, task.id, &msg, "info", None);
            log::warn!("Auto-PR for task {}: {}", task.id, msg);
        }
        PrCreateOutcome::Failed { provider, error } => {
            let msg = format!("Auto-PR failed on {}: {}", provider.display_name(), error);
            tasks::add_log(db, task.id, &msg, "error", None);
            log::warn!("Auto-PR for task {}: {}", task.id, msg);
        }
        PrCreateOutcome::Skipped { reason } => {
            tasks::add_log(
                db,
                task.id,
                &format!("Auto-PR skipped: {}", reason),
                "info",
                None,
            );
            log::info!("Auto-PR skipped for task {}: {}", task.id, reason);
        }
    }
}

/// Generate a context summary from task completion data for Agent Context Handoff.
/// This summary is injected into dependent task prompts so they understand what was done.
fn generate_context_summary(task_id: i64, task_title: &str, db: &DbPool) {
    let task = match tasks::get_by_id(db, task_id) {
        Some(t) => t,
        None => return,
    };

    let mut parts = Vec::new();
    parts.push(format!("## Completed: {}", task_title));

    // Changes made (diff stat)
    if let Some(ref diff) = task.diff_stat {
        if !diff.is_empty() {
            parts.push("### Changes Made".into());
            // Limit diff_stat to first 10 lines
            let limited: String = diff.lines().take(10).collect::<Vec<_>>().join("\n");
            parts.push(limited);
        }
    }

    // Key commits
    if let Some(ref commits_json) = task.commits {
        if let Ok(commits) = serde_json::from_str::<Vec<serde_json::Value>>(commits_json) {
            if !commits.is_empty() {
                parts.push("### Key Commits".into());
                for c in commits.iter().take(5) {
                    let short = c.get("short").and_then(|v| v.as_str()).unwrap_or("");
                    let msg = c.get("message").and_then(|v| v.as_str()).unwrap_or("");
                    if !short.is_empty() {
                        parts.push(format!("- {} {}", short, msg));
                    }
                }
            }
        }
    }

    // Summary from last claude logs
    let logs = tasks::get_last_claude_logs(db, task_id, 5);
    if !logs.is_empty() {
        parts.push("### Summary".into());
        let combined: String = logs.into_iter().rev().collect::<Vec<_>>().join(" ");
        // Limit to 500 chars (safe UTF-8 boundary)
        let trimmed: String = combined.chars().take(500).collect();
        parts.push(trimmed);
    }

    // Branch info
    if let Some(ref branch) = task.branch_name {
        parts.push(format!("\n**Branch:** `{}`", branch));
    }

    let summary = parts.join("\n");
    tasks::set_context_summary(db, task_id, &summary);
}

/// Generate a lifecycle summary describing the full journey of a task.
/// Called when task reaches done status (after auto-test if applicable).
fn generate_lifecycle_summary(task_id: i64, db: &DbPool) {
    let task = match tasks::get_by_id(db, task_id) {
        Some(t) => t,
        None => return,
    };

    let mut parts = Vec::new();

    // Duration
    let duration_str = if let Some(ms) = task.work_duration_ms {
        if ms > 0 {
            let secs = ms / 1000;
            let mins = secs / 60;
            if mins > 60 {
                format!("{}h {}m", mins / 60, mins % 60)
            } else if mins > 0 {
                format!("{}m {}s", mins, secs % 60)
            } else {
                format!("{}s", secs)
            }
        } else {
            "unknown duration".into()
        }
    } else {
        "unknown duration".into()
    };

    // Token info
    let total_tokens = task.input_tokens.unwrap_or(0) + task.output_tokens.unwrap_or(0);
    let cost = task.total_cost.unwrap_or(0.0);
    let model = task
        .model_used
        .as_deref()
        .or(task.model.as_deref())
        .unwrap_or("sonnet");
    let turns = task.num_turns.unwrap_or(0);

    // Commit count
    let commit_count = task
        .commits
        .as_deref()
        .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(s).ok())
        .map(|c| c.len())
        .unwrap_or(0);

    // Retry info
    let retry_count = task.retry_count.unwrap_or(0);
    let revision_count = task.revision_count.unwrap_or(0);

    // Test report info
    let test_info = task
        .test_report
        .as_deref()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok());
    let test_verdict = test_info
        .as_ref()
        .and_then(|r| r.get("verdict").and_then(|v| v.as_str()));
    let test_checks: Vec<String> = test_info
        .as_ref()
        .and_then(|r| r.get("checks").and_then(|v| v.as_array()))
        .map(|checks| {
            checks
                .iter()
                .filter_map(|c| {
                    let name = c.get("name").and_then(|v| v.as_str())?;
                    let status = c.get("status").and_then(|v| v.as_str())?;
                    Some(format!("{}: {}", name, status))
                })
                .collect()
        })
        .unwrap_or_default();

    // Sub-tasks
    let subtasks = tasks::get_subtasks(db, task_id);
    let sub_done = subtasks
        .iter()
        .filter(|s| s.status.as_deref() == Some("done") || s.status.as_deref() == Some("testing"))
        .count();

    // Rate limits
    let rate_limits = task.rate_limit_hits.unwrap_or(0);

    // Branch + PR
    let branch = task.branch_name.as_deref().unwrap_or("");
    let has_pr = task.pr_url.is_some();

    // Build narrative
    parts.push(format!(
        "This {} task was completed using the **{}** model in **{}**, taking **{}** conversation turns and consuming **{}** tokens (${:.4}).",
        task.task_type.as_deref().unwrap_or("feature"), model, duration_str, turns,
        format_token_count(total_tokens), cost
    ));

    if commit_count > 0 {
        let pr_str = if has_pr {
            " and a pull request was created"
        } else {
            ""
        };
        parts.push(format!(
            "The agent made **{}** commit(s) on branch `{}`{}.",
            commit_count, branch, pr_str
        ));
    }

    if retry_count > 0 {
        parts.push(format!(
            "The task required **{}** retry attempt(s) before succeeding.",
            retry_count
        ));
    }

    if revision_count > 0 {
        parts.push(format!(
            "It went through **{}** revision cycle(s) based on review feedback.",
            revision_count
        ));
    }

    if test_verdict.is_some() {
        let verdict_str = if test_verdict == Some("approve") {
            "passed"
        } else {
            "failed"
        };
        let checks_str = if test_checks.is_empty() {
            String::new()
        } else {
            format!(" Checks: {}.", test_checks.join(", "))
        };
        parts.push(format!(
            "Auto-test verification **{}**.{}",
            verdict_str, checks_str
        ));
    }

    if !subtasks.is_empty() {
        parts.push(format!(
            "The task spawned **{}** sub-task(s), of which **{}** completed successfully.",
            subtasks.len(),
            sub_done
        ));
    }

    if rate_limits > 0 {
        parts.push(format!(
            "During execution, **{}** rate limit event(s) were encountered.",
            rate_limits
        ));
    }

    let summary = parts.join(" ");
    tasks::set_lifecycle_summary(db, task_id, &summary);
}

fn format_token_count(n: i64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}

/// Copy task attachments from uploads dir to working dir for Claude access.
fn copy_task_attachments(
    task_id: i64,
    working_dir: &str,
    db: &DbPool,
) -> (Vec<attachments::Attachment>, std::path::PathBuf) {
    let task_attachments = attachments::get_by_task(db, task_id);
    let uploads_dir = db::get_data_dir()
        .parent()
        .map(|p| p.join("uploads"))
        .unwrap_or_default();
    let attach_dir = Path::new(working_dir).join(".claude-attachments");

    if !task_attachments.is_empty() {
        // Prevent symlink attacks - remove if exists and is symlink, then create fresh
        if attach_dir.exists() && attach_dir.is_symlink() {
            log::warn!("Symlink detected at {:?}, removing", attach_dir);
            std::fs::remove_file(&attach_dir).ok();
        }
        if !attach_dir.exists() {
            std::fs::create_dir(&attach_dir).ok();
        }
        for a in &task_attachments {
            let src = uploads_dir.join(&a.filename);
            let dest = attach_dir.join(&a.filename);
            if src.exists() {
                std::fs::copy(&src, &dest).ok();
            }
        }
    }

    (task_attachments, attach_dir)
}

/// Build Claude CLI arguments from task configuration.
fn build_claude_args(
    prompt: &str,
    model: &str,
    effort: &str,
    permission_mode: &str,
    allowed_tools: &str,
    mcp_server_port: u16,
    task_id: i64,
) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        prompt.to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--model".to_string(),
        model.to_string(),
    ];

    // MCP config — sidecar lives under the bundled resources/ dir alongside the
    // executable. Tauri places it at <exe-dir>/resources/mcp-server.js on Windows
    // and Linux. On macOS the executable lives in Contents/MacOS/ but bundled
    // resources are copied to the sibling Contents/Resources/ dir instead, so
    // that layout needs its own candidate. Older layouts had it directly next to
    // the exe, so that's kept as a last-resort fallback.
    let mcp_server_path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .and_then(|exe_dir| {
            let mut candidates = vec![exe_dir.join("resources").join("mcp-server.js")];
            #[cfg(target_os = "macos")]
            candidates.push(
                exe_dir
                    .join("..")
                    .join("Resources")
                    .join("resources")
                    .join("mcp-server.js"),
            );
            candidates.push(exe_dir.join("mcp-server.js"));
            candidates.into_iter().find(|p| p.exists())
        })
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    if mcp_server_path.is_empty() || !std::path::Path::new(&mcp_server_path).exists() {
        log::warn!(
            "MCP sidecar (mcp-server.js) not found near executable; tasks will run without claude-board MCP tools (path tried: {})",
            mcp_server_path
        );
    }

    let mcp_config = serde_json::json!({
        "mcpServers": {
            "claude-board": {
                "command": "node",
                "args": [mcp_server_path],
                "env": {
                    "CLAUDE_BOARD_URL": format!("http://localhost:{}", mcp_server_port),
                    // Lets the sidecar tag permission requests with this task so the
                    // approval card shows up against the right task.
                    "CLAUDE_BOARD_TASK_ID": task_id.to_string(),
                }
            }
        }
    });
    args.extend(["--mcp-config".to_string(), mcp_config.to_string()]);

    // Permission mode: "auto-accept" skips all permissions, "allow-tools" whitelists
    // specific tools, "default" prompts the user for each new tool.
    const PERMISSION_PROMPT_TOOL: &str = "mcp__claude-board__approve_permission";
    if permission_mode == "auto-accept" {
        args.push("--dangerously-skip-permissions".to_string());
    } else if permission_mode == "allow-tools" {
        let tools: Vec<&str> = allowed_tools
            .split(',')
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .collect();
        if tools.is_empty() {
            args.push("--dangerously-skip-permissions".to_string());
        } else {
            for t in tools {
                args.extend(["--allowedTools".to_string(), t.to_string()]);
            }
        }
    } else {
        // "default": interactive approval. Headless runs have no TTY, so instead of
        // passing no flags (which silently blocks tools), route permission prompts
        // through the approval card via the permission-prompt tool. Any explicitly
        // allowed tools are still pre-approved.
        for t in allowed_tools.split(',').map(|t| t.trim()).filter(|t| !t.is_empty()) {
            args.extend(["--allowedTools".to_string(), t.to_string()]);
        }
        args.extend(["--allowedTools".to_string(), PERMISSION_PROMPT_TOOL.to_string()]);
        args.extend(["--permission-prompt-tool".to_string(), PERMISSION_PROMPT_TOOL.to_string()]);
    }

    if effort != "medium" {
        args.extend(["--effort".to_string(), effort.to_string()]);
    }

    // Exact spawn command for post-hoc debugging (prompt redacted to its length).
    let display: Vec<String> = {
        let mut out = Vec::with_capacity(args.len());
        let mut redact_next = false;
        for a in &args {
            if redact_next {
                out.push(format!("<prompt:{} chars>", a.len()));
                redact_next = false;
            } else {
                out.push(a.clone());
                if a == "-p" { redact_next = true; }
            }
        }
        out
    };
    log::info!("[runner] task {} spawn: claude {}", task_id, display.join(" "));
    log::debug!("[runner] task {} prompt:\n{}", task_id, prompt);

    args
}

/// What to do with a finished parent that still has un-done sub-tasks.
#[derive(PartialEq, Debug)]
enum SubtaskDisposition {
    /// Keep the parent in the awaiting state — something will drive the sub-tasks.
    Await,
    /// Nothing will run the sub-tasks (auto-queue off, none started) — don't
    /// strand the parent in a silent forever-await; complete it normally.
    CompleteAnyway,
}

/// Awaiting sub-tasks only makes sense if something will actually run them:
/// the queue is on (its poll picks up ready backlog sub-tasks), or at least one
/// sub-task already left backlog (someone started it manually / earlier).
/// Otherwise the parent would wait forever.
fn subtask_disposition(auto_queue_on: bool, any_subtask_started: bool) -> SubtaskDisposition {
    if auto_queue_on || any_subtask_started {
        SubtaskDisposition::Await
    } else {
        SubtaskDisposition::CompleteAnyway
    }
}

/// Handle process output, track events, and update task state on completion.
#[allow(clippy::too_many_arguments)]
fn handle_process_lifecycle(
    task_id: i64,
    mut child: std::process::Child,
    db: &DbPool,
    app: &AppHandle,
    working_dir: &str,
    project_id: i64,
    task_title: &str,
    task_key: Option<&str>,
    attach_dir: &Path,
    project_working_dir: &str,
) {
    let pid = child.id();
    ACTIVE_PROCESSES.lock().insert(
        task_id,
        ProcessInfo {
            pid,
            started_at: std::time::Instant::now(),
            project_id,
            working_dir: working_dir.to_string(),
        },
    );
    STARTING_TASKS.lock().remove(&task_id);

    // CRITICAL: Drain stderr in background thread to prevent pipe buffer deadlock.
    // On Windows, the pipe buffer is ~64KB. If stderr fills and nobody reads it,
    // the child process blocks writing to stderr, while we block reading stdout → deadlock.
    if let Some(stderr) = child.stderr.take() {
        let app_err = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let line = line.trim().to_string();
                if line.is_empty() {
                    continue;
                }
                // Show stderr in task logs so users see rate limits, errors, warnings
                let db = db::get_db();
                let lower = line.to_lowercase();
                if lower.contains("rate limit")
                    || lower.contains("429")
                    || lower.contains("overloaded")
                    || lower.contains("session limit")
                {
                    let meta = serde_json::json!({"source": "stderr", "raw": &line});
                    tasks::add_log(
                        &db,
                        task_id,
                        &format!("Rate limit warning: {}", line),
                        "error",
                        Some(&meta.to_string()),
                    );
                    app_err
                        .emit(
                            "task:rate_limited",
                            &serde_json::json!({"taskId": task_id, "message": &line}),
                        )
                        .ok();
                    app_err.emit("task:log", &serde_json::json!({
                        "taskId": task_id, "message": format!("Rate limit warning: {}", line),
                        "logType": "error", "meta": meta,
                    })).ok();
                } else if lower.contains("error") || lower.contains("fatal") {
                    tasks::add_log(&db, task_id, &line, "error", None);
                    app_err
                        .emit(
                            "task:log",
                            &serde_json::json!({
                                "taskId": task_id, "message": &line, "logType": "error",
                            }),
                        )
                        .ok();
                } else if !line.is_empty() {
                    tasks::add_log(&db, task_id, &line, "system", None);
                }
            }
        });
    }

    // Read stdout (safe: we configured Stdio::piped, stderr is drained above)
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(event) => super::events::handle_event(task_id, &event, db, app, &EVENT_CTX),
                Err(_) => {
                    tasks::add_log(db, task_id, &line, "claude", None);
                }
            }
        }
    }

    let status = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);

    // Check if process was stopped by user (stop() removes from ACTIVE_PROCESSES before kill)
    let was_user_stopped = !ACTIVE_PROCESSES.lock().contains_key(&task_id);

    // Cleanup process tracking
    ACTIVE_PROCESSES.lock().remove(&task_id);
    STARTING_TASKS.lock().remove(&task_id);
    EVENT_CTX.task_usage.lock().remove(&task_id);
    EVENT_CTX
        .active_tool_calls
        .lock()
        .retain(|_, tc| tc.task_id != task_id);
    super::events::clear_task_file_access(task_id);

    // User manually stopped — don't treat as success or failure
    if was_user_stopped {
        tasks::add_log(db, task_id, "Task stopped by user.", "system", None);
        generate_lifecycle_summary(task_id, db);
        emit_task_updated(db, app, task_id);
        app.emit(
            "claude:finished",
            &serde_json::json!({"taskId": task_id, "exitCode": status}),
        )
        .ok();
        if attach_dir.exists() {
            std::fs::remove_dir_all(attach_dir).ok();
        }
        return;
    }

    if status == 0 {
        scan_git_info(working_dir, task_id, db);

        // PR creation moved to change_task_status (done transition) — not here

        // Generate context summary for Agent Context Handoff
        generate_context_summary(task_id, task_title, db);
        generate_lifecycle_summary(task_id, db);

        tasks::add_log(
            db,
            task_id,
            "Claude finished successfully.",
            "success",
            None,
        );

        // Check if this task spawned sub-tasks that haven't completed yet
        let subtasks = tasks::get_subtasks(db, task_id);
        let has_pending_subtasks =
            !subtasks.is_empty() && !tasks::are_all_subtasks_done(db, task_id);

        // Load the project once and reuse it below (auto-queue check + auto-test).
        let project = projects::get_by_id(db, project_id);

        // Only enter the awaiting state if something will actually drive the
        // sub-tasks to completion; otherwise the parent would hang forever
        // (e.g. an agent that created sub-tasks but did the work inline while
        // the project has auto-queue off).
        let auto_queue_on = project
            .as_ref()
            .is_some_and(|p| p.auto_queue.unwrap_or(0) == 1);
        let any_subtask_started = subtasks
            .iter()
            .any(|s| s.status.as_deref() != Some(TaskStatus::Backlog.as_str()));
        let enter_await = has_pending_subtasks
            && subtask_disposition(auto_queue_on, any_subtask_started)
                == SubtaskDisposition::Await;

        if enter_await {
            // Sub-tasks still running — keep task in_progress but mark as awaiting
            tasks::set_awaiting_subtasks(db, task_id, true);
            tasks::add_log(
                db,
                task_id,
                &format!("Awaiting {} sub-task(s) to complete...", subtasks.len()),
                "system",
                None,
            );
            activity::add(
                db,
                project_id,
                Some(task_id),
                "awaiting_subtasks",
                &format!("Awaiting sub-tasks: {}", task_title),
                None,
            );
            emit_task_updated(db, app, task_id);
        } else {
            if has_pending_subtasks {
                // Nothing will run these sub-tasks (auto-queue off, none started) —
                // don't strand the parent in a silent forever-await. Clear the flag
                // set at create_task time and complete normally.
                tasks::set_awaiting_subtasks(db, task_id, false);
                tasks::add_log(
                    db,
                    task_id,
                    &format!(
                        "{} sub-task(s) remain in backlog and won't run automatically \
                         (auto-queue off) — completing without awaiting; start them \
                         manually if needed.",
                        subtasks.len()
                    ),
                    "system",
                    None,
                );
                activity::add(
                    db,
                    project_id,
                    Some(task_id),
                    "subtasks_not_awaited",
                    &format!("Sub-tasks not awaited (auto-queue off): {}", task_title),
                    None,
                );
            }
            // Normal completion — no pending sub-tasks (or none that will run)
            tasks::update_status(db, task_id, TaskStatus::Testing.as_str());
            tasks::pause_timer(db, task_id);
            tasks::set_completed(db, task_id);
            emit_task_updated(db, app, task_id);
            crate::services::gsd::apply_task_status_cascade(db, Some(app), task_id);

            // Open the PR as soon as the task enters review (Testing) so the
            // user can inspect it during acceptance; accepting the task (Done)
            // merges it. Idempotent — skipped when a PR already exists.
            if let (Some(t), Some(proj)) = (
                tasks::get_by_id(db, task_id),
                projects::get_by_id(db, project_id),
            ) {
                auto_create_pr_public(&t, working_dir, &proj, db, app);
            }

            // Auto-test: if enabled, start verification — don't cascade yet
            // (reuses the `project` loaded above).
            let should_auto_test = project
                .as_ref()
                .is_some_and(|p| p.auto_test.unwrap_or(0) == 1);
            if should_auto_test {
                activity::add(
                    db,
                    project_id,
                    Some(task_id),
                    "test_started",
                    &format!("Auto-test started: {}", task_title),
                    None,
                );
                crate::services::notification::notify_task_completed(
                    app,
                    &crate::services::notification::TaskNotification::new(task_title, task_key),
                );
                crate::services::webhook::fire(
                    project_id,
                    "test_started",
                    &format!("Auto-test started: {}", task_title),
                    serde_json::json!({"taskId": task_id, "taskKey": task_key, "title": task_title}),
                );
                if let (Some(task), Some(proj)) = (tasks::get_by_id(db, task_id), project) {
                    let mcp_port = crate::config::load_from_handle(app).port;
                    start_test(&task, app.clone(), project_working_dir, &proj, mcp_port);
                }
                // Don't cascade — auto-test completion handler will cascade when done
            } else {
                activity::add(
                    db,
                    project_id,
                    Some(task_id),
                    "task_completed",
                    &format!("Task completed: {}", task_title),
                    None,
                );
                crate::services::notification::notify_task_completed(
                    app,
                    &crate::services::notification::TaskNotification::new(task_title, task_key),
                );
                crate::services::webhook::fire(
                    project_id,
                    "task_completed",
                    &format!("Task completed: {}", task_title),
                    serde_json::json!({"taskId": task_id, "taskKey": task_key, "title": task_title}),
                );

                // Without auto-test, the approval flag still governs the next status.
                // require_approval=false means "auto-approve" → move directly to Done.
                let needs_approval = project
                    .as_ref()
                    .and_then(|p| p.require_approval)
                    .unwrap_or(0)
                    == 1;

                if needs_approval {
                    // Manual approval required — leave task in Testing for user review and cascade.
                    crate::services::queue::on_task_completed(db, app, project_id, task_id);
                } else {
                    // Auto-approve: promote Testing → Done and run the same finalization
                    // that the auto-test pass path performs (PR, branch cleanup, GH issue close).
                    tasks::update_status(db, task_id, TaskStatus::Done.as_str());
                    tasks::finalize_timer(db, task_id);
                    generate_lifecycle_summary(task_id, db);
                    emit_task_updated(db, app, task_id);
                    crate::services::gsd::apply_task_status_cascade(db, Some(app), task_id);
                    activity::add(
                        db,
                        project_id,
                        Some(task_id),
                        "task_approved",
                        &format!("Task auto-approved: {}", task_title),
                        None,
                    );

                    if let (Some(done_task), Some(proj)) = (
                        tasks::get_by_id(db, task_id),
                        projects::get_by_id(db, project_id),
                    ) {
                        auto_create_pr_public(&done_task, working_dir, &proj, db, app);
                        let after_pr = tasks::get_by_id(db, task_id).unwrap_or(done_task.clone());
                        // Auto-approve reaches Done → merge the PR, same as manual acceptance.
                        merge_task_pr(&after_pr, working_dir, &proj, db, app);
                        cleanup_task_branch(&after_pr, project_working_dir, &proj, db);
                        let after_merge =
                            tasks::get_by_id(db, task_id).unwrap_or(after_pr.clone());
                        remove_task_worktree_if_safe(&after_merge, project_working_dir, db, app);

                        if proj.github_sync_enabled.unwrap_or(0) == 1 {
                            if let Some(issue_num) = done_task.github_issue_number {
                                let repo = proj.github_repo.as_deref().unwrap_or("").to_string();
                                if !repo.is_empty() {
                                    let pr_url =
                                        after_pr.pr_url.as_deref().unwrap_or("").to_string();
                                    let tk =
                                        done_task.task_key.as_deref().unwrap_or("").to_string();
                                    let comment = if !pr_url.is_empty() {
                                        format!(
                                            "Completed via Claude Board task `{}`. PR: {}",
                                            tk, pr_url
                                        )
                                    } else {
                                        format!("Completed via Claude Board task `{}`.", tk)
                                    };
                                    std::thread::spawn(move || {
                                        if let Ok(token) =
                                            crate::commands::github::get_gh_token_pub()
                                        {
                                            let _ = crate::services::github_sync::close_and_comment(
                                                &token, &repo, issue_num, &comment,
                                            );
                                        }
                                    });
                                }
                            }
                        }
                    }
                    crate::services::queue::on_task_completed(db, app, project_id, task_id);
                }
            }
        }
    } else {
        tasks::add_log(
            db,
            task_id,
            &format!("Claude exited with code {}.", status),
            "error",
            None,
        );
        activity::add(
            db,
            project_id,
            Some(task_id),
            "task_failed",
            &format!("Task failed (exit {}): {}", status, task_title),
            None,
        );
        crate::services::notification::notify_task_failed(
            app,
            &crate::services::notification::TaskNotification::new(task_title, task_key),
            &format!("exit code {}", status),
        );
        crate::services::webhook::fire(
            project_id,
            "task_failed",
            &format!("Task failed (exit {}): {}", status, task_title),
            serde_json::json!({"taskId": task_id, "taskKey": task_key, "title": task_title, "exitCode": status}),
        );
        // Worktree is kept for post-mortem inspection; a retry recreates it fresh.
        crate::services::queue::handle_task_failure(db, app, project_id, task_id);
    }

    // Cleanup attachments
    if attach_dir.exists() {
        std::fs::remove_dir_all(attach_dir).ok();
    }

    app.emit(
        "claude:finished",
        &serde_json::json!({"taskId": task_id, "exitCode": status}),
    )
    .ok();
}

pub fn start(
    task: &tasks::Task,
    app: AppHandle,
    working_dir: &str,
    project: &projects::Project,
    mcp_server_port: u16,
) -> bool {
    let task_id = task.id;
    let db = db::get_db();

    // Atomic check-and-insert: single lock scope prevents TOCTOU race
    {
        let active = ACTIVE_PROCESSES.lock();
        let mut starting = STARTING_TASKS.lock();
        if active.contains_key(&task_id) || starting.contains(&task_id) {
            return false;
        }
        starting.insert(task_id);
    }

    // Assign agent name
    let agent_name = assign_agent_name(task_id, &db);

    let revisions = tasks::get_revisions(&db, task_id);
    let enabled_snippets = snippets::get_enabled_by_project(&db, task.project_id);
    let role = task.role_id.and_then(|rid| roles::get_by_id(&db, rid));

    // Collect context from completed parent tasks (Agent Context Handoff)
    let parent_contexts: Vec<(String, String)> = {
        let parent_ids = crate::db::dependencies::get_parent_ids(&db, task.id);
        parent_ids
            .iter()
            .filter_map(|pid| tasks::get_by_id(&db, *pid))
            .filter_map(|p| {
                p.context_summary
                    .as_ref()
                    .map(|s| (p.title.clone(), s.clone()))
            })
            .collect()
    };

    // Load matching prompt template for this task type
    let template = templates::find_for_task(
        &db,
        task.project_id,
        task.task_type.as_deref().unwrap_or("feature"),
    );

    // Create isolated worktree (or just branch) BEFORE building prompt so branch name is included in instructions
    let mut task_clone = task.clone();
    let (effective_dir, branch_opt) = ensure_task_worktree(task, working_dir, project, &db, &app);
    if let Some(branch) = branch_opt {
        task_clone.branch_name = Some(branch);
    }

    // Copy attachments to effective dir (worktree if created, else working dir)
    let (task_attachments, attach_dir) = copy_task_attachments(task_id, &effective_dir, &db);

    let prompt = build_prompt(
        &task_clone,
        &revisions,
        &enabled_snippets,
        &task_attachments,
        role.as_ref(),
        task.project_id,
        &parent_contexts,
        template.as_ref(),
        Some(project),
    );
    // Reusable-agent config: a role can pin a model / restrict tools; the task's
    // own model always wins, and a role tool-list overrides the project default.
    let model = task
        .model
        .as_deref()
        .or_else(|| role.as_ref().and_then(|r| r.model.as_deref()))
        .unwrap_or("sonnet");
    let effort = task.thinking_effort.as_deref().unwrap_or("medium");
    let permission_mode = project.permission_mode.as_deref().unwrap_or("auto-accept");
    let allowed_tools = role
        .as_ref()
        .and_then(|r| r.allowed_tools.as_deref())
        .filter(|s| !s.is_empty())
        .or(project.allowed_tools.as_deref())
        .unwrap_or("");

    // Snapshot baseline usage
    if let Some(current) = tasks::get_by_id(&db, task_id) {
        EVENT_CTX.task_usage.lock().insert(
            task_id,
            UsageTracker {
                baseline: UsageBaseline {
                    input: current.input_tokens.unwrap_or(0),
                    output: current.output_tokens.unwrap_or(0),
                    cache_read: current.cache_read_tokens.unwrap_or(0),
                    cache_creation: current.cache_creation_tokens.unwrap_or(0),
                    cost: current.total_cost.unwrap_or(0.0),
                },
                session: UsageSession::default(),
            },
        );
    }

    crate::services::notification::notify_task_started(
        &app,
        &crate::services::notification::TaskNotification::new(
            &task.title,
            task.task_key.as_deref(),
        ),
    );
    crate::services::webhook::fire(
        task.project_id,
        "task_started",
        &format!("Task started: {}", task.title),
        serde_json::json!({"taskId": task_id, "taskKey": task.task_key, "title": task.title, "model": task.model}),
    );
    tasks::add_log(
        &db,
        task_id,
        &format!("Agent {} starting task: {}", agent_name, task.title),
        "system",
        None,
    );
    tasks::add_log(
        &db,
        task_id,
        &format!(
            "Model: {} | Effort: {} | Permissions: {}",
            model, effort, permission_mode
        ),
        "info",
        None,
    );
    activity::add(
        &db,
        task.project_id,
        Some(task_id),
        "claude_started",
        &format!("Claude started: {}", task.title),
        None,
    );

    // Build CLI arguments
    let args = build_claude_args(
        &prompt,
        model,
        effort,
        permission_mode,
        allowed_tools,
        mcp_server_port,
        task_id,
    );

    let project_working_dir = working_dir.to_string();
    let project_id = task.project_id;
    let task_title = task.title.clone();
    let task_key = task.task_key.clone();

    std::thread::spawn(move || {
        let mut cmd = env_path::claude_command();
        cmd.args(&args)
            .current_dir(&effective_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let db = db::get_db();
                tasks::add_log(
                    &db,
                    task_id,
                    &format!("Failed to start Claude: {}", e),
                    "error",
                    None,
                );
                STARTING_TASKS.lock().remove(&task_id);
                EVENT_CTX.task_usage.lock().remove(&task_id);
                app.emit(
                    "claude:finished",
                    &serde_json::json!({"taskId": task_id, "exitCode": -1}),
                )
                .ok();
                return;
            }
        };

        let db = db::get_db();
        handle_process_lifecycle(
            task_id,
            child,
            &db,
            &app,
            &effective_dir,
            project_id,
            &task_title,
            task_key.as_deref(),
            &attach_dir,
            &project_working_dir,
        );
    });

    true
}

/// Run auto-test verification: starts Claude with a test-specific prompt.
/// On success → task moves to "done". On failure → requests changes with feedback.
pub fn start_test(
    task: &tasks::Task,
    app: AppHandle,
    working_dir: &str,
    project: &projects::Project,
    mcp_server_port: u16,
) {
    let task_id = task.id;
    let db = db::get_db();

    // Atomic check-and-insert: single lock scope prevents TOCTOU race
    {
        let active = ACTIVE_PROCESSES.lock();
        let mut starting = STARTING_TASKS.lock();
        if active.contains_key(&task_id) || starting.contains(&task_id) {
            return;
        }
        starting.insert(task_id);
    }

    let custom_prompt = project.test_prompt.as_deref().unwrap_or("").to_string();

    // Build test verification prompt
    let diff_stat = task.diff_stat.as_deref().unwrap_or("(no diff available)");
    let test_prompt = format!(
        r#"You are a QA verification agent. A development task has been completed and you must run a thorough verification.

## Completed Task
- **Title:** {title}
- **Type:** {task_type}
- **Description:** {description}
- **Acceptance Criteria:** {criteria}

## Changes Made (diff stat)
```
{diff}
```

{custom}

## CRITICAL: Tool Call Rules
- **NEVER run multiple Bash commands in parallel.** Always run them ONE AT A TIME, sequentially.
  If you run parallel tool calls and one fails, ALL sibling calls get cancelled — this corrupts verification.
- For discovery commands that may legitimately fail (checking if files/directories exist, looking for test suites),
  always append `|| true` or `; echo "done"` so they return exit code 0.
  Example: `ls src/__tests__ 2>/dev/null || echo "no tests dir"` instead of bare `ls src/__tests__`
- Do NOT use `find` on Windows — use `ls` or `dir` patterns with `|| true` fallback.
- Run each verification step fully before moving to the next.

## Verification Steps (execute ALL in order, ONE command at a time)

**IMPORTANT: Before starting each step, output a line like `[STEP N/4] Step Name` so the user can track progress.**

### Step 1: Build Check
Output: `[STEP 1/4] Build Check`
Run the project's build/compile command. Look for package.json (npm run build), Cargo.toml (cargo check), Makefile, etc. Report if build succeeds or fails.

### Step 2: Test Suite
Output: `[STEP 2/4] Test Suite`
First check if a test suite exists (look at package.json scripts, Cargo.toml, pytest.ini etc.). Only run tests if a test command is configured. Report test count, pass/fail counts. If no test suite exists, mark as "skip".

### Step 3: Code Review
Output: `[STEP 3/4] Code Review`
Review the changed files for:
- Syntax errors or broken imports
- Unhandled error cases
- Security concerns (hardcoded secrets, SQL injection, XSS)
- Missing null/undefined checks

### Step 4: Acceptance Criteria
Output: `[STEP 4/4] Acceptance Criteria`
If acceptance criteria is specified, verify each criterion individually. Mark each as PASS or FAIL.

## REQUIRED OUTPUT FORMAT
After all checks, you MUST output this exact JSON block as your final output:

```json
{{
  "verdict": "approve" or "reject",
  "summary": "One-line overall result",
  "checks": [
    {{"name": "Build", "status": "pass" or "fail" or "skip", "detail": "What happened"}},
    {{"name": "Tests", "status": "pass" or "fail" or "skip", "detail": "X passed, Y failed" or "No test suite found"}},
    {{"name": "Code Review", "status": "pass" or "fail" or "warn", "detail": "Issues found or all clean"}},
    {{"name": "Acceptance Criteria", "status": "pass" or "fail" or "skip", "detail": "All N criteria met" or "Criterion X failed"}}
  ],
  "feedback": "Detailed feedback if rejected, empty string if approved"
}}
```
"#,
        title = task.title,
        task_type = task.task_type.as_deref().unwrap_or("feature"),
        description = task.description.as_deref().unwrap_or("(none)"),
        criteria = task
            .acceptance_criteria
            .as_deref()
            .unwrap_or("None specified"),
        diff = diff_stat,
        custom = if custom_prompt.is_empty() {
            String::new()
        } else {
            format!("## Project-Specific Instructions\n{}\n", custom_prompt)
        },
    );

    let config = EngineConfig::from_project(project);
    let model_str = config.auto_test_model.clone();
    let model: &str = &model_str;
    let permission_mode = project.permission_mode.as_deref().unwrap_or("auto-accept");
    let allowed_tools = project.allowed_tools.as_deref().unwrap_or("");

    // Snapshot baseline usage so test-phase tokens are tracked additively
    if let Some(current) = tasks::get_by_id(&db, task_id) {
        EVENT_CTX.task_usage.lock().insert(
            task_id,
            UsageTracker {
                baseline: UsageBaseline {
                    input: current.input_tokens.unwrap_or(0),
                    output: current.output_tokens.unwrap_or(0),
                    cache_read: current.cache_read_tokens.unwrap_or(0),
                    cache_creation: current.cache_creation_tokens.unwrap_or(0),
                    cost: current.total_cost.unwrap_or(0.0),
                },
                session: UsageSession::default(),
            },
        );
    }

    tasks::add_log(
        &db,
        task_id,
        &format!("Auto-test started (model: {})", model),
        "system",
        None,
    );
    tasks::add_log(&db, task_id, "Step 1/4: Build Check", "system", None);
    activity::add(
        &db,
        task.project_id,
        Some(task_id),
        "test_started",
        &format!("Auto-test started: {}", task.title),
        None,
    );
    app.emit(
        "task:test_started",
        &serde_json::json!({"taskId": task_id, "model": model}),
    )
    .ok();

    let args = build_claude_args(
        &test_prompt,
        model,
        "low",
        permission_mode,
        allowed_tools,
        mcp_server_port,
        task_id,
    );
    // Reuse the task's worktree if one exists, otherwise fall back to project working dir
    let effective_dir = get_task_worktree(&db, task_id).unwrap_or_else(|| working_dir.to_string());
    let project_working_dir = working_dir.to_string();
    let project_id = task.project_id;
    let task_title = task.title.clone();
    let task_key = task.task_key.clone();

    std::thread::spawn(move || {
        let mut cmd = env_path::claude_command();
        cmd.args(&args)
            .current_dir(&effective_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let db = db::get_db();
                tasks::add_log(
                    &db,
                    task_id,
                    &format!("Auto-test: Failed to start: {}", e),
                    "error",
                    None,
                );
                STARTING_TASKS.lock().remove(&task_id);
                app.emit(
                    "task:test_completed",
                    &serde_json::json!({"taskId": task_id, "verdict": "error"}),
                )
                .ok();
                return;
            }
        };

        let pid = child.id();
        ACTIVE_PROCESSES.lock().insert(
            task_id,
            ProcessInfo {
                pid,
                started_at: std::time::Instant::now(),
                project_id,
                working_dir: effective_dir.to_string(),
            },
        );
        STARTING_TASKS.lock().remove(&task_id);

        // Drain stderr in background (prevents pipe deadlock + shows errors in real-time)
        if let Some(stderr) = child.stderr.take() {
            let app_err = app.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    let line = line.trim().to_string();
                    if line.is_empty() {
                        continue;
                    }
                    let db = db::get_db();
                    if line.contains("rate limit") || line.contains("429") {
                        tasks::add_log(
                            &db,
                            task_id,
                            &format!("Auto-test: Rate limited — {}", line),
                            "error",
                            None,
                        );
                        app_err
                            .emit("task:rate_limited", &serde_json::json!({"taskId": task_id}))
                            .ok();
                    } else if line.contains("error") || line.contains("Error") {
                        tasks::add_log(
                            &db,
                            task_id,
                            &format!("Auto-test: {}", line),
                            "error",
                            None,
                        );
                    }
                }
            });
        }

        // Stream stdout via the same event handler as normal tasks
        // This gives full tool call grouping, expand/collapse, and rich meta in LiveTerminal
        let mut full_text = String::new();
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let db = db::get_db();
            for line in reader.lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(&line) {
                    Ok(event) => {
                        // Collect text for report extraction
                        if let Some(blocks) =
                            event.pointer("/message/content").and_then(|c| c.as_array())
                        {
                            for block in blocks {
                                if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                                    if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                        full_text.push_str(text);
                                    }
                                }
                            }
                        }
                        // Route through the standard event handler for rich terminal output
                        super::events::handle_event(task_id, &event, &db, &app, &EVENT_CTX);
                    }
                    Err(_) => {
                        tasks::add_log(&db, task_id, &line, "claude", None);
                    }
                }
            }
        }

        let status = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
        ACTIVE_PROCESSES.lock().remove(&task_id);
        STARTING_TASKS.lock().remove(&task_id);
        EVENT_CTX.task_usage.lock().remove(&task_id);
        EVENT_CTX
            .active_tool_calls
            .lock()
            .retain(|_, tc| tc.task_id != task_id);
        super::events::clear_task_file_access(task_id);

        let db = db::get_db();

        if status == 0 {
            let report = extract_test_report(&full_text);
            match report {
                Some(report_json) => {
                    let verdict = report_json
                        .get("verdict")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let summary = report_json
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let feedback = report_json
                        .get("feedback")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    // Save structured report to task
                    tasks::update_test_report(&db, task_id, &report_json.to_string());

                    // Log individual check results
                    if let Some(checks) = report_json.get("checks").and_then(|v| v.as_array()) {
                        for check in checks {
                            let name = check
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Check");
                            let check_status = check
                                .get("status")
                                .and_then(|v| v.as_str())
                                .unwrap_or("skip");
                            let detail = check.get("detail").and_then(|v| v.as_str()).unwrap_or("");
                            let icon = match check_status {
                                "pass" => "PASS",
                                "fail" => "FAIL",
                                "warn" => "WARN",
                                _ => "SKIP",
                            };
                            let lt = match check_status {
                                "fail" => "error",
                                "warn" => "info",
                                _ => "success",
                            };
                            let msg = format!("Auto-test [{}] {}: {}", icon, name, detail);
                            tasks::add_log(&db, task_id, &msg, lt, None);
                            app.emit("task:log", &serde_json::json!({"taskId": task_id, "message": &msg, "logType": lt})).ok();
                        }
                    }

                    // Check if user manually changed task status while auto-test was running
                    let current_status = tasks::get_by_id(&db, task_id)
                        .and_then(|t| t.status)
                        .unwrap_or_default();
                    if current_status != TaskStatus::Testing.as_str() {
                        tasks::add_log(&db, task_id, &format!("Auto-test completed ({}) but task was manually moved to '{}'. Skipping.", verdict, current_status), "info", None);
                        emit_task_updated(&db, &app, task_id);
                        app.emit(
                            "task:test_completed",
                            &serde_json::json!({"taskId": task_id, "verdict": "skipped"}),
                        )
                        .ok();
                    } else if verdict == "approve" {
                        tasks::add_log(
                            &db,
                            task_id,
                            &format!("Auto-test PASSED: {}", summary),
                            "success",
                            None,
                        );
                        app.emit("task:log", &serde_json::json!({"taskId": task_id, "message": format!("Auto-test PASSED: {}", summary), "logType": "success"})).ok();
                        crate::services::notification::notify_test_passed(
                            &app,
                            &crate::services::notification::TaskNotification::new(
                                &task_title,
                                task_key.as_deref(),
                            ),
                        );
                        crate::services::webhook::fire(
                            project_id,
                            "test_passed",
                            &format!("Auto-test passed: {}", task_title),
                            serde_json::json!({"taskId": task_id, "taskKey": task_key, "title": task_title, "summary": summary}),
                        );

                        // Check if project requires manual approval before marking done
                        let needs_approval = projects::get_by_id(&db, project_id)
                            .map(|p| p.require_approval.unwrap_or(0) == 1)
                            .unwrap_or(false);

                        if needs_approval {
                            tasks::update_status(
                                &db,
                                task_id,
                                TaskStatus::AwaitingApproval.as_str(),
                            );
                            emit_task_updated(&db, &app, task_id);
                            crate::services::gsd::apply_task_status_cascade(
                                &db,
                                Some(&app),
                                task_id,
                            );
                            tasks::add_log(
                                &db,
                                task_id,
                                "Auto-test passed. Awaiting manual approval.",
                                "system",
                                None,
                            );
                            activity::add(
                                &db,
                                project_id,
                                Some(task_id),
                                "awaiting_approval",
                                &format!("Awaiting approval: {}", task_title),
                                None,
                            );
                            app.emit(
                                "task:awaiting_approval",
                                &serde_json::json!({"taskId": task_id}),
                            )
                            .ok();
                        } else {
                            tasks::update_status(&db, task_id, TaskStatus::Done.as_str());
                            tasks::finalize_timer(&db, task_id);
                            // Regenerate lifecycle summary with test results included
                            generate_lifecycle_summary(task_id, &db);
                            emit_task_updated(&db, &app, task_id);
                            // Propagate auto-approved Done to GSD roadmap (ROADMAP.md + DB).
                            // Without this, tasks completed by the runner never trigger
                            // phase auto-verify, even though manual Done transitions do.
                            crate::services::gsd::apply_task_status_cascade(
                                &db,
                                Some(&app),
                                task_id,
                            );
                            activity::add(
                                &db,
                                project_id,
                                Some(task_id),
                                "task_approved",
                                &format!("Task auto-approved: {}", task_title),
                                None,
                            );

                            if let (Some(done_task), Some(proj)) = (
                                tasks::get_by_id(&db, task_id),
                                projects::get_by_id(&db, project_id),
                            ) {
                                // Auto-create PR from worktree dir (where commits live)
                                auto_create_pr_public(&done_task, &effective_dir, &proj, &db, &app);
                                let after_pr =
                                    tasks::get_by_id(&db, task_id).unwrap_or(done_task.clone());
                                // Auto-test pass reaches Done → merge the PR, same as manual acceptance.
                                merge_task_pr(&after_pr, &effective_dir, &proj, &db, &app);
                                cleanup_task_branch(&after_pr, &project_working_dir, &proj, &db);
                                let after_merge =
                                    tasks::get_by_id(&db, task_id).unwrap_or(after_pr.clone());
                                remove_task_worktree_if_safe(&after_merge, &project_working_dir, &db, &app);

                                // Auto-close linked GitHub issue
                                if proj.github_sync_enabled.unwrap_or(0) == 1 {
                                    if let Some(issue_num) = done_task.github_issue_number {
                                        let repo =
                                            proj.github_repo.as_deref().unwrap_or("").to_string();
                                        if !repo.is_empty() {
                                            let pr_url = after_pr
                                                .pr_url
                                                .as_deref()
                                                .unwrap_or("")
                                                .to_string();
                                            let tk = done_task
                                                .task_key
                                                .as_deref()
                                                .unwrap_or("")
                                                .to_string();
                                            let comment = if !pr_url.is_empty() {
                                                format!(
                                                    "Completed via Claude Board task `{}`. PR: {}",
                                                    tk, pr_url
                                                )
                                            } else {
                                                format!("Completed via Claude Board task `{}`.", tk)
                                            };
                                            std::thread::spawn(move || {
                                                if let Ok(token) =
                                                    crate::commands::github::get_gh_token_pub()
                                                {
                                                    let _ = crate::services::github_sync::close_and_comment(&token, &repo, issue_num, &comment);
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                            crate::services::queue::on_task_completed(
                                &db, &app, project_id, task_id,
                            );
                        }
                    } else {
                        let fail_msg = if feedback.is_empty() {
                            summary.clone()
                        } else {
                            format!("{} — {}", summary, feedback)
                        };
                        tasks::add_log(
                            &db,
                            task_id,
                            &format!("Auto-test FAILED: {}", fail_msg),
                            "error",
                            None,
                        );
                        app.emit("task:log", &serde_json::json!({"taskId": task_id, "message": format!("Auto-test FAILED: {}", fail_msg), "logType": "error"})).ok();
                        activity::add(
                            &db,
                            project_id,
                            Some(task_id),
                            "test_failed",
                            &format!("Auto-test failed: {}", task_title),
                            None,
                        );
                        crate::services::notification::notify_test_failed(
                            &app,
                            &crate::services::notification::TaskNotification::new(
                                &task_title,
                                task_key.as_deref(),
                            ),
                        );
                        crate::services::webhook::fire(
                            project_id,
                            "test_failed",
                            &format!("Auto-test failed: {}", task_title),
                            serde_json::json!({"taskId": task_id, "taskKey": task_key, "title": task_title, "summary": summary, "feedback": feedback}),
                        );

                        // Auto-revision: create revision record and restart task with test feedback
                        let current_rev = tasks::get_by_id(&db, task_id)
                            .map(|t| t.revision_count.unwrap_or(0))
                            .unwrap_or(0);
                        let engine_config = projects::get_by_id(&db, project_id)
                            .map(|p| EngineConfig::from_project(&p))
                            .unwrap_or_else(|| {
                                EngineConfig::from_project(&projects::Project {
                                    id: 0,
                                    name: String::new(),
                                    slug: String::new(),
                                    working_dir: String::new(),
                                    icon: None,
                                    icon_seed: None,
                                    permission_mode: None,
                                    allowed_tools: None,
                                    auto_queue: None,
                                    max_concurrent: None,
                                    auto_branch: None,
                                    auto_pr: None,
                                    auto_push: None,
                                    auto_merge: None,
                                    pr_base_branch: None,
                                    project_key: None,
                                    task_counter: None,
                                    max_retries: None,
                                    auto_test: None,
                                    test_prompt: None,
                                    task_timeout_minutes: None,
                                    github_repo: None,
                                    github_sync_enabled: None,
                                    max_auto_revisions: None,
                                    retry_base_delay_secs: None,
                                    retry_max_delay_secs: None,
                                    auto_test_model: None,
                                    circuit_breaker_threshold: None,
                                    circuit_breaker_active: None,
                                    consecutive_failures: None,
                                    require_approval: None,
                                    gsd_enabled: None,
                                    pr_provider: None,
                                    created_at: None,
                                    updated_at: None,
                                })
                            });
                        let max_revisions = engine_config.max_auto_revisions;

                        if current_rev < max_revisions {
                            let revision_feedback = if feedback.is_empty() {
                                fail_msg.clone()
                            } else {
                                feedback.clone()
                            };
                            tasks::increment_revision_count(&db, task_id);
                            let rev_num = current_rev + 1;
                            tasks::add_revision(
                                &db,
                                task_id,
                                rev_num,
                                &format!("Auto-test feedback:\n{}", revision_feedback),
                            );
                            tasks::update_status(&db, task_id, TaskStatus::InProgress.as_str());
                            tasks::set_resumed(&db, task_id);
                            crate::services::gsd::apply_task_status_cascade(
                                &db,
                                Some(&app),
                                task_id,
                            );
                            activity::add(
                                &db,
                                project_id,
                                Some(task_id),
                                "auto_revision",
                                &format!(
                                    "Auto-revision #{} from test failure: {}",
                                    rev_num, task_title
                                ),
                                None,
                            );
                            tasks::add_log(
                                &db,
                                task_id,
                                &format!(
                                    "Auto-revision #{}/{}: Restarting with test feedback...",
                                    rev_num, max_revisions
                                ),
                                "system",
                                None,
                            );

                            // Restart the task with revision context (uses project root, start() creates new worktree)
                            if let (Some(updated_task), Some(proj)) = (
                                tasks::get_by_id(&db, task_id),
                                projects::get_by_id(&db, project_id),
                            ) {
                                let mcp_port = crate::config::load_from_handle(&app).port;
                                start(
                                    &updated_task,
                                    app.clone(),
                                    &project_working_dir,
                                    &proj,
                                    mcp_port,
                                );
                            }
                            emit_task_updated(&db, &app, task_id);
                            app.emit("task:test_completed", &serde_json::json!({"taskId": task_id, "verdict": "reject", "summary": summary, "autoRevision": rev_num})).ok();
                        } else {
                            // Max auto-revisions reached — leave in testing for manual review
                            tasks::add_log(
                                &db,
                                task_id,
                                &format!(
                                    "Auto-revision limit ({}) reached. Leaving for manual review.",
                                    max_revisions
                                ),
                                "error",
                                None,
                            );
                            app.emit("task:test_completed", &serde_json::json!({"taskId": task_id, "verdict": "reject", "summary": summary, "maxRevisionsReached": true})).ok();
                            emit_task_updated(&db, &app, task_id);
                        }
                    }
                }
                None => {
                    tasks::add_log(
                        &db,
                        task_id,
                        "Auto-test: Could not parse test report, leaving for manual review.",
                        "info",
                        None,
                    );
                    app.emit(
                        "task:test_completed",
                        &serde_json::json!({"taskId": task_id, "verdict": "unknown"}),
                    )
                    .ok();
                }
            }
        } else {
            tasks::add_log(
                &db,
                task_id,
                &format!("Auto-test: Process exited with code {}.", status),
                "error",
                None,
            );
            app.emit(
                "task:test_completed",
                &serde_json::json!({"taskId": task_id, "verdict": "error"}),
            )
            .ok();
        }
    });
}

fn extract_test_report(text: &str) -> Option<serde_json::Value> {
    // Find the last JSON block containing "verdict" — may be multi-line
    // Strategy 1: find complete JSON object with brace matching
    let search = text.as_bytes();
    let mut best: Option<serde_json::Value> = None;
    let mut i = 0;
    while i < search.len() {
        if search[i] == b'{' {
            let start = i;
            let mut depth = 0;
            let mut j = i;
            while j < search.len() {
                if search[j] == b'{' {
                    depth += 1;
                }
                if search[j] == b'}' {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                j += 1;
            }
            if depth == 0 && j < search.len() {
                let candidate = &text[start..=j];
                if candidate.contains("verdict") {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(candidate) {
                        if v.get("verdict").is_some() {
                            best = Some(v);
                        }
                    }
                }
            }
        }
        i += 1;
    }
    best
}

#[cfg(test)]
mod tests {
    use super::{generate_branch_slug, subtask_disposition, SubtaskDisposition};

    #[test]
    fn slug_transliterates_cyrillic_to_latin() {
        // Russian title → readable latin slug, no raw Cyrillic left.
        assert_eq!(generate_branch_slug("Обновить документацию"), "obnovit-dokumentatsiyu");
        assert!(generate_branch_slug("Починить кнопку").is_ascii());
    }

    #[test]
    fn slug_keeps_ascii_and_mixes() {
        assert_eq!(generate_branch_slug("Fix login bug"), "fix-login-bug");
        // Mixed Cyrillic + latin/technical tokens survive together.
        assert_eq!(generate_branch_slug("Добавить OAuth flow"), "dobavit-oauth-flow");
    }

    #[test]
    fn slug_all_non_ascii_becomes_empty_for_fallback() {
        // Scripts we don't transliterate get dropped, leaving the empty-slug
        // fallback (`task-<id>`) to the caller.
        assert_eq!(generate_branch_slug("日本語"), "");
    }

    #[test]
    fn completes_when_nothing_drives_subtasks() {
        // auto-queue off + no sub-task started → don't strand the parent.
        assert_eq!(
            subtask_disposition(false, false),
            SubtaskDisposition::CompleteAnyway
        );
    }

    #[test]
    fn awaits_when_auto_queue_will_run_them() {
        assert_eq!(
            subtask_disposition(true, false),
            SubtaskDisposition::Await
        );
    }

    #[test]
    fn awaits_when_a_subtask_already_started() {
        assert_eq!(
            subtask_disposition(false, true),
            SubtaskDisposition::Await
        );
    }
}
