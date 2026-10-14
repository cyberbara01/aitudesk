//! The interface language, fixed for the life of the process: `settings.language` ("ru", "kk", "en" or "auto"),
//! and for "auto" the display language of Windows: Kazakh for Kazakh, Russian for Russian, Belarusian and Kyrgyz,
//! English for the rest (the same rule as src/i18n/lang.ts). Every page gets it before its scripts run (`init_script`);
//! the native texts (tray menu, notifications, window titles, file dialogs) pick their words with `pick`.
//! Changing the language in the settings restarts the app (`commands::restart_app`).

use std::sync::OnceLock;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    Ru,
    En,
    Kk,
}

static LANG: OnceLock<Lang> = OnceLock::new();

impl Lang {
    pub fn code(self) -> &'static str {
        match self {
            Lang::Ru => "ru",
            Lang::En => "en",
            Lang::Kk => "kk",
        }
    }
}

/// Decides the language once, from the settings file as it is on disk before the store plugin opens it.
pub fn init(identifier: &str) -> Lang {
    *LANG.get_or_init(|| match read_setting(identifier).as_deref() {
        Some("ru") => Lang::Ru,
        Some("en") => Lang::En,
        Some("kk") => Lang::Kk,
        _ => windows_language(),
    })
}

pub fn current() -> Lang {
    LANG.get().copied().unwrap_or_else(windows_language)
}

/// The Russian, the English or the Kazakh text, for the current language.
pub fn pick<'a>(ru: &'a str, en: &'a str, kk: &'a str) -> &'a str {
    match current() {
        Lang::Ru => ru,
        Lang::En => en,
        Lang::Kk => kk,
    }
}

/// Script every page runs before its own: tells the interface which dictionary to use.
pub fn init_script(lang: Lang) -> String {
    format!("window.__AITUDESK_LANG__ = \"{}\";", lang.code())
}

fn read_setting(identifier: &str) -> Option<String> {
    // The folder the store plugin uses (the Roaming known folder), as lib.rs reads it.
    let path = crate::roaming_app_data()?.join(identifier).join(crate::layout::STORE_FILE);
    let bytes = std::fs::read(path).ok()?;
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    value.pointer("/settings/language")?.as_str().map(str::to_owned)
}

/// Primary language of the Windows display language (the low 10 bits of the LANGID).
fn windows_language() -> Lang {
    let primary = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() } & 0x3ff;
    match primary {
        // LANG_KAZAK
        0x3f => Lang::Kk,
        // LANG_RUSSIAN, LANG_BELARUSIAN, LANG_KYRGYZ
        0x19 | 0x23 | 0x40 => Lang::Ru,
        _ => Lang::En,
    }
}
