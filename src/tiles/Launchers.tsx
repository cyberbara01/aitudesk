import { useCallback, useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Tile, type Grow } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.launchers";
import { CELL_GAP, CELL_SIZE, openLaunchersSettings, removeCustom, setBuiltIn, visibleLaunchers, type LauncherItem } from "../lib/launchers";
import { useSettings } from "../lib/useSettings";
import { LaunchersGrid } from "../settings/launchers/LaunchersGrid";

/**
 * «Ярлыки»: the shared LaunchersGrid (64 px cells measured from the tile's content box; rows that do not fit
 * scroll, «Добавить» closes the list, the rule is documented on the grid). Click opens the
 * URL in the default browser; right-click offers Изменить (the settings editor) on every launcher, then
 * Удалить for a custom one and Выключить ярлык for a built-in one (built-ins are switched off, not deleted).
 * Fluent icons the user picked (custom launchers, edited built-ins) are drawn from the markup cached in the
 * launcher, so this window never loads the full icon set.
 */
/**
 * How big the shortcuts may grow in a content box of `w`×`h`: as big as fits with every one of `count` cells in
 * view (the best number of columns), so a few shortcuts grow large and many stay small enough to be all seen.
 */
function fitAll(count: number) {
  return (w: number, h: number) => {
    let best = 0;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const needW = cols * CELL_SIZE + (cols - 1) * CELL_GAP;
      const needH = rows * CELL_SIZE + (rows - 1) * CELL_GAP;
      best = Math.max(best, Math.min(w / needW, h / needH));
    }
    return best;
  };
}

export function LaunchersTile() {
  const s = useSettings();
  const items = useMemo(() => visibleLaunchers(s), [s]);
  const { showLabels, background } = s.launchers;
  // Drawn for the default size (src-tauri/src/layout.rs); a bigger widget shows bigger shortcuts, as long as all of
  // them (and «Добавить») stay in view.
  const cells = items.length + 1;
  const grow = useMemo<Grow>(() => ({ w: 280, h: 184, limit: fitAll(cells) }), [cells]);

  const openSettings = useCallback(() => void openLaunchersSettings(), []);
  const open = useCallback((it: LauncherItem) => void openUrl(it.url).catch(() => undefined), []);

  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const id = target.closest<HTMLElement>("[data-launcher]")?.dataset.launcher;
      const item = id ? items.find((it) => it.id === id) : undefined;
      if (!item) return [];
      const edit: MenuItemSpec = { id: "edit", label: ru.menu.edit, icon: "edit", onSelect: () => void openLaunchersSettings(item.id) };
      if (item.kind === "custom") {
        return [edit, { id: "remove", label: ru.menu.remove, icon: "delete", onSelect: () => void removeCustom(item.id) }];
      }
      return [edit, { id: "off", label: extra.menuTurnOff, icon: "eye_off", onSelect: () => void setBuiltIn(item.id, false) }];
    },
    [items],
  );

  return (
    <Tile label="launchers" className="tile-launchers" background={background} menuItems={menuItems} grow={grow}>
      <LaunchersGrid items={items} showLabels={showLabels} onOpen={open} onSettings={openSettings} />
    </Tile>
  );
}
