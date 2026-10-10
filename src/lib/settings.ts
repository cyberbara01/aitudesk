// Shared settings store (settings.json via tauri-plugin-store). Every window reads the same file;
// the plugin broadcasts changes, so subscribers in all windows stay in sync.
//
// Schema v2. Older files (v1: theme/accentFromWindows/tiles/builtIn/custom) are migrated on load.
import { load, type Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------------------------

/**
 * Base palette. "system" follows the Windows app theme (light → light, dark → dark); "glass" is the frosted,
 * translucent palette whose light or dark scheme also follows Windows.
 */
export type ThemeId = "system" | "light" | "gray" | "dark" | "darker" | "black" | "glass";
export const THEME_IDS: readonly ThemeId[] = ["system", "light", "gray", "dark", "darker", "black", "glass"];

/** Design language: Windows 11 (fluent), macOS-like (aqua), Linux-rice (rice). */
export type StyleId = "fluent" | "aqua" | "rice" | "pearl";
export const STYLE_IDS: readonly StyleId[] = ["fluent", "aqua", "rice", "pearl"];

/**
 * «Тонкая настройка» of the design: each part follows the chosen design ("auto") or is picked on its own, so
 * Aqua's type and shapes can go with a solid background, for one. What each design gives: STYLE_LOOK in
 * src/lib/design.ts; the values: tokens.css [data-font] [data-numfont] [data-shape] [data-density] [data-border]
 * [data-material].
 */
export type LookFont = "segoe" | "inter" | "mono";
export type LookNumbers = "text" | "mono";
export type LookShape = "square" | "strict" | "medium" | "soft";
/** «Углы виджетов»: the radius of the widgets themselves, CSS px (0 and 8 are Windows' own glass corners). */
export type LookCorners = "0" | "4" | "8" | "12" | "16" | "20" | "24";
export type LookDensity = "compact" | "normal" | "roomy";
export type LookBorder = "normal" | "accent" | "none";
/** Transparency of the settings window and the widgets: acrylic glass, Windows 11 Mica, or none. */
export type LookMaterial = "glass" | "matte" | "solid";
export interface Look {
  font: LookFont;
  numbers: LookNumbers;
  shape: LookShape;
  corners: LookCorners;
  density: LookDensity;
  border: LookBorder;
  material: LookMaterial;
}
export type LookSettings = { [K in keyof Look]: Look[K] | "auto" };
export const LOOK_CHOICES: { readonly [K in keyof Look]: readonly Look[K][] } = {
  font: ["segoe", "inter", "mono"],
  numbers: ["text", "mono"],
  shape: ["square", "strict", "medium", "soft"],
  corners: ["0", "4", "8", "12", "16", "20", "24"],
  density: ["compact", "normal", "roomy"],
  border: ["normal", "accent", "none"],
  material: ["glass", "matte", "solid"],
};
export const LOOK_PARTS = ["font", "numbers", "shape", "corners", "density", "border", "material"] as const satisfies readonly (keyof Look)[];

export type AccentMode = "windows" | "preset" | "custom";
export interface AccentSetting {
  mode: AccentMode;
  /** Id from ACCENT_PRESETS (src/lib/design.ts). */
  preset: string;
  /** #RRGGBB, used when mode === "custom". */
  custom: string;
}

// ---------------------------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------------------------

export type TileId = "clock" | "system" | "perf" | "launchers" | "map" | "schedule" | "notes";
export const TILE_IDS: readonly TileId[] = ["clock", "system", "perf", "launchers", "map", "schedule", "notes"];

export type ClockFont =
  /** Follows the design language: Segoe UI Display (Windows 11), Inter (Aqua), JetBrains Mono (Rice). */
  | "auto"
  | "segoe-display"
  | "segoe-text"
  | "bahnschrift"
  | "cascadia"
  | "inter"
  | "jetbrains"
  | "sitka"
  | "script";

export const CLOCK_FONT_IDS: readonly ClockFont[] = ["auto", "segoe-display", "segoe-text", "bahnschrift", "cascadia", "inter", "jetbrains", "sitka", "script"];

export interface ClockSettings {
  /** Preset id the current values came from, or "custom" once edited by hand. */
  preset: string;
  font: ClockFont;
  /** 100..900 (clamped to what the font supports). */
  weight: number;
  /** 75..100: font-stretch, honoured by Bahnschrift only. */
  width: number;
  /** Time size in px, 24..160. */
  size: number;
  /** Letter spacing in hundredths of an em, -8..12. */
  letterSpacing: number;
  seconds: boolean;
  blinkColon: boolean;
  hour12: boolean;
  dateFormat: "long" | "short" | "numeric" | "weekday" | "none";
  datePosition: "below" | "above" | "right";
  align: "left" | "center" | "right";
  valign: "top" | "center" | "bottom";
  color: "text" | "accent" | "custom";
  customColor: string;
  dateColor: "secondary" | "accent" | "text";
  tabular: boolean;
  /** Glass background on/off (off = digits float on the wallpaper). */
  background: boolean;
}

export interface SystemSettings {
  showWifi: boolean;
  showBluetooth: boolean;
  /** Replace network / device names with neutral text. */
  hideNames: boolean;
  /** Text of the first row on a PC without a battery. */
  /**
   * Text at the start of the first row: "default" = «Батарея» on a laptop, «Стационарный ПК» on a PC; "device"
   * = «Ноутбук» or «Стационарный ПК»; the Windows account name; or custom text.
   */
  labelMode: "default" | "device" | "custom" | "user";
  customLabel: string;
  background: boolean;
}

/**
 * «Размер» of a tile: set by hand, or a preset. «small» shows the tile's icon and «medium» its icon and name, a
 * click opening the full widget as a pop-up; «large» is the full widget at its standard size
 * (src-tauri/src/layout.rs View).
 */
export type TileView = "manual" | "small" | "medium" | "large";
export const TILE_VIEWS: readonly TileView[] = ["manual", "small", "medium", "large"];

/** «Свои виджеты»: a picture or animation of the user's own on the desktop (src-tauri/src/custom.rs). */
export interface CustomWidget {
  /** 8 lowercase letters and digits; the tile window is `custom-<id>`. */
  id: string;
  name: string;
  /** The stored copy of the picture in the app's widgets folder. */
  file: string;
  /** «Заполнить»: the picture covers the tile (edges cut); «Вписать»: it fits whole inside. */
  fit: "cover" | "contain";
  background: boolean;
  enabled: boolean;
}
/** More windows than this would weigh on the computer; nobody needs more pictures on one desktop. */
export const CUSTOM_MAX = 20;
export const CUSTOM_NAME_MAX = 40;
const CUSTOM_ID = /^[a-z0-9]{4,16}$/;
const CUSTOM_FILE = /^[0-9a-f]{16}\.(png|jpg|gif|webp|bmp)$/;
/** A stored picture's name (src-tauri/src/custom.rs valid_file). */
export const isWidgetFile = (name: string) => CUSTOM_FILE.test(name);
/** A new widget's id: 8 random lowercase letters and digits. */
export function newCustomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}
export const customLabel = (id: string) => `custom-${id}`;
export const isCustomLabel = (label: string) => label.startsWith("custom-") && CUSTOM_ID.test(label.slice(7));
export const customIdOf = (label: string) => label.slice(7);

