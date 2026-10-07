//! The interface language, fixed for the life of the process: `settings.language` ("ru", "en" or "auto"), and
//! for "auto" the display language of Windows: Russian for Russian, Kazakh, Belarusian and Kyrgyz, English for
//! the rest (the same rule as src/i18n/lang.ts). Every page gets it before its scripts run (`init_script`);
//! the native texts (tray menu, notifications, window titles, file dialogs) pick their words with `pick`.
//! Changing the language in the settings restarts the app (`commands::restart_app`).

use std::sync::OnceLock;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    Ru,
    En,
}

static LANG: OnceLock<Lang> = OnceLock::new();

impl Lang {
    pub fn code(self) -> &'static str {
        match self {
            Lang::Ru => "ru",
            Lang::En => "en",
        }
    }
}

/// Decides the language once, from the settings file as it is on disk before the store plugin opens it.
pub fn init(identifier: &str) -> Lang {
    *LANG.get_or_init(|| match read_setting(identifier).as_deref() {
        Some("ru") => Lang::Ru,
        Some("en") => Lang::En,
        _ => windows_language(),
    })
}

pub fn current() -> Lang {
    LANG.get().copied().unwrap_or_else(windows_language)
}

/// The Russian or the English text, for the current language.
pub fn pick<'a>(ru: &'a str, en: &'a str) -> &'a str {
    match current() {
        Lang::Ru => ru,
        Lang::En => en,
    }
}

/// Script every page runs before its own: tells the interface which dictionary to use.
pub fn init_script(lang: Lang) -> String {
    format!("window.__AITUDESK_LANG__ = \"{}\";", lang.code())
}

fn read_setting(identifier: &str) -> Option<String> {
    let appdata = std::env::var_os("APPDATA")?;
    let path = std::path::PathBuf::from(appdata).join(identifier).join(crate::layout::STORE_FILE);
    let bytes = std::fs::read(path).ok()?;
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    value.pointer("/settings/language")?.as_str().map(str::to_owned)
}

/// Primary language of the Windows display language (the low 10 bits of the LANGID).
fn windows_language() -> Lang {
    let primary = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() } & 0x3ff;
    match primary {
        // LANG_RUSSIAN, LANG_KAZAK, LANG_BELARUSIAN, LANG_KYRGYZ
        0x19 | 0x3f | 0x23 | 0x40 => Lang::Ru,
        _ => Lang::En,
    }
}
