// «Расписание»: a row of weekdays on top, the selected day's lessons below. Today's lesson that is
// running now gets a coloured bar and «Сейчас · до HH:MM»; the first upcoming one «Далее · через N мин»;
// finished ones are dimmed. State is re-evaluated every 30 s, at midnight and when the window is shown.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../components/Button";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.schedule";
import { isoWeekday } from "../lib/design";
import { dayStates, fallbackDay, lessonsForDay, minutesUntil, msUntilMidnight, visibleDays, type LessonState } from "../lib/schedule";
import type { Lesson, Weekday } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";

type DayKey = `${Weekday}`;

/** How often the past / now / next states are re-evaluated. */
const STATE_INTERVAL = 30_000;
/**
 * Below this window height the empty states go compact: the icon and the hint sentence are dropped so
 * what remains (the action, or one line of text) always fits. At 200 px the full state (icon + two
 * lines + button ≈ 104 px) fits under the day row in every style.
 */
const COMPACT_HEIGHT = 200;
/** Scroll slack (px) below which the list counts as fully shown and the edge fades go away. */
const FADE_THRESHOLD = 1;
/**
 * Resize floor (logical px): a 7-day row keeps ≥ 27 px per segment and one full lesson row (time column,
 * badge, title, meta) fits under it. Module-level so the Tile's edit-mode hooks see a stable object.
 */
const MIN_SIZE: { w: number; h: number } = { w: 240, h: 160 };

const openSettings = () => invoke("open_settings", { tab: "schedule" }).catch(() => undefined);

