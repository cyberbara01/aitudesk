// Right-click menus of the widgets as real Windows menus (the Tauri menu API). Windows draws them outside the
// widget's window, so a small widget never squeezes a menu: the items keep their full size, never wrap and stay on
// screen near any edge, and the keyboard, the light or dark look (as in Windows) and closing are the system's own.
// Item icons are the app's Fluent icons, drawn into small bitmaps in the colour of the menu's text.
import { Image } from "@tauri-apps/api/image";
import { IconMenuItem, Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MenuItemSpec } from "../components/ContextMenu";
import { loadIcon } from "../components/Icon";

/** Logical size of a menu icon. Windows draws menu bitmaps pixel for pixel, so they are made at the screen's scale. */
const ICON = 16;
/** Glyph colour on Windows' dark and light menus. */
const INK = { dark: "#F3F3F3", light: "#1B1B1B" } as const;

const label = getCurrentWindow().label;
/** Menu item ids are global in the app (all widgets share one menu event table): window label plus a counter. */
let serial = 0;
/**
 * The menu shown last and its items; released when the next one opens, so the handlers outlive the click that
 * closed it. The items are created one by one and kept: an item created inline in `Menu.new` loses its handler as
 * soon as the menu is built (Tauri drops its own copy of the item and with it the handler), and a click then does
 * nothing.
 */
let shown: { close(): Promise<void> }[] = [];
/** Icon bitmaps by name, colour and scale: drawn once, kept for the life of the page (a handful of small images). */
const bitmaps = new Map<string, Promise<Image | null>>();

function bitmap(key: string, draw: (ctx: CanvasRenderingContext2D, px: number) => Promise<void> | void): Promise<Image | null> {
  let made = bitmaps.get(key);
  if (!made) {
    made = (async () => {
      const px = Math.round(ICON * (window.devicePixelRatio || 1));
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await draw(ctx, px);
      return Image.new(new Uint8Array(ctx.getImageData(0, 0, px, px).data), px, px);
    })().catch(() => null);
    bitmaps.set(key, made);
  }
  return made;
}

function iconBitmap(name: string, dark: boolean): Promise<Image | null> {
  const color = dark ? INK.dark : INK.light;
  return bitmap(`icon:${name}:${color}:${window.devicePixelRatio}`, async (ctx, px) => {
    const svg = await loadIcon(name, 20, "regular");
    if (!svg) return;
    const img = document.createElement("img");
    // A data: URL: the page's content security policy allows images from data: only.
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace("<svg ", `<svg fill="${color}" `))}`;
    await img.decode();
    ctx.drawImage(img, 0, 0, px, px);
  });
}

/** A rounded colour square: the brush colour of «Отметить кабинет» on the map. */
function swatchBitmap(color: string): Promise<Image | null> {
  return bitmap(`swatch:${color}:${window.devicePixelRatio}`, (ctx, px) => {
    const inset = Math.max(1, Math.round(px * 0.125));
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(inset + 0.5, inset + 0.5, px - 2 * inset - 1, px - 2 * inset - 1, Math.round(px * 0.2));
    ctx.fill();
    ctx.stroke();
  });
}

/**
 * Shows `items` as a Windows menu at the pointer. Rejects when the native menu is not available, so the caller can
 * fall back to the menu drawn inside the widget.
 */
export async function popupMenu(items: readonly MenuItemSpec[]): Promise<void> {
  const dark = (await getCurrentWindow().theme()) !== "light";
  serial += 1;
  const prefix = `${label}:${serial}`;
  const parts = await Promise.all(
    items.map(async (it, i) => {
      if (it.separator) return PredefinedMenuItem.new({ item: "Separator" });
      const icon = it.swatch ? await swatchBitmap(it.swatch) : it.icon ? await iconBitmap(it.icon, dark) : null;
      const item = { id: `${prefix}:${i}`, text: it.label, enabled: !it.disabled, action: () => it.onSelect() };
      return icon ? IconMenuItem.new({ ...item, icon }) : MenuItem.new(item);
    }),
  );
  const menu = await Menu.new({ items: parts });
  const previous = shown;
  shown = [menu, ...parts];
  for (const r of previous) void r.close().catch(() => undefined);
  await menu.popup();
}
