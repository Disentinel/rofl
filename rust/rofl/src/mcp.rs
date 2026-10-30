//! THE MCP ADAPTER (docs/intents.md, phase 5): a server of the Model Context Protocol, spoken to over its stdio
//! transport (one JSON-RPC message a line) or, when its address is a URL, its streamable HTTP transport (src/net.rs).
//!
//! `book` is `rofl adapter mcp COMMAND`: the server's `tools/list` printed as an adapter book (D1), a block per tool,
//! sorted by name, so a book regenerated after the server changed one tool differs by that tool's block alone. Every
//! tool is `does` (D2: `readOnlyHint` is the server's word): a person changes the line to `reads`.
//! A property whose name is not an atom is sent under its own name, `mcp_arg(Cap, Pos, Name)`.
//!
//! `call` is the `mcp` kind: one server per batch, one `tools/call` per want. A tool with an output schema answers by
//! its `structuredContent`, a property a column (`mcp_field(Cap, Pos, Name)`); one without answers its text in
//! `mcp_text(K, Text)` when the book says so, for a parse rule of the book to read; otherwise the want is
//! `failed(K, "no way to read the answer")`.
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

const PROTOCOL: &str = "2025-06-18";

struct Server {
    wire: Wire,
    next: u64,
    info: Value,
}

/// The transport: a child process spoken to a line a message, or a URL a message is POSTed to (streamable HTTP),
/// its answer one JSON message or an event stream of them.
enum Wire {
    Stdio { child: Child, to: ChildStdin, from: BufReader<ChildStdout> },
    Http { url: String, auth: Vec<(String, String)>, session: Option<String>, inbox: Vec<Value> },
}

impl Server {
    /// The server `cmd` names, spoken to with the credentials `(how, name, key)` when it is a URL. A token of client
    /// credentials the server refuses is fetched again, once.
    fn start(cmd: &str, creds: &[(String, String, String)]) -> Result<Self, String> {
        match Self::open(cmd, creds) {
            Err(e) if e.contains("HTTP 401") && creds.iter().any(|c| crate::net::renewable(&c.0)) => {
                crate::net::forget_tokens();
                Self::open(cmd, creds)
            }
            r => r,
        }
    }

