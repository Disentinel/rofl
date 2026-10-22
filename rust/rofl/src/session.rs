//! THE PORT'S SURFACE: five verbs and a tick, each one shaped by a measurement.
//!
//! `docs/port-surface.md` derives this from five numbers, and the point of
//! deriving it before writing it was that a surface designed without them hides
//! exactly what a caller needs to see. What each number bought:
//!
//! 1. A QUESTION'S COST IS A PROPERTY OF THE QUESTION. Over a 128-file world of
//!    5 676 864 facts: a bound key 5.5 ms, a bound prefix 8.6 ms, a scan 72 ms,
//!    and the largest relation — 1 093 150 rows — 12 469 ms. Three orders of
//!    magnitude behind one verb is a trap, so [`Answer`] carries what the ask
//!    COST and whether it probed an index or walked the relation. A caller who
//!    reads `probed: false` next to `scanned: 1093150` knows why they waited.
//!
//! 2. STARTING IS 383 ms AND FORKING IS 3 ms. So [`Session::fork`] is on the
//!    surface rather than in the host: a unit of work is a fork of a built
//!    core, and that has to be the obvious path rather than an optimisation a
//!    caller discovers after paying 128x for it.
//!
//! 3. A VOLUME MAY BE LIFTED AT A TICK BOUNDARY AND NOWHERE ELSE, because
//!    `Assumption` freezes what `not p` is judged against for a whole round.
//!    This surface honours that BY CONSTRUCTION rather than by a guard: there
//!    is no way to reach the middle of a round from here — [`Session::evaluate`]
//!    is one call that either reaches the fixpoint or halts at a wall — and
//!    [`Session::assert`] only marks the store dirty, so the facts it adds are
//!    first judged by the NEXT whole evaluation. A caller cannot ask a
//!    negation to be answered against two different worlds, because there is
//!    no verb that would let them.
//!
//! 4. EXHAUSTION IS A FACT, not an error. A wall emits a `hole` into the store,
//!    so the unfinished part names itself. [`Session::evaluate`] therefore
//!    returns the answer AND the margin, and reserves `Err` for a defect.
//!
//! 5. ROWS ARE NOT FACTS AND THE WALL IS COUNTED IN ROWS — measured at 0.507
//!    rows per fact on the JS model. So every field below that reports a margin
//!    says which unit it is in, in its name. The category error has been made
//!    here once already.
//!
//! What is deliberately NOT here: any way to mutate the world mid-evaluation,
//! and any query that hides whether it probed or scanned.

use std::collections::{HashMap, HashSet};

use crate::describe;
use crate::engine::{Eval, Halt, Mode, Outcome, TickOutcome, WhyOpts, WhynotBounds, WhynotFile, EXPLAIN_WHYNOT_BOUNDS};
use crate::reflect::{self, bootstrap_kernel, is_kernel_ledger, Vocab};
use crate::rofl_parse::{self, Book, Tense};
use crate::store::{write_fact_key, FactId, Store, F_BASE, F_TICK};
use crate::term::{Heap, Sym, Term, TermK};

/// A world. Built once with [`Session::open`], then forked per unit of work.
pub struct Session {
    pub eval: Eval,
    /// Witness references the seed named but did not carry. Not an error — the
    /// harness has warned rather than failed on these since the corpus was
    /// first green — but a caller handed a snapshot should be able to see it.
    pub dangling: usize,
    /// The questions asked so far: a hole a question writes is `$q(N)`, the
    /// reference's `qn` (src/api.ts `query`).
    pub asks: i64,
}

/// What [`Session::retract_delta`] did: the cells brought to their new state,
/// or why the world is evaluated again instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Retraction {
    Delta(crate::engine::Delta),
    Full(String),
}

/// What [`Session::assert_delta`] and [`Session::load_delta`] did: the world brought to its new state, or why it
/// is evaluated again instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Addition {
    Delta(crate::engine::AddDelta),
    Full(String),
}

/// Why an addition of rules is evaluated again when a declared tree's closure is declared, dropped or answered another way.
const TREES_MOVED: &str = "a closure answered from its tree is declared, dropped or answered another way";

/// What [`Session::evaluate`] answers. Measurement 4: the answer AND the margin.
pub struct Evaluated {
    /// A wall was hit and a `hole` names the unfinished part in the store.
    pub partial: bool,
    /// Facts waiting for the next tick boundary.
    pub staged: usize,
    /// Steps spent. Compare against the budget to read the remaining margin.
    pub steps: i64,
    /// The high-water mark of the join accumulator, IN ROWS (measurement 5),
    /// against `space`, which is also in rows.
    pub peak_rows: i64,
    pub space: i64,
}

/// What [`Session::ask`] answers. Measurement 1 is the whole reason for the
/// three cost fields: they are the difference between 5.5 ms and 12 469 ms,
/// and they are visible before the caller is surprised by it.
/// The first token of a cooled volume's header line.
pub const VOLUME_MAGIC: &str = "rofl-volume";
/// The layout of the file BELOW the header. Bumped when the rendering changes,
/// separately from the kernel hash, because those are two different reasons a
/// volume can stop being readable.
pub const VOLUME_FORMAT: u32 = 1;

/// `excise` under a cone that left rules out: what the fact supports through those rules is not in the world.
pub const EXCISE_UNDER_ASKS: &str = "excise is not answered under asks: the rules the cone leaves out would lose what the fact supports too; drop the asks";

/// What `cool` did. `facts` is what left memory; `bytes` is what reached the
/// disk, and the two are reported separately because a caller sizing a volume
/// store needs the second and a caller watching pressure needs the first.
pub struct Cooled {
    pub facts: usize,
    pub bytes: usize,
    pub path: String,
    /// by book, the base facts a by-book cool wrote (empty for the others)
    pub books: Vec<(String, usize)>,
}

pub struct Answer {
    /// Variable names in the order they first appear in the query. `_` is
    /// dropped by the parser into a fresh name, so a wildcard is a column too.
    pub vars: Vec<String>,
    /// One row per match: the bindings, canonically rendered, in `vars` order.
    pub rows: Vec<Vec<String>>,
    /// The whole matched fact, in `canonicalState`'s key form. A caller that
    /// wants the fact rather than the bindings has it without a second ask.
    pub keys: Vec<String>,
    /// Candidates the store handed back before filtering. THIS is the number
    /// that separates the three orders of magnitude, not `rows.len()`.
    pub scanned: usize,
    /// True when the store served an index, false when it declined and the
    /// relation was walked. A caller tuning a question watches this flip.
    pub probed: bool,
    pub micros: u128,
    /// The answers that are shrugs (docs/aggregates.md, "Shrugs, as built"):
    /// the bindings each names, `_` where it does not know, in `vars` order,
    /// and its line (`Eval::shrug_line`).
    pub shrugs: Vec<(Vec<String>, String)>,
    /// The rows may be short of an answer: the evaluation was cut, or an
    /// answer unfolded at a call was left unknown and no shrug row names it
    /// (src/api.ts `query`).
    pub partial: bool,
}

impl Session {
    /// Build a core from a snapshot. Expensive — 383 ms for the 20 630-fact
    /// packs — and meant to happen once per process. Fork it after that.
    pub fn open(seed_json: &str, budget: i64) -> Result<Session, String> {
        let l = crate::load(seed_json, budget)?;
        Ok(Session { eval: l.eval, dangling: l.dangling, asks: 0 })
    }

    /// A world from a kept image (`crate::image`): an evaluated world opens evaluated.
    pub fn open_kept(bytes: &[u8], budget: i64) -> Result<Session, String> {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut o = crate::image::open(&mut h, bytes)?;
        bootstrap_kernel(&mut h, &v, &mut o.store);
        let mut eval = Eval::with_answer(h, o.store, budget, Mode::Rounds, false, o.answer);
        eval.vclosure_restore();
        eval.stage_kept(o.staged);
        eval.after_open(o.lattices);
        if !eval.store.dirty && crate::brk!("volume_unknowns_dropped" => false; true) {
            eval.unknowns_from(o.unknowns)?;
        }
        Ok(Session { eval, dangling: o.dangling, asks: 0 })
    }

    /// This world as a kept image, which `open_kept` reads back.
    pub fn keep(&mut self) -> Vec<u8> {
        self.eval.settle_provenance();
        crate::image::keep(&self.eval.h, &self.eval.store, &self.eval.staged_kept(), self.eval.safety(), &self.eval.lattices_kept(), &self.eval.unknowns_kept())
    }

    /// This world kept as a volume at `path`, which `open_volume` maps back. It freezes the world, as a fork does.
    pub fn keep_volume(&mut self, path: &str) -> std::io::Result<usize> {
        self.keep_volume_noted(path, "")
    }

    /// `keep_volume` with a note in the volume's header, which `volume::check` reads back without opening the world.
    pub fn keep_volume_noted(&mut self, path: &str, note: &str) -> std::io::Result<usize> {
        self.keep_volume_bounded(path, note, None)
    }

