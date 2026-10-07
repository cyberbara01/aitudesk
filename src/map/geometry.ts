// Geometry of the plan's labels and pictograms, measured from their path data in SVG user units.
//
// The room codes of the C1.1 and C1.3 wings (and the vertical ones in C1.2) are rotated, so the axis-aligned
// box from getBBox() is up to three times taller than the glyphs. The size used for the level of detail is
// the width of the thinnest strip that holds the whole label (rotating calipers on the convex hull), which is
// the glyph height at any rotation, capped by the largest single glyph so that a label set in two lines
// («Столовая», «Актовый зал») is not counted twice. The same strip gives the label's baseline direction, so a
// code can be set again as real text exactly where the drawing has it (codes.ts). The drawings never change,
// so all of this runs once per floor.

/** Command letters and numbers of SVG path data ("1.5.5" is 1.5 and .5, "-.5" a number, "1e-3" a number). */
const TOKEN = /[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/**
 * Walks path data: `start` at every subpath, `point` for every end point and control point. Curves contribute
 * their control points, whose hull contains the curve; arcs only their end points (the drawings use arcs for
 * 1.5-unit corners only).
 */
function walkPath(d: string, start: () => void, point: (x: number, y: number) => void): void {
  const t = d.match(TOKEN);
  if (!t) return;
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => {
    const v = Number(t[i++]);
    return Number.isFinite(v) ? v : 0;
  };
  while (i < t.length) {
    // Letters are commands; digits, the dot and the signs all sort below "A".
    if (t[i].charCodeAt(0) >= 65) {
      cmd = t[i++];
      if (cmd === "Z" || cmd === "z") {
        x = sx;
        y = sy;
        continue;
      }
    } else if (cmd === "" || cmd === "Z" || cmd === "z") {
      i++;
      continue;
    }
    const rel = cmd >= "a";
    switch (cmd.toUpperCase()) {
      case "M": {
        let nx = num();
        let ny = num();
        if (rel) {
          nx += x;
          ny += y;
        }
        x = sx = nx;
        y = sy = ny;
        start();
        point(x, y);
        // Further pairs after a moveto are linetos.
        cmd = rel ? "l" : "L";
        break;
      }
      case "L":
      case "T": {
        let nx = num();
        let ny = num();
        if (rel) {
          nx += x;
          ny += y;
        }
        x = nx;
        y = ny;
        point(x, y);
        break;
      }
      case "H": {
        const nx = num();
        x = rel ? x + nx : nx;
        point(x, y);
        break;
      }
      case "V": {
        const ny = num();
        y = rel ? y + ny : ny;
        point(x, y);
        break;
      }
      case "C": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        point(x1 + ox, y1 + oy);
        point(x2 + ox, y2 + oy);
        x = x3 + ox;
        y = y3 + oy;
        point(x, y);
        break;
      }
      case "S":
      case "Q": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        point(x1 + ox, y1 + oy);
        x = x2 + ox;
        y = y2 + oy;
        point(x, y);
        break;
      }
      case "A": {
        i += 5; // radii, rotation, two flags
        let nx = num();
        let ny = num();
        if (rel) {
          nx += x;
          ny += y;
        }
        x = nx;
        y = ny;
        point(x, y);
        break;
      }
      default:
        i++;
    }
  }
}

/** Point cloud of a drawing: end points and control points of every segment (x, y pairs, user units). */
export interface Outline {
  points: number[];
  /** Largest side of the bounding box of any one subpath (a glyph, a glyph's counter, an icon plate). */
  maxSubpath: number;
}

export function emptyOutline(): Outline {
  return { points: [], maxSubpath: 0 };
}

