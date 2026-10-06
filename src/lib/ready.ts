// Startup without flicker. Tiles are created visible but parked off-screen; the settings window is created
// hidden. Each page reports "ready" once the stored settings are loaded, the appearance (palette, style,
// accent) is applied, the fonts are in and a frame with all of that has been painted. Only then does the
// native side move the tile into place (or show the settings window).
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { settings } from "./settings";

let resolveAppearance: () => void = () => undefined;
const appearanceReady = new Promise<void>((resolve) => {
  resolveAppearance = resolve;
});

/** Called by useTheme after the first appearance computed from the stored settings has been applied. */
export function markAppearanceApplied(): void {
  resolveAppearance();
}

/** Yield one task. MessageChannel, not setTimeout: timers are throttled to 1 s in hidden pages. */
const yieldTask = () =>
  new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });

/** Two animation frames: the frame with the loaded state has been produced. Only for visible windows. */
const twoFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

let signalled = false;

/** Ask the native side to reveal this window as soon as its first real frame is ready. Call once per page. */
export function signalWindowReady(): void {
  if (signalled) return;
  signalled = true;
  const isTile = getCurrentWindow().label !== "settings";
  const show = () => invoke("window_ready").catch(() => undefined);
  Promise.all([settings.ready(), appearanceReady])
    // Let React commit the loaded state; font loads start only once text is laid out.
    .then(yieldTask)
    .then(yieldTask)
    .then(() => document.fonts.ready)
    .then(yieldTask)
    .then(() => (isTile ? twoFrames() : undefined))
    .then(show, show);
}
