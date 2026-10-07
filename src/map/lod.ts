// Level of detail of the plan. Room codes, free labels (atrium, coworking, open space) and pictograms are hidden
// while they would be too small to read on screen and appear as the map is zoomed in. Sizes are measured once
// per floor drawing (geometry.ts, user units, cached for the life of the window); a zoom or resize only compares
// them with the current scale and toggles .lod-off on the elements whose state changes, so a frame with no
// threshold crossing touches no DOM at all. Never re-renders the drawings through React.
import { CAP_HEIGHT } from "./codes";
import { labelSize, outlineOf, pictogramSize } from "./geometry";
import { LABEL_MIN_PX, PICTOGRAM_MIN_PX } from "./types";

/** Room groups whose own <path> children are their code. The coworking curves and the Mediker logo are not text. */
const ROOM_WITH_LABEL = 'g[data-name]:not(.map-groups-coworking-atameken):not([data-name^="MEDIKER"])';
/** Labels outside the room groups: «ATRIUM», «COWORKING», the hall lettering. */
const FREE_LABEL = "path.label, g.label";
/** Unnamed groups in the room layers; the one with lettering is «OPEN SPACE» (the others are plain shapes). */
const UNNAMED_IN_ROOMS = ":is(.map-groups-rooms, .map-groups-rooms-vk) > g:not([data-name])";
/** Toilet and exit plates, the stairs plates, the Mediker logo, the small sign inside a room. */
const PICTOGRAM =
  '.map-groups-wcs-icon, .map-groups-escapes-icon, .map-groups-stairs > g, .map-groups-stairs-fill > g, g[data-name^="MEDIKER"], g[data-name] > g:not([data-name])';

export interface LodItem {
  el: Element;
  /** Size in SVG user units (glyph height of a label, plate side of a pictogram). */
  size: number;
  /** Smallest readable size on screen, CSS px. */
  minPx: number;
  shown: boolean;
}

interface Measured {
  els: Element[];
  sizes: Float32Array;
  minPx: Float32Array;
}

/** Sizes per drawing (a floor, or the shared pictograms), in the order collect() visits the elements. */
const cache = new Map<string, { count: number; sizes: Float32Array; minPx: Float32Array }>();

function collect(root: Element): { els: Element[]; kinds: ("label" | "free" | "pict")[] } {
  const els: Element[] = [];
  const kinds: ("label" | "free" | "pict")[] = [];
  for (const g of root.querySelectorAll(ROOM_WITH_LABEL)) {
    if (!g.querySelector(":scope > path")) continue;
    els.push(g);
    kinds.push("label");
  }
  for (const el of root.querySelectorAll(FREE_LABEL)) {
    els.push(el);
    kinds.push("free");
  }
  for (const g of root.querySelectorAll(UNNAMED_IN_ROOMS)) {
    if (!g.querySelector(":scope > path")) continue;
    els.push(g);
    kinds.push("free");
  }
  for (const el of root.querySelectorAll(PICTOGRAM)) {
    els.push(el);
    kinds.push("pict");
  }
  return { els, kinds };
}

/** Scale a stylesheet puts on free lettering (map.css shrinks «COWORKING» to fit its room); 1 when none. */
function cssScale(el: Element): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 1;
  const m = new DOMMatrixReadOnly(t);
  const s = Math.hypot(m.a, m.b);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function measure(root: Element, key: string): Measured {
  const { els, kinds } = collect(root);
  const hit = cache.get(key);
  if (hit && hit.count === els.length) return { els, sizes: hit.sizes, minPx: hit.minPx };
  const sizes = new Float32Array(els.length);
  const minPx = new Float32Array(els.length);
  els.forEach((el, k) => {
    const kind = kinds[k];
    if (kind === "label") {
      // A code set as text (codes.ts) is sized to its room: its cap height counts, not the hidden glyphs.
      const text = el.querySelector(":scope > text.map-code");
      const size = text ? parseFloat(text.getAttribute("font-size") ?? "") : NaN;
      sizes[k] = Number.isFinite(size) ? size * CAP_HEIGHT : labelSize(outlineOf(el.querySelectorAll(":scope > path")));
      minPx[k] = LABEL_MIN_PX;
    } else if (kind === "free") {
      const glyphs = labelSize(outlineOf(el.tagName.toLowerCase() === "path" ? [el] : el.querySelectorAll("path")));
      sizes[k] = glyphs * cssScale(el);
      minPx[k] = LABEL_MIN_PX;
    } else {
      sizes[k] = pictogramSize(outlineOf(el.querySelectorAll(el.matches("g[data-name]") ? ":scope > path" : "path")));
      minPx[k] = PICTOGRAM_MIN_PX;
    }
  });
  cache.set(key, { count: els.length, sizes, minPx });
  return { els, sizes, minPx };
}

/** LOD items of one drawing. `key` names the drawing ("floor-2", "shared") for the size cache. */
export function lodItems(root: Element, key: string): LodItem[] {
  const { els, sizes, minPx } = measure(root, key);
  return els.map((el, k) => ({ el, size: sizes[k], minPx: minPx[k], shown: !el.classList.contains("lod-off") }));
}

/** Shows or hides each item for `pxPerUnit` (screen px per user unit); only elements that change are touched. */
export function applyLod(items: readonly LodItem[], pxPerUnit: number): void {
  for (const it of items) {
    const show = it.size * pxPerUnit >= it.minPx;
    if (show === it.shown) continue;
    it.shown = show;
    it.el.classList.toggle("lod-off", !show);
  }
}
