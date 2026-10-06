// Navigation model of the settings window: tab ids, icons, URL parsing.
import type { TileId } from "../../lib/settings";

export type TabId = "general" | "appearance" | "clock" | "system" | "launchers" | "map" | "schedule" | "about";

export interface TabSpec {
  id: TabId;
  /** Fluent icon name (eager set, renders synchronously). */
  icon: string;
}

/** Order = sidebar order = Ctrl+1…8. */
export const TABS: readonly TabSpec[] = [
  { id: "general", icon: "home" },
  { id: "appearance", icon: "paint_brush" },
  { id: "clock", icon: "clock" },
  { id: "system", icon: "desktop" },
  { id: "launchers", icon: "apps" },
  { id: "map", icon: "map" },
  { id: "schedule", icon: "calendar_ltr" },
  { id: "about", icon: "info" },
];

/** Icon shown next to each tile in «Общие» and in the live preview. */
export const TILE_ICONS: Record<TileId, string> = {
  clock: "clock",
  system: "desktop",
  launchers: "apps",
  map: "map",
  schedule: "calendar_ltr",
};

export function isTab(v: unknown): v is TabId {
  return typeof v === "string" && TABS.some((t) => t.id === v);
}

/** Unknown or missing → «Общие». */
export function parseTab(v: unknown): TabId {
  return isTab(v) ? v : "general";
}

export interface Route {
  tab: TabId;
  /** Launcher id to open in the editor (launchers tab only). */
  edit: string | null;
  /** Bumped on every navigate-with-edit so the launchers page can react to the same id twice. */
  nonce: number;
}

/** Initial route from `index.html?tab=<id>&edit=<launcher id>`. */
export function readInitialRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const tab = parseTab(q.get("tab"));
  const edit = tab === "launchers" ? q.get("edit") : null;
  return { tab, edit: edit ? edit : null, nonce: 0 };
}
