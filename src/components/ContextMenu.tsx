import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface MenuItemSpec {
  id: string;
  label: string;
  icon?: string;
  /** Colour swatch instead of an icon (favourite colours). */
  swatch?: string;
  disabled?: boolean;
  /** Shown as the title attribute when disabled (why). */
  hint?: string;
  /** Renders a divider instead of an item. */
  separator?: boolean;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItemSpec[];
  onClose: () => void;
}

/** Fluent context menu rendered inside the tile and clamped to its bounds (padding 4, items h32, icon 16). */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth: vw, innerHeight: vh } = window;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, vw - r.width - 4));
    const top = Math.max(4, Math.min(y, vh - r.height - 4));
    setPos({ left, top });
    (el.querySelector("button:not(:disabled)") as HTMLButtonElement | null)?.focus();
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!buttons.length) return;
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it) =>
        it.separator ? (
          <div key={it.id} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={it.id}
            role="menuitem"
            className="ctx-item body"
            disabled={it.disabled}
            title={it.disabled ? it.hint : undefined}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            {it.swatch ? (
              <span className="ctx-swatch" style={{ background: it.swatch }} aria-hidden="true" />
            ) : it.icon ? (
              <Icon name={it.icon} size={16} />
            ) : (
              <span className="icon icon-16" />
            )}
            <span>{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
