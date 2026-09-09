//! The evaluator: semi-naive fixpoint, the front, the join, provenance.
//!
//! A port of `src/engine.ts` plus `src/rounds.ts`. `RoundEvaluation` is what
//! `src/api.ts` runs by default (`opts.evaluator ?? 'rounds'`, src/api.ts:181),
//! so it is what the corpus oracle was produced by and what `Mode::Rounds`
//! reproduces here; `Mode::Strata` is the stock path, and it is not decoration
//! — the kernel's own `safety.rofl` sub-evaluation runs under it.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use crate::dense::dense_clauses;
use crate::reflect::*;
use crate::store::{
    write_fact_key, FactId, FactRec, PremRef, StagedHead, Store, Witness, F_BASE, F_FROZEN, F_TICK,
};
use crate::term::*;

pub const SAFETY_DENSE: &str = include_str!(concat!(env!("OUT_DIR"), "/safety.dense"));

const MAX_DEPTH: usize = 512;
const MAX_ALTERNATIONS: usize = 256;
const DEFAULT_SPACE: i64 = 500_000;
const POLICY_BUDGET: i64 = 20_000_000;

#[derive(Debug)]
pub enum Halt {
    /// A wall: `budget_exhausted` or `space_exhausted`, plus the rule that was
    /// holding the rows when the space wall was reached.
    Budget(&'static str, Option<Sym>),
    Strat(String, String),
    Bug(String),
}

pub struct ERule {
    pub id: Sym,
    pub clause: Clause,
    pub canon: String,
    pub safe: bool,
    pub has_neg: bool,
    pub pos_rels: Vec<Sym>,
    pub has_demand_prem: bool,
    pub trigger_rels: Vec<Sym>,
    pub plan: Vec<BodyElem>,
}

#[derive(Default)]
pub struct Front {
    pub keys: HashSet<FactId>,
    pub by_rel: HashMap<Sym, HashSet<FactId>>,
}

impl Front {
    fn note(&mut self, rel: Sym, id: FactId) {
        self.keys.insert(id);
        self.by_rel.entry(rel).or_default().insert(id);
    }
}

#[derive(Clone)]
struct Sol {
    s: Subst,
    prems: Vec<PremRef>,
}

/// A key that survives the derived layer being cleared, which a `FactId` does
/// not: the alternating fixpoint compares two rounds' fact SETS and each round
/// rebuilds the facts.
type FKey = (Sym, Sym, Box<[Term]>);

#[derive(Default, Clone)]
struct Assumption {
    recs: HashMap<FKey, FactId>,
    by_rel: HashMap<Sym, Vec<FactId>>,
}

#[derive(Default)]
struct RuleAnswer {
    unsafe_rules: Vec<Sym>,
    demand_rels: Vec<Sym>,
    trigger: HashMap<Sym, Vec<Sym>>,
    late: Vec<Sym>,
    neg_rels: Vec<Sym>,
    reads_provenance: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Rounds,
    Strata,
}

/// `StagedFact` (src/engine.ts:55). The head AND the firing that concluded it:
/// the boundary installs the head, and then writes the witness and the
/// `derived_by` row from the rule and the premises — dated to the tick being
/// ENTERED, not the one that derived it (src/api.ts:1061).
#[derive(Clone)]
pub struct StagedFact {
    pub rel: Sym,
    pub persp: Sym,
    pub args: Vec<Term>,
    pub rule: Sym,
    pub prems: Vec<PremRef>,
}

/// A frozen-layer retention policy, owned. `store::KeepFrozen` is the borrowed
/// form the store is handed.
type Retention = Box<dyn Fn(&FactRec, &[Term]) -> bool>;

/// `Rofl.tickAdvance`'s answer (src/api.ts:1038).
pub struct TickOutcome {
    pub advanced: bool,
    pub quiescent: bool,
    pub partial: bool,
}

pub struct Eval {
    pub h: Heap,
    pub v: Vocab,
    pub store: Store,
    pub budget: i64,
    pub space: i64,
    /// WHICH RULE IS FIRING, and how many index probes each one has asked for.
    ///
    /// `argm_calls` on the store is the aggregate, and it is what showed that
    /// time now tracks the number of probes rather than the size of the world
    /// (2.19, 2.27, 2.19, 2.25 microseconds a call across 8 to 64 files of
    /// eslint/lib). The aggregate says the engine is linear in the work it is
    /// asked to do; it cannot say WHICH RULE is asking for more of it as the
    /// corpus grows, and that question belongs to the rules.
    ///
    /// A field rather than a threaded argument, which is the same shape
    /// scanners/eval_cost.ts uses on the reference side: `fire_rule` sets it
    /// and restores it, so a probe is attributed to whichever rule's body is
    /// being solved, including through demand unfolding.
    pub cur_rule: Option<Sym>,
    pub argm_by_rule: HashMap<Sym, u64>,
    pub naive: bool,
    pub mode: Mode,
    pub steps: i64,
    pub rows: i64,
    pub peak_rows: i64,
    pub diags: Vec<String>,
    pub rules: Vec<Rc<ERule>>,
    pub well_founded: bool,
    hole_id: Term,
    demand_rels: Vec<(Sym, Vec<Rc<ERule>>)>,
    active: Vec<Rc<ERule>>,
    staged: HashMap<FKey, StagedFact>,
    rename_counter: u64,
    cur_front: Front,
    assume: Option<Rc<Assumption>>,
    bootstrap: bool,
    answer: RuleAnswer,
    no_provenance: bool,
    /// `Rofl.retainTicks` (src/api.ts:165): how many COMPLETED ticks of frozen
    /// provenance to keep, or none set — which keeps everything and is what
    /// the corpus runs under.
    pub retain_ticks: Option<u32>,
}

pub struct Outcome {
    pub partial: bool,
    pub staged: usize,
}

impl Eval {
    pub fn new(mut h: Heap, store: Store, budget: i64, mode: Mode, bootstrap: bool) -> Eval {
        let v = Vocab::new(&mut h);
        let hole_id = h.atom("$adhoc");
        let mut e = Eval {
            h,
            v,
            store,
            budget,
            space: DEFAULT_SPACE,
            cur_rule: None,
            argm_by_rule: HashMap::new(),
            naive: false,
            mode,
            steps: 0,
            rows: 0,
            peak_rows: 0,
            diags: Vec::new(),
            rules: Vec::new(),
            well_founded: false,
            hole_id,
            demand_rels: Vec::new(),
            active: Vec::new(),
            staged: HashMap::new(),
            rename_counter: 0,
            cur_front: Front::default(),
            assume: None,
            bootstrap,
            answer: RuleAnswer::default(),
            no_provenance: false,
            retain_ticks: None,
        };
        e.prepare();
        e
    }

    fn fkey(&self, rel: Sym, persp: Sym, args: &[Term]) -> FKey {
        (rel, persp, args.into())
    }
    fn fkey_of(&self, id: FactId) -> FKey {
        let r = self.store.rec(id);
        (r.rel, r.persp, self.store.args(id).into())
    }

    // ------------------------------------------------------------- prepare

    fn prepare(&mut self) {
        self.well_founded = well_founded_declared(&mut self.h, &self.v, &mut self.store);
        self.no_provenance = sealed_bodies(&mut self.h, &self.v, &mut self.store)
            .contains(&self.v.sealed_provenance);
        let (rules, diags) = decode_rules(&mut self.h, &self.v, &mut self.store);
        self.diags.extend(diags);
        self.answer = self.safety_answer(&rules);
        if self.no_provenance && self.answer.reads_provenance {
            self.diags.push(format!(
                "provenance is sealed; rules reading '{}' will match nothing",
                self.h.name(self.v.derived_by)
            ));
        }
        let mut kept: Vec<ERule> = Vec::new();
        for r in rules {
            if self.v.is_reserved(r.clause.head.rel) {
                self.diags.push(format!(
                    "rule {} concludes into a kernel relation; not executable",
                    self.h.name(r.id)
                ));
                continue;
            }
            kept.push(self.classify(r));
        }
        // WHICH RELATIONS ARE DEMAND-BACKED IS safety.rofl'S ANSWER; grouping
        // the rules that define one is this method's.
        let mut by_rel: HashMap<Sym, Vec<usize>> = HashMap::new();
        for (i, r) in kept.iter().enumerate() {
            if r.clause.head.temporal == Temporal::Next {
                continue;
            }
            by_rel.entry(r.clause.head.rel).or_default().push(i);
        }
        let mut drs: Vec<Sym> = self.answer.demand_rels.clone();
        drs.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        let demand: Vec<(Sym, Vec<usize>)> = drs
            .into_iter()
            .filter_map(|rel| by_rel.get(&rel).map(|is| (rel, is.clone())))
            .collect();
        let demand_names: Vec<Sym> = demand.iter().map(|(r, _)| *r).collect();
        for r in kept.iter_mut() {
            r.has_demand_prem = r.pos_rels.iter().any(|x| demand_names.contains(x));
            let mut trig: Vec<Sym> = Vec::new();
            for p in &r.pos_rels {
                match self.answer.trigger.get(p) {
                    Some(xs) => {
                        for x in xs {
                            if !trig.contains(x) {
                                trig.push(*x);
                            }
                        }
                    }
                    None => {
                        if !trig.contains(p) {
                            trig.push(*p);
                        }
                    }
                }
            }
            r.trigger_rels = trig;
        }
        self.rules = kept.into_iter().map(Rc::new).collect();
        self.demand_rels = demand
            .into_iter()
            .map(|(rel, is)| (rel, is.into_iter().map(|i| self.rules[i].clone()).collect()))
            .collect();
    }

    fn classify(&mut self, r: DRule) -> ERule {
        let (plan, stuck, _) = plan_body(&self.h, &r.clause);
        let safe = stuck.is_none() && !self.answer.unsafe_rules.contains(&r.id);
        let mut has_neg = false;
        let mut pos_rels = Vec::new();
        for b in &plan {
            match b {
                BodyElem::Pos(l) => pos_rels.push(l.rel),
                BodyElem::Neg(_) => has_neg = true,
                _ => {}
            }
        }
        ERule {
            id: r.id,
            clause: r.clause,
            canon: r.canon,
            safe,
            has_neg,
            pos_rels,
            has_demand_prem: false,
            trigger_rels: Vec::new(),
            plan,
        }
    }

