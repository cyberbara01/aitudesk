// Privacy masking for desktop tiles (schedule, notes). When `masked`, the text is replaced with password
// dots of a fixed length (the length of the real text is not revealed). Hovering the row shows an eye button
// to the right of the text; clicking it reveals that row, clicking again hides it. A row revealed this way
// hides again once the pointer has left the tile for a moment (see usePrivacyReset).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ru } from "../i18n/ru";
import { Icon } from "./Icon";

/** Dots shown instead of any text, a fixed number of them, so the length of the real text is not revealed. */
export const DOTS = "••••••••";

interface PrivacyCtx {
  masked: boolean;
  revealed: ReadonlySet<string>;
  toggle: (id: string) => void;
}

const Ctx = createContext<PrivacyCtx>({ masked: false, revealed: new Set(), toggle: () => undefined });

/**
 * Wrap a tile's content. `masked` comes from the tile's privacy setting. Revealed rows are forgotten when the
 * pointer leaves the tile (after `graceMs`), when the window loses focus, or when privacy is switched off.
 */
export function PrivacyScope({ masked, graceMs = 1500, children }: { masked: boolean; graceMs?: number; children: ReactNode }) {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const timer = useRef(0);

  const toggle = useCallback((id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!masked) setRevealed(new Set());
  }, [masked]);

  useEffect(() => {
    if (!masked) return;
    const clear = () => setRevealed((prev) => (prev.size ? new Set() : prev));
    const onLeave = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(clear, graceMs);
    };
    const onEnter = () => window.clearTimeout(timer.current);
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("pointerenter", onEnter);
    window.addEventListener("blur", onLeave);
    return () => {
      window.clearTimeout(timer.current);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("pointerenter", onEnter);
      window.removeEventListener("blur", onLeave);
    };
  }, [masked, graceMs]);

  const value = useMemo(() => ({ masked, revealed, toggle }), [masked, revealed, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** True when the row `id` currently shows its real text. */
export function useRevealed(id: string): boolean {
  const { masked, revealed } = useContext(Ctx);
  return !masked || revealed.has(id);
}

interface MaskedTextProps {
  /** Row id: all MaskedText of one row reveal together. */
  id: string;
  text: string;
  className?: string;
}

/** The text itself, or the dots while masked. */
export function MaskedText({ id, text, className }: MaskedTextProps) {
  const shown = useRevealed(id);
  if (shown) return <span className={className}>{text}</span>;
  return (
    <span className={["masked-dots", className ?? ""].filter(Boolean).join(" ")} aria-label={ru.common.hidden}>
      {DOTS}
    </span>
  );
}

/**
 * The eye button for a row; render it at the right end of the row. Invisible until the row is hovered or
 * the button is focused; absent when privacy is off.
 */
export function RevealButton({ id }: { id: string }) {
  const { masked, revealed, toggle } = useContext(Ctx);
  if (!masked) return null;
  const open = revealed.has(id);
  return (
    <button
      type="button"
      className={open ? "reveal-btn open" : "reveal-btn"}
      aria-label={open ? ru.common.hideText : ru.common.showText}
      aria-pressed={open}
      onClick={(e) => {
        e.stopPropagation();
        toggle(id);
      }}
    >
      <Icon name={open ? "eye_off" : "eye"} size={16} />
    </button>
  );
}
