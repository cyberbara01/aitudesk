use tauri::{AppHandle, Theme, WebviewWindow};

use crate::layout::{self, Rect, WorkArea};

#[tauri::command]
pub fn get_accent(dark: bool) -> Option<String> {
    crate::accent::accent_hex(dark)
}

#[tauri::command]
pub fn get_theme(window: WebviewWindow) -> String {
    match window.theme() {
        Ok(Theme::Light) => "light".into(),
        _ => "dark".into(),
    }
}

/// Whether the system material works for this window (acrylic for tiles, Mica for settings).
#[tauri::command]
pub fn get_glass(window: WebviewWindow) -> bool {
    if window.label() == crate::settings_window::LABEL {
        crate::glass::mica_ok()
    } else {
        crate::glass::glass_ok()
    }
}

#[tauri::command]
pub fn get_work_area(window: WebviewWindow) -> WorkArea {
    layout::work_area(&window)
}

#[tauri::command]
pub fn save_rect(app: AppHandle, label: String, x: i32, y: i32, w: u32, h: u32) -> Result<(), String> {
    layout::save_rect(&app, &label, Rect { x, y, w, h })
}

/// Resolved app palette: light or dark system backdrop (and title bar) for the calling window; for the
/// settings window also its material ("mica" | "acrylic" | "none"; defaults to Mica). The window's tao theme
/// is left alone, so `theme()` and theme-changed events keep reporting the real Windows theme.
#[tauri::command]
pub fn set_window_theme(window: WebviewWindow, dark: bool, material: Option<String>) {
    crate::glass::set_dark_mode(&window, dark);
    if window.label() == crate::settings_window::LABEL {
        crate::glass::set_window_material(&window, material.as_deref().unwrap_or("mica"), dark);
    }
}

/// The calling window has rendered its first frame with the stored settings. Tiles move from their
/// off-screen parking spot into place; the settings window (created hidden) is shown and focused.
#[tauri::command]
pub fn window_ready(app: AppHandle, window: WebviewWindow) {
    if crate::TILES.contains(&window.label()) {
        layout::mark_ready(&app, window.label());
    } else if window.label() == crate::settings_window::LABEL {
        if !matches!(window.is_visible(), Ok(true)) {
            let _ = window.show();
        }
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn open_settings(app: AppHandle, tab: Option<String>, edit: Option<String>) {
    crate::settings_window::open(&app, tab.as_deref().unwrap_or("general"), edit.as_deref());
}

#[tauri::command]
pub fn set_tile_enabled(app: AppHandle, label: String, enabled: bool) {
    layout::set_tile_enabled(&app, &label, enabled);
}

/// Windows account name for the "Система" tile label option.
#[tauri::command]
pub fn get_user_name() -> String {
    std::env::var("USERNAME").unwrap_or_default()
}

/// Download the site icon for a custom launcher (data: URL). Network is used only here, on demand.
#[tauri::command]
pub async fn fetch_site_icon(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::favicon::fetch(&url))
        .await
        .map_err(|e| e.to_string())?
}

/// Glass background of the calling tile on/off (settings "Фон плитки").
#[tauri::command]
pub fn set_tile_glass(window: WebviewWindow, on: bool) {
    if crate::TILES.contains(&window.label()) {
        crate::glass::set_tile_glass(&window, on);
    }
}

/// "Показывать виджеты" master switch from the settings window.
#[tauri::command]
pub fn set_tiles_hidden(app: AppHandle, hidden: bool) {
    layout::set_hidden(&app, hidden);
}

#[tauri::command]
pub fn get_tiles_hidden(app: AppHandle) -> bool {
    layout::is_hidden(&app)
}

/// Forget saved positions/sizes; tiles jump back to the default layout.
#[tauri::command]
pub fn reset_layout(app: AppHandle) -> Result<(), String> {
    layout::reset(&app)
}
