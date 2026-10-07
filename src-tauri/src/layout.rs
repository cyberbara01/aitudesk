//! Tile positions: defaults (§3 "Сетка и размеры"), persistence in settings.json, show/hide, per-tile enable.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = "settings.json";
const LAYOUT_KEY: &str = "layout";
const SETTINGS_KEY: &str = "settings";
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
#[derive(Serialize, Clone, Copy, Debug)]
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
    /// "Показывать виджеты" switched off in settings.
    pub hidden: Mutex<bool>,
    /// Tiles switched off in settings.
    pub disabled: Mutex<HashSet<String>>,
    /// Tiles created off-screen at startup that have not appeared yet (label: target rect).
    pub pending: Mutex<HashMap<String, Rect>>,
    /// Pending tiles whose page has rendered its first frame and that wait for the others.
    pub ready: Mutex<HashSet<String>>,
    /// The wait for slow pages is over: a tile that becomes ready from now on appears at once.
    pub wait_over: AtomicBool,
}

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
];
const MAP_W: f64 = 640.0;
const MAP_H: f64 = 320.0;
/// The map tile's minimum size (src/components/Tile.tsx); it keeps its 2:1 shape when narrowed.
const MAP_MIN_W: f64 = 400.0;
const MAP_MIN_H: f64 = 220.0;

/// Default layout (logical px): the column tiles flow top to bottom along the right edge and continue in a
/// new column to the left when the screen is not tall enough (laptops, 125-150 % scaling); the map sits
/// bottom-aligned to the left of the columns.
fn default_rect(label: &str, wa: &WorkArea) -> Rect {
    let s = wa.scale;
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

fn load_layout(app: &AppHandle) -> HashMap<String, Rect> {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(LAYOUT_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// `settings.tiles[label]` from the shared store (default: enabled).
pub fn tile_enabled_in_store(app: &AppHandle, label: &str) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(SETTINGS_KEY))
        .and_then(|v| v.get("tiles")?.get(label)?.as_bool())
        .unwrap_or(true)
}

fn intersects(r: &Rect, wa: &WorkArea) -> bool {
    let (ax1, ay1, ax2, ay2) = (r.x, r.y, r.x + r.w as i32, r.y + r.h as i32);
    let (bx1, by1, bx2, by2) = (wa.x, wa.y, wa.x + wa.w as i32, wa.y + wa.h as i32);
    ax1 < bx2 - 16 && ax2 > bx1 + 16 && ay1 < by2 - 16 && ay2 > by1 + 16
}

/// Saved rect if it is still on screen, else the default one.
fn resolve_rect(app: &AppHandle, win: &WebviewWindow, label: &str) -> Rect {
    let wa = work_area(win);
    match load_layout(app).get(label) {
        Some(r) if intersects(r, &wa) => *r,
        _ => default_rect(label, &wa),
    }
}

fn place(win: &WebviewWindow, _label: &str, rect: Rect) {
    // Every tile is resizable in edit mode, so the saved size is restored for all of them.
    let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
    let _ = win.set_position(Position::Physical(PhysicalPosition::new(rect.x, rect.y)));
}

fn park(win: &WebviewWindow) {
    let _ = win.set_position(Position::Physical(PhysicalPosition::new(PARK, PARK)));
}

/// A tile the user switched off or hid is out of sight, so its page is told so: WebView2 then reports the
/// page as hidden, stops drawing and throttles its timers, and the tiles' own timers (clock, notes, system
/// polling) pause until it is shown again. Startup parking does not use this: those pages must render their
/// first frame off-screen.
fn set_page_visible(win: &WebviewWindow, visible: bool) {
    let _ = win.with_webview(move |w| {
        // SAFETY: a plain COM call on this window's own WebView2 controller, run on the main thread.
        let _ = unsafe { w.controller().SetIsVisible(visible) };
    });
}

fn park_hidden(win: &WebviewWindow) {
    park(win);
    set_page_visible(win, false);
}

/// Startup: tiles are created visible but off-screen (tauri.conf.json x/y = -32000). Give each its final size
/// now, so the page lays out exactly as it will look, and keep it parked until the page reports its first
/// frame (`reveal`). Moving an already rendered window on screen shows its content at once: no empty glass,
/// no default look, no flicker. Tiles switched off in settings stay parked.
pub fn restore_all(app: &AppHandle) {
    let vis = app.state::<Visibility>();
    let mut disabled = vis.disabled.lock().unwrap();
    let mut pending = vis.pending.lock().unwrap();
    for label in crate::TILES {
        let Some(win) = app.get_webview_window(label) else { continue };
        let rect = resolve_rect(app, &win, label);
        let _ = win.set_size(Size::Physical(PhysicalSize::new(rect.w, rect.h)));
        park(&win);
        if tile_enabled_in_store(app, label) {
            pending.insert(label.to_string(), rect);
        } else {
            disabled.insert(label.to_string());
            set_page_visible(&win, false);
        }
    }
}

/// The page of tile `label` rendered its first frame. The tiles appear together: the last ready one reveals
/// them all; a slow page holds the others back for at most TOGETHER_MS, after that each remaining tile
/// appears as soon as it is ready.
pub fn mark_ready(app: &AppHandle, label: &str) {
    let vis = app.state::<Visibility>();
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
        let _ = win.set_position(Position::Physical(PhysicalPosition::new(rect.x, rect.y)));
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
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut layout = load_layout(app);
    let next = if is_parked(PhysicalPosition::new(rect.x, rect.y)) {
        let Some(prev) = layout.get(label).copied() else { return Ok(()) };
        Rect { w: rect.w, h: rect.h, ..prev }
    } else {
        rect
    };
    layout.insert(label.to_string(), next);
    store.set(LAYOUT_KEY, json!(layout));
    store.save().map_err(|e| e.to_string())
}

/// Bring one tile back from the parking position to its saved/default rect.
/// Only moves the window: tao flag setters (show, always-on-bottom) re-apply styles and activate the
/// window, which flickers; a tile that is not visible yet is shown once by `window_ready`.
fn unpark(app: &AppHandle, win: &WebviewWindow, label: &str) {
    app.state::<Visibility>().pending.lock().unwrap().remove(label);
    let rect = resolve_rect(app, win, label);
    set_page_visible(win, true);
    // A page that was hidden draws a fresh frame first, off-screen, then the tile moves into view.
    let win = win.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        place(&win, &label, rect);
    });
}

