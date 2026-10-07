import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Tile } from "../components/Tile";
import {
  GAP_COLUMN,
  GAP_ROW,
  MIN_TIME_PX,
  dateFontSize,
  dateStyle,
  formatClock,
  suffixStyle,
  timeStyle,
  useClockNow,
} from "../lib/clock";
import type { ClockSettings } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";

const H_ALIGN: Record<ClockSettings["align"], CSSProperties["alignItems"]> = { left: "flex-start", center: "center", right: "flex-end" };
const V_ALIGN: Record<ClockSettings["valign"], CSSProperties["justifyContent"]> = { top: "flex-start", center: "center", bottom: "flex-end" };

/** In the "date to the right" layout the date may claim at most this share of the width; the rest ellipsizes. */
const DATE_SHARE = 0.45;
/** Room kept free when the time is shrunk to fit, so rounding never tips it over the edge. */
const FIT_MARGIN = 0.995;

export interface ClockFaceProps {
  settings: ClockSettings;
  now: Date;
  /** From useClockNow: the blinking colon is in its dim half second. */
  colonDim?: boolean;
  /** Live clock: the colon may blink. False for static previews (preset cards). */
  live?: boolean;
  /** Small preset thumbnail: the date is drawn as a line in its colour, text that small cannot be read. */
  thumbnail?: boolean;
  className?: string;
}

/** A stand-in for date text in thumbnails, about as long as the text (half an em per character). */
function DateLine({ text }: { text: string }) {
  return <span className="clock-date-line" style={{ width: `${Math.min(18, text.length) * 0.5}em` }} />;
}

/** CSS zoom applied by ancestors (preset cards, a scaled preview): viewport px per CSS px. */
function cssZoom(el: HTMLElement, rect: DOMRect): number {
  const z = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom;
  if (typeof z === "number" && z > 0) return z;
  return el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
}

