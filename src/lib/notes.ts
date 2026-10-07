// Notes model shared by the «Заметки» tile and its settings page: deadline parsing, ordering, the countdown
// wording, one light scheduler for the whole tile, the «ЧЧ:ММ» input mask, quick deadlines, when deadline
// reminders come, and CRUD on settings.notes (always through functional updates, so edits from other windows
// are never lost).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { extra } from "../i18n/ru.extra.notes";
import { formatTime, isoWeekday, parseTime } from "./design";
import { settings, type Note, type NoteSort, type ReminderSettings } from "./settings";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Longest note text (the settings normalizer cuts at the same length). */
export const MAX_TEXT = 2000;

/** `edit` value for open_settings that opens the editor on a new, empty note. Note ids are UUIDs. */
export const NEW_NOTE = "new";

const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------------------------
// Deadlines: "YYYY-MM-DDTHH:MM" local wall time
// ---------------------------------------------------------------------------------------------

const DEADLINE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Local Date of a deadline, or null when it is missing or not a real calendar moment (e.g. 30 February). */
export function parseDeadline(text: string | undefined): Date | null {
  const m = text ? DEADLINE.exec(text) : null;
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Epoch ms of a deadline, or null. */
export function deadlineMs(text: string | undefined): number | null {
  return parseDeadline(text)?.getTime() ?? null;
}

/** "YYYY-MM-DD" of a local date. */
export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:MM" of a local date. */
export function timeOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date and time parts of a stored deadline (for the editor). */
export function splitDeadline(text: string | undefined): { date: string; time: string } | null {
  const d = parseDeadline(text);
  return d ? { date: dateKeyOf(d), time: timeOf(d) } : null;
}

/** "YYYY-MM-DD" + "H:MM" / "HH:MM" → stored deadline, or null when either part is invalid. */
export function joinDeadline(date: string, time: string): string | null {
  const minutes = parseTime(time);
  if (minutes === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const text = `${date}T${formatTime(minutes)}`;
  return parseDeadline(text) ? text : null;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole calendar days from `b` to `a` (local dates; DST-safe). */
function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da.getTime() - db.getTime()) / DAY);
}

/**
 * Absolute deadline: «сегодня, 18:00», «завтра, 09:00», «вчера, 20:00», otherwise «пт, 10 окт, 18:00»
 * (`long`: «пт, 10 октября, 18:00»); the year is added when it is not the current one.
 */
export function formatDeadline(due: Date, now: Date, month: "short" | "long" = "short"): string {
  const t = extra.dates;
  const time = timeOf(due);
  const days = dayDiff(due, now);
  if (days === 0) return `${t.today}, ${time}`;
  if (days === 1) return `${t.tomorrow}, ${time}`;
  if (days === -1) return `${t.yesterday}, ${time}`;
  return `${fullDate(due, now, month)}, ${time}`;
}

