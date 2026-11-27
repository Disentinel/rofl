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
    /// the books that are the kernel's ledgers, which a book left open does not range over
    kernel: FxSet<Sym>,
    all: FxMap<Sym, Vec<FactId>>,
    /// the facts of a relation by the hash of the values a key binds: what a hash shares by chance a meeting drops
    ix: Vec<FxMap<u64, Ids>>,
    ix_of: FxMap<(Sym, u64), usize>,
    masks: FxMap<Sym, Vec<(u64, usize)>>,
    /// the round of news each fact came in, by its id (`NO_ROW` for a fact not filed), and the round being met
    news_of: Vec<u32>,
    round: u32,
    /// the round's news by relation
    news: FxMap<Sym, Vec<FactId>>,
    /// AN EDIT: facts filed that died are skipped; the facts a negation meets as news, by relation; whether a firing
    /// found is withdrawn instead of concluded (and a negation met as news is not asked again), and those withdrawn
    edit: bool,
    neg_news: FxMap<Sym, Vec<FactId>>,
    withdraw: bool,
    withdrawn: std::cell::RefCell<Vec<(FactId, Sym, Vec<PremRef>)>>,
    /// the facts the news filed, in an edit
    made: Vec<FactId>,
}

const NO_ROW: u32 = u32::MAX;

