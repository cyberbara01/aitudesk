// «Расписание»: a row of weekdays on top, the chosen day's lessons below. The lesson running now gets an
// accent bar and «Сейчас · до 09:20», the first upcoming one «Далее · через 25 мин», finished ones are
// dimmed. A pencil pops up on the hovered lesson and opens it in the settings, «+ Добавить пару» after the day's
// lessons (and in an empty day) adds one to that day, and the right-click menu does both. The time is re-read at minute boundaries while today still has lessons ahead, otherwise only
// around midnight. Nothing renders before the stored settings are loaded, so the first frame is final.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type { MenuItemSpec } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { AddRow, EditButton } from "../components/ListActions";
import { MaskedText, PrivacyScope, RevealButton, useRevealed } from "../components/Masked";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Tile, type Grow } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.schedule";
import { isoWeekday } from "../lib/design";
import {
  dayStates,
  hasLessonsAhead,
  lessonInkStyle,
  lessonsForDay,
  MAP_FOCUS_EVENT,
  mapRoomCode,
  minuteKey,
  minutesUntil,
  msToNextMinute,
  msUntilMidnight,
  nearestDay,
  nextLessonAfter,
  sameDate,
  TIME_SEP,
  visibleDays,
  type LessonState,
} from "../lib/schedule";
import type { Lesson, Weekday } from "../lib/settings";
import { useFolded } from "../lib/tileView";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";

type DayKey = `${Weekday}`;

/** Fire a little after the boundary so the new minute or day has surely begun. */
const TICK_SLACK = 50;
/**
 * Longest sleep while nothing on the tile can change before midnight. Also bounds how late a midnight
 * missed during sleep is noticed (timers do not follow the wall clock across a suspend).
 */
const IDLE_RECHECK = 15 * 60_000;
/** Scroll slack (px) below which the list counts as fully shown and the edge fades go away. */
const FADE_THRESHOLD = 1;
/** Drawn for the default size (src-tauri/src/layout.rs): a widget bigger both ways shows bigger text. */
const GROW: Grow = { w: 280, h: 256 };
/** Lists lower than this (a tile about 200 px high or less) get 8 px edge fades instead of 16 px. */
const SHORT_LIST = 120;
/** The text lines of a row, as laid out (title as one unit, also while masked), and «+ Добавить пару» after them. */
const LINE_SELECTOR = ".sched-head, .sched-title, .sched-meta, .list-add";
/** Fade over the last complete line when the list is cut at a line boundary and more follows. */
const SNAP_FADE = "8px";
/** «Показать на карте» bubble: the kit Tooltip's delay and its distance from the room and the window edges. */
const TIP_DELAY = 500;
const TIP_GAP = 4;
/**
 * A row scrolled into view stops this far below the list's top edge: the previous row peeks out under the
 * top fade (schedule.css) and the row's own text (after its 4 px padding) begins where the fade ends.
 */
const focusPeek = (listHeight: number) => (listHeight < SHORT_LIST ? 4 : 12);

/** «Добавить пару»: the settings page opens straight on a new lesson, for `day` when given (else today). */
const openNewLesson = (day?: Weekday) =>
  void invoke("open_settings", { tab: "schedule", edit: day ? `new-${day}` : "new" }).catch(() => undefined);
/** The pencil and «Изменить»: the settings page opens on this lesson. */
const openLesson = (id: string) => void invoke("open_settings", { tab: "schedule", edit: id }).catch(() => undefined);

/**
 * The current time as the tile needs it. While today has a lesson that has not ended, it ticks on every
 * minute boundary (the badges count minutes); otherwise it sleeps until midnight (re-checking every
 * 15 min) and re-renders only when the date changes. Re-read when the lessons change and when the window
 * becomes visible again.
 */
