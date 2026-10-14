// Clock tile logic: time/date formatting, font metrics, preset matching and the tick.
// Pure functions plus hooks; the DOM measuring (fit to the box) lives in ClockFace (src/tiles/Clock.tsx).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { extra } from "../i18n/ru.extra.clock";
import { CLOCK_PRESETS, clockFont, isHex, type ClockFontMeta } from "./design";
import type { ClockSettings } from "./settings";
import { LANG, LOCALE } from "../i18n/lang";

export type DateFormat = ClockSettings["dateFormat"];

/** Time split into tokens so the colon can be wrapped (and blink) independently of the digits. */
export type TimeToken = { kind: "digits"; text: string } | { kind: "colon" };

export interface ClockText {
  tokens: TimeToken[];
  /** "am" / "pm" in 12-hour mode, otherwise null. */
  suffix: string | null;
  /** Formatted date line, or null for dateFormat "none". */
  date: string | null;
  /** Everything above joined: changes exactly when something visible changes. */
  key: string;
}

export const DATE_FORMATS: readonly DateFormat[] = ["long", "short", "numeric", "weekday", "none"];

/** Gaps inside the face in CSS px: --s1 between stacked time and date, --s3 side by side (clock.css uses the tokens). */
export const GAP_COLUMN = 4;
export const GAP_ROW = 12;

/** Fitting the time into a small tile never makes it smaller than this (px); the date keeps its 14 px minimum. */
export const MIN_TIME_PX = 18;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const round2 = (n: number) => Math.round(n * 100) / 100;

const formatters: Record<Exclude<DateFormat, "none">, Intl.DateTimeFormat> = {
  long: new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }),
  short: new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }),
  numeric: new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" }),
  weekday: new Intl.DateTimeFormat(LOCALE, { weekday: "long" }),
};

/** Kazakh names, written here: the browser may have no Kazakh dates (see NUMBER_LOCALE in lang.ts). Monday first. */
const KK = {
  weekdays: ["дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі", "жексенбі"],
  weekdaysShort: ["дс", "сс", "ср", "бс", "жм", "сб", "жс"],
  months: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"],
  monthsShort: ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"],
};

/** «сәрсенбі, 14 қазан» · «ср, 14 қаз» · «14.10.2026» · «сәрсенбі». */
function formatDateKk(d: Date, format: Exclude<DateFormat, "none">): string {
  const day = (d.getDay() + 6) % 7;
  if (format === "long") return `${KK.weekdays[day]}, ${d.getDate()} ${KK.months[d.getMonth()]}`;
  if (format === "short") return `${KK.weekdaysShort[day]}, ${d.getDate()} ${KK.monthsShort[d.getMonth()]}`;
  if (format === "numeric") return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  return KK.weekdays[day];
}

/** "вторник, 6 октября" · "вт, 6 окт" · "06.10.2026" · "вторник" · null. */
export function formatDate(d: Date, format: DateFormat): string | null {
  if (format === "none") return null;
  if (LANG === "kk") return formatDateKk(d, format);
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

// ---------------------------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------------------------

/** Fonts that exist only as Regular and Bold. */
const STATIC_WEIGHTS: readonly number[] = [400, 700];

const installed = new Map<string, boolean>();

/**
 * Whether a local font is present. Text set in a missing family falls back to the generic family, so it
 * measures exactly like the generic one with both a monospace and a serif fallback. Measured once per window.
 */
export function localFontInstalled(family: string): boolean {
  const known = installed.get(family);
  if (known !== undefined) return known;
  let ok = true;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      const probe = "mmmmmmmmmmlli10O@";
      const width = (font: string) => {
        ctx.font = `32px ${font}`;
        return ctx.measureText(probe).width;
      };
      ok = width(`"${family}", monospace`) !== width("monospace") || width(`"${family}", serif`) !== width("serif");
    }
  } catch {
    /* cannot tell: assume it is there */
  }
  installed.set(family, ok);
  return ok;
}

