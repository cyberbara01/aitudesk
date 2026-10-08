// «Нагрузка»: processor, graphics, memory and disk load, with the processor and graphics temperatures
// (src-tauri/src/perf.rs, polled by usePerf). Four views (rings, bars, numbers, one line); a click on the widget
// switches to the next one. Only what this PC reports is shown: no graphics row without a GPU counter, no processor
// temperature where neither Windows nor a hardware monitor gives one. Colour: the accent, by load or one per
// reading; from the alert threshold a reading turns red.
import type { CSSProperties } from "react";
import { Tile, type Grow } from "../components/Tile";
import { Tooltip } from "../components/Tooltip";
import { extra } from "../i18n/ru.extra.perf";
import { useDesktopCovered } from "../lib/desktopCovered";
import { settings, type PerfMode, type PerfSettings } from "../lib/settings";
import { useFolded } from "../lib/tileView";
import { usePerf, type PerfInfo } from "../lib/usePerf";
import { useSettings } from "../lib/useSettings";

const x = extra;

type Metric = "cpu" | "gpu" | "ram" | "disk";
const ORDER: readonly Metric[] = ["cpu", "gpu", "ram", "disk"];
export const PERF_MODES: readonly PerfMode[] = ["rings", "bars", "numbers", "line"];

interface Reading {
  id: Metric;
  value: number;
  temp: number | null;
}

/** At least one of the four readings is switched on. */
const anyReadingOn = (s: PerfSettings) => s.cpu || s.gpu || s.ram || s.disk;

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

/**
 * How loaded a reading looks: "high" (red) from the alert threshold in every colour mode; by load also "low"
 * (green) under half and "mid" (yellow) above it.
 */
function level(v: number, s: PerfSettings): "high" | "mid" | "low" | undefined {
  if (s.alert > 0 && v >= s.alert) return "high";
  if (s.color !== "load") return undefined;
  return v < 50 ? "low" : "mid";
}

/** The name, then the temperature when there is one. */
function Label({ r, s }: { r: Reading; s: PerfSettings }) {
  if (!s.labels && r.temp === null) return null;
  return (
    <span className="perf-label">
      {s.labels && <span className="perf-name">{x.short[r.id]}</span>}
      {r.temp !== null && <span className="perf-temp">{x.degrees(r.temp, s.fahrenheit)}</span>}
    </span>
  );
}

/** One reading's ring: the share as an arc, the number in the middle, the name and temperature under it. */
function Ring({ r, s }: { r: Reading; s: PerfSettings }) {
  return (
    <div className="perf-ring" data-metric={r.id} data-level={level(r.value, s)}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="perf-ring-track" cx="24" cy="24" r="20" />
        <circle className="perf-ring-arc" cx="24" cy="24" r="20" pathLength="100" style={{ "--v": r.value } as CSSProperties} />
      </svg>
      <span className="perf-ring-value">{Math.round(r.value)}</span>
      <Label r={r} s={s} />
    </div>
  );
}

function Bar({ r, s }: { r: Reading; s: PerfSettings }) {
  return (
    <div className="perf-bar" data-metric={r.id} data-level={level(r.value, s)}>
      {s.labels && <span className="perf-label perf-name">{x.short[r.id]}</span>}
      <span className="perf-track">
        <span className="perf-fill" style={{ "--v": r.value } as CSSProperties} />
      </span>
      <span className="perf-value">{x.percent(r.value)}</span>
      <span className="perf-temp">{r.temp !== null ? x.degrees(r.temp, s.fahrenheit) : ""}</span>
    </div>
  );
}

function Num({ r, s }: { r: Reading; s: PerfSettings }) {
  return (
    <div className="perf-num" data-metric={r.id} data-level={level(r.value, s)}>
      <span className="perf-num-value">{x.percent(r.value)}</span>
      <Label r={r} s={s} />
    </div>
  );
}

/** One line: a dot in the reading's colour, its name, value and temperature. */
function Item({ r, s }: { r: Reading; s: PerfSettings }) {
  return (
    <span className="perf-item" data-metric={r.id} data-level={level(r.value, s)}>
      <span className="perf-dot" aria-hidden="true" />
      {s.labels && <span className="perf-name">{x.short[r.id]}</span>}
      <span className="perf-value">{x.percent(r.value)}</span>
      {r.temp !== null && <span className="perf-temp">{x.degrees(r.temp, s.fahrenheit)}</span>}
    </span>
  );
}

/** The readings in one of the four views; shared by the widget and the live preview on its settings page. */
export function PerfView({ info, settings: s, mode }: { info: PerfInfo | null; settings: PerfSettings; mode: PerfMode }) {
  const rs = readings(info, s);
  if (rs.length === 0) {
    const why = !anyReadingOn(s) ? x.allOff : info ? x.unavailable : x.waiting;
    return <div className="perf-empty caption">{why}</div>;
  }
  const look = { "data-color": s.color, "data-thickness": s.thickness };
  if (mode === "rings") {
    return (
      <div className="perf perf-rings" {...look}>
        {rs.map((r) => (
          <Ring key={r.id} r={r} s={s} />
        ))}
      </div>
    );
  }
  if (mode === "bars") {
    return (
      <div className={s.labels ? "perf perf-bars" : "perf perf-bars no-names"} {...look}>
        {rs.map((r) => (
          <Bar key={r.id} r={r} s={s} />
        ))}
      </div>
    );
  }
  if (mode === "line") {
    return (
      <div className="perf perf-line" {...look}>
        {rs.map((r) => (
          <Item key={r.id} r={r} s={s} />
        ))}
      </div>
    );
  }
  return (
    <div className="perf perf-numbers" {...look}>
      {rs.map((r) => (
        <Num key={r.id} r={r} s={s} />
      ))}
    </div>
  );
}

export const nextPerfMode = (mode: PerfMode): PerfMode => PERF_MODES[(PERF_MODES.indexOf(mode) + 1) % PERF_MODES.length];

/** Drawn for the default size (src-tauri/src/layout.rs); a bigger widget shows bigger rings, bars and figures. */
const GROW: Grow = { w: 280, h: 132 };

export function PerfTile() {
  const s = useSettings().perf;
  // Folded to its icon, with a program over the whole screen, or with every reading switched off, nothing is read.
  const folded = useFolded();
  const covered = useDesktopCovered();
  const info = usePerf(!folded && !covered && anyReadingOn(s), s.interval);
  return (
    <Tile label="perf" className="tile-perf" background={s.background} grow={GROW}>
      <Tooltip text={x.cycleHint} className="perf-hit">
        <div className="perf-click" onClick={() => void settings.updatePerf({ mode: nextPerfMode(s.mode) })}>
          <PerfView info={info} settings={s} mode={s.mode} />
        </div>
      </Tooltip>
    </Tile>
  );
}
