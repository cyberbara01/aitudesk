// Navigation model of the settings window: tab ids, icons, URL parsing, and the navigate function pages use.
import { createContext, useContext } from "react";
import type { TileId } from "../../lib/settings";

export type TabId =
  | "general"
  | "appearance"
  | "clock"
  | "system"
  | "perf"
  | "launchers"
  | "map"
  | "schedule"
  | "notes"
  | "reminders"
  | "transfer"
  | "about";

/** A page of the content column: a sidebar tab, or the welcome page (it has no sidebar entry). */
export type PageId = TabId | "welcome";

export interface TabSpec {
  id: TabId;
  /** Fluent icon name (eager set, renders synchronously). */
  icon: string;
}

/** Order = sidebar order. */
export const TABS: readonly TabSpec[] = [
  { id: "general", icon: "home" },
  { id: "appearance", icon: "paint_brush" },
  { id: "clock", icon: "clock" },
  { id: "system", icon: "desktop" },
  { id: "perf", icon: "top_speed" },
  { id: "launchers", icon: "apps" },
  { id: "map", icon: "map" },
  { id: "schedule", icon: "calendar_ltr" },
  { id: "notes", icon: "note" },
  { id: "reminders", icon: "alert" },
  { id: "transfer", icon: "arrow_swap" },
  { id: "about", icon: "info" },
];

/** Icon shown next to each tile in «Общие» and in the live preview. */
export const TILE_ICONS: Record<TileId, string> = {
  clock: "clock",
  system: "desktop",
  perf: "top_speed",
  launchers: "apps",
  map: "map",
  schedule: "calendar_ltr",
  notes: "note",
};

/** Tabs whose page opens an editor for `edit` («Общие»: an own widget). */
export function acceptsEdit(tab: PageId): boolean {
  return tab === "general" || tab === "launchers" || tab === "notes" || tab === "schedule";
}

export function isTab(v: unknown): v is TabId {
  return typeof v === "string" && TABS.some((t) => t.id === v);
}

/** Unknown or missing → «Общие». */
export function parseTab(v: unknown): TabId {
  return isTab(v) ? v : "general";
}

export interface Route {
  tab: PageId;
  /** Item to open in the editor: a launcher id or built-in key (launchers tab) or a note id (notes tab). */
  edit: string | null;
  /** Bumped on every navigate-with-edit so the page can react to the same id twice. */
  nonce: number;
}

/** Initial route from `index.html?tab=<id>&edit=<launcher id>`. */
export function readInitialRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const tab = parseTab(q.get("tab"));
  const edit = acceptsEdit(tab) ? q.get("edit") : null;
  return { tab, edit: edit ? edit : null, nonce: 0 };
}

/** Opens another page of this window (with an editor item where the page takes one). */
export type Navigate = (tab: PageId, edit?: string | null) => void;

export const NavigateContext = createContext<Navigate>(() => undefined);

/** The shell's navigate function, for pages that link to other pages. */
export function useNavigate(): Navigate {
  return useContext(NavigateContext);
}
