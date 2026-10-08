mod accent;
mod autostart;
mod commands;
mod cputemp;
mod custom;
mod desktop_watch;
mod favicon;
mod files;
mod glass;
mod lang;
mod layout;
mod notify;
mod perf;
mod popup;
mod reminders;
mod reset;
mod settings_window;
mod sysinfo;
mod tray;
mod zoom;

use tauri::{Emitter, Manager};

/// Labels of the tile windows declared in tauri.conf.json.
pub const TILES: &[&str] = &["clock", "system", "perf", "launchers", "map", "schedule", "notes"];

/// WebView2 arguments of every window, taken from the tile windows in tauri.conf.json by build.rs (windows
/// with different arguments cannot share one WebView2 environment). The first part is wry's default;
/// `--process-per-site` lets all our pages (one origin) share a single renderer process instead of one per
/// window, which saves about a quarter of the app's memory.
pub const BROWSER_ARGS: &str = env!("AITUDESK_BROWSER_ARGS");

/// A tile window: a built-in one or a custom widget (`custom-<id>`).
pub fn is_tile(label: &str) -> bool {
    TILES.contains(&label) || custom::is_custom(label)
}

/// Labels of the tile windows that exist now: the built-in ones, then the custom widgets'.
pub fn tile_labels(app: &tauri::AppHandle) -> Vec<String> {
    let mut labels: Vec<String> = TILES.iter().map(|l| l.to_string()).collect();
    let mut own: Vec<String> = app.webview_windows().into_keys().filter(|l| custom::is_custom(l)).collect();
    own.sort();
    labels.extend(own);
    labels
}

/// What every tile window gets once: its title, the glass, the zoom, the place above the desktop.
pub fn setup_tile(app: &tauri::AppHandle, win: &tauri::WebviewWindow, label: &str) {
    let title = if custom::is_custom(label) { custom::title(app, label) } else { tile_title(label) };
    let _ = win.set_title(&title);
    glass::apply(win);
    glass::keep_active_look(win);
    let _ = win.set_zoom(zoom::current());
    layout::no_browser_keys(win);
    if let Ok(h) = win.hwnd() {
        desktop_watch::attach(windows::Win32::Foundation::HWND(h.0));
    }
}

/// Window title of a tile, in the interface language (screen readers announce it when a menu opens on the tile).
fn tile_title(label: &str) -> String {
    let name = match label {
        "clock" => lang::pick("часы", "clock"),
        "system" => lang::pick("система", "system"),
        "perf" => lang::pick("нагрузка", "performance"),
        "launchers" => lang::pick("ярлыки", "shortcuts"),
        "map" => lang::pick("карта", "map"),
        "schedule" => lang::pick("расписание", "schedule"),
        "notes" => lang::pick("заметки", "notes"),
        other => other,
    };
    format!("AITU Desk: {name}")
}

/// Command-line flag of the login start (written into the Run key, autostart.rs).
const AUTOSTART_ARG: &str = "--autostart";

/// settings.json is plain JSON that people may edit by hand. The store plugin reads a file it cannot parse as
/// empty, and the first save then writes defaults over it, losing lessons and notes. So before anything opens
/// it: a reset asked for by the previous run is carried out (reset.rs), a UTF-8 BOM (added by some editors) is
/// dropped, a file that still does not parse is moved aside as settings.broken-<unix time>.json, next to it,
/// where the data can be recovered, and defaults changed since the file was saved are applied once.
/// Returns whether the start with Windows is to be switched on now: the first start of a fresh install (no
/// settings yet, also right after «Сбросить всё»), or settings from before it became the default.
/// A second launch only hands its arguments to the running instance and exits; it must not touch the store file,
/// which the running instance may be writing at that very moment. tauri-plugin-single-instance holds a mutex
/// named «<identifier>-sim» for as long as the first instance runs.
fn another_instance_runs(identifier: &str) -> bool {
    use windows::Win32::System::Threading::{OpenMutexW, SYNCHRONIZATION_SYNCHRONIZE};
    let name = windows::core::HSTRING::from(format!("{identifier}-sim"));
    // SAFETY: opens (and closes again) a handle to a named mutex, nothing else.
    match unsafe { OpenMutexW(SYNCHRONIZATION_SYNCHRONIZE, false, &name) } {
        Ok(handle) => {
            unsafe {
                let _ = windows::Win32::Foundation::CloseHandle(handle);
            }
            true
        }
        Err(_) => false,
    }
}

/// %APPDATA% as the store plugin resolves it (the Roaming known folder), not from the environment.
fn roaming_app_data() -> Option<std::path::PathBuf> {
    use windows::Win32::UI::Shell::{FOLDERID_RoamingAppData, SHGetKnownFolderPath, KNOWN_FOLDER_FLAG};
    // SAFETY: the returned string is copied and then freed with CoTaskMemFree.
    unsafe {
        let raw = SHGetKnownFolderPath(&FOLDERID_RoamingAppData, KNOWN_FOLDER_FLAG(0), None).ok()?;
        let path = raw.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(raw.0 as *const core::ffi::c_void));
        path.map(std::path::PathBuf::from)
    }
}

