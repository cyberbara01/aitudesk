//! «Выравнивать по сетке»: widgets on the cells of the desktop icons.
//!
//! The grid is Explorer's own: the icon spacing of the desktop's folder view (IFolderView::GetSpacing, 76×100 px
//! with medium icons at 100 %), with columns and rows from the work area's top-left corner, as Windows lays the
//! icons out. A widget takes a block of whole cells and sits in it with the margin an icon has in its cell, so
//! widgets line up with the icons and with each other, the same gap everywhere. A widget sized by hand («Вручную»)
//! is sized to whole cells; a widget of a fixed size (folded to its icon, «Большой») keeps it and is centred in its
//! cells. Only reads from Explorer, never changes its icons.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IServiceProvider, CLSCTX_LOCAL_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    IFolderView, IShellBrowser, IShellWindows, ShellWindows, SID_STopLevelBrowser, SVGIO_ALLVIEW, SWC_DESKTOP,
    SWFO_NEEDDISPATCH,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SystemParametersInfoW, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SPI_ICONHORIZONTALSPACING,
    SPI_ICONVERTICALSPACING, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

use crate::layout::{self, Rect, WorkArea, STORE_FILE};

/// The layout before «Выравнивать по сетке» was switched on, and the one it made: switched off again before any
/// widget moved, the widgets go back where they were.
const UNDO_KEY: &str = "gridUndo";

/// The desktop's icon grid on the primary monitor, physical px: the work area's corner, the cell, and the margin a
/// widget keeps inside its cells (an icon's margin in its cell).
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct Grid {
    pub x: i32,
    pub y: i32,
    pub cx: i32,
    pub cy: i32,
    pub gap: i32,
    pub cols: i32,
    pub rows: i32,
}

/// Icon spacing and the icons' left offset in their cells, from Explorer's desktop view. None when Explorer does not
/// answer (restarting, or another shell).
fn explorer_spacing(wa: &WorkArea) -> Option<(i32, i32, Option<i32>)> {
    // SAFETY: COM on this short-lived thread only, released before it ends; every pointer is checked by the calls.
    unsafe {
        let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER).ok()?;
        let mut hwnd = 0i32;
        let empty = VARIANT::default();
        let disp = windows.FindWindowSW(&empty, &empty, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH).ok()?;
        let provider: IServiceProvider = windows::core::Interface::cast(&disp).ok()?;
        let browser: IShellBrowser = provider.QueryService(&SID_STopLevelBrowser).ok()?;
        let view = browser.QueryActiveShellView().ok()?;
        let folder: IFolderView = windows::core::Interface::cast(&view).ok()?;
        let mut spacing = POINT::default();
        folder.GetSpacing(&mut spacing).ok()?;
        if spacing.x < 16 || spacing.y < 16 {
            return None;
        }
        // The icons' offset in their cells (their position minus the cell's left edge), as most icons on the primary
        // monitor have it; the view's coordinates start at the virtual screen's corner.
        let (vx, vy) = (GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN));
        let mut offsets: HashMap<i32, u32> = HashMap::new();
        let count = folder.ItemCount(SVGIO_ALLVIEW).unwrap_or(0).min(400);
        for i in 0..count {
            let Ok(pidl) = folder.Item(i) else { continue };
            let pos = folder.GetItemPosition(pidl);
            CoTaskMemFree(Some(pidl as *const _));
            let Ok(p) = pos else { continue };
            let (x, y) = (p.x + vx, p.y + vy);
            if x < wa.x || y < wa.y || x >= wa.x + wa.w as i32 || y >= wa.y + wa.h as i32 {
                continue;
            }
            *offsets.entry((x - wa.x).rem_euclid(spacing.x)).or_default() += 1;
        }
        let inset = offsets.into_iter().max_by_key(|&(_, n)| n).map(|(o, _)| o).filter(|&o| o > 0 && o < spacing.x / 2);
        Some((spacing.x, spacing.y, inset))
    }
}