    /// `keep_volume_noted` that never writes more than `bound` bytes: past it nothing is kept and the error is
    /// `arena::TOO_LARGE`. Written under a name of this process's beside `path` and renamed over it, so two
    /// processes keeping the same world never write into one file.
    pub fn keep_volume_bounded(&mut self, path: &str, note: &str, bound: Option<usize>) -> std::io::Result<usize> {
        let tmp = format!("{path}.{}.part", std::process::id());
        match crate::volume::keep(&tmp, &mut self.eval, note, bound) {
            Ok(n) => std::fs::rename(&tmp, path).map(|_| n).inspect_err(|_| { let _ = std::fs::remove_file(&tmp); }),
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                Err(e)
            }
        }
    }

    /// The world a volume holds, its facts, names and witnesses read from the file where they lie.
    pub fn open_volume(path: &str, budget: i64) -> Result<Session, String> {
        let mut o = crate::volume::open(path)?;
        let evaluated = !o.store.dirty && !o.store.partial_eval;
        let cut_short = !o.store.dirty && o.store.partial_eval;
        o.store.dirty = !evaluated && !cut_short;
        let mut h = o.heap;
        let v = Vocab::new(&mut h);
        bootstrap_kernel(&mut h, &v, &mut o.store);
        let mut eval = Eval::with_answer(h, o.store, budget, Mode::Rounds, false, evaluated.then_some(o.answer));
        eval.vclosure_restore();
        eval.stage_kept(std::mem::take(&mut o.staged));
        eval.after_open(std::mem::take(&mut o.lattices));
        if !eval.store.dirty && crate::brk!("volume_unknowns_dropped" => false; true) {
            eval.unknowns_from(std::mem::take(&mut o.unknowns))?;
        }
        eval.read_notes(&mut o.cut)?;
        eval.read_cut(&mut o.cut)?;
        if !o.cut.at_end() {
            return Err(format!("{path}: a volume has bytes after its end"));
        }
        Ok(Session { eval, dangling: 0, asks: 0 })
    }

    /// AN EMPTY WORLD with the kernel's bootstrap tables and nothing else —
    /// `new Rofl()` on the TypeScript side. This is where `load` starts from,
    /// and it is the reason the port no longer needs a seed to exist: a caller
    /// can now build a world out of `.rofl` text alone.
    pub fn fresh(budget: i64) -> Session {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut store = Store::new();
        bootstrap_kernel(&mut h, &v, &mut store);
        Session { eval: Eval::new(h, store, budget, Mode::Rounds, false), dangling: 0, asks: 0 }
    }

    /// A world of one's own, as a LAYER over this one. The first fork freezes
    /// what the heap and the store hold into a base that this world and every
    /// fork then share and none of them writes (`Store::freeze`), so a fork
    /// copies no fact, tuple, name or functor: it appends above the base's
    /// ids, and nothing it does is visible to the core or to a sibling.
    pub fn fork(&mut self) -> Session {
        self.eval.settle_provenance();
        self.eval.h.freeze();
        self.eval.store.freeze(&self.eval.h);
        Session { eval: self.eval.fork(), dangling: self.dangling, asks: self.asks }
    }

    /// Add base facts, written as ROFL. What they add is not visible to a
    /// negation until the next whole evaluation (measurement 3): this marks
    /// the store dirty and nothing more, so `not p` is never answered against
    /// a half-loaded world. Returns how many facts were NEW.
    ///
    /// Facts only. A clause with a body is a RULE, and rules arrive with the
    /// packs — accepting one here would let a caller change what the world
    /// means without saying so.
    pub fn assert(&mut self, src: &str) -> Result<usize, String> {
        let facts = self.parse_facts(src)?;
        let (n, asked, ids) = self.put_facts(&facts);
        if !ids.is_empty() {
            self.eval.store.dirty = true;
        }
        // the rules a world runs are read at prepare: a new ask is only an ask once they are read again
        if asked {
            self.eval.reprepare();
        }
        Ok(n)
    }

    fn parse_facts(&mut self, src: &str) -> Result<Vec<(Sym, Sym, Vec<Term>)>, String> {
        let cs = rofl_parse::parse(&mut self.eval.h, src)?;
        let mut out = Vec::with_capacity(cs.len());
        for c in &cs {
            if !c.body.is_empty() || c.lattice.is_some() {
                return Err(format!("assert takes facts, not rules or declarations: {}", rofl_parse::show(&self.eval.h, c)));
            }
            if c.head.tense != Tense::Now {
                return Err(format!("assert takes facts of the present tense: {}", rofl_parse::show(&self.eval.h, c)));
            }
            let (rel, persp, args) = self.lit_terms(&c.head)?;
            for a in &args {
                if a.is_var() {
                    return Err(format!("a base fact may not carry a variable: {}", rofl_parse::show(&self.eval.h, c)));
                }
            }
            out.push((rel, persp, args));
        }
        Ok(out)
    }

    /// The facts in, as base: how many were new, whether one is an ask, and the facts the world now holds otherwise
    /// than before: the new ones and those that were derived and are base now (their height is a base fact's).
    fn put_facts(&mut self, facts: &[(Sym, Sym, Vec<Term>)]) -> (usize, bool, Vec<FactId>) {
        let (mut asked, mut n) = (false, 0);
        self.eval.store.arrivals = Some(Vec::new());
        for (rel, persp, args) in facts {
            let (_, new) = self.eval.store.put(&self.eval.h, *rel, *persp, args, F_BASE);
            if new {
                n += 1;
                asked |= *rel == self.eval.v.asks || (*rel == self.eval.v.explain_request && self.eval.cone.is_some());
            }
        }
        let ids = self.eval.store.arrivals.take().unwrap_or_default();
        (n, asked, ids)
    }

    /// `assert`, bringing an evaluated world to the state a fresh evaluation of it with the facts would hold, without
    /// clearing what it derived (`Eval::add_delta`). A world not evaluated takes the facts as `assert` does, and an
    /// addition the path is not worked out for leaves the world dirty: `Full` says why, the next evaluation answers.
    /// An ask is a new program (the cone of the rules it runs grows), added as `load_delta` adds rules.
    pub fn assert_delta(&mut self, src: &str) -> Result<(usize, Addition), String> {
        let facts = self.parse_facts(src)?;
        if self.eval.store.dirty {
            let n = self.assert(src)?;
            return Ok((n, Addition::Full("the world is not evaluated".into())));
        }
        let (n, a) = self.assert_facts_delta(&facts);
        if let Addition::Full(why) = &a {
            let requests: Vec<Term> = facts.iter().map(|(rel, persp, args)| {
                let f = crate::reflect::fact_term(&mut self.eval.h, &self.eval.v, *rel, *persp, args);
                self.eval.h.mkf_named("assert", &[f])
            }).collect();
            self.evaluated_again(&requests, why);
        }
        Ok((n, a))
    }

    fn assert_facts_delta(&mut self, facts: &[(Sym, Sym, Vec<Term>)]) -> (usize, Addition) {
        let mark = self.eval.prep_mark();
        let (n, asked, ids) = self.put_facts(facts);
        if ids.is_empty() {
            return (0, Addition::Delta(crate::engine::AddDelta::default()));
        }
        let (mut rules, mut called) = (Vec::new(), Vec::new());
        if asked {
            if !self.eval.reprepare_keeping_trees() {
                self.eval.store.dirty = true;
                return (n, Addition::Full(TREES_MOVED.into()));
            }
            let (added, was_called, moves) = self.eval.prep_moves(&mark);
            if !moves.is_empty() {
                self.eval.store.dirty = true;
                return (n, Addition::Full(moves.join("; ")));
            }
            rules = added;
            called = was_called;
        }
        (n, self.added(&ids, &rules, &called))
    }

    /// `load`, bringing an evaluated world to the state a fresh evaluation of the whole program would hold: the
    /// facts it adds and the rules it adds fire over what the world holds (`Eval::add_delta`). A world not evaluated
    /// loads as `load` does; a program the path is not worked out for leaves the world dirty and `Full` says why.
    pub fn load_delta(&mut self, src: &str, who: Option<&str>) -> Result<(usize, Addition), Vec<String>> {
        if self.eval.store.dirty {
            let n = self.load(src, who)?;
            return Ok((n, Addition::Full("the world is not evaluated".into())));
        }
        let mark = self.eval.prep_mark();
        self.eval.store.arrivals = Some(Vec::new());
        let r = crate::program::load_program(&mut self.eval, src, who);
        let ids = self.eval.store.arrivals.take().unwrap_or_default();
        if !r.ok {
            return Err(r.diagnostics);
        }
        let a = self.loaded_delta(mark, ids.clone());
        if let Addition::Full(why) = &a {
            // the request names what the program brought: each rule by its id, each fact of its own books
            let mut requests = Vec::new();
            for &f in &ids {
                let (rel, persp) = (self.eval.store.rec(f).rel, self.eval.store.rec(f).persp);
                if rel == self.eval.v.rule || rel == self.eval.v.dominance {
                    let rid = self.eval.store.args(f)[0];
                    requests.push(self.eval.h.mkf_named("rule", &[rid]));
                } else if !self.eval.v.is_reserved(rel) && !is_kernel_ledger(&self.eval.h, persp) {
                    let t = self.fact_term(f);
                    requests.push(self.eval.h.mkf_named("assert", &[t]));
                }
            }
            self.evaluated_again(&requests, why);
        }
        Ok((r.admitted, a))
    }

    fn loaded_delta(&mut self, mark: crate::engine::PrepMark, mut ids: Vec<FactId>) -> Addition {
        self.eval.store.dirty = false;
        if !self.eval.reprepare_keeping_trees() {
            self.eval.store.dirty = true;
            return Addition::Full(TREES_MOVED.into());
        }
        ids.retain(|i| self.eval.store.alive(*i));
        let (rules, called, moves) = self.eval.prep_moves(&mark);
        if !moves.is_empty() {
            self.eval.store.dirty = true;
            return Addition::Full(moves.join("; "));
        }
        if ids.is_empty() && rules.is_empty() {
            return Addition::Delta(crate::engine::AddDelta::default());
        }
        self.added(&ids, &rules, &called)
    }

    /// `evaluated_again(Request, Reason)` in the kernel's book, a row for each request and each reason: a world that
    /// was asked for a delta and is evaluated again says so where a rule or a notebook reads it.
    /// What the program text `src` asserts, read against this world: the base facts the store holds for its facts,
    /// in order (a fact said twice, once); its rules and declarations, each as written back, one a line; and its
    /// facts the store does not hold as base facts, likewise. A kept world records the first two of each of its
    /// files (docs/cli.md), to take a file's facts in and out by delta when the file changes and its rules did not.
    pub fn facts_of(&mut self, src: &str) -> Result<(Vec<FactId>, String, String), String> {
        let cs = rofl_parse::parse(&mut self.eval.h, src)?;
        let (mut ids, mut rules, mut absent, mut seen) = (Vec::new(), String::new(), String::new(), HashSet::new());
        for c in &cs {
            let ground = || c.head.args.iter().all(|t| self.eval.h.is_ground(*t));
            let fact = c.body.is_empty() && c.lattice.is_none() && c.head.tense == Tense::Now && ground();
            let text = rofl_parse::show(&self.eval.h, c);
            if !fact {
                rules.push_str(&text);
                rules.push('\n');
                continue;
            }
            let id = self.lit_terms(&c.head).ok().and_then(|(r, p, a)| self.eval.store.get(r, p, &a));
            match id.filter(|&f| self.eval.store.alive(f) && self.eval.store.rec(f).base()) {
                Some(f) => {
                    if seen.insert(f) { ids.push(f); }
                }
                None => {
                    absent.push_str(&text);
                    absent.push('\n');
                }
            }
        }
        Ok((ids, rules, absent))
    }

    /// The base facts `ids` taken out of an evaluated world by delta, one after another as `retract_delta` takes
    /// one (the engine's delta takes one fact and what a load wrote for it alone, `doomed`). `Full` says why a delta
    /// is not worked out, and then the world is left dirty and not evaluated again here, nor marked as evaluated
    /// again: the caller evaluates the files instead.
    pub fn retract_facts_delta(&mut self, ids: &[FactId]) -> Result<Retraction, String> {
        Ok(match self.retract_set_delta(ids)? {
            Ok(_) => Retraction::Delta(Default::default()),
            Err(why) => Retraction::Full(why),
        })
    }

    /// `retract_facts_delta` with what the pass did (`AddDelta`: what it overdeleted and derived again), or why it
    /// was not worked out (the world left dirty).
    pub fn retract_set_delta(&mut self, ids: &[FactId]) -> Result<Result<crate::engine::AddDelta, String>, String> {
        self.settle()?;
        let facts: Vec<FactId> = {
            let mut seen = HashSet::new();
            ids.iter().copied().filter(|&f| self.eval.store.alive(f) && self.eval.store.rec(f).base() && seen.insert(f)).collect()
        };
        if facts.is_empty() {
            return Ok(Ok(Default::default()));
        }
        if facts.iter().any(|&f| [self.eval.v.asks, self.eval.v.explain_request].contains(&self.eval.store.rec(f).rel)) {
            self.eval.store.dirty = true;
            return Ok(Err("asks names the rules the world runs".into()));
        }
        let doomed = self.doomed_of_set(&facts);
        // a mark a rule reads goes as a fact of the set, and what rests on it with it
        let (edb, authority) = (self.eval.v.edb, self.eval.v.authority);
        let read: HashSet<Sym> = [edb, authority].into_iter().filter(|m| self.eval.rules.iter().any(|r| r.clause.body.iter().any(|b| b.lits_deep().iter().any(|l| l.rel == *m)))).collect();
        let (marks, rows): (Vec<FactId>, Vec<FactId>) = doomed.into_iter().partition(|&f| read.contains(&self.eval.store.rec(f).rel));
        let mut facts = facts;
        facts.extend(marks);
        match self.eval.retract_set(&facts, &rows) {
            Ok(d) => match self.eval.check_promises() {
                Ok(_) => Ok(Ok(d)),
                Err(e) => {
                    self.eval.store.dirty = true;
                    Err(crate::describe(&e))
                }
            },
            Err(why) => {
                self.eval.store.dirty = true;
                Ok(Err(why))
            }
        }
    }

    /// The base facts `ids` taken out one after another by the engine's one-fact delta (`retract_delta`): the
    /// reference `retract_facts_delta` is held to. `Full` as there.
    pub fn retract_facts_one_by_one(&mut self, ids: &[FactId]) -> Result<Retraction, String> {
        self.eval.settle_assertions();
        self.settle()?;
        let mut last = Retraction::Delta(Default::default());
        for &id in ids {
            if !self.eval.store.alive(id) || !self.eval.store.rec(id).base() {
                continue;
            }
            let rel = self.eval.store.rec(id).rel;
            if rel == self.eval.v.asks || rel == self.eval.v.explain_request {
                self.eval.store.dirty = true;
                return Ok(Retraction::Full("asks names the rules the world runs".into()));
            }
            let doomed = self.doomed(id);
            let marks: Vec<Sym> = doomed.iter().map(|&f| self.eval.store.rec(f).rel).filter(|r| [self.eval.v.edb, self.eval.v.authority].contains(r)).collect();
            let read = self.eval.rules.iter().any(|r| r.clause.body.iter().any(|b| b.lits_deep().iter().any(|l| marks.contains(&l.rel))));
            let delta = if read { Err("the retraction takes an edb or authority row a rule reads".to_string()) } else { self.eval.retract_delta(&doomed) };
            match delta {
                Ok(d) => {
                    if let Err(e) = self.eval.check_promises() {
                        self.eval.store.dirty = true;
                        return Err(crate::describe(&e));
                    }
                    last = Retraction::Delta(d);
                }
                Err(why) => {
                    // the rest go without a delta, and the world is evaluated again
                    if self.eval.store.alive(id) {
                        self.eval.store.remove_many(&doomed);
                    }
                    self.eval.store.dirty = true;
                    if !matches!(last, Retraction::Full(_)) {
                        last = Retraction::Full(why);
                    }
                }
            }
        }
        Ok(last)
    }

    fn evaluated_again(&mut self, requests: &[Term], why: &str) {
        let (rel, book) = (self.eval.v.evaluated_again, self.eval.v.kernel_persp);
        for reason in why.split("; ") {
            let r = self.eval.h.string(reason);
            for &q in requests {
                self.eval.store.add(&self.eval.h, rel, book, &[q, r], F_BASE);
            }
        }
    }

    fn added(&mut self, ids: &[FactId], rules: &[Sym], called: &[Sym]) -> Addition {
        match self.eval.add_delta(ids, rules, called) {
            Ok(d) => {
                if self.eval.check_promises_added().is_err() {
                    self.eval.store.dirty = true;
                    return Addition::Full("a declared promise is broken; the evaluation refuses the world".into());
                }
                Addition::Delta(d)
            }
            Err(why) => {
                self.eval.store.dirty = true;
                Addition::Full(why)
            }
        }
    }

    /// LOAD A ROFL PROGRAM — the verb that stops this being an accelerator.
    ///
    /// Until this existed, `open` meant `open(seed)` and the only way into a
    /// Rust world was a snapshot the TypeScript kernel had made, so the port
    /// could not be handed to anyone without handing them the pair.
    ///
    /// `who` is the author. A caller may not spell a `$` principal; the one
    /// way into the kernel's ring is `$kernel_authority` written as the FIRST
    /// clause of the FIRST load, in the file itself, where a reader can see it.
    ///
    /// A refusal returns EVERY diagnostic and leaves the store exactly as it
    /// was — a program with three bad clauses hears about all three and puts
    /// nothing in the world.
    ///
    /// THE RULES ARE RE-PREPARED AFTERWARDS, and that is not a detail: rules
    /// live in the store as reflection facts, and the peeled strata, the body
    /// plans and the demand grouping are all computed from them. A load that
    /// added rules and left `self.rules` alone would evaluate the OLD program
    /// against the NEW facts, silently.
    pub fn load(&mut self, src: &str, who: Option<&str>) -> Result<usize, Vec<String>> {
        let r = crate::program::load_program(&mut self.eval, src, who);
        if !r.ok {
            return Err(r.diagnostics);
        }
        self.eval.reprepare();
        Ok(r.admitted)
    }

    /// THE COMPOSITION FROM BELOW (docs/aggregates.md, "Well-founded worlds
    /// and ticks, as built"): a world evaluated on its own, typically under
    /// `semantics(well_founded)`, hands its answers to this one as base facts
    /// asserted by `below`, and this one aggregates them stratified. What is
    /// fed is what the world below concludes: every live row, in a program's
    /// book, of a relation a rule of its own concludes (a rule this world
    /// also holds, boot's, is not its own), and every `unknown(Atom)` row the
    /// alternating fixpoint wrote. A declaration the kernel reads
    /// (`semantics`, `sealed`, `stratum`) is not an answer and is not fed.
    ///
    /// What the world below has no answer for crosses as a shrug
    /// (docs/aggregates.md, "Shrugs, as built"): each atom it names a shrug,
    /// and every row of each relation it feeds when a wall cut it, is written
    /// here as `hole($below(Rel, Book, Args), left_out_below)`, which this
    /// world carries as what a hole left out. Fed as base, it would read as
    /// false. Refused: a world below that is not evaluated.
    /// Returns how many facts were fed.
    pub fn feed_below(&mut self, below: &mut Session) -> Result<usize, String> {
        let b = &mut below.eval;
        if b.store.dirty {
            return Err("the world below is not evaluated".into());
        }
        let mine: std::collections::HashSet<&str> = self.eval.rules.iter().map(|r| self.eval.h.name(r.id)).collect();
        let declared = [b.v.semantics, b.v.sealed, b.v.stratum];
        let mut fed: std::collections::HashSet<Sym> = b
            .rules
            .iter()
            .filter(|r| !mine.contains(b.h.name(r.id)))
            .map(|r| r.clause.head.rel)
            .filter(|r| brk!("below_feeds_declarations" => true; !declared.contains(r)))
            .collect();
        if brk!("below_drops_unknown" => false; true) {
            fed.insert(b.v.unknown);
        }
        let mut keys: Vec<String> = Vec::new();
        for id in b.store.all_facts() {
            let r = b.store.rec(id);
            if !b.store.alive(id) || !fed.contains(&r.rel) || is_kernel_ledger(&b.h, r.persp) || brk!("below_drops_concluded_input" => r.base(); false) {
                continue;
            }
            let mut k = String::new();
            write_fact_key(&b.h, r.rel, r.persp, b.store.args(id), &mut k);
            keys.push(k);
        }
        keys.sort_by(|x, y| crate::term::cmp_js(x, y));
        // what it has no answer for: an atom a shrug names, or every row of a
        // relation it feeds when a wall cut it
        let mut open: Vec<(Sym, Option<Sym>, Vec<Term>)> = Vec::new();
        if b.store.partial_eval {
            let mut rels: Vec<Sym> = fed.iter().copied().collect();
            rels.sort_by(|x, y| crate::term::cmp_js(b.h.name(*x), b.h.name(*y)));
            open.extend(rels.into_iter().map(|r| (r, None, Vec::new())));
        }
        let (every, inn) = (b.h.intern("every"), b.h.intern("in"));
        for id in b.store.rel_all(&b.h, b.v.shrug) {
            let t = b.store.args(id)[0];
            let (persp, at) = match t.kind() {
                TermK::Func(i) if b.h.fname(i) == inn && b.h.fargs(i).len() == 2 => match b.h.fargs(i)[0].as_atom() {
                    Some(p) => (p, b.h.fargs(i)[1]),
                    None => continue,
                },
                _ => (b.v.main, t),
            };
            let (rel, args) = match at.kind() {
                TermK::Atom(r) => (r, Vec::new()),
                TermK::Func(i) if b.h.fname(i) == every => match b.h.fargs(i)[0].as_atom() {
                    Some(r) if fed.contains(&r) => {
                        open.push((r, None, Vec::new()));
                        continue;
                    }
                    _ => continue,
                },
                TermK::Func(i) => (b.h.fname(i), b.h.fargs(i).to_vec()),
                _ => continue,
            };
            if brk!("below_drops_shrugs" => false; fed.contains(&rel) && !b.h.name(rel).starts_with('$')) {
                open.push((rel, Some(persp), args));
            }
        }
        let text: String = keys.iter().map(|k| format!("{k}.\n")).collect();
        self.load(&text, Some("below")).map_err(|d| format!("what the world below concludes does not load here: {}", d.join("; ")))?;
        let e = &mut self.eval;
        let (mark, cause, any) = (e.h.intern("$below"), e.h.atom("left_out_below"), e.h.atom("$any"));
        for (rel, persp, args) in open {
            let rel = e.h.intern(below.eval.h.name(rel));
            let persp = persp.map(|p| e.h.atom(below.eval.h.name(p))).unwrap_or(any);
            let args = if persp == any { any } else {
                let xs: Vec<Term> = args.iter().map(|a| crate::term::copy_term(&below.eval.h, *a, &mut e.h)).collect();
                e.h.list(&xs)
            };
            let target = e.h.mkf(mark, &[Term::atom(rel), persp, args]);
            e.store.add(&e.h, e.v.hole, e.v.kernel_persp, &[target, cause], crate::store::F_BASE | crate::store::F_FROZEN);
        }
        self.eval.store.dirty = true;
        Ok(keys.len())
    }

    /// Run to fixpoint, or to a wall. `Err` is a defect or a stratification
    /// refusal; a budget or space wall is NOT an error (measurement 4) — it
    /// comes back as `partial` with a `hole` in the store naming what is
    /// unfinished.
    pub fn evaluate(&mut self) -> Result<Evaluated, Halt> {
        let r = self.eval.run();
        let mut e = self.evaluated(r)?;
        // what the world asks to be scanned is scanned and loaded, until it asks for nothing more
        while !e.partial && self.scan_requests().map_err(|m| Halt::Strat(m, String::new()))? > 0 {
            if self.eval.store.dirty {
                let r = self.eval.run();
                e = self.evaluated(r)?;
            }
        }
        Ok(e)
    }

    fn evaluated(&mut self, r: Result<Outcome, Halt>) -> Result<Evaluated, Halt> {
        let o = match r {
            Ok(o) => o,
            Err(Halt::Budget(_, _)) => {
                // The wall unwinds past `run`'s own exits, so the record is
                // written here: a tick that ran out is exactly the one whose
                // budget a replay must be given.
                self.eval.store.note_eval(self.eval.budget, self.eval.steps, true);
                // a wall judges the promises like any other exit, and a world
                // that breaks one stays dirty
                self.eval.check_promises()?;
                // as the reference's run does after either wall: the hole is
                // the answer, and asking again must not pay for the run again
                self.eval.store.dirty = false;
                self.eval.store.partial_eval = true;
                return Ok(Evaluated {
                    partial: true,
                    staged: 0,
                    steps: self.eval.steps,
                    peak_rows: self.eval.peak_rows,
                    space: self.eval.space,
                })
            }
            Err(e) => return Err(e),
        };
        Ok(Evaluated {
            partial: o.partial,
            staged: o.staged,
            steps: self.eval.steps,
            peak_rows: self.eval.peak_rows,
            space: self.eval.space,
        })
    }

    /// Go on from where a step wall stopped the last evaluation, with `more`
    /// steps (`engine/resume.rs`): the world it reaches is the one a single
    /// evaluation with the larger budget reaches, steps included. A world
    /// the wall left no cut in, or that changed since, is evaluated again
    /// whole under the steps spent and `more`. The flag says whether it went on.
    pub fn resume(&mut self, more: i64) -> Result<(Evaluated, bool), Halt> {
        let budget = self.eval.budget;
        let r = self.eval.resume(more);
        let went_on = matches!(r, Ok((_, true)));
        let r = r.map(|(o, _)| o);
        let out = self.evaluated(r);
        self.eval.budget = budget;
        Ok((out?, went_on))
    }

    /// COOL A VOLUME TO DISK: write its facts out as ROFL and drop them.
    ///
    /// A VOLUME IS A KEY PREFIX (docs/volumes-and-residency.md). Which volume a
    /// fact belongs to is decided by the SCANNER when it mints an id — nothing
    /// is derived, because a derived answer would need the data in order to
    /// find the data. `scanners/js_ast.ts` mints every node id as
    /// `n<sha256(path)[0..8]>_<counter>`, so a file is a prefix of every id it
    /// produced, and this reads that prefix off the key.
    ///
    /// THE RULES NEVER MENTION VOLUMES AND MUST NOT. All 64 volumes agreed byte
    /// for byte while no rule knew volumes existed; locality here is a property
    /// of the DATA, and a rule that named a volume would stop being about the
    /// domain and start being about storage. So this is a host operation over
    /// keys, and `rules/ingest.rofl` only ever says a book is `coolable`.
    ///
    /// ONLY BASE FACTS ARE WRITTEN AND DROPPED. A derived fact is not a
    /// possession, it is a conclusion — re-derived from what remains — so
    /// carrying it to disk would store an answer beside the question and let
    /// the two disagree. Dropping the base layer marks the store dirty and the
    /// next evaluation rebuilds what still follows.
    ///
    /// The caller is what records the act: `cooled[code](File, Path)` so the
    /// file stays INDEXED rather than returning to the frontier, and
    /// `hole($cold(File), cooled_to_disk)` so a question about the cold volume
    /// REFUSES instead of answering empty. Neither is written here, because
    /// both are statements about a corpus and this function knows only a
    /// prefix.
    pub fn cool(&mut self, prefix: &str, out: &str) -> Result<Cooled, String> {
        let (write, drop) = self.volume(prefix);
        // THE HEADER IS A REFUSAL WAITING TO HAPPEN, and that is its whole
        // point. A volume is ROFL text, so no change to the store's layout can
        // make it unreadable — but the kernel's own programs decide what a
        // fact may say and how a rule is encoded, and a volume written under
        // one policy and reheated under another still PARSES while meaning
        // something else. That is the exact shape of the stale corpus this
        // branch found today: an artefact that cannot go red on its own.
        //
        // A comment line, so the file stays ordinary ROFL and `load` will
        // still take it. `reheat` is what checks — see the note there for the
        // hole that leaves open, which is deliberate and named rather than
        // pretended away.
        let mut text = self.header(prefix);
        for id in &write {
            let r = self.eval.store.rec(*id);
            let args = self.eval.store.args(*id).to_vec();
            write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut text);
            text.push_str(".\n");
        }
        std::fs::write(out, &text).map_err(|e| format!("{out}: {e}"))?;
        self.eval.store.remove_many(&drop);
        self.eval.store.dirty = true;
        Ok(Cooled { facts: write.len(), bytes: text.len(), path: out.to_string(), books: Vec::new() })
    }

    /// COOL A VOLUME BY BOOK (docs/surface-split.md, the driver): `cool`, of the facts of `books` only. The volume's
    /// base facts of those books are written, every fact of those books naming the prefix is dropped, and so is the
    /// kernel's account of each (the `$fact` a trail row reifies is of one of those books); the facts of the other
    /// books stay, a `[surface]` the volume published or read among them. Like `cool`, the store is left dirty: a
    /// kept fact concluded from what left is a conclusion without its support until `reheat` brings the volume back
    /// and the next evaluation answers, so a caller that keeps a book makes its facts base where they must outlive it.
    ///
    /// A base fact of the volume in a book neither cooled nor in `keep` (`surface` is always kept) would be lost by a
    /// volume that is closed after, or left behind by one that is not: the cool is REFUSED, before anything moves.
    pub fn cool_books(&mut self, prefix: &str, books: &[String], keep: &[String], out: &str) -> Result<Cooled, String> {
        if books.is_empty() {
            return Err("cool by book needs at least one book".into());
        }
        let want: std::collections::HashSet<Sym> = books.iter().map(|b| self.eval.h.intern(b)).collect();
        let mut kept: std::collections::HashSet<Sym> = keep.iter().map(|b| self.eval.h.intern(b)).collect();
        kept.insert(self.eval.h.intern("surface"));
        self.eval.settle_provenance();
        let mut text = self.header(prefix);
        let (mut n, mut drop, mut by_book) = (0, Vec::new(), std::collections::BTreeMap::<String, usize>::new());
        for id in self.eval.store.all_facts() {
            let args = self.eval.store.args(id).to_vec();
            if !args.iter().any(|a| self.mentions(*a, prefix)) {
                continue;
            }
            let r = self.eval.store.rec(id);
            let kernel = is_kernel_ledger(&self.eval.h, r.persp);
            let book = if kernel { args.iter().find_map(|a| self.reified_book(*a)) } else { Some(r.persp) };
            if r.base() && !kernel && !want.contains(&r.persp) && !kept.contains(&r.persp) {
                return Err(format!("cool by book: the volume holds a base fact in [{}], a book neither cooled nor kept: {}",
                    self.eval.h.name(r.persp), self.eval.store.key(&self.eval.h, id)));
            }
            if !book.is_some_and(|b| want.contains(&b)) {
                continue;
            }
            if r.base() && !kernel {
                write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut text);
                text.push_str(".\n");
                n += 1;
                *by_book.entry(self.eval.h.name(r.persp).to_string()).or_default() += 1;
            }
            drop.push(id);
        }
        std::fs::write(out, &text).map_err(|e| format!("{out}: {e}"))?;
        self.eval.store.remove_many(&drop);
        self.eval.store.dirty = true;
        Ok(Cooled { facts: n, bytes: text.len(), path: out.to_string(), books: by_book.into_iter().collect() })
    }

    /// The book of the fact a kernel row reifies, `$fact(Rel, Book, Args)`.
    fn reified_book(&self, t: Term) -> Option<Sym> {
        let TermK::Func(i) = t.kind() else { return None };
        if self.eval.h.fname(i) != self.eval.v.s_fact {
            return None;
        }
        match self.eval.h.fargs(i).get(1)?.kind() {
            TermK::Atom(b) => Some(b),
            _ => None,
        }
    }

    /// WHAT A VOLUME'S WORLD HOLDS OF ITS OWN, for a driver (docs/surface-split.md): over the facts this world wrote
    /// above the base it was forked from, the keys of those in `books` or of a relation in `rels`, sorted, and every
    /// atom and string their arguments name (nested too), outside the kernel's ledgers and not beginning with
    /// `prefix`: the names a volume can subscribe by.
    pub fn layer_view(&mut self, prefix: &str, books: &[String], rels: &[String]) -> Result<(Vec<String>, Vec<String>), String> {
        // a world not evaluated, or cut by a wall, holds less than its program concludes: a view of it would be taken
        // for the volume's
        if prefix.is_empty() {
            return Err("view needs a prefix: with none every name is excluded".into());
        }
        if self.eval.store.dirty {
            return Err("view: the world is not evaluated".into());
        }
        if self.eval.store.partial_eval {
            return Err("view: the world is partial, a wall cut its evaluation".into());
        }
        let bs: std::collections::HashSet<Sym> = books.iter().map(|b| self.eval.h.intern(b)).collect();
        let rs: std::collections::HashSet<Sym> = rels.iter().map(|r| self.eval.h.intern(r)).collect();
        let mut facts = Vec::new();
        let mut seen: std::collections::HashSet<Term> = std::collections::HashSet::new();
        let mut names = Vec::new();
        for id in self.eval.store.layer_mark()..self.eval.store.len_ids() {
            if !self.eval.store.alive(id) {
                continue;
            }
            let r = self.eval.store.rec(id);
            if is_kernel_ledger(&self.eval.h, r.persp) {
                continue;
            }
            let args = self.eval.store.args(id).to_vec();
            if bs.contains(&r.persp) || rs.contains(&r.rel) {
                facts.push(self.eval.store.key(&self.eval.h, id));
            }
            let mut stack = args;
            while let Some(t) = stack.pop() {
                match t.kind() {
                    TermK::Atom(a) | TermK::Str(a) => {
                        if (matches!(t.kind(), TermK::Str(_)) || !self.eval.h.name(a).starts_with(prefix)) && seen.insert(t) {
                            let mut k = String::new();
                            self.eval.h.canon_term(t, &mut k);
                            names.push(k);
                        }
                    }
                    TermK::Func(i) => stack.extend(self.eval.h.fargs(i).iter().copied()),
                    _ => {}
                }
            }
        }
        facts.sort_by(|a, b| crate::term::cmp_js(a, b));
        names.sort();
        Ok((facts, names))
    }

    /// COOL THE ASSERTION TRAIL: the `why was this here` layer, parked.
    ///
    /// `asserted_by` is two-thirds of what a load writes and half of what a
    /// world then holds — measured on 16 eslint files, 41 722 rows against
    /// 43 078 base facts, and dropping it takes a load from 331 ms to 94. It is
    /// also the layer nobody asks about until something is wrong.
    ///
    /// SEALING IT WOULD BE CHEAPER AND WORSE. `sealed(assertions)` already
    /// exists and gets the same numbers, but the information is then never
    /// written and `why` can never be answered, at any price. Cooling parks it:
    /// the rows go to disk and come back when a question needs them.
    ///
    /// THE HOLE IS WHAT MAKES IT HONEST. A world whose trail is cold must
    /// REFUSE a question about authorship rather than answer it empty, because
    /// an empty audit and a clean one are the same two characters — so the
    /// caller writes `hole($cold(assertions), cooled_to_disk)` as it cools,
    /// exactly as it does for a volume.
    pub fn cool_trail(&mut self, out: &str) -> Result<Cooled, String> {
        self.eval.settle_assertions();
        let ab = self.eval.v.asserted_by;
        let mut ids = Vec::new();
        for id in self.eval.store.all_facts() {
            if self.eval.store.alive(id) && self.eval.store.rec(id).rel == ab {
                ids.push(id);
            }
        }
        let mut text = self.header("$trail");
        for id in &ids {
            let r = self.eval.store.rec(*id);
            let args = self.eval.store.args(*id).to_vec();
            write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut text);
            text.push_str(".\n");
        }
        std::fs::write(out, &text).map_err(|e| format!("{out}: {e}"))?;
        self.eval.store.remove_many(&ids);
        self.eval.store.dirty = true;
        Ok(Cooled { facts: ids.len(), bytes: text.len(), path: out.to_string(), books: Vec::new() })
    }

    /// REHEAT THE TRAIL, PAST THE DOOR, and the signature is what earns that.
    ///
    /// `asserted_by` lives in `[$kernel]`, and a program may not write a kernel
    /// ledger — rightly, since that is the whole `$` ring. So a cooled trail
    /// cannot come back through `load`, and this adds to the store directly.
    ///
    /// THAT IS THE SAME CATEGORY AS `seed::restore`, NOT A NEW ONE: the door
    /// exists to judge UNTRUSTED INPUT, and a file this engine wrote of its own
    /// state is not input, it is the state. What makes the claim checkable is
    /// the header — the volume names the kernel it was written under, and a
    /// mismatch is refused rather than translated, because translating needs
    /// the meaning that has been lost.
    pub fn reheat_trail(&mut self, path: &str) -> Result<usize, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
        let head = text.lines().next().unwrap_or("");
        let want = format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={}", crate::kernel::hash());
        if !head.starts_with(&want) {
            return Err(format!(
                "{path}: not a trail this engine wrote, so what it means is unknown.\n  \
                 header: {head}\n  wanted: {want}..."
            ));
        }
        let cs = rofl_parse::parse(&mut self.eval.h, &text)?;
        let ab = self.eval.v.asserted_by;
        let kp = self.eval.v.kernel_persp;
        let mut n = 0;
        for c in &cs {
            if !c.body.is_empty() || c.lattice.is_some() || c.head.rel != ab {
                return Err(format!("{path}: a trail holds `asserted_by` facts and nothing else"));
            }
            let args = c.head.args.clone();
            if self.eval.store.add(&self.eval.h, ab, kp, &args, F_BASE) {
                n += 1;
            }
        }
        self.eval.store.dirty = true;
        Ok(n)
    }

    /// REHEAT A COOLED VOLUME, refusing one this engine did not write.
    ///
    /// The check is a REFUSAL and never a repair: told the kernel has moved, a
    /// caller re-parses the source, which is cheap — 28 MB/s measured on real
    /// eslint AST facts — and is the only thing that can be right. Rewriting an
    /// old volume to the new meaning would require knowing what it meant, which
    /// is precisely what has been lost.
    ///
    /// THE HOLE, NAMED: a cooled volume is ordinary ROFL, so `load` will take
    /// it without looking at the header. That is deliberate — a volume must
    /// stay readable by anything that reads ROFL, including a person — and it
    /// means the check lives on the path a driver uses rather than on the
    /// format. A driver that reaches for `load` instead of `reheat` gets no
    /// protection, and the gate says so rather than the doc claiming otherwise.
    pub fn reheat(&mut self, path: &str) -> Result<usize, Vec<String>> {
        let text = std::fs::read_to_string(path).map_err(|e| vec![format!("{path}: {e}")])?;
        let head = text.lines().next().unwrap_or("");
        let want = format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={}", crate::kernel::hash());
        if !head.starts_with(&want) {
            return Err(vec![format!(
                "{path}: not a volume this engine wrote, so what it means is unknown.\n                   header: {head}\n  wanted: {want}...\n                   Re-parse the source instead; a volume cannot be translated, because \
                 translating it needs the meaning that has been lost."
            )]);
        }
        self.load_delta(&text, None).map(|(n, _)| n)
    }

    /// Every live BASE fact IN A PROGRAM'S OWN BOOK carrying an atom whose name
    /// begins with `prefix`, looked for inside functors too — an id can be
    /// nested, and a volume that dropped only the top-level mentions would
    /// leave half a file behind.
    ///
    /// WHAT IS WRITTEN AND WHAT IS REMOVED ARE NOT THE SAME SET, and conflating
    /// them is the defect that made cooling useless.
    ///
    /// The kernel writes `in_perspective` and `asserted_by` into `[$kernel]`
    /// about every fact a program asserts, and those rows MENTION the volume —
    /// the fact is reified inside a `$fact(...)` functor, so a prefix search
    /// finds them. The first version excluded them from BOTH halves, which was
    /// half right and wholly wrong:
    ///
    ///   * excluding them from what is WRITTEN is correct. The trail is what
    ///     the kernel says ABOUT an assertion; a reheat IS a fresh assertion
    ///     and earns a fresh trail dated to when it actually happened. A volume
    ///     carrying the old trail would claim a fact was asserted at a time it
    ///     was not — and the door refuses it anyway, since `$` marks a kernel
    ///     ledger a program may not write.
    ///   * excluding them from what is REMOVED left the trail behind forever.
    ///     Measured over 64 eslint files: every file cooled on every tick and
    ///     the world still grew 18 360 -> 295 185 facts, because the trail is
    ///     roughly two rows per fact and none of it ever left. Cooling freed
    ///     the smaller half and kept the larger.
    ///
    /// So: `write` is the program's own facts, `drop` is everything about the
    /// volume including the kernel's account of it.
    pub fn volume(&mut self, prefix: &str) -> (Vec<FactId>, Vec<FactId>) {
        self.eval.settle_provenance();
        let mut write = Vec::new();
        let mut drop = Vec::new();
        for id in self.eval.store.all_facts() {
            if !self.eval.store.alive(id) {
                continue;
            }
            let args = self.eval.store.args(id).to_vec();
            if !args.iter().any(|a| self.mentions(*a, prefix)) {
                continue;
            }
            let r = self.eval.store.rec(id);
            let kernel = is_kernel_ledger(&self.eval.h, r.persp);
            if r.base() && !kernel {
                write.push(id);
            }
            drop.push(id);
        }
        (write, drop)
    }

    /// COOL MANY VOLUMES IN ONE PASS.
    ///
    /// `cool` walks every fact in the world to find one volume's, so cooling N
    /// volumes one at a time is N walks over a world that is still shrinking —
    /// quadratic, and measured as such: 8 volumes a tick over 64 files took
    /// cooling from 73 ms to 4 699 ms while the work per tick was constant.
    /// One pass, N prefixes.
    pub fn cool_many(&mut self, vols: &[(String, String)]) -> Result<Vec<Cooled>, String> {
        // FOUR PHASES, TIMED SEPARATELY, because "cooling is 61 per cent of the
        // run" is not a place you can optimise. Walking the world, matching a
        // prefix, rendering a fact to text and writing bytes are four different
        // costs and only one of them is the FORMAT.
        // A FACT FINDS ITS VOLUME BY LOOKUP, NOT BY SEARCH.
        //
        // This asked, for every fact, whether any of the batch's prefixes
        // matched any of its arguments — a product, and measured as one: over
        // the whole of eslint, matching was 13 168 ms for 456 volumes and
        // 28 852 ms for 658, against 150 ms of rendering and 78 ms of disk.
        // NINETY-EIGHT PER CENT OF COOLING WAS THE SEARCH. `cool_many`'s own
        // comment boasts of replacing one walk per volume with one walk for all
        // of them, and the product had simply moved INSIDE the walk.
        //
        // Volume prefixes are fixed-length strings, so they group by length and
        // each length costs one hash lookup: `name[..len]` against a map. Two
        // volumes of different prefix lengths cost two lookups, not two scans.
        let mut by_len: HashMap<usize, HashMap<&str, usize>> = HashMap::new();
        for (i, (p, _)) in vols.iter().enumerate() {
            by_len.entry(p.len()).or_default().insert(p.as_str(), i);
        }
        self.eval.settle_provenance();
        let mut texts: Vec<String> = vols.iter().map(|(p, _)| self.header(p)).collect();
        let mut counts = vec![0usize; vols.len()];
        let mut drop: Vec<FactId> = Vec::new();
        for id in self.eval.store.all_facts() {
            if !self.eval.store.alive(id) {
                continue;
            }
            let args = self.eval.store.args(id).to_vec();
            let Some(k) = self.volume_of(&args, &by_len) else { continue };
            let r = self.eval.store.rec(id);
            if r.base() && !is_kernel_ledger(&self.eval.h, r.persp) {
                write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut texts[k]);
                texts[k].push_str(".\n");
                counts[k] += 1;
            }
            drop.push(id);
        }
        let mut out = Vec::with_capacity(vols.len());
        for (i, (_, path)) in vols.iter().enumerate() {
            std::fs::write(path, &texts[i]).map_err(|e| format!("{path}: {e}"))?;
            out.push(Cooled { facts: counts[i], bytes: texts[i].len(), path: path.clone(), books: Vec::new() });
        }
        self.eval.store.remove_many(&drop);
        self.eval.store.dirty = true;
        Ok(out)
    }

    /// Which of the batch's volumes this fact belongs to, by lookup.
    ///
    /// Walks the fact's terms once and, for each atom or functor name, tries
    /// one map lookup per distinct prefix LENGTH in the batch — in practice
    /// one, since a scanner mints ids of a single shape. The old form asked
    /// every prefix about every argument, which is the product this replaces.
    fn volume_of(
        &self,
        args: &[Term],
        by_len: &HashMap<usize, HashMap<&str, usize>>,
    ) -> Option<usize> {
        for a in args {
            if let Some(k) = self.volume_of_term(*a, by_len) {
                return Some(k);
            }
        }
        None
    }

    fn volume_of_term(
        &self,
        t: Term,
        by_len: &HashMap<usize, HashMap<&str, usize>>,
    ) -> Option<usize> {
        match t.kind() {
            TermK::Atom(a) => self.lookup_name(self.eval.h.name(a), by_len),
            TermK::Func(i) => {
                if let Some(k) = self.lookup_name(self.eval.h.name(self.eval.h.fname(i)), by_len) {
                    return Some(k);
                }
                self.eval
                    .h
                    .fargs(i)
                    .iter()
                    .find_map(|x| self.volume_of_term(*x, by_len))
            }
            _ => None,
        }
    }

    fn lookup_name(&self, n: &str, by_len: &HashMap<usize, HashMap<&str, usize>>) -> Option<usize> {
        for (len, m) in by_len {
            if n.len() >= *len {
                if let Some(k) = m.get(&n[..*len]) {
                    return Some(*k);
                }
            }
        }
        None
    }

    fn header(&self, prefix: &str) -> String {
        format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={} prefix={prefix}\n",
            crate::kernel::hash())
    }

    fn mentions(&self, t: Term, prefix: &str) -> bool {
        match t.kind() {
            TermK::Atom(a) => self.eval.h.name(a).starts_with(prefix),
            TermK::Func(i) => {
                self.eval.h.name(self.eval.h.fname(i)).starts_with(prefix)
                    || self.eval.h.fargs(i).iter().any(|x| self.mentions(*x, prefix))
            }
            _ => false,
        }
    }

    /// The boundary. Staged `@next` facts are installed here, and here is the
    /// only place a volume may be lifted (measurement 3).
    pub fn tick(&mut self) -> Result<TickOutcome, Halt> {
        self.eval.tick_advance()
    }

    /// Ask one literal, written as ROFL: `edge(a, X)`, `kind[js](F, _)`.
    ///
    /// The query language is the SOURCE language, which is the whole reason the
    /// hand-written parser is in this crate: a caller who can write a rule can
    /// write a question, and there is no second syntax to learn or to keep in
    /// step. `_` and a named variable are both columns; a repeated variable
    /// constrains, as it does in a body.
    pub fn ask(&mut self, query: &str) -> Result<Answer, String> {
        let t0 = std::time::Instant::now();
        self.asks += 1;
        if let Some(m) = &self.eval.promise_broken {
            return Err(m.clone());
        }
        let src = format!("{}.", query.trim().trim_end_matches('.'));
        let cs = rofl_parse::parse(&mut self.eval.h, &src)?;
        if cs.len() != 1 || !cs[0].body.is_empty() || cs[0].lattice.is_some() {
            return Err("ask takes exactly one literal".into());
        }
        let lit = &cs[0].head;
        let (rel, persp, args) = self.lit_terms(lit)?;
        // ASKING A SEALED BODY REFUSES, as src/api.ts `query` does: a hole named for the question, and a partial answer
        if crate::program::sealed_rels(&mut self.eval).contains(&rel) && brk!("ask_sealed_answers" => false; true) {
            let q = self.eval.h.intern("$q");
            let id = self.eval.h.mkf(q, &[Term::int(self.asks)]);
            let reason = Term::atom(self.eval.h.intern("reflection_sealed"));
            self.eval.store.put(&self.eval.h, self.eval.v.hole, self.eval.v.kernel_persp, &[id, reason], F_BASE | crate::store::F_FROZEN);
            let vars = args.iter().filter_map(|a| match a.kind() { TermK::Var(v) => Some(v), _ => None }).map(|v| self.eval.h.name(v).to_string()).fold(Vec::new(), |mut vs: Vec<String>, n| {
                if !vs.contains(&n) {
                    vs.push(n);
                }
                vs
            });
            return Ok(Answer { vars, rows: Vec::new(), keys: Vec::new(), scanned: 0, probed: false, micros: t0.elapsed().as_micros(), shrugs: Vec::new(), partial: true });
        }
        if let Some(m) = self.eval.outside_cone(rel) {
            return Err(m);
        }
        if rel == self.eval.v.derived_by || rel == self.eval.v.asserted_by {
            self.eval.settle_provenance();
        }
        let persp_opt = match lit.book {
            Book::Bare => None,
            _ => Some(persp),
        };

        // The bound positions, and the variables in order of first appearance.
        // A variable seen twice is not a second column, it is a constraint —
        // recorded here as the position it must equal.
        let mut pos: Vec<usize> = Vec::new();
        let mut vals: Vec<Term> = Vec::new();
        let mut vars: Vec<String> = Vec::new();
        let mut col: Vec<usize> = Vec::new(); // for each var, the position read
        let mut same: Vec<(usize, usize)> = Vec::new();
        for (i, a) in args.iter().enumerate() {
            match a.kind() {
                TermK::Var(s) => {
                    let n = self.eval.h.name(s).to_string();
                    match vars.iter().position(|v| *v == n) {
                        Some(j) => same.push((col[j], i)),
                        None => {
                            vars.push(n);
                            col.push(i);
                        }
                    }
                }
                _ => {
                    pos.push(i);
                    vals.push(*a);
                }
            }
        }

        // A RELATION UNFOLDED AT A CALL is answered as the reference's `query` answers it: its rules
        // unfolded under the question, which leaves the world as it was (`Eval::answer_on_demand`)
        let mut partial = self.eval.store.partial_eval;
        let (rows, keys, scanned, probed) = if self.eval.answers_open(rel) && brk!("ask_store_only" => false; true) {
            let el = self.one_lit(query)?;
            // A WALL MET ANSWERING is a hole named for the question, and the answer is partial
            let (sols, unnamed) = match self.eval.answer_on_demand(&el) {
                Ok(got) => got,
                Err(Halt::Budget(wall, _)) if brk!("ask_wall_errors" => false; true) => {
                    let q = self.eval.h.intern("$q");
                    let id = self.eval.h.mkf(q, &[Term::int(self.asks)]);
                    // the hole says which wall fell: steps or rows
                    let reason = Term::atom(brk!("ask_wall_unnamed" => self.eval.v.budget_reason; self.eval.h.intern(wall)));
                    self.eval.store.put(&self.eval.h, self.eval.v.hole, self.eval.v.kernel_persp, &[id, reason], crate::store::F_BASE | crate::store::F_FROZEN);
                    (Vec::new(), true)
                }
                Err(h) => return Err(describe(&h)),
            };
            partial |= unnamed;
            let mut named: Vec<usize> = (0..vars.len()).collect();
            named.sort_by(|a, b| crate::term::cmp_js(&vars[*a], &vars[*b]));
            let mut got: Vec<(String, Vec<String>, String)> = Vec::new();
            let mut texts: std::collections::HashSet<String> = std::collections::HashSet::new();
            for sol in &sols {
                let row: Vec<String> = vars
                    .iter()
                    .map(|v| {
                        let vt = self.eval.h.var(v);
                        let t = crate::term::resolve(&mut self.eval.h, vt, sol);
                        let mut o = String::new();
                        self.eval.h.canon_term(t, &mut o);
                        o
                    })
                    .collect();
                let text = if vars.is_empty() { "true".to_string() } else { named.iter().map(|&i| format!("{} = {}", vars[i], row[i])).collect::<Vec<_>>().join(", ") };
                let seen = brk!("ask_dedup_scan" => got.iter().any(|g| g.0 == text); !texts.insert(text.clone()));
                if seen {
                    continue;
                }
                let fa: Vec<Term> = args.iter().map(|a| crate::term::resolve(&mut self.eval.h, *a, sol)).collect();
                let mut k = String::new();
                write_fact_key(&self.eval.h, rel, persp, &fa, &mut k);
                got.push((text, row, k));
            }
            got.sort_by(|a, b| crate::term::cmp_js(&a.0, &b.0));
            let n = got.len();
            let (rows, keys): (Vec<Vec<String>>, Vec<String>) = got.into_iter().map(|(_, r, k)| (r, k)).unzip();
            (rows, keys, n, false)
        } else {
            // A RELATION ANSWERED FROM A STRUCTURE (the closure of a declared tree) has no rows to find: its rows are read off the tree
            let virt: Option<Vec<(Sym, Vec<Term>)>> = match self.eval.alias_query(rel, persp_opt, &args) {
                Some(rows) => Some(rows),
                None => self.eval.vclosure_query(rel, persp_opt, &args).map(|v| v.into_iter().map(|(b, a, d)| (b, vec![a, d])).collect()),
            };
            let cand = if virt.is_some() {
                Some(Vec::new())
            } else {
                self.eval.store.arg_matches(&self.eval.h, rel, persp_opt, args.len(), &pos, &vals)
            };
            let probed = cand.is_some();
            let ids = match cand {
                Some(v) => v,
                None => match persp_opt {
                    Some(p) => self.eval.store.rel_persp(&self.eval.h, rel, p),
                    None => self.eval.store.rel_all(&self.eval.h, rel),
                },
            };
            let scanned = ids.len() + virt.as_ref().map_or(0, |v| v.len());

            // `arg_matches` promises a SUPERSET in no order (src/store.ts:477), so
            // every candidate is re-checked here. Skipping this is how a query
            // engine reports rows its index merely suggested.
            let mut rows = Vec::new();
            let mut keys = Vec::new();
            for id in ids {
                if !self.eval.store.alive(id) {
                    continue;
                }
                let fa = self.eval.store.args(id);
                if fa.len() != args.len() {
                    continue;
                }
                if pos.iter().zip(&vals).any(|(&i, v)| fa[i] != *v) {
                    continue;
                }
                if same.iter().any(|&(a, b)| fa[a] != fa[b]) {
                    continue;
                }
                let mut row = Vec::with_capacity(col.len());
                for &i in &col {
                    let mut s = String::new();
                    self.eval.h.canon_term(fa[i], &mut s);
                    row.push(s);
                }
                let r = self.eval.store.rec(id);
                let mut k = String::new();
                write_fact_key(&self.eval.h, r.rel, r.persp, fa, &mut k);
                rows.push(row);
                keys.push(k);
            }
            for (book, fa) in virt.unwrap_or_default() {
                if fa.len() != args.len() || pos.iter().zip(&vals).any(|(&i, v)| fa[i] != *v) || same.iter().any(|&(x, y)| fa[x] != fa[y]) {
                    continue;
                }
                let row: Vec<String> = col
                    .iter()
                    .map(|&i| {
                        let mut s = String::new();
                        self.eval.h.canon_term(fa[i], &mut s);
                        s
                    })
                    .collect();
                let mut k = String::new();
                write_fact_key(&self.eval.h, rel, book, &fa, &mut k);
                rows.push(row);
                keys.push(k);
            }
            (rows, keys, scanned, probed)
        };

        let lit = self.one_lit(query)?;
        let mut shrugs: Vec<(Vec<String>, String)> = Vec::new();
        let mut order: Vec<String> = Vec::new();
        for (f, s) in self.eval.shrugs_of(&lit) {
            let row: Vec<String> = vars
                .iter()
                .map(|v| {
                    let vt = self.eval.h.var(v);
                    let t = crate::term::resolve(&mut self.eval.h, vt, &s);
                    if matches!(t.kind(), TermK::Var(_)) { "_".to_string() } else { self.eval.shown(t) }
                })
                .collect();
            let line = self.eval.shrug_line(f);
            {
                // one per reading and reason, the least line where several say it, ordered as the bindings read,
                // then by the reason (`query`, src/api.ts)
                let reason = self.eval.store.args(f)[1];
                let mut key = if vars.is_empty() { "true".to_string() } else { vars.iter().zip(&row).map(|(v, x)| format!("{v} = {x}")).collect::<Vec<_>>().join(", ") };
                key.push('\u{0}');
                match reason.kind() {
                    TermK::Atom(s) => key.push_str(self.eval.h.name(s)),
                    _ => self.eval.h.canon_term(reason, &mut key),
                }
                match order.iter().position(|k| *k == key) {
                    Some(i) if crate::term::cmp_js(&line, &shrugs[i].1).is_lt() => shrugs[i] = (row, line),
                    Some(_) => {}
                    None => {
                        order.push(key);
                        shrugs.push((row, line));
                    }
                }
            }
        }
        let mut by: Vec<usize> = (0..shrugs.len()).collect();
        by.sort_by(|a, b| crate::term::cmp_js(&order[*a], &order[*b]));
        let mut shrugs: Vec<(Vec<String>, String)> = by.into_iter().map(|i| std::mem::take(&mut shrugs[i])).collect();
        // A WALL CUT THE WORLD: every answer that does not hold is no answer
        if self.eval.store.partial_eval {
            let budget = self.eval.h.atom("budget");
            for f in self.eval.store.rel_persp(&self.eval.h, self.eval.v.shrug, self.eval.v.kernel_persp) {
                let a = self.eval.store.args(f).to_vec();
                let kernel_target = match a[0].kind() {
                    TermK::Atom(s) => self.eval.h.name(s).starts_with('$'),
                    TermK::Func(i) => self.eval.h.name(self.eval.h.fname(i)).starts_with('$'),
                    _ => false,
                };
                if a[1] == budget && kernel_target {
                    shrugs.push((vars.iter().map(|_| "_".to_string()).collect(), self.eval.shrug_line(f)));
                    break;
                }
            }
        }
        Ok(Answer { vars, rows, keys, scanned, probed, micros: t0.elapsed().as_micros(), shrugs, partial })
    }

    /// Whether nothing could ever put a row at this question (src/api.ts `query`'s `unpopulatable`): the relation is declared, concluded
    /// and held by nothing, or asked at an arity or in a book no rule or fact of it uses. A small stored relation says its arities.
    pub fn unpopulatable(&mut self, query: &str) -> Result<bool, String> {
        let src = format!("{}.", query.trim().trim_end_matches('.'));
        let cs = rofl_parse::parse(&mut self.eval.h, &src)?;
        if cs.len() != 1 { return Err("ask takes exactly one literal".into()); }
        let (rel, persp, args) = self.lit_terms(&cs[0].head)?;
        let (mut arities, mut persps, mut any_persp) = (HashSet::new(), HashSet::new(), false);
        for r in &self.eval.rules {
            let head = &r.clause.head;
            if head.rel != rel { continue; }
            arities.insert(head.args.len());
            match head.persp.as_atom() { Some(p) => { persps.insert(p); } None => any_persp = true }
        }
        persps.extend(self.eval.store.perspectives_of(&self.eval.h, rel));
        if arities.is_empty() && self.eval.store.rel_count(rel) <= 64 {
            for id in self.eval.store.rel_all(&self.eval.h, rel) { arities.insert(self.eval.store.args(id).len()); }
        }
        let declared = self.eval.store.has(self.eval.v.edb, self.eval.v.main, &[Term::atom(rel)]);
        let wrong_book = !persps.is_empty() && !any_persp && !persps.contains(&persp);
        let known = !arities.is_empty() || !persps.is_empty() || declared;
        Ok(!known || (!arities.is_empty() && !arities.contains(&args.len())) || wrong_book)
    }

    /// A parsed literal, in this world's vocabulary.
    ///
    /// The terms arrive finished: the parser interns into this same heap, so
    /// there is nothing left to convert. What remains is the book, which is a
    /// SOURCE notion — absent, named, or a variable — and only the first two
    /// mean anything to a question.
    /// `Rofl.save` (src/api.ts:261): this world as a seed, which `open` reads
    /// back. The way OUT existed on one side only until now — a port that can
    /// be handed a world and cannot hand one back is half a pipe.
    ///
    /// ONE FIELD GOES OUT EMPTY AND IT IS NOT A ROUNDING ERROR: `evals`, the
    /// per-tick record of what the standing evaluation was allowed and what it
    /// spent. This store does not keep it; `crate::seed` says why it matters.
    pub fn save(&mut self) -> String {
        self.eval.settle_provenance();
        crate::seed::snapshot(&self.eval.h, &self.eval.store)
    }

    /// `Rofl.run` (src/api.ts:1199): boundaries until the world stops moving.
    ///
    /// `quiescent` is the answer the caller wants; `partial` is the one they
    /// have to handle. Running out of budget mid-tick is NOT a pause — the
    /// hole is written into the world and a later, larger budget does not undo
    /// it (f_the_cost_pin_measures_a_fixpoint_that_never_finishes). A caller
    /// who wants to stop and continue stops AT A BOUNDARY, with `tick`.
    pub fn run(&mut self, max_ticks: usize) -> Result<(u32, bool, bool), String> {
        for _ in 0..max_ticks {
            let r = self.tick().map_err(|h| describe(&h))?;
            if r.partial {
                return Ok((self.eval.store.tick, false, true));
            }
            if r.quiescent {
                return Ok((self.eval.store.tick, true, false));
            }
        }
        Ok((self.eval.store.tick, false, false))
    }

    /// `Rofl.holds` (src/api.ts:834). The question with its answer thrown
    /// away — kept because `ask(...)?.rows.is_empty()` at every call site is
    /// how a caller starts writing their own query layer.
    pub fn holds(&mut self, query: &str) -> Result<bool, String> {
        Ok(!self.ask(query)?.rows.is_empty())
    }

    /// `Rofl.factKeys` (src/api.ts:1220), in canonical order. `rel` narrows.
    pub fn fact_keys(&mut self, rel: Option<&str>) -> Vec<String> {
        let want = rel.map(|r| self.eval.h.intern(r));
        if want.is_none_or(|w| w == self.eval.v.derived_by || w == self.eval.v.asserted_by) {
            self.eval.settle_provenance();
        }
        let mut out = Vec::new();
        for id in self.eval.store.live_ids() {
            if want.is_some_and(|w| self.eval.store.rec(id).rel != w) {
                continue;
            }
            out.push(self.eval.store.key(&self.eval.h, id));
        }
        out.sort_by(|a, b| crate::term::cmp_js(a, b));
        out
    }

    /// `Rofl.retract` (src/api.ts:651): take a BASE fact out, and the
    /// `asserted_by` row that recorded who put it there with it.
    ///
    /// A DERIVED FACT IS REFUSED BY NAME rather than removed, because removing
    /// it would leave the rule that concluded it still concluding it — the
    /// caller wants `excise` and is told so.
    pub fn retract(&mut self, query: &str) -> Result<(), String> {
        self.eval.settle_assertions();
        let (id, key) = self.ground_fact(query, "retract")?;
        let Some(id) = id else { return Err(format!("no such fact: {key}")) };
        if !self.eval.store.rec(id).base() {
            return Err(format!("{key} is derived; retract its supports instead"));
        }
        let doomed = self.doomed(id);
        let rel = self.eval.store.rec(id).rel;
        let asks = rel == self.eval.v.asks || (rel == self.eval.v.explain_request && self.eval.cone.is_some());
        self.eval.store.remove_many(&doomed);
        self.eval.store.dirty = true;
        if brk!("asks_retract_unread" => false; asks) {
            self.eval.reprepare();
        }
        Ok(())
    }

    /// `retract`, bringing the aggregate cells the fact supported to the state
    /// a fresh evaluation would hold without evaluating the world again
    /// (`Eval::retract_delta`). The world is evaluated first if it is not. A
    /// world or a fact the path is not worked out for is retracted as
    /// `retract` does, and `Full` says why: the next evaluation answers.
    pub fn retract_delta(&mut self, query: &str) -> Result<Retraction, String> {
        self.eval.settle_assertions();
        let (id, key) = self.ground_fact(query, "retract")?;
        let Some(id) = id else { return Err(format!("no such fact: {key}")) };
        if !self.eval.store.rec(id).base() {
            return Err(format!("{key} is derived; retract its supports instead"));
        }
        let rel = self.eval.store.rec(id).rel;
        let ft = self.fact_term(id);
        let request = [self.eval.h.mkf_named("retract", &[ft])];
        if rel == self.eval.v.asks || (rel == self.eval.v.explain_request && self.eval.cone.is_some()) {
            self.retract(query)?;
            let why = "asks names the rules the world runs";
            self.evaluated_again(&request, why);
            return Ok(Retraction::Full(why.to_string()));
        }
        self.settle()?;
        let doomed = self.doomed(id);
        let marks: Vec<Sym> = doomed.iter().map(|&f| self.eval.store.rec(f).rel).filter(|r| [self.eval.v.edb, self.eval.v.authority].contains(r)).collect();
        let read = brk!("retract_edb_unread" => false; true) && self.eval.rules.iter().any(|r| r.clause.body.iter().any(|b| b.lits_deep().iter().any(|l| marks.contains(&l.rel))));
        let delta = if read { Err("the retraction takes an edb or authority row a rule reads".to_string()) } else { self.eval.retract_delta(&doomed) };
        match delta {
            Ok(d) => {
                if let Err(e) = self.eval.check_promises() {
                    brk!("function_retract_clean" => (); self.eval.store.dirty = true);
                    return Err(crate::describe(&e));
                }
                Ok(Retraction::Delta(d))
            }
            Err(why) => {
                if self.eval.store.alive(id) {
                    self.eval.store.remove_many(&doomed);
                }
                self.eval.store.dirty = true;
                self.evaluated_again(&request, &why);
                Ok(Retraction::Full(why))
            }
        }
    }

    /// `Rofl.excise` (src/api.ts:1070): what this base fact is holding up.
    ///
    /// A FORK, THE FACT REMOVED, A CLEAN RE-EVALUATION, AND THE DIFF IS THE
    /// BLAST RADIUS. This world is not touched — the question is counterfactual
    /// and an instrument that answers it by damaging its subject has only one
    /// use.
    pub fn excise(&mut self, query: &str) -> Result<(Vec<String>, Vec<String>), String> {
        self.eval.settle_assertions();
        self.eval.store.unordered = false;
        let (id, key) = self.ground_fact(query, "excise")?;
        let Some(id) = id else { return Err(format!("{key} is not a base fact")) };
        if !self.eval.store.rec(id).base() {
            return Err(format!("{key} is not a base fact"));
        }
        self.settle()?;
        if self.eval.cone.is_some() && !self.eval.pruned.is_empty() {
            return Err(EXCISE_UNDER_ASKS.to_string());
        }
        let before = self.visible();
        let mut scratch = self.fork();
        scratch.retract(query)?;
        scratch.evaluate().map_err(|h| describe(&h))?;
        let after = scratch.visible();
        let removed: Vec<String> = before.iter().filter(|k| !after.contains(*k)).cloned().collect();
        let added: Vec<String> = after.iter().filter(|k| !before.contains(*k)).cloned().collect();
        Ok((removed, added))
    }

    /// The keys a caller can see: the kernel's own ledgers are the engine
    /// talking to itself and would put the whole reification in every diff.
    fn visible(&mut self) -> std::collections::BTreeSet<String> {
        let hide: std::collections::HashSet<Sym> = self
            .eval
            .v
            .reserved_set
            .iter()
            .copied()
            .chain([self.eval.v.stratum, self.eval.v.unstratified])
            .collect();
        let mut out = std::collections::BTreeSet::new();
        for id in self.eval.store.live_ids() {
            if hide.contains(&self.eval.store.rec(id).rel) {
                continue;
            }
            out.insert(self.eval.store.key(&self.eval.h, id));
        }
        out.extend(self.eval.store.virtual_keys(&self.eval.h));
        out
    }

    /// One ground literal, as the fact it names: the id when the store holds
    /// it, and the key either way so the caller is told WHICH fact was meant.
    /// A refusal names the verb, as the reference's does ("excise needs a
    /// ground fact", src/api.ts).
    fn ground_fact(&mut self, query: &str, verb: &str) -> Result<(Option<FactId>, String), String> {
        let lit = self.one_lit(query)?;
        // the ground check is `why`'s; only the refusal names this verb
        let p = self.eval.why_ground(&lit).map_err(|_| format!("{verb} needs a ground fact"))?;
        let mut key = String::new();
        write_fact_key(&self.eval.h, lit.rel, p, &lit.args, &mut key);
        Ok((self.eval.store.get(lit.rel, p, &lit.args), key))
    }

    /// The fact `id` with its `asserted_by` rows, and the kernel's rows a load wrote for it alone: `edb(R)` when no
    /// other base fact of R stands, the `authority` rows of its book when no other base fact stands there and no rule
    /// names the book. A fresh load without the fact writes none of them. A row the program declared itself (its own
    /// `asserted_by` stands) stays, and so does every row where a seal withholds what would tell the two apart.
    fn doomed(&mut self, id: FactId) -> Vec<FactId> {
        let mut out = vec![id];
        let ft = self.fact_term(id);
        let v = &self.eval.v;
        let (ab, edb, authority, main, kernel_who, anon_who, writes_to, reads_from) =
            (v.asserted_by, v.edb, v.authority, v.main, v.kernel_who, v.anon_who, v.writes_to, v.reads_from);
        let declared: Vec<(FactId, Term)> = self.eval.store.rel_all(&self.eval.h, ab).into_iter().map(|f| (f, self.eval.store.args(f)[0])).collect();
        out.extend(declared.iter().filter(|(_, t)| *t == ft).map(|(f, _)| *f));
        let withheld = crate::program::sealed_rels(&mut self.eval);
        if brk!("retract_keeps_edb" => true; withheld.contains(&ab)) {
            return out;
        }
        let (rel, persp) = (self.eval.store.rec(id).rel, self.eval.store.rec(id).persp);
        let mut marks: Vec<FactId> = Vec::new();
        let others = self.eval.store.rel_all(&self.eval.h, rel).into_iter().any(|f| f != id && self.eval.store.rec(f).base());
        if !self.eval.v.is_reserved(rel) && !others {
            marks.extend(self.eval.store.get(edb, main, &[Term::atom(rel)]));
        }
        if persp != main && !self.eval.h.name(persp).starts_with('$') && !withheld.contains(&writes_to) && !self.eval.store.book_holds_base(&self.eval.h, persp, id) {
            let named = [writes_to, reads_from].into_iter().any(|r| self.eval.store.rel_all(&self.eval.h, r).into_iter().any(|f| self.eval.store.args(f)[1] == Term::atom(persp)));
            if !named {
                for w in [kernel_who, anon_who] {
                    marks.extend(self.eval.store.get(authority, main, &[Term::atom(persp), Term::atom(w)]));
                }
            }
        }
        for m in marks {
            let mt = self.fact_term(m);
            if self.eval.store.alive(m) && !declared.iter().any(|(_, t)| *t == mt) {
                out.push(m);
            }
        }
        out
    }

    /// `doomed` of a set of base facts taken out together, the facts themselves left out: the `asserted_by` rows
    /// written of them, and the kernel's marks a load wrote for the set alone (`edb(R)` where no base fact of R
    /// stands outside the set, a book's `authority` rows where none of the book does). Each relation and book is
    /// asked once, and each answer stops at the first fact outside the set: no relation is listed.
    fn doomed_of_set(&mut self, facts: &[FactId]) -> Vec<FactId> {
        let set: HashSet<FactId> = facts.iter().copied().collect();
        let v = &self.eval.v;
        let (ab, edb, authority, main, kernel_who, anon_who, writes_to, reads_from) =
            (v.asserted_by, v.edb, v.authority, v.main, v.kernel_who, v.anon_who, v.writes_to, v.reads_from);
        let mut out: Vec<FactId> = Vec::new();
        // the rows already written: the pending ones are written of live facts only (`settle_assertions`)
        let mut declared: Vec<(FactId, Term)> = Vec::new();
        if self.eval.store.rel_count(ab) > 0 {
            let terms: HashSet<Term> = facts.iter().map(|&f| self.fact_term(f)).collect();
            for g in self.eval.store.rel_all(&self.eval.h, ab) {
                let t = self.eval.store.args(g)[0];
                if terms.contains(&t) {
                    out.push(g);
                }
                declared.push((g, t));
            }
        }
        let withheld = crate::program::sealed_rels(&mut self.eval);
        if brk!("retract_keeps_edb" => true; withheld.contains(&ab)) {
            return out;
        }
        let mut marks: Vec<FactId> = Vec::new();
        let rels: std::collections::BTreeSet<Sym> = facts.iter().map(|&f| self.eval.store.rec(f).rel).collect();
        for rel in rels {
            if !self.eval.v.is_reserved(rel) && !self.eval.store.base_outside(rel, None, &set) {
                marks.extend(self.eval.store.get(edb, main, &[Term::atom(rel)]));
            }
        }
        let books: std::collections::BTreeSet<Sym> = facts.iter().map(|&f| self.eval.store.rec(f).persp).collect();
        for persp in books {
            if persp != main && !self.eval.h.name(persp).starts_with('$') && !withheld.contains(&writes_to) && !self.eval.store.book_base_outside(persp, &set) {
                let named = [writes_to, reads_from].into_iter().any(|r| self.eval.store.rel_all(&self.eval.h, r).into_iter().any(|f| self.eval.store.args(f)[1] == Term::atom(persp)));
                if !named {
                    for w in [kernel_who, anon_who] {
                        marks.extend(self.eval.store.get(authority, main, &[Term::atom(persp), Term::atom(w)]));
                    }
                }
            }
        }
        // a mark the program also declared itself (its assertion written, or noted to be) stays
        let noted: HashSet<FactId> = if marks.is_empty() { HashSet::new() } else { self.eval.pending_assert.iter().map(|n| n.0).collect() };
        for m in marks {
            let mt = self.fact_term(m);
            if self.eval.store.alive(m) && !declared.iter().any(|(_, t)| *t == mt) && !noted.contains(&m) {
                out.push(m);
            }
        }
        out
    }

    /// `$fact(rel, persp, args)` — how `asserted_by` names the fact it is about.
    fn fact_term(&mut self, id: FactId) -> Term {
        let r = self.eval.store.rec(id);
        let (rel, persp) = (r.rel, r.persp);
        let args = self.eval.store.args(id).to_vec();
        crate::reflect::fact_term(&mut self.eval.h, &self.eval.v, rel, persp, &args)
    }

    /// `Rofl.why` (src/api.ts:841). The question is written in the SOURCE
    /// language, as `ask` is: a caller who can write a rule can write a why.
    pub fn why(&mut self, query: &str) -> Result<String, String> {
        let lit = self.one_lit(query)?;
        self.ground_lit(&lit)?;
        self.explaining()?;
        self.cone_holds(&lit)?;
        self.settle_if_provenance(&lit);
        let text = self.eval.why_text(&lit, Some(query))?;
        Ok(match self.scanned_by(&lit) { Some(by) => format!("{text}\n{by}"), None => text })
    }

    /// `why`, with every member of every aggregate cell it passes through,
    /// where `why` prints a digest of the first `WHY_MEMBERS`.
    pub fn why_all(&mut self, query: &str) -> Result<String, String> {
        let lit = self.one_lit(query)?;
        self.ground_lit(&lit)?;
        self.explaining()?;
        self.cone_holds(&lit)?;
        self.settle_if_provenance(&lit);
        let text = self.eval.why_text_with(&lit, &WhyOpts { members: usize::MAX, query: String::new() }, Some(query))?;
        Ok(match self.scanned_by(&lit) { Some(by) => format!("{text}\n{by}"), None => text })
    }

    /// THE EXPLAIN BRIDGE, and why it exists: `why` and `whynot` are host
    /// verbs, and a `.rofl` world cannot call one, so a property of their text
    /// had no world that could hold it. A program asks with
    /// `explain_request(Kind, Atom)` — `Kind` is `why`, `why_all` or
    /// `whynot`, `Atom` is `rel(args...)` in the main book — and after an
    /// evaluation this answers each, in key order, as
    /// `explained[$explain](Kind, Atom, I, "line")`, one row per line from
    /// I = 1, or one row at I = 0 carrying the refusal. `$explain` is a `$`
    /// ledger: a program reads it and cannot write it. The rows are base and
    /// tick-scoped; the caller evaluates again so rules can read them.
    /// Returns how many requests were answered.
    pub fn explain_requests(&mut self) -> Result<usize, String> {
        self.eval.store.unordered = false;
        // a plain program is evaluated again by the aggregate evaluator, whose
        // planner and explanations the reference answers these with
        if self.eval.plain {
            self.eval.agg_forced = true;
            self.eval.reprepare();
            self.eval.store.dirty = true;
            let r = self.eval.ensure();
            let r = r.map_err(|h| describe(&h)).and_then(|_| self.answer_explain_requests());
            self.eval.agg_forced = false;
            self.eval.reprepare();
            self.eval.store.dirty = true;
            return r;
        }
        self.answer_explain_requests()
    }

    fn answer_explain_requests(&mut self) -> Result<usize, String> {
        let (req, main) = (self.eval.v.explain_request, self.eval.v.main);
        let mut asks: Vec<(String, Term, Term)> = Vec::new();
        for f in self.eval.store.rel_persp(&self.eval.h, req, main) {
            let args = self.eval.store.args(f).to_vec();
            if args.len() != 2 {
                continue;
            }
            let k = self.eval.store.key(&self.eval.h, f);
            asks.push((k, args[0], args[1]));
        }
        asks.sort_by(|a, b| crate::term::cmp_js(&a.0, &b.0));
        let (why, why_all, whynot) = (self.eval.h.intern("why"), self.eval.h.intern("why_all"), self.eval.h.intern("whynot"));
        let mut rows: Vec<(Term, Term, i64, String)> = Vec::new();
        for (_, kind, atom) in &asks {
            let lit = match atom.kind() {
                TermK::Atom(rel) => Ok(reflect::Lit { rel, persp: Term::atom(main), persp_explicit: false, args: Vec::new(), temporal: reflect::Temporal::Now }),
                TermK::Func(i) => Ok(reflect::Lit {
                    rel: self.eval.h.fname(i),
                    persp: Term::atom(main),
                    persp_explicit: false,
                    args: self.eval.h.fargs(i).to_vec(),
                    temporal: reflect::Temporal::Now,
                }),
                _ => Err("an explain request names an atom: rel(args...)".to_string()),
            };
            let text = lit.and_then(|l| self.eval.outside_cone(l.rel).map_or(Ok(l), Err)).and_then(|l| match kind.as_atom() {
                Some(k) if k == why => self.eval.why_text(&l, None),
                Some(k) if k == why_all => brk!("why_all_digest" => self.eval.why_text(&l, None);
                    self.eval.why_text_with(&l, &WhyOpts { members: usize::MAX, query: String::new() }, None)),
                Some(k) if k == whynot => self.eval.whynot_text(&l, &EXPLAIN_WHYNOT_BOUNDS, None).map(|(_, t)| t).map_err(|h| describe(&h)),
                _ => Err("the kinds of explanation are why, why_all and whynot".to_string()),
            });
            match text {
                Ok(t) => {
                    for (i, line) in t.lines().enumerate() {
                        rows.push((*kind, *atom, i as i64 + 1, line.to_string()));
                    }
                }
                Err(e) => rows.push((*kind, *atom, 0, e)),
            }
        }
        let (rel, book) = (self.eval.v.explained, self.eval.v.explain_persp);
        for (kind, atom, i, line) in rows {
            let l = self.eval.h.string(&line);
            self.eval.store.add(&self.eval.h, rel, book, &[kind, atom, Term::int(i), l], F_BASE | F_TICK);
        }
        self.eval.store.dirty = true;
        Ok(asks.len())
    }

    /// BETWEEN TWO ROUNDS OF A WALK THE WORLD GOES COLD (docs/cli.md): the evaluated world is kept as a volume and
    /// mapped back, so what the rounds before brought in lies in the file and not on the heap, and the heap it held
    /// is given back. The world is the same fact for fact; only where it lives changes.
    fn cool_round(&mut self) -> Result<(), String> {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("rofl-round-{}-{n}.vol", std::process::id())).to_string_lossy().to_string();
        self.keep_volume(&path).map_err(|e| format!("{path}: {e}"))?;
        let opened = Session::open_volume(&path, self.eval.budget);
        let _ = std::fs::remove_file(&path);
        let mut s = opened?;
        let e = &self.eval;
        (s.eval.space, s.eval.mode, s.eval.retain_ticks, s.eval.on_hot) = (e.space, e.mode, e.retain_ticks, e.on_hot);
        s.eval.scans = std::mem::take(&mut self.eval.scans);
        s.eval.scan_signs = std::mem::take(&mut self.eval.scan_signs);
        s.eval.scan_asof = std::mem::take(&mut self.eval.scan_asof);
        (s.dangling, s.asks) = (self.dangling, self.asks);
        *self = s;
        trim_heap();
        Ok(())
    }

    /// THE WORLD ASKS FOR FACTS IT DOES NOT HAVE (docs/cli.md, "A world that asks for its own input"). Each
    /// `scan_request(Kind, Path)` with a `scanner(Kind, Command)` and no `scan_done` or `scan_failed` row yet runs the
    /// command with the path as its last argument, all of them at once; what each prints is loaded as ROFL by delta,
    /// with `scan_done(Kind, Path, Clauses)` or `scan_failed(Kind, Path, Message)` beside it. The number of requests run:
    /// none means the world asks for nothing more.
    pub fn scan_requests(&mut self) -> Result<usize, String> {
        let main = self.eval.v.main;
        // each argument as written back (`js`, `"a.js"`) and as its text (`js`, `a.js`)
        let rows = |s: &mut Self, rel: &str, n: usize| -> Vec<Vec<(String, String)>> {
            let r = s.eval.h.intern(rel);
            s.eval.store.rel_persp(&s.eval.h, r, main).into_iter().map(|f| s.eval.store.args(f).to_vec()).filter(|a| a.len() == n).map(|a| {
                a.iter().map(|t| (s.eval.h.canon(*t), match t.kind() { TermK::Atom(x) | TermK::Str(x) => s.eval.h.name(x).to_string(), _ => s.eval.h.canon(*t) })).collect()
            }).collect()
        };
        let scanners: HashMap<String, String> = rows(self, "scanner", 2).into_iter().map(|r| (r[0].0.clone(), r[1].1.clone())).collect();
        // how long a kind's snapshot sources are kept, where the world says (else the scanner's `-- ttl:`)
        let ttls: HashMap<String, u64> = rows(self, "scan_ttl", 2).into_iter().filter_map(|r| Some((r[0].0.clone(), r[1].1.parse().ok()?))).collect();
        let done: HashSet<(String, String)> = rows(self, "scan_done", 3).into_iter().chain(rows(self, "scan_failed", 3))
            .map(|r| (r[0].0.clone(), r[1].0.clone())).collect();
        let mut todo: Vec<((String, String), String)> = rows(self, "scan_request", 2).into_iter()
            .map(|r| ((r[0].0.clone(), r[1].0.clone()), r[1].1.clone())).filter(|(k, _)| !done.contains(k)).collect();
        todo.sort();
        todo.dedup();
        if todo.is_empty() {
            return Ok(0);
        }
        // the stamps of a round are taken once: the scanner's code, which every scan of a kind shares, is read once
        let stamps = Stamps::default();
        let runs: Vec<_> = todo.iter().map(|((kind, _), path)| {
            let cmd = scanners.get(kind).cloned();
            let (path, stamps) = (path.clone(), stamps.clone());
            let ttl = ttls.get(kind).copied();
            std::thread::spawn(move || run_scan(cmd.as_deref(), &path, &stamps, ttl))
        }).collect();
        // while the scanners run, the world goes cold
        self.cool_round()?;
        let mut recs = Vec::with_capacity(todo.len());
        for (((kind, path), text), run) in todo.iter().zip(runs) {
            let ran = run.join().unwrap_or_else(|_| Err("the scanner's thread failed".into()));
            recs.push(scan_rec(kind, path, text, scanners.get(kind).cloned(), ran, &stamps, ttls.get(kind).copied())?);
        }
        for rec in &recs {
            self.signed(rec)?;
        }
        self.load_scans(&recs)?;
        for rec in &recs {
            self.as_of(rec);
        }
        self.eval.scans.extend(recs);
        Ok(todo.len())
    }

    /// What the scans `recs` brought, loaded by delta, each kind's facts asserted by its scanner (`asserted_by`,
    /// which is how `why` names it). Why an addition went whole, where one did.
    pub fn load_scans(&mut self, recs: &[crate::engine::ScanRec]) -> Result<Option<String>, String> {
        let mut kinds: Vec<&str> = recs.iter().map(|r| r.kind.as_str()).collect();
        kinds.sort();
        kinds.dedup();
        let mut whole = None;
        for kind in kinds {
            let src: String = recs.iter().filter(|r| r.kind == kind).map(|r| r.unit.as_str()).collect();
            match self.load_delta(&src, Some(&scanner_who(kind))) {
                Err(d) => return Err(format!("a scanner's facts were refused: {}", d.join("; "))),
                Ok((_, Addition::Full(why))) => whole = whole.or(Some(why)),
                Ok(_) => {}
            }
        }
        Ok(whole)
    }

    /// A scan whose facts rest on a snapshot: the world's answers about its kind are as of the oldest time taken.
    pub fn as_of(&mut self, rec: &crate::engine::ScanRec) {
        if let Some(t) = snapshot_time(&rec.sources).filter(|_| crate::brk!("scan_asof_dropped" => false; true)) {
            let e = self.eval.scan_asof.entry(rec.kind.clone()).or_insert_with(|| t.clone());
            if t < *e { *e = t; }
        }
    }

    /// What the world's answers rest on that is a snapshot: a sentence for each kind of scan, as of when.
    pub fn as_of_said(&self) -> Vec<String> {
        self.eval.scan_asof.iter().map(|(k, t)| format!("the facts of the scanner `{k}` are as of {t}: a snapshot of a source with no version")).collect()
    }

    /// THE SCAN HELD TO THE WORLD'S OTHER SCANS OF ITS KIND: a world holds the facts of one version of a scanner's
    /// code. A scan by code that changed while the world was scanned is refused, naming the files that changed.
    pub fn signed(&mut self, rec: &crate::engine::ScanRec) -> Result<(), String> {
        if rec.sign.is_empty() {
            return Ok(());
        }
        match self.eval.scan_signs.get(&rec.kind) {
            Some((sign, code)) if *sign != rec.sign && crate::brk!("scan_mixed_signs" => false; true) => {
                let was: HashMap<&str, &str> = code.iter().map(|(p, s)| (p.as_str(), s.as_str())).collect();
                let mut moved: Vec<String> = rec.code.iter().filter(|(p, s)| was.get(p.as_str()) != Some(&s.as_str())).map(|(p, _)| shown_path(p))
                    .chain(code.iter().filter(|(p, _)| !rec.code.iter().any(|(q, _)| q == p)).map(|(p, _)| shown_path(p))).collect();
                moved.dedup();
                Err(format!("the world would hold the facts of two versions of the scanner `{}`, code {sign} and code {}: {} changed while it was scanned; evaluate it again",
                    rec.kind, rec.sign, moved.join(", ")))
            }
            Some(_) => Ok(()),
            None => {
                self.eval.scan_signs.insert(rec.kind.clone(), (rec.sign.clone(), rec.code.clone()));
                Ok(())
            }
        }
    }

    /// A FILE OF FACTS A SCAN WROTE IS SIGNED BY THE SCANNER'S CODE (docs/cli.md, "A scan names its code"): its
    /// `-- scanner: NAME SUM` and `-- code: PATH SUM` lines, PATH from the file's directory, are held to the code as it
    /// is now. A file whose code changed since it was written, or a scanner's output that is not signed, is refused
    /// with how to scan it again; so is a world that would hold files of two versions of one scanner. The files of
    /// the code, absolute, for a kept world to stamp; none for a file no scanner wrote.
    pub fn signed_file(&mut self, text: &str, file: &str) -> Result<Vec<String>, String> {
        let (mut scanner, mut code, mut reads, mut again) = (None, Vec::new(), false, None);
        for l in text.lines().take_while(|l| l.is_empty() || l.starts_with("--")) {
            if let Some(r) = l.strip_prefix("-- scanner: ") {
                scanner = r.rsplit_once(' ');
            } else if let Some(r) = l.strip_prefix("-- code: ") {
                code.push(code_line(r));
            } else if l.starts_with("-- reads: ") {
                reads = true;
            } else if let Some(r) = l.strip_prefix("-- again: ") {
                again = Some(r);
            }
        }
        if scanner.is_none() && code.is_empty() && !reads {
            return Ok(Vec::new());
        }
        let shown = shown_path(file);
        let again = again.map_or_else(|| "run its scanner again".to_string(), |a| format!("scan again: {a}"));
        let Some((name, sign)) = scanner.filter(|_| !code.is_empty() && code.iter().all(|(_, s)| s.is_some())) else {
            return Err(format!("{shown} is a scanner's output not signed by its code (`-- scanner: NAME SUM` and `-- code: PATH SUM`, docs/cli.md \"A scan names its code\"), written before scans were signed, so its facts may be an older scanner's; {again}"));
        };
        let dir = std::path::Path::new(file).parent().map(std::path::Path::to_path_buf).unwrap_or_default();
        let mut now: Vec<(String, String)> = Vec::new();
        let mut moved: Vec<String> = Vec::new();
        for (p, s) in &code {
            let at = scan_path(&dir.join(p).to_string_lossy());
            let st = scan_stamp(&at);
            if Some(st.as_str()) != *s {
                moved.push(shown_path(&at));
            }
            now.push((at, st));
        }
        if !moved.is_empty() && crate::brk!("scan_file_signature_ignored" => false; true) {
            return Err(format!("{shown} was written by the scanner `{name}` from code that has changed since: {}; its facts would outlive that code. {again}", moved.join(", ")));
        }
        if code_sign(&now) != sign && crate::brk!("scan_file_signature_ignored" => false; true) {
            return Err(format!("{shown}: its `-- scanner: {name} {sign}` is not the sum of the code it names; {again}"));
        }
        now.sort();
        let rec = crate::engine::ScanRec { kind: name.to_string(), sign: sign.to_string(), code: now.clone(), ..Default::default() };
        self.signed(&rec).map_err(|e| format!("{shown}: {e}"))?;
        Ok(now.into_iter().map(|(p, _)| p).collect())
    }

    /// The scanner whose code brought the base fact `lit` into the world, as `why` names it: its kind, the sum of
    /// its code and the files that sum is over. None for a fact no scan brought.
    fn scanned_by(&mut self, lit: &reflect::Lit) -> Option<String> {
        if self.eval.scan_signs.is_empty() || crate::brk!("scan_why_unsigned" => true; false) {
            return None;
        }
        let p = self.eval.why_ground(lit).ok()?;
        let id = self.eval.store.get(lit.rel, p, &lit.args)?;
        if !self.eval.store.rec(id).base() {
            return None;
        }
        self.eval.settle_assertions();
        let f = self.fact_term(id);
        let (ab, kp) = (self.eval.v.asserted_by, self.eval.v.kernel_persp);
        let whos: Vec<Term> = self.eval.store.rel_persp(&self.eval.h, ab, kp).into_iter().map(|r| self.eval.store.args(r).to_vec())
            .filter(|a| a.len() == 3 && a[0] == f).map(|a| a[1]).collect();
        let mut lines: Vec<String> = whos.iter().filter_map(|w| {
            let who = match w.kind() { TermK::Atom(x) | TermK::Str(x) => self.eval.h.name(x).to_string(), _ => return None };
            let kind = who.strip_prefix("scanner:")?;
            let (sign, code) = self.eval.scan_signs.get(kind)?;
            let files: Vec<String> = code.iter().map(|(p, _)| shown_path(p)).collect();
            let asof = self.eval.scan_asof.get(kind).map_or(String::new(), |t| format!(", as of {t}"));
            Some(format!("  brought in by the scanner `{kind}`, code {sign} ({}){asof}", files.join(", ")))
        }).collect();
        lines.dedup();
        (!lines.is_empty()).then(|| lines.join("\n"))
    }

    /// The scan requests that hold, each as its kind and path written back.
    pub fn scan_requests_held(&mut self) -> HashSet<(String, String)> {
        let main = self.eval.v.main;
        let r = self.eval.h.intern("scan_request");
        let rows: Vec<Vec<Term>> = self.eval.store.rel_persp(&self.eval.h, r, main).into_iter().map(|f| self.eval.store.args(f).to_vec()).filter(|a| a.len() == 2).collect();
        rows.into_iter().map(|a| (self.eval.h.canon(a[0]), self.eval.h.canon(a[1]))).collect()
    }

    /// The scan of `text` (its path, written back as `path`) for `kind` run again with `cmd`, the storeroom
    /// answering while what it read holds: what it brings, as `scan_requests` loads it.
    pub fn rescan(kind: &str, path: &str, text: &str, cmd: Option<String>, ttl: Option<u64>) -> Result<crate::engine::ScanRec, String> {
        let stamps = Stamps::default();
        let ran = run_scan(cmd.as_deref(), text, &stamps, ttl);
        scan_rec(kind, path, text, cmd, ran, &stamps, ttl)
    }

    /// `Rofl.whynot` (src/api.ts:927). `(holds, text)` — a literal that HOLDS
    /// is the answer, not an error, and says so in the same shape.
    ///
    /// THE WORLD IS SETTLED BEFORE THE QUESTION IS PARSED, in the reference's
    /// order (`ensure`, then `asked`), so a world that halts says so before a
    /// malformed question is refused — in both engines.
    ///
    /// A WALL MET WHILE DEMONSTRATING IS THE ANSWER: `holds: false` with the
    /// wall named (`wall: budget_exhausted`), as both of the reference's
    /// whynots give it (src/api.ts `whynot`, `describeHalt`) — a demand that
    /// unfolds without end has no demonstration, and saying which wall stopped
    /// it is the demonstration there is. The aggregate path answers every halt
    /// so; the plain one answers a wall and refuses the rest, as its evaluator
    /// throws them.
    pub fn whynot(&mut self, query: &str, b: &WhynotBounds) -> Result<(bool, String), String> {
        self.explaining()?;
        let lit = self.one_lit(query)?;
        self.cone_holds(&lit)?;
        self.settle_if_provenance(&lit);
        match self.eval.whynot_text(&lit, b, Some(query.trim())) {
            Ok(r) => Ok(r),
            Err(h @ Halt::Budget(..)) => Ok((false, describe(&h))),
            Err(h) if !self.eval.plain => Ok((false, describe(&h))),
            Err(h) => Err(describe(&h)),
        }
    }

    /// `whynot` by file (`Eval::whynot_files`): a row for each file of `vols`,
    /// a key prefix and the file's name. A wall met is no table.
    pub fn whynot_files(&mut self, query: &str, b: &WhynotBounds, vols: &[(String, String)]) -> Result<Vec<WhynotFile>, String> {
        self.explaining()?;
        let lit = self.one_lit(query)?;
        self.cone_holds(&lit)?;
        match self.eval.whynot_files(&lit, b, vols) {
            Ok(r) => Ok(r),
            Err(Halt::Budget(..)) => Ok(Vec::new()),
            Err(h) => Err(describe(&h)),
        }
    }

    /// A `why` is of a ground literal, and is told so before the world is
    /// evaluated for it (src/api.ts `why` checks before `ensure`). The check
    /// is `Eval::why_ground`'s, the one `why_text` makes again on its own.
    fn ground_lit(&self, lit: &reflect::Lit) -> Result<(), String> {
        self.eval.why_ground(lit).map(|_| ())
    }

    /// `Rofl.ensure`: an explanation is of the settled world, so a world with
    /// unjudged facts in it is evaluated first, and a settled one is not
    /// evaluated again.
    fn settle(&mut self) -> Result<(), String> {
        self.eval.ensure().map(|_| ()).map_err(|h| describe(&h))
    }

    /// An explanation reads candidates in key order, as the reference does, whatever order the evaluation took.
    fn explaining(&mut self) -> Result<(), String> {
        self.settle()?;
        self.eval.store.unordered = false;
        Ok(())
    }

    /// One literal, parsed and lowered. `ask` open-codes the same first three
    /// lines because it goes on to read the columns; these two want the
    /// evaluator's `Lit` and nothing else.
    /// A question about a `derived_by` row reads the rows, so the deferred
    /// ones are written first, as `ask` does.
    fn settle_if_provenance(&mut self, lit: &reflect::Lit) {
        if lit.rel == self.eval.v.derived_by || lit.rel == self.eval.v.asserted_by {
            self.eval.settle_provenance();
        }
    }

    /// A question about a relation the cone of `asks` left out is refused, never answered from what the cone holds.
    fn cone_holds(&self, lit: &reflect::Lit) -> Result<(), String> {
        self.eval.outside_cone(lit.rel).map_or(Ok(()), Err)
    }

    fn one_lit(&mut self, query: &str) -> Result<reflect::Lit, String> {
        self.eval.parse_lit(query)
    }

    fn lit_terms(&mut self, l: &rofl_parse::Lit) -> Result<(Sym, Sym, Vec<Term>), String> {
        let persp = match l.book {
            Book::Bare => self.eval.v.main,
            Book::Named(n) => n,
            Book::Var(n) => {
                return Err(format!(
                    "a book variable has nothing to bind to here: {}",
                    self.eval.h.name(n)
                ))
            }
        };
        let (h, v) = (&mut self.eval.h, &self.eval.v);
        let args: Vec<Term> = l.args.iter().map(|t| crate::program::canon_sets(h, v, *t)).collect();
        crate::program::check_query_sets(h, v, &args)?;
        Ok((l.rel, persp, args))
    }
}

