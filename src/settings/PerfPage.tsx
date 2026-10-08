// Settings → «Нагрузка»: live preview with this computer's readings; the look (view, colour, thickness, labels,
// the red threshold, background); which readings to show and the temperatures (with where the processor's comes
// from); how often to read; section reset. The preview polls only while it is on screen.
import { useLayoutEffect, useRef, useState } from "react";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.perf";
import {
  PERF_ALERTS,
  PERF_INTERVALS,
  settings,
  type PerfColor,
  type PerfMode,
  type PerfSettings,
  type PerfThickness,
} from "../lib/settings";
import { usePerf, type PerfInfo } from "../lib/usePerf";
import { useSettings } from "../lib/useSettings";
import { PERF_MODES, PerfView } from "../tiles/Perf";

const x = extra;
const MODE_OPTIONS: readonly SegmentedOption<PerfMode>[] = PERF_MODES.map((m) => ({ value: m, label: x.modes[m] }));
const COLOR_OPTIONS: readonly SegmentedOption<PerfColor>[] = (["accent", "load", "metric"] as const).map((c) => ({
  value: c,
  label: x.colors[c],
}));
const THICKNESS_OPTIONS: readonly SegmentedOption<PerfThickness>[] = (["thin", "normal", "thick"] as const).map((t) => ({
  value: t,
  label: x.thicknesses[t],
}));
const ALERT_OPTIONS: readonly SegmentedOption<string>[] = PERF_ALERTS.map((a) => ({
  value: String(a),
  label: a === 0 ? x.alertOff : `${a}${String.fromCharCode(0x202f)}%`,
}));
const INTERVAL_OPTIONS: readonly SegmentedOption<string>[] = PERF_INTERVALS.map((n) => ({ value: String(n), label: x.seconds(n) }));
const UNIT_OPTIONS: readonly SegmentedOption<"c" | "f">[] = [
  { value: "c", label: x.unitOptions.c },
  { value: "f", label: x.unitOptions.f },
];
const METRICS = ["cpu", "gpu", "ram", "disk"] as const;

/** Where the processor temperature comes from, or how to get it. */
function cpuTempText(info: PerfInfo | null): string {
  if (!info) return x.cpuTempWaiting;
  const src = info.cpuTempSource;
  if (info.cpuTemp === null || !src) return x.cpuTempNone;
  if (src === "windows") return x.cpuTempWindows;
  return x.cpuTempFrom((x.sources as Record<string, string>)[src] ?? src);
}

export function PerfPage() {
  const s = useSettings().perf;
  const deskRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(desk);
    return () => io.disconnect();
  }, []);
  const info = usePerf(onScreen, s.interval);
  const update = (p: Partial<PerfSettings>) => void settings.updatePerf(p);
  const shapes = s.mode === "rings" || s.mode === "bars" || s.mode === "line";

  return (
    <Page title={ru.settings.nav.perf} description={x.pageDesc}>
      <div className="sys-stage">
        <div className="sys-stage-head">
          <span className="body-strong">{ru.common.preview}</span>
        </div>
        <div ref={deskRef} className="sys-desk">
          <div className={s.background ? "tile tile-perf" : "tile tile-perf no-bg"}>
            <PerfView info={info} settings={s} mode={s.mode} />
          </div>
        </div>
        <p className="hint sys-stage-hint">{x.previewHint}</p>
      </div>

      <Section title={x.look}>
        <Row label={x.view} hint={x.viewHint}>
          <Segmented options={MODE_OPTIONS} value={s.mode} onChange={(mode) => update({ mode })} ariaLabel={x.view} />
        </Row>
        <Row label={x.color} hint={x.colorHint}>
          <Segmented options={COLOR_OPTIONS} value={s.color} onChange={(color) => update({ color })} ariaLabel={x.color} />
        </Row>
        {shapes && (
          <Row label={x.thickness} hint={x.thicknessHint}>
            <Segmented options={THICKNESS_OPTIONS} value={s.thickness} onChange={(thickness) => update({ thickness })} ariaLabel={x.thickness} />
          </Row>
        )}
        <Row label={x.labels} hint={x.labelsHint}>
          <Switch checked={s.labels} onChange={(labels) => update({ labels })} ariaLabel={x.labels} />
        </Row>
        <Row label={x.alert} hint={x.alertHint}>
          <Segmented
            options={ALERT_OPTIONS}
            value={String(s.alert)}
            onChange={(v) => update({ alert: PERF_ALERTS.find((a) => String(a) === v) ?? 90 })}
            ariaLabel={x.alert}
          />
        </Row>
        <Row label={ru.settings.system.background} hint={x.backgroundHint}>
          <Switch checked={s.background} onChange={(v) => update({ background: v })} ariaLabel={ru.settings.system.background} />
        </Row>
      </Section>

      <Section title={x.metrics} description={x.metricsHint}>
        {METRICS.map((id) => (
          <Row key={id} label={x.full[id]} hint={x.hints[id]}>
            <Switch checked={s[id]} onChange={(v) => update({ [id]: v })} ariaLabel={x.full[id]} />
          </Row>
        ))}
        <Row label={x.temp} hint={x.tempHint}>
          <Switch checked={s.temp} onChange={(v) => update({ temp: v })} ariaLabel={x.temp} />
        </Row>
        {s.temp && (
          <>
            <Row label={x.cpuTemp} hint={cpuTempText(info)} />
            <Row label={x.units}>
              <Segmented
                options={UNIT_OPTIONS}
                value={s.fahrenheit ? "f" : "c"}
                onChange={(u) => update({ fahrenheit: u === "f" })}
                ariaLabel={x.units}
              />
            </Row>
          </>
        )}
      </Section>

      <Section title={x.update}>
        <Row label={x.interval} hint={x.intervalHint}>
          <Segmented
            options={INTERVAL_OPTIONS}
            value={String(s.interval)}
            onChange={(v) => update({ interval: PERF_INTERVALS.find((n) => String(n) === v) ?? 2 })}
            ariaLabel={x.interval}
          />
        </Row>
      </Section>

      <ResetSection section="perf" />
    </Page>
  );
}
