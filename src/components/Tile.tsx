import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ru } from "../i18n/ru";
import { extra as shell } from "../i18n/ru.extra.shell";
import { resolveLook } from "../lib/design";
import { useEditMode } from "../lib/editMode";
import { popupMenu } from "../lib/nativeMenu";
import { customIdOf, isCustomLabel, settings, TILE_VIEWS, type TileId, type TileView } from "../lib/settings";
import { isFoldedView, openTile, usePopupOpen, useTileView } from "../lib/tileView";
import { useSettings } from "../lib/useSettings";
import { usePopup } from "../popup/context";
import { TILE_ICONS } from "../settings/shell/nav";
import { Button } from "./Button";
import { ContextMenu, type MenuItemSpec } from "./ContextMenu";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

const v = shell.views;

interface TileProps {
  /** The widget: a built-in widget's id, or `custom-<id>` for an own widget. */
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
  /**
   * The content grows with the widget: `w`×`h` is the size it was drawn for (the default size, logical px). Made
   * bigger in both directions, the content is laid out at that size and scaled up by the smaller ratio (never
   * down: smaller widgets keep their own layout). `limit` may hold the scale lower (the launchers keep every
   * shortcut in view). Widgets that show more when bigger (lists, the map) leave it out.
   */
  grow?: Grow;
  children: ReactNode;
}

export interface Grow {
  w: number;
  h: number;
  /** The highest scale for a content box of `w`×`h` CSS px. */
  limit?: (w: number, h: number) => number;
}

/** No widget content grows past this. */
const GROW_MAX = 4;

/**
 * The scale of `grow` content in `root` (the tile): the content box against the box the content was drawn for
 * (the same tile at its `grow` size, with this padding and the 1 px border), and the box it is laid out in.
 */
function useGrow(root: React.RefObject<HTMLDivElement>, grow: Grow | undefined, active: boolean) {
  const [box, setBox] = useState<{ w: number; h: number; scale: number } | null>(null);
  const gw = grow?.w ?? 0;
  const gh = grow?.h ?? 0;
  const limit = grow?.limit;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !active || gw <= 0 || gh <= 0) {
      setBox(null);
      return;
    }
    const read = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const borderX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const w = el.clientWidth - padX;
      const h = el.clientHeight - padY;
      if (w <= 0 || h <= 0) return;
      // The content box at the drawn size: the side paddings count on both axes (a tile in the pop-up has less
      // at the top, which only leaves its content a little more room).
      const baseW = gw - parseFloat(cs.paddingLeft) * 2 - Math.max(2, borderX);
      const baseH = gh - parseFloat(cs.paddingLeft) * 2 - Math.max(2, borderY);
      let scale = Math.min(w / baseW, h / baseH, GROW_MAX);
      if (limit) scale = Math.min(scale, limit(w, h));
      scale = Math.max(1, Math.floor(scale * 100) / 100);
      setBox((prev) => (prev && prev.scale === scale && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h, scale }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [root, active, gw, gh, limit]);
  return box;
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

/** The icon of a widget for its folded face and its pop-up's header: an own widget's picture, or the tile icon. */
export function tileArt(label: string, face?: { art: ReactNode }): ReactNode {
  return face?.art ?? (isBuiltIn(label) ? <Icon name={TILE_ICONS[label]} size={24} /> : null);
}

