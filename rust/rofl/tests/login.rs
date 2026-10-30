//! A PERSON SIGNS IN (src/login.rs): a node script stands in for an authorization server with PKCE, dynamic client
//! registration and refresh tokens, and for an API that takes its tokens. `rofl adapter login` registers, sends the
//! person to the server (here a script that follows the address as a browser would) and trades the code for tokens;
//! a book's `login` key then sends the token, and a token the API refused is renewed by the refresh token.
//! Planted: `login_verifier_dropped` sends no code verifier, and the server refuses the code.
#![cfg(feature = "net")]
use rofl::session::Session;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

const SERVER: &str = r#"
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const [portFile, log] = process.argv.slice(2);
let challenge = null, live = null, n = 0;
const json = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const base = `http://127.0.0.1:${server.address().port}`;
    const form = new URLSearchParams(body);
    fs.appendFileSync(log, `${req.method} ${url.pathname} ${form.get('grant_type') || ''}\n`);
    if (url.pathname === '/.well-known/oauth-authorization-server') return json(res, 200, { issuer: base,
      authorization_endpoint: base + '/authorize', token_endpoint: base + '/token', registration_endpoint: base + '/register' });
    if (url.pathname === '/register') return json(res, 201, { client_id: 'c-1' });
    if (url.pathname === '/authorize') {
      if (url.searchParams.get('code_challenge_method') !== 'S256' || url.searchParams.get('client_id') !== 'c-1') return json(res, 400, { error: 'invalid_request' });
      challenge = url.searchParams.get('code_challenge');
      res.writeHead(302, { location: `${url.searchParams.get('redirect_uri')}?code=code-1&state=${url.searchParams.get('state')}` });
      return res.end();
    }
    if (url.pathname === '/token') {
      const issue = () => { live = `a-${++n}`; return json(res, 200, { access_token: live, refresh_token: 'r-1', expires_in: 3600 }); };
      if (form.get('grant_type') === 'authorization_code') {
        const v = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
        return v === challenge && form.get('code') === 'code-1' ? issue() : json(res, 400, { error: 'invalid_grant' });
      }
      if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'r-1') return issue();
      return json(res, 400, { error: 'invalid_grant' });
    }
    if (url.pathname === '/revoke') { live = null; return json(res, 200, {}); }
    if (url.pathname === '/v1/mine') return req.headers.authorization === `Bearer ${live}` ? json(res, 200, { gold: 3 }) : json(res, 401, { error: 'no' });
    json(res, 404, {});
  });
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)));
"#;

const BROWSER: &str = "fetch(process.argv[1]).then(r => r.text()).then(t => console.log(t))";

fn spec(base: &str) -> String {
    format!(r#"
openapi: 3.0.3
info: {{title: Vault, version: "1"}}
servers: [{{url: "{base}/v1"}}]
components:
  securitySchemes:
    token: {{type: http, scheme: bearer}}
paths:
  /mine:
    get:
      operationId: myGold
      security: [{{token: []}}]
      responses: {{"200": {{description: gold, content: {{application/json: {{schema: {{type: object, properties: {{gold: {{type: integer}}}}}}}}}}}}}}
"#)
}

/// The server, stopped however the test ends: a panic must not leave it holding the harness's pipes.
struct Server(std::process::Child, std::path::PathBuf);

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
        std::fs::remove_dir_all(&self.1).ok();
    }
}

fn evaluated(src: &str) -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(src, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

#[test]
fn a_person_signs_in_once_and_the_token_is_renewed_when_refused() {
    let dir = std::env::temp_dir().join(format!("rofl-login-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("server.cjs"), SERVER).unwrap();
    let _server = Server(Command::new("node").arg(dir.join("server.cjs")).arg(dir.join("port")).arg(dir.join("log")).spawn().expect("node"), dir.clone());
    let start = std::time::Instant::now();
    let port = loop {
        if let Some(p) = std::fs::read_to_string(dir.join("port")).ok().filter(|p| !p.is_empty()) {
            break p;
        }
        assert!(start.elapsed().as_secs() < 10, "the server did not start");
        std::thread::sleep(std::time::Duration::from_millis(20));
    };
    let base = format!("http://127.0.0.1:{port}");
    let config = dir.join("config");
    std::env::set_var("XDG_CONFIG_HOME", &config);
    let spec_file = dir.join("vault.yaml");
    std::fs::write(&spec_file, spec(&base)).unwrap();
    let book = rofl::openapi::book(&spec_file.display().to_string(), &[]).unwrap()
        .replace("http_auth(vault, token, bearer, \"Authorization\", \"VAULT_TOKEN\").", &format!("http_auth(vault, token, login, \"{base}\", \"\")."));
    let world = format!("{book}\nask(1).\nwant vault_mygold() :- ask(1).\ngold(G) :- mygold[vault](_, G).\n");

    let mut s = evaluated(&world);
    let keys = s.fact_keys(None);
    assert!(keys.iter().any(|k| k.contains("want_held") && k.contains("rofl adapter login")), "not signed in: {keys:?}");

    let mut login = Command::new(env!("CARGO_BIN_EXE_rofl")).args(["adapter", "login", &base]).env("XDG_CONFIG_HOME", &config)
        .env("PATH", "").stderr(Stdio::piped()).spawn().unwrap();
    let mut err = BufReader::new(login.stderr.take().unwrap());
    let mut said = String::new();
    let url = loop {
        let mut line = String::new();
        assert!(err.read_line(&mut line).unwrap() > 0, "rofl adapter login said no address: {said}");
        said.push_str(&line);
        if line.starts_with("http") {
            break line.trim().to_string();
        }
    };
    let page = Command::new("node").args(["-e", BROWSER, &url]).output().unwrap();
    assert!(String::from_utf8_lossy(&page.stdout).contains("Signed in"), "the browser's page: {page:?}");
    err.read_line(&mut said).unwrap();
    let status = login.wait().unwrap();
    assert!(status.success() && said.contains("signed in to"), "the sign-in: {said}");
    let kept = std::fs::read_to_string(config.join("rofl/logins.json")).unwrap();
    assert!(kept.contains("\"a-1\"") && kept.contains("\"c-1\""), "{kept}");

    let mut s = evaluated(&world);
    assert!(s.holds("gold(3)").unwrap(), "the token sent");
    assert!(!s.fact_keys(None).join("\n").contains("a-1"), "a token never enters a fact");

    Command::new("node").args(["-e", "fetch(process.argv[1], {method: 'POST'})", &format!("{base}/revoke")]).status().unwrap();
    let mut s = evaluated(&world);
    assert!(s.holds("gold(3)").unwrap(), "a refused token renewed");
    let log = std::fs::read_to_string(dir.join("log")).unwrap();
    assert!(log.contains("POST /token refresh_token"), "{log}");
}
