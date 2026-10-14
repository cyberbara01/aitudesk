//! «Стопки виджетов»: as many stacks as the user makes, each one a tile window (label `stack-<id>`) built like the
//! tiles of tauri.conf.json, with WebView2's pinch on from its creation (a map in a stack zooms by it). The list
//! lives in the settings (`stacks`: id, name, widgets, which way it pages; src/lib/settings.ts). `sync_stacks` makes
//! the windows that are missing, closes the ones whose stack is gone, and parks or brings back every widget by
//! whether a stack holds it (a widget in a stack has no window of its own on the desktop meanwhile).

use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

use crate::layout::{SETTINGS_KEY, STORE_FILE};

pub const PREFIX: &str = "stack-";
/// The first size of a stack, logical px (layout.rs HEIGHTS «stack» for its height).
const SIZE: (f64, f64) = (280.0, 200.0);

fn valid_id(id: &str) -> bool {
    (4..=16).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

/// A tile label of a stack.
pub fn is_stack(label: &str) -> bool {
    label.strip_prefix(PREFIX).is_some_and(valid_id)
}

fn members_of(v: &Value) -> Vec<String> {
    v.get("members")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|m| m.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

/// The stacks in the settings: (id, name, widgets). Settings without a list yet: the one stack of the first
/// version (`stack`, kept while it was on), or for new settings one empty stack, as src/lib/settings.ts makes them.
pub fn listed(app: &AppHandle) -> Vec<(String, String, Vec<String>)> {
    let settings = app.store(STORE_FILE).ok().and_then(|s| s.get(SETTINGS_KEY));
    let settings = settings.as_ref();
    if let Some(list) = settings.and_then(|s| s.get("stacks")).and_then(Value::as_array) {
        return list
            .iter()
            .filter_map(|v| {
                let id = v.get("id")?.as_str()?;
                valid_id(id).then(|| (id.to_string(), v.get("name").and_then(Value::as_str).unwrap_or("").to_string(), members_of(v)))
            })
            .collect();
    }
    match settings.and_then(|s| s.get("stack")) {
        Some(old) if old.get("enabled").and_then(Value::as_bool).unwrap_or(true) => vec![("main".into(), String::new(), members_of(old))],
        Some(_) => Vec::new(),
        None => vec![("main".into(), String::new(), Vec::new())],
    }
}

/// Whether a stack holds widget `label` (then its own window stays parked).
pub fn holds(app: &AppHandle, label: &str) -> bool {
    !is_stack(label) && listed(app).iter().any(|(_, _, members)| members.iter().any(|m| m == label))
}

/// Whether the stack window `label` is listed in the settings.
pub fn exists(app: &AppHandle, label: &str) -> bool {
    listed(app).iter().any(|(id, ..)| label.strip_prefix(PREFIX) == Some(id.as_str()))
}

/// Place of stack `label` in the list (a new stack cascades from the first one's spot by it).
pub fn index_of(app: &AppHandle, label: &str) -> usize {
    let id = label.strip_prefix(PREFIX).unwrap_or("");
    listed(app).iter().position(|(i, ..)| i == id).unwrap_or(0)
}

/// Window title of a stack: its name, else «стопка виджетов» when it is the only one, else «стопка N» (as
/// src/stack/actions.ts stackName names it in the app).
pub fn title(app: &AppHandle, label: &str) -> String {
    let id = label.strip_prefix(PREFIX).unwrap_or("");
    let list = listed(app);
    let at = list.iter().position(|(i, ..)| i == id);
    let name = at.map(|n| list[n].1.trim()).unwrap_or("");
    let shown = match at {
        _ if !name.is_empty() => name.to_string(),
        Some(n) if list.len() > 1 => format!("{} {}", crate::lang::pick("стопка", "stack", "бума"), n + 1),
        _ => crate::lang::pick("стопка виджетов", "widget stack", "виджеттер бумасы").to_string(),
    };
    format!("AITU Desk: {shown}")
}

/// A new stack window, built like the tiles in tauri.conf.json (same WebView2 arguments, so it shares their
/// browser process), parked off-screen until its page has drawn.
fn create(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title(app, label))
        .inner_size(SIZE.0, SIZE.1)
        .position(-32000.0, -32000.0)
        .decorations(false)
        .transparent(true)
        .no_redirection_bitmap(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .closable(false)
        .focused(false)
        .visible(true)
        // A map in the stack zooms by a touchpad pinch; this can only be set when the window is made.
        .zoom_hotkeys_enabled(true)
        .additional_browser_args(crate::BROWSER_ARGS)
        .scroll_bar_style(tauri::webview::ScrollBarStyle::FluentOverlay)
        .build()
}

/// Windows for the listed stacks that have none (set up like the other tiles and placed), the others renamed, the
/// windows of stacks no longer listed closed (their widgets come back to their own places). Startup and every
/// change of the list.
pub fn sync(app: &AppHandle) {
    // The stack of the first version keeps its place and size as `stack-main`.
    crate::layout::move_saved(app, "stack", "stack-main");
    let list = listed(app);
    for (id, ..) in &list {
        let label = format!("{PREFIX}{id}");
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.set_title(&title(app, &label));
            continue;
        }
        match create(app, &label) {
            Ok(win) => {
                crate::journal::write("stack", &format!("window made for {label}"));
                crate::setup_tile(app, &win, &label);
                crate::layout::restore_one(app, &win, &label);
            }
            Err(e) => crate::note!("problem", "stack {label}: {e}"),
        }
    }
    for (label, win) in app.webview_windows() {
        if is_stack(&label) && !list.iter().any(|(id, ..)| label == format!("{PREFIX}{id}")) {
            crate::journal::write("stack", &format!("window closed for {label}"));
            crate::layout::forget(app, &label);
            let _ = win.destroy();
        }
    }
    crate::layout::sync_stack(app);
}

/// The stacks or their widgets changed (src/lib/settings.ts). Windows are made on the main thread, never inside a
/// command running there (that would hang the app while WebView2 starts).
#[tauri::command]
pub async fn sync_stacks(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || sync(&handle));
}
