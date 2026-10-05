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
//!     `open` and `fresh` also take the walls a snapshot does not carry:
//!     `space` (rows), `retainTicks` and `mode` ("rounds" or "strata")
//!   {"op":"fork","session":1}                -> {"ok":true,"session":2}
//!   {"op":"assert","session":2,"rofl":"p(a)."}     -> {"added":n,"full":null|"why"}: into an evaluated
//!                                                        world by delta (Session::assert_delta), else evaluated again
//!   {"op":"load","session":2,"path":"pack.rofl"}      -> {"admitted":n,"full":null|"why"}: the same for facts and rules
//!   {"op":"evaluate","session":2}
//!   {"op":"ask","session":2,"query":"p(X)"}
//!   {"op":"why","session":2,"query":"p(a)"}            -> {"text":...}
//!   {"op":"why","session":2,"query":"c(a)","all":true} -> every member of every cell
//!   {"op":"whynot","session":2,"query":"p(b)","depth":6,"nodes":64}
//!                                                     -> {"holds":false,"text":...}
//!   {"op":"excise","session":2,"query":"q(a)"}         -> {"removed":[...],"added":[...]}
//!   {"op":"retract","session":2,"query":"q(a)"}       -> {"full":null|"why"}: the base fact out, the
//!                                                        cells updated by delta, evaluated again if not
//!   {"op":"tick","session":2}
//!   {"op":"state","session":2,"path":"out.txt"}
//!   {"op":"close","session":2}
use rofl::engine::WhynotBounds;
use rofl::session::Session;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, Write};

const DEFAULT_BUDGET: i64 = 200_000_000;

