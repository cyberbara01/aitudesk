// «Оформление»: live preview, design language (3), palette (6), accent (Windows / presets / custom).
import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { Page, Section } from "../components/Section";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { ACCENT_PRESETS, STYLES, THEMES, accentPreset, isHex, type ThemeMeta } from "../lib/design";
import { settings, type StyleId, type ThemeId } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { useDebounced, useNow } from "./shell/hooks";
import { PreviewClock, PreviewSystem } from "./shell/Preview";

const a = ru.settings.appearance;
const x = extra.appearance;

const STYLE_TEXT: Record<StyleId, { title: string; hint: string }> = {
  fluent: { title: a.styles.fluent, hint: a.styles.fluentHint },
  aqua: { title: a.styles.aqua, hint: a.styles.aquaHint },
  rice: { title: a.styles.rice, hint: a.styles.riceHint },
};

const accentName = (id: string): string => (a.accents as Record<string, string>)[id] ?? id;
const themeMeta = (id: ThemeId): ThemeMeta => THEMES.find((t) => t.id === id) ?? THEMES[0];
const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

function CardCheck() {
  return (
    <span className="card-check" aria-hidden="true">
      <Icon name="checkmark" variant="filled" size={16} />
    </span>
  );
}

function swatchVars(sw: ThemeMeta["swatch"]): CSSProperties {
  return { "--tp-bg": sw.bg, "--tp-fill": sw.fill, "--tp-text": sw.text, "--tp-muted": sw.muted } as CSSProperties;
}

function MiniTile({ time }: { time: string }) {
  return (
    <span className="tp-tile">
      <span className="tp-time">{time}</span>
      <span className="tp-bar" />
    </span>
  );
}

interface ThemeCardProps {
  meta: ThemeMeta;
  selected: boolean;
  time: string;
  onSelect: () => void;
}

function ThemeCard({ meta, selected, time, onSelect }: ThemeCardProps) {
  const hint = meta.id === "system" ? x.themeSystemHint : undefined;
  return (
    <button type="button" role="radio" aria-checked={selected} className={selected ? "option-card selected" : "option-card"} onClick={onSelect}>
      {meta.id === "system" ? (
        <div className="card-preview tp split">
          <div className="tp-half" style={swatchVars(themeMeta("light").swatch)}>
            <MiniTile time={time} />
          </div>
          <div className="tp-half" style={swatchVars(themeMeta("dark").swatch)}>
            <MiniTile time={time} />
          </div>
          {selected && <CardCheck />}
        </div>
      ) : (
        <div className="card-preview tp" style={swatchVars(meta.swatch)}>
          <MiniTile time={time} />
          {selected && <CardCheck />}
        </div>
      )}
      <div className="card-text">
        <div className="card-title">{a.themes[meta.id]}</div>
        {hint && <div className="card-hint">{hint}</div>}
      </div>
    </button>
  );
}

export function AppearancePage() {
  const s = useSettings();
  const now = useNow(s.clock.seconds);
  const meta = themeMeta(s.theme);
  const dark = meta.dark ?? document.documentElement.getAttribute("data-scheme") !== "light";
  const deskStyle = { "--desk": meta.swatch.bg } as CSSProperties;
  const cardTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const mode = s.accent.mode;

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
        <div className="pv-desk" style={deskStyle}>
          <PreviewClock s={s} now={now} />
          <PreviewSystem s={s} />
        </div>
      </Section>

      <Section title={a.style} description={a.styleHint} padded>
        <div className="grid-3" role="radiogroup" aria-label={a.style}>
          {STYLES.map(({ id }) => {
            const selected = s.style === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={selected} className={selected ? "option-card selected" : "option-card"} onClick={() => setStyle(id)}>
                <div className="card-preview sp" data-sp={id} style={deskStyle}>
                  <span className="sp-tile">
                    <span className="sp-time">{cardTime}</span>
                    <span className="sp-bar" />
                    <span className="sp-bar short" />
                    <span className="sp-switch" />
                  </span>
                  {selected && <CardCheck />}
                </div>
                <div className="card-text">
                  <div className="card-title">{STYLE_TEXT[id].title}</div>
                  <div className="card-hint">{STYLE_TEXT[id].hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={a.theme} description={x.themeHint} padded>
        <div className="grid-3" role="radiogroup" aria-label={a.theme}>
          {THEMES.map((t) => (
            <ThemeCard key={t.id} meta={t} selected={s.theme === t.id} time={cardTime} onSelect={() => setTheme(t.id)} />
          ))}
        </div>
      </Section>

      <Section title={a.accent} description={x.accentHint} padded>
        <button type="button" aria-pressed={mode === "windows"} className={mode === "windows" ? "option-card horizontal selected" : "option-card horizontal"} onClick={useWindowsAccent}>
          <span className="acc-dot solid" style={{ "--tone": windowsSwatch } as CSSProperties} aria-hidden="true" />
          <span className="card-text">
            <span className="card-title">{a.accentWindows}</span>
            <span className="card-hint">{x.accentWindowsHint}</span>
          </span>
          {mode === "windows" && <Icon name="checkmark" variant="filled" className="card-tick" />}
        </button>

        <div className="sub-label">{x.presets}</div>
        <div className="acc-grid" role="radiogroup" aria-label={x.presets}>
          {ACCENT_PRESETS.map((p) => {
            const selected = mode === "preset" && s.accent.preset === p.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={selected} className={selected ? "acc-item selected" : "acc-item"} onClick={() => usePreset(p.id)}>
                <span className="acc-dot" style={{ "--tone-dark": p.dark, "--tone-light": p.light } as CSSProperties} aria-hidden="true" />
                <span className="acc-name">{accentName(p.id)}</span>
              </button>
            );
          })}
        </div>

        <button type="button" aria-pressed={mode === "custom"} className={mode === "custom" ? "option-card horizontal selected" : "option-card horizontal"} onClick={useCustom}>
          <span className="acc-dot conic" aria-hidden="true" />
          <span className="card-text">
            <span className="card-title">{a.accentCustom}</span>
            <span className="card-hint">{x.accentCustomHint}</span>
          </span>
          {mode === "custom" && <Icon name="checkmark" variant="filled" className="card-tick" />}
        </button>
        {mode === "custom" && <ColorPicker value={draft ?? s.accent.custom} onChange={onCustomColor} customOpen />}
      </Section>
    </Page>
  );
}
