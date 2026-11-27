//! THE PAGES CORE: a pass as meetings by key. A fact is filed under each key a premise asks it by (the relation, and
//! the values of the arguments bound when that premise is reached); a rule's partial instance meets only the facts
//! under its own key. Relations settle by strongly connected components, lowest first, each to its fixpoint by news:
//! the facts a round made new meet every rule of the component that reads them, at that premise, the rest of the body
//! read over all that stands. Conclusions go through `conclude`, so the store, its firings and the state are what any
//! pass writes. A world this core cannot evaluate yet is evaluated by the levels below.
use super::*;

/// The facts a pass reads, each a row of its book and arguments, filed under every key a premise asks it by.
#[derive(Default)]
struct Pages {
    /// where each fact's row starts in `terms`, by its id; `NO_ROW` for a fact not filed
    at: Vec<u32>,
    terms: Vec<Term>,
    /// the books that are the kernel's ledgers, which a book left open does not range over
    kernel: FxSet<Sym>,
    all: FxMap<Sym, Vec<FactId>>,
    /// the facts of a relation by the hash of the values a key binds: what a hash shares by chance a meeting drops
    ix: Vec<FxMap<u64, Vec<FactId>>>,
    ix_of: FxMap<(Sym, u64), usize>,
    masks: FxMap<Sym, Vec<(u64, usize)>>,
}

const NO_ROW: u32 = u32::MAX;

impl Pages {
    /// The row of fact `id`: its book, then its arguments.
    fn row(&self, id: FactId) -> &[Term] {
        let a = self.at[id as usize] as usize;
        let n = self.terms[a].bits() as usize;
        &self.terms[a + 1..a + 2 + n]
    }

    fn key_of(row: &[Term], mask: u64) -> u64 {
        let mut k = KeyHash::default();
        for (j, t) in row.iter().enumerate() {
            if mask >> j & 1 != 0 {
                k.add(*t);
            }
        }
        k.0
    }

    /// The index of the facts of `rel` by the arguments `mask` binds.
    fn want(&mut self, rel: Sym, mask: u64) -> usize {
        if mask == 0 {
            return usize::MAX;
        }
        if let Some(&x) = self.ix_of.get(&(rel, mask)) {
            return x;
        }
        let x = self.ix.len();
        self.ix.push(FxMap::default());
        self.ix_of.insert((rel, mask), x);
        self.masks.entry(rel).or_default().push((mask, x));
        x
    }

    fn file(&mut self, h: &Heap, store: &Store, rel: Sym, id: FactId) {
        let persp = store.rec(id).persp;
        if is_kernel_ledger(h, persp) {
            self.kernel.insert(persp);
        }
        if self.at.len() <= id as usize {
            self.at.resize(id as usize + 1, NO_ROW);
        }
        self.at[id as usize] = self.terms.len() as u32;
        let args = store.args(id);
        // (the length first, as a bare word)
        self.terms.push(Term::from_bits(args.len() as u64));
        self.terms.push(Term::atom(persp));
        self.terms.extend_from_slice(args);
        self.all.entry(rel).or_default().push(id);
        if let Some(ms) = self.masks.get(&rel) {
            let a = self.at[id as usize] as usize + 1;
            for &(m, x) in ms {
                let k = Self::key_of(&self.terms[a..a + 1 + args.len()], m);
                self.ix[x].entry(k).or_default().push(id);
            }
        }
    }

    fn under(&self, rel: Sym, ix: usize, key: u64) -> &[FactId] {
        let got = if ix == usize::MAX { self.all.get(&rel) } else { self.ix[ix].get(&key) };
        got.map_or(&[][..], |v| &v[..])
    }
}

#[derive(Default)]
struct KeyHash(u64);

impl KeyHash {
    fn add(&mut self, t: Term) {
        self.0 = (self.0.rotate_left(5) ^ t.bits()).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }
}

/// One element of a body in the order a firing reads it, and the arguments bound when it is read (bit 0 the book,
/// bit i + 1 argument i).
#[derive(Clone, Copy)]
struct Step {
    at: usize,
    mask: u64,
    ix: usize,
}

