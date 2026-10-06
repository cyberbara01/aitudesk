import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Tile } from "../components/Tile";
import { GAP_COLUMN, GAP_ROW, dateStyle, formatClock, timeStyle, useClockNow } from "../lib/clock";
import type { ClockSettings } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";

const H_ALIGN: Record<ClockSettings["align"], CSSProperties["alignItems"]> = { left: "flex-start", center: "center", right: "flex-end" };
const V_ALIGN: Record<ClockSettings["valign"], CSSProperties["justifyContent"]> = { top: "flex-start", center: "center", bottom: "flex-end" };

/** The time never shrinks below this share of its configured size. */
const MIN_FIT = 0.2;
/** In the "date to the right" layout the date may claim at most this share of the width; the rest ellipsizes. */
const DATE_SHARE = 0.45;

export interface ClockFaceProps {
  settings: ClockSettings;
  now: Date;
  /** Live clock: the colon blinks in phase with the wall clock. False for static previews. */
  live?: boolean;
  className?: string;
}

/**
 * The clock face shared by the tile, the settings preview and the preset cards. Fills its parent and
 * lays the time and date out per settings; the time is measured after every layout and its font size is
 * capped so it never overflows the available box (width and height), growing back when room appears.
 */
export function ClockFace({ settings: s, now, live = true, className }: ClockFaceProps) {
  const text = useMemo(() => formatClock(now, s), [now, s]);
  const faceRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef(1);
  const [fit, setFit] = useState(1);

  const hasDate = text.date !== null;
  const row = hasDate && s.datePosition === "right";
  const layoutRef = useRef(row);
  layoutRef.current = row;

  const blink = live && s.blinkColon;
  // Both colons mount in the same commit (keyed below), so one phase keeps them in step with the wall clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const phase = useMemo(() => -(Date.now() % 1000), [blink, s.seconds]);

  const measure = useCallback(() => {
    const face = faceRef.current;
    const time = timeRef.current;
    if (!face || !time) return;
    const fr = face.getBoundingClientRect();
    const tr = time.getBoundingClientRect();
    if (fr.width < 1 || fr.height < 1 || tr.width < 1 || tr.height < 1) return;
    // Previews are scaled with CSS zoom: rects are zoomed, offsetWidth is not — derive the factor.
    const z = face.offsetWidth > 0 ? fr.width / face.offsetWidth : 1;
    let availW = fr.width;
    let availH = fr.height;
    const date = dateRef.current;
    if (date) {
      // scrollWidth is an integer: reserve one extra pixel so a date that fits is never ellipsized.
      if (layoutRef.current) availW -= Math.min((date.scrollWidth + 1) * z, fr.width * DATE_SHARE) + GAP_ROW * z;
      else availH -= date.getBoundingClientRect().height + GAP_COLUMN * z;
    }
    const cur = fitRef.current;
    const ratio = Math.min(availW / tr.width, availH / tr.height);
    let next = cur;
    if (ratio < 0.995) next = cur * ratio * 0.995; // overflow → shrink with a hair of margin
    else if (cur < 1 && ratio > 1.02) next = Math.min(1, cur * ratio * 0.99); // headroom → grow back
    next = Math.max(MIN_FIT, next);
    if (Math.abs(next - cur) > 0.001) {
      fitRef.current = next;
      setFit(next);
    }
  }, []);

  // After every render (text, settings or fit changed) and whenever the box or the glyphs change size
  // (tile resize, bundled font arriving).
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
  const stackStyle: CSSProperties | undefined = row ? undefined : { alignItems: H_ALIGN[s.align] };
  const colonKey = `${blink}-${s.seconds}`;
  const colonStyle = blink ? { animationDelay: `${phase}ms` } : undefined;

  let colonIndex = 0;
  const timeEl = (
    <div ref={timeRef} className="clock-time" style={timeStyle(s, fit)}>
      {text.tokens.map((t, i) =>
        t.kind === "colon" ? (
          <span key={`c${colonIndex++}-${colonKey}`} className={blink ? "clock-colon blink" : "clock-colon"} style={colonStyle}>
            :
          </span>
        ) : (
          <span key={`d${i}`}>{t.text}</span>
        ),
      )}
      {text.suffix && <span className="clock-ampm">{text.suffix}</span>}
    </div>
  );
  const dateEl = hasDate ? (
    <div ref={dateRef} className="clock-date" style={dateStyle(s)}>
      {text.date}
    </div>
  ) : null;

  return (
    <div ref={faceRef} className={["clock-face", className ?? ""].filter(Boolean).join(" ")} style={faceStyle}>
      <div className={row ? "clock-stack beside" : "clock-stack"} style={stackStyle}>
        {s.datePosition === "above" && dateEl}
        {timeEl}
        {s.datePosition !== "above" && dateEl}
      </div>
    </div>
  );
}

/** «Часы»: the face inside a glass tile; everything comes from settings.clock. */
export function ClockTile() {
  const loaded = useSettingsLoaded();
  const { clock } = useSettings();
  const now = useClockNow(clock);
  // Wait for the stored settings so the tile never flashes the defaults (or toggles the acrylic twice).
  if (!loaded) return null;
  return (
    <Tile label="clock" className="tile-clock" background={clock.background}>
      <ClockFace settings={clock} now={now} />
    </Tile>
  );
}
