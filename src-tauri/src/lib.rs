mod accent;
mod commands;
mod desktop_watch;
mod favicon;
mod files;
mod glass;
mod lang;
mod layout;
mod notify;
mod reminders;
mod settings_window;
mod sysinfo;
mod tray;
mod zoom;

use tauri::Manager;

/// Labels of the tile windows declared in tauri.conf.json.
pub const TILES: &[&str] = &["clock", "system", "launchers", "map", "schedule", "notes"];

/// WebView2 arguments of every window, taken from the tile windows in tauri.conf.json by build.rs (windows
/// with different arguments cannot share one WebView2 environment). The first part is wry's default;
/// `--process-per-site` lets all our pages (one origin) share a single renderer process instead of one per
/// window, which saves about a quarter of the app's memory.
pub const BROWSER_ARGS: &str = env!("AITUDESK_BROWSER_ARGS");

/// Window title of a tile, in the interface language (screen readers announce it when a menu opens on the tile).
fn tile_title(label: &str) -> String {
    let name = match label {
        "clock" => lang::pick("часы", "clock"),
        "system" => lang::pick("система", "system"),
        "launchers" => lang::pick("ярлыки", "shortcuts"),
        "map" => lang::pick("карта", "map"),
        "schedule" => lang::pick("расписание", "schedule"),
        "notes" => lang::pick("заметки", "notes"),
        other => other,
    };
    format!("AITU Desk: {name}")
}

/// Command-line flag of the login start (written into the Run key by the autostart plugin).
const AUTOSTART_ARG: &str = "--autostart";

/// settings.json is plain JSON that people may edit by hand. The store plugin reads a file it cannot parse as
/// empty, and the first save then writes defaults over it, losing lessons and notes. So before anything opens
/// it: a UTF-8 BOM (added by some editors) is dropped, and a file that still does not parse is moved aside as
/// settings.broken-<unix time>.json, next to it, where the data can be recovered.
fn protect_store_file(identifier: &str) {
    let Some(appdata) = std::env::var_os("APPDATA") else { return };
    let dir = std::path::PathBuf::from(appdata).join(identifier);
    let path = dir.join(layout::STORE_FILE);
    let Ok(bytes) = std::fs::read(&path) else { return };
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    if serde_json::from_slice::<serde_json::Value>(body).is_ok() {
        if body.len() != bytes.len() {
            let _ = std::fs::write(&path, body);
        }
        return;
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = std::fs::rename(&path, dir.join(format!("settings.broken-{stamp}.json")));
}

pub fn run() {
    let context = tauri::generate_context!();
    protect_store_file(&context.config().identifier);
    let language = lang::init(&context.config().identifier);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Launching the app again (its shortcut, the Start menu) while it runs opens the settings window on
            // «Общие», where all tiles can be switched on again if they are off. A login start stays quiet.
            if !args.iter().any(|a| a == AUTOSTART_ARG) {
                settings_window::open(app, "general", None);
            }
        }))
        // Every page learns the interface language before its own scripts run.
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("aitudesk-lang").js_init_script(lang::init_script(language)).build())
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
            commands::test_reminder,
            commands::get_layout,
            commands::set_layout,
            commands::save_config_file,
            commands::open_config_file,
            commands::restart_app,
            commands::apply_tile_scale,
            commands::get_tile_zoom,
            sysinfo::get_power,
            sysinfo::get_wifi,
            sysinfo::get_bluetooth,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            layout::restore_all(&handle);
            for label in TILES {
                if let Some(win) = handle.get_webview_window(label) {
                    let _ = win.set_title(&tile_title(label));
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
            reminders::start(handle.clone());
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
        .run(context)
        .expect("error while running AITU Desk");
}
