//! Tile positions: defaults (the column layout below), persistence in settings.json, show/hide, per-tile enable.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = "settings.json";
const LAYOUT_KEY: &str = "layout";
pub const SETTINGS_KEY: &str = "settings";
/// «Все виджеты» switched off in «Виджеты»: kept across restarts.
const HIDDEN_KEY: &str = "tilesHidden";
/// Far enough that no monitor arrangement reaches it (Windows itself parks minimized windows at -32000).
const PARK: i32 = -32000;

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// Work area of the primary monitor in physical pixels.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub scale: f64,
}

/// Which tiles are parked off-screen and why.
#[derive(Default)]
pub struct Visibility {
    /// «Все виджеты» switched off in «Виджеты» (persisted as `tilesHidden`).
    pub hidden: Mutex<bool>,
    /// Tiles switched off in settings.
    pub disabled: Mutex<HashSet<String>>,
    /// Tiles created off-screen at startup that have not appeared yet (label: target rect).
    pub pending: Mutex<HashMap<String, Rect>>,
    /// Pending tiles whose page has rendered its first frame and that wait for the others.
    pub ready: Mutex<HashSet<String>>,
    /// The wait for slow pages is over: a tile that becomes ready from now on appears at once.
    pub wait_over: AtomicBool,
    /// Tiles whose page has drawn its first frame. A page kept out of sight since startup (tile off, all tiles
    /// off) draws it only when shown, so showing it waits for that frame instead of a fixed delay.
    pub drawn: Mutex<HashSet<String>>,
}

/// «Размер» of a tile (settings `tileViews`): its size set by hand, or a preset. «Маленький» shows the tile's
/// icon, «Средний» its icon and name; a click opens the full widget as a pop-up (`expand_tile`) that folds back
/// when the tile loses focus. «Большой» is the full widget at its standard size.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum View {
    Manual,
    Small,
    Medium,
    Large,
}

pub fn view_of(app: &AppHandle, label: &str) -> View {
    let view = app
        .store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(SETTINGS_KEY))
        .and_then(|v| v.get("tileViews")?.get(label)?.as_str().map(str::to_owned));
    match view.as_deref() {
        Some("small") => View::Small,
        Some("medium") => View::Medium,
        Some("large") => View::Large,
        _ => View::Manual,
    }
}

/// Logical sizes of the folded tiles.
const SMALL: (f64, f64) = (64.0, 64.0);
const MEDIUM: (f64, f64) = (184.0, 64.0);

/// Where a folded tile's place is kept in the saved layout (only its place counts; its size follows the view).
fn compact_key(label: &str) -> String {
    format!("compact:{label}")
}

/// A w×h rect sharing the corner of `r` that is nearest to a corner of the work area: a tile on the right edge
/// stays on it, one at the bottom stays at the bottom.
fn anchored(r: &Rect, w: u32, h: u32, wa: &WorkArea) -> Rect {
    let (cx, cy) = (r.x + r.w as i32 / 2, r.y + r.h as i32 / 2);
    let (mid_x, mid_y) = (wa.x + wa.w as i32 / 2, wa.y + wa.h as i32 / 2);
    let x = if cx > mid_x { r.x + r.w as i32 - w as i32 } else { r.x };
    let y = if cy > mid_y { r.y + r.h as i32 - h as i32 } else { r.y };
    Rect { x, y, w, h }
}

/// Safety net for a tile shown for the first time: appear even if its page never reports a frame.
const FIRST_FRAME_MAX_MS: u64 = 2500;

/// How long the first ready tile waits for the others, so that the tiles appear together. All pages share
/// one renderer process, so they finish their first frame one after another, a few hundred ms apart.
const TOGETHER_MS: u64 = 1200;

fn is_parked(pos: PhysicalPosition<i32>) -> bool {
    pos.x <= PARK + 1000
}

pub fn work_area(win: &WebviewWindow) -> WorkArea {
    let monitor = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());
    match monitor {
        Some(m) => {
            let wa = m.work_area();
            WorkArea {
                x: wa.position.x,
                y: wa.position.y,
                w: wa.size.width,
                h: wa.size.height,
                scale: m.scale_factor(),
            }
        }
        None => WorkArea { x: 0, y: 0, w: 1920, h: 1032, scale: 1.0 },
    }
}

