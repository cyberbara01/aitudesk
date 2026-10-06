import { lazy, Suspense, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { signalWindowReady } from "./lib/ready";
import { useTheme } from "./lib/theme";

const label = getCurrentWindow().label;
document.documentElement.setAttribute("data-window", label);

// Each window loads only its own code (the map floors and the settings pages are large).
const pages = {
  clock: lazy(() => import("./tiles/Clock").then((m) => ({ default: m.ClockTile }))),
  system: lazy(() => import("./tiles/System").then((m) => ({ default: m.SystemTile }))),
  launchers: lazy(() => import("./tiles/Launchers").then((m) => ({ default: m.LaunchersTile }))),
  map: lazy(() => import("./tiles/Map").then((m) => ({ default: m.MapTile }))),
  schedule: lazy(() => import("./tiles/Schedule").then((m) => ({ default: m.ScheduleTile }))),
  notes: lazy(() => import("./tiles/Notes").then((m) => ({ default: m.NotesTile }))),
  settings: lazy(() => import("./settings/SettingsShell").then((m) => ({ default: m.SettingsWindow }))),
} as const;

/** Mounts once the page's code is loaded and rendered; then the hidden window may be shown. */
function Ready() {
  useEffect(() => {
    signalWindowReady();
  }, []);
  return null;
}

export function App() {
  useTheme();
  const Page = pages[label as keyof typeof pages];
  if (!Page) return null;
  return (
    <Suspense fallback={null}>
      <Page />
      <Ready />
    </Suspense>
  );
}
