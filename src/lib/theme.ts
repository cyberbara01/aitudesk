// Resolves palette + design language + accent from settings and Windows, writes them to <html>.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { accentPreset, isDarkTheme, isHex, onColor, resolveTheme, withAlpha } from "./design";
import { settings, type Settings, type StyleId, type ThemeId } from "./settings";

export type ResolvedTheme = Exclude<ThemeId, "system">;

export interface Appearance {
  theme: ResolvedTheme;
  dark: boolean;
  style: StyleId;
  accent: string;
}

const root = document.documentElement;

function applyAppearance(a: Appearance) {
  root.setAttribute("data-theme", a.theme);
  root.setAttribute("data-style", a.style);
  root.setAttribute("data-scheme", a.dark ? "dark" : "light");
  root.style.setProperty("--accent", a.accent);
  root.style.setProperty("--on-accent", onColor(a.accent));
  root.style.setProperty("--accent-soft", withAlpha(a.accent, a.dark ? 0.18 : 0.14));
  root.style.setProperty("--accent-text", a.accent);
  // Native side: title bar of the settings window + its material (Mica / acrylic / solid by style).
  const material = a.style === "aqua" ? "acrylic" : a.style === "rice" ? "none" : "mica";
  invoke("set_window_theme", { dark: a.dark, material }).catch(() => undefined);
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

/** Keeps <html data-theme data-style> and the accent variables in sync with settings and Windows. */
export function useTheme(): Appearance {
  const [windowsDark, setWindowsDark] = useState(true);
  const [s, setS] = useState<Settings>(settings.get());
  const [appearance, setAppearance] = useState<Appearance>({ theme: "dark", dark: true, style: "fluent", accent: "#60CDFF" });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    win.theme().then((t) => setWindowsDark(t !== "light"));
    win.onThemeChanged(({ payload }) => setWindowsDark(payload !== "light")).then((u) => (unlisten = u));
    applyGlassFlag();
    const stop = settings.subscribe(setS);
    return () => {
      unlisten?.();
      stop();
    };
  }, []);

  const theme = resolveTheme(s.theme, windowsDark);
  const dark = isDarkTheme(theme);
  const accentKey = `${s.accent.mode}|${s.accent.preset}|${s.accent.custom}`;

  useEffect(() => {
    let cancelled = false;
    resolveAccent(s, dark).then((accent) => {
      if (cancelled) return;
      const next = { theme, dark, style: s.style, accent };
      applyAppearance(next);
      setAppearance(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, dark, s.style, accentKey]);

  return appearance;
}