function useNow(lessons: readonly Lesson[], active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    // The tick on which the last lesson of the day ends must still be published (the row turns «past»).
    let wasActive = false;
    const run = (fresh: boolean) => {
      window.clearTimeout(timer);
      const d = new Date();
      const active = hasLessonsAhead(lessons, d);
      const live = fresh || active || wasActive;
      wasActive = active;
      setNow((prev) => (!sameDate(prev, d) || (live && minuteKey(prev) !== minuteKey(d)) ? d : prev));
      const delay = active ? msToNextMinute(d) : Math.min(msUntilMidnight(d), IDLE_RECHECK);
      timer = window.setTimeout(() => run(false), delay + TICK_SLACK);
    };
    run(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") run(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lessons, active]);
  return now;
}

/** The room as a link to the map tile (given only while the map tile is on). */
interface RoomLink {
  /** Pointer over the room: the «Показать на карте» bubble after the usual delay. */
  enter: (el: HTMLElement) => void;
  leave: () => void;
  /** Click: ask the map window to show the room (ignored for a room hidden under the list's edges). */
  open: (el: HTMLElement, code: string) => void;
}

/**
 * «teacher · room», each through MaskedText; while masked the whole line is one row of dots. A room that the
 * map knows is a link, but only once the text is shown: dots never link anywhere.
 */
function LessonMeta({ lesson, roomLink }: { lesson: Lesson; roomLink?: RoomLink }) {
  const shown = useRevealed(lesson.id);
  const teacher = lesson.teacher.trim();
  const room = lesson.room.trim();
  if (!teacher && !room) return null;
  if (!shown) return <MaskedText id={lesson.id} text={teacher || room} className="sched-meta caption" />;
  // Mono only for a room code: «Спортзал» stays in the text font and is not a link.
  const code = room ? mapRoomCode(room) : null;
  return (
    <span className="sched-meta caption ellipsis">
      {teacher && <MaskedText id={lesson.id} text={teacher} />}
      {teacher && room ? " · " : null}
      {room &&
        (roomLink && code ? (
          <span
            className="sched-room mono"
            role="link"
            tabIndex={0}
            aria-label={`${room}, ${extra.showOnMap}`}
            onPointerEnter={(e) => roomLink.enter(e.currentTarget)}
            onPointerLeave={roomLink.leave}
            onPointerDown={roomLink.leave}
            onClick={(e) => {
              e.stopPropagation();
              roomLink.open(e.currentTarget, code);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              roomLink.open(e.currentTarget, code);
            }}
          >
            {room}
          </span>
        ) : (
          <MaskedText id={lesson.id} text={room} className={code ? "mono" : undefined} />
        ))}
    </span>
  );
}

export interface LessonRowProps {
  lesson: Lesson;
  state: LessonState;
  /** Needed for the «Далее · через N мин» countdown. */
  now?: Date;
  /** Static preview in the lesson editor: no list semantics, no eye button. */
  preview?: boolean;
  /** Room as a link to the map (tile only, while the map tile is on). */
  roomLink?: RoomLink;
}

/**
 * One lesson: a 3 px bar on the left (lesson colour or accent; full while running, soft for a coloured
 * lesson, empty otherwise), then «08:00 - 09:20» with the state badge, the title (up to two lines) and
 * «teacher · room». The eye sits at the right end when privacy is on. Also the live preview in the editor.
 *
 * The badge is «Сейчас · до 09:20» / «Далее · через 25 мин»; in a narrow row it shortens to «Сейчас» /
 * «через 25 мин» (the range already shows the end) so it stays on the time line, and wraps under it last.
 */
export function LessonRow({ lesson, state, now, preview, roomLink }: LessonRowProps) {
  const badge =
    state === "now"
      ? { label: ru.schedule.now, detail: ru.schedule.until(lesson.end) }
      : state === "next" && now
        ? { label: ru.schedule.next, detail: extra.startsIn(minutesUntil(lesson, now)) }
        : null;
  const cls = ["sched-row", state, lesson.color ? "colored" : "", preview ? "" : "reveal-row"].filter(Boolean).join(" ");
  return (
    <div className={cls} style={lessonInkStyle(lesson.color)} data-id={lesson.id} role={preview ? undefined : "listitem"}>
      <span className="sched-bar" aria-hidden="true" />
      <div className="sched-body">
        <div className="sched-head caption">
          {/* Only the digits take the number font: in Rice's monospace the spaces would look doubled. */}
          <span className="sched-time">
            <span className="num">{lesson.start}</span>
            {TIME_SEP}
            <span className="num">{lesson.end}</span>
          </span>
          {badge && (
            <span className="sched-badge">
              <span className="sched-badge-label">{badge.label}</span>
              <span className="sched-badge-sep"> · </span>
              <span className="sched-badge-detail">{badge.detail}</span>
            </span>
          )}
        </div>
        <MaskedText id={lesson.id} text={lesson.title.trim() || ru.schedule.lesson} className="sched-title body-strong" />
        <LessonMeta lesson={lesson} roomLink={preview ? undefined : roomLink} />
      </div>
      {!preview && <EditButton label={extra.editLesson} onEdit={() => openLesson(lesson.id)} />}
      {!preview && <RevealButton id={lesson.id} />}
    </div>
  );
}

/**
 * The day's lessons: scrolls (the thumb shows under the pointer), edge fades only where rows are hidden. At the
 * bottom the list ends on a whole text line: a line the edge would slice is hidden (the rest of the box
 * stays empty) and a short fade over the last complete line says that more follows.
 */
function LessonList({ lessons, day, now, mapLink }: { lessons: readonly Lesson[]; day: Weekday; now: Date; mapLink: boolean }) {
  const states = useMemo(() => dayStates(lessons, now), [lessons, now]);
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false, short: false });

  // «Показать на карте»: one bubble for the list, drawn next to it rather than inside it (inside the scroll
  // box it would be faded or cut by the edge masks); the kit's .tooltip look, delay and placement.
  const [tipFor, setTipFor] = useState<HTMLElement | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef(0);
  const hideTip = useCallback(() => {
    window.clearTimeout(tipTimer.current);
    setTipFor(null);
  }, []);
  /** The room lies wholly in the visible part of the list (not below the bottom cut, not above the top). */
  const inView = useCallback((el: HTMLElement) => {
    const list = ref.current;
    if (!list) return false;
    const box = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // The list may be scaled up with a grown widget: its own heights times that scale are screen px.
    const k = list.offsetHeight ? box.height / list.offsetHeight : 1;
    const visible = (parseFloat(list.style.getPropertyValue("--cut")) || list.clientHeight) * k;
    return r.top >= box.top - 0.5 && r.bottom <= box.top + visible + 0.5;
  }, []);
  const roomLink = useMemo<RoomLink | undefined>(() => {
    if (!mapLink) return undefined;
    return {
      enter: (el) => {
        window.clearTimeout(tipTimer.current);
        if (inView(el)) tipTimer.current = window.setTimeout(() => setTipFor(el), TIP_DELAY);
      },
      leave: hideTip,
      open: (el, code) => {
        hideTip();
        if (inView(el)) void emitTo("map", MAP_FOCUS_EVENT, { room: code }).catch(() => undefined);
      },
    };
  }, [mapLink, hideTip, inView]);

  // While the bubble is up it goes with the window focus, a resize or Esc, and when its room is gone (the row
  // was masked again, the day changed).
  useEffect(() => {
    if (!tipFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideTip();
    };
    window.addEventListener("blur", hideTip);
    window.addEventListener("resize", hideTip);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", hideTip);
      window.removeEventListener("resize", hideTip);
      window.removeEventListener("keydown", onKey);
    };
  }, [tipFor, hideTip]);
  useEffect(() => {
    if (tipFor && !tipFor.isConnected) hideTip();
  });
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);
  // Below the room, above it when there is no room, always inside the tile (as the kit's Tooltip).
  useLayoutEffect(() => {
    if (!tipFor) {
      setTipPos(null);
      return;
    }
    const a = tipFor.getBoundingClientRect();
    const t = tipRef.current?.getBoundingClientRect();
    if (!t) return;
    const { innerWidth: vw, innerHeight: vh } = window;
    const left = Math.max(TIP_GAP, Math.min(a.left + a.width / 2 - t.width / 2, vw - t.width - TIP_GAP));
    let top = a.bottom + TIP_GAP;
    if (top + t.height > vh - TIP_GAP) top = a.top - TIP_GAP - t.height;
    top = Math.max(TIP_GAP, Math.min(top, vh - t.height - TIP_GAP));
    setTipPos({ left, top });
  }, [tipFor]);

  const updateFades = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const height = el.clientHeight;
    const top = el.scrollTop > FADE_THRESHOLD;
    const bottom = el.scrollHeight - el.scrollTop - height > FADE_THRESHOLD;
    const short = height < SHORT_LIST;
    // Bottom of the last line that lies wholly inside the box (lines come in vertical order). Written to
    // the element directly: it changes while scrolling and must not re-render the rows.
    let cut = 0;
    if (bottom) {
      const box = el.getBoundingClientRect();
      // Screen px back to the list's own px (it is scaled up with a grown widget).
      const k = el.offsetHeight ? box.height / el.offsetHeight : 1;
      for (const line of Array.from(el.querySelectorAll<HTMLElement>(LINE_SELECTOR))) {
        const r = line.getBoundingClientRect();
        if ((r.bottom - box.top) / k > height + 0.5) break;
        if ((r.top - box.top) / k >= -0.5) cut = (r.bottom - box.top) / k;
      }
    }
    if (cut > 0 && cut < height - 0.5) {
      el.style.setProperty("--cut", `${Math.round(cut)}px`);
      el.style.setProperty("--fade-end", SNAP_FADE);
    } else {
      el.style.removeProperty("--cut");
      el.style.removeProperty("--fade-end");
    }
    setFade((f) => (f.top === top && f.bottom === bottom && f.short === short ? f : { top, bottom, short }));
  }, []);

  // The rows are observed too: a badge appearing at a minute tick makes the content taller in the same box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateFades();
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    for (const row of Array.from(el.children)) ro.observe(row);
    return () => ro.disconnect();
  }, [updateFades, lessons]);

  // When the running or upcoming lesson changes, scroll it into view (finished ones may leave at the top).
  const focusId = useMemo(() => {
    for (const [id, st] of states) if (st === "now" || st === "next") return id;
    return null;
  }, [states]);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list || !focusId) return;
    const row = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusId)}"]`);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const viewTop = list.scrollTop;
    const peek = focusPeek(list.clientHeight);
    // Under the top fade counts as hidden.
    const hiddenAbove = top < viewTop + (viewTop > 0 ? peek : 0);
    const hiddenBelow = bottom > viewTop + list.clientHeight;
    if (hiddenAbove || hiddenBelow) list.scrollTop = Math.max(0, top - (top > 0 ? peek : 0));
  }, [focusId]);

  const onScroll = () => {
    updateFades();
    hideTip();
  };

  const cls = ["sched-list", fade.top ? "fade-top" : "", fade.bottom ? "fade-bottom" : "", fade.short ? "short" : ""].filter(Boolean).join(" ");
  return (
    <>
      <div ref={ref} className={cls} role="list" onScroll={onScroll}>
        {lessons.map((l) => (
          <LessonRow key={l.id} lesson={l} state={states.get(l.id) ?? "later"} now={now} roomLink={roomLink} />
        ))}
        <AddRow label={ru.schedule.addLesson} onAdd={() => openNewLesson(day)} item />
      </div>
      {/* In the page's body, like every tooltip: inside a grown widget the scaled content would carry it off. */}
      {tipFor &&
        createPortal(
          <div ref={tipRef} role="tooltip" className="tooltip" style={tipPos ?? { left: 0, top: 0, visibility: "hidden" }}>
            {extra.showOnMap}
          </div>,
          document.body,
        )}
    </>
  );
}

