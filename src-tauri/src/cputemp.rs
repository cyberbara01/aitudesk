//! Processor temperature where Windows itself gives none (most desktop PCs: Windows has no general API for the
//! processor's sensors, and reading them directly takes a kernel driver and admin rights, which AITU Desk never
//! installs). Hardware monitors the user may already run publish their sensors for other programs to read:
//! LibreHardwareMonitor and OpenHardwareMonitor through WMI, HWiNFO, Core Temp, MSI Afterburner and AIDA64 through
//! named shared memory. Read only, only while the «Нагрузка» widget asks, and an absent program is looked for at
//! most every PROBE_EVERY.

use std::time::{Duration, Instant};

use windows::core::{BSTR, HSTRING, PCWSTR};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoSetProxyBlanket, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
};
use windows::Win32::System::Memory::{
    MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualQuery, FILE_MAP_READ, MEMORY_BASIC_INFORMATION,
};
use windows::Win32::System::Variant::{VariantClear, VARIANT, VT_BSTR, VT_R4, VT_R8};
use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, WbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_INFINITE,
};

/// How often programs that did not answer are looked for again.
const PROBE_EVERY: Duration = Duration::from_secs(10);
/// A reading outside this range (°C) is a placeholder or a broken sensor.
const SANE: std::ops::RangeInclusive<f32> = 5.0..=125.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Source {
    LibreHardwareMonitor,
    OpenHardwareMonitor,
    Hwinfo,
    CoreTemp,
    Afterburner,
    Aida64,
}

impl Source {
    /// The name the settings page shows (`cpuTempSource`).
    pub fn id(self) -> &'static str {
        match self {
            Source::LibreHardwareMonitor => "librehardwaremonitor",
            Source::OpenHardwareMonitor => "openhardwaremonitor",
            Source::Hwinfo => "hwinfo",
            Source::CoreTemp => "coretemp",
            Source::Afterburner => "afterburner",
            Source::Aida64 => "aida64",
        }
    }
}

const ALL: [Source; 6] = [
    Source::Hwinfo,
    Source::LibreHardwareMonitor,
    Source::CoreTemp,
    Source::Afterburner,
    Source::Aida64,
    Source::OpenHardwareMonitor,
];

pub struct Monitors {
    last: Option<Source>,
    next_probe: Instant,
}

impl Monitors {
    pub fn new() -> Self {
        Monitors { last: None, next_probe: Instant::now() }
    }

    /// The processor temperature (°C) and the program it came from. The one that answered last is asked first;
    /// while none answers, all of them are looked for at most every PROBE_EVERY.
    pub fn read(&mut self) -> Option<(f32, Source)> {
        if let Some(src) = self.last {
            if let Some(t) = read(src) {
                return Some((t, src));
            }
            self.last = None;
        }
        let now = Instant::now();
        if now < self.next_probe {
            return None;
        }
        self.next_probe = now + PROBE_EVERY;
        for src in ALL {
            if let Some(t) = read(src) {
                self.last = Some(src);
                return Some((t, src));
            }
        }
        None
    }
}

fn read(src: Source) -> Option<f32> {
    let t = match src {
        Source::LibreHardwareMonitor => wmi_monitor("ROOT\\LibreHardwareMonitor"),
        Source::OpenHardwareMonitor => wmi_monitor("ROOT\\OpenHardwareMonitor"),
        Source::Hwinfo => hwinfo(),
        Source::CoreTemp => core_temp(),
        Source::Afterburner => afterburner(),
        Source::Aida64 => aida64(),
    }?;
    SANE.contains(&t).then_some(t)
}

// ---------------------------------------------------------------------------------------------
// Shared memory
// ---------------------------------------------------------------------------------------------

/// A copy of the named shared memory another program publishes (at most `max` bytes); None when it is not there
/// or not readable for this user.
fn mapped(name: &str, max: usize) -> Option<Vec<u8>> {
    let wide = HSTRING::from(name);
    // SAFETY: a read-only view of a mapping we only read; the length comes from the view's own region, and the view
    // and the handle are released before returning.
    unsafe {
        let handle = OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(wide.as_ptr())).ok()?;
        let view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0);
        let bytes = if view.Value.is_null() {
            None
        } else {
            let mut info = MEMORY_BASIC_INFORMATION::default();
            let got = VirtualQuery(Some(view.Value), &mut info, std::mem::size_of::<MEMORY_BASIC_INFORMATION>());
            let len = if got == 0 { 0 } else { info.RegionSize.min(max) };
            let copy = std::slice::from_raw_parts(view.Value as *const u8, len).to_vec();
            let _ = UnmapViewOfFile(view);
            (len > 0).then_some(copy)
        };
        let _ = CloseHandle(handle);
        bytes
    }
}

fn u32_at(m: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(m.get(at..at + 4)?.try_into().ok()?))
}

