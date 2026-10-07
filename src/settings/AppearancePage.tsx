// «Оформление»: live preview, design language (3), palette (7, glass included), accent (Windows / presets /
// custom), reset.
import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { ResetSection } from "../components/ResetSection";
import { Page, Row, Section } from "../components/Section";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { ACCENT_PRESETS, STYLES, THEMES, accentPreset, isHex, type ThemeMeta } from "../lib/design";
import { settings, TILE_SCALES, type Settings, type StyleId, type ThemeId, type TileScale } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useDebounced, useNow, useRootAttribute } from "./shell/hooks";
import { PreviewClock, PreviewSystem } from "./shell/Preview";
import { onRadioGroupKeyDown } from "../lib/radioGroup";

const a = ru.settings.appearance;
const x = extra.appearance;

const STYLE_TEXT: Record<StyleId, { title: string; hint: string }> = {
  fluent: { title: a.styles.fluent, hint: a.styles.fluentHint },
  aqua: { title: a.styles.aqua, hint: a.styles.aquaHint },
  rice: { title: a.styles.rice, hint: a.styles.riceHint },
};

const accentName = (id: string): string => (a.accents as Record<string, string>)[id] ?? id;
const themeMeta = (id: string | null): ThemeMeta => THEMES.find((t) => t.id === id) ?? THEMES[0];
const THEME_NAMES: Record<ThemeId, string> = { ...a.themes, glass: x.glassName };
const THEME_HINTS: Partial<Record<ThemeId, string>> = { system: x.themeSystemHint, glass: x.glassHint };

const percentOf = (zoom: number) => x.percent(Math.round(zoom * 100));
/** «Авто», 80 %, 90 %, 100 %, 110 % (Segmented keys are strings). */
const SCALE_OPTIONS: readonly SegmentedOption<string>[] = TILE_SCALES.map((v) => ({
  value: String(v),
  label: v === "auto" ? x.tileScaleAuto : percentOf(v),
}));
const scaleOf = (key: string): TileScale => TILE_SCALES.find((v) => String(v) === key) ?? "auto";

/** «Размер виджетов»: the zoom of every widget; the hint says what «Авто» picks for this screen. */
function TileScaleSection({ value }: { value: TileScale }) {
  const [auto, setAuto] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    invoke<{ auto: number }>("get_tile_zoom").then(
      (z) => alive && setAuto(z.auto),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Section title={x.tileScale} description={x.tileScaleHint}>
      <Row label={x.tileScaleLabel} hint={auto === null ? undefined : x.tileScaleAutoNow(percentOf(auto))}>
        <Segmented
          options={SCALE_OPTIONS}
          value={String(value)}
          onChange={(key) => void settings.update({ tileScale: scaleOf(key) })}
          ariaLabel={x.tileScale}
        />
      </Row>
    </Section>
  );
}

/** Title row of a card; the selected card gets a check after its title (never over the preview it shows). */
function CardHead({ title, selected }: { title: string; selected: boolean }) {
  return (
    <div className="card-head">
      <span className="card-title">{title}</span>
      {selected && <Icon name="checkmark" variant="filled" size={16} className="card-tick" />}
    </div>
  );
}

function swatchVars(sw: ThemeMeta["swatch"]): CSSProperties {
  return { "--tp-bg": sw.bg, "--tp-fill": sw.fill, "--tp-text": sw.text, "--tp-muted": sw.muted } as CSSProperties;
}

/** A tile in the palette's swatch colours; the gallery shows a fixed sample time, like the clock presets. */
function MiniTile() {
  return (
    <span className="tp-tile">
      <span className="tp-time">{x.sampleTime}</span>
      <span className="tp-bar" />
    </span>
  );
}

/** A list tile (schedule, notes) sketched with bars, for the wide glass card. */
function MiniList() {
  return (
    <span className="tp-tile tp-list">
      <span className="tp-bar" />
      <span className="tp-bar long" />
      <span className="tp-bar" />
    </span>
  );
}

interface ThemeCardProps {
  meta: ThemeMeta;
  selected: boolean;
  onSelect: () => void;
}

function ThemeCard({ meta, selected, onSelect }: ThemeCardProps) {
  const hint = THEME_HINTS[meta.id];
  // Glass gets the whole last row: its frost needs a wide, colourful wallpaper to read as glass.
  const cls = ["option-card", meta.id === "glass" ? "wide" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} className={cls} onClick={onSelect}>
      {meta.id === "system" ? (
        <div className="card-preview tp split" aria-hidden="true">
          <div className="tp-half" style={swatchVars(themeMeta("light").swatch)}>
            <MiniTile />
          </div>
          <div className="tp-half" style={swatchVars(themeMeta("dark").swatch)}>
            <MiniTile />
          </div>
        </div>
      ) : meta.id === "glass" ? (
        <div className="card-preview tp glass" style={swatchVars(meta.swatch)} aria-hidden="true">
          <MiniTile />
          <MiniList />
        </div>
      ) : (
        <div className="card-preview tp" style={swatchVars(meta.swatch)} aria-hidden="true">
          <MiniTile />
        </div>
      )}
      <div className="card-text">
        <CardHead title={THEME_NAMES[meta.id]} selected={selected} />
        {hint && <div className="card-hint">{hint}</div>}
      </div>
    </button>
  );
}

/** «Так будут выглядеть виджеты». The only part of the page with a timer: it ticks every second only while the clock shows seconds. */
function LivePreview({ s, desk }: { s: Settings; desk: CSSProperties }) {
  const now = useNow(s.clock.seconds);
  return (
    <div className="pv-desk" style={desk}>
      <PreviewClock s={s} now={now} />
      <PreviewSystem s={s} />
    </div>
  );
}