/// Column tiles of the default layout, top to bottom, with their default heights (logical px).
const COLUMN: &[(&str, f64)] = &[
    ("clock", 120.0),
    ("system", 144.0),
    ("launchers", 184.0),
    ("schedule", 256.0),
    ("notes", 200.0),
    ("perf", 132.0),
];
const MAP_W: f64 = 720.0;
const MAP_H: f64 = 360.0;
/// The map tile's minimum size (src/components/Tile.tsx); it keeps its 2:1 shape when narrowed.
const MAP_MIN_W: f64 = 400.0;
const MAP_MIN_H: f64 = 220.0;

/// Default layout (logical px at the tiles' zoom, «Масштаб виджетов»): the column tiles flow top to bottom along
/// the right edge and continue in a new column to the left when the screen is not tall enough; the map sits
/// bottom-aligned to the left of the columns.
fn default_rect(app: &AppHandle, label: &str, wa: &WorkArea) -> Rect {
    let s = wa.scale * crate::zoom::current();
    let px = |v: f64| (v * s).round() as i32;
    let margin = 24.0;
    let gap = 16.0;
    let col_w = 280.0;
    let width = wa.w as f64 / s;
    let bottom = wa.h as f64 / s - margin;
    let right_x = width - margin - col_w;

    let mut x = right_x;
    let mut y = margin;
    let mut found = None;
    for &(name, h) in COLUMN {
        if y > margin && y + h > bottom {
            x -= col_w + gap;
            y = margin;
        }
        if name == label {
            found = Some((x, y, col_w, h));
        }
        y += h + gap;
    }
    // `x` is now the leftmost column used.
    let (lx, ly, lw, lh) = match (label, found) {
        (_, Some(r)) => r,
        // A custom widget: a square in the middle of the screen, each next one a little lower and to the right.
        (l, None) if crate::custom::is_custom(l) => {
            let side = crate::custom::DEFAULT_SIZE;
            let step = 32.0 * (crate::custom::index_of(app, l) % 8) as f64;
            let cx = ((width - side) / 2.0 + step).min(width - margin - side).max(margin);
            let cy = ((bottom + margin - side) / 2.0 + step).min(bottom - side).max(margin);
            (cx, cy, side, side)
        }
        ("map", None) => {
            // Left of the columns; on a narrow screen narrower (down to its minimum) rather than over a column.
            let w = (x - gap - margin).clamp(MAP_MIN_W, MAP_W);
            let h = (w * MAP_H / MAP_W).round().max(MAP_MIN_H);
            ((x - gap - w).max(margin), (bottom - h).max(margin), w, h)
        }
        _ => (margin, margin, col_w, 120.0),
    };
    Rect {
        x: wa.x + px(lx),
        y: wa.y + px(ly),
        w: px(lw) as u32,
        h: px(lh) as u32,
    }
}

/// Any tile window (they all share the screen's work area).
fn first_tile(app: &AppHandle) -> Option<WebviewWindow> {
    crate::tile_labels(app).iter().find_map(|l| app.get_webview_window(l))
}

/// A tile window made after startup (a custom widget added in the settings): sized, parked, and shown when its
/// page has drawn, or kept out of sight when it is switched off or all tiles are hidden.
pub fn restore_one(app: &AppHandle, win: &WebviewWindow, label: &str) {
    let vis = app.state::<Visibility>();
    let rect = resolve_rect(app, win, label);
    let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
    park(win);
    let hidden = *vis.hidden.lock().unwrap();
    let enabled = tile_enabled_in_store(app, label);
    if !enabled {
        vis.disabled.lock().unwrap().insert(label.to_string());
    }
    if enabled && !hidden {
        vis.pending.lock().unwrap().insert(label.to_string(), rect);
        // The first widget on an empty desktop (every other one off): the desktop watch starts again.
        crate::desktop_watch::wake(app);
    } else {
        set_page_visible(win, false);
    }
}

