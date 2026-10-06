// Small hooks shared by the settings pages.
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A value that returns to `idle` after `ms`. Used for transient feedback («Раскладка сброшена»).
 * The timer is cleared on unmount.
 */
export function useTransient<T>(idle: T, ms = 2500): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(idle);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = useCallback(
    (v: T) => {
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

/** Trailing debounce; the pending call is dropped on unmount. */
export function useDebounced<T>(fn: (v: T) => void, ms: number): (v: T) => void {
  const timer = useRef(0);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback(
    (v: T) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => latest.current(v), ms);
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
