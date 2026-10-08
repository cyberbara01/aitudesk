//! Tray icon with a two-item menu: Настройки · Выход (Settings · Quit). Everything else lives in the settings
//! window.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

const ID_SETTINGS: &str = "settings";
const ID_QUIT: &str = "quit";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, ID_SETTINGS, crate::lang::pick("Настройки", "Settings"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, ID_QUIT, crate::lang::pick("Выход", "Quit"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("AITU Desk")
        .on_tray_icon_event(|tray, event| {
            // Left click opens settings directly; right click shows the menu.
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::settings_window::open(tray.app_handle(), crate::settings_window::home_tab(tray.app_handle()), None);
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            ID_SETTINGS => crate::settings_window::open(app, crate::settings_window::home_tab(app), None),
            ID_QUIT => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