/**
 * Weights the font really renders. Variable fonts: every hundred of their range. Segoe Script has only
 * Regular and Bold; Cascadia Mono is not on every Windows 11 and then falls back to Consolas, which has the same two.
 */
export function weightSteps(font: ClockFontMeta): readonly number[] {
  if (font.id === "script" || (font.id === "cascadia" && !localFontInstalled("Cascadia Mono"))) return STATIC_WEIGHTS;
  const [lo, hi] = font.weights;
  const steps: number[] = [];
  for (let w = lo; w <= hi; w += 100) steps.push(w);
  return steps;
}

/** The available weight closest to the requested one. */
export function clampWeight(weight: number, font: ClockFontMeta): number {
  let best = 0;
  for (const w of weightSteps(font)) if (!best || Math.abs(w - weight) < Math.abs(best - weight)) best = w;
  return best;
}

// ---------------------------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------------------------

/** The date: 14 px up to time size 40, then about size / 4 within 14..24. `size` is the size the time is drawn at. */
export function dateFontSize(size: number): number {
  if (size <= 40) return 14;
  return Math.min(24, Math.max(14, Math.round(size / 4)));
}

export function timeColor(s: ClockSettings): string {
  if (s.color === "accent") return "var(--accent-text)";
  if (s.color === "custom" && isHex(s.customColor)) return s.customColor;
  return "var(--text)";
}

export function dateColor(s: ClockSettings): string {
  if (s.dateColor === "accent") return "var(--accent-text)";
  if (s.dateColor === "text") return "var(--text)";
  return "var(--text-2)";
}

/** Inline style of the time element; `fit` (0..1) is the shrink factor measured by the face. */
export function timeStyle(s: ClockSettings, fit = 1): CSSProperties {
  const font = clockFont(s.font);
  const style: CSSProperties = {
    fontFamily: font.family,
    fontWeight: clampWeight(s.weight, font),
    fontSize: `${round2(s.size * fit)}px`,
    letterSpacing: `${s.letterSpacing / 100}em`,
    fontVariantNumeric: s.tabular ? "tabular-nums" : "proportional-nums",
    color: timeColor(s),
  };
  if (font.width) style.fontStretch = `${s.width}%`;
  // Tracking is added after every glyph, the last one too. Give the trailing amount back so right and centre
  // alignment line up with the digits themselves (the am/pm suffix has no tracking, so it needs nothing).
  if (!s.hour12 && s.letterSpacing !== 0) style.marginRight = `${-s.letterSpacing / 100}em`;
  return style;
}

/** The am/pm suffix: never thinner than Regular, so the small letters stay readable next to light digits. */
export function suffixStyle(s: ClockSettings): CSSProperties {
  return { fontWeight: Math.max(400, clampWeight(s.weight, clockFont(s.font))) };
}

/** The date follows the size the time is really drawn at, so a time shrunk to fit takes its date along. */
export function dateStyle(s: ClockSettings, fit = 1): CSSProperties {
  return { fontSize: `${dateFontSize(s.size * fit)}px`, color: dateColor(s) };
}

/** Id of the preset whose look these settings have, or "custom". hour12 and customColor are not part of a look. */
export function presetOf(s: ClockSettings): string {
  for (const p of CLOCK_PRESETS) {
    const keys = Object.keys(p.values) as (keyof ClockSettings)[];
    if (keys.every((k) => s[k] === p.values[k])) return p.id;
  }
  return "custom";
}

// ---------------------------------------------------------------------------------------------
// Slider readouts
// ---------------------------------------------------------------------------------------------


