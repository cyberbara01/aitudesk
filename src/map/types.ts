// Shared constants and types of the map tile.

export type Floor = 1 | 2 | 3;

/** Floors in the order the switch shows them (top to bottom). */
export const FLOORS: readonly Floor[] = [3, 2, 1];

/** viewBox of the original aitumap drawing, in SVG user units. */
export const VIEWBOX = { w: 924.69, h: 396.16 } as const;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
/** «Номера только при приближении»: room numbers show from this zoom, two wheel notches (1.1 each) from the
 * whole floor. */
export const LABELS_ZOOM = 1.2;

/** Width kept free beside the plan for the always-visible floor switch: the 36 px switch plus an 8 px gap (map.css). */
export const SWITCH_COLUMN_PX = 44;

/** Level of detail: lettering outside the rooms (atrium, hall names) is drawn once its glyphs are at least this
 * tall on screen (CSS px). */
export const LABEL_MIN_PX = 6.5;
/**
 * Level of detail: a room code is drawn once its cap height on screen is at least CODE_MIN_DEVICE_PX device
 * pixels and CODE_MIN_PX CSS px. Semibold hinted digits read from about 4.5 pixels but only look clean from 5:
 * the whole-floor view of a widget on a 100 % screen shows the codes of the larger rooms, the rest come in as it
 * zooms, and a sharp screen draws small codes with more pixels, so it shows more of them at once.
 */
export const CODE_MIN_DEVICE_PX = 5;
export const CODE_MIN_PX = 3.6;
/** Level of detail: a pictogram (toilet, exit, stairs) is drawn once it is at least this large on screen; on the
 *  whole-floor view they would be specks, so they come in with the first steps of zoom. */
export const PICTOGRAM_MIN_PX = 12;

/** Paint mode: the brush either sets a colour or erases the mark. */
export type PaintTool = { kind: "color"; color: string; custom: boolean } | { kind: "erase" };

export function toFloor(n: number): Floor | null {
  return n === 1 || n === 2 || n === 3 ? n : null;
}
