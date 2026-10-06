//! Tile positions: defaults (§3 "Сетка и размеры"), persistence in settings.json, show/hide, per-tile enable.

use std::collections::{HashMap, HashSet};
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
    /// "Скрыть виджеты" from the tray.
    pub hidden: Mutex<bool>,
    /// Tiles switched off in settings.
    pub disabled: Mutex<HashSet<String>>,
}

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

/// Default layout (logical px): right column top-to-bottom Clock, System, Launchers; Map left of it, bottom-aligned.
fn default_rect(label: &str, wa: &WorkArea) -> Rect {
    let s = wa.scale;
    let px = |v: f64| (v * s).round() as i32;
    let margin = 24.0;
    let gap = 16.0;
    let col_w = 280.0;
    let right_x = wa.w as f64 / s - margin - col_w;
    let (lx, ly, lw, lh) = match label {
        "clock" => (right_x, margin, col_w, 120.0),
        "system" => (right_x, margin + 120.0 + gap, col_w, 144.0),
        "launchers" => (right_x, margin + 120.0 + gap + 144.0 + gap, col_w, 170.0),
        "schedule" => (right_x, margin + 120.0 + gap + 144.0 + gap + 170.0 + gap, col_w, 240.0),
        "map" => (right_x - gap - 640.0, wa.h as f64 / s - margin - 320.0, 640.0, 320.0),
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

/// Position every declared tile from the store (or the default layout) before it is shown;
/// tiles switched off in settings start parked off-screen.
pub fn restore_all(app: &AppHandle) {
    let vis = app.state::<Visibility>();
    let mut disabled = vis.disabled.lock().unwrap();
    for label in crate::TILES {
        let Some(win) = app.get_webview_window(label) else { continue };
        if tile_enabled_in_store(app, label) {
            let rect = resolve_rect(app, &win, label);
            place(&win, label, rect);
        } else {
            disabled.insert(label.to_string());
            park(&win);
        }
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
fn unpark(app: &AppHandle, win: &WebviewWindow, label: &str) {
    let rect = resolve_rect(app, win, label);
    place(win, label, rect);
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_always_on_bottom(true);
}

/// Hide = park off-screen (hide() would drop the acrylic); show = bring back + unminimize + always-on-bottom.
pub fn set_hidden(app: &AppHandle, hidden: bool) {
    let vis = app.state::<Visibility>();
    let disabled = vis.disabled.lock().unwrap();
    for label in crate::TILES {
        let Some(win) = app.get_webview_window(label) else { continue };
        if hidden {
            park(&win);
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
        park(&win);
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
