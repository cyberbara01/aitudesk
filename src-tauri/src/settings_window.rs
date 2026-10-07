//! "Настройки": an ordinary decorated, resizable window with Mica (or the style's material) and the system title bar.

use tauri::{AppHandle, Emitter, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "settings";

fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Open the settings window on `tab` (optionally editing launcher `edit`), or focus it if it is already open.
pub fn open(app: &AppHandle, tab: &str, edit: Option<&str>) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.emit("settings-navigate", serde_json::json!({ "tab": tab, "edit": edit }));
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let mut url = format!("index.html?tab={}", encode(tab));
    if let Some(id) = edit {
        url.push_str("&edit=");
        url.push_str(&encode(id));
    }
    // WebviewWindowBuilder::build deadlocks on Windows when called from the main thread
    // inside a sync command / event handler, so build from a worker thread.
    let app = app.clone();
    std::thread::spawn(move || {
        let built = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App(url.into()))
            .title("Настройки AITU Desk")
            .inner_size(860.0, 640.0)
            .min_inner_size(720.0, 560.0)
            .resizable(true)
            .maximizable(true)
            .minimizable(true)
            .center()
            .transparent(true)
            .visible(false)
            .additional_browser_args(crate::BROWSER_ARGS)
            // Must match the tiles (see build.rs); the bars the pages show are drawn by CSS (base.css).
            .scroll_bar_style(tauri::webview::ScrollBarStyle::FluentOverlay)
            .build();
        match built {
            Ok(win) => {
                let dark = !matches!(win.theme(), Ok(Theme::Light));
                crate::glass::apply_mica(&win, dark);
                // The page calls `window_ready` after its first render; show anyway if that never comes.
                std::thread::sleep(std::time::Duration::from_millis(2500));
                if !matches!(win.is_visible(), Ok(true)) {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            Err(e) => eprintln!("[settings] cannot create window: {e}"),
        }
    });
}