/// THE STOREROOM OF SCANS (docs/cli.md): a scanner names its own code, a `-- code: PATH` line for each file of it,
/// and what it read, a `-- reads: PATH` line for each file and directory. Its output is kept under
/// `$XDG_CACHE_HOME/rofl/scans` (else `~/.cache/rofl/scans`), each of those paths stamped; the same command for the
/// same path is answered from there while every stamp still holds, and runs again when one does not, so a byte of
/// the scanner's code changed runs every scan again. A scanner that names nothing it read is always run.
fn scan_kept(cmd: &str, path: &str) -> Option<std::path::PathBuf> {
    let home = std::env::var_os("XDG_CACHE_HOME").map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::Path::new(&h).join(".cache")))?;
    let cwd = std::env::current_dir().ok()?;
    Some(home.join("rofl/scans").join(format!("{}.rofl", crate::store::fnv64(&format!("{}\0{cmd}\0{path}", cwd.display())))))
}

/// The stamps of one round of scans, each path stamped once: the scanner's code is shared by every scan of a kind,
/// and a directory a scanner lists by every scan of it.
#[derive(Clone, Default)]
struct Stamps(std::sync::Arc<std::sync::Mutex<HashMap<String, String>>>);

impl Stamps {
    fn of(&self, p: &str) -> String {
        if let Some(s) = self.0.lock().unwrap().get(p) {
            return s.clone();
        }
        let s = scan_stamp(p);
        self.0.lock().unwrap().insert(p.to_string(), s.clone());
        s
    }
}