/// The grid now (Explorer asked on a thread of its own), or Windows' icon spacing if Explorer does not answer.
pub fn read(wa: &WorkArea) -> Grid {
    let area = *wa;
    let from_explorer = std::thread::spawn(move || {
        // SAFETY: COM initialised and released on this thread around the calls.
        unsafe {
            let ok = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
            let found = explorer_spacing(&area);
            if ok {
                CoUninitialize();
            }
            found
        }
    })
    .join()
    .ok()
    .flatten();
    let (cx, cy, inset) = from_explorer.unwrap_or_else(|| {
        let (mut h, mut v) = (0i32, 0i32);
        // SAFETY: plain reads of two system metrics into local integers.
        unsafe {
            let none = SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0);
            let _ = SystemParametersInfoW(SPI_ICONHORIZONTALSPACING, 0, Some(&mut h as *mut i32 as *mut _), none);
            let _ = SystemParametersInfoW(SPI_ICONVERTICALSPACING, 0, Some(&mut v as *mut i32 as *mut _), none);
        }
        let s = wa.scale;
        let h = if h >= 32 { h } else { (76.0 * s) as i32 };
        // Windows' vertical icon spacing leaves out the label; Explorer's cells are about 4/3 of it.
        let v = if v >= 32 { (v as f64 * 4.0 / 3.0).round() as i32 } else { (100.0 * s) as i32 };
        (h, v, None)
    });
    // A widget's margin in its cells: an icon's own margin in its cell (14 px at 76), the same on every side.
    let gap = inset.unwrap_or(((cx as f64) * 0.18).round() as i32).clamp((4.0 * wa.scale) as i32, cx / 3);
    Grid {
        x: wa.x,
        y: wa.y,
        cx,
        cy,
        gap,
        cols: (wa.w as i32 / cx).max(1),
        rows: (wa.h as i32 / cy).max(1),
    }
}

/// A block of cells: first column and row, and how many of each.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Block {
    col: i32,
    row: i32,
    n: i32,
    m: i32,
}

/// How a widget takes its cells: its size follows them (`fixed` false), or it keeps its size and is centred.
#[derive(Clone, Copy, Debug)]
struct Shape {
    w: i32,
    h: i32,
    fixed: bool,
}

impl Grid {
    /// Cells a side of `len` px takes: whole cells with the margins, never less than the side (a fixed one) or
    /// than `min` (one sized to its cells).
    fn span(&self, len: i32, cell: i32, fixed: bool, min: i32) -> i32 {
        let need = if fixed { len + 2 * self.gap } else { len.max(min) + 2 * self.gap };
        // A widget sized to its cells may lose a little (up to a sixth of a cell) rather than grow a whole cell.
        let slack = if fixed { 0 } else { cell / 6 };
        (((need - slack) as f64 / cell as f64).ceil() as i32).max(1)
    }

    fn block_for(&self, r: &Rect, shape: Shape, min: (i32, i32)) -> Block {
        let n = self.span(shape.w, self.cx, shape.fixed, min.0).min(self.cols);
        let m = self.span(shape.h, self.cy, shape.fixed, min.1).min(self.rows);
        // The block whose corner is nearest to where the widget's would be inside it.
        let off_x = (n * self.cx - shape.w) / 2;
        let off_y = (m * self.cy - shape.h) / 2;
        let col = (((r.x - self.x - off_x) as f64) / self.cx as f64).round() as i32;
        let row = (((r.y - self.y - off_y) as f64) / self.cy as f64).round() as i32;
        Block { col: col.clamp(0, (self.cols - n).max(0)), row: row.clamp(0, (self.rows - m).max(0)), n, m }
    }

    /// The widget's rect in a block: sized to it with the margins, or its own size centred in it.
    fn rect_in(&self, b: Block, shape: Shape) -> Rect {
        let (bx, by) = (self.x + b.col * self.cx, self.y + b.row * self.cy);
        let (bw, bh) = (b.n * self.cx, b.m * self.cy);
        if shape.fixed {
            Rect { x: bx + (bw - shape.w) / 2, y: by + (bh - shape.h) / 2, w: shape.w as u32, h: shape.h as u32 }
        } else {
            Rect { x: bx + self.gap, y: by + self.gap, w: (bw - 2 * self.gap).max(1) as u32, h: (bh - 2 * self.gap).max(1) as u32 }
        }
    }

