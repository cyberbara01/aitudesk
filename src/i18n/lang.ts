// The interface language, Russian or English, fixed for the life of a page. The native side picks it when the app
// starts (settings.language, or the display language of Windows for "auto") and hands it to every window before
// any script runs (window.__AITUDESK_LANG__, src-tauri/src/lang.rs); changing it in «Общие» restarts the app.
// The string files (ru.ts, ru.extra.*.ts) export the dictionary of this language; English lives in src/i18n/en/.

export type Lang = "ru" | "en";

declare global {
  interface Window {
    __AITUDESK_LANG__?: string;
  }
}

/** Display languages of Windows that get the Russian interface (the rest get English), as in lang.rs. */
const RUSSIAN_SPEAKING = /^(ru|kk|be|ky)\b/;

function detect(): Lang {
  const given = typeof window !== "undefined" ? window.__AITUDESK_LANG__ : undefined;
  if (given === "ru" || given === "en") return given;
  // Without the native side (a plain browser): the browser's language, by the same rule.
  const nav = typeof navigator !== "undefined" ? (navigator.language || "").toLowerCase() : "";
  return RUSSIAN_SPEAKING.test(nav) ? "ru" : "en";
}

export const LANG: Lang = detect();
// The page says which language it is in, so Narrator reads the English interface by English rules.
if (typeof document !== "undefined") document.documentElement.lang = LANG;

/** Locale for dates, letter case and sorting: Russian, or British English (day before month, week from Monday). */
export const LOCALE = LANG === "ru" ? "ru-RU" : "en-GB";

/**
 * The type of a dictionary with its texts widened to string: `as const` keeps the Russian object's keys and
 * shapes exact, and the English one must match them while its words differ.
 */
export type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;

/** English plural: one (1) or other. */
export const pluralEn = (n: number, one: string, other: string) => (Math.abs(n) === 1 ? one : other);
