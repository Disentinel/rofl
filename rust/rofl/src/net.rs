//! HTTP for the adapters (docs/intents.md, The post as built): the `openapi` kind and mcp over its streamable HTTP
//! transport. Blocking calls on the adapter's own thread; reqwest keeps its tokio inside, and the engine never sees it.
//! A build without the cargo feature `net` has no HTTP: every call is refused, and says why.

/// What came back: the status, the content type, the MCP session the server named, the body.
pub(crate) struct Reply {
    pub status: u16,
    pub kind: String,
    pub session: Option<String>,
    pub body: String,
}

#[cfg(feature = "net")]
pub(crate) fn send(method: &str, url: &str, headers: &[(&str, String)], body: Option<&serde_json::Value>) -> Result<Reply, String> {
    use std::sync::OnceLock;
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    let client = CLIENT.get_or_init(|| reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(60)).build().expect("an http client"));
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("{method}: {e}"))?;
    let mut r = client.request(m, url);
    for (k, v) in headers {
        r = r.header(*k, v);
    }
    if let Some(b) = body {
        r = r.header("content-type", "application/json").body(b.to_string());
    }
    let r = r.send().map_err(|e| format!("{method} {url}: {e}"))?;
    let head = |k: &str| r.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
    let (status, kind, session) = (r.status().as_u16(), head("content-type").unwrap_or_default(), head("mcp-session-id"));
    let body = r.text().map_err(|e| format!("{method} {url}: {e}"))?;
    Ok(Reply { status, kind, session, body })
}

#[cfg(not(feature = "net"))]
pub(crate) fn send(_: &str, url: &str, _: &[(&str, String)], _: Option<&serde_json::Value>) -> Result<Reply, String> {
    Err(format!("{url}: this build has no http (cargo feature `net`)"))
}

/// The standard base64 of `s`, for a basic credential.
pub(crate) fn base64(s: &str) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for c in s.as_bytes().chunks(3) {
        let n = c.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..4 {
            out.push(if i <= c.len() { A[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

/// What a credential adds to a request: a header, or a pair in the query.
pub(crate) fn credential(how: &str, name: &str, value: &str) -> (Option<(String, String)>, Option<String>) {
    match how {
        "bearer" => (Some(("authorization".into(), format!("Bearer {value}"))), None),
        "basic" => (Some(("authorization".into(), format!("Basic {}", base64(value)))), None),
        "query" => (None, Some(format!("{}={}", escape(name), escape(value)))),
        _ => (Some((name.to_string(), value.to_string())), None),
    }
}

/// A value in a URL: every byte but the unreserved ones percent-encoded.
pub(crate) fn escape(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect()
}
