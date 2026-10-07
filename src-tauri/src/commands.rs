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

/// A text field in a tile got the pointer (the map search): let that tile take the keyboard. Tiles are not
/// activated by clicks otherwise (see desktop_watch).
#[tauri::command]
pub fn activate_tile(window: WebviewWindow) {
    if crate::TILES.contains(&window.label()) {
        if let Ok(h) = window.hwnd() {
            crate::desktop_watch::activate(windows::Win32::Foundation::HWND(h.0));
        }
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

/// «Все плитки» in «Общие»: hide or show every tile (the choice survives a restart).
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

/// «Проверить уведомление» on the reminders page.
#[tauri::command]
pub async fn test_reminder(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::reminders::test(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// Tile positions and sizes for a settings file (with the screen they were made on).
#[tauri::command]
pub fn get_layout(app: AppHandle) -> Option<layout::LayoutFile> {
    layout::export(&app)
}

/// Tile positions and sizes from a settings file, adapted to this screen; the tiles move there.
#[tauri::command]
pub fn set_layout(app: AppHandle, layout: layout::LayoutFile) -> Result<(), String> {
    layout::import(&app, layout)
}

fn owner_of(window: &WebviewWindow) -> isize {
    window.hwnd().map(|h| h.0 as isize).unwrap_or(0)
}

/// «Сохранить в файл»: the standard Windows save dialog over the calling window. `None` = cancelled.
#[tauri::command]
pub async fn save_config_file(
    window: WebviewWindow,
    title: String,
    file_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let owner = owner_of(&window);
    tauri::async_runtime::spawn_blocking(move || crate::files::save(owner, title, file_name, contents))
        .await
        .map_err(|e| e.to_string())?
}

/// «Загрузить из файла»: the standard Windows open dialog; returns the file's text. `None` = cancelled.
#[tauri::command]
pub async fn open_config_file(window: WebviewWindow, title: String) -> Result<Option<crate::files::OpenedFile>, String> {
    let owner = owner_of(&window);
    tauri::async_runtime::spawn_blocking(move || crate::files::open(owner, title))
        .await
        .map_err(|e| e.to_string())?
}
