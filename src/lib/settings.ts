// Shared settings store (settings.json via tauri-plugin-store). Every window reads the same file;
// the plugin broadcasts changes, so subscribers in all windows stay in sync.
//
// Schema v2. Older files (v1: theme/accentFromWindows/tiles/builtIn/custom) are migrated on load.
import { load, type Store } from "@tauri-apps/plugin-store";

// ---------------------------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------------------------

/** Base palette. "system" follows the Windows app theme (light → light, dark → dark). */
export type ThemeId = "system" | "light" | "gray" | "dark" | "darker" | "black";
export const THEME_IDS: readonly ThemeId[] = ["system", "light", "gray", "dark", "darker", "black"];

/** Design language: Windows 11 (fluent), macOS-like (aqua), Linux-rice (rice). */
export type StyleId = "fluent" | "aqua" | "rice";
export const STYLE_IDS: readonly StyleId[] = ["fluent", "aqua", "rice"];

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

export type TileId = "clock" | "system" | "launchers" | "map" | "schedule" | "notes";
export const TILE_IDS: readonly TileId[] = ["clock", "system", "launchers", "map", "schedule", "notes"];

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
  labelMode: "default" | "custom" | "user";
  customLabel: string;
  background: boolean;
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

export interface LaunchersSettings {
  builtIn: Record<BuiltInLauncher, boolean>;
  builtInColors: Record<BuiltInLauncher, string>;
  custom: CustomLauncher[];
  showLabels: boolean;
  background: boolean;
}

export type MapScheme = "glass" | "pastel" | "vivid" | "outline";

export interface MapFavorite {
  /** Full room code as in data-name, e.g. "C1.2.223K". */
  room: string;
  /** #RRGGBB. */
  color: string;
  note?: string;
}

export interface MapSettings {
  scheme: MapScheme;
  /** Glass tile behind the map. */
  background: boolean;
  /** With the glass off: a soft fill under the building outline. Off = only the plan itself, no backdrop at all. */
  silhouette: boolean;
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
  showIcons: boolean;
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
}

export interface NotesSettings {
  notes: Note[];
  showDone: boolean;
  /** Mask note texts on the desktop with password dots (hover + eye reveals). */
  privacy: boolean;
  background: boolean;
}

export interface Settings {
  version: 2;
  theme: ThemeId;
  style: StyleId;
  accent: AccentSetting;
  tiles: Record<TileId, boolean>;
  /** "Закрепить расположение": tiles cannot enter edit mode. */
  lockLayout: boolean;
  clock: ClockSettings;
  system: SystemSettings;
  launchers: LaunchersSettings;
  map: MapSettings;
  schedule: ScheduleSettings;
  notes: NotesSettings;
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

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

export const DEFAULT_LAUNCHERS: LaunchersSettings = {
  builtIn: { du: true, moodle: true, learn: true },
  builtInColors: { du: "#60CDFF", moodle: "#9BE3A6", learn: "#FFB6A8" },
  custom: [],
  showLabels: true,
  background: true,
};

export const DEFAULT_MAP: MapSettings = {
  scheme: "pastel",
  background: true,
  silhouette: true,
  defaultFloor: 1,
  rememberFloor: true,
  lastFloor: 1,
  switchSide: "right",
  switchMode: "always",
  showSearch: true,
  showZoom: true,
  showLabels: true,
  showIcons: true,
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
  showDone: false,
  privacy: false,
  background: true,
};

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  theme: "system",
  style: "fluent",
  accent: { mode: "windows", preset: "fluent-blue", custom: "#60CDFF" },
  tiles: { clock: true, system: true, launchers: true, map: true, schedule: true, notes: true },
  lockLayout: false,
  clock: DEFAULT_CLOCK,
  system: DEFAULT_SYSTEM,
  launchers: DEFAULT_LAUNCHERS,
  map: DEFAULT_MAP,
  schedule: DEFAULT_SCHEDULE,
  notes: DEFAULT_NOTES,
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

function migrateLauncher(raw: unknown): CustomLauncher | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.url !== "string") return null;
  let icon: LauncherIcon = { kind: "site" };
  if (isObj(raw.icon)) {
    const k = raw.icon.kind;
    if (k === "fluent" && typeof raw.icon.name === "string") {
      const cached = raw.icon.svg;
      const svg = typeof cached === "string" && cached.startsWith("<svg") && cached.length < 20000 ? cached : undefined;
      icon = svg ? { kind: "fluent", name: raw.icon.name, svg } : { kind: "fluent", name: raw.icon.name };
    }
    else if (k === "site") icon = { kind: "site", data: typeof raw.icon.data === "string" ? raw.icon.data : undefined };
    else if (k === "letter") icon = { kind: "letter" };
  } else if (typeof raw.icon === "string" && raw.icon) {
    icon = { kind: "fluent", name: raw.icon }; // v1
  }
  let color = hex(raw.color, "");
  if (!color) color = typeof raw.tint === "number" ? (V1_TINTS[raw.tint] ?? V1_TINTS[0]) : V1_TINTS[0];
  return { id: raw.id, name: str(raw.name, ""), url: raw.url, icon, color };
}

