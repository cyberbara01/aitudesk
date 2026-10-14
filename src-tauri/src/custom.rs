//! «Свои виджеты»: the user's own picture or animation on the desktop, as many as wanted. Each one is a tile
//! window made here (label `custom-<id>`), built like the tiles of tauri.conf.json. Its picture is a copy kept in
//! the app's data folder (`widgets\<16 hex>.<ext>`), never the user's original, checked to really be a PNG,
//! JPEG, GIF, WebP or BMP; pages read it only through `read_widget_image`, which takes nothing but such names.
//! The list itself lives in the settings (`customWidgets`): `sync_custom_widgets` makes the windows that are
//! missing, closes the ones whose widget is gone and deletes pictures no widget uses any more.

use std::path::PathBuf;

use base64::Engine;
use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

use crate::layout::{Visibility, SETTINGS_KEY, STORE_FILE};

pub const PREFIX: &str = "custom-";
/// A picture bigger than this is not taken (an animation of a few hundred frames still fits).
const MAX_IMAGE: usize = 20 * 1024 * 1024;
/// The first size of a new widget, logical px (then the user resizes it).
pub const DEFAULT_SIZE: f64 = 220.0;
/// An unused picture younger than this stays (see `sync`).
const KEEP_UNUSED: std::time::Duration = std::time::Duration::from_secs(3600);

fn valid_id(id: &str) -> bool {
    (4..=16).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

/// A tile label of a custom widget.
pub fn is_custom(label: &str) -> bool {
    label.strip_prefix(PREFIX).is_some_and(valid_id)
}

/// A stored picture's name: 16 lowercase hex digits and the format's extension, nothing else.
fn valid_file(name: &str) -> bool {
    let Some((stem, ext)) = name.split_once('.') else { return false };
    stem.len() == 16
        && stem.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && matches!(ext, "png" | "jpg" | "gif" | "webp" | "bmp")
}

/// The format from the first bytes; None for anything that is not one of the five.
fn image_kind(head: &[u8]) -> Option<&'static str> {
    if head.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a") {
        Some("gif")
    } else if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        Some("webp")
    } else if head.starts_with(b"BM") && head.len() > 26 {
        Some("bmp")
    } else {
        None
    }
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("widgets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn random_hex(len: usize) -> String {
    let mut bytes = vec![0u8; len.div_ceil(2)];
    if getrandom::fill(&mut bytes).is_err() {
        // No system randomness (never seen): the clock still keeps names apart.
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
        bytes.iter_mut().enumerate().for_each(|(i, b)| *b = (nanos >> ((i % 16) * 8)) as u8);
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()[..len].to_string()
}

/// A checked copy of `bytes` in the widgets folder; its name. The same picture again (chosen twice, or coming back
/// with a settings file) is not copied twice: the copy already there is used.
fn store_bytes(app: &AppHandle, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_IMAGE {
        return Err("too large".into());
    }
    let kind = image_kind(bytes).ok_or("not a picture")?;
    let folder = dir(app)?;
    if let Ok(entries) = std::fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let same_size = entry.metadata().is_ok_and(|m| m.len() == bytes.len() as u64);
            if valid_file(&name) && name.ends_with(kind) && same_size && std::fs::read(entry.path()).is_ok_and(|b| b == bytes) {
                return Ok(name);
            }
        }
    }
    let name = format!("{}.{kind}", random_hex(16));
    std::fs::write(folder.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(name)
}

/// «Выбрать картинку»: the Windows open dialog for pictures; the chosen file is checked and copied. Ok(None) =
/// cancelled; Err("too large" | "not a picture" | other) = not taken.
#[tauri::command]
pub async fn pick_widget_image(app: AppHandle, window: WebviewWindow) -> Result<Option<String>, String> {
    let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    let title = crate::lang::pick("Картинка для виджета", "Picture for the widget", "Виджетке арналған сурет").to_string();
    let Some(path) = crate::files::open_image(owner, title)? else { return Ok(None) };
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_IMAGE as u64 {
        return Err("too large".into());
    }
    use std::io::Read;
    let mut bytes = Vec::with_capacity(size as usize);
    std::fs::File::open(&path)
        .and_then(|f| f.take(MAX_IMAGE as u64 + 1).read_to_end(&mut bytes))
        .map_err(|e| e.to_string())?;
    store_bytes(&app, &bytes).map(Some)
}