/** «Нагрузка»: how the readings are drawn. */
export type PerfMode = "rings" | "bars" | "numbers" | "line";
/** The colour of a reading: the accent, by how loaded it is (green, yellow, red), or one colour per reading. */
export type PerfColor = "accent" | "load" | "metric";
export type PerfThickness = "thin" | "normal" | "thick";
/** From this load a reading turns red; 0 = never. */
export type PerfAlert = 0 | 70 | 80 | 90;
export const PERF_ALERTS: readonly PerfAlert[] = [0, 70, 80, 90];
/** Seconds between readings: any whole number in this range, typed in. */
export const PERF_INTERVAL_MIN = 1;
export const PERF_INTERVAL_MAX = 3600;

export interface PerfSettings {
  mode: PerfMode;
  cpu: boolean;
  gpu: boolean;
  ram: boolean;
  disk: boolean;
  /** Processor and graphics temperatures, where Windows (or a hardware monitor) reports them. */
  temp: boolean;
  background: boolean;
  color: PerfColor;
  thickness: PerfThickness;
  /** The names (ЦП, ГП, ОЗУ, Диск) under or next to the readings. */
  labels: boolean;
  alert: PerfAlert;
  fahrenheit: boolean;
  interval: number;
}

export type BuiltInLauncher = "du" | "moodle" | "learn";

export type LauncherIcon =
  /** `svg`: the icon markup cached when chosen, so the tile never loads the full icon set. */
  | { kind: "fluent"; name: string; svg?: string }
  /** Site icon fetched once and cached as a data: URL; falls back to the first letter while missing. */
  | { kind: "site"; data?: string }
  | { kind: "letter" };

export interface CustomLauncher {
  id: string;
  name: string;
  url: string;
  icon: LauncherIcon;
  /** #RRGGBB tint. */
  color: string;
}

/**
 * What the user changed on a built-in launcher. Missing fields keep the original (src/lib/launchers.ts
 * BUILT_IN); an empty object or no entry is the original launcher. Its colour lives in `builtInColors`.
 */
export interface BuiltInEdit {
  /** Shown in the settings and, instead of the short original caption, under the icon on the tile. */
  name?: string;
  url?: string;
  /** Only an icon the user picked: the real site icon of DU, LMS or Learn is bundled and never stored here. */
  icon?: LauncherIcon;
}

export interface LaunchersSettings {
  builtIn: Record<BuiltInLauncher, boolean>;
  builtInColors: Record<BuiltInLauncher, string>;
  /** Name, address and icon changed by the user, per built-in launcher. */
  builtInEdits: Partial<Record<BuiltInLauncher, BuiltInEdit>>;
  custom: CustomLauncher[];
  showLabels: boolean;
  background: boolean;
}

export type MapScheme = "glass" | "pastel" | "vivid" | "outline" | "tint" | "blueprint";
/** «Толщина номеров»: the weight of the room codes on the plan (src/lib/design.ts MAP_CODE_WEIGHT). */
export type MapCodeWeight = "light" | "regular" | "bold";

export interface MapFavorite {
  /** Full room code as in data-name, e.g. "C1.2.223K". */
  room: string;
  /** #RRGGBB. */
  color: string;
  note?: string;
}