function migrateLesson(raw: unknown): Lesson | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  const day = num(raw.day, 1, 1, 7) as Weekday;
  const time = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);
  return {
    id: raw.id,
    day,
    start: time(raw.start, "08:00"),
    end: time(raw.end, "09:20"),
    title: str(raw.title, ""),
    teacher: str(raw.teacher, ""),
    room: str(raw.room, ""),
    color: hex(raw.color, "") || undefined,
  };
}

const DEADLINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function migrateNote(raw: unknown): Note | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  const note: Note = {
    id: raw.id,
    text: str(raw.text, "").slice(0, 2000),
    done: bool(raw.done, false),
    created: num(raw.created, 0, 0, Number.MAX_SAFE_INTEGER),
  };
  if (typeof raw.deadline === "string" && DEADLINE.test(raw.deadline)) note.deadline = raw.deadline;
  const color = hex(raw.color, "");
  if (color) note.color = color;
  return note;
}

/** Accepts v1 or v2 JSON (or garbage) and returns a complete, validated v2 object. */
export function normalize(saved: unknown): Settings {
  const s = isObj(saved) ? saved : {};
  const d = DEFAULT_SETTINGS;
  const v1 = s.version !== 2;

  // theme
  const theme = oneOf(s.theme, THEME_IDS, d.theme);
  const style = oneOf(s.style, STYLE_IDS, d.style);
  const accentRaw = isObj(s.accent) ? s.accent : {};
  const accent: AccentSetting = {
    mode: v1 ? (s.accentFromWindows === false ? "preset" : "windows") : oneOf(accentRaw.mode, ["windows", "preset", "custom"] as const, d.accent.mode),
    preset: str(accentRaw.preset, d.accent.preset),
    custom: hex(accentRaw.custom, d.accent.custom),
  };

  // tiles
  const tilesRaw = isObj(s.tiles) ? s.tiles : {};
  const tiles = { ...d.tiles } as Record<TileId, boolean>;
  for (const id of TILE_IDS) tiles[id] = bool(tilesRaw[id], d.tiles[id]);

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
    labelMode: oneOf(sy.labelMode, ["default", "custom", "user"] as const, d.system.labelMode),
    customLabel: str(sy.customLabel, d.system.customLabel).slice(0, 40),
    background: bool(sy.background, d.system.background),
  };

  // launchers (v1 kept builtIn/custom at the root)
  const l = isObj(s.launchers) ? s.launchers : {};
  const builtInRaw = isObj(l.builtIn) ? l.builtIn : isObj(s.builtIn) ? s.builtIn : {};
  const colorsRaw = isObj(l.builtInColors) ? l.builtInColors : {};
  const customRaw = Array.isArray(l.custom) ? l.custom : Array.isArray(s.custom) ? s.custom : [];
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
    custom: customRaw.map(migrateLauncher).filter((x): x is CustomLauncher => x !== null),
    showLabels: bool(l.showLabels, d.launchers.showLabels),
    background: bool(l.background, d.launchers.background),
  };

  // map
  const m = isObj(s.map) ? s.map : {};
  const favRaw = Array.isArray(m.favorites) ? m.favorites : [];
  const map: MapSettings = {
    scheme: oneOf(m.scheme, ["glass", "pastel", "vivid", "outline"] as const, d.map.scheme),
    background: bool(m.background, d.map.background),
    silhouette: bool(m.silhouette, d.map.silhouette),
    defaultFloor: num(m.defaultFloor, d.map.defaultFloor, 1, 3) as 1 | 2 | 3,
    rememberFloor: bool(m.rememberFloor, d.map.rememberFloor),
    lastFloor: num(m.lastFloor, d.map.lastFloor, 1, 3) as 1 | 2 | 3,
    switchSide: oneOf(m.switchSide, ["left", "right"] as const, d.map.switchSide),
    switchMode: oneOf(m.switchMode, ["always", "hover"] as const, d.map.switchMode),
    showSearch: bool(m.showSearch, d.map.showSearch),
    showZoom: bool(m.showZoom, d.map.showZoom),
    showLabels: bool(m.showLabels, d.map.showLabels),
    showIcons: bool(m.showIcons, d.map.showIcons),
    favorites: favRaw
      .map((f): MapFavorite | null =>
        isObj(f) && typeof f.room === "string" && f.room
          ? { room: f.room.toUpperCase(), color: hex(f.color, "#60CDFF"), note: typeof f.note === "string" ? f.note : undefined }
          : null,
      )
      .filter((f): f is MapFavorite => f !== null),
  };

  // schedule
  const sc = isObj(s.schedule) ? s.schedule : {};
  const lessonsRaw = Array.isArray(sc.lessons) ? sc.lessons : [];
  const schedule: ScheduleSettings = {
    lessons: lessonsRaw.map(migrateLesson).filter((x): x is Lesson => x !== null),
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
    notes: notesRaw.map(migrateNote).filter((x): x is Note => x !== null),
    showDone: bool(n.showDone, d.notes.showDone),
    privacy: bool(n.privacy, d.notes.privacy),
    background: bool(n.background, d.notes.background),
  };

  return {
    version: 2,
    theme,
    style,
    accent,
    tiles,
    lockLayout: bool(s.lockLayout, d.lockLayout),
    clock,
    system,
    launchers,
    map,
    schedule,
    notes,
  };
}