    /// The free block nearest to `want` (no other widget's rect in it), or `want` itself when none is free.
    fn nearest_free(&self, want: Block, shape: Shape, taken: &[Rect]) -> Block {
        let free = |b: Block| {
            let r = self.rect_in(b, shape);
            taken.iter().all(|t| !overlaps(&r, t))
        };
        if free(want) {
            return want;
        }
        let (max_c, max_r) = ((self.cols - want.n).max(0), (self.rows - want.m).max(0));
        let mut best: Option<(i64, Block)> = None;
        for row in 0..=max_r {
            for col in 0..=max_c {
                let b = Block { col, row, ..want };
                let d = ((col - want.col) as i64).pow(2) * (self.cx as i64).pow(2) + ((row - want.row) as i64).pow(2) * (self.cy as i64).pow(2);
                if best.is_some_and(|(bd, _)| bd <= d) || !free(b) {
                    continue;
                }
                best = Some((d, b));
            }
        }
        best.map(|(_, b)| b).unwrap_or(want)
    }
}

fn overlaps(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.w as i32 && b.x < a.x + a.w as i32 && a.y < b.y + b.h as i32 && b.y < a.y + a.h as i32
}

/// A tile on screen now: its label, rect and whether its size follows the cells.
struct Placed {
    label: String,
    rect: Rect,
    fixed: bool,
}

/// The tiles on screen (not parked, not hidden, not switched off), with their rects.
fn on_screen(app: &AppHandle) -> Vec<Placed> {
    let mut out = Vec::new();
    if layout::is_hidden(app) {
        return out;
    }
    for label in crate::tile_labels(app) {
        let Some(win) = app.get_webview_window(&label) else { continue };
        if !layout::tile_enabled_in_store(app, &label) {
            continue;
        }
        let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { continue };
        if layout::is_parked(pos) {
            continue;
        }
        let fixed = layout::view_of(app, &label) != layout::View::Manual;
        out.push(Placed { label, rect: Rect { x: pos.x, y: pos.y, w: size.width, h: size.height }, fixed });
    }
    out
}

/// Smallest sizes of the widgets the page sent (CSS px), in physical px for this screen.
fn min_of(mins: &HashMap<String, (f64, f64)>, label: &str, wa: &WorkArea) -> (i32, i32) {
    let s = wa.scale * crate::zoom::current();
    let (w, h) = mins.get(label).copied().unwrap_or((64.0, 64.0));
    ((w * s).ceil() as i32, (h * s).ceil() as i32)
}

