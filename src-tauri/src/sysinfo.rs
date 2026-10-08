//! Data for the «Система» tile: power, Wi‑Fi and Bluetooth.
//!
//! Every WinRT call blocks with `join()` (a kernel wait, no message pump), so all of it runs in
//! `spawn_blocking`, never on the UI thread. A null WinRT object surfaces as `Err` with HRESULT 0
//! and means «nothing there», not a failure. The commands never panic and never fail: any error
//! collapses into an «unavailable» value.
//!
//! Mocks for checks without the hardware, read at call time:
//! `AITUDESK_MOCK_POWER` = `none` | `NN` | `NN,charging` | `NN,saver`;
//! `AITUDESK_MOCK_WIFI` = `off` | `SSID,bars` | `hidden,bars`;
//! `AITUDESK_MOCK_BT` = `off` | `none` | `Name1;Name2;Name3`.

use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use windows::core::{Error, Result};
use windows::Devices::Bluetooth::{
    BluetoothAdapter, BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice,
};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Radios::RadioState;
use windows::Networking::Connectivity::{NetworkConnectivityLevel, NetworkInformation};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

/// `CREATE_NO_WINDOW`: the netsh fallback must not flash a console.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Machines without any WLAN interface: don't spawn netsh every 10 s, re-probe every 5 minutes.
static NETSH_BACKOFF_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);
const NETSH_BACKOFF: Duration = Duration::from_secs(300);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerInfo {
    pub has_battery: bool,
    /// 0..=100; `None` when Windows reports the level as unknown.
    pub percent: Option<u8>,
    pub charging: bool,
    pub on_ac: bool,
    /// Windows battery saver (energy saver) is on: the tiles skip per-second updates and poll less often.
    pub saver: bool,
}