export interface MapSettings {
  scheme: MapScheme;
  /** «Свой цвет»: the colour the whole plan is drawn in shades of (#RRGGBB). */
  color: string;
  /** «Толщина номеров» of the room codes. */
  codeWeight: MapCodeWeight;
  /**
   * «Цвет номеров»: "" for the scheme's own, else #RRGGBB. Marked and found rooms and the next lesson's keep the
   * code colour that reads on their fill.
   */
  codeColor: string;
  /** Glass tile behind the map. */
  background: boolean;
  /** With the glass off: a soft fill under the building outline. Off = only the plan itself, no backdrop at all. */
  silhouette: boolean;
  /** «Непрозрачность» of the map on the desktop while the pointer is not over it, 0..100 (0: not seen at all). */
  opacity: number;
  /** «Проявлять при наведении»: under the pointer the map turns `hoverOpacity` opaque, smoothly. */
  hoverReveal: boolean;
  /** The map's opacity under the pointer, `opacity`..100. */
  hoverOpacity: number;
  defaultFloor: 1 | 2 | 3;
  /** Reopen on the floor that was shown last time instead of defaultFloor. */
  rememberFloor: boolean;
  lastFloor: 1 | 2 | 3;
  switchSide: "left" | "right";
  /** Floor switch always visible, or only while the pointer is over the map. */
  switchMode: "always" | "hover";
  showSearch: boolean;
  showZoom: boolean;
  showLabels: boolean;
  /** Room numbers only once the map is zoomed in (src/map/types.ts LABELS_ZOOM), none on the whole-floor view. */
  labelsWhenZoomed: boolean;
  showIcons: boolean;
  /** Mark the room of the lesson running now or starting within 30 minutes (from settings.schedule.lessons). */
  showNextLesson: boolean;
  favorites: MapFavorite[];
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Lesson {
  id: string;
  /** 1 = Monday … 7 = Sunday. */
  day: Weekday;
  /** "HH:MM" 24 h. */
  start: string;
  end: string;
  title: string;
  teacher: string;
  room: string;
  /** Optional #RRGGBB accent for the lesson; default = theme accent. */
  color?: string;
}

export interface ScheduleSettings {
  lessons: Lesson[];
  showWeekend: boolean;
  /** Days without lessons in the tile's day row. Off: only days that have lessons. */
  showEmptyDays: boolean;
  background: boolean;
  /** Always open on today; otherwise keep the day the user picked. */
  followToday: boolean;
  /** Mask lesson texts on the desktop with password dots (hover + eye reveals). */
  privacy: boolean;
}

export interface Note {
  id: string;
  text: string;
  /** Local wall time "YYYY-MM-DDTHH:MM"; absent = no deadline. */
  deadline?: string;
  done: boolean;
  /** Epoch ms of creation (stable order for notes without a deadline). */
  created: number;
  /** Optional #RRGGBB marker. */
  color?: string;
  /** false = no reminders for this note's deadline (absent = reminders on, see settings.reminders). */
  remind?: boolean;
}

/**
 * Order of the notes on the tile and in the settings: by deadline (nearest first, notes without one after
 * them), newest added first, oldest added first, or «Свой порядок» ("manual": the order of `notes` itself, set
 * by dragging the notes). Done notes always go last.
 */
export type NoteSort = "deadline" | "newest" | "oldest" | "manual";
export const NOTE_SORTS: readonly NoteSort[] = ["deadline", "newest", "oldest", "manual"];

export interface NotesSettings {
  notes: Note[];
  sort: NoteSort;
  /**
   * The stored order was set by hand (a note was dragged). Choosing «Свой порядок» again then brings that order
   * back instead of writing down the order shown at that moment (src/lib/notes.ts setNoteSort).
   */
  arranged: boolean;
  showDone: boolean;
  /** Mask note texts on the desktop with password dots (hover + eye reveals). */
  privacy: boolean;
  background: boolean;
}

/**
 * Windows notifications before lessons and note deadlines, shown by the app itself
 * (src-tauri/src/reminders.rs reads these fields; keep the names in sync).
 */
export interface ReminderSettings {
  /** Remind before every lesson of the schedule. */
  lessons: boolean;
  /** Minutes before a lesson starts, 0..180 (0 = when it starts). */
  lessonBefore: number;
  /** Remind about note deadlines (notes can opt out one by one, Note.remind). */
  deadlines: boolean;
  /** First reminder, minutes before the deadline, 0..20160 (0 = none before the deadline). */
  deadlineFirst: number;
  /** After the first reminder, repeat every N minutes until the deadline, 0..10080 (0 = no repeats). */
  deadlineRepeat: number;
  /** One more reminder at the deadline itself. */
  atDeadline: boolean;
  /** No notifications between quietFrom and quietTo ("HH:MM", may wrap past midnight). */
  quiet: boolean;
  quietFrom: string;
  quietTo: string;
  /** Notification sound. */
  sound: boolean;
}

/** Interface language: the display language of Windows ("auto"), Russian or English. */
export type LanguageSetting = "auto" | "ru" | "en";

/** «Масштаб виджетов»: the zoom of every tile ("auto": smaller on small screens, see src-tauri/src/zoom.rs). */
export type TileScale = "auto" | 0.8 | 0.9 | 1 | 1.1;
export const TILE_SCALES: readonly TileScale[] = ["auto", 0.8, 0.9, 1, 1.1];

export interface Settings {
  version: 2;
  /**
   * The round of changed defaults these settings already have (src-tauri/src/reset.rs `migrate`, applied once at
   * start): new settings are made with the latest one.
   */
  defaults: number;
  /**
   * Read by the native side when the app starts (src-tauri/src/lang.rs); a change restarts the app. A personal
   * choice: never in a config file and never reset.
   */
  language: LanguageSetting;
  /** Applied by the native side (zoom.rs); depends on the screen, so it stays out of config files. */
  tileScale: TileScale;
  theme: ThemeId;
  style: StyleId;
  /** «Тонкая настройка»: parts of the design chosen on their own. */
  look: LookSettings;
  accent: AccentSetting;
  tiles: Record<TileId, boolean>;
  /** «Размер» per tile label (built-in ids and `custom-<id>`); missing = "manual". */
  tileViews: Record<string, TileView>;
  customWidgets: CustomWidget[];
  /** "Закрепить расположение": tiles cannot enter edit mode. */
  lockLayout: boolean;
  /**
   * «Выравнивать по сетке»: widgets sit on the cells of the desktop icons (src-tauri/src/grid.rs); moved, they land
   * in the nearest free cells, and resized by hand, they grow and shrink by whole cells.
   */
  gridSnap: boolean;
  /** The welcome page of the settings window has been seen («Начать»). Not part of any reset. */
  onboarded: boolean;
  clock: ClockSettings;
  system: SystemSettings;
  perf: PerfSettings;
  launchers: LaunchersSettings;
  map: MapSettings;
  schedule: ScheduleSettings;
  notes: NotesSettings;
  reminders: ReminderSettings;
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

/** Smallest sizes of the built-in widgets, CSS px (the same ones edit mode keeps). */
export const TILE_MIN: Record<TileId, { w: number; h: number }> = {
  clock: { w: 160, h: 80 },
  system: { w: 220, h: 144 },
  // Four rings (4 x 48 px and their gaps) or four bars and the padding of every design.
  perf: { w: 260, h: 120 },
  launchers: { w: 120, h: 136 },
  map: { w: 400, h: 220 },
  // The day row and one whole lesson (time, subject, teacher).
  schedule: { w: 200, h: 160 },
  // One note with its countdown and deadline, in every design's padding.
  notes: { w: 200, h: 140 },
};
/** An own widget is a picture: any size down to a small square. */
export const CUSTOM_MIN = { w: 64, h: 64 };

/** The smallest sizes as the native side takes them: [w, h] per label (own widgets fall back to CUSTOM_MIN). */
export function minSizes(): Record<string, [number, number]> {
  return Object.fromEntries(TILE_IDS.map((id) => [id, [TILE_MIN[id].w, TILE_MIN[id].h]]));
}


export const DEFAULT_CLOCK: ClockSettings = {
  preset: "classic",
  font: "auto",
  weight: 300,
  width: 100,
  size: 56,
  letterSpacing: -2,
  seconds: false,
  blinkColon: false,
  hour12: false,
  dateFormat: "long",
  datePosition: "below",
  align: "left",
  valign: "top",
  color: "text",
  customColor: "#FFFFFF",
  dateColor: "secondary",
  tabular: true,
  background: true,
};

export const DEFAULT_SYSTEM: SystemSettings = {
  showWifi: true,
  showBluetooth: true,
  hideNames: false,
  labelMode: "default",
  customLabel: "",
  background: true,
};

export const DEFAULT_PERF: PerfSettings = {
  mode: "rings",
  cpu: true,
  gpu: true,
  ram: true,
  disk: true,
  temp: true,
  background: true,
  color: "accent",
  thickness: "normal",
  labels: true,
  alert: 90,
  fahrenheit: false,
  interval: 2,
};

export const DEFAULT_LOOK: LookSettings = {
  font: "auto",
  numbers: "auto",
  shape: "auto",
  corners: "auto",
  density: "auto",
  border: "auto",
  material: "auto",
};

export const DEFAULT_LAUNCHERS: LaunchersSettings = {
  builtIn: { du: true, moodle: true, learn: true },
  builtInColors: { du: "#60CDFF", moodle: "#9BE3A6", learn: "#FFB6A8" },
  builtInEdits: {},
  custom: [],
  showLabels: true,
  background: true,
};

export const DEFAULT_MAP: MapSettings = {
  scheme: "glass",
  color: "#3B82F6",
  codeWeight: "regular",
  codeColor: "",
  background: true,
  silhouette: true,
  opacity: 100,
  hoverReveal: true,
  hoverOpacity: 100,
  defaultFloor: 1,
  rememberFloor: true,
  lastFloor: 1,
  switchSide: "right",
  switchMode: "always",
  showSearch: true,
  showZoom: true,
  showLabels: true,
  labelsWhenZoomed: false,
  showIcons: true,
  showNextLesson: true,
  favorites: [],
};

export const DEFAULT_SCHEDULE: ScheduleSettings = {
  lessons: [],
  showWeekend: false,
  showEmptyDays: true,
  background: true,
  followToday: true,
  privacy: false,
};

export const DEFAULT_NOTES: NotesSettings = {
  notes: [],
  sort: "deadline",
  arranged: false,
  showDone: false,
  privacy: false,
  background: true,
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  lessons: true,
  lessonBefore: 10,
  deadlines: true,
  deadlineFirst: 1440,
  deadlineRepeat: 0,
  atDeadline: true,
  quiet: false,
  quietFrom: "23:00",
  quietTo: "08:00",
  sound: true,
};

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  defaults: 2,
  language: "auto",
  tileScale: "auto",
  theme: "system",
  style: "fluent",
  look: DEFAULT_LOOK,
  accent: { mode: "preset", preset: "graphite", custom: "#60CDFF" },
  tiles: { clock: true, system: true, perf: true, launchers: true, map: true, schedule: true, notes: true },
  tileViews: {},
  customWidgets: [],
  lockLayout: false,
  gridSnap: false,
  onboarded: false,
  clock: DEFAULT_CLOCK,
  system: DEFAULT_SYSTEM,
  perf: DEFAULT_PERF,
  launchers: DEFAULT_LAUNCHERS,
  map: DEFAULT_MAP,
  schedule: DEFAULT_SCHEDULE,
  notes: DEFAULT_NOTES,
  reminders: DEFAULT_REMINDERS,
};

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

const FILE = "settings.json";
const KEY = "settings";

type Listener = (s: Settings) => void;

/** v1 launcher tints (index → colour) for migration. */
const V1_TINTS = ["#60CDFF", "#9BE3A6", "#FFB6A8", "#E3B1FF", "#FFD66B", "#A9C3FF"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : d);

/**
 * Caps on lists and texts: far above any real use, and they keep a settings file from someone else (or a damaged
 * one) from bloating the app: every window holds the settings.
 */
const LIMIT = {
  launchers: 200,
  lessons: 500,
  notes: 1000,
  favorites: 1000,
  /** Ids are short (UUIDs and the like). */
  id: 64,
  /** Lesson fields, room notes. */
  text: 200,
  room: 32,
  url: 2048,
  /** A cached site icon (512 KB at most when fetched, favicon.rs) as a data: URL. */
  iconData: 800_000,
} as const;
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= LIMIT.id;

/** A stored launcher icon, or null when `raw` is not one. */
function migrateIcon(raw: unknown): LauncherIcon | null {
  if (!isObj(raw)) return null;
  const k = raw.kind;
  if (k === "fluent" && typeof raw.name === "string" && raw.name && raw.name.length <= LIMIT.id) {
    const cached = raw.svg;
    const svg = typeof cached === "string" && cached.startsWith("<svg") && cached.length < 20000 ? cached : undefined;
    return svg ? { kind: "fluent", name: raw.name, svg } : { kind: "fluent", name: raw.name };
  }
  if (k === "site") {
    const data = raw.data;
    const ok = typeof data === "string" && data.startsWith("data:image/") && data.length <= LIMIT.iconData;
    return { kind: "site", data: ok ? data : undefined };
  }
  if (k === "letter") return { kind: "letter" };
  return null;
}

/**
 * A launcher address as stored: http(s) only, so a launcher from someone else's settings file can never start a
 * program (file:, ms-settings:, ...). Spaces inside become %20: versions up to 1.0 accepted addresses like
 * «https://site/search?q=a b», and such a launcher must survive the update. Null when it is no web address.
 */
function webUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // The scheme in lower case, so every check of the address and the browser read it the same way.
  const url = v.trim().replace(/\s+/g, "%20").replace(/^https?:/i, (m) => m.toLowerCase());
  if (url.length > LIMIT.url || !/^https?:\/\/\S+$/.test(url)) return null;
  try {
    return new URL(url).hostname ? url : null;
  } catch {
    return null;
  }
}

