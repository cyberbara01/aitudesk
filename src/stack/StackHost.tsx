// A stack of widgets (window `stack-<id>`, src-tauri/src/stacks.rs): several widgets in one place on the desktop,
// shown one at a time, while each of them has no window of its own. It pages by the mouse wheel, by a touchpad swipe
// along its axis, by a drag with the mouse (unless something in the widget uses these itself: a list that scrolls, the
// map that zooms and pans), by the arrows at the ends of its dots and by a click on a dot. Only the content slides:
// the tile's frame stays where it is, so the stack reads as one thing. Past the first or the last widget nothing
// moves. Empty, it says what it is for and offers «Добавить виджет»;
// while widgets are being arranged it calls them in, and lights up under one dragged over it (src/lib/editMode.ts).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Tile } from "../components/Tile";
import { extra as st } from "../i18n/ru.extra.stack";
import { useEditModeOn } from "../lib/editMode";
import { inkAttrs } from "../lib/ink";
import { journal } from "../lib/journal";
import { popupMenu } from "../lib/nativeMenu";
import { MAP_FOCUS_EVENT } from "../lib/schedule";
import { isCustomLabel, stackLabel, type TileId } from "../lib/settings";
import { isFoldedView, STACK_ID, useTileView } from "../lib/tileView";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { CustomTile, preloadWidget, WIDGETS } from "../lib/widgetPages";
import { addItems, addToStack, removeFromStack, stackMembers, stackName, widgetName } from "./actions";
import { StackContext, type StackApi } from "./context";

/** Which widget a stack showed last (the pages' own storage, one key per stack: nothing else needs it). */
const lastKey = (id: string | null) => `aitudesk.stack.shown.${id ?? ""}`;
/** The slide between two widgets (ms), as long as stack.css plays it. */
const SLIDE_MS = 420;
/** A touchpad swipe turns the page once it has moved this far along the stack (CSS px), once per swipe. */
const SWIPE_STEP = 46;
/** A swipe (or a turn of the wheel) has ended once no wheel event came for this long (ms). */
const GESTURE_IDLE_MS = 190;
/** Within one turn of the wheel, a notch turns another page after this long (ms). */
const NOTCH_MS = 320;
/** A wheel step this big, straight up, down or sideways, is a mouse notch, not a touchpad's glide (CSS px). */
const NOTCH_MIN = 50;
/** Event from a widget dragged in edit mode: whether it is over the stack now (src/lib/editMode.ts). */
export const STACK_DRAG_EVENT = "stack-drag";
/** A press becomes a page drag after this much travel along the stack (CSS px); a drag this long turns the page
 * at once, while the button is still down. */
const DRAG_START = 8;
const DRAG_TURN = 44;
/** How far the content follows the pointer toward a neighbour (none past the first or last widget). */
const DRAG_FOLLOW = 0.5;
/** Things that keep their own press: fields, sliders and switches, the map (a drag moves its plan), rows that
 * reorder, the stack's own controls and the edit buttons. A button or a link still pages when pulled (a plain click
 * stays a click; the click that ends a drag is swallowed), or a widget made of shortcuts could never be dragged. */
const OWN_PRESS =
  "input, textarea, select, [contenteditable='true'], [role='slider'], [role='checkbox'], [role='switch'], [data-reorder-id], .map-root, .stack-rail, .edit-pill, .resize-grip";

/** How a page turn moves: which way (1: to the next widget), along which axis (the stack's), and where a drag
 * left the content. */
interface Turn {
  dir: 1 | -1;
  sideways: boolean;
  from?: { x: number; y: number };
}

const readLast = (id: string | null): string | null => {
  try {
    return localStorage.getItem(lastKey(id));
  } catch {
    return null;
  }
};
const writeLast = (id: string | null, label: string) => {
  try {
    localStorage.setItem(lastKey(id), label);
  } catch {
    // Nothing is lost: the stack starts with its first widget.
  }
};

/** Whether something between `target` and the page can scroll further in the direction of `dy`. */
function canScroll(target: Element | null, dy: number): boolean {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.classList.contains("stack-page")) return false;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
  }
  return false;
}

