// The widgets' pages, each loaded only when it is first drawn: the pop-up and the stack draw the widgets of other
// windows (each tile window loads only its own page, src/App.tsx).
import { createElement, lazy, type ComponentType, type ReactElement } from "react";
import { isCustomLabel, TILE_IDS, type TileId } from "./settings";

type Loader = () => Promise<{ default: ComponentType }>;

export const LOADERS: Record<TileId, Loader> = {
  clock: () => import("../tiles/Clock").then((m) => ({ default: m.ClockTile })),
  system: () => import("../tiles/System").then((m) => ({ default: m.SystemTile })),
  perf: () => import("../tiles/Perf").then((m) => ({ default: m.PerfTile })),
  launchers: () => import("../tiles/Launchers").then((m) => ({ default: m.LaunchersTile })),
  map: () => import("../tiles/Map").then((m) => ({ default: m.MapTile })),
  schedule: () => import("../tiles/Schedule").then((m) => ({ default: m.ScheduleTile })),
  notes: () => import("../tiles/Notes").then((m) => ({ default: m.NotesTile })),
  calendar: () => import("../tiles/Calendar").then((m) => ({ default: m.CalendarTile })),
};

export const WIDGETS = Object.fromEntries(TILE_IDS.map((id) => [id, lazy(LOADERS[id])])) as unknown as Record<TileId, ComponentType>;

export const loadCustom = () => import("../tiles/Custom");
export const CustomTile = lazy(() => loadCustom().then((m) => ({ default: m.CustomTile })));

/** Pages whose code has come in, to draw without `lazy`'s wait (src/stack/StackHost.tsx). */
const LOADED = new Map<string, ComponentType>();
let LoadedCustom: ComponentType<{ label: string }> | null = null;

/** Loads a widget's code ahead of its first drawing (an own widget's page is the same for all of them). */
export function preloadWidget(label: string): void {
  if (isCustomLabel(label)) {
    void loadCustom().then((m) => (LoadedCustom = m.CustomTile), () => undefined);
  } else if (label in LOADERS) {
    void LOADERS[label as TileId]().then((m) => LOADED.set(label, m.default), () => undefined);
  }
}

/** The widget drawn straight away if its code is loaded, else null. */
export function readyWidget(label: string): ReactElement | null {
  if (isCustomLabel(label)) return LoadedCustom ? createElement(LoadedCustom, { label }) : null;
  const page = LOADED.get(label);
  return page ? createElement(page) : null;
}
