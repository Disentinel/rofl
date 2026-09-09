//! THE ENGINE AS A SERVICE: one JSON object per line in, one out.
//!
//! The owner asked for the port to be usable "as a library or as a DBMS" from
//! node. Two ways to do that, and this is the second on purpose:
//!
//!   * a native addon (napi/neon) — no serialisation, and a compiled artifact
//!     per node version and per platform that has to be built before anything
//!     can be tried;
//!   * a child process speaking newline-delimited JSON — one binary, `cargo
//!     build`, and a client that is fifty lines of TypeScript with no
//!     dependencies and no build step.
//!
//! The second is chosen because of WHAT THE SURFACE ALREADY COSTS. A question
//! here is 5.5 ms with its key bound and 12 469 ms scanning a million rows
//! (docs/port-surface.md, measurement 1); a pipe round-trip is tens of
//! microseconds. Serialisation is under a percent of the cheapest verb this
//! surface has, and it buys away an entire build system. If a workload ever
//! appears whose asks are dominated by the pipe, the numbers will say so and
//! the addon can be written then — against this protocol, which is the thing
//! worth fixing early.
//!
//! WHAT IS DELIBERATELY NOT SENT DOWN THE PIPE: the whole state. `canonicalState`
//! is one string and V8 caps a string at about 512 MB, which is what makes the
//! port unjudged above roughly 3M facts. So `state` writes to a PATH by default
//! and only returns the text when asked, and `ask` is the verb meant to be
//! used — it returns rows, and rows are what a caller wanted anyway.
//!
//! Sessions are numbered and held here. `fork` is the cheap verb (measurement
//! 2) and the protocol makes it the obvious one: `open` takes a seed, `fork`
//! takes a session id.
//!
//!   {"op":"open","seedPath":"x.seed.json"}   -> {"ok":true,"session":1,...}
//!   {"op":"fork","session":1}                -> {"ok":true,"session":2}
//!   {"op":"assert","session":2,"rofl":"p(a)."}
//!   {"op":"evaluate","session":2}
//!   {"op":"ask","session":2,"query":"p(X)"}
//!   {"op":"tick","session":2}
//!   {"op":"state","session":2,"path":"out.txt"}
//!   {"op":"close","session":2}
use rofl::session::Session;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, Write};

const DEFAULT_BUDGET: i64 = 200_000_000;

struct Server {
    sessions: HashMap<u64, Session>,
    next: u64,
}

impl Server {
    fn get(&mut self, r: &Value) -> Result<&mut Session, String> {
        let id = r.get("session").and_then(|v| v.as_u64()).ok_or("`session` is required")?;
        self.sessions.get_mut(&id).ok_or_else(|| format!("no such session: {id}"))
    }

    fn keep(&mut self, s: Session) -> u64 {
        let id = self.next;
        self.next += 1;
        self.sessions.insert(id, s);
        id
    }

