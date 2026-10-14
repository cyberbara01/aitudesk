// English for src/i18n/ru.extra.stack.ts.
import type { StackStrings } from "../ru.extra.stack";

export const en: StackStrings = {
  name: "Widget stack",
  numbered: (n: number) => `Stack ${n}`,
  empty: {
    title: "Widget stack",
    text: "Drag a widget here or add one with the button",
    add: "Add a widget",
  },
  drop: {
    hint: "Drag a widget here",
    release: "Let go to add it to the stack",
  },
  menu: {
    stack: "Stack",
    settings: "Stack settings",
    add: "Add to a stack",
    toNew: "To a new stack",
    addWidget: "Add a widget",
    newStack: "New stack",
    remove: (name: string) => `Take “${name}” out of the stack`,
    delete: "Delete the stack",
    none: "Every widget is in a stack already",
  },
  rail: {
    up: "Previous widget",
    down: "Next widget",
    dot: (name: string, n: number, total: number) => `${name}, ${n} of ${total}`,
  },
  settings: {
    title: "Widget stacks",
    desc: "Several widgets in one place. Page through them with the mouse wheel, a touchpad swipe, a drag or the arrows by the dots. You can have several stacks: say, study things in one and the rest in another",
    newStack: "New stack",
    newHint: (max: number) => `Up to ${max} stacks`,
    none: "No stacks yet. Make the first one and drag widgets into it on the desktop",
    nameLabel: "Name",
    count: (n: number) => (n === 0 ? "Empty for now" : `${n} widget${n === 1 ? "" : "s"}`),
    axis: "Page",
    axisHint: "The direction a two-finger touchpad swipe and a mouse drag page in. The mouse wheel pages either way",
    axes: { vertical: "Up and down", horizontal: "Left and right" },
    empty: "Drag a widget into the stack on the desktop or add one here",
    add: "Add",
    remove: "Take out",
    order: "Drag to change the order",
    inStack: "in a stack",
    off: "Turned off, so the stack doesn't show it",
    delete: "Delete the stack",
    deleteHint: "Its widgets go back to their own places",
  },
};
