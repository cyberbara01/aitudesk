// Date field with a calendar flyout. The field shows the chosen date («пт, 10 октября 2026»); the flyout has
// the month with previous / next buttons, Russian weekday and month names, a Monday-first grid on six fixed
// rows (the flyout never changes height; the neighbouring months' days fill the edges, lighter, and can be
// picked too), today ringed, the chosen day filled with the accent, past days dimmed but selectable.
// Keyboard: arrows move by a day / a week, Home / End to the start / end of the week, PageUp / PageDown change
// the month (with Shift the year), Enter or Space choose, Esc closes, Tab cycles inside the flyout.
import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.notes";
import { IconButton } from "./Button";
import { Icon } from "./Icon";

interface DatePickerProps {
  /** "YYYY-MM-DD" (local date) or null for none. */
  value: string | null;
  onChange: (value: string) => void;
  label?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const T = extra.calendar;
const D = extra.dates;
/** Distance from the field and from the window edges. */
const GAP = 4;

// ---- Dates (local, at midnight) ----

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseKey(key: string | null): Date | null {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return keyOf(d) === key ? d : null;
}

const today = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
/** Same day number `n` months later, clamped to the month's length (31 January + 1 → 28/29 February). */
function addMonths(d: Date, n: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysIn(first.getFullYear(), first.getMonth())));
}
/** 0 = Monday … 6 = Sunday. */
const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** «пт, 10 октября 2026» */
export function formatDateLong(d: Date): string {
  return `${D.weekdaysShort[weekdayIndex(d)]}, ${d.getDate()} ${D.monthsGenitive[d.getMonth()]} ${d.getFullYear()}`;
}

/** «пятница, 10 октября 2026» (day buttons' accessible names). */
const ariaDate = (d: Date) => `${D.weekdaysLong[weekdayIndex(d)]}, ${d.getDate()} ${D.monthsGenitive[d.getMonth()]} ${d.getFullYear()}`;

/** 42 days (six Monday-first weeks) around month `m` of year `y`; the neighbours' days fill the edges. */
function monthCells(y: number, m: number): { date: Date; outside: boolean }[] {
  const lead = weekdayIndex(new Date(y, m, 1));
  const cells: { date: Date; outside: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(y, m, i - lead + 1);
    cells.push({ date, outside: date.getMonth() !== m });
  }
  return cells;
}

// ---- Esc before any dialog ----
// The kit Dialog closes on Esc from a window-level capture listener, which runs before anything inside the
// sheet sees the key. This listener is registered when the module is first evaluated, so it always precedes
// the listener of any Dialog that can contain a DatePicker: Esc closes the open calendar and stops there.

/** Close functions of the open calendars, the most recent last. */
const openCalendars: Array<() => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || openCalendars.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openCalendars[openCalendars.length - 1]();
    },
    true,
  );
}

