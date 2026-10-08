// Autostart (the Run key written by src-tauri/src/autostart.rs) can be switched on «Общие», on the welcome page
// and on «Напоминания». «Общие» keeps the last known state for its first frame; a switch made on another page is
// announced here, so «Общие» never paints the old state first.
import { invoke } from "@tauri-apps/api/core";

/** Whether AITU Desk starts with Windows (its Run value is there and Windows' own startup switch is on). */
export const isEnabled = () => invoke<boolean>("autostart_enabled");
export const enable = () => invoke<void>("set_autostart", { on: true });
export const disable = () => invoke<void>("set_autostart", { on: false });

type Listener = (on: boolean) => void;

const listeners = new Set<Listener>();

export function onAutostartChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Call after autostart was switched successfully. */
export function autostartChanged(on: boolean): void {
  for (const fn of listeners) fn(on);
}
