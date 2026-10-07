//! Keeps the tiles on the desktop: always directly above the desktop window, through Win+D / "Show desktop",
//! "Peek", clicks on a tile and clicks on the wallpaper, without a single frame in which a tile is missing.
//!
//! The tiles are owned windows of the desktop host (class `Progman` on Windows 11 24H2+, otherwise the
//! `WorkerW` that hosts `SHELLDLL_DefView`). Windows always keeps an owned window above its owner, so when
//! "Show desktop" raises the host to the top, the tiles rise with it in the same z-order change. The tiles
//! are also WS_EX_NOACTIVATE: a click does not activate them, so their acrylic never switches between the
//! active and the inactive look and they never jump in the z-order. A tile can still be activated on purpose
//! (typing in the map search, see `activate`).
//!
//! The one direction Windows does not handle: when the desktop is lowered again (Win+D a second time, a window
//! restored), only the host moves down and the tiles would stay above the restored windows. A hidden sentinel
//! window pinned to HWND_BOTTOM tells the two states apart (desktop shown <=> the sentinel is below the host).
//! When the desktop is not shown and a tile is anywhere but in the group right above the host, the tiles are
//! pinned back there. Owner and styles are re-checked on every poll: after an Explorer restart the old host
//! is gone (owned windows of other processes survive that) and the tiles are attached to the new one.
//! Nothing here touches tao's window flags: they re-apply styles and call ShowWindow, which activates a tile.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

