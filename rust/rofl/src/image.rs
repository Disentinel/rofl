//! A KEPT WORLD: what a seed holds (`crate::seed`), written by id and in binary, so an evaluated world goes to disk
//! and comes back evaluated without a key spelled, sorted or parsed (docs/staged-evaluation.md, decision 1). The
//! facts, ghosts, witnesses, cells, lattices and the program are the seed's; only the encoding differs, and an
//! image is read by the build that wrote it. Each distinct term is written once, in a table ahead of the facts, and
//! built once when read.
use crate::cell::{AggOp, Algebra};
use crate::engine::StagedFact;
use crate::store::{CellOwner, CellValue, EvalRecord, LatReg, NewCell, NewMember, PremRef, Seal, Store, Witness, F_BASE, F_FROZEN, F_TICK};
use crate::term::{Heap, Sym, Term, TermK};
use std::collections::HashMap;

const MAGIC: &[u8] = b"ROFL-KEPT-2\n";

#[derive(Default)]
struct W {
    out: Vec<u8>,
    names: Vec<Sym>,
    name_ix: HashMap<Sym, u32>,
    table: Vec<u8>,
    term_of: HashMap<Term, u32>,
}

impl W {
    fn u32(&mut self, x: u32) {
        self.out.extend_from_slice(&x.to_le_bytes());
    }
    fn i64(&mut self, x: i64) {
        self.out.extend_from_slice(&x.to_le_bytes());
    }
    fn sym(&mut self, s: Sym) {
        let i = self.sym_ix(s);
        self.u32(i);
    }
    fn sym_ix(&mut self, s: Sym) -> u32 {
        let n = self.names.len() as u32;
        let i = *self.name_ix.entry(s).or_insert(n);
        if i == n {
            self.names.push(s);
        }
        i
    }
    fn text(&mut self, s: &str) {
        self.u32(s.len() as u32);
        self.out.extend_from_slice(s.as_bytes());
    }
    fn term(&mut self, h: &Heap, t: Term) {
        let i = self.term_ix(h, t);
        self.u32(i)
    }
    /// The term's place in the table, written there once, after its arguments.
    fn term_ix(&mut self, h: &Heap, t: Term) -> u32 {
        if let Some(&i) = self.term_of.get(&t) {
            return i;
        }
        let mut e = Vec::new();
        match t.kind() {
            TermK::Var(s) => e.extend([0, self.sym_ix(s)]),
            TermK::Atom(s) => e.extend([1, self.sym_ix(s)]),
            TermK::Str(s) => e.extend([2, self.sym_ix(s)]),
            TermK::Int(n) => e.extend([3, n as u32, (n >> 32) as u32]),
            TermK::Func(f) => {
                e.extend([4, self.sym_ix(h.fname(f)), h.fargs(f).len() as u32]);
                for &a in h.fargs(f) {
                    e.push(self.term_ix(h, a));
                }
            }
        }
        for x in e {
            self.table.extend_from_slice(&x.to_le_bytes());
        }
        let i = self.term_of.len() as u32;
        self.term_of.insert(t, i);
        i
    }
    fn terms(&mut self, h: &Heap, ts: &[Term]) {
        self.u32(ts.len() as u32);
        for &t in ts {
            self.term(h, t);
        }
    }
    fn prems(&mut self, ps: &[PremRef], fact_ix: &HashMap<u32, u32>, cell_ix: &HashMap<u32, u32>) {
        self.u32(ps.len() as u32);
        for p in ps {
            match *p {
                PremRef::Fact(f) => {
                    self.out.push(0);
                    self.u32(fact_ix.get(&f).copied().unwrap_or(u32::MAX))
                }
                PremRef::Neg(s) => {
                    self.out.push(1);
                    self.sym(s)
                }
                PremRef::Bi(s) => {
                    self.out.push(2);
                    self.sym(s)
                }
                PremRef::VRow(s) => {
                    self.out.push(3);
                    self.sym(s)
                }
                PremRef::Cell(c) => {
                    self.out.push(4);
                    self.u32(cell_ix.get(&c).copied().unwrap_or(u32::MAX))
                }
            }
        }
    }
}

