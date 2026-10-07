import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";
import "./styles/clock.css";
import "./styles/system.css";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
