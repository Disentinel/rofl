//! A PERSON SIGNS IN (OAuth 2.1, the authorization code with PKCE, RFC 7636; guide/ADAPTERS.md, Keys): `rofl adapter
//! login ISSUER [CLIENT_ID]` reads the authorization server's metadata (RFC 8414), registers a client when none is
//! given and the server allows it (RFC 7591), prints the address to sign in at and opens it in a browser, takes the
//! code on a loopback port (RFC 8252) and trades it for tokens. A book that says `http_auth(A, S, login, "ISSUER",
//! "")` then sends that token, renewed by its refresh token when it expires or the service refuses it.
//!
//! The tokens are kept in `$XDG_CONFIG_HOME/rofl/logins.json` (else `~/.config/rofl/logins.json`), readable by its
//! owner only; never in a fact.
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn store_path() -> Result<PathBuf, String> {
    let dir = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .ok_or("no HOME to keep a sign-in in")?;
    Ok(dir.join("rofl/logins.json"))
}

fn read_store() -> Value {
    store_path().ok().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| json!({}))
}

fn write_store(v: &Value) -> Result<(), String> {
    let p = store_path()?;
    std::fs::create_dir_all(p.parent().expect("a parent")).map_err(|e| format!("{}: {e}", p.display()))?;
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut o, 0o600);
    o.open(&p).and_then(|mut f| f.write_all(v.to_string().as_bytes())).map_err(|e| format!("{}: {e}", p.display()))
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn b64url(bytes: &[u8]) -> String {
    crate::net::base64_bytes(bytes).trim_end_matches('=').replace('+', "-").replace('/', "_")
}

fn random() -> String {
    let mut b = [0u8; 32];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut b).expect("random bytes");
    b64url(&b)
}

fn form(url: &str, pairs: &[(&str, &str)]) -> Result<Value, String> {
    let body = pairs.iter().map(|(k, v)| format!("{k}={}", crate::net::escape(v))).collect::<Vec<_>>().join("&");
    let r = crate::net::request("POST", url, &[("accept", "application/json".into())], Some(("application/x-www-form-urlencoded", body)))?;
    let v: Value = serde_json::from_str(&r.body).unwrap_or_default();
    if r.status / 100 != 2 || v.get("access_token").is_none() {
        return Err(format!("the token endpoint {url}: HTTP {}: {}", r.status, r.body.chars().take(200).collect::<String>()));
    }
    Ok(v)
}

/// The tokens an exchange gave, kept for `issuer` with the client and endpoint that renew them.
fn keep(issuer: &str, client: &str, endpoint: &str, t: &Value, old_refresh: Option<&str>) -> Result<String, String> {
    let access = t["access_token"].as_str().unwrap_or_default().to_string();
    let mut store = read_store();
    store[issuer] = json!({
        "client_id": client, "token_endpoint": endpoint, "access_token": access,
        "refresh_token": t["refresh_token"].as_str().or(old_refresh),
        "expires_at": now() + t["expires_in"].as_u64().unwrap_or(3600).saturating_sub(60),
    });
    write_store(&store)?;
    Ok(access)
}

/// Whether a person has signed in to `issuer` here.
pub fn signed_in(issuer: &str) -> bool {
    read_store()[issuer]["access_token"].is_string()
}

/// The access token of `issuer`, renewed first when it expired or `stale` (the service refused it).
pub fn token(issuer: &str, stale: bool) -> Result<String, String> {
    let e = read_store()[issuer].clone();
    let Some(access) = e["access_token"].as_str() else {
        return Err(format!("no one has signed in to {issuer} here: a person runs `rofl adapter login {issuer}`"));
    };
    if !stale && e["expires_at"].as_u64().unwrap_or(0) > now() {
        return Ok(access.to_string());
    }
    let (Some(refresh), Some(client), Some(endpoint)) = (e["refresh_token"].as_str(), e["client_id"].as_str(), e["token_endpoint"].as_str()) else {
        return Err(format!("the sign-in to {issuer} expired and cannot be renewed: a person runs `rofl adapter login {issuer}` again"));
    };
    let t = form(endpoint, &[("grant_type", "refresh_token"), ("refresh_token", refresh), ("client_id", client)])
        .map_err(|e| format!("the sign-in to {issuer} could not be renewed ({e}): a person runs `rofl adapter login {issuer}` again"))?;
    keep(issuer, client, endpoint, &t, Some(refresh))
}

