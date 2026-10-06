// Map viewport with its own zoom engine (brief §3.4). The <svg> is laid out at its real size (fit × zoom), so
// Chromium re-rasterises it on every zoom change and room codes stay crisp at 6×; it is panned with a
// translate-only transform inside an overflow-hidden host (never a CSS scale). Wheel zooms towards the cursor
// (×1.1 per 100 px of deltaY, clamped 1–6×), the left button drags with pointer capture, a double click fits
// (250 ms, --ease-move), the +/− buttons step ×1.5 around the centre (167 ms). Panning is clamped to the host
// while the drawing is larger than it and centred while it is not. The view lives in refs and is written to
// the element directly, so wheel and drag never re-render the floor drawings. Floor changes keep the view and
// play the 250 ms slide (12 screen px); the active search highlights rooms through .room-found / .searching;
// favourite rooms get data-fav plus --fav / --fav-on.
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
import { Floor1 } from "./floors/Floor1";
import { Floor2 } from "./floors/Floor2";
import { Floor3 } from "./floors/Floor3";
import { IconsCommon } from "./parts/IconsCommon";
import { Wallpaper } from "./parts/Wallpaper";
import { MAX_ZOOM, MIN_ZOOM, VIEWBOX, type Floor } from "./types";
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
  /** Favourite rooms (data-name upper-cased → colour), painted over the colour scheme. */
  favorites: readonly MapFavorite[];
}

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
}

interface Leaving {
  floor: Floor;
  /** +1 when the new floor is higher (old slides down, new arrives from above), −1 otherwise. */
  dir: 1 | -1;
  /** 12 screen px expressed in SVG user units at the moment the change started. */
  shift: number;
}

/** The floor drawings take no props and never change: memoised so view and search updates do not reconcile them. */
const FLOOR_VIEW: Record<Floor, ComponentType> = { 1: memo(Floor1), 2: memo(Floor2), 3: memo(Floor3) };
const Backdrop = memo(Wallpaper);
const Pictograms = memo(IconsCommon);

/** Slide distance of a floor change, screen px (SPEC §3). */
const SLIDE_PX = 12;
/** Zoom buttons multiply/divide the zoom by this. */
const BUTTON_FACTOR = 1.5;
/** Wheel: the zoom is multiplied by this per 100 px of deltaY (one mouse notch in WebView2). */
const WHEEL_FACTOR = 1.1;
/** deltaMode line / page deltas expressed in px. */
const LINE_PX = 16;
const PAGE_PX = 100;
const MOTION_VAR: Record<Motion, string> = { none: "0ms", base: "var(--t-base)", slow: "var(--t-slow)" };

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Translation along one axis: clamped to the host while the drawing is larger than it, centred while it is not. */
function clampAxis(pos: number, host: number, draw: number): number {
  if (draw <= host) return (host - draw) / 2;
  return Math.min(0, Math.max(host - draw, pos));
}

