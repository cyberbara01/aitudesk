import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ru } from "../i18n/ru";
import { extra as shell } from "../i18n/ru.extra.shell";
import { useEditMode } from "../lib/editMode";
import { popupMenu } from "../lib/nativeMenu";
import { customIdOf, isCustomLabel, settings, TILE_VIEWS, type TileId, type TileView } from "../lib/settings";
import { announcePress, foldTile, isFoldedView, openTile, useTilePhase, useTileView, watchTilePhase } from "../lib/tileView";
import { useSettings } from "../lib/useSettings";
import { TILE_ICONS } from "../settings/shell/nav";
import { Button } from "./Button";
import { ContextMenu, type MenuItemSpec } from "./ContextMenu";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

const v = shell.views;

interface TileProps {
  /** The window label: a built-in widget's id, or `custom-<id>` for an own widget. */
  label: string;
  /** Logical px; every tile is resizable in edit mode. */
  minSize?: { w: number; h: number };
  className?: string;
  /** Glass background; false = content floats on the wallpaper (acrylic is cleared natively). */
  background?: boolean;
  /** Extra context-menu items, shown above the standard ones. */
  menuItems?: (target: HTMLElement) => MenuItemSpec[];
  /** The folded face of an own widget: its picture instead of an icon, and its name. */
  face?: { art: ReactNode; name: string };
  children: ReactNode;
}

const DEFAULT_MIN: Record<TileId, { w: number; h: number }> = {
  clock: { w: 160, h: 80 },
  system: { w: 220, h: 144 },
  perf: { w: 200, h: 96 },
  launchers: { w: 120, h: 136 },
  map: { w: 400, h: 220 },
  schedule: { w: 200, h: 120 },
  notes: { w: 200, h: 120 },
};
/** An own widget is a picture: any size down to a small square. */
const CUSTOM_MIN = { w: 64, h: 64 };

const isBuiltIn = (label: string): label is TileId => label in DEFAULT_MIN;

/** «Маленький» and «Средний»: the widget folded to its icon (and name); a click opens it as a pop-up. */
function TileFace({ view, art, name }: { view: TileView; art: ReactNode; name: string }) {
  return (
    <button
      type="button"
      className="tile-face"
      aria-label={v.open(name)}
      // The small face has no room for its name: the system tooltip shows it (it may leave the window).
      title={view === "small" ? name : undefined}
      onClick={() => void openTile()}
    >
      <span className="tile-face-art" aria-hidden="true">
        {art}
      </span>
      {view === "medium" && <span className="tile-face-name ellipsis">{name}</span>}
    </button>
  );
}

