import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ru } from "../i18n/ru";
import { useEditMode } from "../lib/editMode";
import { settings, type TileId } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { ContextMenu, type MenuItemSpec } from "./ContextMenu";

interface TileProps {
  label: TileId;
  /** Logical px; every tile is resizable in edit mode. */
  minSize?: { w: number; h: number };
  className?: string;
  /** Glass background; false = content floats on the wallpaper (acrylic is cleared natively). */
  background?: boolean;
  /** Extra context-menu items, shown above the standard ones. */
  menuItems?: (target: HTMLElement) => MenuItemSpec[];
  children: ReactNode;
}

const DEFAULT_MIN: Record<TileId, { w: number; h: number }> = {
  clock: { w: 160, h: 80 },
  system: { w: 220, h: 144 },
  launchers: { w: 120, h: 136 },
  map: { w: 400, h: 220 },
  schedule: { w: 200, h: 120 },
  notes: { w: 200, h: 120 },
};

/** Glass tile root: material, 1 px border, top edge highlight, radius, padding; context menu; edit mode. */
export function Tile({ label, minSize, className, background = true, menuItems, children }: TileProps) {
  const s = useSettings();
  const locked = s.lockLayout;
  const edit = useEditMode({ label, resizable: true, minSize: minSize ?? DEFAULT_MIN[label] });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItemSpec[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Native acrylic follows the background switch.
  useEffect(() => {
    invoke("set_tile_glass", { on: background }).catch(() => undefined);
  }, [background]);

  // Locking the layout ends an active edit session.
  useEffect(() => {
    if (locked && edit.editing) edit.stop();
  }, [locked, edit]);

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (edit.editing) return;
    const extra = menuItems?.(e.target as HTMLElement) ?? [];
    const standard: MenuItemSpec[] = [
      { id: "move", label: ru.menu.moveResize, icon: "arrow_move", onSelect: edit.start, disabled: locked, hint: locked ? ru.edit.locked : undefined },
      { id: "settings", label: ru.menu.settings, icon: "settings", onSelect: () => invoke("open_settings", { tab: label }).catch(() => undefined) },
      { id: "hide", label: ru.menu.hide, icon: "eye_off", onSelect: () => void hideTile(label) },
    ];
    setMenu({ x: e.clientX, y: e.clientY, items: extra.length ? [...extra, { id: "sep", label: "", separator: true, onSelect: () => undefined }, ...standard] : standard });
  };

  const cls = ["tile", className ?? "", background ? "" : "no-bg", edit.editing ? "editing" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} onContextMenu={onContextMenu} onPointerDown={edit.editing ? edit.onDragStart : undefined}>
      {children}
      {edit.editing && <div className="resize-grip" onPointerDown={edit.onResizeStart} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}

async function hideTile(label: TileId) {
  await settings.update((cur) => ({ tiles: { ...cur.tiles, [label]: false } }));
  invoke("set_tile_enabled", { label, enabled: false }).catch(() => undefined);
}
