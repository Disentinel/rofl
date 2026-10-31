//! HTTP for the adapters (docs/intents.md, The post as built): the `openapi` kind and mcp over its streamable HTTP
//! transport. Blocking calls on the adapter's own thread; reqwest keeps its tokio inside, and the engine never sees it.
//! A build without the cargo feature `net` has no HTTP: every call is refused, and says why.

/// What came back: the status, the content type, the MCP session the server named, its `WWW-Authenticate`, the body.
pub(crate) struct Reply {
    pub status: u16,
    pub kind: String,
    pub session: Option<String>,
    pub challenge: Option<String>,
    pub body: String,
}

/// One request, its body JSON.
pub(crate) fn send(method: &str, url: &str, headers: &[(&str, String)], body: Option<&serde_json::Value>) -> Result<Reply, String> {
    request(method, url, headers, body.map(|b| ("application/json", b.to_string())))
}

#[cfg(feature = "net")]
pub(crate) fn request(method: &str, url: &str, headers: &[(&str, String)], body: Option<(&str, String)>) -> Result<Reply, String> {
    use std::sync::OnceLock;
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    let client = CLIENT.get_or_init(|| reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(60)).build().expect("an http client"));
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("{method}: {e}"))?;
    let mut r = client.request(m, url);
    for (k, v) in headers {
        r = r.header(*k, v);
    }
    if let Some((kind, b)) = body {
        r = r.header("content-type", kind).body(b);
    }
    let r = r.send().map_err(|e| format!("{method} {url}: {e}"))?;
    let head = |k: &str| r.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
    let (status, kind, session, challenge) = (r.status().as_u16(), head("content-type").unwrap_or_default(), head("mcp-session-id"), head("www-authenticate"));
    let body = r.text().map_err(|e| format!("{method} {url}: {e}"))?;
    Ok(Reply { status, kind, session, challenge, body })
}

#[cfg(not(feature = "net"))]
pub(crate) fn request(_: &str, url: &str, _: &[(&str, String)], _: Option<(&str, String)>) -> Result<Reply, String> {
    Err(format!("{url}: this build has no http (cargo feature `net`)"))
}

type Kept = std::sync::Mutex<std::collections::HashMap<String, (String, std::time::Instant)>>;

/// The access tokens client credentials got, by endpoint and client, until they expire.
fn tokens() -> &'static Kept {
    static T: std::sync::OnceLock<Kept> = std::sync::OnceLock::new();
    T.get_or_init(Default::default)
}

