import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ru } from "../i18n/ru";
import { IconButton } from "./Button";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** CSS width, default 560px. */
  width?: string;
}

/** Stack of open dialogs (module-level) so Esc closes only the top-most one. */
const openDialogs: object[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab inside the dialog: wrap from the last focusable element to the first and back. */
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const active = document.activeElement as HTMLElement | null;
  // A popover rendered outside the dialog (a portal) owns the focus: leave its Tab order alone.
  if (active && active !== document.body && !root.contains(active)) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!active || active === document.body) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Modal sheet inside the window (backdrop, Esc / outside click closes, focus moves inside). */
export function Dialog({ open, title, onClose, children, footer, width }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Prefer the first form field or control in the body; a confirmation without one focuses its first
    // footer button (Cancel), never the header close button.
    const root = ref.current;
    const first =
      root?.querySelector<HTMLElement>(
        ".dialog-body input, .dialog-body textarea, .dialog-body select, .dialog-body [tabindex]:not([tabindex='-1']), .dialog-body button",
      ) ??
      root?.querySelector<HTMLElement>(".dialog-foot button") ??
      root?.querySelector<HTMLElement>("button");
    first?.focus();
    // Bubble phase: a control inside the sheet that handles Esc itself (an open Select or popover calls
    // stopPropagation or preventDefault) closes only itself, and the dialog stays open.
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog reacts (dialogs register in open order).
      if (openDialogs[openDialogs.length - 1] !== token || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === "Tab" && root) {
        trapTab(e, root);
      }
    };
    const token = {};
    openDialogs.push(token);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = openDialogs.indexOf(token);
      if (i >= 0) openDialogs.splice(i, 1);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title} style={{ "--dialog-w": width ?? "560px" } as CSSProperties}>
        <div className="dialog-head">
          <span className="subtitle">{title}</span>
          <IconButton icon="dismiss" label={ru.common.close} variant="subtle" onClick={onClose} />
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}