    /// ASK safety.rofl. The kernel's own program, run in a store of its own,
    /// under the stock evaluator with `bootstrap` set — which is the rung that
    /// stops the tower: a bootstrap evaluation asks nothing of anybody.
    fn safety_answer(&mut self, rules: &[DRule]) -> RuleAnswer {
        if self.bootstrap || rules.is_empty() {
            return RuleAnswer::default();
        }
        let mut h = std::mem::take(&mut self.h);
        let mut pol = policy_store(&mut h, &self.v, SAFETY_DENSE);
        for rel in [
            self.v.premise_lit,
            self.v.conclusion_lit,
            self.v.has_premise,
            self.v.concludes,
            self.v.conclusion_tense,
            self.v.premise_pos,
            self.v.premise_neg,
            self.v.reserved,
        ] {
            for f in self.store.rel_all(&h, rel) {
                let persp = self.store.rec(f).persp;
                let args = self.store.args(f).to_vec();
                pol.add(&h, rel, persp, &args, F_BASE);
            }
        }
        let s_head = h.atom("head");
        let s_pos = h.atom("pos");
        let s_left = h.atom("left");
        let s_right = h.atom("right");
        let main = self.v.main;
        for r in rules {
            let rid = Term::atom(r.id);
            let slot = |h: &mut Heap, pol: &mut Store, k: i64, name: Term, ts: &[Term]| {
                let mut vs: Vec<Sym> = Vec::new();
                for t in ts {
                    h.vars_of(*t, &mut vs);
                }
                let mut i = 0i64;
                for var in &vs {
                    i += 1;
                    let vname = h.name(*var).to_string();
                    let vs_t = h.string(&vname);
                    pol.add(
                        h,
                        self.v.premise_var,
                        main,
                        &[rid, Term::int(k), name, Term::int(i), vs_t],
                        F_BASE,
                    );
                }
                pol.add(
                    h,
                    self.v.slot_arity,
                    main,
                    &[rid, Term::int(k), name, Term::int(i)],
                    F_BASE,
                );
            };
            let mut head_ts = r.clause.head.args.clone();
            head_ts.push(r.clause.head.persp);
            slot(&mut h, &mut pol, 0, s_head, &head_ts);
            for (i, b) in r.clause.body.iter().enumerate() {
                let k = i as i64 + 1;
                match b {
                    BodyElem::Pos(l) => {
                        let mut ts = l.args.clone();
                        ts.push(l.persp);
                        slot(&mut h, &mut pol, k, s_pos, &ts);
                    }
                    BodyElem::Bi { l, r: rr, .. } => {
                        slot(&mut h, &mut pol, k, s_left, &[*l]);
                        slot(&mut h, &mut pol, k, s_right, &[*rr]);
                    }
                    BodyElem::Neg(_) => {}
                }
            }
        }
        let mut sub = Eval::new(h, pol, POLICY_BUDGET, Mode::Strata, true);
        let res = sub.run();
        let mut pol = std::mem::take(&mut sub.store);
        let mut h = std::mem::take(&mut sub.h);
        if let Err(e) = res {
            self.diags
                .push(format!("safety.rofl did not settle: {e:?}"));
        }
        let atoms = |h: &mut Heap, pol: &mut Store, rel: Sym| -> Vec<Sym> {
            let mut out = Vec::new();
            for f in pol.rel_all(h, rel) {
                if let Some(a) = pol.args(f)[0].as_atom() {
                    if !out.contains(&a) {
                        out.push(a);
                    }
                }
            }
            out
        };
        let mut trigger: HashMap<Sym, Vec<Sym>> = HashMap::new();
        for f in pol.rel_all(&h, self.v.trigger_of) {
            let args = pol.args(f);
            if let (Some(a), Some(b)) = (args[0].as_atom(), args[1].as_atom()) {
                let e = trigger.entry(a).or_default();
                if !e.contains(&b) {
                    e.push(b);
                }
            }
        }
        let answer = RuleAnswer {
            unsafe_rules: atoms(&mut h, &mut pol, self.v.unsafe_rule),
            demand_rels: atoms(&mut h, &mut pol, self.v.demand_rel),
            trigger,
            late: atoms(&mut h, &mut pol, self.v.late_rule),
            neg_rels: atoms(&mut h, &mut pol, self.v.neg_relation),
            reads_provenance: pol.rel_count(self.v.provenance_reader) > 0,
        };
        self.h = h;
        answer
    }

    // ----------------------------------------------------------------- run

    pub fn run(&mut self) -> Result<Outcome, Halt> {
        self.store.clear_derived();
        self.active.clear();
        self.staged.clear();
        self.steps = 0;
        self.rows = 0;
        self.peak_rows = 0;
        let mut partial = false;
        if self.well_founded {
            self.run_well_founded()?;
            self.store.dirty = false;
            self.store.partial_eval = false;
            return Ok(Outcome {
                partial: false,
                staged: self.staged.len(),
            });
        }
        let safe_rules: Vec<Rc<ERule>> = self.rules.iter().filter(|r| r.safe).cloned().collect();
        let mono: Vec<Rc<ERule>> = safe_rules.iter().filter(|r| !r.has_neg).cloned().collect();
        let neg_rules: Vec<Rc<ERule>> = safe_rules.iter().filter(|r| r.has_neg).cloned().collect();

        let outcome = (|| -> Result<(), Halt> {
            let levels: Vec<(i64, Vec<Rc<ERule>>)> = match self.mode {
                Mode::Rounds => {
                    let peel = peel_rounds(&self.rules);
                    if peel.stalled {
                        let names: Vec<&str> = peel.stuck.iter().map(|s| self.h.name(*s)).collect();
                        return Err(Halt::Strat(
                            format!(
                                "program rejected: round {} settled nothing while {} remained",
                                peel.rounds + 1,
                                names.join(", ")
                            ),
                            String::new(),
                        ));
                    }
                    level_split(&neg_rules, |r| {
                        if r.clause.head.temporal == Temporal::Next {
                            i64::MAX
                        } else {
                            peel.round
                                .get(&r.clause.head.rel)
                                .copied()
                                .unwrap_or(i64::MAX)
                        }
                    })
                }
                Mode::Strata => {
                    let strat = self.read_strata();
                    level_split(&neg_rules, |r| {
                        if r.clause.head.temporal == Temporal::Next {
                            i64::MAX
                        } else {
                            strat.get(&r.clause.head.rel).copied().unwrap_or(i64::MAX)
                        }
                    })
                }
            };
            // Phase A, in the stock evaluator's two waves. Nothing is
            // consulted between them any more, but keeping the split keeps the
            // firing order and with it the canonical witness of every fact —
            // which is exactly what the oracle compares (src/rounds.ts).
            let late = self.answer.late.clone();
            let first: Vec<Rc<ERule>> = mono
                .iter()
                .filter(|r| !late.contains(&r.id))
                .cloned()
                .collect();
            let second: Vec<Rc<ERule>> = mono
                .iter()
                .filter(|r| late.contains(&r.id))
                .cloned()
                .collect();
            self.activate(&first)?;
            self.activate(&second)?;
            for (_, rs) in levels {
                self.activate(&rs)?;
            }
            Ok(())
        })();

        match outcome {
            Ok(()) => {}
            Err(Halt::Budget(reason, rule)) => {
                if reason == "budget_exhausted" {
                    partial = true;
                    let hid = self.hole_id;
                    let br = Term::atom(self.v.budget_reason);
                    if self.store.add(
                        &self.h,
                        self.v.hole,
                        self.v.kernel_persp,
                        &[hid, br],
                        F_BASE | F_FROZEN,
                    ) {
                        self.charge_row(None, false)?;
                    }
                } else {
                    return Err(Halt::Budget(reason, rule));
                }
            }
            Err(e) => return Err(e),
        }
        self.store.dirty = false;
        self.store.partial_eval = partial;
        Ok(Outcome {
            partial,
            staged: self.staged.len(),
        })
    }

    // ----------------------------------------------------------- the tick

    /// `Rofl.ensure` (src/api.ts:619): evaluate only when the store is dirty,
    /// and hand back the standing answer when it is not.
    ///
    /// It is what makes `evaluate(); tickAdvance()` and `tickAdvance()` alone
    /// the same run — the ticked corpus cases are generated by the second and
    /// the binary does the first, and without this check the second tick would
    /// re-derive a layer it already has and re-date every witness.
    pub fn ensure(&mut self) -> Result<bool, Halt> {
        if !self.store.dirty {
            return Ok(self.store.partial_eval);
        }
        Ok(self.run()?.partial)
    }

    /// The staged next-tick facts in canonical KEY order, each with its key
    /// spelled exactly once.
    ///
    /// `EvalOutcome.staged` is `[...this.staged.keys()].sort()`
    /// (src/engine.ts:638), so what reaches `tickAdvance` is key order and not
    /// arrival order — the comment at src/api.ts:1052 calls it arrival order
    /// and is describing the variable rather than the value. The distinction
    /// is observable: `tickLog` joins these keys in this order and
    /// `canonicalState` prints `tickLog`.
    fn staged_sorted(&self) -> Vec<(String, StagedFact)> {
        let mut v: Vec<(String, StagedFact)> = self
            .staged
            .values()
            .map(|f| {
                let mut k = String::new();
                write_fact_key(&self.h, f.rel, f.persp, &f.args, &mut k);
                (k, f.clone())
            })
            .collect();
        v.sort_by(|a, b| cmp_js(&a.0, &b.0));
        v
    }

