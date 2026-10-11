// «Цвета»: the colours of the glyphs and of the words of the widgets, of all of them («Цвета виджетов» on
// «Оформление») or of one (on its page). Each part follows the design (or, for one widget, all widgets), takes the
// accent, or a colour of one's own (src/lib/ink.ts).
import { useEffect, useState } from "react";
import { ColorPicker } from "../components/ColorPicker";
import { Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { extra } from "../i18n/ru.extra.shell";
import { ACCENT_PRESETS, isHex } from "../lib/design";
import { TEXT_ONLY, type InkWidget } from "../lib/ink";
import { DEFAULT_INK, INK_PARTS, settings, type Ink, type InkMode, type InkPart, type SettingsPatch } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useDebounced, useRootAttribute } from "./shell/hooks";

const k = extra.ink;

/** The swatches: the accent presets in the tone made for the palette in use. */
const SWATCHES = { dark: ACCENT_PRESETS.map((p) => p.dark), light: ACCENT_PRESETS.map((p) => p.light) } as const;

interface InkRowProps {
  part: keyof Ink;
  value: InkPart;
  /** All widgets («Как в дизайне») or one («Как у всех»). */
  scope: "all" | "widget";
  label: string;
  hint?: string;
  onChange: (value: InkPart) => void;
}

function InkRow({ part, value, scope, label, hint, onChange }: InkRowProps) {
  const scheme = useRootAttribute("data-scheme") === "light" ? "light" : "dark";
  const options: readonly SegmentedOption<InkMode>[] = [
    { value: "auto", label: scope === "all" ? k.modes.auto : k.widgetAuto },
    { value: "accent", label: k.modes.accent },
    { value: "custom", label: k.modes.custom },
  ];
  // The picker sends a colour on every move: the picker shows it at once, the widgets get it after a short pause.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (draft && draft.toUpperCase() === value.color.toUpperCase()) setDraft(null);
  }, [draft, value.color]);
  const commit = useDebounced((color: string) => onChange({ mode: "custom", color }), 120);
  const setMode = (mode: InkMode) => {
    if (mode !== "custom" || value.color !== DEFAULT_INK[part].color) return onChange({ ...value, mode });
    // The first own colour starts from the accent, which is made to read on this palette.
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-text").trim().toUpperCase();
    onChange({ mode, color: isHex(accent) ? accent : value.color });
  };
  return (
    <div className="row stack">
      <div className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </div>
      <div className="row-control ink-control">
        <Segmented options={options} value={value.mode} onChange={setMode} fill ariaLabel={label} />
        {value.mode === "custom" && (
          <div className="ink-picker">
            <ColorPicker
              value={draft ?? value.color}
              swatches={SWATCHES[scheme]}
              onChange={(hex) => {
                setDraft(hex);
                commit(hex);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** «Цвета виджетов» on «Оформление»: the colours every widget has unless it has its own. */
export function InkAllSection({ ink }: { ink: Ink }) {
  const set = (part: keyof Ink, value: InkPart) => void settings.update((cur) => ({ ink: { ...cur.ink, [part]: value } }));
  return (
    <Section title={k.title} description={k.titleHint}>
      {INK_PARTS.map((part) => (
        <InkRow key={part} part={part} value={ink[part]} scope="all" label={k.parts[part]} hint={k.allHints[part]} onChange={(v) => set(part, v)} />
      ))}
    </Section>
  );
}

/** «Цвета» on a widget's page: its own colours, or those of all widgets. A widget without glyphs has text only. */
export function InkWidgetSection({ widget }: { widget: InkWidget }) {
  const ink = useSettings()[widget].ink;
  const parts = INK_PARTS.filter((part) => part === "text" || !TEXT_ONLY.has(widget));
  const set = (part: keyof Ink, value: InkPart) =>
    void settings.update((cur) => ({ [widget]: { ...cur[widget], ink: { ...cur[widget].ink, [part]: value } } }) as SettingsPatch);
  return (
    <Section title={k.section} description={k.sectionHint}>
      {parts.map((part) => (
        <InkRow
          key={part}
          part={part}
          value={ink[part]}
          scope="widget"
          label={k.rows[part]}
          hint={k.hints[widget][part] || undefined}
          onChange={(v) => set(part, v)}
        />
      ))}
    </Section>
  );
}
