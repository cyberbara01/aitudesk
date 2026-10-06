// Ctrl+1 … Ctrl+8 switch pages (layout-independent: physical digit keys and the numpad).
import { useEffect } from "react";
import { TABS, type TabId } from "./nav";

export function useTabHotkeys(go: (tab: TabId) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      const m = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
      if (!m) return;
      const tab = TABS[Number(m[1]) - 1];
      if (!tab) return;
      e.preventDefault();
      go(tab.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
}