impl Pages {
    fn key_of(persp: Sym, args: &[Term], mask: u64) -> u64 {
        let mut k = KeyHash::default();
        for (j, t) in std::iter::once(Term::atom(persp)).chain(args.iter().copied()).enumerate() {
            if mask >> j & 1 != 0 {
                k.add(t);
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
        if self.news_of.len() <= id as usize {
            self.news_of.resize(id as usize + 1, NO_ROW);
        }
        let filed = self.news_of[id as usize] != NO_ROW;
        self.news_of[id as usize] = self.round;
        if filed {
            return;
        }
        let persp = store.rec(id).persp;
        if is_kernel_ledger(h, persp) {
            self.kernel.insert(persp);
        }
        self.all.entry(rel).or_default().push(id);
        if let Some(ms) = self.masks.get(&rel) {
            let args = store.args(id);
            for &(m, x) in ms {
                match self.ix[x].entry(Self::key_of(persp, args, m)) {
                    std::collections::hash_map::Entry::Vacant(e) => {
                        e.insert(Ids::One(id));
                    }
                    std::collections::hash_map::Entry::Occupied(mut e) => {
                        let v = e.get_mut();
                        if let Ids::One(x) = *v {
                            *v = Ids::Many(vec![x]);
                        }
                        let Ids::Many(xs) = v else { unreachable!() };
                        xs.push(id);
                    }
                }
            }
        }
    }

    fn under(&self, rel: Sym, ix: usize, key: u64) -> &[FactId] {
        if ix == usize::MAX {
            return self.all.get(&rel).map_or(&[][..], |v| &v[..]);
        }
        match self.ix[ix].get(&key) {
            None => &[],
            Some(Ids::One(x)) => std::slice::from_ref(x),
            Some(Ids::Many(xs)) => xs,
        }
    }
}

/// The facts under one key: most keys hold one.
enum Ids {
    One(FactId),
    Many(Vec<FactId>),
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
    /// a premise written before the one a new fact met: it reads only the facts older than this round's news, so
    /// that a conclusion of two new facts is found once
    old: bool,
    /// the premise the round's news meets: it reads only the news
    news: bool,
}

/// A rule and the orders its body is read in: whole, and from a new fact at each premise.
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
    /// each premise and negation on a closure answered from its trees: the closure
    closure: Vec<Option<usize>>,
    /// solved without writing (`pure`), so on the threads
    pure: bool,
}

/// A firing of a round: a rule fired whole or from its news at one premise, or a reader of a closure, fired as
/// its closure's news asks.
enum Task<'a> {
    Fire(&'a Fired, Option<usize>),
    Rule(&'a Fired),
}

/// An argument of a literal: a value, a variable's slot, or a term with variables inside, matched by unification.
#[derive(Clone, Copy)]
enum Pat {
    Val(Term),
    Slot(usize),
    Open(Term),
}

impl Fired {
    fn new(h: &Heap, r: &Rc<ERule>) -> Fired {
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
            .filter(|&i| matches!(&r.plan[i], BodyElem::Pos(_) | BodyElem::Neg(_)))
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
        Fired { r: r.clone(), whole: order(h, r, None), from, vars, pats, open_book, closure: Vec::new(), pure: false }
    }

    fn steps(&self, at: Option<usize>) -> &[Step] {
        match at {
            None => &self.whole[..],
            Some(i) => &self.from.iter().find(|(k, _)| *k == i).unwrap().1[..],
        }
    }

    fn subst(&self, b: &[Option<Term>]) -> Subst {
        self.vars.iter().zip(b).filter_map(|(v, t)| t.map(|t| (*v, t))).collect()
    }
}

/// Whether ground `v` has the shape of `t`, binding the slots of `t`'s variables it fills.
fn match_open(h: &Heap, t: Term, v: Term, vars: &[Sym], b: &mut [Option<Term>], trail: &mut Vec<usize>) -> bool {
    match t.kind() {
        TermK::Var(x) => {
            let k = vars.iter().position(|y| *y == x).unwrap();
            match b[k] {
                Some(w) => w == v,
                None => {
                    b[k] = Some(v);
                    trail.push(k);
                    true
                }
            }
        }
        TermK::Func(i) => match v.kind() {
            TermK::Func(j) if h.fname(i) == h.fname(j) => {
                let (ta, va) = (h.fargs(i), h.fargs(j));
                ta.len() == va.len() && ta.iter().zip(va).all(|(a, c)| match_open(h, *a, *c, vars, b, trail))
            }
            _ => false,
        },
        _ => t == v,
    }
}

/// The ground term `t` is under the slots, if one was ever built; none means no fact holds it.
fn build_open(h: &Heap, t: Term, vars: &[Sym], b: &[Option<Term>]) -> Option<Term> {
    match t.kind() {
        TermK::Var(x) => b[vars.iter().position(|y| *y == x).unwrap()],
        TermK::Func(i) if !h.is_ground(t) => {
            let args = h.fargs(i).iter().map(|a| build_open(h, *a, vars, b)).collect::<Option<Vec<_>>>()?;
            h.find_f(h.fname(i), &args)
        }
        _ => Some(t),
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

/// The order of `r`'s body read, and the arguments bound at each premise: as written, but that a premise sharing no
/// variable with what is bound waits for one that binds it. Met from a new fact at `first`, the premises written
/// before it read only what is older.
fn order(h: &Heap, r: &ERule, first: Option<usize>) -> Vec<Step> {
    let mut bound: FxSet<Sym> = FxSet::default();
    let mut steps = Vec::with_capacity(r.plan.len());
    let mut vs = Vec::new();
    // (a premise sharing no variable with what is bound is held until something binds one, as the plain planner holds it)
    let mut seq = plan_order_with(h, &[], &r.plan, &[], &[], Hold::Cross).0;
    if seq.len() != r.plan.len() {
        seq = (0..r.plan.len()).collect();
    }
    for k in seq {
        let b = &r.plan[k];
        let mut mask = 0u64;
        if let Some(l) = b.lit() {
            for (j, t) in std::iter::once(l.persp).chain(l.args.iter().copied()).enumerate().take(63) {
                vs.clear();
                term_vars(h, t, &mut vs);
                if vs.iter().all(|v| bound.contains(v)) {
                    mask |= 1 << j;
                }
            }
        }
        steps.push(Step { at: k, mask, ix: usize::MAX, old: first.is_some_and(|i| k < i), news: first == Some(k) });
        vs.clear();
        b.vars(h, &mut vs);
        bound.extend(vs.iter().copied());
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
            } else if !head(&r.clause.head)
                || !r.plan.iter().all(|b| match b {
                    BodyElem::Pos(l) | BodyElem::Neg(l) => plain(l),
                    BodyElem::Bi { .. } => true,
                    BodyElem::Agg(a) => a.op != AggOp::AtLeast && a.body.iter().flat_map(|b| b.lits_deep()).all(plain),
                })
            {
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
        // THE ROUNDS ARE THE LEVELS' OWN: peeled by book, a negation or an aggregate reading a round below its own
        if self.peel_levels(mono, strat).is_err() || !self.ds.comps.is_empty() {
            if let Ok(f) = std::env::var("ROFL_PAGES_LOG") {
                use std::io::Write;
                let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "off rounds {}", rules.len()));
            }
            self.pages_declined = true;
            return Ok(None);
        }
        let mut by_round: std::collections::BTreeMap<u32, Vec<Rc<ERule>>> = Default::default();
        for r in rules {
            let k = if r.clause.head.temporal == Temporal::Next { u32::MAX } else { self.round_of.get(&self.books.head(&r.clause.head)).copied().unwrap_or(0) };
            by_round.entry(k).or_default().push(r.clone());
        }
        // A CLOSURE ANSWERED FROM ITS TREE is not fired: its rows are read from the tree, its readers fired whole again
        // when its edges have news
        if self.vc.any {
            for rs in by_round.values_mut() {
                rs.retain(|r| !self.vc.skip.get(&r.id).is_some_and(|&ci| self.vc.vclosures[ci].active));
            }
        }
        let rounds: Vec<u32> = by_round.keys().copied().collect();
        let comps: Vec<Vec<Rc<ERule>>> = by_round
            .into_values()
            .map(|mut c| {
                c.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
                c
            })
            .collect();
        let t0 = std::time::Instant::now();
        let out = match self.pages_pass(&comps, &rounds) {
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
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "on {} {:?}", rules.len(), t0.elapsed()));
        }
        let mut sorted = rules.to_vec();
        sorted.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        self.active = sorted;
        Ok(Some(out))
    }