    /// `Rofl.frozenRetention` (src/api.ts:1024). The predicate `advance_tick`
    /// prunes the frozen layer with, or none when nothing is to be dropped.
    ///
    /// TWO GATES, AND BOTH MUST OPEN: `retain_ticks` unset keeps everything,
    /// and a program whose rules READ `derived_by` keeps everything regardless
    /// of the setting — it can observe its own completed-tick provenance from
    /// inside, so pruning would change a derivable fact rather than evict a
    /// cache. The predicate deciding the second gate is the evaluator's own,
    /// the same one that turns derived-relation reuse off.
    ///
    /// The clock is read HERE, before `advance_tick` increments it, so keeping
    /// the last n completed ticks is `T >= tick + 1 - n`.
    fn frozen_retention(&self) -> Option<Retention> {
        let n = self.retain_ticks?;
        if self.answer.reads_provenance {
            return None;
        }
        let oldest = self.store.tick as i64 + 1 - n as i64;
        let db = self.v.derived_by;
        Some(Box::new(move |rec: &FactRec, args: &[Term]| {
            if rec.rel != db {
                return true;
            }
            match args.get(2).and_then(|t| t.as_int()) {
                Some(t) => t >= oldest,
                None => true,
            }
        }))
    }

    /// QUIESCENCE IS A COMPARISON OF SETS — does the next tick hold exactly
    /// what this one holds (`sameKeySet`, src/api.ts:113).
    ///
    /// It is a named predicate here for the reason the reference gave it a
    /// name: the JS version sorts BOTH sides or neither, because it was a
    /// defect this month that it sorted one, and reversing an unrelated sort
    /// then made `examples/tm` stop being detected as quiescent, run to its
    /// 100-tick cap and grow 1391 -> 3509 facts — a terminating program that
    /// stopped terminating, with no error and no hole. An equality that is
    /// only true under an ordering its callers do not guarantee is a
    /// coincidence wearing a comparison.
    ///
    /// So neither side is given an order to borrow: both are sets of
    /// `(rel, persp, args)`, which is the same question `sameKeySet` asks
    /// because `factKey` is injective. Elements are distinct on both sides —
    /// a store holds one record per key and `staged` is a map keyed by one —
    /// so equal length plus containment IS set equality.
    fn quiescent(&self, staged: &[(String, StagedFact)]) -> bool {
        let cur: HashSet<FKey> = self
            .store
            .all_facts()
            .into_iter()
            .filter(|&id| {
                let r = self.store.rec(id);
                r.base() && r.tick_scope()
            })
            .map(|id| self.fkey_of(id))
            .collect();
        cur.len() == staged.len()
            && staged
                .iter()
                .all(|(_, f)| cur.contains(&self.fkey(f.rel, f.persp, &f.args)))
    }

    /// `Rofl.tickAdvance` (src/api.ts:1038): run the current tick to fixpoint,
    /// then advance if not quiescent.
    pub fn tick_advance(&mut self) -> Result<TickOutcome, Halt> {
        if self.ensure()? {
            return Ok(TickOutcome {
                advanced: false,
                quiescent: false,
                partial: true,
            });
        }
        let staged = self.staged_sorted();
        if self.quiescent(&staged) {
            return Ok(TickOutcome {
                advanced: false,
                quiescent: true,
                partial: false,
            });
        }
        let heads: Vec<StagedHead<'_>> = staged
            .iter()
            .map(|(_, f)| StagedHead {
                rel: f.rel,
                persp: f.persp,
                args: &f.args,
            })
            .collect();
        let keep = self.frozen_retention();
        self.store.advance_tick(&self.h, &heads, keep.as_deref());
        let t = self.store.tick;
        let mut line = format!("tick {t}: ");
        if staged.is_empty() {
            line.push_str("(empty)");
        } else {
            for (i, (k, _)) in staged.iter().enumerate() {
                if i > 0 {
                    line.push(' ');
                }
                line.push_str(k);
            }
        }
        self.store.tick_log.push(line);
        for (_, f) in &staged {
            let id = self.store.get(f.rel, f.persp, &f.args).unwrap();
            self.store.support(
                id,
                Witness {
                    rule: f.rule,
                    tick: t,
                    prems: f.prems.clone(),
                },
            );
            // WRITTEN UNCONDITIONALLY, unlike the in-tick path. `tickAdvance`
            // has no `noProvenance` guard (src/api.ts:1063) where
            // `deriveOne` does (src/engine.ts:1300), so a program that seals
            // provenance still gets a `derived_by` row for every fact that
            // CROSSES a boundary. Reproduced rather than tidied: the oracle is
            // the reference, not the reference's symmetry.
            let ft = fact_term(&mut self.h, &self.v, f.rel, f.persp, &f.args);
            let db_args = [ft, Term::atom(f.rule), Term::int(t as i64)];
            self.store.add(
                &self.h,
                self.v.derived_by,
                self.v.kernel_persp,
                &db_args,
                F_FROZEN,
            );
        }
        self.staged.clear();
        Ok(TickOutcome {
            advanced: true,
            quiescent: false,
            partial: false,
        })
    }

    fn read_strata(&mut self) -> HashMap<Sym, i64> {
        let mut out: HashMap<Sym, i64> = HashMap::new();
        for f in self.store.rel_all(&self.h, self.v.stratum) {
            let args = self.store.args(f);
            if args.len() != 2 {
                continue;
            }
            let (Some(rel), Some(n)) = (args[0].as_atom(), args[1].as_int()) else {
                continue;
            };
            let e = out.entry(rel).or_insert(n);
            if n > *e {
                *e = n;
            }
        }
        out
    }

    // --------------------------------------------------------- the fixpoint

    fn activate(&mut self, rules: &[Rc<ERule>]) -> Result<(), Halt> {
        if rules.is_empty() {
            return Ok(());
        }
        let mut sorted: Vec<Rc<ERule>> = rules.to_vec();
        sorted.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        self.active.extend(sorted.iter().cloned());
        self.active.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        let mut front = Front::default();
        std::mem::swap(&mut self.cur_front, &mut front);
        self.cur_front = Front::default();
        for r in &sorted {
            let f = self.fire_rule(r, None)?;
            merge_front(&mut self.cur_front, f);
        }
        let front = std::mem::take(&mut self.cur_front);
        self.propagate(front)
    }

    fn propagate(&mut self, mut front: Front) -> Result<(), Halt> {
        while !front.keys.is_empty() {
            let cur = front;
            self.cur_front = Front::default();
            let active = self.active.clone();
            for r in &active {
                if self.naive {
                    let f = self.fire_rule(r, None)?;
                    merge_front(&mut self.cur_front, f);
                    continue;
                }
                if !r
                    .trigger_rels
                    .iter()
                    .any(|rel| cur.by_rel.contains_key(rel))
                {
                    continue;
                }
                if r.has_demand_prem {
                    let f = self.fire_rule(r, None)?;
                    merge_front(&mut self.cur_front, f);
                } else {
                    for (i, b) in r.plan.iter().enumerate() {
                        let BodyElem::Pos(l) = b else { continue };
                        let Some(keys) = cur.by_rel.get(&l.rel) else {
                            continue;
                        };
                        let f = self.fire_rule(r, Some((i, keys)))?;
                        merge_front(&mut self.cur_front, f);
                    }
                }
            }
            front = std::mem::take(&mut self.cur_front);
        }
        Ok(())
    }

    fn fire_rule(
        &mut self,
        r: &Rc<ERule>,
        front_at: Option<(usize, &HashSet<FactId>)>,
    ) -> Result<Front, Halt> {
        let outer = self.cur_rule.replace(r.id);
        let sols = self.solve_body(&r.plan, Subst::new(), 0, front_at, Some(r.id));
        self.cur_rule = outer;
        let sols = sols?;
        let mut out = Front::default();
        for sol in sols {
            self.conclude(r, sol, &mut out)?;
        }
        Ok(out)
    }

    fn conclude(&mut self, r: &Rc<ERule>, sol: Sol, out: &mut Front) -> Result<(), Halt> {
        let head = r.clause.head.clone();
        let persp_t = walk(&self.h, head.persp, &sol.s);
        let args: Vec<Term> = if persp_t.is_atom() {
            head.args
                .iter()
                .map(|a| resolve(&mut self.h, *a, &sol.s))
                .collect()
        } else {
            Vec::new()
        };
        if !persp_t.is_atom() || !args.iter().all(|a| self.h.is_ground(*a)) {
            if !self.demand_rels.iter().any(|(x, _)| *x == head.rel) {
                let msg = format!(
                    "rule {}: non-ground or open conclusion skipped ({})",
                    self.h.name(r.id),
                    self.h.name(head.rel)
                );
                if !self.diags.contains(&msg) {
                    self.diags.push(msg);
                }
            }
            return Ok(());
        }
        let persp = persp_t.as_atom().unwrap();
        if is_kernel_ledger(&self.h, persp) {
            let msg = format!(
                "rule {}: conclusion into kernel ledger [{}] refused ({})",
                self.h.name(r.id),
                self.h.name(persp),
                self.h.name(head.rel)
            );
            if !self.diags.contains(&msg) {
                self.diags.push(msg);
            }
            return Ok(());
        }
        if head.temporal == Temporal::Next {
            let k = self.fkey(head.rel, persp, &args);
            if let std::collections::hash_map::Entry::Vacant(slot) = self.staged.entry(k) {
                slot.insert(StagedFact {
                    rel: head.rel,
                    persp,
                    args,
                    rule: r.id,
                    prems: sol.prems.clone(),
                });
                self.bump_steps()?;
                self.charge_row(Some(r.id), true)?;
            }
            return Ok(());
        }
        let is_new = self.store.add(&self.h, head.rel, persp, &args, F_TICK);
        let id = self.store.get(head.rel, persp, &args).unwrap();
        let tick = self.store.tick;
        let new_firing = self.store.support(
            id,
            Witness {
                rule: r.id,
                tick,
                prems: sol.prems.clone(),
            },
        );
        if new_firing {
            self.bump_steps()?;
            self.charge_row(Some(r.id), true)?;
            if !self.no_provenance {
                let ft = fact_term(&mut self.h, &self.v, head.rel, persp, &args);
                let rid = Term::atom(r.id);
                let db_args = [ft, rid, Term::int(tick as i64)];
                let db_new =
                    self.store
                        .add(&self.h, self.v.derived_by, self.v.kernel_persp, &db_args, 0);
                if db_new {
                    let dbid = self
                        .store
                        .get(self.v.derived_by, self.v.kernel_persp, &db_args)
                        .unwrap();
                    out.note(self.v.derived_by, dbid);
                }
            }
        }
        if is_new {
            out.note(head.rel, id);
        }
        Ok(())
    }

