// Navigation model of the settings window: tab ids, the sidebar's groups, the pages that live inside
// «Виджеты», URL parsing, and the navigate function pages use.
import { createContext, useContext } from "react";
import type { TileId } from "../../lib/settings";

export type TabId =
  | "general"
  | "widgets"
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

/** A page of the content column: a tab, or the welcome page (it has no sidebar entry of its own). */
export type PageId = TabId | "welcome";

export interface TabSpec {
  id: TabId;
  /** Fluent icon name (eager set, renders synchronously). */
  icon: string;
}

/**
 * The sidebar, top to bottom: the program and its widgets, then what a student keeps in it (the group's caption
 * is «Учёба»), then files and the app itself. Eight entries, each a clear place: a widget's own settings are not
 * in the sidebar, they open from its row in «Виджеты» (WIDGET_PAGES).
 */
export const NAV_GROUPS: readonly { caption?: "study"; tabs: readonly TabSpec[] }[] = [
  {
    tabs: [
      { id: "general", icon: "settings" },
      { id: "widgets", icon: "apps" },
      { id: "appearance", icon: "paint_brush" },
    ],
  },
  {
    caption: "study",
    tabs: [
      { id: "schedule", icon: "calendar_ltr" },
      { id: "notes", icon: "note" },
      { id: "reminders", icon: "alert" },
    ],
  },
  {
    tabs: [
      { id: "transfer", icon: "arrow_swap" },
      { id: "about", icon: "info" },
    ],
  },
];

/** The sidebar's tabs in order. */
export const SIDEBAR_TABS: readonly TabSpec[] = NAV_GROUPS.flatMap((g) => g.tabs);

/** A widget's own settings: pages inside «Виджеты» (the sidebar keeps «Виджеты» lit, the title has a way back). */
export const WIDGET_PAGES: readonly TabId[] = ["clock", "system", "perf", "launchers", "map"];

/** The sidebar entry a page belongs to: itself, or «Виджеты» for a widget's own settings. */
export function sidebarTabOf(tab: PageId): PageId {
  return WIDGET_PAGES.includes(tab as TabId) ? "widgets" : tab;
}

/** Every tab, the sidebar's and the widget pages. */
const ALL_TABS: readonly TabId[] = [...SIDEBAR_TABS.map((t) => t.id), ...WIDGET_PAGES];

/** Icon shown next to each tile in «Виджеты» and in the live preview. */
export const TILE_ICONS: Record<TileId, string> = {
  clock: "clock",
  system: "desktop",
  perf: "top_speed",
  launchers: "apps",
  map: "map",
  schedule: "calendar_ltr",
  notes: "note",
};

/** Tabs whose page opens an editor for `edit` («Виджеты»: an own widget). */
export function acceptsEdit(tab: PageId): boolean {
  return tab === "widgets" || tab === "launchers" || tab === "notes" || tab === "schedule";
}

export function isTab(v: unknown): v is TabId {
  return typeof v === "string" && ALL_TABS.includes(v as TabId);
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
