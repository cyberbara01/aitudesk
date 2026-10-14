// «Карта AITU»: block C1 driven by settings.map. The colour scheme, label and pictogram toggles,
// the switch side and visibility, the silhouette and the zoom column are data attributes on .map-root (map.css
// reads them); the floor at start is the remembered or the default one. Rooms are marked with a colour in paint
// mode (brush button, palette, click a room) or from the context menu; marks live in settings.map.favorites.
// «Показывать ближайшую пару» marks the room of the lesson running now or starting within 30 minutes
// (src/map/nextLesson.ts), with a dot on its floor's button while another floor is shown and a bubble on hover.
// «Непрозрачность» fades the whole widget on the desktop; with «Проявлять при наведении» it comes forward under the
// pointer, while its search field is in use and while it shows a room the schedule asked for (useLit).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "../components/Button";
import type { MenuItemSpec } from "../components/ContextMenu";
import { Tile } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { FAVORITE_COLORS, mapVars } from "../lib/design";
import { usePointerOver, useTyping } from "../lib/hover";
import { minutesUntil } from "../lib/schedule";
import { settings, type Lesson, type MapSettings } from "../lib/settings";
import { IN_HOST, openTile, useFolded } from "../lib/tileView";
import { useSettings, useSettingsLoaded } from "../lib/useSettings";
import { markRoom, restoreRoom, roomState, unmarkRoom, type RoomState } from "../map/favorites";
import { FloorSwitch } from "../map/FloorSwitch";
import { LessonTip } from "../map/LessonTip";
import { MapCanvas, type MapCanvasHandle } from "../map/MapCanvas";
import { MapSearch } from "../map/MapSearch";
import { useNextLesson, type NextLesson } from "../map/nextLesson";
import { PaintDock } from "../map/PaintDock";
import { roomAt } from "../map/rooms";
import { LABELS_ZOOM, toFloor, type Floor, type PaintTool } from "../map/types";
import { useRoomSearch } from "../map/useRoomSearch";
import { usePopup } from "../popup/context";
import { useStack } from "../stack/context";

const MIN_SIZE = { w: 400, h: 220 };
const FIRST_COLOR = FAVORITE_COLORS[0].toUpperCase();
/** Paint steps kept for «Отменить»: far more than anyone undoes. */
const PAINT_UNDO_LIMIT = 100;
/** Windows virtual key of Z: Ctrl+Z in any keyboard layout. */
const VK_Z = 0x5a;
/** Tauri event from the schedule tile: show a lesson's room. */
const FOCUS_EVENT = "map-focus-room";
/** How long a room asked for by the schedule tile but missing from the plan stays in the search field (ms). */
const NOT_FOUND_MS = 2600;
/** How long a room shown on request of the schedule tile stays highlighted, unless the user takes over the search. */
const FOCUS_HOLD_MS = 12000;
/** The lesson bubble opens after the kit Tooltip's delay (ms). */
const TIP_DELAY = 500;
const NO_LESSONS: readonly Lesson[] = [];
/** The bubble's two lines: the title, then when the lesson runs (no marker at all while the schedule is private). */
function lessonTip(next: NextLesson): { title: string; when: string } {
  const l = next.lesson;
  return {
    title: l.title.trim() || ru.schedule.lesson,
    when: next.running
      ? `${ru.schedule.now} · ${ru.schedule.until(l.end)}`
      : `${ru.schedule.next} · ${ru.schedule.startsIn(minutesUntil(l, new Date()))}`,
  };
}

export function MapTile() {
  const s = useSettings();
  const loaded = useSettingsLoaded();
  // The first floor and the tile background come from disk: nothing is drawn (and nothing animates) before they arrive.
  if (!loaded) return null;
  return <MapTileBody map={s.map} lessons={s.schedule.lessons} privacy={s.schedule.privacy} />;
}

