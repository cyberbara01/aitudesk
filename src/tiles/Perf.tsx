// «Нагрузка»: processor, graphics, memory and disk load, with the processor and graphics temperatures
// (src-tauri/src/perf.rs, polled by usePerf). Three views (rings, bars, numbers); a click on the widget switches
// to the next one. Only what this PC reports is shown: no graphics row without a GPU counter, no processor
// temperature where Windows gives none. Above 90 % a reading takes the critical colour.
import type { CSSProperties } from "react";
import { Tile } from "../components/Tile";
import { Tooltip } from "../components/Tooltip";
import { extra } from "../i18n/ru.extra.perf";
import { settings, type PerfMode, type PerfSettings } from "../lib/settings";
import { useDesktopCovered } from "../lib/desktopCovered";
import { useFolded } from "../lib/tileView";
import { usePerf, type PerfInfo } from "../lib/usePerf";
import { useSettings } from "../lib/useSettings";

const x = extra;

type Metric = "cpu" | "gpu" | "ram" | "disk";
const ORDER: readonly Metric[] = ["cpu", "gpu", "ram", "disk"];
export const PERF_MODES: readonly PerfMode[] = ["rings", "bars", "numbers"];

interface Reading {
  id: Metric;
  value: number;
  temp: number | null;
}

function readings(info: PerfInfo | null, s: PerfSettings): Reading[] {
  if (!info) return [];
  const out: Reading[] = [];
  for (const id of ORDER) {
    const value = info[id];
    if (!s[id] || value === null) continue;
    const temp = !s.temp ? null : id === "cpu" ? info.cpuTemp : id === "gpu" ? info.gpuTemp : null;
    out.push({ id, value, temp });
  }
  return out;
}

const level = (v: number) => (v >= 90 ? "high" : undefined);

/** One reading's ring: the share as an arc, the number in the middle, the name and temperature under it. */
function Ring({ r }: { r: Reading }) {
  return (
    <div className="perf-ring" data-level={level(r.value)}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="perf-ring-track" cx="24" cy="24" r="20" />
        <circle className="perf-ring-arc" cx="24" cy="24" r="20" pathLength="100" style={{ "--v": r.value } as CSSProperties} />
      </svg>
      <span className="perf-ring-value">{Math.round(r.value)}</span>
      <span className="perf-label">
        {x.short[r.id]}
        {r.temp !== null && <span className="perf-temp">{x.degrees(r.temp)}</span>}
      </span>
    </div>
  );
}

function Bar({ r }: { r: Reading }) {
  return (
    <div className="perf-bar" data-level={level(r.value)}>
      <span className="perf-label">{x.short[r.id]}</span>
      <span className="perf-track">
        <span className="perf-fill" style={{ "--v": r.value } as CSSProperties} />
      </span>
      <span className="perf-value">{x.percent(r.value)}</span>
      <span className="perf-temp">{r.temp !== null ? x.degrees(r.temp) : ""}</span>
    </div>
  );
}

function Num({ r }: { r: Reading }) {
  return (
    <div className="perf-num" data-level={level(r.value)}>
      <span className="perf-num-value">{x.percent(r.value)}</span>
      <span className="perf-label">
        {x.short[r.id]}
        {r.temp !== null && <span className="perf-temp">{x.degrees(r.temp)}</span>}
      </span>
    </div>
  );
}

/** The readings in one of the three views; shared by the widget and the live preview on its settings page. */
export function PerfView({ info, settings: s, mode }: { info: PerfInfo | null; settings: PerfSettings; mode: PerfMode }) {
  const rs = readings(info, s);
  if (rs.length === 0) return <div className="perf-empty caption">{x.waiting}</div>;
  if (mode === "rings") {
    return <div className="perf perf-rings">{rs.map((r) => <Ring key={r.id} r={r} />)}</div>;
  }
  if (mode === "bars") {
    return <div className="perf perf-bars">{rs.map((r) => <Bar key={r.id} r={r} />)}</div>;
  }
  return <div className="perf perf-numbers">{rs.map((r) => <Num key={r.id} r={r} />)}</div>;
}

export const nextPerfMode = (mode: PerfMode): PerfMode => PERF_MODES[(PERF_MODES.indexOf(mode) + 1) % PERF_MODES.length];

export function PerfTile() {
  const s = useSettings().perf;
  // Folded to its icon, or with a program over the whole screen, nothing is read.
  const folded = useFolded();
  const covered = useDesktopCovered();
  const info = usePerf(!folded && !covered);
  return (
    <Tile label="perf" className="tile-perf" background={s.background}>
      <Tooltip text={x.cycleHint} className="perf-hit">
        <div className="perf-click" onClick={() => void settings.updatePerf({ mode: nextPerfMode(s.mode) })}>
          <PerfView info={info} settings={s} mode={s.mode} />
        </div>
      </Tooltip>
    </Tile>
  );
}
