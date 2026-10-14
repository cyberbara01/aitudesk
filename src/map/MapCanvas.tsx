// Map viewport with its own zoom engine. At rest the <svg> is laid out at its real size (fit × zoom), so Chromium
// rasterises the plan at the zoom it is seen at and it stays crisp from 1× to 6×; it is moved with a translate
// snapped to whole device pixels (a layer at a fractional offset is resampled and goes soft). Strokes are
// non-scaling (map.css): the seams between rooms and the few lines keep their screen width at any zoom once the view
// rests. During a gesture or a move the laid-out plan is scaled by the compositor, its seams and lines with it
// (between half and twice their width), until the next lay-out.
//
// Zooming does not lay the drawing out again per step. A new size means shaping every room code again (SVG text is
// laid out at its size on screen), recording the whole plan and rasterising it: far too much for the integrated
// GPU and CPU of a laptop at the rate a wheel or a touchpad pinch sends events. So a view change only updates the
// view (refs) and asks for a frame; the frame writes one transform, the translate plus a scale from the size the
// svg is laid out at. The svg is its own compositor layer (will-change), and Chromium keeps such a layer's raster
// while only its transform changes, so a zoom step costs no layout, paint or raster: the compositor magnifies or
// shrinks the existing plan (text a little soft meanwhile). When the view has rested for 150 ms the real size is
// laid out (crisp again) together with the level-of-detail pass. A gesture that drifts beyond 2× either way from
// the laid-out size lays out on the way, so the magnified plan never gets too soft and a zoom-out never asks the
// compositor for much more plan than it has rasterised. Hit-testing and getBoundingClientRect follow the transform,
// so clicks, the paint hover and the lesson bubble are right at every moment.
//
// Animated moves (the +/− buttons, «Вписать», the focus on found rooms) step the same transform along the eased
// path, one write per frame, within the same 2× bound: a frame that would drift further lays the plan out ahead on
// the path (twice or half its zoom, never past the end), so it covers the next fourfold of the move. A step of
// the buttons lays out only at its end, a fit from 6× or a focus from 1× once or twice on the way, and no frame
// ever shows the plan blurry.
//
// A mouse wheel notch is a step, not a gesture: its frame lays the plan out at once, so every notch is crisp at
// once instead of magnified for a moment (a fast spin still lays out at most once a frame). A touchpad pinch or
// scroll, many small events, keeps the compositor path above.
//
// Wheel zooms towards the cursor (×1.1 per 100 px of deltaY, 1× to 6×), the left button drags with pointer capture,
// a double click fits (250 ms, --ease-move), the +/− buttons step ×1.5 around the centre (167 ms). Panning is
// clamped to the host while the drawing is larger than it and centred while it is not. The view lives in refs and
// is written to the element directly, so wheel and drag never re-render the floor drawings.
//
// Level of detail (lod.ts): labels and pictograms too small to read are hidden; the check runs whenever the real
// size is laid out and synchronously when a floor mounts, so a floor never shows a frame of unreadable text.
// Search highlight, marked rooms, the lesson marker (lessonMarker.ts) and the paint hover are classes and
// attributes on the room groups, written here. Floor changes keep the view and play a 167 ms slide (12 screen px).
//
// Floors stay: a floor's drawing is made once and then only shown or hidden (display: none), so a change costs a
// class, not a new drawing with its room codes shaped again. The floors not shown at start are prepared while the
// map rests after it appears (laid out invisibly for one frame: codes placed, sizes measured, then hidden).
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
import { FLOORS, MAX_ZOOM, MIN_ZOOM, SWITCH_COLUMN_PX, VIEWBOX, type Floor } from "./types";
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
  /** The view rests at the largest zoom, or fitted (zooming out or fitting would do nothing): told when either
   *  changes, never per frame, so the zoom buttons can grey out. */
  onLimits?: (atMax: boolean, atFit: boolean) => void;
}

const NO_ROOMS: readonly string[] = [];

/** How a view change is shown: on the next frame (wheel, pinch, drag, resize) or moving with the base / slow token. */
type Motion = "none" | "base" | "slow";

interface View {
  zoom: number;
  /** Translation of the svg inside the host, CSS px. */
  x: number;
  y: number;
}

