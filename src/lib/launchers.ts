// Launcher model shared by the "Ярлыки" tile and the settings window.
import { invoke } from "@tauri-apps/api/core";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.launchers";
import { SWATCHES, hexToRgb, isHex, luminance, rgbToHex, shade } from "./design";
import {
  DEFAULT_LAUNCHERS,
  settings,
  type BuiltInEdit,
  type BuiltInLauncher,
  type CustomLauncher,
  type LauncherIcon,
  type LaunchersSettings,
  type Settings,
} from "./settings";

/** What the launcher editor sets, for custom and built-in launchers alike. */
export interface LauncherDraft {
  /** Full name: settings rows, accessible name, tooltip. */
  name: string;
  url: string;
  icon: LauncherIcon;
  /** #RRGGBB tint. */
  color: string;
}

/** A launcher as the tile shows it: a built-in one (key, the user's edits applied) or a custom one (its id). */
export type LauncherItem = LauncherDraft & {
  /** Caption under the icon on the tile: a built-in keeps its short name until it is renamed. */
  caption: string;
} & ({ kind: "builtin"; id: BuiltInLauncher } | { kind: "custom"; id: string });

export interface BuiltInDef {
  id: BuiltInLauncher;
  name: string;
  /** Tile caption: the full names do not fit a 64 px cell. */
  short: string;
  url: string;
  icon: string;
}

export const BUILT_IN: readonly BuiltInDef[] = [
  { id: "du", name: ru.launchers.du, short: extra.tileNames.du, url: "https://du.astanait.edu.kz/login", icon: "building_bank" },
  {
    id: "moodle",
    name: ru.launchers.moodle,
    short: extra.tileNames.moodle,
    url: "https://lms.astanait.edu.kz/login/index.php",
    icon: "book_open",
  },
  {
    id: "learn",
    name: ru.launchers.learn,
    short: extra.tileNames.learn,
    url: "https://learn.astanait.edu.kz/login?next=%2F",
    icon: "hat_graduation",
  },
];

export const isBuiltInKey = (id: string): id is BuiltInLauncher => BUILT_IN.some((b) => b.id === id);

export function builtInDef(id: BuiltInLauncher): BuiltInDef {
  return BUILT_IN.find((b) => b.id === id) ?? BUILT_IN[0];
}

/** True for the built-in's own Fluent icon, cached markup or not (it is in the eager set and never stored). */
const isOriginalIcon = (def: BuiltInDef, icon: LauncherIcon): boolean => icon.kind === "fluent" && icon.name === def.icon;

/** A built-in launcher as it shows now: the user's edits over the original, with its colour. */
export function builtInItem(ln: LaunchersSettings, key: BuiltInLauncher): LauncherItem {
  const def = builtInDef(key);
  const edit = ln.builtInEdits[key];
  return {
    id: key,
    kind: "builtin",
    name: edit?.name ?? def.name,
    caption: edit?.name ?? def.short,
    url: edit?.url ?? def.url,
    icon: edit?.icon ?? { kind: "fluent", name: def.icon },
    color: ln.builtInColors[key],
  };
}

/** The untouched built-in launcher: original name, address and icon, default colour. */
export const builtInOriginal = (key: BuiltInLauncher): LauncherItem => builtInItem(DEFAULT_LAUNCHERS, key);

/** True when `look` is the untouched built-in `key` (a cached copy of the icon markup aside). */
export function isBuiltInOriginal(key: BuiltInLauncher, look: LauncherDraft): boolean {
  const def = builtInDef(key);
  return (
    look.name.trim() === def.name &&
    look.url.trim() === def.url &&
    isOriginalIcon(def, look.icon) &&
    look.color.toUpperCase() === DEFAULT_LAUNCHERS.builtInColors[key].toUpperCase()
  );
}

/** A custom launcher as the tile shows it: the caption is its name. */
export const customItem = (c: CustomLauncher): LauncherItem => ({
  id: c.id,
  kind: "custom",
  name: c.name,
  caption: c.name,
  url: c.url,
  icon: c.icon,
  color: c.color,
});

