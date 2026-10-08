// Settings → «Нагрузка»: live preview with this computer's readings, the view and the background, which readings
// to show, the temperatures, section reset. The preview polls only while it is on screen.
import { useLayoutEffect, useRef, useState } from "react";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.perf";
import { settings, type PerfMode, type PerfSettings } from "../lib/settings";
import { usePerf } from "../lib/usePerf";
import { useSettings } from "../lib/useSettings";
import { PERF_MODES, PerfView } from "../tiles/Perf";

const x = extra;
const MODE_OPTIONS: readonly SegmentedOption<PerfMode>[] = PERF_MODES.map((m) => ({ value: m, label: x.modes[m] }));
const METRICS = ["cpu", "gpu", "ram", "disk"] as const;

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
  const info = usePerf(onScreen);
  const update = (p: Partial<PerfSettings>) => void settings.updatePerf(p);

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
      </Section>

      <ResetSection section="perf" />
    </Page>
  );
}