    fn open(cmd: &str, creds: &[(String, String, String)]) -> Result<Self, String> {
        let wire = if cmd.starts_with("http://") || cmd.starts_with("https://") {
            let (mut url, mut auth) = (cmd.to_string(), Vec::new());
            for (how, n, v) in creds {
                let (h, q) = crate::net::credential(how, n, v)?;
                auth.extend(h);
                if let Some(q) = q {
                    url.push(if url.contains('?') { '&' } else { '?' });
                    url.push_str(&q);
                }
            }
            Wire::Http { url, auth, session: None, inbox: Vec::new() }
        } else {
            let mut argv = cmd.split_whitespace();
            let prog = argv.next().ok_or("an empty command")?;
            let mut child = Command::new(prog).args(argv).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
                .spawn().map_err(|e| format!("{prog}: {e}"))?;
            let to = child.stdin.take().expect("piped");
            let from = BufReader::new(child.stdout.take().expect("piped"));
            Wire::Stdio { child, to, from }
        };
        let mut s = Server { wire, next: 0, info: Value::Null };
        let hello = json!({"protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "rofl", "version": env!("CARGO_PKG_VERSION")}});
        s.info = s.request("initialize", hello)?.get("serverInfo").cloned().unwrap_or(Value::Null);
        s.send(&json!({"jsonrpc": "2.0", "method": "notifications/initialized"}))?;
        Ok(s)
    }

    fn send(&mut self, m: &Value) -> Result<(), String> {
        match &mut self.wire {
            Wire::Stdio { to, .. } => writeln!(to, "{m}").and_then(|_| to.flush()).map_err(|e| format!("the server: {e}")),
            Wire::Http { url, auth, session, inbox } => {
                let mut headers = vec![("accept", "application/json, text/event-stream".to_string()), ("mcp-protocol-version", PROTOCOL.to_string())];
                headers.extend(auth.iter().map(|(k, v)| (k.as_str(), v.clone())));
                if let Some(id) = session.clone() {
                    headers.push(("mcp-session-id", id));
                }
                let r = crate::net::send("POST", url, &headers, Some(m))?;
                if r.status == 401 {
                    return Err(format!("the server: HTTP 401: {}", crate::net::wanted(&r)));
                }
                if r.status / 100 != 2 {
                    return Err(format!("the server: HTTP {}: {}", r.status, r.body.chars().take(200).collect::<String>()));
                }
                if r.session.is_some() {
                    *session = r.session;
                }
                if r.kind.starts_with("text/event-stream") {
                    let mut data = String::new();
                    for line in r.body.lines().chain([""]) {
                        match line.strip_prefix("data:") {
                            Some(d) => data.push_str(d.trim_start()),
                            None if line.is_empty() && !data.is_empty() => inbox.extend(serde_json::from_str(&std::mem::take(&mut data)).ok()),
                            None => {}
                        }
                    }
                } else if !r.body.trim().is_empty() {
                    inbox.extend(serde_json::from_str(&r.body).ok());
                }
                Ok(())
            }
        }
    }

    /// The next message from the server, or None when it has nothing more to say.
    fn receive(&mut self) -> Result<Option<Value>, String> {
        match &mut self.wire {
            Wire::Stdio { from, .. } => loop {
                let mut line = String::new();
                if from.read_line(&mut line).map_err(|e| format!("the server: {e}"))? == 0 {
                    return Ok(None);
                }
                if let Ok(m) = serde_json::from_str::<Value>(&line) {
                    return Ok(Some(m));
                }
            },
            Wire::Http { inbox, .. } => Ok((!inbox.is_empty()).then(|| inbox.remove(0))),
        }
    }

    /// The result of one request; a request of the server's own is refused, a notification passed over.
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next += 1;
        let id = json!(self.next);
        self.send(&json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}))?;
        loop {
            let Some(m) = self.receive()? else {
                return Err(format!("the server closed before answering {method}"));
            };
            if m.get("method").is_some() {
                if let Some(i) = m.get("id") {
                    self.send(&json!({"jsonrpc": "2.0", "id": i, "error": {"code": -32601, "message": "rofl answers no requests"}}))?;
                }
                continue;
            }
            if m.get("id") != Some(&id) {
                continue;
            }
            if let Some(e) = m.get("error") {
                return Err(format!("{method}: {}", e.get("message").and_then(Value::as_str).unwrap_or("an error")));
            }
            return Ok(m.get("result").cloned().unwrap_or(Value::Null));
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        if let Wire::Stdio { child, .. } = &mut self.wire {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// The adapter book of the server `cmd` runs, or the one at a URL spoken to with the keys `declared` names
/// (`crate::net::declared`), each an `http_auth` row of the book.
pub fn book(cmd: &str, declared: &[(String, String, String)]) -> Result<String, String> {
    let creds = crate::net::from_env(declared)?;
    let mut s = Server::start(cmd, &creds)?;
    let mut tools = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let r = s.request("tools/list", cursor.map_or(json!({}), |c| json!({"cursor": c})))?;
        tools.extend(r.get("tools").and_then(Value::as_array).cloned().unwrap_or_default());
        match r.get("nextCursor").and_then(Value::as_str) {
            Some(c) => cursor = Some(c.to_string()),
            None => break,
        }
    }
    tools.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    let adapter = ident(s.info.get("name").and_then(Value::as_str).unwrap_or("mcp"));
    let mut out = format!(
        "-- generated by `rofl adapter mcp` from the server's tools/list; every tool is `does` until a person changes its line to `reads`\nadapter({adapter}, mcp, {}).\n",
        quote(cmd)
    );
    out.push_str(&crate::net::auth_rows(&adapter, declared));
    if crate::brk!("mcp_book_digest" => true; false) {
        let all = serde_json::to_string(&tools).unwrap_or_default();
        out.push_str(&format!("-- tools/list {:016x}\n", all.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3))));
    }
    for t in &tools {
        out.push('\n');
        out.push_str(&tool_block(&adapter, t));
    }
    Ok(out)
}

