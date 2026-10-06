import { useMemo, useState } from "react";
import { ColorPicker } from "../components/ColorPicker";
import { hasIcon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Select, type SelectOption } from "../components/Select";
import { Slider } from "../components/Slider";
import { Switch } from "../components/Switch";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.clock";
import { DATE_FORMATS, clampWeight, formatDate, formatPercent, formatPx, formatTracking, formatWeight, useClockNow, type DateFormat } from "../lib/clock";
import { CLOCK_FONTS, CLOCK_PRESETS, clockFont, type ClockPreset } from "../lib/design";
import { DEFAULT_CLOCK, settings, type ClockFont, type ClockSettings } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { ClockFace } from "../tiles/Clock";

type PreviewSize = keyof typeof extra.clock.previewSizes;
const PREVIEW_SIZES: Record<PreviewSize, { w: number; h: number }> = { s: { w: 280, h: 120 }, m: { w: 400, h: 160 }, l: { w: 520, h: 200 } };

const presetName = (id: string) => (ru.settings.clock.presetNames as Record<string, string>)[id] ?? id;
/** Lazy-set icons are optional: fall back to a text-only segment when the name is not bundled. */
const optIcon = (name: string) => (hasIcon(name) ? name : undefined);

const ALIGN_OPTIONS: readonly SegmentedOption<ClockSettings["align"]>[] = [
  { value: "left", label: ru.common.left, icon: "text_align_left" },
  { value: "center", label: ru.common.center, icon: "text_align_center" },
  { value: "right", label: ru.common.right, icon: "text_align_right" },
];
const VALIGN_OPTIONS: readonly SegmentedOption<ClockSettings["valign"]>[] = [
  { value: "top", label: ru.common.top, icon: optIcon("align_top") },
  { value: "center", label: ru.common.middle, icon: optIcon("align_center_vertical") },
  { value: "bottom", label: ru.common.bottom, icon: optIcon("align_bottom") },
];
const DATE_POSITION_OPTIONS: readonly SegmentedOption<ClockSettings["datePosition"]>[] = [
  { value: "below", label: ru.common.below },
  { value: "above", label: ru.common.above },
  { value: "right", label: ru.common.beside },
];
const TIME_COLOR_OPTIONS: readonly SegmentedOption<ClockSettings["color"]>[] = [
  { value: "text", label: ru.settings.clock.colorText },
  { value: "accent", label: ru.settings.clock.colorAccent },
  { value: "custom", label: ru.common.custom },
];
const DATE_COLOR_OPTIONS: readonly SegmentedOption<ClockSettings["dateColor"]>[] = [
  { value: "secondary", label: ru.settings.clock.colorSecondary },
  { value: "accent", label: ru.settings.clock.colorAccent },
  { value: "text", label: ru.settings.clock.colorText },
];
const FONT_OPTIONS: readonly SelectOption<ClockFont>[] = CLOCK_FONTS.map((f) => ({
  value: f.id,
  label: ru.settings.clock.fonts[f.id],
  style: { fontFamily: f.family },
}));
const PREVIEW_SIZE_OPTIONS: readonly SegmentedOption<PreviewSize>[] = (["s", "m", "l"] as const).map((k) => ({ value: k, label: extra.clock.previewSizes[k] }));