function migrateLauncher(raw: unknown): CustomLauncher | null {
  const url = isObj(raw) ? webUrl(raw.url) : null;
  if (!isObj(raw) || !okId(raw.id) || url === null) return null;
  let icon: LauncherIcon = migrateIcon(raw.icon) ?? { kind: "site" };
  if (typeof raw.icon === "string" && raw.icon) {
    icon = { kind: "fluent", name: raw.icon }; // v1
  }
  let color = hex(raw.color, "");
  if (!color) color = typeof raw.tint === "number" ? (V1_TINTS[raw.tint] ?? V1_TINTS[0]) : V1_TINTS[0];
  return { id: raw.id, name: str(raw.name, "").slice(0, 40), url, icon, color };
}

function migrateLesson(raw: unknown): Lesson | null {
  if (!isObj(raw) || !okId(raw.id)) return null;
  const day = num(raw.day, 1, 1, 7) as Weekday;
  const time = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);
  return {
    id: raw.id,
    day,
    start: time(raw.start, "08:00"),
    end: time(raw.end, "09:20"),
    title: str(raw.title, "").slice(0, LIMIT.text),
    teacher: str(raw.teacher, "").slice(0, LIMIT.text),
    room: str(raw.room, "").slice(0, LIMIT.text),
    color: hex(raw.color, "") || undefined,
  };
}

