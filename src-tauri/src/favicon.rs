//! Site icon lookup for custom launchers: apple-touch-icon → <link rel="icon"> in the page → /favicon.ico →
//! Google's favicon service as the last resort. Runs once when a launcher is saved; the result is cached in
//! settings.json as a data: URL, so the tiles never touch the network.
//!
//! Only the launcher's own host is asked whatever it is (a launcher may well lead to a router's page). Anything a
//! page or a redirect points to elsewhere must be on the open internet: never this computer or the local network,
//! so a page cannot make the app knock on devices at home. Redirects are followed here, one by one, for that.

use std::net::{IpAddr, ToSocketAddrs};
use std::time::Duration;

const MAX_ICON_BYTES: usize = 512 * 1024;
const MAX_HTML_BYTES: usize = 768 * 1024;
const UA: &str = concat!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AITU-Desk/", env!("CARGO_PKG_VERSION"));
const MAX_REDIRECTS: usize = 6;

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(8)))
        // Followed in `get`, where every new address is checked first.
        .max_redirects(0)
        .build()
        .into()
}

/// Host (no user info, no IPv6 brackets, lowercase) and port of an http(s) URL.
fn host_port(url: &str) -> Option<(String, u16)> {
    let (scheme, rest) = url.split_once("://")?;
    let default = match scheme {
        "http" => 80,
        "https" => 443,
        _ => return None,
    };
    let authority = rest.split(['/', '?', '#']).next()?;
    let authority = authority.rsplit('@').next()?;
    let (host, port) = if let Some(v6) = authority.strip_prefix('[') {
        let (h, tail) = v6.split_once(']')?;
        let port = match tail.strip_prefix(':') {
            Some(p) => p.parse().ok()?,
            None => default,
        };
        (h, port)
    } else {
        match authority.rsplit_once(':') {
            Some((h, p)) => (h, p.parse().ok()?),
            None => (authority, default),
        }
    };
    (!host.is_empty()).then(|| (host.to_ascii_lowercase(), port))
}

/// An address on the open internet: not this computer, a local or link-local network, carrier NAT, multicast, or a
/// reserved or documentation range.
fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_documentation()
                || o[0] == 0
                || (o[0] == 100 && (o[1] & 0xC0) == 64)
                || (o[0] == 192 && o[1] == 0 && o[2] == 0)
                || (o[0] == 198 && (o[1] & 0xFE) == 18)
                || o[0] >= 240)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(IpAddr::V4(v4));
            }
            let s = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (s[0] & 0xFE00) == 0xFC00
                || (s[0] & 0xFFC0) == 0xFE80
                || (s[0] & 0xFFC0) == 0xFEC0
                || (s[0] == 0x2001 && s[1] == 0x0DB8)
                || (s[0] == 0x0064 && s[1] == 0xFF9B))
        }
    }
}

/// Whether the app may ask `url`: the launcher's own host always, any other host only when every address it has
/// is on the open internet.
fn allowed(url: &str, own_host: &str) -> bool {
    let Some((host, port)) = host_port(url) else { return false };
    if host == own_host {
        return true;
    }
    match (host.as_str(), port).to_socket_addrs() {
        Ok(addrs) => {
            let addrs: Vec<_> = addrs.collect();
            !addrs.is_empty() && addrs.iter().all(|a| is_public(a.ip()))
        }
        Err(_) => false,
    }
}

struct Fetched {
    mime: String,
    bytes: Vec<u8>,
}

fn get(agent: &ureq::Agent, url: &str, own_host: &str, limit: usize) -> Option<Fetched> {
    let mut url = url.to_string();
    let mut resp = None;
    for _ in 0..=MAX_REDIRECTS {
        if !allowed(&url, own_host) {
            return None;
        }
        let r = agent.get(&url).header("User-Agent", UA).call().ok()?;
        if !r.status().is_redirection() {
            resp = Some(r);
            break;
        }
        let location = r.headers().get("location")?.to_str().ok()?.to_string();
        let base = origin(&url)?;
        url = resolve(&base, &url, &location);
    }
    let mut resp = resp?;
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

/// The host name alone: no user name or password, no port, lower case.
fn host_of(url: &str) -> Option<String> {
    host_port(url).map(|(h, _)| h)
}

/// A name the public favicon service can know: a dotted domain (not an address) whose every address is public.
/// localhost, a router's 192.168.x.x or an intranet name are never sent to it.
fn public_name(host: &str) -> bool {
    host.contains('.') && host.parse::<IpAddr>().is_err() && allowed(&format!("https://{host}/"), "")
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

/// Best-effort icon for `url` as a data: URL. The scheme is read in any case («Https://» as typed).
pub fn fetch(url: &str) -> Result<String, String> {
    let url = &match url.split_once("://") {
        Some((scheme, rest)) => format!("{}://{rest}", scheme.to_ascii_lowercase()),
        None => url.to_string(),
    };
    let base = origin(url).ok_or("invalid address")?;
    let host = host_of(url).ok_or("invalid address")?;
    let (own, _) = host_port(url).ok_or("invalid address")?;
    let agent = agent();

    // 1. Apple touch icon (usually 180 px, crisp).
    for path in ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"] {
        if let Some(f) = get(&agent, &format!("{base}{path}"), &own, MAX_ICON_BYTES) {
            if let Some(d) = to_data_url(&f) {
                return Ok(d);
            }
        }
    }

    // 2. Icons declared by the page, largest first (SVG wins).
    if let Some(page) = get(&agent, url, &own, MAX_HTML_BYTES) {
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
            if let Some(f) = get(&agent, &target, &own, MAX_ICON_BYTES) {
                if let Some(d) = to_data_url(&f) {
                    return Ok(d);
                }
            }
        }
    }

    // 3. Classic favicon.
    if let Some(f) = get(&agent, &format!("{base}/favicon.ico"), &own, MAX_ICON_BYTES) {
        if let Some(d) = to_data_url(&f) {
            return Ok(d);
        }
    }

    // 4. Public favicon service (128 px PNG); it learns the site's name only (the in-app privacy text says so), and
    //    only a public one.
    if public_name(&host) {
        if let Some(f) = get(
            &agent,
            &format!("https://www.google.com/s2/favicons?domain={host}&sz=128"),
            &own,
            MAX_ICON_BYTES,
        ) {
            if let Some(d) = to_data_url(&f) {
                return Ok(d);
            }
        }
    }

    Err("no site icon found".into())
}
