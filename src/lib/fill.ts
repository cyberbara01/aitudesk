// «Фон виджетов» drawn: one colour, or one gradient laid over the whole screen from the first point to the second.
// Every widget shows the part of it that lies under the widget, so the widgets read as windows onto one calm colour
// field instead of each repeating the whole gradient. Over the glass it is a tint (the frosted wallpaper still under
// it); solid without the glass. The colours between the two ends are mixed in OKLab, so the middle stays clean
// instead of going grey or muddy. Also: whether light or dark text reads on it.
import type { CSSProperties } from "react";
import type { DeskSpot } from "./deskSpot";
import { hexToRgb, onColor, rgbToHex, withAlpha } from "./design";
import type { WidgetFill } from "./settings";

// ---- OKLab (Björn Ottosson): mixing two colours the way the eye sees the steps between them ----

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toGamma = (c: number) => {
  const v = Math.min(1, Math.max(0, c));
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};

function toOklab(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return rgbToHex({
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  });
}

/** The colour `t` (0..1) of the way from `a` to `b`, mixed in OKLab. */
export function mixOklab(a: string, b: string, t: number): string {
  const p = toOklab(a);
  const q = toOklab(b);
  return fromOklab([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
}

/** The colour halfway between the two points: what the text has to read on. */
export function fillMiddle(fill: WidgetFill): string {
  return fill.mode === "gradient" ? mixOklab(fill.from.color, fill.to.color, 0.5) : fill.color;
}

/** Light background (dark text on it) or dark one. For a gradient both ends count: one light end is enough, since
 * text in that corner has to read too and dark text reads on the middle tones as well. */
export function fillIsLight(fill: WidgetFill): boolean {
  if (fill.mode === "gradient") {
    const ends = [fill.from.color, fill.to.color].filter((c) => onColor(c) === "#000000").length;
    return ends === 2 || (ends === 1 && onColor(fillMiddle(fill)) === "#000000");
  }
  return onColor(fill.color) === "#000000";
}

/** The in-between stops of a gradient (besides its two ends), so the browser's own blending in sRGB never shows. */
const STEPS = [0.2, 0.4, 0.6, 0.8];

/**
 * The CSS background of an area of `w` x `h` px (a whole screen, or a preview): the colour (or the gradient) at
 * `alpha`. The gradient's angle is the direction from the first point to the second in the area's own pixels, and
 * each colour is placed where its point projects on the gradient line.
 */
export function fillCss(fill: WidgetFill, w: number, h: number, alpha: number): string {
  if (fill.mode === "color") return withAlpha(fill.color, alpha);
  const ax = fill.from.x * w;
  const ay = fill.from.y * h;
  const vx = fill.to.x * w - ax;
  const vy = fill.to.y * h - ay;
  if (Math.hypot(vx, vy) < 1 || w <= 0 || h <= 0) return withAlpha(fillMiddle(fill), alpha);
  // CSS angles: 0deg points up, clockwise; its direction is (sin θ, -cos θ) with y down.
  const theta = Math.atan2(vx, -vy);
  const dx = Math.sin(theta);
  const dy = -Math.cos(theta);
  const length = Math.abs(w * dx) + Math.abs(h * dy);
  const along = (px: number, py: number) => (((px - w / 2) * dx + (py - h / 2) * dy) / length + 0.5) * 100;
  const p1 = along(ax, ay);
  const p2 = along(ax + vx, ay + vy);
  const deg = ((theta * 180) / Math.PI + 360) % 360;
  const stop = (color: string, at: number) => `${withAlpha(color, alpha)} ${at.toFixed(2)}%`;
  const stops = [
    stop(fill.from.color, p1),
    ...STEPS.map((t) => stop(mixOklab(fill.from.color, fill.to.color, t), p1 + (p2 - p1) * t)),
    stop(fill.to.color, p2),
  ];
  return `linear-gradient(${deg.toFixed(2)}deg, ${stops.join(", ")})`;
}

/** The same as an image, also for one colour: one layer of a widget's background (base.css .tile.own-fill). */
export function fillImage(fill: WidgetFill, w: number, h: number, alpha: number): string {
  const css = fillCss(fill, w, h, alpha);
  return css.startsWith("linear-gradient") ? css : `linear-gradient(${css}, ${css})`;
}

/** How dense the colour is: over the glass a tint like the theme's own glass (the frosted wallpaper shows through),
 * denser on a widget that fades (its glass is off meanwhile), whole where there is no glass. */
export const FILL_GLASS = 0.62;
export const FILL_DENSE = 0.86;

/**
 * A widget's background from «Фон виджетов» (base.css .tile.own-fill): the screen-wide layer at each density, placed
 * so the widget shows the part of it under itself. Until its place is known (and for one colour) it shows the whole
 * gradient. The floating surfaces inside it (pills, menus) get the solid middle colour.
 */
export function deskFillVars(fill: WidgetFill, spot: DeskSpot | null): CSSProperties {
  const w = spot?.w ?? window.innerWidth;
  const h = spot?.h ?? window.innerHeight;
  return {
    "--fill-glass": fillImage(fill, w, h, FILL_GLASS),
    "--fill-dense": fillImage(fill, w, h, FILL_DENSE),
    "--fill-solid": fillImage(fill, w, h, 1),
    "--fill-at": spot ? `${-spot.x}px ${-spot.y}px` : "0 0",
    "--fill-size": spot ? `${spot.w}px ${spot.h}px` : "100% 100%",
    "--tile-fallback": fillMiddle(fill),
  } as CSSProperties;
}

/** Ready-made backgrounds: calm colours and gradients that read with light or dark text. A gradient runs across
 * the whole screen, so the ends are near each other in tone: the desk shifts gently from one to the other. */
export const FILL_PRESETS: readonly { id: string; fill: Pick<WidgetFill, "mode" | "color" | "from" | "to"> }[] = [
  { id: "ink", fill: { mode: "color", color: "#1F2A3D", from: s("#1F2A3D", 0.12, 0.15), to: s("#1F2A3D", 0.88, 0.85) } },
  { id: "forest", fill: { mode: "color", color: "#1E3B33", from: s("#1E3B33", 0.12, 0.15), to: s("#1E3B33", 0.88, 0.85) } },
  { id: "wine", fill: { mode: "color", color: "#43212C", from: s("#43212C", 0.12, 0.15), to: s("#43212C", 0.88, 0.85) } },
  { id: "sand", fill: { mode: "color", color: "#EDE4D6", from: s("#EDE4D6", 0.12, 0.15), to: s("#EDE4D6", 0.88, 0.85) } },
  { id: "mist", fill: { mode: "color", color: "#DDE5EE", from: s("#DDE5EE", 0.12, 0.15), to: s("#DDE5EE", 0.88, 0.85) } },
  { id: "sage", fill: { mode: "color", color: "#D5E5D9", from: s("#D5E5D9", 0.12, 0.15), to: s("#D5E5D9", 0.88, 0.85) } },
  { id: "dusk", fill: { mode: "gradient", color: "#27466E", from: s("#1C2B50", 0.05, 0.08), to: s("#4D4580", 0.95, 0.92) } },
  { id: "sea", fill: { mode: "gradient", color: "#27466E", from: s("#132C44", 0.05, 0.92), to: s("#255F5E", 0.95, 0.08) } },
  { id: "ember", fill: { mode: "gradient", color: "#27466E", from: s("#2A1A33", 0.05, 0.08), to: s("#7A3E44", 0.95, 0.92) } },
  { id: "peach", fill: { mode: "gradient", color: "#27466E", from: s("#F6E4D8", 0.05, 0.08), to: s("#EDCAD3", 0.95, 0.92) } },
  { id: "lilac", fill: { mode: "gradient", color: "#27466E", from: s("#E1DAF4", 0.05, 0.15), to: s("#CFE2F2", 0.95, 0.85) } },
  { id: "mint", fill: { mode: "gradient", color: "#27466E", from: s("#DAF0E4", 0.05, 0.92), to: s("#F1F0D3", 0.95, 0.08) } },
];

function s(color: string, x: number, y: number) {
  return { color, x, y };
}