    fn bump_steps(&mut self) -> Result<(), Halt> {
        self.steps += 1;
        if self.steps > self.budget {
            return Err(Halt::Budget("budget_exhausted", None));
        }
        Ok(())
    }

    fn charge_row(&mut self, rule: Option<Sym>, enforce: bool) -> Result<(), Halt> {
        self.rows += 1;
        if self.rows > self.peak_rows {
            self.peak_rows = self.rows;
        }
        if enforce && self.rows > self.space {
            self.arith_hole(rule.unwrap(), self.v.space_reason);
            return Err(Halt::Budget("space_exhausted", rule));
        }
        Ok(())
    }

    // -------------------------------------------------------- body solving

    fn solve_body(
        &mut self,
        body: &[BodyElem],
        s0: Subst,
        depth: usize,
        front_at: Option<(usize, &HashSet<FactId>)>,
        rule_id: Option<Sym>,
    ) -> Result<Vec<Sol>, Halt> {
        let mut acc: Vec<Sol> = vec![Sol {
            s: s0,
            prems: Vec::new(),
        }];
        let mut held: i64 = 0;
        let res = (|| -> Result<Vec<Sol>, Halt> {
            for (i, b) in body.iter().enumerate() {
                let mut next: Vec<Sol> = Vec::new();
                for a in &acc {
                    let now = self.rows + next.len() as i64;
                    if now > self.peak_rows {
                        self.peak_rows = now;
                    }
                    if now > self.space {
                        if let Some(rid) = rule_id {
                            self.arith_hole(rid, self.v.space_reason);
                        }
                        return Err(Halt::Budget("space_exhausted", rule_id));
                    }
                    match b {
                        BodyElem::Pos(l) => {
                            let only = match front_at {
                                Some((p, keys)) if p == i => Some(keys),
                                _ => None,
                            };
                            for (s2, r) in self.match_premise(l, &a.s, depth, only)? {
                                let mut prems = a.prems.clone();
                                prems.push(r);
                                next.push(Sol { s: s2, prems });
                            }
                        }
                        BodyElem::Neg(l) => {
                            if self.neg_holds(l, &a.s, depth)? {
                                let mut prems = a.prems.clone();
                                prems.push(PremRef::Neg(0));
                                next.push(Sol {
                                    s: a.s.clone(),
                                    prems,
                                });
                            }
                        }
                        BodyElem::Bi { op, l, r } => {
                            if let Some(s2) = self.eval_builtin(*op, *l, *r, &a.s, rule_id) {
                                let mut prems = a.prems.clone();
                                prems.push(PremRef::Bi(0));
                                next.push(Sol { s: s2, prems });
                            }
                        }
                    }
                }
                let grew = next.len() as i64 - if i == 0 { 0 } else { acc.len() as i64 };
                self.rows += grew;
                held += grew;
                if self.rows > self.peak_rows {
                    self.peak_rows = self.rows;
                }
                acc = next;
                if acc.is_empty() {
                    break;
                }
            }
            Ok(std::mem::take(&mut acc))
        })();
        self.rows -= held;
        let acc = res?;
        // One premise per body element, in order, so body[i] describes prems[i].
        let mut out = Vec::with_capacity(acc.len());
        for a in acc {
            let mut prems = Vec::with_capacity(a.prems.len());
            for (i, p) in a.prems.iter().enumerate() {
                prems.push(self.record_prem(&body[i], *p, &a.s));
            }
            out.push(Sol { s: a.s, prems });
        }
        Ok(out)
    }

    fn record_prem(&mut self, b: &BodyElem, r: PremRef, s: &Subst) -> PremRef {
        match b {
            BodyElem::Bi { op, l, r: rr } => {
                let lt = resolve(&mut self.h, *l, s);
                let rt = resolve(&mut self.h, *rr, s);
                let cv = canon_vars(&mut self.h, &[lt, rt]);
                let mut d = String::new();
                self.h.canon_term(cv[0], &mut d);
                d.push(' ');
                d.push_str(self.h.name(*op));
                d.push(' ');
                self.h.canon_term(cv[1], &mut d);
                PremRef::Bi(self.h.intern(&d))
            }
            BodyElem::Neg(l) => {
                let k = self.anon_lit_key(l, s);
                PremRef::Neg(self.h.intern(&k))
            }
            BodyElem::Pos(l) => match r {
                PremRef::Bi(_) => {
                    let k = format!("open {}", self.anon_lit_key(l, s));
                    PremRef::Bi(self.h.intern(&k))
                }
                other => other,
            },
        }
    }

    fn resolved_lit_key(&mut self, l: &Lit, s: &Subst) -> String {
        let mut out = String::new();
        out.push_str(self.h.name(l.rel));
        out.push('[');
        let p = walk(&self.h, l.persp, s);
        self.h.canon_term(p, &mut out);
        out.push_str("](");
        let args: Vec<Term> = l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect();
        for (i, a) in args.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            self.h.canon_term(*a, &mut out);
        }
        out.push(')');
        out
    }

