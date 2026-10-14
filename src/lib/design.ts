// Design catalogues: palettes, design languages, accent presets, clock presets, colour helpers.
// Visual values live in src/styles/tokens.css; this file only names things and does the maths.
import type { CSSProperties } from "react";
import type { ClockFont, ClockSettings, Look, LookDensity, LookSettings, MapCodeWeight, MapScheme, MapSettings, StyleId, ThemeId } from "./settings";

// ---------------------------------------------------------------------------------------------
// Palettes & styles
// ---------------------------------------------------------------------------------------------

export interface ThemeMeta {
  id: ThemeId;
  /** null = follows Windows. */
  dark: boolean | null;
  /** Colours for the preview card in settings; `bg` (the wallpaper) may be any CSS background. */
  swatch: { bg: string; fill: string; text: string; muted: string };
}

export const THEMES: readonly ThemeMeta[] = [
  { id: "system", dark: null, swatch: { bg: "#5A6B7C", fill: "#2A2C34", text: "#FFFFFF", muted: "#C9CDD6" } },
  { id: "light", dark: false, swatch: { bg: "#C9D4E0", fill: "#F7F7FA", text: "#1B1B1F", muted: "#5E6470" } },
  { id: "gray", dark: false, swatch: { bg: "#AEB4BE", fill: "#E4E5EA", text: "#1B1B1F", muted: "#5E6470" } },
  { id: "dark", dark: true, swatch: { bg: "#4C5663", fill: "#2A2C34", text: "#FFFFFF", muted: "#C9CDD6" } },
  { id: "darker", dark: true, swatch: { bg: "#2E343C", fill: "#15161B", text: "#FFFFFF", muted: "#B8BCC6" } },
  { id: "black", dark: true, swatch: { bg: "#22262C", fill: "#000000", text: "#FFFFFF", muted: "#A9ADB7" } },
  // Frosted glass shows what lies behind it, so its preview needs a colourful wallpaper.
  {
    id: "glass",
    dark: null,
    swatch: {
      // A hard-edged sun among soft colour fields: where it passes behind a tile, the frost shows.
      bg: "radial-gradient(circle at 36% 78%, #FFD27A 0 9%, transparent 9.6%), radial-gradient(circle at 16% 24%, #8CCBFF 0, transparent 55%), radial-gradient(circle at 86% 80%, #F7A3CF 0, transparent 52%), radial-gradient(circle at 74% 14%, #B7A4FF 0, transparent 46%), linear-gradient(135deg, #4F6FD8, #6A4FC4)",
      fill: "rgba(255, 255, 255, .26)",
      text: "#FFFFFF",
      muted: "rgba(255, 255, 255, .78)",
    },
  },
];

export const STYLES: readonly { id: StyleId }[] = [{ id: "fluent" }, { id: "aqua" }, { id: "rice" }, { id: "pearl" }];

/**
 * What each design gives to the parts of «Тонкая настройка» left at «Как в дизайне». The controls (switches,
 * segmented buttons, the selected tab) always keep the design's own look.
 */
export const STYLE_LOOK: Record<StyleId, Look> = {
  fluent: { font: "segoe", numbers: "text", shape: "strict", corners: "8", density: "normal", border: "normal", material: "matte" },
  aqua: { font: "inter", numbers: "text", shape: "soft", corners: "8", density: "roomy", border: "normal", material: "glass" },
  rice: { font: "inter", numbers: "mono", shape: "medium", corners: "8", density: "normal", border: "accent", material: "solid" },
  // Large soft corners and frosted glass, no outlines (its controls: src/styles/pearl.css).
  pearl: { font: "inter", numbers: "text", shape: "soft", corners: "20", density: "roomy", border: "none", material: "glass" },
};

/** The look in use: the design's parts with the ones chosen on their own. The glass palette is glass unless
 * the transparency is chosen. */
export function resolveLook(style: StyleId, look: LookSettings, theme: ThemeId): Look {
  const base = STYLE_LOOK[style];
  const pick = <K extends keyof Look>(k: K): Look[K] => (look[k] === "auto" ? base[k] : (look[k] as Look[K]));
  return {
    font: pick("font"),
    numbers: pick("numbers"),
    shape: pick("shape"),
    corners: pick("corners"),
    density: pick("density"),
    border: pick("border"),
    material: look.material === "auto" ? (theme === "glass" ? "glass" : base.material) : look.material,
  };
}

/** Padding inside a widget per density, logical px (tokens.css [data-density]). */
export const DENSITY_PAD: Record<LookDensity, number> = { compact: 12, normal: 16, roomy: 20 };

/** Resolve "system" using the Windows app theme. */
export function resolveTheme(theme: ThemeId, windowsDark: boolean): Exclude<ThemeId, "system"> {
  return theme === "system" ? (windowsDark ? "dark" : "light") : theme;
}

export function isDarkTheme(theme: Exclude<ThemeId, "system">): boolean {
  return theme === "dark" || theme === "darker" || theme === "black";
}

