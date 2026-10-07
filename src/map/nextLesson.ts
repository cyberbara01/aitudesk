// «Показывать ближайшую пару»: the lesson whose room the map marks. That is today's lesson running now, else the first
// one that starts within 30 minutes, whose room text names a room of the plan. The room is found the way the schedule
// tile's «map-focus-room» is: mapRoomCode (the code the schedule tile sends), then the search field's lookup (the
// normalised code names its floor, rooms match by a substring of data-name, so a bare «223» names all three rooms 223
// of floor 2). The floors that are not drawn are looked up in roomIndex.ts.
//
// The answer can change only at a lesson's start minus 30 minutes, its start and its end, all whole minutes. One timer
// sleeps until the next of those moments, at most 15 minutes (timers do not follow the wall clock across a suspend,
// so a moment slept through is caught within that time). No timer runs while the option is off or the schedule is
// empty; the window becoming visible again re-reads the clock at once.
import { useEffect, useState } from "react";
import { isoWeekday, parseTime } from "../lib/design";
import { lessonsForDay, mapRoomCode, msUntilMidnight } from "../lib/schedule";
import type { Lesson } from "../lib/settings";
import { ROOM_NAMES } from "./roomIndex";
import type { Floor } from "./types";
import { floorFromQuery, normalizeQuery } from "./useRoomSearch";

/** A lesson is marked from this many minutes before its start until it ends. */
export const SOON_MINUTES = 30;

const MINUTE = 60_000;
/** Longest sleep of the timer (see above). */
const IDLE_RECHECK = 15 * MINUTE;
/** Fire a little after the moment, so the new minute has surely begun. */
const TICK_SLACK = 50;

export interface NextLesson {
  lesson: Lesson;
  /** Running now; otherwise it starts within SOON_MINUTES. */
  running: boolean;
  floor: Floor;
  /** data-name of every room of that floor the lesson's room code matches. */
  rooms: readonly string[];
}

/** Rooms of the plan that a lesson's room text names, or null («Спортзал», «Онлайн», a code the plan does not have). */
export function resolveRoom(text: string): { floor: Floor; rooms: readonly string[] } | null {
  const code = mapRoomCode(text);
  if (!code) return null;
  const query = normalizeQuery(code);
  const floor = floorFromQuery(query);
  if (floor === null) return null;
  const rooms = ROOM_NAMES[floor].filter((name) => name.includes(query));
  return rooms.length > 0 ? { floor, rooms } : null;
}

/** Milliseconds since local midnight. */
function msOfDay(d: Date): number {
  return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
}

/** The lesson to mark at `now`, or null. */
export function nextLessonAt(lessons: readonly Lesson[], now: Date): NextLesson | null {
  const t = msOfDay(now);
  for (const lesson of lessonsForDay(lessons, isoWeekday(now))) {
    const start = parseTime(lesson.start);
    const end = parseTime(lesson.end);
    if (start === null || end === null || end * MINUTE <= t) continue;
    // Sorted by start: every lesson after this one starts later still.
    if ((start - SOON_MINUTES) * MINUTE > t) break;
    const match = resolveRoom(lesson.room);
    if (match) return { lesson, running: start * MINUTE <= t, ...match };
  }
  return null;
}

/** Milliseconds until nextLessonAt may answer differently: the next start minus 30 minutes, start or end today, else midnight. */
export function msToNextChange(lessons: readonly Lesson[], now: Date): number {
  const t = msOfDay(now);
  const day = isoWeekday(now);
  let next = Infinity;
  for (const lesson of lessons) {
    if (lesson.day !== day) continue;
    const start = parseTime(lesson.start);
    const end = parseTime(lesson.end);
    for (const m of [start === null ? null : start - SOON_MINUTES, start, end]) {
      if (m !== null && m * MINUTE > t) next = Math.min(next, m * MINUTE);
    }
  }
  return next === Infinity ? msUntilMidnight(now) : next - t;
}

/** Everything the tile shows of the answer: a new object with the same key changes nothing. */
const keyOf = (n: NextLesson | null): string =>
  n ? [n.lesson.id, n.lesson.title, n.lesson.start, n.lesson.end, n.running, n.floor, ...n.rooms].join("\n") : "";

/**
 * The lesson to mark, kept current by one timer (see above). `lessons` should keep its identity until the lessons
 * really change: a new array restarts the timer. The first value is computed during the first render, so the
 * marker is there from the first frame and nothing changes after it.
 */
export function useNextLesson(lessons: readonly Lesson[], enabled: boolean): NextLesson | null {
  const [next, setNext] = useState<NextLesson | null>(() => (enabled ? nextLessonAt(lessons, new Date()) : null));
  useEffect(() => {
    if (!enabled || lessons.length === 0) {
      setNext(null);
      return;
    }
    let timer = 0;
    const run = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const found = nextLessonAt(lessons, now);
      setNext((prev) => (keyOf(prev) === keyOf(found) ? prev : found));
      timer = window.setTimeout(run, Math.min(msToNextChange(lessons, now), IDLE_RECHECK) + TICK_SLACK);
    };
    run();
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lessons, enabled]);
  return next;
}
