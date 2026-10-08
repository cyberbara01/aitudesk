import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";
import "./styles/clock.css";
import "./styles/system.css";
import "./styles/perf.css";
import "./styles/custom.css";
import "./styles/popup.css";
import "./styles/launchers.css";
import "./styles/map.css";
import "./styles/schedule.css";
import "./styles/notes.css";
import "./styles/privacy.css";
import "./styles/settings.css";
import "./styles/reminders.css";
import "./styles/transfer.css";

// No browser context menu anywhere (tiles render their own).
document.addEventListener("contextmenu", (e) => e.preventDefault());

// A touchpad pinch reaches a page as Ctrl + wheel (the map's window and the pop-up have WebView2's pinch on from
// their creation, tauri.conf.json and popup.rs). No page is ever magnified by it: cancelled here for every page,
// the map still sees it and zooms its plan (MapCanvas). WebView2 ties the pinch to the zoom keys, so those are
// cancelled too (Ctrl with +, -, = or 0).
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false, capture: true },
);
window.addEventListener(
  "keydown",
  (e) => {
    const zoomKey = ["+", "-", "=", "_", "0"].includes(e.key) || ["NumpadAdd", "NumpadSubtract", "Numpad0"].includes(e.code);
    if ((e.ctrlKey || e.metaKey) && zoomKey) e.preventDefault();
    else if (isBrowserShortcut(e)) e.preventDefault();
  },
  { capture: true },
);

/** Keys of Ctrl shortcuts a browser would act on (reload, print, find, save, source, new window, history). */
const BROWSER_CTRL_KEYS = new Set(["KeyR", "KeyP", "KeyF", "KeyG", "KeyS", "KeyU", "KeyN", "KeyT", "KeyW", "KeyH", "KeyJ", "KeyO", "KeyD", "KeyE", "KeyK", "KeyL"]);
/** The same letters by Windows key code, for input that comes without a key position. */
const BROWSER_CTRL_CODES = new Set([82, 80, 70, 71, 83, 85, 78, 84, 87, 72, 74, 79, 68, 69, 75, 76]);

/**
 * No browser shortcuts: these windows are widgets and the settings, not web pages. Reloading (F5, Ctrl+R),
 * printing, finding (Ctrl+F, F3), caret browsing (F7), the developer tools (F12, Ctrl+Shift+I) and going back or
 * forward (Alt+arrows, the browser keys) do nothing; the native side switches them off too (layout.rs). Typing,
 * Ctrl+A/C/V/X/Z/Y in fields, Ctrl+Enter, Esc and the app's own keys work as before.
 */
function isBrowserShortcut(e: KeyboardEvent): boolean {
  const k = e.keyCode;
  if (["F3", "F5", "F7", "F12"].includes(e.key) || k === 114 || k === 116 || k === 118 || k === 123) return true;
  if (e.key.startsWith("Browser")) return true;
  if (e.altKey && !e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home")) return true;
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  return BROWSER_CTRL_KEYS.has(e.code) || (e.code === "" && BROWSER_CTRL_CODES.has(k));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