/** An animated move, stepped once per frame from the view on screen to the target. */
interface Tween {
  from: View;
  to: View;
  ms: number;
  ease: (p: number) => number;
  /** Frame time of the first step; -1 until that frame. */
  start: number;
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
/** Duration token of each animated move. */
const MOTION_TOKEN: Record<Exclude<Motion, "none">, string> = { base: "--t-base", slow: "--t-slow" };
/** The view rests this long (ms) before the real size is laid out: crisp text and the level of detail. */
const SETTLE_MS = 150;
/**
 * Largest scale, and its inverse the smallest, that a gesture or a move shows the laid-out plan at before it lays out
 * on the way: magnified further the text turns blurry, shrunk further the screen shows over 4 times the plan area that was
 * in view, all of it for the compositor to rasterise. One lay-out per doubling of the zoom, not one per event.
 */
const MAX_DRIFT = 2;

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

/**
 * Reads an easing token (--ease-move) as a function of the time fraction, so the frame-stepped moves follow the
 * same curve the CSS transitions used: a cubic-bezier() is solved for its time parameter by bisection (x grows
 * monotonically for control points in 0..1, as CSS requires). Anything else falls back to linear.
 */
function readEase(name: string): (p: number) => number {
  const css = getComputedStyle(document.documentElement).getPropertyValue(name);
  const m = /cubic-bezier\(([^)]*)\)/.exec(css);
  const c = m ? m[1].split(",").map(Number) : [];
  if (c.length !== 4 || !c.every(Number.isFinite)) return (p) => p;
  const [x1, y1, x2, y2] = c;
  const bezier = (a: number, b: number, t: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const t = (lo + hi) / 2;
      if (bezier(x1, x2, t) < p) lo = t;
      else hi = t;
    }
    return bezier(y1, y2, (lo + hi) / 2);
  };
}