/// One scan run: the storeroom's answer while every stamp and every source holds, else the command run with the
/// path last. A kept scan whose sources could not be checked is never answered: the scanner runs, and if it fails
/// too, the scan fails saying both.
fn run_scan(cmd: Option<&str>, path: &str, stamps: &Stamps, ttl: Option<u64>) -> Result<String, String> {
    let cmd = cmd.ok_or("no scanner(Kind, Command) for this kind")?;
    let kept = scan_kept(cmd, path);
    let mut unchecked = None;
    if let Some(k) = kept.as_deref().filter(|_| crate::brk!("scan_storeroom_bypassed" => false; true)) {
        match scan_fresh(k, stamps, cmd, path, ttl) {
            Fresh::Kept(out) => return Ok(out),
            Fresh::Unchecked(why) => unchecked = Some(why),
            Fresh::Stale => {}
        }
    }
    let ran = scan_command(cmd, path, false).and_then(|o| String::from_utf8(o).map_err(|_| "the scanner printed bytes that are not UTF-8".to_string()));
    let out = ran.map_err(|e| unchecked.map_or(e.clone(), |u| format!("{u}; and the scan itself failed: {e}")))?;
    if let Some(k) = kept {
        scan_keep(&k, &out, stamps);
    }
    Ok(out)
}

