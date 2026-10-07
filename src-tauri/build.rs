fn main() {
    browser_args();
    tauri_build::build()
}

/// Every window must use the same WebView2 arguments and scrollbar style (windows that differ cannot share one
/// WebView2 environment). The tile windows declare them in tauri.conf.json; the settings window is built in
/// code and gets the same arguments through the AITUDESK_BROWSER_ARGS compile-time variable.
fn browser_args() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    let text = std::fs::read_to_string("tauri.conf.json").expect("read tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(&text).expect("parse tauri.conf.json");
    let windows = conf["app"]["windows"].as_array().expect("app.windows");
    let mut args: Option<&str> = None;
    for w in windows {
        let label = w["label"].as_str().unwrap_or("?");
        let value = w["additionalBrowserArgs"]
            .as_str()
            .unwrap_or_else(|| panic!("window {label}: additionalBrowserArgs is missing"));
        match args {
            None => args = Some(value),
            Some(first) => assert_eq!(first, value, "window {label}: additionalBrowserArgs differ"),
        }
    }
    println!("cargo:rustc-env=AITUDESK_BROWSER_ARGS={}", args.expect("no windows in tauri.conf.json"));
    // The scrollbar style is part of the same shared environment; the settings window uses fluentOverlay.
    for w in windows {
        let label = w["label"].as_str().unwrap_or("?");
        assert_eq!(w["scrollBarStyle"].as_str(), Some("fluentOverlay"), "window {label}: scrollBarStyle must be fluentOverlay");
    }
}