/// The widget's own size (its saved rect, or the default one), physical px: what its pop-up shows it at.
pub fn full_size(app: &AppHandle, win: &WebviewWindow, label: &str) -> (u32, u32) {
    let wa = work_area(win);
    let r = match load_layout(app).get(label) {
        Some(r) if intersects(r, &wa) => *r,
        _ => default_rect(app, label, &wa),
    };
    (r.w, r.h)
}

/// A custom widget was deleted: its saved rect and visibility state go too.
pub fn forget(app: &AppHandle, label: &str) {
    crate::popup::close_if(app, label);
    let vis = app.state::<Visibility>();
    vis.disabled.lock().unwrap().remove(label);
    vis.pending.lock().unwrap().remove(label);
    vis.drawn.lock().unwrap().remove(label);
    vis.ready.lock().unwrap().remove(label);
    let mut layout = load_layout(app);
    let compact = layout.remove(&compact_key(label)).is_some();
    if layout.remove(label).is_some() || compact {
        if let Ok(store) = app.store(STORE_FILE) {
            store.set(LAYOUT_KEY, json!(layout));
            let _ = store.save();
        }
    }
}

/// Every saved rect through `f` (the zoom of the tiles or the display scale changed, see zoom.rs), written back
/// at once.
pub fn scale_saved(app: &AppHandle, f: impl Fn(&Rect) -> Rect) {
    let saved = load_layout(app);
    if saved.is_empty() {
        return;
    }
    let scaled: HashMap<String, Rect> = saved.iter().map(|(k, r)| (k.clone(), f(r))).collect();
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(LAYOUT_KEY, json!(scaled));
        let _ = store.save();
    }
}

/// The size a widget shows its content at (an own widget's proportions for the preview in its editor): «Большой»
/// is the default size; otherwise the rect given by hand while it is on this screen, else the default one. A folded
/// widget's pop-up shows the same full size. None while the window does not exist.
pub fn content_rect(app: &AppHandle, label: &str) -> Option<Rect> {
    let win = app.get_webview_window(label)?;
    if view_of(app, label) == View::Large {
        return Some(default_rect(app, label, &work_area(&win)));
    }
    let (w, h) = full_size(app, &win, label);
    Some(Rect { x: 0, y: 0, w, h })
}

