// «Размер» of the widget in this window (settings `tileViews`, src-tauri/src/layout.rs View). «Маленький» and
// «Средний» show the widget's icon (and name) in its place; a click opens the whole widget in the pop-up window in
// the middle of the screen (src-tauri/src/popup.rs, src/popup/PopupHost.tsx), and the icon stays where it is. A
// folded tile never draws its own content, so its timers rest; the pop-up draws it while it is open.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TileView } from "./settings";
import { useSettings } from "./useSettings";

const label = getCurrentWindow().label;
/** This page is the pop-up: it shows the widgets of other windows, always whole. */
export const IN_POPUP = label === "popup";

export const isFoldedView = (v: TileView) => v === "small" || v === "medium";

export function useTileView(): TileView {
  const views = useSettings().tileViews;
  return IN_POPUP ? "manual" : (views[label] ?? "manual");
}

/** True while only the icon shows: a folded widget's content lives in the pop-up. */
export function useFolded(): boolean {
  return isFoldedView(useTileView());
}

/** Opens this widget's pop-up (`room`: the map shows that room once open). */
export function openTile(room?: string): Promise<void> {
  return invoke<void>("open_popup", room ? { room } : {}).catch(() => undefined);
}

// ---- Which widget the pop-up shows (the icon of that widget is lit) ----

let shown: string | null = null;
let started = false;
const listeners = new Set<() => void>();

function setShown(next: string | null) {
  if (shown === next) return;
  shown = next;
  for (const fn of listeners) fn();
}

/** Asked once, then kept up to date by the native side; only the pages that show an icon ever ask. */
function start() {
  if (started) return;
  started = true;
  void listen<string | null>("popup-state", (e) => setShown(typeof e.payload === "string" ? e.payload : null)).catch(
    () => undefined,
  );
  void invoke<string | null>("popup_shown").then((v) => setShown(typeof v === "string" ? v : null), () => undefined);
}

const subscribe = (fn: () => void) => {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Whether the pop-up shows this window's widget now. */
export function usePopupOpen(): boolean {
  return useSyncExternalStore(subscribe, () => shown === label);
}
