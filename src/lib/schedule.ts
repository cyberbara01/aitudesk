// Schedule model shared by the «Расписание» tile and its settings page: day filtering, lesson state
// (past / now / next / later), "ЧЧ:ММ" parsing, validation and CRUD on settings.schedule.
import { ru } from "../i18n/ru";
import { formatTime, isoWeekday, parseTime } from "./design";
import { settings, type Lesson, type Weekday } from "./settings";

export const ALL_DAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const WORK_DAYS: readonly Weekday[] = [1, 2, 3, 4, 5];

/** A typical pair is 80 minutes with a 10-minute break; used only to pre-fill the editor. */
export const LESSON_MINUTES = 80;
export const BREAK_MINUTES = 10;
export const DEFAULT_START = "08:00";
const LAST_MINUTE = 23 * 60 + 59;

export type LessonState = "past" | "now" | "next" | "later";

export function visibleDays(showWeekend: boolean): readonly Weekday[] {
  return showWeekend ? ALL_DAYS : WORK_DAYS;
}

/** `today` when it is among `days`, otherwise the first visible day (Monday on a hidden weekend). */
export function fallbackDay(today: Weekday, days: readonly Weekday[]): Weekday {
  return days.includes(today) ? today : days[0];
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

/** "08:00–09:20" */
export function timeRange(l: Pick<Lesson, "start" | "end">): string {
  return `${l.start}–${l.end}`;
}

/** Lesson count per weekday, index 0 = Monday. */
export function weekCounts(lessons: readonly Lesson[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const l of lessons) counts[l.day - 1] += 1;
  return counts;
}

/** Time window (minutes) covering every lesson, at least 08:00–20:00, snapped to whole hours. */
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

/** Milliseconds until the next local midnight. */
export function msUntilMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

// ---------------------------------------------------------------------------------------------
// Time input
// ---------------------------------------------------------------------------------------------

/** "8:5" → "08:05"; null when the text is not a valid time. */
export function normalizeTime(text: string): string | null {
  const m = parseTime(text);
  return m === null ? null : formatTime(m);
}

/**
 * Input mask for "ЧЧ:ММ": keeps digits and one colon, inserts the colon while typing forward
 * ("08" → "08:", "0800" → "08:00", "830" → "8:30") and never fights a deletion.
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
  if (d.length === 3) return Number(d[0]) >= 3 ? `${d[0]}:${d.slice(1)}` : `${d.slice(0, 2)}:${d[2]}`;
  if (d.length === 2 && next.length > prev.length) return `${d}:`;
  return d;
}

/** `time` shifted by `delta` minutes, or null when the result leaves the day. */
export function addMinutes(time: string, delta: number): string | null {
  const m = parseTime(time);
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

export function validateLesson(d: LessonDraft): LessonErrors {
  const errors: LessonErrors = {};
  const s = parseTime(d.start);
  const e = parseTime(d.end);
  if (s === null) errors.start = ru.schedule.invalidTime;
  if (e === null) errors.end = ru.schedule.invalidTime;
  else if (s !== null && e <= s) errors.end = ru.schedule.endBeforeStart;
  if (!d.title.trim()) errors.title = ru.common.required;
  return errors;
}

export function hasErrors(e: LessonErrors): boolean {
  return Boolean(e.start || e.end || e.title);
}

/** First lesson of `day` whose interval intersects [start, end), excluding `excludeId`. */
export function findOverlap(lessons: readonly Lesson[], day: Weekday, start: string, end: string, excludeId?: string): Lesson | null {
  const s = parseTime(start);
  const e = parseTime(end);
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
// Mutations (settings.schedule.lessons)
// ---------------------------------------------------------------------------------------------

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addLesson(lesson: Lesson): Promise<void> {
  return settings.updateSchedule({ lessons: [...settings.get().schedule.lessons, lesson] });
}

export function updateLesson(lesson: Lesson): Promise<void> {
  const lessons = settings.get().schedule.lessons.map((l) => (l.id === lesson.id ? lesson : l));
  return settings.updateSchedule({ lessons });
}

/** Replace the lesson with the same id, or append it. */
export function upsertLesson(lesson: Lesson): Promise<void> {
  return settings.get().schedule.lessons.some((l) => l.id === lesson.id) ? updateLesson(lesson) : addLesson(lesson);
}

export function removeLesson(id: string): Promise<void> {
  return settings.updateSchedule({ lessons: settings.get().schedule.lessons.filter((l) => l.id !== id) });
}

export function clearLessons(): Promise<void> {
  return settings.updateSchedule({ lessons: [] });
}