export function DatePicker({ value, onChange, label, ariaLabel, placeholder, disabled, className }: DatePickerProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const selected = parseKey(value);
  const [open, setOpen] = useState(false);
  /** First day of the month on screen. */
  const [view, setView] = useState(() => {
    const base = selected ?? today();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  /** Roving focus: the day that takes Tab focus inside the grid. */
  const [focusKey, setFocusKey] = useState(() => keyOf(selected ?? today()));
  const fieldRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  /** Move DOM focus to `focusKey` after the next render (opening, keyboard moves). */
  const pullFocus = useRef(false);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) fieldRef.current?.focus();
  }, []);

  const show = () => {
    if (disabled) return;
    const base = parseKey(value) ?? today();
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    setFocusKey(keyOf(base));
    pullFocus.current = true;
    setOpen(true);
  };

  const choose = (d: Date) => {
    onChange(keyOf(d));
    close(true);
  };

  /** Place the flyout under the field (above it when there is no room), inside the window. */
  const place = useCallback(() => {
    const f = fieldRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!f || !p) return;
    const { innerWidth: vw, innerHeight: vh } = window;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    let top = f.bottom + GAP;
    if (top + h > vh - GAP && f.top - GAP - h >= GAP) top = f.top - GAP - h;
    top = Math.max(GAP, Math.min(top, vh - h - GAP));
    const left = Math.max(GAP, Math.min(f.left, vw - w - GAP));
    p.style.left = `${Math.round(left)}px`;
    p.style.top = `${Math.round(top)}px`;
    p.style.visibility = "visible";
  }, []);

  // While open: registered for Esc, follows the field, closes on an outside press or when the window is left.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const closeQuiet = () => close(false);
    const closeByEsc = () => close(true);
    openCalendars.push(closeByEsc);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || fieldRef.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("blur", closeQuiet);
    return () => {
      const i = openCalendars.indexOf(closeByEsc);
      if (i >= 0) openCalendars.splice(i, 1);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("blur", closeQuiet);
    };
  }, [open, place, close]);

  // After placing (declared after the effect above, so the flyout is visible by now).
  useLayoutEffect(() => {
    if (!open || !pullFocus.current) return;
    pullFocus.current = false;
    popRef.current?.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }, [open, focusKey, view]);

  /** Move the roving focus by keyboard; leaving the month turns the page. */
  const moveTo = (d: Date) => {
    if (keyOf(d) === focusKey) return; // already there (Home on a Monday): nothing to move
    setFocusKey(keyOf(d));
    if (d.getFullYear() !== view.getFullYear() || d.getMonth() !== view.getMonth()) setView(new Date(d.getFullYear(), d.getMonth(), 1));
    pullFocus.current = true;
  };

  /** Header buttons: turn the page, keep the focus on the button, carry the day number over. */
  const turn = (n: number) => {
    const next = new Date(view.getFullYear(), view.getMonth() + n, 1);
    setView(next);
    const cur = parseKey(focusKey) ?? next;
    setFocusKey(keyOf(new Date(next.getFullYear(), next.getMonth(), Math.min(cur.getDate(), daysIn(next.getFullYear(), next.getMonth())))));
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = parseKey(focusKey) ?? today();
    let next: Date | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(cur, -1);
        break;
      case "ArrowRight":
        next = addDays(cur, 1);
        break;
      case "ArrowUp":
        next = addDays(cur, -7);
        break;
      case "ArrowDown":
        next = addDays(cur, 7);
        break;
      case "Home":
        next = addDays(cur, -weekdayIndex(cur));
        break;
      case "End":
        next = addDays(cur, 6 - weekdayIndex(cur));
        break;
      case "PageUp":
        next = addMonths(cur, e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonths(cur, e.shiftKey ? 12 : 1);
        break;
      // Enter and Space are the day button's own activation (click → choose).
      default:
        return;
    }
    e.preventDefault();
    moveTo(next);
  };

  /** Tab stays inside the flyout: previous month, next month, the focused day. */
  const onPopKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const pop = popRef.current;
    if (!pop) return;
    const stops = Array.from(pop.querySelectorAll<HTMLElement>(".dp-nav button, .dp-day[tabindex='0']"));
    if (stops.length === 0) return;
    e.preventDefault();
    const i = stops.indexOf(document.activeElement as HTMLElement);
    const n = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length;
    stops[n].focus();
  };

  const onFieldKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
    }
  };

  const now = today();
  const nowKey = keyOf(now);
  const cells = monthCells(view.getFullYear(), view.getMonth());
  const weeks = [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7));
  const selectedKey = selected ? keyOf(selected) : null;

  return (
    <div className={["select", "datepicker", className ?? ""].filter(Boolean).join(" ")}>
      {label && (
        <label className="select-label" htmlFor={id}>
          {label}
        </label>
      )}
      <button
        ref={fieldRef}
        id={id}
        type="button"
        className="select-btn dp-field"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? undefined : ariaLabel}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={onFieldKey}
      >
        <span className={selected ? "select-text" : "select-text dp-placeholder"}>
          {selected ? formatDateLong(selected) : (placeholder ?? T.placeholder)}
        </span>
        <Icon name="calendar_ltr" size={16} />
      </button>

      {open &&
        createPortal(
          <div ref={popRef} className="popover dp-pop" role="dialog" aria-label={T.label} onKeyDown={onPopKey}>
            <div className="dp-head">
              <span id={titleId} className="dp-title body-strong" aria-live="polite">
                {D.monthsNominative[view.getMonth()]} {view.getFullYear()}
              </span>
              <div className="dp-nav">
                <IconButton icon="chevron_up" label={T.prevMonth} variant="subtle" onClick={() => turn(-1)} />
                <IconButton icon="chevron_down" label={T.nextMonth} variant="subtle" onClick={() => turn(1)} />
              </div>
            </div>
            <div className="dp-grid" role="grid" aria-labelledby={titleId} onKeyDown={onGridKey}>
              <div className="dp-row" role="row">
                {ru.schedule.weekdaysShort.map((w, i) => (
                  <span key={w} className="dp-weekday caption" role="columnheader" aria-label={D.weekdaysLong[i]}>
                    {w}
                  </span>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="dp-row" role="row">
                  {week.map(({ date: d, outside }) => {
                    const k = keyOf(d);
                    const isSel = k === selectedKey;
                    const isToday = k === nowKey;
                    const cls = ["dp-day", isToday ? "today" : "", isSel ? "selected" : "", d < now ? "past" : "", outside ? "outside" : ""]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={k}
                        type="button"
                        role="gridcell"
                        className={cls}
                        data-key={k}
                        tabIndex={k === focusKey ? 0 : -1}
                        aria-selected={isSel}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={ariaDate(d)}
                        onClick={() => choose(d)}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
