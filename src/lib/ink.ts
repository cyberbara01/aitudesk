// «Цвет значков» and «Цвет текста» of the widgets: for all of them («Оформление» → «Тонкая настройка») and for one
// widget on its own page («Цвета»). Resolved here to CSS variables and data attributes on the widget's root (Tile.tsx
// and the previews in the settings window); src/styles/ink.css hands them to every glyph and every word inside.
import type { CSSProperties } from "react";
import { onColor } from "./design";
import type { Ink, InkPart, Settings } from "./settings";

/** The widgets with colours of their own (the clock has its own colours for the digits and the date). */
export type InkWidget = "system" | "perf" | "launchers" | "map" | "schedule" | "notes";
const INK_WIDGETS: readonly string[] = ["system", "perf", "launchers", "map", "schedule", "notes"] satisfies readonly InkWidget[];
const isInkWidget = (label: string): label is InkWidget => INK_WIDGETS.includes(label);

/** The widgets that draw no glyphs of their own (the folded icon follows the colour of all widgets). */
export const TEXT_ONLY: ReadonlySet<InkWidget> = new Set<InkWidget>(["perf", "launchers"]);

/** The part in use: the widget's own choice, else the one of all widgets. */
const pick = (own: InkPart | undefined, all: InkPart): InkPart => (own && own.mode !== "auto" ? own : all);

/** The colours in use for a widget (`label`: a built-in id or `custom-<id>`; own widgets have the common ones). */
export function inkOf(s: Settings, label: string): Ink {
  const own = isInkWidget(label) ? s[label].ink : undefined;
  return { icons: pick(TEXT_ONLY.has(label as InkWidget) ? undefined : own?.icons, s.ink.icons), text: pick(own?.text, s.ink.text) };
}

/** `color` at `percent` % strength over transparent: the quieter steps of a chosen colour. */
const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

export interface InkAttrs {
  style: CSSProperties;
  "data-ink-icons"?: "";
  "data-ink-text"?: "";
}

/**
 * The attributes a widget root takes for `ink`: nothing for the design's own colours. The accent goes in as its
 * variables, so it follows a change of the accent (and of the palette it is made readable on) by itself.
 * - Icons: --ink-icon for every glyph, --ink-icon-dim for the ones of a state that is off, --ink-icon-fill and
 *   --ink-on-icon for the round chips of Aqua and Pearl (a filled chip and the glyph on it).
 * - Text: the text tokens themselves, so every word and every quieter word follows: --text, --text-2, --text-3 and
 *   --text-disabled at the strengths of the dark palette.
 */
export function inkAttrs(ink: Ink): InkAttrs {
  const vars: Record<string, string> = {};
  const out: InkAttrs = { style: vars as CSSProperties };
  const { icons, text } = ink;
  if (icons.mode !== "auto") {
    const accent = icons.mode === "accent";
    const color = accent ? "var(--accent-text)" : icons.color;
    vars["--ink-icon"] = color;
    vars["--ink-icon-dim"] = mix(color, 55);
    vars["--ink-icon-soft"] = mix(accent ? "var(--accent)" : icons.color, 20);
    vars["--ink-icon-fill"] = accent ? "var(--accent)" : icons.color;
    vars["--ink-on-icon"] = accent ? "var(--on-accent)" : onColor(icons.color);
    out["data-ink-icons"] = "";
  }
  if (text.mode !== "auto") {
    const color = text.mode === "accent" ? "var(--accent-text)" : text.color;
    vars["--text"] = color;
    vars["--text-2"] = mix(color, 78);
    vars["--text-3"] = mix(color, 58);
    vars["--text-disabled"] = mix(color, 38);
    out["data-ink-text"] = "";
  }
  return out;
}

/** The attributes of a widget's root (or its preview) from the settings. */
export const widgetInk = (s: Settings, label: string): InkAttrs => inkAttrs(inkOf(s, label));
