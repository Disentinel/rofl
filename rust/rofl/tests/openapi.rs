//! THE OPENAPI ADAPTER AND MCP OVER HTTP (docs/intents.md 7, scenario 6): a node script stands in for a pet shop, an
//! HTTP service with an OpenAPI document, and for an MCP server on its streamable HTTP transport, and logs every
//! request it is sent. Version b of the document changed one operation, `listPets`.
//! Planted: `openapi_book_digest` prints a digest of the whole document in the book, and the regenerated book moves
//! outside the changed operation; `openapi_does_get` makes every operation `reads`, and evaluation sends a POST;
//! `http_key_ignored` takes no key from the environment, and the vault is never opened; `token_kept_refused` keeps
//! a token the service refused, and the orders after it fail.
use rofl::session::Session;
use std::path::PathBuf;
use std::process::{Child, Command};

const SHOP: &str = r#"
const http = require('http');
const fs = require('fs');
const [portFile, log] = process.argv.slice(2);
let issued = 0; const uses = {};
const pets = { 1: { id: 1, name: 'Rex', tag: 'dog' }, 2: { id: 2, name: 'Tom', tag: 'cat' } };
const json = (res, code, v, kind) => { res.writeHead(code, { 'content-type': kind || 'application/json' }); res.end(typeof v === 'string' ? v : JSON.stringify(v)); };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    fs.appendFileSync(log, `${req.method} ${req.url} ${req.headers['idempotency-key'] || '-'} ${body}\n`);
    const url = new URL(req.url, 'http://x');
    const base = `http://127.0.0.1:${server.address().port}`;
    if (url.pathname === '/token') {
      if (req.headers.authorization !== 'Basic ' + Buffer.from('app:s3cret').toString('base64') || !body.includes('grant_type=client_credentials')) return json(res, 401, { error: 'invalid_client' });
      issued += 1; uses[`tk-${issued}`] = 4;
      return json(res, 200, { access_token: `tk-${issued}`, token_type: 'Bearer', expires_in: 3600 });
    }
    if (url.pathname === '/.well-known/oauth-protected-resource') return json(res, 200, { resource: base + '/locked', authorization_servers: [base] });
    if (url.pathname === '/.well-known/oauth-authorization-server') return json(res, 200, { issuer: base, token_endpoint: base + '/token' });
    const bearer = () => { const t = (req.headers.authorization || '').replace('Bearer ', ''); return uses[t] > 0 && uses[t]-- > 0; };
    if (url.pathname === '/v3/orders') return bearer() ? json(res, 200, [{ id: Number(url.searchParams.get('n')) }]) : json(res, 401, 'expired', 'text/plain');
    if (url.pathname === '/locked') {
      if (bearer()) return mcp(req, res, JSON.parse(body));
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` });
      return res.end();
    }
    if (url.pathname === '/mcp') return mcp(req, res, JSON.parse(body));
    const m = url.pathname.match(/^\/v1\/pets\/(\d+)$/);
    if (req.method === 'GET' && m) return pets[m[1]] ? json(res, 200, pets[m[1]]) : json(res, 404, 'no such pet', 'text/plain');
    if (req.method === 'GET' && url.pathname === '/v1/pets') return json(res, 200, Object.values(pets).filter(p => !url.searchParams.get('tag') || p.tag === url.searchParams.get('tag')));
    if (url.pathname === '/v2/vault') return req.headers['x-api-key'] === 'k-1' && url.searchParams.get('sig') === 's&1' ? json(res, 200, { gold: 7 }) : json(res, 401, 'no key', 'text/plain');
    if (url.pathname === '/v2/mine') return req.headers.authorization === 'Bearer t-1' ? json(res, 200, { gold: 3 }) : json(res, 401, 'no token', 'text/plain');
    if (req.method === 'POST' && url.pathname === '/v1/pets') { const p = JSON.parse(body); return json(res, 201, `made ${p.name}`, 'text/plain'); }
    json(res, 404, 'not here', 'text/plain');
  });
});
function mcp(req, res, m) {
  if (!m.id) { res.writeHead(202); return res.end(); }
  if (m.method === 'initialize') {
    res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's-42' });
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Pet Desk' } } }));
  }
  if (req.headers['mcp-session-id'] !== 's-42') return json(res, 400, 'no session', 'text/plain');
  let result;
  if (m.method === 'tools/list') result = { tools: [{ name: 'find_pet', inputSchema: { type: 'object', properties: { petName: { type: 'string' } } } }] };
  else result = { content: [{ type: 'text', text: `found ${m.params.arguments.petName}` }] };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(`event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n`);
  res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result })}\n\n`);
}
server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)));
"#;

struct Shop {
    child: Child,
    dir: PathBuf,
    base: String,
}