/// The world in `s`, and what its evaluation staged for the next tick, as a kept image.
pub fn keep(h: &Heap, s: &Store, staged: &[(StagedFact, Vec<(Sym, Vec<PremRef>)>)]) -> Vec<u8> {
    let mut w = W::default();
    w.u32(s.tick);
    w.out.push((!s.dirty && !s.partial_eval) as u8);
    w.u32(s.tick_log.len() as u32);
    for l in &s.tick_log {
        w.text(l);
    }
    w.u32(s.lat_regs.len() as u32);
    for r in &s.lat_regs {
        w.sym(r.rel);
        w.text(&r.op);
        w.text(&r.alg.text());
    }
    let mut tags: Vec<Sym> = s.tag_rules.iter().copied().collect();
    tags.sort_unstable();
    w.u32(tags.len() as u32);
    for t in tags {
        w.sym(t);
    }
    let (live, dead) = (s.live_ids(), s.dead_ids());
    let mut fact_ix: HashMap<u32, u32> = HashMap::with_capacity(live.len() + dead.len());
    for ids in [&live, &dead] {
        w.u32(ids.len() as u32);
        for &id in ids.iter() {
            fact_ix.insert(id, fact_ix.len() as u32);
            let r = s.rec(id);
            w.sym(r.rel);
            w.sym(r.persp);
            w.out.push((r.tick_scope() as u8) * F_TICK | (r.base() as u8) * F_BASE | (r.frozen() as u8) * F_FROZEN);
            w.terms(h, s.args(id));
        }
    }
    let cells = s.cells_in_order(h);
    let cell_ix: HashMap<u32, u32> = cells.iter().enumerate().map(|(i, (c, _))| (*c, i as u32)).collect();
    w.u32(cells.len() as u32);
    for (c, like) in &cells {
        let r = s.cell(*c);
        let CellOwner::Body { rule, at } = r.owner;
        w.sym(rule);
        w.u32(at);
        w.text(r.op.name());
        w.terms(h, &r.key);
        match r.value {
            CellValue::Value(t) => {
                w.out.push(0);
                w.term(h, t)
            }
            CellValue::Empty => w.out.push(1),
            CellValue::Hole(x) => {
                w.out.push(2);
                w.sym(x)
            }
        }
        w.u32(r.height);
        w.u32(r.tick);
        w.sym(r.desc);
        w.u32(like.map_or(u32::MAX, |x| cell_ix[&x]));
        let members = if like.is_some() { &[][..] } else { s.cell_members(*c) };
        w.u32(members.len() as u32);
        for m in members {
            w.terms(h, &m.proj);
            w.term(h, m.value);
            w.u32(m.height);
            let derivs: Vec<&[PremRef]> = s.member_derivs(m).collect();
            w.u32(derivs.len() as u32);
            for d in derivs {
                w.prems(d, &fact_ix, &HashMap::new());
            }
        }
        let seals = s.cell_seals(*c);
        w.u32(seals.len() as u32);
        for x in seals {
            w.sym(x.rel);
            w.u32(x.round);
        }
    }
    let firing = s.firing_keys();
    w.u32(firing.len() as u32);
    for id in firing {
        w.u32(fact_ix.get(&id).copied().unwrap_or(u32::MAX));
        let wits = s.witnesses(id);
        w.u32(wits.len() as u32);
        // replayed oldest first, so the chain reads back in the order it holds
        for v in wits.iter().rev() {
            w.sym(v.rule);
            w.u32(v.tick);
            w.prems(v.prems, &fact_ix, &cell_ix);
        }
    }
    w.u32(s.eval_log.len() as u32);
    for (t, e) in &s.eval_log {
        w.u32(*t);
        w.i64(e.budget);
        w.i64(e.steps);
        w.out.push(e.partial as u8);
    }
    w.u32(staged.len() as u32);
    for (f, alts) in staged {
        w.sym(f.rel);
        w.sym(f.persp);
        w.terms(h, &f.args);
        w.sym(f.rule);
        w.prems(&f.prems, &fact_ix, &cell_ix);
        w.u32(alts.len() as u32);
        for (rule, prems) in alts {
            w.sym(*rule);
            w.prems(prems, &fact_ix, &cell_ix);
        }
    }
    let mut file = MAGIC.to_vec();
    file.extend_from_slice(&(w.names.len() as u32).to_le_bytes());
    for &n in &w.names {
        let t = h.name(n).as_bytes();
        file.extend_from_slice(&(t.len() as u32).to_le_bytes());
        file.extend_from_slice(t);
    }
    file.extend_from_slice(&(w.term_of.len() as u32).to_le_bytes());
    file.extend_from_slice(&w.table);
    file.extend_from_slice(&w.out);
    file
}

