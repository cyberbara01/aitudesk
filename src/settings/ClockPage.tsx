import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ColorPicker } from "../components/ColorPicker";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Select, type SelectOption } from "../components/Select";
import { Slider } from "../components/Slider";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.clock";
import {
  DATE_FORMATS,
  clampWeight,
  formatDate,
  formatPercent,
  formatSize,
  formatTracking,
  formatWeight,
  localFontInstalled,
  presetOf,
  useClockNow,
  useToday,
  weightSteps,
  type DateFormat,
} from "../lib/clock";
import type { LayoutFile } from "../lib/config";
import { ACCENT_PRESETS, CLOCK_FONTS, CLOCK_PRESETS, clockFont, contrast, isHex, type ClockPreset } from "../lib/design";
import { widgetInk } from "../lib/ink";
import { DEFAULT_CLOCK, settings, type ClockFont, type ClockSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { ClockFace } from "../tiles/Clock";
import { useRootAttribute } from "./shell/hooks";

/** The clock widget's size in the default layout (src-tauri/src/layout.rs HEIGHTS), logical px. */
const DEFAULT_WIDGET = { w: 280, h: 120 };
/** Padding of the preview desk and of a preset card's desk, CSS px (clock.css: --s6 and --s3). */
const DESK_PAD = 24;
const CARD_PAD = 12;
/** Width of the tile drawn in a preset card before it is zoomed to the card. */
const MINI_W = 280;
/** Slider drags and the colour square reach the store (disk and every window) at most this often; the page itself updates at once. */
const LIVE_COMMIT_MS = 150;

const T = ru.settings.clock;
const presetName = (id: string) => (T.presetNames as Record<string, string>)[id] ?? id;
/** «Как в стиле» for the font that follows the design language, the font's own name otherwise. */
const fontLabel = (id: ClockFont) => (id === "auto" ? extra.clock.fontAuto : T.fonts[id]);

const ALIGN_OPTIONS: readonly SegmentedOption<ClockSettings["align"]>[] = [
  { value: "left", label: ru.common.left, icon: "text_align_left" },
  { value: "center", label: ru.common.center, icon: "text_align_center" },
  { value: "right", label: ru.common.right, icon: "text_align_right" },
];
/** The same glyphs as above, turned a quarter in CSS (.clock-valign): they are in the bundled set, so no lazy icon chunk is loaded. */
const VALIGN_OPTIONS: readonly SegmentedOption<ClockSettings["valign"]>[] = [
  { value: "top", label: ru.common.top, icon: "text_align_left" },
  { value: "center", label: ru.common.middle, icon: "text_align_center" },
  { value: "bottom", label: ru.common.bottom, icon: "text_align_right" },
];
const DATE_POSITION_OPTIONS: readonly SegmentedOption<ClockSettings["datePosition"]>[] = [
  { value: "below", label: ru.common.below },
  { value: "above", label: ru.common.above },
  { value: "right", label: extra.clock.dateBeside },
];
const TIME_COLOR_OPTIONS: readonly SegmentedOption<ClockSettings["color"]>[] = [
  { value: "text", label: T.colorText },
  { value: "accent", label: T.colorAccent },
  { value: "custom", label: ru.common.custom },
];
const DATE_COLOR_OPTIONS: readonly SegmentedOption<ClockSettings["dateColor"]>[] = [
  { value: "secondary", label: T.colorSecondary },
  { value: "accent", label: T.colorAccent },
  { value: "text", label: T.colorText },
];
/** Fonts to offer. Cascadia Mono ships with Windows Terminal, not with every Windows 11: without it the option
 * would only show Consolas under its name, so it is listed only when installed (or already chosen). */
function fontOptions(current: ClockFont): readonly SelectOption<ClockFont>[] {
  return CLOCK_FONTS.filter((f) => f.bundled || f.id !== "cascadia" || f.id === current || localFontInstalled("Cascadia Mono")).map((f) => ({
    value: f.id,
    label: fontLabel(f.id),
    style: { fontFamily: f.family },
  }));
}

/** Colours offered for the time: the accent tones made for this kind of palette, so every swatch reads on the tile («Как текст» covers the text colour). */
const SWATCHES: Record<"light" | "dark", readonly string[]> = {
  dark: ACCENT_PRESETS.map((p) => p.dark),
  light: ACCENT_PRESETS.map((p) => p.light),
};

const rootVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** WCAG contrast of a colour against the palette's tile colour. */
function contrastOnTile(hex: string): number {
  const base = rootVar("--surface-base");
  return isHex(base) && isHex(hex) ? contrast(hex, base) : 21;
}

/** Writes a change; the preset id is recomputed from the resulting look (hour12 and the custom colour keep it). */
function commit(p: Partial<ClockSettings>) {
  return settings.update((s) => {
    const next: ClockSettings = { ...s.clock, ...p };
    return { clock: { ...next, preset: presetOf(next) } };
  });
}

/**
 * Local edits on top of the stored settings. Discrete controls write at once; continuous ones (slider drags,
 * the colour square) show at once on the page and reach the store at most every LIVE_COMMIT_MS, and whatever
 * is still pending is written when the page is left.
 */
function useClockEditor(clock: ClockSettings) {
  const [draft, setDraft] = useState<Partial<ClockSettings>>({});
  const pending = useRef<Partial<ClockSettings> | null>(null);
  const timer = useRef(0);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    const p = pending.current;
    pending.current = null;
    if (p) void commit(p);
  }, []);

  useEffect(() => flush, [flush]);

  // The store caught up: drop the draft values it now holds.
  useEffect(() => {
    setDraft((d) => {
      const keys = Object.keys(d) as (keyof ClockSettings)[];
      const left = keys.filter((k) => d[k] !== clock[k]);
      if (left.length === keys.length) return d;
      return Object.fromEntries(left.map((k) => [k, d[k]])) as Partial<ClockSettings>;
    });
  }, [clock]);

  const patchLive = useCallback(
    (p: Partial<ClockSettings>) => {
      setDraft((d) => ({ ...d, ...p }));
      pending.current = { ...(pending.current ?? {}), ...p };
      if (!timer.current) timer.current = window.setTimeout(flush, LIVE_COMMIT_MS);
    },
    [flush],
  );

  const patch = useCallback(
    (p: Partial<ClockSettings>) => {
      pending.current = { ...(pending.current ?? {}), ...p };
      flush();
    },
    [flush],
  );

  const applyPreset = useCallback(
    (preset: ClockPreset) => {
      flush();
      setDraft({});
      void settings.updateClock({ ...preset.values, preset: preset.id });
    },
    [flush],
  );

  const view = useMemo<ClockSettings>(() => (Object.keys(draft).length ? { ...clock, ...draft } : clock), [clock, draft]);
  return { view, patch, patchLive, applyPreset };
}

