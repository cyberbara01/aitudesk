// «Карта AITU» (brief §3.4): block C1 on the glass, driven by settings.map. The colour scheme, label and
// pictogram toggles and the switch side are data attributes on .map-root (map.css reads them); the search
// field and the zoom buttons can be hidden; the floor at start is the remembered or the default one; a right
// click on a room adds it to the favourites in one of FAVORITE_COLORS or recolours / removes it.
import { useCallback, useEffect, useRef } from "react";
import { IconButton } from "../components/Button";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { FAVORITE_COLORS } from "../lib/design";
import { settings, type MapFavorite, type MapSettings } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { FloorSwitch } from "../map/FloorSwitch";
import { MapCanvas, type MapCanvasHandle } from "../map/MapCanvas";
import { MapSearch } from "../map/MapSearch";
import { roomFromTarget } from "../map/rooms";
import { toFloor, type Floor } from "../map/types";
import { useRoomSearch } from "../map/useRoomSearch";

const MIN_SIZE = { w: 400, h: 220 };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function setFavorites(mutate: (current: readonly MapFavorite[]) => MapFavorite[]) {
  void settings.updateMap({ favorites: mutate(settings.get().map.favorites) });
}

/** Context-menu items for a room: add in a colour, or (already a favourite) remove / recolour. */
function roomMenu(room: string, favorites: readonly MapFavorite[]): MenuItemSpec[] {
  const fav = favorites.find((f) => f.room === room);
  const colorItems = (base: string | null, skip: string | null): MenuItemSpec[] =>
    FAVORITE_COLORS.flatMap((color, i) => {
      if (skip && color.toUpperCase() === skip.toUpperCase()) return [];
      const name = extra.favoriteColorNames[i] ?? color;
      return [
        {
          id: `color-${color}`,
          label: base ? extra.withColor(base, name) : capitalize(name),
          swatch: color,
          onSelect: () =>
            setFavorites((cur) =>
              cur.some((f) => f.room === room) ? cur.map((f) => (f.room === room ? { ...f, color } : f)) : [...cur, { room, color }],
            ),
        },
      ];
    });
  if (!fav) return colorItems(ru.menu.favorite, null);
  return [
    {
      id: "unfavorite",
      label: ru.menu.unfavorite,
      icon: "star_off",
      onSelect: () => setFavorites((cur) => cur.filter((f) => f.room !== room)),
    },
    { id: "sep-colors", label: "", separator: true, onSelect: () => undefined },
    ...colorItems(ru.menu.favoriteColor, fav.color),
  ];
}

export function MapTile() {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  // The first floor and the tile background come from disk: nothing is drawn (and nothing animates) before they arrive.
  if (!loaded) return null;
  return <MapTileBody map={s.map} />;
}

function MapTileBody({ map }: { map: MapSettings }) {
  const initial: Floor = map.rememberFloor ? map.lastFloor : map.defaultFloor;
  const { floor, setFloor, query, setQueryText, clear } = useRoomSearch(initial);
  const canvas = useRef<MapCanvasHandle>(null);

  // Remember the floor shown last (used at the next start when «Запоминать последний этаж» is on).
  const shown = useRef(floor);
  useEffect(() => {
    if (shown.current === floor) return;
    shown.current = floor;
    if (settings.get().map.lastFloor !== floor) void settings.updateMap({ lastFloor: floor });
  }, [floor]);

  // Keys 1/2/3 and PgUp/PgDn switch floors unless a text field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      let next: Floor | null = null;
      if (e.key === "1" || e.key === "2" || e.key === "3") next = toFloor(Number(e.key));
      else if (e.key === "PageUp") next = toFloor(Math.min(3, floor + 1));
      else if (e.key === "PageDown") next = toFloor(Math.max(1, floor - 1));
      if (next === null) return;
      e.preventDefault();
      if (next !== floor) setFloor(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floor, setFloor]);

  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const room = roomFromTarget(target, floor);
      return room ? roomMenu(room, map.favorites) : [];
    },
    [floor, map.favorites],
  );

  return (
    <Tile label="map" minSize={MIN_SIZE} className="tile-map" background={map.background} menuItems={menuItems}>
      <div
        className="map-root"
        data-map-scheme={map.scheme}
        data-switch={map.switchSide}
        data-labels={map.showLabels ? "on" : "off"}
        data-icons={map.showIcons ? "on" : "off"}
      >
        <MapCanvas ref={canvas} floor={floor} query={query} favorites={map.favorites} />
        {map.showSearch && <MapSearch className="map-overlay-search" value={query} onChange={setQueryText} onClear={clear} />}
        <FloorSwitch className="map-overlay-floors" floor={floor} onChange={setFloor} />
        {map.showZoom && (
          <div className="map-zoom">
            <IconButton icon="add" label={ru.map.zoomIn} onClick={() => canvas.current?.zoomIn()} />
            <IconButton icon="subtract" label={ru.map.zoomOut} onClick={() => canvas.current?.zoomOut()} />
            <IconButton icon="arrow_reset" label={ru.map.fit} onClick={() => canvas.current?.fit()} />
          </div>
        )}
      </div>
    </Tile>
  );
}