/** Changes of one built-in launcher; null when nothing valid is left. */
function migrateBuiltInEdit(raw: unknown): BuiltInEdit | null {
  if (!isObj(raw)) return null;
  const edit: BuiltInEdit = {};
  if (typeof raw.name === "string" && raw.name.trim()) edit.name = raw.name.trim().slice(0, 40);
  const url = webUrl(raw.url);
  if (url !== null) edit.url = url;
  const icon = migrateIcon(raw.icon);
  if (icon) edit.icon = icon;
  return Object.keys(edit).length > 0 ? edit : null;
}

const DEADLINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function migrateNote(raw: unknown): Note | null {
  if (!isObj(raw) || !okId(raw.id)) return null;
  const note: Note = {
    id: raw.id,
    text: str(raw.text, "").slice(0, 2000),
    done: bool(raw.done, false),
    created: num(raw.created, 0, 0, Number.MAX_SAFE_INTEGER),
  };
  if (typeof raw.deadline === "string" && DEADLINE.test(raw.deadline)) note.deadline = raw.deadline;
  const color = hex(raw.color, "");
  if (color) note.color = color;
  if (raw.remind === false) note.remind = false;
  return note;
}

/** Accepts v1 or v2 JSON (or garbage) and returns a complete, validated v2 object. */
export function normalize(saved: unknown): Settings {
  const s = isObj(saved) ? saved : {};
  const d = DEFAULT_SETTINGS;
  // Nothing saved yet (the first start after installing) is not an old file: it gets the defaults.
  const v1 = isObj(saved) && saved.version !== 2;

  // theme
  const theme = oneOf(s.theme, THEME_IDS, d.theme);
  const style = oneOf(s.style, STYLE_IDS, d.style);
  const lookRaw = isObj(s.look) ? s.look : {};
  const look = { ...d.look };
  for (const part of LOOK_PARTS) {
    const v = lookRaw[part];
    if (v === "auto" || (LOOK_CHOICES[part] as readonly unknown[]).includes(v)) (look as Record<string, unknown>)[part] = v;
  }
  const accentRaw = isObj(s.accent) ? s.accent : {};
  const accent: AccentSetting = {
    mode: v1 ? (s.accentFromWindows === false ? "preset" : "windows") : oneOf(accentRaw.mode, ["windows", "preset", "custom"] as const, d.accent.mode),
    preset: str(accentRaw.preset, d.accent.preset).slice(0, 40),
    custom: hex(accentRaw.custom, d.accent.custom),
  };

  // tiles
  const tilesRaw = isObj(s.tiles) ? s.tiles : {};
  const tiles = { ...d.tiles } as Record<TileId, boolean>;
  for (const id of TILE_IDS) tiles[id] = bool(tilesRaw[id], d.tiles[id]);

  // Custom widgets: well-formed entries only, ids unique, at most CUSTOM_MAX.
  const customWidgets: CustomWidget[] = [];
  for (const w of Array.isArray(s.customWidgets) ? s.customWidgets : []) {
    if (customWidgets.length >= CUSTOM_MAX || !isObj(w)) continue;
    const id = typeof w.id === "string" && CUSTOM_ID.test(w.id) ? w.id : null;
    const file = typeof w.file === "string" && CUSTOM_FILE.test(w.file) ? w.file : null;
    if (!id || !file || customWidgets.some((c) => c.id === id)) continue;
    customWidgets.push({
      id,
      name: str(w.name, "").slice(0, CUSTOM_NAME_MAX),
      file,
      fit: oneOf(w.fit, ["cover", "contain"] as const, "cover"),
      background: bool(w.background, false),
      enabled: bool(w.enabled, true),
    });
  }
  // Views of the tiles that exist (built-in, and the custom widgets above).
  const viewsRaw = isObj(s.tileViews) ? s.tileViews : {};
  const tileViews: Record<string, TileView> = {};
  for (const label of [...TILE_IDS, ...customWidgets.map((c) => customLabel(c.id))]) {
    const v = viewsRaw[label];
    if (v !== "manual" && TILE_VIEWS.includes(v as TileView)) tileViews[label] = v as TileView;
  }

  // clock
  const c = isObj(s.clock) ? s.clock : {};
  const clock: ClockSettings = {
    preset: str(c.preset, d.clock.preset),
    // v2.0 stored the untouched «Классика» look with Segoe UI Display; «Классика» now follows the design style.
    // A font chosen by hand (any other preset or a custom look) is kept.
    font: c.preset === "classic" && c.font === "segoe-display" ? "auto" : oneOf(c.font, CLOCK_FONT_IDS, d.clock.font),
    weight: num(c.weight, d.clock.weight, 100, 900),
    width: num(c.width, d.clock.width, 75, 100),
    size: num(c.size, d.clock.size, 24, 160),
    letterSpacing: num(c.letterSpacing, d.clock.letterSpacing, -8, 12),
    seconds: bool(c.seconds, d.clock.seconds),
    blinkColon: bool(c.blinkColon, d.clock.blinkColon),
    hour12: bool(c.hour12, d.clock.hour12),
    dateFormat: oneOf(c.dateFormat, ["long", "short", "numeric", "weekday", "none"] as const, d.clock.dateFormat),
    datePosition: oneOf(c.datePosition, ["below", "above", "right"] as const, d.clock.datePosition),
    align: oneOf(c.align, ["left", "center", "right"] as const, d.clock.align),
    valign: oneOf(c.valign, ["top", "center", "bottom"] as const, d.clock.valign),
    color: oneOf(c.color, ["text", "accent", "custom"] as const, d.clock.color),
    customColor: hex(c.customColor, d.clock.customColor),
    dateColor: oneOf(c.dateColor, ["secondary", "accent", "text"] as const, d.clock.dateColor),
    tabular: bool(c.tabular, d.clock.tabular),
    background: bool(c.background, d.clock.background),
  };

  // system
  const sy = isObj(s.system) ? s.system : {};
  const system: SystemSettings = {
    showWifi: bool(sy.showWifi, d.system.showWifi),
    showBluetooth: bool(sy.showBluetooth, d.system.showBluetooth),
    hideNames: bool(sy.hideNames, d.system.hideNames),
    labelMode: oneOf(sy.labelMode, ["default", "device", "custom", "user"] as const, d.system.labelMode),
    customLabel: str(sy.customLabel, d.system.customLabel).slice(0, 40),
    background: bool(sy.background, d.system.background),
  };

  const pf = isObj(s.perf) ? s.perf : {};
  const perf: PerfSettings = {
    mode: oneOf(pf.mode, ["rings", "bars", "numbers", "line"] as const, d.perf.mode),
    cpu: bool(pf.cpu, d.perf.cpu),
    gpu: bool(pf.gpu, d.perf.gpu),
    ram: bool(pf.ram, d.perf.ram),
    disk: bool(pf.disk, d.perf.disk),
    temp: bool(pf.temp, d.perf.temp),
    background: bool(pf.background, d.perf.background),
    color: oneOf(pf.color, ["accent", "load", "metric"] as const, d.perf.color),
    thickness: oneOf(pf.thickness, ["thin", "normal", "thick"] as const, d.perf.thickness),
    labels: bool(pf.labels, d.perf.labels),
    alert: PERF_ALERTS.includes(pf.alert as PerfAlert) ? (pf.alert as PerfAlert) : d.perf.alert,
    fahrenheit: bool(pf.fahrenheit, d.perf.fahrenheit),
    interval: Math.round(num(pf.interval, d.perf.interval, PERF_INTERVAL_MIN, PERF_INTERVAL_MAX)),
  };

  // launchers (v1 kept builtIn/custom at the root)
  const l = isObj(s.launchers) ? s.launchers : {};
  const builtInRaw = isObj(l.builtIn) ? l.builtIn : isObj(s.builtIn) ? s.builtIn : {};
  const colorsRaw = isObj(l.builtInColors) ? l.builtInColors : {};
  const customRaw = Array.isArray(l.custom) ? l.custom : Array.isArray(s.custom) ? s.custom : [];
  const editsRaw = isObj(l.builtInEdits) ? l.builtInEdits : {};
  const builtInEdits: Partial<Record<BuiltInLauncher, BuiltInEdit>> = {};
  for (const key of ["du", "moodle", "learn"] as const) {
    const edit = migrateBuiltInEdit(editsRaw[key]);
    if (edit) builtInEdits[key] = edit;
  }
  const launchers: LaunchersSettings = {
    builtIn: {
      du: bool(builtInRaw.du, true),
      moodle: bool(builtInRaw.moodle, true),
      learn: bool(builtInRaw.learn, true),
    },
    builtInColors: {
      du: hex(colorsRaw.du, d.launchers.builtInColors.du),
      moodle: hex(colorsRaw.moodle, d.launchers.builtInColors.moodle),
      learn: hex(colorsRaw.learn, d.launchers.builtInColors.learn),
    },
    builtInEdits,
    custom: customRaw.slice(0, LIMIT.launchers).map(migrateLauncher).filter((x): x is CustomLauncher => x !== null),
    showLabels: bool(l.showLabels, d.launchers.showLabels),
    background: bool(l.background, d.launchers.background),
  };

  // map
  const m = isObj(s.map) ? s.map : {};
  const favRaw = Array.isArray(m.favorites) ? m.favorites : [];
  const mapOpacity = Math.round(num(m.opacity, d.map.opacity, 0, 100));
  const map: MapSettings = {
    scheme: oneOf(m.scheme, ["glass", "pastel", "vivid", "outline", "tint", "blueprint"] as const, d.map.scheme),
    color: hex(m.color, d.map.color),
    codeWeight: oneOf(m.codeWeight, ["light", "regular", "bold"] as const, d.map.codeWeight),
    codeColor: m.codeColor === "" ? "" : hex(m.codeColor, d.map.codeColor),
    background: bool(m.background, d.map.background),
    silhouette: bool(m.silhouette, d.map.silhouette),
    opacity: mapOpacity,
    hoverReveal: bool(m.hoverReveal, d.map.hoverReveal),
    // Under the pointer the map only ever gets more opaque.
    hoverOpacity: Math.max(mapOpacity, Math.round(num(m.hoverOpacity, d.map.hoverOpacity, 0, 100))),
    defaultFloor: num(m.defaultFloor, d.map.defaultFloor, 1, 3) as 1 | 2 | 3,
    rememberFloor: bool(m.rememberFloor, d.map.rememberFloor),
    lastFloor: num(m.lastFloor, d.map.lastFloor, 1, 3) as 1 | 2 | 3,
    switchSide: oneOf(m.switchSide, ["left", "right"] as const, d.map.switchSide),
    switchMode: oneOf(m.switchMode, ["always", "hover"] as const, d.map.switchMode),
    showSearch: bool(m.showSearch, d.map.showSearch),
    showZoom: bool(m.showZoom, d.map.showZoom),
    showLabels: bool(m.showLabels, d.map.showLabels),
    labelsWhenZoomed: bool(m.labelsWhenZoomed, d.map.labelsWhenZoomed),
    showIcons: bool(m.showIcons, d.map.showIcons),
    showNextLesson: bool(m.showNextLesson, d.map.showNextLesson),
    favorites: favRaw
      .slice(0, LIMIT.favorites)
      .map((f): MapFavorite | null =>
        isObj(f) && typeof f.room === "string" && f.room && f.room.length <= LIMIT.room
          ? {
              room: f.room.toUpperCase(),
              color: hex(f.color, "#60CDFF"),
              note: typeof f.note === "string" ? f.note.slice(0, LIMIT.text) : undefined,
            }
          : null,
      )
      .filter((f): f is MapFavorite => f !== null),
  };

  // schedule
  const sc = isObj(s.schedule) ? s.schedule : {};
  const lessonsRaw = Array.isArray(sc.lessons) ? sc.lessons : [];
  const schedule: ScheduleSettings = {
    lessons: lessonsRaw.slice(0, LIMIT.lessons).map(migrateLesson).filter((x): x is Lesson => x !== null),
    showWeekend: bool(sc.showWeekend, d.schedule.showWeekend),
    showEmptyDays: bool(sc.showEmptyDays, d.schedule.showEmptyDays),
    background: bool(sc.background, d.schedule.background),
    followToday: bool(sc.followToday, d.schedule.followToday),
    privacy: bool(sc.privacy, d.schedule.privacy),
  };

  // notes
  const n = isObj(s.notes) ? s.notes : {};
  const notesRaw = Array.isArray(n.notes) ? n.notes : [];
  const notes: NotesSettings = {
    notes: notesRaw.slice(0, LIMIT.notes).map(migrateNote).filter((x): x is Note => x !== null),
    sort: oneOf(n.sort, NOTE_SORTS, d.notes.sort),
    arranged: bool(n.arranged, d.notes.arranged),
    showDone: bool(n.showDone, d.notes.showDone),
    privacy: bool(n.privacy, d.notes.privacy),
    background: bool(n.background, d.notes.background),
  };

  // reminders
  const r = isObj(s.reminders) ? s.reminders : {};
  const dr = d.reminders;
  const int = (v: unknown, def: number, min: number, max: number) => Math.round(num(v, def, min, max));
  const hhmm = (v: unknown, def: string) => (typeof v === "string" && HHMM.test(v) ? v : def);
  const reminders: ReminderSettings = {
    lessons: bool(r.lessons, dr.lessons),
    lessonBefore: int(r.lessonBefore, dr.lessonBefore, 0, 180),
    deadlines: bool(r.deadlines, dr.deadlines),
    deadlineFirst: int(r.deadlineFirst, dr.deadlineFirst, 0, 20160),
    deadlineRepeat: int(r.deadlineRepeat, dr.deadlineRepeat, 0, 10080),
    atDeadline: bool(r.atDeadline, dr.atDeadline),
    quiet: bool(r.quiet, dr.quiet),
    quietFrom: hhmm(r.quietFrom, dr.quietFrom),
    quietTo: hhmm(r.quietTo, dr.quietTo),
    sound: bool(r.sound, dr.sound),
  };

  return {
    version: 2,
    defaults: Math.round(num(s.defaults, isObj(saved) ? 0 : d.defaults, 0, 1000)),
    language: oneOf(s.language, ["auto", "ru", "en"] as const, d.language),
    tileScale: TILE_SCALES.includes(s.tileScale as TileScale) ? (s.tileScale as TileScale) : d.tileScale,
    theme,
    style,
    look,
    accent,
    tiles,
    tileViews,
    customWidgets,
    lockLayout: bool(s.lockLayout, d.lockLayout),
    gridSnap: bool(s.gridSnap, d.gridSnap),
    onboarded: bool(s.onboarded, d.onboarded),
    clock,
    system,
    perf,
    launchers,
    map,
    schedule,
    notes,
    reminders,
  };
}

