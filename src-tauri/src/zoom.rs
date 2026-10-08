//! «Масштаб виджетов»: one zoom for every tile page, applied by WebView2 (fonts, icons, spacing and the window
//! sizes scale together, so a widget looks the same, only smaller or larger). `settings.tileScale` is "auto" or
//! a factor (0.8, 0.9, 1, 1.1). Auto is 1 on a screen tall enough for the default column of widgets and smaller
//! on laptops, so the default layout still fits one column there.
//!
//! The zoom the saved layout was made with is kept next to it (`tileZoom`). When the zoom changes (the setting,
//! or "auto" on another screen), every saved tile is scaled by the ratio about the work-area corner it is
//! nearest to, so a column along the right edge stays along the right edge with its gaps scaled too.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::layout::{Rect, WorkArea, STORE_FILE};

/// The zoom the layout in the store was made with (absent: 1, every layout before this setting).
const ZOOM_KEY: &str = "tileZoom";

/// Zoom the tile pages have now.
static CURRENT: Mutex<f64> = Mutex::new(1.0);

pub fn current() -> f64 {
    *CURRENT.lock().unwrap()
}

/// `settings.tileScale` as a factor; None for "auto" (or anything unexpected).
fn setting(app: &AppHandle) -> Option<f64> {
    let v = app.store(STORE_FILE).ok()?.get("settings")?;
    let z = v.get("tileScale")?.as_f64()?;
    (0.5..=2.0).contains(&z).then_some(z)
}

/// "Auto": full size when the default column (about 1016 logical px) fits the screen's height, smaller below.
fn auto_for(wa: &WorkArea) -> f64 {
    let height = wa.h as f64 / wa.scale.max(0.5);
    if height >= 980.0 {
        1.0
    } else if height >= 880.0 {
        0.9
    } else {
        0.8
    }
}

/// The zoom the tiles should have on this screen.
pub fn resolve(app: &AppHandle, wa: &WorkArea) -> f64 {
    setting(app).unwrap_or_else(|| auto_for(wa))
}

/// Zoom of the saved layout.
fn stored(app: &AppHandle) -> f64 {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(ZOOM_KEY))
        .and_then(|v| v.as_f64())
        .filter(|z| (0.5..=2.0).contains(z))
        .unwrap_or(1.0)
}

/// A saved rect at zoom `from` brought to zoom `to`: its size scaled, and its distance from the nearest corner
/// of the work area too.
fn rescale(r: &Rect, wa: &WorkArea, k: f64) -> Rect {
    let w = (r.w as f64 * k).round().max(1.0);
    let h = (r.h as f64 * k).round().max(1.0);
    let (left, top) = (wa.x as f64, wa.y as f64);
    let (right, bottom) = (left + wa.w as f64, top + wa.h as f64);
    let cx = r.x as f64 + r.w as f64 / 2.0;
    let cy = r.y as f64 + r.h as f64 / 2.0;
    let x = if cx > (left + right) / 2.0 {
        let edge = r.x as f64 + r.w as f64;
        right - (right - edge) * k - w
    } else {
        left + (r.x as f64 - left) * k
    };
    let y = if cy > (top + bottom) / 2.0 {
        let edge = r.y as f64 + r.h as f64;
        bottom - (bottom - edge) * k - h
    } else {
        top + (r.y as f64 - top) * k
    };
    Rect { x: x.round() as i32, y: y.round() as i32, w: w as u32, h: h as u32 }
}

/// Startup and every change of the setting: the zoom for this screen, the saved layout scaled to it if it was
/// made at another one, and every tile page zoomed. Returns the zoom.
pub fn apply(app: &AppHandle, wa: &WorkArea) -> f64 {
    let zoom = resolve(app, wa);
    let before = stored(app);
    if (zoom - before).abs() > 1e-6 {
        crate::layout::scale_saved(app, |r| rescale(r, wa, zoom / before));
        if let Ok(store) = app.store(STORE_FILE) {
            store.set(ZOOM_KEY, zoom);
            let _ = store.save();
        }
    }
    *CURRENT.lock().unwrap() = zoom;
    for label in crate::tile_labels(app).into_iter().chain([crate::popup::LABEL.to_string()]) {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.set_zoom(zoom);
        }
    }
    zoom
}