/// A person's sign-in to renew before its next use (src/login.rs): a service refused its token.
static LOGIN_STALE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Every token kept is dropped: a service refused one before it expired.
pub(crate) fn forget_tokens() {
    tokens().lock().expect("tokens").clear();
    LOGIN_STALE.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// A token the credentials `how` may renew when a service refuses it.
pub(crate) fn renewable(how: &str) -> bool {
    matches!(how, "client_credentials" | "login")
}

#[cfg(feature = "net")]
fn login_token(issuer: &str) -> Result<String, String> {
    crate::login::token(issuer, LOGIN_STALE.swap(false, std::sync::atomic::Ordering::Relaxed))
}

#[cfg(not(feature = "net"))]
fn login_token(issuer: &str) -> Result<String, String> {
    Err(format!("{issuer}: this build has no http (cargo feature `net`)"))
}

/// OAuth2 client credentials (RFC 6749 4.4): `client` is `id:secret`, `endpoint` the token URL and, after a space,
/// the scopes. The token is kept until a minute before it expires.
fn client_token(endpoint: &str, client: &str) -> Result<String, String> {
    let (url, scope) = endpoint.split_once(' ').unwrap_or((endpoint, ""));
    let key = format!("{endpoint}\n{client}");
    if let Some((t, _)) = tokens().lock().expect("tokens").get(&key).filter(|(_, until)| *until > std::time::Instant::now()) {
        return Ok(t.clone());
    }
    let mut form = "grant_type=client_credentials".to_string();
    if !scope.is_empty() {
        form.push_str(&format!("&scope={}", escape(scope)));
    }
    let r = request("POST", url, &[("authorization", format!("Basic {}", base64(client))), ("accept", "application/json".into())], Some(("application/x-www-form-urlencoded", form)))?;
    let v: serde_json::Value = serde_json::from_str(&r.body).unwrap_or_default();
    let Some(t) = v.get("access_token").and_then(|t| t.as_str()).filter(|_| r.status / 100 == 2) else {
        return Err(format!("the token endpoint {url}: HTTP {}: {}", r.status, r.body.chars().take(200).collect::<String>()));
    };
    let life = v.get("expires_in").and_then(|e| e.as_u64()).unwrap_or(3600).saturating_sub(60).max(1);
    tokens().lock().expect("tokens").insert(key, (t.to_string(), std::time::Instant::now() + std::time::Duration::from_secs(life)));
    Ok(t.to_string())
}

/// The standard base64 of `s`, for a basic credential.
pub(crate) fn base64(s: &str) -> String {
    base64_bytes(s.as_bytes())
}

pub(crate) fn base64_bytes(bytes: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for c in bytes.chunks(3) {
        let n = c.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..4 {
            out.push(if i <= c.len() { A[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

/// What a credential adds to a request: a header, or a pair in the query; client credentials get their token first.
pub(crate) fn credential(how: &str, name: &str, value: &str) -> Result<(Option<(String, String)>, Option<String>), String> {
    Ok(match how {
        "bearer" => (Some(("authorization".into(), format!("Bearer {value}"))), None),
        "basic" => (Some(("authorization".into(), format!("Basic {}", base64(value)))), None),
        "client_credentials" => (Some(("authorization".into(), format!("Bearer {}", client_token(name, value)?))), None),
        "login" => (Some(("authorization".into(), format!("Bearer {}", login_token(name)?))), None),
        "query" => (None, Some(format!("{}={}", escape(name), escape(value)))),
        _ => (Some((name.to_string(), value.to_string())), None),
    })
}

/// A value in a URL: every byte but the unreserved ones percent-encoded.
pub(crate) fn escape(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect()
}

/// A key named on the command line of `rofl adapter`: `HOW[:NAME]=ENV`, HOW one of bearer, basic, header, query,
/// client_credentials (its NAME the token URL), as `(how, name, env)`; or `login:ISSUER`, a person's sign-in.
pub fn declared(arg: &str) -> Result<(String, String, String), String> {
    if let Some(issuer) = arg.strip_prefix("login:").filter(|i| !i.is_empty()) {
        return Ok(("login".into(), issuer.into(), String::new()));
    }
    let (left, env) = arg.rsplit_once('=').ok_or_else(|| format!("{arg}: a key is HOW[:NAME]=ENV"))?;
    let (how, name) = left.split_once(':').unwrap_or((left, ""));
    let name = match (how, name) {
        ("bearer" | "basic", "") => "Authorization",
        ("header" | "query" | "client_credentials", n) if !n.is_empty() => n,
        _ => return Err(format!("{arg}: bearer=ENV, basic=ENV, header:NAME=ENV, query:NAME=ENV, client_credentials:TOKEN_URL=ENV or login:ISSUER")),
    };
    Ok((how.to_string(), name.to_string(), env.to_string()))
}

/// The keys `declared` names, read from the environment; a missing one is said by its variable.
pub(crate) fn from_env(declared: &[(String, String, String)]) -> Result<Vec<(String, String, String)>, String> {
    declared.iter().map(|(how, name, env)| match std::env::var(env).ok().filter(|v| !v.is_empty()) {
        _ if how == "login" => Ok((how.clone(), name.clone(), String::new())),
        Some(v) => Ok((how.clone(), name.clone(), v)),
        None => Err(format!("the environment has no {env}")),
    }).collect()
}

/// The `http_auth` rows of keys named on the command line, a scheme each by its kind.
pub(crate) fn auth_rows(adapter: &str, declared: &[(String, String, String)]) -> String {
    declared.iter().map(|(how, name, env)| format!("http_auth({adapter}, {how}, {how}, {}, {}).\n", crate::mcp::quote(name), crate::mcp::quote(env))).collect()
}

fn json_get(url: &str) -> Option<serde_json::Value> {
    send("GET", url, &[("accept", "application/json".into())], None).ok().filter(|r| r.status / 100 == 2).and_then(|r| serde_json::from_str(&r.body).ok())
}

/// The authorization server's metadata (RFC 8414; else OpenID Connect discovery), the issuer's path after the
/// well-known segment.
pub(crate) fn auth_metadata(issuer: &str) -> Result<serde_json::Value, String> {
    let (origin, path) = match issuer.find("://").and_then(|i| issuer[i + 3..].find('/').map(|j| i + 3 + j)) {
        Some(k) => (&issuer[..k], issuer[k..].trim_end_matches('/')),
        None => (issuer.trim_end_matches('/'), ""),
    };
    ["oauth-authorization-server", "openid-configuration"].iter()
        .find_map(|w| json_get(&format!("{origin}/.well-known/{w}{path}")))
        .ok_or_else(|| format!("{issuer}: no authorization server metadata at {origin}/.well-known/oauth-authorization-server{path}"))
}

/// What a 401 asks for, said so a person can give it: with an MCP server's `resource_metadata` (RFC 9728), its
/// authorization server's token endpoint (RFC 8414) and the line of the book that would use it.
pub(crate) fn wanted(r: &Reply) -> String {
    let said = r.challenge.clone().unwrap_or_default();
    let meta = said.split("resource_metadata=").nth(1).map(|m| m.trim_start_matches('"').split(['"', ',']).next().unwrap_or("").to_string());
    let issuer = meta.as_deref().and_then(json_get).and_then(|m| m.pointer("/authorization_servers/0").and_then(|a| a.as_str()).map(str::to_string));
    let Some(issuer) = issuer else {
        return format!("the server wants a key (WWW-Authenticate: {said}); name it in the book, http_auth(Adapter, Scheme, bearer|basic|header|query|client_credentials, Name, Env)");
    };
    let token = auth_metadata(&issuer).ok().and_then(|m| m.get("token_endpoint").and_then(|t| t.as_str()).map(str::to_string));
    match token {
        Some(t) => format!("the server wants a token from {issuer} (WWW-Authenticate: {said}); a person signs in with `rofl adapter login {issuer}`, and the book says http_auth(Adapter, oauth, login, \"{issuer}\", \"\"), or `login:{issuer}` to `rofl adapter`; a client of it gets one at {t}: http_auth(Adapter, oauth, client_credentials, \"{t}\", Env) with Env holding id:secret, or `client_credentials:{t}=ENV` to `rofl adapter`"),
        None => format!("the server wants a token from {issuer} (WWW-Authenticate: {said}), whose token endpoint could not be read"),
    }
}
