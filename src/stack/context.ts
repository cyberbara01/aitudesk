// The widget stack a widget is drawn in (src/stack/StackHost.tsx): which widget, its neighbours and the stack's
// controls. Null in every other window.
import { createContext, useContext, type ReactNode } from "react";

export interface StackApi {
  /** The stack's id (settings `stacks`). */
  id: string;
  /** The widget on this page of the stack (a member's label), or "stack" while the stack is empty. */
  label: string;
  /** The stack's widgets in order (only those switched on). */
  members: readonly string[];
  /** Pages the stack: -1 to the widget above, +1 to the one below. */
  go: (delta: number) => void;
  /** Takes a widget out of the stack: it comes back to its own place on the desktop. */
  remove: (label: string) => void;
  /** Puts a widget into the stack and shows it. */
  add: (label: string) => void;
  /** The dots and arrows, drawn inside the shown widget's tile, so they fade and round with it. */
  chrome: ReactNode;
  /** A room the schedule asked the map for (the map in the stack shows it), counted like the pop-up's. */
  room: string | null;
  ask: number;
}

export const StackContext = createContext<StackApi | null>(null);

export const useStack = () => useContext(StackContext);