export type SettingsPatch = Partial<Omit<Settings, "version">>;

/** Pages that can be reset on their own. */
export type ResetSection = "appearance" | "clock" | "system" | "perf" | "launchers" | "map" | "schedule" | "notes" | "reminders";
/** The sections «Сбросить оформление» resets: the look of the app and the tiles (reminders are not looks). */
export const RESET_SECTIONS: readonly ResetSection[] = ["appearance", "clock", "system", "perf", "launchers", "map", "schedule", "notes"];

/**
 * Defaults for the customization of one section. User data stays: lessons, notes, custom launchers and
 * which built-ins are on, marked rooms, the custom label text of the system tile. Privacy choices stay too
 * (hidden schedule and note texts, hidden network and device names): a reset of the look must never put
 * private text on the desktop. `onboarded` belongs to no section, so no reset brings the welcome page back.
 */
function resetPatch(s: Settings, section: ResetSection): SettingsPatch {
  const d = DEFAULT_SETTINGS;
  switch (section) {
    case "appearance":
      return { theme: d.theme, style: d.style, look: d.look, accent: d.accent, tileScale: d.tileScale };
    case "clock":
      return { clock: d.clock };
    case "system":
      return { system: { ...d.system, customLabel: s.system.customLabel, hideNames: s.system.hideNames } };
    case "perf":
      return { perf: d.perf };
    case "launchers":
      return {
        launchers: { ...d.launchers, builtIn: s.launchers.builtIn, builtInEdits: s.launchers.builtInEdits, custom: s.launchers.custom },
      };
    case "map":
      return { map: { ...d.map, favorites: s.map.favorites, lastFloor: s.map.lastFloor } };
    case "schedule":
      return { schedule: { ...d.schedule, lessons: s.schedule.lessons, privacy: s.schedule.privacy } };
    case "notes":
      return { notes: { ...d.notes, notes: s.notes.notes, arranged: s.notes.arranged, privacy: s.notes.privacy } };
    case "reminders":
      return { reminders: d.reminders };
  }
}