/// The scanner's command run with `path` last, its stdout; in the check mode (`ROFL_SCAN_CHECK=1`) the scanner
/// prints only its sources' tokens, without drawing their data.
fn scan_command(cmd: &str, path: &str, check: bool) -> Result<Vec<u8>, String> {
    let mut argv = cmd.split_whitespace();
    let prog = argv.next().ok_or("an empty command")?;
    let mut c = std::process::Command::new(prog);
    c.args(argv).arg(path);
    if check {
        c.env("ROFL_SCAN_CHECK", "1");
    }
    let o = c.output().map_err(|e| format!("{prog}: {e}"))?;
    if !o.status.success() {
        let err = String::from_utf8_lossy(&o.stderr);
        return Err(format!("{cmd} exited {}: {}", o.status.code().unwrap_or(-1), err.lines().last().unwrap_or("")));
    }
    Ok(o.stdout)
}

/// The sources a scan's output names that are not files: `-- source: URI TOKEN` (versioned) or `-- source: URI
/// @TIME` (a snapshot taken at TIME), each as `URI TOKEN`.
pub fn sources_of(out: &str) -> Vec<String> {
    out.lines().filter_map(|l| l.strip_prefix("-- source: ")).map(str::to_string).collect()
}

/// The seconds a scan's snapshot sources may be kept, as its `-- ttl: SECONDS` line says.
pub fn ttl_of(out: &str) -> Option<u64> {
    out.lines().find_map(|l| l.strip_prefix("-- ttl: ")).and_then(|t| t.trim().parse().ok())
}

