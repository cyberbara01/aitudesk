// Floor + room-search state, shared by the search field and the «map-focus-room» event from the schedule tile.
// Search logic adapted from aitumap's MapProvider.jsx: a code names its floor by its first digit and
// rooms match by a substring of data-name. On top of the original: codes typed in the Russian layout («223К»,
// «С1.2.223») are read as the Latin code, and words find the named areas by their aliases («библиотека»).
import { useCallback, useMemo, useState } from "react";
import { AREA_NAMES } from "./rooms";
import { toFloor, type Floor } from "./types";

/** Characters of a room code, Latin or their Cyrillic look-alikes, with dots and spaces. */
const CODE_LIKE = /^[0-9CPKLСРКЛ.\s]*$/;
const LOOK_ALIKES: Record<string, string> = { С: "C", Р: "P", К: "K", Л: "L" };

/**
 * The text of the field as a query: upper case; a code loses its spaces and has Cyrillic С, Р, К, Л read as
 * C, P, K, L; words keep single spaces. "" for blank text.
 */
export function normalizeQuery(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (CODE_LIKE.test(t)) return t.replace(/\s+/g, "").replace(/[СРКЛ]/g, (c) => LOOK_ALIKES[c] ?? c);
  return t.replace(/\s+/g, " ");
}

const isCode = (q: string) => /^[0-9CPKL.]+$/.test(q);

/**
 * Floor implied by a query (as in the original): "223" → 2 (first digit); "C1.2.223" / "C1.2.22" → floor from the
 * first digit of the room part that follows the block "C1.2"; "2.223" → 2. Words → 1 when they name an area.
 * Null while the query names no floor yet.
 */
export function floorFromQuery(q: string): Floor | null {
  if (!q) return null;
  if (!isCode(q)) return q.length >= 2 && AREA_NAMES.some((n) => n.includes(q)) ? 1 : null;
  if (q.includes("C") || q.includes(".")) {
    const parts = q.split(".");
    const room = parts[0].includes("C") ? parts[2] : parts[1];
    return room ? toFloor(Number(room[0])) : null;
  }
  return toFloor(Number(q[0]));
}

/**
 * Toggles .room-found on every <g data-name> inside `layer` (one floor); returns the number of matches.
 * Matching is a plain substring test on data-name, like `[data-name*=…]` in the original.
 */
export function highlightRooms(layer: Element, query: string): number {
  let found = 0;
  for (const g of layer.querySelectorAll<SVGGElement>("g[data-name]")) {
    const hit = query !== "" && (g.getAttribute("data-name") ?? "").includes(query);
    if (g.classList.contains("room-found") !== hit) g.classList.toggle("room-found", hit);
    if (hit) found++;
  }
  return found;
}

export interface RoomSearch {
  floor: Floor;
  /** User-initiated floor change (switch, wheel, keys): clears the active search, as the original does. */
  setFloor: (f: Floor) => void;
  /** The text as typed (shown in the field). */
  text: string;
  /** The normalised query; "" when no search is active. */
  query: string;
  /** New text from the field or the schedule tile; a query that names a floor switches to it. */
  setQueryText: (raw: string) => void;
  clear: () => void;
}

const MAX_TEXT = 40;

export function useRoomSearch(initialFloor: Floor = 1): RoomSearch {
  const [floor, setFloorState] = useState<Floor>(initialFloor);
  const [text, setText] = useState("");
  const query = useMemo(() => normalizeQuery(text), [text]);

  const setFloor = useCallback((f: Floor) => {
    setFloorState(f);
    setText("");
  }, []);

  const setQueryText = useCallback((raw: string) => {
    const next = raw.slice(0, MAX_TEXT);
    setText(next);
    const f = floorFromQuery(normalizeQuery(next));
    if (f !== null) setFloorState(f); // a floor change coming from the search keeps the query
  }, []);

  const clear = useCallback(() => setText(""), []);

  return { floor, setFloor, text, query, setQueryText, clear };
}
