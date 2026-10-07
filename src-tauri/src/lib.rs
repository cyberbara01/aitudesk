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
pub const TILES: &[&str] = &["clock", "system", "launchers", "map", "schedule", "notes"];

/// WebView2 arguments of every window, taken from the tile windows in tauri.conf.json by build.rs (windows
/// with different arguments cannot share one WebView2 environment). The first part is wry's default;
/// `--process-per-site` lets all our pages (one origin) share a single renderer process instead of one per
/// window, which saves about a quarter of the app's memory.
pub const BROWSER_ARGS: &str = env!("AITUDESK_BROWSER_ARGS");

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second launch re-surfaces the tiles; `--settings` also opens the settings window.
            layout::show_all(app);
            if args.iter().any(|a| a == "--settings") {
                settings_window::open(app, "general", None);
            }
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
            commands::window_ready,
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
                    glass::make_tool_window(&win);
                }
            }
            // Tiles move into place when their page reports its first frame (`window_ready`).
            // Safety net: reveal whatever has not reported within a few seconds.
            let fallback = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(6));
                layout::reveal_all_pending(&fallback);
            });
            tray::build(&handle)?;
            desktop_watch::install(&handle);
            // `aitudesk.exe --settings` (or AITUDESK_OPEN_SETTINGS=1) opens the settings window at startup.
            let want_settings = std::env::args().skip(1).any(|a| a == "--settings")
                || std::env::var_os("AITUDESK_OPEN_SETTINGS").is_some();
            if want_settings {
                settings_window::open(&handle, "general", None);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AITU Desk");
}
