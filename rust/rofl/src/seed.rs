//! Reading a snapshot. `Store.restore` (src/store.ts:761) is the other half of
//! the contract: a seed carries the data AND, through the reflection relations,
//! the program.

use crate::cell::AggOp;
use crate::reflect::Vocab;
use crate::store::{
    CellOwner, CellValue, EvalRecord, NewCell, NewMember, PremRef, Seal, Store, Witness, F_BASE, F_FROZEN, F_TICK,
};
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

/// A witness's premises, or none when one of them names a fact or a cell the
/// snapshot does not hold (counted as dangling).
fn read_prems(
    h: &mut Heap,
    facts: &HashMap<String, u32>,
    cells: &HashMap<String, u32>,
    ps: &[Value],
    dangling: &mut usize,
) -> Option<Vec<PremRef>> {
    let mut prems = Vec::new();
    let mut ok = true;
    for p in ps {
        match p["t"].as_str() {
            Some("fact") => match facts.get(p["key"].as_str().unwrap_or("")) {
                Some(&f) => prems.push(PremRef::Fact(f)),
                None => {
                    ok = false;
                    *dangling += 1;
                }
            },
            Some("cell") => match cells.get(p["key"].as_str().unwrap_or("")) {
                Some(&c) => prems.push(PremRef::Cell(c)),
                None => {
                    ok = false;
                    *dangling += 1;
                }
            },
            Some("neg") => prems.push(PremRef::Neg(h.intern(p["key"].as_str().unwrap_or("")))),
            _ => prems.push(PremRef::Bi(h.intern(p["desc"].as_str().unwrap_or("")))),
        }
    }
    ok.then_some(prems)
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
    // THE CELLS, before the firings that cite them: a firing names a cell by
    // its key, and a member names its facts by theirs, ghosts included.
    let mut cells_by_key: HashMap<String, u32> = HashMap::new();
    // A CELL IS READ WHOLE OR THE SNAPSHOT IS REFUSED: a height, a tick or a
    // round filled in with 0 is a witness that says something nobody sealed.
    let count = |x: &Value, what: &str| -> Result<u32, String> {
        x.as_u64().and_then(|n| u32::try_from(n).ok()).ok_or_else(|| format!("bad cell {what}"))
    };
    for c in d.get("cells").and_then(|x| x.as_array()).unwrap_or(&vec![]) {
        let rule = h.intern(c["rule"].as_str().ok_or("bad cell rule")?);
        let at = count(&c["at"], "position")?;
        let op = AggOp::from_name(c["op"].as_str().unwrap_or("")).ok_or("bad cell op")?;
        let key: Result<Vec<Term>, String> =
            c["keyTerms"].as_array().ok_or("bad cell key")?.iter().map(|a| term_from_json(h, a)).collect();
        let value = match (c.get("value"), c.get("hole")) {
            (_, Some(Value::String(r))) => CellValue::Hole(h.intern(r)),
            (Some(v), None | Some(Value::Null)) if !v.is_null() => CellValue::Value(term_from_json(h, v)?),
            (Some(Value::Null), None | Some(Value::Null)) => CellValue::Empty,
            _ => return Err("bad cell value".into()),
        };
        let mut members = Vec::new();
        for m in c["members"].as_array().ok_or("bad cell members")? {
            let proj: Result<Vec<Term>, String> =
                m["proj"].as_array().ok_or("bad member")?.iter().map(|a| term_from_json(h, a)).collect();
            let prems = read_prems(h, &by_key, &HashMap::new(), m["prems"].as_array().ok_or("bad member premises")?, &mut dangling)
                .ok_or("a cell member names a fact the snapshot does not hold")?;
            members.push(NewMember {
                proj: proj?.into(),
                value: term_from_json(h, &m["value"])?,
                height: count(&m["height"], "member height")?,
                prems,
            });
        }
        let mut seals = Vec::new();
        for x in c["sealed"].as_array().ok_or("bad cell seals")? {
            let rel = x["rel"].as_str().filter(|r| !r.is_empty()).ok_or("bad cell seal")?;
            seals.push(Seal { rel: h.intern(rel), round: count(&x["round"], "seal round")? });
        }
        let desc = h.intern(c["desc"].as_str().filter(|d| !d.is_empty()).ok_or("bad cell description")?);
        let key: Box<[Term]> = key?.into();
        let owner = CellOwner::Body { rule, at };
        let tick = count(&c["tick"], "tick")?;
        if s.find_cell(owner, &key, tick).is_some() {
            return Err("a cell is in the snapshot twice".into());
        }
        let like = match c.get("membersOf") {
            None => None,
            Some(k) => Some(*k.as_str().and_then(|k| cells_by_key.get(k)).ok_or("a cell shares the members of a cell the snapshot does not hold before it")?),
        };
        let cell = NewCell {
            owner,
            op,
            key,
            value,
            height: count(&c["height"], "height")?,
            tick,
            desc,
            members,
            seals,
        };
        let id = match like {
            Some(_) if !cell.members.is_empty() => return Err("a cell both shares members and lists its own".into()),
            Some(x) if s.cell_members(x).is_empty() => return Err("a cell shares the members of a cell with none".into()),
            Some(x) => s.add_cell_sharing(cell, x),
            None => s.add_cell(cell),
        };
        // the name a firing cites it by must be the name its fields spell
        let mut spelled = String::new();
        s.write_cell_key(h, id, &mut spelled);
        if c["key"].as_str() != Some(spelled.as_str()) {
            return Err(format!("a cell's key does not spell its fields: {spelled}"));
        }
        cells_by_key.insert(spelled, id);
    }
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
                let ps = sup["prems"].as_array().cloned().unwrap_or_default();
                if let Some(prems) = read_prems(h, &by_key, &cells_by_key, &ps, &mut dangling) {
                    s.support(id, Witness { rule, tick, prems });
                }
            }
        }
    }
    for e in d.get("evals").and_then(|x| x.as_array()).unwrap_or(&vec![]) {
        let Some(t) = e["tick"].as_u64() else { continue };
        s.eval_log.insert(
            t as u32,
            EvalRecord {
                budget: e["budget"].as_i64().unwrap_or(0),
                steps: e["steps"].as_i64().unwrap_or(0),
                partial: e["partial"].as_bool().unwrap_or(false),
            },
        );
    }

    // Killed only now, and with their firings kept: a superseded lattice
    // value's firings are how the value that replaced it was reached.
    for id in &ghost_ids {
        s.retire_keeping_firings(*id);
    }
    s.sweep();
    s.dirty = true;
    let _ = v;
    Ok(Restored { store: s, dangling })
}