struct R<'a> {
    b: &'a [u8],
    i: usize,
    names: Vec<Sym>,
    terms: Vec<Term>,
}

impl R<'_> {
    fn bytes(&mut self, n: usize) -> Result<&[u8], String> {
        let s = self.b.get(self.i..self.i + n).ok_or("a kept image ends early")?;
        self.i += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.bytes(1)?[0])
    }
    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.bytes(4)?.try_into().unwrap()))
    }
    fn i64(&mut self) -> Result<i64, String> {
        Ok(i64::from_le_bytes(self.bytes(8)?.try_into().unwrap()))
    }
    fn sym(&mut self) -> Result<Sym, String> {
        let i = self.u32()?;
        self.names.get(i as usize).copied().ok_or_else(|| "a kept image names no such name".into())
    }
    fn text(&mut self) -> Result<String, String> {
        let n = self.u32()? as usize;
        String::from_utf8(self.bytes(n)?.to_vec()).map_err(|e| e.to_string())
    }
    fn term(&mut self) -> Result<Term, String> {
        let i = self.u32()?;
        self.terms.get(i as usize).copied().ok_or_else(|| "a kept image names no such term".into())
    }
    fn terms(&mut self, out: &mut Vec<Term>) -> Result<(), String> {
        out.clear();
        for _ in 0..self.u32()? {
            out.push(self.term()?);
        }
        Ok(())
    }
    fn term_list(&mut self) -> Result<Vec<Term>, String> {
        let mut v = Vec::new();
        self.terms(&mut v)?;
        Ok(v)
    }
    fn table(&mut self, h: &mut Heap) -> Result<(), String> {
        let n = self.u32()? as usize;
        self.terms.reserve(n);
        let mut args = Vec::new();
        for _ in 0..n {
            let t = match self.u32()? {
                0 => Term::var(self.sym()?),
                1 => Term::atom(self.sym()?),
                2 => Term::str(self.sym()?),
                3 => Term::int(self.u32()? as i64 | ((self.u32()? as i64) << 32)),
                4 => {
                    let name = self.sym()?;
                    self.terms(&mut args)?;
                    h.mkf(name, &args)
                }
                _ => return Err("a kept image holds a term of no kind".into()),
            };
            self.terms.push(t);
        }
        Ok(())
    }
    fn prems(&mut self, ids: &[u32], cells: &[u32]) -> Result<Option<Vec<PremRef>>, String> {
        let n = self.u32()? as usize;
        let mut out = Vec::with_capacity(n);
        let mut whole = true;
        for _ in 0..n {
            let tag = self.u8()?;
            out.push(match tag {
                0 | 4 => {
                    let i = self.u32()? as usize;
                    match (tag, if tag == 0 { ids.get(i) } else { cells.get(i) }) {
                        (0, Some(&f)) => PremRef::Fact(f),
                        (_, Some(&c)) => PremRef::Cell(c),
                        _ => {
                            whole = false;
                            continue;
                        }
                    }
                }
                1 => PremRef::Neg(self.sym()?),
                2 => PremRef::Bi(self.sym()?),
                3 => PremRef::VRow(self.sym()?),
                _ => return Err("a kept image holds a premise of no kind".into()),
            });
        }
        Ok(whole.then_some(out))
    }
}

pub struct Opened {
    pub store: Store,
    pub staged: Vec<(StagedFact, Vec<(Sym, Vec<PremRef>)>)>,
    /// premises the image named that it does not hold
    pub dangling: usize,
}

