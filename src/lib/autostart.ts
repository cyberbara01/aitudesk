// Autostart (the Run key written by tauri-plugin-autostart) can be switched on «Общие», on the welcome page and
// on «Напоминания». «Общие» keeps the last known state for its first frame; a switch made on another page is
// announced here, so «Общие» never paints the old state first.
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