/** Glass tile root: material, 1 px border, top edge highlight, radius, padding; context menu; edit mode; views. */
export function Tile({ label, minSize, className, background = true, menuItems, face, children }: TileProps) {
  const s = useSettings();
  const locked = s.lockLayout;
  const view = useTileView();
  const phase = useTilePhase();
  const foldable = isFoldedView(view);
  const showFace = foldable && phase === "folded";
  const showContent = !foldable || phase === "open";
  const builtIn = isBuiltIn(label);
  const name = face?.name ?? (builtIn ? ru.tiles[label] : "");
  // A «Большой» widget resized by hand keeps that size: it becomes «Вручную».
  const onResized = useCallback(() => {
    if (settings.get().tileViews[label] === "large") void settings.setTileView(label, "manual");
  }, [label]);
  const edit = useEditMode({
    label,
    resizable: !foldable,
    minSize: minSize ?? (builtIn ? DEFAULT_MIN[label] : CUSTOM_MIN),
    onResized,
  });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItemSpec[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    watchTilePhase();
  }, []);

  // Native acrylic follows the background switch; the folded icon always sits on glass, so it reads on any
  // wallpaper.
  const glass = background || (foldable && phase !== "open");
  useEffect(() => {
    invoke("set_tile_glass", { on: glass }).catch(() => undefined);
  }, [glass]);

  // Locking the layout ends an active edit session.
  useEffect(() => {
    if (locked && edit.editing) edit.stop();
  }, [locked, edit]);

  // Arranging the widgets moves the icons: an open pop-up folds first.
  useEffect(() => {
    if (edit.editing) void foldTile();
  }, [edit.editing]);

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
    // The widget's own items act on its content: only while it is shown.
    const extra = showContent ? (menuItems?.(e.target as HTMLElement) ?? []) : [];
    const custom = isCustomLabel(label);
    const standard: MenuItemSpec[] = [
      ...(showFace ? [{ id: "open", label: v.open(name), icon: "open", onSelect: () => void openTile() }] : []),
      // Locked: the item says why it does nothing (a Windows menu shows no tooltip).
      { id: "move", label: locked ? ru.edit.locked : ru.menu.moveResize, icon: "arrow_move", onSelect: edit.start, disabled: locked },
      {
        id: "size",
        label: v.size,
        icon: "resize",
        onSelect: () => undefined,
        children: TILE_VIEWS.map((tv) => ({
          id: `size-${tv}`,
          label: v[tv],
          checked: tv === view,
          onSelect: () => void settings.setTileView(label, tv),
        })),
      },
      {
        id: "settings",
        label: ru.menu.settings,
        icon: "settings",
        // An own widget's settings are its editor on «Общие».
        onSelect: () =>
          void invoke("open_settings", custom ? { tab: "general", edit: customIdOf(label) } : { tab: label }).catch(() => undefined),
      },
      { id: "hide", label: ru.menu.hide, icon: "eye_off", onSelect: () => void hideTile(label) },
    ];
    show(extra.length ? [...extra, { id: "sep", label: "", separator: true, onSelect: () => undefined }, ...standard] : standard);
  };

  // Tiles are not activated by clicks (no jump in the z-order). A text field (the map search) needs the
  // keyboard, so pressing on one activates this tile on purpose. An open pop-up of another widget folds.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "open") announcePress();
    if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) {
      invoke("activate_tile").catch(() => undefined);
    }
  };

  const art = face?.art ?? (builtIn ? <Icon name={TILE_ICONS[label]} size={24} /> : null);
  const cls = [
    "tile",
    className ?? "",
    foldable ? `view-${view}` : "",
    showFace ? "folded" : "",
    foldable && phase === "open" ? "popup" : "",
    glass ? "" : "no-bg",
    edit.editing ? "editing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // The edit buttons of a folded icon have no room for words.
  const compactPill = foldable;
  return (
    <div
      className={cls}
      onContextMenu={onContextMenu}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={edit.editing ? edit.onDragStart : undefined}
    >
      {showFace && <TileFace view={view} art={art} name={name} />}
      {showContent && children}
      {edit.editing && (
        <div className="edit-pill" onPointerDown={(e) => e.stopPropagation()}>
          {edit.canUndo && (
            <Tooltip text={ru.edit.undoHint} className="edit-undo">
              <Button size="sm" icon="arrow_undo" aria-label={ru.edit.undoHint} onClick={() => void edit.undo()} />
            </Tooltip>
          )}
          <Button size="sm" variant="accent" icon="checkmark" aria-label={compactPill ? ru.common.done : undefined} onClick={edit.stop}>
            {compactPill ? null : ru.common.done}
          </Button>
        </div>
      )}
      {edit.editing && !foldable && <div className="resize-grip" onPointerDown={edit.onResizeStart} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}

/** «Выключить виджет»: a built-in one in `tiles`, an own one in its entry (the native side parks it). */
async function hideTile(label: string) {
  if (isCustomLabel(label)) {
    const id = customIdOf(label);
    await settings.update((cur) => ({
      customWidgets: cur.customWidgets.map((w) => (w.id === id ? { ...w, enabled: false } : w)),
    }));
    return;
  }
  if (!isBuiltIn(label)) return;
  await settings.update((cur) => ({ tiles: { ...cur.tiles, [label]: false } }));
  invoke("set_tile_enabled", { label, enabled: false }).catch(() => undefined);
}
