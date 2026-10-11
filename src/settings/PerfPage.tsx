// Settings → «Нагрузка»: live preview with this computer's readings; the look (view, colour, thickness, labels,
// the red threshold, background); which readings to show and the temperatures (with where the processor's comes
// from); how often to read; section reset. The preview polls only while it is on screen.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { TextField } from "../components/TextField";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.perf";
import {
  PERF_ALERTS,
  PERF_INTERVAL_MAX,
  PERF_INTERVAL_MIN,
  settings,
  type PerfColor,
  type PerfMode,
  type PerfSettings,
  type PerfThickness,
} from "../lib/settings";
import { widgetInk } from "../lib/ink";
import { usePerf, type PerfInfo } from "../lib/usePerf";
import { useSettings } from "../lib/useSettings";
import { PERF_MODES, PerfView } from "../tiles/Perf";
import { InkWidgetSection } from "./InkSection";

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
  label: a === 0 ? x.alertOff : x.percent(a),
}));
const UNIT_OPTIONS: readonly SegmentedOption<"c" | "f">[] = [
  { value: "c", label: x.unitOptions.c },
  { value: "f", label: x.unitOptions.f },
];
const METRICS = ["cpu", "gpu", "ram", "disk"] as const;

/**
 * «Как часто»: any whole number of seconds, typed in. The field keeps what is typed; a valid number is saved at once,
 * anything else is put back to the saved value when the field is left.
 */
function IntervalField({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const parse = (text: string) => {
    const n = Number(text.trim().replace(",", "."));
    return Number.isFinite(n) && n >= PERF_INTERVAL_MIN && n <= PERF_INTERVAL_MAX ? Math.round(n) : null;
  };
  const invalid = parse(draft) === null;
  return (
    <TextField
      value={draft}
      onChange={(text) => {
        setDraft(text);
        const n = parse(text);
        if (n !== null && n !== value) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
      type="number"
      min={PERF_INTERVAL_MIN}
      max={PERF_INTERVAL_MAX}
      step={1}
      suffix={x.secondsUnit}
      error={invalid ? x.intervalInvalid(PERF_INTERVAL_MIN, PERF_INTERVAL_MAX) : undefined}
      ariaLabel={x.interval}
      className="perf-interval"
    />
  );
}

/** Where the processor temperature comes from, or how to get it. */
function cpuTempText(info: PerfInfo | null): string {
  if (!info) return x.cpuTempWaiting;
  const src = info.cpuTempSource;
  if (info.cpuTemp === null || !src) return x.cpuTempNone;
  if (src === "windows") return x.cpuTempWindows;
  return x.cpuTempFrom((x.sources as Record<string, string>)[src] ?? src);
}

export function PerfPage() {
  const all = useSettings();
  const s = all.perf;
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
          <div className={s.background ? "tile tile-perf" : "tile tile-perf no-bg"} {...widgetInk(all, "perf")}>
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
          <IntervalField value={s.interval} onChange={(interval) => update({ interval })} />
        </Row>
      </Section>

      <InkWidgetSection widget="perf" />

      <ResetSection section="perf" />
    </Page>
  );
}