/** Whether a widget dragged in edit mode is over the stack now. */
function useDragOver(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void listen<{ over?: boolean }>(STACK_DRAG_EVENT, (e) => setOver(Boolean(e.payload?.over)), {
      target: getCurrentWindow().label,
    }).then((u) => (alive ? (off = u) : u()));
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  return over;
}

/** One widget of the stack, the way the pop-up draws one: its own page component, in this window. */
function Member({ label }: { label: string }) {
  const Widget = isCustomLabel(label) ? null : WIDGETS[label as TileId];
  return <Suspense fallback={null}>{Widget ? <Widget /> : <CustomTile label={label} />}</Suspense>;
}

/** The dots of the stack's widgets along its lower edge (or its right edge, «вверх и вниз»), with the arrows at
 * their ends. The stack pages in a circle, so both arrows always lead somewhere; with one widget they show anyway,
 * dimmed, so the stack reads as a stack. */
function Rail({ names, index, go, jump, sideways }: { names: string[]; index: number; go: (d: number) => void; jump: (i: number) => void; sideways: boolean }) {
  const n = names.length;
  // The arrows and the dot of the page shown take the colour of the widgets' glyphs (the accent, unless changed).
  const { style: inkStyle, ...ink } = inkAttrs(useSettings().ink);
  return (
    <div
      className={n < 2 ? "stack-rail single" : "stack-rail"}
      style={{ ...inkStyle, "--n": n } as CSSProperties}
      {...ink}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="stack-arrow" aria-label={st.rail.up} disabled={n < 2} onClick={() => go(-1)}>
        <Icon name={sideways ? "chevron_left" : "chevron_up"} size={20} />
      </button>
      <div className="stack-dots">
        {names.map((name, i) => (
          <button
            key={i}
            type="button"
            className={i === index ? "stack-dot on" : "stack-dot"}
            aria-label={st.rail.dot(name, i + 1, n)}
            aria-current={i === index}
            onClick={() => jump(i)}
          />
        ))}
      </div>
      <button type="button" className="stack-arrow" aria-label={st.rail.down} disabled={n < 2} onClick={() => go(1)}>
        <Icon name={sideways ? "chevron_right" : "chevron_down"} size={20} />
      </button>
    </div>
  );
}

/** While the widgets are arranged: the stack calls them in; under a dragged widget it lights up. */
function DropZone({ over }: { over: boolean }) {
  return (
    <div className={over ? "stack-drop over" : "stack-drop"} aria-hidden="true">
      <span className="stack-drop-pill">
        <Icon name="stack_add" size={16} />
        {over ? st.drop.release : st.drop.hint}
      </span>
    </div>
  );
}

/** The empty stack: what it is, how to fill it, and the button that does. */
function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="stack-empty">
      <span className="stack-art" aria-hidden="true">
        <span className="stack-art-card back" />
        <span className="stack-art-card mid" />
        <span className="stack-art-card front">
          <Icon name="add" size={16} />
        </span>
      </span>
      <span className="stack-empty-title">{st.empty.title}</span>
      <span className="stack-empty-text">{st.empty.text}</span>
      <Button size="sm" icon="stack_add" onClick={onAdd}>
        {st.empty.add}
      </Button>
    </div>
  );
}