/** «пт, 10 окт» / «пт, 10 октября», plus the year when it differs from `now`'s. No relative words. */
export function fullDate(d: Date, now: Date, month: "short" | "long" = "short"): string {
  const t = extra.dates;
  const mon = month === "long" ? t.monthsGenitive[d.getMonth()] : t.monthsShort[d.getMonth()];
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${t.weekdaysShort[isoWeekday(d) - 1]}, ${d.getDate()} ${mon}${year}`;
}

// ---------------------------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------------------------

/** later: more than an hour left · soon: within the hour · now: the due minute · overdue: past it. */
export type DueTone = "later" | "soon" | "now" | "overdue";

export interface Countdown {
  text: string;
  tone: DueTone;
}

/**
 * «через 3 д 5 ч», «через 2 ч 14 мин», «через 9 мин»; with `live` the last hour is «через 12:34» (mm:ss);
 * «сейчас» during the due minute; «просрочено 12 мин», «просрочено 2 ч», «просрочено 3 д».
 * Time left is rounded up (at 16:00 a deadline at 18:14 is «через 2 ч 14 мин», as a person would say it),
 * time past is rounded down. Every value changes on a whole second (live) or a whole minute.
 */
export function countdown(due: number, now: number, live: boolean): Countdown {
  const c = extra.countdown;
  const left = due - now;
  if (left > 0) {
    const secs = Math.ceil(left / SECOND);
    if (live && secs < 3600) return { text: c.in(`${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`), tone: "soon" };
    const mins = Math.ceil(left / MINUTE);
    if (mins < 60) return { text: c.in(c.minutes(mins)), tone: "soon" };
    if (mins < 24 * 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return { text: c.in(m ? `${c.hours(h)} ${c.minutes(m)}` : c.hours(h)), tone: "later" };
    }
    const d = Math.floor(mins / (24 * 60));
    const h = Math.floor((mins % (24 * 60)) / 60);
    return { text: c.in(h ? `${c.days(d)} ${c.hours(h)}` : c.days(d)), tone: "later" };
  }
  const past = -left;
  if (past < MINUTE) return { text: c.now, tone: "now" };
  const mins = Math.floor(past / MINUTE);
  if (mins < 60) return { text: c.overdue(c.minutes(mins)), tone: "overdue" };
  if (mins < 24 * 60) return { text: c.overdue(c.hours(Math.floor(mins / 60))), tone: "overdue" };
  return { text: c.overdue(c.days(Math.floor(mins / (24 * 60)))), tone: "overdue" };
}

// ---------------------------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------------------------

export interface DueNote {
  note: Note;
  /** Epoch ms of the deadline, null without one (or with an invalid one). */
  due: number | null;
}

/**
 * Active notes first, then done ones; both groups follow `sort` (settings.notes.sort, the same on the tile and
 * in the settings list):
 * - "deadline": notes with a deadline by deadline (so overdue ones come first, the most overdue on top, then
 *   the nearest upcoming), then notes without one, newest first;
 * - "newest" / "oldest": by when the note was added.
 * Ties go by id, so the order never depends on the current time or on the stored order.
 */
export function orderNotes(notes: readonly Note[], sort: NoteSort): DueNote[] {
  return notes
    .map((note) => ({ note, due: deadlineMs(note.deadline) }))
    .sort((a, b) => {
      if (a.note.done !== b.note.done) return a.note.done ? 1 : -1;
      if (sort === "deadline") {
        if (a.due !== null && b.due !== null && a.due !== b.due) return a.due - b.due;
        if ((a.due === null) !== (b.due === null)) return a.due === null ? 1 : -1;
      }
      const age = sort === "oldest" ? a.note.created - b.note.created : b.note.created - a.note.created;
      return age || a.note.id.localeCompare(b.note.id);
    });
}

// ---------------------------------------------------------------------------------------------
// Deadline reminders (shown by src-tauri/src/reminders.rs; keep the rules in sync)
// ---------------------------------------------------------------------------------------------

export type DeadlineTiming = Pick<ReminderSettings, "deadlineFirst" | "deadlineRepeat" | "atDeadline">;

/**
 * Minutes before a deadline at which its reminders come, earliest first: the first one `deadlineFirst` before
 * it (none at 0), then every `deadlineRepeat` minutes while the deadline is still ahead, and 0 for the one at
 * the deadline itself. A repeat that would land on or after the deadline is not made.
 */
export function reminderOffsets({ deadlineFirst, deadlineRepeat, atDeadline }: DeadlineTiming): number[] {
  const out: number[] = [];
  if (deadlineFirst > 0) {
    out.push(deadlineFirst);
    if (deadlineRepeat > 0) for (let left = deadlineFirst - deadlineRepeat; left > 0; left -= deadlineRepeat) out.push(left);
  }
  if (atDeadline) out.push(0);
  return out;
}

/** The repeats really happen: an interval shorter than the time from the first reminder to the deadline. */
export function repeatsHappen({ deadlineFirst, deadlineRepeat }: DeadlineTiming): boolean {
  return deadlineFirst > 0 && deadlineRepeat > 0 && deadlineRepeat < deadlineFirst;
}

/** Deadlines that need a ticking clock: active notes only (done notes show a static date). */
export function activeDeadlines(items: readonly DueNote[]): number[] {
  const out: number[] = [];
  for (const it of items) if (!it.note.done && it.due !== null) out.push(it.due);
  return out;
}

/** Text as shown in lists: line breaks kept, blank lines and stray spaces around them dropped. */
export function displayText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]*\n\s*/g, "\n").trim();
}

// ---------------------------------------------------------------------------------------------
// One scheduler per window
// ---------------------------------------------------------------------------------------------

/** Timers fire a little after the boundary so the new second / minute is already current. */
const SLACK = 15;

/**
 * Delay until the next moment a countdown can change: the next whole second while a deadline is within the
 * hour and seconds are shown (`live`), otherwise the next whole minute (deadlines are whole minutes, so every
 * minute-precision value changes exactly there). Null without deadlines.
 */
export function nextTickDelay(now: number, deadlines: readonly number[], live: boolean): number | null {
  if (deadlines.length === 0) return null;
  const perSecond = live && deadlines.some((d) => d > now && d - now <= HOUR);
  const step = perSecond ? SECOND : MINUTE;
  return step - (now % step) + SLACK;
}

/**
 * Current time for countdowns, re-rendered only when a countdown can change (see nextTickDelay). No timer at
 * all without deadlines or while the window is hidden; the time is refreshed at once when it shows again and
 * whenever the set of deadlines changes.
 */
export function useDeadlineClock(deadlines: readonly number[], live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const key = deadlines.join(",");

  useEffect(() => {
    const list = key ? key.split(",").map(Number) : [];
    if (list.length === 0) return;
    let timer = 0;
    const tick = () => {
      window.clearTimeout(timer);
      const t = Date.now();
      setNow(t);
      if (document.visibilityState === "hidden") return;
      const delay = nextTickDelay(t, list, live);
      if (delay !== null) timer = window.setTimeout(tick, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
      else window.clearTimeout(timer);
    };
    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, live]);

  return now;
}

// ---------------------------------------------------------------------------------------------
// Time input and quick deadlines
// ---------------------------------------------------------------------------------------------

/**
 * Input mask for «ЧЧ:ММ»: digits and one colon (a dot, comma, dash or space typed as the separator becomes
 * the colon). Typing forward inserts the colon by itself: «18» → «18:», then «18:30»; four digits at once
 * («1830», pasted) become «18:30». Two digits that cannot be an hour are split («83» → «8:3»), as are three
 * («830» → «8:30», normalised to «08:30» on blur). Deleting is never fought: «18:» → «18».
 */
export function maskTime(prev: string, next: string): string {
  const v = next.replace(/[.,\-\s]/g, ":").replace(/[^\d:]/g, "");
  const colon = v.indexOf(":");
  if (colon >= 0) {
    const h = v.slice(0, colon).slice(0, 2);
    const m = v.slice(colon + 1).replace(/:/g, "").slice(0, 2);
    return `${h}:${m}`;
  }
  const d = v.slice(0, 4);
  const typing = next.length > prev.length;
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  if (d.length === 3) return Number(d.slice(0, 2)) > 23 ? `${d[0]}:${d.slice(1)}` : `${d.slice(0, 2)}:${d[2]}`;
  if (d.length === 2 && typing) return Number(d) > 23 ? `${d[0]}:${d[1]}` : `${d}:`;
  return d;
}

/** "8:30" → "08:30"; null when the text is not a valid time. */
export function normalizeTime(text: string): string | null {
  const m = parseTime(text);
  return m === null ? null : formatTime(m);
}

export interface DeadlineParts {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
}

/** «Сегодня вечером»: today at 20:00, or tomorrow at 20:00 once that is past. Also the default deadline. */
export function tonight(now: Date): DeadlineParts {
  const d = new Date(now);
  d.setHours(20, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return { date: dateKeyOf(d), time: "20:00" };
}

/** «Завтра утром»: tomorrow at 09:00. */
export function tomorrowMorning(now: Date): DeadlineParts {
  return { date: dateKeyOf(addDays(now, 1)), time: "09:00" };
}

/** «Через неделю»: seven days from today at the time already chosen (or the current time). */
export function inAWeek(now: Date, time: string | null): DeadlineParts {
  const chosen = time ? normalizeTime(time) : null;
  return { date: dateKeyOf(addDays(now, 7)), time: chosen ?? timeOf(now) };
}

// ---------------------------------------------------------------------------------------------
// Edits (functional updates of settings.notes)
// ---------------------------------------------------------------------------------------------

export interface NoteDraft {
  text: string;
  /** Stored deadline or null for none. */
  deadline: string | null;
  /** #RRGGBB or null for none. */
  color: string | null;
  /** «Напоминать о дедлайне». Only counts with a deadline: without one the stored choice stays as it is. */
  remind: boolean;
}

function withDraft(base: Note, draft: NoteDraft): Note {
  const note: Note = { id: base.id, text: draft.text.slice(0, MAX_TEXT), done: base.done, created: base.created };
  if (draft.deadline) note.deadline = draft.deadline;
  if (draft.color) note.color = draft.color;
  // Stored only when off (absent = on), like normalize() keeps it.
  if (draft.deadline ? !draft.remind : base.remind === false) note.remind = false;
  return note;
}

/**
 * Save the editor's draft: merged into the stored note `id` (its done flag and creation time stay as they
 * are now, even if the tile changed them meanwhile), or added on top as a new note.
 */
export function saveNote(id: string | null, draft: NoteDraft): Promise<void> {
  return settings.update((s) => {
    const list = s.notes.notes;
    if (id && list.some((n) => n.id === id)) {
      return { notes: { ...s.notes, notes: list.map((n) => (n.id === id ? withDraft(n, draft) : n)) } };
    }
    const fresh = withDraft({ id: id ?? crypto.randomUUID(), text: "", done: false, created: Date.now() }, draft);
    return { notes: { ...s.notes, notes: [fresh, ...list] } };
  });
}

/** Flip «выполнено» of one note, against the stored value at write time. */
export function toggleNote(id: string): Promise<void> {
  return settings.update((s) => ({
    notes: { ...s.notes, notes: s.notes.notes.map((n) => (n.id === id ? { ...n, done: !n.done } : n)) },
  }));
}

export function removeNote(id: string): Promise<void> {
  return settings.update((s) => ({ notes: { ...s.notes, notes: s.notes.notes.filter((n) => n.id !== id) } }));
}

/** Settings → «Заметки»; `edit` = a note id to edit, or NEW_NOTE for the editor on an empty note. */
export function openNotesSettings(edit?: string): Promise<void> {
  return invoke<void>("open_settings", edit ? { tab: "notes", edit } : { tab: "notes" }).catch(() => undefined);
}