impl Drop for Shop {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        std::fs::remove_dir_all(&self.dir).ok();
    }
}

fn shop(name: &str) -> Shop {
    let dir = std::env::temp_dir().join(format!("rofl-openapi-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("shop.cjs"), SHOP).unwrap();
    let child = Command::new("node").arg(dir.join("shop.cjs")).arg(dir.join("port")).arg(dir.join("log")).spawn().expect("node");
    let start = std::time::Instant::now();
    let port = loop {
        if let Some(p) = std::fs::read_to_string(dir.join("port")).ok().filter(|p| !p.is_empty()) {
            break p;
        }
        assert!(start.elapsed().as_secs() < 10, "the shop did not start");
        std::thread::sleep(std::time::Duration::from_millis(20));
    };
    let base = format!("http://127.0.0.1:{port}");
    Shop { child, dir, base }
}

impl Shop {
    fn log(&self) -> Vec<String> {
        std::fs::read_to_string(self.dir.join("log")).unwrap_or_default().lines().map(str::to_string).collect()
    }

    /// The shop's document, version a or b, written where `rofl adapter openapi` reads it.
    fn spec(&self, version: &str) -> String {
        let list_params = if version == "b" {
            r#"[{"name": "tag", "in": "query", "schema": {"type": "string"}}, {"name": "limit", "in": "query", "schema": {"type": "integer"}}]"#
        } else {
            r#"[{"name": "tag", "in": "query", "schema": {"type": "string"}}]"#
        };
        let doc = format!(
            r##"{{"openapi": "3.0.3", "info": {{"title": "Pet Shop", "version": "1"}}, "servers": [{{"url": "{}/v1"}}],
  "paths": {{
    "/pets/{{petId}}": {{"parameters": [{{"name": "petId", "in": "path", "required": true, "schema": {{"type": "integer"}}}}],
      "get": {{"operationId": "getPet", "summary": "A pet by id", "responses": {{"200": {{"description": "the pet", "content": {{"application/json": {{"schema": {{"$ref": "#/components/schemas/Pet"}}}}}}}}}}}}}},
    "/pets": {{
      "get": {{"operationId": "listPets", "summary": "Pets", "parameters": {list_params},
        "responses": {{"200": {{"description": "pets", "content": {{"application/json": {{"schema": {{"type": "array", "items": {{"$ref": "#/components/schemas/Pet"}}}}}}}}}}}}}},
      "post": {{"operationId": "createPet", "summary": "A new pet", "requestBody": {{"content": {{"application/json": {{"schema": {{"type": "object", "properties": {{"name": {{"type": "string"}}, "tag": {{"type": "string"}}}}}}}}}}}},
        "responses": {{"201": {{"description": "made", "content": {{"text/plain": {{"schema": {{"type": "string"}}}}}}}}}}}}}}}},
  "components": {{"schemas": {{"Pet": {{"type": "object", "properties": {{"id": {{"type": "integer"}}, "name": {{"type": "string"}}, "tag": {{"type": "string"}}}}}}}}}}}}"##,
            self.base
        );
        let path = self.dir.join("spec.json");
        std::fs::write(&path, doc).unwrap();
        path.display().to_string()
    }
}

