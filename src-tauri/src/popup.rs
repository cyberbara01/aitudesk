//! The pop-up of a folded widget («Маленький», «Средний»): the icon keeps its place, and a click on it opens the
//! whole widget in a card in the middle of the screen. The window covers the screen's work area: the page leaves the
//! desktop as it is and grows the card out of the icon, and a click beside the card, Esc, the close button or leaving
//! for another window closes it the same way back into the icon. The window is made once (as soon as some widget
//! is folded) and parked between uses with its page told to stop drawing, so opening costs a move and a frame and
//! an idle pop-up costs nothing. It belongs to the desktop like the tiles (Win+D keeps it).

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;

use crate::layout::{self, View};

pub const LABEL: &str = "popup";
/// Logical px: the card's header (the widget's icon, its name and the close button), and the least room kept
/// between the card and the edges of the screen.
const HEADER: f64 = 52.0;
const EDGE: f64 = 24.0;
/// After the page let go of the card, the icon on the desktop draws its picture again before the window goes, so
/// the picture that flew back and the one on the icon overlap for a moment instead of blinking.
const PARK_AFTER: Duration = Duration::from_millis(120);

/// The widget the pop-up shows now.
static SHOWN: Mutex<Option<String>> = Mutex::new(None);

/// What the pop-up page needs to open: the widget, where its icon is and where the card goes (physical px,
/// relative to the pop-up window, which covers the work area), and for the map a room to show once it is open.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Show {
    label: String,
    icon_x: i32,
    icon_y: i32,
    icon_w: u32,
    icon_h: u32,
    card_x: i32,
    card_y: i32,
    card_w: u32,
    card_h: u32,
    room: Option<String>,
}

pub fn shown() -> Option<String> {
    SHOWN.lock().unwrap().clone()
}

fn hwnd(win: &WebviewWindow) -> Option<HWND> {
    win.hwnd().ok().map(|h| HWND(h.0))
}

/// The pop-up window, made the first time it is needed: like a tile (same browser arguments, so it shares their
/// browser process), but activatable and without acrylic (the page draws the card and its shadow, so they animate).
/// Clear around the card through DirectComposition only (no redirection bitmap, so no blur-behind that depends on
/// Windows' transparency effects), and with no system material behind it at all (glass.rs clear_backdrop): on some
/// Windows 11 builds the automatic choice drew Mica behind the whole window, one dark colour over the desktop.
pub fn ensure(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window(LABEL) {
        return Some(win);
    }
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title(crate::lang::pick("AITU Desk: виджет", "AITU Desk: widget", "AITU Desk: виджет"))
        .inner_size(320.0, 240.0)
        .position(-32000.0, -32000.0)
        .decorations(false)
        .transparent(true)
        .no_redirection_bitmap(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .closable(false)
        .focused(false)
        .visible(true)
        // Touchpad pinch on the map: WebView2 lets it through only when it is on before the page loads, and wry
        // ties it to the zoom keys; the page cancels both (main.tsx), so only the map's own zoom moves.
        .zoom_hotkeys_enabled(true)
        .additional_browser_args(crate::BROWSER_ARGS)
        .scroll_bar_style(tauri::webview::ScrollBarStyle::FluentOverlay)
        .build()
        .ok()?;
    let _ = win.set_zoom(crate::zoom::current());
    layout::no_browser_keys(&win);
    crate::glass::clear_backdrop(&win);
    if let Some(h) = hwnd(&win) {
        crate::desktop_watch::attach_popup(h);
    }
    // Out of the way (a transparent window still takes clicks) and not drawing until opened.
    layout::park_hidden(&win);
    Some(win)
}

/// After the views changed (and at startup): the window is made ahead of the first click while any widget is
/// folded, and a pop-up whose widget is not folded any more closes.
pub fn sync(app: &AppHandle) {
    let folded = |label: &str| matches!(layout::view_of(app, label), View::Small | View::Medium);
    if let Some(label) = shown() {
        if !folded(&label) || !layout::tile_enabled_in_store(app, &label) {
            close(app);
        }
    }
    if crate::tile_labels(app).iter().any(|l| folded(l)) {
        ensure(app);
    }
}

/// Opens the pop-up of the folded widget `label` (its tile window is `tile`); its icon again closes it.
pub fn open(app: &AppHandle, tile: &WebviewWindow, label: &str, room: Option<String>) {
    let Some(win) = ensure(app) else { return };
    let Some(h) = hwnd(&win) else { return };
    if shown().as_deref() == Some(label) && room.is_none() {
        // The page plays the closing animation and then asks to close.
        let _ = app.emit_to(LABEL, "popup-close", ());
        return;
    }
    let wa = layout::work_area(tile);
    let s = wa.scale * crate::zoom::current();
    let (cw, ch) = layout::full_size(app, tile, label);
    let header = (HEADER * s).round() as u32;
    let edge = (EDGE * s).round() as u32;
    // The widget at its own size under the header; a widget bigger than the screen gets what the screen has.
    let card_w = cw.min(wa.w.saturating_sub(2 * edge)).max(1);
    let card_h = (ch + header).min(wa.h.saturating_sub(2 * edge)).max(1);
    let (icon_pos, icon_size) = (tile.outer_position().unwrap_or_default(), tile.outer_size().unwrap_or_default());
    *SHOWN.lock().unwrap() = Some(label.to_string());
    crate::journal::write("popup", &format!("opened {label}"));
    layout::set_page_visible(&win, true);
    // Again on every opening: whatever set a material on the window meanwhile (the theme, another program), the
    // desktop around the card must stay as it is.
    crate::glass::clear_backdrop(&win);
    crate::desktop_watch::place_tile(h, wa.x, wa.y, wa.w, wa.h);
    crate::desktop_watch::activate(h);
    let show = Show {
        label: label.to_string(),
        icon_x: icon_pos.x - wa.x,
        icon_y: icon_pos.y - wa.y,
        icon_w: icon_size.width,
        icon_h: icon_size.height,
        card_x: (wa.w as i32 - card_w as i32) / 2,
        card_y: (wa.h as i32 - card_h as i32) / 2,
        card_w,
        card_h,
        room,
    };
    let _ = app.emit_to(LABEL, "popup-show", show);
    let _ = app.emit("popup-state", Some(label.to_string()));
}

/// Closes the pop-up: the icons hear it at once (the page lets go of its card, the icon shows its picture again),
/// and a moment later the window is parked out of sight, unless something opened it again meanwhile.
pub fn close(app: &AppHandle) {
    let Some(was) = SHOWN.lock().unwrap().take() else { return };
    crate::journal::write("popup", &format!("closed {was}"));
    let _ = app.emit("popup-state", None::<String>);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PARK_AFTER);
        let main = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if shown().is_none() {
                if let Some(win) = main.get_webview_window(LABEL) {
                    layout::park_hidden(&win);
                }
            }
        });
    });
}

/// The pop-up shows `label` and that widget goes out of sight (switched off, all hidden, deleted).
pub fn close_if(app: &AppHandle, label: &str) {
    if shown().as_deref() == Some(label) {
        close(app);
    }
}

/// The pop-up window's handle, for the desktop watch (z-order) while it is open.
pub fn open_hwnd(app: &AppHandle) -> Option<HWND> {
    shown()?;
    app.get_webview_window(LABEL).as_ref().and_then(hwnd)
}
