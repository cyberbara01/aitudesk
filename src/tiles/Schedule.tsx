// «Расписание»: a row of weekdays on top, the selected day's lessons below. Today's lesson that is
// running now gets a coloured bar and «Сейчас · до HH:MM»; the first upcoming one «Далее · через N мин»;
// finished ones are dimmed. State is re-evaluated every 30 s, at midnight and when the window is shown.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../components/Button";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { isoWeekday } from "../lib/design";
import { dayStates, fallbackDay, lessonsForDay, minutesUntil, msUntilMidnight, timeRange, visibleDays, type LessonState } from "../lib/schedule";
import type { Lesson, Weekday } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";

type DayKey = `${Weekday}`;

/** How often the past / now / next states are re-evaluated. */
const STATE_INTERVAL = 30_000;
/** Below this window height the empty states drop their icon so the text always fits. */
const COMPACT_HEIGHT = 168;
/** Scroll slack (px) below which the list counts as fully shown and the edge fades go away. */
const FADE_THRESHOLD = 1;

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
}

/**
 * One lesson: time column (start / end), a vertical bar (lesson colour or accent, 3 px while running,
 * 2 px otherwise), then the state badge, the title (up to two lines) and «teacher · room».
 * Also used as the live preview in the lesson editor.
 */
export function LessonRow({ lesson, state, now }: LessonRowProps) {
  const badge =
    state === "now"
      ? `${ru.schedule.now} · ${ru.schedule.until(lesson.end)}`
      : state === "next"
        ? `${ru.schedule.next} · ${ru.schedule.startsIn(minutesUntil(lesson, now))}`
        : null;
  const teacher = lesson.teacher.trim();
  const room = lesson.room.trim();
  const cls = ["sched-row", state, lesson.color ? "colored" : ""].filter(Boolean).join(" ");
  const style = lesson.color ? ({ "--lesson-color": lesson.color } as CSSProperties) : undefined;
  return (
    <div className={cls} style={style} data-id={lesson.id} role="listitem">
      <div className="sched-time" aria-label={timeRange(lesson)}>
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
  const days = visibleDays(showWeekend);
  const [day, setDay] = useState<Weekday>(() => fallbackDay(today, days));

  // «Всегда открывать сегодняшний день»: at midnight (today changes), when the option is switched on,
  // and whenever the window becomes visible again.
  const showWeekendRef = useRef(showWeekend);
  showWeekendRef.current = showWeekend;
  useEffect(() => {
    if (!followToday) return;
    const reset = () => setDay(fallbackDay(isoWeekday(new Date()), visibleDays(showWeekendRef.current)));
    reset();
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [followToday, today]);

  // A hidden weekend day cannot stay selected (e.g. Saturday after «Показывать выходные» was turned off).
  const viewDay = days.includes(day) ? day : fallbackDay(today, days);
  const dayLessons = useMemo(() => lessonsForDay(lessons, viewDay), [lessons, viewDay]);
  const states = useMemo(() => dayStates(dayLessons, now), [dayLessons, now]);
  const options = useMemo<SegmentedOption<DayKey>[]>(
    () => days.map((d) => ({ value: `${d}` as DayKey, label: ru.schedule.weekdaysShort[d - 1] })),
    [days],
  );

  // Scroll fades: shown only while there really is more content in that direction.
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
    return () => ro.disconnect();
  }, [updateFades, dayLessons]);

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
    body = (
      <div className="sched-empty">
        {!compact && <Icon name="calendar_ltr" />}
        <span className="body">{ru.schedule.empty}</span>
        <Button variant="subtle" size="sm" icon="edit" onClick={() => void openSettings()}>
          {ru.schedule.editSchedule}
        </Button>
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
    <Tile label="schedule" className={compact ? "tile-schedule compact" : "tile-schedule"} background={background} menuItems={menuItems}>
      <div className="sched-days" data-today={today}>
        <Segmented<DayKey>
          size="sm"
          fill
          options={options}
          value={`${viewDay}`}
          onChange={(v) => setDay(Number(v) as Weekday)}
          ariaLabel={ru.schedule.day}
        />
      </div>
      {body}
    </Tile>
  );
}
