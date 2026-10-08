// Map viewport with its own zoom engine. The <svg> is laid out at its real size (fit × zoom), so
// Chromium re-rasterises it on every zoom change and the plan stays crisp from 1× to 6×; it is panned with a
// translate-only transform, snapped to whole device pixels (a layer at a fractional offset is resampled and goes
// soft), never with a CSS scale. Strokes are non-scaling (map.css): one screen pixel at any zoom.
//
// Wheel zooms towards the cursor (×1.1 per 100 px of deltaY, 1× to 6×), the left button drags with pointer capture,
// a double click fits (250 ms, --ease-move), the +/− buttons step ×1.5 around the centre (167 ms). Panning is
// clamped to the host while the drawing is larger than it and centred while it is not. The view lives in refs and
// is written to the element directly, so wheel and drag never re-render the floor drawings.
//
// Level of detail (lod.ts): labels and pictograms too small to read are hidden; the check runs at most once per
// animation frame after a zoom or resize and synchronously when a floor mounts, so a floor never shows a frame of
// unreadable text. Search highlight, marked rooms, the lesson marker (lessonMarker.ts) and the paint hover are
// classes and attributes on the room groups, written here. Floor changes keep the view and play the 250 ms slide
// (12 screen px).
//
// Paint mode: a press that moves less than 4 px is a click and paints the room under it; more is a drag that pans.
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { onColor } from "../lib/design";
import type { MapFavorite } from "../lib/settings";
import { placeCodes } from "./codes";
import { Floor1 } from "./floors/Floor1";
import { Floor2 } from "./floors/Floor2";
import { Floor3 } from "./floors/Floor3";
import { markRooms } from "./lessonMarker";
import { applyLod, lodItems, type LodItem } from "./lod";
import { IconsCommon } from "./parts/IconsCommon";
import { Wallpaper } from "./parts/Wallpaper";
import { checkRoomIndex } from "./roomIndex";
import { roomAt, roomGroupAt } from "./rooms";
import { MAX_ZOOM, MIN_ZOOM, SWITCH_COLUMN_PX, VIEWBOX, type Floor } from "./types";
import { highlightRooms } from "./useRoomSearch";

export interface MapCanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  /** «Вписать»: back to the fitted, centred view. */
  fit(): void;
}

interface Props {
  floor: Floor;
  /** Upper-cased room query; "" when no search is active. */
  query: string;
  /** Marked rooms (data-name upper-cased → colour), painted over the colour scheme. */
  favorites: readonly MapFavorite[];
  /** Paint mode: rooms show a hover outline and a click (not a drag) on a room calls onPaint. */
  painting: boolean;
  onPaint: (room: string) => void;
  /** Side where the always-visible floor switch stands: the fitted view keeps that column free. Null: none. */
  reserve: "left" | "right" | null;
  /** Number of rooms the query matches on the shown floor, reported after every highlight. */
  onMatches: (count: number) => void;
  /** Each new value asks to centre and zoom on the found rooms once the floor with them is shown. */
  focusSeq: number;
  /** Outcome of a focus request: false when nothing on the floor matches the query. */
  onFocusResult: (found: boolean) => void;
  /** Rooms of the lesson to mark (nextLesson.ts); drawn while their floor is shown. Null: no marker. */
  mark: { floor: Floor; rooms: readonly string[] } | null;
  /** The pointer came over a marked room (its box in window px) or left it (null); never while painting or pressing. */
  onMarkHover: (box: DOMRect | null) => void;
  /** Room codes show from this zoom on (1: whenever they are big enough to read). */
  codesFromZoom: number;
}

const NO_ROOMS: readonly string[] = [];

/** How a view change is shown: at once (wheel, drag, resize) or with the base / slow motion token. */
type Motion = "none" | "base" | "slow";

interface View {
  zoom: number;
  /** Translation of the svg inside the host, CSS px. */
  x: number;
  y: number;
}

interface Box {
  /** Host (clip) size, CSS px. */
  hostW: number;
  hostH: number;
  /** Drawing size at zoom 1: fitted into the tile's content box, so the 1× view keeps the tile padding. */
  fitW: number;
  fitH: number;
  /** Host origin in the window, CSS px (for pixel snapping and wheel coordinates). */
  left: number;
  top: number;
  /** Horizontal shift of the centred drawing towards the side away from the floor switch, CSS px. */
  biasX: number;
}

