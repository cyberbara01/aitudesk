//! Site icon lookup for custom launchers: apple-touch-icon → <link rel="icon"> in the page → /favicon.ico →
//! Google's favicon service as the last resort. Runs once when a launcher is saved; the result is cached in
//! settings.json as a data: URL, so the tiles never touch the network.

use std::time::Duration;

const MAX_ICON_BYTES: usize = 512 * 1024;
const MAX_HTML_BYTES: usize = 768 * 1024;
const UA: &str = concat!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AITU-Desk/", env!("CARGO_PKG_VERSION"));

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(8)))
        .max_redirects(6)
        .build()
        .into()
}

struct Fetched {
    mime: String,
    bytes: Vec<u8>,
}

fn get(agent: &ureq::Agent, url: &str, limit: usize) -> Option<Fetched> {
    let mut resp = agent.get(url).header("User-Agent", UA).call().ok()?;
    if resp.status().as_u16() >= 400 {
        return None;
    }
    let mime = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let bytes = resp.body_mut().with_config().limit(limit as u64).read_to_vec().ok()?;
    if bytes.is_empty() {
        return None;
    }
    Some(Fetched { mime, bytes })
}

fn sniff_mime(bytes: &[u8], header_mime: &str) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF8") {
        return Some("image/gif");
    }
    if bytes.starts_with(&[0, 0, 1, 0]) {
        return Some("image/x-icon");
    }
    if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    if head.contains("<svg") {
        return Some("image/svg+xml");
    }
    if header_mime.starts_with("image/") {
        return Some(match header_mime {
            "image/png" => "image/png",
            "image/jpeg" | "image/jpg" => "image/jpeg",
            "image/gif" => "image/gif",
            "image/webp" => "image/webp",
            "image/svg+xml" => "image/svg+xml",
            _ => "image/x-icon",
        });
    }
    None
}

fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

fn to_data_url(f: &Fetched) -> Option<String> {
    let mime = sniff_mime(&f.bytes, &f.mime)?;
    Some(format!("data:{mime};base64,{}", base64(&f.bytes)))
}

/// scheme://host[:port] of a URL (no path).
fn origin(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let host = rest.split(['/', '?', '#']).next()?;
    if host.is_empty() {
        return None;
    }
    Some(format!("{scheme}://{host}"))
}

fn host_of(url: &str) -> Option<String> {
    let o = origin(url)?;
    let h = o.split_once("://")?.1;
    Some(h.split(':').next()?.to_string())
}

fn resolve(base_origin: &str, page_url: &str, href: &str) -> String {
    let href = href.trim();
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if let Some(rest) = href.strip_prefix("//") {
        let scheme = base_origin.split_once("://").map(|x| x.0).unwrap_or("https");
        return format!("{scheme}://{rest}");
    }
    if href.starts_with('/') {
        return format!("{base_origin}{href}");
    }
    // relative to the page directory
    let dir = match page_url.rfind('/') {
        Some(i) if i > base_origin.len() => &page_url[..=i],
        _ => &format!("{base_origin}/"),
    };
    format!("{dir}{href}")
}

/// Very small attribute scanner for <link ...> tags: returns (rel, href, sizes) lowercased rel.
fn link_tags(html: &str) -> Vec<(String, String, u32)> {
    let lower = html.to_ascii_lowercase();
    let mut out = Vec::new();
    let mut pos = 0;
    while let Some(i) = lower[pos..].find("<link") {
        let start = pos + i;
        let Some(end_rel) = lower[start..].find('>') else { break };
        let tag = &html[start..start + end_rel];
        let attr = |name: &str| -> Option<String> {
            let l = tag.to_ascii_lowercase();
            let mut p = 0;
            while let Some(j) = l[p..].find(name) {
                let at = p + j;
                let after = &tag[at + name.len()..];
                let after_trim = after.trim_start();
                if let Some(v) = after_trim.strip_prefix('=') {
                    let v = v.trim_start();
                    let (quote, body) = match v.chars().next() {
                        Some(q @ ('"' | '\'')) => (Some(q), &v[1..]),
                        _ => (None, v),
                    };
                    let value = match quote {
                        Some(q) => body.split(q).next().unwrap_or(""),
                        None => body.split([' ', '>', '/']).next().unwrap_or(""),
                    };
                    return Some(value.to_string());
                }
                p = at + name.len();
            }
            None
        };
        let rel = attr(" rel").unwrap_or_default().to_ascii_lowercase();
        if rel.contains("icon") {
            if let Some(href) = attr(" href") {
                let sizes = attr(" sizes")
                    .and_then(|s| s.split(['x', 'X']).next().and_then(|n| n.trim().parse::<u32>().ok()))
                    .unwrap_or(if rel.contains("apple") { 180 } else { 32 });
                out.push((rel, href, sizes));
            }
        }
        pos = start + end_rel;
    }
    out
}

/// Best-effort icon for `url` as a data: URL.
pub fn fetch(url: &str) -> Result<String, String> {
    let base = origin(url).ok_or("Некорректный адрес")?;
    let host = host_of(url).ok_or("Некорректный адрес")?;
    let agent = agent();

    // 1. Apple touch icon (usually 180 px, crisp).
    for path in ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"] {
        if let Some(f) = get(&agent, &format!("{base}{path}"), MAX_ICON_BYTES) {
            if let Some(d) = to_data_url(&f) {
                return Ok(d);
            }
        }
    }

    // 2. Icons declared by the page, largest first (SVG wins).
    if let Some(page) = get(&agent, url, MAX_HTML_BYTES) {
        let html = String::from_utf8_lossy(&page.bytes);
        let mut links = link_tags(&html);
        links.sort_by(|a, b| {
            let score = |l: &(String, String, u32)| {
                let svg = l.1.to_ascii_lowercase().ends_with(".svg");
                (if svg { 10_000 } else { 0 }) + l.2
            };
            score(b).cmp(&score(a))
        });
        for (_, href, _) in links.into_iter().take(4) {
            let target = resolve(&base, url, &href);
            if let Some(f) = get(&agent, &target, MAX_ICON_BYTES) {
                if let Some(d) = to_data_url(&f) {
                    return Ok(d);
                }
            }
        }
    }

    // 3. Classic favicon.
    if let Some(f) = get(&agent, &format!("{base}/favicon.ico"), MAX_ICON_BYTES) {
        if let Some(d) = to_data_url(&f) {
            return Ok(d);
        }
    }

    // 4. Public favicon service (128 px PNG).
    if let Some(f) = get(
        &agent,
        &format!("https://www.google.com/s2/favicons?domain={host}&sz=128"),
        MAX_ICON_BYTES,
    ) {
        if let Some(d) = to_data_url(&f) {
            return Ok(d);
        }
    }

    Err("Иконка сайта не найдена".into())
}
