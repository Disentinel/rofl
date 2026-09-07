//! Reading a snapshot. `Store.restore` (src/store.ts:761) is the other half of
//! the contract: a seed carries the data AND, through the reflection relations,
//! the program.

use crate::reflect::Vocab;
use crate::store::{PremRef, Store, Witness, F_BASE, F_FROZEN, F_TICK};
use crate::term::{Heap, Term};
use serde_json::Value;
use std::collections::HashMap;

fn term_from_json(h: &mut Heap, j: &Value) -> Result<Term, String> {
    let k = j.get("k").and_then(|x| x.as_str()).ok_or("bad term json")?;
    match k {
        "v" => Ok(h.var(j["name"].as_str().ok_or("bad var")?)),
        "a" => Ok(h.atom(j["name"].as_str().ok_or("bad atom")?)),
        "s" => Ok(h.string(j["v"].as_str().ok_or("bad string")?)),
        "i" => {
            let n = j["v"].as_i64().ok_or("bad int")?;
            Ok(Term::int(n))
        }
        "f" => {
            let name = j["name"].as_str().ok_or("bad functor")?.to_string();
            let args: Result<Vec<Term>, String> = j["args"]
                .as_array()
                .ok_or("bad functor args")?
                .iter()
                .map(|a| term_from_json(h, a))
                .collect();
            Ok(h.mkf_named(&name, &args?))
        }
        _ => Err("bad term json".into()),
    }
}

pub struct Restored {
    pub store: Store,
    /// Witness premises naming a key that is not a fact in this store. Zero on
    /// every corpus seed (the derived layer is cleared before the snapshot is
    /// taken), and reported rather than swallowed.
    pub dangling: usize,
}

pub fn restore(h: &mut Heap, v: &Vocab, json: &str) -> Result<Restored, String> {
    let d: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let mut s = Store::new();
    s.tick = d["tick"].as_u64().unwrap_or(0) as u32;
    if let Some(tl) = d.get("tickLog").and_then(|x| x.as_array()) {
        s.tick_log = tl
            .iter()
            .filter_map(|x| x.as_str().map(|y| y.to_string()))
            .collect();
    }
    let mut by_key: HashMap<String, u32> = HashMap::new();
    for f in d["facts"].as_array().ok_or("no facts")? {
        let rel = h.intern(f["rel"].as_str().ok_or("bad rel")?);
        let persp = h.intern(f["persp"].as_str().ok_or("bad persp")?);
        let args: Result<Vec<Term>, String> = f["args"]
            .as_array()
            .ok_or("bad args")?
            .iter()
            .map(|a| term_from_json(h, a))
            .collect();
        let args = args?;
        let mut flags = 0u8;
        if f["scope"].as_str() == Some("tick") {
            flags |= F_TICK;
        }
        if f["base"].as_bool().unwrap_or(false) {
            flags |= F_BASE;
        }
        if f["frozen"].as_bool().unwrap_or(false) {
            flags |= F_FROZEN;
        }
        s.add(h, rel, persp, &args, flags);
        if let Some(id) = s.get(rel, persp, &args) {
            by_key.insert(s.key(h, id), id);
        }
    }
    let mut dangling = 0usize;
    if let Some(fr) = d.get("firings").and_then(|x| x.as_array()) {
        for e in fr {
            let key = e["key"].as_str().unwrap_or("");
            let Some(&id) = by_key.get(key) else {
                dangling += 1;
                continue;
            };
            for sup in e["sup"].as_array().unwrap_or(&vec![]) {
                let rule = h.intern(sup["ruleId"].as_str().unwrap_or(""));
                let tick = sup["tick"].as_u64().unwrap_or(0) as u32;
                let mut prems = Vec::new();
                let mut ok = true;
                for p in sup["prems"].as_array().unwrap_or(&vec![]) {
                    match p["t"].as_str() {
                        Some("fact") => {
                            let k = p["key"].as_str().unwrap_or("");
                            match by_key.get(k) {
                                Some(&f) => prems.push(PremRef::Fact(f)),
                                None => {
                                    ok = false;
                                    dangling += 1;
                                }
                            }
                        }
                        Some("neg") => {
                            prems.push(PremRef::Neg(h.intern(p["key"].as_str().unwrap_or(""))))
                        }
                        _ => prems.push(PremRef::Bi(h.intern(p["desc"].as_str().unwrap_or("")))),
                    }
                }
                if ok {
                    s.support(id, Witness { rule, tick, prems });
                }
            }
        }
    }
    s.dirty = true;
    let _ = v;
    Ok(Restored { store: s, dangling })
}
