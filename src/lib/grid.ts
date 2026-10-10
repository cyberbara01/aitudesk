// «Выравнивать по сетке»: the switch, wherever it is (Виджеты, the widget's menu, the edit pill), and the smallest
// sizes the native side keeps when it sizes a widget to whole cells (src-tauri/src/grid.rs).
import { invoke } from "@tauri-apps/api/core";
import { minSizes, settings } from "./settings";

export { CUSTOM_MIN, minSizes, TILE_MIN } from "./settings";

/**
 * Switch the grid on (every widget on screen goes to the cells now) or off (back to where they were, if none was
 * moved since). The choice is saved first, so a widget let go meanwhile already follows it.
 */
export async function setGridSnap(on: boolean): Promise<void> {
  await settings.update({ gridSnap: on });
  if (on) await invoke("align_tiles", { mins: minSizes() });
  else await invoke("unalign_tiles");
}

/** After the layout was reset or loaded: with the grid on, the widgets go to its cells again. */
export async function realignIfOn(): Promise<void> {
  if (settings.get().gridSnap) await invoke("align_tiles", { mins: minSizes() }).catch(() => undefined);
}
