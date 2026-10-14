//! «Запускать вместе с Windows»: the value `AITU Desk` in HKCU\…\Run, `"<path to aitudesk.exe>" --autostart`.
//! The path is quoted (the install folder, «AITU Desk», has a space: unquoted, Windows would first try
//! «C:\Users\…\AITU.exe»), it is written for this user only and never under HKLM, even from an elevated start.
//! Windows' own switch for startup apps (Settings → Apps → Startup, kept in Explorer\StartupApproved\Run) counts:
//! a start switched off there reads as off here, and switching it on here clears that mark, so the app's switch
//! and the system's always agree.
//! The user's choice is also kept in the store (`autostartWanted`, next to the settings, not in config files): an
//! update's installer runs the old uninstaller, which deletes the Run value, and the next start writes it back.

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use windows::core::HSTRING;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegGetValueW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
    KEY_SET_VALUE, REG_SAM_FLAGS, REG_SZ, RRF_RT_REG_BINARY, RRF_RT_REG_SZ,
};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
const NAME: &str = "AITU Desk";
const WANTED_KEY: &str = "autostartWanted";

/// What the Run value should say for this installation.
fn command_line() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    Some(format!("\"{}\" {}", exe.display(), crate::AUTOSTART_ARG))
}

fn read_string(key: &str, name: &str) -> Option<String> {
    let (key, name) = (HSTRING::from(key), HSTRING::from(name));
    let mut size = 0u32;
    // SAFETY: the first call asks for the size in bytes.
    let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, &key, &name, RRF_RT_REG_SZ, None, None, Some(&mut size)) };
    if status != ERROR_SUCCESS || size == 0 {
        return None;
    }
    let mut buf = vec![0u16; (size as usize).div_ceil(2)];
    // SAFETY: the buffer holds `size` bytes.
    let status = unsafe {
        RegGetValueW(HKEY_CURRENT_USER, &key, &name, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut size))
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]))
}

/// Windows' startup switch for this app: Some(false) when the user turned the start off in Windows' settings.
fn approved() -> Option<bool> {
    let (key, name) = (HSTRING::from(APPROVED), HSTRING::from(NAME));
    let mut data = [0u8; 12];
    let mut size = data.len() as u32;
    // SAFETY: a 12-byte buffer for the 12-byte value.
    let status = unsafe {
        RegGetValueW(HKEY_CURRENT_USER, &key, &name, RRF_RT_REG_BINARY, None, Some(data.as_mut_ptr().cast()), Some(&mut size))
    };
    // An even first byte (2, 6) is «on», an odd one (3, 7) «off».
    (status == ERROR_SUCCESS && size > 0).then_some(data[0] & 1 == 0)
}

/// A key under this user's hive (the Run key exists on every Windows installation); closed by the caller.
fn open(path: &str, access: REG_SAM_FLAGS) -> Option<HKEY> {
    let path = HSTRING::from(path);
    let mut key = HKEY::default();
    // SAFETY: opens an existing key of HKEY_CURRENT_USER.
    let status = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, &path, None, access, &mut key) };
    (status == ERROR_SUCCESS).then_some(key)
}

pub fn is_enabled() -> bool {
    read_string(RUN, NAME).is_some() && approved() != Some(false)
}

/// The Run value only, saying exactly what it should for this installation.
fn write_run() -> Result<(), String> {
    let value = command_line().ok_or("no exe path")?;
    let key = open(RUN, KEY_SET_VALUE).ok_or("registry")?;
    let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes = unsafe { std::slice::from_raw_parts(wide.as_ptr().cast::<u8>(), wide.len() * 2) };
    // SAFETY: a REG_SZ with its terminating NUL, on the key opened above.
    let status = unsafe { RegSetValueExW(key, &HSTRING::from(NAME), None, REG_SZ, Some(bytes)) };
    unsafe {
        let _ = RegCloseKey(key);
    }
    if status != ERROR_SUCCESS {
        return Err("registry".into());
    }
    Ok(())
}

/// The start switched on: the Run value, and Windows' own «off» mark cleared, since the user (or the first start)
/// has just asked for the start.
pub fn enable() -> Result<(), String> {
    write_run()?;
    if approved() == Some(false) {
        if let Some(key) = open(APPROVED, KEY_SET_VALUE) {
            unsafe {
                let _ = RegDeleteValueW(key, &HSTRING::from(NAME));
                let _ = RegCloseKey(key);
            }
        }
    }
    Ok(())
}

pub fn disable() -> Result<(), String> {
    if let Some(key) = open(RUN, KEY_SET_VALUE | KEY_QUERY_VALUE) {
        unsafe {
            let _ = RegDeleteValueW(key, &HSTRING::from(NAME));
            let _ = RegCloseKey(key);
        }
    }
    if read_string(RUN, NAME).is_some() {
        return Err("registry".into());
    }
    Ok(())
}

/// At every start: an existing entry that no longer says exactly the right thing (written unquoted by an older
/// version, or pointing at a moved install) is rewritten. Nothing is created when there is none, and Windows' own
/// switch is left as the user set it.
pub fn refresh() {
    if let (Some(current), Some(wanted)) = (read_string(RUN, NAME), command_line()) {
        if current != wanted {
            let _ = write_run();
        }
    }
}

/// Keeps the user's choice in the store.
pub fn remember(app: &AppHandle, on: bool) {
    if let Ok(store) = app.store(crate::layout::STORE_FILE) {
        store.set(WANTED_KEY, on);
        let _ = store.save();
    }
}

/// At every start but the first: the user wants the start and its Run value is gone (an update's uninstaller
/// deleted it), so it is written back, unless the start was switched off in Windows' own settings. A store from
/// before this key (an update from a version that did not keep the choice, whose uninstaller has just deleted the
/// value) gets the start back too, the default, unless Windows' own switch says off.
pub fn restore(app: &AppHandle) {
    let wanted = app.store(crate::layout::STORE_FILE).ok().and_then(|s| s.get(WANTED_KEY)).and_then(|v| v.as_bool());
    match wanted {
        Some(true) if read_string(RUN, NAME).is_none() && approved() != Some(false) => {
            let _ = write_run();
        }
        None => {
            if read_string(RUN, NAME).is_none() && approved() != Some(false) {
                let _ = write_run();
            }
            remember(app, is_enabled());
        }
        _ => {}
    }
}

#[tauri::command]
pub fn autostart_enabled() -> bool {
    is_enabled()
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    crate::journal::write("autostart", if on { "start with Windows switched on" } else { "start with Windows switched off" });
    if on {
        enable()?;
    } else {
        disable()?;
    }
    remember(&app, on);
    Ok(())
}