fn load_layout(app: &AppHandle) -> HashMap<String, Rect> {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(LAYOUT_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// `settings.tiles[label]` from the shared store (default: enabled).
pub fn tile_enabled_in_store(app: &AppHandle, label: &str) -> bool {
    if crate::custom::is_custom(label) {
        return crate::custom::enabled(app, label);
    }
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(SETTINGS_KEY))
        .and_then(|v| v.get("tiles")?.get(label)?.as_bool())
        // Settings saved before a tile existed do not name it: it starts on, as every tile in DEFAULT_SETTINGS.tiles
        // (src/lib/settings.ts).
        .unwrap_or(true)
}

fn intersects(r: &Rect, wa: &WorkArea) -> bool {
    let (ax1, ay1, ax2, ay2) = (r.x, r.y, r.x + r.w as i32, r.y + r.h as i32);
    let (bx1, by1, bx2, by2) = (wa.x, wa.y, wa.x + wa.w as i32, wa.y + wa.h as i32);
    ax1 < bx2 - 16 && ax2 > bx1 + 16 && ay1 < by2 - 16 && ay2 > by1 + 16
}

/// Where the tile goes for its view: the saved rect (if still on screen) or the default one; for «Большой» the
/// standard size there; folded, the icon at its own saved place (or at the corner of the full rect). A folded
/// widget opens in the pop-up window (popup.rs), its icon stays.
fn resolve_rect(app: &AppHandle, win: &WebviewWindow, label: &str) -> Rect {
    let wa = work_area(win);
    let layout = load_layout(app);
    let full = match layout.get(label) {
        Some(r) if intersects(r, &wa) => *r,
        _ => default_rect(app, label, &wa),
    };
    let view = view_of(app, label);
    match view {
        View::Manual => full,
        View::Large => {
            let d = default_rect(app, label, &wa);
            clamp_into(anchored(&full, d.w, d.h, &wa), &wa)
        }
        View::Small | View::Medium => {
            let s = wa.scale * crate::zoom::current();
            let (lw, lh) = if view == View::Small { SMALL } else { MEDIUM };
            let (w, h) = ((lw * s).round() as u32, (lh * s).round() as u32);
            let icon = match layout.get(&compact_key(label)) {
                Some(r) if intersects(r, &wa) => Rect { w, h, ..*r },
                _ => anchored(&full, w, h, &wa),
            };
            clamp_into(icon, &wa)
        }
    }
}

fn place(win: &WebviewWindow, _label: &str, rect: Rect) {
    // Every tile is resizable in edit mode, so the saved size is restored for all of them.
    match win.hwnd() {
        Ok(h) => crate::desktop_watch::place_tile(windows::Win32::Foundation::HWND(h.0), rect.x, rect.y, rect.w, rect.h),
        Err(_) => {
            let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
            move_to(win, rect.x, rect.y);
        }
    }
}

/// Position and z-order in one SetWindowPos: on screen, right above the desktop (never on top of other windows).
fn move_to(win: &WebviewWindow, x: i32, y: i32) {
    match win.hwnd() {
        Ok(h) => crate::desktop_watch::move_tile(windows::Win32::Foundation::HWND(h.0), x, y),
        Err(_) => {
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
        }
    }
}

fn park(win: &WebviewWindow) {
    let _ = win.set_position(Position::Physical(PhysicalPosition::new(PARK, PARK)));
}

/// A tile the user switched off or hid is out of sight, so its page is told so: WebView2 then reports the
/// page as hidden, stops drawing and throttles its timers, and the tiles' own timers (clock, notes, system
/// polling) pause until it is shown again. Startup parking does not use this: those pages must render their
/// first frame off-screen.
pub(crate) fn set_page_visible(win: &WebviewWindow, visible: bool) {
    let _ = win.with_webview(move |w| {
        // SAFETY: a plain COM call on this window's own WebView2 controller, run on the main thread.
        let _ = unsafe { w.controller().SetIsVisible(visible) };
    });
}

/// No browser shortcuts in this window (reload, print, find, history, the developer tools): it is a widget or the
/// settings, not a web page. The page cancels them as well (main.tsx); this also covers what a page cannot.
pub(crate) fn no_browser_keys(win: &WebviewWindow) {
    let _ = win.with_webview(|w| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows::core::Interface;
        // SAFETY: plain COM calls on this window's own WebView2, run on the main thread.
        unsafe {
            let Ok(core) = w.controller().CoreWebView2() else { return };
            let Ok(settings) = core.Settings() else { return };
            if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        }
    });
}

pub(crate) fn park_hidden(win: &WebviewWindow) {
    park(win);
    set_page_visible(win, false);
}

/// Startup: tiles are created visible but off-screen (tauri.conf.json x/y = -32000). Give each its final size
/// now, so the page lays out exactly as it will look, and keep it parked until the page reports its first
/// frame (`reveal`). Moving an already rendered window on screen shows its content at once: no empty glass,
/// no default look, no flicker. Tiles switched off in settings stay parked.
pub fn restore_all(app: &AppHandle) {
    let vis = app.state::<Visibility>();
    let hidden = app
        .store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(HIDDEN_KEY))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    *vis.hidden.lock().unwrap() = hidden;
    // The zoom first: default rects and a saved layout made at another zoom depend on it.
    if let Some(first) = first_tile(app) {
        crate::zoom::apply(app, &work_area(&first));
    }
    let mut disabled = vis.disabled.lock().unwrap();
    let mut pending = vis.pending.lock().unwrap();
    for label in crate::tile_labels(app) {
        let label = label.as_str();
        let Some(win) = app.get_webview_window(label) else { continue };
        let rect = resolve_rect(app, &win, label);
        let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
        park(&win);
        let enabled = tile_enabled_in_store(app, label);
        if !enabled {
            disabled.insert(label.to_string());
        }
        if enabled && !hidden {
            pending.insert(label.to_string(), rect);
        } else {
            // Out of sight until switched on: the page loads but does not draw or run its timers.
            set_page_visible(&win, false);
        }
    }
}

