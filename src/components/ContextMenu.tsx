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
  /** A tick before the item: the current choice among its neighbours (the items of «Размер»). */
  checked?: boolean;
  /** A submenu: the item opens these instead of doing something itself (here: a group under its name). */
  children?: MenuItemSpec[];
  onSelect: () => void;
}

/** Submenus as groups: the parent's name as a caption, then its items. */
function flatten(items: readonly MenuItemSpec[]): (MenuItemSpec & { group?: boolean })[] {
  return items.flatMap((it) => (it.children ? [{ ...it, group: true }, ...it.children] : [it]));
}

interface Props {
  x: number;
  y: number;
  items: MenuItemSpec[];
  onClose: () => void;
}

/**
 * Context menu rendered inside the tile and clamped to its bounds (padding 4, items h32, icon 16; long menus
 * scroll). Widgets show a real Windows menu (src/lib/nativeMenu.ts); this one is the fallback when that is not
 * available. Like a native menu it opens with no item highlighted: the menu itself takes the focus, the arrow
 * keys then move through the items (Home/End jump), Enter activates, Esc closes.
 */
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
    el.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!buttons.length) return;
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next: number;
        if (e.key === "Home") next = 0;
        else if (e.key === "End") next = buttons.length - 1;
        else if (i < 0) next = e.key === "ArrowDown" ? 0 : buttons.length - 1;
        else next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
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
    <div ref={ref} className="ctx-menu" role="menu" tabIndex={-1} style={pos} onContextMenu={(e) => e.preventDefault()}>
      {flatten(items).map((it) =>
        it.separator ? (
          <div key={it.id} className="ctx-sep" role="separator" />
        ) : it.group ? (
          <div key={it.id} className="ctx-group caption" role="presentation">
            {it.label}
          </div>
        ) : (
          <button
            key={it.id}
            role={it.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={it.checked}
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
            ) : it.checked !== undefined ? (
              <span className="icon icon-16">{it.checked && <Icon name="checkmark" size={16} />}</span>
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
