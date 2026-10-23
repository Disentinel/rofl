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

/// A value in a URL: every byte but the unreserved ones percent-encoded.
pub(crate) fn escape(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect()
}