export function AppearancePage() {
  const s = useSettings();
  // The palette really applied to this window ("system" already resolved) drives the wallpaper of the
  // previews and the tone of the Windows accent swatch; it follows Windows while the page is open.
  const applied = useRootAttribute("data-theme");
  const dark = useRootAttribute("data-scheme") !== "light";
  const desk = { "--desk": themeMeta(applied ?? s.theme).swatch.bg } as CSSProperties;
  const mode = s.accent.mode;
  // An unknown stored preset id falls back to the first preset (src/lib/theme.ts), so mark that one.
  const presetId = accentPreset(s.accent.preset).id;

  // The Windows accent, for the swatch on the «Как в Windows» card.
  const [windowsAccent, setWindowsAccent] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    invoke<string | null>("get_accent", { dark })
      .then((hex) => {
        if (alive) setWindowsAccent(hex && isHex(hex) ? hex.toUpperCase() : null);
      })
      .catch(() => {
        if (alive) setWindowsAccent(null);
      });
    return () => {
      alive = false;
    };
  }, [dark]);
  const fallback = accentPreset("fluent-blue");
  const windowsSwatch = windowsAccent ?? (dark ? fallback.dark : fallback.light);

  // Custom colour: the picker emits on every pointer move, so keep a local draft and write debounced.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (draft && s.accent.custom.toUpperCase() === draft.toUpperCase()) setDraft(null);
  }, [s.accent.custom, draft]);
  const commitCustom = useDebounced((hex: string) => {
    void settings.update((cur) => ({ accent: { ...cur.accent, mode: "custom", custom: hex } }));
  }, 120);
  const onCustomColor = (hex: string) => {
    setDraft(hex);
    commitCustom(hex);
  };

  const setStyle = (style: StyleId) => void settings.update({ style });
  const setTheme = (theme: ThemeId) => void settings.update({ theme });
  const useWindowsAccent = () => void settings.update((cur) => ({ accent: { ...cur.accent, mode: "windows" } }));
  const usePreset = (preset: string) => void settings.update((cur) => ({ accent: { ...cur.accent, mode: "preset", preset } }));
  const useCustom = () => void settings.update((cur) => ({ accent: { ...cur.accent, mode: "custom" } }));

  return (
    <Page title={ru.settings.nav.appearance} description={x.desc}>
      <Section title={a.preview} description={x.previewHint} padded>
        <LivePreview s={s} desk={desk} />
      </Section>

      <Section title={a.style} description={a.styleHint} padded>
        <div className="grid-3" role="radiogroup" aria-label={a.style} onKeyDown={onRadioGroupKeyDown}>
          {STYLES.map(({ id }) => {
            const selected = s.style === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                className={selected ? "option-card selected" : "option-card"}
                onClick={() => setStyle(id)}
              >
                <div className="card-preview sp" data-sp={id} style={desk} aria-hidden="true">
                  <span className="sp-tile">
                    <span className="sp-time">{x.sampleTime}</span>
                    <span className="sp-bar" />
                    <span className="sp-bar short" />
                    <span className="sp-switch" />
                  </span>
                </div>
                <div className="card-text">
                  <CardHead title={STYLE_TEXT[id].title} selected={selected} />
                  <div className="card-hint">{STYLE_TEXT[id].hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={a.theme} description={x.themeHint} padded>
        <div className="grid-3" role="radiogroup" aria-label={a.theme} onKeyDown={onRadioGroupKeyDown}>
          {THEMES.map((t) => (
            <ThemeCard key={t.id} meta={t} selected={s.theme === t.id} onSelect={() => setTheme(t.id)} />
          ))}
        </div>
      </Section>

      <Section title={a.accent} description={x.accentHint} padded>
        {/* One choice, one radio group: «Как в Windows», the presets and «Свой цвет». */}
        <div className="acc-group" role="radiogroup" aria-label={a.accent} onKeyDown={onRadioGroupKeyDown}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "windows"}
            tabIndex={mode === "windows" ? 0 : -1}
            className={mode === "windows" ? "option-card horizontal selected" : "option-card horizontal"}
            onClick={useWindowsAccent}
          >
            <span className="acc-dot solid" style={{ "--tone": windowsSwatch } as CSSProperties} aria-hidden="true" />
            <span className="card-text">
              <span className="card-title">{a.accentWindows}</span>
              <span className="card-hint">{x.accentWindowsHint}</span>
            </span>
            {mode === "windows" && <Icon name="checkmark" variant="filled" className="card-tick" />}
          </button>

          <div className="sub-label">{x.presets}</div>
          <div className="acc-grid">
            {ACCENT_PRESETS.map((p) => {
              const selected = mode === "preset" && presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? "acc-item selected" : "acc-item"}
                  onClick={() => usePreset(p.id)}
                >
                  <span className="acc-dot" style={{ "--tone-dark": p.dark, "--tone-light": p.light } as CSSProperties} aria-hidden="true" />
                  <span className="acc-name">{accentName(p.id)}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="radio"
            aria-checked={mode === "custom"}
            tabIndex={mode === "custom" ? 0 : -1}
            className={mode === "custom" ? "option-card horizontal selected" : "option-card horizontal"}
            onClick={useCustom}
          >
            <span className="acc-dot cp-swatch custom" aria-hidden="true" />
            <span className="card-text">
              <span className="card-title">{a.accentCustom}</span>
              <span className="card-hint">{x.accentCustomHint}</span>
            </span>
            {mode === "custom" && <Icon name="checkmark" variant="filled" className="card-tick" />}
          </button>
        </div>
        {mode === "custom" && <ColorPicker value={draft ?? s.accent.custom} onChange={onCustomColor} customOpen />}
      </Section>

      <TileScaleSection value={s.tileScale} />

      <ResetSection section="appearance" />
    </Page>
  );
}
