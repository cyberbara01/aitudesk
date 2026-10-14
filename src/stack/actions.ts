// What the stacks' menus, their drop targets and the settings do: make a stack, delete it, name it, put a widget into
// one (out of any other), take it out. The native side follows the settings (src/lib/settings.ts calls sync_stacks).
import type { MenuItemSpec } from "../components/ContextMenu";
import { ru } from "../i18n/ru";
import { extra as shell } from "../i18n/ru.extra.shell";
import { extra as st } from "../i18n/ru.extra.stack";
import {
  customIdOf,
  customLabel,
  isCustomLabel,
  newCustomId,
  settings,
  STACK_MAX,
  STACK_NAME_MAX,
  TILE_IDS,
  type Settings,
  type StackAxis,
  type StackDef,
  type TileId,
} from "../lib/settings";
import { TILE_ICONS } from "../settings/shell/nav";

/** A widget's name as the app shows it: a built-in one's, or an own widget's (unnamed ones get a word). */
export function widgetName(s: Settings, label: string): string {
  if (isCustomLabel(label)) {
    const w = s.customWidgets.find((c) => c.id === customIdOf(label));
    return w?.name.trim() || shell.custom.unnamed;
  }
  return (ru.tiles as Record<string, string>)[label] ?? label;
}

/** A widget's icon in menus and lists. */
export const widgetIcon = (label: string) => (isCustomLabel(label) ? "image" : (TILE_ICONS[label as TileId] ?? "apps"));

/** Whether a widget is switched on in the settings (a built-in one in `tiles`, an own one in its entry). */
export function switchedOn(s: Settings, label: string): boolean {
  if (isCustomLabel(label)) return s.customWidgets.some((w) => customLabel(w.id) === label && w.enabled);
  return Boolean(s.tiles[label as TileId]);
}

/** The widgets a stack shows: switched on, in its order. */
export const stackMembers = (s: Settings, def: StackDef): string[] => def.members.filter((l) => switchedOn(s, l));

/** A stack's name in menus and the settings: its own, or «Стопка виджетов» while it is the only one, or «Стопка N». */
export function stackName(s: Settings, def: StackDef): string {
  const own = def.name.trim();
  if (own) return own;
  return s.stacks.length === 1 ? st.name : st.numbered(s.stacks.findIndex((d) => d.id === def.id) + 1);
}

/** The stack that holds a widget, if any. */
export const stackOf = (s: Settings, label: string): StackDef | null => s.stacks.find((d) => d.members.includes(label)) ?? null;

/** Widgets that could go into a stack: switched on and in no stack yet, built-in ones first. */
export function addable(s: Settings): string[] {
  const all = [...TILE_IDS, ...s.customWidgets.map((w) => customLabel(w.id))];
  return all.filter((l) => switchedOn(s, l) && !stackOf(s, l));
}

/** Into stack `id`, last; out of any other stack. */
export function addToStack(label: string, id: string) {
  return settings.update((s) => ({
    stacks: s.stacks.map((d) => (d.id === id ? { ...d, members: [...d.members.filter((m) => m !== label), label] } : { ...d, members: d.members.filter((m) => m !== label) })),
  }));
}

/** Out of its stack: the widget comes back to its own place on the desktop. */
export function removeFromStack(label: string) {
  return settings.update((s) => ({ stacks: s.stacks.map((d) => ({ ...d, members: d.members.filter((m) => m !== label) })) }));
}

/** A new stack, last: empty, or holding `label` (taken from its old stack). Its window appears near the first one's. */
export function newStack(label?: string) {
  return settings.update((s) =>
    s.stacks.length >= STACK_MAX
      ? {}
      : {
          stacks: [
            ...s.stacks.map((d) => (label ? { ...d, members: d.members.filter((m) => m !== label) } : d)),
            { id: newCustomId(), name: "", members: label ? [label] : [], axis: "horizontal" as StackAxis },
          ],
        },
  );
}

/** The stack goes; its widgets come back to their own places. */
export function deleteStack(id: string) {
  return settings.update((s) => ({ stacks: s.stacks.filter((d) => d.id !== id) }));
}

export function renameStack(id: string, name: string) {
  return settings.update((s) => ({ stacks: s.stacks.map((d) => (d.id === id ? { ...d, name: name.slice(0, STACK_NAME_MAX) } : d)) }));
}

/** «Листать»: up and down, or left and right. */
export function setStackAxis(id: string, axis: StackAxis) {
  return settings.update((s) => ({ stacks: s.stacks.map((d) => (d.id === id ? { ...d, axis } : d)) }));
}

/** The order of a stack's widgets, from the settings list. */
export function setStackOrder(id: string, members: string[]) {
  return settings.update((s) => ({ stacks: s.stacks.map((d) => (d.id === id ? { ...d, members } : d)) }));
}

/** «Добавить виджет» of stack `id`: every widget that could go in, or one disabled line saying they are all in stacks. */
export function addItems(s: Settings, id: string, prefix: string): MenuItemSpec[] {
  const list = addable(s);
  if (list.length === 0) return [{ id: `${prefix}-none`, label: st.menu.none, onSelect: () => undefined, disabled: true }];
  return list.map((l) => ({ id: `${prefix}-${l}`, label: widgetName(s, l), icon: widgetIcon(l), onSelect: () => void addToStack(l, id) }));
}

/** «Добавить в стопку» of a widget on the desktop: straight into the only stack, or a choice of them and a new one. */
export function addToStackItem(s: Settings, label: string, disabled: boolean): MenuItemSpec {
  if (s.stacks.length === 0) return { id: "stack-in", label: st.menu.toNew, icon: "stack_add", onSelect: () => void newStack(label), disabled };
  if (s.stacks.length === 1) return { id: "stack-in", label: st.menu.add, icon: "stack_add", onSelect: () => void addToStack(label, s.stacks[0].id), disabled };
  return {
    id: "stack-in",
    label: st.menu.add,
    icon: "stack_add",
    disabled,
    onSelect: () => undefined,
    children: [
      ...s.stacks.map((d) => ({ id: `stack-in-${d.id}`, label: stackName(s, d), icon: "stack", onSelect: () => void addToStack(label, d.id) })),
      { id: "stack-in-sep", label: "", separator: true, onSelect: () => undefined },
      { id: "stack-in-new", label: st.menu.newStack, icon: "add", onSelect: () => void newStack(label), disabled: s.stacks.length >= STACK_MAX },
    ],
  };
}
