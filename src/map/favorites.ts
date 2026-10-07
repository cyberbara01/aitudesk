// Writes to settings.map.favorites («Отмеченные кабинеты»), shared by the tile (paint mode, context menu) and the
// settings page. Every change is computed inside settings.update() from the store's current value, so two quick
// edits (or edits from two windows) never overwrite each other with a stale list. Nothing is written when the list
// would not change.
import { settings, type MapFavorite } from "../lib/settings";

type Change = (current: readonly MapFavorite[]) => MapFavorite[] | null;

function change(fn: Change): Promise<void> {
  if (fn(settings.get().map.favorites) === null) return Promise.resolve();
  return settings.update((s) => {
    const next = fn(s.map.favorites);
    return next ? { map: { ...s.map, favorites: next } } : {};
  });
}

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Marks `room` with `color` (#RRGGBB): adds it, or recolours it and keeps its note. */
export function markRoom(room: string, color: string): Promise<void> {
  const hex = color.toUpperCase();
  return change((cur) => {
    const i = cur.findIndex((f) => f.room === room);
    if (i < 0) return [...cur, { room, color: hex }];
    if (same(cur[i].color, hex)) return null;
    const next = cur.slice();
    next[i] = { ...cur[i], color: hex };
    return next;
  });
}

/** Recolours a marked room; a room unmarked in the meantime (another window) stays unmarked. */
export function recolorRoom(room: string, color: string): Promise<void> {
  const hex = color.toUpperCase();
  return change((cur) => {
    const i = cur.findIndex((f) => f.room === room);
    if (i < 0 || same(cur[i].color, hex)) return null;
    const next = cur.slice();
    next[i] = { ...cur[i], color: hex };
    return next;
  });
}

/** Removes the mark (and its note). */
export function unmarkRoom(room: string): Promise<void> {
  return change((cur) => (cur.some((f) => f.room === room) ? cur.filter((f) => f.room !== room) : null));
}

/** A room's mark as it was (null: not marked) and its place in the list: what «Отменить» in paint mode puts back. */
export interface RoomState {
  room: string;
  mark: MapFavorite | null;
  index: number;
}

export function roomState(room: string): RoomState {
  const cur = settings.get().map.favorites;
  const index = cur.findIndex((f) => f.room === room);
  return { room, mark: index < 0 ? null : cur[index], index };
}

const sameMark = (a: MapFavorite, b: MapFavorite) => same(a.color, b.color) && (a.note ?? "") === (b.note ?? "");

/** Puts a room back as `state` recorded it: unmarked, or with its colour and note at its old place in the list. */
export function restoreRoom(state: RoomState): Promise<void> {
  const { room, mark, index } = state;
  return change((cur) => {
    const i = cur.findIndex((f) => f.room === room);
    if (!mark) return i < 0 ? null : cur.filter((f) => f.room !== room);
    if (i >= 0) {
      if (sameMark(cur[i], mark)) return null;
      const next = cur.slice();
      next[i] = mark;
      return next;
    }
    const next = cur.slice();
    next.splice(Math.min(index, next.length), 0, mark);
    return next;
  });
}

/** Sets or clears the note of a marked room. */
export function setRoomNote(room: string, note: string): Promise<void> {
  const text = note.trim();
  return change((cur) => {
    const i = cur.findIndex((f) => f.room === room);
    if (i < 0 || (cur[i].note ?? "") === text) return null;
    const next = cur.slice();
    next[i] = text ? { ...cur[i], note: text } : { room: cur[i].room, color: cur[i].color };
    return next;
  });
}
