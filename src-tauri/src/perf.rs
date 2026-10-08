//! «Нагрузка»: the load of the processor, the memory, the graphics and the disks, and the temperatures Windows
//! gives without admin rights. Read only when the widget asks (every 2 s while it is shown, 5 s on battery saver)
//! from sources that cost microseconds: GlobalMemoryStatusEx (memory), one PDH query (the processor utility and
//! the GPU engines the way Task Manager shows them, the busy time of each disk, ACPI thermal zones; GetSystemTimes
//! for the processor where that counter is missing) and the adapters' D3DKMT performance data (GPU temperature,
//! Task Manager's own source). Nothing runs between requests.
//!
//! Processor temperature: Windows has no driver-free way to the cores' sensors (a driver would need admin rights
//! and is a known attack surface). ACPI thermal zones are what it does give; on many desktops a zone is a fixed
//! placeholder (27.85 °C), so a zone counts only once its value has changed: a laptop's real sensor shows up
//! within seconds, a desktop's placeholder never does, and the widget then shows no processor temperature.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use windows::core::{w, PCWSTR};
use windows::Wdk::Graphics::Direct3D::{
    D3DKMTCloseAdapter, D3DKMTEnumAdapters2, D3DKMTQueryAdapterInfo, D3DKMT_ADAPTERINFO, D3DKMT_ADAPTER_PERFDATA,
    D3DKMT_CLOSEADAPTER, D3DKMT_ENUMADAPTERS2, D3DKMT_QUERYADAPTERINFO, KMTQAITYPE_ADAPTERPERFDATA,
};
use windows::Win32::Foundation::FILETIME;
use windows::Win32::System::Performance::{
    PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W,
    PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY, PDH_MORE_DATA,
};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::GetSystemTimes;

/// What the widget shows; a value it cannot get on this PC is None and its row stays hidden.
#[derive(Serialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerfInfo {
    /// Processor load as Task Manager shows it (0..100); None on the very first reading.
    pub cpu: Option<f32>,
    pub ram: Option<f32>,
    /// Memory in use and installed, GiB.
    pub ram_used: f32,
    pub ram_total: f32,
    /// The busiest GPU engine, like Task Manager's GPU column.
    pub gpu: Option<f32>,
    /// Active time of the busiest physical disk.
    pub disk: Option<f32>,
    /// °C.
    pub cpu_temp: Option<f32>,
    pub gpu_temp: Option<f32>,
}

/// PDH handles are plain pointers; they live (and are used under the mutex) as long as the process.
struct Sampler {
    query: isize,
    /// «% Processor Utility»: Task Manager's processor number (it counts the clock speed too, so under turbo it is
    /// higher than the plain share of busy time).
    utility: Option<isize>,
    gpu: Option<isize>,
    disk: Option<isize>,
    /// The thermal zone counter and its unit: tenths of a kelvin («High Precision») or kelvins.
    thermal: Option<(isize, f64)>,
    /// Per zone: its first value and whether it has changed since (a live sensor).
    zones: HashMap<String, (f64, bool)>,
    cpu_prev: Option<(u64, u64)>,
    /// D3DKMT adapter handles that report a temperature.
    adapters: Vec<u32>,
}

static SAMPLER: Mutex<Option<Sampler>> = Mutex::new(None);

#[tauri::command]
pub async fn get_perf() -> PerfInfo {
    tauri::async_runtime::spawn_blocking(|| {
        let mut guard = SAMPLER.lock().unwrap_or_else(|e| e.into_inner());
        guard.get_or_insert_with(Sampler::new).read()
    })
    .await
    .unwrap_or_default()
}

fn add_counter(query: PDH_HQUERY, path: PCWSTR) -> Option<isize> {
    let mut counter = PDH_HCOUNTER::default();
    // SAFETY: a valid open query and a NUL-terminated literal path.
    let status = unsafe { PdhAddEnglishCounterW(query, path, 0, &mut counter) };
    (status == 0).then_some(counter.0 as isize)
}

