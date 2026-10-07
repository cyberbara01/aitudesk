// Small hooks shared by the settings pages.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * A value that returns to `idle` after `ms`. Used for transient feedback («Раскладка сброшена»).
 * The timer is cleared on unmount, and `show` does nothing once the component is gone (an IPC reply
 * may arrive after the page was left).
 */
export function useTransient<T>(idle: T, ms = 2500): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(idle);
  const timer = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);
  const show = useCallback(
    (v: T) => {
      if (!mounted.current) return;
      setValue(v);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setValue(idle), ms);
    },
    [idle, ms],
  );
  return [value, show];
}

/**
 * True shortly after `ready` becomes true. Controls whose initial value arrives asynchronously (IPC)
 * keep transitions off until then, so nothing animates at startup (§3 «никаких анимаций при запуске»).
 */
export function useSettled(ready: boolean): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready || settled) return;
    const t = window.setTimeout(() => setSettled(true), 100);
    return () => window.clearTimeout(t);
  }, [ready, settled]);
  return settled;
}

/** Trailing debounce. A call still pending when the component unmounts is made right away, so the last value is kept. */
export function useDebounced<T>(fn: (v: T) => void, ms: number): (v: T) => void {
  const latest = useRef(fn);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef(0);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      const p = pending.current;
      pending.current = null;
      if (p) latest.current(p.value);
    },
    [],
  );
  return useCallback(
    (v: T) => {
      pending.current = { value: v };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const p = pending.current;
        pending.current = null;
        if (p) latest.current(p.value);
      }, ms);
    },
    [ms],
  );
}

/** Current time, re-rendered on the second (or minute) boundary. */
export function useNow(perSecond: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const d = new Date();
      setNow(d);
      const ms = perSecond ? 1000 - d.getMilliseconds() : 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      timer = window.setTimeout(tick, ms);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [perSecond]);
  return now;
}

const root = document.documentElement;

function subscribeRoot(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-scheme", "data-style"] });
  return () => observer.disconnect();
}

/**
 * An attribute of <html> written by useTheme: `data-theme` (the palette really applied, "system" already
 * resolved), `data-scheme` ("light" | "dark") or `data-style`. Re-renders when it changes.
 */
export function useRootAttribute(name: "data-theme" | "data-scheme" | "data-style"): string | null {
  return useSyncExternalStore(subscribeRoot, () => root.getAttribute(name));
}