    fn anon_lit_key(&mut self, l: &Lit, s: &Subst) -> String {
        let p = walk(&self.h, l.persp, s);
        let mut ts = vec![p];
        for a in &l.args {
            let r = resolve(&mut self.h, *a, s);
            ts.push(r);
        }
        let cv = canon_vars(&mut self.h, &ts);
        let mut out = String::new();
        out.push_str(self.h.name(l.rel));
        out.push('[');
        self.h.canon_term(cv[0], &mut out);
        out.push_str("](");
        for (i, a) in cv[1..].iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            self.h.canon_term(*a, &mut out);
        }
        out.push(')');
        out
    }

    fn index_probe(&mut self, l: &Lit, s: &Subst, persp: Option<Sym>) -> Option<Vec<FactId>> {
        if !self.store.indexed(l.rel, persp) {
            return None;
        }
        let mut pos = Vec::new();
        let mut vals = Vec::new();
        for (i, a) in l.args.clone().iter().enumerate() {
            let t = resolve(&mut self.h, *a, s);
            if !self.h.is_ground(t) {
                continue;
            }
            pos.push(i);
            vals.push(t);
        }
        if pos.is_empty() {
            return None;
        }
        if let Some(rid) = self.cur_rule {
            *self.argm_by_rule.entry(rid).or_insert(0) += 1;
        }
        self.store
            .arg_matches(&self.h, l.rel, persp, l.args.len(), &pos, &vals)
    }

    /// Matches for one positive premise: store facts plus demand unfolding.
    fn match_premise(
        &mut self,
        l: &Lit,
        s: &Subst,
        depth: usize,
        only: Option<&HashSet<FactId>>,
    ) -> Result<Vec<(Subst, PremRef)>, Halt> {
        if l.temporal == Temporal::Init && self.store.tick != 0 {
            return Ok(Vec::new());
        }
        let persp_t = walk(&self.h, l.persp, s);
        let persp = persp_t.as_atom();
        let cands: Vec<FactId> = match only {
            Some(keys) => {
                let narrow = self.index_probe(l, s, persp);
                match narrow {
                    Some(n) if n.len() < keys.len() => {
                        n.into_iter().filter(|f| keys.contains(f)).collect()
                    }
                    _ => keys
                        .iter()
                        .copied()
                        .filter(|f| {
                            self.store.alive(*f) && {
                                let r = self.store.rec(*f);
                                r.rel == l.rel && (persp.is_none() || Some(r.persp) == persp)
                            }
                        })
                        .collect(),
                }
            }
            None => match self.index_probe(l, s, persp) {
                Some(c) => c,
                None => match persp {
                    Some(p) => self.store.rel_persp(&self.h, l.rel, p),
                    None => self.store.rel_all(&self.h, l.rel),
                },
            },
        };
        let mut out: Vec<(Subst, PremRef)> = Vec::new();
        let mut seen: HashSet<FactId> = HashSet::new();
        for f in cands {
            let fp = self.store.rec(f).persp;
            // A perspective VARIABLE does not range over the kernel's books.
            if persp.is_none() && is_kernel_ledger(&self.h, fp) {
                continue;
            }
            let s2 = match persp {
                Some(_) => Some(s.clone()),
                None => unify(&self.h, persp_t, Term::atom(fp), s),
            };
            let Some(s2) = s2 else { continue };
            let fargs = self.store.args(f).to_vec();
            let Some(s3) = unify_all(&self.h, &l.args, &fargs, &s2) else {
                continue;
            };
            if seen.insert(f) {
                out.push((s3, PremRef::Fact(f)));
            }
        }
        let drs: Option<Vec<Rc<ERule>>> = self
            .demand_rels
            .iter()
            .find(|(r, _)| *r == l.rel)
            .map(|(_, rs)| rs.clone());
        let mut open: Vec<(Subst, PremRef, String)> = Vec::new();
        if let Some(drs) = drs {
            let mut seen_keys: HashSet<String> = HashSet::new();
            for (sb, r) in out.iter() {
                let _ = sb;
                if let PremRef::Fact(f) = r {
                    seen_keys.insert(self.store.key(&self.h, *f));
                }
            }
            for dr in drs {
                for (ms, mref) in self.solve_demand_rule(&dr, l, s, depth)? {
                    let dk = match mref {
                        PremRef::Fact(f) => self.store.key(&self.h, f),
                        _ => self.resolved_lit_key(l, &ms),
                    };
                    if seen_keys.insert(dk.clone()) {
                        open.push((ms, mref, dk));
                    }
                }
            }
        }
        // The total sort that makes candidate order unobservable. `seen` above
        // admits at most one match per key, so no two entries share a sort key.
        let mut keyed: Vec<(String, Subst, PremRef)> = out
            .into_iter()
            .map(|(s, r)| {
                let k = match r {
                    PremRef::Fact(f) => self.store.key(&self.h, f),
                    _ => unreachable!(),
                };
                (k, s, r)
            })
            .collect();
        for (s, r, k) in open {
            keyed.push((k, s, r));
        }
        keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
        Ok(keyed.into_iter().map(|(_, s, r)| (s, r)).collect())
    }

    /// Top-down unfolding of a moded rule at a call site.
    fn solve_demand_rule(
        &mut self,
        r: &Rc<ERule>,
        call: &Lit,
        s: &Subst,
        depth: usize,
    ) -> Result<Vec<(Subst, PremRef)>, Halt> {
        self.bump_steps()?;
        if depth > MAX_DEPTH {
            return Err(Halt::Budget("budget_exhausted", None));
        }
        let rn = self.rename_clause(&r.clause);
        let head = rn.head.clone();
        if head.rel != call.rel || head.args.len() != call.args.len() {
            return Ok(Vec::new());
        }
        let cp = walk(&self.h, call.persp, s);
        let Some(s2) = unify(&self.h, head.persp, cp, s) else {
            return Ok(Vec::new());
        };
        let Some(s3) = unify_all(&self.h, &head.args, &call.args, &s2) else {
            return Ok(Vec::new());
        };
        let sols = self.solve_body(&rn.body, s3, depth + 1, None, Some(r.id))?;
        let mut out = Vec::new();
        for sol in sols {
            let persp = walk(&self.h, head.persp, &sol.s);
            let args: Vec<Term> = head
                .args
                .iter()
                .map(|a| resolve(&mut self.h, *a, &sol.s))
                .collect();
            if persp.is_atom() && args.iter().all(|a| self.h.is_ground(*a)) {
                let p = persp.as_atom().unwrap();
                let is_new = self.store.add(&self.h, call.rel, p, &args, F_TICK);
                let id = self.store.get(call.rel, p, &args).unwrap();
                let tick = self.store.tick;
                let new_firing = self.store.support(
                    id,
                    Witness {
                        rule: r.id,
                        tick,
                        prems: sol.prems.clone(),
                    },
                );
                if new_firing {
                    self.charge_row(Some(r.id), true)?;
                    if !self.no_provenance {
                        let ft = fact_term(&mut self.h, &self.v, call.rel, p, &args);
                        let rid = Term::atom(r.id);
                        let db_args = [ft, rid, Term::int(tick as i64)];
                        self.store.add(
                            &self.h,
                            self.v.derived_by,
                            self.v.kernel_persp,
                            &db_args,
                            0,
                        );
                    }
                }
                if is_new {
                    self.cur_front.note(call.rel, id);
                }
                out.push((sol.s, PremRef::Fact(id)));
            } else {
                let k = format!("open {}", self.resolved_lit_key(call, &sol.s));
                let sy = self.h.intern(&k);
                out.push((sol.s, PremRef::Bi(sy)));
            }
        }
        Ok(out)
    }

    fn rename_clause(&mut self, c: &Clause) -> Clause {
        let n = self.rename_counter;
        self.rename_counter += 1;
        let mut c2 = c.clone();
        rename_lit(&mut self.h, &mut c2.head, n);
        for b in c2.body.iter_mut() {
            match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) => rename_lit(&mut self.h, l, n),
                BodyElem::Bi { l, r, .. } => {
                    *l = rename_term(&mut self.h, *l, n);
                    *r = rename_term(&mut self.h, *r, n);
                }
            }
        }
        c2
    }

    /// `not p`. Two-valued by default; against the round's frozen assumption
    /// under the alternation.
    fn neg_holds(&mut self, l: &Lit, s: &Subst, depth: usize) -> Result<bool, Halt> {
        if self.assume.is_none() {
            // An existence question. When the relation is not demand-backed,
            // `matchPremise` has no side effect and no order that matters, so
            // the answer is the same and nothing is built to throw away.
            if !self.demand_rels.iter().any(|(r, _)| *r == l.rel) {
                return self.match_exists(l, s);
            }
            return Ok(self.match_premise(l, s, depth, None)?.is_empty());
        }
        // An Rc, not a copy: the assumption holds one boxed key per fact and
        // cloning it per negated premise was 3.4 s of examples/rip.
        let asm = self.assume.clone().unwrap();
        if l.temporal == Temporal::Init && self.store.tick != 0 {
            return Ok(true);
        }
        let persp_t = walk(&self.h, l.persp, s);
        let empty = Vec::new();
        let recs = asm.by_rel.get(&l.rel).unwrap_or(&empty);
        for f in recs {
            let fr = self.store.rec(*f);
            let (fp, flen) = (fr.persp, self.store.arity(*f));
            if flen != l.args.len() {
                continue;
            }
            if !persp_t.is_atom() && is_kernel_ledger(&self.h, fp) {
                continue;
            }
            let s2 = if persp_t.is_atom() {
                if persp_t.as_atom() == Some(fp) {
                    Some(s.clone())
                } else {
                    None
                }
            } else {
                unify(&self.h, persp_t, Term::atom(fp), s)
            };
            let Some(s2) = s2 else { continue };
            let fargs = self.store.args(*f).to_vec();
            if unify_all(&self.h, &l.args, &fargs, &s2).is_some() {
                return Ok(false);
            }
        }
        Ok(true)
    }

    fn match_exists(&mut self, l: &Lit, s: &Subst) -> Result<bool, Halt> {
        if l.temporal == Temporal::Init && self.store.tick != 0 {
            return Ok(true);
        }
        let persp_t = walk(&self.h, l.persp, s);
        let persp = persp_t.as_atom();
        let cands = match self.index_probe(l, s, persp) {
            Some(c) => c,
            None => match persp {
                Some(p) => self.store.rel_persp(&self.h, l.rel, p),
                None => self.store.rel_all(&self.h, l.rel),
            },
        };
        for f in cands {
            let fp = self.store.rec(f).persp;
            if persp.is_none() && is_kernel_ledger(&self.h, fp) {
                continue;
            }
            let s2 = match persp {
                Some(_) => Some(s.clone()),
                None => unify(&self.h, persp_t, Term::atom(fp), s),
            };
            let Some(s2) = s2 else { continue };
            let fargs = self.store.args(f).to_vec();
            if unify_all(&self.h, &l.args, &fargs, &s2).is_some() {
                return Ok(false);
            }
        }
        Ok(true)
    }

    // ------------------------------------------------------------ builtins

    fn eval_builtin(
        &mut self,
        op: Sym,
        l: Term,
        r: Term,
        s: &Subst,
        rule_id: Option<Sym>,
    ) -> Option<Subst> {
        let v = &self.v;
        if op == v.op_eq {
            return unify(&self.h, l, r, s);
        }
        if op == v.op_ne {
            let lt = resolve(&mut self.h, l, s);
            let rt = resolve(&mut self.h, r, s);
            if !self.h.is_ground(lt) || !self.h.is_ground(rt) {
                return None;
            }
            // Terms are hash-consed, so equal canonical renderings are one term.
            return if lt != rt { Some(s.clone()) } else { None };
        }
        if op == v.op_is {
            let mut fail = 0u8;
            let rv = match eval_str_op(&mut self.h, r, s, &mut fail) {
                StrOp::NotOne => eval_arith(&mut self.h, r, s, &mut fail).map(Term::int),
                StrOp::Refused => None,
                StrOp::Value(t) => Some(t),
            };
            let Some(rv) = rv else {
                if let Some(rid) = rule_id {
                    if fail != ARITH_UNBOUND {
                        self.arith_hole(rid, hole_reason_of(&self.v, fail));
                    }
                }
                return None;
            };
            return unify(&self.h, l, rv, s);
        }
        let mut fail = 0u8;
        let side = |h: &mut Heap, t: Term, fail: &mut u8| -> Option<i64> {
            *fail = ARITH_UNBOUND;
            match eval_str_op(h, t, s, fail) {
                StrOp::NotOne => eval_arith(h, t, s, fail),
                StrOp::Refused => None,
                StrOp::Value(x) => match x.kind() {
                    TermK::Int(n) => Some(n),
                    _ => {
                        *fail = STR_TYPE;
                        None
                    }
                },
            }
        };
        let lv = side(&mut self.h, l, &mut fail);
        let Some(lv) = lv else {
            if let Some(rid) = rule_id {
                if fail != ARITH_UNBOUND {
                    self.arith_hole(rid, hole_reason_of(&self.v, fail));
                }
            }
            return None;
        };
        let rv = side(&mut self.h, r, &mut fail);
        let Some(rv) = rv else {
            if let Some(rid) = rule_id {
                if fail != ARITH_UNBOUND {
                    self.arith_hole(rid, hole_reason_of(&self.v, fail));
                }
            }
            return None;
        };
        let v = &self.v;
        let ok = if op == v.op_lt {
            lv < rv
        } else if op == v.op_le {
            lv <= rv
        } else if op == v.op_gt {
            lv > rv
        } else if op == v.op_ge {
            lv >= rv
        } else {
            false
        };
        if ok {
            Some(s.clone())
        } else {
            None
        }
    }

    fn arith_hole(&mut self, rule_id: Sym, reason: Sym) {
        let rid = Term::atom(rule_id);
        let marker = self.h.mkf(self.v.s_rule_hole, &[rid]);
        let args = [marker, Term::atom(reason)];
        if self.store.add(
            &self.h,
            self.v.hole,
            self.v.kernel_persp,
            &args,
            F_BASE | F_FROZEN,
        ) {
            self.rows += 1;
            if self.rows > self.peak_rows {
                self.peak_rows = self.rows;
            }
            let id = self
                .store
                .get(self.v.hole, self.v.kernel_persp, &args)
                .unwrap();
            self.cur_front.note(self.v.hole, id);
        }
    }

    // ----------------------------------------------- the alternating fixpoint

    fn assumption_of(&self) -> Assumption {
        let mut a = Assumption::default();
        for id in self.store.all_facts() {
            let r = self.store.rec(id);
            a.recs.insert(self.fkey_of(id), id);
            a.by_rel.entry(r.rel).or_default().push(id);
        }
        a
    }

    fn round_rules(&self) -> Vec<Rc<ERule>> {
        self.rules
            .iter()
            .filter(|r| r.safe && r.clause.head.rel != self.v.stratum)
            .cloned()
            .collect()
    }

    fn wfs_round(&mut self, assume: Rc<Assumption>) -> Result<(), Halt> {
        self.assume = Some(assume);
        self.store.clear_derived();
        self.rows = 0;
        self.active.clear();
        self.staged.clear();
        let rs = self.round_rules();
        self.activate(&rs)
    }

    fn run_well_founded(&mut self) -> Result<(), Halt> {
        if !self.demand_rels.is_empty() {
            let names: Vec<&str> = self
                .demand_rels
                .iter()
                .map(|(r, _)| self.h.name(*r))
                .collect();
            return Err(Halt::Strat(
                format!(
                    "program rejected: the alternating fixpoint cannot assume a demand-backed relation ({})",
                    names.join(", ")
                ),
                String::new(),
            ));
        }
        if self
            .rules
            .iter()
            .any(|r| r.clause.head.rel == self.v.stratum)
        {
            let msg = "stratum/2 is not computed under well_founded semantics".to_string();
            if !self.diags.contains(&msg) {
                self.diags.push(msg);
            }
        }
        let ut = Term::atom(self.v.unknown);
        if self
            .store
            .add(&self.h, self.v.edb, self.v.main, &[ut], F_BASE)
        {
            self.rows += 1;
        }
        self.store.clear_derived();
        let mut mean = Rc::new(self.assumption_of());
        let mut generous;
        let mut generous_wits: HashMap<FKey, Witness>;
        let mut i = 0usize;
        loop {
            self.wfs_round(mean.clone())?;
            generous = Rc::new(self.assumption_of());
            generous_wits = self.all_witnesses();
            self.wfs_round(generous.clone())?;
            let next = Rc::new(self.assumption_of());
            let settled = next.recs.len() == mean.recs.len()
                && next.recs.keys().all(|k| mean.recs.contains_key(k));
            mean = next;
            if settled {
                self.diags.push(format!(
                    "well-founded fixpoint settled after {} alternation(s)",
                    i + 1
                ));
                break;
            }
            i += 1;
            if i >= MAX_ALTERNATIONS {
                return Err(Halt::Budget("budget_exhausted", None));
            }
        }
        // The gap: what the two limits disagree about. Kernel bookkeeping is
        // not part of the answer.
        let mut gap: Vec<(String, FKey, FactId)> = Vec::new();
        for (k, id) in &generous.recs {
            if mean.recs.contains_key(k) || self.v.is_reserved(k.0) {
                continue;
            }
            gap.push((self.store.key(&self.h, *id), k.clone(), *id));
        }
        gap.sort_by(|a, b| cmp_js(&a.0, &b.0));
        let mut undef: HashMap<FKey, FKey> = HashMap::new();
        for (_, k, id) in &gap {
            let args = self.store.args(*id).to_vec();
            let at = atom_term(&mut self.h, k.0, &args);
            let persp = self.store.rec(*id).persp;
            undef.insert(k.clone(), (self.v.unknown, persp, vec![at].into()));
        }
        if self.rows + gap.len() as i64 > self.space {
            let blame = gap
                .first()
                .and_then(|(_, k, _)| generous_wits.get(k))
                .map(|w| w.rule);
            if let Some(b) = blame {
                self.arith_hole(b, self.v.space_reason);
            }
            return Err(Halt::Budget("space_exhausted", blame));
        }
        // TWO PASSES, and the reason is the numeric identity. The JS kernel
        // rewrites a premise to the unknown row's KEY, which needs no such row
        // to exist yet; a `FactId` does. Every unknown row is therefore written
        // before any support that may point at one. Nothing else moves: the
        // rows and the supports are independent, and the row charge does not
        // enforce here.
        let mut added: Vec<FactId> = Vec::new();
        let mut uids: Vec<Option<FactId>> = Vec::with_capacity(gap.len());
        for (_, k, id) in &gap {
            self.rows += 1;
            let persp = self.store.rec(*id).persp;
            let args = self.store.args(*id).to_vec();
            let at = atom_term(&mut self.h, k.0, &args);
            self.store
                .add(&self.h, self.v.unknown, persp, &[at], F_TICK);
            let uid = self.store.get(self.v.unknown, persp, &[at]);
            if let Some(u) = uid {
                added.push(u);
            }
            uids.push(uid);
        }
        for (n, (_, k, _)) in gap.iter().enumerate() {
            let uid = uids[n];
            let Some(w) = generous_wits.get(k).cloned() else {
                continue;
            };
            let prems: Vec<PremRef> = w
                .prems
                .iter()
                .map(|pr| match pr {
                    PremRef::Fact(f) => {
                        let fk = self.fkey_of(*f);
                        match undef.get(&fk) {
                            Some(u) => match self.store.get(u.0, u.1, &u.2) {
                                Some(x) => PremRef::Fact(x),
                                None => *pr,
                            },
                            None => *pr,
                        }
                    }
                    _ => *pr,
                })
                .collect();
            if let Some(u) = uid {
                let tick = self.store.tick;
                self.store.support(
                    u,
                    Witness {
                        rule: w.rule,
                        tick,
                        prems,
                    },
                );
            }
        }
        // Unknown is a VALUE, so rules may read it: one pass over the settled
        // model, under the SAME assumption the last round ran under.
        let neg_rels = self.answer.neg_rels.clone();
        let before: HashSet<FKey> = self
            .store
            .all_facts()
            .into_iter()
            .map(|f| self.fkey_of(f))
            .collect();
        let mut ext = (*generous).clone();
        for id in &added {
            let k = self.fkey_of(*id);
            if ext.recs.contains_key(&k) {
                continue;
            }
            let rel = self.store.rec(*id).rel;
            ext.recs.insert(k, *id);
            ext.by_rel.entry(rel).or_default().push(*id);
        }
        self.assume = Some(Rc::new(ext));
        self.active.clear();
        self.staged.clear();
        let rs = self.round_rules();
        self.activate(&rs)?;
        let mut fed: Vec<String> = Vec::new();
        for id in self.store.all_facts() {
            let k = self.fkey_of(id);
            if !before.contains(&k) && neg_rels.contains(&self.store.rec(id).rel) {
                fed.push(self.store.key(&self.h, id));
            }
        }
        self.assume = None;
        if !fed.is_empty() {
            fed.sort_by(|a, b| cmp_js(a, b));
            return Err(Halt::Strat(
                format!(
                    "program rejected: reading unknown fed {} fact(s) back into a negated relation",
                    fed.len()
                ),
                fed[..fed.len().min(8)].join("\n"),
            ));
        }
        Ok(())
    }

    fn all_witnesses(&self) -> HashMap<FKey, Witness> {
        let mut out = HashMap::new();
        for id in self.store.firing_keys() {
            if let Some(w) = self.store.witness_of(&self.h, id) {
                out.insert(
                    self.fkey_of(id),
                    Witness {
                        rule: w.rule,
                        tick: w.tick,
                        prems: w.prems.to_vec(),
                    },
                );
            }
        }
        out
    }
}