function sameSettings(a: ClockSettings, b: ClockSettings): boolean {
  if (a === b) return true;
  for (const k of Object.keys(a) as (keyof ClockSettings)[]) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * The clock face shared by the tile, the settings preview and the preset cards. Fills its parent and lays the
 * time and date out per settings. After every layout the time is measured and its size (the date follows it)
 * is set to the largest that fits the box in width and height, never below MIN_TIME_PX; it grows back when
 * room appears (tile resize, a bundled font arriving).
 */
export const ClockFace = memo(
  function ClockFace({ settings: s, now, colonDim = false, live = true, thumbnail = false, className }: ClockFaceProps) {
    const text = useMemo(() => formatClock(now, s), [now, s]);
    const faceRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLDivElement>(null);
    const dateRef = useRef<HTMLDivElement>(null);
    const sizerRef = useRef<HTMLSpanElement>(null);
    const fitRef = useRef(1);
    const [fit, setFit] = useState(1);

    const hasDate = text.date !== null;
    const beside = hasDate && s.datePosition === "right";
    const settingsRef = useRef(s);
    settingsRef.current = s;
    const besideRef = useRef(beside);
    besideRef.current = beside;

    const dimColon = live && s.blinkColon && colonDim;

    const measure = useCallback(() => {
      const face = faceRef.current;
      const time = timeRef.current;
      if (!face || !time) return;
      const fr = face.getBoundingClientRect();
      const tr = time.getBoundingClientRect();
      if (fr.width < 1 || fr.height < 1 || tr.width < 1 || tr.height < 1) return;
      const cs = settingsRef.current;
      const cur = fitRef.current;
      const z = cssZoom(face, fr);
      // All lengths below are viewport px. The time scales linearly with its font size; the trailing tracking
      // given back by its negative margin is not part of its box.
      const trail = cs.hour12 ? 0 : (cs.letterSpacing / 100) * cs.size * cur * z;
      const w1 = (tr.width - trail) / cur;
      const h1 = tr.height / cur;
      const date = dateRef.current;
      const dateNow = dateFontSize(cs.size * cur);
      const dh = date ? date.getBoundingClientRect().height : 0;
      const dw = date && sizerRef.current ? sizerRef.current.getBoundingClientRect().width : 0;
      const row = date !== null && besideRef.current;
      const W = fr.width;
      const H = fr.height;

      const fits = (f: number): boolean => {
        const tw = w1 * f;
        const th = h1 * f;
        if (!date) return tw <= W && th <= H;
        const k = dateFontSize(cs.size * f) / dateNow;
        if (row) return tw + GAP_ROW * z + Math.min(dw * k, W * DATE_SHARE) <= W && Math.max(th, dh * k) <= H;
        return tw <= W && th + GAP_COLUMN * z + dh * k <= H;
      };

      const floor = Math.min(1, MIN_TIME_PX / cs.size);
      let target = 1;
      if (!fits(1)) {
        let lo = floor;
        let hi = 1;
        if (fits(lo)) {
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (fits(mid)) lo = mid;
            else hi = mid;
          }
        }
        target = Math.max(floor, lo * FIT_MARGIN);
      }
      // Shrink at once; grow only with real headroom (or straight back to full size), so it never oscillates.
      let next = cur;
      if (target < cur - 0.0005) next = target;
      else if (target > cur * 1.01 || (target === 1 && cur !== 1)) next = target;
      if (next !== cur) {
        fitRef.current = next;
        setFit(next);
      }
    }, []);

    // After every render (text, settings or fit changed) and whenever the box or the glyphs change size.
    useLayoutEffect(measure);
    useLayoutEffect(() => {
      const face = faceRef.current;
      const time = timeRef.current;
      if (!face || !time) return;
      const ro = new ResizeObserver(() => measure());
      ro.observe(face);
      ro.observe(time);
      return () => ro.disconnect();
    }, [measure]);

    const faceStyle: CSSProperties = { justifyContent: V_ALIGN[s.valign], alignItems: H_ALIGN[s.align], textAlign: s.align };
    const stackStyle: CSSProperties | undefined = beside ? undefined : { alignItems: H_ALIGN[s.align] };

    let colonIndex = 0;
    const timeEl = (
      <div ref={timeRef} className="clock-time" style={timeStyle(s, fit)}>
        {text.tokens.map((t, i) =>
          t.kind === "colon" ? (
            <span key={`c${colonIndex++}`} className={dimColon ? "clock-colon dim" : "clock-colon"}>
              :
            </span>
          ) : (
            <span key={`d${i}`}>{t.text}</span>
          ),
        )}
        {text.suffix && (
          <span className="clock-ampm" style={suffixStyle(s)}>
            {text.suffix}
          </span>
        )}
      </div>
    );
    const dateEl = hasDate ? (
      <div ref={dateRef} className="clock-date" style={dateStyle(s, fit)}>
        {thumbnail ? <DateLine text={text.date ?? ""} /> : text.date}
        {/* Unclipped copy: its width is the date's natural width, used to share a row with the time. */}
        {beside && (
          <span ref={sizerRef} className="clock-date-sizer" aria-hidden="true">
            {thumbnail ? <DateLine text={text.date ?? ""} /> : text.date}
          </span>
        )}
      </div>
    ) : null;

    return (
      <div ref={faceRef} className={className ? `clock-face ${className}` : "clock-face"} style={faceStyle}>
        <div className={beside ? "clock-stack beside" : "clock-stack"} style={stackStyle}>
          {s.datePosition === "above" && dateEl}
          {timeEl}
          {s.datePosition !== "above" && dateEl}
        </div>
      </div>
    );
  },
  (a, b) =>
    a.now === b.now &&
    a.colonDim === b.colonDim &&
    a.live === b.live &&
    a.thumbnail === b.thumbnail &&
    a.className === b.className &&
    sameSettings(a.settings, b.settings),
);

/** «Часы»: the face inside a glass tile; everything comes from settings.clock. */
export function ClockTile() {
  const loaded = useSettingsLoaded();
  const { clock } = useSettings();
  const { now, colonDim } = useClockNow(clock);
  // Wait for the stored settings so the tile never flashes the defaults (or toggles the acrylic twice).
  if (!loaded) return null;
  return (
    <Tile label="clock" className="tile-clock" background={clock.background}>
      <ClockFace settings={clock} now={now} colonDim={colonDim} />
    </Tile>
  );
}
