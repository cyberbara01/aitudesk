//! The pop-up of a folded widget («Маленький», «Средний»): the icon keeps its place, and a click on it opens the
//! whole widget in one shared window in the middle of the screen, under the widget's name and a close button. The
//! window is made once (as soon as some widget is folded) and parked between uses with its page told to stop
//! drawing, so opening costs a move and a frame and an idle pop-up costs nothing. It belongs to the desktop like the
//! tiles (Win+D keeps it), comes to the front when opened and stays open until closed: the close button, Esc, or
//! its icon again.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;

use crate::layout::{self, View};

pub const LABEL: &str = "popup";
/// Logical px: the header with the name and the close button, and the room around the card for its shadow.
const HEADER: f64 = 44.0;
const MARGIN: f64 = 32.0;

/// The widget the pop-up shows now.
static SHOWN: Mutex<Option<String>> = Mutex::new(None);

/// What the pop-up page needs to open: the widget, where its icon is (relative to the pop-up window, physical px,
/// so the card can grow from that side), and for the map a room to show once it is open.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Show {
    label: String,
    icon_x: i32,
    icon_y: i32,
    icon_w: u32,
    icon_h: u32,
    room: Option<String>,
}

pub fn shown() -> Option<String> {
    SHOWN.lock().unwrap().clone()
}

fn hwnd(win: &WebviewWindow) -> Option<HWND> {
    win.hwnd().ok().map(|h| HWND(h.0))
}

/// The pop-up window, made the first time it is needed: like a tile (same browser arguments, so it shares their
/// browser process), but activatable and without acrylic (its card is drawn by the page, so it can be animated).
pub fn ensure(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window(LABEL) {
        return Some(win);
    }
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title(crate::lang::pick("AITU Desk: виджет", "AITU Desk: widget"))
        .inner_size(320.0, 240.0)
        .position(-32000.0, -32000.0)
        .decorations(false)
        .transparent(true)
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
    let (header, margin) = ((HEADER * s).round() as u32, (MARGIN * s).round() as u32);
    let w = (cw + 2 * margin).min(wa.w);
    let h_px = (ch + header + 2 * margin).min(wa.h);
    let x = wa.x + (wa.w as i32 - w as i32) / 2;
    let y = wa.y + (wa.h as i32 - h_px as i32) / 2;
    let (icon_pos, icon_size) = (tile.outer_position().unwrap_or_default(), tile.outer_size().unwrap_or_default());
    *SHOWN.lock().unwrap() = Some(label.to_string());
    layout::set_page_visible(&win, true);
    crate::desktop_watch::place_tile(h, x, y, w, h_px);
    crate::desktop_watch::activate(h);
    let show = Show {
        label: label.to_string(),
        icon_x: icon_pos.x - x,
        icon_y: icon_pos.y - y,
        icon_w: icon_size.width,
        icon_h: icon_size.height,
        room,
    };
    let _ = app.emit_to(LABEL, "popup-show", show);
    let _ = app.emit("popup-state", Some(label.to_string()));
}

/// Closes the pop-up: parked and out of sight; the icons hear it.
pub fn close(app: &AppHandle) {
    if SHOWN.lock().unwrap().take().is_none() {
        return;
    }
    if let Some(win) = app.get_webview_window(LABEL) {
        layout::park_hidden(&win);
    }
    let _ = app.emit("popup-state", None::<String>);
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