/** Enabled built-ins first (fixed order), then custom launchers in stored order. */
export function visibleLaunchers(s: Settings): LauncherItem[] {
  const ln = s.launchers;
  const out = BUILT_IN.filter((b) => ln.builtIn[b.id]).map((b) => builtInItem(ln, b.id));
  for (const c of ln.custom) out.push(customItem(c));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------------------------

export type IconMode = LauncherIcon["kind"];

/** Icon preselected when a launcher switches to the Fluent mode. */
export const DEFAULT_FLUENT_ICON = "globe";

/**
 * Popular icons, shown as two rows in the launcher editor before «Смотреть все». All of them are in the
 * eager icon set, so the rows render without loading the full set.
 */
export const LAUNCHER_ICONS: readonly string[] = [
  "globe", "link", "book_open", "building_bank", "hat_graduation", "library", "notebook", "document", "folder", "mail",
  "chat", "calendar_ltr", "clock", "code", "video", "music_note_2", "image", "camera", "games", "map",
  "news", "people", "person", "star", "bookmark", "home", "briefcase", "lightbulb", "rocket", "table",
];

/**
 * The exact shape of every icon in src/icons and src/icons/generated: an <svg> with the fixed namespace and
 * a numeric size, then only <path> elements whose attributes are path data, a hex fill or an opacity.
 * No other element or attribute can pass (no handlers, links or styles), so a cached copy that matches is
 * safe to insert as markup even if settings.json was edited by hand.
 */
const ICON_MARKUP =
  /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d{1,3}" height="\d{1,3}" viewBox="0 0 \d{1,3} \d{1,3}">(?:<path(?: d="[-0-9 .,ACHLMQSTVZachlmqstvz]*"| fill="#[0-9a-fA-F]{3,8}"| opacity="[0-9.]{1,6}")+\/>)+<\/svg>$/;

/** The longest icon of the set is under 2 KB; anything far bigger is not one of ours. */
const ICON_MARKUP_MAX = 8192;

/** True when `svg` has the shape of an icon from our own Fluent set (see ICON_MARKUP). */
export function isIconMarkup(svg: string): boolean {
  return svg.length <= ICON_MARKUP_MAX && ICON_MARKUP.test(svg);
}

/** Site icons are cached as data: URLs only; anything else would make the tile load it from the network. */
export function isImageDataUrl(data: string | undefined): data is string {
  return typeof data === "string" && data.startsWith("data:image/");
}

/** True while a site-icon launcher has no usable cached image (the tile shows the first letter). */
export const siteIconMissing = (icon: LauncherIcon): boolean => icon.kind === "site" && !isImageDataUrl(icon.data);

// ---------------------------------------------------------------------------------------------
// Glyph colour
// ---------------------------------------------------------------------------------------------

/**
 * Reference surfaces for the contrast check, as for lesson colours: the lightest dark tile fill and the
 * darkest light one («Светло-серая»), so the result reads on every palette of its kind.
 */
const INK_SURFACE_DARK = "#2A2C34";
const INK_SURFACE_LIGHT = "#E4E5EA";
/** --tint-alpha of tokens.css: how much of the launcher colour the square takes. */
const TINT_DARK = 0.18;
const TINT_LIGHT = 0.28;
/** WCAG contrast for graphics: the glyph against its own tinted square. */
const INK_CONTRAST = 3;
const INK_STEPS = 40;

function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `color` moved towards white (dark palettes) or black (light ones) just far enough to read on its square. */
function readableInk(color: string, surface: string, tint: number, dir: 1 | -1): string {
  const square = mixHex(surface, color, tint);
  for (let k = 0; k <= INK_STEPS; k += 1) {
    const c = shade(color, (dir * k) / INK_STEPS);
    if (contrast(c, square) >= INK_CONTRAST) return c;
  }
  return dir < 0 ? "#000000" : "#FFFFFF";
}

const inkCache = new Map<string, { dark: string; light: string }>();
const INK_CACHE_MAX = 64;

/**
 * Glyph colours (icon, letter) of a launcher for dark and light palettes: the colour itself where it reads
 * on its own tinted square, otherwise lighter (dark palettes) or deeper (light palettes), like the two tones
 * of an accent preset. Pastel tints keep their look on dark tiles and stay legible on light ones.
 */
export function launcherInk(color: string): { dark: string; light: string } {
  const key = isHex(color) ? color.toUpperCase() : "#60CDFF";
  let ink = inkCache.get(key);
  if (!ink) {
    ink = { dark: readableInk(key, INK_SURFACE_DARK, TINT_DARK, 1), light: readableInk(key, INK_SURFACE_LIGHT, TINT_LIGHT, -1) };
    if (inkCache.size >= INK_CACHE_MAX) inkCache.clear();
    inkCache.set(key, ink);
  }
  return ink;
}

/** First letter for the letter fallback: from the name, else from the host. Upper-cased, surrogate-safe. */
export function letterOf(name: string, url: string): string {
  const source = name.trim() || hostOf(url).replace(/^www\./i, "");
  const first = Array.from(source)[0] ?? "";
  return first.toLocaleUpperCase("ru-RU");
}

// ---------------------------------------------------------------------------------------------
// Grid geometry (tile and previews)
// ---------------------------------------------------------------------------------------------

export const CELL_SIZE = 64;
export const CELL_GAP = 8;

/** How many 64 px cells with 8 px gaps fit into `px` (at least one). */
export function cellsThatFit(px: number): number {
  return Math.max(1, Math.floor((px + CELL_GAP) / (CELL_SIZE + CELL_GAP)));
}

/** Content-box size (clientWidth/Height minus padding), matching ResizeObserver's contentRect. */
export function contentBox(el: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  return {
    w: el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
    h: el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom),
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/**
 * A launcher URL must start with http:// or https:// and name a host: `http://localhost:8080` or
 * `http://intranet/` are fine (the opener and the favicon fetch accept them), `https://` alone is not.
 * The prefix is checked on the text itself, because the URL parser would also accept `http:example.com`.
 * No spaces inside (hasSpaces): the URL parser would accept them in a path, the settings file does not and
 * would drop the launcher.
 */
export function isValidUrl(url: string): boolean {
  const text = url.trim();
  if (!/^https?:\/\//i.test(text) || hasSpaces(text)) return false;
  try {
    const u = new URL(text);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Whitespace inside the trimmed text (the editor names this mistake on its own). */
export const hasSpaces = (url: string): boolean => /\s/.test(url.trim());

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function newLauncherId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Clearly different tints first (the six of v1), then the rest of the palette. */
const TINT_ORDER: readonly string[] = ["#60CDFF", "#9BE3A6", "#FFB6A8", "#E3B1FF", "#FFD66B", "#A9C3FF"];

/** Colour for a new launcher: the first tint no visible launcher uses yet, so neighbours differ. */
export function nextLauncherColor(s: Settings): string {
  const used = new Set(visibleLaunchers(s).map((it) => it.color.toUpperCase()));
  for (const c of [...TINT_ORDER, ...SWATCHES]) {
    if (!used.has(c.toUpperCase())) return c.toUpperCase();
  }
  return TINT_ORDER[0];
}

/** Open the settings window on the launchers tab; `edit` = a custom id or a built-in key opens its editor. */
export function openLaunchersSettings(edit?: string): Promise<void> {
  const args: { tab: string; edit?: string } = { tab: "launchers" };
  if (edit) args.edit = edit;
  return invoke("open_settings", args).then(
    () => undefined,
    () => undefined,
  );
}

// Every write below uses the functional form of settings.update, so the patch is computed against the
// state at apply time (the store awaits its promise first) and two writes in one tick cannot overwrite
// each other's `custom` array or built-in maps (`builtIn`, `builtInColors`, `builtInEdits`).

/** Nested patch of the launchers section computed from the current state. */
const patchLaunchers = (fn: (ln: LaunchersSettings) => Partial<LaunchersSettings>): Promise<void> =>
  settings.update((s) => ({ launchers: { ...s.launchers, ...fn(s.launchers) } }));

export function removeCustom(id: string): Promise<void> {
  return patchLaunchers((ln) => ({ custom: ln.custom.filter((c) => c.id !== id) }));
}

export function setBuiltIn(key: BuiltInLauncher, enabled: boolean): Promise<void> {
  return patchLaunchers((ln) => ({ builtIn: { ...ln.builtIn, [key]: enabled } }));
}

/**
 * Save the editor's values of a built-in launcher: only the fields that differ from the original go into
 * builtInEdits (none left = the entry is dropped, the launcher is the original again), the colour goes into
 * builtInColors.
 */
export function saveBuiltIn(key: BuiltInLauncher, look: LauncherDraft): Promise<void> {
  const def = builtInDef(key);
  const edit: BuiltInEdit = {};
  const name = look.name.trim();
  const url = look.url.trim();
  if (name !== def.name) edit.name = name;
  if (url !== def.url) edit.url = url;
  if (!isOriginalIcon(def, look.icon)) edit.icon = look.icon;
  return patchLaunchers((ln) => {
    const builtInEdits = { ...ln.builtInEdits };
    if (Object.keys(edit).length > 0) builtInEdits[key] = edit;
    else delete builtInEdits[key];
    return { builtInEdits, builtInColors: { ...ln.builtInColors, [key]: look.color } };
  });
}

/** Insert (no id match) or replace a custom launcher, keeping list order. */
export function upsertCustom(item: CustomLauncher): Promise<void> {
  return patchLaunchers((ln) => {
    const custom = ln.custom.slice();
    const i = custom.findIndex((c) => c.id === item.id);
    if (i < 0) custom.push(item);
    else custom[i] = item;
    return { custom };
  });
}

/** Move a custom launcher within the list (no-op when the move would leave the list). */
export function moveCustom(id: string, delta: number): Promise<void> {
  return patchLaunchers((ln) => {
    const custom = ln.custom.slice();
    const i = custom.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= custom.length) return {};
    const [item] = custom.splice(i, 1);
    custom.splice(j, 0, item);
    return { custom };
  });
}

/**
 * Cache icon markup (icon name → svg) on the custom Fluent launchers that have no valid copy yet: launchers
 * saved before the cache existed. Launchers changed in the meantime are left alone.
 */
export function cacheIconSvgs(svgs: ReadonlyMap<string, string>): Promise<void> {
  return patchLaunchers((ln) => {
    let changed = false;
    const custom = ln.custom.map((c): CustomLauncher => {
      if (c.icon.kind !== "fluent" || (c.icon.svg && isIconMarkup(c.icon.svg))) return c;
      const svg = svgs.get(c.icon.name);
      if (!svg || !isIconMarkup(svg)) return c;
      changed = true;
      return { ...c, icon: { kind: "fluent", name: c.icon.name, svg } };
    });
    return changed ? { custom } : {};
  });
}