/** A stack: in its own window (`id` from the window's label), or opened in the pop-up from its icon (`id` given). */
export function StackHost({ id = STACK_ID }: { id?: string | null }) {
  const loaded = useSettingsLoaded();
  const s = useSettings();
  // This stack; gone (deleted in the settings), the window closes and draws nothing meanwhile.
  const def = s.stacks.find((d) => d.id === id) ?? null;
  // Folded to its icon («Значок»): the icon only, and a click opens the stack in the pop-up (never folded there).
  const folded = isFoldedView(useTileView(id ? stackLabel(id) : ""));
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const idRef = useRef(id);
  idRef.current = id;
  const members = useMemo(() => (def ? stackMembers(s, def) : []), [s, def]);
  const names = useMemo(() => members.map((m) => widgetName(s, m)), [members, s]);
  const editing = useEditModeOn();
  const dragOver = useDragOver();

  const [current, setCurrent] = useState<string | null>(() => readLast(id));
  const shown = current && members.includes(current) ? current : (members[0] ?? null);
  const index = shown ? members.indexOf(shown) : -1;
  /** The widget sliding out and how, with a counter for its key; how the shown one came in. */
  const [leaving, setLeaving] = useState<{ label: string; turn: Turn; seq: number } | null>(null);
  const [entering, setEntering] = useState<Turn | null>(null);
  /** A widget that just came in (it pulses once). */
  const [joined, setJoined] = useState<string | null>(null);
  /** At the first or last widget a page turn only nudges the content. */
  const [focus, setFocus] = useState<{ room: string | null; ask: number }>({ room: null, ask: 0 });

  const shownRef = useRef(shown);
  shownRef.current = shown;
  const membersRef = useRef(members);
  membersRef.current = members;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  /** The stack's own axis: the arrows, the dots and a new widget slide along it. */
  const sidewaysRef = useRef(false);
  sidewaysRef.current = def?.axis === "horizontal";
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const show = useCallback((label: string, turn: Turn) => {
    const from = shownRef.current;
    if (label === from) return;
    shownRef.current = label;
    if (from) {
      const n = ++seq.current;
      setLeaving({ label: from, turn, seq: n });
      later(() => setLeaving((l) => (l && l.seq === n ? null : l)), SLIDE_MS);
    }
    setEntering(from ? turn : null);
    setCurrent(label);
    writeLast(idRef.current, label);
    journal(`stack ${idRef.current}: ${from ?? "none"} -> ${label}`);
  }, []);

  /** One widget on (delta > 0) or back, from where a drag left the content: in a circle, after the last comes the
   * first again. */
  const go = useCallback(
    (delta: number, from?: { x: number; y: number }) => {
      const list = membersRef.current;
      const n = list.length;
      if (editingRef.current || foldedRef.current || n < 2) return;
      const next = (list.indexOf(shownRef.current ?? "") + Math.sign(delta) + n) % n;
      show(list[next], { dir: delta > 0 ? 1 : -1, sideways: sidewaysRef.current, from });
    },
    [show],
  );
  const jump = useCallback((i: number) => {
    const list = membersRef.current;
    const from = list.indexOf(shownRef.current ?? "");
    if (list[i] && i !== from) show(list[i], { dir: i > from ? 1 : -1, sideways: sidewaysRef.current });
  }, [show]);

  // A widget that came in is shown at once, with a pulse; the code of the others is loaded ahead of their turn.
  const before = useRef<string[] | null>(null);
  useEffect(() => {
    // The settings as they come from disk are where the stack starts, not widgets that just came in.
    if (!loaded) return;
    const prev = before.current;
    before.current = members;
    if (prev) {
      const added = members.filter((m) => !prev.includes(m));
      const newcomer = added[added.length - 1];
      if (newcomer) {
        show(newcomer, { dir: 1, sideways: sidewaysRef.current });
        setJoined(newcomer);
        later(() => setJoined((j) => (j === newcomer ? null : j)), 900);
      }
    }
    const idle = window.setTimeout(() => members.forEach(preloadWidget), 600);
    return () => window.clearTimeout(idle);
  }, [loaded, members, show]);

  // The wheel and the touchpad. A mouse wheel turns one page per notch whichever way the stack pages; a touchpad
  // swipe turns one page per swipe, only along the stack (up and down, or left and right), and the other way stays
  // with the widget (a list scrolls). The first step of a gesture tells them apart: a notch comes at once, whole and
  // straight, a swipe glides in.
  useEffect(() => {
    let along = 0;
    let across = 0;
    let idle = 0;
    let turned = false;
    let lastTurn = 0;
    let usedInside = false;
    let mouse: boolean | null = null;
    const onWheel = (e: WheelEvent) => {
      if (editingRef.current || membersRef.current.length < 2 || e.ctrlKey) return;
      const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * k;
      const dy = e.deltaY * k;
      if (dx === 0 && dy === 0) return;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        along = 0;
        across = 0;
        turned = false;
        usedInside = false;
        mouse = null;
      }, GESTURE_IDLE_MS);
      if (mouse === null) mouse = e.deltaMode !== 0 || ((dx === 0 || dy === 0) && Math.max(Math.abs(dx), Math.abs(dy)) >= NOTCH_MIN);
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest(".stack-rail")) {
        // Something in the widget used the wheel (the map zooms, the shortcuts step their rows), or a list scrolls:
        // that whole gesture stays with it, and does not turn the page at the end of the list either.
        if (e.defaultPrevented || (Math.abs(dy) > Math.abs(dx) && canScroll(target, dy))) usedInside = true;
        if (usedInside) return;
      }
      const now = performance.now();
      if (mouse) {
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        along += d;
        if (Math.abs(along) < NOTCH_MIN) return;
        if (now - lastTurn >= NOTCH_MS) {
          lastTurn = now;
          go(along);
        }
        along = 0;
        return;
      }
      if (turned) return;
      along += sidewaysRef.current ? dx : dy;
      across += sidewaysRef.current ? dy : dx;
      if (Math.abs(along) >= SWIPE_STEP && Math.abs(along) > Math.abs(across)) {
        turned = true;
        go(along);
      }
    };
    window.addEventListener("wheel", onWheel);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("wheel", onWheel);
    };
  }, [go]);

  // Paging by a drag: press the left button on the stack (not on anything that takes the press itself) and pull
  // along it. The content follows the pointer toward a neighbour (past the ends it stays put), and once pulled far
  // enough the page turns from there at once, the button still down; a shorter pull glides back when let go. The
  // click that ends a drag does nothing.
  useEffect(() => {
    const root = document.documentElement;
    let start: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    let turnedNow = false;
    let page: HTMLElement | null = null;
    let off = { x: 0, y: 0 };
    const place = () => {
      page?.style.setProperty("--drag-x", `${off.x}px`);
      page?.style.setProperty("--drag-y", `${off.y}px`);
    };
    const down = (e: PointerEvent) => {
      start = null;
      if (e.button !== 0 || editingRef.current || membersRef.current.length < 2) return;
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t.closest(OWN_PRESS)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      // The button is up although its release never came here (another window took it): the drag ends now.
      if ((e.buttons & 1) === 0) {
        up(e);
        return;
      }
      if (turnedNow) return;
      const sideways = sidewaysRef.current;
      const a = sideways ? e.clientX - start.x : e.clientY - start.y;
      const b = sideways ? e.clientY - start.y : e.clientX - start.x;
      if (!dragging) {
        if (Math.hypot(a, b) < DRAG_START) return;
        // A pull across the stack is not paging.
        if (Math.abs(b) > Math.abs(a)) {
          start = null;
          return;
        }
        dragging = true;
        page = document.querySelector<HTMLElement>(".stack-page:not(.leaving)");
        page?.classList.remove("settling");
        page?.classList.add("dragging");
        root.setAttribute("data-stack-drag", "");
        if (e.target instanceof Element) e.target.setPointerCapture?.(e.pointerId);
      }
      // In a circle there is always a neighbour, unless the stack holds one widget.
      const o = membersRef.current.length >= 2 ? a * DRAG_FOLLOW : 0;
      off = sideways ? { x: o, y: 0 } : { x: 0, y: o };
      place();
      if (o !== 0 && Math.abs(a) >= DRAG_TURN) {
        turnedNow = true;
        page?.classList.remove("dragging");
        page = null;
        go(a < 0 ? 1 : -1, off);
      }
    };
    function up(e: PointerEvent) {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (!dragging) return;
      dragging = false;
      const turned = turnedNow;
      turnedNow = false;
      root.removeAttribute("data-stack-drag");
      // The click that ends the drag lands nowhere.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const el = page;
      page = null;
      el?.classList.remove("dragging");
      if (!turned && el && (off.x !== 0 || off.y !== 0)) {
        el.classList.add("settling");
        off = { x: 0, y: 0 };
        el.style.setProperty("--drag-x", "0px");
        el.style.setProperty("--drag-y", "0px");
        window.setTimeout(() => el.classList.remove("settling"), 320);
      }
      off = { x: 0, y: 0 };
    }
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      root.removeAttribute("data-stack-drag");
    };
  }, [go]);

  // A room clicked in the schedule while the map is in the stack: the stack turns to the map, which shows it.
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void listen<{ room?: unknown }>(
      MAP_FOCUS_EVENT,
      (e) => {
        const room = typeof e.payload?.room === "string" ? e.payload.room.trim() : "";
        if (!room || !membersRef.current.includes("map")) return;
        const from = membersRef.current.indexOf(shownRef.current ?? "");
        show("map", { dir: membersRef.current.indexOf("map") >= from ? 1 : -1, sideways: sidewaysRef.current });
        setFocus((f) => ({ room, ask: f.ask + 1 }));
      },
      { target: getCurrentWindow().label },
    ).then((u) => (alive ? (off = u) : u()));
    return () => {
      alive = false;
      off?.();
    };
  }, [show]);

  // The menu needs the keyboard and must close on a click elsewhere: this window takes the focus for it.
  const openAdd = useCallback(() => {
    invoke("activate_tile").catch(() => undefined);
    if (def) void popupMenu(addItems(s, def.id, "stack-add")).catch(() => undefined);
  }, [s, def]);

  if (!loaded || !def) return null;

  if (folded && id) {
    // The stack's icon (and name): its menu, a click opens it in the pop-up.
    return (
      <div className="stack-root">
        <div className="stack-page">
          <Tile label={stackLabel(id)} face={{ art: <Icon name="stack" size={24} />, name: stackName(s, def) }}>
            {null}
          </Tile>
        </div>
      </div>
    );
  }

  const sideways = def.axis === "horizontal";
  const chrome = (
    <>
      {members.length >= 1 && !editing && <Rail names={names} index={index} go={go} jump={jump} sideways={sideways} />}
      {editing && <DropZone over={dragOver} />}
    </>
  );
  const api = (label: string, withChrome: boolean): StackApi => ({
    id: def.id,
    label,
    members,
    go,
    remove: (l) => void removeFromStack(l),
    add: (l) => void addToStack(l, def.id),
    chrome: withChrome ? chrome : null,
    room: label === "map" ? focus.room : null,
    ask: label === "map" ? focus.ask : 0,
  });

  const rootCls = [
    "stack-root",
    sideways ? "axis-x" : "",
    dragOver ? "drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!shown) {
    return (
      <div className={rootCls}>
        <div className="stack-page">
          <StackContext.Provider value={api("stack", true)}>
            <Tile label="stack" className="tile-stack-empty">
              <Empty onAdd={openAdd} />
            </Tile>
          </StackContext.Provider>
        </div>
      </div>
    );
  }
  const pageCls = (extra: string) => ["stack-page", members.length >= 1 ? "with-rail" : "", extra].filter(Boolean).join(" ");
  return (
    <div className={rootCls}>
      {leaving && (
        <div
          key={`out-${leaving.seq}`}
          className={pageCls(`leaving ${leaving.turn.dir > 0 ? "to-up" : "to-down"} ${leaving.turn.sideways ? "sx" : ""}`)}
          style={leaving.turn.from ? ({ "--drag-x": `${leaving.turn.from.x}px`, "--drag-y": `${leaving.turn.from.y}px` } as CSSProperties) : undefined}
          aria-hidden="true"
        >
          <StackContext.Provider value={api(leaving.label, false)}>
            <Member label={leaving.label} />
          </StackContext.Provider>
        </div>
      )}
      <div
        key={`in-${shown}`}
        className={pageCls(
          [entering ? (entering.dir > 0 ? "from-down" : "from-up") : "", entering?.sideways ? "sx" : "", joined === shown ? "joined" : ""].join(" "),
        )}
      >
        <StackContext.Provider value={api(shown, true)}>
          <Member label={shown} />
        </StackContext.Provider>
      </div>
    </div>
  );
}