impl PowerInfo {
    const NO_BATTERY: Self = Self { has_battery: false, percent: None, charging: false, on_ac: true, saver: false };
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WifiInfo {
    pub connected: bool,
    pub ssid: Option<String>,
    /// 0..=5 signal bars; `None` when unknown.
    pub bars: Option<u8>,
    /// Connected, but Windows hides the SSID (24H2 without location permission).
    pub ssid_hidden: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothInfo {
    /// Adapter present and radio on.
    pub available: bool,
    pub devices: Vec<String>,
}

// ---- Commands -------------------------------------------------------------------------------

#[tauri::command]
pub async fn get_power() -> PowerInfo {
    if let Some(mock) = mock_power() {
        return mock;
    }
    tauri::async_runtime::spawn_blocking(read_power)
        .await
        .unwrap_or(PowerInfo::NO_BATTERY)
}

#[tauri::command]
pub async fn get_wifi() -> WifiInfo {
    if let Some(mock) = mock_wifi() {
        return mock;
    }
    tauri::async_runtime::spawn_blocking(read_wifi)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_bluetooth() -> BluetoothInfo {
    if let Some(mock) = mock_bluetooth() {
        return mock;
    }
    tauri::async_runtime::spawn_blocking(read_bluetooth)
        .await
        .unwrap_or_default()
}

// ---- Power ----------------------------------------------------------------------------------

fn read_power() -> PowerInfo {
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY: `status` is a valid, exclusively borrowed SYSTEM_POWER_STATUS for the call.
    if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
        return PowerInfo::NO_BATTERY;
    }
    // Energy saver can be on without a battery too (Windows 11 offers it on desktops).
    let saver = status.SystemStatusFlag == 1;
    let flag = status.BatteryFlag;
    // 255 = «unknown status» (the driver could not read the battery right now); it has bit 128
    // set but is a battery with an unknown level, not a desktop PC.
    let unknown = flag == 255;
    if !unknown && flag & 128 != 0 {
        return PowerInfo { saver, ..PowerInfo::NO_BATTERY };
    }
    PowerInfo {
        has_battery: true,
        percent: (status.BatteryLifePercent <= 100).then_some(status.BatteryLifePercent),
        charging: !unknown && flag & 8 != 0,
        on_ac: status.ACLineStatus == 1,
        saver,
    }
}

fn mock_power() -> Option<PowerInfo> {
    let raw = std::env::var("AITUDESK_MOCK_POWER").ok()?;
    let raw = raw.trim();
    if raw.eq_ignore_ascii_case("none") {
        return Some(PowerInfo::NO_BATTERY);
    }
    // "64", "15,charging" or "40,saver" (battery saver on).
    let (percent, flag) = split_pair(raw);
    let charging = flag.eq_ignore_ascii_case("charging");
    Some(PowerInfo {
        has_battery: true,
        percent: percent.parse::<u8>().ok().map(|p| p.min(100)),
        charging,
        on_ac: charging,
        saver: flag.eq_ignore_ascii_case("saver"),
    })
}

// ---- Wi‑Fi ----------------------------------------------------------------------------------

/// WinRT is authoritative when it answers (`Ok(None)` = adapter off or disconnected); netsh is
/// only the fallback for a failed WinRT call, so a disconnected laptop never spawns netsh every 10 s.
fn read_wifi() -> WifiInfo {
    match wifi_winrt() {
        Ok(Some(info)) => info,
        Ok(None) => WifiInfo::default(),
        Err(_) => wifi_netsh().unwrap_or_default(),
    }
}

/// The first connected WLAN profile; `Ok(None)` when WinRT lists none.
fn wifi_winrt() -> Result<Option<WifiInfo>> {
    let profiles = NetworkInformation::GetConnectionProfiles()?;
    for profile in &profiles {
        if !profile.IsWlanConnectionProfile().unwrap_or(false) {
            continue;
        }
        let level = profile
            .GetNetworkConnectivityLevel()
            .unwrap_or(NetworkConnectivityLevel::None);
        if level == NetworkConnectivityLevel::None {
            continue;
        }
        let ssid = profile
            .WlanConnectionProfileDetails()
            .and_then(|details| details.GetConnectedSsid())
            .map(|s| s.to_string())
            .unwrap_or_default();
        // GetSignalBars may return a null IReference → Err(HRESULT 0) → unknown.
        let bars = profile
            .GetSignalBars()
            .and_then(|bars| bars.Value())
            .ok()
            .map(|b| b.min(5));
        return Ok(Some(connected(ssid, bars)));
    }
    Ok(None)
}

fn connected(ssid: String, bars: Option<u8>) -> WifiInfo {
    let ssid = ssid.trim().to_string();
    WifiInfo {
        connected: true,
        ssid_hidden: ssid.is_empty(),
        ssid: (!ssid.is_empty()).then_some(ssid),
        bars,
    }
}

#[derive(Default)]
struct NetshBlock {
    ssid: Option<String>,
    state: Option<String>,
    signal: Option<u8>,
}

impl NetshBlock {
    /// `Some` when this interface block says it is connected.
    fn connected(&self) -> Option<WifiInfo> {
        let state = self.state.as_deref()?;
        let up = (state.contains("connected") && !state.contains("disconnected"))
            || (state.contains("подключ") && !state.contains("отключ"));
        up.then(|| connected(self.ssid.clone().unwrap_or_default(), self.signal.map(signal_to_bars)))
    }
}

/// The Windows system folder (System32), from Windows itself rather than the environment.
fn system_dir() -> Option<std::path::PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    let mut buf = [0u16; 260];
    // SAFETY: the buffer is ours and its length goes with it.
    let n = unsafe { windows::Win32::System::SystemInformation::GetSystemDirectoryW(Some(&mut buf)) } as usize;
    (n > 0 && n < buf.len()).then(|| std::ffi::OsString::from_wide(&buf[..n]).into())
}

/// Fallback: `netsh wlan show interfaces`, parsed case-insensitively (English or Russian labels).
fn wifi_netsh() -> Option<WifiInfo> {
    let now = Instant::now();
    if let Ok(until) = NETSH_BACKOFF_UNTIL.lock() {
        if until.is_some_and(|until| now < until) {
            return None;
        }
    }
    // Absolute path in the system folder as Windows reports it: never a stray netsh.exe from the app directory,
    // PATH or a changed %SystemRoot%.
    let netsh = system_dir()?.join("netsh.exe");
    let output = Command::new(netsh)
        .args(["wlan", "show", "interfaces"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = decode_console(&output.stdout);
    let mut saw_interface = false;
    let mut block = NetshBlock::default();
    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else { continue };
        let key = key.trim().to_lowercase();
        let value = value.trim();
        match key.as_str() {
            // A new interface block starts; evaluate the previous one first.
            "name" | "имя" => {
                saw_interface = true;
                if let Some(info) = block.connected() {
                    return Some(info);
                }
                block = NetshBlock::default();
            }
            // Exact match on purpose: the "BSSID" line must not count.
            "ssid" => block.ssid = Some(value.to_string()),
            "state" | "состояние" => {
                saw_interface = true;
                block.state = Some(value.to_lowercase());
            }
            "signal" | "сигнал" => {
                block.signal = value.trim_end_matches('%').trim().parse::<u8>().ok();
            }
            _ => {}
        }
    }
    if !saw_interface {
        if let Ok(mut until) = NETSH_BACKOFF_UNTIL.lock() {
            *until = Some(now + NETSH_BACKOFF);
        }
    }
    block.connected()
}

/// "78%" → 4 bars (20 % steps, 0 % → 0 bars).
fn signal_to_bars(quality: u8) -> u8 {
    quality.min(100).div_ceil(20)
}

/// netsh prints in the console code page: UTF‑8 when it decodes, otherwise CP866 (Cyrillic OEM).
fn decode_console(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => bytes.iter().map(|&b| cp866(b)).collect(),
    }
}

fn cp866(byte: u8) -> char {
    match byte {
        0x80..=0xAF => char::from_u32(0x0410 + u32::from(byte - 0x80)).unwrap_or('?'),
        0xE0..=0xEF => char::from_u32(0x0440 + u32::from(byte - 0xE0)).unwrap_or('?'),
        0xF0 => 'Ё',
        0xF1 => 'ё',
        // Box drawing and the remaining symbols: not needed for parsing.
        0xB0..=0xDF | 0xF2..=0xFF => '?',
        _ => char::from(byte),
    }
}

fn mock_wifi() -> Option<WifiInfo> {
    let raw = std::env::var("AITUDESK_MOCK_WIFI").ok()?;
    let raw = raw.trim();
    if raw.eq_ignore_ascii_case("off") {
        return Some(WifiInfo::default());
    }
    let (name, bars) = split_pair(raw);
    let bars = bars.parse::<u8>().ok().map(|b| b.min(5));
    let ssid = if name.eq_ignore_ascii_case("hidden") { String::new() } else { name.to_string() };
    Some(connected(ssid, bars))
}

// ---- Bluetooth ------------------------------------------------------------------------------

fn read_bluetooth() -> BluetoothInfo {
    bluetooth_winrt().unwrap_or_default()
}

fn bluetooth_winrt() -> Result<BluetoothInfo> {
    let adapter = match BluetoothAdapter::GetDefaultAsync()?.join() {
        Ok(adapter) => adapter,
        // No adapter at all → same as «Выключен».
        Err(e) if is_null(&e) => return Ok(BluetoothInfo::default()),
        Err(e) => return Err(e),
    };
    // Off/Disabled → «Выключен»; Unknown or an unreadable radio is treated as on.
    let state = adapter
        .GetRadioAsync()
        .and_then(|op| op.join())
        .and_then(|radio| radio.State());
    if let Ok(state) = state {
        if state == RadioState::Off || state == RadioState::Disabled {
            return Ok(BluetoothInfo::default());
        }
    }

    let selectors = [
        BluetoothDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)?,
        BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)?,
    ];
    let mut devices: Vec<String> = Vec::new();
    for selector in &selectors {
        let found = match DeviceInformation::FindAllAsyncAqsFilter(selector)?.join() {
            Ok(found) => found,
            Err(e) if is_null(&e) => continue,
            Err(e) => return Err(e),
        };
        for device in &found {
            let Ok(name) = device.Name() else { continue };
            let name = name.to_string();
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            let lower = name.to_lowercase();
            if devices.iter().any(|d| d.to_lowercase() == lower) {
                continue;
            }
            devices.push(name.to_string());
        }
    }
    Ok(BluetoothInfo { available: true, devices })
}

fn mock_bluetooth() -> Option<BluetoothInfo> {
    let raw = std::env::var("AITUDESK_MOCK_BT").ok()?;
    let raw = raw.trim();
    if raw.eq_ignore_ascii_case("off") {
        return Some(BluetoothInfo::default());
    }
    if raw.eq_ignore_ascii_case("none") {
        return Some(BluetoothInfo { available: true, devices: Vec::new() });
    }
    let devices = raw
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    Some(BluetoothInfo { available: true, devices })
}

// ---- Helpers --------------------------------------------------------------------------------

/// A null WinRT object: `Err` carrying HRESULT 0 and no message.
fn is_null(e: &Error) -> bool {
    e.code().is_ok()
}

/// "a,b" → ("a", "b"); "a" → ("a", "").
fn split_pair(raw: &str) -> (&str, &str) {
    match raw.split_once(',') {
        Some((a, b)) => (a.trim(), b.trim()),
        None => (raw, ""),
    }
}
