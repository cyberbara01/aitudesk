//! «Журнал»: an optional record of what happens in the app, kept on this computer for a bug report. Off until the
//! user switches it on («О программе»). One line per event: the time, where it came from, what happened (a setting
//! changed, a widget opened, a stack paged, an error). Nothing personal goes in: no texts of notes or lessons, no
//! addresses of shortcuts, no names of networks or devices, the user's folder written as %USERPROFILE%.
//!
//! The file (`logs/journal.txt` in the app's local data folder) never grows past `LIMIT`: then the oldest records go
//! and the newest stay, so the actions before a crash are always there. Each start writes a line with the version and
//! the system; if the session before ended without the line an exit writes, the start says so (a crash or a power
//! cut). «Сохранить отчёт» writes one text file: the system, which features are on and the journal.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::layout::STORE_FILE;

/// The most the journal takes on disk.
pub const LIMIT: u64 = 2 * 1024 * 1024;
/// What stays when it is full: the newest part, so writing goes on for a long while before the next cut.
const KEEP: u64 = 1536 * 1024;
/// Store key of the switch (next to the settings, not in configs: it belongs to this computer).
const ON_KEY: &str = "journalOn";
const START: &str = "=== start";
const EXIT: &str = "=== exit";

static ON: AtomicBool = AtomicBool::new(false);
/// The journal has reached its limit once: from then on it keeps the newest records and drops the oldest.
static FULL: AtomicBool = AtomicBool::new(false);
const TRIMMED: &str = "[journal] older records removed";
static SIZE: AtomicU64 = AtomicU64::new(0);
static FILE: Mutex<Option<File>> = Mutex::new(None);
static PATH: OnceLock<PathBuf> = OnceLock::new();
/// The user's folder, replaced in what is written.
static HOME: OnceLock<String> = OnceLock::new();

/// The journal's file path (known after `init`).
fn path() -> Option<&'static PathBuf> {
    PATH.get()
}

fn now() -> String {
    // SAFETY: fills a plain struct.
    let t = unsafe { GetLocalTime() };
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds)
}

/// One line, with the user's folder hidden and line breaks flattened.
fn clean(text: &str) -> String {
    let mut s = text.replace(['\r', '\n'], " ");
    if let Some(home) = HOME.get() {
        if !home.is_empty() {
            s = s.replace(home.as_str(), "%USERPROFILE%");
        }
    }
    if s.len() > 600 {
        let mut cut = 600;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
        s.push('…');
    }
    s
}

fn open_append(p: &PathBuf) -> Option<File> {
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    OpenOptions::new().create(true).append(true).open(p).ok()
}

/// The last `n` bytes of the file, from the start of a line.
fn tail(p: &PathBuf, n: u64) -> String {
    let Ok(mut f) = File::open(p) else { return String::new() };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let from = len.saturating_sub(n);
    if f.seek(SeekFrom::Start(from)).is_err() {
        return String::new();
    }
    let mut buf = Vec::new();
    let _ = f.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf).into_owned();
    if from > 0 {
        match text.find('\n') {
            Some(i) => text[i + 1..].to_string(),
            None => String::new(),
        }
    } else {
        text
    }
}

/// Full: only the newest part stays.
fn trim(file: &mut Option<File>) {
    let Some(p) = path() else { return };
    let kept = tail(p, KEEP);
    *file = None;
    let note = format!("{} {TRIMMED}: the journal keeps the newest {} KB\n", now(), KEEP / 1024);
    FULL.store(true, Ordering::Relaxed);
    if std::fs::write(p, format!("{note}{kept}")).is_ok() {
        SIZE.store((note.len() + kept.len()) as u64, Ordering::Relaxed);
    }
    *file = open_append(p);
}

/// Writes one event (nothing while the journal is off). Any thread.
pub fn write(source: &str, text: &str) {
    if ON.load(Ordering::Relaxed) {
        let file = FILE.lock().unwrap_or_else(|e| e.into_inner());
        put(file, source, text);
    }
}

