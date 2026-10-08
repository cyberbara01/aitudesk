// A program fills the screen the widgets are on (src-tauri/src/desktop_watch.rs front_covers): nothing on the
// desktop can be seen, so a widget that works on its own rests (the load is not read, an animation stands still).
// Nothing is hidden for it: when the desktop shows again, the widgets are there as they were and carry on.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let covered = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (covered === next) return;
  covered = next;
  for (const fn of listeners) fn();
}

/** Asked once, then kept up to date by the native side's event; only pages that use it ever ask. */
function start() {
  if (started) return;
  started = true;
  void listen<boolean>("desktop-covered", (e) => set(e.payload === true)).catch(() => undefined);
  void invoke<boolean>("desktop_covered").then(set, () => undefined);
}

const subscribe = (fn: () => void) => {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useDesktopCovered(): boolean {
  return useSyncExternalStore(subscribe, () => covered);
}
