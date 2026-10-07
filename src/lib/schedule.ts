// Schedule model shared by the «Расписание» tile and its settings page: which days the tile shows, lesson
// state (past / now / next / later), timer helpers, "ЧЧ:ММ" input, validation, lesson colours and the
// list edits on settings.schedule.
import type { CSSProperties } from "react";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.schedule";
import { formatTime, isoWeekday, luminance, parseTime, shade } from "./design";
import { settings, type Lesson, type Weekday } from "./settings";

export const ALL_DAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** A typical pair is 80 minutes with a 10-minute break; used only to pre-fill the editor. */
export const LESSON_MINUTES = 80;
export const BREAK_MINUTES = 10;
export const DEFAULT_START = "08:00";
const LAST_MINUTE = 23 * 60 + 59;

export type LessonState = "past" | "now" | "next" | "later";

// ---------------------------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------------------------

/** True when at least one lesson falls on `day`. */
export function hasLessonsOn(lessons: readonly Lesson[], day: Weekday): boolean {
  return lessons.some((l) => l.day === day);
}

/**
 * Days in the tile's weekday row.
 * - «Показывать дни без пар» on: Mon to Fri, plus Sat and Sun when «Показывать выходные» is on; a weekend day
 *   that has lessons is always shown, so entered lessons can never become unreachable.
 * - Off: only the days that have lessons (weekend days included); empty when there are no lessons at all.
 */
export function visibleDays(lessons: readonly Lesson[], showWeekend: boolean, showEmptyDays: boolean): readonly Weekday[] {
  if (!showEmptyDays) return ALL_DAYS.filter((d) => hasLessonsOn(lessons, d));
  return ALL_DAYS.filter((d) => d <= 5 || showWeekend || hasLessonsOn(lessons, d));
}

/** `day` shifted by `offset` days around the week (7 + 1 = 1). */
function addDays(day: Weekday, offset: number): Weekday {
  return ((((day - 1 + offset) % 7) + 7) % 7 + 1) as Weekday;
}

/** `today` when it is among `days`, otherwise the nearest following day of `days` (wrapping into next week). */
export function nearestDay(today: Weekday, days: readonly Weekday[]): Weekday {
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(today, i);
    if (days.includes(d)) return d;
  }
  return today;
}