use tauri::{AppHandle, Manager};
use windows::core::{w, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, EnumWindows, FindWindowExW, GetClassNameW, GetShellWindow, GetWindow, GetWindowLongPtrW,
    GetWindowLongW, IsWindowVisible, SetForegroundWindow, SetTimer, SetWindowLongPtrW, SetWindowPos,
    EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZESTART, GWLP_HWNDPARENT, GWL_EXSTYLE,
    GW_HWNDNEXT, GW_HWNDPREV, GW_OWNER, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST, SET_WINDOW_POS_FLAGS,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOSIZE, WINEVENT_OUTOFCONTEXT,
    WS_DISABLED, WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

static APP: OnceLock<AppHandle> = OnceLock::new();
static DESKTOP_SHOWN: AtomicBool = AtomicBool::new(false);
/// HWND of the hidden z-order sentinel (0 = not created).
static SENTINEL: AtomicIsize = AtomicIsize::new(0);

/// Poll interval for a moment after any foreground change or window minimize/restore (the hooks react at
/// once; this poll catches Explorer settling the z-order a little later). Each poll is one or two walks over
/// the z-order next to the desktop host.
const FAST_MS: u32 = 50;
/// While the desktop is shown and nothing happens.
const SHOWN_MS: u32 = 500;
/// Idle safety net for shell paths without any of the hooked events (an Explorer restart, for one). Keeps the
/// process from waking several times a second while nothing happens.
const SLOW_MS: u32 = 1000;
/// How long the fast poll stays on after a hooked event.
const FAST_AFTER_EVENT_MS: u64 = 1500;

/// All state below is touched only on the main thread (hook and timer callbacks arrive through its loop).
static TIMER_ID: AtomicUsize = AtomicUsize::new(0);
static TIMER_MS: AtomicU32 = AtomicU32::new(0);
static FAST_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static EPOCH: OnceLock<Instant> = OnceLock::new();

fn now_ms() -> u64 {
    EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64
}

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

/// HWND_BOTTOM. For an owned tile that means right above its owner, the desktop host.
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

/// One walk down the top-level z-order from `host`: whether the sentinel is below it, and whether any tile is.
fn below_host(host: HWND, sentinel: HWND, tiles: &[HWND]) -> (bool, bool) {
    let (mut sentinel_below, mut tile_below) = (false, false);
    let mut h = unsafe { GetWindow(host, GW_HWNDNEXT) };
    let mut guard = 0;
    while let Ok(hwnd) = h {
        if hwnd.0.is_null() || guard > 8192 {
            break;
        }
        if hwnd == sentinel {
            sentinel_below = true;
        } else if tiles.contains(&hwnd) {
            tile_below = true;
        }
        if sentinel_below && tile_below {
            break;
        }
        h = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
        guard += 1;
    }
    (sentinel_below, tile_below)
}

/// True when every tile sits in the group right above the host: walking up from the host, the tiles come
/// before any other visible window.
fn tiles_right_above(host: HWND, tiles: &[HWND]) -> bool {
    let mut seen = 0;
    let mut h = unsafe { GetWindow(host, GW_HWNDPREV) };
    let mut guard = 0;
    while let Ok(hwnd) = h {
        if hwnd.0.is_null() || guard > 8192 || seen == tiles.len() {
            break;
        }
        if tiles.contains(&hwnd) {
            seen += 1;
        } else if unsafe { IsWindowVisible(hwnd) }.as_bool() {
            break;
        }
        h = unsafe { GetWindow(hwnd, GW_HWNDPREV) };
        guard += 1;
    }
    seen == tiles.len()
}

fn tile_hwnds(app: &AppHandle) -> Vec<HWND> {
    crate::TILES
        .iter()
        .filter_map(|label| app.get_webview_window(label))
        .filter_map(|w| w.hwnd().ok())
        .map(|h| HWND(h.0))
        .collect()
}

/// Tool window (never in the taskbar or Alt+Tab) and not activated by clicks. Cheap when already set.
pub fn ensure_tile_style(h: HWND) {
    unsafe {
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        let want = (ex | WS_EX_TOOLWINDOW.0 as isize | WS_EX_NOACTIVATE.0 as isize) & !(WS_EX_APPWINDOW.0 as isize);
        if want != ex {
            SetWindowLongPtrW(h, GWL_EXSTYLE, want);
        }
    }
}

/// Make `host` the owner of every tile (a no-op for tiles already attached to it).
fn ensure_owner(tiles: &[HWND], host: HWND) {
    for &t in tiles {
        let owner = unsafe { GetWindow(t, GW_OWNER) }.unwrap_or_default();
        if owner != host {
            unsafe {
                SetWindowLongPtrW(t, GWLP_HWNDPARENT, host.0 as isize);
            }
        }
    }
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

/// Rescue for a tile that ended up below the raised desktop although it should be attached to it (the owner
/// could not be set yet): lift it right above the host.
fn lift(tiles: &[HWND], host: HWND) {
    let anchor = backmost_topmost_above(host, tiles);
    for &h in tiles {
        unsafe {
            match anchor {
                Some(a) => {
                    let _ = SetWindowPos(h, Some(a), 0, 0, 0, 0, ZPOS);
                }
                None => {
                    let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, ZPOS);
                    let _ = SetWindowPos(h, Some(HWND_NOTOPMOST), 0, 0, 0, 0, ZPOS);
                }
            }
        }
    }
}

fn pin_tiles(tiles: &[HWND]) {
    for &h in tiles {
        // HWND_BOTTOM also clears a topmost state a rescue lift may have given the tile.
        pin_bottom(h);
    }
}

fn check() {
    let Some(app) = APP.get() else { return };
    let Some(s) = sentinel() else { return };
    let Some(host) = desktop_host() else { return };
    keep_sentinel_down(s, host);
    let tiles = tile_hwnds(app);
    for &t in &tiles {
        ensure_tile_style(t);
    }
    ensure_owner(&tiles, host);
    let (sentinel_below, tile_below) = below_host(host, s, &tiles);
    let shown = unsafe { IsWindowVisible(host) }.as_bool() && sentinel_below;
    let was = DESKTOP_SHOWN.swap(shown, Ordering::SeqCst);
    if shown != was {
        // A transition: watch closely for a while (Explorer settles the z-order in a few steps).
        FAST_UNTIL_MS.fetch_max(now_ms() + FAST_AFTER_EVENT_MS, Ordering::Relaxed);
    }
    if shown {
        if tile_below {
            lift(&tiles, host);
        }
    } else if !tiles_right_above(host, &tiles) {
        pin_tiles(&tiles);
    }
}

/// Fast poll right after a hooked event or a transition, medium while the desktop is shown, slow otherwise.
/// SetTimer with the id of an existing thread timer replaces its interval.
fn schedule_poll() {
    let want = if now_ms() < FAST_UNTIL_MS.load(Ordering::Relaxed) {
        FAST_MS
    } else if DESKTOP_SHOWN.load(Ordering::Relaxed) {
        SHOWN_MS
    } else {
        SLOW_MS
    };
    if TIMER_MS.load(Ordering::Relaxed) == want {
        return;
    }
    let id = unsafe { SetTimer(None, TIMER_ID.load(Ordering::Relaxed), want, Some(on_timer)) };
    if id == 0 {
        eprintln!("[desktop] SetTimer failed; Win+D protection limited to the hooks");
        return;
    }
    TIMER_ID.store(id, Ordering::Relaxed);
    TIMER_MS.store(want, Ordering::Relaxed);
}

unsafe extern "system" fn on_event(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    let relevant = matches!(event, EVENT_SYSTEM_FOREGROUND | EVENT_SYSTEM_MINIMIZESTART | EVENT_SYSTEM_MINIMIZEEND);
    if relevant && !hwnd.0.is_null() {
        FAST_UNTIL_MS.fetch_max(now_ms() + FAST_AFTER_EVENT_MS, Ordering::Relaxed);
        check();
        schedule_poll();
    }
}

unsafe extern "system" fn on_timer(_hwnd: HWND, _msg: u32, _id: usize, _time: u32) {
    check();
    schedule_poll();
}

/// Attach one tile right away (startup, before it is revealed): style, owner, place right above the desktop.
pub fn attach(h: HWND) {
    ensure_tile_style(h);
    if let Some(host) = desktop_host() {
        ensure_owner(&[h], host);
    }
    pin_bottom(h);
}

/// Move a tile to (x, y) physical px and keep it right above the desktop, in one call.
pub fn move_tile(h: HWND, x: i32, y: i32) {
    unsafe {
        let _ = SetWindowPos(
            h,
            Some(HWND_BOTTOM),
            x,
            y,
            0,
            0,
            SET_WINDOW_POS_FLAGS(SWP_NOSIZE.0 | SWP_NOACTIVATE.0 | SWP_NOOWNERZORDER.0),
        );
    }
}

/// Activate a tile on purpose, so a text field in it gets the keyboard (the map search). Clicks alone never
/// activate a tile; this runs while the click is being handled, so Windows lets the app take the foreground.
/// The next foreground change puts the tile back right above the desktop (`check`).
pub fn activate(h: HWND) {
    unsafe {
        let _ = SetForegroundWindow(h);
    }
}

/// Install the sentinel, the hooks and the poll timer. Must run on the main (message-pumping) thread:
/// the sentinel window belongs to that thread and WINEVENT_OUTOFCONTEXT callbacks arrive through its loop.
pub fn install(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    // Start fast: Explorer may still be settling right after login.
    FAST_UNTIL_MS.store(now_ms() + FAST_AFTER_EVENT_MS, Ordering::Relaxed);
    create_sentinel();
    // Foreground changes cover almost every "Show desktop"; minimize/restore covers Win+D pressed while the
    // desktop itself already had the focus (no foreground change then).
    let hook = |from: u32, to: u32| unsafe { SetWinEventHook(from, to, None, Some(on_event), 0, 0, WINEVENT_OUTOFCONTEXT) };
    let foreground = hook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND);
    let minimize = hook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND);
    if foreground.0.is_null() || minimize.0.is_null() {
        eprintln!("[desktop] SetWinEventHook failed; relying on a fast timer");
        // Without the hooks only the poll notices "Show desktop": keep it fast.
        FAST_UNTIL_MS.store(u64::MAX, Ordering::Relaxed);
    }
    check();
    schedule_poll();
}
