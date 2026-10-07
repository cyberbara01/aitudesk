import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from "react";
import { Tooltip } from "../../components/Tooltip";
import { ru } from "../../i18n/ru";
import { CELL_GAP, CELL_SIZE, cellsThatFit, contentBox, type LauncherItem } from "../../lib/launchers";
import { AddCell, LauncherCell } from "./LauncherIcon";

/** One row of the grid: a cell and the gap below it. */
const ROW = CELL_SIZE + CELL_GAP;
/** One notch of the wheel in WebView2, px. Windows may merge a quick spin into one event of several notches. */
const NOTCH = 120;
/** Wheel travel worth one row: a notch is 100 to 120 px, a touchpad swipe adds up in small steps. */
const WHEEL_ROW = 60;
/** A pause in the wheel longer than this starts counting from where the grid is now. */
const WHEEL_IDLE_MS = 400;

interface Props {
  items: readonly LauncherItem[];
  showLabels: boolean;
  /** Tile: a launcher cell is a button that opens its URL. Omitted (settings preview) = static cells. */
  onOpen?: (item: LauncherItem) => void;
  /** Tile: «Добавить» opens the settings window. Omitted (settings preview) = static cells. */
  onSettings?: () => void;
  /** Settings preview: how many launchers lie below the rows in view (0 when all fit). */
  onHiddenChange?: (hidden: number) => void;
}

/**
 * The launcher grid shared by the tile and the settings preview: 64 px cells, columns and rows measured
 * from the tile's content box. `.ln-grid` spans the tile's content width and is exactly as tall as the rows
 * that fit, centred (it pads itself by the width of a focus ring and pulls back with a negative margin, so
 * rings of edge cells are not clipped; its scrollbar gutters lie in the tile padding). Every launcher is in
 * the grid: rows that do not fit scroll, a whole row at a time (scroll snap; one notch of the wheel is one
 * row, useRowWheel), so the tile never shows a cut row at rest, and the thumb shows while the pointer is over
 * the grid (base.css). The settings preview does not scroll, it shows the tile at rest.
 *
 * «Добавить» closes the list, in the next free cell or at the end of the scrolled rows, unless it alone would
 * make the grid scroll (launchers exactly fill the rows in view): then adding stays in the right-click menu,
 * «Настройки виджета».
 *
 * On the real tile a cell shows the full name in a tooltip whenever its caption does not: captions hidden,
 * a short built-in name («DU»), or a name cut with an ellipsis.
 */
export function LaunchersGrid({ items, showLabels, onOpen, onSettings, onHiddenChange }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ cols: 3, rows: 2 });

  useLayoutEffect(() => {
    // The room is the tile's content box: the grid's own height follows the rows it shows.
    const box = gridRef.current?.parentElement;
    if (!box) return;
    const measure = (w: number, h: number) =>
      setFit((prev) => {
        const next = { cols: cellsThatFit(w), rows: cellsThatFit(h) };
        return prev.cols === next.cols && prev.rows === next.rows ? prev : next;
      });
    // Content box on both paths (the tile padding is not room for cells).
    const initial = contentBox(box);
    measure(initial.w, initial.h);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width, r.height);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useRowWheel(gridRef, Boolean(onOpen));

  const slots = fit.cols * fit.rows;
  const hidden = Math.max(0, items.length - slots);
  const showAdd = items.length !== slots;

  useEffect(() => {
    onHiddenChange?.(hidden);
  }, [hidden, onHiddenChange]);

  return (
    <div ref={gridRef} className="ln-grid" style={{ "--ln-cols": fit.cols, "--ln-rows": fit.rows } as CSSProperties}>
      {items.map((it) =>
        onOpen ? (
          <TileCell key={it.id} item={it} showLabels={showLabels} onOpen={onOpen} />
        ) : (
          <LauncherCell key={it.id} look={it} showLabel={showLabels} />
        ),
      )}
      {showAdd && (
        <AddTip key="add" on={Boolean(onSettings) && !showLabels}>
          <AddCell caption={ru.launchers.add} ariaLabel={ru.settings.launchers.addLauncher} showLabel={showLabels} onClick={onSettings} />
        </AddTip>
      )}
    </div>
  );
}

/** A launcher on the real tile: the button plus a tooltip with the full name when the caption does not show it. */
function TileCell({ item, showLabels, onOpen }: { item: LauncherItem; showLabels: boolean; onOpen: (item: LauncherItem) => void }) {
  const captionRef = useRef<HTMLSpanElement>(null);
  const cut = useTextCut(captionRef, showLabels ? item.caption : null);
  const tip = !showLabels || item.caption !== item.name || cut;
  return (
    <Tooltip text={item.name} disabled={!tip}>
      <LauncherCell look={item} showLabel={showLabels} launcherId={item.id} onClick={() => onOpen(item)} captionRef={captionRef} />
    </Tooltip>
  );
}

/** «Добавить» on the real tile names itself in a tooltip only while captions are hidden. */
function AddTip({ on, children }: { on: boolean; children: ReactElement }) {
  return on ? <Tooltip text={ru.settings.launchers.addLauncher}>{children}</Tooltip> : children;
}

/**
 * The wheel moves the grid one row per notch, smoothly. Left to the browser, a notch (120 px in WebView2) snaps
 * to the second row ahead, so a tile showing one row would skip rows (scroll-snap-stop is not honoured for
 * the wheel). A touchpad adds its small steps up to a row's worth; an event that carries several notches moves
 * as many rows. Steps taken in a row add up to a target, so a quick spin goes as far as it should; after a
 * pause the count starts again from where the grid is.
 */
function useRowWheel(ref: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let travel = 0;
    let target = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollHeight - el.clientHeight;
      if (e.ctrlKey || max <= 0) return;
      const dy =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 40 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? e.deltaY * el.clientHeight : e.deltaY;
      if (Math.abs(dy) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      const now = performance.now();
      if (now - last > WHEEL_IDLE_MS) {
        travel = 0;
        target = Math.round(el.scrollTop / ROW) * ROW;
      }
      last = now;
      travel += dy;
      if (Math.abs(travel) < WHEEL_ROW) return;
      const rows = Math.max(1, Math.round(Math.abs(travel) / NOTCH));
      target = Math.min(max, Math.max(0, target + Math.sign(travel) * rows * ROW));
      travel = 0;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ top: target, behavior: still ? "auto" : "smooth" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, enabled]);
}

/**
 * True while the text of `ref` does not fit its box (it ends in an ellipsis). The box keeps its size when only
 * the text width changes, so besides the text itself the check also follows the design language (it swaps the
 * font through data-style on <html>) and fonts that finish loading after the first frame.
 */
function useTextCut(ref: RefObject<HTMLElement>, text: string | null): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || text === null) {
      setCut(false);
      return;
    }
    const check = () => setCut(el.scrollWidth > el.clientWidth);
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-style"] });
    document.fonts.addEventListener("loadingdone", check);
    return () => {
      mo.disconnect();
      document.fonts.removeEventListener("loadingdone", check);
    };
  }, [ref, text]);
  return cut;
}
