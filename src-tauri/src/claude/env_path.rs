//! Resolves the PATH that the user's interactive shell sees, so subprocesses we
//! spawn (primarily the `claude` CLI) can be found even when Claude Board itself
//! was launched from Finder/Dock/Spotlight rather than a terminal.
//!
//! On macOS and Linux, GUI-launched processes inherit a bare PATH from `launchd`
//! (roughly `/usr/bin:/bin:/usr/sbin:/sbin` plus a few system dirs) — it does not
//! include directories added by shell rc files, e.g. `~/.local/bin` (where the
//! Claude Code native installer places its binary), nvm/pyenv shims, cargo, or
//! Homebrew on Apple Silicon (`/opt/homebrew/bin`). A bare `Command::new("claude")`
//! then fails with ENOENT even though `claude` works fine from a terminal.

use once_cell::sync::Lazy;
use std::process::Command;

#[cfg(not(target_os = "windows"))]
fn resolve_login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    // -l (login) + -i (interactive) makes the shell source the same rc files a
    // real terminal session would, so it picks up nvm/pyenv/cargo/homebrew/
    // ~/.local/bin. stdin is null'd so an rc file that reads from stdin can't hang us.
    let output = Command::new(&shell)
        .args(["-lic", "printf '%s' \"$PATH\""])
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

#[cfg(target_os = "windows")]
fn resolve_login_shell_path() -> Option<String> {
    // Windows GUI apps inherit the same user PATH a terminal would use, so there's
    // nothing to resolve here.
    None
}

/// The resolved PATH, computed once per process launch and cached — spawning a
/// login shell costs tens of milliseconds, not worth repeating per subprocess.
static RESOLVED_PATH: Lazy<Option<String>> = Lazy::new(|| {
    let login_path = resolve_login_shell_path()?;
    let current_path = std::env::var("PATH").unwrap_or_default();
    if current_path.is_empty() {
        return Some(login_path);
    }
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    Some(format!("{login_path}{sep}{current_path}"))
});

/// Build a `Command` for `program` with PATH extended to match what the user's
/// interactive shell sees. Falls back to the process's own (unmodified) PATH if
/// shell resolution fails for any reason.
pub fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    if let Some(path) = RESOLVED_PATH.as_ref() {
        cmd.env("PATH", path);
    }
    cmd
}

/// Build a `Command` for the `claude` CLI with the resolved PATH applied.
pub fn claude_command() -> Command {
    command("claude")
}