fn f32_at(m: &[u8], at: usize) -> Option<f32> {
    Some(f32::from_le_bytes(m.get(at..at + 4)?.try_into().ok()?))
}

fn f64_at(m: &[u8], at: usize) -> Option<f64> {
    Some(f64::from_le_bytes(m.get(at..at + 8)?.try_into().ok()?))
}

/// A NUL-terminated string of a fixed-size field.
fn text_at(m: &[u8], at: usize, len: usize) -> Option<String> {
    let field = m.get(at..at + len)?;
    let end = field.iter().position(|&b| b == 0).unwrap_or(len);
    Some(String::from_utf8_lossy(&field[..end]).trim().to_string())
}

/// The first of `labels` (in order of preference) that some reading has; the hottest of those readings.
fn preferred(readings: impl Iterator<Item = (String, f32)> + Clone, labels: &[&str]) -> Option<f32> {
    labels.iter().find_map(|want| {
        readings
            .clone()
            .filter(|(label, t)| label.eq_ignore_ascii_case(want) && SANE.contains(t))
            .map(|(_, t)| t)
            .reduce(f32::max)
    })
}

/// HWiNFO (Settings, «Shared Memory Support»): HWiNFO_SENSORS_SHARED_MEM2 of its SDK, packed. Header: signature,
/// version, revision, poll time (8 bytes), then offset, size and count of the sensor and the reading sections.
/// A reading: type (1 = temperature) @0, sensor index @4, id @8, original label @12 (128), user label @140 (128),
/// unit @268 (16), value @284 (f64).
fn hwinfo() -> Option<f32> {
    let m = mapped("Global\\HWiNFO_SENS_SM2", 8 << 20).or_else(|| mapped("HWiNFO_SENS_SM2", 8 << 20))?;
    let sig = m.get(0..4)?;
    if sig != b"SiWH" && sig != b"HWiS" {
        return None;
    }
    let (off, size, count) = (u32_at(&m, 32)? as usize, u32_at(&m, 36)? as usize, u32_at(&m, 40)? as usize);
    if size < 292 {
        return None;
    }
    let readings: Vec<(String, f32)> = (0..count.min(8192))
        .filter_map(|i| {
            let at = off.checked_add(i.checked_mul(size)?)?;
            if u32_at(&m, at)? != 1 {
                return None;
            }
            let unit = text_at(&m, at + 268, 16)?;
            let mut value = f64_at(&m, at + 284)? as f32;
            if unit.ends_with('F') {
                value = (value - 32.0) * 5.0 / 9.0;
            }
            Some((text_at(&m, at + 12, 128)?, value))
        })
        .collect();
    preferred(readings.into_iter(), &["CPU Package", "CPU (Tctl/Tdie)", "CPU Die (average)", "Core Max", "CPU"])
}

/// Core Temp: CORE_TEMP_SHARED_DATA (the Ex version starts the same). uiTjMax[128] @1024, uiCoreCnt @1536,
/// uiCPUCnt @1540, fTemp[256] @1544, ucFahrenheit @2684, ucDeltaToTjMax @2685. The hottest core.
fn core_temp() -> Option<f32> {
    let m = mapped("CoreTempMappingObjectEx", 64 << 10).or_else(|| mapped("CoreTempMappingObject", 64 << 10))?;
    let cores = u32_at(&m, 1536)? as usize;
    let cpus = u32_at(&m, 1540)? as usize;
    let fahrenheit = *m.get(2684)? != 0;
    let delta = *m.get(2685)? != 0;
    (0..(cores * cpus).min(256))
        .filter_map(|i| {
            let raw = f32_at(&m, 1544 + i * 4)?;
            let t = if delta {
                let tj = u32_at(&m, 1024 + (i / cores.max(1)).min(127) * 4)? as f32;
                tj - if fahrenheit { raw * 5.0 / 9.0 } else { raw }
            } else if fahrenheit {
                (raw - 32.0) * 5.0 / 9.0
            } else {
                raw
            };
            SANE.contains(&t).then_some(t)
        })
        .reduce(f32::max)
}

/// MSI Afterburner (its monitoring must list «CPU temperature»): MAHM_SHARED_MEMORY of the RivaTuner SDK. Header:
/// signature 'MAHM', version, header size @8, entry count @12, entry size @16. An entry: source name @0 (260),
/// units @260 (260), value @1300 (f32).
fn afterburner() -> Option<f32> {
    let m = mapped("MAHMSharedMemory", 8 << 20)?;
    let sig = m.get(0..4)?;
    if sig != b"MHAM" && sig != b"MAHM" {
        return None;
    }
    let (head, count, size) = (u32_at(&m, 8)? as usize, u32_at(&m, 12)? as usize, u32_at(&m, 16)? as usize);
    if size < 1304 {
        return None;
    }
    let entries: Vec<(String, f32)> = (0..count.min(4096))
        .filter_map(|i| {
            let at = head.checked_add(i.checked_mul(size)?)?;
            let name = text_at(&m, at, 260)?;
            let units = text_at(&m, at + 260, 260)?;
            let mut value = f32_at(&m, at + 1300)?;
            if units.ends_with('F') {
                value = (value - 32.0) * 5.0 / 9.0;
            }
            Some((name, value))
        })
        .collect();
    preferred(entries.iter().cloned(), &["CPU temperature"]).or_else(|| {
        entries
            .iter()
            .filter(|(name, t)| name.starts_with("CPU") && name.ends_with(" temperature") && SANE.contains(t))
            .map(|(_, t)| *t)
            .reduce(f32::max)
    })
}

