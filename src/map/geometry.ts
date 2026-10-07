// On-screen size of the plan's labels and pictograms, measured from their path data in SVG user units.
//
// The room codes of the C1.1 and C1.3 wings (and the vertical ones in C1.2) are rotated, so the axis-aligned
// box from getBBox() is up to three times taller than the glyphs. The size used for the level of detail is
// the width of the thinnest strip that holds the whole label (rotating calipers on the convex hull), which is
// the glyph height at any rotation, capped by the largest single glyph so that a label set in two lines
// («Столовая», «Актовый зал») is not counted twice. The drawings never change, so this runs once per floor.

/** Command letters and numbers of SVG path data ("1.5.5" is 1.5 and .5, "-.5" a number, "1e-3" a number). */
const TOKEN = /[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** Point cloud of a drawing: end points and control points of every segment (x, y pairs, user units). */
export interface Outline {
  points: number[];
  /** Largest side of the bounding box of any one subpath (a glyph, a glyph's counter, an icon plate). */
  maxSubpath: number;
}

export function emptyOutline(): Outline {
  return { points: [], maxSubpath: 0 };
}

/**
 * Adds one path's data to `out`. Curves contribute their control points, whose hull contains the curve; arcs only
 * their end points (the drawings use arcs for 1.5-unit corners only). Translations do not matter for sizes.
 */
export function addPathData(d: string, out: Outline): void {
  const t = d.match(TOKEN);
  if (!t) return;
  const pts = out.points;
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const flush = () => {
    if (maxX >= minX) out.maxSubpath = Math.max(out.maxSubpath, maxX - minX, maxY - minY);
    minX = minY = Infinity;
    maxX = maxY = -Infinity;
  };
  const add = (px: number, py: number) => {
    pts.push(px, py);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
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
        flush();
        let nx = num();
        let ny = num();
        if (rel) {
          nx += x;
          ny += y;
        }
        x = sx = nx;
        y = sy = ny;
        add(x, y);
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
        add(x, y);
        break;
      }
      case "H": {
        const nx = num();
        x = rel ? x + nx : nx;
        add(x, y);
        break;
      }
      case "V": {
        const ny = num();
        y = rel ? y + ny : ny;
        add(x, y);
        break;
      }
      case "C": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        add(x1 + ox, y1 + oy);
        add(x2 + ox, y2 + oy);
        x = x3 + ox;
        y = y3 + oy;
        add(x, y);
        break;
      }
      case "S":
      case "Q": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        add(x1 + ox, y1 + oy);
        x = x2 + ox;
        y = y2 + oy;
        add(x, y);
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
        add(x, y);
        break;
      }
      default:
        i++;
    }
  }
  flush();
}

/** Width of the thinnest strip that contains every point (0 for fewer than three points). */
export function minStripWidth(p: readonly number[]): number {
  const n = p.length >> 1;
  if (n < 3) return 0;
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
  if (hull.length < 3) return 0;
  // The thinnest strip is flush with one hull edge: the largest distance of a hull vertex from that edge.
  let best = Infinity;
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
    if (far < best) best = far;
  }
  return Number.isFinite(best) ? best : 0;
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