/// `YYYY-MM-DDTHH:MM:SSZ` as seconds since 1970.
fn epoch(t: &str) -> Option<i64> {
    let n = |a: usize, b: usize| t.get(a..b)?.parse::<i64>().ok();
    if t.len() < 20 || !t.ends_with('Z') { return None; }
    let (y, m, d) = (n(0, 4)?, n(5, 7)?, n(8, 10)?);
    let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let days = 365 * y + y / 4 - y / 100 + y / 400 + (153 * m + 2) / 5 + d - 1 - 719_468;
    Some(days * 86_400 + n(11, 13)? * 3600 + n(14, 16)? * 60 + n(17, 19)?)
}

/// The oldest snapshot time among `sources`, as written.
pub fn snapshot_time(sources: &[String]) -> Option<String> {
    sources.iter().filter_map(|s| s.rsplit_once(" @").map(|(_, t)| t.to_string())).min()
}

/// WHETHER THE SOURCES A KEPT SCAN DREW FROM STILL HOLD (docs/cli.md, "A scan names its sources"): a snapshot while
/// it is younger than `ttl` (none: never); a versioned source while the scanner, asked in its check mode, gives the
/// same token. Why not, otherwise, and whether the check itself failed.
pub fn sources_hold(cmd: &str, path: &str, sources: &[String], ttl: Option<u64>) -> Result<(), (bool, String)> {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64);
    let mut versioned: Vec<(&str, &str)> = Vec::new();
    for s in sources {
        let Some((uri, tok)) = s.rsplit_once(' ') else { return Err((false, format!("`-- source: {s}` names no token"))) };
        match tok.strip_prefix('@') {
            Some(t) if crate::brk!("scan_source_ttl_ignored" => false; true) => match ttl {
                None => {
                    static SAID: std::sync::Once = std::sync::Once::new();
                    SAID.call_once(|| eprintln!("the scan `{cmd}` draws from {uri}, a snapshot, and no TTL is declared (`-- ttl: SECONDS`, or scan_ttl(Kind, Seconds)): it runs every time"));
                    return Err((false, format!("{uri} is a snapshot with no TTL")));
                }
                Some(ttl) => {
                    let age = epoch(t).map(|t| now - t).ok_or((false, format!("{uri}: `@{t}` is not a time")))?;
                    if age > ttl as i64 { return Err((false, format!("{uri} was taken at {t}, past its TTL of {ttl} s"))); }
                }
            },
            Some(_) => {}
            None => versioned.push((uri, tok)),
        }
    }
    if versioned.is_empty() || crate::brk!("scan_source_token_ignored" => true; false) {
        return Ok(());
    }
    let out = scan_command(cmd, path, true).map_err(|e| (true, format!("the check of its sources failed ({e}), so the kept scan is not known to be current")))?;
    let out = String::from_utf8_lossy(&out);
    let now: HashMap<&str, &str> = out.lines().filter_map(|l| l.strip_prefix("-- source: ")).filter_map(|s| s.rsplit_once(' ')).collect();
    for (uri, tok) in versioned {
        match now.get(uri) {
            Some(t) if *t == tok => {}
            Some(t) => return Err((false, format!("{uri} moved: {tok} then, {t} now"))),
            None => return Err((true, format!("the check of its sources did not name {uri}, so the kept scan is not known to be current"))),
        }
    }
    Ok(())
}