/// Every instance of a wildcard counter as (instance name, value); empty while the data is not ready (a rate
/// counter needs two collections) or the counter does not exist here.
fn read_array(counter: isize) -> Vec<(String, f64)> {
    let handle = PDH_HCOUNTER(counter as *mut core::ffi::c_void);
    let (mut size, mut count) = (0u32, 0u32);
    // SAFETY: the first call only asks for the buffer size.
    let status = unsafe { PdhGetFormattedCounterArrayW(handle, PDH_FMT_DOUBLE, &mut size, &mut count, None) };
    if status != PDH_MORE_DATA || size == 0 {
        return Vec::new();
    }
    // u64 cells keep the items 8-byte aligned.
    let mut buf = vec![0u64; (size as usize).div_ceil(8)];
    let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
    // SAFETY: the buffer holds `size` bytes, as PDH asked for.
    let status = unsafe { PdhGetFormattedCounterArrayW(handle, PDH_FMT_DOUBLE, &mut size, &mut count, Some(items)) };
    if status != 0 {
        return Vec::new();
    }
    // SAFETY: PDH wrote `count` items into the buffer; their names point into the same buffer.
    let items = unsafe { std::slice::from_raw_parts(items, count as usize) };
    items
        .iter()
        // CStatus 0 (valid) or 1 (new data): anything else is no reading.
        .filter(|it| it.FmtValue.CStatus <= 1)
        .map(|it| unsafe { (it.szName.to_string().unwrap_or_default(), it.FmtValue.Anonymous.doubleValue) })
        .collect()
}

impl Sampler {
    fn new() -> Self {
        let mut query = PDH_HQUERY::default();
        // SAFETY: opens a real-time query owned by this sampler.
        let opened = unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) } == 0;
        let (utility, gpu, disk, thermal) = if opened {
            (
                add_counter(query, w!("\\Processor Information(_Total)\\% Processor Utility")),
                add_counter(query, w!("\\GPU Engine(*)\\Utilization Percentage")),
                add_counter(query, w!("\\PhysicalDisk(*)\\% Idle Time")),
                add_counter(query, w!("\\Thermal Zone Information(*)\\High Precision Temperature"))
                    .map(|c| (c, 10.0))
                    .or_else(|| add_counter(query, w!("\\Thermal Zone Information(*)\\Temperature")).map(|c| (c, 1.0))),
            )
        } else {
            (None, None, None, None)
        };
        Sampler {
            query: if opened { query.0 as isize } else { 0 },
            utility,
            gpu,
            disk,
            thermal,
            zones: HashMap::new(),
            cpu_prev: None,
            adapters: open_adapters(),
        }
    }

    fn read(&mut self) -> PerfInfo {
        let mut info = PerfInfo { cpu: self.cpu(), ..PerfInfo::default() };
        memory(&mut info);
        if self.query != 0 {
            // SAFETY: the query this sampler opened.
            unsafe { PdhCollectQueryData(PDH_HQUERY(self.query as *mut core::ffi::c_void)) };
            if let Some(&(_, v)) = self.utility.map(read_array).as_deref().and_then(|items| items.first()) {
                info.cpu = Some(v.clamp(0.0, 100.0) as f32);
            }
            info.gpu = self.gpu.map(read_array).and_then(|items| gpu_load(&items));
            info.disk = self.disk.map(read_array).and_then(|items| disk_busy(&items));
            if let Some((counter, unit)) = self.thermal {
                info.cpu_temp = self.cpu_temp(&read_array(counter), unit);
            }
        }
        info.gpu_temp = self.adapters.iter().filter_map(|&h| adapter_temp(h)).reduce(f32::max);
        info
    }

    fn cpu(&mut self) -> Option<f32> {
        let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
        // SAFETY: three out-parameters on the stack.
        unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.ok()?;
        let t = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
        // Kernel time includes the idle time.
        let (idle, total) = (t(idle), t(kernel) + t(user));
        let prev = self.cpu_prev.replace((idle, total))?;
        let (di, dt) = (idle.saturating_sub(prev.0), total.saturating_sub(prev.1));
        (dt > 0).then(|| ((1.0 - di as f64 / dt as f64) * 100.0).clamp(0.0, 100.0) as f32)
    }

    fn cpu_temp(&mut self, items: &[(String, f64)], unit: f64) -> Option<f32> {
        let mut hottest: Option<f64> = None;
        for (zone, raw) in items {
            let celsius = raw / unit - 273.15;
            if !(5.0..=125.0).contains(&celsius) {
                continue;
            }
            let state = self.zones.entry(zone.clone()).or_insert((celsius, false));
            if !state.1 && (celsius - state.0).abs() >= 0.05 {
                state.1 = true;
            }
            if state.1 {
                hottest = Some(hottest.map_or(celsius, |h| h.max(celsius)));
            }
        }
        hottest.map(|c| c as f32)
    }
}

