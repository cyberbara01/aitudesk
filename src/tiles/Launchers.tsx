import { useCallback, useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.launchers";
import { openLaunchersSettings, removeCustom, setBuiltIn, visibleLaunchers, type LauncherItem } from "../lib/launchers";
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
export function LaunchersTile() {
  const s = useSettings();
  const items = useMemo(() => visibleLaunchers(s), [s]);
  const { showLabels, background } = s.launchers;

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
    <Tile label="launchers" className="tile-launchers" background={background} menuItems={menuItems}>
      <LaunchersGrid items={items} showLabels={showLabels} onOpen={open} onSettings={openSettings} />
    </Tile>
  );
}
