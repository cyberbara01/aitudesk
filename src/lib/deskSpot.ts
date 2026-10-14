// Where this window sits on its screen, for «Фон виджетов» laid over the whole screen (src/lib/fill.ts): each widget
// shows the part of the one gradient under it. One reading per window, shared by every widget in it (a stack, the
// pop-up), and read again only when the window moves (arranging, the grid, a new zoom) or its screen's scale changes.
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";

/** CSS px: the window's offset from its screen's corner, and the screen's size. */
export interface DeskSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

let spot: DeskSpot | null = null;
const listeners = new Set<() => void>();
let started = false;
let reading = false;
let again = false;

async function read(): Promise<void> {
  if (reading) {
    again = true;
    return;
  }
  reading = true;
  try {
    const win = getCurrentWindow();
    const [pos, monitor] = await Promise.all([win.outerPosition(), currentMonitor()]);
    // A window parked off every screen (hidden widgets) has no screen: it keeps the last reading.
    if (monitor) {
      const k = monitor.scaleFactor || 1;
      const next = {
        x: Math.round((pos.x - monitor.position.x) / k),
        y: Math.round((pos.y - monitor.position.y) / k),
        w: Math.round(monitor.size.width / k),
        h: Math.round(monitor.size.height / k),
      };
      if (!spot || spot.x !== next.x || spot.y !== next.y || spot.w !== next.w || spot.h !== next.h) {
        spot = next;
        for (const f of listeners) f();
      }
    }
  } catch {
    // No window API (a preview): the widget shows the whole gradient, as before.
  } finally {
    reading = false;
    if (again) {
      again = false;
      void read();
    }
  }
}

function start() {
  if (started) return;
  started = true;
  void read();
  const win = getCurrentWindow();
  void win.onMoved(() => void read()).catch(() => undefined);
  void win.onScaleChanged(() => void read()).catch(() => undefined);
}

function subscribe(onChange: () => void) {
  start();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
const none = () => () => undefined;

/** This window's place on its screen while `active` (null until it is known, and while inactive). */
export function useDeskSpot(active: boolean): DeskSpot | null {
  return useSyncExternalStore(active ? subscribe : none, () => (active ? spot : null));
}
