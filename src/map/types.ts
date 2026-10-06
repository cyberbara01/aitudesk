// Shared constants and types of the map tile.

export type Floor = 1 | 2 | 3;

/** Floors in the order the switch shows them (top to bottom). */
export const FLOORS: readonly Floor[] = [3, 2, 1];

/** viewBox of the original aitumap drawing, in SVG user units. */
export const VIEWBOX = { w: 924.69, h: 396.16 } as const;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

export function toFloor(n: number): Floor | null {
  return n === 1 || n === 2 || n === 3 ? n : null;
}
