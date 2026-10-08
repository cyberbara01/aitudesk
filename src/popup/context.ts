// The pop-up a widget is drawn in (src/popup/PopupHost.tsx): which widget, and how to close it. Null in the tile
// windows themselves.
import { createContext, useContext } from "react";

export interface PopupApi {
  /** The widget shown: a built-in id or `custom-<id>`. */
  label: string;
  /** Closes the pop-up with its animation. */
  close: () => void;
  /** The room the map was opened for (a room clicked in the schedule), else null. */
  room: string | null;
  /** Counts the requests: the same room asked for again is shown again. */
  ask: number;
}

export const PopupContext = createContext<PopupApi | null>(null);

export const usePopup = () => useContext(PopupContext);