/** The first lesson of the nearest day after `today` that has lessons, or null. */
export function nextLessonAfter(lessons: readonly Lesson[], today: Weekday): { day: Weekday; lesson: Lesson; tomorrow: boolean } | null {
  for (let i = 1; i < 7; i += 1) {
    const day = addDays(today, i);
    const list = lessonsForDay(lessons, day);
    if (list.length) return { day, lesson: list[0], tomorrow: i === 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

const LATE = Number.MAX_SAFE_INTEGER;
const startMinutes = (l: Lesson): number => parseTime(l.start) ?? LATE;
const endMinutes = (l: Lesson): number => parseTime(l.end) ?? LATE;

/** Lessons of one weekday sorted by start, then end, then title (malformed times last). */
export function lessonsForDay(lessons: readonly Lesson[], day: Weekday): Lesson[] {
  return lessons
    .filter((l) => l.day === day)
    .sort((a, b) => startMinutes(a) - startMinutes(b) || endMinutes(a) - endMinutes(b) || a.title.localeCompare(b.title, "ru"));
}

/** Minutes since local midnight, fractional (seconds included). */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** past / now / later relative to `now`; a lesson on another weekday is always "later". */
export function lessonState(lesson: Lesson, now: Date): Exclude<LessonState, "next"> {
  if (lesson.day !== isoWeekday(now)) return "later";
  const s = parseTime(lesson.start);
  const e = parseTime(lesson.end);
  if (s === null || e === null) return "later";
  const m = minutesOfDay(now);
  if (m >= e) return "past";
  if (m >= s) return "now";
  return "later";
}

/** State per lesson id for one day's sorted list; the first upcoming lesson of today becomes "next". */
export function dayStates(dayLessons: readonly Lesson[], now: Date): Map<string, LessonState> {
  const out = new Map<string, LessonState>();
  const today = isoWeekday(now);
  let nextFound = false;
  for (const l of dayLessons) {
    let st: LessonState = lessonState(l, now);
    if (st === "later" && !nextFound && l.day === today && parseTime(l.start) !== null) {
      st = "next";
      nextFound = true;
    }
    out.set(l.id, st);
  }
  return out;
}

/** Whole minutes until the lesson starts (at least 1 for an upcoming lesson). */
export function minutesUntil(lesson: Lesson, now: Date): number {
  const s = parseTime(lesson.start) ?? 0;
  return Math.max(1, Math.ceil(s - minutesOfDay(now)));
}

/** Between the two times of a range: a plain hyphen (the author's rule for ranges). */
export const TIME_SEP = " - ";

/**
 * "08:00 - 09:20" as text (overlap hint). Where the range is drawn, the two times are separate `.num` spans
 * around TIME_SEP in the text font, so a monospace number font (Rice) does not widen the spaces.
 */
export function timeRange(l: Pick<Lesson, "start" | "end">): string {
  return `${l.start}${TIME_SEP}${l.end}`;
}

// ---------------------------------------------------------------------------------------------
// Room on the map
// ---------------------------------------------------------------------------------------------

/** Event the schedule tile sends to the map window: payload { room } (a room code, see mapRoomCode). */
export const MAP_FOCUS_EVENT = "map-focus-room";

/** Cyrillic letters typed instead of the Latin ones of a room code («С1.2.223К»). */
const LOOKALIKES: Record<string, string> = { "С": "C", "с": "C", "Р": "P", "р": "P", "К": "K", "к": "K" };
/** A C1 room: optional block and section, a number on floors 1 to 3, optional type letter ("C1.2.223K", "223"). */
const ROOM_CODE = /(?<!\d)(?:C1\.)?(?:\d\.)?[1-3]\d{2}[CPLK]?(?!\w)/i;

/**
 * The room code in a lesson's room text, the way the map searches it ("C1.2.223", "223", "1.352K",
 * upper-case), or null when the text names no room of the map («Спортзал», «Онлайн»): then no link is shown.
 */
export function mapRoomCode(room: string): string | null {
  const latin = room.trim().replace(/[СсРрКк]/g, (c) => LOOKALIKES[c] ?? c);
  const m = ROOM_CODE.exec(latin);
  return m ? m[0].toUpperCase() : null;
}

/** Lesson count per weekday, index 0 = Monday. */
export function weekCounts(lessons: readonly Lesson[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const l of lessons) counts[l.day - 1] += 1;
  return counts;
}

/** Time window (minutes) covering every lesson, at least 08:00 to 20:00, snapped to whole hours. */
export function weekRange(lessons: readonly Lesson[]): { from: number; to: number } {
  let from = 8 * 60;
  let to = 20 * 60;
  for (const l of lessons) {
    const s = parseTime(l.start);
    const e = parseTime(l.end);
    if (s !== null) from = Math.min(from, Math.floor(s / 60) * 60);
    if (e !== null) to = Math.max(to, Math.ceil(e / 60) * 60);
  }
  return { from, to: Math.max(to, from + 60) };
}

// ---------------------------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------------------------

/** True while today still has a lesson that has not ended: then the tile's badges change every minute. */
export function hasLessonsAhead(lessons: readonly Lesson[], now: Date): boolean {
  const today = isoWeekday(now);
  const m = minutesOfDay(now);
  return lessons.some((l) => {
    if (l.day !== today) return false;
    const e = parseTime(l.end);
    return e !== null && e > m;
  });
}

/** Milliseconds until the next wall-clock minute (never 0). */
export function msToNextMinute(now: Date): number {
  return Math.max(1, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}

/** Milliseconds until the next local midnight. */
export function msUntilMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}

export function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Minute of the day as an integer (what the tile can show changes at most this often). */
export function minuteKey(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// ---------------------------------------------------------------------------------------------
// Time input
// ---------------------------------------------------------------------------------------------

/**
 * Minutes since midnight of what the user typed, or null. Besides "8:30" / "08:30" a bare hour is
 * accepted as a whole hour: "8", "08", "8:" and "14:" all mean HH:00.
 */
export function timeMinutes(text: string): number | null {
  const t = text.trim();
  const hour = /^(\d{1,2}):?$/.exec(t);
  if (hour) {
    const h = Number(hour[1]);
    return h <= 23 ? h * 60 : null;
  }
  return parseTime(t);
}

/** "8:5" is invalid, "8:05" → "08:05", "14:" → "14:00"; null when the text is not a time. */
export function normalizeTime(text: string): string | null {
  const m = timeMinutes(text);
  return m === null ? null : formatTime(m);
}

/**
 * Input mask for "ЧЧ:ММ": keeps digits and one colon, inserts the colon while typing forward and never
 * fights a deletion. Two digits that can be an hour get the colon after them ("08" → "08:", then
 * "08:30"); two digits that cannot are split ("83" → "8:3", then "8:30", shown as "08:30" on blur).
 * Three and four digits (pasted) are split the same way ("830" → "8:30", "250" → "2:50", "0830" → "08:30").
 */
export function maskTime(prev: string, next: string): string {
  const v = next.replace(/[^\d:]/g, "");
  const colon = v.indexOf(":");
  if (colon >= 0) {
    const h = v.slice(0, colon).slice(0, 2);
    const m = v.slice(colon + 1).replace(/:/g, "").slice(0, 2);
    return `${h}:${m}`;
  }
  const d = v.slice(0, 4);
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  if (d.length === 3) return Number(d.slice(0, 2)) > 23 ? `${d[0]}:${d.slice(1)}` : `${d.slice(0, 2)}:${d[2]}`;
  if (d.length === 2 && next.length > prev.length) return Number(d) > 23 ? `${d[0]}:${d[1]}` : `${d}:`;
  return d;
}

/** `time` shifted by `delta` minutes, or null when the result leaves the day. */
export function addMinutes(time: string, delta: number): string | null {
  const m = timeMinutes(time);
  if (m === null) return null;
  const r = m + delta;
  return r < 0 || r > LAST_MINUTE ? null : formatTime(r);
}

/** Pre-fill for a new lesson: after the day's last lesson plus a break, else 08:00; 80 minutes long. */
export function suggestTimes(dayLessons: readonly Lesson[]): { start: string; end: string } {
  let lastEnd = -1;
  for (const l of dayLessons) {
    const e = parseTime(l.end);
    if (e !== null) lastEnd = Math.max(lastEnd, e);
  }
  let start = DEFAULT_START;
  if (lastEnd >= 0 && lastEnd + BREAK_MINUTES + LESSON_MINUTES <= LAST_MINUTE) start = formatTime(lastEnd + BREAK_MINUTES);
  return { start, end: addMinutes(start, LESSON_MINUTES) ?? formatTime(LAST_MINUTE) };
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export interface LessonDraft {
  start: string;
  end: string;
  title: string;
}

export interface LessonErrors {
  start?: string;
  end?: string;
  title?: string;
}

/** Checks what the user typed, read the same lenient way as on blur and on save. */
export function validateLesson(d: LessonDraft): LessonErrors {
  const errors: LessonErrors = {};
  const s = timeMinutes(d.start);
  const e = timeMinutes(d.end);
  if (s === null) errors.start = ru.schedule.invalidTime;
  if (e === null) errors.end = ru.schedule.invalidTime;
  else if (s !== null && e <= s) errors.end = extra.endAfterStart;
  if (!d.title.trim()) errors.title = ru.common.required;
  return errors;
}

export function hasErrors(e: LessonErrors): boolean {
  return Boolean(e.start || e.end || e.title);
}

/** First lesson of `day` whose interval intersects [start, end), excluding `excludeId`. */
export function findOverlap(lessons: readonly Lesson[], day: Weekday, start: string, end: string, excludeId?: string): Lesson | null {
  const s = timeMinutes(start);
  const e = timeMinutes(end);
  if (s === null || e === null || e <= s) return null;
  for (const l of lessonsForDay(lessons, day)) {
    if (l.id === excludeId) continue;
    const ls = parseTime(l.start);
    const le = parseTime(l.end);
    if (ls === null || le === null) continue;
    if (ls < e && s < le) return l;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Lesson colour
// ---------------------------------------------------------------------------------------------

/**
 * Reference surfaces for the contrast check: the lightest dark tile fill and the darkest light one
 * (the «Светло-серая» palette), so the result reads on every palette of its kind.
 */
const INK_SURFACE_DARK = "#2A2C34";
const INK_SURFACE_LIGHT = "#E4E5EA";
/** WCAG AA for small text: the ink also colours the «Сейчас» caption. */
const INK_CONTRAST = 4.5;
const INK_STEPS = 50;

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `hex` moved towards white (dark surface) or black (light surface) just far enough to read on `surface`. */
function readableOn(hex: string, surface: string): string {
  const dir = luminance(surface) > 0.5 ? -1 : 1;
  for (let k = 0; k <= INK_STEPS; k += 1) {
    const c = shade(hex, (dir * k) / INK_STEPS);
    if (contrast(c, surface) >= INK_CONTRAST) return c;
  }
  return dir < 0 ? "#000000" : "#FFFFFF";
}

/** Small: a few lesson colours in use, plus whatever the editor's picker passes through while dragged. */
const inkCache = new Map<string, CSSProperties>();
const INK_CACHE_MAX = 64;

/**
 * Inline style for an element drawn in a lesson's own colour: `--ink-dark` / `--ink-light` hold the colour
 * as is where it already reads, otherwise lightened (dark palettes) or deepened (light palettes) like the
 * two tones of an accent preset. schedule.css picks one by `data-scheme`. Undefined for accent lessons.
 */
export function lessonInkStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  let style = inkCache.get(color);
  if (!style) {
    style = { "--ink-dark": readableOn(color, INK_SURFACE_DARK), "--ink-light": readableOn(color, INK_SURFACE_LIGHT) } as CSSProperties;
    if (inkCache.size >= INK_CACHE_MAX) inkCache.clear();
    inkCache.set(color, style);
  }
  return style;
}

// ---------------------------------------------------------------------------------------------
// Edits of settings.schedule.lessons (functional updates: quick successive edits never undo each other)
// ---------------------------------------------------------------------------------------------

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Replace the lesson with the same id, or append it. */
export function upsertLesson(lesson: Lesson): Promise<void> {
  return settings.update((s) => {
    const list = s.schedule.lessons;
    const exists = list.some((l) => l.id === lesson.id);
    const lessons = exists ? list.map((l) => (l.id === lesson.id ? lesson : l)) : [...list, lesson];
    return { schedule: { ...s.schedule, lessons } };
  });
}

export function removeLesson(id: string): Promise<void> {
  return settings.update((s) => ({ schedule: { ...s.schedule, lessons: s.schedule.lessons.filter((l) => l.id !== id) } }));
}

export function clearLessons(): Promise<void> {
  return settings.update((s) => ({ schedule: { ...s.schedule, lessons: [] } }));
}
