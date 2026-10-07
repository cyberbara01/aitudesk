// Resolves palette + design language + accent from settings and Windows, writes them to <html>.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { accentPreset, isDarkTheme, isHex, onColor, readableOn, resolveTheme, withAlpha } from "./design";
import { markAppearanceApplied } from "./ready";
import { settings, type Settings, type StyleId, type ThemeId } from "./settings";

export type ResolvedTheme = Exclude<ThemeId, "system">;

export interface Appearance {
  theme: ResolvedTheme;
  dark: boolean;
  style: StyleId;
  accent: string;
}

const root = document.documentElement;

/**
 * The surface an accent has to stand out from in each palette: the lightest card on dark palettes, the
 * darkest card on light ones (worst case for contrast). Glass has one per scheme: its frost lets the
 * wallpaper through, so the worst case is a lighter dark frost and a darker light one.
 */
const ACCENT_BACKDROP: Record<ResolvedTheme | "glass-light", string> = {
  dark: "#2A2B32",
  darker: "#1F2025",
  black: "#141414",
  light: "#ECECEF",
  gray: "#DDDEE3",
  glass: "#3A3C45",
  "glass-light": "#D3D6DE",
};

function applyAppearance(a: Appearance) {
  root.setAttribute("data-theme", a.theme);
  root.setAttribute("data-style", a.style);
  root.setAttribute("data-scheme", a.dark ? "dark" : "light");
  // Any accent (a custom one above all) is nudged lighter or darker until it reads on this palette:
  // 3:1 for fills and selection marks, 4.5:1 for accent text. Curated presets already pass and stay as is.
  const bg = ACCENT_BACKDROP[a.theme === "glass" && !a.dark ? "glass-light" : a.theme];
  const fill = readableOn(a.accent, bg, 3);
  root.style.setProperty("--accent", fill);
  root.style.setProperty("--on-accent", onColor(fill));
  root.style.setProperty("--accent-soft", withAlpha(fill, a.dark ? 0.18 : 0.14));
  root.style.setProperty("--accent-text", readableOn(a.accent, bg, 4.5));
  // Native side: light or dark system backdrop for this window (for tiles: the tint of their acrylic); the
  // settings window also switches its material by style (Mica for Windows 11, acrylic for Aqua, a solid
  // surface for Rice). The glass palette is acrylic in every style.
  const material = a.theme === "glass" || a.style === "aqua" ? "acrylic" : a.style === "rice" ? "none" : "mica";
  const isSettingsWindow = getCurrentWindow().label === "settings";
  invoke("set_window_theme", isSettingsWindow ? { dark: a.dark, material } : { dark: a.dark }).catch(() => undefined);
}

async function resolveAccent(s: Settings, dark: boolean): Promise<string> {
  const { accent } = s;
  if (accent.mode === "custom" && isHex(accent.custom)) return accent.custom.toUpperCase();
  if (accent.mode === "preset") {
    const p = accentPreset(accent.preset);
    return dark ? p.dark : p.light;
  }
  try {
    const hex = await invoke<string | null>("get_accent", { dark });
    if (hex && isHex(hex)) return hex.toUpperCase();
  } catch {
    /* fall back to the default accent */
  }
  const p = accentPreset("fluent-blue");
  return dark ? p.dark : p.light;
}

async function applyGlassFlag() {
  try {
    const ok = await invoke<boolean>("get_glass");
    root.setAttribute("data-glass", ok ? "on" : "off");
  } catch {
    root.setAttribute("data-glass", "on");
  }
}

/**
 * Keeps <html data-theme data-style> and the accent variables in sync with settings and Windows.
 * Nothing is applied before both the stored settings and the Windows theme are known, so the hidden
 * window never renders an intermediate look (see ready.ts).
 */
export function useTheme(): Appearance {
  const [windowsDark, setWindowsDark] = useState<boolean | null>(null);
  const [s, setS] = useState<Settings>(settings.get());
  const [loaded, setLoaded] = useState(settings.isLoaded());
  const [appearance, setAppearance] = useState<Appearance>({ theme: "dark", dark: true, style: "fluent", accent: "#60CDFF" });

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    win
      .theme()
      .then((t) => alive && setWindowsDark(t !== "light"))
      .catch(() => alive && setWindowsDark(true));
    win.onThemeChanged(({ payload }) => setWindowsDark(payload !== "light")).then((u) => {
      if (alive) unlisten = u;
      else u();
    });
    applyGlassFlag();
    const stop = settings.subscribe(setS);
    settings.ready().then(() => alive && setLoaded(true));
    return () => {
      alive = false;
      unlisten?.();
      stop();
    };
  }, []);

  const theme = resolveTheme(s.theme, windowsDark ?? true);
  // Glass keeps its own tokens in both schemes and takes light or dark from Windows, as "system" does.
  const dark = theme === "glass" ? (windowsDark ?? true) : isDarkTheme(theme);
  const accentKey = `${s.accent.mode}|${s.accent.preset}|${s.accent.custom}`;
  const known = loaded && windowsDark !== null;

  useEffect(() => {
    if (!known) return;
    let cancelled = false;
    resolveAccent(s, dark).then((accent) => {
      if (cancelled) return;
      const next = { theme, dark, style: s.style, accent };
      applyAppearance(next);
      setAppearance(next);
      markAppearanceApplied();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, theme, dark, s.style, accentKey]);

  return appearance;
}
