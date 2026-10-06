mod accent;
mod commands;
mod desktop_watch;
mod favicon;
mod glass;
mod layout;
mod settings_window;
mod sysinfo;
mod tray;

use tauri::Manager;

/// Labels of the tile windows declared in tauri.conf.json.
pub const TILES: &[&str] = &["clock", "system", "launchers", "map", "schedule"];

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second launch just re-surfaces the tiles.
            layout::show_all(app);
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(layout::Visibility::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_accent,
            commands::get_theme,
            commands::get_glass,
            commands::get_work_area,
            commands::save_rect,
            commands::set_window_theme,
            commands::open_settings,
            commands::set_tile_enabled,
            commands::get_user_name,
            commands::fetch_site_icon,
            commands::set_tile_glass,
            commands::set_tiles_hidden,
            commands::get_tiles_hidden,
            commands::reset_layout,
            sysinfo::get_power,
            sysinfo::get_wifi,
            sysinfo::get_bluetooth,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            layout::restore_all(&handle);
            for label in TILES {
                if let Some(win) = handle.get_webview_window(label) {
                    glass::apply(&win);
                    let _ = win.show();
                }
            }
            tray::build(&handle)?;
            desktop_watch::install(&handle);
            // Dev aid: open the settings window at startup (used by the verification scripts).
            #[cfg(debug_assertions)]
            if std::env::var_os("AITUDESK_OPEN_SETTINGS").is_some() {
                settings_window::open(&handle, "tiles", None);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::ThemeChanged(theme) = event {
                glass::retint(window, *theme);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running AITU Desk");
}