/** Reads a motion token (--t-slow) in ms; tokens.css makes it 0 under prefers-reduced-motion. */
function readMs(name: string): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : 0;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ floor, query, favorites }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const box = useRef<Box>({ hostW: 0, hostH: 0, fitW: 0, fitH: 0 });
  const view = useRef<View>({ zoom: MIN_ZOOM, x: 0, y: 0 });
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null);

  /** Screen px per SVG user unit at the current zoom (0 before the first measurement). */
  const pxPerUnit = useCallback(() => (box.current.fitW / VIEWBOX.w) * view.current.zoom, []);

  /** Writes the view to the element. `--map-t` picks the transition duration; `--map-px` = one screen px in user units. */
  const apply = useCallback(
    (motion: Motion) => {
      const svg = svgRef.current;
      if (!svg) return;
      const { fitW, fitH } = box.current;
      const { zoom, x, y } = view.current;
      svg.style.setProperty("--map-t", MOTION_VAR[motion]);
      svg.style.width = `${fitW * zoom}px`;
      svg.style.height = `${fitH * zoom}px`;
      svg.style.transform = `translate(${x}px, ${y}px)`;
      const ppu = pxPerUnit();
      if (ppu > 0) svg.style.setProperty("--map-px", `${1 / ppu}px`);
    },
    [pxPerUnit],
  );

  const setView = useCallback(
    (zoom: number, x: number, y: number, motion: Motion) => {
      const b = box.current;
      const z = clampZoom(zoom);
      view.current = { zoom: z, x: clampAxis(x, b.hostW, b.fitW * z), y: clampAxis(y, b.hostH, b.fitH * z) };
      apply(motion);
    },
    [apply],
  );

  /** Multiplies the zoom by `factor` keeping the drawing point under (cx, cy) — host coordinates — in place. */
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
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const hostW = host.clientWidth;
      const hostH = host.clientHeight;
      if (hostW <= 0 || hostH <= 0) return;
      const root = host.parentElement;
      const padX = root ? Math.max(0, (hostW - root.clientWidth) / 2) : 0;
      const padY = root ? Math.max(0, (hostH - root.clientHeight) / 2) : 0;
      const s = Math.min(Math.max(1, hostW - 2 * padX) / VIEWBOX.w, Math.max(1, hostH - 2 * padY) / VIEWBOX.h);
      const fitW = s * VIEWBOX.w;
      const fitH = s * VIEWBOX.h;
      const prev = box.current;
      const { zoom, x, y } = view.current;
      // Drawing point that was at the host centre, as a fraction of the drawing (0.5 before the first measure).
      const fx = prev.fitW > 0 ? (prev.hostW / 2 - x) / (prev.fitW * zoom) : 0.5;
      const fy = prev.fitH > 0 ? (prev.hostH / 2 - y) / (prev.fitH * zoom) : 0.5;
      box.current = { hostW, hostH, fitW, fitH };
      setView(zoom, hostW / 2 - fx * fitW * zoom, hostH / 2 - fy * fitH * zoom, "none");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [setView]);

  // ---- Wheel: zoom towards the cursor (native listener so the default can be prevented) ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaMode === 2 ? e.deltaY * PAGE_PX : e.deltaY;
      if (dy === 0) return;
      const r = host.getBoundingClientRect();
      zoomAt(WHEEL_FACTOR ** (-dy / 100), e.clientX - r.left, e.clientY - r.top, "none");
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---- Drag pan (left button, pointer capture) ----
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    if ((e.target as Element).closest("button, input")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: view.current.x, oy: view.current.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView(view.current.zoom, d.ox + (e.clientX - d.sx), d.oy + (e.clientY - d.sy), "none");
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // ---- Floor transition (derived from the previous render's floor, so both layers switch in one commit) ----
  const [prevFloor, setPrevFloor] = useState(floor);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  if (floor !== prevFloor) {
    setPrevFloor(floor);
    const ppu = pxPerUnit();
    setLeaving({ floor: prevFloor, dir: floor > prevFloor ? 1 : -1, shift: ppu > 0 ? SLIDE_PX / ppu : 0 });
  }

  const onLeaveEnd = useCallback((e: AnimationEvent<SVGGElement>) => {
    if (e.target === e.currentTarget) setLeaving(null);
  }, []);

  // Safety net: drop the leaving layer even if animationend never fires (reduced motion → 0 ms).
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), readMs("--t-slow") + 50);
    return () => window.clearTimeout(t);
  }, [leaving]);

  // ---- Search highlight on the current floor's room groups ----
  useLayoutEffect(() => {
    const layer = svgRef.current?.querySelector(`g.floor[data-floor="${floor}"]`);
    if (layer) highlightRooms(layer, query);
  }, [floor, query]);

  // ---- Favourites: data-fav + --fav / --fav-on on the room groups (map.css paints them) ----
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const byRoom = new Map(favorites.map((f) => [f.room.toUpperCase(), f.color]));
    for (const g of svg.querySelectorAll<SVGGElement>("g.floor g[data-name]")) {
      const color = byRoom.get((g.getAttribute("data-name") ?? "").toUpperCase());
      if (color) {
        g.setAttribute("data-fav", "1");
        g.style.setProperty("--fav", color);
        g.style.setProperty("--fav-on", onColor(color));
      } else if (g.hasAttribute("data-fav")) {
        g.removeAttribute("data-fav");
        g.style.removeProperty("--fav");
        g.style.removeProperty("--fav-on");
      }
    }
  }, [favorites, floor]);

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
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => fit("slow")}
    >
      <svg
        ref={svgRef}
        className={query ? "map-svg searching" : "map-svg"}
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
        <Pictograms />
      </svg>
    </div>
  );
});
