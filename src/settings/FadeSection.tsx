// «Прозрачность до наведения» (Оформление): every widget is see-through at rest and comes forward under the pointer,
// in its menu and while something is typed in it (src/components/Tile.tsx). The slider answers at once; the widgets
// on the desktop follow within LIVE_COMMIT_MS, and a value still pending is written when the page goes.
import { useCallback, useEffect, useRef, useState } from "react";
import { Row, Section } from "../components/Section";
import { Slider } from "../components/Slider";
import { Switch } from "../components/Switch";
import { extra } from "../i18n/ru.extra.shell";
import { formatPercent } from "../lib/clock";
import { FADE_MAX, FADE_MIN, settings, type FadeSettings } from "../lib/settings";

const f = extra.fade;
const LIVE_COMMIT_MS = 120;

export function FadeSection({ fade, mapOwn }: { fade: FadeSettings; mapOwn: boolean }) {
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef(0);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    const v = pending.current;
    pending.current = null;
    if (v === null) return;
    void settings.update((s) => ({ fade: { ...s.fade, opacity: v } })).finally(() => setDraft((d) => (d === v ? null : d)));
  }, []);
  useEffect(() => flush, [flush]);
  const opacity = draft ?? fade.opacity;
  const change = (v: number) => {
    setDraft(v);
    pending.current = v;
    if (!timer.current) timer.current = window.setTimeout(flush, LIVE_COMMIT_MS);
  };
  return (
    <Section title={f.title} description={f.desc}>
      <Row label={f.on} hint={mapOwn ? f.onHintMap : f.onHint}>
        <Switch
          checked={fade.enabled}
          onChange={(v) => void settings.update((s) => ({ fade: { ...s.fade, enabled: v } }))}
          ariaLabel={f.on}
        />
      </Row>
      {fade.enabled && (
        <Row label={f.opacity} hint={f.opacityHint}>
          <Slider
            className="map-opacity"
            min={FADE_MIN}
            max={FADE_MAX}
            value={opacity}
            ariaLabel={f.opacity}
            format={formatPercent}
            onChange={change}
          />
        </Row>
      )}
    </Section>
  );
}
