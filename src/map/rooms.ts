// Room-code helpers shared by the tile (paint mode, context menu) and the settings page (marked rooms).
// A room is a <g data-name> in the floor drawings: "C1.2.223K" (block C1, section 2, room 223, type K),
// the nested "1.352K", or a named area such as "LIBRARY|BIBLIOTEKA|БИБЛИОТЕКА|…".
import { extra } from "../i18n/ru.extra.map";
import { toFloor, type Floor } from "./types";

/**
 * Floor of a room code: the first digit of the room number ("C1.2.223K" → 2, "1.352K" → 3). The named areas
 * (library, dining hall, assembly hall, coworking, Mediker) are all on the first floor of this drawing.
 */
export function floorOfRoom(code: string): Floor | null {
  const m = /(?:^|\.)(\d)\d{2}[A-Z]?$/.exec(code);
  if (m) return toFloor(Number(m[1]));
  if (code.includes("|")) return 1;
  return null;
}

/**
 * data-name of every named area in the drawing, all on floor 1. A search by words («Библиотека», «столовая»)
 * matches these aliases, so the floor can be chosen before that floor is drawn.
 */
export const AREA_NAMES: readonly string[] = [
  "LIBRARY|BIBLIOTEKA|БИБЛИОТЕКА|МЕДИАТЕКА|MEDIATEKA|KITAPHANA|КІТАПХАНА",
  "DININGHALL|АСХАНА|СТОЛОВАЯ|СТОЛОВКА",
  "ASSEMBLYHALL|АКТОВЫЙ ЗАЛ",
  "ATAMEKEN|АТАМЕКЕН",
  "MEDIKER|МЕДИКЕР",
];

/** True for a plain room code (shown in the mono font); false for a named area. */
export function isRoomCode(code: string): boolean {
  return !code.includes("|");
}

/** Human name of a room: the code itself, or the Russian name of a named area ("LIBRARY|…" → "Библиотека"). */
export function roomDisplayName(code: string): string {
  if (isRoomCode(code)) return code;
  const parts = code.split("|");
  const known = extra.areas[parts[0]];
  if (known) return known;
  const cyrillic = parts.find((p) => /[А-ЯЁ]/i.test(p)) ?? parts[0];
  const lower = cyrillic.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * The room group under a pointer target if it can be marked: it belongs to the floor shown now and has a shape
 * that can be filled (the coworking «Атамекен» is drawn with open curves only, so a colour has nothing to fill).
 */
export function roomGroupAt(target: Element | null, floor: Floor): SVGGElement | null {
  const g = target?.closest<SVGGElement>("g[data-name]") ?? null;
  if (!g || !(g.getAttribute("data-name") ?? "").trim()) return null;
  const layer = g.closest<SVGGElement>("g.floor");
  if (!layer || layer.getAttribute("data-floor") !== String(floor)) return null;
  return g.querySelector(":scope > polygon, :scope > polyline, :scope > rect") ? g : null;
}

/** Upper-cased data-name of the markable room under a pointer target (see roomGroupAt). */
export function roomAt(target: Element | null, floor: Floor): string | null {
  const g = roomGroupAt(target, floor);
  return g ? (g.getAttribute("data-name") ?? "").trim().toUpperCase() : null;
}
