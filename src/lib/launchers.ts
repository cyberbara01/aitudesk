// Launcher model shared by the "Ярлыки" tile and the settings window.
import { invoke } from "@tauri-apps/api/core";
import { ru } from "../i18n/ru";
import { settings, type BuiltInLauncher, type CustomLauncher, type LauncherIcon, type Settings } from "./settings";

export interface LauncherItem {
  /** Built-in key ("du" | "moodle" | "learn") or the custom launcher id. */
  id: string;
  kind: "builtin" | "custom";
  name: string;
  url: string;
  icon: LauncherIcon;
  /** #RRGGBB tint. */
  color: string;
}

export interface BuiltInDef {
  id: BuiltInLauncher;
  name: string;
  url: string;
  icon: string;
}

export const BUILT_IN: readonly BuiltInDef[] = [
  { id: "du", name: ru.launchers.du, url: "https://du.astanait.edu.kz/login", icon: "building_bank" },
  { id: "moodle", name: ru.launchers.moodle, url: "https://lms.astanait.edu.kz/login/index.php", icon: "book_open" },
  { id: "learn", name: ru.launchers.learn, url: "https://learn.astanait.edu.kz/login?next=%2F", icon: "hat_graduation" },
];

export const isBuiltInKey = (id: string): id is BuiltInLauncher => BUILT_IN.some((b) => b.id === id);

export function builtInDef(id: BuiltInLauncher): BuiltInDef {
  return BUILT_IN.find((b) => b.id === id) ?? BUILT_IN[0];
}

/** Enabled built-ins first (fixed order), then custom launchers in stored order. */
export function visibleLaunchers(s: Settings): LauncherItem[] {
  const out: LauncherItem[] = [];
  for (const b of BUILT_IN) {
    if (s.launchers.builtIn[b.id]) {
      out.push({ id: b.id, kind: "builtin", name: b.name, url: b.url, icon: { kind: "fluent", name: b.icon }, color: s.launchers.builtInColors[b.id] });
    }
  }
  for (const c of s.launchers.custom) out.push({ id: c.id, kind: "custom", name: c.name, url: c.url, icon: c.icon, color: c.color });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------------------------

export type IconMode = LauncherIcon["kind"];
export const ICON_MODES: readonly IconMode[] = ["site", "fluent", "letter"];

/** Icon preselected when a launcher switches to the Fluent mode. */
export const DEFAULT_FLUENT_ICON = "globe";

/**
 * Popular icons shown first in the picker (two rows before "Смотреть все"). All of them are in the
 * eager icon set, so the strip renders without waiting for lazy chunks.
 */
export const LAUNCHER_ICONS: readonly string[] = [
  "globe", "link", "book_open", "building_bank", "hat_graduation", "library", "notebook", "document", "folder", "mail",
  "chat", "calendar_ltr", "clock", "code", "video", "music_note_2", "image", "camera", "games", "map",
  "news", "people", "person", "star", "bookmark", "home", "briefcase", "lightbulb", "rocket", "table",
];

/** True while a site-icon launcher has no cached image yet (the tile shows the first letter). */
export const siteIconMissing = (icon: LauncherIcon): boolean => icon.kind === "site" && !icon.data;

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

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** A launcher URL must start with http:// or https://. */
export const isValidUrl = (url: string): boolean => /^https?:\/\/\S+\.\S+/i.test(url.trim());

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

/** Open the settings window on the launchers tab; `edit` = custom id (editor) or built-in key (its colour). */
export function openLaunchersSettings(edit?: string): Promise<void> {
  const args: { tab: string; edit?: string } = { tab: "launchers" };
  if (edit) args.edit = edit;
  return invoke("open_settings", args).then(
    () => undefined,
    () => undefined,
  );
}

export function removeCustom(id: string): Promise<void> {
  return settings.updateLaunchers({ custom: settings.get().launchers.custom.filter((c) => c.id !== id) });
}

export function setBuiltIn(key: BuiltInLauncher, enabled: boolean): Promise<void> {
  return settings.updateLaunchers({ builtIn: { ...settings.get().launchers.builtIn, [key]: enabled } });
}

export function setBuiltInColor(key: BuiltInLauncher, color: string): Promise<void> {
  return settings.updateLaunchers({ builtInColors: { ...settings.get().launchers.builtInColors, [key]: color } });
}

/** Insert (no id match) or replace a custom launcher, keeping list order. */
export function upsertCustom(item: CustomLauncher): Promise<void> {
  const custom = settings.get().launchers.custom.slice();
  const i = custom.findIndex((c) => c.id === item.id);
  if (i < 0) custom.push(item);
  else custom[i] = item;
  return settings.updateLaunchers({ custom });
}

/** Move a custom launcher within the list. */
export function moveCustom(id: string, delta: number): Promise<void> {
  const custom = settings.get().launchers.custom.slice();
  const i = custom.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= custom.length) return Promise.resolve();
  const [item] = custom.splice(i, 1);
  custom.splice(j, 0, item);
  return settings.updateLaunchers({ custom });
}