fn merge_front(into: &mut Front, from: Front) {
    for (rel, ks) in from.by_rel {
        let e = into.by_rel.entry(rel).or_default();
        for k in ks {
            e.insert(k);
        }
    }
    for k in from.keys {
        into.keys.insert(k);
    }
}

fn level_split<F: Fn(&Rc<ERule>) -> i64>(
    rules: &[Rc<ERule>],
    level_of: F,
) -> Vec<(i64, Vec<Rc<ERule>>)> {
    let mut levels: Vec<i64> = Vec::new();
    for r in rules {
        let l = level_of(r);
        if !levels.contains(&l) {
            levels.push(l);
        }
    }
    levels.sort();
    levels
        .into_iter()
        .map(|lv| {
            (
                lv,
                rules
                    .iter()
                    .filter(|r| level_of(r) == lv)
                    .cloned()
                    .collect::<Vec<_>>(),
            )
        })
        .collect()
}

fn rename_term(h: &mut Heap, t: Term, n: u64) -> Term {
    match t.kind() {
        TermK::Var(v) => {
            let name = format!("{}#{}", h.name(v), n);
            h.var(&name)
        }
        TermK::Func(i) => {
            let name = h.fname(i);
            let args = h.fargs(i).to_vec();
            let mapped: Vec<Term> = args.into_iter().map(|a| rename_term(h, a, n)).collect();
            h.mkf(name, &mapped)
        }
        _ => t,
    }
}

fn rename_lit(h: &mut Heap, l: &mut Lit, n: u64) {
    l.persp = rename_term(h, l.persp, n);
    l.args = l.args.iter().map(|a| rename_term(h, *a, n)).collect();
}

// ------------------------------------------------------------------ planBody