interface Leaving {
  floor: Floor;
  /** +1 when the new floor is higher (old slides down, new arrives from above), −1 otherwise. */
  dir: 1 | -1;
  /** 12 screen px expressed in SVG user units at the moment the change started. */
  shift: number;
}

interface Press {
  id: number;
  sx: number;
  sy: number;
  /** View translation when the press started. */
  ox: number;
  oy: number;
  /** False while a paint-mode press is still a possible click. */
  panning: boolean;
  /** Paint mode: the room under the press. */
  room: string | null;
}

/** The floor drawings take no props and never change: memoised so view and search updates do not reconcile them. */
const FLOOR_VIEW: Record<Floor, ComponentType> = { 1: memo(Floor1), 2: memo(Floor2), 3: memo(Floor3) };
const Backdrop = memo(Wallpaper);
const Pictograms = memo(IconsCommon);

/** Slide distance of a floor change, screen px. */
const SLIDE_PX = 12;
/** Zoom buttons multiply/divide the zoom by this. */
const BUTTON_FACTOR = 1.5;
/** Wheel: the zoom is multiplied by this per 100 px of deltaY (one mouse notch in WebView2). */
const WHEEL_FACTOR = 1.1;
/**
 * A touchpad pinch arrives as Ctrl + wheel events of -100 ln(scale) px each, a few px at a time; a wheel notch is
 * 100 px even with Ctrl held. Ctrl + wheel below this size is a pinch and follows the fingers exactly.
 */
const PINCH_MAX_DELTA = 50;
/** deltaMode line / page deltas expressed in px. */
const LINE_PX = 16;
const PAGE_PX = 100;
/** Paint mode: a press that travels less than this (CSS px) is a click, further is a drag. */
const CLICK_SLOP = 4;
/** Focus on found rooms: they fill at most this share of the host, and the zoom stops here (codes read from ~2×). */
const FOCUS_FILL = 0.35;
const FOCUS_MAX_ZOOM = 3.5;
const DURATION: Record<Motion, string> = { none: "0ms", base: "var(--t-base)", slow: "var(--t-slow)" };

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Translation along one axis: clamped to the host while the drawing is larger than it, centred while it is not.
 * `bias` moves the centred drawing sideways, never further than its free margin, so it fades out smoothly as
 * the zoom grows and the clamped range takes over without a jump.
 */
function clampAxis(pos: number, host: number, draw: number, bias = 0): number {
  if (draw <= host) {
    const margin = (host - draw) / 2;
    return margin + Math.max(-margin, Math.min(margin, bias));
  }
  return Math.min(0, Math.max(host - draw, pos));
}

/** Reads a motion token (--t-slow) in ms; tokens.css makes it 0 under prefers-reduced-motion. */
function readMs(name: string): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : 0;
}