fn put(mut file: std::sync::MutexGuard<'_, Option<File>>, source: &str, text: &str) {
    let line = format!("{} [{}] {}\n", now(), source, clean(text));
    if file.is_none() {
        if let Some(p) = path() {
            *file = open_append(p);
        }
    }
    let Some(f) = file.as_mut() else { return };
    if f.write_all(line.as_bytes()).is_ok() {
        let _ = f.flush();
        if SIZE.fetch_add(line.len() as u64, Ordering::Relaxed) + line.len() as u64 > LIMIT {
            trim(&mut file);
        }
    }
}

/// Windows' name, version and build, from the registry.
pub fn windows_version() -> String {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ};
    let key = HSTRING::from(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
    let text = |name: &str| -> String {
        let name = HSTRING::from(name);
        let mut buf = [0u16; 128];
        let mut size = (buf.len() * 2) as u32;
        // SAFETY: a 256-byte buffer for a short string value.
        let ok = unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, &key, &name, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut size)) };
        if ok != ERROR_SUCCESS {
            return String::new();
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
    };
    let mut ubr = 0u32;
    let mut size = 4u32;
    // SAFETY: a DWORD value into a u32.
    let _ = unsafe {
        RegGetValueW(HKEY_LOCAL_MACHINE, &key, &HSTRING::from("UBR"), RRF_RT_REG_DWORD, None, Some((&mut ubr as *mut u32).cast()), Some(&mut size))
    };
    let build: u32 = text("CurrentBuildNumber").parse().unwrap_or(0);
    // Windows 11 still calls itself «Windows 10» in ProductName; the build tells.
    let product = text("ProductName").replace("Windows 10", if build >= 22000 { "Windows 11" } else { "Windows 10" });
    format!("{product} {} (build {build}.{ubr})", text("DisplayVersion"))
}

/// The start: the switch from the store, the file opened, a line with the version and the system, and a line about
/// the session before if it did not end normally.
pub fn init(app: &AppHandle) {
    let _ = HOME.set(std::env::var("USERPROFILE").unwrap_or_default());
    if let Ok(dir) = app.path().app_local_data_dir() {
        let _ = PATH.set(dir.join("logs").join("journal.txt"));
    }
    let on = app.store(STORE_FILE).ok().and_then(|s| s.get(ON_KEY)).and_then(|v| v.as_bool()).unwrap_or(false);
    let Some(p) = path() else { return };
    SIZE.store(std::fs::metadata(p).map(|m| m.len()).unwrap_or(0), Ordering::Relaxed);
    // Cut before: its first line says so.
    let mut head = [0u8; 96];
    let n = File::open(p).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
    FULL.store(String::from_utf8_lossy(&head[..n]).contains(TRIMMED), Ordering::Relaxed);
    if !on {
        return;
    }
    // Was the last session closed? Its last marker tells.
    let last = tail(p, 64 * 1024);
    let unclosed = last.rfind(START).is_some_and(|s| last.rfind(EXIT).is_none_or(|e| e < s));
    ON.store(true, Ordering::Relaxed);
    if unclosed {
        write("app", "the previous session did not exit normally (a crash, a hang ended by force, or the computer turned off)");
    }
    write("app", &format!("{START} AITU Desk {} on {}", app.package_info().version, windows_version()));
}

/// The app is closing normally.
pub fn exit() {
    write("app", EXIT);
}

/// A panic is written before the process ends (the release build aborts on a panic).
pub fn catch_panics() {
    let before = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Never waits: a panic while a line was being written must still end the process.
        if ON.load(Ordering::Relaxed) {
            if let Ok(file) = FILE.try_lock() {
                put(file, "panic", &info.to_string());
            }
        }
        before(info);
    }));
}

#[derive(Serialize)]
pub struct Status {
    pub on: bool,
    pub size: u64,
    pub limit: u64,
    /// It has reached the limit: the oldest records go, the newest stay.
    pub full: bool,
}

