//! Settings back to their defaults. «Сбросить всё» (commands::reset_everything) leaves a mark in the app's data
//! folder and restarts the app; the next start removes the settings file and the own widgets' pictures before
//! anything reads them, so nothing can write them back, and the app is as it was right after installing. The
//! WebView2 data stays: the app keeps nothing there.
//!
//! The same start also updates settings saved before a default changed (`migrate`), once. A start without any
//! settings file (a fresh install, or right after a reset) switches the start with Windows on (lib.rs).

use std::path::Path;

use serde_json::Value;
use tauri::{AppHandle, Manager};

const MARK: &str = "reset.pending";
/// Defaults changed after a settings file may have been saved. Round 1: «Нагрузка» is a widget that is on, and the
/// accent is «Графит», not «Как в Windows». Round 2: the app starts with Windows. Settings carry the round they
/// have (settings.defaults, src/lib/settings.ts DEFAULT_SETTINGS has the latest) and get each later one exactly
/// once, so a choice made afterwards is never undone.
const DEFAULTS_ROUND: u64 = 2;
/// The round that made the start with Windows the default (lib.rs switches it on for older settings).
pub const AUTOSTART_ROUND: u64 = 2;

/// «Сбросить всё»: the mark for the next start.
pub fn request(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(MARK), b"").map_err(|e| e.to_string())
}

/// At start, before the settings are read: a reset asked for by the previous run is carried out. The settings
/// file and every copy of it (a damaged one kept aside, a backup left by an early version) and the pictures of own
/// widgets go; then the mark.
pub fn apply_pending(dir: &Path) {
    let mark = dir.join(MARK);
    if !mark.exists() {
        return;
    }
    let _ = std::fs::remove_file(dir.join(crate::layout::STORE_FILE));
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let name = e.file_name();
            if name.to_string_lossy().starts_with("settings.") && e.path().is_file() {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let _ = std::fs::remove_dir_all(dir.join("widgets"));
    let _ = std::fs::remove_file(&mark);
}

/// The defaults that changed since `store` (the whole settings.json) was saved. Returns the round the settings had
/// when something changed (the caller applies what lives outside the file), None when they were up to date.
pub fn migrate(store: &mut Value) -> Option<u64> {
    let s = store.get_mut("settings").and_then(Value::as_object_mut)?;
    let round = s.get("defaults").and_then(Value::as_u64).unwrap_or(0);
    if round >= DEFAULTS_ROUND {
        return None;
    }
    if round < 1 {
        // The load widget on, and «Графит» in place of the accent of Windows.
        if let Some(tiles) = s.get_mut("tiles").and_then(Value::as_object_mut) {
            tiles.insert("perf".into(), Value::Bool(true));
        }
        if let Some(accent) = s.get_mut("accent").and_then(Value::as_object_mut) {
            if accent.get("mode").and_then(Value::as_str) == Some("windows") {
                accent.insert("mode".into(), Value::from("preset"));
                accent.insert("preset".into(), Value::from("graphite"));
            }
        }
    }
    // Round 2 (the start with Windows) lives outside the file: lib.rs writes the login entry.
    s.insert("defaults".into(), Value::from(DEFAULTS_ROUND));
    Some(round)
}
