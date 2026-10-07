import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ru } from "../i18n/ru";
import { useEditMode } from "../lib/editMode";
import { popupMenu } from "../lib/nativeMenu";
import { settings, type TileId } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { Button } from "./Button";
import { ContextMenu, type MenuItemSpec } from "./ContextMenu";
import { Tooltip } from "./Tooltip";

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
    // A menu needs the keyboard (arrows, Esc) and must close when the user clicks elsewhere: take the focus for
    // this interaction (the tile keeps its look, see glass.rs; it returns below other windows afterwards).
    invoke("activate_tile").catch(() => undefined);
    const { clientX: x, clientY: y } = e;
    // A real Windows menu, never squeezed by a small widget; the one drawn inside the widget only if that fails.
    const show = (items: MenuItemSpec[]) => void popupMenu(items).catch(() => setMenu({ x, y, items }));
    if (edit.editing) {
      // While moving or resizing, the menu offers a step back and the way out.
      const done: MenuItemSpec = { id: "done", label: ru.common.done, icon: "checkmark", onSelect: edit.stop };
      show(edit.canUndo ? [{ id: "undo", label: ru.edit.undo, icon: "arrow_undo", onSelect: () => void edit.undo() }, done] : [done]);
      return;
    }
    const extra = menuItems?.(e.target as HTMLElement) ?? [];
    const standard: MenuItemSpec[] = [
      // Locked: the item says why it does nothing (a Windows menu shows no tooltip).
      { id: "move", label: locked ? ru.edit.locked : ru.menu.moveResize, icon: "arrow_move", onSelect: edit.start, disabled: locked },
      { id: "settings", label: ru.menu.settings, icon: "settings", onSelect: () => invoke("open_settings", { tab: label }).catch(() => undefined) },
      { id: "hide", label: ru.menu.hide, icon: "eye_off", onSelect: () => void hideTile(label) },
    ];
    show(extra.length ? [...extra, { id: "sep", label: "", separator: true, onSelect: () => undefined }, ...standard] : standard);
  };

  // Tiles are not activated by clicks (no jump in the z-order). A text field (the map search) needs the
  // keyboard, so pressing on one activates this tile on purpose.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) {
      invoke("activate_tile").catch(() => undefined);
    }
  };

  const cls = ["tile", className ?? "", background ? "" : "no-bg", edit.editing ? "editing" : ""].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      onContextMenu={onContextMenu}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={edit.editing ? edit.onDragStart : undefined}
    >
      {children}
      {edit.editing && (
        <div className="edit-pill" onPointerDown={(e) => e.stopPropagation()}>
          {edit.canUndo && (
            <Tooltip text={ru.edit.undoHint} className="edit-undo">
              <Button size="sm" icon="arrow_undo" aria-label={ru.edit.undoHint} onClick={() => void edit.undo()} />
            </Tooltip>
          )}
          <Button size="sm" variant="accent" icon="checkmark" onClick={edit.stop}>
            {ru.common.done}
          </Button>
        </div>
      )}
      {edit.editing && <div className="resize-grip" onPointerDown={edit.onResizeStart} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}

async function hideTile(label: TileId) {
  await settings.update((cur) => ({ tiles: { ...cur.tiles, [label]: false } }));
  invoke("set_tile_enabled", { label, enabled: false }).catch(() => undefined);
}