/** «Часы»: live preview, preset gallery, then typography / format / layout / colours. Every control writes at once. */
export function ClockPage() {
  const { clock } = useSettings();
  const now = useClockNow(clock);
  const [previewSize, setPreviewSize] = useState<PreviewSize>("s");
  const font = clockFont(clock.font);

  // Any manual edit turns the current look into "custom"; a preset click copies its values.
  const patch = (p: Partial<ClockSettings>) => void settings.updateClock({ ...p, preset: "custom" });
  const applyPreset = (p: ClockPreset) => void settings.updateClock({ ...p.values, preset: p.id });
  const setFont = (id: ClockFont) => patch({ font: id, weight: clampWeight(clock.weight, clockFont(id)) });

  // Static instant for the preset cards and live examples: today at 12:34:56.
  const dayKey = now.toDateString();
  const sample = useMemo(() => {
    const d = new Date(now);
    d.setHours(12, 34, 56, 0);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);
  const dateOptions = useMemo<readonly SelectOption<DateFormat>[]>(
    () => DATE_FORMATS.map((f) => ({ value: f, label: f === "none" ? ru.settings.clock.dateFormats.none : (formatDate(now, f) ?? "") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey],
  );

  const isCustom = clock.preset === "custom" || !CLOCK_PRESETS.some((p) => p.id === clock.preset);
  const size = PREVIEW_SIZES[previewSize];

  return (
    <Page title={ru.settings.nav.clock}>
      {/* Live preview on a stage that stands in for the wallpaper */}
      <div className="clock-stage">
        <div className="clock-stage-head">
          <span className="body-strong">{ru.common.preview}</span>
          <Segmented options={PREVIEW_SIZE_OPTIONS} value={previewSize} onChange={setPreviewSize} size="sm" ariaLabel={ru.common.size} />
        </div>
        <div className="clock-stage-body">
          <div className={clock.background ? "clock-preview" : "clock-preview no-bg"} style={{ width: size.w, height: size.h }} aria-label={ru.tiles.clock}>
            <ClockFace settings={clock} now={now} />
          </div>
        </div>
        <p className="hint clock-stage-hint">{extra.clock.previewHint}</p>
      </div>

      {/* Preset gallery */}
      <Section title={ru.settings.clock.presets} description={ru.settings.clock.presetsHint} padded>
        <div className="clock-presets">
          {CLOCK_PRESETS.map((p) => {
            const values: ClockSettings = { ...DEFAULT_CLOCK, hour12: clock.hour12, ...p.values, preset: p.id };
            const selected = clock.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={selected ? "option-card clock-preset selected" : "option-card clock-preset"}
                aria-pressed={selected}
                onClick={() => applyPreset(p)}
              >
                <div className="card-preview clock-card-preview">
                  <div className={values.background ? "clock-mini" : "clock-mini no-bg"}>
                    <ClockFace settings={values} now={sample} live={false} />
                  </div>
                </div>
                <span className="card-title ellipsis">{presetName(p.id)}</span>
              </button>
            );
          })}
          {isCustom && (
            <div className="option-card clock-preset selected" aria-current="true">
              <div className="card-preview clock-card-preview">
                <div className={clock.background ? "clock-mini" : "clock-mini no-bg"}>
                  <ClockFace settings={clock} now={sample} live={false} />
                </div>
              </div>
              <span className="card-title ellipsis">{ru.settings.clock.presetNames.custom}</span>
              <span className="card-hint ellipsis">{extra.clock.currentSettings}</span>
            </div>
          )}
        </div>
      </Section>

      {/* Typography */}
      <Section title={ru.settings.clock.typography}>
        <Row label={ru.common.font} hint={extra.clock.fontHint}>
          <Select className="clock-font-select" options={FONT_OPTIONS} value={clock.font} onChange={setFont} ariaLabel={ru.common.font} styledValue />
        </Row>
        <div className="row stack">
          <div className="grid-2 clock-sliders">
            <Slider
              label={ru.common.weight}
              min={font.weights[0]}
              max={font.weights[1]}
              step={100}
              value={clampWeight(clock.weight, font)}
              format={formatWeight}
              onChange={(v) => patch({ weight: v })}
            />
            <Slider
              label={ru.common.width}
              min={75}
              max={100}
              step={1}
              value={font.width ? clock.width : 100}
              format={formatPercent}
              disabled={!font.width}
              onChange={(v) => patch({ width: v })}
            />
            <Slider label={ru.common.size} min={24} max={160} step={1} value={clock.size} format={formatPx} onChange={(v) => patch({ size: v })} />
            <Slider
              label={ru.common.tracking}
              min={-8}
              max={12}
              step={1}
              value={clock.letterSpacing}
              format={formatTracking}
              onChange={(v) => patch({ letterSpacing: v })}
            />
          </div>
          <div className="clock-slider-hints">
            {!font.width && <span className="hint">{ru.settings.clock.widthHint}</span>}
            <span className="hint">{extra.clock.sizeHint}</span>
          </div>
        </div>
      </Section>

      {/* Format */}
      <Section title={ru.settings.clock.format}>
        <Row label={ru.settings.clock.seconds}>
          <Switch checked={clock.seconds} onChange={(v) => patch({ seconds: v })} />
        </Row>
        <Row label={ru.settings.clock.blinkColon} hint={extra.clock.blinkHint}>
          <Switch checked={clock.blinkColon} onChange={(v) => patch({ blinkColon: v })} />
        </Row>
        <Row label={ru.settings.clock.hour12} hint={extra.clock.hour12Hint}>
          <Switch checked={clock.hour12} onChange={(v) => patch({ hour12: v })} />
        </Row>
        <Row label={ru.settings.clock.date}>
          <Select className="clock-date-select" options={dateOptions} value={clock.dateFormat} onChange={(v) => patch({ dateFormat: v })} ariaLabel={ru.settings.clock.date} />
        </Row>
        {clock.dateFormat !== "none" && (
          <Row label={ru.settings.clock.datePosition} stack>
            <Segmented options={DATE_POSITION_OPTIONS} value={clock.datePosition} onChange={(v) => patch({ datePosition: v })} fill ariaLabel={ru.settings.clock.datePosition} />
          </Row>
        )}
      </Section>

      {/* Layout */}
      <Section title={ru.settings.clock.layout}>
        <Row label={ru.common.alignment} stack>
          <Segmented options={ALIGN_OPTIONS} value={clock.align} onChange={(v) => patch({ align: v })} fill ariaLabel={ru.common.alignment} />
        </Row>
        <Row label={ru.common.position} stack>
          <Segmented options={VALIGN_OPTIONS} value={clock.valign} onChange={(v) => patch({ valign: v })} fill ariaLabel={ru.common.position} />
        </Row>
      </Section>

      {/* Colours */}
      <Section title={ru.settings.clock.colors}>
        {/* Same markup as <Row stack>, but the control slot stacks so the picker can sit under the segments */}
        <div className="row stack">
          <div className="row-text">
            <span className="row-label">{ru.settings.clock.timeColor}</span>
          </div>
          <div className="row-control clock-color-control">
            <Segmented options={TIME_COLOR_OPTIONS} value={clock.color} onChange={(v) => patch({ color: v })} fill ariaLabel={ru.settings.clock.timeColor} />
            {clock.color === "custom" && (
              <div className="clock-color-picker">
                <ColorPicker value={clock.customColor} onChange={(hex) => patch({ customColor: hex })} />
              </div>
            )}
          </div>
        </div>
        <Row label={ru.settings.clock.dateColor} stack>
          <Segmented options={DATE_COLOR_OPTIONS} value={clock.dateColor} onChange={(v) => patch({ dateColor: v })} fill ariaLabel={ru.settings.clock.dateColor} />
        </Row>
      </Section>

      {/* Other */}
      <Section title={extra.clock.other}>
        <Row label={ru.settings.clock.tabular} hint={extra.clock.tabularHint}>
          <Switch checked={clock.tabular} onChange={(v) => patch({ tabular: v })} />
        </Row>
        <Row label={ru.settings.clock.background} hint={ru.settings.clock.backgroundHint}>
          <Switch checked={clock.background} onChange={(v) => patch({ background: v })} />
        </Row>
      </Section>
    </Page>
  );
}