/// Hide = park off-screen (hide() would drop the acrylic); show = move back to the saved rect.
pub fn set_hidden(app: &AppHandle, hidden: bool) {
    let vis = app.state::<Visibility>();
    let disabled = vis.disabled.lock().unwrap();
    for label in crate::TILES {
        let Some(win) = app.get_webview_window(label) else { continue };
        if hidden {
            park_hidden(&win);
        } else if !disabled.contains(*label) {
            unpark(app, &win, label);
        }
    }
    *vis.hidden.lock().unwrap() = hidden;
}

pub fn is_hidden(app: &AppHandle) -> bool {
    *app.state::<Visibility>().hidden.lock().unwrap()
}

pub fn show_all(app: &AppHandle) {
    set_hidden(app, false);
}

/// Settings → "Показывать плитки": park or restore one tile.
pub fn set_tile_enabled(app: &AppHandle, label: &str, enabled: bool) {
    if !crate::TILES.contains(&label) {
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
    } else {
        disabled.insert(label.to_string());
        park_hidden(&win);
    }
}

/// Drop the saved layout and re-place every tile at its default rect.
pub fn reset(app: &AppHandle) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(LAYOUT_KEY);
    store.save().map_err(|e| e.to_string())?;
    let vis = app.state::<Visibility>();
    let hidden = *vis.hidden.lock().unwrap();
    let disabled = vis.disabled.lock().unwrap();
    for label in crate::TILES {
        let Some(win) = app.get_webview_window(label) else { continue };
        if hidden || disabled.contains(*label) {
            continue;
        }
        let wa = work_area(&win);
        place(&win, label, default_rect(label, &wa));
    }
    Ok(())
}