export const MapCanvas = memo(
  forwardRef<MapCanvasHandle, Props>(function MapCanvas(
    { floor, query, favorites, painting, onPaint, reserve, onMatches, focusSeq, onFocusResult, mark, onMarkHover, codesFromZoom, onLimits },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const rimRef = useRef<SVGPathElement>(null);
    const box = useRef<Box>({ hostW: 0, hostH: 0, fitW: 0, fitH: 0, left: 0, top: 0, biasX: 0 });
    const reserveRef = useRef(reserve);
    reserveRef.current = reserve;
    const codesFrom = useRef(codesFromZoom);
    codesFrom.current = codesFromZoom;
    // `view`: where the map is going (clamped; what the zoom point, the clamping and the drag read and write).
    // `onScreen`: what the element shows now. They differ until the next frame, and during an animated move.
    const view = useRef<View>({ zoom: MIN_ZOOM, x: 0, y: 0 });
    const onScreen = useRef<View>({ zoom: MIN_ZOOM, x: 0, y: 0 });
    /** Width the svg is laid out (rasterised) at, CSS px; 0 before the first measure. The transform scales the rest. */
    const laidW = useRef(0);
    // The requested frame (0: none), the pending lay-out of a resting view (0: none), the running animated move.
    const frame = useRef(0);
    const settleTimer = useRef(0);
    /** A mouse wheel notch came since the last frame: that frame lays out at once (crisp) instead of scaling. */
    const crispNext = useRef(false);
    const tween = useRef<Tween | null>(null);
    const press = useRef<Press | null>(null);
    const lod = useRef<{ shared: LodItem[]; floor: LodItem[] }>({ shared: [], floor: [] });
    const hovered = useRef<Element | null>(null);
    const markHovered = useRef<Element | null>(null);
    // The pointer handlers read the latest props from here.
    const live = useRef({ floor, painting, onPaint, onMarkHover, onLimits });
    live.current = { floor, painting, onPaint, onMarkHover, onLimits };
    const limits = useRef("");
    // Floors whose drawing exists (shown, leaving, or hidden), and the ones laid out invisibly to be prepared.
    const [mounted, setMounted] = useState<ReadonlySet<Floor>>(() => new Set([floor]));
    const [warming, setWarming] = useState<readonly Floor[]>([]);

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
    }, [favorites, floor, mounted]);

    // Lesson marker: on the shown floor only; a leaving floor keeps its ring and fades out with it.
    useLayoutEffect(() => {
      const layer = svgRef.current?.querySelector<SVGGElement>(`g.floor[data-floor="${floor}"]`);
      if (layer) markRooms(layer, mark && mark.floor === floor ? mark.rooms : NO_ROOMS);
    }, [floor, mark]);

    // ---- Level of detail: whenever the real size is laid out, at once when a floor mounts ----
    // It reads the target zoom, which is also what the screen shows outside an animated move.
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

    // ---- Writing the view: lay-outs (rare, crisp) and transforms (every frame of a gesture or a move, cheap) ----

    /** Lays the svg out at its real size for `zoom` (Chromium rasterises it afresh, crisp) with the level of detail. */
    const layOut = useCallback(
      (zoom: number) => {
        const svg = svgRef.current;
        if (!svg) return;
        const { fitW, fitH } = box.current;
        svg.style.width = `${fitW * zoom}px`;
        svg.style.height = `${fitH * zoom}px`;
        laidW.current = fitW * zoom;
        runLod();
      },
      [runLod],
    );

    /**
     * Shows `v` with a single transform: the translate snapped to device pixels as at rest, plus the scale from the
     * laid-out size to v's about the top left corner (map.css). The scale is left out once the two match, so a
     * resting view is translate-only and crisp. The layout and the raster stay as they are.
     */
    const place = useCallback((v: View) => {
      const svg = svgRef.current;
      if (!svg) return;
      const { fitW, left, top } = box.current;
      const s = laidW.current > 0 ? (fitW * v.zoom) / laidW.current : 1;
      const dpr = window.devicePixelRatio || 1;
      const tx = Math.round((left + v.x) * dpr) / dpr - left;
      const ty = Math.round((top + v.y) * dpr) / dpr - top;
      svg.style.transform = s === 1 ? `translate(${tx}px, ${ty}px)` : `translate(${tx}px, ${ty}px) scale(${s})`;
      onScreen.current = v;
    }, []);

    /** Ends a gesture, a move or a resize: the target view laid out at its real size and shown crisp, now. */
    const settle = useCallback(() => {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = 0;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      tween.current = null;
      layOut(view.current.zoom);
      place(view.current);
      const atMax = view.current.zoom >= MAX_ZOOM - 1e-6;
      const atFit = view.current.zoom <= MIN_ZOOM + 1e-6;
      const key = `${atMax}|${atFit}`;
      if (key !== limits.current) {
        limits.current = key;
        live.current.onLimits?.(atMax, atFit);
      }
    }, [layOut, place]);

    /**
     * One frame, the only place a gesture or a move writes the element: however many wheel, pinch or drag events
     * came since the last frame, the transform is written once. An animated move takes its next eased step and lays
     * out its end when it ends. Otherwise the target view is shown, and the lay-out waits until the view has rested
     * for SETTLE_MS (every frame that changes it starts the wait again), unless the scale has drifted too far.
     */
    const step = useCallback(
      (now: number) => {
        frame.current = 0;
        const t = tween.current;
        if (t) {
          if (t.start < 0) t.start = now;
          const p = (now - t.start) / t.ms;
          if (p >= 1) {
            settle();
            return;
          }
          const e = t.ease(p);
          const { from, to } = t;
          const zoom = from.zoom + (to.zoom - from.zoom) * e;
          const s = (box.current.fitW * zoom) / laidW.current;
          if (!(s <= MAX_DRIFT && s >= 1 / MAX_DRIFT)) {
            layOut(to.zoom > zoom ? Math.min(to.zoom, zoom * MAX_DRIFT) : Math.max(to.zoom, zoom / MAX_DRIFT));
          }
          place({ zoom, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
          frame.current = requestAnimationFrame(step);
          return;
        }
        const s = (box.current.fitW * view.current.zoom) / laidW.current;
        // Also true for NaN and Infinity, before the first lay-out.
        if (crispNext.current || !(s <= MAX_DRIFT && s >= 1 / MAX_DRIFT)) {
          crispNext.current = false;
          settle();
          return;
        }
        place(view.current);
        window.clearTimeout(settleTimer.current);
        settleTimer.current = 0;
        if (s === 1) return;
        settleTimer.current = window.setTimeout(() => {
          // A frame requested meanwhile brings more input and starts the wait again.
          if (!frame.current) settle();
        }, SETTLE_MS);
      },
      [layOut, place, settle],
    );

    const request = useCallback(() => {
      if (!frame.current) frame.current = requestAnimationFrame(step);
    }, [step]);

    useEffect(
      () => () => {
        cancelAnimationFrame(frame.current);
        window.clearTimeout(settleTimer.current);
        frame.current = 0;
        settleTimer.current = 0;
      },
      [],
    );

    // ---- Lesson marker hover: entering and leaving a marked room is reported (the tile shows the lesson in a bubble) ----
    const setMarkHover = useCallback(
      (g: Element | null) => {
        if (markHovered.current === g) return;
        markHovered.current = g;
        // A frame still to be written moves the room: it is written first, so the box is where the room shows.
        if (g && frame.current) {
          cancelAnimationFrame(frame.current);
          step(performance.now());
        }
        live.current.onMarkHover(g ? g.getBoundingClientRect() : null);
      },
      [step],
    );

    /**
     * Sets the target view (clamped) and shows it: on the next frame for "none", along the eased path for a move.
     * A move starts from what is on screen and follows the path the CSS transitions of the size and the translate
     * took before (zoom and translate eased alike, so the zoom point stays put); step() keeps it within MAX_DRIFT
     * of the laid-out size and lays out the end when it ends. With no motion time (reduced motion), or nowhere to
     * go, the view is laid out at once.
     */
    const setView = useCallback(
      (zoom: number, x: number, y: number, motion: Motion) => {
        const b = box.current;
        const z = clampZoom(zoom);
        view.current = { zoom: z, x: clampAxis(x, b.hostW, b.fitW * z, b.biasX), y: clampAxis(y, b.hostH, b.fitH * z) };
        // The room under a lesson bubble moves: the bubble goes (the next pointer move brings it back).
        setMarkHover(null);
        if (motion === "none") {
          tween.current = null;
          request();
          return;
        }
        const ms = readMs(MOTION_TOKEN[motion]);
        const from = onScreen.current;
        const to = view.current;
        if (ms <= 0 || (from.zoom === to.zoom && from.x === to.x && from.y === to.y)) {
          settle();
          return;
        }
        window.clearTimeout(settleTimer.current);
        settleTimer.current = 0;
        tween.current = { from, to, ms, ease: readEase("--ease-move"), start: -1 };
        request();
      },
      [request, settle, setMarkHover],
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
      // A new fit (or origin) changes the size the svg must have: laid out at once, before the next frame paints.
      setView(zoom, hostW / 2 - fx * fitW * zoom, hostH / 2 - fy * fitH * zoom, "none");
      settle();
    }, [setView, settle]);

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
        // A notch of a mouse wheel (a touchpad sends many small deltas instead): crisp on its own frame.
        if (!pinch && Math.abs(dy) >= PINCH_MAX_DELTA) crispNext.current = true;
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
      // No lesson bubble while a move carries the rooms along: its box would be left behind.
      else if (!tween.current) setMarkHover((e.target as Element).closest("g.room-next"));
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
      const ppu = (box.current.fitW / VIEWBOX.w) * onScreen.current.zoom;
      setLeaving({ floor: prevFloor, dir: floor > prevFloor ? 1 : -1, shift: ppu > 0 ? SLIDE_PX / ppu : 0 });
      if (!mounted.has(floor)) setMounted(new Set([...mounted, floor]));
    }

    // ---- The other floors, prepared once the map has appeared and rests: no change ever waits for a drawing ----
    useEffect(() => {
      const left = FLOORS.filter((f) => !mounted.has(f));
      if (!left.length || warming.length) return;
      const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500));
      const cancel = window.cancelIdleCallback ?? window.clearTimeout;
      const id = idle(() => setWarming(left), { timeout: 4000 });
      return () => cancel(id);
    }, [mounted, warming]);

    // Laid out but invisible: their room codes are placed and their sizes measured (both cached per floor, see
    // codes.ts and lod.ts), then they are hidden before this frame is painted.
    useLayoutEffect(() => {
      if (!warming.length) return;
      const svg = svgRef.current;
      for (const f of warming) {
        const layer = svg?.querySelector(`g.floor[data-floor="${f}"]`);
        if (!layer) continue;
        placeCodes(layer, `floor-${f}`);
        lodItems(layer, `floor-${f}`);
      }
      setMounted((cur) => new Set([...cur, ...warming]));
      setWarming([]);
    }, [warming]);

    const onLeaveEnd = useCallback((e: AnimationEvent<SVGGElement>) => {
      if (e.target === e.currentTarget) setLeaving(null);
    }, []);

    // Safety net: drop the leaving layer even if animationend never fires (reduced motion: 0 ms).
    useEffect(() => {
      if (!leaving) return;
      const t = window.setTimeout(() => setLeaving(null), readMs("--t-base") + 50);
      return () => window.clearTimeout(t);
    }, [leaving]);

    // ---- The building's rim: a copy of the silhouette's outline (the backdrop's .bg path), before the first frame ----
    useLayoutEffect(() => {
      const rim = rimRef.current;
      const bg = svgRef.current?.querySelector(".bg");
      if (!rim || !bg) return;
      rim.setAttribute("d", bg.getAttribute("d") ?? "");
      const tf = bg.getAttribute("transform");
      if (tf) rim.setAttribute("transform", tf);
    }, []);

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

    // Every drawn floor, in one order so React keeps each drawing: the shown one, the one leaving, the hidden ones
    // («off»: display none) and the ones being prepared («warm»: laid out, not painted).
    const layers: { floor: Floor; state: "in" | "out" | "idle" | "off" | "warm"; offset: number }[] = FLOORS.filter(
      (f) => mounted.has(f) || f === floor || warming.includes(f),
    ).map((f) => {
      if (f === floor) return { floor: f, state: leaving ? "in" : "idle", offset: leaving ? -leaving.dir * leaving.shift : 0 };
      if (leaving && f === leaving.floor) return { floor: f, state: "out", offset: leaving.dir * leaving.shift };
      return { floor: f, state: warming.includes(f) ? "warm" : "off", offset: 0 };
    });

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
          <path ref={rimRef} className="map-rim" />
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