/// The store a kept image holds, and what it had staged.
pub fn open(h: &mut Heap, bytes: &[u8]) -> Result<Opened, String> {
    if !bytes.starts_with(MAGIC) {
        return Err("not a kept image of this build".into());
    }
    let mut r = R { b: bytes, i: MAGIC.len(), names: Vec::new(), terms: Vec::new() };
    let n = r.u32()?;
    for _ in 0..n {
        let len = r.u32()? as usize;
        let t = std::str::from_utf8(r.bytes(len)?).map_err(|e| e.to_string())?.to_string();
        r.names.push(h.intern(&t));
    }
    r.table(h)?;
    let mut s = Store::new();
    s.tick = r.u32()?;
    let evaluated = r.u8()? == 1;
    for _ in 0..r.u32()? {
        let l = r.text()?;
        s.tick_log.push(l);
    }
    for _ in 0..r.u32()? {
        let rel = r.sym()?;
        let op = r.text()?;
        let alg = Algebra::from_text(&r.text()?);
        s.lat_regs.push(LatReg { rel, op, alg });
    }
    for _ in 0..r.u32()? {
        let t = r.sym()?;
        s.tag_rules.insert(t);
    }
    let mut ids: Vec<u32> = Vec::new();
    let mut args = Vec::new();
    let mut ghosts = 0..0;
    for part in 0..2 {
        let from = ids.len();
        for _ in 0..r.u32()? {
            let rel = r.sym()?;
            let persp = r.sym()?;
            let flags = r.u8()?;
            r.terms(&mut args)?;
            ids.push(s.put(h, rel, persp, &args, flags).0);
        }
        if part == 1 {
            ghosts = from..ids.len();
        }
    }
    let mut dangling = 0usize;
    let mut cells: Vec<u32> = Vec::new();
    for _ in 0..r.u32()? {
        let rule = r.sym()?;
        let at = r.u32()?;
        let op = AggOp::from_name(&r.text()?).ok_or("a kept cell has no such aggregate")?;
        let key: Box<[Term]> = r.term_list()?.into();
        let value = match r.u8()? {
            0 => CellValue::Value(r.term()?),
            1 => CellValue::Empty,
            _ => CellValue::Hole(r.sym()?),
        };
        let height = r.u32()?;
        let tick = r.u32()?;
        let desc = r.sym()?;
        let like = r.u32()?;
        let mut members = Vec::new();
        for _ in 0..r.u32()? {
            let proj: Box<[Term]> = r.term_list()?.into();
            let value = r.term()?;
            let height = r.u32()?;
            let mut derivs = Vec::new();
            for _ in 0..r.u32()? {
                derivs.push(r.prems(&ids, &[])?.ok_or("a cell member names a fact the image does not hold")?);
            }
            let mut d = derivs.into_iter();
            let prems = d.next().unwrap_or_default();
            members.push(NewMember { proj, value, height, prems, others: d.collect() });
        }
        let mut seals = Vec::new();
        for _ in 0..r.u32()? {
            let rel = r.sym()?;
            seals.push(Seal { rel, round: r.u32()? });
        }
        let cell = NewCell { owner: CellOwner::Body { rule, at }, op, key, value, height, tick, desc, members, seals };
        cells.push(match cells.get(like as usize) {
            Some(&x) => s.add_cell_sharing(cell, x),
            None => s.add_cell(cell),
        });
    }
    for _ in 0..r.u32()? {
        let at = r.u32()?;
        for _ in 0..r.u32()? {
            let rule = r.sym()?;
            let tick = r.u32()?;
            let prems = r.prems(&ids, &cells)?;
            match (ids.get(at as usize), prems) {
                (Some(&id), Some(prems)) => {
                    s.support(id, Witness { rule, tick, prems });
                }
                _ => dangling += 1,
            }
        }
    }
    for _ in 0..r.u32()? {
        let t = r.u32()?;
        let (budget, steps, partial) = (r.i64()?, r.i64()?, r.u8()? == 1);
        s.eval_log.insert(t, EvalRecord { budget, steps, partial });
    }
    let mut staged = Vec::new();
    for _ in 0..r.u32()? {
        let rel = r.sym()?;
        let persp = r.sym()?;
        let args = r.term_list()?;
        let rule = r.sym()?;
        let prems = r.prems(&ids, &cells)?.ok_or("a staged fact names a fact the image does not hold")?;
        let mut alts = Vec::new();
        for _ in 0..r.u32()? {
            let rule = r.sym()?;
            alts.push((rule, r.prems(&ids, &cells)?.ok_or("a staged fact names a fact the image does not hold")?));
        }
        staged.push((StagedFact { rel, persp, args, rule, prems }, alts));
    }
    if r.i != bytes.len() {
        return Err("a kept image has bytes after its end".into());
    }
    for &id in &ids[ghosts] {
        s.retire_keeping_firings(id);
    }
    s.sweep();
    s.dirty = !evaluated;
    Ok(Opened { store: s, staged, dangling })
}