/// `planBody` (src/engine.ts:273). Positive premises and builtins keep the
/// order they were written in; a negation is held back until every variable it
/// shares with the rest of the rule is bound.
pub fn plan_body(h: &Heap, c: &Clause) -> (Vec<BodyElem>, Option<usize>, bool) {
    let mut seen_in: HashMap<Sym, Vec<i64>> = HashMap::new();
    let note = |t: Term, where_: i64, seen_in: &mut HashMap<Sym, Vec<i64>>| {
        let mut vs = Vec::new();
        h.vars_of(t, &mut vs);
        for v in vs {
            let e = seen_in.entry(v).or_default();
            if !e.contains(&where_) {
                e.push(where_);
            }
        }
    };
    for a in &c.head.args {
        note(*a, -1, &mut seen_in);
    }
    note(c.head.persp, -1, &mut seen_in);
    for (i, b) in c.body.iter().enumerate() {
        match b {
            BodyElem::Bi { l, r, .. } => {
                note(*l, i as i64, &mut seen_in);
                note(*r, i as i64, &mut seen_in);
            }
            BodyElem::Pos(l) | BodyElem::Neg(l) => {
                for a in &l.args {
                    note(*a, i as i64, &mut seen_in);
                }
                note(l.persp, i as i64, &mut seen_in);
            }
        }
    }
    let mut bound: Vec<Sym> = Vec::new();
    let ground_in = |t: Term, bound: &Vec<Sym>| -> bool {
        let mut vs = Vec::new();
        h.vars_of(t, &mut vs);
        vs.iter().all(|v| bound.contains(v))
    };
    let bind_all = |t: Term, bound: &mut Vec<Sym>| {
        let mut vs = Vec::new();
        h.vars_of(t, &mut vs);
        for v in vs {
            if !bound.contains(&v) {
                bound.push(v);
            }
        }
    };
    let neg_ready = |l: &Lit, i: i64, bound: &Vec<Sym>, seen_in: &HashMap<Sym, Vec<i64>>| -> bool {
        let mut vs = Vec::new();
        for a in &l.args {
            h.vars_of(*a, &mut vs);
        }
        h.vars_of(l.persp, &mut vs);
        vs.iter().all(|v| {
            bound.contains(v) || {
                let s = &seen_in[v];
                s.len() == 1 && s[0] == i
            }
        })
    };

    let mut plan: Vec<BodyElem> = Vec::new();
    let mut pending: Vec<usize> = Vec::new();
    let is_eq = |op: Sym| h.name(op) == "=";
    let is_is = |op: Sym| h.name(op) == "is";
    for (i, b) in c.body.iter().enumerate() {
        if let BodyElem::Neg(_) = b {
            pending.push(i);
        } else {
            match b {
                BodyElem::Pos(l) => {
                    for a in &l.args {
                        bind_all(*a, &mut bound);
                    }
                    bind_all(l.persp, &mut bound);
                }
                BodyElem::Bi { op, l, r } => {
                    if is_eq(*op) {
                        if ground_in(*l, &bound) {
                            bind_all(*r, &mut bound);
                        } else if ground_in(*r, &bound) {
                            bind_all(*l, &mut bound);
                        }
                    } else if is_is(*op) && ground_in(*r, &bound) {
                        bind_all(*l, &mut bound);
                    }
                }
                _ => {}
            }
            plan.push(b.clone());
        }
        // flush
        loop {
            let at = pending.iter().position(|&j| {
                let BodyElem::Neg(l) = &c.body[j] else {
                    return false;
                };
                neg_ready(l, j as i64, &bound, &seen_in)
            });
            match at {
                Some(a) => {
                    plan.push(c.body[pending[a]].clone());
                    pending.remove(a);
                }
                None => break,
            }
        }
    }
    let head_ground =
        c.head.args.iter().all(|a| ground_in(*a, &bound)) && ground_in(c.head.persp, &bound);
    (plan, pending.first().copied(), head_ground)
}

// -------------------------------------------------------------- peelRounds

pub struct Peel {
    pub round: HashMap<Sym, i64>,
    pub rounds: i64,
    pub stalled: bool,
    pub stuck: Vec<Sym>,
}

/// `peelRounds` (src/rounds.ts:93). The round number IS the stratum number,
/// and a stall is the rejection.
pub fn peel_rounds(rules: &[Rc<ERule>]) -> Peel {
    let mut pos: HashMap<Sym, HashSet<Sym>> = HashMap::new();
    let mut neg: HashMap<Sym, HashSet<Sym>> = HashMap::new();
    let mut heads: HashSet<Sym> = HashSet::new();
    for r in rules {
        if r.clause.head.temporal == Temporal::Next {
            continue;
        }
        let hrel = r.clause.head.rel;
        heads.insert(hrel);
        pos.entry(hrel).or_default();
        neg.entry(hrel).or_default();
        for b in &r.clause.body {
            match b {
                BodyElem::Pos(l) => {
                    pos.get_mut(&hrel).unwrap().insert(l.rel);
                }
                BodyElem::Neg(l) => {
                    neg.get_mut(&hrel).unwrap().insert(l.rel);
                }
                _ => {}
            }
        }
    }
    let mut all: HashSet<Sym> = heads.clone();
    for s in pos.values() {
        all.extend(s.iter().copied());
    }
    for s in neg.values() {
        all.extend(s.iter().copied());
    }
    let mut round: HashMap<Sym, i64> = HashMap::new();
    let mut settled: HashSet<Sym> = HashSet::new();
    for rel in &all {
        if !heads.contains(rel) {
            settled.insert(*rel);
            round.insert(*rel, 0);
        }
    }
    let mut n = 0i64;
    let empty: HashSet<Sym> = HashSet::new();
    while settled.len() < all.len() {
        n += 1;
        let mut cand: HashSet<Sym> = all
            .iter()
            .copied()
            .filter(|rel| {
                !settled.contains(rel)
                    && neg
                        .get(rel)
                        .unwrap_or(&empty)
                        .iter()
                        .all(|q| settled.contains(q))
            })
            .collect();
        loop {
            let before = cand.len();
            let snapshot = cand.clone();
            cand.retain(|rel| {
                pos.get(rel)
                    .unwrap_or(&empty)
                    .iter()
                    .all(|q| settled.contains(q) || snapshot.contains(q))
            });
            if cand.len() == before {
                break;
            }
        }
        if cand.is_empty() {
            let mut stuck: Vec<Sym> = all
                .iter()
                .copied()
                .filter(|r| !settled.contains(r))
                .collect();
            stuck.sort();
            return Peel {
                round,
                rounds: n - 1,
                stalled: true,
                stuck,
            };
        }
        for rel in &cand {
            settled.insert(*rel);
            round.insert(*rel, n);
        }
    }
    Peel {
        round,
        rounds: n,
        stalled: false,
        stuck: Vec::new(),
    }
}

// ---------------------------------------------------------------- policy store

/// A scratch store holding one of the kernel's own programs and nothing else.
pub fn policy_store(h: &mut Heap, v: &Vocab, src: &str) -> Store {
    let clauses = dense_clauses(h, src).expect("kernel dense program");
    let mut pol = Store::new();
    for mut c in clauses {
        resolve_clause_books(v, &mut c);
        if c.body.is_empty() {
            let persp = match c.head.persp.as_atom() {
                Some(p) if !v.is_reserved(c.head.rel) => p,
                _ => v.kernel_persp,
            };
            let args = c.head.args.clone();
            pol.add(h, c.head.rel, persp, &args, F_BASE);
        } else {
            let (_, facts) = encode_rule(h, v, &c);
            for f in facts {
                pol.add(h, f.rel, v.kernel_persp, &f.args, F_BASE);
            }
        }
    }
    pol
}

// ------------------------------------------------------------------ arith

pub const ARITH_UNBOUND: u8 = 0;
pub const ARITH_TYPE: u8 = 1;
pub const ARITH_ZERO: u8 = 2;
pub const STR_TYPE: u8 = 3;
pub const STR_INDEX: u8 = 4;
pub const STR_SEP: u8 = 5;
pub const ATOM_NAME: u8 = 6;

fn hole_reason_of(v: &Vocab, code: u8) -> Sym {
    match code {
        ARITH_ZERO => v.arith_zero_reason,
        _ => v.arith_type_reason,
    }
}

pub fn eval_arith(h: &mut Heap, t: Term, s: &Subst, fail: &mut u8) -> Option<i64> {
    let t = walk(h, t, s);
    if let TermK::Int(v) = t.kind() {
        return Some(v);
    }
    if let TermK::Func(i) = t.kind() {
        let args = h.fargs(i).to_vec();
        if args.len() == 2 {
            let name = h.name(h.fname(i)).to_string();
            let l = eval_arith(h, args[0], s, fail)?;
            let r = eval_arith(h, args[1], s, fail)?;
            return match name.as_str() {
                "+" => Some(l + r),
                "-" => Some(l - r),
                "*" => Some(l * r),
                "/" => {
                    if r != 0 {
                        Some(l / r)
                    } else {
                        *fail = ARITH_ZERO;
                        None
                    }
                }
                "mod" => {
                    if r != 0 {
                        Some(l - r * (l / r))
                    } else {
                        *fail = ARITH_ZERO;
                        None
                    }
                }
                _ => {
                    *fail = ARITH_TYPE;
                    None
                }
            };
        }
    }
    *fail = if t.is_var() {
        ARITH_UNBOUND
    } else {
        ARITH_TYPE
    };
    None
}

pub enum StrOp {
    /// Not one of the destructors — the caller falls through to arithmetic.
    NotOne,
    Refused,
    Value(Term),
}