    fn pages_pass(&mut self, comps: &[Vec<Rc<ERule>>], rounds: &[u32]) -> Result<(), Result<Back, Halt>> {
        let (mut pg, fired) = self.pages_build(comps);
        let mut sc = Scratch::default();
        // (news meets every rule fired so far, as the levels deliver it to every rule active)
        for (k, fs) in fired.iter().enumerate() {
            // a nearest answers from the round of its step on, which negates its condition
            if self.vc.any {
                let k = rounds[k];
                self.vopen_where(&|e, r| e.round_of.get(&e.books.head(&r.clause.head)).copied().unwrap_or(0) <= k);
            }
            let mut news = Front::default();
            let tasks: Vec<Task> = fs.iter().map(|f| Task::Fire(f, None)).collect();
            self.pages_round(&pg, &tasks, None, &mut sc, &mut news)?;
            self.pages_news(&mut pg, &fired[..=k], &mut sc, news)?;
        }
        // what a fault or an unknown left to be carried to its readers is carried by the levels
        if !self.lat.pass.plain_pending.is_empty() || !self.lat.pass.plain_undecided.is_empty() || !self.lat.carry.undecided.is_empty() {
            return Err(Ok(Back));
        }
        Ok(())
    }

    /// The pages of the facts `comps` read, and each rule as it fires.
    fn pages_build(&mut self, comps: &[Vec<Rc<ERule>>]) -> (Pages, Vec<Vec<Fired>>) {
        let mut pg = Pages::default();
        let mut read: FxSet<Sym> = FxSet::default();
        let mut fired: Vec<Vec<Fired>> = Vec::with_capacity(comps.len());
        for comp in comps {
            let mut fs: Vec<Fired> = comp
                .iter()
                .map(|r| {
                    let mut f = Fired::new(&self.h, r);
                    f.closure = r.plan.iter().map(|b| b.lit().and_then(|l| self.vc.vclosure_for(l.rel))).collect();
                    f.pure = pure(&self.h, &self.v, &f);
                    f
                })
                .collect();
            for f in &mut fs {
                let r = f.r.clone();
                for st in f.whole.iter_mut().chain(f.from.iter_mut().flat_map(|(_, o)| o.iter_mut())) {
                    if let Some(l) = r.plan[st.at].lit() {
                        read.insert(l.rel);
                        st.ix = pg.want(l.rel, st.mask);
                    }
                }
                // (a negation met by an edit's news is asked whole)
                for b in &r.plan {
                    if let BodyElem::Neg(l) = b {
                        pg.want(l.rel, (1u64 << (l.args.len() + 1).min(63)) - 1);
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
        (pg, fired)
    }

    /// `news` to its fixpoint, each round of it meeting `rules` at each premise that reads it.
    fn pages_news(&mut self, pg: &mut Pages, rules: &[Vec<Fired>], sc: &mut Scratch, mut news: Front) -> Result<(), Result<Back, Halt>> {
        loop {
            let mut fresh: Vec<FactId> = news.keys.iter().copied().collect();
            fresh.sort_unstable();
            pg.round += 1;
            for &id in &fresh {
                let rel = self.store.rec(id).rel;
                pg.file(&self.h, &self.store, rel, id);
            }
            if pg.edit {
                pg.made.extend_from_slice(&fresh);
            }
            self.peak_rows = self.peak_rows.max(fresh.len() as i64);
            let cur = std::mem::take(&mut news);
            if cur.keys.is_empty() {
                return Ok(());
            }
            pg.news = cur
                .by_rel
                .iter()
                .map(|(rel, ids)| {
                    let mut ids: Vec<FactId> = ids.iter().copied().collect();
                    ids.sort_unstable();
                    (*rel, ids)
                })
                .collect();
            let pg = &*pg;
            let mut tasks = Vec::new();
            for f in rules.iter().flatten() {
                if self.vc.readers.contains_key(&f.r.id) {
                    tasks.push(Task::Rule(f));
                    continue;
                }
                for (i, _) in &f.from {
                    if matches!(&f.r.plan[*i], BodyElem::Pos(l) if pg.news.contains_key(&l.rel)) {
                        tasks.push(Task::Fire(f, Some(*i)));
                    }
                }
            }
            self.pages_round(pg, &tasks, Some(&cur), sc, &mut news)?;
        }
    }

    fn pages_rule(&mut self, pg: &Pages, f: &Fired, due: bool, sc: &mut Scratch, news: &mut Front) -> Result<(), Result<Back, Halt>> {
        if due {
            return self.pages_fire(pg, f, None, None, sc, news);
        }
        for (i, _) in &f.from {
            if matches!(&f.r.plan[*i], BodyElem::Pos(l) if pg.news.contains_key(&l.rel)) {
                self.pages_fire(pg, f, Some(*i), None, sc, news)?;
            }
        }
        Ok(())
    }

    /// A round's firings, the pure ones solved first on the threads, then concluded in their order with the rest.
    fn pages_round(&mut self, pg: &Pages, tasks: &[Task], cur: Option<&Front>, sc: &mut Scratch, news: &mut Front) -> Result<(), Result<Back, Halt>> {
        let ro: Vec<usize> = (0..tasks.len()).filter(|&k| matches!(tasks[k], Task::Fire(f, _) if f.pure && !self.vc.readers.contains_key(&f.r.id))).collect();
        let wide = !pg.edit && ro.len() > 1;
        let read = par::Read((&self.h, &self.v, &self.store, pg, tasks, &ro));
        let mut found: Vec<Option<Found>> = par::spread(self.par.threads, if wide { ro.len() } else { 0 }, wide, |k| {
            let &(h, v, store, pg, tasks, ro) = read.get();
            let Task::Fire(f, at) = tasks[ro[k]] else { unreachable!() };
            let mut out = Found::default();
            let (mut b, mut trail, mut prems) = (vec![None; f.vars.len()], Vec::new(), vec![PremRef::Bi(0); f.r.plan.len()]);
            solve_ro(h, v, store, pg, f, f.steps(at), &mut b, &mut trail, &mut prems, &mut out);
            Some(out)
        });
        found.reverse();
        for (k, t) in tasks.iter().enumerate() {
            match *t {
                Task::Fire(f, at) => {
                    let fd = if wide && ro.binary_search(&k).is_ok() { found.pop().unwrap() } else { None };
                    self.pages_fire(pg, f, at, fd, sc, news)?;
                }
                Task::Rule(f) => {
                    let due = self.vc.any && self.vc.vreader_due(&self.store, &f.r, cur.unwrap());
                    self.pages_rule(pg, f, due, sc, news)?;
                }
            }
        }
        Ok(())
    }

    /// `f` fired whole, or from one new fact at premise `at`, its conclusions concluded into `news`.
    fn pages_fire(&mut self, pg: &Pages, f: &Fired, at: Option<usize>, found: Option<Found>, sc: &mut Scratch, news: &mut Front) -> Result<(), Result<Back, Halt>> {
        let r = &f.r;
        let (b, trail, prems) = (&mut sc.b, &mut sc.trail, &mut sc.prems);
        b.clear();
        b.resize(f.vars.len(), None);
        trail.clear();
        prems.clear();
        prems.resize(r.plan.len(), PremRef::Bi(0));
        let steps = f.steps(at);
        *self.cost.fires_by_rule.entry(r.id).or_insert(0) += 1;
        let fresh0 = news.keys.len();
        if at.is_none() {
            if self.vc.any {
                self.vc.vreader_fired(&self.store, r);
            }
            let n = self.cost.activation_by_rule.len() as u64 + 1;
            self.cost.activation_by_rule.entry(r.id).or_insert(n);
        }
        let outer = self.cur_rule.replace(r.id);
        let was = std::mem::replace(&mut self.firing, true);
        let done = match found {
            None => self.pages_solve(pg, f, steps, b, trail, prems, news),
            Some(fd) => {
                self.cost.read_rows += fd.read;
                self.pages_widest = fd.widest;
                fd.sols.iter().try_for_each(|(b, ps)| self.pages_leaf(pg, f, b, ps, news))
            }
        };
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

    /// An instance found: concluded, or in an edit's withdrawing withdrawn.
    fn pages_leaf(&mut self, pg: &Pages, f: &Fired, b: &[Option<Term>], prems: &[PremRef], news: &mut Front) -> Result<(), Result<Back, Halt>> {
        let r = &f.r;
        let s = f.subst(b);
        let mut ps = Vec::with_capacity(prems.len());
        for (j, p) in prems.iter().enumerate() {
            ps.push(self.record_prem(&r.plan[j], *p, &s));
        }
        if pg.withdraw {
            let head = &r.clause.head;
            let persp = walk(&self.h, head.persp, &s).as_atom();
            let args: Vec<Term> = head.args.iter().map(|a| resolve(&mut self.h, *a, &s)).collect();
            if let Some(y) = persp.and_then(|p| self.store.get(head.rel, p, &args)) {
                pg.withdrawn.borrow_mut().push((y, r.id, ps));
            }
            return Ok(());
        }
        self.conclude(r, Sol { s, prems: ps }, news).map_err(Err)
    }

    #[allow(clippy::too_many_arguments)]
    fn pages_solve(&mut self, pg: &Pages, f: &Fired, steps: &[Step], b: &mut Vec<Option<Term>>, trail: &mut Vec<usize>, prems: &mut Vec<PremRef>, news: &mut Front) -> Result<(), Result<Back, Halt>> {
        let r = &f.r;
        let Some((st, rest)) = steps.split_first() else {
            return self.pages_leaf(pg, f, b, prems, news);
        };
        let i = st.at;
        let mark = trail.len();
        match &r.plan[i] {
            BodyElem::Pos(l) if f.closure[i].is_some() => {
                let ci = f.closure[i].unwrap();
                let found = self.vmatch(ci, l, &f.subst(b));
                for (s2, pr) in found {
                    for (k, var) in f.vars.iter().enumerate() {
                        if b[k].is_none() {
                            let w = resolve(&mut self.h, Term::var(*var), &s2);
                            if self.h.is_ground(w) {
                                b[k] = Some(w);
                                trail.push(k);
                            }
                        }
                    }
                    prems[i] = pr;
                    let done = self.pages_solve(pg, f, rest, b, trail, prems, news);
                    undo(b, trail, mark);
                    done?;
                }
                Ok(())
            }
            BodyElem::Pos(l) => {
                let key = key(&self.h, f, i, st.mask, b);
                let under = if st.news && st.mask == 0 { pg.news.get(&l.rel).map_or(&[][..], |v| &v[..]) } else { pg.under(l.rel, st.ix, key) };
                self.cost.read_rows += under.len() as u64;
                if under.len() > self.pages_widest.0 {
                    self.pages_widest = (under.len(), i);
                }
                for &id in under {
                    if (st.old || st.news) && (pg.news_of[id as usize] == pg.round) != st.news || pg.edit && !self.store.alive(id) {
                        continue;
                    }
                    if meet(&self.h, &self.store, pg, f, i, id, b, trail) {
                        prems[i] = PremRef::Fact(id);
                        let done = self.pages_solve(pg, f, rest, b, trail, prems, news);
                        undo(b, trail, mark);
                        done?;
                    }
                }
                Ok(())
            }
            BodyElem::Neg(l) if f.closure[i].is_some() => {
                let ci = f.closure[i].unwrap();
                if !self.vmatch(ci, l, &f.subst(b)).is_empty() {
                    return Ok(());
                }
                prems[i] = PremRef::Neg(0);
                self.pages_solve(pg, f, rest, b, trail, prems, news)
            }
            BodyElem::Neg(l) if st.news => {
                // (a fact an edit added or took out, met where the negation is written: a firing it blocks is
                // withdrawn, one it lets through is found)
                for &id in pg.neg_news.get(&l.rel).map_or(&[][..], |v| &v[..]) {
                    if meet(&self.h, &self.store, pg, f, i, id, b, trail) {
                        let done = if pg.withdraw || !held(&self.h, &self.store, pg, f, i, b, trail) {
                            prems[i] = PremRef::Neg(0);
                            self.pages_solve(pg, f, rest, b, trail, prems, news)
                        } else {
                            Ok(())
                        };
                        undo(b, trail, mark);
                        done?;
                    }
                }
                Ok(())
            }
            BodyElem::Neg(_) => {
                if held(&self.h, &self.store, pg, f, i, b, trail) {
                    return Ok(());
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

impl Eval {
    /// AN EDIT BY THE FIRINGS KEPT: the base facts `added` (put in) and `removed` (taken out) worked into an evaluated
    /// world, round by round, lowest first. What rests on a fact taken out may go; of it, what still has a firing on
    /// what stands stays, found over the firings the store keeps, so no rule fires again for it and a circle of facts
    /// that hold each other up goes once the firing under it went; the rest is taken out. A fact an edit put in, or
    /// that a rule now concludes, is news; it withdraws the firings its negation let through; one taken out for good
    /// lets through the firings its negation blocked. Whether the core works an edit of this
    /// world out, decided before the store is touched:
    pub(super) fn pages_edits(&mut self) -> bool {
        let rules: Vec<Rc<ERule>> = self.rules.iter().filter(|r| r.safe).cloned().collect();
        !(self.pages_unfit(&rules).is_some()
            || self.prov.no_witness
            || self.vc.any
            || !self.store.virtuals.is_empty()
            || !self.clo.closures.is_empty()
            || rules.iter().any(|r| r.has_agg || r.clause.head.temporal == Temporal::Next)
            || self.peel_levels(&[], &[]).is_err()
            || !self.ds.comps.is_empty())
    }

    /// `added` and `removed` worked in, as `pages_edits` said the core can.
    pub(super) fn pages_delta(&mut self, added: &[FactId], removed: &[FactId]) -> Result<AddDelta, String> {
        let rules: Vec<Rc<ERule>> = self.rules.iter().filter(|r| r.safe).cloned().collect();
        let mut by_round: std::collections::BTreeMap<u32, Vec<Rc<ERule>>> = Default::default();
        for r in &rules {
            by_round.entry(self.round_of.get(&self.books.head(&r.clause.head)).copied().unwrap_or(0)).or_default().push(r.clone());
        }
        let index: FxMap<u32, usize> = by_round.keys().enumerate().map(|(i, k)| (*k, i)).collect();
        let comps: Vec<Vec<Rc<ERule>>> = by_round.into_values().collect();
        let n = comps.len();
        if !self.store.has_citers() {
            self.store.index_citers();
        }
        let round = |e: &Eval, id: FactId| {
            let r = e.store.rec(id);
            e.round_of.get(&e.books.fact(r.rel, r.persp)).and_then(|k| index.get(k)).copied().unwrap_or(0)
        };
        if let Ok(f) = std::env::var("ROFL_PAGES_LOG") {
            use std::io::Write;
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(f).and_then(|mut f| writeln!(f, "edit {} {}", added.len(), removed.len()));
        }
        let (mut pg, fired) = self.pages_build(&comps);
        pg.edit = true;
        // (what was taken out is met where a negation reads it, so it is filed though dead)
        for &x in removed {
            let rel = self.store.rec(x).rel;
            if pg.masks.contains_key(&rel) || pg.all.contains_key(&rel) {
                pg.file(&self.h, &self.store, rel, x);
            }
        }
        let mut sc = Scratch::default();
        let mut d = AddDelta { facts: added.len(), ..AddDelta::default() };
        // what came and what went for good, below the round at hand; the facts of each round that lost a firing
        let mut came: Vec<FactId> = added.to_vec();
        let mut went: Vec<FactId> = removed.to_vec();
        let mut lost: Vec<FxSet<FactId>> = vec![FxSet::default(); n];
        for &x in removed {
            for y in self.store.citers_one(x) {
                if self.store.alive(y) {
                    lost[round(self, y)].insert(y);
                }
            }
        }
        let mut gone: FxSet<FactId> = FxSet::default();
        for j in 0..n {
            let by_rel = |e: &Eval, ids: &[FactId]| {
                let mut m: FxMap<Sym, Vec<FactId>> = FxMap::default();
                for &id in ids {
                    m.entry(e.store.rec(id).rel).or_default().push(id);
                }
                m
            };
            // THE FIRINGS THAT NO LONGER HOLD: one citing a fact dead, and one a fact come blocks under a negation
            let mut cand: Vec<FactId> = std::mem::take(&mut lost[j]).into_iter().collect();
            cand.sort_unstable();
            for &y in &cand {
                for (rule, _, prems) in self.store.firings(y) {
                    if prems.iter().any(|p| matches!(p.kind(), Prem::Fact(g) if !self.store.alive(g))) {
                        self.store.remove_firing(y, rule, &prems);
                    }
                }
            }
            // (what stands is read whole beside the negation's news: older than this round)
            pg.round += 1;
            pg.neg_news = by_rel(self, &came);
            pg.withdraw = true;
            for f in &fired[j] {
                for (i, _) in &f.from {
                    if matches!(&f.r.plan[*i], BodyElem::Neg(l) if pg.neg_news.contains_key(&l.rel)) {
                        if let Err(e) = self.pages_fire(&pg, f, Some(*i), None, &mut sc, &mut Front::default()) {
                            return Err(self.pages_delta_failed(e));
                        }
                    }
                }
            }
            pg.withdraw = false;
            for (y, rule, prems) in std::mem::take(&mut *pg.withdrawn.borrow_mut()) {
                if self.store.remove_firing(y, rule, &prems) {
                    cand.push(y);
                }
            }
            // THE FACTS THAT MAY GO: each that lost a firing and what rests on it, in this round; a fact of a round
            // above is looked at there
            let mut queue: Vec<FactId> = Vec::new();
            cand.sort_unstable();
            cand.dedup();
            for y in cand {
                if self.store.alive(y) && !self.store.rec(y).base() && gone.insert(y) {
                    queue.push(y);
                }
            }
            let mut went_here: Vec<FactId> = Vec::new();
            while let Some(x) = queue.pop() {
                went_here.push(x);
                for y in self.store.citers_one(x) {
                    if !self.store.alive(y) {
                        continue;
                    }
                    if round(self, y) != j {
                        lost[round(self, y)].insert(y);
                        continue;
                    }
                    if !self.store.rec(y).base() && gone.insert(y) {
                        queue.push(y);
                    }
                }
            }
            // WHAT HAS A FIRING ON WHAT STANDS STAYS, by the firings the store keeps (no rule fired again): a firing waits
            // for each premise that may go, and its fact stays when none is left to wait for; a circle of facts that
            // hold each other up waits for ever
            let mut waits: FxMap<FactId, Vec<(FactId, usize)>> = FxMap::default();
            let mut open: Vec<usize> = Vec::new();
            let mut back: Vec<FactId> = Vec::new();
            for &y in &went_here {
                let mut free = false;
                for (_, _, ps) in self.store.firings(y) {
                    let k = open.len();
                    let mut n = 0;
                    for p in &ps {
                        if let Prem::Fact(g) = p.kind() {
                            if gone.contains(&g) {
                                n += 1;
                                waits.entry(g).or_default().push((y, k));
                            }
                        }
                    }
                    open.push(n);
                    free |= n == 0;
                }
                if free {
                    back.push(y);
                }
            }
            let mut i = 0;
            while i < back.len() {
                let g = back[i];
                i += 1;
                if !gone.remove(&g) {
                    continue;
                }
                for (y, k) in waits.remove(&g).unwrap_or_default() {
                    open[k] -= 1;
                    if open[k] == 0 && gone.contains(&y) {
                        back.push(y);
                    }
                }
            }
            // the rest is taken out, and the firings that cite it
            let out: Vec<FactId> = went_here.iter().copied().filter(|x| gone.contains(x)).collect();
            for &x in &out {
                for y in self.store.citers_one(x) {
                    if self.store.alive(y) && !gone.contains(&y) && round(self, y) == j {
                        for (rule, _, prems) in self.store.firings(y) {
                            if prems.contains(&PremRef::Fact(x)) {
                                self.store.remove_firing(y, rule, &prems);
                            }
                        }
                    }
                }
            }
            for x in &out {
                gone.remove(x);
            }
            d.rederived += went_here.len() - out.len();
            let mut news = Front::default();
            d.overdeleted += went_here.len();
            self.store.remove_many(&out);
            // THE NEWS OF THE ROUND: what came below and what came back here, met at each premise that reads it; and
            // what went for good below, met where a negation is written
            for &x in &came {
                if self.store.alive(x) {
                    news.note(self.store.rec(x).rel, x);
                }
            }
            pg.round += 1;
            pg.neg_news = by_rel(self, &went);
            for f in &fired[j] {
                for (i, _) in &f.from {
                    if matches!(&f.r.plan[*i], BodyElem::Neg(l) if pg.neg_news.contains_key(&l.rel)) {
                        if let Err(e) = self.pages_fire(&pg, f, Some(*i), None, &mut sc, &mut news) {
                            return Err(self.pages_delta_failed(e));
                        }
                    }
                }
            }
            let before: FxSet<FactId> = news.keys.clone();
            pg.made.clear();
            if let Err(e) = self.pages_news(&mut pg, &fired[j..=j], &mut sc, news) {
                return Err(self.pages_delta_failed(e));
            }
            let out_set: FxSet<FactId> = out.iter().copied().collect();
            came.extend(pg.made.iter().copied().filter(|id| !before.contains(id) && !out_set.contains(id)));
            went.extend(out.into_iter().filter(|x| !self.store.alive(*x)));
        }
        if !self.lat.pass.plain_pending.is_empty() || !self.lat.pass.plain_undecided.is_empty() || !self.lat.carry.undecided.is_empty() {
            self.store.dirty = true;
            return Err("an edit met a fault or an unknown".into());
        }
        Ok(d)
    }

    fn pages_delta_failed(&mut self, e: Result<Back, Halt>) -> String {
        self.store.dirty = true;
        match e {
            Ok(Back) => "an edit met a part of the language the pages do not evaluate yet".into(),
            Err(h) => format!("the edit stopped at {}, and the world is evaluated again", crate::describe(&h)),
        }
    }
}

#[derive(Default)]
struct Scratch {
    b: Vec<Option<Term>>,
    trail: Vec<usize>,
    prems: Vec<PremRef>,
}

/// Whether fact `id` meets premise `i` of `f` under the slots `b`, binding the slots it fills (noted on `trail`).
fn meet(h: &Heap, store: &Store, pg: &Pages, f: &Fired, i: usize, id: FactId, b: &mut [Option<Term>], trail: &mut Vec<usize>) -> bool {
    let mark = trail.len();
    let pats = &f.pats[i];
    let persp = store.rec(id).persp;
    if f.open_book[i] && !pg.kernel.is_empty() && pg.kernel.contains(&persp) {
        return false;
    }
    let args = store.args(id);
    let ok = pats.len() == args.len() + 1
        && std::iter::once(Term::atom(persp)).chain(args.iter().copied()).zip(pats).all(|(v, p)| match *p {
            Pat::Val(c) => c == v,
            Pat::Slot(k) => match b[k] {
                Some(x) => x == v,
                None => {
                    b[k] = Some(v);
                    trail.push(k);
                    true
                }
            },
            Pat::Open(t) => match_open(h, t, v, &f.vars, b, trail),
        });
    if !ok {
        undo(b, trail, mark);
    }
    ok
}

/// The key premise `i` of `f` is asked by under `b`, by the arguments `mask` names bound.
fn key(h: &Heap, f: &Fired, i: usize, mask: u64, b: &[Option<Term>]) -> u64 {
    let mut key = KeyHash::default();
    for (j, p) in f.pats[i].iter().enumerate() {
        if mask >> j & 1 != 0 {
            key.add(match *p {
                Pat::Val(c) => c,
                Pat::Slot(k) => b[k].unwrap(),
                Pat::Open(t) => build_open(h, t, &f.vars, b).unwrap_or(Term::var(Sym::MAX)),
            });
        }
    }
    key.0
}

/// Whether a fact stands that negation `i` of `f` meets under `b`.
fn held(h: &Heap, store: &Store, pg: &Pages, f: &Fired, i: usize, b: &mut [Option<Term>], trail: &mut Vec<usize>) -> bool {
    let mark = trail.len();
    let mut mask = 0u64;
    for (j, p) in f.pats[i].iter().enumerate() {
        let bound = match *p {
            Pat::Val(_) => true,
            Pat::Slot(k) => b[k].is_some(),
            Pat::Open(t) => {
                let mut vs = Vec::new();
                term_vars(h, t, &mut vs);
                vs.iter().all(|v| b[f.vars.iter().position(|x| x == v).unwrap()].is_some())
            }
        };
        mask |= (bound as u64) << j;
    }
    let BodyElem::Neg(l) = &f.r.plan[i] else { unreachable!() };
    let ix = pg.ix_of.get(&(l.rel, mask)).copied().unwrap_or(usize::MAX);
    let key = if ix == usize::MAX { 0 } else { key(h, f, i, mask, b) };
    for &id in pg.under(l.rel, ix, key) {
        if pg.edit && !store.alive(id) {
            continue;
        }
        if meet(h, store, pg, f, i, id, b, trail) {
            undo(b, trail, mark);
            return true;
        }
    }
    false
}

/// The firings of a task solved on a thread of its own: each instance's slots and premises, and what it read.
#[derive(Default)]
struct Found {
    sols: Vec<(Vec<Option<Term>>, Vec<PremRef>)>,
    read: u64,
    widest: (usize, usize),
}

/// Whether `f` is solved without writing: no closure, no aggregate, a builtin only `=` or `!=` over variables and
/// values.
fn pure(h: &Heap, v: &Vocab, f: &Fired) -> bool {
    f.closure.iter().all(Option::is_none)
        && f.r.plan.iter().all(|b| match b {
            BodyElem::Pos(_) | BodyElem::Neg(_) => true,
            BodyElem::Bi { op, l, r } => (*op == v.op_eq || *op == v.op_ne) && [*l, *r].iter().all(|t| matches!(t.kind(), TermK::Var(_)) || h.is_ground(*t)),
            BodyElem::Agg(_) => false,
        })
}

/// A side of a pure builtin under the slots.
fn side(f: &Fired, t: Term, b: &[Option<Term>]) -> Option<Term> {
    match t.kind() {
        TermK::Var(x) => b[f.vars.iter().position(|y| *y == x).unwrap()],
        _ => Some(t),
    }
}

/// `pages_solve` over a pure rule, read only: the instances found go to `out`, to be concluded in their order.
#[allow(clippy::too_many_arguments)]
fn solve_ro(h: &Heap, v: &Vocab, store: &Store, pg: &Pages, f: &Fired, steps: &[Step], b: &mut Vec<Option<Term>>, trail: &mut Vec<usize>, prems: &mut Vec<PremRef>, out: &mut Found) {
    let r = &f.r;
    let Some((st, rest)) = steps.split_first() else {
        out.sols.push((b.clone(), prems.clone()));
        return;
    };
    let i = st.at;
    let mark = trail.len();
    match &r.plan[i] {
        BodyElem::Pos(l) => {
            let k = key(h, f, i, st.mask, b);
            let under = if st.news && st.mask == 0 { pg.news.get(&l.rel).map_or(&[][..], |v| &v[..]) } else { pg.under(l.rel, st.ix, k) };
            out.read += under.len() as u64;
            if under.len() > out.widest.0 {
                out.widest = (under.len(), i);
            }
            for &id in under {
                if (st.old || st.news) && (pg.news_of[id as usize] == pg.round) != st.news || pg.edit && !store.alive(id) {
                    continue;
                }
                if meet(h, store, pg, f, i, id, b, trail) {
                    prems[i] = PremRef::Fact(id);
                    solve_ro(h, v, store, pg, f, rest, b, trail, prems, out);
                    undo(b, trail, mark);
                }
            }
        }
        BodyElem::Neg(l) if st.news => {
            for &id in pg.neg_news.get(&l.rel).map_or(&[][..], |v| &v[..]) {
                if meet(h, store, pg, f, i, id, b, trail) {
                    if pg.withdraw || !held(h, store, pg, f, i, b, trail) {
                        prems[i] = PremRef::Neg(0);
                        solve_ro(h, v, store, pg, f, rest, b, trail, prems, out);
                    }
                    undo(b, trail, mark);
                }
            }
        }
        BodyElem::Neg(_) => {
            if !held(h, store, pg, f, i, b, trail) {
                prems[i] = PremRef::Neg(0);
                solve_ro(h, v, store, pg, f, rest, b, trail, prems, out);
            }
        }
        BodyElem::Bi { op, l, r } => {
            let (x, y) = (side(f, *l, b), side(f, *r, b));
            let go = if *op == v.op_ne {
                x.is_some() && y.is_some() && x != y
            } else {
                match (x, y, l.kind(), r.kind()) {
                    (Some(x), Some(y), _, _) => x == y,
                    (None, Some(y), TermK::Var(a), _) | (Some(y), None, _, TermK::Var(a)) => {
                        let k = f.vars.iter().position(|z| *z == a).unwrap();
                        b[k] = Some(y);
                        trail.push(k);
                        true
                    }
                    _ => true,
                }
            };
            if go {
                prems[i] = PremRef::Bi(0);
                solve_ro(h, v, store, pg, f, rest, b, trail, prems, out);
            }
            undo(b, trail, mark);
        }
        BodyElem::Agg(_) => unreachable!(),
    }
}

fn undo(b: &mut [Option<Term>], trail: &mut Vec<usize>, mark: usize) {
    for k in trail.drain(mark..) {
        b[k] = None;
    }
}