/// The paths a scan's output names on its `-- PREFIX PATH` lines, from the directory the scan ran in; a code line's
/// sum left out.
fn named(out: &str, prefix: &str) -> Vec<String> {
    out.lines().filter_map(|l| l.strip_prefix(prefix)).map(|r| scan_path(code_line(r).0)).collect()
}

/// `PATH SUM` of a `-- code:` line, or `PATH` alone: the path and the sum it says.
fn code_line(r: &str) -> (&str, Option<&str>) {
    match r.rsplit_once(' ') {
        Some((p, s)) if s.len() == 16 && s.bytes().all(|c| c.is_ascii_hexdigit()) => (p, Some(s)),
        _ => (r, None),
    }
}

/// The sum of a scanner's code: of its files' sums, sorted, each on its line (scanners/own_code.ts `codeLines`).
fn code_sign(code: &[(String, String)]) -> String {
    let mut sums: Vec<&str> = code.iter().map(|(_, s)| s.as_str()).collect();
    sums.sort();
    crate::arena::Sum::of(sums.iter().map(|s| format!("{s}\n")).collect::<String>().as_bytes())
}

/// The asserter of a kind's scanned facts, as `asserted_by` names it.
fn scanner_who(kind: &str) -> String {
    format!("scanner:{kind}")
}

