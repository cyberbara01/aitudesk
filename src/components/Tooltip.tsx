import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";

interface Props {
  text: string;
  /** Classes for the anchor wrapper (it is the element being hovered). */
  className?: string;
  /** Never opens while true (the anchor still renders its children). */
  disabled?: boolean;
  children: ReactNode;
}

const DELAY = 500;
/** Distance from the anchor and from the window edges (= --s1). */
const GAP = 4;

/**
 * Layout of the bubble. The look is the kit's .tooltip (base.css); these rules belong to the component because
 * the bubble is rendered inside its anchor: wrap long text and stay inside a small tile window, and do not
 * inherit the anchor's text styling (alignment, number fonts, weight).
 */
const BUBBLE: CSSProperties = {
  maxWidth: `min(320px, calc(100vw - ${2 * GAP}px))`,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  textAlign: "left",
  fontFamily: "var(--font-text)",
  fontWeight: 400,
  fontStyle: "normal",
  letterSpacing: "normal",
  fontVariantNumeric: "normal",
  fontFeatureSettings: "normal",
};

type Phase = "idle" | "pending" | "open";

/**
 * Hover tooltip (SPEC §3): caption text, radius 4, --tooltip-fill, appears after 500 ms with no animation;
 * placed below the anchor (above when there is no room) and clamped inside the window. Also opens for keyboard
 * focus inside the anchor. From the moment it is armed it closes on pointer leave / press, Esc, blur of the
 * focused element, when the window loses focus, scrolls or resizes, and when the anchor unmounts.
 */
export function Tooltip({ text, className, disabled, children }: Props) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = phase === "open";

  const show = () => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    setPhase((p) => (p === "open" ? p : "pending"));
    timer.current = window.setTimeout(() => setPhase("open"), DELAY);
  };
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setPhase("idle");
  }, []);
  const onFocus = (e: FocusEvent<HTMLSpanElement>) => {
    if (e.target instanceof Element && e.target.matches(":focus-visible")) show();
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A tooltip that became disabled while open (or pending) goes away.
  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  // While pending or open, anything that moves the anchor or takes the user elsewhere cancels it.
  const armed = phase !== "idle";
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [armed, hide]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const a = anchor.current?.getBoundingClientRect();
    const t = tip.current?.getBoundingClientRect();
    if (!a || !t) return;
    const { innerWidth: vw, innerHeight: vh } = window;
    const left = Math.max(GAP, Math.min(a.left + a.width / 2 - t.width / 2, vw - t.width - GAP));
    let top = a.bottom + GAP;
    if (top + t.height > vh - GAP) top = a.top - GAP - t.height;
    top = Math.max(GAP, Math.min(top, vh - t.height - GAP));
    setPos({ left, top });
  }, [open, text]);

  return (
    <span
      ref={anchor}
      className={className}
      aria-describedby={open ? id : undefined}
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={onFocus}
      onBlur={hide}
    >
      {children}
      {open && (
        <div id={id} ref={tip} role="tooltip" className="tooltip" style={{ ...BUBBLE, ...(pos ?? { left: 0, top: 0, visibility: "hidden" }) }}>
          {text}
        </div>
      )}
    </span>
  );
}
