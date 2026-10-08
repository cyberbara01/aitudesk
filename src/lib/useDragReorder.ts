// Reordering a vertical list by dragging, shared by the notes list in the settings and the «Заметки» widget.
//
// The rows are the list's children that carry `data-reorder-id`; `data-reorder-group` splits them into groups
// whose rows never trade places (active and done notes). A press on a row (anywhere except its own controls:
// buttons, fields, links; a `data-drag-handle` button does start a drag) does nothing until the pointer has
// travelled 5 px, so a plain click keeps working everywhere. Then the row lifts (the scale and the raised card
// are CSS, notes.css) and follows the pointer, the rows it passes slide aside to open the gap, and the list
// scrolls by itself while the pointer stays near the top or bottom edge of whatever scrolls it. Releasing drops
// the row (`onMove`). It goes back instead on a right click, on a release beside the window (off its left or
// right edge), on a cancelled pointer or a lost capture, and on Esc or a lost focus where the window takes the
// keyboard (the settings window, the pop-up; a desktop widget never does). Alt+ArrowUp / Alt+ArrowDown on a
// focused handle moves its row one place. Once the new order has rendered, every row that changed place glides
// from where it was drawn to where it now is (FLIP), so nothing jumps, and a moved handle keeps the focus.
//
// All of it is written straight into the rows: their state in `data-reorder` and their offset in the CSS
// `translate` property, never React state. A drag renders nothing, only transform and opacity ever animate
// (compositor work), and React leaves these attributes alone when the list renders in the middle of a drag (a
// countdown tick). Nothing runs at rest: the window listeners exist only while the button is held, a frame loop
// only while the pointer sits in an edge zone, and one timer only while rows glide.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

/** Pointer travel (px) that turns a press into a drag; below it the press stays a click. */
const THRESHOLD = 5;
/** Depth of the edge zones that scroll the list (px; at most a quarter of the visible height). */
const EDGE = 40;
/** Fastest auto-scroll in px per frame, at the very edge and beyond it. */
const SPEED = 14;
/** A move whose new order never renders (the write failed) is put back after this long (ms). */
const RENDER_TIMEOUT = 1000;

/** Controls in a row that keep their own press. */
const OWN_PRESS =
  "button, input, textarea, select, a[href], label, [contenteditable='true'], [role='button'], [role='checkbox'], [role='switch'], [role='slider']";
const HANDLE = "[data-drag-handle]";
const ROW = "[data-reorder-id]";

export interface DragReorderOptions {
  /** Ids of the rows in the order shown. A new order (or a new set) tells the hook the list has rendered anew. */
  ids: readonly string[];
  /** Move `id` right before `before`, or to the end of its group when null. Once per drop or key press. */
  onMove: (id: string, before: string | null) => void;
  /** Asked on every press: false leaves it alone (a widget being moved in edit mode drags the whole window). */
  enabled?: () => boolean;
}

export interface DragReorder {
  /** For the list element. */
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  /** For the list element: Alt+ArrowUp / Alt+ArrowDown on a row's handle. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/** A row of the dragged group as it was laid out at the lift (client px). */
interface Slot {
  el: HTMLElement;
  id: string;
  top: number;
  bottom: number;
}

/** The drag proper, from the moment the pointer has travelled THRESHOLD. */
interface Live {
  slots: Slot[];
  from: number;
  /** The place the row would drop to now. */
  to: number;
  /** How far the passed rows slide: the dragged row's height plus the gap between rows. */
  step: number;
  /** Client px per CSS px of the rows (1 unless an ancestor is scaled). */
  zoom: number;
  scroller: HTMLElement | null;
  scrollerBox: DOMRect | null;
  scroll0: number;
  frame: number;
}

interface Press {
  pointerId: number;
  row: HTMLElement;
  x0: number;
  y0: number;
  /** Latest pointer position (client px), also used by the auto-scroll frames. */
  y: number;
  live: Live | null;
  /** Removes the window listeners of this press. */
  off: () => void;
}

/** Rows moved by the hook, waiting for the new order to render. */
interface Pending {
  /** Where each row was drawn, relative to the list's top (so a scroll in between does not matter). */
  tops: Map<string, number>;
  zoom: number;
  /** The row whose handle had the focus (Alt+arrows): it gets it back after the render. */
  focus: string | null;
  timer: number;
}

const rowsOf = (list: HTMLElement): HTMLElement[] =>
  Array.from(list.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.reorderId !== undefined);

/** The rows of `row`'s group, in order. */
const groupOf = (list: HTMLElement, row: HTMLElement): HTMLElement[] =>
  rowsOf(list).filter((el) => el.dataset.reorderGroup === row.dataset.reorderGroup);

/** The nearest element that scrolls `el` vertically (the widget's list itself, the settings page), or null. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

/** How long rows glide (--t-base in ms; 0 with reduced motion). */
function glideMs(): number {
  const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--t-base"));
  return Number.isFinite(ms) ? ms : 167;
}

/** Client px per CSS px of `el` (a scaled ancestor makes them differ). */
function zoomOf(el: HTMLElement): number {
  const z = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
  return z > 0 ? z : 1;
}

function setY(el: HTMLElement, y: number) {
  el.style.translate = Math.abs(y) < 0.01 ? "" : `0 ${y}px`;
}

function clearRows(els: Iterable<HTMLElement>) {
  for (const el of els) {
    delete el.dataset.reorder;
    el.style.translate = "";
  }
}

/** The click that follows a drop lands on whatever is under the pointer: it must not act. */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("click", stop, true);
  window.setTimeout(() => window.removeEventListener("click", stop, true), 0);
}

