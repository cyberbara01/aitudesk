// The settings file of «Конфиги»: what a saved configuration holds, how it is written and read, and how
// its parts are applied. Pure functions only; the page (src/settings/TransferPage.tsx) does the IPC.
//
// A file is UTF-8 JSON pretty-printed with two spaces, so it reads well in Notepad:
//   {
//     "aitudesk": "settings",           marks the file as ours
//     "format": 1,                      FORMAT; a higher number comes from a newer app and is refused
//     "app": "1.0",                     ru.app.version of the app that saved it (shown when it differs)
//     "saved": "2026-10-07T15:42",      local time of saving (shown)
//     "parts": ["tiles", "layout", …],  the parts inside, in PARTS order (for people: loading reads the keys)
//     "personal": ["notes"],            the personal parts inside
//     "settings": { "tiles": …, … },    the settings keys of those parts, exactly as stored
//     "layout": { "screen": …, "zoom": 1, "tiles": …, "defaults": […] }   only with the «layout» part:
//                                       get_layout (src-tauri/src/layout.rs); `zoom` is the widgets' scale the
//                                       rects were made at, `defaults` lists the tiles never moved
//     "images": { "<file>": "<base64>" } only with the «custom» part: the pictures of the own widgets, by the
//                                       names their entries use (a widget whose picture is not inside is left out)
//   }
// Never in a file: `version`, `onboarded` (the welcome page), `language` (a personal choice), `tileScale` (it
// depends on the screen), autostart (a Windows setting) and whether «Все виджеты» are hidden (`tilesHidden`,
// kept next to the settings in the store).
//
// Loading also takes the app's own store, %APPDATA%\kz.edu.astanait.aitudesk\settings.json: `settings` of
// version 2 and maybe `layout`, tile rects without the screen they were made on (and `tileZoom`, the widgets'
// size they were made at). Such a copy is almost always a backup of this very PC, so its layout is applied as
// made on this screen, each tile kept inside the work area (resolveLayout).
import { ru } from "../i18n/ru";
import { extra as shell } from "../i18n/ru.extra.shell";
import { extra } from "../i18n/ru.extra.transfer";
import { extra as perfStrings } from "../i18n/ru.extra.perf";
import { hostOf } from "./launchers";
import {
  LOOK_PARTS,
  STYLE_IDS,
  THEME_IDS,
  TILE_IDS,
  isWidgetFile,
  normalize,
  type BuiltInLauncher,
  type CustomWidget,
  type Settings,
  type SettingsPatch,
} from "./settings";
import { LOCALE } from "../i18n/lang";

/** Version of the file layout. Raise it only when an older app would misread a newer file. */
export const FORMAT = 1;

/** Settings keys a file can carry: all but `version`, `defaults`, `onboarded`, `language` and `tileScale`. */
export type SettingsKey = Exclude<keyof Settings, "version" | "defaults" | "onboarded" | "language" | "tileScale">;

export type PartId = "tiles" | "layout" | "appearance" | "clock" | "system" | "perf" | "launchers" | "map" | "schedule" | "reminders" | "custom" | "notes";

export interface Part {
  id: PartId;
  label: string;
  /** Settings keys of the part. The layout has none: tile rects live next to the settings (get_layout). */
  keys: readonly SettingsKey[];
  /** Personal data: never chosen by default, marked in both lists, named in the file's `personal`. */
  personal: boolean;
}

const PART_LIST = [
  { id: "tiles", label: ru.settings.general.tiles, keys: ["tiles", "tileViews", "lockLayout"], personal: false },
  { id: "layout", label: extra.parts.layout, keys: [], personal: false },
  { id: "appearance", label: ru.settings.nav.appearance, keys: ["style", "theme", "look", "accent"], personal: false },
  { id: "clock", label: ru.settings.nav.clock, keys: ["clock"], personal: false },
  { id: "system", label: ru.settings.nav.system, keys: ["system"], personal: false },
  { id: "perf", label: ru.settings.nav.perf, keys: ["perf"], personal: false },
  { id: "launchers", label: ru.settings.nav.launchers, keys: ["launchers"], personal: false },
  { id: "map", label: ru.settings.nav.map, keys: ["map"], personal: false },
  { id: "schedule", label: ru.settings.nav.schedule, keys: ["schedule"], personal: false },
  { id: "reminders", label: ru.settings.nav.reminders, keys: ["reminders"], personal: false },
  // Their pictures are inside the file; a picture of one's own is personal until shown on purpose.
  { id: "custom", label: shell.custom.title, keys: ["customWidgets"], personal: true },
  { id: "notes", label: ru.settings.nav.notes, keys: ["notes"], personal: true },
] as const satisfies readonly Part[];

