//! Keeps the tiles visible after Win+D / "Show desktop" (Rainmeter's "OnDesktop" technique).
//!
//! "Show desktop" minimizes what it can and then raises the desktop window (class `Progman` on
//! Windows 11 24H2+, otherwise a `WorkerW` hosting `SHELLDLL_DefView`) to the top of the non-topmost band.
//! Windows that cannot be minimized, like our tiles, are simply covered by it.
//!
//! Detection uses a hidden sentinel window that is always pinned to HWND_BOTTOM and never lifted:
//! the desktop counts as "shown" exactly when the sentinel sits below the desktop host. Testing the tiles
//! themselves would oscillate, because lifting them changes the very order being tested.
//!
//! Reaction: desktop shown, place the tiles directly above the desktop host, right under the backmost topmost
//! window above it (they join the topmost band while the desktop is shown, so Explorer re-raising the desktop
//! a few milliseconds later cannot cover them); while shown, every poll re-checks that no tile slipped below
//! the host. Desktop lowered: push them back to the bottom, which also drops the topmost state.
//! All moves use SWP_NOSENDCHANGING so tao's always-on-bottom hook does not undo them, and none touches tao's
//! window flags: flag changes make tao re-apply styles and call ShowWindow(SW_SHOW), which activates the
//! tile, makes Explorer lower the desktop again and flickers. The windows stay top-level, so acrylic and
//! DWM rounding are untouched.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};
use windows::core::{w, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, EnumWindows, FindWindowExW, GetClassNameW, GetShellWindow, GetWindow, GetWindowLongW,
    IsWindowVisible, SetTimer, SetWindowPos, EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE, GW_HWNDNEXT, GW_HWNDPREV,
    HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST, SET_WINDOW_POS_FLAGS, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOSIZE, WINEVENT_OUTOFCONTEXT, WS_DISABLED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

static APP: OnceLock<AppHandle> = OnceLock::new();
static DESKTOP_SHOWN: AtomicBool = AtomicBool::new(false);
/// HWND of the hidden z-order sentinel (0 = not created).
static SENTINEL: AtomicIsize = AtomicIsize::new(0);

/// Poll interval. The foreground hook reacts immediately; the poll catches Explorer's late re-raise of the
/// desktop. Each poll is a few cheap user32 calls.
const POLL_MS: u32 = 150;

const ZPOS: SET_WINDOW_POS_FLAGS =
    SET_WINDOW_POS_FLAGS(SWP_NOMOVE.0 | SWP_NOSIZE.0 | SWP_NOACTIVATE.0 | SWP_NOOWNERZORDER.0 | SWP_NOSENDCHANGING.0);

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
    String::from_utf16_lossy(&buf[..n.min(buf.len())])
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

fn sentinel() -> Option<HWND> {
    let raw = SENTINEL.load(Ordering::Relaxed);
    if raw == 0 {
        None
    } else {
        Some(HWND(raw as *mut c_void))
    }
}

/// A never-shown, disabled, non-activating tool window; it only exists to occupy a slot in the z-order.
fn create_sentinel() {
    let created = unsafe {
        CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            w!("STATIC"),
            w!("AITU Desk z-order sentinel"),
            WS_POPUP | WS_DISABLED,
            0,
            0,
            0,
            0,
            None,
            None,
            None,
            None,
        )
    };
    match created {
        Ok(h) => {
            SENTINEL.store(h.0 as isize, Ordering::Relaxed);
            pin_bottom(h);
        }
        Err(e) => eprintln!("[desktop] cannot create the sentinel window: {e}"),
    }
}

fn pin_bottom(h: HWND) {
    unsafe {
        let _ = SetWindowPos(h, Some(HWND_BOTTOM), 0, 0, 0, 0, ZPOS);
    }
}

/// Keep the sentinel at the bottom: just above the host in the normal state, the very last window while the
/// desktop is raised. Re-pins only when something got below it.
fn keep_sentinel_down(s: HWND, host: HWND) {
    let next = unsafe { GetWindow(s, GW_HWNDNEXT) };
    let at_bottom = match next {
        Ok(n) => n.0.is_null() || n == host,
        Err(_) => true,
    };
    if !at_bottom {
        pin_bottom(s);
    }
}

/// True when `target` is somewhere below `host` in the top-level z-order.
fn is_below(host: HWND, target: HWND) -> bool {
    let mut h = unsafe { GetWindow(host, GW_HWNDNEXT) };
    let mut guard = 0;
    while let Ok(hwnd) = h {
        if hwnd.0.is_null() || guard > 8192 {
            break;
        }
        if hwnd == target {
            return true;
        }
        h = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
        guard += 1;
    }
    false
}

fn tile_hwnds(app: &AppHandle) -> Vec<HWND> {
    crate::TILES
        .iter()
        .filter_map(|label| app.get_webview_window(label))
        .filter_map(|w| w.hwnd().ok())
        .map(|h| HWND(h.0))
        .collect()
}

/// The backmost topmost window above `host` (Rainmeter: inserting after it puts a window directly above the
/// raised desktop, inside the topmost band).
fn backmost_topmost_above(host: HWND, skip: &[HWND]) -> Option<HWND> {
    let mut h = unsafe { GetWindow(host, GW_HWNDPREV) };
    let mut guard = 0;
    while let Ok(hwnd) = h {
        if hwnd.0.is_null() || guard > 8192 {
            break;
        }
        let ex = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
        if ex & WS_EX_TOPMOST.0 != 0 && !skip.contains(&hwnd) {
            return Some(hwnd);
        }
        h = unsafe { GetWindow(hwnd, GW_HWNDPREV) };
        guard += 1;
    }
    None
}

fn lift(tiles: &[HWND], host: HWND) {
    let anchor = backmost_topmost_above(host, tiles);
    for &h in tiles {
        unsafe {
            match anchor {
                Some(a) => {
                    let _ = SetWindowPos(h, Some(a), 0, 0, 0, 0, ZPOS);
                }
                None => {
                    // No topmost window above the host: the top of the normal band is above it.
                    let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, ZPOS);
                    let _ = SetWindowPos(h, Some(HWND_NOTOPMOST), 0, 0, 0, 0, ZPOS);
                }
            }
        }
    }
}

fn pin_tiles(tiles: &[HWND]) {
    for &h in tiles {
        // HWND_BOTTOM also clears the topmost state a lift may have given the tile.
        pin_bottom(h);
    }
}

fn check() {
    let Some(app) = APP.get() else { return };
    let Some(s) = sentinel() else { return };
    let Some(host) = desktop_host() else { return };
    keep_sentinel_down(s, host);
    let shown = unsafe { IsWindowVisible(host) }.as_bool() && is_below(host, s);
    let was = DESKTOP_SHOWN.swap(shown, Ordering::SeqCst);
    let tiles = tile_hwnds(app);
    if shown {
        // Explorer may raise the desktop again shortly after the first lift: keep the tiles above it.
        if !was || tiles.iter().any(|&t| is_below(host, t)) {
            lift(&tiles, host);
        }
    } else if was {
        pin_tiles(&tiles);
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

/// Install the sentinel, the hook and the fallback timer. Must run on the main (message-pumping) thread:
/// the sentinel window belongs to that thread and WINEVENT_OUTOFCONTEXT callbacks arrive through its loop.
pub fn install(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    create_sentinel();
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
    let timer = unsafe { SetTimer(None, 0, POLL_MS, Some(on_timer)) };
    if timer == 0 {
        eprintln!("[desktop] SetTimer failed; Win+D protection limited to the foreground hook");
    }
}
