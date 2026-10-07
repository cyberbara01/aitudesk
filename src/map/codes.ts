// Room codes as real text. The drawing sets every code as glyph paths in one small size; set as text they are
// drawn by the font rasteriser (hinted where upright, in the style's own numeric face and weight). Every code
// gets one size, CODE_SIZE, a little larger than the drawing's, so the plan reads as one calm set of numbers; a
// room too small for it gets as much as it holds, never less than the drawing's own size. lod.ts shows codes
// from CODE_MIN_PX of cap height on screen, so the whole-floor view of a widget already shows nearly every one.
// Each code keeps the drawing's place: centre and reading direction come from the glyph paths (geometry.ts),
// the text is the number part of data-name ("C1.2.223K" → "223K"). The <text> is appended to its room group
// once per floor mount (the drawings never re-render), the group gets .has-code and map.css hides the glyph
// paths, so search, marks and the level of detail keep working on the group as before. A label whose glyphs do
// not look like that code keeps the drawing's own paths.
import { labelPlacement } from "./geometry";

/** Cap height of the code faces per em (Segoe UI Variable .70, Inter and JetBrains Mono .73). */
export const CAP_HEIGHT = 0.71;
/** A code's length per character, in em, outside which the glyphs are not this code (measured: 0.44 to 0.75). */
const EM_PER_CHAR = { min: 0.35, max: 0.9 };
/** Advance of one character of a code in the widest of the faces (JetBrains Mono semibold), em. */
const ADVANCE = 0.62;
/** Share of the room's length along the code, and of its depth across it, that the code may take. */
const FILL_ALONG = 0.84;
const FILL_ACROSS = 0.6;
/** Size of every code (font-size in user units of the drawing, whose own codes are 8 to 10.5). */
const CODE_SIZE = 11;
/** Room groups that carry a code (named areas, the coworking curves and the Mediker logo are not codes). */
const ROOM_GROUPS = 'g[data-name]:not([data-name*="|"]):not(.map-groups-coworking-atameken):not([data-name^="MEDIKER"])';
const CODE = /^\d{3}[A-Z]?$/;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Space kept between two codes, in units of the smaller cap height. */
const GAP = 0.5;
/** A code may exceed the room's fit by this share: the fill margins above already leave room for it. */
const FIT_SLACK = 1.06;
/** Two codes that would touch shrink by this factor at a time, the one grown most first. */
const SHRINK = 0.92;

interface Code {
  text: string;
  transform: string;
  y: string;
  size: string;
}

/** A code before its size is settled: where it sits, the drawing's size and the size it gets. */
interface Draft {
  text: string;
  cx: number;
  cy: number;
  angle: number;
  base: number;
  size: number;
}

/** Placements per floor (in the order of the room groups), computed on the first mount of that floor. */
const cache = new Map<string, (Code | null)[]>();