/// The picture of a widget for its page (and the thumbnail in the settings), as raw bytes.
#[tauri::command]
pub fn read_widget_image(app: AppHandle, file: String) -> Result<tauri::ipc::Response, String> {
    if !valid_file(&file) {
        return Err("bad name".into());
    }
    let bytes = std::fs::read(dir(&app)?.join(&file)).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// «Конфиги»: a widget's picture for a settings file (base64), and a picture from a file stored under a new name.
#[tauri::command]
pub fn widget_image_base64(app: AppHandle, file: String) -> Result<String, String> {
    if !valid_file(&file) {
        return Err("bad name".into());
    }
    let bytes = std::fs::read(dir(&app)?.join(&file)).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn store_widget_image(app: AppHandle, data: String) -> Result<String, String> {
    if data.len() > MAX_IMAGE / 3 * 4 + 4 {
        return Err("too large".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|_| "not a picture".to_string())?;
    store_bytes(&app, &bytes)
}

/// The custom widgets in the settings: (id, name, picture file, enabled).
pub fn listed(app: &AppHandle) -> Vec<(String, String, String, bool)> {
    let Some(list) = app.store(STORE_FILE).ok().and_then(|s| s.get(SETTINGS_KEY)).and_then(|v| v.get("customWidgets").cloned())
    else {
        return Vec::new();
    };
    let Value::Array(items) = list else { return Vec::new() };
    items
        .iter()
        .filter_map(|w| {
            let id = w.get("id")?.as_str()?;
            valid_id(id).then(|| {
                (
                    id.to_string(),
                    w.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
                    w.get("file").and_then(Value::as_str).unwrap_or("").to_string(),
                    w.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                )
            })
        })
        .collect()
}

/// Whether the custom widget `label` is switched on in the settings (a widget not listed counts as off).
pub fn enabled(app: &AppHandle, label: &str) -> bool {
    let id = label.strip_prefix(PREFIX).unwrap_or("");
    listed(app).iter().any(|(i, _, _, on)| i == id && *on)
}

/// Place of the custom widget `label` in the list (its default spot cascades by it).
pub fn index_of(app: &AppHandle, label: &str) -> usize {
    let id = label.strip_prefix(PREFIX).unwrap_or("");
    listed(app).iter().position(|(i, ..)| i == id).unwrap_or(0)
}

/// Window title of a custom widget: its name, or «виджет».
pub fn title(app: &AppHandle, label: &str) -> String {
    let id = label.strip_prefix(PREFIX).unwrap_or("");
    let name = listed(app).into_iter().find(|(i, ..)| i == id).map(|(_, n, ..)| n).unwrap_or_default();
    let name = name.trim();
    format!("AITU Desk: {}", if name.is_empty() { crate::lang::pick("виджет", "widget", "виджет") } else { name })
}

/// A new custom widget window, built like the tiles in tauri.conf.json (same WebView2 arguments, so it shares
/// their browser process), parked off-screen until its page has drawn.
fn create(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title(app, label))
        .inner_size(DEFAULT_SIZE, DEFAULT_SIZE)
        .position(-32000.0, -32000.0)
        .decorations(false)
        .transparent(true)
        // Clear without DWM's blur-behind, like every widget (see popup.rs).
        .no_redirection_bitmap(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .closable(false)
        .focused(false)
        .visible(true)
        .additional_browser_args(crate::BROWSER_ARGS)
        .scroll_bar_style(tauri::webview::ScrollBarStyle::FluentOverlay)
        .build()
}

/// Windows for the listed widgets that have none (each set up like the other tiles and placed), the others
/// renamed and switched on or off as listed, the windows of widgets no longer listed closed, and pictures nobody
/// uses deleted. Startup and every change of the list.
pub fn sync(app: &AppHandle) {
    let list = listed(app);
    for (id, _, _, enabled) in &list {
        let label = format!("{PREFIX}{id}");
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.set_title(&title(app, &label));
            let off = app.state::<Visibility>().disabled.lock().unwrap().contains(&label);
            let want = *enabled && !crate::stacks::holds(app, &label);
            if off == want {
                crate::layout::set_tile_enabled(app, &label, want);
            }
            continue;
        }
        match create(app, &label) {
            Ok(win) => {
                crate::setup_tile(app, &win, &label);
                crate::layout::restore_one(app, &win, &label);
            }
            Err(e) => crate::note!("problem", "custom widget {label}: {e}"),
        }
    }
    for (label, win) in app.webview_windows() {
        if is_custom(&label) && !list.iter().any(|(id, ..)| label == format!("{PREFIX}{id}")) {
            crate::layout::forget(app, &label);
            let _ = win.destroy();
        }
    }
    // Unused pictures go only while the settings are really there. After an unreadable settings file was set aside
    // (settings.broken-*.json, kept so it can be repaired) the store starts empty, and its empty list must not take
    // every picture with it.
    let has_settings = app.store(STORE_FILE).ok().and_then(|s| s.get(SETTINGS_KEY)).is_some_and(|v| v.is_object());
    if !has_settings || broken_settings_kept(app) {
        return;
    }
    if let Ok(folder) = dir(app) {
        let used: Vec<&str> = list.iter().map(|(_, _, file, _)| file.as_str()).collect();
        if let Ok(entries) = std::fs::read_dir(folder) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                // A picture chosen in an editor that is still open is not listed yet: only older ones go.
                let fresh = entry.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_none_or(|age| age < KEEP_UNUSED);
                if valid_file(&name) && !used.contains(&name.as_str()) && !fresh {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }
}

/// How long the pictures stay after an unreadable settings file was set aside: time to repair it.
const KEEP_FOR_REPAIR: std::time::Duration = std::time::Duration::from_secs(7 * 24 * 3600);

/// An unreadable settings file was set aside next to the store (lib.rs protect_store_file) within the last week.
fn broken_settings_kept(app: &AppHandle) -> bool {
    let Ok(folder) = app.path().app_data_dir() else { return true };
    std::fs::read_dir(folder)
        .map(|entries| {
            entries.flatten().any(|e| {
                e.file_name().to_string_lossy().starts_with("settings.broken-")
                    && e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_none_or(|age| age < KEEP_FOR_REPAIR)
            })
        })
        .unwrap_or(false)
}

/// The settings added, removed or renamed a custom widget.
#[tauri::command]
pub async fn sync_custom_widgets(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || sync(&handle));
}