/// A rule and the orders its body is read in: whole, and from a new fact at each premise of its own component.
struct Fired {
    r: Rc<ERule>,
    whole: Vec<Step>,
    from: Vec<(usize, Vec<Step>)>,
    /// the rule's variables, a slot each
    vars: Vec<Sym>,
    /// each premise and negation as patterns over the slots: its book, then its arguments
    pats: Vec<Vec<Pat>>,
    /// each premise whose book is a variable not bound where it is written: it does not range over the kernel's books
    open_book: Vec<bool>,
}

/// An argument of a literal: a value, a variable's slot, or a term with variables inside, matched by unification.
#[derive(Clone, Copy)]
enum Pat {
    Val(Term),
    Slot(usize),
    Open(Term),
}

impl Fired {
    fn new(h: &Heap, r: &Rc<ERule>, heads: &FxSet<Sym>) -> Fired {
        let mut vars: Vec<Sym> = Vec::new();
        for b in &r.plan {
            b.vars(h, &mut vars);
        }
        term_vars(h, r.clause.head.persp, &mut vars);
        for a in &r.clause.head.args {
            term_vars(h, *a, &mut vars);
        }
        let mut seen = FxSet::default();
        vars.retain(|v| seen.insert(*v));
        let pat = |t: Term| match t.kind() {
            TermK::Var(v) => Pat::Slot(vars.iter().position(|x| *x == v).unwrap()),
            _ if h.is_ground(t) => Pat::Val(t),
            _ => Pat::Open(t),
        };
        let pats = r
            .plan
            .iter()
            .map(|b| b.lit().map_or_else(Vec::new, |l| std::iter::once(l.persp).chain(l.args.iter().copied()).map(pat).collect()))
            .collect();
        let from = (0..r.plan.len())
            .filter(|&i| matches!(&r.plan[i], BodyElem::Pos(l) if heads.contains(&l.rel)))
            .map(|i| (i, order(h, r, Some(i))))
            .collect();
        let mut bound: FxSet<Sym> = FxSet::default();
        let mut open_book = Vec::with_capacity(r.plan.len());
        for b in &r.plan {
            let mut vs = Vec::new();
            if let Some(l) = b.lit() {
                term_vars(h, l.persp, &mut vs);
            }
            open_book.push(!h.is_ground(b.lit().map_or(Term::int(0), |l| l.persp)) && !vs.iter().all(|v| bound.contains(v)));
            vs.clear();
            b.vars(h, &mut vs);
            bound.extend(vs);
        }
        Fired { r: r.clone(), whole: order(h, r, None), from, vars, pats, open_book }
    }

    fn subst(&self, b: &[Option<Term>]) -> Subst {
        self.vars.iter().zip(b).filter_map(|(v, t)| t.map(|t| (*v, t))).collect()
    }
}

fn term_vars(h: &Heap, t: Term, out: &mut Vec<Sym>) {
    match t.kind() {
        TermK::Var(v) => out.push(v),
        TermK::Func(i) => {
            for a in h.fargs(i) {
                term_vars(h, *a, out);
            }
        }
        _ => {}
    }
}