fn memory(info: &mut PerfInfo) {
    let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    // SAFETY: dwLength is set as the API requires.
    if unsafe { GlobalMemoryStatusEx(&mut m) }.is_ok() && m.ullTotalPhys > 0 {
        let gib = |b: u64| (b as f64 / 1_073_741_824.0) as f32;
        let used = m.ullTotalPhys.saturating_sub(m.ullAvailPhys);
        info.ram = Some((used as f64 / m.ullTotalPhys as f64 * 100.0) as f32);
        info.ram_used = gib(used);
        info.ram_total = gib(m.ullTotalPhys);
    }
}

/// GPU load like Task Manager: the processes' shares of each engine added up, the busiest engine wins.
/// Instance names read "pid_1234_luid_0x0_0xD1F8_phys_0_eng_0_engtype_3D"; the engine is the part from "luid".
fn gpu_load(items: &[(String, f64)]) -> Option<f32> {
    let mut engines: HashMap<&str, f64> = HashMap::new();
    for (name, value) in items {
        let engine = name.find("luid").map_or(name.as_str(), |i| &name[i..]);
        *engines.entry(engine).or_default() += value;
    }
    engines.into_values().reduce(f64::max).map(|v| v.clamp(0.0, 100.0) as f32)
}

/// Active time of the busiest physical disk (100 minus its idle time); `_Total` averages them, so it is skipped.
fn disk_busy(items: &[(String, f64)]) -> Option<f32> {
    items
        .iter()
        .filter(|(name, _)| name != "_Total")
        .map(|(_, idle)| (100.0 - idle).clamp(0.0, 100.0))
        .reduce(f64::max)
        .map(|v| v as f32)
}

/// The graphics adapters that report a temperature (integrated ones usually do not; those are closed again).
fn open_adapters() -> Vec<u32> {
    let mut list = D3DKMT_ENUMADAPTERS2::default();
    // SAFETY: the first call only counts the adapters.
    if unsafe { D3DKMTEnumAdapters2(&mut list) }.is_err() || list.NumAdapters == 0 {
        return Vec::new();
    }
    let mut infos = vec![D3DKMT_ADAPTERINFO::default(); list.NumAdapters as usize];
    list.pAdapters = infos.as_mut_ptr();
    // SAFETY: room for NumAdapters entries.
    if unsafe { D3DKMTEnumAdapters2(&mut list) }.is_err() {
        return Vec::new();
    }
    infos.truncate(list.NumAdapters as usize);
    let mut keep = Vec::new();
    for info in infos {
        if adapter_temp(info.hAdapter).is_some() {
            keep.push(info.hAdapter);
        } else {
            // SAFETY: a handle this function opened through the enumeration.
            unsafe {
                let _ = D3DKMTCloseAdapter(&D3DKMT_CLOSEADAPTER { hAdapter: info.hAdapter });
            }
        }
    }
    keep
}

/// The adapter's temperature in °C (its driver reports tenths of a degree); None when it reports none.
fn adapter_temp(adapter: u32) -> Option<f32> {
    let mut data = D3DKMT_ADAPTER_PERFDATA::default();
    let mut query = D3DKMT_QUERYADAPTERINFO {
        hAdapter: adapter,
        Type: KMTQAITYPE_ADAPTERPERFDATA,
        pPrivateDriverData: &mut data as *mut D3DKMT_ADAPTER_PERFDATA as *mut core::ffi::c_void,
        PrivateDriverDataSize: std::mem::size_of::<D3DKMT_ADAPTER_PERFDATA>() as u32,
    };
    // SAFETY: the query points at a correctly sized output structure on the stack.
    if unsafe { D3DKMTQueryAdapterInfo(&mut query) }.is_err() {
        return None;
    }
    let celsius = data.Temperature as f32 / 10.0;
    (5.0..=125.0).contains(&celsius).then_some(celsius)
}