/** No lessons at all: the kit's empty state with a button straight into a new lesson. */
function EmptySchedule() {
  return (
    <EmptyState
      compact
      className="sched-empty"
      title={extra.emptyTitle}
      hint={extra.emptyHint}
      action={{ label: ru.schedule.addLesson, icon: "add", onClick: () => openNewLesson() }}
    />
  );
}

/** A day without lessons, with «Добавить пару» for it; for today also when the next one is. */
function EmptyDay({ day, isToday, lessons, today }: { day: Weekday; isToday: boolean; lessons: readonly Lesson[]; today: Weekday }) {
  const next = isToday ? nextLessonAfter(lessons, today) : null;
  const when = next ? (next.tomorrow ? extra.tomorrow : ru.schedule.weekdaysAt[next.day - 1]) : "";
  return (
    <EmptyState
      compact
      className="sched-empty"
      title={isToday ? ru.schedule.noLessonsToday : ru.schedule.noLessons}
      hint={next ? extra.nextLesson(when, next.lesson.start) : undefined}
      action={{ label: ru.schedule.addLesson, icon: "add", onClick: () => openNewLesson(day) }}
    />
  );
}

export function ScheduleTile() {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  const { showWeekend, showEmptyDays, followToday, background, privacy } = s.schedule;
  // The store hands out a new lessons array on every change anywhere (a clock slider dragged in settings
  // included); keyed by content, the timers, memos and observers below only react to real lesson edits.
  const lessonsKey = JSON.stringify(s.schedule.lessons);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lessons = useMemo(() => s.schedule.lessons, [lessonsKey]);
  // Folded to its icon, the schedule does not tick.
  const now = useNow(lessons, !useFolded());
  const today = isoWeekday(now);
  // Memoised: the Segmented options and its indicator measurement key off the array identity.
  const days = useMemo(() => visibleDays(lessons, showWeekend, showEmptyDays), [lessons, showWeekend, showEmptyDays]);

  // The viewed day is derived on every render: today (or the nearest following day in the row) unless the
  // user picked another one. So it follows the loaded settings and every switch by itself, and a day that
  // left the row can never stay selected.
  const [picked, setPicked] = useState<Weekday | null>(null);
  const viewDay = picked !== null && days.includes(picked) ? picked : nearestDay(today, days);

  // «Всегда открывать сегодняшний день»: the pick is dropped at midnight and when the option is turned on.
  useEffect(() => {
    if (followToday) setPicked(null);
  }, [followToday, today]);
  // A picked day that left the row is forgotten rather than coming back later on its own.
  useEffect(() => {
    if (picked !== null && !days.includes(picked)) setPicked(null);
  }, [picked, days]);

  const dayLessons = useMemo(() => lessonsForDay(lessons, viewDay), [lessons, viewDay]);
  const options = useMemo<SegmentedOption<DayKey>[]>(
    () => days.map((d) => ({ value: `${d}` as DayKey, label: ru.schedule.weekdaysMin[d - 1] })),
    [days],
  );

  // Right-click on a lesson: «Изменить» it; anywhere: «Добавить пару» to the day shown.
  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const add: MenuItemSpec = { id: "add-lesson", label: ru.schedule.addLesson, icon: "add", onSelect: () => openNewLesson(viewDay) };
      const id = target.closest<HTMLElement>(".sched-row[data-id]")?.dataset.id;
      if (!id || !lessons.some((l) => l.id === id)) return [add];
      return [{ id: "edit-lesson", label: ru.menu.edit, icon: "edit", onSelect: () => openLesson(id) }, add];
    },
    [lessons, viewDay],
  );

  return (
    <Tile label="schedule" className="tile-schedule" background={background} grow={GROW} menuItems={menuItems}>
      {loaded && (
        <PrivacyScope masked={privacy}>
          {lessons.length === 0 ? (
            <EmptySchedule />
          ) : (
            <>
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
              {dayLessons.length > 0 ? (
                // Keyed by day: a newly chosen day opens at its first lesson. Rooms link to the map tile while it is on.
                <LessonList key={viewDay} lessons={dayLessons} day={viewDay} now={now} mapLink={s.tiles.map} />
              ) : (
                <EmptyDay day={viewDay} isToday={viewDay === today} lessons={lessons} today={today} />
              )}
            </>
          )}
        </PrivacyScope>
      )}
    </Tile>
  );
}