/** «Маленький» and «Средний»: the widget folded to its icon (and name); a click opens it in the pop-up. */
function TileFace({ view, art, name, open }: { view: TileView; art: ReactNode; name: string; open: boolean }) {
  return (
    <button
      type="button"
      className="tile-face"
      aria-label={v.open(name)}
      aria-expanded={open}
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

/**
 * Glass tile root: material, 1 px border, top edge highlight, radius, padding; context menu; edit mode; views.
 * Inside the pop-up (PopupHost) it is the content of the card: no edit mode, and its menu can close the pop-up.
 */
export function Tile({ label, minSize, className, background = true, menuItems, face, grow, children }: TileProps) {
  const s = useSettings();
  const popup = usePopup();
  const locked = s.lockLayout;
  const view = useTileView();
  const foldable = isFoldedView(view);
  const open = usePopupOpen();
  const rootRef = useRef<HTMLDivElement>(null);
  const growBox = useGrow(rootRef, grow, !foldable);
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
  // The pop-up shows a widget, never arranges it.
  const editing = edit.editing && !popup;
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItemSpec[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // The background follows its switch; the folded icon always has one, so it reads on any wallpaper. The native
  // acrylic is under it unless the transparency is «Нет» (then the background is solid and the acrylic would be
  // work for nothing). The pop-up's card draws its own background.
  const hasBackground = background || foldable;
  const solid = resolveLook(s.style, s.look, s.theme).material === "solid";
  const glass = hasBackground && !solid;
  useEffect(() => {
    if (!popup) invoke("set_tile_glass", { on: glass }).catch(() => undefined);
  }, [glass, popup]);

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
    if (editing) {
      // While moving or resizing, the menu offers a step back and the way out.
      const done: MenuItemSpec = { id: "done", label: ru.common.done, icon: "checkmark", onSelect: edit.stop };
      show(edit.canUndo ? [{ id: "undo", label: ru.edit.undo, icon: "arrow_undo", onSelect: () => void edit.undo() }, done] : [done]);
      return;
    }
    // The widget's own items act on its content: only where it is shown.
    const extra = !foldable ? (menuItems?.(e.target as HTMLElement) ?? []) : [];
    const custom = isCustomLabel(label);
    const standard: MenuItemSpec[] = [
      ...(popup ? [{ id: "close", label: v.close, icon: "dismiss", onSelect: popup.close }] : []),
      ...(foldable ? [{ id: "open", label: v.open(name), icon: "open", onSelect: () => void openTile() }] : []),
      // Moving belongs to the icon on the desktop, not to the pop-up. Locked: the item says why it does nothing.
      ...(popup
        ? []
        : [{ id: "move", label: locked ? ru.edit.locked : ru.menu.moveResize, icon: "arrow_move", onSelect: edit.start, disabled: locked }]),
      {
        id: "size",
        label: v.size,
        icon: "resize",
        onSelect: () => undefined,
        children: TILE_VIEWS.map((tv) => ({
          id: `size-${tv}`,
          label: v[tv],
          checked: tv === (popup ? (s.tileViews[label] ?? "manual") : view),
          onSelect: () => void settings.setTileView(label, tv),
        })),
      },
      {
        id: "settings",
        label: ru.menu.settings,
        icon: "settings",
        // An own widget's settings are its editor on «Виджеты».
        onSelect: () =>
          void invoke("open_settings", custom ? { tab: "widgets", edit: customIdOf(label) } : { tab: label }).catch(() => undefined),
      },
      { id: "hide", label: ru.menu.hide, icon: "eye_off", onSelect: () => void hideTile(label) },
    ];
    show(extra.length ? [...extra, { id: "sep", label: "", separator: true, onSelect: () => undefined }, ...standard] : standard);
  };

  // Tiles are not activated by clicks (no jump in the z-order). A text field (the map search) needs the
  // keyboard, so pressing on one activates this tile on purpose.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!popup && (e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) {
      invoke("activate_tile").catch(() => undefined);
    }
  };

  const cls = [
    "tile",
    className ?? "",
    popup ? "in-popup" : "",
    foldable ? `view-${view} folded` : "",
    foldable && open ? "popup-open" : "",
    hasBackground ? "" : "no-bg",
    editing ? "editing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // The edit buttons of a folded icon have no room for words.
  const compactPill = foldable;
  return (
    <div
      ref={rootRef}
      className={cls}
      onContextMenu={onContextMenu}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={editing ? edit.onDragStart : undefined}
    >
      {foldable ? (
        <TileFace view={view} art={tileArt(label, face)} name={name} open={open} />
      ) : grow ? (
        <div
          className="tile-grow"
          style={
            growBox
              ? ({ width: growBox.w / growBox.scale, height: growBox.h / growBox.scale, transform: growBox.scale > 1 ? `scale(${growBox.scale})` : undefined } as CSSProperties)
              : undefined
          }
        >
          {children}
        </div>
      ) : (
        children
      )}
      {editing && (
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
      {editing && !foldable && <div className="resize-grip" onPointerDown={edit.onResizeStart} />}
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
