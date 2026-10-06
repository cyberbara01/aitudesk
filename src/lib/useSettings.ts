import { useEffect, useState } from "react";
import { settings, type Settings } from "./settings";

/** Current settings; re-renders on every change from any window. Returns defaults until the store is read. */
export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(settings.get());
  useEffect(() => settings.subscribe(setS), []);
  return s;
}

/** False until the first value from disk arrived. Use it to avoid acting on defaults at startup. */
export function useSettingsLoaded(): boolean {
  const [loaded, setLoaded] = useState(settings.isLoaded());
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    settings.ready().then(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [loaded]);
  return loaded;
}