/// The page of tile `label` rendered its first frame. The tiles appear together: the last ready one reveals
/// them all; a slow page holds the others back for at most TOGETHER_MS, after that each remaining tile
/// appears as soon as it is ready.
pub fn mark_ready(app: &AppHandle, label: &str) {
    let vis = app.state::<Visibility>();
    vis.drawn.lock().unwrap().insert(label.to_string());
    let (all_ready, first) = {
        let pending = vis.pending.lock().unwrap();
        if !pending.contains_key(label) {
            return;
        }
        let mut ready = vis.ready.lock().unwrap();
        let first = ready.is_empty();
        ready.insert(label.to_string());
        (pending.keys().all(|k| ready.contains(k)), first)
    };
    if all_ready || vis.wait_over.load(Ordering::SeqCst) {
        reveal_ready(app);
    } else if first {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(TOGETHER_MS));
            app.state::<Visibility>().wait_over.store(true, Ordering::SeqCst);
            reveal_ready(&app);
        });
    }
}

fn reveal_ready(app: &AppHandle) {
    let labels: Vec<String> = app.state::<Visibility>().ready.lock().unwrap().drain().collect();
    for label in labels {
        reveal(app, &label);
    }
}

/// Move a pending tile from the parking position to its rect (once).
pub fn reveal(app: &AppHandle, label: &str) {
    let vis = app.state::<Visibility>();
    let Some(rect) = vis.pending.lock().unwrap().remove(label) else { return };
    if *vis.hidden.lock().unwrap() || vis.disabled.lock().unwrap().contains(label) {
        return;
    }
    if let Some(win) = app.get_webview_window(label) {
        move_to(&win, rect.x, rect.y);
    }
}

/// Safety net: reveal tiles whose page never reported (a script error must not leave them invisible).
pub fn reveal_all_pending(app: &AppHandle) {
    let labels: Vec<String> = app.state::<Visibility>().pending.lock().unwrap().keys().cloned().collect();
    for label in labels {
        reveal(app, &label);
    }
}

/// Persist a tile rect (physical px). A parked position is never saved; only the size is updated then.
pub fn save_rect(app: &AppHandle, label: &str, rect: Rect) -> Result<(), String> {
    // A folded tile keeps its own place apart from its full rect.
    let key = match view_of(app, label) {
        View::Small | View::Medium => compact_key(label),
        _ => label.to_string(),
    };
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut layout = load_layout(app);
    let next = if is_parked(PhysicalPosition::new(rect.x, rect.y)) {
        let Some(prev) = layout.get(&key).copied() else { return Ok(()) };
        Rect { w: rect.w, h: rect.h, ..prev }
    } else {
        rect
    };
    layout.insert(key, next);
    store.set(LAYOUT_KEY, json!(layout));
    store.save().map_err(|e| e.to_string())
}

/// Bring one tile back from the parking position to its saved/default rect.
/// Only moves the window: tao flag setters (show, always-on-bottom) re-apply styles and activate the
/// window, which flickers; a tile that is not visible yet is shown once by `window_ready`.
fn unpark(app: &AppHandle, win: &WebviewWindow, label: &str) {
    let vis = app.state::<Visibility>();
    let rect = resolve_rect(app, win, label);
    if !vis.drawn.lock().unwrap().contains(label) {
        // Never drawn yet: it appears from `mark_ready` once its first frame is painted (with the other tiles
        // shown at the same time), like at startup. The size first: the layout may have changed (reset,
        // a settings file) since startup gave the window its size, and appearing only moves it.
        let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
        vis.pending.lock().unwrap().insert(label.to_string(), rect);
        set_page_visible(win, true);
        let app = app.clone();
        let label = label.to_string();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(FIRST_FRAME_MAX_MS));
            reveal(&app, &label);
        });
        return;
    }
    vis.pending.lock().unwrap().remove(label);
    set_page_visible(win, true);
    // A page that was hidden draws a fresh frame first, off-screen, then the tile moves into view, unless it
    // was hidden or switched off again meanwhile (a quick double click on «Показать все виджеты»).
    let app = app.clone();
    let win = win.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        let vis = app.state::<Visibility>();
        if *vis.hidden.lock().unwrap() || vis.disabled.lock().unwrap().contains(&label) {
            return;
        }
        place(&win, &label, rect);
    });
}

