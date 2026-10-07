// English for src/i18n/ru.extra.map.ts.
import type { MapStrings } from "../ru.extra.map";

export const en: MapStrings = {
  pageDesc: "Building C1, three floors. Plan colors, controls and marked rooms",

  colorNames: {
    "#60CDFF": "Light blue",
    "#9BE3A6": "Green",
    "#FFD66B": "Yellow",
    "#FFB6A8": "Peach",
    "#E3B1FF": "Lilac",
    "#FF9B8E": "Coral",
  },

  areas: {
    LIBRARY: "Library",
    DININGHALL: "Dining hall",
    ASSEMBLYHALL: "Assembly hall",
    MEDIKER: "Mediker",
    ATAMEKEN: "Atameken coworking",
  },

  searchLabel: "Room search",
  clearSearch: "Clear search",
  paint: "Color rooms",
  paintToolbar: "Room coloring",
  customColor: "Custom color",
  eraser: "Eraser: remove the mark",
  mark: "Mark",
  unmark: "Remove mark",
  floorWithLesson: (n: number) => `Floor ${n}, your next class is here`,

  backdrop: "Map background",
  backdropGlass: "Glass",
  backdropSilhouette: "Underlay",
  backdropNone: "None",
  backdropHints: {
    glass: "The map on a glass background, like the other widgets",
    silhouette: "No glass: a soft underlay beneath the building keeps the plan readable on any wallpaper",
    none: "Only the plan itself, right on the wallpaper, with no underlay at all",
  },
  labelsHint: "Numbers on the plan. In the smallest rooms they appear as you zoom in",
  labelsWhenZoomed: "Numbers only when zoomed in",
  labelsWhenZoomedHint: "The whole-floor view shows no numbers; they appear once the map is zoomed in by two wheel notches",
  iconsHint: "Hidden while the map is too small",
  nextLesson: "Show the next class",
  nextLessonHint:
    "The room of the current class, or of the one starting within 30 minutes, is highlighted on the plan. If it is on another floor, a dot appears on that floor's button",
  nextLessonPrivate: "Not shown while the schedule hides its content on the desktop",
  legendOther: "·",

  gestures: "The wheel zooms, dragging moves the map, a double-click fits the whole map",
  switchSideHint: "The search and the brush take the opposite side",
  switchMode: "Floor switch visibility",
  switchModeHint: "On hover it appears together with the search and the zoom buttons",
  switchAlways: "Always",
  switchHover: "On hover",
  showSearchHint: "Appears when you point at the widget. Room number: 223 or C1.2.223",
  showZoomHint: "Appear on hover. The mouse wheel and double-click always work",

  defaultFloorHint: "Has no effect while “Remember the last floor” is on",
  rememberFloorHint: "At startup the map opens on the floor you chose last",

  marked: "Marked rooms",
  markedDesc:
    "Rooms with a color mark. On the map, click the brush button, pick a color and click rooms. The eraser removes a mark, the arrow undoes the last step, and “Done” finishes coloring. You can also mark a room with a right-click",
  markedEmpty: "No marked rooms yet",
  markedEmptyHint: "On the map, click the brush button, then click a room",
  colorFor: (room: string) => `Mark color: ${room}`,
  noteFor: (room: string) => `Note: ${room}`,
  unmarkRoom: (room: string) => `Remove mark: ${room}`,
};