/// An addition worked out as a delta answers `full: null`; one evaluated again (or left to the next evaluation of a
/// world not yet evaluated) says why.
fn full(a: rofl::session::Addition) -> Option<String> {
    match a {
        rofl::session::Addition::Delta(_) => None,
        rofl::session::Addition::Full(why) => Some(why),
    }
}

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

    /// THE WALLS A SNAPSHOT DOES NOT CARRY (f_a_snapshot_carries_the_world_not_its_walls):
    /// a world saved under a row limit above the default comes back holed
    /// unless its opener gives the limit again.
    fn walls(r: &Value, s: &mut Session) -> Result<(), String> {
        if let Some(v) = r.get("space").filter(|v| !v.is_null()) {
            s.eval.space = v.as_i64().filter(|n| *n > 0).ok_or("`space` is a positive number of rows")?;
        }
        if let Some(v) = r.get("retainTicks").filter(|v| !v.is_null()) {
            s.eval.retain_ticks = Some(v.as_u64().and_then(|n| u32::try_from(n).ok()).ok_or("`retainTicks` is a number of ticks")?);
        }
        if let Some(v) = r.get("mode").filter(|v| !v.is_null()) {
            s.eval.mode = match v.as_str() {
                Some("rounds") => rofl::engine::Mode::Rounds,
                Some("strata") => rofl::engine::Mode::Strata,
                _ => return Err("`mode` is \"rounds\" or \"strata\"".into()),
            };
        }
        Ok(())
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
                let mut s = Session::open(&seed, budget)?;
                Self::walls(r, &mut s)?;
                let facts = s.eval.store.fact_count();
                let dangling = s.dangling;
                let id = self.keep(s);
                Ok(json!({ "session": id, "facts": facts, "dangling": dangling }))
            }
            // An empty world with the kernel's bootstrap tables and nothing
            // else — `new Rofl()`. With `load` beside it, a caller never needs
            // a seed, and therefore never needs the TypeScript kernel.
            "fresh" => {
                let budget = r.get("budget").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_BUDGET);
                let mut s = Session::fresh(budget);
                Self::walls(r, &mut s)?;
                let facts = s.eval.store.fact_count();
                let id = self.keep(s);
                Ok(json!({ "session": id, "facts": facts, "dangling": 0 }))
            }
            // A refusal returns EVERY diagnostic and leaves the store as it
            // was. It is an `ok:false` answer rather than a transport error,
            // because a rejected program is a normal outcome of loading one.
            "load" => {
                let text = match (r.get("path").and_then(|v| v.as_str()), r.get("rofl").and_then(|v| v.as_str())) {
                    (Some(p), _) => std::fs::read_to_string(p).map_err(|e| format!("{p}: {e}"))?,
                    (None, Some(t)) => t.to_string(),
                    (None, None) => return Err("load needs `path` or `rofl`".into()),
                };
                let who = r.get("who").and_then(|v| v.as_str()).map(|s| s.to_string());
                match self.get(r)?.load_delta(&text, who.as_deref()) {
                    Ok((n, a)) => Ok(json!({ "admitted": n, "full": full(a) })),
                    Err(d) => Err(d.join("\n")),
                }
            }
            // Cool a volume to disk. The prefix is the volume; see
            // `Session::cool`. The caller records `cooled` and the `hole`,
            // because those are statements about a corpus and the engine knows
            // only a prefix.
            "cool" => {
                let prefix = r.get("prefix").and_then(|v| v.as_str()).ok_or("cool needs `prefix`")?.to_string();
                let out = r.get("path").and_then(|v| v.as_str()).ok_or("cool needs `path`")?.to_string();
                let c = self.get(r)?.cool(&prefix, &out)?;
                Ok(json!({ "facts": c.facts, "bytes": c.bytes, "path": c.path }))
            }
            // Many volumes in ONE pass over the world. Cooling them one at a
            // time is a walk per volume over a world that is still shrinking.
            "cool_many" => {
                let vs = r.get("volumes").and_then(|v| v.as_array()).ok_or("cool_many needs `volumes`")?;
                let mut pairs = Vec::with_capacity(vs.len());
                for v in vs {
                    let p = v.get("prefix").and_then(|x| x.as_str()).ok_or("a volume needs `prefix`")?;
                    let o = v.get("path").and_then(|x| x.as_str()).ok_or("a volume needs `path`")?;
                    pairs.push((p.to_string(), o.to_string()));
                }
                let cs = self.get(r)?.cool_many(&pairs)?;
                let rows: Vec<Value> = cs.iter()
                    .map(|c| json!({ "facts": c.facts, "bytes": c.bytes, "path": c.path }))
                    .collect();
                Ok(json!({ "volumes": rows }))
            }
            // The assertion trail, parked and fetched back. See
            // `Session::cool_trail` for why this is cooled rather than sealed.
            "cool_trail" => {
                let out = r.get("path").and_then(|v| v.as_str()).ok_or("cool_trail needs `path`")?.to_string();
                let c = self.get(r)?.cool_trail(&out)?;
                Ok(json!({ "facts": c.facts, "bytes": c.bytes, "path": c.path }))
            }
            "reheat_trail" => {
                let p = r.get("path").and_then(|v| v.as_str()).ok_or("reheat_trail needs `path`")?.to_string();
                let n = self.get(r)?.reheat_trail(&p)?;
                Ok(json!({ "restored": n }))
            }
            "fork" => {
                let f = self.get(r)?.fork();
                let facts = f.eval.store.fact_count();
                let id = self.keep(f);
                Ok(json!({ "session": id, "facts": facts }))
            }
            "assert" => {
                let text = r.get("rofl").and_then(|v| v.as_str()).ok_or("assert needs `rofl`")?.to_string();
                let (n, a) = self.get(r)?.assert_delta(&text)?;
                Ok(json!({ "added": n, "full": full(a) }))
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
            "retract" => {
                let q = r.get("query").and_then(|v| v.as_str()).ok_or("retract needs `query`")?.to_string();
                let s = self.get(r)?;
                let full = match s.retract_delta(&q)? {
                    rofl::session::Retraction::Delta(_) => None,
                    rofl::session::Retraction::Full(why) => Some(why),
                };
                if s.eval.store.dirty { s.evaluate().map_err(|e| rofl::describe(&e))?; }
                Ok(json!({ "full": full }))
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
                    "scanned": a.scanned, "probed": a.probed, "micros": a.micros, "partial": a.partial,
                    "shrugs": a.shrugs.iter().map(|(row, line)| json!({ "row": row, "line": line })).collect::<Vec<_>>(),
                }))
            }
            // The explanation verbs, answering in the reference's own text
            // (rust/rofl/tests/explain.rs, scripts/whycheck.ts). A `why` of a
            // fact that does not hold is an error carrying that text, as the
            // reference's `ok: false` is; a `whynot` of one that holds is not.
            "why" => {
                let q = r.get("query").and_then(|v| v.as_str()).ok_or("why needs `query`")?.to_string();
                // absent or null is a plain `why`; anything but a boolean is
                // refused, as a whynot bound that is not an integer is
                let all = match r.get("all") {
                    None | Some(Value::Null) => false,
                    Some(Value::Bool(b)) => *b,
                    Some(v) => return Err(format!("why `all` takes true or false, not {v}")),
                };
                let s = self.get(r)?;
                Ok(json!({ "text": if all { s.why_all(&q)? } else { s.why(&q)? } }))
            }
            "whynot" => {
                let q = r.get("query").and_then(|v| v.as_str()).ok_or("whynot needs `query`")?.to_string();
                // A bound below 1 counts as 1, as the reference's `Math.max`
                // makes it; one that is not an integer is refused rather than
                // replaced by the default. JSON has one number type, as JS
                // does: a whole number written `3.0` or `1e3` IS the integer
                // the reference reads, and one past i64 is as large a bound
                // as can be asked, so it saturates.
                let bound = |k: &str| -> Result<Option<i64>, String> {
                    match r.get(k) {
                        None | Some(Value::Null) => Ok(None),
                        Some(v) => v
                            .as_i64()
                            .or_else(|| v.as_u64().map(|_| i64::MAX))
                            .or_else(|| v.as_f64().filter(|f| f.is_finite() && f.fract() == 0.0).map(|f| f as i64))
                            .map(Some)
                            .ok_or_else(|| format!("whynot `{k}` takes an integer, not {v}")),
                    }
                };
                let b = WhynotBounds::clamped(bound("depth")?, bound("nodes")?);
                let (holds, text) = self.get(r)?.whynot(&q, &b)?;
                Ok(json!({ "holds": holds, "text": text }))
            }
            "excise" => {
                let q = r.get("query").and_then(|v| v.as_str()).ok_or("excise needs `query`")?.to_string();
                let (removed, added) = self.get(r)?.excise(&q)?;
                Ok(json!({ "removed": removed, "added": added }))
            }
            // Written to a path unless the caller insists. See the module note:
            // the whole state is exactly the thing a pipe should not carry.
            "state" => {
                let path = r.get("path").and_then(|v| v.as_str()).map(|s| s.to_string());
                let s = self.get(r)?;
                let cs = s.eval.canonical_state();
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
                s.eval.settle_provenance();
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
