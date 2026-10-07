// Paint mode controls (brief 6.3). The brush button sits in the bottom corner opposite the zoom column; while
// painting, the palette opens next to it: the six FAVORITE_COLORS, «Свой цвет» (ColorPicker in a small popover),
// the eraser and «Готово». The palette only picks the tool; MapCanvas turns a click on a room into a paint call.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, IconButton } from "../components/Button";
import { ColorPicker } from "../components/ColorPicker";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { FAVORITE_COLORS } from "../lib/design";
import type { PaintTool } from "./types";

interface Props {
  painting: boolean;
  onPaintingChange: (on: boolean) => void;
  tool: PaintTool;
  onToolChange: (tool: PaintTool) => void;
  /** The colour last chosen in the custom editor; null until one was chosen. */
  custom: string | null;
  onCustomChange: (hex: string) => void;
}

export function PaintDock({ painting, onPaintingChange, ...palette }: Props) {
  const dockRef = useRef<HTMLDivElement>(null);
  // Focus that was inside the palette when it closes (Esc, «Готово») goes back to the brush, not to the page.
  const focusBrush = useCallback(() => dockRef.current?.querySelector<HTMLButtonElement>(":scope > .icon-btn")?.focus(), []);
  return (
    <div ref={dockRef} className={painting ? "map-paint-dock painting" : "map-paint-dock"}>
      <IconButton
        icon="paint_brush"
        label={extra.paint}
        selected={painting}
        aria-pressed={painting}
        onClick={() => onPaintingChange(!painting)}
      />
      {painting && <Palette {...palette} onDone={() => onPaintingChange(false)} restoreFocus={focusBrush} />}
    </div>
  );
}

const NO_SWATCHES: readonly string[] = [];
/** Distance between the palette and the popover above it, and the smallest gap to the window top (CSS px). */
const POP_GAP = 8;
const POP_MARGIN = 4;

type PaletteProps = Omit<Props, "painting" | "onPaintingChange"> & { onDone: () => void; restoreFocus: () => void };

function Palette({ tool, onToolChange, custom, onCustomChange, onDone, restoreFocus }: PaletteProps) {
  const [popOpen, setPopOpen] = useState(false);
  /** "above" the palette, or "over" it when the tile is too low for that. */
  const [placement, setPlacement] = useState<"above" | "over">("above");
  const barRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);

  const customOn = tool.kind === "color" && tool.custom;

  // Runs before the palette leaves the DOM, while the focused element can still be found inside it.
  useLayoutEffect(() => {
    const bar = barRef.current;
    return () => {
      if (bar?.contains(document.activeElement)) restoreFocus();
    };
  }, [restoreFocus]);

  // The popover closes on a press outside it, on Esc (which then does not end paint mode) and when the window
  // loses focus. The custom swatch toggles it itself.
  useEffect(() => {
    if (!popOpen) return;
    // Tiles are not activated by clicks: take the focus while the popover is open, so a click anywhere else
    // (another window, the wallpaper) blurs this window and closes it, and Esc reaches it.
    invoke("activate_tile").catch(() => undefined);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || customRef.current?.contains(t)) return;
      setPopOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase on window: the tile's own Esc (end paint mode) never sees this one.
      e.stopPropagation();
      e.preventDefault();
      setPopOpen(false);
      customRef.current?.focus();
    };
    const onBlur = () => setPopOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [popOpen]);

  // Above the palette when it fits under the window top, otherwise over the palette (low tiles).
  useLayoutEffect(() => {
    if (!popOpen) {
      setPlacement("above");
      return;
    }
    const bar = barRef.current?.getBoundingClientRect();
    const pop = popRef.current?.getBoundingClientRect();
    if (!bar || !pop) return;
    setPlacement(bar.top - POP_GAP - pop.height >= POP_MARGIN ? "above" : "over");
  }, [popOpen]);

  const pickCustom = (hex: string) => {
    onCustomChange(hex);
    onToolChange({ kind: "color", color: hex, custom: true });
  };

  // Arrow keys move between the palette's buttons (a toolbar); Tab still walks through them too.
  const onBarKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (popRef.current?.contains(e.target as Node)) return;
    const items = Array.from(barRef.current?.querySelectorAll<HTMLButtonElement>(":scope > button, .map-paint-colors > button") ?? []);
    const i = items.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))].focus();
  };

  return (
    <div ref={barRef} className="map-paint" role="toolbar" aria-label={extra.paintToolbar} onKeyDown={onBarKeys}>
      <div className="map-paint-colors">
        {FAVORITE_COLORS.map((c) => {
          const on = tool.kind === "color" && !tool.custom && tool.color.toUpperCase() === c.toUpperCase();
          return (
            <button
              key={c}
              type="button"
              className={on ? "cp-swatch selected" : "cp-swatch"}
              style={{ background: c }}
              aria-label={extra.colorNames[c.toUpperCase()] ?? c}
              aria-pressed={on}
              onClick={() => onToolChange({ kind: "color", color: c.toUpperCase(), custom: false })}
            />
          );
        })}
        <button
          ref={customRef}
          type="button"
          className={customOn ? "cp-swatch custom selected" : "cp-swatch custom"}
          aria-label={extra.customColor}
          aria-pressed={customOn}
          aria-haspopup="dialog"
          aria-expanded={popOpen}
          onClick={() => {
            if (custom) onToolChange({ kind: "color", color: custom, custom: true });
            setPopOpen((o) => !o);
          }}
        >
          {custom && <span className="map-paint-custom-dot" style={{ "--sw": custom } as CSSProperties} aria-hidden="true" />}
        </button>
      </div>
      <IconButton
        icon="eraser"
        label={extra.eraser}
        variant="subtle"
        selected={tool.kind === "erase"}
        aria-pressed={tool.kind === "erase"}
        onClick={() => onToolChange({ kind: "erase" })}
      />
      <Button variant="accent" size="sm" onClick={onDone}>
        {ru.common.done}
      </Button>
      {popOpen && (
        <div ref={popRef} className={`popover map-paint-pop ${placement}`} role="dialog" aria-label={extra.customColor}>
          <ColorPicker
            value={custom ?? (tool.kind === "color" ? tool.color : FAVORITE_COLORS[0])}
            onChange={pickCustom}
            swatches={NO_SWATCHES}
            customOpen
          />
        </div>
      )}
    </div>
  );
}