// --------------------------------------------------------------- the way out
//
// `Store.snapshot` (src/store.ts:776), the inverse of `restore` above and in
// the same file for that reason: a format with its two halves apart drifts.
//
// `evals` IS THE FIELD THIS FILE ONCE WENT OUT EMPTY ON, and the hole it left
// is the reason it is now written: `docs/time-and-continuity.md` is explicit
// that a past tick replays bit-identically ONLY if the replay is given the
// same budget, so a snapshot without the per-tick record carries a history
// nobody can reproduce. `Store::eval_log` keeps it and both directions read
// it.

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
            PremRef::Cell(c) => {
                let mut k = String::new();
                s.write_cell_key(h, *c, &mut k);
                json!({ "t": "cell", "key": k })
            }
        })
        .collect()
}

/// Every cell, in key order: what it is keyed by, its value, its members and
/// what it sealed. The TypeScript host reads the field (src/store.ts
/// `restore`) and ignores `ghosts`: its premises name facts by key.
fn cells_json(h: &Heap, s: &Store) -> Vec<Value> {
    s.cells_in_order(h)
        .into_iter()
        .map(|(c, like)| {
            let r = s.cell(c);
            let CellOwner::Body { rule, at } = r.owner;
            let mut key = String::new();
            s.write_cell_key(h, c, &mut key);
            let (value, hole) = match r.value {
                CellValue::Value(t) => (term_to_json(h, t), Value::Null),
                CellValue::Empty => (Value::Null, Value::Null),
                CellValue::Hole(x) => (Value::Null, json!(h.name(x))),
            };
            let members: Vec<Value> = s
                .cell_members(c)
                .iter()
                .filter(|_| like.is_none())
                .map(|m| {
                    json!({ "proj": m.proj.iter().map(|t| term_to_json(h, *t)).collect::<Vec<_>>(),
                            "value": term_to_json(h, m.value), "height": m.height,
                            "prems": prems_json(h, s, s.member_prems(m)) })
                })
                .collect();
            let sealed: Vec<Value> =
                s.cell_seals(c).iter().map(|x| json!({ "rel": h.name(x.rel), "round": x.round })).collect();
            let mut out = json!({ "key": key, "rule": h.name(rule), "at": at, "op": r.op.name(),
                    "keyTerms": r.key.iter().map(|t| term_to_json(h, *t)).collect::<Vec<_>>(),
                    "value": value, "hole": hole, "height": r.height, "tick": r.tick,
                    "desc": h.name(r.desc), "members": members, "sealed": sealed });
            // a holistic group shared by many cells is written once
            if let Some(x) = like {
                let mut k = String::new();
                s.write_cell_key(h, x, &mut k);
                out["membersOf"] = json!(k);
            }
            out
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

    let evals: Vec<Value> = s
        .eval_log
        .iter()
        .map(|(t, e)| json!({ "tick": t, "budget": e.budget, "steps": e.steps, "partial": e.partial }))
        .collect();

    let mut out = json!({ "tick": s.tick, "facts": facts, "wits": wits, "firings": firings,
            "tickLog": s.tick_log, "evals": evals, "ghosts": ghosts });
    // Written only when there are cells, so a snapshot without an aggregate is
    // the one it was.
    let cells = cells_json(h, s);
    if !cells.is_empty() {
        out["cells"] = Value::Array(cells);
    }
    out.to_string()
}