export type SettingsPatch = Partial<Omit<Settings, "version">>;

/** Pages that can be reset on their own. */
export type ResetSection = "appearance" | "clock" | "system" | "launchers" | "map" | "schedule" | "notes";
export const RESET_SECTIONS: readonly ResetSection[] = ["appearance", "clock", "system", "launchers", "map", "schedule", "notes"];

/**
 * Defaults for the customization of one section. User data stays: lessons, notes, custom launchers and
 * which built-ins are on, marked rooms, the custom label text of the system tile. Privacy choices stay too
 * (hidden schedule and note texts, hidden network and device names): a reset of the look must never put
 * private text on the desktop.
 */
function resetPatch(s: Settings, section: ResetSection): SettingsPatch {
  const d = DEFAULT_SETTINGS;
  switch (section) {
    case "appearance":
      return { theme: d.theme, style: d.style, accent: d.accent };
    case "clock":
      return { clock: d.clock };
    case "system":
      return { system: { ...d.system, customLabel: s.system.customLabel, hideNames: s.system.hideNames } };
    case "launchers":
      return { launchers: { ...d.launchers, builtIn: s.launchers.builtIn, custom: s.launchers.custom } };
    case "map":
      return { map: { ...d.map, favorites: s.map.favorites, lastFloor: s.map.lastFloor } };
    case "schedule":
      return { schedule: { ...d.schedule, lessons: s.schedule.lessons, privacy: s.schedule.privacy } };
    case "notes":
      return { notes: { ...d.notes, notes: s.notes.notes, privacy: s.notes.privacy } };
  }
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
        this.current = normalize(value);
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
    const next = normalize({ ...this.current, ...p, version: 2 });
    this.current = next;
    this.emit();
    await store.set(KEY, next);
    await store.save();
  }

  updateClock(p: Partial<ClockSettings>) {
    return this.update((s) => ({ clock: { ...s.clock, ...p } }));
  }
  updateSystem(p: Partial<SystemSettings>) {
    return this.update((s) => ({ system: { ...s.system, ...p } }));
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
