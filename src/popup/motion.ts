// The motion of the pop-up (PopupHost): the card grows out of the widget's icon and shrinks back into it, its icon
// flies between the icon and the card's header. Springs are sampled into keyframes once per opening, so the
// browser's compositor plays them (transform and opacity only, the card's corners are kept round on screen while
// it is scaled by giving its shell the inverse radius at every step).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A spring released from 0 towards 1 (mass 1, no initial speed): `zeta` < 1 overshoots a little, 1 does not. */
function springAt(t: number, omega: number, zeta: number): number {
  if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

/** A motion: its progress at evenly spaced moments (the last one exactly 1) and its length. */
export interface Curve {
  ms: number;
  points: number[];
}

const STEP_MS = 1000 / 60;

function sample(ms: number, at: (t: number) => number): Curve {
  const n = Math.max(2, Math.ceil(ms / STEP_MS) + 1);
  const points = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : at(((i / (n - 1)) * ms) / 1000)));
  return { ms, points };
}

/** Opening: lively, with a slight overshoot (about 3 %), at rest after about half a second. */
export const OPEN: Curve = sample(560, (t) => springAt(t, 16.2, 0.74));
/** Closing: quicker and without overshoot, so the card settles into the icon. */
export const CLOSE: Curve = sample(340, (t) => springAt(t, 21, 1));

/** Progress of `curve` after `elapsed` ms (for a closing that starts while the opening still runs). */
export function progressAt(curve: Curve, elapsed: number): number {
  if (elapsed >= curve.ms) return 1;
  const f = (Math.max(0, elapsed) / curve.ms) * (curve.points.length - 1);
  const i = Math.floor(f);
  const a = curve.points[i];
  const b = curve.points[Math.min(i + 1, curve.points.length - 1)];
  return a + (b - a) * (f - i);
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** The card's place at progress `p` (0: over the icon, 1: in the middle of the screen). */
function cardAt(icon: Rect, card: Rect, p: number) {
  const sx = lerp(icon.w / card.w, 1, p);
  const sy = lerp(icon.h / card.h, 1, p);
  const transform = `translate(${px((icon.x - card.x) * (1 - p))}, ${px((icon.y - card.y) * (1 - p))}) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  return { sx, sy, transform };
}

/**
 * Keyframes of the card (transform), its shell (corner radius kept `rIcon` → `rCard` on screen, and opacity: the
 * sheet appears over the first steps of the way out of the icon and fades back into it at the end of the way home)
 * and its shadow (the same opacity), for the progress values `ps` taken at even moments.
 */
export function morph(icon: Rect, card: Rect, rIcon: number, rCard: number, ps: number[]) {
  const n = ps.length;
  const cardFrames: Keyframe[] = [];
  const shellFrames: Keyframe[] = [];
  const shadowFrames: Keyframe[] = [];
  ps.forEach((p, i) => {
    const offset = n === 1 ? 1 : i / (n - 1);
    const { sx, sy, transform } = cardAt(icon, card, p);
    const r = lerp(rIcon, rCard, clamp01(p));
    const opacity = clamp01(p / 0.16);
    cardFrames.push({ offset, transform });
    shellFrames.push({ offset, borderRadius: `${px(r / sx)} / ${px(r / sy)}`, opacity });
    shadowFrames.push({ offset, opacity });
  });
  return { cardFrames, shellFrames, shadowFrames };
}

/**
 * Keyframes of the flying icon: from `from` to `to` (both squares), by the same progress values. It is a copy of
 * the icon's picture, which stays on the icon: the copy appears as it leaves the icon and fades as it lands back.
 */
export function fly(from: Rect, to: Rect, ps: number[]): Keyframe[] {
  const n = ps.length;
  return ps.map((p, i) => {
    const s = lerp(from.w / to.w, 1, p);
    return {
      offset: n === 1 ? 1 : i / (n - 1),
      transform: `translate(${px((from.x - to.x) * (1 - p))}, ${px((from.y - to.y) * (1 - p))}) scale(${s.toFixed(4)})`,
      opacity: clamp01(p / 0.22),
    };
  });
}

/** The transform of the card at rest over the icon (the first frame of an opening). */
export function cardStart(icon: Rect, card: Rect): string {
  return cardAt(icon, card, 0).transform;
}

/** The shell's radius at rest over the icon. */
export function shellStart(icon: Rect, card: Rect, rIcon: number): string {
  const { sx, sy } = cardAt(icon, card, 0);
  return `${px(rIcon / sx)} / ${px(rIcon / sy)}`;
}

/** The flying icon at rest over the widget's icon (still clear there). */
export function flyStart(from: Rect, to: Rect): string {
  return fly(from, to, [0])[0].transform as string;
}