/**
 * `next` with every part that equals the same part of `prev` replaced by the `prev` object itself (structural
 * sharing). A change to the clock then leaves `s.map`, `s.notes.notes` and every unchanged note or lesson the
 * same objects, so memoized parts of the tiles skip their work, and a value that did not change at all (the
 * store echoing this window's own write) comes back as `prev` and is not announced again.
 */
function share<T>(prev: T, next: T): T {
  if (Object.is(prev, next)) return prev;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out = next.map((v, i) => {
      const kept = share(prev[i], v);
      if (kept !== prev[i]) same = false;
      return kept;
    });
    return (same ? prev : out) as T;
  }
  if (isObj(prev) && isObj(next)) {
    const keys = Object.keys(next);
    let same = keys.length === Object.keys(prev).length;
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const kept = share(prev[k], next[k]);
      out[k] = kept;
      if (kept !== prev[k] || !(k in prev)) same = false;
    }
    return (same ? prev : out) as T;
  }
  return next;
}

class SettingsStore {
  private store: Promise<Store>;
  private current: Settings = DEFAULT_SETTINGS;
  private loaded = false;
  private listeners = new Set<Listener>();
  private readyResolvers: Array<() => void> = [];

  constructor() {
    this.store = load(FILE, { autoSave: false }).then(async (store) => {
      const saved = await store.get<unknown>(KEY);
      this.current = normalize(saved);
      this.loaded = true;
      // Persist the migrated shape once so other windows see v2 immediately.
      if (!isObj(saved) || saved.version !== 2) {
        await store.set(KEY, this.current);
        await store.save();
      }
      this.emit();
      this.readyResolvers.splice(0).forEach((r) => r());
      await store.onKeyChange<unknown>(KEY, (value) => {
        const next = share(this.current, normalize(value));
        if (next === this.current) return;
        this.current = next;
        this.emit();
      });
      return store;
    });
  }

