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

/** Modal sheet inside the window (backdrop, Esc / outside click closes, focus moves inside). */
export function Dialog({ open, title, onClose, children, footer, width }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, button, [tabindex]");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
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
