//! Window materials: acrylic + DWM rounded corners for the tiles, Mica / acrylic / solid for the settings window.

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{Theme, WebviewWindow};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_USE_IMMERSIVE_DARK_MODE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND, DWM_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_NCACTIVATE};

static GLASS_OK: AtomicBool = AtomicBool::new(true);
static MICA_OK: AtomicBool = AtomicBool::new(true);
/// Per tile: the glass the frontend asked for ("Фон плитки"; missing = on) and the glass last applied.
/// Kept apart because a page may report before the startup pass has run: the startup pass then applies
/// what was asked instead of switching a tile's glass back on.
static WANTED: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);
static APPLIED: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);

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

/// Light or dark system backdrop for this window, independent of the Windows app theme. Set directly on the
/// DWM attribute (not through tao's theme), so the window keeps reporting the real OS theme to the frontend.
pub fn set_dark_mode(window: &WebviewWindow, dark: bool) {
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
    sync_glass(window);
}

/// Tile background switch from the page: acrylic on, or nothing at all (content floats on the wallpaper).
pub fn set_tile_glass(window: &WebviewWindow, on: bool) {
    WANTED
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(window.label().to_string(), on);
    sync_glass(window);
}

/// Bring a tile's material to the wanted state. A no-op when it is already there, so repeated calls never
/// flicker.
fn sync_glass(window: &WebviewWindow) {
    let label = window.label().to_string();
    let want = WANTED.lock().unwrap().as_ref().and_then(|m| m.get(&label).copied()).unwrap_or(true);
    {
        let mut applied = APPLIED.lock().unwrap();
        let applied = applied.get_or_insert_with(HashMap::new);
        if applied.get(&label) == Some(&want) {
            return;
        }
        applied.insert(label.clone(), want);
    }
    let hwnd = hwnd_of(window);
    if want {
        if let Some(h) = hwnd {
            set_corners(h, true);
        }
        let dark = !matches!(window.theme(), Ok(Theme::Light));
        if let Err(e) = window_vibrancy::apply_acrylic(window, Some(tint(dark))) {
            eprintln!("[glass] acrylic unavailable on '{label}': {e}");
            GLASS_OK.store(false, Ordering::Relaxed);
        }
        if let Some(h) = hwnd {
            // Back to the active look (see keep_active_look).
            unsafe {
                SendMessageW(h, WM_NCACTIVATE, Some(WPARAM(1)), Some(LPARAM(0)));
            }
        }
    } else {
        let _ = window_vibrancy::clear_acrylic(window);
        if let Some(h) = hwnd {
            set_corners(h, false);
        }
    }
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