fn protect_store_file(identifier: &str) -> bool {
    if another_instance_runs(identifier) {
        return false;
    }
    let Some(appdata) = roaming_app_data() else { return false };
    let dir = appdata.join(identifier);
    reset::apply_pending(&dir);
    let path = dir.join(layout::STORE_FILE);
    let Ok(bytes) = std::fs::read(&path) else { return !path.exists() };
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    if let Ok(mut store) = serde_json::from_slice::<serde_json::Value>(body) {
        let mut autostart = false;
        if let Some(round) = reset::migrate(&mut store) {
            autostart = round < reset::AUTOSTART_ROUND;
            if let Ok(json) = serde_json::to_vec_pretty(&store) {
                let _ = std::fs::write(&path, json);
            }
        } else if body.len() != bytes.len() {
            let _ = std::fs::write(&path, body);
        }
        return autostart;
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = std::fs::rename(&path, dir.join(format!("settings.broken-{stamp}.json")));
    false
}

pub fn run() {
    let context = tauri::generate_context!();
    let start_with_windows = protect_store_file(&context.config().identifier);
    let language = lang::init(&context.config().identifier);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Launching the app again (its shortcut, the Start menu) while it runs opens the settings window on its
            // home page (settings_window::home_tab). A login start stays quiet.
            if !args.iter().any(|a| a == AUTOSTART_ARG) {
                settings_window::open(app, settings_window::home_tab(app), None);
            }
        }))
        // Every page learns the interface language before its own scripts run.
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("aitudesk-lang").js_init_script(lang::init_script(language)).build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        // Only the settings window closes. A widget asked to close (Alt+F4 after a click on it, the window's
        // system menu) stays: a closed widget window would be gone until the next start, whatever the settings
        // say. The pop-up closes the way it always does, back into its icon.
        .on_window_event(|window, event| {
            // Windows' display scale changed under the widgets: the saved layout follows it once (the other tiles'
            // events then find nothing changed) and every tile goes to its place.
            if let tauri::WindowEvent::ScaleFactorChanged { .. } = event {
                let app = window.app_handle();
                if tile_labels(app).iter().any(|l| l == window.label()) {
                    if let Some(win) = app.get_webview_window(window.label()) {
                        let wa = layout::work_area(&win);
                        if zoom::screen_changed(app, &wa) {
                            zoom::apply(app, &wa);
                            layout::replace_shown(app);
                        }
                    }
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label != settings_window::LABEL {
                    api.prevent_close();
                    if label == popup::LABEL {
                        let _ = window.app_handle().emit_to(popup::LABEL, "popup-close", ());
                    }
                }
            }
        })
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
            commands::get_tile_rect,
            commands::set_layout,
            commands::save_config_file,
            commands::open_config_file,
            commands::restart_app,
            commands::reset_everything,
            commands::open_popup,
            commands::close_popup,
            commands::popup_shown,
            commands::desktop_covered,
            commands::apply_tile_views,
            commands::apply_tile_scale,
            sysinfo::get_power,
            sysinfo::get_wifi,
            sysinfo::get_bluetooth,
            perf::get_perf,
            custom::pick_widget_image,
            custom::read_widget_image,
            custom::widget_image_base64,
            custom::store_widget_image,
            custom::sync_custom_widgets,
            autostart::autostart_enabled,
            autostart::set_autostart,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            layout::restore_all(&handle);
            for label in TILES {
                if let Some(win) = handle.get_webview_window(label) {
                    setup_tile(&handle, &win, label);
                }
            }
            // The user's own picture widgets: windows made now, placed like the others.
            custom::sync(&handle);
            // The pop-up of folded widgets is made ahead of the first click while some widget is folded.
            popup::sync(&handle);
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
            // The start with Windows is on by default: written at the first start (and once for settings from before
            // that default). Later starts write it back when the user wants it and an update's uninstaller deleted
            // it. An existing login entry that is not exactly right (unquoted or without `--autostart` from an older
            // version, or an install that moved) is rewritten.
            if start_with_windows {
                let _ = autostart::enable();
                autostart::remember(&handle, true);
            } else {
                autostart::restore(&handle);
            }
            autostart::refresh();
            // Started by hand (shortcut, Start menu, after install): open the settings window too; the first
            // time it shows the welcome page. A login start shows only the tiles.
            // A restart after a language change or «Сбросить всё» comes back to «Общие», where it was asked for.
            let restarted = std::env::var_os("AITUDESK_OPEN_SETTINGS").is_some();
            let autostart = std::env::args().skip(1).any(|a| a == AUTOSTART_ARG) && !restarted;
            if !autostart {
                let tab = if restarted { "general" } else { settings_window::home_tab(&handle) };
                settings_window::open(&handle, tab, None);
            }
            Ok(())
        })
        .run(context)
        .expect("error while running AITU Desk");
}