/// Hide = park off-screen (hide() would drop the acrylic); show = move back to the saved rect. The choice is
/// saved, so tiles switched off stay off after a restart until they are switched on in «Виджеты».
pub fn set_hidden(app: &AppHandle, hidden: bool) {
    let vis = app.state::<Visibility>();
    // Set first: a page that reports its first frame while the tiles are being shown must find them shown.
    *vis.hidden.lock().unwrap() = hidden;
    let disabled = vis.disabled.lock().unwrap().clone();
    if hidden {
        crate::popup::close(app);
    }
    for label in crate::tile_labels(app) {
        let Some(win) = app.get_webview_window(&label) else { continue };
        if hidden {
            park_hidden(&win);
        } else if !disabled.contains(&label) {
            unpark(app, &win, &label);
        }
    }
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(HIDDEN_KEY, json!(hidden));
        let _ = store.save();
    }
    // The settings window shows this state («Все виджеты» in «Виджеты»).
    let _ = app.emit("tiles-hidden", hidden);
    if !hidden {
        crate::desktop_watch::wake(app);
    }
}

pub fn is_hidden(app: &AppHandle) -> bool {
    *app.state::<Visibility>().hidden.lock().unwrap()
}

/// «Виджеты», the switch of one tile: park or restore it.
pub fn set_tile_enabled(app: &AppHandle, label: &str, enabled: bool) {
    if !crate::is_tile(label) {
        return;
    }
    let vis = app.state::<Visibility>();
    let hidden = *vis.hidden.lock().unwrap();
    let mut disabled = vis.disabled.lock().unwrap();
    let Some(win) = app.get_webview_window(label) else { return };
    if enabled {
        disabled.remove(label);
        if !hidden {
            unpark(app, &win, label);
        }
        drop(disabled);
        crate::desktop_watch::wake(app);
    } else {
        disabled.insert(label.to_string());
        drop(disabled);
        crate::popup::close_if(app, label);
        park_hidden(&win);
    }
}

/// Drop the saved layout and re-place every tile at its default rect.
pub fn reset(app: &AppHandle) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(LAYOUT_KEY);
    store.save().map_err(|e| e.to_string())?;
    replace_shown(app);
    Ok(())
}

/// Move every tile on screen to its saved (or default) rect after the layout changed. A tile still waiting for
/// its first frame gets the new size now and appears at the new place; hidden and switched-off tiles take the
/// new rect when they are shown (`unpark`).
pub fn replace_shown(app: &AppHandle) {
    let vis = app.state::<Visibility>();
    let hidden = *vis.hidden.lock().unwrap();
    let disabled = vis.disabled.lock().unwrap();
    let mut pending = vis.pending.lock().unwrap();
    for label in crate::tile_labels(app) {
        let label = label.as_str();
        let Some(win) = app.get_webview_window(label) else { continue };
        if hidden || disabled.contains(label) {
            continue;
        }
        let rect = resolve_rect(app, &win, label);
        if let Some(queued) = pending.get_mut(label) {
            *queued = rect;
            let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
            continue;
        }
        place(&win, label, rect);
    }
}

/// Positions and sizes of the tiles for a settings file, with the screen they were made on. Tiles that were
/// never moved are listed in `defaults` instead: they keep following the default layout, which fits itself to
/// any screen.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LayoutFile {
    pub screen: WorkArea,
    /// Zoom of the tiles the rects were made at («Масштаб виджетов», zoom.rs); files from before it: 1.
    #[serde(default = "unit_zoom")]
    pub zoom: f64,
    pub tiles: HashMap<String, Rect>,
    #[serde(default)]
    pub defaults: Vec<String>,
}

fn unit_zoom() -> f64 {
    1.0
}