/** Corners of the room's own shapes (polygon, polyline, rect) in the group's user units. */
function roomPoints(g: SVGGElement): number[] {
  const out: number[] = [];
  for (const el of g.querySelectorAll<SVGGraphicsElement>(":scope > :is(polygon, polyline, rect)")) {
    const m = el.transform.baseVal.consolidate()?.matrix;
    const push = (x: number, y: number) => {
      if (m) out.push(m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
      else out.push(x, y);
    };
    if (el instanceof SVGRectElement) {
      const x = el.x.baseVal.value;
      const y = el.y.baseVal.value;
      const w = el.width.baseVal.value;
      const h = el.height.baseVal.value;
      push(x, y);
      push(x + w, y);
      push(x + w, y + h);
      push(x, y + h);
    } else if (el instanceof SVGPolygonElement || el instanceof SVGPolylineElement) {
      const pts = el.points;
      for (let i = 0; i < pts.numberOfItems; i++) {
        const p = pts.getItem(i);
        push(p.x, p.y);
      }
    }
  }
  return out;
}

/**
 * Room around a code, in the code's own frame: the shortest way from its centre to the room's edge along the
 * code (on either side) and across it. Null when the shape is unknown or the centre is not inside its extent.
 */
function roomRoom(points: readonly number[], cx: number, cy: number, angle: number): { along: number; across: number } | null {
  if (points.length < 6) return null;
  const ux = Math.cos((angle * Math.PI) / 180);
  const uy = Math.sin((angle * Math.PI) / 180);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let k = 0; k < points.length; k += 2) {
    const dx = points[k] - cx;
    const dy = points[k + 1] - cy;
    const u = dx * ux + dy * uy;
    const v = dx * uy - dy * ux;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  if (u0 >= 0 || u1 <= 0 || v0 >= 0 || v1 <= 0) return null;
  return { along: 2 * Math.min(-u0, u1), across: 2 * Math.min(-v0, v1) };
}

function measure(g: SVGGElement): Draft | null {
  const text = (g.getAttribute("data-name") ?? "").trim().split(".").pop() ?? "";
  if (!CODE.test(text)) return null;
  const p = labelPlacement(Array.from(g.querySelectorAll<SVGPathElement>(":scope > path")));
  if (!p || p.height <= 0) return null;
  const base = p.height / CAP_HEIGHT;
  const perChar = p.length / base / text.length;
  if (perChar < EM_PER_CHAR.min || perChar > EM_PER_CHAR.max) return null;
  // The common size where the room holds it, otherwise as much as it holds, never below the drawing's size.
  const room = roomRoom(roomPoints(g), p.cx, p.cy, p.angle);
  const fits = room ? Math.min((room.along * FILL_ALONG) / (text.length * ADVANCE), (room.across * FILL_ACROSS) / CAP_HEIGHT) : 0;
  const size = Math.max(base, Math.min(CODE_SIZE, fits * FIT_SLACK));
  return { text, cx: p.cx, cy: p.cy, angle: p.angle, base, size };
}

/** Half extents of a code at its size, along and across its reading direction. */
function halves(d: Draft): { a: number; c: number } {
  return { a: (d.text.length * ADVANCE * d.size) / 2, c: (CAP_HEIGHT * d.size) / 2 };
}

/** Whether two codes (rotated boxes, with GAP around them) overlap: separating axis test on their four axes. */
function overlap(p: Draft, q: Draft): boolean {
  const hp = halves(p);
  const hq = halves(q);
  const gap = GAP * 2 * Math.min(hp.c, hq.c);
  const axes = [p.angle, q.angle].flatMap((deg) => {
    const r = (deg * Math.PI) / 180;
    return [
      [Math.cos(r), Math.sin(r)],
      [-Math.sin(r), Math.cos(r)],
    ];
  });
  const dx = q.cx - p.cx;
  const dy = q.cy - p.cy;
  const radius = (d: Draft, h: { a: number; c: number }, nx: number, ny: number) => {
    const r = (d.angle * Math.PI) / 180;
    const ux = Math.cos(r);
    const uy = Math.sin(r);
    return Math.abs(h.a * (ux * nx + uy * ny)) + Math.abs(h.c * (-uy * nx + ux * ny));
  };
  for (const [nx, ny] of axes) {
    if (Math.abs(dx * nx + dy * ny) > radius(p, hp, nx, ny) + radius(q, hq, nx, ny) + gap) return false;
  }
  return true;
}

/** Codes that would run into each other shrink a step at a time, the one grown most first, down to the drawing's
 * size at the least. */
function settle(drafts: readonly (Draft | null)[]): void {
  const list = drafts.filter((d): d is Draft => d !== null);
  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const q = list[j];
        if ((p.size <= p.base && q.size <= q.base) || !overlap(p, q)) continue;
        const shrink = p.size / p.base >= q.size / q.base ? p : q;
        shrink.size = Math.max(shrink.base, shrink.size * SHRINK);
        changed = true;
      }
    }
    if (!changed) return;
  }
}

function toCode(d: Draft): Code {
  const size = d.size;
  return {
    text: d.text,
    transform: `translate(${d.cx.toFixed(2)} ${d.cy.toFixed(2)}) rotate(${d.angle.toFixed(2)})`,
    // Baseline half a cap height below the centre: the code is centred on the drawing's label.
    y: ((size * CAP_HEIGHT) / 2).toFixed(2),
    size: size.toFixed(2),
  };
}

/** Sets the codes of one floor drawing as text. Idempotent: a group that already has its text is skipped. */
export function placeCodes(layer: Element, key: string): void {
  const groups = Array.from(layer.querySelectorAll<SVGGElement>(ROOM_GROUPS)).filter((g) => g.querySelector(":scope > path"));
  const cached = cache.get(key);
  let codes = cached && cached.length === groups.length ? cached : null;
  if (!codes) {
    const drafts = groups.map(measure);
    settle(drafts);
    codes = drafts.map((d) => (d ? toCode(d) : null));
  }
  cache.set(key, codes);
  groups.forEach((g, k) => {
    const code = codes[k];
    if (!code || g.querySelector(":scope > text.map-code")) return;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "map-code");
    t.setAttribute("transform", code.transform);
    t.setAttribute("y", code.y);
    t.setAttribute("font-size", code.size);
    t.textContent = code.text;
    g.appendChild(t);
    g.classList.add("has-code");
  });
}
