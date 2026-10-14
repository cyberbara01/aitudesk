// Whether the pointer or the keyboard is on this widget's page: see-through widgets (the map's «Непрозрачность»,
// every widget's «Прозрачность до наведения») come forward while it is. Only the ways in and out are listened to:
// nothing runs while the pointer rests or is away.
import { useEffect, useState } from "react";
import { isMenuOpen } from "./nativeMenu";

/** A see-through widget comes forward at once and goes back this long after the pointer left (ms), so a quick
 * pass over its edge does not make it blink. */
const FADE_BACK_MS = 160;
/** While the widget's own menu is open (the pointer is on the menu), whether it has closed is checked this often (ms). */
const MENU_CHECK_MS = 250;

/**
 * Whether the pointer is over the page (`active` false: always false, nothing listened to). The widget's own menu
 * keeps it true: the pointer leaves the page for the menu, and after the menu the page's hover state decides.
 */
export function usePointerOver(active: boolean): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!active) {
      setOver(false);
      return;
    }
    const root = document.documentElement;
    let timer = 0;
    let on = false;
    const set = (v: boolean) => {
      on = v;
      setOver(v);
    };
    const enter = () => {
      window.clearTimeout(timer);
      set(true);
    };
    const settle = () => {
      if (isMenuOpen()) timer = window.setTimeout(settle, MENU_CHECK_MS);
      else set(root.matches(":hover"));
    };
    const leave = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, FADE_BACK_MS);
    };
    // A window that moves away from under the pointer (parked, taken into the stack) never hears it leave, and one
    // that comes back may still think it is under it: hidden, it lets go; any move over it brings it forward.
    const move = () => {
      if (!on) enter();
    };
    const visibility = () => {
      if (!document.hidden) return;
      window.clearTimeout(timer);
      set(false);
    };
    root.addEventListener("pointerenter", enter);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    set(root.matches(":hover"));
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("pointerenter", enter);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active]);
  return over;
}

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

/** Whether a text field of the page has the keyboard (the map search, a note or a lesson being typed). */
export function useTyping(active: boolean): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!active) {
      setTyping(false);
      return;
    }
    const update = (e: FocusEvent) => setTyping(isTextField(e.type === "focusin" ? e.target : e.relatedTarget));
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    setTyping(isTextField(document.activeElement));
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [active]);
  return typing;
}