/// The order of `r`'s body read from `first` (a premise met by a new fact) or from the start: a negation or a builtin
/// once everything written before it is read, else the premise with the most arguments bound, the first of those.
fn order(h: &Heap, r: &ERule, first: Option<usize>) -> Vec<Step> {
    let plan = &r.plan;
    let mut bound: FxSet<Sym> = FxSet::default();
    let mut placed = vec![false; plan.len()];
    let mut steps = Vec::with_capacity(plan.len());
    let mask_of = |l: &Lit, bound: &FxSet<Sym>| {
        let mut m = 0u64;
        let mut vs = Vec::new();
        term_vars(h, l.persp, &mut vs);
        if vs.iter().all(|v| bound.contains(v)) {
            m |= 1;
        }
        for (i, a) in l.args.iter().enumerate().take(62) {
            vs.clear();
            term_vars(h, *a, &mut vs);
            if vs.iter().all(|v| bound.contains(v)) {
                m |= 1 << (i + 1);
            }
        }
        m
    };
    let place = |k: usize, mask: u64, bound: &mut FxSet<Sym>, placed: &mut Vec<bool>, steps: &mut Vec<Step>| {
        placed[k] = true;
        steps.push(Step { at: k, mask, ix: usize::MAX });
        let mut vs = Vec::new();
        plan[k].vars(h, &mut vs);
        bound.extend(vs);
    };
    if let Some(i) = first {
        place(i, 0, &mut bound, &mut placed, &mut steps);
        steps.clear();
    }
    while placed.iter().any(|p| !p) {
        let filter = (0..plan.len()).find(|&k| !placed[k] && !matches!(plan[k], BodyElem::Pos(_)) && placed[..k].iter().all(|p| *p));
        if let Some(k) = filter {
            let mask = plan[k].lit().map_or(0, |l| mask_of(l, &bound));
            place(k, mask, &mut bound, &mut placed, &mut steps);
            continue;
        }
        let best = (0..plan.len())
            .filter(|&k| !placed[k] && matches!(plan[k], BodyElem::Pos(_)))
            .max_by_key(|&k| (mask_of(plan[k].lit().unwrap(), &bound).count_ones(), std::cmp::Reverse(k)));
        let Some(k) = best else {
            // a negation or builtin before an element not yet read: in the order written
            let k = (0..plan.len()).find(|&k| !placed[k]).unwrap();
            let mask = plan[k].lit().map_or(0, |l| mask_of(l, &bound));
            place(k, mask, &mut bound, &mut placed, &mut steps);
            continue;
        };
        let mask = mask_of(plan[k].lit().unwrap(), &bound);
        place(k, mask, &mut bound, &mut placed, &mut steps);
    }
    steps
}

/// Why the core hands a pass back: a part of the language it does not evaluate yet met on the way.
struct Back;