/**
 * Compiles only while every settings key (but those five) belongs to a part: a new setting that
 * nobody added to a part would otherwise silently stay out of every file. The error names the missing key.
 */
type EveryKeyInAPart<Assigned extends SettingsKey> =
  Exclude<SettingsKey, Assigned> extends never ? readonly Part[] : { notInAnyPart: Exclude<SettingsKey, Assigned> };

/** Every part in list order: the sidebar order, the personal parts last. Each settings key is in one part. */
export const PARTS: EveryKeyInAPart<(typeof PART_LIST)[number]["keys"][number]> = PART_LIST;

const isPartId = (v: unknown): v is PartId => PARTS.some((p) => p.id === v);

/** What a list of parts starts with: every part in `ids` that is not personal. */
export function defaultChoice(ids: readonly PartId[], personal: readonly PartId[] = []): PartId[] {
  return ids.filter((id) => !personal.includes(id) && !PARTS.some((p) => p.id === id && p.personal));
}

// ---------------------------------------------------------------------------------------------
// Tile layout (the shapes of src-tauri/src/layout.rs)
// ---------------------------------------------------------------------------------------------

/** A tile in physical px (layout.rs Rect). */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Work area of the primary monitor in physical px, with its scale (layout.rs WorkArea). */
export interface WorkArea {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

/**
 * Result of get_layout and argument of set_layout (layout.rs LayoutFile). `tiles` are the tiles moved or
 * resized by hand; `defaults` the ones never moved, which keep following the default layout (it fits itself
 * to any screen), so loading such a file puts them back in their default places.
 */
export interface LayoutFile {
  screen: WorkArea;
  /** Zoom of the widgets the rects were made at («Масштаб виджетов»); 1 in files from before it. */
  zoom: number;
  tiles: Record<string, TileRect>;
  defaults: string[];
}

/** A layout read from a file; `screen` is null when the file does not name it (the app's own store). */
export interface FileLayout {
  screen: WorkArea | null;
  zoom: number;
  tiles: Record<string, TileRect>;
  defaults: string[];
}

/** The layout to send to set_layout: a store layout is taken as made on `current`'s screen and kept inside it. */
export function resolveLayout(layout: FileLayout, current: LayoutFile | null): LayoutFile | null {
  if (layout.screen) return { screen: layout.screen, zoom: layout.zoom, tiles: layout.tiles, defaults: layout.defaults };
  if (!current) return null;
  const wa = current.screen;
  const tiles: Record<string, TileRect> = {};
  for (const [id, r] of Object.entries(layout.tiles)) {
    const w = Math.min(r.w, wa.w);
    const h = Math.min(r.h, wa.h);
    tiles[id] = {
      x: Math.min(Math.max(r.x, wa.x), wa.x + wa.w - w),
      y: Math.min(Math.max(r.y, wa.y), wa.y + wa.h - h),
      w,
      h,
    };
  }
  return { screen: wa, zoom: layout.zoom, tiles, defaults: layout.defaults };
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall time "YYYY-MM-DDTHH:MM" (the `saved` field). */
function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The pictures of own widgets a file carries at most, in base64 characters (with the file's cap, files.rs). */
export const IMAGES_MAX = 48 * 1024 * 1024;
/** One picture in base64 (custom.rs MAX_IMAGE). */
const IMAGE_MAX = Math.ceil((20 * 1024 * 1024) / 3) * 4 + 4;

/**
 * The text of a settings file with the `chosen` parts of `s`. The layout part is written only with a
 * `layout` (get_layout); without one it is left out of `parts` too. The own widgets go with their pictures
 * (`images`, base64 by file name): a widget whose picture is not given stays out.
 */
export function buildConfigFile(
  s: Settings,
  chosen: readonly PartId[],
  layout: LayoutFile | null,
  now: Date,
  images: Readonly<Record<string, string>> = {},
): string {
  const parts = PARTS.filter((p) => chosen.includes(p.id) && (p.id !== "layout" || layout !== null));
  const values: Partial<Record<SettingsKey, unknown>> = {};
  for (const part of parts) for (const key of part.keys) values[key] = s[key];
  let pictures: Record<string, string> | null = null;
  if (parts.some((p) => p.id === "custom")) {
    const kept = s.customWidgets.filter((w) => Object.hasOwn(images, w.file));
    values.customWidgets = kept;
    pictures = {};
    for (const w of kept) pictures[w.file] = images[w.file];
  }
  const file: Record<string, unknown> = {
    aitudesk: "settings",
    format: FORMAT,
    app: ru.app.version,
    saved: stamp(now),
    parts: parts.map((p) => p.id),
    personal: parts.filter((p) => p.personal).map((p) => p.id),
    settings: values,
  };
  if (layout && parts.some((p) => p.id === "layout")) {
    const { x, y, w, h, scale } = layout.screen;
    const tiles: Record<string, TileRect> = {};
    for (const id of TILE_IDS) {
      const r = layout.tiles[id];
      if (r) tiles[id] = { x: r.x, y: r.y, w: r.w, h: r.h };
    }
    const defaults = TILE_IDS.filter((id) => !tiles[id] && (layout.defaults ?? []).includes(id));
    file.layout = { screen: { x, y, w, h, scale }, zoom: layout.zoom, tiles, defaults };
  }
  if (pictures) file.images = pictures;
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * «Конфиг AITU Desk 07.10.2026.json», with «с заметками», «со своими виджетами» or both when those personal parts
 * are in `chosen` (the page leaves a part out of it when nothing of it went into the file).
 */
export function suggestedFileName(chosen: readonly PartId[], now: Date): string {
  const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  return extra.fileName(date, chosen.includes("notes"), chosen.includes("custom"));
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

export interface ConfigFile {
  /** "export": written by «Сохранить конфиг…»; "store": the app's own settings.json. */
  source: "export" | "store";
  /** Parts found in the file (by the keys present), in PARTS order. */
  parts: PartId[];
  /** Personal parts among them: the personal PARTS plus any the file itself lists as personal. */
  personal: PartId[];
  /** File values of the keys found; validated only when applied (applyParts). */
  settings: Partial<Record<SettingsKey, unknown>>;
  layout: FileLayout | null;
  /** Version of the app that saved the file, and its local save time "YYYY-MM-DDTHH:MM", when given. */
  app: string | null;
  saved: string | null;
  /** Pictures of the own widgets (base64 by file name); checked again when stored (store_widget_image). */
  images: Record<string, string>;
}

export type ParseError =
  /** Not JSON at all: damaged, or some other kind of file. */
  | "notJson"
  /** JSON, but not an AITU Desk settings file. */
  | "foreign"
  /** A settings file of a newer format than this app reads. */
  | "newer"
  /** A settings file with nothing that can be loaded. */
  | "empty";

export type ParseResult = { ok: true; file: ConfigFile } | { ok: false; error: ParseError };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Beyond any monitor arrangement, and small enough for the i32 maths of layout.rs. */
const COORD = 1_000_000;
const STAMP = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d)$/;
const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/** A screen as layout.rs accepts it (set_layout refuses smaller or odd ones). */
function readScreen(v: unknown): WorkArea | null {
  if (!isObj(v)) return null;
  const { x, y, w, h, scale } = v;
  if (!isInt(x, -COORD, COORD) || !isInt(y, -COORD, COORD) || !isInt(w, 200, 100_000) || !isInt(h, 200, 100_000)) return null;
  if (typeof scale !== "number" || !(scale >= 0.5 && scale <= 8)) return null;
  return { x, y, w, h, scale };
}

/** Zoom of the widgets a layout was made at, as zoom.rs accepts it; 1 when absent (files from before it). */
function readZoom(v: unknown): number {
  return typeof v === "number" && v >= 0.5 && v <= 2 ? v : 1;
}

/** Rects of the known tiles that layout.rs accepts (whole px, 40..20000 px in size). */
function readRects(v: unknown): Record<string, TileRect> {
  const tiles: Record<string, TileRect> = {};
  if (!isObj(v)) return tiles;
  for (const id of TILE_IDS) {
    const r = v[id];
    if (isObj(r) && isInt(r.x, -COORD, COORD) && isInt(r.y, -COORD, COORD) && isInt(r.w, 40, 20_000) && isInt(r.h, 40, 20_000)) {
      tiles[id] = { x: r.x, y: r.y, w: r.w, h: r.h };
    }
  }
  return tiles;
}

/** Known tiles listed as never moved, without the ones that also have a rect. */
function readDefaults(v: unknown, tiles: Record<string, TileRect>): string[] {
  if (!Array.isArray(v)) return [];
  return TILE_IDS.filter((id) => v.includes(id) && !tiles[id]);
}

/** Whether a file value can stand for its key at all. Others count as absent; normalize checks the rest. */
function usable(key: SettingsKey, v: unknown): boolean {
  if (key === "style") return (STYLE_IDS as readonly unknown[]).includes(v);
  if (key === "theme") return (THEME_IDS as readonly unknown[]).includes(v);
  if (key === "lockLayout") return typeof v === "boolean";
  if (key === "customWidgets") return Array.isArray(v);
  return isObj(v);
}

/** The pictures of a file: well-named, each a string no longer than one picture can be. */
function readImages(v: unknown): Record<string, string> {
  const images: Record<string, string> = {};
  if (!isObj(v)) return images;
  for (const [name, data] of Object.entries(v)) {
    if (isWidgetFile(name) && typeof data === "string" && data.length <= IMAGE_MAX) images[name] = data;
  }
  return images;
}

/** Reads a settings file (or the app's own store). Never throws: a file it cannot use is a typed error. */
export function parseConfigFile(text: string): ParseResult {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  if (!isObj(root)) return { ok: false, error: "foreign" };

  let source: ConfigFile["source"];
  let values: Record<string, unknown>;
  let layout: FileLayout | null = null;
  let app: string | null = null;
  let saved: string | null = null;
  let declared: PartId[] = [];
  let images: Record<string, string> = {};
  if (root.aitudesk === "settings") {
    if (!isInt(root.format, 1, Number.MAX_SAFE_INTEGER)) return { ok: false, error: "foreign" };
    if (root.format > FORMAT) return { ok: false, error: "newer" };
    source = "export";
    values = isObj(root.settings) ? root.settings : {};
    if (isObj(root.layout)) {
      const screen = readScreen(root.layout.screen);
      const tiles = readRects(root.layout.tiles);
      const defaults = readDefaults(root.layout.defaults, tiles);
      if (screen && (Object.keys(tiles).length > 0 || defaults.length > 0)) layout = { screen, zoom: readZoom(root.layout.zoom), tiles, defaults };
    }
    if (typeof root.app === "string" && VERSION.test(root.app)) app = root.app;
    if (typeof root.saved === "string" && STAMP.test(root.saved)) saved = root.saved;
    if (Array.isArray(root.personal)) declared = root.personal.filter(isPartId);
    images = readImages(root.images);
  } else if (isObj(root.settings) && root.settings.version === 2) {
    source = "store";
    values = root.settings;
    // The store keeps rects only of tiles moved by hand; the others sit at their default places.
    if (isObj(root.layout)) {
      const tiles = readRects(root.layout);
      layout = { screen: null, zoom: readZoom(root.tileZoom), tiles, defaults: TILE_IDS.filter((id) => !tiles[id]) };
    }
  } else {
    return { ok: false, error: "foreign" };
  }

  const settings: Partial<Record<SettingsKey, unknown>> = {};
  for (const part of PARTS) {
    for (const key of part.keys) {
      if (Object.hasOwn(values, key) && usable(key, values[key])) settings[key] = values[key];
    }
  }
  // Own widgets come only with their pictures: the app's own store has none inside, a file may lack some.
  if (Array.isArray(settings.customWidgets)) {
    const withPicture = settings.customWidgets.filter((w) => isObj(w) && typeof w.file === "string" && Object.hasOwn(images, w.file));
    if (withPicture.length > 0) settings.customWidgets = withPicture;
    else delete settings.customWidgets;
  }
  const parts = PARTS.filter((p) => (p.id === "layout" ? layout !== null : p.keys.some((k) => Object.hasOwn(settings, k)))).map(
    (p) => p.id,
  );
  if (parts.length === 0) return { ok: false, error: "empty" };
  const personal = parts.filter((id) => declared.includes(id) || PARTS.some((p) => p.id === id && p.personal));
  return { ok: true, file: { source, parts, personal, settings, layout, app, saved, images } };
}

/** "2026-10-07T15:42" → { date: "07.10.2026", time: "15:42" } for the caption of a loaded file. */
export function savedAt(saved: string): { date: string; time: string } {
  const [day, time] = saved.split("T");
  const [y, m, d] = day.split("-");
  return { date: `${d}.${m}.${y}`, time };
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

function setKey<K extends SettingsKey>(patch: SettingsPatch, key: K, value: Settings[K]) {
  patch[key] = value;
}

/**
 * The patch that loads the `chosen` parts of a file over `current`. Only the keys of those parts that the file
 * has are touched, and each is validated by normalize: unknown fields dropped, numbers clamped, colours and
 * times checked, launchers whose address is not http(s) dropped. A section in the file replaces the current
 * one field by field (a field the file lacks keeps its current value); lists replace whole: lessons, notes,
 * own launchers, marked rooms. Privacy never gets weaker by loading: hidden schedule and note texts and hidden
 * network and device names stay hidden when they are hidden now.
 */
export function applyParts(current: Settings, fileSettings: ConfigFile["settings"], chosen: readonly PartId[]): SettingsPatch {
  const keys = PARTS.filter((p) => chosen.includes(p.id))
    .flatMap((p) => p.keys)
    .filter((key) => Object.hasOwn(fileSettings, key) && usable(key, fileSettings[key]));
  const patch: SettingsPatch = {};
  if (keys.length === 0) return patch;
  const merged: Record<string, unknown> = { ...current };
  for (const key of keys) {
    const value = fileSettings[key];
    const now = current[key];
    merged[key] = isObj(value) && isObj(now) ? { ...now, ...value } : value;
  }
  const next = normalize({ ...merged, version: 2 });
  for (const key of keys) setKey(patch, key, next[key]);
  if (patch.schedule) patch.schedule = { ...patch.schedule, privacy: patch.schedule.privacy || current.schedule.privacy };
  if (patch.notes) patch.notes = { ...patch.notes, privacy: patch.notes.privacy || current.notes.privacy };
  // A file from before «Свой порядок» remembered a hand-made order has no `arranged`: its notes are in that order
  // exactly when its sort was «Свой порядок».
  const fileNotes = fileSettings.notes;
  if (patch.notes && isObj(fileNotes) && !Object.hasOwn(fileNotes, "arranged")) {
    patch.notes = { ...patch.notes, arranged: patch.notes.sort === "manual" };
  }
  if (patch.system) patch.system = { ...patch.system, hideNames: patch.system.hideNames || current.system.hideNames };
  if (patch.launchers) {
    // The tile keeps calling a built-in launcher «LMS» or «DU», so a file may not send it to a lookalike page:
    // a change of a built-in that leads off the university's sites is not taken, that launcher stays as it is.
    const edits = { ...patch.launchers.builtInEdits };
    for (const key of Object.keys(edits) as BuiltInLauncher[]) {
      const url = edits[key]?.url;
      if (url === undefined || universitySite(url)) continue;
      const kept = current.launchers.builtInEdits[key];
      if (kept) edits[key] = kept;
      else delete edits[key];
    }
    patch.launchers = { ...patch.launchers, builtInEdits: edits };
  }
  return patch;
}

/** An address on the university's own sites (astanait.edu.kz and its subdomains, like du. or lms.). */
function universitySite(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "astanait.edu.kz" || host.endsWith(".astanait.edu.kz");
  } catch {
    return false;
  }
}

/**
 * The own widgets of a file added to `current` ones (never replacing them: a picture of one's own is not lost by
 * loading someone else's file): each picture stored first by `store` (it returns the stored name, or throws for
 * one that is not a picture), each widget with a new id. A widget already here (same picture, same name) and one
 * whose picture is not taken are skipped. The list keeps the cap of normalize.
 */
export async function addWidgets(
  current: readonly CustomWidget[],
  fromFile: readonly CustomWidget[],
  images: Readonly<Record<string, string>>,
  store: (data: string) => Promise<string>,
  newId: () => string,
): Promise<CustomWidget[]> {
  const out = [...current];
  for (const w of fromFile) {
    if (!Object.hasOwn(images, w.file)) continue;
    let file: string;
    try {
      file = await store(images[w.file]);
    } catch {
      continue;
    }
    if (out.some((c) => c.file === file && c.name === w.name)) continue;
    out.push({ ...w, id: newId(), file });
  }
  return out;
}

/** The current values of the keys `patch` replaces: applying this restores them exactly («Отменить»). */
export function snapshotOf(current: Settings, patch: SettingsPatch): SettingsPatch {
  const before: SettingsPatch = {};
  for (const key of Object.keys(patch) as SettingsKey[]) setKey(before, key, current[key]);
  return before;
}

/** The settings as they would be with every part of `file` applied: what the import list describes. */
export function previewOf(current: Settings, file: ConfigFile): Settings {
  return { ...current, ...applyParts(current, file.settings, file.parts) };
}

// ---------------------------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------------------------

/** A name from a catalogue of ru.ts by id, never one inherited from Object (ids can come from a file). */
function nameIn(names: Readonly<Record<string, string>>, id: string): string | undefined {
  return Object.hasOwn(names, id) ? names[id] : undefined;
}

/** «Батарея», «Батарея и Wi-Fi», «Батарея, Wi-Fi и Bluetooth». */
function joinAnd(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${extra.summary.and} ${items[items.length - 1]}`;
}

/** «10 мин», «1 ч 30 мин», «2 ч», «1 день». */
function duration(minutes: number): string {
  const x = extra.summary;
  if (minutes >= 1440 && minutes % 1440 === 0) return x.days(minutes / 1440);
  if (minutes < 60) return x.minutes(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? x.hours(h) : `${x.hours(h)} ${x.minutes(m)}`;
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase(LOCALE) + s.slice(1);

/**
 * Bytes of the pictures `files` name in `images` (base64, as a file carries them), each picture once: what the own
 * widgets of a loaded file bring. Only string lengths are read, so it costs nothing however big the pictures are.
 */
export function imagesBytes(images: Readonly<Record<string, string>>, files: Iterable<string>): number {
  let bytes = 0;
  for (const name of new Set(files)) {
    if (!Object.hasOwn(images, name)) continue;
    const data = images[name].trim();
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    bytes += Math.max(0, Math.floor((data.length * 3) / 4) - padding);
  }
  return bytes;
}

/** «350 КБ», «2,4 МБ»: a size as Explorer counts it (1 КБ = 1024 bytes), never below 1 КБ. */
export function sizeText(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1000) return extra.size.kb(String(Math.max(1, Math.ceil(kb))));
  return extra.size.mb(new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(kb / 1024));
}

/**
 * One line about what a part holds in `s`, under its name in the lists: «12 пар в неделю», «5 заметок, 2 с
 * дедлайном», «Aqua, Стекло, акцент Графит». For the layout, `layout` is the one of a loaded file; without it
 * (saving) the line says how a layout moves to another screen.
 */
export function partSummary(id: PartId, s: Settings, layout?: FileLayout | null): string {
  const x = extra.summary;
  switch (id) {
    case "tiles": {
      const total = TILE_IDS.length;
      const on = TILE_IDS.filter((t) => s.tiles[t]).length;
      const base = on === total ? x.tilesAll(total) : on === 0 ? x.tilesNone : x.tilesSome(on, total);
      return s.lockLayout ? `${base}, ${x.locked}` : base;
    }
    case "layout":
      if (layout === undefined) return x.layoutExport;
      return layout?.screen === null ? x.layoutNoScreen : x.layoutAdapts;
    case "appearance": {
      const look = ru.settings.appearance;
      const t = s.theme;
      const theme = t === "system" ? x.themeSystem : t === "glass" ? shell.appearance.glassName : look.themes[t];
      const a = s.accent;
      const accentName = nameIn(look.accents, a.preset) ?? look.accents["fluent-blue"];
      const accent = a.mode === "windows" ? x.accentWindows : a.mode === "custom" ? x.accentCustom(a.custom) : x.accentPreset(accentName);
      const own = LOOK_PARTS.filter((part) => s.look[part] !== "auto").map((part) => shell.appearance.parts[part].toLocaleLowerCase(LOCALE));
      const base = `${look.styles[s.style]}, ${theme}, ${accent}`;
      return own.length > 0 ? `${base}, ${shell.appearance.fineSummary(own.join(", "))}` : base;
    }
    case "clock": {
      const c = s.clock;
      const name = c.preset === "custom" ? undefined : nameIn(ru.settings.clock.presetNames, c.preset);
      const items = [name ? x.clockPreset(name) : x.clockCustom];
      if (c.seconds) items.push(x.seconds);
      if (c.hour12) items.push(x.hour12);
      return items.join(", ");
    }
    case "system": {
      const sy = s.system;
      const rows = [sy.showWifi ? ru.system.wifi : "", sy.showBluetooth ? ru.system.bluetooth : ""].filter(Boolean);
      if (rows.length === 0) return x.onlyBattery;
      const base = joinAnd([ru.system.battery, ...rows]);
      return sy.hideNames ? `${base}, ${x.namesHidden}` : base;
    }
    case "perf": {
      const p = s.perf;
      const names = (["cpu", "gpu", "ram", "disk"] as const).filter((k) => p[k]).map((k) => perfStrings.full[k].toLocaleLowerCase(LOCALE));
      if (p.temp) names.push(perfStrings.temp.toLocaleLowerCase(LOCALE));
      return perfStrings.summary(perfStrings.modes[p.mode], names.join(", "));
    }
    case "launchers": {
      const builtIn = Object.values(s.launchers.builtIn).filter(Boolean).length;
      const own = s.launchers.custom.length;
      if (builtIn + own === 0) return x.launchersOff;
      const counts = [builtIn > 0 ? x.builtIn(builtIn) : "", own > 0 ? x.own(own) : ""].filter(Boolean);
      // The noun agrees with the last number: «3 встроенных и 1 свой ярлык», «3 встроенных ярлыка».
      const line = `${counts.join(` ${x.and} `)} ${x.launchersWord(own > 0 ? own : builtIn)}`;
      if (own === 0) return line;
      // Where the own launchers lead, so a file from someone else can be checked before it is applied.
      const hosts = [...new Set(s.launchers.custom.map((c) => hostOf(c.url)))];
      return `${line}: ${x.sites(hosts.slice(0, 3).join(", "), hosts.length - 3)}`;
    }
    case "map":
      return `${x.scheme(ru.settings.map.schemes[s.map.scheme])}, ${x.marked(s.map.favorites.length)}`;
    case "schedule":
      return x.lessons(s.schedule.lessons.length);
    case "reminders": {
      const r = s.reminders;
      const items: string[] = [];
      if (r.lessons) items.push(r.lessonBefore === 0 ? x.lessonStart : x.beforeLesson(duration(r.lessonBefore)));
      if (r.deadlines && r.deadlineFirst > 0) items.push(x.beforeDeadline(duration(r.deadlineFirst)));
      else if (r.deadlines && r.atDeadline) items.push(x.deadlines);
      return items.length === 0 ? x.remindersOff : capitalize(items.join(", "));
    }
    case "custom": {
      const list = s.customWidgets;
      if (list.length === 0) return shell.custom.summaryNone;
      // Up to three names; every other widget, named or not, counts in «и ещё N».
      const shown = list.map((w) => w.name.trim()).filter(Boolean).slice(0, 3);
      return shell.custom.summary(list.length, shown.join(", "), list.length - shown.length);
    }
    case "notes": {
      const notes = s.notes.notes;
      const due = notes.filter((n) => n.deadline).length;
      return due > 0 ? `${x.notes(notes.length)}, ${x.withDeadline(due)}` : x.notes(notes.length);
    }
  }
}
