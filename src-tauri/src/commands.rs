use tauri::{AppHandle, Manager, Theme, WebviewWindow};

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
    if !crate::is_tile(&label) {
        return Err("unknown tile".into());
    }
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
    if crate::is_tile(window.label()) {
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
    if crate::is_tile(window.label()) {
        if let Ok(h) = window.hwnd() {
            crate::desktop_watch::activate(windows::Win32::Foundation::HWND(h.0));
        }
    }
}

/// «Масштаб виджетов» changed (already saved): zoom every tile page, scale the saved layout and move the tiles.
/// Returns the zoom now in use (for "auto" the one this screen gets).
#[tauri::command]
pub fn apply_tile_scale(app: AppHandle) -> f64 {
    let Some(first) = crate::tile_labels(&app).iter().find_map(|l| app.get_webview_window(l)) else { return crate::zoom::current() };
    let zoom = crate::zoom::apply(&app, &crate::layout::work_area(&first));
    crate::layout::replace_shown(&app);
    zoom
}

/// The interface language changed in «Общие» (already saved): start again, so every window, the tray menu and
/// the notifications use it. The exit is a normal one (the single-instance lock is released before the new
/// process starts), and the new process opens the settings window on «Общие» again.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    std::env::set_var("AITUDESK_OPEN_SETTINGS", "general");
    app.request_restart();
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

/// A folded tile («Маленький», «Средний») opens to its full size as a pop-up, or folds back. Opening gives it the
/// keyboard and the focus, so a click anywhere else (its blur) folds it again.
#[tauri::command]
pub fn expand_tile(app: AppHandle, window: WebviewWindow, expanded: bool) {
    let label = window.label().to_string();
    if !crate::is_tile(&label) {
        return;
    }
    // Only a folded view opens; folding is always allowed (the view may have changed meanwhile).
    if expanded && !matches!(layout::view_of(&app, &label), layout::View::Small | layout::View::Medium) {
        return;
    }
    if layout::set_expanded(&app, &window, &label, expanded) && expanded {
        if let Ok(h) = window.hwnd() {
            crate::desktop_watch::activate(windows::Win32::Foundation::HWND(h.0));
        }
    }
}

/// A program fills the screen right now (desktop_watch.rs `front_covers`): the widgets that work on their own rest.
#[tauri::command]
pub fn desktop_covered() -> bool {
    crate::desktop_watch::is_covered()
}

/// «Размер» of tiles changed in the settings: every pop-up folds and every shown tile takes its new rect.
#[tauri::command]
pub fn apply_tile_views(app: AppHandle) {
    layout::fold_all(&app);
    layout::replace_shown(&app);
}

/// Glass background of the calling tile on/off (settings «Фон виджета»).
#[tauri::command]
pub fn set_tile_glass(window: WebviewWindow, on: bool) {
    if crate::is_tile(window.label()) {
        crate::glass::set_tile_glass(&window, on);
    }
}

/// «Все виджеты» in «Общие»: hide or show every tile (the choice survives a restart).
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

/// «Сохранить конфиг»: the standard Windows save dialog over the calling window. `None` = cancelled.
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

/// «Выбрать конфиг»: the standard Windows open dialog; returns the file's text. `None` = cancelled.
#[tauri::command]
pub async fn open_config_file(window: WebviewWindow, title: String) -> Result<Option<crate::files::OpenedFile>, String> {
    let owner = owner_of(&window);
    tauri::async_runtime::spawn_blocking(move || crate::files::open(owner, title))
        .await
        .map_err(|e| e.to_string())?
}