/** The whole mechanism for one list; the hook below keeps one per mounted list. */
function createReorder(listRef: RefObject<HTMLElement>, opts: { current: DragReorderOptions }) {
  let press: Press | null = null;
  let pending: Pending | null = null;
  let gliding: { els: HTMLElement[]; timer: number } | null = null;

  /** Rows still gliding are put in place at once. */
  const stopGlide = () => {
    if (!gliding) return;
    window.clearTimeout(gliding.timer);
    clearRows(gliding.els);
    gliding = null;
  };

  /** `els` glide from their offsets to their places (the transitions are CSS), then become plain rows again. */
  const glide = (els: HTMLElement[], dropped: HTMLElement | null) => {
    stopGlide();
    for (const el of els) {
      el.dataset.reorder = el === dropped ? "drop" : "settle";
      el.style.translate = "";
    }
    const timer = window.setTimeout(() => {
      if (gliding?.timer !== timer) return;
      gliding = null;
      clearRows(els);
    }, glideMs() + 50);
    gliding = { els, timer };
  };

  /** Ends the press: listeners, the auto-scroll frame and the page-wide drag look go away. */
  const end = (p: Press) => {
    p.off();
    if (p.live?.frame) cancelAnimationFrame(p.live.frame);
    if (press === p) press = null;
    delete document.documentElement.dataset.reorderDrag;
  };

  /**
   * Remembers where `els` are drawn now, before `onMove`, for the glide once the new order renders. `zoom` comes
   * from the caller: measured now, the lifted row's own scale would count in.
   */
  const remember = (list: HTMLElement, els: HTMLElement[], zoom: number, focus: string | null) => {
    const base = list.getBoundingClientRect().top;
    const tops = new Map(els.map((el) => [el.dataset.reorderId!, el.getBoundingClientRect().top - base] as const));
    const timer = window.setTimeout(() => {
      if (pending?.timer !== timer) return;
      pending = null;
      // Nothing rendered: the rows go back where they belong.
      glide(els.filter((el) => el.isConnected), els.find((el) => el.dataset.reorder === "lift") ?? null);
    }, RENDER_TIMEOUT);
    pending = { tops, zoom, focus, timer };
  };

  /** Auto-scroll speed for the pointer where it is (px per frame, negative = up); 0 outside the edge zones. */
  const edgeSpeed = (p: Press): number => {
    const box = p.live?.scrollerBox;
    const sc = p.live?.scroller;
    if (!box || !sc) return 0;
    const zone = Math.min(EDGE, box.height / 4);
    if (p.y < box.top + zone && sc.scrollTop > 0) return -SPEED * Math.min(1, (box.top + zone - p.y) / zone);
    if (p.y > box.bottom - zone && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1) {
      return SPEED * Math.min(1, (p.y - box.bottom + zone) / zone);
    }
    return 0;
  };

  /** Puts the dragged row under the pointer and the others aside; keeps the auto-scroll going near an edge. */
  const follow = (p: Press) => {
    const L = p.live;
    if (!L) return;
    const me = L.slots[L.from];
    const first = L.slots[0];
    const last = L.slots[L.slots.length - 1];
    // The slots were measured at the lift: a scroll since then moved every row, so it counts as travel too.
    const scrolled = L.scroller ? (L.scroller.scrollTop - L.scroll0) * L.zoom : 0;
    const travel = p.y - p.y0 + scrolled;
    // The row is drawn within its group, never among the rows it may not trade places with; the place it would
    // drop to follows the pointer itself, so pulling past either end of the group means that end.
    const dy = Math.min(Math.max(travel, first.top - me.top), last.bottom - me.bottom);
    const mid = (s: Slot) => (s.top + s.bottom) / 2;
    const center = mid(me) + travel;
    let to = L.from;
    while (to > 0 && center < mid(L.slots[to - 1])) to--;
    if (to === L.from) while (to < L.slots.length - 1 && center > mid(L.slots[to + 1])) to++;
    setY(me.el, dy / L.zoom);
    if (to !== L.to) {
      L.to = to;
      L.slots.forEach((s, i) => {
        if (i === L.from) return;
        const y = i >= to && i < L.from ? L.step : i <= to && i > L.from ? -L.step : 0;
        setY(s.el, y / L.zoom);
      });
    }
    if (!L.frame && edgeSpeed(p)) L.frame = requestAnimationFrame(() => scrollFrame(p));
  };

  const scrollFrame = (p: Press) => {
    const L = p.live;
    if (!L || press !== p) return;
    L.frame = 0;
    const v = edgeSpeed(p);
    if (!v || !L.scroller) return;
    const before = L.scroller.scrollTop;
    L.scroller.scrollTop = before + Math.sign(v) * Math.max(1, Math.round(Math.abs(v)));
    // At the end of the list the loop stops; the next pointer move starts it again if there is room.
    if (L.scroller.scrollTop !== before) follow(p);
  };

  /** The press became a drag: measure the group, lift the row. False when there is nothing to reorder. */
  const lift = (p: Press): boolean => {
    const list = listRef.current;
    // A move still waiting for its render: the rows are not where they will be.
    if (!list || pending || p.row.parentElement !== list) return false;
    stopGlide();
    const els = groupOf(list, p.row);
    if (els.length < 2) return false;
    const slots = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, id: el.dataset.reorderId!, top: r.top, bottom: r.bottom };
    });
    const from = els.indexOf(p.row);
    const me = slots[from];
    const next = slots[from + 1];
    const prev = slots[from - 1];
    const gap = next ? next.top - me.bottom : prev ? me.top - prev.bottom : 0;
    const scroller = scrollerOf(list);
    p.live = {
      slots,
      from,
      to: from,
      step: me.bottom - me.top + Math.max(0, gap),
      zoom: zoomOf(p.row),
      scroller,
      scrollerBox: scroller?.getBoundingClientRect() ?? null,
      scroll0: scroller?.scrollTop ?? 0,
      frame: 0,
    };
    try {
      // Moves and the release reach this row even outside the list or the window.
      p.row.setPointerCapture(p.pointerId);
    } catch {
      // The pointer is already gone: its pointerup or pointercancel ends the press.
    }
    window.getSelection()?.removeAllRanges();
    document.documentElement.dataset.reorderDrag = "";
    for (const s of slots) s.el.dataset.reorder = s.el === p.row ? "lift" : "shift";
    return true;
  };

  /** A right click, a release beside the window, Esc, a cancelled pointer, a lost capture or a lost window: the
   *  rows go back, nothing is moved. */
  const cancel = (p: Press) => {
    const L = p.live;
    end(p);
    if (!L) return;
    try {
      p.row.releasePointerCapture(p.pointerId);
    } catch {
      // Not captured any more.
    }
    glide(L.slots.map((s) => s.el).filter((el) => el.isConnected), p.row);
  };

  const drop = (p: Press) => {
    const L = p.live!;
    const list = listRef.current;
    end(p);
    swallowNextClick();
    const els = L.slots.map((s) => s.el);
    if (!list || L.to === L.from) {
      glide(els, p.row);
      return;
    }
    const before = L.to < L.from ? L.slots[L.to].id : (L.slots[L.to + 1]?.id ?? null);
    remember(list, els, L.zoom, null);
    opts.current.onMove(L.slots[L.from].id, before);
  };

  const listen = (p: Press) => {
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== p.pointerId) return;
      p.y = e.clientY;
      if (!p.live) {
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < THRESHOLD) return;
        if (!lift(p)) {
          end(p);
          return;
        }
      }
      e.preventDefault();
      follow(p);
    };
    const up = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== p.pointerId) return;
      if (!p.live) end(p);
      else if (e.clientX < 0 || e.clientX >= window.innerWidth) {
        // Released beside the window: carried away, so put back.
        cancel(p);
        swallowNextClick();
      } else drop(p);
    };
    const cancelled = (e: globalThis.PointerEvent) => {
      if (e.pointerId === p.pointerId) cancel(p);
    };
    const lost = () => {
      if (press === p && p.live) cancel(p);
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || !p.live) return;
      // Esc belongs to the drag: it must not also close the pop-up or a dialog.
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel(p);
    };
    // A right click puts the row back: the way to cancel on a desktop widget, which never gets Esc. The left
    // button is still down, so the click its release makes is swallowed too.
    const menu = (e: MouseEvent) => {
      if (!p.live) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel(p);
      const id = p.pointerId;
      const release = (u: globalThis.PointerEvent) => {
        if (u.pointerId !== id) return;
        window.removeEventListener("pointerup", release, true);
        window.removeEventListener("pointerdown", release, true);
        if (u.type === "pointerup") swallowNextClick();
      };
      window.addEventListener("pointerup", release, true);
      window.addEventListener("pointerdown", release, true);
    };
    // The wheel scrolls the list under a held row too: the row stays under the pointer.
    const scrolled = () => {
      if (p.live) follow(p);
    };
    const blur = () => cancel(p);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancelled, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("contextmenu", menu, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("blur", blur);
    p.row.addEventListener("lostpointercapture", lost);
    p.off = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancelled, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("contextmenu", menu, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("blur", blur);
      p.row.removeEventListener("lostpointercapture", lost);
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const list = listRef.current;
    // Mouse and pen only: a finger on a touch screen scrolls the list as before.
    if (!list || press || e.button !== 0 || e.pointerType === "touch") return;
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>(ROW);
    if (!row || row.parentElement !== list) return;
    const own = target.closest(OWN_PRESS);
    if (own && row.contains(own) && !own.matches(HANDLE)) return;
    if (opts.current.enabled && !opts.current.enabled()) return;
    if (groupOf(list, row).length < 2) return;
    const p: Press = { pointerId: e.pointerId, row, x0: e.clientX, y0: e.clientY, y: e.clientY, live: null, off: () => undefined };
    press = p;
    listen(p);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    const list = listRef.current;
    const row = (e.target as HTMLElement).closest(HANDLE)?.closest<HTMLElement>(ROW);
    if (!list || !row || row.parentElement !== list) return;
    e.preventDefault();
    if (press || pending || (opts.current.enabled && !opts.current.enabled())) return;
    const els = groupOf(list, row);
    const i = els.indexOf(row);
    const up = e.key === "ArrowUp";
    if (up ? i <= 0 : i >= els.length - 1) return;
    const before = up ? els[i - 1].dataset.reorderId! : (els[i + 2]?.dataset.reorderId ?? null);
    stopGlide();
    remember(list, els, zoomOf(row), row.dataset.reorderId!);
    opts.current.onMove(row.dataset.reorderId!, before);
  };

  /** The list rendered with a new order or a new set of rows. */
  const rendered = () => {
    const list = listRef.current;
    // An edit from another window under a drag: the measured places are wrong now, the drag is dropped as is.
    if (press?.live) {
      const { slots } = press.live;
      const p = press;
      end(p);
      try {
        p.row.releasePointerCapture(p.pointerId);
      } catch {
        // Not captured any more.
      }
      clearRows(slots.map((s) => s.el));
    }
    const pend = pending;
    if (!pend || !list) return;
    pending = null;
    window.clearTimeout(pend.timer);
    stopGlide();
    // Plain layout first, to measure the new places: offsets off, states off (so nothing transitions), except
    // the dropped row, which stays lifted (its scale and card) until it has settled.
    const rows = rowsOf(list);
    let dropped: HTMLElement | null = null;
    for (const el of rows) {
      if (el.dataset.reorder === "lift") dropped = el;
      else delete el.dataset.reorder;
      el.style.translate = "";
    }
    if (pend.focus) {
      const row = rows.find((el) => el.dataset.reorderId === pend.focus);
      const handle = row?.querySelector<HTMLElement>(HANDLE);
      if (handle && document.activeElement !== handle) handle.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "nearest" });
    }
    const base = list.getBoundingClientRect().top;
    const moved: HTMLElement[] = [];
    for (const el of rows) {
      const old = pend.tops.get(el.dataset.reorderId!);
      if (old === undefined) continue;
      const dy = old - (el.getBoundingClientRect().top - base);
      if (Math.abs(dy) < 0.5 && el !== dropped) continue;
      setY(el, dy / pend.zoom);
      moved.push(el);
    }
    if (moved.length === 0) return;
    // The offsets must be in effect before the transitions to zero start.
    void list.offsetHeight;
    glide(moved, dropped);
  };

  const dispose = () => {
    if (press) end(press);
    if (pending) window.clearTimeout(pending.timer);
    pending = null;
    stopGlide();
  };

  return { onPointerDown, onKeyDown, rendered, dispose };
}

/**
 * Drag reordering for the list in `listRef` (see the top of this file). Spread the handlers onto the list
 * element; the rows need `data-reorder-id` (and `data-reorder-group` when they form groups), a drag handle
 * `data-drag-handle`.
 */
export function useDragReorder(listRef: RefObject<HTMLElement>, options: DragReorderOptions): DragReorder {
  const opts = useRef(options);
  opts.current = options;
  const [ctl] = useState(() => createReorder(listRef, opts));
  const key = options.ids.join("\n");

  // Before paint, so the moved rows never show at their new places for a frame before they glide there.
  useLayoutEffect(() => {
    ctl.rendered();
  }, [ctl, key]);

  useEffect(() => ctl.dispose, [ctl]);

  return { onPointerDown: ctl.onPointerDown, onKeyDown: ctl.onKeyDown };
}