  get(): Settings {
    return this.current;
  }

  /** False until the first value from disk arrived (before that `get()` returns defaults). */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Resolves once the store has been read from disk. */
  ready(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  /** Shallow patch at the top level; use the section helpers for nested updates. */
  async update(patch: SettingsPatch | ((s: Settings) => SettingsPatch)): Promise<void> {
    const store = await this.store;
    const p = typeof patch === "function" ? patch(this.current) : patch;
    const next = share(this.current, normalize({ ...this.current, ...p, version: 2 }));
    // Nothing changed (a reset of defaults, the same value again): no render, no write.
    if (next === this.current) return;
    const zoomChanged = next.tileScale !== this.current.tileScale;
    const customChanged = next.customWidgets !== this.current.customWidgets;
    const viewsChanged = next.tileViews !== this.current.tileViews;
    this.current = next;
    this.emit();
    await store.set(KEY, next);
    await store.save();
    // The native side reads the new values from the saved settings: it zooms the tiles, makes, switches and
    // closes the windows of the own widgets, and gives every tile the size of its view.
    if (zoomChanged) await invoke("apply_tile_scale").catch(() => undefined);
    if (customChanged) await invoke("sync_custom_widgets").catch(() => undefined);
    if (viewsChanged) await invoke("apply_tile_views").catch(() => undefined);
    // «Выравнивать по сетке»: widgets that changed size or came new go back to the cells of the desktop icons, once
    // the native side has given them their new size (a view and a new window are applied on its main thread).
    if (next.gridSnap && (zoomChanged || customChanged || viewsChanged)) {
      if (customChanged || viewsChanged) await new Promise((r) => window.setTimeout(r, 300));
      await invoke("align_tiles", { mins: minSizes() }).catch(() => undefined);
    }
  }

  /** «Размер» of one widget; "manual" is kept as no entry. */
  setTileView(label: string, view: TileView) {
    return this.update((s) => {
      const tileViews = { ...s.tileViews };
      if (view === "manual") delete tileViews[label];
      else tileViews[label] = view;
      return { tileViews };
    });
  }

  updateClock(p: Partial<ClockSettings>) {
    return this.update((s) => ({ clock: { ...s.clock, ...p } }));
  }
  updateSystem(p: Partial<SystemSettings>) {
    return this.update((s) => ({ system: { ...s.system, ...p } }));
  }
  updatePerf(p: Partial<PerfSettings>) {
    return this.update((s) => ({ perf: { ...s.perf, ...p } }));
  }
  updateLaunchers(p: Partial<LaunchersSettings>) {
    return this.update((s) => ({ launchers: { ...s.launchers, ...p } }));
  }
  updateMap(p: Partial<MapSettings>) {
    return this.update((s) => ({ map: { ...s.map, ...p } }));
  }
  updateSchedule(p: Partial<ScheduleSettings>) {
    return this.update((s) => ({ schedule: { ...s.schedule, ...p } }));
  }
  updateNotes(p: Partial<NotesSettings>) {
    return this.update((s) => ({ notes: { ...s.notes, ...p } }));
  }
  updateReminders(p: Partial<ReminderSettings>) {
    return this.update((s) => ({ reminders: { ...s.reminders, ...p } }));
  }

  /** «Сбросить настройки раздела»: the look of one page back to defaults, user data kept. */
  resetSection(section: ResetSection) {
    return this.update((s) => resetPatch(s, section));
  }

  /** «Сбросить оформление»: style, palette, accent and the look of every tile; user data kept. */
  resetCustomization() {
    return this.update((s) => {
      let patch: SettingsPatch = {};
      for (const section of RESET_SECTIONS) patch = { ...patch, ...resetPatch({ ...s, ...patch } as Settings, section) };
      return patch;
    });
  }

  private emit() {
    for (const fn of this.listeners) fn(this.current);
  }
}

export const settings = new SettingsStore();
