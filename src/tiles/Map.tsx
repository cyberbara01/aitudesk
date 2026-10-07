// «Карта AITU» (brief §3.4, 6.3): block C1 driven by settings.map. The colour scheme, label and pictogram toggles,
// the switch side and visibility, the silhouette and the zoom column are data attributes on .map-root (map.css
// reads them); the floor at start is the remembered or the default one. Rooms are marked with a colour in paint
// mode (brush button, palette, click a room) or from the context menu; marks live in settings.map.favorites.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../components/Button";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { FAVORITE_COLORS } from "../lib/design";
import { settings, type MapSettings } from "../lib/settings";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { markRoom, unmarkRoom } from "../map/favorites";
import { FloorSwitch } from "../map/FloorSwitch";
import { MapCanvas, type MapCanvasHandle } from "../map/MapCanvas";
import { MapSearch } from "../map/MapSearch";
import { PaintDock } from "../map/PaintDock";
import { roomAt } from "../map/rooms";
import { toFloor, type Floor, type PaintTool } from "../map/types";
import { useRoomSearch } from "../map/useRoomSearch";

const MIN_SIZE = { w: 400, h: 220 };
const FIRST_COLOR = FAVORITE_COLORS[0].toUpperCase();

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
  const [painting, setPainting] = useState(false);
  const [tool, setTool] = useState<PaintTool>({ kind: "color", color: FIRST_COLOR, custom: false });
  const [custom, setCustom] = useState<string | null>(null);

  // The marked rooms by content: a change elsewhere in the settings (another tile) keeps the same array, so the
  // memoised canvas does not walk the room groups again.
  const favKey = map.favorites.map((f) => `${f.room}=${f.color}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const favorites = useMemo(() => map.favorites, [favKey]);

  // Remember the floor shown last (used at the next start when «Запоминать последний этаж» is on).
  const shown = useRef(floor);
  useEffect(() => {
    if (shown.current === floor) return;
    shown.current = floor;
    if (settings.get().map.lastFloor !== floor) void settings.updateMap({ lastFloor: floor });
  }, [floor]);

  // Keys 1/2/3 and PgUp/PgDn switch floors unless a text field, a menu or the colour popover has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (active?.closest(".ctx-menu, .map-paint-pop")) return;
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

  // Esc ends paint mode (the search field, the colour popover and the context menu take their own Esc first).
  useEffect(() => {
    if (!painting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setPainting(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [painting]);

  // A click on a room in paint mode: the brush colour, or the eraser. The store applies it to its current list.
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const onPaint = useCallback((room: string) => {
    const t = toolRef.current;
    void (t.kind === "erase" ? unmarkRoom(room) : markRoom(room, t.color));
  }, []);

  // Context menu over a room: mark it in the brush colour or remove its mark; anywhere: start painting.
  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const items: MenuItemSpec[] = [];
      const room = roomAt(target, floor);
      if (room) {
        if (map.favorites.some((f) => f.room === room)) {
          items.push({ id: "unmark", label: extra.unmark, icon: "eraser", onSelect: () => void unmarkRoom(room) });
        } else {
          const color = tool.kind === "color" ? tool.color : FIRST_COLOR;
          items.push({ id: "mark", label: extra.mark, swatch: color, onSelect: () => void markRoom(room, color) });
        }
      }
      if (!painting) items.push({ id: "paint", label: extra.paint, icon: "paint_brush", onSelect: () => setPainting(true) });
      return items;
    },
    [floor, map.favorites, painting, tool],
  );

  return (
    <Tile label="map" minSize={MIN_SIZE} className="tile-map" background={map.background} menuItems={menuItems}>
      <div
        className="map-root"
        data-map-scheme={map.scheme}
        data-switch={map.switchSide}
        data-switch-mode={map.switchMode}
        data-labels={map.showLabels ? "on" : "off"}
        data-icons={map.showIcons ? "on" : "off"}
        data-silhouette={map.silhouette ? "on" : "off"}
        data-zoom={map.showZoom ? "on" : "off"}
      >
        <MapCanvas
          ref={canvas}
          floor={floor}
          query={query}
          favorites={favorites}
          painting={painting}
          onPaint={onPaint}
          reserve={map.switchMode === "always" ? map.switchSide : null}
        />
        {map.showSearch && <MapSearch value={query} onChange={setQueryText} onClear={clear} />}
        <FloorSwitch floor={floor} onChange={setFloor} />
        {map.showZoom && (
          <div className="map-zoom">
            <IconButton icon="add" label={ru.map.zoomIn} onClick={() => canvas.current?.zoomIn()} />
            <IconButton icon="subtract" label={ru.map.zoomOut} onClick={() => canvas.current?.zoomOut()} />
            <IconButton icon="arrow_reset" label={ru.map.fit} onClick={() => canvas.current?.fit()} />
          </div>
        )}
        <PaintDock
          painting={painting}
          onPaintingChange={setPainting}
          tool={tool}
          onToolChange={setTool}
          custom={custom}
          onCustomChange={setCustom}
        />
      </div>
    </Tile>
  );
}