/**
 * The clock widget's size on the desktop (logical px): its saved rect, read once when the page opens; the default
 * size while it was never resized. The preview shows the clock exactly at this size.
 */
function useWidgetSize(): { w: number; h: number } {
  const [size, setSize] = useState(DEFAULT_WIDGET);
  useEffect(() => {
    let alive = true;
    invoke<LayoutFile | null>("get_layout").then(
      (layout) => {
        const r = layout?.tiles.clock;
        if (!alive || !layout || !r) return;
        // The widget's own CSS px: its window in physical px over the monitor's scale and the tiles' zoom.
        const scale = (layout.screen.scale || 1) * (layout.zoom || 1);
        setSize({ w: Math.round(r.w / scale), h: Math.round(r.h / scale) });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return size;
}

/** The live widget on its desk, at its real size. Ticks only while it is on screen; scaled down, never cropped, when the window is narrower. */
function LivePreview({ settings: s, box }: { settings: ClockSettings; box: { w: number; h: number } }) {
  const deskRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const [visible, setVisible] = useState(true);
  const { now, colonDim } = useClockNow(s, visible);

  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const ro = new ResizeObserver(([entry]) => setAvail(entry.contentRect.width));
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    ro.observe(desk);
    io.observe(desk);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const zoom = avail > 0 ? Math.min(1, avail / box.w) : 1;
  const deskStyle: CSSProperties = { minHeight: Math.ceil(box.h * zoom) + 2 * DESK_PAD };
  // The colours of all widgets (the clock's own are its digits' and date's, above).
  const { style: inkStyle, ...inkData } = widgetInk(useSettings(), "clock");
  const tileStyle = { ...inkStyle, width: box.w, height: box.h, "--clock-preview-zoom": zoom } as CSSProperties;
  return (
    <div ref={deskRef} className="clock-desk" style={deskStyle}>
      <div className={s.background ? "tile clock-preview" : "tile clock-preview no-bg"} style={tileStyle} {...inkData}>
        <ClockFace settings={s} now={now} colonDim={colonDim} />
      </div>
    </div>
  );
}

function MiniTile({ settings: s, now }: { settings: ClockSettings; now: Date }) {
  return (
    <div className="card-preview clock-card-preview" aria-hidden="true">
      <div className={s.background ? "tile clock-mini" : "tile clock-mini no-bg"}>
        <ClockFace settings={s} now={now} live={false} thumbnail />
      </div>
    </div>
  );
}

interface PresetCardProps {
  preset: ClockPreset;
  hour12: boolean;
  selected: boolean;
  sample: Date;
  onApply: (p: ClockPreset) => void;
}

const PresetCard = memo(function PresetCard({ preset, hour12, selected, sample, onApply }: PresetCardProps) {
  const values = useMemo<ClockSettings>(() => ({ ...DEFAULT_CLOCK, ...preset.values, hour12, preset: preset.id }), [preset, hour12]);
  return (
    <button
      type="button"
      className={selected ? "option-card clock-preset selected" : "option-card clock-preset"}
      aria-pressed={selected}
      onClick={() => onApply(preset)}
    >
      <MiniTile settings={values} now={sample} />
      <span className="card-text">
        <span className="card-title ellipsis">{presetName(preset.id)}</span>
        <span className="card-hint ellipsis">{fontLabel(values.font)}</span>
      </span>
    </button>
  );
});

interface GalleryProps {
  /** Preset id the current look matches, or "custom". */
  current: string;
  view: ClockSettings;
  sample: Date;
  onApply: (p: ClockPreset) => void;
}

/**
 * Eight presets and, when the look is hand-made, a ninth «Свой» card: three columns, so that card only fills
 * the free slot of the last row and nothing else moves. The minis are zoomed to the card width.
 */
function PresetGallery({ current, view, sample, onApply }: GalleryProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => {
      const desk = grid.querySelector<HTMLElement>(".clock-card-preview");
      if (!desk) return;
      const zoom = Math.min(1, Math.max(0.2, (desk.clientWidth - 2 * CARD_PAD) / MINI_W));
      grid.style.setProperty("--clock-mini-zoom", zoom.toFixed(3));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={gridRef} className="clock-presets">
      {CLOCK_PRESETS.map((p) => (
        <PresetCard key={p.id} preset={p} hour12={view.hour12} selected={current === p.id} sample={sample} onApply={onApply} />
      ))}
      {current === "custom" && (
        <div className="option-card clock-preset selected">
          <MiniTile settings={view} now={sample} />
          <span className="card-text">
            <span className="card-title ellipsis">{T.presetNames.custom}</span>
            <span className="card-hint ellipsis">{extra.clock.currentSettings}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** «Часы»: live preview, preset gallery, then typography / format / layout / colours, and the section reset. */
export function ClockPage() {
  const { clock } = useSettings();
  const { view, patch, patchLive, applyPreset } = useClockEditor(clock);
  const widget = useWidgetSize();
  const scheme = useRootAttribute("data-scheme") === "light" ? "light" : "dark";
  const today = useToday();

  const font = clockFont(view.font);
  const steps = weightSteps(font);
  const current = presetOf(view);

  // Static instant for the preset cards: today at 12:34:56.
  const sample = useMemo(() => {
    const d = new Date(today);
    d.setHours(12, 34, 56, 0);
    return d;
  }, [today]);
  const dateOptions = useMemo<readonly SelectOption<DateFormat>[]>(
    () => DATE_FORMATS.map((f) => ({ value: f, label: f === "none" ? T.dateFormats.none : (formatDate(today, f) ?? "") })),
    [today],
  );

  const setFont = (id: ClockFont) => patch({ font: id, weight: clampWeight(view.weight, clockFont(id)) });

  const setTimeColor = (color: ClockSettings["color"]) => {
    if (color !== "custom") return patch({ color });
    // Keep a colour chosen before when it reads on this palette. Otherwise (still the default white, or a pale
    // colour on a light palette) start from the accent, which is made for the palette.
    const own = view.customColor.toUpperCase();
    const keep = own !== DEFAULT_CLOCK.customColor && contrastOnTile(own) >= 3;
    const accent = rootVar("--accent").toUpperCase();
    patch({ color, customColor: keep ? own : isHex(accent) ? accent : SWATCHES[scheme][0] });
  };

  return (
    <Page title={ru.settings.nav.clock} description={extra.clock.pageDesc}>
      <div className="clock-stage">
        <div className="clock-stage-head">
          <span className="body-strong">{ru.common.preview}</span>
          <span className="hint">{extra.clock.widgetSize(widget.w, widget.h)}</span>
        </div>
        <LivePreview settings={view} box={widget} />
        <p className="hint clock-stage-hint">{extra.clock.previewHint}</p>
      </div>

      <Section title={T.presets} description={T.presetsHint} padded>
        <PresetGallery current={current} view={view} sample={sample} onApply={applyPreset} />
      </Section>

      <Section title={T.typography}>
        <Row label={ru.common.font} hint={view.font === "auto" ? extra.clock.fontAutoHint : extra.clock.fontHint}>
          <Select className="clock-font-select" options={fontOptions(view.font)} value={view.font} onChange={setFont} ariaLabel={ru.common.font} styledValue />
        </Row>
        <div className="row stack">
          <div className="grid-2 clock-sliders">
            <div className="clock-slider-cell">
              <Slider
                label={ru.common.weight}
                min={steps[0]}
                max={steps[steps.length - 1]}
                step={steps.length > 1 ? steps[1] - steps[0] : 100}
                value={clampWeight(view.weight, font)}
                format={formatWeight}
                onChange={(v) => patchLive({ weight: v })}
              />
              {steps.length <= 2 && <span className="hint">{extra.clock.weightStaticHint}</span>}
            </div>
            <div className="clock-slider-cell">
              <Slider
                label={ru.common.width}
                min={75}
                max={100}
                step={1}
                value={font.width ? view.width : 100}
                format={formatPercent}
                disabled={!font.width}
                onChange={(v) => patchLive({ width: v })}
              />
              <span className="hint">{T.widthHint}</span>
            </div>
            <div className="clock-slider-cell">
              <Slider label={ru.common.size} min={24} max={160} step={1} value={view.size} format={formatSize} onChange={(v) => patchLive({ size: v })} />
              <span className="hint">{extra.clock.sizeHint}</span>
            </div>
            <div className="clock-slider-cell">
              <Slider
                label={ru.common.tracking}
                min={-8}
                max={12}
                step={1}
                value={view.letterSpacing}
                format={formatTracking}
                onChange={(v) => patchLive({ letterSpacing: v })}
              />
              <span className="hint">{extra.clock.trackingHint}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title={T.format}>
        <Row label={T.seconds} hint={extra.clock.secondsHint}>
          <Switch checked={view.seconds} onChange={(v) => patch({ seconds: v })} ariaLabel={T.seconds} />
        </Row>
        <Row label={T.blinkColon} hint={extra.clock.blinkHint}>
          <Switch checked={view.blinkColon} onChange={(v) => patch({ blinkColon: v })} ariaLabel={T.blinkColon} />
        </Row>
        <Row label={T.hour12} hint={extra.clock.hour12Hint}>
          <Switch checked={view.hour12} onChange={(v) => patch({ hour12: v })} ariaLabel={T.hour12} />
        </Row>
        <Row label={T.date}>
          <Select className="clock-date-select" options={dateOptions} value={view.dateFormat} onChange={(v) => patch({ dateFormat: v })} ariaLabel={T.date} />
        </Row>
        {view.dateFormat !== "none" && (
          <Row label={T.datePosition} stack>
            <Segmented
              className="clock-seg"
              options={DATE_POSITION_OPTIONS}
              value={view.datePosition}
              onChange={(v) => patch({ datePosition: v })}
              fill
              ariaLabel={T.datePosition}
            />
          </Row>
        )}
      </Section>

      <Section title={T.layout}>
        <Row label={ru.common.alignment} stack>
          <Segmented className="clock-seg" options={ALIGN_OPTIONS} value={view.align} onChange={(v) => patch({ align: v })} fill ariaLabel={ru.common.alignment} />
        </Row>
        <Row label={ru.common.position} stack>
          <Segmented
            className="clock-seg clock-valign"
            options={VALIGN_OPTIONS}
            value={view.valign}
            onChange={(v) => patch({ valign: v })}
            fill
            ariaLabel={ru.common.position}
          />
        </Row>
      </Section>

      <Section title={T.colors}>
        {/* Same markup as <Row stack>, but the control slot stacks so the picker can sit under the segments */}
        <div className="row stack">
          <div className="row-text">
            <span className="row-label">{T.timeColor}</span>
          </div>
          <div className="row-control clock-color-control">
            <Segmented className="clock-seg" options={TIME_COLOR_OPTIONS} value={view.color} onChange={setTimeColor} fill ariaLabel={T.timeColor} />
            {view.color === "custom" && (
              <div className="clock-color-picker">
                <ColorPicker value={view.customColor} swatches={SWATCHES[scheme]} onChange={(hex) => patchLive({ customColor: hex })} />
              </div>
            )}
          </div>
        </div>
        <Row label={T.dateColor} stack>
          <Segmented className="clock-seg" options={DATE_COLOR_OPTIONS} value={view.dateColor} onChange={(v) => patch({ dateColor: v })} fill ariaLabel={T.dateColor} />
        </Row>
      </Section>

      <Section title={extra.clock.other}>
        <Row label={T.tabular} hint={extra.clock.tabularHint}>
          <Switch checked={view.tabular} onChange={(v) => patch({ tabular: v })} ariaLabel={T.tabular} />
        </Row>
        <Row label={T.background} hint={T.backgroundHint}>
          <Switch checked={view.background} onChange={(v) => patch({ background: v })} ariaLabel={T.background} />
        </Row>
      </Section>

      <ResetSection section="clock" />
    </Page>
  );
}
