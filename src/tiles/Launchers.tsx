import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.launchers";
import { cellsThatFit, isBuiltInKey, openLaunchersSettings, removeCustom, setBuiltIn, visibleLaunchers } from "../lib/launchers";
import { useSettings } from "../lib/useSettings";
import { LauncherCell, ServiceCell } from "../settings/launchers/LauncherIcon";

/**
 * «Ярлыки»: a grid of 64 px cells (columns and rows measured from the tile's content box), the last cell is
 * "Добавить"; when not everything fits, whole rows are cut and the last visible cell becomes "+N".
 * Click opens the URL in the default browser; right-click offers Изменить / Удалить for the launcher under the cursor.
 */
export function LaunchersTile() {
  const s = useSettings();
  const items = useMemo(() => visibleLaunchers(s), [s]);
  const { showLabels, background } = s.launchers;
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
    measure(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slots = fit.cols * fit.rows;
  const cut = items.length + 1 > slots;
  const shown = cut ? items.slice(0, Math.max(0, slots - 1)) : items;
  const hidden = items.length - shown.length;

  const openSettings = useCallback(() => void openLaunchersSettings(), []);

  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const id = target.closest<HTMLElement>("[data-launcher]")?.dataset.launcher;
      const item = id ? items.find((it) => it.id === id) : undefined;
      if (!item) return [];
      const remove =
        item.kind === "custom"
          ? () => void removeCustom(item.id)
          : () => {
              if (isBuiltInKey(item.id)) void setBuiltIn(item.id, false);
            };
      return [
        { id: "edit", label: ru.menu.edit, icon: "edit", onSelect: () => void openLaunchersSettings(item.id) },
        { id: "remove", label: ru.menu.remove, icon: "delete", onSelect: remove },
      ];
    },
    [items],
  );

  return (
    <Tile label="launchers" className="tile-launchers" background={background} menuItems={menuItems}>
      <div ref={gridRef} className="ln-grid" style={{ "--ln-cols": fit.cols } as CSSProperties}>
        {shown.map((it) => (
          <LauncherCell
            key={it.id}
            look={it}
            showLabel={showLabels}
            launcherId={it.id}
            onClick={() => void openUrl(it.url).catch(() => undefined)}
          />
        ))}
        {cut ? (
          <ServiceCell
            variant="more"
            text={`+${hidden}`}
            caption={extra.more}
            ariaLabel={extra.hiddenLaunchers(hidden)}
            showLabel={showLabels}
            onClick={openSettings}
          />
        ) : (
          <ServiceCell
            variant="add"
            caption={ru.launchers.add}
            ariaLabel={ru.settings.launchers.addLauncher}
            showLabel={showLabels}
            onClick={openSettings}
          />
        )}
      </div>
    </Tile>
  );
}