/** Adds one path's data to `out`. Translations do not matter for sizes. */
export function addPathData(d: string, out: Outline): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const flush = () => {
    if (maxX >= minX) out.maxSubpath = Math.max(out.maxSubpath, maxX - minX, maxY - minY);
    minX = minY = Infinity;
    maxX = maxY = -Infinity;
  };
  walkPath(d, flush, (x, y) => {
    out.points.push(x, y);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  flush();
}

/** The points of each subpath of one path's data, in drawing order (a glyph, then its counters, then the next). */
function subpathsOf(d: string): number[][] {
  const subs: number[][] = [];
  walkPath(
    d,
    () => subs.push([]),
    (x, y) => subs[subs.length - 1]?.push(x, y),
  );
  return subs.filter((s) => s.length > 0);
}

/** The thinnest strip that contains every point: its width and the unit direction along it. */
interface Strip {
  width: number;
  ux: number;
  uy: number;
}

function thinnestStrip(p: readonly number[]): Strip | null {
  const n = p.length >> 1;
  if (n < 3) return null;
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => p[2 * a] - p[2 * b] || p[2 * a + 1] - p[2 * b + 1]);
  const cross = (o: number, a: number, b: number) =>
    (p[2 * a] - p[2 * o]) * (p[2 * b + 1] - p[2 * o + 1]) - (p[2 * a + 1] - p[2 * o + 1]) * (p[2 * b] - p[2 * o]);
  // Andrew's monotone chain.
  const hull: number[] = [];
  for (const k of order) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], k) <= 0) hull.pop();
    hull.push(k);
  }
  const lower = hull.length + 1;
  for (let j = order.length - 2; j >= 0; j--) {
    const k = order[j];
    while (hull.length >= lower && cross(hull[hull.length - 2], hull[hull.length - 1], k) <= 0) hull.pop();
    hull.push(k);
  }
  hull.pop();
  if (hull.length < 3) return null;
  // The thinnest strip is flush with one hull edge: the largest distance of a hull vertex from that edge.
  let best: Strip | null = null;
  for (let e = 0; e < hull.length; e++) {
    const a = hull[e];
    const b = hull[(e + 1) % hull.length];
    const ex = p[2 * b] - p[2 * a];
    const ey = p[2 * b + 1] - p[2 * a + 1];
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    let far = 0;
    for (const c of hull) {
      const dist = Math.abs(ex * (p[2 * c + 1] - p[2 * a + 1]) - ey * (p[2 * c] - p[2 * a])) / len;
      if (dist > far) far = dist;
    }
    if (!best || far < best.width) best = { width: far, ux: ex / len, uy: ey / len };
  }
  return best;
}

/** Width of the thinnest strip that contains every point (0 for fewer than three points). */
export function minStripWidth(p: readonly number[]): number {
  return thinnestStrip(p)?.width ?? 0;
}

/** Collects the path data of `paths` into one outline. */
export function outlineOf(paths: Iterable<Element>): Outline {
  const out = emptyOutline();
  for (const el of paths) {
    const d = el.getAttribute("d");
    if (d) addPathData(d, out);
  }
  return out;
}

/** Glyph height of a label, any rotation, one or several lines (user units). */
export function labelSize(o: Outline): number {
  const strip = minStripWidth(o.points);
  if (strip <= 0) return o.maxSubpath;
  return o.maxSubpath > 0 ? Math.min(strip, o.maxSubpath) : strip;
}

/** Size of a pictogram: the side of its plate, the largest subpath (user units). */
export function pictogramSize(o: Outline): number {
  return o.maxSubpath;
}

/** Where a one-line label sits: its centre, baseline angle and extent, in the user units of its parent group. */
export interface Placement {
  cx: number;
  cy: number;
  /** Angle of the reading direction, degrees, clockwise from +x (SVG rotate()). */
  angle: number;
  /** Glyph height across the baseline. */
  height: number;
  /** Extent along the baseline. */
  length: number;
}

/**
 * Placement of a label drawn as glyph paths. The reading direction is the strip direction that goes from the
 * first glyph to the last one (the drawing lists the glyphs in reading order), so a code that reads upwards is set
 * upwards again. The paths' own translate is applied; any other transform on them returns null.
 */
export function labelPlacement(paths: readonly SVGGraphicsElement[]): Placement | null {
  if (!paths.length) return null;
  const subs = paths.flatMap((el) => subpathsOf(el.getAttribute("d") ?? ""));
  const pts = subs.flat();
  const strip = thinnestStrip(pts);
  if (!strip) return null;
  const m = paths[0].transform.baseVal.consolidate()?.matrix;
  if (m && (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1)) return null;
  const tx = m ? m.e : 0;
  const ty = m ? m.f : 0;
  let { ux, uy } = strip;
  const centre = (s: readonly number[]) => {
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < s.length; k += 2) {
      sx += s[k];
      sy += s[k + 1];
    }
    return [sx / (s.length / 2), sy / (s.length / 2)];
  };
  const [fx, fy] = centre(subs[0]);
  const [lx, ly] = centre(subs[subs.length - 1]);
  if ((lx - fx) * ux + (ly - fy) * uy < 0) {
    ux = -ux;
    uy = -uy;
  }
  // "Up" for that reading direction (y points down).
  const vx = uy;
  const vy = -ux;
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let k = 0; k < pts.length; k += 2) {
    const u = pts[k] * ux + pts[k + 1] * uy;
    const v = pts[k] * vx + pts[k + 1] * vy;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return {
    cx: cu * ux + cv * vx + tx,
    cy: cu * uy + cv * vy + ty,
    angle: (Math.atan2(uy, ux) * 180) / Math.PI,
    height: v1 - v0,
    length: u1 - u0,
  };
}
