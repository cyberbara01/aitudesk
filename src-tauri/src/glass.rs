//! Acrylic + DWM rounded corners for tile windows, Mica for the settings window (§2, §3 "Материал плитки").

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Theme, WebviewWindow, Window};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_ROUND, DWM_WINDOW_CORNER_PREFERENCE,
};

static GLASS_OK: AtomicBool = AtomicBool::new(true);
static MICA_OK: AtomicBool = AtomicBool::new(true);

/// `false` once acrylic failed on any tile: the frontend then paints the opaque fallback surface.
pub fn glass_ok() -> bool {
    GLASS_OK.load(Ordering::Relaxed)
}

/// `false` once Mica failed on the settings window.
pub fn mica_ok() -> bool {
    MICA_OK.load(Ordering::Relaxed)
}

/// Tint from §3: rgba(32,33,40,.55) dark / rgba(249,249,252,.62) light.
/// (On Windows 11 22H2+ the DWM backdrop ignores it; the CSS fill carries the tint.)
fn tint(theme: Theme) -> (u8, u8, u8, u8) {
    match theme {
        Theme::Light => (249, 249, 252, 158),
        _ => (32, 33, 40, 140),
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

pub fn apply(window: &WebviewWindow) {
    if let Some(hwnd) = hwnd_of(window) {
        round_corners(hwnd);
    }
    let theme = window.theme().unwrap_or(Theme::Dark);
    if let Err(e) = window_vibrancy::apply_acrylic(window, Some(tint(theme))) {
        eprintln!("[glass] acrylic unavailable on '{}': {e}", window.label());
        GLASS_OK.store(false, Ordering::Relaxed);
    }
}

/// Tile background switch: acrylic on, or fully transparent (content floats on the wallpaper).
pub fn set_tile_glass(window: &WebviewWindow, on: bool) {
    if on {
        let theme = window.theme().unwrap_or(Theme::Dark);
        let _ = window_vibrancy::apply_acrylic(window, Some(tint(theme)));
    } else {
        let _ = window_vibrancy::clear_acrylic(window);
    }
}

/// Material of the decorated settings window by design language: Mica (fluent), acrylic (aqua), none (rice: solid CSS surface).
pub fn set_window_material(window: &WebviewWindow, material: &str, dark: bool) {
    match material {
        "acrylic" => {
            let _ = window_vibrancy::clear_mica(window);
            let _ = window_vibrancy::apply_acrylic(window, Some(tint(if dark { Theme::Dark } else { Theme::Light })));
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

/// Re-apply the tint when the system theme flips (no-op if glass is off).
pub fn retint(window: &Window, theme: Theme) {
    if !glass_ok() {
        return;
    }
    if let Some(wv) = window.get_webview_window(window.label()) {
        if wv.label() == crate::settings_window::LABEL {
            apply_mica(&wv, !matches!(theme, Theme::Light));
        } else {
            let _ = window_vibrancy::apply_acrylic(&wv, Some(tint(theme)));
        }
    }
}

// `Window::get_webview_window` comes from the Manager trait.
use tauri::Manager as _;