// ---------------------------------------------------------------------------------------------
// Accent
// ---------------------------------------------------------------------------------------------

export interface AccentPreset {
  id: string;
  /** Tone used on dark palettes (light, luminous). */
  dark: string;
  /** Tone used on light palettes (deep, readable on white). */
  light: string;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "fluent-blue", dark: "#60CDFF", light: "#005FB8" },
  { id: "sky", dark: "#7DD3FC", light: "#0369A1" },
  { id: "teal", dark: "#6ED6CB", light: "#0E7A72" },
  { id: "mint", dark: "#8CE0B0", light: "#0F7B4F" },
  { id: "lime", dark: "#C5E86C", light: "#4F7A00" },
  { id: "lemon", dark: "#FFD66B", light: "#8A6500" },
  { id: "peach", dark: "#FFB086", light: "#B4480E" },
  { id: "coral", dark: "#FF9B8E", light: "#B83225" },
  { id: "rose", dark: "#FFA2CF", light: "#B0246F" },
  { id: "lavender", dark: "#C7B6FF", light: "#5B3FBF" },
  { id: "mauve", dark: "#CBA6F7", light: "#7C3AED" },
  { id: "frost", dark: "#88C0D0", light: "#2E6F86" },
  { id: "gruvbox", dark: "#FE8019", light: "#AF3A03" },
  { id: "dracula", dark: "#BD93F9", light: "#6D3FD1" },
  { id: "graphite", dark: "#C8CCD6", light: "#4A4F5A" },
];

export function accentPreset(id: string): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

/** The accent the page shows now (#RRGGBB): where a colour that followed the accent becomes one of one's own, it
 * starts from there, so nothing jumps. */
export function accentNow(fallback = "#60CDFF"): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase();
  return isHex(v) ? v : fallback;
}

// ---------------------------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x60cdff;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0").toUpperCase();
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** WCAG relative luminance 0..1. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Text colour that reads on the given fill. */
export function onColor(hex: string): "#000000" | "#FFFFFF" {
  return luminance(hex) > 0.4 ? "#000000" : "#FFFFFF";
}

/** rgba() string with the given alpha 0..1. */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Lighten (t > 0) or darken (t < 0) towards white/black by |t| (0..1). */
export function shade(hex: string, t: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbToHex({ r: r + (target - r) * k, g: g + (target - g) * k, b: b + (target - b) * k });
}

/** WCAG contrast ratio of two opaque colours (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `hex` moved towards white (on a dark background) or black (on a light one) just far enough to reach `min`
 * contrast against `bg`; unchanged when it already does. Keeps a custom accent readable on every palette.
 */
export function readableOn(hex: string, bg: string, min: number): string {
  if (contrast(hex, bg) >= min) return hex.toUpperCase();
  const lighten = luminance(bg) < 0.5;
  for (let t = 0.04; t < 1; t += 0.04) {
    const c = shade(hex, lighten ? t : -t);
    if (contrast(c, bg) >= min) return c;
  }
  return lighten ? "#FFFFFF" : "#000000";
}

export interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** Preset swatches for pickers (launcher tints, favourites, lessons). */
export const SWATCHES: readonly string[] = [
  "#60CDFF", "#7DD3FC", "#A9C3FF", "#C7B6FF", "#CBA6F7", "#E3B1FF", "#FFA2CF", "#FFB6A8",
  "#FF9B8E", "#FFB086", "#FFD66B", "#F9E27A", "#C5E86C", "#9BE3A6", "#8CE0B0", "#6ED6CB",
  "#88C0D0", "#5EB1E6", "#3B82F6", "#FE8019", "#EF4444", "#10B981", "#F5F5F7", "#C8CCD6",
];

// ---------------------------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------------------------

export interface ClockFontMeta {
  id: ClockFont;
  /** CSS font-family stack. */
  family: string;
  /** Supported variable weight range. */
  weights: [number, number];
  /** Has a width axis (font-stretch). */
  width: boolean;
  /** Bundled with the app (not a system font). */
  bundled: boolean;
}

export const CLOCK_FONTS: readonly ClockFontMeta[] = [
  // The family of the current design language (--clock-font-auto in clock.css); weights common to all three.
  { id: "auto", family: "var(--clock-font-auto)", weights: [300, 700], width: false, bundled: true },
  { id: "segoe-display", family: '"Segoe UI Variable Display", "Segoe UI", sans-serif', weights: [300, 700], width: false, bundled: false },
  { id: "segoe-text", family: '"Segoe UI Variable Text", "Segoe UI", sans-serif', weights: [300, 700], width: false, bundled: false },
  { id: "inter", family: '"Inter", "Segoe UI", sans-serif', weights: [100, 900], width: false, bundled: true },
  { id: "bahnschrift", family: '"Bahnschrift", "Segoe UI", sans-serif', weights: [300, 700], width: true, bundled: false },
  { id: "jetbrains", family: '"JetBrains Mono", "Cascadia Mono", monospace', weights: [100, 800], width: false, bundled: true },
  { id: "cascadia", family: '"Cascadia Mono", "Consolas", monospace', weights: [200, 700], width: false, bundled: false },
  { id: "sitka", family: '"Sitka Display", "Georgia", serif', weights: [400, 700], width: false, bundled: false },
  { id: "script", family: '"Segoe Script", "Ink Free", cursive', weights: [400, 700], width: false, bundled: false },
];