/// What one scan brings, its `scan_done` or `scan_failed` row last, what it read and the code that read it.
/// A SCAN NAMES ITS CODE, OR IT IS REFUSED: a scanner's output that names no file of its code, or a file that is not
/// there, could outlive the code that made it.
fn scan_rec(kind: &str, path: &str, text: &str, cmd: Option<String>, ran: Result<String, String>, stamps: &Stamps, mut ttl: Option<u64>) -> Result<crate::engine::ScanRec, String> {
    let q = |s: &str| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""));
    let (mut read, mut code, mut sign, mut sources) = (Vec::new(), Vec::new(), String::new(), Vec::new());
    if let Ok(out) = &ran {
        let paths = named(out, "-- code: ");
        let said = cmd.as_deref().unwrap_or("");
        if paths.is_empty() && crate::brk!("scan_code_optional" => false; true) {
            return Err(format!("the scanner `{said}` named none of its own code (a `-- code: PATH` line for each file of it), so what it brought could outlive it: its scan of {text} is refused (docs/cli.md, \"A scan names its code\")"));
        }
        code = paths.iter().map(|p| (p.clone(), stamps.of(p))).collect();
        code.sort();
        code.dedup();
        if let Some((p, _)) = code.iter().find(|(_, s)| s == "gone") {
            return Err(format!("the scanner `{said}` names {} as its code, and there is no such file", shown_path(p)));
        }
        sign = code_sign(&code);
        sources = sources_of(out);
        ttl = ttl.or(ttl_of(out));
        read = named(out, "-- reads: ");
        // what the scan is stale by: what it read, and its code
        if crate::brk!("scan_code_unstamped" => false; true) {
            read.extend(code.iter().map(|(p, _)| p.clone()));
        }
    }
    let unit = match ran {
        Ok(out) => {
            let n = out.lines().filter(|l| !l.starts_with("--") && l.trim_end().ends_with('.')).count();
            format!("{out}\nscan_done({kind}, {path}, {n}).\n")
        }
        Err(e) => format!("scan_failed({kind}, {path}, {}).\n", q(&e)),
    };
    Ok(crate::engine::ScanRec { kind: kind.into(), path: path.into(), text: text.into(), cmd, read, code, sign, sources, ttl, unit })
}

/// A path a scanner named, from the directory the scan ran in.
fn scan_path(p: &str) -> String {
    std::env::current_dir().map_or_else(|_| p.to_string(), |d| d.join(p).to_string_lossy().into_owned())
}

/// A path as the reader of a message knows it: from the working directory when it lies below it.
fn shown_path(p: &str) -> String {
    let cwd = std::env::current_dir().unwrap_or_default();
    std::path::Path::new(p).strip_prefix(&cwd).map_or_else(|_| p.to_string(), |r| r.to_string_lossy().into_owned())
}

/// A file by its bytes, a directory by the names in it, nothing for a path that is gone.
fn scan_stamp(p: &str) -> String {
    let p = std::path::Path::new(p);
    if let Ok(d) = std::fs::read_dir(p) {
        let mut names: Vec<String> = d.flatten().map(|e| {
            let dir = e.file_type().map_or(false, |t| t.is_dir());
            format!("{}{}", e.file_name().to_string_lossy(), if dir { "/" } else { "" })
        }).collect();
        names.sort();
        return crate::store::fnv64(&names.join("\n"));
    }
    std::fs::read(p).map_or_else(|_| "gone".into(), |b| crate::arena::Sum::of(&b))
}

/// What the storeroom holds for a scan: an answer while it holds, nothing it holds, or a kept answer whose sources
/// could not be checked.
enum Fresh {
    Kept(String),
    Stale,
    Unchecked(String),
}

fn scan_fresh(kept: &std::path::Path, stamps: &Stamps, cmd: &str, path: &str, ttl: Option<u64>) -> Fresh {
    let Ok(text) = std::fs::read_to_string(kept) else { return Fresh::Stale };
    for l in text.lines() {
        let Some(r) = l.strip_prefix("-- kept: ") else { break };
        let Some((stamp, p)) = r.split_once(' ') else { return Fresh::Stale };
        if stamps.of(p) != stamp && crate::brk!("scan_kept_stale_answered" => false; true) { return Fresh::Stale; }
    }
    // kept before scans named their code: not known to be this code's
    if !text.contains("\n-- code: ") {
        return Fresh::Stale;
    }
    let sources = sources_of(&text);
    match if sources.is_empty() { Ok(()) } else { sources_hold(cmd, path, &sources, ttl.or(ttl_of(&text))) } {
        Ok(()) => Fresh::Kept(text),
        Err((true, why)) => Fresh::Unchecked(why),
        Err((false, _)) => Fresh::Stale,
    }
}

/// The output kept with a stamp of every path it is stale by: what it read and its code; its sources are in it.
/// Not kept when it names nothing it read and no source, since whether it is stale could not be told.
fn scan_keep(kept: &std::path::Path, out: &str, stamps: &Stamps) {
    let reads = named(out, "-- reads: ");
    if reads.is_empty() && sources_of(out).is_empty() { return; }
    let code = named(out, "-- code: ").into_iter().filter(|_| crate::brk!("scan_code_unstamped" => false; true));
    let mut text: String = reads.into_iter().chain(code).map(|p| format!("-- kept: {} {p}\n", stamps.of(&p))).collect();
    text.push_str(out);
    let tmp = kept.with_extension(format!("{}.tmp", std::process::id()));
    let _ = kept.parent().map(std::fs::create_dir_all);
    if std::fs::write(&tmp, text).is_ok() { let _ = std::fs::rename(&tmp, kept); }
}

#[cfg(all(target_os = "linux", target_env = "gnu"))]
fn trim_heap() {
    extern "C" {
        fn malloc_trim(pad: usize) -> i32;
    }
    unsafe { malloc_trim(0) };
}

#[cfg(not(all(target_os = "linux", target_env = "gnu")))]
fn trim_heap() {}