fn evaluated(src: &str) -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(src, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

/// The operation each line of a book belongs to.
fn block_of(book: &str, line: &str) -> String {
    book.split("\n\n").find(|b| b.lines().any(|l| l == line)).and_then(|b| b.lines().next()).unwrap_or("").to_string()
}

#[test]
fn a_regenerated_book_differs_by_exactly_the_changed_operation() {
    let shop = shop("book");
    let a = rofl::openapi::book(&shop.spec("a"), &[]).unwrap();
    let b = rofl::openapi::book(&shop.spec("b"), &[]).unwrap();
    assert!(a.contains(&format!("adapter(pet_shop, openapi, \"{}/v1\").", shop.base)), "{a}");
    assert!(a.contains("capability(pet_shop_getpet, pet_shop, reads).\nhttp_op(pet_shop_getpet, \"GET\", \"/pets/{petId}\").\narg(pet_shop_getpet, 1, petid, number).\nhttp_in(pet_shop_getpet, 1, path, \"petId\")."), "{a}");
    assert!(a.contains("answers(pet_shop_getpet, getpet, 4).\nhttp_field(pet_shop_getpet, 2, \"id\")."), "a $ref is followed: {a}");
    assert!(a.contains("capability(pet_shop_createpet, pet_shop, does)."), "{a}");
    assert!(a.contains("http_in(pet_shop_createpet, 2, body, \"tag\").\nanswers(pet_shop_createpet, http_body, 2)."), "{a}");
    let (la, lb): (Vec<&str>, Vec<&str>) = (a.lines().collect(), b.lines().collect());
    let moved: Vec<String> = la.iter().filter(|l| !lb.contains(l)).map(|l| block_of(&a, l))
        .chain(lb.iter().filter(|l| !la.contains(l)).map(|l| block_of(&b, l))).collect();
    assert!(!moved.is_empty(), "version b changed an operation");
    assert!(moved.iter().all(|t| t.starts_with("-- operation listPets:")), "only listPets moved: {moved:?}\n{a}\n{b}");
}

#[test]
fn a_get_want_is_answered_from_the_service_and_a_post_waits_for_its_permit() {
    let shop = shop("get");
    let book = rofl::openapi::book(&shop.spec("a"), &[]).unwrap();
    let mut s = evaluated(&format!(
        "{book}
asked(1). asked(3).
want pet_shop_getpet(P) :- asked(P).
name_of(P, N) :- want_arg(W, 1, P), getpet[pet_shop](W, _, N, _).
want pet_shop_listpets(\"cat\") :- asked(1).
cat(N) :- listpets[pet_shop](_, _, N, \"cat\").
want pet_shop_createpet(\"Bob\", \"fish\") :- asked(1).
permit(W) :- want_of(W, pet_shop_createpet).
"
    ));
    assert!(s.holds("name_of(1, \"Rex\")").unwrap(), "{:?}", shop.log());
    assert!(s.holds("failed($want(pet_shop_getpet, 3), \"HTTP 404: no such pet\")").unwrap());
    assert!(s.holds("cat(\"Tom\")").unwrap() && !s.holds("cat(\"Rex\")").unwrap(), "an array answers a row per element");
    assert!(shop.log().iter().all(|l| l.starts_with("GET ")), "evaluation sends no does want: {:?}", shop.log());
    assert!(shop.log().contains(&"GET /v1/pets?tag=cat - ".to_string()), "{:?}", shop.log());
    s.dispatch(&shop.dir.join("journal")).unwrap();
    let posts: Vec<String> = shop.log().into_iter().filter(|l| l.starts_with("POST")).collect();
    assert_eq!(posts.len(), 1, "{posts:?}");
    let p: Vec<&str> = posts[0].splitn(4, ' ').collect();
    assert_eq!(p[2].len(), 16, "the idempotency key goes in its header: {posts:?}");
    assert_eq!(p[3], r#"{"name":"Bob","tag":"fish"}"#);
    assert!(s.holds("http_body[pet_shop]($want(pet_shop_createpet, \"Bob\", \"fish\"), \"made Bob\")").unwrap());
}

#[test]
fn an_mcp_server_over_http_is_read_and_called() {
    let shop = shop("mcp");
    let url = format!("{}/mcp", shop.base);
    let book = rofl::mcp::book(&url, &[]).unwrap();
    assert!(book.contains(&format!("adapter(pet_desk, mcp, \"{url}\").")), "{book}");
    assert!(book.contains("arg(pet_desk_find_pet, 1, petname, text).\nmcp_arg(pet_desk_find_pet, 1, \"petName\")."), "{book}");
    let book = book.replace("capability(pet_desk_find_pet, pet_desk, does).", "capability(pet_desk_find_pet, pet_desk, reads).");
    let s = &mut evaluated(&format!("{book}\npet(\"Rex\").\nwant pet_desk_find_pet(P) :- pet(P).\nsaid(T) :- mcp_text[pet_desk](_, T).\n"));
    assert!(s.holds("said(\"found Rex\")").unwrap(), "the argument goes by its own name, the answer comes as an event: {:?}", shop.log());
}

const VAULT: &str = r##"
openapi: 3.0.3
info: {title: Vault, version: "1"}
servers: [{url: "BASE/v2"}]
security: [{key: [], sig: []}]
components:
  securitySchemes:
    key: {type: apiKey, in: header, name: X-Api-Key}
    sig: {type: apiKey, in: query, name: sig}
    token: {type: http, scheme: bearer}
  schemas:
    Gold: {type: object, properties: {gold: {type: integer}}}
paths:
  /vault:
    get:
      operationId: openVault
      responses: {"200": {description: gold, content: {application/json: {schema: {$ref: "#/components/schemas/Gold"}}}}}
  /mine:
    get:
      operationId: myGold
      security: [{token: []}]
      responses: {"200": {description: gold, content: {application/json: {schema: {$ref: "#/components/schemas/Gold"}}}}}
"##;

#[test]
fn a_key_comes_from_the_environment_and_a_missing_one_holds_the_want() {
    let shop = shop("keys");
    let spec = shop.dir.join("vault.yaml");
    std::fs::write(&spec, VAULT.replace("BASE", &shop.base)).unwrap();
    let book = rofl::openapi::book(&spec.display().to_string(), &[]).unwrap();
    assert!(book.contains("http_auth(vault, key, header, \"X-Api-Key\", \"VAULT_KEY\").\nhttp_auth(vault, sig, query, \"sig\", \"VAULT_SIG\").\nhttp_auth(vault, token, bearer, \"Authorization\", \"VAULT_TOKEN\")."), "{book}");
    assert!(book.contains("http_needs(vault_mygold, token)."), "{book}");
    std::env::set_var("VAULT_KEY", "k-1");
    std::env::set_var("VAULT_SIG", "s&1");
    std::env::remove_var("VAULT_TOKEN");
    let src = format!("{book}\nask(1).\nwant vault_openvault() :- ask(1).\nwant vault_mygold() :- ask(1).\ngold(G) :- openvault[vault](_, G).\n");
    let mut s = evaluated(&src);
    assert!(s.holds("gold(7)").unwrap(), "the key goes in its header, the signature in the query: {:?}", shop.log());
    assert!(s.holds("want_held($want(vault_mygold), \"declared, not connected: the environment has no VAULT_TOKEN (the key of token for vault)\")").unwrap());
    assert!(shop.log().iter().all(|l| !l.contains("/v2/mine")), "a want without its key is not sent: {:?}", shop.log());
    let state = s.fact_keys(None).join("\n");
    assert!(!state.contains("k-1") && !state.contains("s&1"), "a key never enters a fact");
}

#[test]
fn client_credentials_get_a_token_once_and_again_when_it_is_refused() {
    let shop = shop("oauth");
    let spec = shop.dir.join("orders.yaml");
    std::fs::write(&spec, format!(r#"
openapi: 3.0.3
info: {{title: Orders, version: "1"}}
servers: [{{url: "{}/v3"}}]
security: [{{oauth: []}}]
components:
  securitySchemes:
    oauth: {{type: oauth2, flows: {{clientCredentials: {{tokenUrl: "{}/token", scopes: {{}}}}}}}}
paths:
  /orders:
    get:
      operationId: listOrders
      parameters: [{{name: n, in: query, schema: {{type: integer}}}}]
      responses: {{"200": {{description: orders, content: {{application/json: {{schema: {{type: array, items: {{type: object, properties: {{id: {{type: integer}}}}}}}}}}}}}}}}
"#, shop.base, shop.base)).unwrap();
    let book = rofl::openapi::book(&spec.display().to_string(), &[]).unwrap();
    assert!(book.contains(&format!("http_auth(orders, oauth, client_credentials, \"{}/token\", \"ORDERS_OAUTH\").", shop.base)), "{book}");
    std::env::set_var("ORDERS_OAUTH", "app:s3cret");
    let mut s = evaluated(&format!("{book}\nn(1). n(2). n(3). n(4). n(5).\nwant orders_listorders(N) :- n(N).\ngot(I) :- listorders[orders](_, I).\n"));
    for i in 1..=5 {
        assert!(s.holds(&format!("got({i})")).unwrap(), "order {i}: {:?}", shop.log());
    }
    let fetched = shop.log().iter().filter(|l| l.starts_with("POST /token")).count();
    assert_eq!(fetched, 2, "a token is kept for its uses and fetched again when refused: {:?}", shop.log());
    assert!(!s.fact_keys(None).join("\n").contains("s3cret"));
}

#[test]
fn an_mcp_server_that_wants_a_token_says_where_to_get_one() {
    let shop = shop("locked");
    let url = format!("{}/locked", shop.base);
    let e = rofl::mcp::book(&url, &[]).unwrap_err();
    let line = format!("client_credentials:{}/token=ENV", shop.base);
    assert!(e.contains(&line), "the 401 is read to its token endpoint: {e}");
    std::env::set_var("DESK_CLIENT", "app:s3cret");
    let key = rofl::net::declared(&format!("client_credentials:{}/token=DESK_CLIENT", shop.base)).unwrap();
    let book = rofl::mcp::book(&url, &[key]).unwrap();
    assert!(book.contains(&format!("http_auth(pet_desk, client_credentials, client_credentials, \"{}/token\", \"DESK_CLIENT\").", shop.base)), "{book}");
    let book = book.replace("capability(pet_desk_find_pet, pet_desk, does).", "capability(pet_desk_find_pet, pet_desk, reads).");
    let mut s = evaluated(&format!("{book}\npet(\"Rex\").\nwant pet_desk_find_pet(P) :- pet(P).\nsaid(T) :- mcp_text[pet_desk](_, T).\n"));
    assert!(s.holds("said(\"found Rex\")").unwrap(), "{:?}", shop.log());
}