fn status() -> Status {
    Status { on: ON.load(Ordering::Relaxed), size: SIZE.load(Ordering::Relaxed), limit: LIMIT, full: FULL.load(Ordering::Relaxed) }
}

/// «Журнал» in «О программе»: on or off, how full.
#[tauri::command]
pub fn journal_status() -> Status {
    status()
}

/// The switch.
#[tauri::command]
pub fn journal_set(app: AppHandle, on: bool) -> Status {
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(ON_KEY, on);
        let _ = store.save();
    }
    if on && !ON.load(Ordering::Relaxed) {
        ON.store(true, Ordering::Relaxed);
        write("app", &format!("{START} journal switched on; AITU Desk {} on {}", app.package_info().version, windows_version()));
    } else if !on && ON.load(Ordering::Relaxed) {
        write("app", &format!("{EXIT} journal switched off"));
        ON.store(false, Ordering::Relaxed);
        *FILE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    status()
}

/// «Очистить»: an empty journal (it goes on writing if it is on).
#[tauri::command]
pub fn journal_clear(app: AppHandle) -> Status {
    let mut file = FILE.lock().unwrap_or_else(|e| e.into_inner());
    *file = None;
    if let Some(p) = path() {
        let _ = std::fs::remove_file(p);
    }
    SIZE.store(0, Ordering::Relaxed);
    FULL.store(false, Ordering::Relaxed);
    drop(file);
    if ON.load(Ordering::Relaxed) {
        write("app", &format!("{START} journal cleared; AITU Desk {} on {}", app.package_info().version, windows_version()));
    }
    status()
}

/// An event from a page (a setting changed, a menu item, an error).
#[tauri::command]
pub fn journal_write(window: tauri::WebviewWindow, text: String) {
    write(window.label(), &text);
}

/// «Папка журнала»: the journal's folder in Explorer (made if it is not there yet).
#[tauri::command]
pub fn journal_folder() {
    let Some(dir) = path().and_then(|p| p.parent()) else { return };
    let _ = std::fs::create_dir_all(dir);
    let _ = std::process::Command::new("explorer.exe").arg(dir).spawn();
}

/// «Сохранить отчёт»: where to save, then the report: the version and the system, `summary` from the page (which
/// features are on, without anything personal), the screen, and the journal (its newest part).
#[tauri::command]
pub async fn journal_save_report(app: AppHandle, window: tauri::WebviewWindow, title: String, file_name: String, summary: String) -> Result<Option<String>, String> {
    let screen = crate::layout::work_area(&window);
    let journal = path().map(|p| tail(p, LIMIT)).unwrap_or_default();
    let report = format!(
        "AITU Desk {version}\r\n{os}\r\nWork area: {w}x{h} px at {scale}% display scale\r\nWidget zoom: {zoom}\r\nJournal: {state}, {size} KB\r\nSaved: {time}\r\n\r\n--- Settings ---\r\n{summary}\r\n\r\n--- Journal ---\r\n{journal}",
        version = app.package_info().version,
        os = windows_version(),
        w = screen.w,
        h = screen.h,
        scale = (screen.scale * 100.0).round(),
        zoom = crate::zoom::current(),
        state = if ON.load(Ordering::Relaxed) { "on" } else { "off" },
        size = SIZE.load(Ordering::Relaxed).div_ceil(1024),
        time = now(),
        summary = clean_block(&summary),
        journal = if journal.is_empty() { "(empty)".to_string() } else { journal.replace('\n', "\r\n") },
    );
    let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || crate::files::save_text(owner, title, file_name, report))
        .await
        .map_err(|e| e.to_string())?
}

/// The page's summary, its lines kept, with the user's folder hidden.
fn clean_block(text: &str) -> String {
    text.lines().map(clean).collect::<Vec<_>>().join("\r\n")
}

/// A problem the app works around: printed for a developer and written to the journal.
#[macro_export]
macro_rules! note {
    ($source:expr, $($arg:tt)*) => {{
        let text = format!($($arg)*);
        eprintln!("{text}");
        $crate::journal::write($source, &text);
    }};
}
