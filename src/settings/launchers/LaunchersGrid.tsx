import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ru } from "../../i18n/ru";
import { extra } from "../../i18n/ru.extra.launchers";
import { cellsThatFit, contentBox, type LauncherItem } from "../../lib/launchers";
import { LauncherCell, ServiceCell } from "./LauncherIcon";

interface Props {
  items: readonly LauncherItem[];
  showLabels: boolean;
  /** Tile: a launcher cell is a button that opens its URL. Omitted (settings preview) = static cells. */
  onOpen?: (item: LauncherItem) => void;
  /** Tile: «Добавить» and «+N» open the settings window. Omitted (settings preview) = static cells. */
  onSettings?: () => void;
}

/**
 * The launcher grid shared by the tile and the settings preview: 64 px cells, columns and rows measured
 * from the grid's own content box (`.ln-grid` fills the tile's content area), whole rows that do not fit
 * are cut, never scrolled (brief 3.3).
 *
 * Overflow rule, per cell budget `slots = cols × rows` (≥ 1, cellsThatFit clamps):
 *  1. items.length <  slots → every launcher, then «Добавить» in the next free cell.
 *  2. items.length === slots → every launcher, no add cell. Only the add cell overflows and a real
 *     launcher is never sacrificed for it; adding stays reachable via ПКМ → «Настройки плитки».
 *  3. items.length >  slots → the first slots−1 launchers, then «+N» in the LAST cell, N = hidden
 *     launchers (the add cell is never counted). «+N» opens the settings page, where «Добавить» lives.
 * «+N» therefore never appears just to make room for «Добавить» (the 280×170 Aqua case: 3 built-ins in a
 * 3×1 grid show all three launchers).
 */
export function LaunchersGrid({ items, showLabels, onOpen, onSettings }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ cols: 3, rows: 2 });

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = (w: number, h: number) =>
      setFit((prev) => {
        const next = { cols: cellsThatFit(w), rows: cellsThatFit(h) };
        return prev.cols === next.cols && prev.rows === next.rows ? prev : next;
      });
    // Content box on both paths: the grid carries a small padding so focus rings of edge cells are not clipped.
    const initial = contentBox(el);
    measure(initial.w, initial.h);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slots = fit.cols * fit.rows;
  const overflow = items.length > slots;
  const shown = overflow ? items.slice(0, slots - 1) : items;
  const hidden = items.length - shown.length;
  const showAdd = items.length < slots;

  return (
    <div ref={gridRef} className="ln-grid" style={{ "--ln-cols": fit.cols } as CSSProperties}>
      {shown.map((it) => (
        <LauncherCell key={it.id} look={it} showLabel={showLabels} launcherId={it.id} onClick={onOpen ? () => onOpen(it) : undefined} />
      ))}
      {overflow && (
        <ServiceCell
          variant="more"
          text={`+${hidden}`}
          caption={extra.more}
          ariaLabel={extra.hiddenLaunchers(hidden)}
          showLabel={showLabels}
          onClick={onSettings}
        />
      )}
      {showAdd && (
        <ServiceCell variant="add" caption={ru.launchers.add} ariaLabel={ru.settings.launchers.addLauncher} showLabel={showLabels} onClick={onSettings} />
      )}
    </div>
  );
}
