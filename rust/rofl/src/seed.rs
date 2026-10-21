//! Reading a snapshot. `Store.restore` (src/store.ts:761) is the other half of
//! the contract: a seed carries the data AND, through the reflection relations,
//! the program.

use crate::cell::AggOp;
use crate::reflect::Vocab;
use crate::store::{CellId, FactId, 
    CellOwner, CellValue, EvalRecord, NewCell, NewMember, PremRef, Seal, Store, Witness, F_BASE, F_FROZEN, F_TICK,
};
use crate::term::{cmp_js, Heap, Sym, Term, TermK};
use serde_json::Value;
use std::borrow::Cow;
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

/// A premise as a snapshot spells it: its `t`, and its `key` or, for a
/// built-in, its `desc`; a field that is not there is empty.
struct Prem<'a> {
    t: Cow<'a, str>,
    key: Cow<'a, str>,
    desc: Cow<'a, str>,
}

impl Prem<'_> {
    fn of(p: &Value) -> Prem<'_> {
        let f = |k: &str| Cow::Borrowed(p[k].as_str().unwrap_or(""));
        Prem { t: f("t"), key: f("key"), desc: f("desc") }
    }
}

/// A witness's premises, or none when one of them names a fact or a cell the
/// snapshot does not hold (counted as dangling).
fn read_prems<'a>(
    h: &mut Heap,
    facts: &HashMap<String, u32>,
    cells: &HashMap<String, u32>,
    ps: impl IntoIterator<Item = Prem<'a>>,
    dangling: &mut usize,
) -> Option<Vec<PremRef>> {
    let mut prems = Vec::new();
    let mut ok = true;
    for p in ps {
        match &*p.t {
            "fact" => match facts.get(&*p.key) {
                Some(&f) => prems.push(PremRef::Fact(f)),
                None => {
                    ok = false;
                    *dangling += 1;
                }
            },
            "cell" => match cells.get(&*p.key) {
                Some(&c) => prems.push(PremRef::Cell(c)),
                None => {
                    ok = false;
                    *dangling += 1;
                }
            },
            "neg" => prems.push(PremRef::Neg(h.intern(&p.key))),
            "vrow" => prems.push(PremRef::VRow(h.intern(&p.key))),
            _ => prems.push(PremRef::Bi(h.intern(&p.desc))),
        }
    }
    ok.then_some(prems)
}

/// A firing as a snapshot spells it: its rule, its tick and its premises.
type Sup<'a> = (Cow<'a, str>, u32, Vec<Prem<'a>>);

/// The firings of the fact keyed `key`, each one's rule interned before its
/// premises; none when the snapshot does not hold the fact.
fn fire<'a>(
    h: &mut Heap,
    s: &mut Store,
    facts: &HashMap<String, u32>,
    cells: &HashMap<String, u32>,
    key: &str,
    sup: impl IntoIterator<Item = Sup<'a>>,
    dangling: &mut usize,
) {
    let Some(&id) = facts.get(key) else {
        *dangling += 1;
        return;
    };
    for (rule, tick, ps) in sup {
        let rule = h.intern(&rule);
        if let Some(prems) = read_prems(h, facts, cells, ps, dangling) {
            s.support(id, Witness { rule, tick, prems });
        }
    }
}

pub struct Restored {
    pub store: Store,
    /// Witness premises naming a key that is not a fact in this store. Zero on
    /// every corpus seed (the derived layer is cleared before the snapshot is
    /// taken), and reported rather than swallowed.
    pub dangling: usize,
}

enum Fail {
    /// the facts are not in the shape `Raw` reads; `serde_json` reads them instead
    Unread,
    Bad(String),
}

impl From<String> for Fail {
    fn from(e: String) -> Fail {
        Fail::Bad(e)
    }
}

impl From<&str> for Fail {
    fn from(e: &str) -> Fail {
        Fail::Bad(e.into())
    }
}

pub fn restore(h: &mut Heap, v: &Vocab, json: &str) -> Result<Restored, String> {
    let _ = v;
    let fresh = h.clone();
    if let Some((d, texts)) = split(json) {
        match restore_from(h, &d, Some(texts)) {
            Ok(r) => return Ok(r),
            Err(Fail::Bad(e)) => return Err(e),
            Err(Fail::Unread) => *h = fresh,
        }
    }
    let d: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    restore_from(h, &d, None).map_err(|e| match e {
        Fail::Bad(e) => e,
        Fail::Unread => unreachable!(),
    })
}