export const MapCanvas = memo(
  forwardRef<MapCanvasHandle, Props>(function MapCanvas(
    { floor, query, favorites, painting, onPaint, reserve, onMatches, focusSeq, onFocusResult, mark, onMarkHover, codesFromZoom },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const box = useRef<Box>({ hostW: 0, hostH: 0, fitW: 0, fitH: 0, left: 0, top: 0, biasX: 0 });
    const reserveRef = useRef(reserve);
    reserveRef.current = reserve;
    const codesFrom = useRef(codesFromZoom);
    codesFrom.current = codesFromZoom;
    const view = useRef<View>({ zoom: MIN_ZOOM, x: 0, y: 0 });
    const press = useRef<Press | null>(null);
    const lod = useRef<{ shared: LodItem[]; floor: LodItem[] }>({ shared: [], floor: [] });
    const lodFrame = useRef(0);
    const hovered = useRef<Element | null>(null);
    const markHovered = useRef<Element | null>(null);
    // The pointer handlers read the latest props from here.
    const live = useRef({ floor, painting, onPaint, onMarkHover });
    live.current = { floor, painting, onPaint, onMarkHover };

    // ---- Marked rooms and the lesson marker. The first layout effects: their attributes are on the rooms before
    // anything below makes the browser compute styles, so a floor (and the tile at start) never fades them in. ----

    // Marked rooms: data-fav (the colour) plus --fav / --fav-on on the room groups; map.css paints them.
    useLayoutEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const byRoom = new Map(favorites.map((f) => [f.room.toUpperCase(), f.color.toUpperCase()]));
      for (const g of svg.querySelectorAll<SVGGElement>("g.floor g[data-name]")) {
        const want = byRoom.get((g.getAttribute("data-name") ?? "").trim().toUpperCase()) ?? null;
        if (g.getAttribute("data-fav") === want) continue;
        if (want) {
          g.setAttribute("data-fav", want);
          g.style.setProperty("--fav", want);
          g.style.setProperty("--fav-on", onColor(want));
        } else {
          g.removeAttribute("data-fav");
          g.style.removeProperty("--fav");
          g.style.removeProperty("--fav-on");
        }
      }
    }, [favorites, floor]);

    // Lesson marker: on the shown floor only; a leaving floor keeps its ring and fades out with it.
    useLayoutEffect(() => {
      const layer = svgRef.current?.querySelector<SVGGElement>(`g.floor[data-floor="${floor}"]`);
      if (layer) markRooms(layer, mark && mark.floor === floor ? mark.rooms : NO_ROOMS);
    }, [floor, mark]);

    // ---- Level of detail: at most once per frame after a view change, at once when a floor mounts ----
    const runLod = useCallback(() => {
      const ppu = (box.current.fitW / VIEWBOX.w) * view.current.zoom;
      if (ppu <= 0) return;
      const codes = view.current.zoom >= codesFrom.current - 1e-6;
      applyLod(lod.current.shared, ppu, codes);
      applyLod(lod.current.floor, ppu, codes);
    }, []);

    // «Номера только при приближении» switched: the codes follow at once.
    useEffect(() => {
      runLod();
    }, [codesFromZoom, runLod]);

    const scheduleLod = useCallback(() => {
      if (lodFrame.current) return;
      lodFrame.current = requestAnimationFrame(() => {
        lodFrame.current = 0;
        runLod();
      });
    }, [runLod]);

    useEffect(
      () => () => {
        cancelAnimationFrame(lodFrame.current);
        lodFrame.current = 0;
      },
      [],
    );

    // ---- Lesson marker hover: entering and leaving a marked room is reported (the tile shows the lesson in a bubble) ----
    const setMarkHover = useCallback((g: Element | null) => {
      if (markHovered.current === g) return;
      markHovered.current = g;
      live.current.onMarkHover(g ? g.getBoundingClientRect() : null);
    }, []);

    /** Writes the view to the element: real size, translate snapped to device pixels, transition for `motion`. */
    const apply = useCallback(
      (motion: Motion) => {
        const svg = svgRef.current;
        if (!svg) return;
        // The room under a lesson bubble moves: the bubble goes (the next pointer move brings it back).
        setMarkHover(null);
        const { fitW, fitH, left, top } = box.current;
        const { zoom, x, y } = view.current;
        const dpr = window.devicePixelRatio || 1;
        const tx = Math.round((left + x) * dpr) / dpr - left;
        const ty = Math.round((top + y) * dpr) / dpr - top;
        const st = svg.style;
        st.transitionDuration = DURATION[motion];
        st.width = `${fitW * zoom}px`;
        st.height = `${fitH * zoom}px`;
        st.transform = `translate(${tx}px, ${ty}px)`;
        scheduleLod();
      },
      [scheduleLod, setMarkHover],
    );

    const setView = useCallback(
      (zoom: number, x: number, y: number, motion: Motion) => {
        const b = box.current;
        const z = clampZoom(zoom);
        view.current = { zoom: z, x: clampAxis(x, b.hostW, b.fitW * z, b.biasX), y: clampAxis(y, b.hostH, b.fitH * z) };
        apply(motion);
      },
      [apply],
    );

    /** Multiplies the zoom by `factor` keeping the drawing point under (cx, cy), host coordinates, in place. */
    const zoomAt = useCallback(
      (factor: number, cx: number, cy: number, motion: Motion) => {
        const { zoom, x, y } = view.current;
        const z = clampZoom(zoom * factor);
        if (z === zoom) return;
        const k = z / zoom;
        setView(z, cx - (cx - x) * k, cy - (cy - y) * k, motion);
      },
      [setView],
    );

    const fit = useCallback((motion: Motion) => setView(MIN_ZOOM, 0, 0, motion), [setView]);

    // ---- Fit: measure the host (clip) and the tile's content box (fit); keep the relative centre on resize ----
    // The 1× view fits the content box minus the floor switch column when the switch is always shown, and is
    // centred in what is left, so the switch never covers the plan at rest.
    const measure = useCallback(() => {
      const host = hostRef.current;
      if (!host) return;
      const hostW = host.clientWidth;
      const hostH = host.clientHeight;
      if (hostW <= 0 || hostH <= 0) return;
      const root = host.parentElement;
      const padX = root ? Math.max(0, (hostW - root.clientWidth) / 2) : 0;
      const padY = root ? Math.max(0, (hostH - root.clientHeight) / 2) : 0;
      const side = reserveRef.current;
      const keep = side ? SWITCH_COLUMN_PX : 0;
      const s = Math.min(Math.max(1, hostW - 2 * padX - keep) / VIEWBOX.w, Math.max(1, hostH - 2 * padY) / VIEWBOX.h);
      const fitW = s * VIEWBOX.w;
      const fitH = s * VIEWBOX.h;
      const r = host.getBoundingClientRect();
      const prev = box.current;
      const { zoom, x, y } = view.current;
      // Drawing point that was at the host centre, as a fraction of the drawing (0.5 before the first measure).
      const fx = prev.fitW > 0 ? (prev.hostW / 2 - x) / (prev.fitW * zoom) : 0.5;
      const fy = prev.fitH > 0 ? (prev.hostH / 2 - y) / (prev.fitH * zoom) : 0.5;
      const biasX = side === "left" ? keep / 2 : side === "right" ? -keep / 2 : 0;
      box.current = { hostW, hostH, fitW, fitH, left: r.left, top: r.top, biasX };
      setView(zoom, hostW / 2 - fx * fitW * zoom, hostH / 2 - fy * fitH * zoom, "none");
    }, [setView]);

    useLayoutEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      measure();
      const ro = new ResizeObserver(() => measure());
      ro.observe(host);
      // Something around the map moved it without a resize (the pop-up's card grew in and stood still, or a CSS
      // animation of an ancestor ended): its origin for the pixel snapping and the zoom point is read again.
      const onAnimationEnd = (e: Event) => {
        if (e.target instanceof Element && e.target !== host && e.target.contains(host)) measure();
      };
      const onSettled = () => measure();
      window.addEventListener("animationend", onAnimationEnd);
      window.addEventListener("popup-settled", onSettled);
      return () => {
        ro.disconnect();
        window.removeEventListener("animationend", onAnimationEnd);
        window.removeEventListener("popup-settled", onSettled);
      };
    }, [measure]);

    // The switch side or its visibility changed: fit again around the same point.
    useLayoutEffect(() => {
      measure();
    }, [reserve, measure]);

    // ---- Wheel: zoom towards the cursor (native listener so the default can be prevented) ----
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const dy = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaMode === 2 ? e.deltaY * PAGE_PX : e.deltaY;
        if (dy === 0) return;
        const b = box.current;
        const pinch = e.ctrlKey && Math.abs(dy) < PINCH_MAX_DELTA;
        zoomAt(pinch ? Math.exp(-dy / 100) : WHEEL_FACTOR ** (-dy / 100), e.clientX - b.left, e.clientY - b.top, "none");
      };
      host.addEventListener("wheel", onWheel, { passive: false });
      return () => host.removeEventListener("wheel", onWheel);
    }, [zoomAt]);

    // ---- Paint hover: an outline on the room under the pointer (one class, moved only when the room changes) ----
    const setHover = useCallback((g: Element | null) => {
      if (hovered.current === g) return;
      hovered.current?.classList.remove("paint-hover");
      hovered.current = g;
      g?.classList.add("paint-hover");
    }, []);

    useEffect(() => {
      setHover(null);
    }, [painting, floor, setHover]);

    useEffect(() => {
      setMarkHover(null);
    }, [painting, floor, mark, setMarkHover]);

    // ---- Touch screens: the fingers on the plan; two of them zoom about their midpoint and pan with it ----
    const fingers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
    const measurePinch = () => {
      const [a, b] = [...fingers.current.values()];
      return { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };

    // ---- Pointer: drag pans; in paint mode a short press is a click on a room ----
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
      setMarkHover(null);
      if (e.pointerType === "touch") {
        fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.current.size >= 2) {
          // A second finger turns the press into a pinch: no drag of its own and no click on a room.
          const p = press.current;
          if (p && e.currentTarget.hasPointerCapture(p.id)) e.currentTarget.releasePointerCapture(p.id);
          press.current = null;
          if (fingers.current.size === 2) {
            e.currentTarget.setPointerCapture(e.pointerId);
            pinch.current = measurePinch();
          }
          return;
        }
      }
      if (e.button !== 0 || press.current) return;
      const { painting: paint, floor: shown } = live.current;
      e.currentTarget.setPointerCapture(e.pointerId);
      press.current = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        ox: view.current.x,
        oy: view.current.y,
        panning: !paint,
        room: paint ? roomAt(e.target as Element, shown) : null,
      };
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch" && fingers.current.has(e.pointerId)) {
        fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const from = pinch.current;
        if (from && fingers.current.size === 2) {
          const to = measurePinch();
          const b = box.current;
          setView(view.current.zoom, view.current.x + to.mx - from.mx, view.current.y + to.my - from.my, "none");
          zoomAt(to.dist / from.dist, to.mx - b.left, to.my - b.top, "none");
          pinch.current = to;
          return;
        }
      }
      const p = press.current;
      if (p && p.id === e.pointerId) {
        const dx = e.clientX - p.sx;
        const dy = e.clientY - p.sy;
        if (!p.panning) {
          if (dx * dx + dy * dy < CLICK_SLOP * CLICK_SLOP) return;
          p.panning = true;
          setHover(null);
        }
        setView(view.current.zoom, p.ox + dx, p.oy + dy, "none");
        return;
      }
      if (live.current.painting) setHover(roomGroupAt(e.target as Element, live.current.floor));
      else setMarkHover((e.target as Element).closest("g.room-next"));
    };

    const endPress = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
      if (fingers.current.delete(e.pointerId) && fingers.current.size < 2) pinch.current = null;
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      press.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      const { painting: paint, onPaint: paintRoom } = live.current;
      if (!cancelled && paint && !p.panning && p.room) paintRoom(p.room);
    };

    // ---- Floor transition (derived from the previous render's floor, so both layers switch in one commit) ----
    const [prevFloor, setPrevFloor] = useState(floor);
    const [leaving, setLeaving] = useState<Leaving | null>(null);
    if (floor !== prevFloor) {
      setPrevFloor(floor);
      const ppu = (box.current.fitW / VIEWBOX.w) * view.current.zoom;
      setLeaving({ floor: prevFloor, dir: floor > prevFloor ? 1 : -1, shift: ppu > 0 ? SLIDE_PX / ppu : 0 });
    }

    const onLeaveEnd = useCallback((e: AnimationEvent<SVGGElement>) => {
      if (e.target === e.currentTarget) setLeaving(null);
    }, []);

    // Safety net: drop the leaving layer even if animationend never fires (reduced motion: 0 ms).
    useEffect(() => {
      if (!leaving) return;
      const t = window.setTimeout(() => setLeaving(null), readMs("--t-slow") + 50);
      return () => window.clearTimeout(t);
    }, [leaving]);

    // ---- Level of detail: shared pictograms once, the shown floor whenever it mounts (before its first frame) ----
    useLayoutEffect(() => {
      const shared = svgRef.current?.querySelector(".map-shared");
      lod.current.shared = shared ? lodItems(shared, "shared") : [];
      runLod();
    }, [runLod]);

    useLayoutEffect(() => {
      const layer = svgRef.current?.querySelector(`g.floor[data-floor="${floor}"]`);
      if (layer) placeCodes(layer, `floor-${floor}`);
      if (import.meta.env.DEV && layer) checkRoomIndex(layer, floor);
      lod.current.floor = layer ? lodItems(layer, `floor-${floor}`) : [];
      runLod();
    }, [floor, runLod]);

    // ---- Search highlight: the shown floor; the leaving one is cleared so it fades out plain ----
    useLayoutEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;
      let count = 0;
      for (const layer of svg.querySelectorAll("g.floor")) {
        const shown = layer.getAttribute("data-floor") === String(floor);
        const n = highlightRooms(layer, shown ? query : "");
        if (shown) count = n;
      }
      // The other rooms dim only around a hit: a query that matches nothing leaves the plan as it is.
      svg.classList.toggle("searching", count > 0);
      onMatches(count);
    }, [floor, query, onMatches]);

    // ---- Focus: centre and zoom on the found rooms (Enter in the search field, the schedule tile) ----
    const focusDone = useRef(focusSeq);
    useLayoutEffect(() => {
      if (focusSeq === focusDone.current) return;
      focusDone.current = focusSeq;
      const layer = svgRef.current?.querySelector(`g.floor[data-floor="${floor}"]`);
      const hits = layer ? Array.from(layer.querySelectorAll<SVGGElement>("g[data-name].room-found")) : [];
      const b = box.current;
      if (!hits.length || b.fitW <= 0) {
        onFocusResult(false);
        return;
      }
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const g of hits) {
        const r = g.getBBox();
        x0 = Math.min(x0, r.x);
        y0 = Math.min(y0, r.y);
        x1 = Math.max(x1, r.x + r.width);
        y1 = Math.max(y1, r.y + r.height);
      }
      // Big enough to read the codes with the plan around them; several rooms far apart all stay in view.
      const unit = b.fitW / VIEWBOX.w;
      const fill = Math.min((b.hostW * FOCUS_FILL) / Math.max(1, (x1 - x0) * unit), (b.hostH * FOCUS_FILL) / Math.max(1, (y1 - y0) * unit));
      const z = clampZoom(Math.min(FOCUS_MAX_ZOOM, fill));
      const cx = ((x0 + x1) / 2) * unit * z;
      const cy = ((y0 + y1) / 2) * unit * z;
      setView(z, b.hostW / 2 - cx, b.hostH / 2 - cy, "slow");
      onFocusResult(true);
    }, [focusSeq, floor, query, setView, onFocusResult]);

    useImperativeHandle(
      ref,
      () => ({
        zoomIn() {
          const b = box.current;
          zoomAt(BUTTON_FACTOR, b.hostW / 2, b.hostH / 2, "base");
        },
        zoomOut() {
          const b = box.current;
          zoomAt(1 / BUTTON_FACTOR, b.hostW / 2, b.hostH / 2, "base");
        },
        fit() {
          fit("slow");
        },
      }),
      [zoomAt, fit],
    );

    const layers: { floor: Floor; state: "in" | "out" | "idle"; offset: number }[] = [];
    if (leaving) layers.push({ floor: leaving.floor, state: "out", offset: leaving.dir * leaving.shift });
    layers.push({ floor, state: leaving ? "in" : "idle", offset: leaving ? -leaving.dir * leaving.shift : 0 });

    return (
      <div
        ref={hostRef}
        className="map-host"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPress(e, false)}
        onPointerCancel={(e) => endPress(e, true)}
        onLostPointerCapture={(e) => endPress(e, true)}
        onPointerLeave={() => {
          if (!press.current) setHover(null);
          setMarkHover(null);
        }}
        onDoubleClick={() => {
          // Quick clicks while painting must not refit the map.
          if (!live.current.painting) fit("slow");
        }}
      >
        <svg
          ref={svgRef}
          className="map-svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <Backdrop />
          {layers.map((l) => {
            const View = FLOOR_VIEW[l.floor];
            return (
              <g
                key={`f${l.floor}`}
                className={`floor floor-${l.state}`}
                data-floor={l.floor}
                style={{ "--floor-shift": `${l.offset}px` } as CSSProperties}
                onAnimationEnd={l.state === "out" ? onLeaveEnd : undefined}
              >
                <View />
              </g>
            );
          })}
          <g className="map-shared">
            <Pictograms />
          </g>
        </svg>
      </div>
    );
  }),
);
