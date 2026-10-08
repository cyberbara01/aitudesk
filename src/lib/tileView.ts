// «Размер» of the widget in this window (settings `tileViews`, src-tauri/src/layout.rs View). «Маленький» and
// «Средний» fold it to its icon (and name); a click opens the whole widget as a pop-up over the desktop, and it
// folds back on a click anywhere else, on Esc, or when the views change. One widget per window, so its state is
// kept here: the Tile frame and the widget's own timers (resting while folded) read the same value.
//
// Opening and folding go through a short phase with nothing drawn: the window takes its new size first and the
// content (or the icon) appears in it, so neither is ever shown squeezed or stretched for a frame.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TileView } from "./settings";
import { useSettings } from "./useSettings";

export type TilePhase = "folded" | "opening" | "open" | "folding";

const label = getCurrentWindow().label;
/** Another widget was pressed: an open pop-up folds (clicks on widgets never move the keyboard focus). */
const PRESSED_EVENT = "tile-pressed";
/** The longest wait for the page to see its new window size. */
const RESIZE_WAIT_MS = 150;

let phase: TilePhase = "folded";
const listeners = new Set<() => void>();

function setPhase(next: TilePhase) {
  if (phase === next) return;
  phase = next;
  for (const fn of listeners) fn();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
/** The phase now (a function, so a check after an await reads the value of that moment). */
const snapshot = (): TilePhase => phase;

/** The window's next resize event, or the end of the wait. */
function nextResize(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener("resize", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, RESIZE_WAIT_MS);
    window.addEventListener("resize", done);
  });
}

export const isFoldedView = (v: TileView) => v === "small" || v === "medium";

export function useTileView(): TileView {
  return useSettings().tileViews[label] ?? "manual";
}

export function useTilePhase(): TilePhase {
  return useSyncExternalStore(subscribe, snapshot);
}

/** True while the widget's content is not shown (folded, or between the two): its timers can rest. */
export function useFolded(): boolean {
  const folded = isFoldedView(useTileView());
  const p = useTilePhase();
  return folded && p !== "open";
}

/** Opens the pop-up of the folded widget. */
export async function openTile(): Promise<void> {
  if (phase !== "folded") return;
  setPhase("opening");
  const resized = nextResize();
  try {
    await invoke("expand_tile", { expanded: true });
  } catch {
    setPhase("folded");
    return;
  }
  await resized;
  if (snapshot() === "opening") setPhase("open");
}

/** Folds the open pop-up back to the icon. */
export async function foldTile(): Promise<void> {
  if (phase !== "open" && phase !== "opening") return;
  setPhase("folding");
  const resized = nextResize();
  await invoke("expand_tile", { expanded: false }).catch(() => undefined);
  await resized;
  if (snapshot() === "folding") setPhase("folded");
}

/** Tells the other widgets that this one was pressed (see PRESSED_EVENT). */
export function announcePress() {
  void emit(PRESSED_EVENT, label).catch(() => undefined);
}

let watching = false;

/**
 * What folds the pop-up, set up once by the widget's Tile (pages that only borrow a widget's parts, like the
 * previews in the settings, never start it).
 */
export function watchTilePhase() {
  if (watching) return;
  watching = true;
  // The native side folded the pop-up itself (the views changed, the widget was hidden): show the icon.
  void listen<string>("tile-fold", (e) => {
    if (e.payload === label) setPhase("folded");
  }).catch(() => undefined);
  void listen<string>(PRESSED_EVENT, (e) => {
    if (e.payload !== label) void foldTile();
  }).catch(() => undefined);
  // A click anywhere else takes the focus from the open pop-up. A native menu of the widget keeps it, and a blur
  // that comes back at once (the focus moving inside the window) is not a click elsewhere.
  window.addEventListener("blur", () => {
    if (phase !== "open") return;
    window.setTimeout(() => {
      if (!document.hasFocus()) void foldTile();
    }, 120);
  });
  window.addEventListener("keydown", (e) => {
    // Esc that something inside handled (a search field clearing, a menu closing) is not for the pop-up.
    if (e.key === "Escape" && !e.defaultPrevented && phase === "open") void foldTile();
  });
}
