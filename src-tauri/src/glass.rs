//! Window materials: acrylic + DWM rounded corners for the tiles (or, for corners DWM cannot round, the tile's own
//! glass in backdrop.rs), Mica / acrylic / solid for the settings window, nothing at all behind the pop-up.

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{Theme, WebviewWindow};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMSBT_NONE, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_USE_IMMERSIVE_DARK_MODE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND,
    DWM_SYSTEMBACKDROP_TYPE, DWM_WINDOW_CORNER_PREFERENCE,
};

/// The corner radius Windows rounds its acrylic at (CSS px of a tile at 100 %); 0 is square, also Windows' own.
const NATIVE_RADIUS: f64 = 8.0;
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_NCACTIVATE};

static GLASS_OK: AtomicBool = AtomicBool::new(true);
static MICA_OK: AtomicBool = AtomicBool::new(true);
/// Per tile: the glass the frontend asked for («Фон виджета» and «Углы виджетов»; missing = acrylic at 8 px) and
/// the glass last applied. Kept apart because a page may report before the startup pass has run: the startup pass
/// then applies what was asked instead of switching a tile's glass back on.
static WANTED: Mutex<Option<HashMap<String, Want>>> = Mutex::new(None);
static APPLIED: Mutex<Option<HashMap<String, Glass>>> = Mutex::new(None);
/// Per tile: the palette is dark (set_dark_mode), for the tint of the tile's own glass.
static DARK: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);

/// What a tile's page asks for: glass or not, its corner radius in CSS px and the page's device pixel ratio.
#[derive(Clone, Copy, PartialEq, Debug)]
struct Want {
    on: bool,
    radius: f64,
    ratio: f64,
}

impl Default for Want {
    fn default() -> Self {
        Want { on: true, radius: NATIVE_RADIUS, ratio: 1.0 }
    }
}

/// The glass a tile has: none, Windows' acrylic (rounded at 8 px or square), or its own at a radius in device px.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Glass {
    Off,
    Acrylic { round: bool },
    Own { px: f32 },
}

/// `false` once acrylic failed on any tile: the frontend then paints the opaque fallback surface.
pub fn glass_ok() -> bool {
    GLASS_OK.load(Ordering::Relaxed)
}

/// `false` once Mica failed on the settings window.
pub fn mica_ok() -> bool {
    MICA_OK.load(Ordering::Relaxed)
}

/// Tint for the pre-22H2 acrylic path; Windows 11 22H2+ ignores it (the CSS fill carries the tint).
fn tint(dark: bool) -> (u8, u8, u8, u8) {
    if dark {
        (32, 33, 40, 140)
    } else {
        (249, 249, 252, 158)
    }
}

fn hwnd_of(window: &WebviewWindow) -> Option<HWND> {
    window.hwnd().ok().map(|h| HWND(h.0))
}

/// Corner rounding (Windows 11 rounds the glass at 8 px; a tile without glass keeps square, invisible corners)
/// and no DWM border (the 1 px border is drawn in CSS).
fn set_corners(hwnd: HWND, round: bool) {
    unsafe {
        let pref: DWM_WINDOW_CORNER_PREFERENCE = if round { DWMWCP_ROUND } else { DWMWCP_DONOTROUND };
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const DWM_WINDOW_CORNER_PREFERENCE as *const c_void,
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );
        let none: u32 = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &none as *const u32 as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

/// No system material behind the window, no rounded corners and no border: the pop-up, which covers the screen's
/// work area and is clear around its card. Left at «auto», Windows 11 itself may decide to draw Mica behind a window
/// that has a caption style (tao keeps one on undecorated windows), and some builds do so behind the whole window:
/// the desktop around the card turned into one dark colour taken from the wallpaper. On Windows before 11 22H2 the
/// backdrop attribute does not exist and nothing is drawn anyway.
pub fn clear_backdrop(window: &WebviewWindow) {
    if let Some(hwnd) = hwnd_of(window) {
        // SAFETY: plain DWM attribute writes on this window's own handle, with values of the sizes the calls expect.
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                &DWMSBT_NONE as *const DWM_SYSTEMBACKDROP_TYPE as *const c_void,
                std::mem::size_of::<DWM_SYSTEMBACKDROP_TYPE>() as u32,
            );
        }
        set_corners(hwnd, false);
    }
}

/// Light or dark system backdrop for this window, independent of the Windows app theme. Set directly on the
/// DWM attribute (not through tao's theme), so the window keeps reporting the real OS theme to the frontend. A tile
/// with its own glass gets the matching tint.
pub fn set_dark_mode(window: &WebviewWindow, dark: bool) {
    DARK.lock().unwrap().get_or_insert_with(HashMap::new).insert(window.label().to_string(), dark);
    if let Some(hwnd) = hwnd_of(window) {
        let value = BOOL::from(dark);
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                &value as *const BOOL as *const c_void,
                std::mem::size_of::<BOOL>() as u32,
            );
        }
        crate::backdrop::set_dark(hwnd, dark);
    }
}

/// Id of our subclass on the tile windows.
const ACTIVE_LOOK_SUBCLASS: usize = 0xA17D;

/// Tiles are never the active window (see desktop_watch), and Windows draws the acrylic of an inactive window
/// as a flat fallback colour with a lighter shadow; a click would switch a tile to real glass for a moment and
/// back, which reads as flicker. Every tile keeps the active look instead: the glass is always real.
unsafe extern "system" fn active_look(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    let wparam = if msg == WM_NCACTIVATE { WPARAM(1) } else { wparam };
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

/// Install the active-look subclass on a tile and switch it to the active look now. Main thread only.
pub fn keep_active_look(window: &WebviewWindow) {
    if let Some(hwnd) = hwnd_of(window) {
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(active_look), ACTIVE_LOOK_SUBCLASS, 0);
            SendMessageW(hwnd, WM_NCACTIVATE, Some(WPARAM(1)), Some(LPARAM(0)));
        }
    }
}