/// The fields of a seed `Raw` reads, as text.
struct Texts<'a> {
    facts: &'a str,
    ghosts: &'a str,
    firings: &'a str,
}

/// The top-level object with `facts`, `ghosts` and `firings` left as text for
/// `Raw`, `wits` (which nothing reads) only checked, and every other field
/// parsed.
fn split(json: &str) -> Option<(Value, Texts<'_>)> {
    let mut r = Raw::new(json, 0);
    let mut rest = serde_json::Map::new();
    let (mut facts, mut ghosts, mut firings) = (None, "[]", "[]");
    r.obj(|r, k| {
        let at = r.ws();
        r.skip()?;
        let text = &json[at..r.i];
        match &*k {
            "facts" => facts = Some(text),
            "ghosts" => ghosts = text,
            "firings" => firings = text,
            "wits" => {
                serde_json::from_str::<serde::de::IgnoredAny>(text).ok()?;
            }
            _ => {
                rest.insert(k.into_owned(), serde_json::from_str(text).ok()?);
            }
        }
        Some(())
    })?;
    r.ws();
    (r.i == json.len()).then_some(())?;
    Some((Value::Object(rest), Texts { facts: facts?, ghosts, firings }))
}

fn restore_from(h: &mut Heap, d: &Value, raw: Option<Texts>) -> Result<Restored, Fail> {
    let mut s = Store::new();
    s.tick = d["tick"].as_u64().unwrap_or(0) as u32;
    if let Some(tl) = d.get("tickLog").and_then(|x| x.as_array()) {
        s.tick_log = tl
            .iter()
            .filter_map(|x| x.as_str().map(|y| y.to_string()))
            .collect();
    }
    for l in d.get("lattices").and_then(|x| x.as_array()).unwrap_or(&vec![]) {
        let (Some(rel), Some(op), Some(alg)) = (l["rel"].as_str(), l["op"].as_str(), l["alg"].as_str()) else {
            return Err("snapshot refused: bad lattice relation".into());
        };
        s.lat_regs.push(crate::store::LatReg { rel: h.intern(rel), op: op.to_string(), alg: crate::cell::Algebra::from_text(alg) });
    }
    for r in d.get("tagRules").and_then(|x| x.as_array()).unwrap_or(&vec![]) {
        s.tag_rules.insert(h.intern(r.as_str().ok_or("snapshot refused: bad tag rule")?));
    }
    let mut fact_ids = Vec::new();
    // The ghosts, re-entered and killed again: a witness may name one, and no
    // answer ever will. Added before `firings` so the keys are in the index.
    let mut ghost_ids = Vec::new();
    match &raw {
        Some(t) => {
            Raw::new(t.facts, 1).facts(h, &mut s, &mut fact_ids).ok_or(Fail::Unread)?;
            Raw::new(t.ghosts, 1).facts(h, &mut s, &mut ghost_ids).ok_or(Fail::Unread)?;
        }
        None => {
            add_facts(h, &mut s, d["facts"].as_array().ok_or("no facts")?, &mut fact_ids)?;
            add_facts(h, &mut s, d.get("ghosts").and_then(|x| x.as_array()).unwrap_or(&vec![]), &mut ghost_ids)?;
        }
    }
    let cited = |k: &str| d.get(k).and_then(|x| x.as_array()).is_some_and(|x| !x.is_empty());
    let fired = match &raw {
        Some(t) => {
            let mut r = Raw::new(t.firings, 1);
            !(r.eat(b'[') && r.eat(b']'))
        }
        None => cited("firings"),
    };
    let mut by_key: HashMap<String, u32> = HashMap::new();
    if cited("cells") || fired {
        for &id in fact_ids.iter().chain(&ghost_ids) {
            by_key.insert(s.key(h, id), id);
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
            let prems = read_prems(h, &by_key, &HashMap::new(), m["prems"].as_array().ok_or("bad member premises")?.iter().map(Prem::of), &mut dangling)
                .ok_or("a cell member names a fact the snapshot does not hold")?;
            let mut others = Vec::new();
            for o in m["others"].as_array().into_iter().flatten() {
                others.push(
                    read_prems(h, &by_key, &HashMap::new(), o.as_array().ok_or("bad member derivation")?.iter().map(Prem::of), &mut dangling)
                        .ok_or("a cell member names a fact the snapshot does not hold")?,
                );
            }
            members.push(NewMember {
                proj: proj?.into(),
                value: term_from_json(h, &m["value"])?,
                height: count(&m["height"], "member height")?,
                prems,
                others,
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
            return Err(format!("a cell's key does not spell its fields: {spelled}").into());
        }
        cells_by_key.insert(spelled, id);
    }
    match &raw {
        Some(t) => Raw::new(t.firings, 1).firings(h, &mut s, &by_key, &cells_by_key, &mut dangling).ok_or(Fail::Unread)?,
        None => {
            for e in d.get("firings").and_then(|x| x.as_array()).into_iter().flatten() {
                let sup = e["sup"].as_array().into_iter().flatten().map(|x| {
                    let ps = x["prems"].as_array().into_iter().flatten().map(Prem::of).collect();
                    (Cow::Borrowed(x["ruleId"].as_str().unwrap_or("")), x["tick"].as_u64().unwrap_or(0) as u32, ps)
                });
                fire(h, &mut s, &by_key, &cells_by_key, e["key"].as_str().unwrap_or(""), sup, &mut dangling);
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
    Ok(Restored { store: s, dangling })
}

fn add_facts(h: &mut Heap, s: &mut Store, list: &[Value], ids: &mut Vec<u32>) -> Result<(), String> {
    for f in list {
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
        ids.extend(s.get(rel, persp, &args));
    }
    Ok(())
}

/// A reader over the text of a seed's `facts` and `ghosts` that interns as it
/// goes, in the order `add_facts` does. `None` is anything it does not read
/// exactly as `serde_json` would, and sends the whole seed to `serde_json`.
struct Raw<'a> {
    s: &'a str,
    i: usize,
    depth: u32,
}

impl<'a> Raw<'a> {
    fn new(s: &'a str, depth: u32) -> Self {
        Raw { s, i: 0, depth }
    }

    fn ws(&mut self) -> usize {
        let b = self.s.as_bytes();
        while self.i < b.len() && matches!(b[self.i], b' ' | b'\n' | b'\r' | b'\t') {
            self.i += 1;
        }
        self.i
    }

    fn peek(&mut self) -> Option<u8> {
        let i = self.ws();
        self.s.as_bytes().get(i).copied()
    }

    fn eat(&mut self, c: u8) -> bool {
        let hit = self.peek() == Some(c);
        self.i += hit as usize;
        hit
    }

    /// `serde_json`'s nesting limit, so that what it refuses is refused here too
    fn nest(&mut self, open: u8) -> Option<()> {
        self.depth += 1;
        (self.depth < 128 && self.eat(open)).then_some(())
    }

    fn obj(&mut self, mut f: impl FnMut(&mut Self, Cow<'a, str>) -> Option<()>) -> Option<()> {
        self.nest(b'{')?;
        if !self.eat(b'}') {
            loop {
                let k = self.str()?;
                self.eat(b':').then_some(())?;
                f(self, k)?;
                if !self.eat(b',') {
                    self.eat(b'}').then_some(())?;
                    break;
                }
            }
        }
        self.depth -= 1;
        Some(())
    }

    fn arr(&mut self, mut f: impl FnMut(&mut Self) -> Option<()>) -> Option<()> {
        self.nest(b'[')?;
        if !self.eat(b']') {
            loop {
                f(self)?;
                if !self.eat(b',') {
                    self.eat(b']').then_some(())?;
                    break;
                }
            }
        }
        self.depth -= 1;
        Some(())
    }

    /// Past the closing quote of a string whose opening one is behind; whether
    /// it holds an escape.
    fn past_str(&mut self) -> Option<bool> {
        let b = self.s.as_bytes();
        let mut escaped = false;
        loop {
            self.i += b.get(self.i..)?.iter().position(|&c| c == b'"' || c == b'\\' || c < 0x20)?;
            match b[self.i] {
                b'"' => {
                    self.i += 1;
                    return Some(escaped);
                }
                b'\\' => {
                    escaped = true;
                    self.i += 2;
                }
                _ => return None,
            }
        }
    }

    fn str(&mut self) -> Option<Cow<'a, str>> {
        self.eat(b'"').then_some(())?;
        let start = self.i;
        if self.past_str()? {
            serde_json::from_str(&self.s[start - 1..self.i]).ok().map(Cow::Owned)
        } else {
            Some(Cow::Borrowed(&self.s[start..self.i - 1]))
        }
    }

    fn int(&mut self) -> Option<i64> {
        let start = self.ws();
        let b = self.s.as_bytes();
        self.i += (b.get(self.i) == Some(&b'-')) as usize;
        let lead = b.get(self.i).copied();
        while b.get(self.i).is_some_and(|c| c.is_ascii_digit()) {
            self.i += 1;
        }
        let text = &self.s[start..self.i];
        if lead == Some(b'0') && text.len() > 1 || matches!(b.get(self.i), Some(b'.' | b'e' | b'E')) {
            return None;
        }
        text.parse().ok()
    }

    fn bool(&mut self) -> Option<bool> {
        self.ws();
        for (word, v) in [("true", true), ("false", false)] {
            if self.s[self.i..].starts_with(word) {
                self.i += word.len();
                return Some(v);
            }
        }
        None
    }

    /// Past one value by its brackets alone, up to the comma or bracket that
    /// ends it. What is skipped is read again, by `facts` or by `serde_json`,
    /// and they see whatever is malformed in it.
    fn skip(&mut self) -> Option<()> {
        let b = self.s.as_bytes();
        let mut depth = 0u32;
        loop {
            match *b.get(self.i)? {
                b'"' => {
                    self.i += 1;
                    self.past_str()?;
                    continue;
                }
                b'[' | b'{' => depth += 1,
                b']' | b'}' | b',' if depth == 0 => return Some(()),
                b']' | b'}' => depth -= 1,
                _ => {}
            }
            self.i += 1;
        }
    }

    /// The text of the value that starts here, passed over, to be read later
    /// at this depth.
    fn later(&mut self) -> Option<Raw<'a>> {
        let at = self.ws();
        self.skip()?;
        Some(Raw { s: &self.s[at..self.i], i: 0, depth: self.depth })
    }

    /// A seed's facts, each one's relation and book interned before its
    /// arguments whichever order its fields come in (serde_json writes `args`
    /// first, the TypeScript host last).
    fn facts(&mut self, h: &mut Heap, s: &mut Store, ids: &mut Vec<u32>) -> Option<()> {
        let mut args = Vec::new();
        self.arr(|r| {
            let (mut rel, mut persp, mut text) = (None, None, None);
            let (mut flags, mut seen) = (0u8, 0u8);
            args.clear();
            r.obj(|r, k| {
                let bit = match &*k {
                    "rel" => {
                        rel = Some(r.str()?);
                        1
                    }
                    "persp" => {
                        persp = Some(r.str()?);
                        2
                    }
                    "args" => {
                        text = Some(r.later()?);
                        4
                    }
                    "scope" => {
                        if r.str()? == "tick" {
                            flags |= F_TICK;
                        }
                        8
                    }
                    "base" => {
                        flags |= F_BASE * r.bool()? as u8;
                        16
                    }
                    "frozen" => {
                        flags |= F_FROZEN * r.bool()? as u8;
                        32
                    }
                    _ => return None,
                };
                (seen & bit == 0).then(|| seen |= bit)
            })?;
            let (rel, persp) = (h.intern(&rel?), h.intern(&persp?));
            let mut text = text?;
            text.arr(|r| {
                let t = r.term(h, &mut args)?;
                args.push(t);
                Some(())
            })?;
            text.end()?;
            s.add(h, rel, persp, &args, flags);
            ids.extend(s.get(rel, persp, &args));
            Some(())
        })?;
        self.end()
    }

    fn end(&mut self) -> Option<()> {
        (self.ws() == self.s.len()).then_some(())
    }

    /// A seed's firings, read as `restore_from` reads them from a `Value`.
    fn firings(&mut self, h: &mut Heap, s: &mut Store, facts: &HashMap<String, u32>, cells: &HashMap<String, u32>, dangling: &mut usize) -> Option<()> {
        self.arr(|r| {
            let (mut key, mut sup) = (None, None);
            r.obj(|r, k| {
                let fresh = match &*k {
                    "key" => key.replace(r.str()?).is_none(),
                    "sup" => sup.replace(r.sups()?).is_none(),
                    _ => return None,
                };
                fresh.then_some(())
            })?;
            fire(h, s, facts, cells, &key?, sup.unwrap_or_default(), dangling);
            Some(())
        })?;
        self.end()
    }

    fn sups(&mut self) -> Option<Vec<Sup<'a>>> {
        let mut out = Vec::new();
        self.arr(|r| {
            let (mut rule, mut tick, mut prems, mut sig) = (None, None, None, None);
            r.obj(|r, k| {
                let fresh = match &*k {
                    "ruleId" => rule.replace(r.str()?).is_none(),
                    "tick" => tick.replace(brk!("snapshot_reads_no_tick" => 0 * r.int()?; r.int()?).max(0) as u64 as u32).is_none(),
                    "sig" => sig.replace(r.str()?).is_none(),
                    "prems" => {
                        let mut ps = Vec::new();
                        r.arr(|r| {
                            ps.push(r.prem()?);
                            Some(())
                        })?;
                        prems.replace(ps).is_none()
                    }
                    _ => return None,
                };
                fresh.then_some(())
            })?;
            out.push((rule.unwrap_or_default(), tick.unwrap_or(0), prems.unwrap_or_default()));
            Some(())
        })?;
        Some(out)
    }

    fn prem(&mut self) -> Option<Prem<'a>> {
        let (mut t, mut key, mut desc) = (None, None, None);
        self.obj(|r, k| {
            let fresh = match &*k {
                "t" => t.replace(r.str()?).is_none(),
                "key" => key.replace(r.str()?).is_none(),
                "desc" => desc.replace(r.str()?).is_none(),
                _ => return None,
            };
            fresh.then_some(())
        })?;
        Some(Prem { t: t.unwrap_or_default(), key: key.unwrap_or_default(), desc: desc.unwrap_or_default() })
    }

    /// One term, its arguments built on `stack` above what is there already.
    fn term(&mut self, h: &mut Heap, stack: &mut Vec<Term>) -> Option<Term> {
        let (mut k, mut name, mut text, mut int, mut args) = (None, None, None, None, None);
        self.obj(|r, key| {
            let fresh = match &*key {
                "k" => k.replace(r.str()?).is_none(),
                "name" => name.replace(r.str()?).is_none(),
                "v" if r.peek()? == b'"' => text.replace(r.str()?).is_none() && int.is_none(),
                "v" => int.replace(r.int()?).is_none() && text.is_none(),
                "args" => {
                    let base = stack.len();
                    r.arr(|r| {
                        let t = r.term(h, stack)?;
                        stack.push(t);
                        Some(())
                    })?;
                    args.replace(base).is_none()
                }
                _ => return None,
            };
            fresh.then_some(())
        })?;
        let k = k?;
        if k != "f" && args.is_some() {
            return None;
        }
        match &*k {
            "v" => Some(h.var(&name?)),
            "a" => Some(h.atom(&name?)),
            "s" => Some(h.string(&text?)),
            "i" => int.map(Term::int),
            "f" => {
                let base = args?;
                let t = h.mkf_named(&name?, &stack[base..]);
                stack.truncate(base);
                Some(t)
            }
            _ => None,
        }
    }
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

/// A snapshot's text, written as it goes: serde_json's compact form with its
/// keys in serde_json's sorted order, which is the text the `Value`s it was
/// once built from printed. A 200 MB snapshot built as `Value`s first was most
/// of what saving a world cost (f_the_gate_spends_its_time_in_the_engines).
/// Each field is written with the text before its value, `{"k":` or `,"k":`.
struct Out(Vec<u8>);

impl Out {
    fn raw(&mut self, s: &str) {
        self.0.extend_from_slice(s.as_bytes());
    }

    fn s(&mut self, at: &str, v: &str) {
        self.raw(at);
        serde_json::to_writer(&mut self.0, v).expect("a string written to memory");
    }

    fn n(&mut self, at: &str, n: impl std::fmt::Display) {
        use std::io::Write;
        self.raw(at);
        write!(self.0, "{n}").expect("a number written to memory");
    }

    fn b(&mut self, at: &str, b: bool) {
        self.raw(at);
        self.raw(if b { "true" } else { "false" });
    }

    fn list<T>(&mut self, at: &str, xs: impl IntoIterator<Item = T>, mut f: impl FnMut(&mut Self, T)) {
        self.raw(at);
        self.raw("[");
        for (i, x) in xs.into_iter().enumerate() {
            if i > 0 {
                self.raw(",");
            }
            f(self, x);
        }
        self.raw("]");
    }
}

/// One thing as `write` writes it, as a `Value` for an answer of `rofl serve`.
fn value(write: impl FnOnce(&mut Out)) -> Value {
    let mut o = Out(Vec::new());
    write(&mut o);
    serde_json::from_slice(&o.0).expect("a snapshot's own text reads back")
}

fn term(o: &mut Out, h: &Heap, t: Term) {
    match t.kind() {
        TermK::Var(s) => o.s(r#"{"k":"v","name":"#, h.name(s)),
        TermK::Atom(s) => o.s(r#"{"k":"a","name":"#, h.name(s)),
        TermK::Str(s) => o.s(r#"{"k":"s","v":"#, h.name(s)),
        TermK::Int(n) => o.n(r#"{"k":"i","v":"#, n),
        TermK::Func(i) => {
            terms(o, r#"{"args":"#, h, h.fargs(i));
            o.s(r#","k":"f","name":"#, h.name(h.fname(i)));
        }
    }
    o.raw("}");
}

fn terms(o: &mut Out, at: &str, h: &Heap, ts: &[Term]) {
    o.list(at, ts, |o, t| term(o, h, *t));
}

fn prems(o: &mut Out, at: &str, h: &Heap, s: &Store, ps: &[PremRef]) {
    o.list(at, ps, |o, p| {
        let mut key = String::new();
        let t = match p {
            PremRef::Bi(d) => {
                o.s(r#"{"desc":"#, h.name(*d));
                "bi"
            }
            PremRef::Neg(k) => {
                o.s(r#"{"key":"#, h.name(*k));
                "neg"
            }
            PremRef::VRow(k) => {
                o.s(r#"{"key":"#, h.name(*k));
                "vrow"
            }
            PremRef::Fact(f) => {
                s.write_key(h, *f, &mut key);
                o.s(r#"{"key":"#, &key);
                "fact"
            }
            PremRef::Cell(c) => {
                s.write_cell_key(h, *c, &mut key);
                o.s(r#"{"key":"#, &key);
                "cell"
            }
        };
        o.s(r#","t":"#, t);
        o.raw("}");
    });
}

/// One fact; `key` where a reader asks by it (a snapshot's own `facts` go without).
#[allow(clippy::too_many_arguments)]
fn fact(o: &mut Out, h: &Heap, key: Option<&str>, rel: Sym, persp: Sym, args: &[Term], tick: bool, base: bool, frozen: bool) {
    terms(o, r#"{"args":"#, h, args);
    o.b(r#","base":"#, base);
    o.b(r#","frozen":"#, frozen);
    if let Some(k) = key {
        o.s(r#","key":"#, k);
    }
    o.s(r#","persp":"#, h.name(persp));
    o.s(r#","rel":"#, h.name(rel));
    o.s(r#","scope":"#, if tick { "tick" } else { "timeless" });
    o.raw("}");
}

fn stored(o: &mut Out, h: &Heap, s: &Store, id: FactId, key: Option<&str>) {
    let r = s.rec(id);
    fact(o, h, key, r.rel, r.persp, s.args(id), r.tick_scope(), r.base(), r.frozen());
}

/// One firing, as a snapshot's `sup` and an answer of `firings` write it.
fn firing(o: &mut Out, h: &Heap, s: &Store, sig: &str, rule: Sym, tick: u32, ps: &[PremRef]) {
    prems(o, r#"{"prems":"#, h, s, ps);
    o.s(r#","ruleId":"#, h.name(rule));
    o.s(r#","sig":"#, sig);
    o.n(r#","tick":"#, tick);
    o.raw("}");
}

/// One cell: what it is keyed by, its value, its members and what it sealed;
/// with `like`, its members are that cell's and named, not written again (a
/// holistic group shared by many cells is written once). The TypeScript host
/// reads the field (src/store.ts `restore`) and ignores `ghosts`: its premises
/// name facts by key.
fn cell(o: &mut Out, h: &Heap, s: &Store, c: CellId, like: Option<CellId>) {
    let r = s.cell(c);
    let CellOwner::Body { rule, at } = r.owner;
    let mut key = String::new();
    s.write_cell_key(h, c, &mut key);
    o.n(r#"{"at":"#, at);
    o.s(r#","desc":"#, h.name(r.desc));
    o.n(r#","height":"#, r.height);
    match r.value {
        CellValue::Hole(x) => o.s(r#","hole":"#, h.name(x)),
        _ => o.raw(r#","hole":null"#),
    }
    o.s(r#","key":"#, &key);
    terms(o, r#","keyTerms":"#, h, &r.key);
    o.list(r#","members":"#, s.cell_members(c).iter().filter(|_| like.is_none()), |o, m| {
        o.n(r#"{"height":"#, m.height);
        let others: Vec<&[PremRef]> = s.member_derivs(m).skip(1).collect();
        if !others.is_empty() {
            o.list(r#","others":"#, others, |o, ps| prems(o, "", h, s, ps));
        }
        prems(o, r#","prems":"#, h, s, s.member_prems(m));
        terms(o, r#","proj":"#, h, &m.proj);
        o.raw(r#","value":"#);
        term(o, h, m.value);
        o.raw("}");
    });
    if let Some(x) = like {
        let mut k = String::new();
        s.write_cell_key(h, x, &mut k);
        o.s(r#","membersOf":"#, &k);
    }
    o.s(r#","op":"#, r.op.name());
    o.s(r#","rule":"#, h.name(rule));
    o.list(r#","sealed":"#, s.cell_seals(c), |o, x| {
        o.s(r#"{"rel":"#, h.name(x.rel));
        o.n(r#","round":"#, x.round);
        o.raw("}");
    });
    o.n(r#","tick":"#, r.tick);
    o.raw(r#","value":"#);
    match r.value {
        CellValue::Value(t) => term(o, h, t),
        _ => o.raw("null"),
    }
    o.raw("}");
}

/// One cell as a snapshot's `cells` writes it.
pub fn cell_json(h: &Heap, s: &Store, c: CellId, like: Option<CellId>) -> Value {
    value(|o| cell(o, h, s, c, like))
}

/// A row a structure answers, as `fact_json` writes a stored one: derived, of its tick.
pub fn virtual_json(h: &Heap, rel: Sym, book: Sym, args: &[Term]) -> Value {
    let mut key = String::new();
    crate::store::write_fact_key(h, rel, book, args, &mut key);
    value(|o| fact(o, h, Some(&key), rel, book, args, true, false, false))
}

/// One fact as a snapshot's `facts` list writes it, with its key.
pub fn fact_json(h: &Heap, s: &Store, id: FactId) -> Value {
    value(|o| stored(o, h, s, id, Some(&s.key(h, id))))
}

/// Every firing of a fact in the order `witness_of` ranks them, each with its signature, as a snapshot's `firings` writes one.
pub fn firings_json(h: &Heap, s: &Store, id: FactId) -> Vec<Value> {
    let mut memo = HashMap::new();
    s.firings_ranked(h, id, &mut memo)
        .into_iter()
        .map(|(rule, tick, ps)| {
            let mut sig = String::new();
            s.write_sig(h, &crate::store::WitView { rule, tick, prems: &ps }, &mut sig);
            value(|o| firing(o, h, s, &sig, rule, tick, &ps))
        })
        .collect()
}

pub fn snapshot(h: &Heap, s: &Store) -> String {
    let keyed = |ids: Vec<FactId>| {
        let mut k: Vec<(String, FactId)> = ids.into_iter().map(|id| (s.key(h, id), id)).collect();
        k.sort_by(|a, b| cmp_js(&a.0, &b.0));
        k
    };
    let (facts, fired) = (keyed(s.live_ids()), keyed(s.firing_keys()));
    let mut o = Out(Vec::new());
    // Written only when there are cells, so a snapshot without an aggregate is
    // the one it was.
    let cells = s.cells_in_order(h);
    if !cells.is_empty() {
        o.list(r#"{"cells":"#, &cells, |o, &(c, like)| cell(o, h, s, c, like));
    }
    o.list(if cells.is_empty() { r#"{"evals":"# } else { r#","evals":"# }, &s.eval_log, |o, (t, e)| {
        o.n(r#"{"budget":"#, e.budget);
        o.b(r#","partial":"#, e.partial);
        o.n(r#","steps":"#, e.steps);
        o.n(r#","tick":"#, t);
        o.raw("}");
    });
    o.list(r#","facts":"#, brk!("snapshot_drops_a_fact" => &facts[facts.len().min(1)..]; &facts[..]), |o, (_, id)| stored(o, h, s, *id, None));
    o.list(r#","firings":"#, &fired, |o, (k, id)| {
        let mut sup = s.supports_of(h, *id);
        sup.sort_by(|a, b| cmp_js(&a.0, &b.0));
        o.s(r#"{"key":"#, k);
        o.list(r#","sup":"#, &sup, |o, (sig, rule, tick, ps)| firing(o, h, s, sig, *rule, *tick, ps));
        o.raw("}");
    });
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
    o.list(r#","ghosts":"#, brk!("snapshot_drops_ghosts" => Vec::new(); s.dead_ids()), |o, id| stored(o, h, s, id, None));
    if !s.lat_regs.is_empty() {
        o.list(r#","lattices":"#, &s.lat_regs, |o, r| {
            o.s(r#"{"alg":"#, &r.alg.text());
            o.s(r#","op":"#, &r.op);
            o.s(r#","rel":"#, h.name(r.rel));
            o.s(r#","use":"#, r.alg.strategy().name());
            o.raw("}");
        });
    }
    if !s.tag_rules.is_empty() {
        let mut ts: Vec<&str> = s.tag_rules.iter().map(|r| h.name(*r)).collect();
        ts.sort();
        o.list(r#","tagRules":"#, ts, |o, t| o.s("", t));
    }
    o.n(r#","tick":"#, s.tick);
    o.list(r#","tickLog":"#, &s.tick_log, |o, t| o.s("", t));
    // `wits` is DERIVED from `firings` and `restore` ignores it — it is in the
    // format because the reference host puts it there, and a snapshot that
    // differs from the reference's by a key is a second format.
    let mut memo = HashMap::new();
    o.list(r#","wits":"#, &fired, |o, (k, id)| {
        let w = s.witness_of(h, *id, &mut memo).unwrap();
        o.s(r#"{"key":"#, k);
        prems(o, r#","prems":"#, h, s, w.prems);
        o.s(r#","ruleId":"#, h.name(w.rule));
        o.n(r#","tick":"#, w.tick);
        o.raw("}");
    });
    o.raw("}");
    String::from_utf8(o.0).expect("a snapshot is written from strings")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: &str = r#"{"tick":3,"facts":[{"rel":"p","persp":"main","args":[{"k":"s","v":"a \"q\"\né"},{"k":"i","v":-7},{"k":"f","name":"g","args":[{"k":"a","name":"x"},{"k":"v","name":"Y"}]}],"scope":"tick","base":true,"frozen":false}],"evals":[],"ghosts":[{"rel":"q","persp":"main","args":[{"k":"i","v":0}],"scope":"timeless","base":false,"frozen":true}]}"#;

    fn read(json: &str, raw: bool) -> (String, Vec<String>) {
        let mut h = Heap::default();
        let r = if raw {
            let (d, texts) = split(json).unwrap();
            restore_from(&mut h, &d, Some(texts))
        } else {
            restore_from(&mut h, &serde_json::from_str(json).unwrap(), None)
        };
        let Ok(r) = r else { panic!("not restored") };
        (snapshot(&h, &r.store), (0..h.sym_count() as u32).map(|i| h.name(i).to_string()).collect())
    }

    #[test]
    fn the_raw_reader_interns_and_stores_what_serde_json_does() {
        assert_eq!(read(SEED, true), read(SEED, false));
    }

    #[test]
    fn a_fact_the_raw_reader_does_not_read_is_read_by_serde_json() {
        let odd = SEED.replacen(r#"{"rel":"p""#, r#"{"note":1,"rel":"p""#, 1);
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let r = restore(&mut h, &v, &odd).unwrap();
        assert_eq!(snapshot(&h, &r.store), read(SEED, false).0);
    }

    /// What `snapshot` writes (serde_json's order: `args` before `rel`, `prems`
    /// before `ruleId`) is read by `Raw`, firings included, as serde_json reads
    /// it, and written again it is the same text.
    #[test]
    fn the_raw_reader_reads_what_snapshot_writes() {
        let mut h = Heap::default();
        let Ok(r) = restore_from(&mut h, &serde_json::from_str(SEED).unwrap(), None) else { panic!("not restored") };
        let (p, q) = (r.store.key(&h, 0), r.store.key(&h, 1));
        let firings = format!(
            r#""firings":[{{"key":{},"sup":[{{"ruleId":"r2","tick":1,"prems":[{{"t":"fact","key":{}}},{{"t":"bi","desc":"1 < 2"}},{{"t":"neg","key":"n(1)"}}]}},{{"ruleId":"r1","tick":0,"prems":[]}}]}},{{"key":"gone(1)","sup":[{{"ruleId":"r3","tick":0,"prems":[]}}]}}],"#,
            serde_json::to_string(&p).unwrap(),
            serde_json::to_string(&q).unwrap()
        );
        let fired = SEED.replacen(r#""evals""#, &format!(r#"{firings}"evals""#), 1);
        let written = read(&fired, false).0;
        assert!(written.contains(r#""sup":[{"prems":[]"#) && written.contains(r#""t":"neg""#), "the firings are written: {written}");
        assert_eq!(read(&written, true), read(&written, false));
        assert_eq!(read(&written, true).0, written);
    }
}