/// AIDA64 (Preferences, External Applications, shared memory): sensor values as text, like
/// `<temp><id>TCPUPKG</id><label>CPU Package</label><value>42</value></temp>`.
fn aida64() -> Option<f32> {
    let m = mapped("AIDA64_SensorValues", 1 << 20)?;
    let text = String::from_utf8_lossy(&m[..m.iter().position(|&b| b == 0).unwrap_or(m.len())]).to_string();
    ["TCPUPKG", "TCPU", "TCPUDIO"].iter().find_map(|id| {
        let start = text.find(&format!("<id>{id}</id>"))?;
        let rest = &text[start..];
        let value = rest.split("<value>").nth(1)?.split("</value>").next()?;
        value.trim().replace(',', ".").parse::<f32>().ok()
    })
}

// ---------------------------------------------------------------------------------------------
// WMI (LibreHardwareMonitor, OpenHardwareMonitor)
// ---------------------------------------------------------------------------------------------

/// The processor's temperature sensors of a hardware monitor's WMI namespace (class Sensor: Name, Value,
/// Identifier like "/intelcpu/0/temperature/6"); None when the program does not run.
fn wmi_monitor(namespace: &str) -> Option<f32> {
    // SAFETY: COM is set up for this call on this thread and left as it was; every object is released by Drop.
    unsafe {
        let init = CoInitializeEx(None, COINIT_MULTITHREADED);
        let result = query_sensors(namespace);
        if init.is_ok() {
            CoUninitialize();
        }
        result
    }
}

unsafe fn query_sensors(namespace: &str) -> Option<f32> {
    let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER).ok()?;
    let empty = BSTR::new();
    let services = locator.ConnectServer(&BSTR::from(namespace), &empty, &empty, &empty, 0, &empty, None).ok()?;
    // RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE.
    CoSetProxyBlanket(&services, 10, 0, PCWSTR::null(), RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, None, EOAC_NONE).ok()?;
    let query = BSTR::from("SELECT Name, Value, Identifier FROM Sensor WHERE SensorType = 'Temperature'");
    let rows = services
        .ExecQuery(&BSTR::from("WQL"), &query, WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, None)
        .ok()?;
    let mut cpu: Vec<(String, f32)> = Vec::new();
    for _ in 0..512 {
        let mut row = [None];
        let mut returned = 0u32;
        let _ = rows.Next(WBEM_INFINITE, &mut row, &mut returned);
        let Some(obj) = row[0].take().filter(|_| returned == 1) else { break };
        let id = text_of(&obj, "Identifier").unwrap_or_default();
        if !(id.starts_with("/intelcpu/") || id.starts_with("/amdcpu/")) {
            continue;
        }
        if let (Some(name), Some(value)) = (text_of(&obj, "Name"), number_of(&obj, "Value")) {
            cpu.push((name, value));
        }
    }
    preferred(
        cpu.iter().cloned(),
        &["CPU Package", "Core (Tctl/Tdie)", "Core (Tctl)", "Core (Tdie)", "Core Max", "Core Average"],
    )
    .or_else(|| cpu.iter().filter(|(_, t)| SANE.contains(t)).map(|(_, t)| *t).reduce(f32::max))
}

/// A property of a WMI object as text or as a number.
unsafe fn property(obj: &IWbemClassObject, name: &str) -> Option<VARIANT> {
    let wide = HSTRING::from(name);
    let mut value = VARIANT::default();
    obj.Get(PCWSTR(wide.as_ptr()), 0, &mut value, None, None).ok()?;
    Some(value)
}

unsafe fn text_of(obj: &IWbemClassObject, name: &str) -> Option<String> {
    let mut v = property(obj, name)?;
    let inner = &v.Anonymous.Anonymous;
    let text = (inner.vt == VT_BSTR).then(|| inner.Anonymous.bstrVal.to_string());
    let _ = VariantClear(&mut v);
    text
}

unsafe fn number_of(obj: &IWbemClassObject, name: &str) -> Option<f32> {
    let mut v = property(obj, name)?;
    let inner = &v.Anonymous.Anonymous;
    let number = if inner.vt == VT_R4 {
        Some(inner.Anonymous.fltVal)
    } else if inner.vt == VT_R8 {
        Some(inner.Anonymous.dblVal as f32)
    } else {
        None
    };
    let _ = VariantClear(&mut v);
    number
}
