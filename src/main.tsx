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
  },
  { capture: true },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