/// `evalStrOp` (src/reflect.ts:483). No corpus case exercises these, which is
/// measured rather than assumed (`rust/tools/probe.ts`), so they are ported for
/// completeness and reported as untested.
pub fn eval_str_op(h: &mut Heap, t: Term, s: &Subst, fail: &mut u8) -> StrOp {
    let t = walk(h, t, s);
    let TermK::Func(i) = t.kind() else {
        return StrOp::NotOne;
    };
    let name = h.name(h.fname(i)).to_string();
    let Some((_, inputs)) = STR_ARITY.iter().find(|(n, _)| *n == name) else {
        return StrOp::NotOne;
    };
    let args = h.fargs(i).to_vec();
    if args.len() != *inputs {
        *fail = STR_TYPE;
        return StrOp::Refused;
    }
    let Some(st) = str_operand(h, args[0], s, fail) else {
        return StrOp::Refused;
    };
    let cp: Vec<char> = st.chars().collect();
    match name.as_str() {
        "str_len" => return StrOp::Value(Term::int(cp.len() as i64)),
        "str_char" => {
            let Some(k) = int_operand(h, args[1], s, fail) else {
                return StrOp::Refused;
            };
            if k < 0 || k as usize >= cp.len() {
                *fail = STR_INDEX;
                return StrOp::Refused;
            }
            let c = cp[k as usize].to_string();
            return StrOp::Value(h.string(&c));
        }
        "str_sub" => {
            let Some(a) = int_operand(h, args[1], s, fail) else {
                return StrOp::Refused;
            };
            let Some(l) = int_operand(h, args[2], s, fail) else {
                return StrOp::Refused;
            };
            if a < 0 || l < 0 || (a + l) as usize > cp.len() {
                *fail = STR_INDEX;
                return StrOp::Refused;
            }
            let sub: String = cp[a as usize..(a + l) as usize].iter().collect();
            return StrOp::Value(h.string(&sub));
        }
        "atom_of" => {
            if !is_ident(&st) {
                *fail = ATOM_NAME;
                return StrOp::Refused;
            }
            return StrOp::Value(h.atom(&st));
        }
        _ => {}
    }
    let Some(sep) = str_operand(h, args[1], s, fail) else {
        return StrOp::Refused;
    };
    if sep.is_empty() {
        *fail = STR_SEP;
        return StrOp::Refused;
    }
    if name == "str_pre" {
        let pre = match st.find(&sep) {
            Some(at) => st[..at].to_string(),
            None => String::new(),
        };
        return StrOp::Value(h.string(&pre));
    }
    let parts: Vec<&str> = st.split(&sep as &str).collect();
    if name == "str_segs" {
        return StrOp::Value(Term::int(parts.len() as i64));
    }
    if name != "str_seg" {
        return StrOp::NotOne;
    }
    let Some(k) = int_operand(h, args[2], s, fail) else {
        return StrOp::Refused;
    };
    if k < 0 || k as usize >= parts.len() {
        *fail = STR_INDEX;
        return StrOp::Refused;
    }
    let p = parts[k as usize].to_string();
    StrOp::Value(h.string(&p))
}

fn str_operand(h: &mut Heap, t: Term, s: &Subst, fail: &mut u8) -> Option<String> {
    let nested = eval_str_op(h, t, s, fail);
    let w = match nested {
        StrOp::Refused => return None,
        StrOp::Value(x) => x,
        StrOp::NotOne => walk(h, t, s),
    };
    match w.kind() {
        TermK::Str(x) => Some(h.name(x).to_string()),
        TermK::Var(_) => {
            *fail = ARITH_UNBOUND;
            None
        }
        _ => {
            *fail = STR_TYPE;
            None
        }
    }
}

fn int_operand(h: &mut Heap, t: Term, s: &Subst, fail: &mut u8) -> Option<i64> {
    let v = eval_arith(h, t, s, fail);
    if v.is_none() && *fail == ARITH_TYPE {
        *fail = STR_TYPE;
    }
    v
}

/// The shape `tokenize` accepts as an identifier. An APPROXIMATION of the JS
/// tokenizer, and said so: nothing in the corpus reaches `atom_of`.
fn is_ident(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(name: &str) -> String {
        std::fs::read_to_string(format!(
            "{}/../../facts/port-corpus/{name}.seed.json",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap()
    }

    /// n ticks of one corpus world under one retention setting: the canonical
    /// state, and how many `derived_by` rows are left standing.
    fn ticked(name: &str, ticks: u32, retain: Option<u32>) -> (String, usize, Vec<i64>) {
        let mut l = crate::load(&seed(name), 1_000_000).unwrap();
        l.eval.retain_ticks = retain;
        for _ in 0..ticks {
            l.eval.tick_advance().unwrap();
        }
        let db = l.eval.v.derived_by;
        let rows: Vec<FactId> = l
            .eval
            .store
            .all_facts()
            .into_iter()
            .filter(|&id| l.eval.store.rec(id).rel == db)
            .collect();
        // WHICH TICKS the survivors are dated to, and not merely how many.
        // `T >= tick + 1 - n` and `T >= tick - n` both prune and both shrink
        // the count; only the surviving SET tells them apart.
        let mut ts: Vec<i64> = rows
            .iter()
            .filter_map(|&id| l.eval.store.args(id).get(2).and_then(|t| t.as_int()))
            .collect();
        ts.sort_unstable();
        ts.dedup();
        (l.eval.store.canonical_state(&l.eval.h), rows.len(), ts)
    }

    /// THE ONE CHECK THAT CAN SEE `retain_ticks`. The port corpus cannot: the
    /// generator runs `new Rofl()` with default options, so `retainTicks` is
    /// unset in every one of the 34 expected files and the pruning branch is
    /// invisible to the oracle BY CONSTRUCTION (CLAUDE.md, "an opt-in feature
    /// is invisible to every check here"). So the flag is exercised here, on a
    /// real ticked world, or it is not exercised at all.
    #[test]
    fn retention_drops_completed_ticks_and_keeps_the_present_one() {
        let (all, n_all, t_all) = ticked("counter", 3, None);
        let (one, n_one, t_one) = ticked("counter", 3, Some(1));
        let (none, n_none, t_none) = ticked("counter", 3, Some(0));
        assert_eq!(t_all, vec![0, 1, 2, 3], "unset keeps every completed tick");
        // Three boundaries crossed, so the tick just ENDED is 2 and the tick
        // just ENTERED is 3. n counts history, not the present: n = 0 keeps no
        // completed tick, and 3 is still there because it wrote AFTER the
        // boundary and was never a candidate.
        assert_eq!(t_none, vec![3], "n=0 keeps no completed tick");
        assert_eq!(t_one, vec![2, 3], "n=1 keeps the tick just ended");
        assert!(n_none < n_one && n_one < n_all, "{n_none} {n_one} {n_all}");
        assert_ne!(all, one);
        assert_ne!(one, none);
    }

    /// TWO GATES, AND BOTH MUST OPEN (src/api.ts:1006). `examples/cram` reads
    /// `derived_by` in four rule bodies (examples/cram/flight_log.rofl:30), so
    /// its provenance is derivable data rather than a cache and the setting
    /// must be ignored. `counter` in the same test is the positive control: an
    /// assertion that a setting changes nothing is worth nothing without one.
    #[test]
    fn a_program_that_reads_provenance_keeps_it_whatever_the_setting_says() {
        let (cram_all, cram_n, _) = ticked("cram", 3, None);
        let (cram_pruned, cram_pn, _) = ticked("cram", 3, Some(0));
        assert_eq!(
            cram_all, cram_pruned,
            "cram reads derived_by; the gate stays shut"
        );
        assert_eq!(cram_n, cram_pn);
        let (ctr_all, _, _) = ticked("counter", 3, None);
        let (ctr_pruned, _, _) = ticked("counter", 3, Some(0));
        assert_ne!(
            ctr_all, ctr_pruned,
            "positive control: the setting does bite where the gate opens"
        );
    }

    /// THE BOUNDARY CARRIES A STAGED FACT'S PROVENANCE ACROSS IT
    /// (src/store.ts:658). Removal takes the witness with the fact, so the
    /// firings of a fact that is dropped and immediately re-installed as a
    /// next-tick base fact have to be read out before the drop and put back
    /// after it — and the number that survives is asserted, not merely that
    /// something did.
    #[test]
    fn a_staged_facts_witnesses_survive_the_drop() {
        // Measured, one advancing tick each. The plain corpus case is the
        // control: it is the same world at tick 0, where the witness table is
        // an order of magnitude larger, so a zero here would be the boundary
        // eating provenance rather than the world having none.
        for (name, at_tick_0, carried) in [("tm", 66, 10), ("counter", 56, 4), ("oops", 135, 49)] {
            let mut l = crate::load(&seed(name), 1_000_000).unwrap();
            let before = l.eval.store.firing_keys().len();
            assert_eq!(before, 0, "{name}: a restored seed carries no live firing");
            l.eval.ensure().unwrap();
            assert_eq!(
                l.eval.store.firing_keys().len(),
                at_tick_0,
                "{name} at tick 0"
            );
            l.eval.tick_advance().unwrap();
            assert_eq!(
                l.eval.store.firing_keys().len(),
                carried,
                "{name}: firings carried across the boundary"
            );
            assert_eq!(l.eval.store.tick, 1);
            assert_eq!(l.eval.store.tick_log.len(), 1);
            assert!(l.eval.store.tick_log[0].starts_with("tick 1: "));
        }
    }

    /// WHAT A TICKED CASE DOES NOT COVER, asserted so the number cannot drift
    /// silently. `scripts/port_corpus.ts` reads `canonicalState` immediately
    /// after the last `tickAdvance`, and a boundary leaves the store DIRTY —
    /// so the entered tick has never been evaluated and the witness table is
    /// down to the handful of firings the boundary itself carried across. Over
    /// the seven ticked cases that is 4 of 647 facts (counter.t3) up to 142 of
    /// 2180 (cram.t3), and ZERO facts with more than one firing anywhere.
    /// M2 — the canonical witness pick — is therefore killed by all 27 plain
    /// cases and by NONE of the 7 ticked ones.
    #[test]
    fn a_ticked_case_is_read_before_the_entered_tick_is_evaluated() {
        let mut l = crate::load(&seed("counter"), 1_000_000).unwrap();
        for _ in 0..3 {
            l.eval.tick_advance().unwrap();
        }
        assert!(l.eval.store.dirty, "a boundary leaves the store dirty");
        let multi = l
            .eval
            .store
            .firing_keys()
            .into_iter()
            .filter(|&id| l.eval.store.support_count(id) > 1)
            .count();
        assert_eq!(multi, 0, "no ticked case holds a multiply-derived fact");
        assert_eq!(l.eval.store.firing_keys().len(), 4);
        // And one evaluation of the entered tick brings the table back, which
        // is what the corpus would gain from asking for it.
        l.eval.ensure().unwrap();
        let after = l.eval.store.firing_keys().len();
        assert!(
            after > 50,
            "one evaluate restores the witness table: {after}"
        );
    }
}
