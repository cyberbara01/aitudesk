//! Windows accent colour, picked the way Windows itself does for text/indicators:
//! dark theme → AccentLight2, light theme → AccentDark1.

use windows::UI::ViewManagement::{UIColorType, UISettings};

pub fn accent_hex(dark: bool) -> Option<String> {
    let ui = UISettings::new().ok()?;
    let kind = if dark { UIColorType::AccentLight2 } else { UIColorType::AccentDark1 };
    let c = ui.GetColorValue(kind).ok()?;
    Some(format!("#{:02X}{:02X}{:02X}", c.R, c.G, c.B))
}
