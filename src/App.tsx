import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "./lib/theme";
import { ClockTile } from "./tiles/Clock";
import { SystemTile } from "./tiles/System";
import { LaunchersTile } from "./tiles/Launchers";
import { MapTile } from "./tiles/Map";
import { ScheduleTile } from "./tiles/Schedule";
import { SettingsWindow } from "./settings/SettingsShell";

const label = getCurrentWindow().label;
document.documentElement.setAttribute("data-window", label);

export function App() {
  useTheme();
  switch (label) {
    case "clock":
      return <ClockTile />;
    case "system":
      return <SystemTile />;
    case "launchers":
      return <LaunchersTile />;
    case "map":
      return <MapTile />;
    case "schedule":
      return <ScheduleTile />;
    case "settings":
      return <SettingsWindow />;
    default:
      return null;
  }
}