/// Moves a tile to `to` in a few steps (about 140 ms), then gives it its size and saves the place.
fn glide(app: &AppHandle, win: &WebviewWindow, label: &str, from: Rect, to: Rect) {
    const STEPS: i32 = 9;
    if let Ok(h) = win.hwnd() {
        let hwnd = HWND(h.0);
        if from.w != to.w || from.h != to.h {
            crate::desktop_watch::place_tile(hwnd, from.x, from.y, to.w, to.h);
        }
        for i in 1..=STEPS {
            let p = i as f64 / STEPS as f64;
            // Decelerating, like the rest of the app's motion.
            let e = 1.0 - (1.0 - p).powi(3);
            let x = from.x + ((to.x - from.x) as f64 * e).round() as i32;
            let y = from.y + ((to.y - from.y) as f64 * e).round() as i32;
            crate::desktop_watch::move_tile(hwnd, x, y);
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
    }
    let _ = layout::save_rect(app, label, to);
}

/// Every widget on screen to the grid in reading order (top to bottom, then left to right), each in the free block
/// nearest to where it is: a widget above another stays above it.
/// Remembers the layout from before, so switching the option off right away puts it back.
pub fn align_all(app: &AppHandle, mins: &HashMap<String, (f64, f64)>) -> Result<(), String> {
    let Some(first) = crate::tile_labels(app).into_iter().find_map(|l| app.get_webview_window(&l)) else { return Ok(()) };
    let wa = layout::work_area(&first);
    let grid = read(&wa);
    let before = layout::saved(app);
    let mut tiles = on_screen(app);
    // The order people read the desktop in: rows of widgets from the top, each row from the left.
    tiles.sort_by_key(|t| (t.rect.y, t.rect.x));
    let mut taken: Vec<Rect> = Vec::new();
    let mut moves: Vec<(String, Rect, Rect)> = Vec::new();
    for t in &tiles {
        let shape = Shape { w: t.rect.w as i32, h: t.rect.h as i32, fixed: t.fixed };
        let min = min_of(mins, &t.label, &wa);
        let want = grid.block_for(&t.rect, shape, min);
        let shape = if t.fixed { shape } else { Shape { w: want.n * grid.cx - 2 * grid.gap, h: want.m * grid.cy - 2 * grid.gap, fixed: false } };
        let block = grid.nearest_free(want, shape, &taken);
        let rect = grid.rect_in(block, shape);
        taken.push(rect);
        moves.push((t.label.clone(), t.rect, rect));
    }
    // All of them at once, each on its own thread: they glide together.
    let handles: Vec<_> = moves
        .into_iter()
        .filter_map(|(label, from, to)| {
            let win = app.get_webview_window(&label)?;
            let app = app.clone();
            Some(std::thread::spawn(move || glide(&app, &win, &label, from, to)))
        })
        .collect();
    for h in handles {
        let _ = h.join();
    }
    let after = layout::saved(app);
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(UNDO_KEY, serde_json::json!({ "before": before, "after": after }));
        let _ = store.save();
    }
    Ok(())
}

/// The option switched off: if no widget moved since they were aligned, they go back to where they were.
pub fn unalign(app: &AppHandle) {
    let Ok(store) = app.store(STORE_FILE) else { return };
    let undo = store.get(UNDO_KEY);
    store.delete(UNDO_KEY);
    let _ = store.save();
    let Some(undo) = undo else { return };
    let (Some(before), Some(after)) = (undo.get("before"), undo.get("after")) else { return };
    let (Ok(before), Ok(after)) = (
        serde_json::from_value::<HashMap<String, Rect>>(before.clone()),
        serde_json::from_value::<HashMap<String, Rect>>(after.clone()),
    ) else {
        return;
    };
    let now = layout::saved(app);
    let same = now.len() == after.len()
        && now.iter().all(|(k, r)| after.get(k).is_some_and(|a| a.x == r.x && a.y == r.y && a.w == r.w && a.h == r.h));
    if same {
        layout::replace_saved(app, before);
    }
}

/// Forget the way back (the layout was reset or loaded from a config).
pub fn forget_undo(app: &AppHandle) {
    if let Ok(store) = app.store(STORE_FILE) {
        if store.delete(UNDO_KEY) {
            let _ = store.save();
        }
    }
}

/// One widget dropped after a move: into the free block nearest to where it was let go. Returns its rect.
pub fn snap_one(app: &AppHandle, win: &WebviewWindow, mins: &HashMap<String, (f64, f64)>) -> Option<Rect> {
    let label = win.label().to_string();
    let wa = layout::work_area(win);
    let grid = read(&wa);
    let (pos, size) = (win.outer_position().ok()?, win.outer_size().ok()?);
    let from = Rect { x: pos.x, y: pos.y, w: size.width, h: size.height };
    let fixed = layout::view_of(app, &label) != layout::View::Manual;
    let taken: Vec<Rect> = on_screen(app).into_iter().filter(|t| t.label != label).map(|t| t.rect).collect();
    let shape = Shape { w: from.w as i32, h: from.h as i32, fixed };
    let want = grid.block_for(&from, shape, min_of(mins, &label, &wa));
    let shape = if fixed { shape } else { Shape { w: want.n * grid.cx - 2 * grid.gap, h: want.m * grid.cy - 2 * grid.gap, fixed: false } };
    let to = grid.rect_in(grid.nearest_free(want, shape, &taken), shape);
    glide(app, win, &label, from, to);
    forget_undo(app);
    Some(to)
}
