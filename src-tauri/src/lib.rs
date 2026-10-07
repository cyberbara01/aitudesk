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

/// Command-line flag of the login start (written into the Run key by the autostart plugin).
const AUTOSTART_ARG: &str = "--autostart";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Launching the app again (its shortcut, the Start menu) while it runs: bring the tiles back and
            // open the settings window. Only a login start (`--autostart`) stays quiet.
            layout::show_all(app);
            if !args.iter().any(|a| a == AUTOSTART_ARG) {
                settings_window::open(app, "general", None);
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
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
            commands::activate_tile,
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
                    glass::keep_active_look(&win);
                    if let Ok(h) = win.hwnd() {
                        desktop_watch::attach(windows::Win32::Foundation::HWND(h.0));
                    }
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
            // The login entry written by older versions has no `--autostart`: rewrite it once, so a login
            // start never opens the settings window.
            {
                use tauri_plugin_autostart::ManagerExt;
                let launcher = handle.autolaunch();
                if matches!(launcher.is_enabled(), Ok(true)) {
                    let _ = launcher.enable();
                }
            }
            // Started by hand (shortcut, Start menu, after install): open the settings window too; the first
            // time it shows the welcome page. A login start shows only the tiles.
            let autostart = std::env::args().skip(1).any(|a| a == AUTOSTART_ARG)
                && std::env::var_os("AITUDESK_OPEN_SETTINGS").is_none();
            if !autostart {
                settings_window::open(&handle, "general", None);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AITU Desk");
}
