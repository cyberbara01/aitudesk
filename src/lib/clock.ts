// Clock tile logic: time/date formatting, font metrics and the second-boundary tick.
// Pure functions plus one hook; no DOM measuring here (that lives in the ClockFace component).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { extra } from "../i18n/ru.extra.clock";
import { clockFont, isHex, type ClockFontMeta } from "./design";
import type { ClockSettings } from "./settings";

export type DateFormat = ClockSettings["dateFormat"];

/** Time split into tokens so the colon can be wrapped (and blink) independently of the digits. */
export type TimeToken = { kind: "digits"; text: string } | { kind: "colon" };

export interface ClockText {
  tokens: TimeToken[];
  /** "am" / "pm" in 12-hour mode, otherwise null. */
  suffix: string | null;
  /** Formatted date line, or null for dateFormat "none". */
  date: string | null;
  /** Everything above joined — changes exactly when something visible changes. */
  key: string;
}

export const DATE_FORMATS: readonly DateFormat[] = ["long", "short", "numeric", "weekday", "none"];

/** Gaps inside the face (CSS px); clock.css uses the same values. */
export const GAP_COLUMN = 4;
export const GAP_ROW = 12;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

const formatters: Record<Exclude<DateFormat, "none">, Intl.DateTimeFormat> = {
  long: new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
  short: new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" }),
  numeric: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }),
  weekday: new Intl.DateTimeFormat("ru-RU", { weekday: "long" }),
};

/** "вторник, 6 октября" · "вт, 6 окт" · "06.10.2026" · "вторник" · null. */
export function formatDate(d: Date, format: DateFormat): string | null {
  if (format === "none") return null;
  const text = formatters[format].format(d);
  // Intl abbreviates months with a trailing period ("окт."); the catalogue shows them without it.
  return format === "short" ? text.replace(/\.$/, "") : text;
}

export function formatClock(d: Date, s: ClockSettings): ClockText {
  const h24 = d.getHours();
  let hours: string;
  let suffix: string | null = null;
  if (s.hour12) {
    hours = String(h24 % 12 || 12);
    suffix = h24 < 12 ? extra.clock.am : extra.clock.pm;
  } else {
    hours = pad2(h24);
  }
  const tokens: TimeToken[] = [{ kind: "digits", text: hours }, { kind: "colon" }, { kind: "digits", text: pad2(d.getMinutes()) }];
  if (s.seconds) tokens.push({ kind: "colon" }, { kind: "digits", text: pad2(d.getSeconds()) });
  const date = formatDate(d, s.dateFormat);
  const time = tokens.map((t) => (t.kind === "colon" ? ":" : t.text)).join("");
  return { tokens, suffix, date, key: `${time}${suffix ?? ""}|${date ?? ""}` };
}

/** Weight rounded to a hundred and limited to what the font actually has. */
export function clampWeight(weight: number, font: ClockFontMeta): number {
  const [lo, hi] = font.weights;
  return Math.min(hi, Math.max(lo, Math.round(weight / 100) * 100));
}

/** Brief 3.1: 14 px up to size 40, then ≈ size / 4 within 14..24. */
export function dateFontSize(size: number): number {
  if (size <= 40) return 14;
  return Math.min(24, Math.max(14, Math.round(size / 4)));
}

export function timeColor(s: ClockSettings): string {
  if (s.color === "accent") return "var(--accent)";
  if (s.color === "custom" && isHex(s.customColor)) return s.customColor;
  return "var(--text)";
}

export function dateColor(s: ClockSettings): string {
  if (s.dateColor === "accent") return "var(--accent)";
  if (s.dateColor === "text") return "var(--text)";
  return "var(--text-2)";
}

/** Inline style of the time element; `fit` (0..1) is the measured shrink factor from the face. */
export function timeStyle(s: ClockSettings, fit = 1): CSSProperties {
  const font = clockFont(s.font);
  const style: CSSProperties = {
    fontFamily: font.family,
    fontWeight: clampWeight(s.weight, font),
    fontSize: `${Math.round(s.size * fit * 100) / 100}px`,
    letterSpacing: `${s.letterSpacing / 100}em`,
    fontVariantNumeric: s.tabular ? "tabular-nums" : "proportional-nums",
    color: timeColor(s),
  };
  if (font.width) style.fontStretch = `${s.width}%`;
  return style;
}

export function dateStyle(s: ClockSettings): CSSProperties {
  return { fontSize: `${dateFontSize(s.size)}px`, color: dateColor(s) };
}

/** Milliseconds until the next wall-clock second (never 0, so the chain cannot spin). */
export function msToNextSecond(d: Date): number {
  return Math.max(4, 1000 - d.getMilliseconds());
}

/** Readouts for the settings sliders. */
export function formatWeight(v: number): string {
  const name = extra.clock.weightNames[v];
  return name ? `${v} · ${name}` : String(v);
}
export function formatPx(v: number): string {
  return `${v} ${extra.clock.px}`;
}
export function formatPercent(v: number): string {
  return `${v} ${extra.clock.percent}`;
}
/** Hundredths of an em → "−0.02 em" (typographic minus). */
export function formatTracking(v: number): string {
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}${Math.abs(v / 100).toFixed(2)} ${extra.clock.em}`;
}

/**
 * Current time for a clock with the given settings. Ticks on the second boundary and returns a new Date
 * only when the rendered text would change (every minute without seconds, every second with them).
 * Restarts immediately when a format option changes so the face never shows a stale layout.
 */
export function useClockNow(s: ClockSettings): Date {
  const [now, setNow] = useState(() => new Date());
  const settingsRef = useRef(s);
  settingsRef.current = s;
  const formatKey = `${s.seconds}|${s.hour12}|${s.dateFormat}`;

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const d = new Date();
      const key = formatClock(d, settingsRef.current).key;
      setNow((prev) => (formatClock(prev, settingsRef.current).key === key ? prev : d));
      timer = window.setTimeout(tick, msToNextSecond(d));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [formatKey]);

  return now;
}
