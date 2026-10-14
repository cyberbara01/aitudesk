// «Календарь»: the month (weeks from Monday) with today marked, the weekends in their colour and a dot under every
// day a note has a deadline on; under it the line of the day picked (its classes and deadlines). The arrows turn the
// month, the title goes back to today. A widget too small for the month at a readable size shows this week instead
// (its arrows turn weeks); the day line gives way first. A right click on a day offers a note or a reminder for it.
//
// Every size comes from one cell: the smaller of a seventh of the width and the height shared by the weeks, the
// title, the weekday names and the day line (each a fixed share of a cell). The cells stay square and the month sits
// in the middle of a widget of any shape, so the numbers, the title and the line always keep their proportions. It
// wakes up once a day, at midnight.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { Tile } from "../components/Tile";
import { extra } from "../i18n/ru.extra.calendar";
import { onColor } from "../lib/design";
import { dateKeyOf, parseDeadline } from "../lib/notes";
import { lessonsForDay, msUntilMidnight } from "../lib/schedule";
import type { CalendarSettings, Note, Settings, Weekday } from "../lib/settings";
import { useSettings } from "../lib/useSettings";

const x = extra;

const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Monday 0 .. Sunday 6. */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 8601 week number of the week holding `d` (weeks start on Monday, week 1 holds the year's first Thursday). */
function isoWeek(d: Date): number {
  const thursday = addDays(d, 3 - mondayIndex(d));
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  return 1 + Math.floor((thursday.getTime() - jan1.getTime()) / 86_400_000 / 7);
}

/** The Monday of the week holding `d`. */
const weekStart = (d: Date) => addDays(d, -mondayIndex(d));

/** The weeks of month `m` of year `y`: only as many as the month takes (four to six). */
function monthWeeks(y: number, m: number): Date[][] {
  const weeks: Date[][] = [];
  for (let start = weekStart(new Date(y, m, 1)); weeks.length === 0 || start.getMonth() === m; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** Deadlines by day ("YYYY-MM-DD"): the notes not done yet, in order of time. */
function deadlinesByDay(notes: readonly Note[]): Map<string, Note[]> {
  const out = new Map<string, Note[]>();
  for (const n of notes) {
    if (n.done) continue;
    const due = parseDeadline(n.deadline);
    if (!due) continue;
    const key = dateKeyOf(due);
    const list = out.get(key) ?? [];
    list.push(n);
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  return out;
}

/** The colours of the calendar as CSS variables (today's mark and the text on it, the weekends, the dots). */
function calendarVars(c: CalendarSettings): Record<string, string> {
  const today = c.todayColor.mode === "custom" ? c.todayColor.color : "var(--accent)";
  const onToday = c.todayColor.mode === "custom" ? onColor(c.todayColor.color) : "var(--on-accent)";
  const weekend = c.weekendColor.mode === "custom" ? c.weekendColor.color : c.weekendColor.mode === "accent" ? "var(--accent-text)" : "var(--text)";
  const dot = c.deadlineColor.mode === "custom" ? c.deadlineColor.color : "var(--accent)";
  return { "--cal-today": today, "--cal-on-today": onToday, "--cal-weekend": weekend, "--cal-dot": dot };
}

/** The month's title in the chosen style. */
export function titleOf(c: Pick<CalendarSettings, "title">, month: number, year: number): string {
  if (c.title === "numeric") return `${pad(month + 1)}.${year}`;
  return c.title === "month" ? x.months[month] : `${x.months[month]} ${year}`;
}

/** A day in the chosen style of the day line. */
export function dayOf(c: Pick<CalendarSettings, "dayFormat">, d: Date): string {
  switch (c.dayFormat) {
    case "long":
      return x.dayTitle(x.weekdaysLong[mondayIndex(d)], d.getDate(), x.monthsGenitive[d.getMonth()]);
    case "date":
      return x.dayDate(d.getDate(), x.monthsGenitive[d.getMonth()]);
    case "numeric":
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    default:
      return x.dayTitle(x.weekdaysShort[mondayIndex(d)], d.getDate(), x.monthsGenitive[d.getMonth()]);
  }
}

/** The smallest cell (CSS px) the month is shown at: below it the numbers would be too small for their marks. */
const MIN_CELL = 24;
/** The share of a cell the title, the weekday names and the day line take (see calendar.css), and the column of
 * week numbers. */
const HEAD = 1.1;
const NAMES = 0.62;
const LINE = 0.95;
const WEEK_COL = 0.8;

/** The cell a box of `w` x `h` gives `rows` weeks (with the day line or without). */
const cellFor = (w: number, h: number, rows: number, line: boolean, weekNo: boolean) =>
  Math.min(w / (7 + (weekNo ? WEEK_COL : 0)), h / (rows + HEAD + NAMES + (line ? LINE : 0)));

/** The menu of a day (right click): a note or a reminder with its deadline on that day. */
export function calendarDayMenu(target: HTMLElement): MenuItemSpec[] {
  const key = target.closest<HTMLElement>("[data-date]")?.dataset.date;
  if (!key) return [];
  const [, m, d] = key.split("-").map(Number);
  const day = x.dayDate(d, x.monthsGenitive[m - 1]);
  const open = (kind: "new" | "remind") => void invoke("open_settings", { tab: "notes", edit: `${kind}@${key}` }).catch(() => undefined);
  return [
    { id: "cal-note", label: x.addNote(day), icon: "note", onSelect: () => open("new") },
    { id: "cal-remind", label: x.addReminder(day), icon: "alert", onSelect: () => open("remind") },
  ];
}

export function CalendarView({ s, compact: forced }: { s: Settings; compact?: boolean }) {
  const c = s.calendar;
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || forced !== undefined) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [forced]);

  // Today, moved on at midnight (one timer a day).
  const [today, setToday] = useState(() => atMidnight(new Date()));
  useEffect(() => {
    const t = window.setTimeout(() => setToday(atMidnight(new Date())), msUntilMidnight(new Date()) + 500);
    return () => window.clearTimeout(t);
  }, [today]);
  // The month (or the week, when low) on screen, and the day picked for the day line.
  const [shown, setShown] = useState(today);
  const [picked, setPicked] = useState(today);
  useEffect(() => {
    setShown(today);
    setPicked(today);
  }, [today]);

  // What fits at a readable size: the month with its day line, the month alone, or this week (with the line when the
  // widget is tall enough for it). Judged for the longest month (six weeks), so turning months never switches views.
  const monthRows = 6;
  // The week numbers take a column of the month; this week has its number in the title instead.
  const fits = (rows: number, withLine: boolean) => !box || cellFor(box.w, box.h, rows, withLine, c.weekNumbers && rows > 1) >= MIN_CELL;
  const compact = forced ?? !fits(monthRows, false);
  const line = c.dayLine && (compact ? forced === undefined && fits(1, true) : fits(monthRows, true));

  const deadlines = useMemo(() => (c.deadlines || c.dayLine ? deadlinesByDay(s.notes.notes) : new Map<string, Note[]>()), [s.notes.notes, c.deadlines, c.dayLine]);
  const weeks = compact ? [Array.from({ length: 7 }, (_, i) => addDays(weekStart(shown), i))] : monthWeeks(shown.getFullYear(), shown.getMonth());
  const month = compact ? weeks[0][3].getMonth() : shown.getMonth();
  const year = compact ? weeks[0][3].getFullYear() : shown.getFullYear();
  const atToday = compact
    ? weekStart(shown).getTime() === weekStart(today).getTime()
    : shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear();

  const turn = (dir: 1 | -1) => setShown((d) => (compact ? addDays(d, 7 * dir) : new Date(d.getFullYear(), d.getMonth() + dir, 1)));
  const backToday = () => {
    setShown(today);
    setPicked(today);
  };
  const pick = (d: Date) => {
    setPicked(d);
    if (!compact && d.getMonth() !== shown.getMonth()) setShown(new Date(d.getFullYear(), d.getMonth(), 1));
  };


  const pickedKey = dateKeyOf(picked);
  const pickedDeadlines = deadlines.get(pickedKey) ?? [];
  const pickedLessons = lessonsForDay(s.schedule.lessons, (mondayIndex(picked) + 1) as Weekday).length;
  // The first deadline in words, the others as a number: a narrow widget still reads it.
  const firstDeadline = pickedDeadlines[0] ? (s.notes.privacy ? x.hiddenDeadline : pickedDeadlines[0].text.split("\n")[0]) : null;
  const moreDeadlines = Math.max(0, pickedDeadlines.length - 1);

  const weekNo = c.weekNumbers && !compact;
  // How many cells high the whole calendar is: its weeks, the title, the weekday names and the day line.
  const units = weeks.length + HEAD + NAMES + (line ? LINE : 0);
  const vars = { ...calendarVars(c), "--rows": String(weeks.length), "--units": String(units) } as CSSProperties;
  const arrows = (
    <span className="cal-nav">
      <button type="button" className="cal-arrow" aria-label={x.prev} onClick={() => turn(-1)}>
        <Icon name="chevron_left" size={16} />
      </button>
      <button type="button" className="cal-arrow" aria-label={x.next} onClick={() => turn(1)}>
        <Icon name="chevron_right" size={16} />
      </button>
    </span>
  );
  const title = (
    <button type="button" className={atToday ? "cal-title" : "cal-title away"} onClick={backToday} title={atToday ? undefined : x.backToday}>
      <span className="ellipsis">{titleOf(c, month, year)}</span>
      {compact && c.weekNumbers && <span className="cal-week-no">{x.week(isoWeek(weeks[0][0]))}</span>}
    </button>
  );
  return (
    <div ref={boxRef} className="cal-box">
      <div
        className={["cal", `today-${c.today}`, `title-${c.titleAlign}`, `line-${c.dayAlign}`, compact ? "compact" : "", weekNo ? "with-weeks" : ""]
          .filter(Boolean)
          .join(" ")}
        style={vars}
      >
        <header className="cal-head">
          {c.titleAlign === "center" ? (
            <>
              <button type="button" className="cal-arrow" aria-label={x.prev} onClick={() => turn(-1)}>
                <Icon name="chevron_left" size={16} />
              </button>
              {title}
              <button type="button" className="cal-arrow" aria-label={x.next} onClick={() => turn(1)}>
                <Icon name="chevron_right" size={16} />
              </button>
            </>
          ) : c.titleAlign === "right" ? (
            <>
              {arrows}
              {title}
            </>
          ) : (
            <>
              {title}
              {arrows}
            </>
          )}
        </header>
        <div className="cal-grid" role="grid">
          <div className="cal-row cal-names" role="row">
            {weekNo && <span className="cal-wk" aria-hidden="true">{x.weekColumn}</span>}
            {x.weekdays.map((name, i) => (
              <span key={name} role="columnheader" className={i >= 5 ? "cal-name weekend" : "cal-name"}>
                {name}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={dateKeyOf(week[0])} className="cal-row" role="row">
              {weekNo && (
                <span className="cal-wk" aria-hidden="true">
                  {isoWeek(week[0])}
                </span>
              )}
              {week.map((d) => {
                const key = dateKeyOf(d);
                const outside = !compact && d.getMonth() !== month;
                if (outside && !c.otherDays) return <span key={key} className="cal-day empty" role="gridcell" />;
                const isToday = d.getTime() === today.getTime();
                const due = c.deadlines ? (deadlines.get(key)?.length ?? 0) : 0;
                const cls = [
                  "cal-day",
                  isToday ? "today" : "",
                  outside ? "outside" : "",
                  isWeekend(d) ? "weekend" : "",
                  c.dayLine && key === pickedKey && !isToday ? "picked" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const long = x.dayTitle(x.weekdaysLong[mondayIndex(d)], d.getDate(), x.monthsGenitive[d.getMonth()]);
                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    className={cls}
                    data-date={key}
                    aria-label={isToday ? `${x.dayAria(long, due)}, ${x.todayAria}` : x.dayAria(long, due)}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => pick(d)}
                  >
                    <span className="cal-num">
                      {d.getDate()}
                      {due > 0 && <span className="cal-dot" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {line && (
          <div className="cal-line" aria-live="polite">
            <span className="cal-line-day">{dayOf(c, picked)}</span>
            <span className="cal-line-sep" aria-hidden="true">·</span>
            <span className="cal-line-plain">{x.lessons(pickedLessons)}</span>
            {firstDeadline && (
              <span className="cal-line-due">
                <span className="cal-line-sep" aria-hidden="true">·</span>
                <span className="cal-line-dot" aria-hidden="true" />
                <span className="ellipsis">{firstDeadline}</span>
              </span>
            )}
            {moreDeadlines > 0 && (
              <>
                <span className="cal-line-sep" aria-hidden="true">·</span>
                <span className="cal-line-more">{x.moreDeadlines(moreDeadlines)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarTile() {
  const s = useSettings();
  return (
    <Tile label="calendar" className="tile-calendar" background={s.calendar.background} menuItems={calendarDayMenu}>
      <CalendarView s={s} />
    </Tile>
  );
}
