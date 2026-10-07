//! Windows notifications (toasts) for reminders. The installer gives the Start menu and desktop shortcuts the
//! app's AppUserModelID (the bundle identifier), which is what Windows needs to show a toast from a desktop
//! app with its name and icon. No network, no extra dependency: WinRT through the `windows` crate.

use windows::core::HSTRING;
use windows::Data::Xml::Dom::XmlDocument;
use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

/// Same as `identifier` in tauri.conf.json.
const AUMID: &str = "kz.edu.astanait.aitudesk";
/// Small grey line under every reminder: where to change or switch them off.
const WHERE: &str = "Изменить можно в разделе «Напоминания»";

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c if (c as u32) < 0x20 && c != '\n' && c != '\t' => {}
            c => out.push(c),
        }
    }
    out
}

/// Show a toast with a title and one text line. `silent` turns the sound off; `quiet` (quiet hours) skips the
/// pop-up as well and puts the notification straight into the notification centre, so nothing is lost.
pub fn show(title: &str, body: &str, silent: bool, quiet: bool) -> Result<(), String> {
    let silent = silent || quiet;
    let audio = if silent { r#"<audio silent="true"/>"# } else { "" };
    let xml = format!(
        r#"<toast><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text><text placement="attribution">{}</text></binding></visual>{audio}</toast>"#,
        escape(title),
        escape(body),
        escape(WHERE)
    );
    let doc = XmlDocument::new().map_err(|e| e.to_string())?;
    doc.LoadXml(&HSTRING::from(xml)).map_err(|e| e.to_string())?;
    let toast = ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
    if quiet {
        toast.SetSuppressPopup(true).map_err(|e| e.to_string())?;
    }
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(AUMID)).map_err(|e| e.to_string())?;
    notifier.Show(&toast).map_err(|e| e.to_string())
}