fn tool_block(adapter: &str, t: &Value) -> String {
    let name = t["name"].as_str().unwrap_or("");
    let cap = format!("{adapter}_{}", ident(name));
    let mut out = String::new();
    let said = t.get("description").and_then(Value::as_str).and_then(|d| d.lines().next()).unwrap_or("");
    out.push_str(&format!("-- tool {name}: {said}\ncapability({cap}, {adapter}, does).\nmcp_tool({cap}, {}).\n", quote(name)));
    if let Some(props) = t.pointer("/inputSchema/properties").and_then(Value::as_object) {
        for (i, (p, schema)) in props.iter().enumerate() {
            let ty = match schema.get("type").and_then(Value::as_str) {
                Some("string") => "text",
                Some("integer") => "number",
                Some("boolean") => "atom",
                _ => "json",
            };
            out.push_str(&format!("arg({cap}, {}, {}, {ty}).\n", i + 1, ident(p)));
            if ident(p) != *p {
                out.push_str(&format!("mcp_arg({cap}, {}, {}).\n", i + 1, quote(p)));
            }
        }
    }
    match t.get("outputSchema") {
        Some(schema) => {
            let fields: Vec<&String> = schema.get("properties").and_then(Value::as_object).map(|p| p.keys().collect()).unwrap_or_default();
            out.push_str(&format!("answers({cap}, {}, {}).\n", ident(name), fields.len() + 1));
            for (i, f) in fields.iter().enumerate() {
                out.push_str(&format!("mcp_field({cap}, {}, {}).\n", i + 2, quote(f)));
            }
            out.push_str(&format!("returns_schema({cap}, {}).\n", quote(&schema.to_string())));
        }
        None => out.push_str(&format!("answers({cap}, mcp_text, 2).\n")),
    }
    out
}

/// One batch of the `mcp` kind: each want `(key, arguments, idempotency key)` called once, answered in the text an exec program
/// prints. `rel` is the relation of the tool's structured answer, `fields` its columns after the key; `text` whether
/// the book reads a text answer.
pub(crate) fn call(cmd: &str, creds: &[(String, String, String)], tool: &str, rel: &str, fields: &[String], text: bool, wants: &[(String, Value, Option<String>)]) -> Result<String, String> {
    let hide = |e: String| creds.iter().fold(e, |e, (_, _, v)| e.replace(&crate::net::escape(v), "***").replace(v.as_str(), "***"));
    let mut s = Server::start(cmd, creds).map_err(hide)?;
    let mut out = String::new();
    for (key, args, idem) in wants {
        let params = match idem {
            Some(i) => json!({"name": tool, "arguments": args, "_meta": {"rofl/idempotency_key": i}}),
            None => json!({"name": tool, "arguments": args}),
        };
        let r = match s.request("tools/call", params) {
            Ok(r) => r,
            Err(e) => {
                out.push_str(&format!("failed({key}, {}).\n", quote(&hide(e))));
                continue;
            }
        };
        let said: String = r.get("content").and_then(Value::as_array).into_iter().flatten()
            .filter_map(|c| c.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("\n");
        match r.get("structuredContent").and_then(Value::as_object) {
            _ if r.get("isError").and_then(Value::as_bool) == Some(true) => out.push_str(&format!("failed({key}, {}).\n", quote(&said))),
            Some(o) if !fields.is_empty() => {
                let cols: Vec<String> = fields.iter().map(|f| fact_value(o.get(f).unwrap_or(&Value::Null))).collect();
                out.push_str(&format!("{rel}({key}, {}).\n", cols.join(", ")));
            }
            Some(_) if rel != "mcp_text" => out.push_str(&format!("answered({key}).\n")),
            _ if text => out.push_str(&format!("mcp_text({key}, {}).\n", quote(&said))),
            _ => out.push_str(&format!("failed({key}, \"no way to read the answer\").\n")),
        }
    }
    Ok(out)
}

pub(crate) fn fact_value(v: &Value) -> String {
    match v {
        Value::Number(n) => n.as_i64().map_or_else(|| quote(&n.to_string()), |i| i.to_string()),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".into(),
        Value::String(s) => quote(s),
        v => quote(&v.to_string()),
    }
}

/// A name of the server as a ROFL atom: lower case, every other character `_`.
pub(crate) fn ident(s: &str) -> String {
    let mut out: String = s.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' }).collect();
    if !out.starts_with(|c: char| c.is_ascii_lowercase()) {
        out.insert(0, 'm');
    }
    out
}

pub(crate) fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n"))
}