/// Initial material of a tile (called once at startup, before the window is shown).
pub fn apply(window: &WebviewWindow) {
    let _ = sync_glass(window);
}

/// Tile background and corners from the page: glass with corners of `radius` CSS px (the page's device pixel ratio
/// `ratio`), or nothing at all (content floats on the wallpaper). Returns the radius the glass really has: the one
/// asked, or 8 when the tile's own glass could not be made and Windows' acrylic stands in (the page then rounds
/// its CSS at 8 too, so no corner of bare glass shows).
pub fn set_tile_glass(window: &WebviewWindow, on: bool, radius: f64, ratio: f64) -> f64 {
    let want = Want { on, radius: radius.clamp(0.0, 64.0), ratio: if ratio > 0.0 { ratio } else { 1.0 } };
    WANTED.lock().unwrap().get_or_insert_with(HashMap::new).insert(window.label().to_string(), want);
    match sync_glass(window) {
        Glass::Own { .. } | Glass::Off => want.radius,
        Glass::Acrylic { round } => {
            if round {
                NATIVE_RADIUS
            } else {
                0.0
            }
        }
    }
}

/// The glass for what is wanted: Windows' acrylic where DWM can round it (8 px) or square it (0), the tile's own
/// elsewhere.
fn glass_for(want: Want) -> Glass {
    if !want.on {
        Glass::Off
    } else if (want.radius - NATIVE_RADIUS).abs() < 0.01 {
        Glass::Acrylic { round: true }
    } else if want.radius < 0.01 {
        Glass::Acrylic { round: false }
    } else {
        Glass::Own { px: (want.radius * want.ratio) as f32 }
    }
}

/// Bring a tile's material to the wanted state and return the one it has. A no-op when it is already there, so
/// repeated calls never flicker.
fn sync_glass(window: &WebviewWindow) -> Glass {
    let label = window.label().to_string();
    let want = WANTED.lock().unwrap().as_ref().and_then(|m| m.get(&label).copied()).unwrap_or_default();
    let mut next = glass_for(want);
    let prev = APPLIED.lock().unwrap().as_ref().and_then(|m| m.get(&label).copied());
    if prev == Some(next) {
        return next;
    }
    let hwnd = hwnd_of(window);
    let dark = DARK
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|m| m.get(&label).copied())
        .unwrap_or_else(|| !matches!(window.theme(), Ok(Theme::Light)));
    if let Glass::Own { px } = next {
        // Windows' acrylic off first: the tile's own glass replaces it under square DWM corners.
        if matches!(prev, Some(Glass::Acrylic { .. }) | None) {
            let _ = window_vibrancy::clear_acrylic(window);
        }
        if let Some(h) = hwnd {
            set_corners(h, false);
            if let Err(e) = crate::backdrop::attach(h, px, dark) {
                eprintln!("[glass] own glass unavailable on '{label}': {e}");
                next = Glass::Acrylic { round: true };
            }
        } else {
            next = Glass::Acrylic { round: true };
        }
    } else if let Some(h) = hwnd {
        crate::backdrop::detach(h);
    }
    match next {
        Glass::Acrylic { round } => {
            if let Some(h) = hwnd {
                crate::backdrop::detach(h);
                set_corners(h, round);
            }
            if !matches!(prev, Some(Glass::Acrylic { .. })) {
                if let Err(e) = window_vibrancy::apply_acrylic(window, Some(tint(dark))) {
                    eprintln!("[glass] acrylic unavailable on '{label}': {e}");
                    GLASS_OK.store(false, Ordering::Relaxed);
                }
            }
            if let Some(h) = hwnd {
                // Back to the active look (see keep_active_look).
                unsafe {
                    SendMessageW(h, WM_NCACTIVATE, Some(WPARAM(1)), Some(LPARAM(0)));
                }
            }
        }
        Glass::Off => {
            let _ = window_vibrancy::clear_acrylic(window);
            if let Some(h) = hwnd {
                set_corners(h, false);
            }
        }
        Glass::Own { .. } => {}
    }
    APPLIED.lock().unwrap().get_or_insert_with(HashMap::new).insert(label, next);
    next
}

/// Material of the decorated settings window by design language: Mica (fluent), acrylic (aqua), none (rice: solid CSS surface).
pub fn set_window_material(window: &WebviewWindow, material: &str, dark: bool) {
    match material {
        "acrylic" => {
            let _ = window_vibrancy::clear_mica(window);
            let _ = window_vibrancy::apply_acrylic(window, Some(tint(dark)));
        }
        "none" => {
            let _ = window_vibrancy::clear_mica(window);
            let _ = window_vibrancy::clear_acrylic(window);
        }
        _ => {
            let _ = window_vibrancy::clear_acrylic(window);
            apply_mica(window, dark);
        }
    }
}

/// Mica for the decorated settings window; `dark` selects the Mica variant.
pub fn apply_mica(window: &WebviewWindow, dark: bool) {
    if let Err(e) = window_vibrancy::apply_mica(window, Some(dark)) {
        eprintln!("[glass] mica unavailable on '{}': {e}", window.label());
        MICA_OK.store(false, Ordering::Relaxed);
    }
}
