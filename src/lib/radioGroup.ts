// Keyboard model of a WAI-ARIA radio group built from buttons (style, theme and accent cards, map schemes,
// the floor switch). The group is a single Tab stop (render the checked radio with tabIndex 0 and the others
// with -1); the arrow keys move to the previous or next radio and check it, Home and End jump to the first and
// the last one.
import type { KeyboardEvent } from "react";

function handle(e: KeyboardEvent<HTMLElement>, wrap: boolean): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const group = e.currentTarget;
  // Radios of this group only: a nested group (e.g. a colour picker) keeps its own keys.
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
    (r) => r.closest('[role="radiogroup"]') === group,
  );
  const i = radios.indexOf(e.target as HTMLElement);
  if (i < 0) return;
  const last = radios.length - 1;
  let next: number;
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      next = i < last ? i + 1 : wrap ? 0 : last;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      next = i > 0 ? i - 1 : wrap ? last : 0;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = last;
      break;
    default:
      return;
  }
  e.preventDefault();
  // The keys belong to the group: the map under the floor switch must not pan with them.
  e.stopPropagation();
  const target = radios[next];
  target.focus();
  if (target.getAttribute("aria-checked") !== "true") target.click();
}

/** onKeyDown for an element with role="radiogroup" whose radios are role="radio" buttons; wraps around. */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  handle(e, true);
}

/** The same without wrapping around at the ends (a stack of floors). */
export function onRadioGroupKeyDownClamped(e: KeyboardEvent<HTMLElement>): void {
  handle(e, false);
}