    fn handle(&mut self, r: &Value) -> Result<Value, String> {
        let op = r.get("op").and_then(|v| v.as_str()).ok_or("`op` is required")?;
        match op {
            // A seed may arrive inline or by path. By path is the one that
            // scales: a 5.7M-fact snapshot has no business going through a
            // pipe and a JSON string escape when both ends can read a file.
            "open" => {
                let budget = r.get("budget").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_BUDGET);
                let seed = match (r.get("seedPath").and_then(|v| v.as_str()), r.get("seed").and_then(|v| v.as_str())) {
                    (Some(p), _) => std::fs::read_to_string(p).map_err(|e| format!("{p}: {e}"))?,
                    (None, Some(s)) => s.to_string(),
                    (None, None) => return Err("open needs `seedPath` or `seed`".into()),
                };
                let s = Session::open(&seed, budget)?;
                let facts = s.eval.store.fact_count();
                let dangling = s.dangling;
                let id = self.keep(s);
                Ok(json!({ "session": id, "facts": facts, "dangling": dangling }))
            }
            "fork" => {
                let f = self.get(r)?.fork();
                let facts = f.eval.store.fact_count();
                let id = self.keep(f);
                Ok(json!({ "session": id, "facts": facts }))
            }
            "assert" => {
                let text = r.get("rofl").and_then(|v| v.as_str()).ok_or("assert needs `rofl`")?.to_string();
                let n = self.get(r)?.assert(&text)?;
                Ok(json!({ "added": n }))
            }
            // A wall is a FACT, not an error (measurement 4): `partial` comes
            // back true with a `hole` in the store naming the unfinished part,
            // and `ok` stays true. Only a defect or a stratification refusal
            // is an error here.
            "evaluate" => {
                let s = self.get(r)?;
                let o = s.evaluate().map_err(|e| rofl::describe(&e))?;
                Ok(json!({
                    "partial": o.partial, "staged": o.staged, "steps": o.steps,
                    "peakRows": o.peak_rows, "space": o.space,
                }))
            }
            "tick" => {
                let s = self.get(r)?;
                let t = s.tick().map_err(|e| rofl::describe(&e))?;
                Ok(json!({ "advanced": t.advanced, "quiescent": t.quiescent, "partial": t.partial }))
            }
            "ask" => {
                let q = r.get("query").and_then(|v| v.as_str()).ok_or("ask needs `query`")?.to_string();
                let a = self.get(r)?.ask(&q)?;
                let keys = if r.get("keys").and_then(|v| v.as_bool()).unwrap_or(false) {
                    json!(a.keys)
                } else {
                    Value::Null
                };
                Ok(json!({
                    "vars": a.vars, "rows": a.rows, "keys": keys,
                    "scanned": a.scanned, "probed": a.probed, "micros": a.micros,
                }))
            }
            // Written to a path unless the caller insists. See the module note:
            // the whole state is exactly the thing a pipe should not carry.
            "state" => {
                let path = r.get("path").and_then(|v| v.as_str()).map(|s| s.to_string());
                let s = self.get(r)?;
                let cs = s.eval.store.canonical_state(&s.eval.h);
                match path {
                    Some(p) => {
                        std::fs::write(&p, &cs).map_err(|e| format!("{p}: {e}"))?;
                        Ok(json!({ "path": p, "bytes": cs.len() }))
                    }
                    None => Ok(json!({ "bytes": cs.len(), "state": cs })),
                }
            }
            "facts" => {
                let s = self.get(r)?;
                Ok(json!({ "facts": s.eval.store.fact_count(), "tick": s.eval.store.tick }))
            }
            "close" => {
                let id = r.get("session").and_then(|v| v.as_u64()).ok_or("`session` is required")?;
                match self.sessions.remove(&id) {
                    Some(_) => Ok(json!({ "closed": id })),
                    None => Err(format!("no such session: {id}")),
                }
            }
            other => Err(format!("unknown op: {other}")),
        }
    }
}

fn main() {
    let mut srv = Server { sessions: HashMap::new(), next: 1 };
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                let _ = writeln!(out, "{}", json!({ "ok": false, "error": e.to_string() }));
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        // The request id is echoed back on every answer INCLUDING an error, so
        // a client may pipeline without matching answers by arrival order. A
        // protocol whose errors lose their correlation deadlocks the client
        // that was waiting for them.
        let (id, res) = match serde_json::from_str::<Value>(&line) {
            Ok(r) => {
                let id = r.get("id").cloned().unwrap_or(Value::Null);
                (id, srv.handle(&r))
            }
            Err(e) => (Value::Null, Err(format!("bad json: {e}"))),
        };
        let mut v = match res {
            Ok(mut v) => {
                v.as_object_mut().unwrap().insert("ok".into(), json!(true));
                v
            }
            Err(e) => json!({ "ok": false, "error": e }),
        };
        v.as_object_mut().unwrap().insert("id".into(), id);
        let _ = writeln!(out, "{v}");
        let _ = out.flush();
    }
}
