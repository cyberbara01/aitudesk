//! Keeps the tiles visible after Win+D / "Show desktop" (Rainmeter's "OnDesktop" technique).
//!
//! "Show desktop" minimizes what it can and then *raises the desktop window* (class `Progman` on
//! Windows 11 24H2+, otherwise a `WorkerW` hosting `SHELLDLL_DefView`) to the top of the non-topmost band.
//! Windows that cannot be minimized — our tiles — are simply covered by it. tao additionally pins
//! always-on-bottom windows to HWND_BOTTOM on every WM_WINDOWPOSCHANGING, so nothing lifts them back.
//!
//! Detection: EVENT_SYSTEM_FOREGROUND hook plus a 250 ms timer (Explorer reorders a few ms after the
//! event). The state test is "is one of our tiles below the desktop host in z-order?".
//! Reaction: desktop shown → release tao's pin and lift the tiles to the top of the normal band
//! (HWND_TOPMOST then HWND_NOTOPMOST, bypassing WM_WINDOWPOSCHANGING); desktop lowered → pin again,
//! which makes tao issue SetWindowPos(HWND_BOTTOM). The windows stay top-level, so acrylic and DWM
//! rounding are untouched.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};
use windows::core::{w, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, GetClassNameW, GetShellWindow, GetWindow, GetWindowThreadProcessId,
    IsWindowVisible, SetTimer, SetWindowPos, EVENT_SYSTEM_FOREGROUND, GW_HWNDNEXT, HWND_NOTOPMOST,
    HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOSIZE,
    WINEVENT_OUTOFCONTEXT,
};

static APP: OnceLock<AppHandle> = OnceLock::new();
static DESKTOP_SHOWN: AtomicBool = AtomicBool::new(false);

const ZPOS: windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS =
    windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS(
        SWP_NOMOVE.0 | SWP_NOSIZE.0 | SWP_NOACTIVATE.0 | SWP_NOOWNERZORDER.0 | SWP_NOSENDCHANGING.0,
    );

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
    String::from_utf16_lossy(&buf[..n.min(buf.len())])
}

fn is_ours(hwnd: HWND) -> bool {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid == std::process::id()
}

fn has_defview(hwnd: HWND) -> bool {
    unsafe { FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None) }.is_ok()
}

unsafe extern "system" fn find_workerw(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if class_name(hwnd) == "WorkerW" && unsafe { IsWindowVisible(hwnd) }.as_bool() && has_defview(hwnd) {
        let out = lparam.0 as *mut HWND;
        unsafe { *out = hwnd };
        return BOOL(0);
    }
    BOOL(1)
}

/// The window the shell raises for "Show desktop".
fn desktop_host() -> Option<HWND> {
    let shell = unsafe { GetShellWindow() };
    if shell.0.is_null() {
        return None;
    }
    if has_defview(shell) {
        return Some(shell); // Windows 11 24H2+
    }
    let mut found = HWND::default();
    let _ = unsafe { EnumWindows(Some(find_workerw), LPARAM(&mut found as *mut HWND as isize)) };
    if found.0.is_null() {
        None
    } else {
        Some(found)
    }
}

/// True when one of our tiles sits below the desktop host in z-order (= the desktop is raised).
fn tiles_below(host: HWND) -> bool {
    let mut h = unsafe { GetWindow(host, GW_HWNDNEXT) };
    let mut guard = 0;
    while let Ok(hwnd) = h {
        if hwnd.0.is_null() || guard > 4096 {
            break;
        }
        if is_ours(hwnd) && unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return true;
        }
        h = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
        guard += 1;
    }
    false
}

fn apply(app: &AppHandle, shown: bool) {
    for label in crate::TILES {
        let Some(win) = app.get_webview_window(label) else { continue };
        if shown {
            // Release tao's HWND_BOTTOM pin so user clicks do not push the tile under the desktop again,
            // then lift it to the top of the normal band (above the raised desktop, below topmost windows).
            let _ = win.set_always_on_bottom(false);
            if let Ok(h) = win.hwnd() {
                unsafe {
                    let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, ZPOS);
                    let _ = SetWindowPos(h, Some(HWND_NOTOPMOST), 0, 0, 0, 0, ZPOS);
                }
            }
        } else {
            // tao re-issues SetWindowPos(HWND_BOTTOM) when the flag flips back on.
            let _ = win.set_always_on_bottom(true);
        }
    }
}

fn check() {
    let Some(app) = APP.get() else { return };
    let Some(host) = desktop_host() else { return };
    let shown = unsafe { IsWindowVisible(host) }.as_bool() && tiles_below(host);
    if DESKTOP_SHOWN.swap(shown, Ordering::SeqCst) != shown {
        apply(app, shown);
    }
}

unsafe extern "system" fn on_foreground(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if event == EVENT_SYSTEM_FOREGROUND && !hwnd.0.is_null() {
        check();
    }
}

unsafe extern "system" fn on_timer(_hwnd: HWND, _msg: u32, _id: usize, _time: u32) {
    check();
}

/// Install the hook and the fallback timer. Must run on the main (message-pumping) thread.
pub fn install(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    let hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(on_foreground),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    if hook.0.is_null() {
        eprintln!("[desktop] SetWinEventHook failed; relying on the timer only");
    }
    let timer = unsafe { SetTimer(None, 0, 250, Some(on_timer)) };
    if timer == 0 {
        eprintln!("[desktop] SetTimer failed; Win+D protection limited to the foreground hook");
    }
}