export function clockFont(id: ClockFont): ClockFontMeta {
  return CLOCK_FONTS.find((f) => f.id === id) ?? CLOCK_FONTS[0];
}

export interface ClockPreset {
  id: string;
  values: Partial<ClockSettings>;
}

/** Ready-made looks (iPhone-widget style gallery). Applying one copies its values and sets preset = id. */
export const CLOCK_PRESETS: readonly ClockPreset[] = [
  {
    id: "classic",
    values: { font: "auto", weight: 300, width: 100, size: 56, letterSpacing: -2, seconds: false, dateFormat: "long", datePosition: "below", align: "left", valign: "top", color: "accent", dateColor: "secondary", tabular: true, background: true, blinkColon: false },
  },
  {
    id: "grand",
    values: { font: "inter", weight: 200, width: 100, size: 88, letterSpacing: -4, seconds: false, dateFormat: "short", datePosition: "below", align: "center", valign: "center", color: "accent", dateColor: "secondary", tabular: true, background: true, blinkColon: false },
  },
  {
    id: "mono",
    values: { font: "jetbrains", weight: 600, width: 100, size: 48, letterSpacing: 0, seconds: true, dateFormat: "numeric", datePosition: "below", align: "left", valign: "center", color: "accent", dateColor: "secondary", tabular: true, background: true, blinkColon: true },
  },
  {
    id: "poster",
    values: { font: "bahnschrift", weight: 700, width: 80, size: 72, letterSpacing: -1, seconds: false, dateFormat: "weekday", datePosition: "above", align: "left", valign: "bottom", color: "text", dateColor: "accent", tabular: true, background: true, blinkColon: false },
  },
  {
    id: "float",
    values: { font: "inter", weight: 300, width: 100, size: 64, letterSpacing: -3, seconds: false, dateFormat: "long", datePosition: "below", align: "center", valign: "center", color: "accent", dateColor: "secondary", tabular: true, background: false, blinkColon: false },
  },
  {
    id: "serif",
    values: { font: "sitka", weight: 400, width: 100, size: 60, letterSpacing: 0, seconds: false, dateFormat: "long", datePosition: "below", align: "right", valign: "center", color: "accent", dateColor: "secondary", tabular: false, background: true, blinkColon: false },
  },
  {
    id: "sidecar",
    values: { font: "segoe-text", weight: 600, width: 100, size: 40, letterSpacing: -1, seconds: false, dateFormat: "short", datePosition: "right", align: "left", valign: "center", color: "accent", dateColor: "secondary", tabular: true, background: true, blinkColon: false },
  },
  {
    id: "script",
    values: { font: "script", weight: 400, width: 100, size: 52, letterSpacing: 0, seconds: false, dateFormat: "weekday", datePosition: "below", align: "center", valign: "center", color: "accent", dateColor: "text", tabular: false, background: true, blinkColon: false },
  },
];

// ---------------------------------------------------------------------------------------------
// Map & schedule
// ---------------------------------------------------------------------------------------------

export const MAP_SCHEMES: readonly MapScheme[] = ["glass", "pastel", "vivid", "outline", "tint", "blueprint"];
export const MAP_CODE_WEIGHTS: readonly MapCodeWeight[] = ["light", "regular", "bold"];
/** The font weight of each «Толщина номеров». */
export const MAP_CODE_WEIGHT: Record<MapCodeWeight, number> = { light: 400, regular: 600, bold: 700 };

/**
 * The map's own looks as CSS variables on its root and on the scheme legends (map.css): the «Свой цвет» colour,
 * the room codes' weight and, when one is chosen, their colour.
 */
export function mapVars(m: Pick<MapSettings, "color" | "codeWeight" | "codeColor">): CSSProperties {
  const vars: Record<string, string | number> = { "--map-tint": m.color || "var(--accent)", "--mp-code-weight": MAP_CODE_WEIGHT[m.codeWeight] };
  if (m.codeColor) vars["--mp-code"] = m.codeColor;
  return vars as CSSProperties;
}

/** Default colours offered for favourite rooms. */
export const FAVORITE_COLORS: readonly string[] = ["#60CDFF", "#9BE3A6", "#FFD66B", "#FFB6A8", "#E3B1FF", "#FF9B8E"];

/** ISO weekday (1 = Monday) of a Date. */
export function isoWeekday(d: Date): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const js = d.getDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** "HH:MM" → minutes since midnight, or null. */
export function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