/// «Конфиги»: the saved rect of every tile that has one (on this screen), the rest as defaults.
pub fn export(app: &AppHandle) -> Option<LayoutFile> {
    let first = first_tile(app)?;
    let screen = work_area(&first);
    let saved = load_layout(app);
    let mut tiles = HashMap::new();
    let mut defaults = Vec::new();
    for label in crate::TILES {
        match saved.get(*label) {
            Some(r) if intersects(r, &screen) => {
                tiles.insert(label.to_string(), *r);
            }
            _ => defaults.push(label.to_string()),
        }
    }
    Some(LayoutFile { screen, zoom: crate::zoom::current(), tiles, defaults })
}

/// A rect from another screen on this one: the same size in logical px (smaller if the screen is), kept at
/// the same distance from the nearer edge on each axis, so a column along the right edge stays along the
/// right edge and the map stays at the bottom.
fn adapt(r: &Rect, from: &WorkArea, to: &WorkArea) -> Rect {
    if from == to {
        return *r;
    }
    let (fs, ts) = (from.scale.max(0.5), to.scale.max(0.5));
    let axis = |pos: i32, len: u32, f_origin: i32, f_len: u32, t_origin: i32, t_len: u32| -> (i32, u32) {
        let f_total = f_len as f64 / fs;
        let t_total = t_len as f64 / ts;
        let start = (pos - f_origin) as f64 / fs;
        let size = (len as f64 / fs).min(t_total);
        let end_gap = f_total - start - size;
        let next = if end_gap < start { t_total - end_gap - size } else { start };
        let next = next.clamp(0.0, (t_total - size).max(0.0));
        (t_origin + (next * ts).round() as i32, (size * ts).round() as u32)
    };
    let (x, w) = axis(r.x, r.w, from.x, from.w, to.x, to.w);
    let (y, h) = axis(r.y, r.h, from.y, from.h, to.y, to.h);
    Rect { x, y, w, h }
}

/// Smallest tile a settings file can ask for (logical px); each tile's own minimum applies in edit mode.
const MIN_TILE_W: f64 = 120.0;
const MIN_TILE_H: f64 = 64.0;

/// `r` moved (and if need be shrunk) so it lies inside the work area: a rect from a file may hang over an edge.
fn clamp_into(r: Rect, wa: &WorkArea) -> Rect {
    let w = r.w.min(wa.w);
    let h = r.h.min(wa.h);
    let x = r.x.clamp(wa.x, wa.x + (wa.w - w) as i32);
    let y = r.y.clamp(wa.y, wa.y + (wa.h - h) as i32);
    Rect { x, y, w, h }
}

/// Apply the tile rects of a settings file (adapted to this screen) and move the tiles there.
pub fn import(app: &AppHandle, file: LayoutFile) -> Result<(), String> {
    let Some(first) = first_tile(app) else { return Ok(()) };
    let screen = work_area(&first);
    let valid = |a: &WorkArea| {
        a.w >= 200 && a.h >= 200 && a.w <= 100_000 && a.h <= 100_000 && (0.5..=8.0).contains(&a.scale)
    };
    if !valid(&file.screen) {
        return Err("invalid screen".into());
    }
    // Sizes are kept in the widgets' own px: each side's monitor scale times its zoom of the tiles.
    let theirs = if (0.5..=2.0).contains(&file.zoom) { file.zoom } else { 1.0 };
    let from = WorkArea { scale: file.screen.scale * theirs, ..file.screen };
    let to = WorkArea { scale: screen.scale * crate::zoom::current(), ..screen };
    let mut layout = load_layout(app);
    for label in crate::TILES {
        if let Some(r) = file.tiles.get(*label) {
            if (40..=20_000).contains(&r.w) && (40..=20_000).contains(&r.h) {
                let mut next = adapt(r, &from, &to);
                // Never smaller than a usable tile, whatever scale the file claims.
                next.w = next.w.max((MIN_TILE_W * to.scale).round() as u32);
                next.h = next.h.max((MIN_TILE_H * to.scale).round() as u32);
                layout.insert(label.to_string(), clamp_into(next, &screen));
            }
        } else if file.defaults.iter().any(|d| d == label) {
            layout.remove(*label);
        }
    }
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(LAYOUT_KEY, json!(layout));
    store.save().map_err(|e| e.to_string())?;
    replace_shown(app);
    Ok(())
}