impl Eval {
    /// Whether the pages core evaluates this pass: a fresh pass of a world whose rules read and conclude plain
    /// relations, by premises, negations and builtins.
    /// What of this pass the pages core does not evaluate yet, if anything.
    fn pages_unfit(&self, rules: &[Rc<ERule>]) -> Option<&'static str> {
        // (a premise of the first tick is read as one of this tick, in the first; a conclusion of the next is staged,
        // its firing the least where the order is not observed)
        let plain = |l: &Lit| l.temporal != Temporal::Next && !self.demand.on(l.rel);
        let head = |l: &Lit| !self.demand.on(l.rel) && (l.temporal == Temporal::Now || l.temporal == Temporal::Next && self.store.unordered);
        let world = [
            (self.mode != Mode::Rounds, "strata"),
            (self.store.tick != 0, "tick"),
            (self.well_founded, "well_founded"),
            (self.lat.has_cells(), "cells"),
            (!self.demand.by_rel.is_empty(), "demand"),
            (self.vc.any, "vclosure"),
            (!self.shrug_readers.is_empty(), "shrug"),
            (!self.store.aliases.is_empty(), "alias"),
            (self.stage_given.is_some(), "stage"),
            (self.meeting.is_some(), "meeting"),
            (self.by_seed, "seed"),
            (self.add.adding, "adding"),
            (self.wall.resume_at.is_some(), "resume"),
            (!self.store.kept_layer.is_empty(), "kept_layer"),
            (self.answer.reads_provenance, "provenance"),
        ];
        if let Some((_, why)) = world.iter().find(|(c, _)| *c) {
            return Some(why);
        }
        for r in rules {
            let why = if r.has_thr {
                "threshold"
            } else if !r.lattice_outer.is_empty() {
                "lattice"
            } else if r.demand_strict {
                "demand"
            } else if !head(&r.clause.head) {
                "temporal"
            } else if !r.plan.iter().all(|b| match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) => plain(l),
                BodyElem::Bi { .. } => true,
                BodyElem::Agg(a) => a.op != AggOp::AtLeast && a.body.iter().flat_map(|b| b.lits_deep()).all(plain),
            }) {
                "temporal"
            } else {
                continue;
            };
            return Some(why);
        }
        None
    }

    /// The pass evaluated by the pages core; false when it handed the pass back, the store as the pass found it.
    /// None: handed back; else the pass's outcome, a wall's included.
    pub(super) fn run_pages(&mut self, rules: &[Rc<ERule>], mono: &[Rc<ERule>], strat: &[Rc<ERule>]) -> Result<Option<Result<(), Halt>>, Halt> {
        if let Some(why) = self.pages_unfit(rules) {
            if let Ok(f) = std::env::var("ROFL_PAGES_LOG") {
                use std::io::Write;
                let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "off {why} {}", rules.len()));
            }
            return Ok(None);
        }
        let Some(comps) = components_by_rel(&self.h, rules) else {
            if let Ok(f) = std::env::var("ROFL_PAGES_LOG") {
                use std::io::Write;
                let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "off neg_cycle {}", rules.len()));
            }
            return Ok(None);
        };
        // (a cell is sealed at the round of each relation it reads: the rounds peeled as the levels peel them)
        if rules.iter().any(|r| r.has_agg) && self.peel_levels(mono, strat).is_err() {
            self.pages_declined = true;
            return Ok(None);
        }
        let out = match self.pages_pass(&comps) {
            Ok(()) => Ok(()),
            Err(Err(e @ Halt::Budget(..))) => Err(e),
            Err(Ok(Back)) => {
                if let Ok(f) = std::env::var("ROFL_PAGES_LOG") {
                    use std::io::Write;
                    let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "off back {}", rules.len()));
                }
                self.pages_declined = true;
                return Ok(None);
            }
            Err(Err(e)) => return Err(e),
        };
        if let Ok(f) = std::env::var("ROFL_PAGES_LOG") {
            use std::io::Write;
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "on {}", rules.len()));
        }
        let mut sorted = rules.to_vec();
        sorted.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        self.active = sorted;
        Ok(Some(out))
    }

    fn pages_pass(&mut self, comps: &[Vec<Rc<ERule>>]) -> Result<(), Result<Back, Halt>> {
        let mut pg = Pages::default();
        let mut read: FxSet<Sym> = FxSet::default();
        let mut fired: Vec<Vec<Fired>> = Vec::with_capacity(comps.len());
        for comp in comps {
            let heads: FxSet<Sym> = comp.iter().map(|r| r.clause.head.rel).collect();
            let mut fs: Vec<Fired> = comp.iter().map(|r| Fired::new(&self.h, r, &heads)).collect();
            for f in &mut fs {
                let r = f.r.clone();
                for st in f.whole.iter_mut().chain(f.from.iter_mut().flat_map(|(_, o)| o.iter_mut())) {
                    if let Some(l) = r.plan[st.at].lit() {
                        read.insert(l.rel);
                        st.ix = pg.want(l.rel, st.mask);
                    }
                }
            }
            fired.push(fs);
        }
        for rel in read {
            let ids = self.store.rel_all(&self.h, rel);
            for id in ids {
                pg.file(&self.h, &self.store, rel, id);
            }
        }
        let mut sc = Scratch::default();
        for fs in &fired {
            let mut news = Front::default();
            for f in fs {
                self.pages_fire(&pg, f, None, &mut sc, &mut news)?;
            }
            loop {
                let mut fresh: Vec<FactId> = news.keys.iter().copied().collect();
                fresh.sort_unstable();
                for &id in &fresh {
                    let rel = self.store.rec(id).rel;
                    pg.file(&self.h, &self.store, rel, id);
                }
                self.peak_rows = self.peak_rows.max(fresh.len() as i64);
                let cur = std::mem::take(&mut news);
                if cur.keys.is_empty() {
                    break;
                }
                let by_rel: FxMap<Sym, Vec<FactId>> = cur
                    .by_rel
                    .iter()
                    .map(|(rel, ids)| {
                        let mut ids: Vec<FactId> = ids.iter().copied().collect();
                        ids.sort_unstable();
                        (*rel, ids)
                    })
                    .collect();
                for f in fs {
                    for (i, _) in &f.from {
                        let BodyElem::Pos(l) = &f.r.plan[*i] else { continue };
                        let Some(ids) = by_rel.get(&l.rel) else { continue };
                        for &id in ids {
                            self.pages_fire(&pg, f, Some((*i, id)), &mut sc, &mut news)?;
                        }
                    }
                }
            }
        }
        // what a fault or an unknown left to be carried to its readers is carried by the levels
        if !self.lat.pass.plain_pending.is_empty() || !self.lat.pass.plain_undecided.is_empty() || !self.lat.carry.undecided.is_empty() {
            return Err(Ok(Back));
        }
        Ok(())
    }

    /// `f` fired whole, or from one new fact at premise `at`, its conclusions concluded into `news`.
    fn pages_fire(&mut self, pg: &Pages, f: &Fired, at: Option<(usize, FactId)>, sc: &mut Scratch, news: &mut Front) -> Result<(), Result<Back, Halt>> {
        let r = &f.r;
        let (b, trail, prems) = (&mut sc.b, &mut sc.trail, &mut sc.prems);
        b.clear();
        b.resize(f.vars.len(), None);
        trail.clear();
        prems.clear();
        prems.resize(r.plan.len(), PremRef::Bi(0));
        let steps = match at {
            None => &f.whole[..],
            Some((i, id)) => {
                if !self.pages_meet(pg, f, i, id, b, trail) {
                    return Ok(());
                }
                prems[i] = PremRef::Fact(id);
                &f.from.iter().find(|(k, _)| *k == i).unwrap().1[..]
            }
        };
        *self.cost.fires_by_rule.entry(r.id).or_insert(0) += 1;
        let fresh0 = news.keys.len();
        if at.is_none() {
            let n = self.cost.activation_by_rule.len() as u64 + 1;
            self.cost.activation_by_rule.entry(r.id).or_insert(n);
        }
        let outer = self.cur_rule.replace(r.id);
        let was = std::mem::replace(&mut self.firing, true);
        let done = self.pages_solve(pg, f, steps, b, trail, prems, news);
        // (what the firing wrote of itself, a sealed cell's reflection, is news too)
        for (rel, ids) in std::mem::take(&mut self.cur_front).by_rel {
            for id in ids {
                news.note(rel, id);
            }
        }
        let (n, i) = std::mem::take(&mut self.pages_widest);
        if let Some(l) = r.plan.get(i).and_then(|b| b.lit()).filter(|_| n > 0) {
            // (the reads of a firing counted as one, its widest)
            self.cost.read_rows -= n as u64;
            self.note_read(l, &Subst::new(), n);
        }
        if at.is_none() {
            self.cost.fresh_whole_by_rule.entry(r.id).or_insert((news.keys.len() - fresh0) as u64);
        }
        self.firing = was;
        self.cur_rule = outer;
        done
    }

    /// Whether fact `id` meets premise `i` of `f` under the slots `b`, binding the slots it fills (noted on `trail`).
    #[allow(clippy::too_many_arguments)]
    fn pages_meet(&self, pg: &Pages, f: &Fired, i: usize, id: FactId, b: &mut [Option<Term>], trail: &mut Vec<usize>) -> bool {
        let mark = trail.len();
        let pats = &f.pats[i];
        let row = pg.row(id);
        if f.open_book[i] && !pg.kernel.is_empty() && pg.kernel.contains(&row[0].as_atom().unwrap()) {
            return false;
        }
        let ok = pats.len() == row.len()
            && row.iter().copied().zip(pats).all(|(v, p)| match *p {
                Pat::Val(c) => c == v,
                Pat::Slot(k) => match b[k] {
                    Some(x) => x == v,
                    None => {
                        b[k] = Some(v);
                        trail.push(k);
                        true
                    }
                },
                Pat::Open(t) => {
                    let s = f.subst(b);
                    match unify(&self.h, t, v, &s) {
                        Some(s2) => {
                            for (k, var) in f.vars.iter().enumerate() {
                                if b[k].is_none() {
                                    let w = walk(&self.h, Term::var(*var), &s2);
                                    if self.h.is_ground(w) {
                                        b[k] = Some(w);
                                        trail.push(k);
                                    }
                                }
                            }
                            true
                        }
                        None => false,
                    }
                }
            });
        if !ok {
            undo(b, trail, mark);
        }
        ok
    }

    /// The key premise `i` of `f` is asked by under `b`, by the arguments `mask` names bound.
    fn pages_key(&mut self, f: &Fired, i: usize, mask: u64, b: &[Option<Term>]) -> u64 {
        let mut key = KeyHash::default();
        for (j, p) in f.pats[i].iter().enumerate() {
            if mask >> j & 1 != 0 {
                key.add(match *p {
                    Pat::Val(c) => c,
                    Pat::Slot(k) => b[k].unwrap(),
                    Pat::Open(t) => resolve(&mut self.h, t, &f.subst(b)),
                });
            }
        }
        key.0
    }

    #[allow(clippy::too_many_arguments)]
    fn pages_solve(&mut self, pg: &Pages, f: &Fired, steps: &[Step], b: &mut Vec<Option<Term>>, trail: &mut Vec<usize>, prems: &mut Vec<PremRef>, news: &mut Front) -> Result<(), Result<Back, Halt>> {
        let r = &f.r;
        let Some((st, rest)) = steps.split_first() else {
            let s = f.subst(b);
            let mut ps = Vec::with_capacity(prems.len());
            for (j, p) in prems.iter().enumerate() {
                ps.push(self.record_prem(&r.plan[j], *p, &s));
            }
            return self.conclude(r, Sol { s, prems: ps }, news).map_err(Err);
        };
        let i = st.at;
        let mark = trail.len();
        match &r.plan[i] {
            BodyElem::Pos(l) => {
                let key = self.pages_key(f, i, st.mask, b);
                let under = pg.under(l.rel, st.ix, key);
                self.cost.read_rows += under.len() as u64;
                if under.len() > self.pages_widest.0 {
                    self.pages_widest = (under.len(), i);
                }
                for &id in under {
                    if self.pages_meet(pg, f, i, id, b, trail) {
                        prems[i] = PremRef::Fact(id);
                        let done = self.pages_solve(pg, f, rest, b, trail, prems, news);
                        undo(b, trail, mark);
                        done?;
                    }
                }
                Ok(())
            }
            BodyElem::Neg(l) => {
                let key = self.pages_key(f, i, st.mask, b);
                for &id in pg.under(l.rel, st.ix, key) {
                    if self.pages_meet(pg, f, i, id, b, trail) {
                        undo(b, trail, mark);
                        return Ok(());
                    }
                }
                prems[i] = PremRef::Neg(0);
                self.pages_solve(pg, f, rest, b, trail, prems, news)
            }
            BodyElem::Bi { op, l, r: rr } => {
                let faults = self.fault_count;
                let s = f.subst(b);
                let s2s = self.eval_builtins(*op, *l, *rr, &s, Some(r.id)).map_err(Err)?;
                if self.fault_count > faults {
                    return Err(Ok(Back));
                }
                for s2 in s2s {
                    for (k, var) in f.vars.iter().enumerate() {
                        if b[k].is_none() {
                            let w = resolve(&mut self.h, Term::var(*var), &s2);
                            if self.h.is_ground(w) {
                                b[k] = Some(w);
                                trail.push(k);
                            }
                        }
                    }
                    prems[i] = PremRef::Bi(0);
                    let done = self.pages_solve(pg, f, rest, b, trail, prems, news);
                    undo(b, trail, mark);
                    done?;
                }
                Ok(())
            }
            BodyElem::Agg(ag) => {
                // (an aggregate reads relations closed below: it is solved over the store, as any pass solves it)
                let a = Sol { s: f.subst(b), prems: prems.clone() };
                let mut next = Vec::new();
                self.solve_agg(ag, &a, i, 0, Some(r.id), &mut next).map_err(Err)?;
                for sol in next {
                    for (k, var) in f.vars.iter().enumerate() {
                        if b[k].is_none() {
                            let w = resolve(&mut self.h, Term::var(*var), &sol.s);
                            if self.h.is_ground(w) {
                                b[k] = Some(w);
                                trail.push(k);
                            }
                        }
                    }
                    prems[i] = *sol.prems.last().unwrap();
                    let done = self.pages_solve(pg, f, rest, b, trail, prems, news);
                    undo(b, trail, mark);
                    done?;
                }
                Ok(())
            }
        }
    }
}

