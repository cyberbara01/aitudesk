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

/** Modal sheet inside the window (backdrop, Esc / outside click closes, focus moves inside). */
export function Dialog({ open, title, onClose, children, footer, width }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Prefer the first form field; fall back to the first button that is not the header close button.
    const root = ref.current;
    const first =
      root?.querySelector<HTMLElement>(".dialog-body input, .dialog-body [tabindex]:not([tabindex='-1']), .dialog-body button") ??
      root?.querySelector<HTMLElement>("button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog reacts to Esc (dialogs register in open order).
      if (e.key === "Escape" && openDialogs[openDialogs.length - 1] === token) {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    const token = {};
    openDialogs.push(token);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
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
