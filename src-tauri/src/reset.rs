//! Settings back to their defaults. «Сбросить всё» (commands::reset_everything) leaves a mark in the app's data
//! folder and restarts the app; the next start removes the settings file and the own widgets' pictures before
//! anything reads them, so nothing can write them back, and the app is as it was right after installing. The
//! WebView2 data stays: the app keeps nothing there.
//!
//! The same start also updates settings saved before a default changed (`migrate`), once.

use std::path::Path;

use serde_json::Value;
use tauri::{AppHandle, Manager};

const MARK: &str = "reset.pending";
/// Defaults changed after a settings file may have been saved: «Нагрузка» is a widget that is on, and the accent
/// is «Графит», not «Как в Windows». Settings carry the round they have (settings.defaults) and get each later
/// one exactly once, so a choice made afterwards is never undone.
const DEFAULTS_ROUND: u64 = 1;

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

/// The defaults that changed since `store` (the whole settings.json) was saved; true when something changed.
pub fn migrate(store: &mut Value) -> bool {
    let Some(s) = store.get_mut("settings").and_then(Value::as_object_mut) else { return false };
    if s.get("defaults").and_then(Value::as_u64).unwrap_or(0) >= DEFAULTS_ROUND {
        return false;
    }
    // Round 1: the load widget on, and «Графит» in place of the accent of Windows.
    if let Some(tiles) = s.get_mut("tiles").and_then(Value::as_object_mut) {
        tiles.insert("perf".into(), Value::Bool(true));
    }
    if let Some(accent) = s.get_mut("accent").and_then(Value::as_object_mut) {
        if accent.get("mode").and_then(Value::as_str) == Some("windows") {
            accent.insert("mode".into(), Value::from("preset"));
            accent.insert("preset".into(), Value::from("graphite"));
        }
    }
    s.insert("defaults".into(), Value::from(DEFAULTS_ROUND));
    true
}
