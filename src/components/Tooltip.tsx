import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
 * Hover tooltip (§3): caption text, radius 4, --tooltip-fill, appears after 500 ms with no animation
 * (the spec defines the delay only); placed below the anchor (above when there is no room) and clamped
 * inside the window. Closes on pointer leave / press, when the window loses focus or scrolls, and when
 * the anchor unmounts.
 */
export function Tooltip({ text, className, disabled, children }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), DELAY);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A tooltip that became disabled while open (or pending) goes away.
  useEffect(() => {
    if (!disabled) return;
    window.clearTimeout(timer.current);
    setOpen(false);
  }, [disabled]);

  // Anything that moves the anchor or takes the pointer away closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

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
    <span ref={anchor} className={className} onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide}>
      {children}
      {open && (
        <div
          ref={tip}
          role="tooltip"
          className="tooltip tooltip-pop"
          style={pos ?? { left: 0, top: 0, visibility: "hidden" }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
