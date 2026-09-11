//! Reading a snapshot. `Store.restore` (src/store.ts:761) is the other half of
//! the contract: a seed carries the data AND, through the reflection relations,
//! the program.

use crate::reflect::Vocab;
use crate::store::{PremRef, Store, Witness, F_BASE, F_FROZEN, F_TICK};
use crate::term::{cmp_js, Heap, Term, TermK};
use serde_json::{json, Value};
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
    // The ghosts, re-entered and killed again: a witness may name one, and no
    // answer ever will. Added before `firings` so the keys are in the index.
    let mut ghost_ids: Vec<u32> = Vec::new();
    for f in d.get("ghosts").and_then(|x| x.as_array()).unwrap_or(&vec![]) {
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
            ghost_ids.push(id);
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
    // Killed only now: `remove_many` drops a record's witnesses with it, so a
    // ghost put down before its own firings were read would take them along.
    s.remove_many(&ghost_ids);
    s.dirty = true;
    let _ = v;
    Ok(Restored { store: s, dangling })
}

// --------------------------------------------------------------- the way out
//
// `Store.snapshot` (src/store.ts:776), the inverse of `restore` above and in
// the same file for that reason: a format with its two halves apart drifts.
//
// WHAT THE PORT CANNOT WRITE, said here rather than discovered by a reader.
// The TypeScript store keeps an `evalLog` — per tick, the budget the standing
// evaluation ran under, the steps it took and whether it finished — and
// `docs/time-and-continuity.md` is explicit that a past tick replays
// bit-identically ONLY if the replay is given the same budget. This store has
// no such log, so `evals` goes out EMPTY and a world saved here and replayed
// there has lost the record of what each tick was allowed. That is a real hole
// and it is the one this file can name but not fill.

fn term_to_json(h: &Heap, t: Term) -> Value {
    match t.kind() {
        TermK::Var(s) => json!({ "k": "v", "name": h.name(s) }),
        TermK::Atom(s) => json!({ "k": "a", "name": h.name(s) }),
        TermK::Str(s) => json!({ "k": "s", "v": h.name(s) }),
        TermK::Int(n) => json!({ "k": "i", "v": n }),
        TermK::Func(i) => {
            let name = h.fname(i);
            let args: Vec<Value> = h.fargs(i).iter().map(|a| term_to_json(h, *a)).collect();
            json!({ "k": "f", "name": h.name(name), "args": args })
        }
    }
}

fn prems_json(h: &Heap, s: &Store, prems: &[PremRef]) -> Vec<Value> {
    prems
        .iter()
        .map(|p| match p {
            PremRef::Fact(f) => json!({ "t": "fact", "key": s.key(h, *f) }),
            PremRef::Neg(k) => json!({ "t": "neg", "key": h.name(*k) }),
            PremRef::Bi(d) => json!({ "t": "bi", "desc": h.name(*d) }),
        })
        .collect()
}

pub fn snapshot(h: &Heap, s: &Store) -> String {
    let mut keyed: Vec<(String, u32)> =
        s.live_ids().into_iter().map(|id| (s.key(h, id), id)).collect();
    keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
    let facts: Vec<Value> = keyed
        .iter()
        .map(|(_, id)| {
            let r = s.rec(*id);
            json!({
                "rel": h.name(r.rel),
                "persp": h.name(r.persp),
                "args": s.args(*id).iter().map(|a| term_to_json(h, *a)).collect::<Vec<_>>(),
                "scope": if r.tick_scope() { "tick" } else { "timeless" },
                "base": r.base(),
                "frozen": r.frozen(),
            })
        })
        .collect();

    let mut fkeyed: Vec<(String, u32)> =
        s.firing_keys().into_iter().map(|id| (s.key(h, id), id)).collect();
    fkeyed.sort_by(|a, b| cmp_js(&a.0, &b.0));

    // `wits` is DERIVED from `firings` and `restore` ignores it — it is in the
    // format because the reference host puts it there, and a snapshot that
    // differs from the reference's by a key is a second format.
    let wits: Vec<Value> = fkeyed
        .iter()
        .map(|(k, id)| {
            let w = s.witness_of(h, *id).unwrap();
            json!({ "key": k, "ruleId": h.name(w.rule), "tick": w.tick,
                    "prems": prems_json(h, s, w.prems) })
        })
        .collect();

    let firings: Vec<Value> = fkeyed
        .iter()
        .map(|(k, id)| {
            let mut sup: Vec<(String, Value)> = s
                .supports_of(h, *id)
                .into_iter()
                .map(|(sig, rule, tick, prems)| {
                    (
                        sig.clone(),
                        json!({ "sig": sig, "ruleId": h.name(rule), "tick": tick,
                                "prems": prems_json(h, s, &prems) }),
                    )
                })
                .collect();
            sup.sort_by(|a, b| cmp_js(&a.0, &b.0));
            json!({ "key": k, "sup": sup.into_iter().map(|(_, v)| v).collect::<Vec<_>>() })
        })
        .collect();

    // THE GHOSTS, AND WHY THIS FIELD EXISTS.
    //
    // `counter(M) @next :- counter(N), ...` concludes at a boundary and the
    // boundary takes `counter(1)` out of the world with the tick. The WITNESS
    // of `counter(2)` still names it, and must: that is what the fact was
    // derived from. The reference store keeps the premise as a STRING, so it
    // survives a snapshot with nothing to point at; this store keeps a FactId,
    // which needs a record to exist. So the dead records travel too.
    //
    // In a field of its own, because `restore` on the reference side would
    // read them out of `facts` and make them LIVE — a snapshot that resurrects
    // five ticks of history is worse than one that forgets a witness. An
    // unknown key is ignored there and read here, which is exactly what is
    // wanted: each host reads back everything it wrote.
    let ghosts: Vec<Value> = s
        .dead_ids()
        .into_iter()
        .map(|id| {
            let r = s.rec(id);
            json!({
                "rel": h.name(r.rel),
                "persp": h.name(r.persp),
                "args": s.args(id).iter().map(|a| term_to_json(h, *a)).collect::<Vec<_>>(),
                "scope": if r.tick_scope() { "tick" } else { "timeless" },
                "base": r.base(),
                "frozen": r.frozen(),
            })
        })
        .collect();

    json!({ "tick": s.tick, "facts": facts, "wits": wits, "firings": firings,
            "tickLog": s.tick_log, "evals": [], "ghosts": ghosts })
    .to_string()
}