export function formatWeight(v: number): string {
  const name = extra.clock.weightNames[v];
  return name ? `${v} · ${name}` : String(v);
}
/** The time size: a plain number, the label already says «Размер». */
export function formatSize(v: number): string {
  return String(v);
}
/** The percent sign as each language writes it: «100 %» in Russian, "100%" in English. */
export function formatPercent(v: number): string {
  return `${v}${extra.clock.percent}`;
}
/** Tracking is stored in hundredths of an em, which is a percent of the digit size: «-2 %», «0 %», «+4 %». */
export function formatTracking(v: number): string {
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  return `${sign}${Math.abs(v)}${extra.clock.percent}`;
}

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/** Milliseconds until the next wall-clock second (never 0, so the chain cannot spin). */
export function msToNextSecond(d: Date): number {
  return Math.max(4, 1000 - d.getMilliseconds());
}

/** Milliseconds until the next half second (the blinking colon changes there). */
function msToNextHalfSecond(d: Date): number {
  return Math.max(4, 500 - (d.getMilliseconds() % 500));
}

/** The colon blinks only when asked to and when Windows does not ask for reduced motion. */
function blinkWanted(s: ClockSettings): boolean {
  return s.blinkColon && !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Milliseconds until the next wall-clock minute. */
export function msToNextMinute(d: Date): number {
  return Math.max(4, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
}

/** A tick this much later than planned means the timer was frozen (sleep). */
const LATE_TICK = 2000;

export interface ClockTick {
  now: Date;
  /** Grows whenever the clock re-aligned to the wall clock (shown again, woke from sleep). */
  epoch: number;
  /** Blinking colon: dimmed during the second half of every second. */
  colonDim: boolean;
}

/**
 * Current time for a clock with the given settings. Without seconds and blinking the timer wakes once a minute,
 * on the minute boundary; with seconds, on every second; with the blinking colon, every half second (the blink
 * is driven from here, two frames a second, instead of a CSS animation that would redraw the window at the
 * display rate). A new tick is returned only when the rendered text or the colon changes. Nothing runs while
 * the window is hidden or `active` is false; becoming visible (or a tick that comes far too late, after
 * sleep) re-aligns at once.
 */
export function useClockNow(s: ClockSettings, active = true): ClockTick {
  const [tick, setTick] = useState<ClockTick>(() => ({ now: new Date(), epoch: 0, colonDim: false }));
  const settingsRef = useRef(s);
  settingsRef.current = s;
  const perSecond = s.seconds;
  const blink = blinkWanted(s);
  const formatKey = `${s.seconds}|${s.hour12}|${s.dateFormat}`;

  useEffect(() => {
    if (!active) return;
    let timer = 0;
    let due = 0;

    const update = (realign: boolean): Date => {
      const d = new Date();
      const key = formatClock(d, settingsRef.current).key;
      const colonDim = blink && d.getMilliseconds() >= 500;
      setTick((prev) => {
        const changed = formatClock(prev.now, settingsRef.current).key !== key;
        if (!changed && !realign && prev.colonDim === colonDim) return prev;
        return { now: changed ? d : prev.now, epoch: realign ? prev.epoch + 1 : prev.epoch, colonDim };
      });
      return d;
    };
    const arm = (d: Date) => {
      window.clearTimeout(timer);
      timer = 0;
      if (document.visibilityState === "hidden") return;
      const delay = blink ? msToNextHalfSecond(d) : perSecond ? msToNextSecond(d) : msToNextMinute(d);
      due = d.getTime() + delay;
      timer = window.setTimeout(onTimer, delay);
    };
    const onTimer = () => arm(update(Date.now() - due > LATE_TICK));
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        window.clearTimeout(timer);
        timer = 0;
      } else {
        arm(update(true));
      }
    };

    arm(update(false));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [formatKey, perSecond, blink, active]);

  return tick;
}

/** Today's date for labels and samples; one timer, at the next local midnight (re-checked when the window is shown). */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const refresh = () => setToday((prev) => (prev.toDateString() === new Date().toDateString() ? prev : new Date()));
    const arm = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(() => {
        refresh();
        arm();
      }, midnight.getTime() - now.getTime());
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return today;
}
