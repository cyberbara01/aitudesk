import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";
import "./styles/clock.css";
import "./styles/system.css";
import "./styles/perf.css";
import "./styles/custom.css";
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

// A touchpad pinch reaches the tile pages as Ctrl + wheel (src-tauri layout.rs enable_pinch). No page is ever
// magnified by it: cancelled here for every page, the map still sees it and zooms its plan (MapCanvas).
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false, capture: true },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
