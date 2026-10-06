// Floor + room-search state. Search logic adapted from aitumap's MapProvider.jsx (spec §1.1).
import { useCallback, useState } from "react";
import { toFloor, type Floor } from "./types";

/** Accepted characters: digits, the room-code letters C/P/L/K and the dot. */
const ALLOWED = /^[0-9CPLK.]*$/i;

/** Upper-cased query, or null when the raw text contains a character outside the room-code alphabet. */
export function normalizeQuery(raw: string): string | null {
  return ALLOWED.test(raw) ? raw.toUpperCase() : null;
}

/**
 * Floor implied by a query (as in the original): "223" → 2 (first digit); "C1.2.223" / "C1.2.22" → floor from the
 * first digit of the room part that follows the block "C1.2"; "2.223" → 2. Null while the query names no floor yet.
 */
export function floorFromQuery(q: string): Floor | null {
  if (!q) return null;
  if (q.includes("C") || q.includes(".")) {
    const parts = q.split(".");
    const room = parts[0].includes("C") ? parts[2] : parts[1];
    return room ? toFloor(Number(room[0])) : null;
  }
  return toFloor(Number(q[0]));
}

/**
 * Toggles .room-found on every <g data-name> inside `layer` (the current floor); returns the number of matches.
 * Matching is a plain substring test on data-name, like `[data-name*=…]` in the original.
 */
export function highlightRooms(layer: Element, query: string): number {
  let found = 0;
  for (const g of layer.querySelectorAll<SVGGElement>("g[data-name]")) {
    const hit = query !== "" && (g.getAttribute("data-name") ?? "").includes(query);
    g.classList.toggle("room-found", hit);
    if (hit) found++;
  }
  return found;
}

export interface RoomSearch {
  floor: Floor;
  /** User-initiated floor change (switch, wheel, keys) — clears the active search, as the original does. */
  setFloor: (f: Floor) => void;
  /** Upper-cased query; "" when no search is active. */
  query: string;
  /** Feeds raw text from the field; text with a disallowed character is rejected (the field keeps its value). */
  setQueryText: (raw: string) => void;
  clear: () => void;
}

export function useRoomSearch(initialFloor: Floor = 1): RoomSearch {
  const [floor, setFloorState] = useState<Floor>(initialFloor);
  const [query, setQuery] = useState("");

  const setFloor = useCallback((f: Floor) => {
    setFloorState(f);
    setQuery("");
  }, []);

  const setQueryText = useCallback((raw: string) => {
    const q = normalizeQuery(raw);
    if (q === null) return;
    setQuery(q);
    const f = floorFromQuery(q);
    if (f !== null) setFloorState(f); // a floor change coming from the search keeps the query
  }, []);

  const clear = useCallback(() => setQuery(""), []);

  return { floor, setFloor, query, setQueryText, clear };
}