/// `rofl adapter login ISSUER [CLIENT_ID]`: the whole sign-in, a person at a browser; what to say when it is done.
pub fn login(issuer: &str, client: Option<&str>) -> Result<String, String> {
    let meta = crate::net::auth_metadata(issuer)?;
    let field = |k: &str| meta[k].as_str().map(str::to_string).ok_or_else(|| format!("{issuer}: its metadata names no {k}"));
    let (authorize, endpoint) = (field("authorization_endpoint")?, field("token_endpoint")?);
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| format!("a loopback port: {e}"))?;
    let redirect = format!("http://127.0.0.1:{}/callback", listener.local_addr().map_err(|e| e.to_string())?.port());
    let client = match client.map(str::to_string).or_else(|| read_store()[issuer]["client_id"].as_str().map(str::to_string)) {
        Some(c) => c,
        None => {
            let reg = field("registration_endpoint").map_err(|_| format!("{issuer} registers no clients itself: give the client id, `rofl adapter login {issuer} CLIENT_ID`"))?;
            let body = json!({"client_name": "rofl", "redirect_uris": [redirect], "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"], "token_endpoint_auth_method": "none"});
            let r = crate::net::send("POST", &reg, &[("accept", "application/json".into())], Some(&body))?;
            let v: Value = serde_json::from_str(&r.body).unwrap_or_default();
            v["client_id"].as_str().map(str::to_string).ok_or_else(|| format!("the registration at {reg}: HTTP {}: {}", r.status, r.body.chars().take(200).collect::<String>()))?
        }
    };
    let (verifier, state) = (random(), random());
    let mut c = ring::digest::Context::new(&ring::digest::SHA256);
    c.update(verifier.as_bytes());
    let challenge = b64url(c.finish().as_ref());
    let e = crate::net::escape;
    let url = format!("{authorize}{}response_type=code&client_id={}&redirect_uri={}&code_challenge={challenge}&code_challenge_method=S256&state={state}",
        if authorize.contains('?') { '&' } else { '?' }, e(&client), e(&redirect));
    eprintln!("Sign in at this address (it opens in a browser if one is here):\n{url}");
    for opener in ["xdg-open", "open"] {
        if std::process::Command::new(opener).arg(&url).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().is_ok() {
            break;
        }
    }
    let code = callback(&listener, &state)?;
    let t = form(&endpoint, &[("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", &redirect), ("client_id", &client), ("code_verifier", crate::brk!("login_verifier_dropped" => ""; verifier.as_str()))])?;
    keep(issuer, &client, &endpoint, &t, None)?;
    Ok(format!("signed in to {issuer}; a book uses it with http_auth(Adapter, Scheme, login, \"{issuer}\", \"\")"))
}

/// The code the browser brings back to the loopback port, its state checked; ten minutes for a person to sign in.
fn callback(listener: &std::net::TcpListener, state: &str) -> Result<String, String> {
    let until = std::time::Instant::now() + Duration::from_secs(600);
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    loop {
        match listener.accept() {
            Ok((mut s, _)) => {
                s.set_nonblocking(false).ok();
                let mut line = String::new();
                BufReader::new(&s).read_line(&mut line).ok();
                let query = line.split_whitespace().nth(1).and_then(|p| p.split_once('?')).map(|(_, q)| q.to_string()).unwrap_or_default();
                let get = |k: &str| query.split('&').find_map(|kv| kv.strip_prefix(&format!("{k}="))).map(unescape);
                let said = match (get("code"), get("state"), get("error")) {
                    (Some(code), Some(st), _) if st == state => Ok(code),
                    (_, _, Some(err)) => Err(format!("the sign-in was refused: {err}")),
                    (Some(_), _, _) => Err("the sign-in came back with another state: not this request".to_string()),
                    _ => continue,
                };
                let page = if said.is_ok() { "Signed in. You can close this tab." } else { "The sign-in failed; see the terminal." };
                let _ = write!(s, "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{page}", page.len());
                return said;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock && std::time::Instant::now() < until => std::thread::sleep(Duration::from_millis(50)),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return Err("no one signed in within ten minutes".into()),
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn unescape(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                out.push(u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap_or(b'?'));
                i += 3;
            }
            b'+' => { out.push(b' '); i += 1; }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
