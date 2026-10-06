//! Window materials: acrylic + DWM rounded corners for the tiles, Mica / acrylic / solid for the settings window.

use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{Theme, WebviewWindow};
use windows::core::BOOL;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_USE_IMMERSIVE_DARK_MODE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DWM_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

static GLASS_OK: AtomicBool = AtomicBool::new(true);
static MICA_OK: AtomicBool = AtomicBool::new(true);
/// Labels of tiles whose acrylic is currently switched off ("Фон плитки" off).
static GLASS_OFF: Mutex<Option<HashSet<String>>> = Mutex::new(None);

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

/// DWMWCP_ROUND + no DWM border (the 1 px border is drawn in CSS).
fn round_corners(hwnd: HWND) {
    unsafe {
        let pref: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
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

/// Tiles are tool windows: never in the taskbar or Alt+Tab. tao rewrites the extended style whenever one of
/// its window flags changes (show, always-on-bottom), so call this again after such calls.
pub fn make_tool_window(window: &WebviewWindow) {
    if let Some(hwnd) = hwnd_of(window) {
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let want = (ex | WS_EX_TOOLWINDOW.0 as isize) & !(WS_EX_APPWINDOW.0 as isize);
            if want != ex {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
            }
        }
    }
}

/// Initial material of a tile (called once at startup, before the window is shown).
pub fn apply(window: &WebviewWindow) {
    if let Some(hwnd) = hwnd_of(window) {
        round_corners(hwnd);
    }
    let dark = !matches!(window.theme(), Ok(Theme::Light));
    if let Err(e) = window_vibrancy::apply_acrylic(window, Some(tint(dark))) {
        eprintln!("[glass] acrylic unavailable on '{}': {e}", window.label());
        GLASS_OK.store(false, Ordering::Relaxed);
    }
}

/// Tile background switch: acrylic on, or fully transparent (content floats on the wallpaper).
/// A no-op when the tile is already in the requested state, so repeated calls never flicker.
pub fn set_tile_glass(window: &WebviewWindow, on: bool) {
    let label = window.label().to_string();
    {
        let mut guard = GLASS_OFF.lock().unwrap();
        let off = guard.get_or_insert_with(HashSet::new);
        let currently_on = !off.contains(&label);
        if currently_on == on {
            return;
        }
        if on {
            off.remove(&label);
        } else {
            off.insert(label);
        }
    }
    if on {
        let dark = !matches!(window.theme(), Ok(Theme::Light));
        let _ = window_vibrancy::apply_acrylic(window, Some(tint(dark)));
    } else {
        let _ = window_vibrancy::clear_acrylic(window);
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
