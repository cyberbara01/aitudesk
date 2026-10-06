// Subscribes to the Tauri event "settings-navigate" ({ tab, edit }) emitted when the window is already open.
import { useEffect, useLayoutEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { parseTab, type TabId } from "./nav";

interface Payload {
  tab?: unknown;
  edit?: unknown;
}

export function useNavigateEvent(onNavigate: (tab: TabId, edit: string | null) => void): void {
  const cb = useRef(onNavigate);
  useLayoutEffect(() => {
    cb.current = onNavigate;
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<Payload | null>("settings-navigate", (e) => {
      const p = e.payload ?? {};
      const edit = typeof p.edit === "string" && p.edit ? p.edit : null;
      cb.current(parseTab(p.tab), edit);
    })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
