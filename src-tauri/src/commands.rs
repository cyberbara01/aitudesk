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
    // Placed by hand: its cells for every zoom are taken from here.
    crate::grid::forget_base(&app, Some(&label));
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
    if crate::is_tile(window.label()) || window.label() == crate::popup::LABEL {
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
    crate::journal::write("app", "restart (the interface language changed)");
    std::env::set_var("AITUDESK_OPEN_SETTINGS", "general");
    app.request_restart();
}

/// «Сбросить всё» at the bottom of «Общие»: the app becomes as it was right after installing. The settings file
/// (notes, schedule, launchers, layout, everything) and the pictures of own widgets are removed by the next start,
/// before anything reads them (reset.rs); that start finds no settings and switches the start with Windows on, as
/// a fresh install does. The app starts again at once.
#[tauri::command]
pub fn reset_everything(app: AppHandle) -> Result<(), String> {
    crate::journal::write("app", "«Сбросить всё»: everything is reset at the next start");
    crate::reset::request(&app)?;
    crate::popup::close(&app);
    std::env::set_var("AITUDESK_OPEN_SETTINGS", "general");
    app.request_restart();
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle, tab: Option<String>, edit: Option<String>) {
    crate::settings_window::open(&app, tab.as_deref().unwrap_or("general"), edit.as_deref());
}

#[tauri::command]
pub fn set_tile_enabled(app: AppHandle, label: String, enabled: bool) {
    layout::set_tile_enabled(&app, &label, enabled);
}

/// Where every stack on the desktop is (physical px) while a widget is dragged: let go over one, the widget goes in.
#[tauri::command]
pub fn stack_rects(app: AppHandle) -> Vec<(String, layout::Rect)> {
    crate::tile_labels(&app)
        .into_iter()
        .filter(|l| crate::stacks::is_stack(l))
        .filter_map(|l| layout::shown_rect(&app, &l).map(|r| (l, r)))
        .collect()
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

/// A folded widget («Маленький», «Средний») was clicked: the whole widget opens in the pop-up window in the middle
/// of the screen (popup.rs); `room` asks the map to show a room once it is open.
///
/// The pop-up window may have to be made first, and a window must never be made while a command is being handled
/// on the main thread (on Windows that deadlocks WebView2). So the command is async (off the main thread) and hands
/// the work to the main loop, which runs it once the command is done.
#[tauri::command]
pub async fn open_popup(app: AppHandle, window: WebviewWindow, room: Option<String>) {
    let label = window.label().to_string();
    if !crate::is_tile(&label) || !matches!(layout::view_of(&app, &label), layout::View::Small | layout::View::Medium) {
        return;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || crate::popup::open(&handle, &window, &label, room));
}

/// The pop-up's close button or Esc (after its closing animation).
#[tauri::command]
pub fn close_popup(app: AppHandle) {
    crate::popup::close(&app);
}

/// The widget the pop-up shows now, for an icon whose page starts while it is open.
#[tauri::command]
pub fn popup_shown() -> Option<String> {
    crate::popup::shown()
}

/// A program fills the screen right now (desktop_watch.rs `front_covers`): the widgets that work on their own rest.
#[tauri::command]
pub fn desktop_covered() -> bool {
    crate::desktop_watch::is_covered()
}

/// «Размер» of tiles changed in the settings: every shown tile takes its new rect, the pop-up of a widget that is
/// not folded any more closes, and the pop-up window is made ahead of the first click.
/// Async and handed to the main loop: it may make the pop-up window, which must not happen inside a command handled
/// on the main thread (see `open_popup`).
#[tauri::command]
pub async fn apply_tile_views(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        layout::replace_shown(&handle);
        crate::popup::sync(&handle);
    });
}

/// Glass background of the calling tile on/off (settings «Фон виджета») with its corner radius in CSS px
/// («Углы виджетов») and the page's device pixel ratio. Returns the radius the glass really has.
#[tauri::command]
pub fn set_tile_glass(window: WebviewWindow, on: bool, radius: Option<f64>, ratio: Option<f64>) -> f64 {
    let radius = radius.unwrap_or(8.0);
    if crate::is_tile(window.label()) {
        crate::glass::set_tile_glass(&window, on, radius, ratio.unwrap_or(1.0))
    } else {
        radius
    }
}

/// «Выравнивать по сетке», the desktop's icon grid for the calling window's screen (edit mode sizes a widget in
/// whole cells with it).
#[tauri::command]
pub async fn get_desktop_grid(window: WebviewWindow) -> crate::grid::Grid {
    crate::grid::read(&layout::work_area(&window))
}

/// «Выравнивать по сетке» switched on: every widget on screen to the cells of the desktop icons. `mins` are the
/// widgets' smallest sizes in CSS px (a widget sized to its cells never goes below it).
#[tauri::command]
pub async fn align_tiles(app: AppHandle, mins: std::collections::HashMap<String, (f64, f64)>) -> Result<(), String> {
    crate::grid::align_all(&app, &mins)
}

/// «Выравнивать по сетке» switched off: back to the places from before, if nothing moved since.
#[tauri::command]
pub async fn unalign_tiles(app: AppHandle) {
    crate::grid::unalign(&app);
}

/// A widget let go after a move while the grid is on: into the nearest free cells. Returns its new rect.
#[tauri::command]
pub async fn snap_tile(app: AppHandle, window: WebviewWindow, mins: std::collections::HashMap<String, (f64, f64)>) -> Option<Rect> {
    if !crate::is_tile(window.label()) {
        return None;
    }
    crate::grid::snap_one(&app, &window, &mins)
}

/// «Все виджеты» in «Виджеты»: hide or show every tile (the choice survives a restart).
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

/// The size a tile shows its content at (an own widget's proportions for the preview in its editor).
#[tauri::command]
pub fn get_tile_rect(app: AppHandle, label: String) -> Option<layout::Rect> {
    layout::content_rect(&app, &label)
}

/// The main screen and the widgets on it (physical px, from the screen's corner), for the miniature of the desktop
/// the gradient of «Фон виджетов» is placed on.
#[derive(serde::Serialize)]
pub struct DeskShape {
    pub w: u32,
    pub h: u32,
    pub tiles: Vec<Rect>,
}

#[tauri::command]
pub fn desk_shape(app: AppHandle) -> Option<DeskShape> {
    let m = app.primary_monitor().ok().flatten()?;
    let (mx, my) = (m.position().x, m.position().y);
    let (w, h) = (m.size().width, m.size().height);
    let tiles = crate::tile_labels(&app)
        .into_iter()
        .filter_map(|l| layout::shown_rect(&app, &l))
        .filter(|r| r.x + r.w as i32 > mx && r.x < mx + w as i32 && r.y + r.h as i32 > my && r.y < my + h as i32)
        .map(|r| Rect { x: r.x - mx, y: r.y - my, w: r.w, h: r.h })
        .collect();
    Some(DeskShape { w, h, tiles })
}

/// Tile positions and sizes from a settings file, adapted to this screen; the tiles move there.
#[tauri::command]
pub fn set_layout(app: AppHandle, layout: layout::LayoutFile) -> Result<(), String> {
    crate::grid::forget_base(&app, None);
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
