// «Нагрузка»: polls get_perf (src-tauri/src/perf.rs) for the widget and its settings preview. Every 1, 2 or 5 s as
// chosen (2 by default), no more than every 5 s on Windows battery saver, and never while the window is hidden (a
// hidden or switched-off widget asks nothing). The processor load is a difference of two readings, so the very first one is followed by a second
// one after FIRST_FOLLOW_UP instead of a full interval.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePowerSaver } from "./useSystemInfo";

/** Mirrors `PerfInfo` in src-tauri/src/perf.rs; null = this PC does not report it (or not yet). */
export interface PerfInfo {
  cpu: number | null;
  ram: number | null;
  /** GiB. */
  ramUsed: number;
  ramTotal: number;
  gpu: number | null;
  disk: number | null;
  /** °C. */
  cpuTemp: number | null;
  gpuTemp: number | null;
  /** Where the processor temperature came from: "windows" or a hardware monitor ("hwinfo", ...). */
  cpuTempSource: string | null;
}

/** The readings as the widget draws them (whole percents and degrees): an equal one draws nothing. */
const drawn = (p: PerfInfo) =>
  [p.cpu, p.gpu, p.ram, p.disk, p.cpuTemp, p.gpuTemp].map((v) => (v === null ? "-" : Math.round(v))).join(",");

const INTERVAL_SAVER = 5_000;
const FIRST_FOLLOW_UP = 600;

/**
 * Latest reading; null before the first one. `active` false stops polling (a preview scrolled out of view);
 * `seconds` between readings.
 */
export function usePerf(active = true, seconds = 2): PerfInfo | null {
  const saver = usePowerSaver();
  const [info, setInfo] = useState<PerfInfo | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer = 0;
    let first = true;
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, ms);
    };
    const tick = async () => {
      timer = 0;
      if (document.hidden) return;
      try {
        const next = await invoke<PerfInfo>("get_perf");
        if (alive) setInfo((prev) => (prev && drawn(prev) === drawn(next) ? prev : next));
      } catch {
        /* keep the last reading */
      }
      if (!alive || document.hidden) return;
      schedule(first ? FIRST_FOLLOW_UP : saver ? Math.max(INTERVAL_SAVER, seconds * 1000) : seconds * 1000);
      first = false;
    };
    // Hidden: no timer at all. Shown again: read at once.
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = 0;
      } else if (!timer) {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, saver, seconds]);

  return info;
}
