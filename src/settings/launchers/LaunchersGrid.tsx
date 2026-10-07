import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from "react";
import { Tooltip } from "../../components/Tooltip";
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
  /** Settings preview: how many launchers do not fit (0 when all fit). */
  onHiddenChange?: (hidden: number) => void;
}

/** Below this many cells a «+N» cell would leave (almost) no room for launchers, so none is shown. */
const MIN_SLOTS_FOR_MORE = 3;

/**
 * The launcher grid shared by the tile and the settings preview: 64 px cells, columns and rows measured
 * from the grid's own content box. `.ln-grid` covers the tile's content area exactly (it pads itself by
 * the width of a focus ring and pulls back with a negative margin, so rings of edge cells are not clipped);
 * whole rows that do not fit are cut, never scrolled (brief 3.3).
 *
 * Overflow rule, per cell budget `slots = cols × rows` (at least 1, cellsThatFit clamps):
 *  1. items.length <  slots: every launcher, then «Добавить» in the next free cell.
 *  2. items.length === slots: every launcher, no add cell. Only the add cell overflows, and a real
 *     launcher is never sacrificed for it; adding stays reachable via ПКМ, «Настройки плитки».
 *  3. items.length >  slots, slots >= 3: the first slots-1 launchers, then «+N» in the LAST cell, N = hidden
 *     launchers (the add cell is never counted). «+N» opens the settings page, where «Добавить» lives.
 *  4. items.length >  slots, slots < 3 (a tile near its 120 x 136 minimum): only the first launchers, no
 *     «+N»: a tile showing nothing but «+5 Ещё» is the look the author rejected.
 * «+N» therefore never appears just to make room for «Добавить» (the 280×170 Aqua case: 3 built-ins in a
 * 3×1 grid show all three launchers).
 *
 * On the real tile a cell shows the full name in a tooltip whenever its caption does not: captions hidden,
 * a short built-in name («DU»), or a name cut with an ellipsis.
 */
export function LaunchersGrid({ items, showLabels, onOpen, onSettings, onHiddenChange }: Props) {
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
    // Content box on both paths (the focus-ring padding is not room for cells).
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
  const tight = slots < MIN_SLOTS_FOR_MORE;
  const overflow = items.length > slots;
  const shown = overflow ? items.slice(0, tight ? slots : slots - 1) : items;
  const hidden = items.length - shown.length;
  const showMore = overflow && !tight;
  const showAdd = items.length < slots;

  useEffect(() => {
    onHiddenChange?.(hidden);
  }, [hidden, onHiddenChange]);

  return (
    <div ref={gridRef} className="ln-grid" style={{ "--ln-cols": fit.cols } as CSSProperties}>
      {shown.map((it) =>
        onOpen ? (
          <TileCell key={it.id} item={it} showLabels={showLabels} onOpen={onOpen} />
        ) : (
          <LauncherCell key={it.id} look={it} showLabel={showLabels} />
        ),
      )}
      {showMore && (
        <ServiceTip key="more" text={extra.hiddenLaunchers(hidden)} on={Boolean(onSettings) && !showLabels}>
          <ServiceCell
            variant="more"
            text={`+${hidden}`}
            caption={extra.more}
            ariaLabel={extra.hiddenLaunchers(hidden)}
            showLabel={showLabels}
            onClick={onSettings}
          />
        </ServiceTip>
      )}
      {showAdd && (
        <ServiceTip key="add" text={ru.settings.launchers.addLauncher} on={Boolean(onSettings) && !showLabels}>
          <ServiceCell variant="add" caption={ru.launchers.add} ariaLabel={ru.settings.launchers.addLauncher} showLabel={showLabels} onClick={onSettings} />
        </ServiceTip>
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

/** «Добавить» / «+N» on the real tile name themselves in a tooltip only while captions are hidden. */
function ServiceTip({ text, on, children }: { text: string; on: boolean; children: ReactElement }) {
  return on ? <Tooltip text={text}>{children}</Tooltip> : children;
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