#[derive(Default)]
struct Scratch {
    b: Vec<Option<Term>>,
    trail: Vec<usize>,
    prems: Vec<PremRef>,
}

fn undo(b: &mut [Option<Term>], trail: &mut Vec<usize>, mark: usize) {
    for k in trail.drain(mark..) {
        b[k] = None;
    }
}

/// The rules by the strongly connected components of the relations they conclude, each after those it reads; None
/// when a negation reads inside its own component.
fn components_by_rel(h: &Heap, rules: &[Rc<ERule>]) -> Option<Vec<Vec<Rc<ERule>>>> {
    let mut heads: Vec<Sym> = rules.iter().map(|r| r.clause.head.rel).collect();
    heads.sort_unstable();
    heads.dedup();
    let at: FxMap<Sym, usize> = heads.iter().enumerate().map(|(i, h)| (*h, i)).collect();
    let n = heads.len();
    let mut reads: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut strict: Vec<(usize, usize)> = Vec::new();
    // a cell an aggregate seals is reflected in the kernel's books: a rule that reads them comes after every rule
    // that aggregates
    let sealers: Vec<usize> = rules.iter().filter(|r| r.has_agg).map(|r| at[&r.clause.head.rel]).collect();
    for r in rules {
        if r.plan.iter().flat_map(|b| b.lits_deep()).any(|l| l.persp.as_atom().is_some_and(|p| is_kernel_ledger(h, p))) {
            reads[at[&r.clause.head.rel]].extend(&sealers);
        }
    }
    for r in rules {
        let h = at[&r.clause.head.rel];
        for b in &r.plan {
            for l in b.lits_deep() {
                if let Some(&k) = at.get(&l.rel) {
                    reads[h].push(k);
                    if !matches!(b, BodyElem::Pos(_)) {
                        strict.push((h, k));
                    }
                }
            }
        }
    }
    let comp = tarjan(&reads);
    if strict.iter().any(|(h, k)| comp[*h] == comp[*k]) {
        return None;
    }
    let ncomp = comp.iter().copied().max().map_or(0, |m| m + 1);
    let mut out: Vec<Vec<Rc<ERule>>> = vec![Vec::new(); ncomp];
    for r in rules {
        out[comp[at[&r.clause.head.rel]]].push(r.clone());
    }
    for c in &mut out {
        c.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
    }
    Some(out)
}