/** Current time, refreshed every 30 s, right after midnight and whenever the window becomes visible. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let midnight = 0;
    const tick = () => setNow(new Date());
    const armMidnight = () => {
      window.clearTimeout(midnight);
      midnight = window.setTimeout(() => {
        tick();
        armMidnight();
      }, msUntilMidnight(new Date()) + 250);
    };
    const interval = window.setInterval(tick, STATE_INTERVAL);
    armMidnight();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        armMidnight();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(midnight);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}

/** True while the tile window is too short for decorated empty states. */
function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerHeight < COMPACT_HEIGHT);
  useEffect(() => {
    const onResize = () => setCompact(window.innerHeight < COMPACT_HEIGHT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return compact;
}

export interface LessonRowProps {
  lesson: Lesson;
  state: LessonState;
  now: Date;
  /** Rendered as a static preview (inside the editor's `role="img"` box), not as a list item. */
  preview?: boolean;
}

/**
 * One lesson: time column (start over end — the stacked layout keeps the title column wide on narrow
 * tiles; the brief's single «08:00–09:20» line is used in settings), a vertical bar (lesson colour or
 * accent, painted only while running or when the lesson is coloured), then the state badge, the title
 * (up to two lines) and «teacher · room». Also used as the live preview in the lesson editor.
 */
export function LessonRow({ lesson, state, now, preview }: LessonRowProps) {
  const badge =
    state === "now"
      ? `${ru.schedule.now} · ${ru.schedule.until(lesson.end)}`
      : state === "next"
        ? `${ru.schedule.next} · ${extra.startsIn(minutesUntil(lesson, now))}`
        : null;
  const teacher = lesson.teacher.trim();
  const room = lesson.room.trim();
  const cls = ["sched-row", state, lesson.color ? "colored" : ""].filter(Boolean).join(" ");
  const style = lesson.color ? ({ "--lesson-color": lesson.color } as CSSProperties) : undefined;
  return (
    <div className={cls} style={style} data-id={lesson.id} role={preview ? undefined : "listitem"}>
      <div className="sched-time">
        <span className="sched-start">{lesson.start}</span>
        <span className="sched-end">{lesson.end}</span>
      </div>
      <span className="sched-bar" aria-hidden="true" />
      <div className="sched-content">
        {badge && <span className="sched-badge caption">{badge}</span>}
        <span className="sched-title body-strong">{lesson.title}</span>
        {(teacher || room) && (
          <span className="sched-meta caption ellipsis">
            {teacher}
            {teacher && room ? " · " : ""}
            {room && <span className="mono">{room}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

export function ScheduleTile() {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const { lessons, showWeekend, followToday, background } = s.schedule;
  const now = useNow();
  const compact = useCompact();
  const today = isoWeekday(now);
  // Memoised: the Segmented options and its indicator measurement key off the array identity.
  const days = useMemo(() => visibleDays(showWeekend, lessons), [showWeekend, lessons]);

  // The viewed day is «today» unless the user picked another one (null = follow today). Deriving it
  // on render means the view follows the loaded settings and «Показывать выходные» automatically,
  // and a hidden weekend day can never stay selected (falls back to the first visible day).
  const [picked, setPicked] = useState<Weekday | null>(null);
  const viewDay = picked !== null && days.includes(picked) ? picked : fallbackDay(today, days);

  // «Всегда открывать сегодняшний день»: back to today at midnight (today changes) and when the option
  // is switched on. Re-showing the tile windows keeps the user's pick.
  useEffect(() => {
    if (followToday) setPicked(null);
  }, [followToday, today]);

  const dayLessons = useMemo(() => lessonsForDay(lessons, viewDay), [lessons, viewDay]);
  const states = useMemo(() => dayStates(dayLessons, now), [dayLessons, now]);
  const options = useMemo<SegmentedOption<DayKey>[]>(
    () => days.map((d) => ({ value: `${d}` as DayKey, label: ru.schedule.weekdaysShort[d - 1] })),
    [days],
  );

  // Scroll fades: shown only while there really is more content in that direction. The rows are
  // observed too, so a badge appearing at the 30 s tick (same list box, taller content) updates them.
  const listRef = useRef<HTMLDivElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const updateFades = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setFadeTop(el.scrollTop > FADE_THRESHOLD);
    setFadeBottom(el.scrollHeight - el.scrollTop - el.clientHeight > FADE_THRESHOLD);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    updateFades();
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    for (const row of Array.from(el.children)) ro.observe(row);
    return () => ro.disconnect();
  }, [updateFades, dayLessons]);

  // A newly chosen day opens at its first lesson (the list element persists across day switches).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = 0;
  }, [viewDay]);

  // When the running / upcoming lesson changes, bring it into view (the list itself scrolls, never the page).
  const focusId = useMemo(() => {
    for (const [id, st] of states) if (st === "now" || st === "next") return id;
    return null;
  }, [states]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !focusId) return;
    const row = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusId)}"]`);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - 4);
  }, [focusId, viewDay]);

  const menuItems = useCallback(
    (): MenuItemSpec[] => [{ id: "edit-schedule", label: ru.schedule.editSchedule, icon: "edit", onSelect: () => void openSettings() }],
    [],
  );

  let body: ReactNode = null;
  if (!loaded) {
    body = null;
  } else if (lessons.length === 0) {
    // Compact: only the action — it is the one thing that must stay reachable at the minimum height.
    const action = (
      <Button variant="subtle" size="sm" icon="add" onClick={() => void openSettings()}>
        {ru.schedule.addLesson}
      </Button>
    );
    body = (
      <div className="sched-empty">
        {compact ? (
          action
        ) : (
          <>
            <Icon name="calendar_ltr" />
            <span className="body">{ru.schedule.empty}</span>
            {action}
          </>
        )}
      </div>
    );
  } else if (dayLessons.length === 0) {
    const isToday = viewDay === today;
    body = (
      <div className="sched-empty">
        {!compact && <Icon name={isToday ? "weather_sunny" : "calendar_ltr"} />}
        <span className="body">{isToday ? ru.schedule.noLessonsToday : ru.schedule.noLessons}</span>
      </div>
    );
  } else {
    const listCls = ["sched-list", fadeTop ? "fade-top" : "", fadeBottom ? "fade-bottom" : ""].filter(Boolean).join(" ");
    body = (
      <div ref={listRef} className={listCls} role="list" onScroll={updateFades}>
        {dayLessons.map((l) => (
          <LessonRow key={l.id} lesson={l} state={states.get(l.id) ?? "later"} now={now} />
        ))}
      </div>
    );
  }

  return (
    <Tile label="schedule" minSize={MIN_SIZE} className={compact ? "tile-schedule compact" : "tile-schedule"} background={background} menuItems={menuItems}>
      <div className="sched-days" data-today={today}>
        <Segmented<DayKey>
          size="sm"
          fill
          options={options}
          value={`${viewDay}`}
          onChange={(v) => setPicked(Number(v) as Weekday)}
          ariaLabel={ru.schedule.day}
        />
      </div>
      {body}
    </Tile>
  );
}
