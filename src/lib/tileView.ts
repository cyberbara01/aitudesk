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
/** This page is a stack of widgets (src/stack/StackHost.tsx): other windows' widgets in turns, always whole. */
export const IN_STACK = label.startsWith("stack-");
/** The id of this page's stack (settings `stacks`), or null. */
export const STACK_ID = IN_STACK ? label.slice(6) : null;
/** This page shows other windows' widgets (the pop-up or the stack): they never fold, move or size their window. */
export const IN_HOST = IN_POPUP || IN_STACK;

export const isFoldedView = (v: TileView) => v === "small" || v === "medium";

/** The view of `of` (by default this window's own): a widget drawn in the pop-up or inside a stack is always whole;
 * the stack's own face (`of` is the stack's window) folds like any widget. */
export function useTileView(of: string = label): TileView {
  const views = useSettings().tileViews;
  if (IN_POPUP || (IN_STACK && of !== label)) return "manual";
  return views[of] ?? "manual";
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