/// Tarjan's components, numbered so that a component comes after every one it reads.
fn tarjan(reads: &[Vec<usize>]) -> Vec<usize> {
    let n = reads.len();
    let (mut index, mut low, mut on) = (vec![usize::MAX; n], vec![0; n], vec![false; n]);
    let (mut stack, mut comp, mut next, mut ncomp) = (Vec::new(), vec![usize::MAX; n], 0, 0);
    for v0 in 0..n {
        if index[v0] != usize::MAX {
            continue;
        }
        let mut work: Vec<(usize, usize)> = vec![(v0, 0)];
        while let Some((v, e)) = work.pop() {
            if e == 0 {
                index[v] = next;
                low[v] = next;
                next += 1;
                stack.push(v);
                on[v] = true;
            }
            if let Some(&w) = reads[v].get(e) {
                work.push((v, e + 1));
                if index[w] == usize::MAX {
                    work.push((w, 0));
                } else if on[w] {
                    low[v] = low[v].min(index[w]);
                }
                continue;
            }
            if low[v] == index[v] {
                loop {
                    let w = stack.pop().unwrap();
                    on[w] = false;
                    comp[w] = ncomp;
                    if w == v {
                        break;
                    }
                }
                ncomp += 1;
            }
            if let Some(&(u, _)) = work.last() {
                low[u] = low[u].min(low[v]);
            }
        }
    }
    comp
}