interface BodyProps {
  map: MapSettings;
  /** settings.schedule.lessons, for the lesson marker. */
  lessons: readonly Lesson[];
  /** settings.schedule.privacy: the schedule hides its texts, so the map does not point at the lesson's room either. */
  privacy: boolean;
}

function MapTileBody({ map, lessons, privacy }: BodyProps) {
  const initial: Floor = map.rememberFloor ? map.lastFloor : map.defaultFloor;
  const { floor, setFloor, text, query, setQueryText, clear } = useRoomSearch(initial);
  const canvas = useRef<MapCanvasHandle>(null);
  const [painting, setPainting] = useState(false);
  // The zoom buttons grey out where they would do nothing: «Приблизить» at the largest zoom, the other two fitted.
  const [limits, setLimits] = useState({ atMax: false, atFit: true });
  const onLimits = useCallback((atMax: boolean, atFit: boolean) => setLimits({ atMax, atFit }), []);
  // Rooms the query matches on the shown floor; «Ничего не найдено» when a query matches none.
  const [matches, setMatches] = useState(0);
  const notFound = query !== "" && matches === 0;
  // Centre-and-zoom requests for MapCanvas; `fromEvent` marks the ones the schedule tile sent.
  const [focusSeq, setFocusSeq] = useState(0);
  const fromEvent = useRef(false);
  // The schedule tile asked for a room that is not on the plan: the search field shows that briefly.
  const [flash, setFlash] = useState(false);

  // The lesson marker. The lessons by content (the store hands out a new array on every change anywhere) and only
  // while the option is on, so its timer restarts on real lesson edits alone.
  // While the schedule hides its texts on the desktop, the map does not reveal where the lesson is either.
  const showNext = map.showNextLesson && !privacy;
  const lessonsKey = showNext ? JSON.stringify(lessons) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const watched = useMemo(() => (showNext ? lessons : NO_LESSONS), [lessonsKey]);
  // Folded to its icon, the marker does not tick.
  const folded = useFolded();
  const lesson = useNextLesson(watched, showNext && !folded);
  const foldedRef = useRef(folded);
  foldedRef.current = folded;

  // The bubble over the marked room: opens after the delay, goes when the pointer leaves the room or the map moves.
  const [tipAt, setTipAt] = useState<DOMRect | null>(null);
  const tipTimer = useRef(0);
  const onMarkHover = useCallback((box: DOMRect | null) => {
    window.clearTimeout(tipTimer.current);
    if (box) tipTimer.current = window.setTimeout(() => setTipAt(box), TIP_DELAY);
    else setTipAt(null);
  }, []);
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);
  useEffect(() => {
    if (!tipAt) return;
    const hide = () => setTipAt(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [tipAt]);

  const focusFound = useCallback(() => {
    fromEvent.current = false;
    setFocusSeq((s) => s + 1);
  }, []);

  const onFocusResult = useCallback((found: boolean) => {
    if (!found && fromEvent.current) setFlash(true);
    fromEvent.current = false;
  }, []);

  // A see-through map comes forward while it shows a room the schedule asked for (focusRoom): until the user takes
  // over the search, the room turns out not to be on the plan, or the hold is over.
  const [showing, setShowing] = useState(false);

  const onSearchText = useCallback(
    (raw: string) => {
      setFlash(false);
      setShowing(false);
      setQueryText(raw);
    },
    [setQueryText],
  );

  const onSearchClear = useCallback(() => {
    setFlash(false);
    setShowing(false);
    clear();
  }, [clear]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => {
      setFlash(false);
      setShowing(false);
      clear();
    }, NOT_FOUND_MS);
    return () => window.clearTimeout(t);
  }, [flash, clear]);

  // «map-focus-room» from the schedule tile: { room } is a normalised code («C1.2.223K», «223», «1.352K»). The
  // same lookup as the search field: its floor, the highlight, then centre and zoom on it.
  // The highlight is a reply, not a lasting search: it clears by itself after a while (also when the search field
  // is hidden and nothing else could clear it), unless the user has typed something else meanwhile.
  const textRef = useRef(text);
  textRef.current = text;
  const hold = useRef(0);
  useEffect(() => () => window.clearTimeout(hold.current), []);
  const focusRoom = useCallback(
    (room: string) => {
      setFlash(false);
      setQueryText(room);
      fromEvent.current = true;
      setFocusSeq((s) => s + 1);
      setShowing(true);
      window.clearTimeout(hold.current);
      hold.current = window.setTimeout(() => {
        setShowing(false);
        if (textRef.current.trim().toUpperCase() === room.toUpperCase()) clear();
      }, FOCUS_HOLD_MS);
    },
    [setQueryText, clear],
  );
  // Heard for this window only: without a target a page gets the event sent to any window, so the folded map
  // would hear the pop-up's map too and open it again and again. The map in the pop-up gets its room from there.
  useEffect(() => {
    if (IN_HOST) return;
    let alive = true;
    let off: (() => void) | undefined;
    void listen<{ room?: unknown }>(
      FOCUS_EVENT,
      (e) => {
        const room = typeof e.payload?.room === "string" ? e.payload.room.trim() : "";
        if (!room) return;
        // Folded to its icon: the map opens in the pop-up and shows the room there.
        if (foldedRef.current) void openTile(room);
        else focusRoom(room);
      },
      { target: getCurrentWindow().label },
    ).then((u) => {
      if (alive) off = u;
      else u();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [focusRoom]);
  // Opened in the pop-up for a room, or asked for another one while open there; in the stack, turned to for one.
  const popup = usePopup();
  const stack = useStack();
  const popupRoom = popup?.room ?? stack?.room ?? null;
  const popupAsk = popup?.ask ?? stack?.ask ?? 0;
  useEffect(() => {
    if (popupRoom) focusRoom(popupRoom);
    // Each request once, also the same room again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupAsk]);
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

  // Paint mode: how each room was before the brush or the eraser changed it, the latest last («Отменить»).
  const paintHistory = useRef<RoomState[]>([]);
  const [canUndoPaint, setCanUndoPaint] = useState(false);
  // A new paint session starts with nothing to undo.
  useEffect(() => {
    if (!painting) {
      paintHistory.current = [];
      setCanUndoPaint(false);
    }
  }, [painting]);

  /** Marks a room in `color` or (null) removes its mark; while painting the step can be undone. */
  const paintRoom = useCallback(
    (room: string, color: string | null) => {
      const before = roomState(room);
      const changes = color === null ? before.mark !== null : before.mark?.color.toUpperCase() !== color.toUpperCase();
      if (!changes) return;
      if (painting) {
        paintHistory.current.push(before);
        if (paintHistory.current.length > PAINT_UNDO_LIMIT) paintHistory.current.shift();
        setCanUndoPaint(true);
      }
      void (color === null ? unmarkRoom(room) : markRoom(room, color));
    },
    [painting],
  );

  /** Back to how the room changed last was before that step; again for the step before. */
  const undoPaint = useCallback(() => {
    const last = paintHistory.current.pop();
    setCanUndoPaint(paintHistory.current.length > 0);
    if (last) void restoreRoom(last);
  }, []);

  // Esc ends paint mode (the search field, the colour popover and the context menu take their own Esc first),
  // Ctrl+Z undoes the last step.
  useEffect(() => {
    if (!painting) return;
    const onKey = (e: KeyboardEvent) => {
      // Taken: the Esc that ends paint mode does not also close the pop-up the map is in.
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        setPainting(false);
      }
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.keyCode === VK_Z && !e.defaultPrevented) {
        e.preventDefault();
        undoPaint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [painting, undoPaint]);

  // A click on a room in paint mode: the brush colour, or the eraser. The store applies it to its current list.
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const onPaint = useCallback(
    (room: string) => {
      const t = toolRef.current;
      paintRoom(room, t.kind === "erase" ? null : t.color);
    },
    [paintRoom],
  );

  // Context menu over a room: mark it in the brush colour or remove its mark; anywhere: start painting.
  const menuItems = useCallback(
    (target: HTMLElement): MenuItemSpec[] => {
      const items: MenuItemSpec[] = [];
      const room = roomAt(target, floor);
      if (room) {
        if (map.favorites.some((f) => f.room === room)) {
          items.push({ id: "unmark", label: extra.unmark, icon: "eraser", onSelect: () => paintRoom(room, null) });
        } else {
          const color = tool.kind === "color" ? tool.color : FIRST_COLOR;
          items.push({ id: "mark", label: extra.mark, swatch: color, onSelect: () => paintRoom(room, color) });
        }
      }
      if (painting && canUndoPaint) items.push({ id: "undo", label: ru.edit.undo, icon: "arrow_undo", onSelect: undoPaint });
      if (!painting) items.push({ id: "paint", label: extra.paint, icon: "paint_brush", onSelect: () => setPainting(true) });
      return items;
    },
    [floor, map.favorites, painting, tool, paintRoom, canUndoPaint, undoPaint],
  );

  // «Непрозрачность»: below 100 the widget fades (Tile); under the pointer, while its search is in use or a room is
  // shown it is lit to «Непрозрачность при наведении»; while painting it is whole. Folded or in the pop-up, never.
  const seeThrough = map.opacity < 100 && !folded && !IN_HOST;
  const reveals = seeThrough && map.hoverReveal;
  const pointerOver = usePointerOver(reveals);
  const typing = useTyping(reveals);
  const lit = painting || (reveals && (pointerOver || typing || showing));
  const opacity = !seeThrough ? undefined : painting ? 1 : (lit ? map.hoverOpacity : map.opacity) / 100;

  return (
    <Tile
      label="map"
      minSize={MIN_SIZE}
      className={lit ? "tile-map lit" : "tile-map"}
      background={map.background}
      menuItems={menuItems}
      opacity={opacity}
    >
      <div
        className="map-root"
        data-map-scheme={map.scheme}
        // «Свой цвет», and the weight and colour of the room codes (map.css).
        style={mapVars(map)}
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
          onMatches={setMatches}
          focusSeq={focusSeq}
          onFocusResult={onFocusResult}
          mark={lesson}
          onMarkHover={onMarkHover}
          codesFromZoom={map.labelsWhenZoomed ? LABELS_ZOOM : 1}
          onLimits={onLimits}
        />
        {(map.showSearch || flash) && (
          <MapSearch
            value={text}
            onChange={onSearchText}
            onClear={onSearchClear}
            onSubmit={focusFound}
            notFound={notFound}
            pinned={flash}
          />
        )}
        <FloorSwitch floor={floor} onChange={setFloor} dot={lesson && lesson.floor !== floor ? lesson.floor : null} />
        {map.showZoom && (
          <div className="map-zoom">
            <IconButton icon="add" label={ru.map.zoomIn} disabled={limits.atMax} onClick={() => canvas.current?.zoomIn()} />
            <IconButton icon="subtract" label={ru.map.zoomOut} disabled={limits.atFit} onClick={() => canvas.current?.zoomOut()} />
            <IconButton icon="arrow_reset" label={ru.map.fit} disabled={limits.atFit} onClick={() => canvas.current?.fit()} />
          </div>
        )}
        <PaintDock
          painting={painting}
          onPaintingChange={setPainting}
          tool={tool}
          onToolChange={setTool}
          custom={custom}
          onCustomChange={setCustom}
          canUndo={canUndoPaint}
          onUndo={undoPaint}
        />
      </div>
      {tipAt && lesson && <LessonTip anchor={tipAt} {...lessonTip(lesson)} />}
    </Tile>
  );
}
