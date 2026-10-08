// State that lives outside the settings file, read over IPC: whether the widgets are shown («Все виджеты») and
// whether the app starts with Windows. Both are read once when the settings window loads its code, so even the
// first visit to a page usually paints the real state in its first frame, and read again on every visit. A local
// change bumps `version`, so an older read cannot undo it. Also the result text shown next to an action's button.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isEnabled, onAutostartChange } from "../../lib/autostart";

interface External {
  value: boolean | null;
  version: number;
  read: () => Promise<boolean>;
}

function external(read: () => Promise<boolean>): External {
  const e: External = {
    value: null,
    version: 0,
    read: () => {
      const started = e.version;
      return read().then((v) => {
        if (e.version === started) e.value = v;
        return e.value ?? v;
      });
    },
  };
  void e.read();
  return e;
}

export const tilesVisible = external(() => invoke<boolean>("get_tiles_hidden").then((hidden) => !hidden, () => true));
export const autostartOn = external(() => isEnabled().catch(() => false));
// Switched on the welcome page or on «Напоминания»: the first frame of «Общие» shows that already.
onAutostartChange((on) => {
  autostartOn.version += 1;
  autostartOn.value = on;
});

/** Component state mirroring an External value: the last known value first, refreshed on mount. */
export function useExternal(e: External): [boolean | null, (v: boolean) => void] {
  const [value, setValue] = useState(e.value);
  useEffect(() => {
    let alive = true;
    e.read().then((v) => {
      if (alive) setValue(v);
    });
    return () => {
      alive = false;
    };
  }, [e]);
  const set = useCallback(
    (v: boolean) => {
      e.version += 1;
      e.value = v;
      setValue(v);
    },
    [e],
  );
  return [value, set];
}

export type Outcome = "idle" | "done" | "failed";

/** Result of an action, next to its button. A polite live region that stays mounted (empty while idle). */
export function ResultText({ outcome, done, failed }: { outcome: Outcome; done: string; failed: string }) {
  const cls = outcome === "done" ? "status-text ok" : outcome === "failed" ? "status-text fail" : "status-text";
  return (
    <span className={cls} role="status">
      {outcome === "done" ? done : outcome === "failed" ? failed : ""}
    </span>
  );
}
