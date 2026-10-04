//! The evaluator: semi-naive fixpoint, the front, the join, provenance.
//!
//! A port of `src/engine.ts` plus `src/rounds.ts`. `RoundEvaluation` is what
//! `src/api.ts` runs by default (`opts.evaluator ?? 'rounds'`, src/api.ts:181),
//! so it is what the corpus oracle was produced by and what `Mode::Rounds`
//! reproduces here; `Mode::Strata` is the stock path, and it is not decoration
//! — the kernel's own `safety.rofl` sub-evaluation runs under it.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::rc::Rc;

use crate::cell::{key_atoms, rank_cmp, KeyAtom, Algebra, iv_bounds, mk_iv, narrow_iv, INT_MAX, INT_MIN, quorum, set_contains, set_elems, widen_iv, AggOp, Class, IvFault, IvFn, KeyCache, Sorted, Step, TagAlg, TagFault, Val, NINF, PINF};
use crate::dense::dense_clauses;
use crate::reflect::*;
use crate::store::{
    Member,
    resolved_lit_key, tuple_text, write_fact_key, CellId, CellOwner, CellValue, Dominators, FactId, FactRec, FxMap, FxSet, LatReg, NewCell,
    NewMember, PremRef, Seal, StagedHead, Store, WitView, Witness, F_BASE, F_FROZEN, F_TICK,
};
use crate::term::*;

mod datastrat;
mod delta;
mod joinplan;
pub use delta::Delta;

const MAX_DEPTH: usize = 512;
const MAX_ALTERNATIONS: usize = 256;
const DEFAULT_SPACE: i64 = 500_000;
const POLICY_BUDGET: i64 = 20_000_000;
/// the most descending passes narrowing makes after a widening
const NARROW_PASSES: usize = 4;
/// What stands in a correlation's key for a group variable nothing bound (datastrat.rs).

fn ds_any_name() -> &'static str {
    brk!("ds_any_writable" => "$ds_any"; DS_ANY)
}

#[derive(Debug)]
pub enum Halt {
    /// A wall: `budget_exhausted` or `space_exhausted`, plus the rule that was
    /// holding the rows when the space wall was reached.
    Budget(&'static str, Option<Sym>),
    Strat(String, String),
    Bug(String),
    /// A descending pass has gathered what it came for (`narrow_descend`).
    Narrowed,
    /// A delta-first firing outgrew the space; it is solved again in written
    /// order, which holes or not as it always did (`joinplan.rs`).
    Overrun,
}

pub struct ERule {
    pub id: Sym,
    pub clause: Clause,
    pub canon: String,
    pub safe: bool,
    pub has_neg: bool,
    /// An aggregate in the body: stratified like a negation, and fired only
    /// once every relation it reads is closed.
    pub has_agg: bool,
    /// A threshold `at_least` in the body: monotone, so not stratified; its
    /// inner positive relations (`thr_rels`) are triggers, and news on one
    /// fires the whole rule again.
    pub has_thr: bool,
    pub thr_rels: Vec<Sym>,
    /// The lattice relations it reads from outside their recursion
    /// (safety.rofl's `lattice_outer`): strict edges, fired once each is closed.
    pub lattice_outer: Vec<Sym>,
    /// The lattice whose close decides this rule's faults: the lattice it
    /// concludes into, or the first it reads inside its recursion.
    pub lat_close: Option<Sym>,
    pub pos_rels: Vec<Sym>,
    pub has_demand_prem: bool,
    pub trigger_rels: Vec<Sym>,
    pub plan: Vec<BodyElem>,
}

#[derive(Clone, Debug)]
pub struct Closure {
    pub rel: Sym,
    pub persp: Sym,
    pub edge: Sym,
    pub edge_persp: Sym,
    /// `E(X, Y)` is the path X to Y; false when the rules read it the other way.
    pub edge_fwd: bool,
    pub base: Sym,
    pub step: Sym,
    /// The step's plan reads R before E.
    pub r_first: bool,
    /// The step is right-linear, `R(X, Z) :- E(X, Y), R(Y, Z)`.
    pub right: bool,
}

/// Each relation concluded by exactly two rules of the closure shape.
fn find_closures(rules: &[Rc<ERule>], refused: &HashSet<Sym>) -> Vec<Closure> {
    let vars = |ts: &[Term]| ts.len() == 2 && ts[0].is_var() && ts[1].is_var() && ts[0] != ts[1];
    let plain = |l: &Lit| l.temporal == Temporal::Now && l.persp.is_atom() && vars(&l.args);
    fn pos(b: &BodyElem) -> Option<&Lit> {
        match b {
            BodyElem::Pos(l) => Some(l),
            _ => None,
        }
    }
    let mut by_head: HashMap<Sym, Vec<&Rc<ERule>>> = HashMap::new();
    for r in rules {
        by_head.entry(r.clause.head.rel).or_default().push(r);
    }
    let mut out = Vec::new();
    for (rel, rs) in by_head {
        if rs.len() != 2 || refused.contains(&rel) {
            continue;
        }
        let (a, b) = (rs[0], rs[1]);
        let (base, step) = if a.clause.body.len() == 1 { (a, b) } else { (b, a) };
        if base.clause.body.len() != 1 || step.clause.body.len() != 2 || base.has_demand_prem || step.has_demand_prem {
            continue;
        }
        let (bh, sh) = (&base.clause.head, &step.clause.head);
        let Some(e) = pos(&base.clause.body[0]) else { continue };
        if !plain(bh) || !plain(sh) || !plain(e) || e.rel == rel || bh.persp != sh.persp || refused.contains(&e.rel) {
            continue;
        }
        let edge_fwd = if e.args[0] == bh.args[0] && e.args[1] == bh.args[1] {
            true
        } else if e.args[1] == bh.args[0] && e.args[0] == bh.args[1] {
            false
        } else {
            continue;
        };
        let orient = |l: &Lit| if edge_fwd { (l.args[0], l.args[1]) } else { (l.args[1], l.args[0]) };
        let (Some(p), Some(q)) = (pos(&step.clause.body[0]), pos(&step.clause.body[1])) else { continue };
        let (rp, ep) = if p.rel == rel && q.rel == e.rel { (p, q) } else if q.rel == rel && p.rel == e.rel { (q, p) } else { continue };
        if !plain(rp) || !plain(ep) || rp.persp != bh.persp || ep.persp != e.persp {
            continue;
        }
        let (h0, h1) = (sh.args[0], sh.args[1]);
        let (e0, e1) = orient(ep);
        let left = rp.args[0] == h0 && e1 == h1 && rp.args[1] == e0 && e0 != h0 && e0 != h1;
        let right = e0 == h0 && rp.args[1] == h1 && e1 == rp.args[0] && e1 != h0 && e1 != h1;
        if !(left || right) {
            continue;
        }
        let r_first = step.plan.iter().find_map(|b| pos(b).map(|l| l.rel == rel)).unwrap_or(true);
        out.push(Closure {
            rel,
            persp: bh.persp.as_atom().unwrap(),
            edge: e.rel,
            edge_persp: e.persp.as_atom().unwrap(),
            edge_fwd,
            base: base.id,
            step: step.id,
            r_first,
            right,
        });
    }
    out.sort_by_key(|c| c.rel);
    out
}

/// The rules grouped by the strongly connected components of their head
/// relations over the positive premises among them, a component after
/// everything it reads: the order in which each closes before its readers fire.
fn components(rules: &[Rc<ERule>]) -> Vec<Vec<Rc<ERule>>> {
    let heads: HashSet<Sym> = rules.iter().map(|r| r.clause.head.rel).collect();
    let mut dep: HashMap<Sym, Vec<Sym>> = HashMap::new();
    for r in rules {
        let e = dep.entry(r.clause.head.rel).or_default();
        for p in &r.pos_rels {
            if heads.contains(p) && !e.contains(p) {
                e.push(*p);
            }
        }
    }
    let mut order: Vec<Sym> = heads.iter().copied().collect();
    order.sort();
    let (mut index, mut low, mut comp) = (HashMap::new(), HashMap::new(), HashMap::new());
    let mut stack: Vec<Sym> = Vec::new();
    let mut n_comp = 0usize;
    fn strong(v: Sym, dep: &HashMap<Sym, Vec<Sym>>, index: &mut HashMap<Sym, usize>, low: &mut HashMap<Sym, usize>, stack: &mut Vec<Sym>, comp: &mut HashMap<Sym, usize>, n_comp: &mut usize) {
        let i = index.len();
        index.insert(v, i);
        low.insert(v, i);
        stack.push(v);
        for &w in dep.get(&v).map(|d| d.as_slice()).unwrap_or(&[]) {
            if !index.contains_key(&w) {
                strong(w, dep, index, low, stack, comp, n_comp);
                let lw = low[&w];
                let lv = low.get_mut(&v).unwrap();
                *lv = (*lv).min(lw);
            } else if !comp.contains_key(&w) {
                let iw = index[&w];
                let lv = low.get_mut(&v).unwrap();
                *lv = (*lv).min(iw);
            }
        }
        if low[&v] == index[&v] {
            while let Some(w) = stack.pop() {
                comp.insert(w, *n_comp);
                if w == v {
                    break;
                }
            }
            *n_comp += 1;
        }
    }
    for v in order {
        if !index.contains_key(&v) {
            strong(v, &dep, &mut index, &mut low, &mut stack, &mut comp, &mut n_comp);
        }
    }
    let mut out: Vec<Vec<Rc<ERule>>> = vec![Vec::new(); n_comp];
    for r in rules {
        out[comp[&r.clause.head.rel]].push(r.clone());
    }
    out.retain(|c| !c.is_empty());
    out
}

#[derive(Default)]
#[derive(Clone)]
pub struct Front {
    pub keys: FxSet<FactId>,
    pub by_rel: FxMap<Sym, FxSet<FactId>>,
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

/// A lattice cell: relation, book, key (the head prefix).
type LatKey = (Sym, Sym, Box<[Term]>);
/// A value a subsumptive cell was given: the cell, and the arguments after
/// the key.
type SubVal = (LatKey, Box<[Term]>);

/// A SUBSUMPTIVE RELATION (docs/aggregates.md, "Subsumption, as built"): its
/// key length and its dominance rules, each with its body planned with the
/// two facts' variables bound. Its cell at a key is the antichain its rules
/// leave: every value no other value it was given dominates.
pub struct Sub {
    pub arity: usize,
    pub keylen: usize,
    pub doms: Vec<(DomRule, Vec<BodyElem>)>,
    /// The relations its dominance bodies read: closed before any of its
    /// values is compared, strictly below it.
    pub reads: Vec<Sym>,
}

/// What one dominance question answered: no; yes, by a rule; a builtin of
/// the body failed for an error, so it is not known; or the body could read
/// something a hole left unknown.
#[derive(Clone)]
enum DomV {
    No,
    Yes(Sym),
    Fault(Sym, Sym),
    Unknown(Unknown, Sym),
}
/// A threshold group under a substitution: its members for certain, how
/// many it could have at most (`None`: not known), and N.
type ThrVerdict = (Subst, HashSet<Vec<Term>>, Option<usize>, usize);

/// ONE DESCENDING PASS over the widened cells (`narrow_descend`): each cell
/// of `frozen` stands at its value and takes no contribution, `fresh` is the
/// join of the contributions its rules make from those values, and `left`
/// the relations of `frozen` that have not closed yet.
#[derive(Clone)]
struct Narrowing {
    frozen: HashMap<LatKey, Term>,
    fresh: HashMap<LatKey, Term>,
    left: HashSet<Sym>,
    /// relations of `frozen` whose recursion met a fault: what a rule would
    /// have contributed past it is unknown, so `fresh` is no enclosure there
    faulted: HashSet<Sym>,
}

/// A builtin that failed for an error in a rule a lattice decides, held until
/// that lattice (`close`) closes: applied then if every fact the failed
/// derivation read still stands, all of them judged before any is applied.
/// `what` is what the failure leaves unknown (the conclusion it was for),
/// `rule` the rule hole it writes.
#[derive(Clone)]
struct LatFault {
    close: Sym,
    what: Option<Unknown>,
    rule: Option<Sym>,
    reason: Sym,
    facts: Vec<FactId>,
}

/// What a hole leaves unknown in a lattice's recursion: a cell's value, every
/// cell or tuple of a relation (the key was not bound), or whether a tuple of
/// another relation holds. Whatever a rule concludes from one is unknown too
/// (`poison`).
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
enum Unknown {
    Cell(LatKey),
    Rel(Sym),
    Tuple(Sym, Sym, Box<[Term]>),
}

impl Unknown {
    fn rel(&self) -> Sym {
        match self {
            Unknown::Cell(k) => k.0,
            Unknown::Rel(r) => *r,
            Unknown::Tuple(r, _, _) => *r,
        }
    }
}

/// WHERE A SHRUG COMES FROM (docs/aggregates.md, "Shrugs, as built"): an
/// unknown, or the target of a hole row. `unk_edges` holds each child with a
/// parent it was reached from; a hole target with no parent is a root.
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
enum Node {
    Unk(Unknown),
    Hole(Term),
}

/// `Eval::root_sets`: every node's component, and each component's roots.
/// The relations on a negative cycle below each relation, memoised
/// (`Eval::negative_cycles`).
struct NegCycles {
    idx: HashMap<Sym, usize>,
    rels: Vec<Sym>,
    succ: Vec<Vec<usize>>,
    comp: Vec<usize>,
    neg: HashSet<usize>,
    memo: HashMap<Sym, Vec<Sym>>,
}

impl NegCycles {
    /// The relations `rel` rests on that lie on a negative cycle, sorted.
    fn of(&mut self, h: &Heap, rel: Sym) -> Vec<Sym> {
        if let Some(v) = self.memo.get(&rel) {
            return v.clone();
        }
        let mut out: Vec<Sym> = Vec::new();
        if let Some(&start) = self.idx.get(&rel) {
            let mut seen = vec![false; self.rels.len()];
            seen[start] = true;
            let mut todo = vec![start];
            while let Some(x) = todo.pop() {
                if self.neg.contains(&self.comp[x]) {
                    out.push(self.rels[x]);
                }
                for &y in &self.succ[x] {
                    if !seen[y] {
                        seen[y] = true;
                        todo.push(y);
                    }
                }
            }
        }
        out.sort_by(|a, b| cmp_js(h.name(*a), h.name(*b)));
        self.memo.insert(rel, out.clone());
        out
    }
}

struct RootSets {
    index: HashMap<Node, usize>,
    nodes: Vec<Node>,
    parents: Vec<Vec<usize>>,
    comp: Vec<usize>,
    sets: Vec<Vec<usize>>,
    text: HashMap<usize, String>,
}

impl RootSets {
    fn has_parents(&self, n: &Node) -> bool {
        self.index.get(n).is_some_and(|&i| !self.parents[i].is_empty())
    }

    /// The root targets `n` rests on, sorted: its parents' roots.
    fn of(&self, n: &Node) -> Vec<Term> {
        let Some(&i) = self.index.get(n) else { return Vec::new() };
        let mut rs: Vec<usize> = self.parents[i].iter().flat_map(|&p| self.sets[self.comp[p]].iter().copied()).collect();
        rs.sort_unstable();
        rs.dedup();
        let mut keyed: Vec<(&str, Term)> = rs
            .into_iter()
            .filter_map(|r| match &self.nodes[r] {
                Node::Hole(t) => Some((self.text[&r].as_str(), *t)),
                Node::Unk(_) => None,
            })
            .collect();
        keyed.sort_by(|a, b| cmp_js(a.0, b.0));
        keyed.dedup_by(|a, b| a.0 == b.0);
        keyed.into_iter().map(|x| x.1).collect()
    }
}

/// A rank over a tuple: each key's direction and the subject asked, or the
/// fault reading it was.
struct RankKey {
    desc: Vec<bool>,
    subject: Result<Vec<KeyAtom>, Sym>,
}

/// A holistic group sealed once and shared (`Eval::hol_shared`): the
/// inner body's fault, or each group's first cell, whose members every later
/// cell of the group shares, and its values sorted, or why they have none.
#[derive(Clone)]
enum HolShared {
    Open(Sym),
    Groups(Rc<[(Box<[Term]>, CellId, Result<Sorted, Sym>)]>),
}

#[derive(Default, Clone)]
struct Assumption {
    recs: HashMap<FKey, FactId>,
    by_rel: HashMap<Sym, Vec<FactId>>,
}

#[derive(Default, Clone)]
struct RuleAnswer {
    unsafe_rules: Vec<Sym>,
    demand_rels: Vec<Sym>,
    trigger: HashMap<Sym, Vec<Sym>>,
    late: Vec<Sym>,
    reads_provenance: bool,
    /// safety.rofl's refusals of an aggregate, `(rule, reason)`.
    agg_refused: Vec<(Sym, Sym)>,
    /// `(rule, at)`: an aggregate whose empty group is a sealed zero.
    empty_zero: HashSet<(Sym, u32)>,
    /// Some rule reads `agg_member` or `agg_member_prem`, so they are written.
    reads_members: bool,
    /// safety.rofl's refusals of a lattice declaration, `(relation, reason)`.
    lattice_refused: Vec<(Sym, Sym)>,
    /// Rule -> the lattice relations it reads from outside their recursion:
    /// strict edges, like a negation's.
    lattice_outer: HashMap<Sym, Vec<Sym>>,
    /// Some rule reads `lattice_member` or `lattice_member_prem`.
    reads_lattice_members: bool,
    /// Some rule reads `dominated_by`.
    reads_dominated: bool,
}

/// An aggregate element, planned once per rule by `prepare`. Indices, not
/// names, so a renamed clause reads its own variables through them.
pub struct AggPlan {
    pub op: AggOp,
    /// The inner body in the order it is solved, as indices into `Agg::body`.
    pub inner_order: Vec<usize>,
    /// Indices into `Agg::shared` bound before the aggregate: the correlation.
    pub corr: Vec<usize>,
    /// The rest of `Agg::shared`: the group variables it binds.
    pub group: Vec<usize>,
    /// What it reads, in `premise_agg` order.
    pub rels: Vec<Sym>,
    pub empty_zero: bool,
}

/// The reason safety.rofl gives, as a sentence both engines use.
pub fn agg_refusal_text(reason: &str, rel: Option<&str>) -> String {
    match reason {
        "sum_needs_key" => "sum needs its projection key: sum(V ; K : body); without K two equal contributions would be one".into(),
        "key_on_count" => "count takes no key: the counted terms are the key, count(K1, K2 : body)".into(),
        "key_on_idempotent" => "min, max, or and and take no key: equal values merge anyway".into(),
        "one_value" => "this aggregate takes exactly one value".into(),
        "count_needs_a_term" => "count needs the terms it counts".into(),
        "member_unbound" => "the aggregate's body does not bind every term it counts, sums or groups by".into(),
        "unsafe" => "the rule is not range-restricted, so its aggregate would be unfolded at a call site before its input is closed".into(),
        "reads_live_kernel" => format!(
            "an aggregate cannot read {}: the kernel writes it while the evaluation runs, so no round closes it",
            rel.unwrap_or("that relation")
        ),
        "demand_head" => "its aggregate would be unfolded at a call site (the rule concludes a demand-backed relation)".into(),
        "key_on_threshold" => "at_least takes no key: the counted terms are the key, at_least(N, K1, K2 : body)".into(),
        "threshold_needs_a_term" => "at_least needs the terms it counts".into(),
        "holistic_needs_key" => "median and quantile need their projection key: median(V ; K : body), quantile(P, V ; K : body); \
            without K two equal values would be one member".into(),
        "param_and_value" => "quantile and rank take two terms before their body: quantile(P, V ; K : body), rank(S, V : body)".into(),
        "rank_key_arity" => "a rank over a tuple takes a key for every subject: rank(S1, S2 ; K1, desc(K2) : body)".into(),
        "threshold_lattice" => "a threshold may count only what no open lattice can still supersede or withdraw: it neither \
            reads a lattice (or what rests on one) before that lattice closes, nor concludes one, nor sits inside one's recursion; \
            read the lattice through a rule of its own, above it".into(),
        "lattice_arity" => "it writes a lattice relation at an arity other than its declaration's".into(),
        "lattice_two_algebras" => "its head is a lattice of one operation and its value a body aggregate of another: a relation has one algebra".into(),
        "lattice_negated" => "it negates a lattice relation inside that relation's recursion: a non-monotone read comes only from a higher stratum".into(),
        "set_pattern" => format!(
            "{}; this head's relation is no join lattice",
            crate::program::set_pattern_reason("the value of its head")
        ),
        "join_value_off_carrier" => "it reads a join lattice with a value no value of its carrier can match, so the literal \
            could never hold: a union's value is `set(E, ...)`, a hull's `iv(Lo, Hi)` with Lo <= Hi, a bitor's an integer of [0, 2^60); \
            the slot takes a variable, such a value, `set(T)` or `iv(A, B)` of variables and integers (`ninf` a low end, `inf` a high one)".into(),
        "lattice_unwidened" => "it computes a hull's value from that hull's own value by an interval function (ivadd, ivsub, ivmul, ivmeet) \
            inside its recursion, and no relation on that cycle declares a widening, so nothing bounds how often the value can grow: \
            declare one, `lattice p(K, hull I) widen N.`".into(),
        "order_nonmonotone" => "it reads a relation with a declared order inside its recursion, or concludes one, and is not monotone in that order: a value of an ordered relation may flow only into a value of a head that improves the same way (directly, or through X is V + E, V - E, E - V, min(V, E), max(V, E)) and into a comparison that stays true as the value improves (V < N for min, V > N for max); under pareto each value moves on its own, and under lex only the first value, strictly (+, - or a copy), may be compared, and each later value goes only into the value at its own place of a lex head whose first value is computed from the first one read".into(),
        "lattice_nonmonotone" => "it reads a lattice relation inside its recursion and is not monotone in the value: the value may flow only into \
            a lattice head's value (directly, or through X is V + E, V - E, E - V, min(V, E), max(V, E)) in the direction that head improves, or into a comparison \
            that stays true as the value improves (D < N for min, D > N for max, B = true for or, B = false for and); a join's value \
            (union, hull, bitor) only into a head of the same join or as S in `E in S` and `A subset S`, and a hull's through \
            an interval function, X is ivadd(V, E), ivsub(V, E), ivsub(E, V), ivmul(V, K), ivmeet(V, E)".into(),
        "tag_weight_reads_tag" => "its head's tag is its weight, and the weight reads a tag of the body the engine multiplies in \
            (⊗ through the body), so that tag would count twice: leave the head's tag a variable the body does not bind, \
            and the engine writes the ⊗ of the body's tags (docs/aggregates.md, \"Tags, as built\")".into(),
        "tag_arity" => "it writes or reads a tagged relation at an arity other than its declaration's".into(),
        other => format!("safety.rofl refused it ({other})"),
    }
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

#[derive(Clone)]
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
    /// Nanoseconds in each rule's firings, and per round the sum and the longest rule: the bound on firing rules in parallel.
    pub ns_by_rule: HashMap<Sym, u64>,
    /// Per rule: firings, solutions concluded, and rows that were new.
    pub fires_by_rule: HashMap<Sym, u64>,
    pub sols_by_rule: HashMap<Sym, u64>,
    pub new_by_rule: HashMap<Sym, u64>,
    /// Firings solved delta-first.
    pub delta_by_rule: HashMap<Sym, u64>,
    /// Delta-first join plans (`joinplan.rs`), per rule and news position, and
    /// the premise statistics their estimates read. `ROFL_NO_DELTA_FIRST` keeps
    /// every firing in written order.
    delta_first: bool,
    /// A caller set a steps or space wall (`--budget`, `--space`): where a
    /// wall cuts must not depend on the plan, so firings stay in written
    /// order unless `delta_first_under_walls` opts in.
    pub walls_set: bool,
    pub delta_first_under_walls: bool,
    plan_trial: bool,
    pub delta_ns: u64,
    delta_plans: HashMap<(Sym, usize), joinplan::Slot>,
    delta_stats: HashMap<Vec<u64>, (usize, usize, usize)>,
    pub rounds: Vec<(u64, u64)>,
    /// The relations read off the program as a transitive closure: a base rule
    /// `R(X, Y) :- E(X, Y)` and one linear step through E, nothing else
    /// concluding R. Where no lattice can withdraw, the pair is one walk over
    /// E whenever E is news, with the firings the two rules would have made.
    pub closures: Vec<Closure>,
    closure_of: HashMap<Sym, (usize, bool)>,
    pub closure_rows: u64,
    pub closure_runs: u64,
    pub naive: bool,
    pub mode: Mode,
    pub steps: i64,
    pub rows: i64,
    pub peak_rows: i64,
    pub diags: Vec<String>,
    pub rules: Vec<Rc<ERule>>,
    /// Each rule's place in `rules`, by id.
    rule_at: HashMap<Sym, usize>,
    pub well_founded: bool,
    /// How many times a lattice cell improved this evaluation: each retired
    /// a fact. What `tests/lattice_scale.rs` holds against the number of keys.
    pub lattice_improvements: u64,
    hole_id: Term,
    /// What a variable stands for when it reads an unknown cell's value
    /// (`poison`): never a value any rule can write.
    unknown_value: Term,
    demand_rels: Vec<(Sym, Vec<Rc<ERule>>)>,
    active: Vec<Rc<ERule>>,
    staged: HashMap<FKey, StagedFact>,
    /// The other firings that staged a fact, kept while a lattice could
    /// still withdraw what the first one read (`settle_staged`).
    staged_alts: HashMap<FKey, Vec<(Sym, Vec<PremRef>)>>,
    /// While a retraction fires the rules that stage again: whether a second firing reached a staged key
    /// (the evaluation kept the first one, by its schedule).
    staged_watch: Option<bool>,
    /// WHAT A HOLE LEFT UNSTAGED: a conclusion `@next` an unknown reached,
    /// as the unknown it is in the tick it would arrive in, and whether only
    /// plain holes reached it. The boundary writes each as a hole
    /// `$next(Rel, Persp, Tick, Args)` of that tick (`carried_unknowns`), and
    /// that tick's evaluation carries it on as a hole of its own would be.
    staged_unknown: HashMap<Unknown, bool>,
    /// `why`'s past premises, the frozen `derived_by` rows by (fact, tick):
    /// built once per explanation.
    past_rows: Option<HashMap<(Term, i64), Vec<Sym>>>,
    /// The `unknown` rows a plain `why` walks, while it walks (`UnkCtx`).
    why_unk: Option<UnkCtx>,
    /// What this `why` has written out in full, a fact or a cell (`true`): a second
    /// reach is a reference, `[above]`.
    why_done: HashSet<(bool, u32)>,
    /// Derivation heights, for the firing `why` shows of each fact; put back
    /// at every question, the store being free to change between two.
    why_heights: HashMap<FactId, u32>,
    /// The cells this `why` has met under each header text (`desc = value`), in
    /// order: a second cell under one header is told apart by `(cell 2)`.
    why_heads: HashMap<String, Vec<u32>>,
    /// Cell members `cited_past` walked at the last boundary: each cell once.
    pub past_walks: u64,
    /// `derived_by` rows `why` read for past premises since its last call.
    pub why_scans: u64,
    agg_plans: HashMap<(Sym, u32), Rc<AggPlan>>,
    /// DATA-LEVEL STRATIFICATION (`datastrat.rs`): the components of the
    /// evaluation, the aggregate elements `(rule, at)` they hold, the
    /// correlations released so far, and the elements whose component has run
    /// to its end, where a correlation never released is a defect.
    ds_comps: Vec<Rc<datastrat::DsComp>>,
    ds_elems: HashSet<(Sym, u32)>,
    ds_released: HashSet<datastrat::AggKey>,
    ds_done: HashSet<(Sym, u32)>,
    /// A firing a layer of a data-stratified component makes again, that concludes nothing new, is a step (`fire_keys`).
    ds_charge: bool,
    /// The final firing of a data-stratified component concludes nothing the layers did not (`run_data_level`).
    ds_check: bool,
    /// The correlations a layer released, and the element `fire_keys` is firing: an instance two of them release
    /// is fired by the first alone (`ds_gate`).
    ds_layer: HashSet<datastrat::AggKey>,
    ds_firing: Option<(Sym, u32)>,
    /// The lattice relations, from `lattice_decl`: arity and operation; an
    /// idempotent tag's too, as the order lattice it is.
    lattices: HashMap<Sym, (usize, AggOp)>,
    /// `lattice_decl` rows and the idempotent tags', safety.rofl's input.
    lattice_rows: Vec<(Sym, usize, Sym)>,
    /// Declaration rows of no declaration's shape, as sentences.
    decl_refused: Vec<String>,
    /// THE SEMIRING TAGS (docs/aggregates.md, "Tags, as built"), the rules
    /// whose clause `tag::lower` rewrote, and the rules it refused.
    pub tags: crate::tag::Tags,
    tag_changed: HashSet<Sym>,
    tag_refused: Vec<(Sym, Sym)>,
    /// A lattice concluded `@next` carries its value in a relation of its
    /// own, `L@next` (a name no program can write): staged at T, base at T+1,
    /// and a contribution to L there by the rule `carry_rule` makes. Carried
    /// relation to lattice.
    carried: HashMap<Sym, Sym>,
    /// The rules that conclude `@next`: a cell one seals is reflected in the
    /// tick its conclusion arrives in, not the one it is sealed in.
    next_rules: HashSet<Sym>,
    /// A lattice cell's current fact, by `(rel, persp, key)`.
    lat_cur: HashMap<LatKey, FactId>,
    /// THE SUBSUMPTIVE RELATIONS, and each cell's antichain: its standing
    /// facts, in the order they were admitted.
    pub subs: HashMap<Sym, Rc<Sub>>,
    /// Every relation a dominance rule names, subsumptive or refused.
    dom_rels: HashSet<Sym>,
    sub_cur: HashMap<LatKey, Vec<FactId>>,
    /// Every value each cell was given this evaluation, in the order given,
    /// with the value that dominated it first when one did: the close checks
    /// the antichain against all of them (`sub_check`).
    sub_seen: HashMap<LatKey, Vec<Box<[Term]>>>,
    /// Each value given, its place in `sub_seen`.
    sub_seen_set: HashMap<SubVal, u32>,
    sub_beaten: HashMap<SubVal, Box<[Term]>>,
    /// The premises of every firing that gave a cell a value, a value no fact
    /// holds included (it was dominated when it came): what a retraction asks
    /// which values of a cell rested on a fact.
    sub_prems: HashMap<SubVal, Vec<Vec<PremRef>>>,
    /// Every dominance question an insert asked, by the places of the two
    /// values in their cell's `sub_seen`: the close asks none twice.
    sub_memo: HashMap<LatKey, HashMap<(u32, u32), DomV>>,
    /// Facts withdrawn as a dominated value's consequences: known not to hold.
    sub_gone: HashSet<FactId>,
    /// `sub_by` by the member that dominates: the values each dominates.
    sub_by_of: HashMap<FactId, Vec<Box<[Term]>>>,
    /// At the close, each value given that is no answer: the front fact that
    /// dominates it and the dominance rule that says so. `why` and `whynot`
    /// read it; `dominated_by` rows are it.
    pub sub_by: HashMap<SubVal, (FactId, Sym)>,
    /// A conflicted cell's parties, by cell until it is holed and then by its
    /// hole's marker: the meta of its `conflict` shrug.
    sub_parties: HashMap<LatKey, Vec<Term>>,
    conflict_marks: HashMap<Term, Vec<Term>>,
    /// A JOIN LATTICE'S CONTRIBUTIONS are facts of a relation of their own,
    /// `L@join` (a name no program can write): each conclusion into L is one,
    /// and L's fact at a key is concluded from them by the engine's rule of
    /// the same name. Lattice to contribution relation, and back.
    join_rels: HashMap<Sym, Sym>,
    join_of: HashMap<Sym, Sym>,
    /// The contribution facts of each join cell.
    join_contribs: HashMap<LatKey, Vec<FactId>>,
    /// Each set element's canonical text, the key the join orders by.
    join_keys: KeyCache,
    /// the sets already known canonical: what a cell holds, or a join made (`join_canon_of`)
    join_canonical: HashSet<Term>,
    /// Contributions read from a value since widened that the monotonicity
    /// check has already found answered.
    join_checked: HashSet<FactId>,
    /// Relations holed whole this tick.
    lat_holed_rel: HashSet<Sym>,
    /// Retired since the last settle: facts a better value replaced, and
    /// facts withdrawn for a hole.
    lat_improved: Vec<FactId>,
    lat_dropped: Vec<FactId>,
    /// Values a better one replaced. Each is dead and keeps its firings: it is
    /// how the cell reached the value that replaced it, and a firing that read
    /// it read a bound the cell still meets (a monotone read). By cell, for a
    /// hole that withdraws the cell with its history.
    lat_superseded: HashSet<FactId>,
    lat_history: HashMap<LatKey, Vec<FactId>>,
    /// Facts with a firing that read a superseded value; at the close, such a
    /// firing is kept only where the final values found no derivation.
    lat_stale: HashSet<FactId>,
    /// Lattice relations closed this evaluation: settled, their Best pruned,
    /// their members reflected.
    lat_closed: HashSet<Sym>,
    /// Faults found while a lattice is evaluated, decided when it closes
    /// (`LatFault`).
    lat_pending: Vec<LatFault>,
    /// A DECLARED WIDENING (docs/aggregates.md, "Widening, as built"): the
    /// relations declared `widen N`, with N; how many times each cell of one
    /// improved this evaluation; and each widening a cell took, `(the value
    /// before, the contribution, their join, the value widened to)`, in order.
    widen: HashMap<Sym, u64>,
    /// The rules whose improvements of a widened cell count toward its
    /// widening: those concluding into a widened relation from a relation of
    /// its own recursion (`widen_back_edges`).
    widen_rec: HashSet<Sym>,
    /// the thresholds of each widened relation: the integers its recursion is written with, ascending
    widen_th: HashMap<Sym, Vec<i64>>,
    lat_steps: HashMap<LatKey, u64>,
    lat_widened: HashMap<LatKey, Vec<[Term; 4]>>,
    /// The hole of each widened cell, with the value it closed on (the
    /// enclosure a `widened` shrug's meta names) and its widenings.
    widened_marks: HashMap<Term, (Term, Vec<[Term; 4]>, Vec<[Term; 3]>)>,
    /// Each widened cell with the value its widening closed on, before any
    /// narrowing.
    widened_x: HashMap<LatKey, Term>,
    /// A DESCENDING PASS in progress (`narrow_descend`): the widened cells
    /// held at the values given, and what the rules contribute from them.
    narrowing: Option<Narrowing>,
    /// What narrowing found for the widened cells of this evaluation: the
    /// value they closed on, the value narrowed to, and each step
    /// `(before, the join of what the rules contribute from it, after)`.
    narrow_out: HashMap<LatKey, (Term, Term, Vec<[Term; 3]>)>,
    /// What the holes of this evaluation left unknown, each with what it was
    /// reached from and by which rule (none for a hole's own cell): whynot's
    /// path from a withdrawn cell to the fault behind it.
    lat_unknown: HashMap<Unknown, Option<(Unknown, Sym)>>,
    /// Facts the cascade withdrew since the poison last read them, with the
    /// rules that concluded them.
    lat_withdrawn: Vec<(FactId, Vec<Sym>, Option<(FactId, Sym)>)>,
    /// The unknowns already carried to what reads them, and every unknown by
    /// relation, for the premises that can match one.
    lat_spread: HashSet<Unknown>,
    lat_unknown_rel: HashMap<Sym, Vec<Unknown>>,
    /// Unknown cells by relation, key position and the value there.
    lat_unknown_at: HashMap<(Sym, usize, Term), Vec<Unknown>>,
    /// Every unknown by relation, argument position and the value there, as
    /// its place in `lat_unknown_rel`; a position whose value is not known is
    /// under `unknown_value`, and a whole relation (`Unknown::Rel`) in
    /// `unknown_any`. What a literal can read is looked up, not scanned.
    unknown_at: HashMap<(Sym, usize, Term), Vec<u32>>,
    unknown_any: HashMap<Sym, Vec<u32>>,
    /// Solutions a negation or a body aggregate could not decide, for it read
    /// something unknown: the rule, the element, the solution so far and
    /// what it read, one or more unknowns any of which leaves the solution
    /// undecided (the rest of the body is solved once for all of them).
    /// What they would conclude is unknown (`poison`).
    lat_undecided: Vec<(Sym, usize, Subst, Rc<[Unknown]>)>,
    /// WHAT A PLAIN HOLE LEFT UNKNOWN: a rule holed by a builtin's error, a
    /// body aggregate's cell holed, or a conclusion a hole kept from being
    /// staged at the tick before, left a tuple unknown. Carried like a
    /// lattice's unknowns, silently through positive rules (their rules are
    /// not holed), into rules only once their head relation is closed
    /// (`plain_closed`), and to a negation, which it leaves undecided
    /// (f_a_negation_of_what_a_hole_left_out_succeeds). `plain_pending` are
    /// conclusions not yet carried, `plain_undecided` aggregates holed under
    /// a solution, for the rest of the rule's body to be solved around;
    /// `agg_opened` the correlations holed for an error.
    lat_plain: HashSet<Unknown>,
    plain_closed: HashSet<Sym>,
    plain_pending: Vec<(Unknown, bool)>,
    plain_undecided: Vec<(Sym, usize, Subst, Term)>,
    agg_opened: HashSet<(Sym, u32, Box<[Term]>)>,
    /// The solutions the aggregate being sealed might have over unknowns
    /// (`agg_possibles`), handed to `seal_cells`.
    agg_reach: Vec<Possible>,
    /// WHAT AN AGGREGATE LEFT UNDECIDED, per correlation, as its sealing
    /// decided it (`ReachMemo`): read at every firing, never decided again.
    /// `cell_reach` the unknowns each cell sealed a hole under rests on.
    reach_memo: HashMap<(Sym, u32, Box<[Term]>), Rc<ReachMemo>>,
    cell_reach: HashMap<CellId, Rc<[Unknown]>>,
    /// THE SHRUG MODEL. `reads_unknown`: some rule reads `unknown`, anywhere;
    /// `unknown_cone` the relations that read it, transitively, and
    /// `unknown_strict` its literals read under `not` or inside an aggregate.
    /// What a hole leaves out, A, is read by `unknown(A)` as a shrug too
    /// (`meta_queue`, carried with A); `meta_late` names one that arrived after
    /// a strict reader of it could have fired.
    reads_unknown: bool,
    unknown_cone: HashSet<Sym>,
    unknown_strict: Vec<Lit>,
    meta_queue: Vec<(Unknown, Unknown)>,
    meta_late: Option<String>,
    /// Each unknown and each inherited hole target with a parent it was
    /// reached from; `carry_src` the parent the carry is working from, for a
    /// hole it writes; `holes_now` the hole rows this evaluation met.
    unk_edges: Vec<(Node, Node)>,
    carry_src: Option<Node>,
    carry_more: Vec<Node>,
    holes_now: Vec<(Term, Sym)>,
    holes_met: HashSet<(Term, Sym)>,
    last_fault_rule: Option<Sym>,
    /// Under well-founded semantics: whether this alternation leaves out the
    /// rules that read `unknown`, and the undefined atoms of the level below,
    /// fixed as `unknown` rows for the level above.
    wfs_skip_cone: bool,
    wfs_fixed: Vec<(Sym, Term)>,
    /// Inside a threshold's inner body: a negation that could read what a
    /// hole left out does not admit a member (`thr_verdicts`).
    strict_neg: bool,
    /// What the wall that fell measured: the count, what it counted, and the
    /// limit it passed (a `budget` shrug's `spent(Kind, Spent, Limit)`).
    wall_spent: std::cell::Cell<Option<(&'static str, i64, i64)>>,
    /// Rules that read `shrug` fire above everything else, after the rows
    /// were written once (`shrug_snap`); a row the rest of the evaluation adds
    /// or withdraws that one of them could read is refused at the end.
    shrug_readers: HashSet<Sym>,
    shrug_snap: Option<HashSet<[Term; 3]>>,
    /// The cells of each improving cycle a cut holed, in the order they
    /// were holed: a `divergence` shrug's meta.
    cycle_groups: Vec<Vec<Term>>,
    cycle_of: HashMap<Term, usize>,
    /// THE CARRY OF UNKNOWNS IS WORK LIKE ANY OTHER, charged against the walls
    /// the evaluation started with (`carry_wall`) even where the closes lift
    /// them: a solution the carry extends is a step, an unknown it stores a
    /// row. `carry_broken`: a wall fell inside a carry, so what it would have
    /// reached is not known and no lattice is settled at the cut.
    carry_wall: (i64, i64),
    /// The atoms the alternation left undefined, by relation, while
    /// `paradox_edges` solves over them as over the unknowns.
    undef_atoms: Option<HashMap<Sym, Vec<Unknown>>>,
    /// The `unknown` rows this evaluation's alternating fixpoint wrote: a
    /// paradox each. Any other `unknown` row is a book's own word (`given`).
    wfs_written: HashSet<FactId>,
    carry_steps: i64,
    carry_rows: i64,
    carry_broken: bool,
    /// Inside `fire_rule`:a builtin that fails for an error there holes the
    /// lattice cell the rule concludes into.
    firing: bool,
    fault_count: u64,
    last_fault: Option<Sym>,
    agg_memo: HashMap<(Sym, u32, Box<[Term]>), Rc<[CellId]>>,
    /// The back-index of the retraction path: fact -> the cells a member of
    /// which cites it (`delta.rs`). None until a retraction asks.
    support_ix: Option<HashMap<FactId, Vec<CellId>>>,
    /// A holistic group read under many percents or subjects, sealed once:
    /// by the correlation less the percent or subject (`hol_share_key`).
    hol_shared: HashMap<(Sym, u32, Box<[Term]>), HolShared>,
    /// A threshold's cells this evaluation, by `(rule, at, key)`: made when
    /// the threshold is reached, and never asked again — it stays reached.
    thr_cells: HashMap<(Sym, u32, Box<[Term]>), CellId>,
    /// Reached and not yet closed, with N: their members are provisional
    /// until what they read is closed (`close_thresholds_below`).
    thr_open: Vec<(CellId, usize)>,
    /// Groups short of N, by `(rule, at, shared values)` (`ThrAcc`).
    thr_acc: HashMap<(Sym, u32, Box<[Term]>), ThrAcc>,
    /// The propagation round, and the cells reached in it: a firing on the
    /// round's news concludes from these and from no older cell.
    thr_round: u64,
    thr_fresh: HashSet<CellId>,
    /// Set while a rule fires on news read inside its thresholds.
    thr_focus: Option<Rc<HashMap<(Sym, u32), ThrFocus>>>,
    height_memo: HashMap<FactId, u32>,
    /// The round each relation closes in, for a cell's seals; 0 for input.
    round_of: HashMap<Sym, u32>,
    /// Every relation a rule concludes within the tick: one of these with no
    /// round is a table that failed to rank it, never input.
    derived_rels: HashSet<Sym>,
    /// The first builtin that failed with a hole reason (an overflow, a zero
    /// divisor, a string type) since `seal_cells` last cleared it, whether or
    /// not a rule hole was written for it: a member dropped for an error is
    /// not a member that failed to exist.
    fault: Option<Sym>,
    rename_counter: u64,
    /// THE REFERENCE HAS TWO EVALUATORS and picks one per store: a program
    /// with no aggregate construct is src/engine.ts's, explained by src/api.ts;
    /// any other is src/aggeval.ts's (`storeHasAggregates`). This one engine
    /// answers both, and where the two differ — the planner's cross-product
    /// hold, and how `why` and `whynot` write — it follows the one the
    /// reference would have used. Set by `prepare`.
    pub plain: bool,
    /// Holds `plain` false whatever the program: the reference answers
    /// explain requests with its aggregate evaluator in every world
    /// (src/api.ts `explainRequests`), so `Session::explain_requests` does too.
    pub agg_forced: bool,
    cur_front: Front,
    /// WHERE A WALL CAN FALL, for what it leaves unsettled: the rules of the
    /// batch `activate` is firing and how many have fired, and the relations
    /// of the front `propagate` is working through.
    batch: Rc<[Rc<ERule>]>,
    batch_at: usize,
    live_front: Vec<Sym>,
    /// The heads of the calls answered on demand being solved, innermost last.
    demand_heads: Vec<Lit>,
    assume: Option<Rc<Assumption>>,
    bootstrap: bool,
    answer: RuleAnswer,
    pub no_provenance: bool,
    /// `sealed(provenance)`: no witnesses either, where nothing withdraws. A
    /// firing on a fact already there is then no news, and a step is a new fact.
    pub no_witness: bool,
    /// `Rofl.retainTicks` (src/api.ts:165): how many COMPLETED ticks of frozen
    /// provenance to keep, or none set — which keeps everything and is what
    /// the corpus runs under.
    pub retain_ticks: Option<u32>,
    /// `Rofl.kernelClaimed` (src/api.ts). Whether `$kernel_authority` has been
    /// made into THIS store. Once set the door is shut for the life of the
    /// store, and a second claim is refused rather than ignored.
    pub kernel_claimed: bool,
}

pub struct Outcome {
    pub partial: bool,
    pub staged: usize,
}

/// One member of a threshold: a distinct projection tuple, its text, and
/// every distinct derivation of it — premises in written order — by
/// signature. Its height is the least of theirs, so no one derivation stands
/// for it before the heights are known.
#[derive(Clone)]
struct ThrMember {
    proj: Vec<Term>,
    text: String,
    derivs: Vec<(String, Vec<PremRef>)>,
}

/// A threshold cell's key: the shared values, then N. A cell is one group at
/// one N, so a group reached at one N is never reached at another by it.
fn thr_cell_key(mut shared: Vec<Term>, n: Term) -> Vec<Term> {
    brk!("thr_key_no_n" => { let _ = n; }; shared.push(n));
    shared
}

/// One solution of an aggregate's inner body: its projection (values, then
/// keys), its premises in written order and their signature.
struct Cand {
    proj: Vec<Term>,
    prems: Vec<PremRef>,
    sig: String,
}

fn val_lt(a: &Val, b: &Val) -> bool {
    match (a, b) {
        (Val::Int(x), Val::Int(y)) => x < y,
        (Val::Bool(x), Val::Bool(y)) => !*x && *y,
        _ => false,
    }
}

/// A SOLUTION A BODY AGGREGATE'S INNER BODY MIGHT HAVE over something
/// unknown `u` (docs/aggregates.md, "Precise holes, as built"): the group it
/// would fall in, a position `None` where the unknown leaves it open; its
/// projection, `None` where that is not known; `neg` when it passes an
/// undecided negation, so a member that is known may be out.
#[derive(Clone, PartialEq, Eq, Hash)]
struct Possible {
    pat: Vec<Option<Term>>,
    proj: Option<Vec<Term>>,
    neg: bool,
    u: Unknown,
}

impl Possible {
    fn in_group(&self, g: &[Term]) -> bool {
        self.pat.iter().zip(g).all(|(p, t)| p.is_none_or(|p| p == *t))
    }
    fn exact(&self) -> bool {
        self.pat.iter().all(Option::is_some)
    }
}

/// THE POSSIBLES BY GROUP: those whose group is known, by it, and those a
/// position of which is open, which any group may hold. `at` is a group's
/// own, in the order they were found.
struct PossIndex {
    exact: HashMap<Vec<Term>, Vec<usize>>,
    open: Vec<usize>,
}

impl PossIndex {
    fn of(ps: &[Possible]) -> PossIndex {
        let mut ix = PossIndex { exact: HashMap::new(), open: Vec::new() };
        for (n, p) in ps.iter().enumerate() {
            if p.exact() {
                ix.exact.entry(p.pat.iter().flatten().copied().collect()).or_default().push(n);
            } else {
                ix.open.push(n);
            }
        }
        ix
    }
    fn at<'a>(&self, ps: &'a [Possible], g: &[Term]) -> Vec<&'a Possible> {
        let mut ns: Vec<usize> = self.exact.get(g).cloned().unwrap_or_default();
        ns.extend(self.open.iter().copied().filter(|n| ps[*n].in_group(g)));
        ns.sort_unstable();
        ns.into_iter().map(|n| &ps[n]).collect()
    }
}

/// WHAT A BODY AGGREGATE LEFT UNDECIDED under one correlation, decided once
/// (`reach_memo_of`) and read by every firing (`agg_reach_undecided`): the
/// possibles, each sealed group they change (its cell key) with the unknowns
/// it rests on, and each group pattern a possible no sealed group names
/// could make, with the unknowns that could make it.
struct ReachMemo {
    ps: Rc<[Possible]>,
    groups: Vec<(Box<[Term]>, Rc<[Unknown]>)>,
    unnamed: Vec<(Vec<Option<Term>>, Rc<[Unknown]>)>,
}

/// What a round's news touched inside one threshold: the inner positions
/// with news, and the groups under them by correlation. A group `None` is
/// one the positive literals do not bind, and `wild` a correlation they do
/// not: both are solved in full.
struct ThrFocus {
    news: Vec<(usize, FxSet<FactId>)>,
    by_corr: HashMap<Vec<Term>, Vec<Option<Vec<Term>>>>,
    wild: bool,
}

/// The members a threshold group has so far, while it is short of an N:
/// grown by the round's news (`round` is the last it was grown in), so a
/// group is never solved again in full.
#[derive(Clone)]
struct ThrAcc {
    round: u64,
    members: HashMap<Vec<Term>, ThrMember>,
}

/// What `seal_cells` made: cells in the store, or — for whynot — keys and
/// values that were never stored, or no cell at all because the correlation
/// is a hole (a member left open, a builtin that failed in the inner body).
enum Sealed {
    Kept(Vec<CellId>),
    /// whynot's cells: key, value, and how many members the group had.
    Ephemeral(Vec<(Vec<Term>, CellValue, usize)>),
    Open(Sym),
}

impl Eval {
    pub fn new(mut h: Heap, store: Store, budget: i64, mode: Mode, bootstrap: bool) -> Eval {
        let v = Vocab::new(&mut h);
        let hole_id = h.atom("$adhoc");
        let unknown_value = h.atom("$unknown_value");
        let mut e = Eval {
            h,
            v,
            store,
            budget,
            space: DEFAULT_SPACE,
            cur_rule: None,
            argm_by_rule: HashMap::new(),
            ns_by_rule: HashMap::new(),
            fires_by_rule: HashMap::new(),
            sols_by_rule: HashMap::new(),
            new_by_rule: HashMap::new(),
            delta_by_rule: HashMap::new(),
            delta_ns: 0,
            delta_first: std::env::var_os("ROFL_NO_DELTA_FIRST").is_none(),
            walls_set: false,
            delta_first_under_walls: false,
            plan_trial: false,
            delta_plans: HashMap::new(),
            delta_stats: HashMap::new(),
            rounds: Vec::new(),
            closures: Vec::new(),
            closure_of: HashMap::new(),
            closure_rows: 0,
            closure_runs: 0,
            naive: false,
            mode,
            steps: 0,
            rows: 0,
            peak_rows: 0,
            diags: Vec::new(),
            rules: Vec::new(),
            rule_at: HashMap::new(),
            well_founded: false,
            lattice_improvements: 0,
            hole_id,
            unknown_value,
            demand_rels: Vec::new(),
            active: Vec::new(),
            staged: HashMap::new(),
            staged_alts: HashMap::new(),
            staged_watch: None,
            staged_unknown: HashMap::new(),
            past_rows: None,
            why_unk: None,
            why_done: HashSet::new(),
            why_heights: HashMap::new(),
            why_heads: HashMap::new(),
            past_walks: 0,
            why_scans: 0,
            agg_plans: HashMap::new(),
            ds_comps: Vec::new(),
            ds_elems: HashSet::new(),
            ds_released: HashSet::new(),
            ds_done: HashSet::new(),
            ds_charge: false,
            ds_check: false,
            ds_layer: HashSet::new(),
            ds_firing: None,
            lattices: HashMap::new(),
            lattice_rows: Vec::new(),
            decl_refused: Vec::new(),
            tags: crate::tag::Tags::default(),
            tag_changed: HashSet::new(),
            tag_refused: Vec::new(),
            carried: HashMap::new(),
            next_rules: HashSet::new(),
            lat_cur: HashMap::new(),
            subs: HashMap::new(),
            dom_rels: HashSet::new(),
            sub_cur: HashMap::new(),
            sub_seen: HashMap::new(),
            sub_seen_set: HashMap::new(),
            sub_beaten: HashMap::new(),
            sub_prems: HashMap::new(),
            sub_memo: HashMap::new(),
            sub_gone: HashSet::new(),
            sub_by_of: HashMap::new(),
            sub_by: HashMap::new(),
            sub_parties: HashMap::new(),
            conflict_marks: HashMap::new(),
            join_rels: HashMap::new(),
            join_of: HashMap::new(),
            join_contribs: HashMap::new(),
            join_keys: KeyCache::new(),
            join_canonical: HashSet::new(),
            join_checked: HashSet::new(),
            lat_holed_rel: HashSet::new(),
            lat_superseded: HashSet::new(),
            lat_history: HashMap::new(),
            lat_stale: HashSet::new(),
            lat_improved: Vec::new(),
            lat_dropped: Vec::new(),
            lat_closed: HashSet::new(),
            lat_pending: Vec::new(),
            widen: HashMap::new(),
            widen_rec: HashSet::new(),
            widen_th: HashMap::new(),
            lat_steps: HashMap::new(),
            lat_widened: HashMap::new(),
            widened_marks: HashMap::new(),
            widened_x: HashMap::new(),
            narrowing: None,
            narrow_out: HashMap::new(),
            lat_unknown: HashMap::new(),
            lat_withdrawn: Vec::new(),
            lat_spread: HashSet::new(),
            lat_unknown_rel: HashMap::new(),
            lat_unknown_at: HashMap::new(),
            unknown_at: HashMap::new(),
            unknown_any: HashMap::new(),
            lat_undecided: Vec::new(),
            lat_plain: HashSet::new(),
            plain_closed: HashSet::new(),
            plain_pending: Vec::new(),
            plain_undecided: Vec::new(),
            agg_opened: HashSet::new(),
            agg_reach: Vec::new(),
            reach_memo: HashMap::new(),
            cell_reach: HashMap::new(),
            reads_unknown: false,
            unknown_cone: HashSet::new(),
            unknown_strict: Vec::new(),
            meta_queue: Vec::new(),
            meta_late: None,
            unk_edges: Vec::new(),
            carry_src: None,
            carry_more: Vec::new(),
            holes_now: Vec::new(),
            holes_met: HashSet::new(),
            last_fault_rule: None,
            wfs_skip_cone: false,
            wfs_fixed: Vec::new(),
            strict_neg: false,
            wall_spent: std::cell::Cell::new(None),
            shrug_readers: HashSet::new(),
            shrug_snap: None,
            cycle_groups: Vec::new(),
            cycle_of: HashMap::new(),
            carry_wall: (budget, DEFAULT_SPACE),
            undef_atoms: None,
            wfs_written: HashSet::new(),
            carry_steps: 0,
            carry_rows: 0,
            carry_broken: false,
            firing: false,
            fault_count: 0,
            last_fault: None,
            agg_memo: HashMap::new(),
            support_ix: None,
            hol_shared: HashMap::new(),
            thr_cells: HashMap::new(),
            thr_open: Vec::new(),
            thr_acc: HashMap::new(),
            thr_round: 0,
            thr_fresh: HashSet::new(),
            thr_focus: None,
            height_memo: HashMap::new(),
            round_of: HashMap::new(),
            derived_rels: HashSet::new(),
            fault: None,
            rename_counter: 0,
            plain: false,
            agg_forced: false,
            cur_front: Front::default(),
            batch: Rc::from(Vec::new()),
            batch_at: 0,
            live_front: Vec::new(),
            demand_heads: Vec::new(),
            assume: None,
            bootstrap,
            answer: RuleAnswer::default(),
            no_provenance: false,
            no_witness: false,
            retain_ticks: None,
            kernel_claimed: false,
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

    /// Re-derive the prepared program from the store, after a load added
    /// rules. Rules live in the store as reflection facts, and the peeled
    /// strata, the body plans and the demand grouping are all computed from
    /// them — so a load that added rules and left `self.rules` alone would
    /// evaluate the OLD program against the NEW facts, silently.
    ///
    /// `prepare` overwrites everything it fills EXCEPT `diags`, which it
    /// appends to. Its diagnostics are re-derived from the store on every
    /// call, so a second preparation would double every rule's complaint;
    /// they are merged rather than appended here.
    pub fn reprepare(&mut self) {
        let keep = std::mem::take(&mut self.diags);
        self.prepare();
        let fresh = std::mem::replace(&mut self.diags, keep);
        for d in fresh {
            if !self.diags.contains(&d) {
                self.diags.push(d);
            }
        }
    }

    /// THE RELATIONS WHOSE FACTS ARE LATTICE CELLS, with their algebra, for
    /// the store to print (`Store::lat_regs`): every lattice, tag and
    /// subsumptive relation, a join's contributions (`L@join`), and the
    /// derivations of a counting tag (`p@count`).
    fn register_lattices(&mut self, rules: &[DRule]) {
        let mut regs: Vec<LatReg> = Vec::new();
        for (rel, (_, op)) in &self.lattices {
            let (opname, mut alg) = match self.tags.by_rel.get(rel) {
                Some((_, a)) => (format!("tag:{}", a.name()), Algebra::tag(a.idempotent())),
                None => (op.name().to_string(), op.algebra()),
            };
            if op.is_join() && brk!("widening_flag_off" => false; self.widen.contains_key(rel)) {
                alg = Algebra(alg.0 | Algebra::WIDENING);
            }
            if let Some(c) = self.join_rels.get(rel) {
                regs.push(LatReg { rel: *c, op: opname.clone(), alg });
            }
            regs.push(LatReg { rel: *rel, op: opname, alg });
        }
        for (rel, c) in &self.tags.count_rel {
            if let Some((_, a)) = self.tags.by_rel.get(rel) {
                regs.push(LatReg { rel: *c, op: format!("tag:{}", a.name()), alg: Algebra::tag(false) });
            }
        }
        regs.sort_by_key(|r| r.rel);
        self.store.lat_regs = regs;
        self.store.tag_rules = rules
            .iter()
            .filter(|r| self.tags.count_rel.contains_key(&r.clause.head.rel))
            .map(|r| r.id)
            .collect();
    }

    fn prepare(&mut self) {
        self.well_founded = well_founded_declared(&mut self.h, &self.v, &mut self.store);
        self.no_provenance = sealed_bodies(&mut self.h, &self.v, &mut self.store)
            .contains(&self.v.sealed_provenance);
        self.no_witness = self.no_provenance;
        let (rules, diags) = decode_rules(&mut self.h, &self.v, &mut self.store);
        self.plain = !self.agg_forced && !store_has_aggregates(&self.h, &self.v, &mut self.store);
        self.decl_refused.clear();
        let decls = lattice_decls(&mut self.h, &self.v, &mut self.store, &mut self.decl_refused);
        self.tags = crate::tag::Tags::read(&mut self.h, &self.v, &mut self.store, &decls);
        let low = crate::tag::lower(&mut self.h, &self.v, &self.tags, rules);
        let rules = low.rules;
        self.tag_changed = low.changed;
        self.tag_refused = low.refused;
        self.lattice_rows = decls;
        self.lattice_rows.extend(self.tags.as_lattices(&self.v));
        self.lattices = self
            .lattice_rows
            .iter()
            .filter_map(|&(r, n, op)| self.v.op_of(op).map(|o| (r, (n, o))))
            .collect();
        // A SUBSUMPTIVE RELATION CLOSES AS A LATTICE DOES: it is one of
        // `lattices`, its algebra `Dominance`, unless a lattice or a tag
        // claims the relation too (refused: one algebra per predicate)
        // the kernel's own sub-evaluation judges the rows; it evaluates none
        let doms = if self.bootstrap { Vec::new() } else { decode_dominances(&mut self.h, &self.v, &mut self.store, &mut self.decl_refused) };
        self.subs.clear();
        self.dom_rels = doms.iter().map(|d| d.rel).collect();
        let mut by_rel: Vec<(Sym, Vec<DomRule>)> = Vec::new();
        for d in doms {
            match by_rel.iter_mut().find(|(r, _)| *r == d.rel) {
                Some((_, ds)) => ds.push(d),
                None => by_rel.push((d.rel, vec![d])),
            }
        }
        for (rel, ds) in by_rel {
            let (arity, keylen) = (ds[0].arity, ds[0].keylen);
            if ds.iter().any(|d| d.arity != arity || d.keylen != keylen) || self.lattices.contains_key(&rel) || self.tags.by_rel.contains_key(&rel) {
                continue;
            }
            let mut reads: Vec<Sym> = Vec::new();
            let mut planned = Vec::new();
            for d in ds {
                let mut bound: Vec<Sym> = Vec::new();
                for t in d.lo.args.iter().chain(&d.hi.args) {
                    self.h.vars_of(*t, &mut bound);
                }
                let (order, _, _, _) = plan_order(&self.h, &[], &d.body, &bound, &[]);
                let plan: Vec<BodyElem> = order.iter().map(|i| d.body[*i].clone()).collect();
                for l in d.body.iter().flat_map(|b| b.lits_deep()) {
                    if !reads.contains(&l.rel) {
                        reads.push(l.rel);
                    }
                }
                planned.push((d, plan));
            }
            self.lattices.insert(rel, (arity, AggOp::Dominance));
            self.subs.insert(rel, Rc::new(Sub { arity, keylen, doms: planned, reads }));
        }
        self.widen = lattice_widens(&mut self.h, &self.v, &mut self.store)
            .into_iter()
            .filter(|(r, _)| self.lattices.get(r).is_some_and(|(_, op)| *op == AggOp::Hull))
            .collect();
        self.join_rels.clear();
        self.join_of.clear();
        let mut joins: Vec<Sym> = self.lattices.iter().filter(|(_, (_, op))| op.is_join()).map(|(r, _)| *r).collect();
        joins.sort_unstable();
        for l in joins {
            let name = format!("{}@join", self.h.name(l));
            let c = self.h.intern(&name);
            self.join_rels.insert(l, c);
            self.join_of.insert(c, l);
        }
        self.register_lattices(&rules);
        // under the seal the set of facts is the contract: where nothing
        // withdraws, groups and candidates are then in the engine's own order
        // and rules are activated by component; a closure is walked either way
        self.store.unordered = self.no_witness && self.lattices.is_empty();
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
        // `asks(Rel)`: only the rules whose heads reach an asked relation are
        // activated, backwards through every premise; no asks means everything
        let mut cone: HashSet<Sym> = HashSet::new();
        for f in self.store.rel_all(&self.h, self.v.asks) {
            let a = self.store.args(f);
            if a.len() == 1 {
                if let Some(rel) = a[0].as_atom() {
                    cone.insert(rel);
                }
            }
        }
        if !cone.is_empty() {
            loop {
                let n = cone.len();
                for r in &kept {
                    if cone.contains(&r.clause.head.rel) {
                        cone.extend(r.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel));
                    }
                }
                if cone.len() == n {
                    break;
                }
            }
            kept.retain(|r| cone.contains(&r.clause.head.rel));
        }
        self.next_rules = kept.iter().filter(|r| r.clause.head.temporal == Temporal::Next).map(|r| r.id).collect();
        self.carried.clear();
        let mut carried: Vec<Sym> = kept
            .iter()
            .filter(|r| r.clause.head.temporal == Temporal::Next && self.is_lattice_lit(r.clause.head.rel, r.clause.head.args.len()))
            .map(|r| r.clause.head.rel)
            .collect();
        carried.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        carried.dedup();
        for l in carried {
            let r = self.carry_rule(l);
            self.carried.insert(r.clause.body[0].lit().unwrap().rel, l);
            kept.push(r);
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
        self.agg_plans.clear();
        for r in &kept {
            for b in &r.clause.body {
                let BodyElem::Agg(a) = b else { continue };
                let plan = self.agg_plan(r.id, &r.clause, a);
                self.agg_plans.insert((r.id, a.at), Rc::new(plan));
            }
        }
        self.rules = kept.into_iter().map(Rc::new).collect();
        let refused: HashSet<Sym> = self.lattices.keys().copied().chain(demand.iter().map(|(r, _)| *r)).collect();
        self.closures = find_closures(&self.rules, &refused);
        self.closure_of = self.closures.iter().enumerate().flat_map(|(i, c)| [(c.base, (i, true)), (c.step, (i, false))]).collect();
        self.rule_at = self.rules.iter().enumerate().map(|(i, r)| (r.id, i)).collect();
        self.widen_rec = self.widen_back_edges();
        self.widen_th = self.widen_thresholds();
        self.demand_rels = demand
            .into_iter()
            .map(|(rel, is)| (rel, is.into_iter().map(|i| self.rules[i].clone()).collect()))
            .collect();
    }

    /// THE CARRY OF A LATTICE ACROSS A TICK: `L(K..., V) :- L@next(K..., V).`,
    /// in any book. A value concluded `@next` at T is a base fact of `L@next`
    /// at T+1 and a contribution to L there like any other: a worse one is
    /// dropped, a better one improves the cell, and the rules of T+1 improve
    /// on it in turn. The rule's id is the carried relation's name; it is the
    /// engine's, so it is not reflected and safety.rofl does not judge it
    /// (it reads a relation no rule concludes, into the lattice's value, as is).
    fn carry_rule(&mut self, l: Sym) -> ERule {
        let n = self.lattices[&l].0;
        let name = format!("{}@next", self.h.name(l));
        let (c, id) = (self.h.intern(&name), self.h.intern(&name));
        let book = Term::var(self.h.intern("B"));
        let args: Vec<Term> = (0..n).map(|i| Term::var(self.h.intern(&format!("X{i}")))).collect();
        let lit = |rel: Sym| Lit { rel, persp: book, persp_explicit: true, args: args.clone(), temporal: Temporal::Now };
        let clause = Clause { head: lit(l), body: vec![BodyElem::Pos(lit(c))] };
        let plan = clause.body.clone();
        ERule {
            id,
            canon: name,
            safe: true,
            has_neg: false,
            has_agg: false,
            has_thr: false,
            thr_rels: Vec::new(),
            lattice_outer: Vec::new(),
            lat_close: Some(l),
            pos_rels: vec![c],
            has_demand_prem: false,
            trigger_rels: Vec::new(),
            plan,
            clause,
        }
    }

    fn classify(&mut self, r: DRule) -> ERule {
        let (plan, stuck, _, _) = plan_body(&self.h, &r.clause);
        let plan = if self.plain { plan_body_plain(&self.h, &r.clause) } else { plan };
        let safe = stuck.is_none() && !self.answer.unsafe_rules.contains(&r.id);
        let mut has_neg = false;
        let mut has_agg = false;
        let mut has_thr = false;
        let mut thr_rels = Vec::new();
        let mut pos_rels = Vec::new();
        for b in &plan {
            match b {
                BodyElem::Pos(l) => pos_rels.push(l.rel),
                BodyElem::Neg(_) => has_neg = true,
                BodyElem::Agg(a) if a.op == AggOp::AtLeast => {
                    has_thr = true;
                    for x in &a.body {
                        match x {
                            BodyElem::Pos(l) => {
                                pos_rels.push(l.rel);
                                if !thr_rels.contains(&l.rel) {
                                    thr_rels.push(l.rel);
                                }
                            }
                            BodyElem::Neg(_) => has_neg = true,
                            _ => {}
                        }
                    }
                }
                BodyElem::Agg(_) => has_agg = true,
                BodyElem::Bi { .. } => {}
            }
        }
        let lattice_outer = self.answer.lattice_outer.get(&r.id).cloned().unwrap_or_default();
        let head = &r.clause.head;
        let lat_close = match self.lattices.get(&head.rel) {
            Some(&(n, _)) if head.temporal != Temporal::Next && head.args.len() == n => Some(head.rel),
            _ => pos_rels.iter().copied().find(|p| self.lattices.contains_key(p) && !lattice_outer.contains(p)),
        };
        let plan = if brk!("lattice_literal_order" => false; lat_close.is_some()) { sink_builtins(&self.h, &self.v, plan) } else { plan };
        ERule {
            id: r.id,
            clause: r.clause,
            canon: r.canon,
            safe,
            has_neg,
            has_agg,
            has_thr,
            thr_rels,
            lattice_outer,
            lat_close,
            pos_rels,
            has_demand_prem: false,
            trigger_rels: Vec::new(),
            plan,
        }
    }

    /// Plan one aggregate element of a rule: the order its inner body is
    /// solved in, which shared variables are correlation and which it groups
    /// by, and what it reads.
    fn agg_plan(&self, rid: Sym, c: &Clause, a: &Agg) -> AggPlan {
        let k = a.at as usize - 1;
        let (_, _, _, before) = plan_elems(&self.h, &[], &c.body[..k], &[], &[]);
        let (corr, group): (Vec<usize>, Vec<usize>) =
            (0..a.shared.len()).partition(|i| before.contains(&a.shared[*i]));
        let (inner_order, _, _, _) = plan_order(&self.h, &[], &a.body, &before, &[]);
        let mut rels: Vec<Sym> = Vec::new();
        for l in a.body.iter().flat_map(|b| b.lits_deep()) {
            if !rels.contains(&l.rel) {
                rels.push(l.rel);
            }
        }
        AggPlan {
            op: a.op,
            inner_order,
            corr,
            group,
            rels,
            empty_zero: self.answer.empty_zero.contains(&(rid, a.at)),
        }
    }

    /// ASK safety.rofl. The kernel's own program, run in a store of its own,
    /// under the stock evaluator with `bootstrap` set — which is the rung that
    /// stops the tower: a bootstrap evaluation asks nothing of anybody.
    fn safety_answer(&mut self, rules: &[DRule]) -> RuleAnswer {
        if self.bootstrap || (rules.is_empty() && self.lattice_rows.is_empty() && self.dom_rels.is_empty()) {
            return RuleAnswer::default();
        }
        let mut h = std::mem::take(&mut self.h);
        let mut pol = policy_store(&mut h, &self.v, crate::kernel::safety());
        for rel in [
            self.v.premise_lit,
            self.v.conclusion_lit,
            self.v.has_premise,
            self.v.concludes,
            self.v.conclusion_tense,
            self.v.premise_pos,
            self.v.premise_neg,
            self.v.premise_agg,
            self.v.reserved,
            self.v.lattice_decl,
            brk!("widen_row_unread" => self.v.lattice_decl; self.v.lattice_widen),
            brk!("dominance_row_unread" => self.v.lattice_decl; self.v.dominance),
            brk!("order_row_unread" => self.v.lattice_decl; self.v.order_comp),
        ] {
            for f in self.store.rel_all(&h, rel) {
                let persp = self.store.rec(f).persp;
                let args = self.store.args(f).to_vec();
                // a rule `tag::lower` rewrote is judged as it runs, below
                if args.first().and_then(|a| a.as_atom()).is_some_and(|r| self.tag_changed.contains(&r)) && rel != self.v.lattice_decl {
                    continue;
                }
                pol.add(&h, rel, persp, &args, F_BASE);
            }
        }
        // WHAT RUNS FOR A TAG, judged: each rewritten clause's reflection
        // under its own id, and an idempotent tag's order lattice
        let seeded = [
            self.v.premise_lit, self.v.conclusion_lit, self.v.has_premise, self.v.concludes,
            self.v.conclusion_tense, self.v.premise_pos, self.v.premise_neg, self.v.premise_agg,
        ];
        for r in rules.iter().filter(|r| brk!("tag_judged_as_written" => false; self.tag_changed.contains(&r.id))) {
            let (enc, facts) = encode_rule(&mut h, &self.v, &r.clause);
            let enc = h.intern(&enc);
            for f in facts.into_iter().filter(|f| seeded.contains(&f.rel)) {
                let mut args = f.args;
                if args[0].as_atom() == Some(enc) {
                    args[0] = Term::atom(r.id);
                }
                pol.add(&h, f.rel, self.v.kernel_persp, &args, F_BASE);
            }
        }
        for (rel, n, op) in self.tags.as_lattices(&self.v) {
            pol.add(&h, self.v.lattice_decl, self.v.kernel_persp, &[Term::atom(rel), Term::int(n as i64), Term::atom(op)], F_BASE);
        }
        let s_head = h.atom("head");
        let s_pos = h.atom("pos");
        let s_left = h.atom("left");
        let s_right = h.atom("right");
        let s_agg = Term::atom(self.v.slot_agg);
        let s_agg_res = Term::atom(self.v.slot_agg_res);
        let main = self.v.main;
        for r in rules {
            let rid = Term::atom(r.id);
            let islot = |h: &mut Heap, pol: &mut Store, rid: Term, k: i64, name: Term, ts: &[Term]| {
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
            let slot = |h: &mut Heap, pol: &mut Store, k: i64, name: Term, ts: &[Term]| islot(h, pol, rid, k, name, ts);
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
                    // AN AGGREGATE BINDS ITS SHARED VARIABLES AND ITS RESULT,
                    // and its inner body is judged as a rule of its own,
                    // `$inner(R, K)`, whose head is what the fold reads.
                    BodyElem::Agg(a) => {
                        let shared: Vec<Term> = a.shared.iter().map(|v| Term::var(*v)).collect();
                        slot(&mut h, &mut pol, k, s_agg, &shared);
                        // a threshold reads N and binds nothing of it
                        let res: &[Term] = if a.op == AggOp::AtLeast { &[] } else { std::slice::from_ref(&a.result) };
                        slot(&mut h, &mut pol, k, s_agg_res, res);
                        let inner = h.mkf(self.v.s_inner, &[rid, Term::int(k)]);
                        pol.add(&h, self.v.agg_inner, main, &[rid, Term::int(k), inner], F_BASE);
                        let mut head: Vec<Term> = a.vals.clone();
                        head.extend(a.keys.iter().copied());
                        head.extend(shared.iter().copied());
                        islot(&mut h, &mut pol, inner, 0, s_head, &head);
                        for (j, x) in a.body.iter().enumerate() {
                            let kj = Term::int(j as i64 + 1);
                            let kp = self.v.kernel_persp;
                            pol.add(&h, self.v.has_premise, kp, &[inner, kj], F_BASE);
                            let rx = reify_body_elem(&mut h, &self.v, x);
                            pol.add(&h, self.v.premise_lit, kp, &[inner, kj, rx], F_BASE);
                            match x {
                                BodyElem::Pos(l) => {
                                    let mut ts = l.args.clone();
                                    ts.push(l.persp);
                                    islot(&mut h, &mut pol, inner, j as i64 + 1, s_pos, &ts);
                                }
                                BodyElem::Bi { l, r: rr, .. } => {
                                    islot(&mut h, &mut pol, inner, j as i64 + 1, s_left, &[*l]);
                                    islot(&mut h, &mut pol, inner, j as i64 + 1, s_right, &[*rr]);
                                }
                                BodyElem::Neg(_) | BodyElem::Agg(_) => {}
                            }
                        }
                    }
                }
            }
        }
        // A LATTICE'S EXTRA INPUTS, seeded only for a program that declares one.
        let lattices = self.lattice_rows.clone();
        // A SUBSUMPTIVE RELATION'S LITERALS carry their arity, as a lattice's
        // do: safety.rofl refuses a rule that writes or reads one at another
        let subs: Vec<(Sym, usize)> = self.subs.iter().map(|(r, x)| (*r, x.arity)).collect();
        if !subs.is_empty() {
            let lit_arity = h.atom("lit_arity");
            let lit_arity = lit_arity.as_atom().unwrap();
            let is_sub = |rel: Sym| subs.iter().any(|(p, _)| *p == rel);
            for r in rules {
                let rid = Term::atom(r.id);
                let head = &r.clause.head;
                if is_sub(head.rel) {
                    pol.add(&h, lit_arity, main, &[rid, Term::int(0), Term::atom(head.rel), Term::int(head.args.len() as i64)], F_BASE);
                }
                for (i, b) in r.clause.body.iter().enumerate() {
                    if let BodyElem::Pos(l) | BodyElem::Neg(l) = b {
                        if is_sub(l.rel) {
                            pol.add(&h, lit_arity, main, &[rid, Term::int(i as i64 + 1), Term::atom(l.rel), Term::int(l.args.len() as i64)], F_BASE);
                        }
                    }
                }
            }
        }
        // A DECLARED ORDER'S RELATIONS and how many values each compares
        let mut ords: Vec<(Sym, usize)> = Vec::new();
        for f in self.store.rel_all(&h, self.v.order_comp) {
            if let Some(p) = self.store.args(f)[0].as_atom() {
                match ords.iter_mut().find(|(q, _)| *q == p) {
                    Some(o) => o.1 += 1,
                    None => ords.push((p, 1)),
                }
            }
        }
        if !lattices.is_empty() || !ords.is_empty() {
            let (s_neg, s_hkey, s_hval, s_lkey, s_lval) = (
                Term::atom(self.v.slot_neg),
                Term::atom(self.v.slot_hkey),
                Term::atom(self.v.slot_hval),
                Term::atom(self.v.slot_lkey),
                Term::atom(self.v.slot_lval),
            );
            let lit_arity = h.atom("lit_arity");
            let lit_arity = lit_arity.as_atom().unwrap();
            let is_lat = |rel: Sym| lattices.iter().any(|(p, _, _)| *p == rel);
            let ord_of = |rel: Sym| ords.iter().find(|(p, _)| *p == rel).map(|(_, m)| *m);
            let s_oval = h.atom("oval");
            let s_bad = h.atom("order_bad_read");
            let s_bad = s_bad.as_atom().unwrap();
            for r in rules {
                let rid = Term::atom(r.id);
                let head = &r.clause.head;
                if let Some(m) = ord_of(head.rel).filter(|_| !brk!("order_head_unseeded" => true; false)) {
                    let n = head.args.len();
                    let (key, comps) = head.args.split_at(n.saturating_sub(m));
                    let mut ks: Vec<Term> = key.to_vec();
                    ks.extend(comps.iter().filter(|t| !t.is_var()).copied());
                    ks.push(head.persp);
                    self.seed_slot(&mut h, &mut pol, rid, 0, s_hkey, &ks);
                    for (i, t) in comps.iter().enumerate() {
                        if let TermK::Var(x) = t.kind() {
                            let name = h.name(x).to_string();
                            let name = h.string(&name);
                            pol.add(&h, self.v.premise_var, main, &[rid, Term::int(0), s_oval, Term::int(i as i64 + 1), name], F_BASE);
                        }
                    }
                }
                if is_lat(head.rel) {
                    let n = head.args.len();
                    let mut key: Vec<Term> = head.args[..n.saturating_sub(1)].to_vec();
                    key.push(head.persp);
                    self.seed_slot(&mut h, &mut pol, rid, 0, s_hkey, &key);
                    let val: Vec<Term> = head.args.last().filter(|t| t.is_var()).copied().into_iter().collect();
                    self.seed_slot(&mut h, &mut pol, rid, 0, s_hval, &val);
                    pol.add(&h, lit_arity, main, &[rid, Term::int(0), Term::atom(head.rel), Term::int(n as i64)], F_BASE);
                }
                for (i, b) in r.clause.body.iter().enumerate() {
                    let k = i as i64 + 1;
                    match b {
                        BodyElem::Neg(l) => {
                            let mut ts = l.args.clone();
                            ts.push(l.persp);
                            self.seed_slot(&mut h, &mut pol, rid, k, s_neg, &ts);
                            if is_lat(l.rel) {
                                pol.add(&h, lit_arity, main, &[rid, Term::int(k), Term::atom(l.rel), Term::int(l.args.len() as i64)], F_BASE);
                            }
                        }
                        BodyElem::Pos(l) if ord_of(l.rel).is_some() => {
                            let m = ord_of(l.rel).unwrap();
                            let n = l.args.len();
                            let (key, comps) = l.args.split_at(n.saturating_sub(m));
                            let mut ks: Vec<Term> = key.to_vec();
                            ks.push(l.persp);
                            self.seed_slot(&mut h, &mut pol, rid, k, s_lkey, &ks);
                            let mut seen: Vec<Sym> = Vec::new();
                            for t in key {
                                h.vars_of(*t, &mut seen);
                            }
                            let mut bad = false;
                            for (i, t) in comps.iter().enumerate() {
                                match t.kind() {
                                    TermK::Var(x) if !seen.contains(&x) => {
                                        seen.push(x);
                                        let name = h.name(x).to_string();
                                        let name = h.string(&name);
                                        pol.add(&h, self.v.premise_var, main, &[rid, Term::int(k), s_oval, Term::int(i as i64 + 1), name], F_BASE);
                                    }
                                    _ => bad = true,
                                }
                            }
                            if bad {
                                pol.add(&h, s_bad, main, &[rid, Term::int(k)], F_BASE);
                            }
                        }
                        BodyElem::Pos(l) if is_lat(l.rel) => {
                            let n = l.args.len();
                            let mut key: Vec<Term> = l.args[..n.saturating_sub(1)].to_vec();
                            key.push(l.persp);
                            self.seed_slot(&mut h, &mut pol, rid, k, s_lkey, &key);
                            let val: Vec<Term> = l.args.last().copied().into_iter().collect();
                            self.seed_slot(&mut h, &mut pol, rid, k, s_lval, &val);
                            pol.add(&h, lit_arity, main, &[rid, Term::int(k), Term::atom(l.rel), Term::int(n as i64)], F_BASE);
                        }
                        BodyElem::Bi { op, l, r: rr } if *op == self.v.op_is => {
                            if let Some((opname, a, b2)) = arith_shape(&h, *rr) {
                                let res = reify_term(&mut h, &self.v, *l);
                                let (a, b2) = (reify_term(&mut h, &self.v, a), reify_term(&mut h, &self.v, b2));
                                let opt = h.string(&opname);
                                pol.add(&h, self.v.premise_arith, main, &[rid, Term::int(k), res, opt, a, b2], F_BASE);
                            }
                        }
                        _ => {}
                    }
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
        let mut agg_refused: Vec<(Sym, Sym)> = Vec::new();
        for f in pol.rel_all(&h, self.v.agg_refused) {
            let args = pol.args(f);
            if let (Some(r), Some(why)) = (args[0].as_atom(), args[1].as_atom()) {
                agg_refused.push((r, why));
            }
        }
        agg_refused.extend(set_spelling_refusals(&mut h, &self.v, rules, &lattices));
        agg_refused.extend(self.tag_refused.iter().copied());
        agg_refused.sort_by(|a, b| cmp_js(h.name(a.0), h.name(b.0)).then(cmp_js(h.name(a.1), h.name(b.1))));
        let mut lattice_refused: Vec<(Sym, Sym)> = Vec::new();
        for f in pol.rel_all(&h, self.v.lattice_refused) {
            let args = pol.args(f);
            if let (Some(p), Some(why)) = (args[0].as_atom(), args[1].as_atom()) {
                lattice_refused.push((p, why));
            }
        }
        lattice_refused.sort_by(|a, b| cmp_js(h.name(a.0), h.name(b.0)).then(cmp_js(h.name(a.1), h.name(b.1))));
        let mut lattice_outer: HashMap<Sym, Vec<Sym>> = HashMap::new();
        for f in pol.rel_all(&h, self.v.lattice_outer) {
            let args = pol.args(f);
            if let (Some(r), Some(p)) = (args[0].as_atom(), args[1].as_atom()) {
                let e = lattice_outer.entry(r).or_default();
                if !e.contains(&p) {
                    e.push(p);
                }
            }
        }
        let mut empty_zero: HashSet<(Sym, u32)> = HashSet::new();
        for f in pol.rel_all(&h, self.v.empty_zero) {
            let args = pol.args(f);
            if let (Some(r), Some(k)) = (args[0].as_atom(), args[1].as_int()) {
                empty_zero.insert((r, k as u32));
            }
        }
        let answer = RuleAnswer {
            unsafe_rules: atoms(&mut h, &mut pol, self.v.unsafe_rule),
            demand_rels: atoms(&mut h, &mut pol, self.v.demand_rel),
            trigger,
            late: atoms(&mut h, &mut pol, self.v.late_rule),
            reads_provenance: pol.rel_count(self.v.provenance_reader) > 0,
            agg_refused,
            empty_zero,
            reads_members: pol.rel_count(self.v.member_reader) > 0,
            lattice_refused,
            lattice_outer,
            reads_lattice_members: pol.rel_count(self.v.lattice_member_reader) > 0,
            reads_dominated: pol.rel_count(self.v.dominated_reader) > 0,
        };
        self.h = h;
        answer
    }

    /// `premise_var` and `slot_arity` rows for one slot, as `safety_answer`
    /// seeds every other slot.
    fn seed_slot(&self, h: &mut Heap, pol: &mut Store, rid: Term, k: i64, name: Term, ts: &[Term]) {
        let mut vs: Vec<Sym> = Vec::new();
        for t in ts {
            h.vars_of(*t, &mut vs);
        }
        let main = self.v.main;
        let mut i = 0i64;
        for var in &vs {
            i += 1;
            let vname = h.name(*var).to_string();
            let vs_t = h.string(&vname);
            pol.add(h, self.v.premise_var, main, &[rid, Term::int(k), name, Term::int(i), vs_t], F_BASE);
        }
        pol.add(h, self.v.slot_arity, main, &[rid, Term::int(k), name, Term::int(i)], F_BASE);
    }

    // ----------------------------------------------------------------- run

    /// A COPY OF THE WORLD, at 3 ms against 383 for a rebuild — and of almost
    /// nothing once the heap and the store are frozen (`Session::fork`), when
    /// their clones share the frozen base and copy only what lies above it.
    ///
    /// Every other field is copied — the prepared rules, the
    /// counters. `prepare` is NOT re-run, and that is the whole saving: the
    /// 383 ms is peeling the strata and planning the bodies of the packs, and
    /// a fork inherits the answer rather than recomputing it.
    ///
    /// The rules are `Rc`, so the clone shares them rather than copying them:
    /// a plan is immutable once prepared, and a fork that rewrote one would be
    /// a different program, not a different world.
    ///
    /// The measured counters (`steps`, `peak_rows`, `argm_by_rule`) come along
    /// as they are. A caller measuring a fork should read the DIFFERENCE, and
    /// resetting them here would silently discard what the core already spent.
    pub fn fork(&self) -> Eval {
        self.clone()
    }

    /// An evaluation, and for a world whose widened cells settled, the
    /// descending pass that narrows them (`narrow_descend`) and the
    /// evaluation again with what it found.
    pub fn run(&mut self) -> Result<Outcome, Halt> {
        brk!("stale_holes_kept" => (); self.store.drop_eval_holes());
        self.narrow_out.clear();
        let out = self.run_pass()?;
        if out.partial || self.well_founded || self.widened_x.is_empty() {
            return Ok(out);
        }
        // THE WIDENED RESULT IS AN ANSWER, narrowing only a tighter one: a descent that fails
        // or an evaluation that closes a cell on another value leaves the first pass standing
        match self.run_narrowed() {
            Ok(out) => Ok(out),
            Err(_e) => brk!("descent_fatal" => Err(_e); {
                self.narrowing = None;
                self.narrow_out.clear();
                self.run_pass()
            }),
        }
    }

    fn run_narrowed(&mut self) -> Result<Outcome, Halt> {
        self.narrow_descend()?;
        let out = self.run_pass()?;
        if out.partial {
            return Err(Halt::Budget("budget_exhausted", None));
        }
        for (ck, (x, _, _)) in &self.narrow_out {
            if self.widened_x.get(ck) != Some(x) || brk!("descent_closes_other" => true; false) {
                return Err(Halt::Bug(format!("the widened cell {} closed on another value when evaluated again", self.h.name(ck.0))));
            }
        }
        Ok(out)
    }

    fn run_pass(&mut self) -> Result<Outcome, Halt> {
        self.clear_derived();
        self.shrug_reset();
        self.active.clear();
        self.staged.clear();
        self.staged_alts.clear();
        self.staged_unknown.clear();
        self.steps = 0;
        self.rows = 0;
        self.peak_rows = 0;
        self.carry_wall = (self.budget, self.space);
        (self.carry_steps, self.carry_rows, self.carry_broken) = (0, 0, false);
        let mut partial = false;
        if self.well_founded {
            let partial = match self.run_well_founded() {
                Ok(()) => false,
                Err(Halt::Budget(reason, _)) => {
                    self.wall_hole(reason)?;
                    true
                }
                Err(e) => return Err(e),
            };
            self.write_shrugs(partial)?;
            self.store.dirty = false;
            self.store.partial_eval = partial;
            self.store.note_eval(self.budget, self.steps, partial);
            return Ok(Outcome {
                partial,
                staged: if partial { 0 } else { self.staged.len() },
            });
        }
        self.forget_cells();
        self.support_ix = None;
        self.fault = None;
        self.derived_rels = self
            .rules
            .iter()
            .filter(|r| r.clause.head.temporal != Temporal::Next)
            .map(|r| r.clause.head.rel)
            .collect();
        self.refuse_tags()?;
        self.refuse_lattices()?;
        self.refuse_aggregates()?;
        // A CELL CARRIED ACROSS A BOUNDARY is read as data in the tick it
        // arrived in, under its own name: a conclusion staged from it cites
        // it there, and its value, seals and members are what that cites.
        if brk!("carried_cells_unreflected" => false; true) {
            let now = self.store.tick;
            for c in 0..self.store.cell_count() as CellId {
                if self.store.cell(c).tick < now {
                    self.reflect_cell(c)?;
                }
            }
            self.cur_front = Front::default();
        }
        self.lat_cur.clear();
        self.sub_cur.clear();
        self.sub_seen.clear();
        self.sub_seen_set.clear();
        self.sub_beaten.clear();
        self.sub_prems.clear();
        self.sub_memo.clear();
        self.sub_gone.clear();
        self.sub_by.clear();
        self.sub_by_of.clear();
        self.sub_parties.clear();
        self.conflict_marks.clear();
        self.join_contribs.clear();
        self.join_keys.clear();
        self.join_canonical.clear();
        self.join_checked.clear();
        self.lat_holed_rel.clear();
        self.lat_superseded.clear();
        self.lat_history.clear();
        self.lat_stale.clear();
        self.store.track_citers(!self.lattices.is_empty());
        self.lat_improved.clear();
        self.lat_dropped.clear();
        self.lat_closed.clear();
        self.lat_pending.clear();
        brk!("widen_steps_carried" => (); self.lat_steps.clear());
        self.lat_widened.clear();
        self.widened_marks.clear();
        self.widened_x.clear();
        self.lat_unknown.clear();
        self.lat_withdrawn.clear();
        self.lat_spread.clear();
        self.lat_unknown_rel.clear();
        self.lat_unknown_at.clear();
        self.unknown_at.clear();
        self.unknown_any.clear();
        self.lat_undecided.clear();
        self.lat_plain.clear();
        self.plain_pending = self.carried_unknowns(self.store.tick);
        self.plain_undecided.clear();
        self.agg_opened.clear();
        self.plain_closed.clear();
        self.ds_comps.clear();
        self.ds_elems.clear();
        self.ds_released.clear();
        self.ds_done.clear();
        self.lattice_improvements = 0;
        self.seed_narrowing()?;
        let safe_rules: Vec<Rc<ERule>> = self.rules.iter().filter(|r| r.safe).cloned().collect();
        let readers = self.shrug_readers.clone();
        // a rule into a subsumptive relation whose dominance reads a relation
        // fires once that relation is closed, at its level
        let compared: HashSet<Sym> = self.subs.iter().filter(|(_, x)| !x.reads.is_empty()).map(|(p, _)| *p).collect();
        let stratified = |r: &Rc<ERule>| {
            readers.contains(&r.id) || brk!("dominance_rules_early" => false; compared.contains(&r.clause.head.rel) && r.clause.head.temporal != Temporal::Next) || brk!("mono" => r.has_neg || !r.lattice_outer.is_empty(),
                 "lattice_outer_mono" => r.has_neg || r.has_agg;
                 r.has_neg || r.has_agg || !r.lattice_outer.is_empty())
        };
        let mono: Vec<Rc<ERule>> = safe_rules.iter().filter(|r| !stratified(r)).cloned().collect();
        let strat_rules: Vec<Rc<ERule>> = safe_rules.iter().filter(|r| stratified(r)).cloned().collect();

        let outcome = (|| -> Result<(), Halt> {
            // THE ROUNDS ARE PEELED BEFORE ANYTHING FIRES; THE STOCK
            // EVALUATOR'S TABLE IS READ AFTER PHASE A, which derives it. Read
            // before, it was the table the last evaluation left and
            // `clear_derived` had just emptied, so every negation and every
            // aggregate ran in one final pass (src/engine.ts reads it after
            // the two waves; f_the_rust_stock_evaluator_read_its_table_before_deriving_it).
            let peeled: Option<Vec<(i64, Vec<Rc<ERule>>)>> = match self.mode {
                Mode::Rounds => Some({
                    let lats: Vec<Sym> = self.lattices.keys().copied().collect();
                    let dom_edges: Vec<(Sym, Sym)> = self.subs.iter().flat_map(|(p, x)| x.reads.iter().map(move |b| (*p, *b))).collect();
                    let mut peel = peel_rounds(&self.rules, &self.v, &lats, &dom_edges, &HashSet::new());
                    if peel.stalled {
                        // A COMPONENT WHOSE ONLY STRICT EDGES ARE AGGREGATES' may be
                        // stratified by its data (`datastrat.rs`): ranked as one round
                        if let Some(by_data) = self.take_data_components(&peel, &lats, &dom_edges) {
                            peel = by_data;
                        }
                    }
                    if peel.stalled {
                        // AN AGGREGATE THROUGH ITS OWN CONCLUSION is named for
                        // what it is, before the generic stall.
                        let deps = self.rel_deps();
                        for (rid, head, inner) in &peel.agg_edges {
                            if peel.stuck.contains(head) && peel.stuck.contains(inner) && reaches_in(&deps, *inner, *head) {
                                let op = self
                                    .rules
                                    .iter()
                                    .find(|r| r.id == *rid)
                                    .and_then(|r| r.clause.body.iter().find_map(|b| match b {
                                        BodyElem::Agg(a) if b.lits_deep().iter().any(|l| l.rel == *inner) => Some(a.op.name()),
                                        _ => None,
                                    }))
                                    .unwrap_or("an aggregate");
                                return Err(Halt::Strat(
                                    format!(
                                        "program rejected: {op} in rule {} reads {}, which depends on the rule's own conclusion {}: \
                                         an aggregate reads a closed relation; a recursive min/max is a lattice declaration (docs/aggregates.md)",
                                        self.h.name(*rid),
                                        self.h.name(*inner),
                                        self.h.name(*head)
                                    ),
                                    String::new(),
                                ));
                            }
                        }
                        // A DOMINANCE THROUGH ITS OWN RELATION, named for what it is
                        let mut subs: Vec<(Sym, Rc<Sub>)> = self.subs.iter().map(|(p, x)| (*p, x.clone())).collect();
                        subs.sort_by(|a, b| cmp_js(self.h.name(a.0), self.h.name(b.0)));
                        for (p, x) in subs {
                            if let Some(b) = x.reads.iter().find(|b| peel.stuck.contains(&p) && peel.stuck.contains(*b) && reaches_in(&deps, **b, p)) {
                                return Err(Halt::Strat(
                                    format!(
                                        "program rejected: the dominance of {} reads {}, which depends on {} itself: which of two values \
                                         dominates is decided from relations closed below it (docs/aggregates.md, \"Subsumption, as built\")",
                                        self.h.name(p),
                                        self.h.name(*b),
                                        self.h.name(p)
                                    ),
                                    String::new(),
                                ));
                            }
                        }
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
                    self.round_of = peel.round.iter().map(|(k, v)| (*k, *v as u32)).collect();
                    level_split(&strat_rules, |r| {
                        if r.clause.head.temporal == Temporal::Next {
                            i64::MAX
                        } else {
                            peel.round
                                .get(&r.clause.head.rel)
                                .copied()
                                .unwrap_or(i64::MAX)
                        }
                    })
                }),
                Mode::Strata => None,
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
            if self.mode == Mode::Strata && !strat_rules.is_empty() {
                self.check_unstratified()?;
            }
            self.activate(&second)?;
            let levels = match peeled {
                Some(l) => l,
                None => {
                    let mut strat = self.read_strata();
                    self.rank_counting(&mut strat);
                    let table = strat.clone();
                    self.rank_unknown_cone(&mut strat);
                    brk!("strata_untabled" => (); self.check_agg_strata(&strat, &strat_rules)?);
                    self.check_lattice_strata(&strat, &strat_rules)?;
                    brk!("unranked_negation_runs" => (); self.check_unranked_negation(&table, &strat_rules, &mono)?);
                    self.round_of = strat.iter().map(|(k, v)| (*k, (*v).max(0) as u32)).collect();
                    level_split(&strat_rules, |r| {
                        if r.clause.head.temporal == Temporal::Next {
                            i64::MAX
                        } else {
                            strat.get(&r.clause.head.rel).copied().unwrap_or(i64::MAX)
                        }
                    })
                }
            };
            for (lv, rs) in levels {
                self.close_plain_rules(lv)?;
                self.plain_flush(lv)?;
                self.close_thresholds_below(lv, true)?;
                self.close_lattices_below(lv)?;
                // the rules that own an element a stratification by data took run
                // last at their level, a layer at a time (`datastrat.rs`)
                let (ds, rs): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = rs.into_iter().partition(|r| self.ds_owner(r));
                if brk!("shrug_snapshot_off" => false; self.shrug_snap.is_none() && rs.iter().any(|r| self.shrug_readers.contains(&r.id))) {
                    // what reads shrug fires after the rest of its level (a
                    // rule concluding `@next` shares the last one) and the rows
                    let (late, early): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = rs.iter().cloned().partition(|r| self.shrug_readers.contains(&r.id));
                    self.activate(&early)?;
                    self.poison_readers(&early)?;
                    self.shrug_snapshot()?;
                    self.activate(&late)?;
                    self.poison_readers(&late)?;
                    self.run_data_levels(lv, &ds)?;
                    continue;
                }
                self.activate(&rs)?;
                self.poison_readers(&rs)?;
                self.run_data_levels(lv, &ds)?;
            }
            self.close_plain_rules(i64::MAX)?;
            self.plain_flush(i64::MAX)?;
            // what a lattice's close writes can reach a threshold, and the
            // reverse: the last closes run until neither has work
            loop {
                self.close_thresholds_below(i64::MAX, true)?;
                self.close_lattices_below(i64::MAX)?;
                if self.thr_open.is_empty() {
                    break;
                }
            }
            Ok(())
        })();

        self.ds_elems.clear();
        self.ds_done.clear();
        match outcome {
            Ok(()) => {}
            Err(Halt::Budget(reason, _)) => {
                // EITHER WALL CUTS THE WHOLE WORLD, and says so as the budget
                // always did: a world hole with the wall's reason, and the
                // evaluation partial, whatever else the cut left.
                partial = brk!("space_uncut_world" => reason == "budget_exhausted"; true);
                if partial {
                    self.wall_hole(reason)?;
                }
                brk!("agg_seal_at_wall" => {
                    let aggs: Vec<Rc<ERule>> = strat_rules.iter().filter(|r| r.has_agg).cloned().collect();
                    self.with_walls_lifted(|e| e.activate(&aggs))?;
                }; ());
                let why = if reason == "budget_exhausted" { self.v.budget_reason } else { self.v.space_reason };
                if reason == "budget_exhausted" || brk!("lattice_space_uncut" => false; true) {
                    self.lattice_cut(why)?;
                }
                // A QUORUM REACHED BEFORE THE CUT STANDS (its members exist),
                // and is closed over what was derived: canonical, with its
                // heights. The walls are the evaluation's, spent.
                self.with_walls_lifted(|e| e.close_thresholds_below(i64::MAX, false))?;
            }
            Err(e) => return Err(e),
        }
        self.settle_staged();
        self.write_shrugs(partial)?;
        self.store.dirty = false;
        self.store.partial_eval = partial;
        // EVERY EXIT NOTES, including this one, because the record is what a
        // replay of THIS tick needs and a tick that finished is as replayable
        // as one that did not.
        self.store.note_eval(self.budget, self.steps, partial);
        Ok(Outcome {
            partial,
            staged: self.staged.len(),
        })
    }

    /// THE SHRUG MODEL, set up for one evaluation (docs/aggregates.md,
    /// "Shrugs, as built"). A literal holds, is unentailed, or is a shrug. What
    /// a hole leaves out is a shrug, and so is `unknown(A)` read of it: the
    /// relations that read `unknown` sit above every other (`peel_rounds`), so
    /// each such A is known when they fire, and `unknown(A)` is carried with
    /// it as a shrug of its own (`meta_of`). This replaces the refusal of a
    /// program that read `unknown` in a world a hole reached
    /// (f_unknown_is_read_as_complete_beside_a_hole).
    fn shrug_reset(&mut self) {
        self.wall_spent.set(None);
        // the rows describe one evaluation: none is read before it writes them
        let old = self.store.rel_all(&self.h, self.v.shrug);
        self.store.remove_many(&old);
        self.meta_queue.clear();
        self.meta_late = None;
        self.unk_edges.clear();
        self.carry_src = None;
        self.holes_now.clear();
        self.holes_met.clear();
        self.last_fault_rule = None;
        self.unknown_strict.clear();
        self.wfs_written.clear();
        let un = self.v.unknown;
        let sh = self.v.shrug;
        self.shrug_snap = None;
        self.cycle_groups.clear();
        self.cycle_of.clear();
        self.shrug_readers = self
            .rules
            .iter()
            .filter(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.rel == sh))
            .map(|r| r.id)
            .collect();
        let mut cone: HashSet<Sym> = HashSet::new();
        for r in &self.rules {
            if self.shrug_readers.contains(&r.id) {
                cone.insert(r.clause.head.rel);
            }
            for b in &r.clause.body {
                let strict = match b {
                    BodyElem::Neg(_) => true,
                    BodyElem::Agg(a) => a.op != AggOp::AtLeast,
                    _ => false,
                };
                for l in b.lits_deep() {
                    if l.rel == un {
                        cone.insert(r.clause.head.rel);
                        if strict {
                            self.unknown_strict.push(l.clone());
                        }
                    }
                }
            }
        }
        self.reads_unknown = self.rules.iter().any(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.rel == un));
        if !self.shrug_readers.is_empty() && self.store.add(&self.h, self.v.edb, self.v.main, &[Term::atom(sh)], F_BASE) {
            self.rows += 1;
        }
        // the kernel writes `unknown` under either semantics: its rows, or the
        // shrugs `unknown(A)` read of what a hole left out
        if self.reads_unknown && self.store.add(&self.h, self.v.edb, self.v.main, &[Term::atom(un)], F_BASE) {
            self.rows += 1;
        }
        loop {
            let more: Vec<Sym> = self
                .rules
                .iter()
                .filter(|r| !cone.contains(&r.clause.head.rel))
                .filter(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| cone.contains(&l.rel)))
                .map(|r| r.clause.head.rel)
                .collect();
            if more.is_empty() {
                break;
            }
            cone.extend(more);
        }
        self.unknown_cone = cone;
    }

    /// `unknown(A)` for an unknown A: the atom as a term, in its own book, a
    /// lattice cell's value and a position not known standing for the unknown
    /// value; every row of `unknown` when A's book is not known.
    fn meta_of(&mut self, u: &Unknown) -> Unknown {
        match u {
            Unknown::Tuple(rel, p, args) => {
                let at = atom_term(&mut self.h, *rel, args);
                Unknown::Tuple(self.v.unknown, *p, vec![at].into())
            }
            Unknown::Cell((rel, p, key)) => {
                let n = self.lattices.get(rel).map_or(key.len() + 1, |x| x.0);
                let mut a = key.to_vec();
                a.resize(n.max(key.len() + 1), self.unknown_value);
                let at = atom_term(&mut self.h, *rel, &a);
                Unknown::Tuple(self.v.unknown, *p, vec![at].into())
            }
            Unknown::Rel(_) => Unknown::Rel(self.v.unknown),
        }
    }

    /// The `unknown(A)` shrugs of what was noted since the last call, noted
    /// and spread as plain unknowns, each reached from its A. One that a strict
    /// reader of `unknown` could read, of a relation that reads `unknown`
    /// itself, arrived after that reader fired: `meta_late`.
    fn take_metas(&mut self, level: &mut Vec<Unknown>) {
        for (m, from) in std::mem::take(&mut self.meta_queue) {
            if self.meta_late.is_none() && self.unknown_cone.contains(&from.rel()) {
                let strict = self.unknown_strict.clone();
                if strict.iter().any(|l| self.unknown_binds(l, &m, &Subst::new()).is_some()) {
                    self.meta_late = Some(self.unknown_text(&from));
                }
            }
            self.unk_edges.push((Node::Unk(m.clone()), Node::Unk(from)));
            if self.note_unknown(m.clone(), None) && !self.unknown_holds(&m) {
                self.lat_plain.insert(m.clone());
                if self.lat_spread.insert(m.clone()) {
                    level.push(m);
                }
            }
        }
    }

    fn rule_marker(&mut self, rule: Sym) -> Term {
        self.h.mkf(self.v.s_rule_hole, &[Term::atom(rule)])
    }

    /// `u` is left out by the fault a builtin just met, in the rule it met it in.
    fn fault_edge(&mut self, u: &Unknown) {
        if let Some(r) = self.last_fault_rule {
            let marker = self.rule_marker(r);
            self.unk_edges.push((Node::Unk(u.clone()), Node::Hole(marker)));
        }
    }

    /// A hole row this evaluation writes or meets again; an inherited one is
    /// reached from what the carry is working from.
    /// A hole row is charged once an evaluation meets it, written then or
    /// by an evaluation before: what one evaluation holds is its own count,
    /// not the store's history.
    fn charge_hole_row(&mut self) {
        self.rows += 1;
        if self.rows > self.peak_rows {
            self.peak_rows = self.rows;
        }
    }

    fn hole_met(&mut self, target: Term, cause: Sym) -> bool {
        let fresh = self.holes_met.insert((target, cause));
        self.holes_now.push((target, cause));
        if self.h.name(cause) == "support_withdrawn" {
            if let Some(src) = self.carry_src.clone() {
                self.unk_edges.push((Node::Hole(target), src));
            }
            for src in self.carry_more.clone() {
                self.unk_edges.push((Node::Hole(target), src));
            }
        }
        fresh
    }

    /// THE SHRUG ROWS, `shrug(Target, Reason, Meta)` in `[$kernel]`, written
    /// after every evaluation from what it met (shrug.rofl declares the
    /// reasons and their meta): each hole target, with its cause's reason;
    /// each atom a hole left out, and each `unknown(A)` read of one,
    /// `inherited` from the root targets it was reached from; each atom the
    /// alternating fixpoint left undefined, a `paradox` over the relations
    /// of its negative cycle. `cut`: a wall fell, so the rows are not final
    /// and what moved since the readers fired is the wall's, which its hole
    /// already says; no reader is refused over it.
    fn write_shrugs(&mut self, cut: bool) -> Result<(), Halt> {
        if let Some(what) = self.meta_late.take().filter(|_| brk!("shrug_meta_late_unrefused" => false; true)) {
            return Err(Halt::Strat(
                format!("program rejected: unknown is read under not or in an aggregate of {what}, which itself reads unknown"),
                "a shrug of a relation that reads unknown arrives after its readers fired; read it positively, or from a world above"
                    .to_string(),
            ));
        }
        let rows = self.shrug_rows()?;
        let snap = self.shrug_snap.take().filter(|_| !cut || brk!("shrug_late_cut_refused" => true; false));
        if let Some(snap) = snap {
            let readers: Vec<Rc<ERule>> = self.rules.iter().filter(|r| self.shrug_readers.contains(&r.id)).cloned().collect();
            // a row added since the readers fired, and one withdrawn since
            // (a reader's conclusion made its target hold): either way what
            // a reader read is not the final state
            let now: HashSet<[Term; 3]> = rows.iter().copied().collect();
            let mut moved: Vec<[Term; 3]> = rows.iter().filter(|r| !snap.contains(*r)).copied().collect();
            if brk!("shrug_withdrawn_unrefused" => false; true) {
                let mut gone: Vec<[Term; 3]> = snap.iter().filter(|r| !now.contains(*r)).copied().collect();
                gone.sort_by_cached_key(|r| {
                    let mut k = String::new();
                    for t in r {
                        self.h.canon_term(*t, &mut k);
                        k.push('\0');
                    }
                    k
                });
                moved.extend(gone);
            }
            for row in &moved {
                if !brk!("shrug_late_unrefused" => false; true) {
                    continue;
                }
                // a reader could read it: its literal takes the row, and the
                // rest of its body has a solution over the facts and the unknowns
                let mut readable = false;
                for r in &readers {
                    for (i, b) in r.plan.iter().enumerate() {
                        let (BodyElem::Pos(l) | BodyElem::Neg(l)) = b else { continue };
                        if l.rel != self.v.shrug || l.args.len() != 3 {
                            continue;
                        }
                        let mut s0 = Some(Subst::new());
                        for (a, t) in l.args.iter().zip(row.iter()) {
                            s0 = s0.and_then(|s| unify(&self.h, *a, *t, &s));
                        }
                        if let Some(s0) = s0 {
                            if !self.poison_solve(r, i, s0)?.is_empty() {
                                readable = true;
                            }
                        }
                    }
                }
                if readable {
                    let mut k = String::new();
                    self.h.canon_term(row[0], &mut k);
                    let what = if now.contains(row) { "leaves without an answer" } else { "answers after it read the shrug" };
                    return Err(Halt::Strat(
                        format!("program rejected: shrug is read of {k}, which a rule that reads shrug {what}"),
                        "a rule reading shrug fires once the rest is settled; what it changes has no row it could have read"
                            .to_string(),
                    ));
                }
            }
        }
        self.put_shrugs(rows);
        Ok(())
    }

    /// The rows as they stand, written for the rules that read them.
    fn shrug_snapshot(&mut self) -> Result<(), Halt> {
        let rows = self.shrug_rows()?;
        self.shrug_snap = Some(rows.iter().copied().collect());
        self.put_shrugs(rows);
        Ok(())
    }

    fn put_shrugs(&mut self, rows: Vec<[Term; 3]>) {
        let sh = self.v.shrug;
        let old = self.store.rel_all(&self.h, sh);
        self.store.remove_many(&old);
        if brk!("shrug_rows_off" => true; false) {
            return;
        }
        for args in rows {
            self.store.add(&self.h, sh, self.v.kernel_persp, &args, F_BASE | F_TICK);
        }
    }

    /// A PARADOX IS A ROOT TOO. Under well-founded semantics what a hole left
    /// out can rest on an atom the alternation left undefined as well
    /// (`mix() :- p(), not h(z).`, p a paradox and h(z) a fault's): each
    /// derivation of it over the facts, the unknowns carried and the
    /// undefined atoms names the undefined atoms it reads, an edge from it
    /// to the paradox's target. The carry's walls were paid for the carry;
    /// this reads it once more and is not charged to them.
    fn paradox_edges(&mut self) -> Result<(), Halt> {
        if self.lat_unknown.is_empty() || brk!("shrug_paradox_root_off" => true; false) {
            return Ok(());
        }
        let mut target_of: HashMap<Unknown, Term> = HashMap::new();
        let mut by_rel: HashMap<Sym, Vec<Unknown>> = HashMap::new();
        for id in self.store.rel_all(&self.h, self.v.unknown) {
            let a = self.store.args(id).to_vec();
            if a.len() != 1 || !self.store.alive(id) {
                continue;
            }
            let (rel, args): (Sym, Vec<Term>) = match a[0].kind() {
                TermK::Func(i) => (self.h.fname(i), self.h.fargs(i).to_vec()),
                TermK::Atom(r) => (r, Vec::new()),
                _ => continue,
            };
            let persp = self.store.rec(id).persp;
            let target = if persp == self.v.main { a[0] } else {
                let f = self.h.intern("in");
                self.h.mkf(f, &[Term::atom(persp), a[0]])
            };
            let u = Unknown::Tuple(rel, persp, args.into());
            by_rel.entry(rel).or_default().push(u.clone());
            target_of.insert(u, target);
        }
        if target_of.is_empty() {
            return Ok(());
        }
        let mut carried: Vec<(String, Unknown)> = self
            .lat_unknown
            .keys()
            .filter(|u| matches!(u, Unknown::Tuple(..)) && u.rel() != self.v.unknown && !self.unknown_holds(u))
            .map(|u| (self.unknown_text(u), u.clone()))
            .collect();
        carried.sort_by(|a, b| cmp_js(&a.0, &b.0));
        let saved = (self.carry_steps, self.carry_rows, self.carry_wall);
        self.carry_wall = (i64::MAX, i64::MAX);
        self.undef_atoms = Some(by_rel);
        let rules = self.rules.clone();
        let r = (|| -> Result<(), Halt> {
            for (_, u) in carried {
                for r in rules.iter().filter(|r| r.safe && r.clause.head.rel == u.rel() && r.clause.head.temporal != Temporal::Next) {
                    let Some(s0) = self.unknown_binds(&r.clause.head, &u, &Subst::new()) else { continue };
                    for sol in self.poison_solve_plan(&r.plan, &r.lattice_outer, usize::MAX, s0)? {
                        for b in &r.plan {
                            let (BodyElem::Pos(l) | BodyElem::Neg(l)) = b else { continue };
                            let lu = self.lit_unknown(l, &sol);
                            if let Some(t) = target_of.get(&lu) {
                                self.unk_edges.push((Node::Unk(u.clone()), Node::Hole(*t)));
                            }
                        }
                    }
                }
            }
            Ok(())
        })();
        self.undef_atoms = None;
        (self.carry_steps, self.carry_rows, self.carry_wall) = saved;
        r
    }

    /// Does `l` under `s` read an atom the alternation left undefined, while
    /// `paradox_edges` solves over them?
    fn reads_undefined(&mut self, l: &Lit, s: &Subst) -> bool {
        if self.undef_atoms.as_ref().is_none_or(|m| !m.contains_key(&l.rel)) || brk!("shrug_paradox_neg_off" => true; false) {
            return false;
        }
        let lu = self.lit_unknown(l, s);
        self.undef_atoms.as_ref().is_some_and(|m| m[&l.rel].contains(&lu))
    }

    /// The shrug rows of what this evaluation met so far.
    fn shrug_rows(&mut self) -> Result<Vec<[Term; 3]>, Halt> {
        let edges0 = self.unk_edges.len();
        let r = self.paradox_edges();
        let rs = self.root_sets();
        self.unk_edges.truncate(edges0);
        r?;
        let mut rows: Vec<[Term; 3]> = Vec::new();
        let inherited = self.h.atom("inherited");
        // the targets a node rests on: every hole target it reaches back to
        // that nothing reached (`root_sets`)
        let roots = |e: &mut Eval, n: &Node| -> Term {
            let ts: Vec<Term> = rs.of(n);
            let l = e.h.list(&ts);
            let f = e.h.intern("from");
            e.h.mkf(f, &[l])
        };
        let mut seen_holes: HashSet<(Term, Sym)> = HashSet::new();
        let mut holes: Vec<(Term, Sym)> = self.holes_now.iter().copied().filter(|x| seen_holes.insert(*x)).collect();
        // what lives elsewhere is a shrug for as long as its hole stands: a
        // volume cooled to disk is no evaluation's, and every one's
        for f in self.store.rel_persp(&self.h, self.v.hole, self.v.kernel_persp) {
            let a = self.store.args(f);
            let Some(c) = a[1].as_atom() else { continue };
            if crate::shrug::reason_of(self.h.name(c)) == Some("federation") && brk!("shrug_standing_off" => false; true) && seen_holes.insert((a[0], c)) {
                holes.push((a[0], c));
            }
        }
        for (target, cause) in holes {
            let cname = self.h.name(cause).to_string();
            let Some(reason) = crate::shrug::reason_of(&cname) else {
                return Err(Halt::Bug(format!("the hole cause {cname} is not declared in shrug.rofl")));
            };
            let meta = match reason {
                "inherited" => {
                    let node = Node::Hole(target);
                    let (next, below) = (self.h.intern("$next"), self.h.intern("$below"));
                    match target.kind() {
                        TermK::Func(i) if self.h.fname(i) == next && !rs.has_parents(&node) => {
                            let t = self.h.fargs(i)[2].as_int().unwrap_or(0);
                            let f = self.h.intern("earlier");
                            self.h.mkf(f, &[Term::int(t - 1)])
                        }
                        TermK::Func(i) if self.h.fname(i) == below => self.h.atom("below"),
                        _ => roots(self, &node),
                    }
                }
                "budget" => {
                    let (kind, spent, limit) = self.wall_spent.get().unwrap_or(if cname == "space_exhausted" {
                        ("rows", self.space + 1, self.space)
                    } else {
                        ("steps", self.budget + 1, self.budget)
                    });
                    let (f, k) = (self.h.intern("spent"), self.h.atom(kind));
                    self.h.mkf(f, &[k, Term::int(spent), Term::int(limit.min(i64::MAX >> 4))])
                }
                "divergence" => {
                    // the cells of its own improving cycle
                    let same: Vec<Term> = match self.cycle_of.get(&target) {
                        Some(&g) => self.cycle_groups[g].clone(),
                        None => vec![target],
                    };
                    let l = self.h.list(&same);
                    let f = self.h.intern("cycle");
                    self.h.mkf(f, &[l])
                }
                "widened" => {
                    // the value the cell closed on: its least value lies within it
                    let val = match self.widened_marks.get(&target) {
                        Some((v, _, _)) => brk!("widen_meta_first" => self.widened_marks[&target].1.first().map_or(*v, |w| w[3]); *v),
                        None => return Err(Halt::Bug(format!("the widened hole {} kept no value", self.shown(target)))),
                    };
                    let f = self.h.intern("within");
                    self.h.mkf(f, &[val])
                }
                "conflict" => {
                    // the values whose dominance is no order, in canonical order
                    let Some(mut ps) = self.conflict_marks.get(&target).cloned() else {
                        return Err(Halt::Bug(format!("the conflict hole {} kept no parties", self.shown(target))));
                    };
                    ps.sort_by_key(|t| self.shown(*t));
                    ps.dedup();
                    let l = self.h.list(&ps);
                    let f = self.h.intern("parties");
                    brk!("shrug_conflict_parties_off" => Term::atom(cause); self.h.mkf(f, &[l]))
                }
                "federation" => {
                    let arg = match target.kind() {
                        TermK::Func(i) if !self.h.fargs(i).is_empty() => self.h.fargs(i)[0],
                        _ => target,
                    };
                    let f = self.h.intern("at");
                    self.h.mkf(f, &[arg])
                }
                _ => Term::atom(cause),
            };
            let r = self.h.atom(reason);
            rows.push([target, r, meta]);
        }
        let mut unks: Vec<(String, Unknown)> = self
            .lat_unknown
            .keys()
            .filter(|u| !self.unknown_holds(u))
            .map(|u| (self.unknown_text(u), u.clone()))
            .collect();
        unks.sort_by(|a, b| cmp_js(&a.0, &b.0));
        for (_, u) in unks {
            let target = self.shrug_target(&u);
            let meta = roots(self, &Node::Unk(u));
            rows.push([target, inherited, meta]);
        }
        // the alternating fixpoint's undefined atoms: a paradox over the
        // relations its negative cycle runs through
        let un = self.v.unknown;
        let undefined = self.store.rel_all(&self.h, un);
        if !undefined.is_empty() {
            let mut neg_cycles: Option<NegCycles> = None;
            let mut fed_below: Option<HashSet<Term>> = None;
            let paradox = self.h.atom("paradox");
            for id in undefined {
                let a = self.store.args(id).to_vec();
                if a.len() != 1 || !self.store.alive(id) {
                    continue;
                }
                let persp = self.store.rec(id).persp;
                let rel = match a[0].kind() {
                    TermK::Func(i) => self.h.fname(i),
                    TermK::Atom(r) => r,
                    _ => continue,
                };
                let target = if persp == self.v.main { a[0] } else {
                    let f = self.h.intern("in");
                    self.h.mkf(f, &[Term::atom(persp), a[0]])
                };
                // fed from a world below, it rests on that world's cycles,
                // which its own rows name: `below`
                let fed = self.store.rec(id).base() && {
                    let ft = crate::reflect::fact_term(&mut self.h, &self.v, un, persp, &a);
                    fed_below.get_or_insert_with(|| self.asserted_below()).contains(&ft)
                };
                // asserted or concluded by a book of its own, and no
                // alternation left it undefined: the book's word, not a paradox
                let wfs = brk!("shrug_given_wfs_unread" => false; self.wfs_written.contains(&id));
                let mine = brk!("shrug_given_base_only" => self.store.rec(id).base(); true);
                if !fed && !wfs && mine && brk!("shrug_given_off" => false; true) {
                    let how = if self.store.rec(id).base() { "stated" } else { "concluded" };
                    let (given, how) = (self.h.atom("given"), self.h.atom(how));
                    rows.push([target, given, how]);
                    continue;
                }
                let meta = if fed && brk!("below_paradox_meta_off" => false; true) {
                    self.h.atom("below")
                } else {
                    let cyc: Vec<Term> = neg_cycles.get_or_insert_with(|| self.negative_cycles()).of(&self.h, rel).into_iter().map(Term::atom).collect();
                    let l = self.h.list(&cyc);
                    let f = self.h.intern("cycle");
                    self.h.mkf(f, &[l])
                };
                rows.push([target, paradox, meta]);
            }
        }
        // an atom the world below left undefined is a paradox here, and one a
        // book states is not known is the book's: neither is something a
        // hole left out
        let (paradox, given) = (self.h.atom("paradox"), self.h.atom("given"));
        let undefined: HashSet<Term> = rows.iter().filter(|r| r[1] == paradox || r[1] == given).map(|r| r[0]).collect();
        let mut seen: HashSet<[Term; 3]> = HashSet::new();
        rows.retain(|r| seen.insert(*r) && !(r[1] == inherited && undefined.contains(&r[0])));
        Ok(rows)
    }

    /// THE ROOTS OF EVERY NODE AT ONCE: the carry's edges, child to parent,
    /// condensed into their strongly connected components (a recursion over
    /// unknowns is a cycle), each component's roots the union of its
    /// parents' outside it, a hole target nothing reached its own. Linear in
    /// the edges and the roots, where a walk per node was quadratic in a
    /// carry wider than its facts.
    fn root_sets(&self) -> RootSets {
        let mut index: HashMap<Node, usize> = HashMap::new();
        let mut nodes: Vec<Node> = Vec::new();
        let mut parents: Vec<Vec<usize>> = Vec::new();
        let mut id = |n: &Node, nodes: &mut Vec<Node>, parents: &mut Vec<Vec<usize>>| -> usize {
            *index.entry(n.clone()).or_insert_with(|| {
                nodes.push(n.clone());
                parents.push(Vec::new());
                nodes.len() - 1
            })
        };
        for (c, p) in &self.unk_edges {
            let (ci, pi) = (id(c, &mut nodes, &mut parents), id(p, &mut nodes, &mut parents));
            parents[ci].push(pi);
        }
        // a component is emitted after every one it reaches (`tarjan`), so a
        // parent's roots are known before its children's
        let comp = tarjan(&parents);
        let ncomp = comp.iter().copied().max().map_or(0, |c| c + 1);
        let begun: HashSet<Term> = self.holes_now.iter().filter(|(_, c)| self.h.name(*c) != "support_withdrawn").map(|(t, _)| *t).collect();
        let mut members: Vec<Vec<usize>> = vec![Vec::new(); ncomp];
        for (v, c) in comp.iter().enumerate() {
            members[*c].push(v);
        }
        let mut sets: Vec<Vec<usize>> = Vec::with_capacity(ncomp);
        for (c, ms) in members.iter().enumerate() {
            let mut roots: Vec<usize> = Vec::new();
            if ms.len() == 1 && parents[ms[0]].is_empty() {
                if matches!(nodes[ms[0]], Node::Hole(_)) {
                    roots.push(ms[0]);
                }
            } else {
                for &m in ms {
                    for &q in &parents[m] {
                        if comp[q] != c {
                            roots.extend(sets[comp[q]].iter().copied());
                        }
                    }
                }
                roots.sort_unstable();
                roots.dedup();
                // a cycle nothing outside reached is self-supporting: its roots are the holes that
                // began it (a fault), or failing those every hole it holds
                if roots.is_empty() && brk!("roots_of_cycle_off" => false; true) {
                    let holes: Vec<usize> = ms.iter().copied().filter(|&m| matches!(nodes[m], Node::Hole(_))).collect();
                    let began: Vec<usize> = holes.iter().copied().filter(|&m| matches!(&nodes[m], Node::Hole(t) if begun.contains(t))).collect();
                    roots = if began.is_empty() { holes } else { began };
                }
            }
            sets.push(roots);
        }
        let text: HashMap<usize, String> = sets
            .iter()
            .flatten()
            .map(|&r| {
                let mut k = String::new();
                if let Node::Hole(t) = &nodes[r] {
                    self.h.canon_term(*t, &mut k);
                }
                (r, k)
            })
            .collect();
        RootSets { index, nodes, parents, comp, sets, text }
    }

    /// An unknown as the target of its shrug row: the atom, in `in(Book,
    /// Atom)` when its book is not main, `every(Rel)` for every tuple of a
    /// relation; a position not known holds the unknown value.
    fn shrug_target(&mut self, u: &Unknown) -> Term {
        let (rel, p, args): (Sym, Sym, Vec<Term>) = match u {
            Unknown::Tuple(rel, p, args) => (*rel, *p, args.to_vec()),
            Unknown::Cell((rel, p, key)) => {
                // every value after the key is the one not known
                let n = self.lattices.get(rel).map_or(key.len() + 1, |x| x.0);
                let mut a = key.to_vec();
                a.resize(n.max(key.len() + 1), self.unknown_value);
                (*rel, *p, a)
            }
            Unknown::Rel(rel) => {
                let f = self.h.intern("every");
                return self.h.mkf(f, &[Term::atom(*rel)]);
            }
        };
        let at = atom_term(&mut self.h, rel, &args);
        if p == self.v.main {
            at
        } else {
            let f = self.h.intern("in");
            self.h.mkf(f, &[Term::atom(p), at])
        }
    }

    /// The facts the world below fed this one (`Session::feed_below`), as
    /// `asserted_by` names them.
    fn asserted_below(&mut self) -> HashSet<Term> {
        let below = self.h.atom("below");
        self.store
            .rel_persp(&self.h, self.v.asserted_by, self.v.kernel_persp)
            .into_iter()
            .map(|f| self.store.args(f))
            .filter(|a| a.len() == 3 && a[1] == below)
            .map(|a| a[0])
            .collect()
    }

    /// THE NEGATIVE CYCLES of the rules' dependency graph, once per
    /// evaluation's rows: the graph condensed (`tarjan`), and the components
    /// with a negative edge inside them (a negation, or an aggregate's body
    /// read strictly), the only cycles an undefined atom can rest on.
    fn negative_cycles(&self) -> NegCycles {
        let mut idx: HashMap<Sym, usize> = HashMap::new();
        let mut rels: Vec<Sym> = Vec::new();
        let mut succ: Vec<Vec<usize>> = Vec::new();
        let mut neg: Vec<(usize, usize)> = Vec::new();
        let mut id = |r: Sym, rels: &mut Vec<Sym>, succ: &mut Vec<Vec<usize>>| -> usize {
            *idx.entry(r).or_insert_with(|| {
                rels.push(r);
                succ.push(Vec::new());
                rels.len() - 1
            })
        };
        for r in &self.rules {
            let h = id(r.clause.head.rel, &mut rels, &mut succ);
            for b in &r.clause.body {
                let (lits, strict): (Vec<(&Lit, bool)>, bool) = match b {
                    BodyElem::Pos(l) => (vec![(l, false)], false),
                    BodyElem::Neg(l) => (vec![(l, true)], true),
                    BodyElem::Bi { .. } => continue,
                    BodyElem::Agg(a) => {
                        let strict = a.op != AggOp::AtLeast;
                        let ls = a.body.iter().flat_map(|e| {
                            let n = matches!(e, BodyElem::Neg(_));
                            e.lits_deep().into_iter().map(move |l| (l, n))
                        });
                        (ls.collect(), strict)
                    }
                };
                for (l, n) in lits {
                    let t = id(l.rel, &mut rels, &mut succ);
                    succ[h].push(t);
                    if brk!("shrug_paradox_any_cycle" => true; n || strict) {
                        neg.push((h, t));
                    }
                }
            }
        }
        let comp = tarjan(&succ);
        let mut negc: HashSet<usize> = HashSet::new();
        for (h, t) in neg {
            if comp[h] == comp[t] {
                negc.insert(comp[h]);
            }
        }
        NegCycles { idx, rels, succ, comp, neg: negc, memo: HashMap::new() }
    }

    /// The world hole a wall writes: `hole($adhoc, budget_exhausted)`, or
    /// `space_exhausted`.
    fn wall_hole(&mut self, reason: &str) -> Result<(), Halt> {
        let why = Term::atom(if reason == "budget_exhausted" { self.v.budget_reason } else { self.v.space_reason });
        self.hole_met(self.hole_id, why.as_atom().unwrap());
        if self.eval_hole(&[self.hole_id, why]) {
            self.charge_row(None, false)?;
        }
        Ok(())
    }

    /// A RULE WHOSE AGGREGATE safety.rofl REFUSED IS A PROGRAM REJECTED, not a
    /// rule skipped: a skipped count reads as an empty one.
    fn refuse_aggregates(&self) -> Result<(), Halt> {
        if let Some((rid, why)) = self.answer.agg_refused.first() {
            let rel = if self.h.name(*why) == "reads_live_kernel" {
                self.rule_of(*rid).and_then(|r| {
                    r.clause.body.iter().filter(|b| matches!(b, BodyElem::Agg(_))).flat_map(|b| b.lits_deep()).find_map(|l| {
                        let n = self.h.name(l.rel);
                        matches!(n, "derived_by" | "hole" | "agg_cell" | "agg_member" | "agg_member_prem" | "agg_sealed").then(|| n.to_string())
                    })
                })
            } else {
                None
            };
            return Err(Halt::Strat(
                format!(
                    "program rejected: rule {}: {}",
                    self.h.name(*rid),
                    agg_refusal_text(self.h.name(*why), rel.as_deref())
                ),
                String::new(),
            ));
        }
        for r in &self.rules {
            if (r.has_agg || r.has_thr) && self.answer.demand_rels.contains(&r.clause.head.rel) {
                return Err(Halt::Strat(
                    format!("program rejected: rule {}: {}", self.h.name(r.id), agg_refusal_text("demand_head", None)),
                    String::new(),
                ));
            }
        }
        Ok(())
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

    /// Whether a relation of the program is answered on demand, a fact made for each call.
    pub fn answers_on_demand(&self) -> bool {
        !self.demand_rels.is_empty()
    }

    /// The staged facts, each with the rule and the premises of the firing that staged it, one a line.
    pub fn staged_text(&self) -> String {
        let mut out = String::new();
        for (k, f) in self.staged_sorted() {
            let mut prems: Vec<String> = f.prems.iter().map(|p| self.store.prem_text(&self.h, *p)).collect();
            prems.sort_by(|a, b| cmp_js(a, b));
            out.push_str(&format!("{k} <- {} [{}]\n", self.h.name(f.rule), prems.join("; ")));
        }
        out
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

    fn clear_derived(&mut self) {
        let (h, v) = (&self.h, &self.v);
        self.store.clear_derived(Some(&|r: &FactRec, a: &[Term]| provenance_row(h, v, r, a)));
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
    ///
    /// A THIRD GATE, PER ROW: a `derived_by` row of a fact read in a past tick
    /// by something that crosses this boundary is kept whatever its age —
    /// a member of a cell a surviving firing cites, sealed at T, or a premise
    /// of a carried lattice value, staged at T (`cited_past`). `why` names a
    /// past premise by those rows (`render_past`), so pruning one would leave
    /// a live cell citing a fact nothing says anything about.
    fn frozen_retention(&mut self, staged: &[(String, StagedFact)]) -> Option<Retention> {
        let n = self.retain_ticks?;
        if self.answer.reads_provenance {
            return None;
        }
        let oldest = self.store.tick as i64 + 1 - n as i64;
        let db = self.v.derived_by;
        let cited = brk!("retain_prunes_cited" => HashSet::new(); self.cited_past(staged));
        Some(Box::new(move |rec: &FactRec, args: &[Term]| {
            if rec.rel != db {
                return true;
            }
            match args.get(2).and_then(|t| t.as_int()) {
                Some(t) => t >= oldest || cited.contains(&(args[0], t)),
                None => true,
            }
        }))
    }

    /// The facts, each with the tick it was read in, that something crossing
    /// the boundary being made cites from a past tick: every firing that
    /// survives it (a staged fact's own, a record that is not tick-scoped;
    /// a fact staged again keeps none of its old ones) is read for the cells
    /// it cites, each cell once, and, on a carried lattice value, for the
    /// facts it read.
    fn cited_past(&mut self, staged: &[(String, StagedFact)]) -> HashSet<(Term, i64)> {
        let now = self.store.tick;
        let mut firings: Vec<(Sym, Sym, u32, Vec<PremRef>)> = staged.iter().map(|(_, f)| (f.rel, f.rule, now + 1, f.prems.clone())).collect();
        let owners: Vec<FactId> = self.store.all_facts().into_iter().filter(|&id| self.store.alive(id) && !self.store.rec(id).tick_scope()).collect();
        for id in owners {
            let rel = self.store.rec(id).rel;
            firings.extend(self.store.firings(id).into_iter().map(|(r, t, p)| (rel, r, t, p)));
        }
        let mut read: HashSet<(FactId, u32)> = HashSet::new();
        let mut walked: HashSet<CellId> = HashSet::new();
        self.past_walks = 0;
        for (rel, rule, t, prems) in firings {
            let staged = self.staged_firing(rel, rule, t, &prems);
            for p in prems {
                match p {
                    PremRef::Cell(c) if walked.insert(c) => {
                        let tick = self.store.cell(c).tick;
                        for m in self.store.cell_members(c) {
                            self.past_walks += 1;
                            for q in self.store.member_derivs(m).take(brk!("cited_past_canonical_only" => 1; usize::MAX)).flatten() {
                                if let PremRef::Fact(f) = q {
                                    read.insert((*f, tick));
                                }
                            }
                        }
                    }
                    PremRef::Fact(f) if staged => {
                        read.insert((f, t.saturating_sub(1)));
                    }
                    _ => {}
                }
            }
        }
        let mut out = HashSet::new();
        for (f, t) in read {
            let r = self.store.rec(f);
            let args = self.store.args(f).to_vec();
            out.insert((fact_term(&mut self.h, &self.v, r.rel, r.persp, &args), t as i64));
        }
        out
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

    /// Does the next tick carry exactly the unknowns this one was carried?
    fn quiescent_unknown(&mut self, next: &[(Unknown, bool)]) -> bool {
        let now: HashSet<(Unknown, bool)> = self.carried_unknowns(self.store.tick).into_iter().collect();
        now.len() == next.len() && next.iter().all(|x| now.contains(x))
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
        // a tuple staged for certain is no unknown of the next tick, whatever else reached it
        let certain: HashSet<(Sym, Sym, &[Term])> = staged.iter().map(|(_, f)| (f.rel, f.persp, &f.args[..])).collect();
        let mut unknown: Vec<(Unknown, bool)> = self
            .staged_unknown
            .iter()
            .filter(|(u, _)| !matches!(u, Unknown::Tuple(rel, p, args) if certain.contains(&(*rel, *p, &args[..]))))
            .map(|(u, p)| (u.clone(), *p))
            .collect();
        if self.quiescent(&staged) && self.quiescent_unknown(&unknown) {
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
        let keep = self.frozen_retention(&staged);
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
        unknown.sort_by_cached_key(|(u, _)| self.unknown_text(u));
        for (u, plain) in &unknown {
            let row = self.next_hole(u, *plain, t);
            self.store.add(&self.h, self.v.hole, self.v.kernel_persp, &row, F_BASE | F_FROZEN);
        }
        self.staged_unknown.clear();
        // A FACT STAGED AGAIN holds at T+1 for what staged it at T, and for
        // nothing it was staged by before: its firings are the new tick's.
        // A plain program keeps the reference's (src/store.ts advanceTick).
        let restage = brk!("restaged_keeps_old_firing" => false; true);
        for (_, f) in &staged {
            let id = self.store.get(f.rel, f.persp, &f.args).unwrap();
            if restage {
                self.store.drop_firings(id);
            }
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
        self.staged_alts.clear();
        // The ended tick's cells that no firing carried across are gone with
        // its layer, as `clear_derived` drops them within a tick.
        self.store.gc_cells();
        Ok(TickOutcome {
            advanced: true,
            quiescent: false,
            partial: false,
        })
    }

    /// `checkUnstratified` (src/engine.ts): under the stock evaluator a program
    /// whose table a rule pack says cannot be ordered is refused, not run.
    fn check_unstratified(&mut self) -> Result<(), Halt> {
        let mut keys: Vec<String> = self
            .store
            .rel_all(&self.h, self.v.unstratified)
            .into_iter()
            .map(|f| self.store.key(&self.h, f))
            .collect();
        if keys.is_empty() {
            return Ok(());
        }
        keys.sort_by(|a, b| cmp_js(a, b));
        Err(Halt::Strat(format!("program rejected: {}", keys.join(", ")), String::new()))
    }

    /// THE STOCK EVALUATOR SEALS AN AGGREGATE ONLY WHERE ITS TABLE SAYS WHEN.
    /// A head the table does not rank runs in the final pass with every other
    /// unranked rule, so the cell would be sealed over whatever that pass had
    /// derived so far and never again. So an aggregate's head must be ranked,
    /// and every derived relation it reads ranked strictly below it; without
    /// rules/strata.rofl (or a table of the program's own) that is a refusal,
    /// never a count of a relation still being derived.
    fn check_agg_strata(&self, strat: &HashMap<Sym, i64>, strat_rules: &[Rc<ERule>]) -> Result<(), Halt> {
        for r in strat_rules.iter().filter(|r| r.has_agg) {
            let head = r.clause.head.rel;
            let at = if r.clause.head.temporal == Temporal::Next { None } else { strat.get(&head).copied() };
            for b in r.clause.body.iter().filter(|b| matches!(b, BodyElem::Agg(_))) {
                for l in b.lits_deep() {
                    if !self.derived_rels.contains(&l.rel) {
                        continue;
                    }
                    let ok = match (at, strat.get(&l.rel)) {
                        (Some(h), Some(i)) => *i < h,
                        (None, Some(_)) => r.clause.head.temporal == Temporal::Next,
                        _ => false,
                    };
                    if !ok {
                        let rank = |x: Option<i64>| x.map_or("no stratum row".to_string(), |n| format!("stratum {n}"));
                        return Err(Halt::Strat(
                            format!(
                                "program rejected: rule {}: the stock evaluator cannot seal its aggregate: it reads {} ({}) for {} ({}); \
                                 an aggregate's relation must be ranked strictly below its head (load rules/strata.rofl, or run the default evaluator)",
                                self.h.name(r.id),
                                self.h.name(l.rel),
                                rank(strat.get(&l.rel).copied()),
                                self.h.name(head),
                                rank(at)
                            ),
                            String::new(),
                        ));
                    }
                }
            }
        }
        Ok(())
    }

    /// THE FINAL PASS HAS NO ORDER. Every rule the table does not rank fires
    /// there, once, in canonical order, so a negation of a relation another of
    /// them derives (or a plain rule derives from what they do) reads whatever
    /// the pass had reached. An unranked aggregate is already refused by
    /// `check_agg_strata`. Relations complete before the pass stay negatable.
    fn check_unranked_negation(&self, strat: &HashMap<Sym, i64>, strat_rules: &[Rc<ERule>], mono: &[Rc<ERule>]) -> Result<(), Halt> {
        let last: Vec<&Rc<ERule>> = strat_rules
            .iter()
            .filter(|r| r.clause.head.temporal == Temporal::Next || !strat.contains_key(&r.clause.head.rel))
            .collect();
        let mut derived: HashSet<Sym> = last.iter().filter(|r| r.clause.head.temporal != Temporal::Next).map(|r| r.clause.head.rel).collect();
        let mut grew = true;
        while grew {
            grew = false;
            for r in mono {
                if r.clause.head.temporal == Temporal::Next || derived.contains(&r.clause.head.rel) {
                    continue;
                }
                if r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| derived.contains(&l.rel)) {
                    derived.insert(r.clause.head.rel);
                    grew = true;
                }
            }
        }
        fn negated(b: &BodyElem, out: &mut Vec<Sym>) {
            match b {
                BodyElem::Neg(l) => out.push(l.rel),
                BodyElem::Agg(a) => a.body.iter().for_each(|x| negated(x, out)),
                _ => {}
            }
        }
        let mut clashes: Vec<String> = Vec::new();
        for r in last.iter().filter(|r| r.has_neg) {
            let mut ns = Vec::new();
            r.clause.body.iter().for_each(|b| negated(b, &mut ns));
            for n in ns.into_iter().filter(|n| derived.contains(n)) {
                clashes.push(format!("{} negates {}", self.h.name(r.clause.head.rel), self.h.name(n)));
            }
        }
        clashes.sort_by(|a, b| cmp_js(a, b));
        match clashes.first() {
            None => Ok(()),
            Some(c) => Err(Halt::Strat(
                format!("program rejected: {c}, and neither is ranked by stratum/2; rank them (load rules/strata.rofl, or run the default evaluator)"),
                String::new(),
            )),
        }
    }

    /// WHAT READS `unknown` SITS ABOVE EVERYTHING ELSE under the stock
    /// evaluator too (`peel_rounds`): the table ranks it among the rest, so
    /// its relations are lifted, in their order, above every other.
    fn rank_unknown_cone(&self, strat: &mut HashMap<Sym, i64>) {
        if self.unknown_cone.is_empty() || brk!("shrug_unknown_unranked" => true; false) {
            return;
        }
        let mut top = strat.iter().filter(|(r, _)| !self.unknown_cone.contains(r)).map(|(_, n)| *n).max().unwrap_or(0) + 1;
        // a relation a rule concludes that the table does not rank runs in the
        // final pass; below the cone, it is given the level above the rest
        let unranked: Vec<Sym> = self
            .rules
            .iter()
            .filter(|r| r.clause.head.temporal != Temporal::Next)
            .map(|r| r.clause.head.rel)
            .filter(|r| !self.unknown_cone.contains(r) && !strat.contains_key(r))
            .collect();
        if !unranked.is_empty() {
            for r in unranked {
                strat.insert(r, top);
            }
            top += 1;
        }
        for r in &self.unknown_cone {
            let n = strat.get(r).copied().unwrap_or(0);
            strat.insert(*r, n + top);
        }
        strat.insert(self.v.unknown, top);
        strat.insert(self.v.shrug, top);
    }

    /// A COUNTING TAG'S DERIVATIONS under the stock evaluator: the table
    /// (rules/strata.rofl) ranks the tag above what its rules read, and the
    /// relation `p@count` those rules conclude, which no table names, goes
    /// between: every rank doubled, and `p@count` one below its tag's.
    fn rank_counting(&self, strat: &mut HashMap<Sym, i64>) {
        if self.tags.count_rel.is_empty() || brk!("count_unranked" => true; false) {
            return;
        }
        for n in strat.values_mut() {
            *n *= 2;
        }
        for (p, c) in &self.tags.count_rel {
            if let Some(n) = strat.get(p).copied() {
                strat.insert(*c, n - 1);
            }
        }
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
        if self.no_witness && self.lattices.is_empty() && rules.len() > 1 {
            for component in components(rules) {
                self.activate_batch(&component)?;
            }
            return Ok(());
        }
        self.activate_batch(rules)
    }

    fn activate_batch(&mut self, rules: &[Rc<ERule>]) -> Result<(), Halt> {
        let mut sorted: Vec<Rc<ERule>> = rules.to_vec();
        sorted.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        self.active.extend(sorted.iter().cloned());
        self.active.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        self.fire_all(sorted)
    }

    /// `rules` fired once, whole, in canonical order, and the news propagated.
    fn fire_all(&mut self, mut sorted: Vec<Rc<ERule>>) -> Result<(), Halt> {
        sorted.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        let mut front = Front::default();
        std::mem::swap(&mut self.cur_front, &mut front);
        self.cur_front = Front::default();
        let batch: Rc<[Rc<ERule>]> = Rc::from(sorted);
        let outer = (std::mem::replace(&mut self.batch, batch.clone()), self.batch_at);
        let (mut sum, mut mx) = (0u64, 0u64);
        for (i, r) in batch.iter().enumerate() {
            self.batch_at = i;
            let t = std::time::Instant::now();
            let f = self.fire_rule(r, None)?;
            merge_front(&mut self.cur_front, f);
            let d = t.elapsed().as_nanos() as u64;
            *self.ns_by_rule.entry(r.id).or_insert(0) += d;
            sum += d;
            mx = mx.max(d);
        }
        self.rounds.push((sum, mx));
        (self.batch, self.batch_at) = outer;
        let front = std::mem::take(&mut self.cur_front);
        self.propagate(front)?;
        self.lattice_settle(false)?;
        // what the settle wrote (a withdrawn cell's hole) is news too
        let more = std::mem::take(&mut self.cur_front);
        if !more.keys.is_empty() {
            self.propagate(more)?;
            self.lattice_settle(false)?;
        }
        Ok(())
    }

    fn propagate(&mut self, mut front: Front) -> Result<(), Halt> {
        let outer = std::mem::take(&mut self.live_front);
        loop {
            // A lattice fact improved on since it entered the front is not
            // news any more; its successor is.
            if !self.lattices.is_empty() {
                front.keys.retain(|f| self.store.alive(*f));
                for ids in front.by_rel.values_mut() {
                    ids.retain(|f| self.store.alive(*f));
                }
                front.by_rel.retain(|_, ids| !ids.is_empty());
            }
            if front.keys.is_empty() {
                break;
            }
            let cur = front;
            self.live_front = cur.by_rel.keys().copied().collect();
            self.cur_front = Front::default();
            self.thr_round += 1;
            self.thr_fresh.clear();
            let active = self.active.clone();
            let (mut sum, mut mx) = (0u64, 0u64);
            for r in &active {
                let t = std::time::Instant::now();
                let done = self.fire_in_round(r, &cur);
                let d = t.elapsed().as_nanos() as u64;
                *self.ns_by_rule.entry(r.id).or_insert(0) += d;
                sum += d;
                mx = mx.max(d);
                done?;
            }
            self.rounds.push((sum, mx));
            front = std::mem::take(&mut self.cur_front);
        }
        self.live_front = outer;
        Ok(())
    }

    fn fire_in_round(&mut self, r: &Rc<ERule>, cur: &Front) -> Result<(), Halt> {
        {
            {
                if self.naive {
                    let f = self.fire_rule(r, None)?;
                    merge_front(&mut self.cur_front, f);
                    return Ok(());
                }
                if !r
                    .trigger_rels
                    .iter()
                    .any(|rel| cur.by_rel.contains_key(rel))
                {
                    return Ok(());
                }
                if r.has_demand_prem {
                    let f = self.fire_rule(r, None)?;
                    merge_front(&mut self.cur_front, f);
                    return Ok(());
                }
                for (i, b) in r.plan.iter().enumerate() {
                    let BodyElem::Pos(l) = b else { continue };
                    let Some(keys) = cur.by_rel.get(&l.rel) else {
                        continue;
                    };
                    if let Some(p) = self.delta_pick(r, Some(i), keys.len()) {
                        let f = self.fire_planned(r, &p, Some(keys))?;
                        merge_front(&mut self.cur_front, f);
                        continue;
                    }
                    let f = self.fire_rule(r, Some((i, keys)))?;
                    merge_front(&mut self.cur_front, f);
                }
                // NEWS READ INSIDE A THRESHOLD: the rule fires again, and its
                // thresholds solve only the groups the news reaches.
                if brk!("thr_no_refire" => false; r.thr_rels.iter().any(|rel| cur.by_rel.contains_key(rel))) {
                    let focus = self.thr_focus_of(r, &cur)?;
                    self.thr_focus = Some(Rc::new(focus));
                    let f = self.fire_rule(r, None);
                    self.thr_focus = None;
                    merge_front(&mut self.cur_front, f?);
                }
            }
        }
        Ok(())
    }

    fn fire_rule(
        &mut self,
        r: &Rc<ERule>,
        front_at: Option<(usize, &FxSet<FactId>)>,
    ) -> Result<Front, Halt> {
        if self.lattices.is_empty() {
            if let Some(&(ci, is_base)) = self.closure_of.get(&r.id) {
                return if is_base { self.fire_closure(ci) } else { Ok(Front::default()) };
            }
        }
        if front_at.is_none() {
            if let Some(p) = self.delta_pick(r, None, 1) {
                return self.fire_planned(r, &p, None);
            }
        }
        self.fire_rule_from(r, Subst::new(), front_at)
    }

    /// `r` fired over the instances that extend `s0`.
    fn fire_rule_from(
        &mut self,
        r: &Rc<ERule>,
        s0: Subst,
        front_at: Option<(usize, &FxSet<FactId>)>,
    ) -> Result<Front, Halt> {
        *self.fires_by_rule.entry(r.id).or_insert(0) += 1;
        let outer = self.cur_rule.replace(r.id);
        let was_firing = std::mem::replace(&mut self.firing, true);
        let sols = self.solve_body(&r.plan, s0, 0, front_at, Some(r.id));
        self.firing = was_firing;
        self.cur_rule = outer;
        let sols = sols?;
        *self.sols_by_rule.entry(r.id).or_insert(0) += sols.len() as u64;
        let mut out = Front::default();
        for sol in sols {
            // A SOLUTION CITING A VALUE IMPROVED ON earlier in this batch is
            // not concluded: the value that replaced it is in Δ and the rule,
            // monotone in it, fires again on it. The values never change for
            // it; the history does — a firing on a value that no longer stood
            // when it fired is no way the cell was reached (agg_lattice_witness,
            // docs/aggregates.md, "The order lattice, as built").
            if !self.lattices.is_empty()
                && brk!("lattice_stale_solution" => false; sol.prems.iter().any(|p| matches!(p, PremRef::Fact(f) if !self.store.alive(*f))))
            {
                continue;
            }
            self.conclude(r, sol, &mut out)?;
        }
        Ok(out)
    }

    /// Every path through E, as rows of R: a breadth-first walk from each node
    /// over the edges as they stand. Rows already there are not news.
    fn fire_closure(&mut self, ci: usize) -> Result<Front, Halt> {
        let c = self.closures[ci].clone();
        let mut index: HashMap<Term, u32> = HashMap::new();
        let mut nodes: Vec<Term> = Vec::new();
        let mut edges: Vec<(u32, u32, FactId)> = Vec::new();
        for id in self.store.rel_persp(&self.h, c.edge, c.edge_persp) {
            let a = self.store.args(id);
            if a.len() != 2 {
                continue;
            }
            let (x, y) = if c.edge_fwd { (a[0], a[1]) } else { (a[1], a[0]) };
            let mut dense = |t: Term| *index.entry(t).or_insert_with(|| { nodes.push(t); nodes.len() as u32 - 1 });
            let e = (dense(x), dense(y), id);
            edges.push(e);
        }
        let n = nodes.len();
        // the edges by start, and by end: (other node, edge fact)
        fn csr(n: usize, edges: &[(u32, u32, FactId)], rev: bool) -> (Vec<u32>, Vec<(u32, FactId)>) {
            let key = |e: &(u32, u32, FactId)| if rev { e.1 } else { e.0 };
            let mut start = vec![0u32; n + 1];
            for e in edges {
                start[key(e) as usize + 1] += 1;
            }
            for i in 0..n {
                start[i + 1] += start[i];
            }
            let mut adj = vec![(0u32, 0 as FactId); edges.len()];
            let mut fill = start.clone();
            for e in edges {
                let k = key(e) as usize;
                adj[fill[k] as usize] = (if rev { e.0 } else { e.1 }, e.2);
                fill[k] += 1;
            }
            (start, adj)
        }
        let keep = !self.no_witness;
        let (start, adj) = csr(n, &edges, false);
        let (pstart, pred) = if keep { csr(n, &edges, true) } else { (Vec::new(), Vec::new()) };
        let span = |st: &[u32], v: u32| st[v as usize] as usize..st[v as usize + 1] as usize;
        let mut mark = vec![u32::MAX; n];
        let mut queue: Vec<u32> = Vec::new();
        let mut rows: Vec<(u32, u32)> = Vec::new();
        let mut out = Front::default();
        for s in 0..n as u32 {
            queue.clear();
            queue.extend(adj[span(&start, s)].iter().map(|&(v, _)| v));
            let mut i = 0;
            while i < queue.len() {
                let v = queue[i];
                i += 1;
                if mark[v as usize] == s {
                    continue;
                }
                mark[v as usize] = s;
                queue.extend(adj[span(&start, v)].iter().map(|&(w, _)| w));
                rows.push((s, v));
                let args = [nodes[s as usize], nodes[v as usize]];
                let (id, new) = self.store.put(&self.h, c.rel, c.persp, &args, F_TICK);
                if new {
                    out.note(c.rel, id);
                    self.closure_rows += 1;
                    if !keep {
                        self.bump_steps()?;
                        self.charge_row(Some(c.step), true)?;
                    }
                }
            }
        }
        if keep {
            // the firings the two rules would have made, over the closure now
            // complete: the base rule on the edge; the step rule on every
            // predecessor u of the end with R(start, u), or, right-linear, on
            // every successor u of the start with R(u, end)
            let tick = self.store.tick;
            for &(s, v) in &rows {
                let args = [nodes[s as usize], nodes[v as usize]];
                let id = self.store.get(c.rel, c.persp, &args).unwrap();
                let mut firings: Vec<(Sym, Vec<PremRef>)> = Vec::new();
                for &(x, eid) in &adj[span(&start, s)] {
                    if x == v {
                        firings.push((c.base, vec![PremRef::Fact(eid)]));
                    }
                }
                let through: Vec<(u32, FactId, [Term; 2])> = if c.right {
                    adj[span(&start, s)].iter().map(|&(u, eid)| (u, eid, [nodes[u as usize], nodes[v as usize]])).collect()
                } else {
                    pred[span(&pstart, v)].iter().map(|&(u, eid)| (u, eid, [nodes[s as usize], nodes[u as usize]])).collect()
                };
                for (_, eid, rargs) in through {
                    if let Some(rid) = self.store.get(c.rel, c.persp, &rargs) {
                        let (r, e) = (PremRef::Fact(rid), PremRef::Fact(eid));
                        firings.push((c.step, if c.r_first { vec![r, e] } else { vec![e, r] }));
                    }
                }
                for (rule, prems) in firings {
                    if self.store.support(id, Witness { rule, tick, prems }) {
                        self.bump_steps()?;
                        self.charge_row(Some(rule), true)?;
                        let ft = fact_term(&mut self.h, &self.v, c.rel, c.persp, &args);
                        let db_args = [ft, Term::atom(rule), Term::int(tick as i64)];
                        let (dbid, dbnew) = self.store.put(&self.h, self.v.derived_by, self.v.kernel_persp, &db_args, 0);
                        if dbnew {
                            out.note(self.v.derived_by, dbid);
                        }
                    }
                }
            }
        }
        self.closure_runs += 1;
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
            let rel = self.carried.iter().find(|(_, l)| **l == head.rel).map_or(head.rel, |(c, _)| *c);
            let rel = brk!("carry_into_lattice" => head.rel; rel);
            let k = self.fkey(rel, persp, &args);
            let staged_key = k.clone();
            match self.staged.entry(k) {
                std::collections::hash_map::Entry::Vacant(slot) => {
                    slot.insert(StagedFact {
                        rel,
                        persp,
                        args,
                        rule: r.id,
                        prems: sol.prems.clone(),
                    });
                    self.bump_steps()?;
                    self.charge_row(Some(r.id), true)?;
                }
                std::collections::hash_map::Entry::Occupied(slot) => {
                    if let Some(many) = self.staged_watch.as_mut() {
                        *many |= brk!("restage_first_wins" => false; slot.get().rule != r.id || slot.get().prems != sol.prems);
                    }
                    // a lattice can withdraw what a firing read; another may stand
                    if !self.lattices.is_empty() {
                        let alts = self.staged_alts.entry(slot.key().clone()).or_default();
                        if !alts.iter().any(|(ar, ap)| *ar == r.id && *ap == sol.prems) && !(slot.get().rule == r.id && slot.get().prems == sol.prems) {
                            alts.push((r.id, sol.prems.clone()));
                            self.bump_steps()?;
                        }
                    }
                }
            }
            // in the engine's own order the first firing to stage is the
            // order's; the staged firing is then the least signature instead
            if self.store.unordered {
                let tick = self.store.tick;
                let (cur_rule, cur_prems) = {
                    let st = &self.staged[&staged_key];
                    (st.rule, st.prems.clone())
                };
                if cur_rule != r.id || cur_prems != sol.prems {
                    let (mut a, mut b) = (String::new(), String::new());
                    self.store.write_sig(&self.h, &WitView { rule: cur_rule, tick, prems: &cur_prems }, &mut a);
                    self.store.write_sig(&self.h, &WitView { rule: r.id, tick, prems: &sol.prems }, &mut b);
                    if cmp_js(&b, &a) == std::cmp::Ordering::Less {
                        let st = self.staged.get_mut(&staged_key).unwrap();
                        st.rule = r.id;
                        st.prems = sol.prems.clone();
                    }
                }
            }
            return Ok(());
        }
        if let Some((n, op)) = self.lattices.get(&head.rel).copied().filter(|(n, op)| op.is_join() && args.len() == *n) {
            let _ = n;
            return self.conclude_join(r.id, head.rel, persp, args, op, sol.prems, out);
        }
        let cell = match self.lattices.get(&head.rel).copied() {
            Some((n, AggOp::Dominance)) if args.len() == n => match {
                let k = self.subs[&head.rel].keylen;
                let given = self.sub_prems.entry(((head.rel, persp, args[..k].into()), args[k..].into())).or_default();
                if !given.contains(&sol.prems) {
                    given.push(sol.prems.clone());
                }
                self.sub_admit(head.rel, persp, &args, r.id)?
            } {
                Some(ck) => Some(ck),
                None => return Ok(()),
            },
            Some((n, op)) if args.len() == n => match self.lattice_admit(head.rel, persp, &args, op, &sol.prems)? {
                Some(ck) => Some(ck),
                None => return Ok(()),
            },
            _ => None,
        };
        let (id, is_new) = self.store.put(&self.h, head.rel, persp, &args, F_TICK);
        if is_new {
            *self.new_by_rule.entry(r.id).or_insert(0) += 1;
        }
        if let Some(ck) = cell {
            if self.subs.contains_key(&head.rel) {
                let front = self.sub_cur.entry(ck).or_default();
                if !front.contains(&id) {
                    front.push(id);
                }
            } else {
                self.lat_cur.insert(ck, id);
            }
        }
        let tick = self.store.tick;
        let new_firing = if self.no_witness && self.lattices.is_empty() {
            is_new
        } else {
            self.store.support(
                id,
                Witness {
                    rule: r.id,
                    tick,
                    prems: sol.prems.clone(),
                },
            )
        };
        if new_firing {
            if self.ds_check {
                return Err(Halt::Bug(format!(
                    "the layers of a component stratified by its data missed an instance of rule {}: it concludes {} again, new",
                    self.h.name(r.id),
                    self.h.name(head.rel)
                )));
            }
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
        } else if self.ds_charge {
            self.bump_steps()?;
        }
        if is_new {
            out.note(head.rel, id);
        }
        Ok(())
    }

    fn bump_steps(&mut self) -> Result<(), Halt> {
        self.steps += 1;
        if self.steps > self.budget {
            self.wall_spent.set(Some(("steps", self.steps, self.budget)));
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
            self.wall_spent.set(Some(("rows", self.rows, self.space)));
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
        front_at: Option<(usize, &FxSet<FactId>)>,
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
                        if brk!("delta_first_overrun_holes" => false; self.plan_trial) {
                            return Err(Halt::Overrun);
                        }
                        self.wall_spent.set(Some(("rows", now, self.space)));
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
                            let faults = self.fault_count;
                            let found = self.match_premise(l, &a.s, depth, only)?;
                            if self.fault_count > faults {
                                self.demand_fault(depth, &a.s);
                            }
                            for (s2, r) in found {
                                let mut prems = a.prems.clone();
                                prems.push(r);
                                next.push(Sol { s: s2, prems });
                            }
                        }
                        BodyElem::Neg(l) => {
                            let faults = self.fault_count;
                            let holds = self.neg_holds(l, &a.s, depth)?;
                            if self.fault_count > faults && depth > 0 && self.firing {
                                // below a call: the solution is not known, nor the head it would give
                                self.demand_fault(depth, &a.s);
                                continue;
                            }
                            if holds && self.strict_neg && !self.lat_spread.is_empty() && self.read_unknown(l, &a.s, true).is_some() {
                                continue;
                            }
                            if holds {
                                // nothing matched; but what a fault below the negation's own
                                // call left out could have, or what a hole left unknown
                                if depth == 0 && self.firing && rule_id.is_some() && self.fault_count > faults && brk!("plain_neg_decides" => false; true) {
                                    let u = self.lit_unknown(l, &a.s);
                                    self.fault_edge(&u);
                                    self.lat_plain.insert(u.clone());
                                    self.lat_undecided.push((rule_id.unwrap(), i, a.s.clone(), Rc::from([u])));
                                    continue;
                                }
                                let read = self.undecided_read(depth, rule_id, |e| brk!("lattice_neg_decides" => None; e.read_unknown(l, &a.s, brk!("plain_neg_decides" => false; true))));
                                self.carry_check(0)?;
                                if let Some(Some(u)) = read {
                                    self.lat_undecided.push((rule_id.unwrap(), i, a.s.clone(), Rc::from([u])));
                                    continue;
                                }
                                let mut prems = a.prems.clone();
                                prems.push(PremRef::Neg(0));
                                next.push(Sol {
                                    s: a.s.clone(),
                                    prems,
                                });
                            }
                        }
                        BodyElem::Bi { op, l, r } => {
                            let faults = self.fault_count;
                            let s2s = self.eval_builtins(*op, *l, *r, &a.s, rule_id)?;
                            let failed = s2s.is_empty();
                            for s2 in s2s {
                                let mut prems = a.prems.clone();
                                prems.push(PremRef::Bi(0));
                                next.push(Sol { s: s2, prems });
                            }
                            if failed && self.fault_count > faults && self.firing {
                                if !self.lattices.is_empty() {
                                    self.lattice_fault(rule_id, &a.s, &a.prems)?;
                                }
                                if depth == 0 {
                                    brk!("plain_rule_hole_unspread" => (); self.plain_fault(rule_id, &a.s));
                                }
                                self.demand_fault(depth, &a.s);
                            }
                        }
                        BodyElem::Agg(ag) => {
                            let rid = rule_id.ok_or_else(|| Halt::Bug("an aggregate solved outside a rule".into()))?;
                            let sols = if ag.op == AggOp::AtLeast {
                                if depth == 0 && self.firing && !self.lat_spread.is_empty() && brk!("shrug_thr_neg_decides" => false; true) {
                                    for (sg, u) in self.thr_uncertain(rid, ag, &a.s)? {
                                        self.lat_undecided.push((rid, i, sg, Rc::from([u])));
                                    }
                                    self.strict_neg = true;
                                    let r = self.thr_premise(rid, ag, &a.s, depth);
                                    self.strict_neg = false;
                                    r?
                                } else {
                                    self.thr_premise(rid, ag, &a.s, depth)?
                                }
                            } else {
                                // what the aggregate leaves undecided is decided once per
                                // correlation, at the firing that first reads it
                                // (`ReachMemo`), and read by every firing after
                                let (_, corr) = self.agg_corr(rid, ag, &a.s)?;
                                let mk = (rid, ag.at, corr.into_boxed_slice());
                                // a correlation of a component stratified by data is read
                                // once the layer before it has sealed (`datastrat.rs`)
                                if !self.ds_elems.is_empty() && self.ds_elems.contains(&(rid, ag.at)) && !self.ds_gate(&mk)? {
                                    continue;
                                }
                                let reads = self.undecided_read(depth, rule_id, |_| ()).is_some();
                                let memo = if reads { brk!("agg_reach_unmemo" => None; self.reach_memo.get(&mk).cloned()) } else { None };
                                let ps: Vec<Possible> = match &memo {
                                    None if reads => brk!("lattice_agg_decides" => Vec::new(); self.agg_possibles(rid, ag, &a.s)?),
                                    _ => Vec::new(),
                                };
                                let sealing = !self.agg_memo.contains_key(&mk);
                                if sealing {
                                    self.agg_reach = memo.as_ref().map_or_else(|| ps.clone(), |m| m.ps.to_vec());
                                }
                                let sols = self.agg_premise(rid, ag, &a.s, depth, true);
                                self.agg_reach.clear();
                                let sols = sols?;
                                if reads {
                                    let m = match memo {
                                        Some(m) => brk!("agg_reach_first_only" => None; Some(m)),
                                        None => {
                                            let m = Rc::new(self.reach_memo_of(rid, ag, &a.s, &mk, ps, sealing)?);
                                            self.reach_memo.insert(mk, m.clone());
                                            Some(m)
                                        }
                                    };
                                    if let Some(m) = m {
                                        self.agg_reach_undecided(rid, ag, &a.s, i, &m);
                                    }
                                }
                                if depth == 0 && self.firing {
                                    brk!("plain_cell_hole_unspread" => (); self.plain_agg_holes(rid, ag, &a.s, i)?);
                                }
                                sols
                            };
                            for (s2, pr) in sols {
                                let mut prems = a.prems.clone();
                                prems.push(pr);
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
            // One premise for the element, the cell it read: the invariant
            // that `prems[i]` describes `body[i]` holds.
            BodyElem::Agg(_) => r,
        }
    }

    // ------------------------------------------------------------ aggregates

    /// THE AGGREGATE ELEMENT: every cell the aggregate yields under `s`, each
    /// as a solution binding its group variables and its result, with the
    /// cell as the one premise the element records.
    ///
    /// A cell is sealed once per correlation and evaluation (`agg_memo`):
    /// what it reads is closed in a lower round, so a second firing of the
    /// rule reads the cell it already sealed. `keep = false` is whynot's: an
    /// ephemeral cell, neither stored nor remembered, so asking a question
    /// never changes the world.
    ///
    /// A BUDGET CUT NEVER SEALS A PARTIAL GROUP. The inner solve and the member
    /// charges are where a wall can fall, and both come before anything is
    /// stored: the `Halt` leaves with the cell unwritten, so an empty group
    /// cut short reads no 0.
    fn agg_premise(
        &mut self,
        rid: Sym,
        a: &Agg,
        s: &Subst,
        depth: usize,
        keep: bool,
    ) -> Result<Vec<(Subst, PremRef)>, Halt> {
        let (plan, corr) = self.agg_corr(rid, a, s)?;
        let mk = (rid, a.at, corr.clone().into_boxed_slice());
        let cells: Vec<CellId> = match self.agg_memo.get(&mk) {
            Some(cs) if brk!("memo" => keep && false; keep) => cs.to_vec(),
            _ => match self.seal_cells(rid, a, &plan, s, &corr, depth, keep)? {
                Sealed::Kept(cs) => {
                    self.agg_memo.insert(mk, cs.clone().into());
                    cs
                }
                Sealed::Ephemeral(cells) => {
                    // whynot: the values without a store, one solution each.
                    let mut out = Vec::new();
                    for (key, value, _) in cells {
                        if let Some(s2) = self.bind_cell(a, &plan, s, &key, value) {
                            out.push((s2, PremRef::Bi(0)));
                        }
                    }
                    return Ok(out);
                }
                Sealed::Open(_) => return Ok(Vec::new()),
            },
        };
        let mut out = Vec::new();
        for c in cells {
            let r = self.store.cell(c);
            let (key, value) = (r.key.clone(), r.value);
            if let Some(s2) = self.bind_cell(a, &plan, s, &key, value) {
                out.push((s2, PremRef::Cell(c)));
            }
        }
        Ok(out)
    }

    /// The aggregate's plan and its correlation under `s`: the values of the
    /// shared variables bound before it.
    fn agg_corr(&mut self, rid: Sym, a: &Agg, s: &Subst) -> Result<(Rc<AggPlan>, Vec<Term>), Halt> {
        let plan = self
            .agg_plans
            .get(&(rid, a.at))
            .cloned()
            .ok_or_else(|| Halt::Bug(format!("no plan for the aggregate at {} of {}", a.at, self.h.name(rid))))?;
        let mut corr: Vec<Term> = Vec::with_capacity(plan.corr.len());
        for i in &plan.corr {
            let t = resolve(&mut self.h, Term::var(a.shared[*i]), s);
            if !self.h.is_ground(t) {
                return Err(Halt::Bug(format!("a correlation variable of {} is not bound", self.h.name(rid))));
            }
            corr.push(t);
        }
        // A GROUP IS A CORRELATION OF ITS OWN in a component stratified by its data: a group variable `s` binds
        // is part of the key, one it does not is `ds_any` (datastrat.rs, `ds_bind`)
        if !plan.group.is_empty() && self.ds_elems.contains(&(rid, a.at)) {
            let any = Term::atom(self.h.intern(ds_any_name()));
            for i in &plan.group {
                let t = resolve(&mut self.h, Term::var(a.shared[*i]), s);
                corr.push(if self.h.is_ground(t) { t } else { any });
            }
        }
        Ok((plan, corr))
    }

    /// `s` with the aggregate's group variables bound to a cell's key, or
    /// none when the key is not the group `s` asks about.
    fn bind_group(&mut self, a: &Agg, plan: &AggPlan, s: &Subst, key: &[Term]) -> Option<Subst> {
        let mut s2 = s.clone();
        for i in &plan.group {
            s2 = unify(&self.h, Term::var(a.shared[*i]), key[*i], &s2)?;
        }
        Some(s2)
    }

    /// A cell's solution: its group variables bound to its key and its result
    /// unified with its value. A cell with no value yields nothing.
    fn bind_cell(&mut self, a: &Agg, plan: &AggPlan, s: &Subst, key: &[Term], value: CellValue) -> Option<Subst> {
        let CellValue::Value(v) = value else { return None };
        let s2 = self.bind_group(a, plan, s, key)?;
        unify(&self.h, a.result, v, &s2)
    }

    /// NO CELL AT ALL for this correlation: a member was left open, or a
    /// builtin in the inner body failed for an error and dropped a member.
    /// Either way the group is not known, so it has no value — never the value
    /// of the members that survived. Stored, it is a hole on the correlation's
    /// cell key; for whynot, the reason.
    fn open_correlation(&mut self, rid: Sym, a: &Agg, corr: &[Term], keep: bool, reason: Sym) -> Sealed {
        if !keep {
            return Sealed::Open(reason);
        }
        let key = self.h.list(corr);
        let tick = Term::int(self.store.tick as i64);
        let marker = brk!("cell_untimed" => self.h.mkf(self.v.s_cell, &[Term::atom(rid), Term::int(a.at as i64), key]);
                          self.h.mkf(self.v.s_cell, &[Term::atom(rid), Term::int(a.at as i64), tick, key]));
        self.cell_hole(marker, reason);
        Sealed::Kept(Vec::new())
    }

    // ------------------------------------------------------------ thresholds
    //
    // docs/aggregates.md, "The threshold, as built". `at_least(N, X : body)`
    // holds for a group once N distinct projection tuples satisfy the body.
    // That is monotone, so it is asked while its input still grows, inside its
    // own recursion too: a cell is made the first time the group reaches N and
    // is not asked again. Its members are provisional until what it reads is
    // closed; then the Quorum is the first N in the canonical order.

    /// THE THRESHOLD ELEMENT: every group of `s` that has reached N, bound,
    /// with its cell as the premise. A cell is one group at one N: the key is
    /// the shared values, then N, so two Ns never share a verdict.
    ///
    /// Fired on news read inside it (`thr_focus`), it solves only the groups
    /// the news reached, grows their members by the news alone (`ThrAcc`),
    /// and yields only cells reached in this round: an older cell was
    /// concluded from when it was reached.
    fn thr_premise(&mut self, rid: Sym, a: &Agg, s: &Subst, depth: usize) -> Result<Vec<(Subst, PremRef)>, Halt> {
        let (plan, corr) = self.agg_corr(rid, a, s)?;
        let Ok((need, n)) = self.thr_need(rid, a, s, &corr, true) else { return Ok(Vec::new()) };
        let focus = self.thr_focus.clone();
        let touched = match focus.as_ref().and_then(|f| f.get(&(rid, a.at))) {
            Some(f) if !f.wild => match f.by_corr.get(&corr) {
                None => return Ok(Vec::new()),
                Some(gs) if gs.iter().all(|g| g.is_some()) => {
                    let mut gs: Vec<Vec<Term>> = gs.iter().flatten().cloned().collect();
                    gs.sort_by(|x, y| cmp_js(&tuple_text(&self.h, x), &tuple_text(&self.h, y)));
                    gs.dedup();
                    Some((f, gs))
                }
                Some(_) => None,
            },
            _ => None,
        };
        let Some((f, gs)) = touched else {
            return self.thr_full(rid, a, &plan, s, &corr, need, n, depth);
        };
        let mut out = Vec::new();
        for gkey in gs {
            let shared = self.thr_shared(a, &plan, &corr, &gkey);
            let Some(sg) = self.bind_group(a, &plan, s, &shared) else { continue };
            let key = thr_cell_key(shared.clone(), n);
            if let Some(c) = self.thr_cells.get(&(rid, a.at, key.clone().into_boxed_slice())).copied() {
                if self.thr_fresh.contains(&c) {
                    out.push((sg, PremRef::Cell(c)));
                }
                continue;
            }
            let ak = (rid, a.at, shared.into_boxed_slice());
            let round = self.thr_round;
            let grown: Vec<Vec<(Vec<Term>, Vec<ThrMember>)>> = match self.thr_acc.get(&ak) {
                Some(acc) if brk!("thr_acc_frozen" => true; acc.round == round) => Vec::new(),
                Some(_) => {
                    let mut gr = Vec::with_capacity(f.news.len());
                    for (k, keys) in &f.news {
                        gr.push(self.thr_groups(rid, a, &plan, &sg, depth, true, Some((*k, keys)))?.0);
                    }
                    gr
                }
                None => {
                    let full = self.thr_groups(rid, a, &plan, &sg, depth, true, None)?.0;
                    self.thr_acc.insert(ak.clone(), ThrAcc { round, members: HashMap::new() });
                    vec![full]
                }
            };
            let acc = self.thr_acc.get_mut(&ak).ok_or_else(|| Halt::Bug("a threshold group lost its members".into()))?;
            acc.round = round;
            for m in grown.into_iter().flatten().flat_map(|g| g.1) {
                acc.members.entry(m.proj.clone()).or_insert(m);
            }
            if acc.members.len() < need {
                continue;
            }
            let mut ms: Vec<ThrMember> = acc.members.values().cloned().collect();
            ms.sort_by(|x, y| cmp_js(&x.text, &y.text));
            let c = self.thr_reach(rid, a, &plan, s, key, need, ms)?;
            out.push((sg, PremRef::Cell(c)));
        }
        Ok(out)
    }

    /// The threshold solved in full under `s`: every group, every member.
    #[allow(clippy::too_many_arguments)]
    fn thr_full(
        &mut self,
        rid: Sym,
        a: &Agg,
        plan: &AggPlan,
        s: &Subst,
        corr: &[Term],
        need: usize,
        n: Term,
        depth: usize,
    ) -> Result<Vec<(Subst, PremRef)>, Halt> {
        if plan.group.is_empty() {
            let key = thr_cell_key(self.thr_shared(a, plan, corr, &[]), n);
            if let Some(c) = self.thr_cells.get(&(rid, a.at, key.into_boxed_slice())) {
                return Ok(vec![(s.clone(), PremRef::Cell(*c))]);
            }
        }
        let (mut groups, _) = self.thr_groups(rid, a, plan, s, depth, true, None)?;
        if groups.is_empty() && plan.group.is_empty() {
            groups.push((Vec::new(), Vec::new()));
        }
        let mut out = Vec::new();
        for (gkey, members) in groups {
            let key = thr_cell_key(self.thr_shared(a, plan, corr, &gkey), n);
            let c = match self.thr_cells.get(&(rid, a.at, key.clone().into_boxed_slice())) {
                Some(c) => *c,
                None if members.len() < need => continue,
                None => self.thr_reach(rid, a, plan, s, key.clone(), need, members)?,
            };
            if let Some(s2) = self.bind_group(a, plan, s, &key) {
                out.push((s2, PremRef::Cell(c)));
            }
        }
        Ok(out)
    }

    /// A group reaches N: its cell, with the first N members (by text) as
    /// its provisional Quorum until it closes.
    #[allow(clippy::too_many_arguments)]
    fn thr_reach(
        &mut self,
        rid: Sym,
        a: &Agg,
        plan: &AggPlan,
        s: &Subst,
        key: Vec<Term>,
        need: usize,
        members: Vec<ThrMember>,
    ) -> Result<CellId, Halt> {
        let tick = self.store.tick;
        let owner = CellOwner::Body { rule: rid, at: a.at };
        if self.store.find_cell(owner, &key, tick).is_some() {
            let d = self.agg_desc(a, s);
            return Err(Halt::Bug(format!("{} reached twice in one evaluation", self.h.name(d))));
        }
        for _ in 0..need {
            self.charge_row(Some(rid), true)?;
        }
        let named = self.bind_group(a, plan, s, &key).unwrap_or_else(|| s.clone());
        let desc = self.agg_desc(a, &named);
        let provisional = members
            .into_iter()
            .take(need)
            .map(|m| {
                let mut ds = m.derivs.into_iter().map(|d| d.1);
                let prems = ds.next().unwrap_or_default();
                NewMember { proj: m.proj.into_boxed_slice(), value: Term::int(1), height: 0, prems, others: ds.collect() }
            })
            .collect();
        let c = self.store.add_cell(NewCell {
            owner,
            op: AggOp::AtLeast,
            key: key.clone().into_boxed_slice(),
            value: CellValue::Value(Term::atom(self.v.a_true)),
            height: 0,
            tick,
            desc,
            members: provisional,
            seals: Vec::new(),
        });
        self.thr_cells.insert((rid, a.at, key.into_boxed_slice()), c);
        self.thr_open.push((c, need));
        self.thr_fresh.insert(c);
        Ok(c)
    }

    /// What the round's news touched inside `r`'s thresholds: for each inner
    /// positive literal with news, the news joined with the body's other
    /// positive literals, which is every solution the news can take part in
    /// and more; the shared values each one binds.
    fn thr_focus_of(&mut self, r: &Rc<ERule>, cur: &Front) -> Result<HashMap<(Sym, u32), ThrFocus>, Halt> {
        let mut out = HashMap::new();
        for b in &r.plan {
            let BodyElem::Agg(a) = b else { continue };
            if a.op != AggOp::AtLeast {
                continue;
            }
            let plan = self.agg_plans.get(&(r.id, a.at)).cloned().ok_or_else(|| Halt::Bug("a threshold with no plan".into()))?;
            let mut f = ThrFocus { news: Vec::new(), by_corr: HashMap::new(), wild: false };
            for (k, i) in plan.inner_order.iter().enumerate() {
                let BodyElem::Pos(l) = &a.body[*i] else { continue };
                let Some(keys) = cur.by_rel.get(&l.rel) else { continue };
                f.news.push((k, keys.clone()));
                let mut probe = vec![BodyElem::Pos(l.clone())];
                probe.extend(plan.inner_order.iter().filter(|j| *j != i).filter_map(|j| match &a.body[*j] {
                    BodyElem::Pos(m) => Some(BodyElem::Pos(m.clone())),
                    _ => None,
                }));
                for sol in self.solve_body(&probe, Subst::new(), 1, Some((0, keys)), None)? {
                    self.bump_steps()?;
                    let mut val = |ix: &[usize]| -> Option<Vec<Term>> {
                        let ts: Vec<Term> = ix.iter().map(|x| resolve(&mut self.h, Term::var(a.shared[*x]), &sol.s)).collect();
                        ts.iter().all(|t| self.h.is_ground(*t)).then_some(ts)
                    };
                    let (corr, group) = (val(&plan.corr), val(&plan.group));
                    match corr {
                        Some(c) => f.by_corr.entry(c).or_default().push(group),
                        None => f.wild = true,
                    }
                }
            }
            if !f.news.is_empty() {
                out.insert((r.id, a.at), f);
            }
        }
        Ok(out)
    }

    /// N under `s`, and N as written there: an integer, at most 0 being
    /// reached by no member at all. Anything else is `agg_type_error`, a hole
    /// on the cell of the correlation at that N.
    fn thr_need(&mut self, rid: Sym, a: &Agg, s: &Subst, corr: &[Term], keep: bool) -> Result<(usize, Term), Sym> {
        let n = resolve(&mut self.h, a.result, s);
        match n.kind() {
            TermK::Int(k) => Ok((brk!("thr_n_minus_one" => (k - 1).max(0); k.max(0)) as usize, n)),
            _ => {
                let r = self.v.agg_type_reason;
                let mut key = corr.to_vec();
                key.push(n);
                brk!("thr_no_hole" => { let _ = (key, keep); }; { self.open_correlation(rid, a, &key, keep, r); });
                Err(r)
            }
        }
    }

    /// A THRESHOLD UNDER EVERY COMPLETION of what holes left out
    /// (docs/aggregates.md, "Shrugs, as built"): for each group under `s`,
    /// the distinct members that hold for certain (facts, no negation that
    /// could read an unknown) and those that could hold (over the facts and
    /// the unknowns, `poison_solve_plan`), none when a member's value or the
    /// group's is not known. Reached if the certain ones reach N, decided
    /// short if even every possible one does not, else a shrug. No member at
    /// all, certain or possible, is a group with none: decided short. An
    /// empty list is no verdict (no plan, or N not a number).
    #[allow(clippy::type_complexity)]
    fn thr_verdicts(&mut self, rid: Sym, a: &Agg, s: &Subst) -> Result<Vec<ThrVerdict>, Halt> {
        let Some(plan) = self.agg_plans.get(&(rid, a.at)).cloned() else { return Ok(Vec::new()) };
        let n = match resolve(&mut self.h, a.result, s).kind() {
            TermK::Int(k) => k.max(0) as usize,
            _ => return Ok(Vec::new()),
        };
        let inner: Vec<BodyElem> = plan.inner_order.iter().map(|i| a.body[*i].clone()).collect();
        let outer: Vec<Sym> = self.lattices.keys().copied().collect();
        // the threshold sees of `s` its shared variables only: an inner
        // variable an unknown bound is a member, not a group
        let mut base = Subst::new();
        for v in &a.shared {
            let t = resolve(&mut self.h, Term::var(*v), s);
            if self.h.is_ground(t) {
                if let Some(b) = unify(&self.h, Term::var(*v), t, &base) {
                    base = b;
                }
            }
        }
        let s = &base;
        let strict = std::mem::replace(&mut self.strict_neg, true);
        let firing = std::mem::replace(&mut self.firing, false);
        let known = self.solve_body(&inner, s.clone(), 1, None, None);
        self.strict_neg = strict;
        self.firing = firing;
        let known = known?;
        let possible = self.poison_solve_plan(&inner, &outer, usize::MAX, s.clone())?;
        let shared: Vec<Term> = a.shared.iter().map(|v| Term::var(*v)).collect();
        type Group = (Vec<Term>, Subst, HashSet<Vec<Term>>, Option<HashSet<Vec<Term>>>);
        let mut groups: Vec<Group> = Vec::new();
        let at = |e: &mut Eval, groups: &mut Vec<Group>, g: Vec<Term>, _: &Subst| -> usize {
            if let Some(p) = groups.iter().position(|x| x.0 == g) {
                return p;
            }
            let mut sg = base.clone();
            for (v, t) in a.shared.iter().zip(g.iter()) {
                if let Some(s2) = unify(&e.h, Term::var(*v), *t, &sg) {
                    sg = s2;
                }
            }
            groups.push((g, sg, HashSet::new(), Some(HashSet::new())));
            groups.len() - 1
        };
        for sol in &known {
            let g: Vec<Term> = shared.iter().map(|t| resolve(&mut self.h, *t, &sol.s)).collect();
            let proj: Vec<Term> = a.vals.iter().map(|t| resolve(&mut self.h, *t, &sol.s)).collect();
            let k = at(self, &mut groups, g, &sol.s);
            groups[k].2.insert(proj);
        }
        let mut all_open = false;
        for ps in &possible {
            let g: Vec<Term> = shared.iter().map(|t| resolve(&mut self.h, *t, ps)).collect();
            let proj: Vec<Term> = a.vals.iter().map(|t| resolve(&mut self.h, *t, ps)).collect();
            let open = |e: &Eval, ts: &[Term]| ts.iter().any(|t| !e.h.is_ground(*t) || e.holds_unknown(*t));
            if open(self, &g) {
                all_open = true;
                continue;
            }
            let wide = open(self, &proj);
            let k = at(self, &mut groups, g, ps);
            if wide {
                groups[k].3 = None;
            } else if let Some(set) = &mut groups[k].3 {
                set.insert(proj);
            }
        }
        if all_open {
            for x in groups.iter_mut() {
                x.3 = None;
            }
        } else if groups.is_empty() && brk!("shrug_thr_empty_undecided" => false; true) {
            // no member under any completion: the group `s` names (the
            // correlation's, or none at all) is short of any N above zero
            groups.push((Vec::new(), base.clone(), HashSet::new(), Some(HashSet::new())));
        }
        Ok(groups
            .into_iter()
            .map(|(_, sg, known, possible)| {
                let upper = possible.map(|p| p.union(&known).count());
                (sg, known, upper, n)
            })
            .collect())
    }

    /// Is the threshold decided short under `s`, whatever the unknowns are?
    fn thr_short(&mut self, rid: Sym, a: &Agg, s: &Subst) -> Result<bool, Halt> {
        let vs = self.thr_verdicts(rid, a, s)?;
        Ok(!vs.is_empty() && vs.iter().all(|(_, known, upper, n)| known.len() < *n && upper.is_some_and(|u| u < *n)))
    }

    /// The groups under `s` a negation's unknown leaves neither reached nor
    /// short, each with every unknown the negations of its members that are
    /// not certain read: any of them could decide it.
    fn thr_uncertain(&mut self, rid: Sym, a: &Agg, s: &Subst) -> Result<Vec<(Subst, Unknown)>, Halt> {
        if !a.body.iter().any(|b| matches!(b, BodyElem::Neg(l) if self.lat_unknown_rel.contains_key(&l.rel))) {
            return Ok(Vec::new());
        }
        let mut out = Vec::new();
        for (sg, known, upper, n) in self.thr_verdicts(rid, a, s)? {
            if known.len() >= n || upper.is_some_and(|u| u < n) {
                continue;
            }
            let mut us = self.thr_member_unknowns(rid, a, &sg, &known, true)?;
            brk!("shrug_thr_first_root" => us.truncate(1); ());
            out.extend(us.into_iter().map(|u| (sg.clone(), u)));
        }
        Ok(out)
    }

    /// Every unknown the threshold's groups under `s` that are neither
    /// reached nor short rest on: what the members not certain read.
    fn thr_open_unknowns(&mut self, rid: Sym, a: &Agg, s: &Subst) -> Result<Vec<Unknown>, Halt> {
        let mut out: Vec<Unknown> = Vec::new();
        for (sg, known, upper, n) in self.thr_verdicts(rid, a, s)? {
            if known.len() >= n || upper.is_some_and(|u| u < n) {
                continue;
            }
            for u in self.thr_member_unknowns(rid, a, &sg, &known, false)? {
                if !out.contains(&u) {
                    out.push(u);
                }
            }
        }
        Ok(out)
    }

    /// The unknowns the possible members of the group `sg` that are not
    /// `known` read, in the order found: through its negations only
    /// (`negs_only`), or through its positive literals too.
    fn thr_member_unknowns(&mut self, rid: Sym, a: &Agg, sg: &Subst, known: &HashSet<Vec<Term>>, negs_only: bool) -> Result<Vec<Unknown>, Halt> {
        let Some(plan) = self.agg_plans.get(&(rid, a.at)).cloned() else { return Ok(Vec::new()) };
        let inner: Vec<BodyElem> = plan.inner_order.iter().map(|i| a.body[*i].clone()).collect();
        let outer: Vec<Sym> = self.lattices.keys().copied().collect();
        let mut out: Vec<Unknown> = Vec::new();
        for ps in self.poison_solve_plan(&inner, &outer, usize::MAX, sg.clone())? {
            let proj: Vec<Term> = a.vals.iter().map(|t| resolve(&mut self.h, *t, &ps)).collect();
            if known.contains(&proj) {
                continue;
            }
            for b in &inner {
                let (l, neg) = match b {
                    BodyElem::Neg(l) => (l, true),
                    BodyElem::Pos(l) if !negs_only => (l, false),
                    _ => continue,
                };
                for u in self.unknown_cands(l, &ps) {
                    let spread = self.lat_spread.contains(&u) || (!neg && self.lat_unknown.contains_key(&u) && !matches!(u, Unknown::Tuple(..)));
                    if spread && !out.contains(&u) && self.unknown_binds(l, &u, &ps).is_some() {
                        out.push(u);
                    }
                }
            }
        }
        Ok(out)
    }

    /// Every shared variable's value, in `shared` order.
    fn thr_shared(&self, a: &Agg, plan: &AggPlan, corr: &[Term], gkey: &[Term]) -> Vec<Term> {
        let mut key: Vec<Term> = vec![Term::int(0); a.shared.len()];
        for (n, i) in plan.corr.iter().enumerate() {
            key[*i] = corr[n];
        }
        for (n, i) in plan.group.iter().enumerate() {
            key[*i] = gkey[n];
        }
        key
    }

    /// The members of a threshold under `s`, by group: each distinct
    /// projection tuple once, with every distinct derivation; groups and
    /// members in key order. `front_at` keeps only the solutions that read
    /// the news there. A solution a builtin dropped for an error, or one left
    /// open, is no member — a threshold is a lower bound, which a member
    /// missing can never make true — and the reason comes back for whynot.
    #[allow(clippy::type_complexity, clippy::too_many_arguments)]
    fn thr_groups(
        &mut self,
        rid: Sym,
        a: &Agg,
        plan: &AggPlan,
        s: &Subst,
        depth: usize,
        keep: bool,
        front_at: Option<(usize, &FxSet<FactId>)>,
    ) -> Result<(Vec<(Vec<Term>, Vec<ThrMember>)>, Option<Sym>), Halt> {
        let (cands, dropped) = self.inner_cands(rid, a, plan, s, depth, keep, front_at, false)?;
        let mut groups: Vec<(Vec<Term>, Vec<ThrMember>)> = Vec::with_capacity(cands.len());
        for (group, cs) in cands {
            let mut pidx: HashMap<Vec<Term>, usize> = HashMap::new();
            let mut ms: Vec<ThrMember> = Vec::new();
            for c in cs {
                let j = match pidx.get(&c.proj) {
                    Some(j) => *j,
                    None => {
                        pidx.insert(c.proj.clone(), ms.len());
                        let text = tuple_text(&self.h, &c.proj);
                        ms.push(ThrMember { proj: c.proj, text, derivs: Vec::new() });
                        ms.len() - 1
                    }
                };
                ms[j].derivs.push((c.sig, c.prems));
            }
            for m in &mut ms {
                m.derivs.sort_by(|x, y| cmp_js(&x.0, &y.0));
                brk!("thr_one_deriv" => m.derivs.truncate(1); m.derivs.dedup_by(|x, y| x.0 == y.0));
            }
            ms.sort_by(|x, y| cmp_js(&x.text, &y.text));
            groups.push((group, ms));
        }
        let mut keyed: Vec<(String, (Vec<Term>, Vec<ThrMember>))> =
            groups.into_iter().map(|g| (tuple_text(&self.h, &g.0), g)).collect();
        keyed.sort_by(|x, y| cmp_js(&x.0, &y.0));
        Ok((keyed.into_iter().map(|x| x.1).collect(), dropped))
    }

    /// THE INNER BODY SOLVED, for every aggregate: under `s`, only the
    /// solutions reading the news at `front_at` when it is given, one `Cand`
    /// each, grouped, groups in the order first seen. A builtin that failed
    /// for an error, or a solution left open, is the reason returned — under
    /// `hole` at once and with nothing else, the group being unknown (count,
    /// sum, min, max, or, and); otherwise that solution is dropped and the
    /// rest kept (a threshold). Under `keep` each solution is a step, and a
    /// row too under `hole`.
    #[allow(clippy::too_many_arguments, clippy::type_complexity)]
    fn inner_cands(
        &mut self,
        rid: Sym,
        a: &Agg,
        plan: &AggPlan,
        s: &Subst,
        depth: usize,
        keep: bool,
        front_at: Option<(usize, &FxSet<FactId>)>,
        hole: bool,
    ) -> Result<(Vec<(Vec<Term>, Vec<Cand>)>, Option<Sym>), Halt> {
        let inner: Vec<BodyElem> = plan.inner_order.iter().map(|i| a.body[*i].clone()).collect();
        // whynot's cell asks nothing of the world: no rule id, so no hole.
        let outer = self.fault.take();
        let sols = self.solve_body(&inner, s.clone(), depth + 1, front_at, keep.then_some(rid));
        let mut fault = self.fault.take();
        self.fault = if hole { outer.or(fault) } else { outer };
        let sols = sols?;
        if hole && fault.is_some() {
            return Ok((Vec::new(), fault));
        }
        // a member's premises, in the order the body was WRITTEN
        let mut back = vec![0usize; plan.inner_order.len()];
        for (k, i) in plan.inner_order.iter().enumerate() {
            back[*i] = k;
        }
        let mut groups: Vec<(Vec<Term>, Vec<Cand>)> = Vec::new();
        let mut gidx: HashMap<Vec<Term>, usize> = HashMap::new();
        for sol in sols {
            if keep {
                self.bump_steps()?;
                if hole {
                    self.charge_row(Some(rid), true)?;
                }
            }
            let group: Vec<Term> = plan.group.iter().map(|i| resolve(&mut self.h, Term::var(a.shared[*i]), &sol.s)).collect();
            // quantile's percent and rank's subject are read, not projected
            let mut proj: Vec<Term> = a.vals[brk!("hol_param_projected" => 0; a.params())..].iter().map(|t| resolve(&mut self.h, *t, &sol.s)).collect();
            proj.extend(a.keys.iter().map(|t| resolve(&mut self.h, *t, &sol.s)).collect::<Vec<_>>());
            let proj = a.plain_keys(&self.h, proj);
            if !group.iter().chain(proj.iter()).all(|t| self.h.is_ground(*t)) {
                fault.get_or_insert(self.v.agg_open_reason);
                if hole {
                    return Ok((Vec::new(), fault));
                }
                continue;
            }
            let prems: Vec<PremRef> = back.iter().map(|k| sol.prems[*k]).collect();
            let mut ps: Vec<String> = prems.iter().map(|p| self.store.prem_text(&self.h, *p)).collect();
            ps.sort_by(|x, y| cmp_js(x, y));
            let sig = ps.join("; ");
            let g = *gidx.entry(group.clone()).or_insert_with(|| {
                groups.push((group.clone(), Vec::new()));
                groups.len() - 1
            });
            groups[g].1.push(Cand { proj, prems, sig });
        }
        Ok((groups, fault))
    }

    /// CLOSE THE QUORUMS whose conclusion and input are closed before level
    /// `lv` (every one at `i64::MAX`). Each is asked again over the closed
    /// relations for all its members; the members' facts and the quorums are
    /// given heights together (`Store::quorum_heights`), since a member may
    /// rest on a conclusion another quorum supports; the Quorum is the first
    /// N by height, then projection (`cell::quorum`); then it is reflected.
    fn close_thresholds_below(&mut self, lv: i64, then_propagate: bool) -> Result<(), Halt> {
        if self.thr_open.is_empty() {
            return Ok(());
        }
        let closed = |e: &Eval, rel: Sym| match e.round_of.get(&rel) {
            Some(r) => (*r as i64) < lv,
            None => !e.derived_rels.contains(&rel),
        };
        let mut due: Vec<(CellId, usize)> = Vec::new();
        let mut rest: Vec<(CellId, usize)> = Vec::new();
        // Kept open until each is resealed: a wall that falls in between
        // leaves them to the cut, which closes them.
        for (c, need) in self.thr_open.clone() {
            let CellOwner::Body { rule, at } = self.store.cell(c).owner;
            let plan = self.agg_plans.get(&(rule, at)).cloned().ok_or_else(|| Halt::Bug("a quorum with no plan".into()))?;
            let head = self.rule_of(rule).map(|r| r.clause.head.rel);
            let ok = lv == i64::MAX || (head.is_some_and(|h| closed(self, h)) && plan.rels.iter().all(|r| closed(self, *r)));
            if ok {
                due.push((c, need));
            } else {
                rest.push((c, need));
            }
        }
        if due.is_empty() {
            return Ok(());
        }
        let mut all: Vec<Vec<ThrMember>> = Vec::with_capacity(due.len());
        for (c, _) in &due {
            let r = self.store.cell(*c).clone();
            let CellOwner::Body { rule, at } = r.owner;
            let er = self.rule_of(rule).ok_or_else(|| Halt::Bug("a quorum's rule is gone".into()))?;
            let Some(BodyElem::Agg(a)) = er.clause.body.get(at as usize - 1) else {
                return Err(Halt::Bug("a quorum's owner is no threshold".into()));
            };
            let plan = self.agg_plans[&(rule, at)].clone();
            let mut sub = Subst::new();
            for (i, v) in a.shared.iter().enumerate() {
                sub = unify(&self.h, Term::var(*v), r.key[i], &sub).ok_or_else(|| Halt::Bug("a quorum's key does not bind".into()))?;
            }
            let (groups, _) = self.thr_groups(rule, a, &plan, &sub, 0, true, None)?;
            all.push(groups.into_iter().next().map(|g| g.1).unwrap_or_default());
        }
        let forbidden: HashSet<CellId> = rest.iter().map(|x| x.0).collect();
        let prems: Vec<Vec<Vec<Vec<PremRef>>>> =
            all.iter().map(|ms| ms.iter().map(|m| m.derivs.iter().map(|d| d.1.clone()).collect()).collect()).collect();
        self.height_memo.clear();
        let hs = match self.store.quorum_heights(&due, &prems, &forbidden, &mut self.height_memo) {
            Ok(hs) => hs,
            Err(f) => {
                return Err(Halt::Bug(format!("{} rests on a quorum that is not closing with it", self.store.key(&self.h, f))))
            }
        };
        for (i, (c, need)) in due.iter().enumerate() {
            let found: Vec<(usize, u32, usize)> =
                (0..all[i].len()).filter_map(|j| hs[i][j].map(|(h, k)| (j, h, k))).collect();
            let ranked: Vec<(u32, String)> = found.iter().map(|(j, h, _)| (*h, all[i][*j].text.clone())).collect();
            let Some(pick) = quorum(&ranked, *need) else {
                let d = self.store.cell(*c).desc;
                return Err(Halt::Bug(format!("{} was reached and has fewer than {need} founded members when it closes", self.h.name(d))));
            };
            let members: Vec<NewMember> = pick
                .iter()
                .map(|k| {
                    // the least derivation at the member's least height
                    let (j, h, d) = found[*k];
                    let m = &all[i][j];
                    let others = brk!("keep_first_derivation" => Vec::new();
                        m.derivs.iter().enumerate().filter(|(e, _)| *e != d).map(|(_, x)| x.1.clone()).collect());
                    NewMember { proj: m.proj.clone().into_boxed_slice(), value: Term::int(1), height: h, prems: m.derivs[d].1.clone(), others }
                })
                .collect();
            let height = members.iter().map(|m| m.height).max().unwrap_or(0);
            brk!("thr_no_close" => { let _ = (members, height); }; self.store.reseal_cell(*c, members, height));
            self.reflect_cell(*c)?;
        }
        self.thr_open = rest;
        if then_propagate {
            let front = std::mem::take(&mut self.cur_front);
            if !front.keys.is_empty() {
                self.propagate(front)?;
                self.lattice_settle(false)?;
            }
        }
        Ok(())
    }

    /// Solve the inner body, bucket the solutions into groups and members,
    /// fold each group, and seal a cell per group.
    #[allow(clippy::too_many_arguments)]
    fn seal_cells(
        &mut self,
        rid: Sym,
        a: &Agg,
        plan: &AggPlan,
        s: &Subst,
        corr: &[Term],
        depth: usize,
        keep: bool,
    ) -> Result<Sealed, Halt> {
        if (!a.rank_tuple() && a.vals.len() <= a.params()) || (a.rank_tuple() && a.keys.len() != a.vals.len()) {
            return Err(Halt::Bug(format!("safety.rofl let {} through with no value after its first term", a.op.name())));
        }
        // what unknowns might add to or take from the groups: a group sealed
        // under them is its own, never shared (`reach_of`)
        let reach = if keep { std::mem::take(&mut self.agg_reach) } else { Vec::new() };
        let share = if keep && reach.is_empty() { self.hol_share_key(rid, a, plan, corr) } else { None };
        match share.as_ref().and_then(|k| self.hol_shared.get(k)).cloned() {
            Some(HolShared::Open(reason)) => {
                self.agg_opened.insert((rid, a.at, corr.to_vec().into_boxed_slice()));
                return Ok(self.open_correlation(rid, a, corr, keep, reason));
            }
            Some(HolShared::Groups(gs)) => return self.seal_shared(rid, a, plan, s, corr, &gs),
            None => {}
        }
        let (found, fault) = self.inner_cands(rid, a, plan, s, depth, keep, None, true)?;
        if let Some(reason) = brk!("inner_fault" => fault.filter(|_| false); fault) {
            if keep {
                self.agg_opened.insert((rid, a.at, corr.to_vec().into_boxed_slice()));
            }
            if let Some(k) = share {
                self.hol_shared.insert(k, HolShared::Open(reason));
            }
            return Ok(self.open_correlation(rid, a, corr, keep, reason));
        }
        // GROUPS, THEN MEMBERS. A count or sum member is a distinct projection
        // tuple; a min, max, or, and member is a distinct derivation. Within
        // one identity the representative is the least signature, so which
        // solution arrived first is unobservable.
        let mut cands: Vec<Cand> = Vec::new();
        let mut groups: Vec<(Vec<Term>, Vec<usize>)> = Vec::with_capacity(found.len());
        for (g, cs) in found {
            groups.push((g, (cands.len()..cands.len() + cs.len()).collect()));
            cands.extend(cs);
        }
        let values: Vec<Term> = cands.iter().map(|c| if plan.op == AggOp::Count { Term::int(1) } else { c.proj[0] }).collect();
        if groups.is_empty() && plan.group.is_empty() {
            groups.push((Vec::new(), Vec::new()));
        }
        // A GROUP ONLY AN UNKNOWN COULD MAKE is a group of its own, with no
        // member known: a hole, so what reads it is unknown and not absent.
        let mut fresh: Vec<Vec<Term>> = Vec::new();
        for p in reach.iter().filter(|p| p.exact() && brk!("agg_reach_fresh_off" => false; true)) {
            let g: Vec<Term> = p.pat.iter().flatten().copied().collect();
            if !groups.iter().any(|(k, _)| *k == g) && !fresh.contains(&g) {
                fresh.push(g);
            }
        }
        fresh.sort_by(|x, y| cmp_js(&tuple_text(&self.h, x), &tuple_text(&self.h, y)));
        groups.extend(fresh.into_iter().map(|g| (g, Vec::new())));
        // a group a narrower correlation of the element sealed already is its cell, listed here and not sealed again (`ds_bind`)
        let mut reuse: Vec<CellId> = Vec::new();
        if keep && !plan.group.is_empty() && self.ds_elems.contains(&(rid, a.at)) && brk!("ds_group_resealed" => false; true) {
            let owner = CellOwner::Body { rule: rid, at: a.at };
            let mut key: Vec<Term> = vec![Term::int(0); a.shared.len()];
            for (n, i) in plan.corr.iter().enumerate() {
                key[*i] = corr[n];
            }
            groups.retain(|(g, _)| {
                for (n, i) in plan.group.iter().enumerate() {
                    key[*i] = g[n];
                }
                match self.store.find_cell(owner, &key, self.store.tick) {
                    Some(c) => {
                        reuse.push(c);
                        false
                    }
                    None => true,
                }
            });
        }
        let withdrawn = self.h.intern("support_withdrawn");
        let mut reached: HashMap<usize, Vec<Unknown>> = HashMap::new();
        let index = PossIndex::of(&reach);
        if plan.empty_zero && !plan.group.is_empty() {
            return Err(Halt::Bug("safety.rofl says empty-zero for a grouping aggregate".into()));
        }
        let dedup = brk!("solutions" => false, "min_by_value" => true; plan.op.dedup_by_projection());
        let mut sealed: Vec<(Vec<Term>, NewCell)> = Vec::new();
        let mut sorts: Vec<(Box<[Term]>, Result<Sorted, Sym>)> = Vec::new();
        for (gkey, idxs) in groups {
            // one representative per identity: the least signature wins
            let least = |j: usize, i: usize| brk!("first_rep" => true; cmp_js(&cands[j].sig, &cands[i].sig) != std::cmp::Ordering::Greater);
            // the other derivations of a representative's identity, by signature
            let mut alts: HashMap<usize, Vec<usize>> = HashMap::new();
            let reps: Vec<usize> = if dedup {
                let mut by_proj: HashMap<Vec<Term>, usize> = HashMap::new();
                let mut all: HashMap<Vec<Term>, Vec<usize>> = HashMap::new();
                for i in idxs {
                    let id = brk!("sum_by_value" => cands[i].proj[..1].to_vec(); cands[i].proj.clone());
                    all.entry(id.clone()).or_default().push(i);
                    match by_proj.get(&id) {
                        Some(&j) if least(j, i) => {}
                        _ => {
                            by_proj.insert(id, i);
                        }
                    }
                }
                for (id, rep) in &by_proj {
                    let mut rest: Vec<usize> = all[id].iter().copied().filter(|i| cands[*i].sig != cands[*rep].sig).collect();
                    rest.sort_by(|x, y| cmp_js(&cands[*x].sig, &cands[*y].sig));
                    rest.dedup_by(|x, y| cands[*x].sig == cands[*y].sig);
                    alts.insert(*rep, rest);
                }
                by_proj.into_values().collect()
            } else {
                let mut by_sig: HashMap<&str, usize> = HashMap::new();
                for i in idxs {
                    by_sig.entry(cands[i].sig.as_str()).or_insert(i);
                }
                by_sig.into_values().collect()
            };
            // HEIGHTS, then the canonical order: height, then the projection
            // (a Group) or the signature (a Best).
            let mut hs: Vec<u32> = Vec::with_capacity(reps.len());
            for i in &reps {
                hs.push(self.member_height(&cands[*i].prems)?);
            }
            let keys: Vec<String> = reps
                .iter()
                .map(|i| if dedup { tuple_text(&self.h, &cands[*i].proj) } else { cands[*i].sig.clone() })
                .collect();
            let mut order: Vec<usize> = (0..reps.len()).collect();
            brk!("order_proj" => order.sort_by(|x, y| cmp_js(&keys[*x], &keys[*y]));
                 order.sort_by(|x, y| hs[*x].cmp(&hs[*y]).then_with(|| cmp_js(&keys[*x], &keys[*y]))));
            // A RANK OVER A TUPLE lists its members in the tuple's own order
            let rdesc = a.rank_desc(&self.h);
            let katoms: Vec<Result<Vec<KeyAtom>, Sym>> = if a.rank_tuple() {
                reps.iter().map(|i| key_atoms(&self.h, &self.v, &cands[*i].proj)).collect()
            } else {
                Vec::new()
            };
            if a.rank_tuple() && brk!("rank_members_unordered" => false; katoms.iter().all(|k| k.is_ok())) {
                order.sort_by(|x, y| {
                    let (kx, ky) = (katoms[*x].as_ref().unwrap(), katoms[*y].as_ref().unwrap());
                    rank_cmp(&rdesc, kx, ky).then_with(|| hs[*x].cmp(&hs[*y])).then_with(|| cmp_js(&keys[*x], &keys[*y]))
                });
            }
            // THE FOLD, checked. A wrong type or an overflow poisons the group:
            // a hole, and no value.
            let mut acc = None;
            let mut kept: Vec<usize> = Vec::new();
            let mut poison: Option<Sym> = None;
            // A HOLISTIC GROUP IS RECOMPUTED WHOLE: every member is kept, and
            // the value is a function of their sorted values (`AggOp::holistic`),
            // with quantile's percent or rank's subject read under `s`.
            let holistic = plan.op.class() == Class::Holistic;
            if holistic && a.rank_tuple() {
                let subject: Vec<Term> = a.vals.iter().map(|t| resolve(&mut self.h, *t, s)).collect();
                let subject = key_atoms(&self.h, &self.v, &subject);
                let sorted = katoms.iter().cloned().collect::<Result<Vec<_>, Sym>>().map(|ks| Sorted::of_keys(rdesc.clone(), ks));
                let value = match (&sorted, &subject) {
                    (Err(r), _) | (Ok(_), Err(r)) => Err(*r),
                    (Ok(g), Ok(sj)) => Ok(g.rank_of(sj)),
                };
                match value {
                    Ok(x) => acc = x,
                    Err(r) => poison = Some(r),
                }
                sorts.push((gkey.clone().into_boxed_slice(), sorted));
                kept = order.clone();
            } else if holistic {
                let param = if plan.op.params() == 0 {
                    Ok(None)
                } else {
                    match resolve(&mut self.h, a.vals[0], s).kind() {
                        TermK::Int(n) => Ok(Some(Val::Int(n as i128))),
                        _ => Err(self.v.agg_type_reason),
                    }
                };
                let xs: Result<Vec<Val>, Sym> = order.iter().map(|o| plan.op.lift(&self.v, values[reps[*o]])).collect();
                let sorted = xs.and_then(|xs| Sorted::of(&self.v, &xs));
                let value = match (&sorted, &param) {
                    (Err(r), _) | (Ok(_), Err(r)) => Err(*r),
                    (Ok(g), Ok(p)) => plan.op.holistic_sorted(&self.v, *p, g),
                };
                match value {
                    Ok(x) => acc = x,
                    Err(r) => poison = Some(r),
                }
                sorts.push((gkey.clone().into_boxed_slice(), sorted));
                kept = brk!("hol_best_only" => order.iter().copied().filter(|o| acc.is_some_and(|x| plan.op.lift(&self.v, values[reps[*o]]) == Ok(x))).collect(); order.clone());
            }
            for o in order.iter().filter(|_| !holistic) {
                let x = match plan.op.lift(&self.v, values[reps[*o]]) {
                    Ok(x) => x,
                    Err(r) => {
                        poison = Some(r);
                        break;
                    }
                };
                match plan.op.insert(&self.v, acc, x) {
                    Err(r) => {
                        poison = Some(r);
                        break;
                    }
                    Ok(Step::Improved(n)) => {
                        acc = Some(n);
                        brk!("best_all" => ();
                        if plan.op.class() == Class::IdempotentOrder {
                            kept.clear();
                        });
                        kept.push(*o);
                    }
                    Ok(Step::Tied) | Ok(Step::Unchanged) if plan.op.class() == Class::Invertible => kept.push(*o),
                    Ok(Step::Tied) => kept.push(*o),
                    Ok(Step::Unchanged) => brk!("best_all" => kept.push(*o); {}),
                }
            }
            if poison.is_none() {
                match plan.op.finish(&self.v, acc) {
                    Ok(x) => acc = x,
                    Err(r) => poison = Some(r),
                }
            }
            let value = match (poison, acc) {
                (Some(r), _) => CellValue::Hole(r),
                (None, Some(x)) => CellValue::Value(plan.op.lower(&mut self.h, &self.v, x)),
                (None, None) if brk!("empty_none" => plan.empty_zero && false; plan.empty_zero) => {
                    CellValue::Value(plan.op.lower(&mut self.h, &self.v, plan.op.identity().unwrap()))
                }
                (None, None) => CellValue::Empty,
            };
            if poison.is_some() {
                kept = order.clone();
            }
            // DECIDED UNDER EVERY COMPLETION, or a hole on this group alone
            let mut value = value;
            if !reach.is_empty() {
                let projs: Vec<&[Term]> = reps.iter().map(|i| cands[*i].proj.as_slice()).collect();
                let vals: Vec<Term> = reps.iter().map(|i| values[*i]).collect();
                let param = self.agg_param(a, s);
                let rk = self.rank_key(a, s);
                let mine = index.at(&reach, &gkey);
                let us = self.reach_of(plan.op, param, rk.as_ref(), &projs, &vals, value, &mine);
                if !us.is_empty() {
                    value = CellValue::Hole(withdrawn);
                    kept = order.clone();
                    reached.insert(sealed.len(), us);
                }
            }
            let mut members: Vec<NewMember> = Vec::with_capacity(kept.len());
            brk!("phantom" => if kept.is_empty() && matches!(value, CellValue::Value(_)) {
                members.push(NewMember { proj: vec![Term::int(0)].into_boxed_slice(), value: Term::int(0), height: 0, prems: Vec::new(), others: Vec::new() });
            }; ());
            let mut height = 0u32;
            let kept: Vec<usize> = brk!("trunc5" => kept.into_iter().take(5).collect(),
                                        "one_member" => kept.into_iter().take(1).collect(); kept);
            for o in kept {
                let c = &cands[reps[o]];
                height = height.max(hs[o]);
                members.push(NewMember {
                    proj: c.proj.clone().into_boxed_slice(),
                    value: values[reps[o]],
                    height: hs[o],
                    prems: c.prems.clone(),
                    others: brk!("keep_first_derivation" => Vec::new();
                        alts.get(&reps[o]).map(|v| v.iter().map(|i| cands[*i].prems.clone()).collect()).unwrap_or_default()),
                });
            }
            // the key: every shared variable's value, in `shared` order
            let mut key: Vec<Term> = vec![Term::int(0); a.shared.len()];
            for (n, i) in plan.corr.iter().enumerate() {
                key[*i] = corr[n];
            }
            for (n, i) in plan.group.iter().enumerate() {
                key[*i] = gkey[n];
            }
            let mut seals: Vec<Seal> = Vec::with_capacity(plan.rels.len());
            for r in &plan.rels {
                let round = match self.round_of.get(r) {
                    Some(n) => *n,
                    None if brk!("strata_untabled" => self.derived_rels.contains(r) && false; self.derived_rels.contains(r)) => {
                        return Err(Halt::Bug(format!("{} is derived and has no round to be sealed at", self.h.name(*r))))
                    }
                    None => 0,
                };
                seals.push(Seal { rel: *r, round });
            }
            let desc = self.agg_desc(a, s);
            sealed.push((
                key.clone(),
                NewCell {
                    owner: CellOwner::Body { rule: rid, at: a.at },
                    op: plan.op,
                    key: key.into_boxed_slice(),
                    value,
                    height,
                    tick: self.store.tick,
                    desc,
                    members,
                    seals,
                },
            ));
        }
        if !keep {
            return Ok(Sealed::Ephemeral(sealed.into_iter().map(|(k, c)| (k, c.value, c.members.len())).collect()));
        }
        let mut ids = Vec::with_capacity(sealed.len());
        let carried = (self.carry_src.take(), std::mem::take(&mut self.carry_more));
        for (n, (_, c)) in sealed.into_iter().enumerate() {
            let us = reached.remove(&n);
            if let Some(us) = &us {
                self.carry_src = Some(Node::Unk(us[0].clone()));
                self.carry_more = us[1..].iter().cloned().map(Node::Unk).collect();
            }
            // A CELL IS SEALED ONCE: what it reads is closed, so a second seal
            // of one key is an evaluation that asked twice what it knew.
            if self.store.find_cell(c.owner, &c.key, c.tick).is_some() {
                return Err(Halt::Bug(format!(
                    "{} sealed twice in one evaluation",
                    self.h.name(c.desc)
                )));
            }
            let value = c.value;
            let id = self.store.add_cell(c);
            if let CellValue::Hole(r) = value {
                let marker = self.store.cell_key_term(&mut self.h, id);
                self.cell_hole(marker, r);
            }
            self.carry_src = None;
            self.carry_more.clear();
            self.reflect_cell(id)?;
            if let Some(us) = us {
                self.cell_reach.insert(id, us.into());
            }
            ids.push(id);
        }
        // a possible whose group is not known could make a group of any key
        // it leaves open: a hole on the correlation, beside its sealed groups
        let mut open: Vec<Unknown> = Vec::new();
        for p in reach.iter().filter(|p| !p.exact()) {
            if !open.contains(&p.u) {
                open.push(p.u.clone());
            }
        }
        if let Some(u) = open.first() {
            self.carry_src = Some(Node::Unk(u.clone()));
            self.carry_more = open[1..].iter().cloned().map(Node::Unk).collect();
            self.open_correlation(rid, a, corr, true, withdrawn);
        }
        (self.carry_src, self.carry_more) = carried;
        if let Some(k) = share {
            let gs: Vec<(Box<[Term]>, CellId, Result<Sorted, Sym>)> =
                sorts.into_iter().zip(ids.iter()).map(|((g, x), c)| (g, *c, x)).collect();
            self.hol_shared.insert(k, HolShared::Groups(gs.into()));
        }
        if brk!("ds_wide_unlisted" => false; true) {
            ids.extend(reuse);
        }
        self.keyed_cells(ids)
    }

    /// THE PERCENT OR SUBJECT OF A HOLISTIC AGGREGATE IS NO MEMBER: when it
    /// is a variable the inner body does not read, the group is the same
    /// under every value of it, so it is sealed once and shared, keyed by
    /// the correlation less it. A rank asked per member of a group of n is
    /// then n cells over one stored group, each answered in O(log n).
    fn hol_share_key(&self, rid: Sym, a: &Agg, plan: &AggPlan, corr: &[Term]) -> Option<(Sym, u32, Box<[Term]>)> {
        if brk!("hol_unshared" => true; plan.op.class() != Class::Holistic || plan.op.params() == 0) {
            return None;
        }
        let mut subject: Vec<Sym> = Vec::new();
        for t in &a.vals[..a.params()] {
            let TermK::Var(p) = t.kind() else { return None };
            subject.push(p);
        }
        let mut inner: Vec<Sym> = Vec::new();
        for t in a.vals[a.params()..].iter().chain(a.keys.iter()) {
            self.h.vars_of(*t, &mut inner);
        }
        for b in &a.body {
            b.vars(&self.h, &mut inner);
        }
        if brk!("hol_share_body" => false; subject.iter().any(|p| inner.contains(p))) {
            return None;
        }
        let mut ats: Vec<usize> = Vec::new();
        for p in &subject {
            ats.push(plan.corr.iter().position(|i| a.shared[*i] == *p)?);
        }
        let base: Vec<Term> = corr.iter().enumerate().filter(|(n, _)| brk!("rank_share_coarse" => false; !ats.contains(n))).map(|(_, t)| *t).collect();
        Some((rid, a.at, base.into_boxed_slice()))
    }

    /// A holistic aggregate under a new percent or subject, over groups
    /// already sealed (`hol_share_key`): each cell shares its group's
    /// members, seals and height, and only its value is its own.
    fn seal_shared(
        &mut self,
        rid: Sym,
        a: &Agg,
        plan: &AggPlan,
        s: &Subst,
        corr: &[Term],
        gs: &[(Box<[Term]>, CellId, Result<Sorted, Sym>)],
    ) -> Result<Sealed, Halt> {
        let param = self.agg_param(a, s);
        let rk = self.rank_key(a, s);
        let desc = self.agg_desc(a, s);
        let mut ids = Vec::with_capacity(gs.len());
        for (gkey, like, sorted) in gs {
            self.bump_steps()?;
            let value = match (sorted, &param, &rk) {
                (Err(r), _, _) | (Ok(_), Err(r), _) => Err(*r),
                (Ok(g), _, Some(k)) => k.subject.as_ref().map(|sj| g.rank_of(sj)).map_err(|r| *r),
                (Ok(g), Ok(p), None) => plan.op.holistic_sorted(&self.v, *p, g),
            };
            let value = match value {
                Err(r) => CellValue::Hole(r),
                Ok(Some(x)) => CellValue::Value(plan.op.lower(&mut self.h, &self.v, x)),
                Ok(None) => CellValue::Empty,
            };
            let key: Box<[Term]> = self.thr_shared(a, plan, corr, gkey).into_boxed_slice();
            let owner = CellOwner::Body { rule: rid, at: a.at };
            if self.store.find_cell(owner, &key, self.store.tick).is_some() {
                return Err(Halt::Bug(format!("{} sealed twice in one evaluation", self.h.name(desc))));
            }
            let height = self.store.cell(*like).height;
            let seals = self.store.cell_seals(*like).to_vec();
            let cell = NewCell { owner, op: plan.op, key, value, height, tick: self.store.tick, desc, members: Vec::new(), seals };
            let id = brk!("hol_shared_bare" => self.store.add_cell(cell); self.store.add_cell_sharing(cell, *like));
            if let CellValue::Hole(r) = value {
                let marker = self.store.cell_key_term(&mut self.h, id);
                self.cell_hole(marker, r);
            }
            self.reflect_cell(id)?;
            ids.push(id);
        }
        self.keyed_cells(ids)
    }

    /// Cells in cell-key order, so the solutions come out in one order.
    fn keyed_cells(&mut self, ids: Vec<CellId>) -> Result<Sealed, Halt> {
        let mut keyed: Vec<(String, CellId)> = ids
            .into_iter()
            .map(|c| {
                let mut k = String::new();
                self.store.write_cell_key(&self.h, c, &mut k);
                (k, c)
            })
            .collect();
        keyed.sort_by(|x, y| cmp_js(&x.0, &y.0));
        Ok(Sealed::Kept(keyed.into_iter().map(|(_, c)| c).collect()))
    }

    /// 1 + the highest fact premise's height; a negation or a builtin is 0.
    fn member_height(&mut self, prems: &[PremRef]) -> Result<u32, Halt> {
        let roots: Vec<FactId> = prems.iter().filter_map(|p| if let PremRef::Fact(f) = p { Some(*f) } else { None }).collect();
        if let Err(f) = self.store.heights(&roots, &mut self.height_memo) {
            return Err(Halt::Bug(format!("{} has no well-founded height", self.store.key(&self.h, f))));
        }
        let mut hgt = 0u32;
        for p in prems {
            match p {
                PremRef::Fact(f) => hgt = hgt.max(self.height_memo[f]),
                PremRef::Cell(c) => hgt = hgt.max(self.store.cell(*c).height),
                PremRef::Neg(_) | PremRef::Bi(_) => {}
            }
        }
        Ok(hgt + 1)
    }

    // -------------------------------------------------------------- lattices
    //
    // docs/aggregates.md, "The order lattice, as built". The cell is the fact: a
    // relation declared `lattice p(K..., op V)` holds one fact per key, and a
    // contribution is merged into it with the operation's ⊕ (`AggOp::insert`,
    // the same algebra a body aggregate folds with).

    // --------------------------------------------------------- join lattices
    //
    // docs/aggregates.md, "The join lattice, as built". A contribution is a
    // fact of `L@join` with the firing that made it; the cell's fact is the
    // join of the contributions, concluded by the engine's rule `L@join`:
    // while the lattice evaluates, from the value it replaced and the
    // contribution that widened it (a step of the history), and at its close
    // from a Cover, the canonical irredundant set of contributions whose join
    // it is (`join_covers`).

    /// A CONTRIBUTION TO A JOIN CELL: stored as a fact of `L@join` with its
    /// firing, then folded into the cell. A value outside the carrier is a
    /// fault the close decides, as an order lattice's is.
    fn conclude_join(&mut self, rid: Sym, rel: Sym, persp: Sym, mut args: Vec<Term>, op: AggOp, prems: Vec<PremRef>, out: &mut Front) -> Result<(), Halt> {
        let n = args.len();
        let ck: LatKey = (rel, persp, args[..n - 1].into());
        if self.lat_closed.contains(&rel) {
            let msg = format!("the lattice {} received a contribution after it closed", self.h.name(rel));
            return Err(match self.mode {
                Mode::Strata => Halt::Strat(
                    format!("program rejected: {msg}: the stratum table ranks it below a relation it reads"),
                    String::new(),
                ),
                Mode::Rounds => Halt::Bug(msg),
            });
        }
        let c = match self.join_canon_of(op, args[n - 1]) {
            Ok(c) => c,
            Err(reason) => {
                let facts = fact_prems(&prems);
                self.lat_pending.push(LatFault { close: rel, what: Some(Unknown::Cell(ck)), rule: None, reason, facts });
                return Ok(());
            }
        };
        args[n - 1] = c;
        if self.narrowing.as_ref().is_some_and(|nr| nr.frozen.contains_key(&ck)) {
            let held = self.narrowing.as_ref().and_then(|nr| nr.fresh.get(&ck)).copied();
            let f = match held {
                None => c,
                Some(f) => op.join(&mut self.h, &self.v, &mut self.join_keys, f, c).map_err(|_| off_carrier(op))?,
            };
            if let Some(nr) = self.narrowing.as_mut() {
                nr.fresh.insert(ck, brk!("narrow_fresh_first" => held.unwrap_or(f); f));
            }
            return Ok(());
        }
        let crel = self.join_rels[&rel];
        let (cid, fresh) = self.store.put(&self.h, crel, persp, &args, F_TICK);
        self.record_firing(cid, rid, rid, prems, out)?;
        if !fresh {
            return Ok(());
        }
        self.join_contribs.entry(ck.clone()).or_default().push(cid);
        self.join_fold(ck, cid, c, op, rid, out)
    }

    /// ⊔ a new contribution into its cell: the first makes the cell's fact;
    /// one below the value changes nothing; any other supersedes the value
    /// with the join, concluded from the value it replaced and the
    /// contribution (or from the contribution alone, when it is the join).
    fn join_fold(&mut self, ck: LatKey, cid: FactId, c: Term, op: AggOp, rid: Sym, out: &mut Front) -> Result<(), Halt> {
        let crel = self.join_rels[&ck.0];
        let (rel, persp) = (ck.0, ck.1);
        let (new, prems) = match self.lat_cur.get(&ck).copied().filter(|f| self.store.alive(*f)) {
            None => (c, vec![PremRef::Fact(cid)]),
            Some(old) => {
                let v = *self.store.args(old).last().unwrap();
                if brk!("join_leq_reversed" => self.join_leq(op, v, c)? && v != c; self.join_leq(op, c, v)?) {
                    return Ok(());
                }
                let joined = op.join(&mut self.h, &self.v, &mut self.join_keys, v, c).map_err(|_| off_carrier(op))?;
                if op == AggOp::Union {
                    self.join_canonical.insert(joined);
                }
                let new = self.widened(&ck, rid, v, c, joined)?;
                let prems = if new == c { vec![PremRef::Fact(cid)] } else { vec![PremRef::Fact(old), PremRef::Fact(cid)] };
                brk!("join_no_retire" => (); self.supersede(old, &ck));
                self.lat_improved.push(old);
                self.lattice_improvements += 1;
                (new, prems)
            }
        };
        let mut args: Vec<Term> = ck.2.to_vec();
        args.push(new);
        let (id, is_new) = self.store.put(&self.h, rel, persp, &args, F_TICK);
        self.lat_cur.insert(ck, id);
        self.record_firing(id, crel, rid, prems, out)?;
        if is_new {
            out.note(rel, id);
        }
        Ok(())
    }

    /// THE DECLARED WIDENING of a cell improving from `old` to `joined` by
    /// the contribution `c`: its first N improvements are the join; from
    /// then on each end the join moved goes to its infinity (`widen_iv`), so
    /// a cell improves at most twice more, whatever its rules compute. A cell
    /// widened is an over-approximation of its least value: its hole
    /// (`widening_forced`, a `widened` shrug naming the value it closed on)
    /// is decided when its lattice closes, once its recursion has settled on
    /// the widened values.
    fn widened(&mut self, ck: &LatKey, rid: Sym, old: Term, c: Term, joined: Term) -> Result<Term, Halt> {
        let Some(&n) = self.widen.get(&ck.0) else { return Ok(joined) };
        // a contribution from outside the cell's recursion is one of finitely
        // many: it is joined, and counts toward nothing
        if !self.widen_rec.contains(&rid) && brk!("widen_counts_base" => false; true) {
            return Ok(joined);
        }
        let steps = self.lat_steps.entry(ck.clone()).or_default();
        let due = brk!("widen_late" => *steps > n; *steps >= n);
        *steps += 1;
        if brk!("widen_never" => true; !due) {
            return Ok(joined);
        }
        let (Some(o), Some(j)) = (iv_bounds(&self.h, &self.v, old), iv_bounds(&self.h, &self.v, joined)) else {
            return Err(off_carrier(AggOp::Hull));
        };
        let w = widen_iv(o, j, self.widen_th.get(&ck.0).map_or(&[][..], |v| &v[..]));
        let wt = mk_iv(&mut self.h, &self.v, w.0, w.1);
        if wt == joined {
            return Ok(joined);
        }
        let first = !self.lat_widened.contains_key(ck);
        self.lat_widened.entry(ck.clone()).or_default().push([old, c, joined, wt]);
        if first && brk!("widen_unmarked" => false; true) {
            self.lat_pending.push(LatFault { close: ck.0, what: Some(Unknown::Cell(ck.clone())), rule: None, reason: self.v.widened_reason, facts: Vec::new() });
        }
        Ok(wt)
    }

    /// THE BACK EDGES OF A WIDENING: the rules concluding into a relation
    /// declared `widen N` that read a relation of its own recursion (one
    /// from which the widened relation is reached again within a tick). Only
    /// their improvements count toward N: every other contribution comes
    /// from below the recursion, finitely many, so a cell fed only by them
    /// keeps its exact value, and one on a cycle is still widened after N
    /// improvements along it (safety.rofl: every cycle an interval function
    /// lies on passes a widened relation).
    fn widen_back_edges(&self) -> HashSet<Sym> {
        let deps = self.rel_deps();
        let reaches = |from: Sym, to: Sym| reaches_in(&deps, from, to);
        let mut out = HashSet::new();
        for r in &self.rules {
            let h = r.clause.head.rel;
            if r.clause.head.temporal == Temporal::Next || !self.widen.contains_key(&h) {
                continue;
            }
            if r.clause.body.iter().any(|b| b.lits_deep().iter().any(|l| reaches(l.rel, h))) {
                out.insert(r.id);
            }
        }
        out
    }

    /// What each relation's rules read within a tick (a `@next` head reads nothing now).
    fn rel_deps(&self) -> HashMap<Sym, HashSet<Sym>> {
        let mut deps: HashMap<Sym, HashSet<Sym>> = HashMap::new();
        for r in &self.rules {
            if r.clause.head.temporal == Temporal::Next {
                continue;
            }
            let e = deps.entry(r.clause.head.rel).or_default();
            for b in &r.clause.body {
                e.extend(b.lits_deep().iter().map(|l| l.rel));
            }
        }
        deps
    }

    /// THE THRESHOLDS OF A WIDENING: every integer written in a rule of the
    /// widened relation's recursion (its own rules and those of the relations
    /// it reaches and is reached from), ascending. Finitely many, so widening
    /// to the next one still terminates; they are where a loop's bounds are
    /// written, so an enclosure stops at `iv(0, 10)` rather than `iv(0, inf)`.
    fn widen_thresholds(&self) -> HashMap<Sym, Vec<i64>> {
        let deps = self.rel_deps();
        let mut out = HashMap::new();
        for &h in self.widen.keys() {
            let mut ints = BTreeSet::new();
            for r in &self.rules {
                let g = r.clause.head.rel;
                if r.clause.head.temporal == Temporal::Next || !(g == h || (reaches_in(&deps, g, h) && reaches_in(&deps, h, g))) {
                    continue;
                }
                for b in &r.clause.body {
                    b.ints(&self.h, &mut ints);
                }
            }
            out.insert(h, ints.into_iter().collect());
        }
        out
    }

    /// THE DESCENDING PASS (docs/aggregates.md, "Widening, as built"). The
    /// widening settled each widened cell on a post-fixpoint x. Each pass
    /// evaluates the world again with those cells held at their values and
    /// taking no contribution, so what every rule contributes to them is
    /// computed from x alone (`seed_narrowing`, `conclude_join`), and stops
    /// when their lattices come to close (`narrow_gathered`). An end the
    /// widening raised comes down to the join of those contributions where
    /// that is inside it (`narrow_iv`), never below it; the others stay. The
    /// result is still a post-fixpoint, so still an enclosure of the least
    /// value. Passes repeat until nothing moves, at most `NARROW_PASSES`.
    fn narrow_descend(&mut self) -> Result<(), Halt> {
        struct Cell {
            ck: LatKey,
            x: Term,
            cur: (i64, i64),
            raised: (bool, bool),
            steps: Vec<[Term; 3]>,
        }
        brk!("narrow_off" => return Ok(()), "descent_wall" => return Err(Halt::Budget("budget_exhausted", None)), "descent_fatal" => return Err(Halt::Bug("descent".into())); ());
        let mut cells: Vec<Cell> = Vec::new();
        for (ck, &x) in &self.widened_x {
            let Some(cur) = iv_bounds(&self.h, &self.v, x) else { continue };
            let mut raised = (false, false);
            for [_, _, joined, wide] in self.lat_widened.get(ck).into_iter().flatten() {
                if let (Some(j), Some(w)) = (iv_bounds(&self.h, &self.v, *joined), iv_bounds(&self.h, &self.v, *wide)) {
                    raised = (raised.0 || w.0 != j.0, raised.1 || w.1 != j.1);
                }
            }
            cells.push(Cell { ck: ck.clone(), x, cur, raised, steps: Vec::new() });
        }
        for _ in 0..brk!("narrow_once" => 1, "narrow_more" => NARROW_PASSES + 1; NARROW_PASSES) {
            let frozen: HashMap<LatKey, Term> = cells.iter().map(|c| (c.ck.clone(), mk_iv(&mut self.h, &self.v, c.cur.0, c.cur.1))).collect();
            let left: HashSet<Sym> = cells.iter().map(|c| c.ck.0).collect();
            self.narrowing = Some(Narrowing { frozen, fresh: HashMap::new(), left, faulted: HashSet::new() });
            let ran = self.run_pass();
            let pass = self.narrowing.take();
            match (ran, pass) {
                (Err(Halt::Narrowed), Some(pass)) => {
                    let mut moved = false;
                    for c in cells.iter_mut() {
                        let Some(f) = pass.fresh.get(&c.ck).copied().filter(|_| !pass.faulted.contains(&c.ck.0)) else { continue };
                        let Some(fresh) = iv_bounds(&self.h, &self.v, f) else { continue };
                        let next = narrow_iv(c.cur, fresh, c.raised);
                        if next != c.cur {
                            let (before, after) = (mk_iv(&mut self.h, &self.v, c.cur.0, c.cur.1), mk_iv(&mut self.h, &self.v, next.0, next.1));
                            c.steps.push([before, f, after]);
                            c.cur = next;
                            moved = true;
                        }
                    }
                    if !moved {
                        break;
                    }
                }
                (Err(e), _) => return Err(e),
                // a wall cut the pass: what was narrowed so far stands
                (Ok(_), _) => break,
            }
        }
        for c in cells {
            if !c.steps.is_empty() {
                let to = mk_iv(&mut self.h, &self.v, c.cur.0, c.cur.1);
                self.narrow_out.insert(c.ck, (c.x, to, c.steps));
            }
        }
        Ok(())
    }

    /// The widened cells of a descending pass stand in the store at their
    /// values, as the cells of a lattice do, so that the rules read them.
    fn seed_narrowing(&mut self) -> Result<(), Halt> {
        let Some(nr) = self.narrowing.take() else { return Ok(()) };
        let mut front = Front::default();
        for (ck, x) in &nr.frozen {
            let mut args: Vec<Term> = ck.2.to_vec();
            args.push(*x);
            let (id, _) = self.store.put(&self.h, ck.0, ck.1, &args, F_TICK);
            self.lat_cur.insert(ck.clone(), id);
            let crel = self.join_rels[&ck.0];
            self.record_firing(id, crel, crel, Vec::new(), &mut front)?;
        }
        self.narrowing = Some(nr);
        Ok(())
    }

    /// A descending pass has what it came for when every relation it holds a
    /// cell of is about to close: the contributions to them are all made. A
    /// rule that faulted on the way (`E in I` over a widened `[0,inf)`)
    /// contributed nothing, and what it would have is unknown: the cells of
    /// every relation in its recursion are left as they were.
    fn narrow_gathered(&mut self, due: &[Sym]) -> Result<(), Halt> {
        let Some(nr) = self.narrowing.as_mut() else { return Ok(()) };
        for p in due {
            nr.left.remove(p);
        }
        if !nr.left.is_empty() {
            return Ok(());
        }
        let met: Vec<Sym> = self.lat_pending.iter().filter(|x| x.reason != self.v.widened_reason).map(|x| x.close).collect();
        if !met.is_empty() {
            let frozen: HashSet<Sym> = nr.frozen.keys().map(|k| k.0).collect();
            let nr_cells: Vec<Sym> = frozen.iter().copied().collect();
            let deps = self.rel_deps();
            let faulted: Vec<Sym> = frozen
                .into_iter()
                .filter(|&p| met.iter().any(|&c| brk!("narrow_fault_ignored" => false; c == p || reaches_in(&deps, p, c))))
                .collect();
            // A FAULT THAT FEEDS A WIDENED CELL FROM OUTSIDE ITS RECURSION never meets a descent: the first pass
            // left the cell a hole (what a hole's rule reads is unknown, so the cell inherits it) and it is not
            // widened to narrow, and a descent fires on the inputs the first pass ended with. The cell is left as
            // it was all the same, and the case is asserted away in a debug build.
            debug_assert!(
                !met.iter().any(|&c| nr_cells.iter().any(|&p| c != p && reaches_in(&deps, p, c) && !reaches_in(&deps, c, p))),
                "a fault outside the recursion of a widened cell reached it in a descent, which the first pass left a hole"
            );
            if let Some(nr) = self.narrowing.as_mut() {
                nr.faulted.extend(faulted);
            }
        }
        Err(Halt::Narrowed)
    }

    /// One firing of `id` by `rule`, with its step, its row (charged to the
    /// rule `charge`, whose hole a space wall writes) and its `derived_by`.
    fn record_firing(&mut self, id: FactId, rule: Sym, charge: Sym, prems: Vec<PremRef>, out: &mut Front) -> Result<(), Halt> {
        let tick = self.store.tick;
        if !self.store.support(id, Witness { rule, tick, prems }) {
            return Ok(());
        }
        self.bump_steps()?;
        self.charge_row(Some(charge), true)?;
        self.note_derived_by(id, rule, out);
        Ok(())
    }

    /// The `derived_by` row of a firing of `id` by `rule` at this tick.
    fn note_derived_by(&mut self, id: FactId, rule: Sym, out: &mut Front) {
        if self.no_provenance {
            return;
        }
        let rec = self.store.rec(id);
        let args = self.store.args(id).to_vec();
        let ft = fact_term(&mut self.h, &self.v, rec.rel, rec.persp, &args);
        let db_args = [ft, Term::atom(rule), Term::int(self.store.tick as i64)];
        let (dbid, new) = self.store.put(&self.h, self.v.derived_by, self.v.kernel_persp, &db_args, 0);
        if new {
            out.note(self.v.derived_by, dbid);
        }
    }

    /// Did every rule that contributed `x` from a superseded value contribute
    /// at least as much at the same key from values that stand? Once found
    /// so, a contribution is not asked again.
    fn join_refired(&mut self, l: Sym, x: FactId) -> Result<bool, Halt> {
        if self.join_checked.contains(&x) {
            return Ok(true);
        }
        let rec = self.store.rec(x);
        let args = self.store.args(x).to_vec();
        let n = args.len();
        let (op, cx) = (self.lattices[&l].1, args[n - 1]);
        let ck: LatKey = (l, rec.persp, args[..n - 1].into());
        let mut rules: Vec<Sym> = self.store.firings(x).into_iter().map(|(r, _, _)| r).collect();
        rules.sort_unstable();
        rules.dedup();
        // Every rule of x must have a standing firing, by the same rule, of a
        // contribution at least as large. Searched newest first and stopped
        // once every rule has one: the contribution that answers is almost
        // always the latest, and walking the whole history per stale
        // contribution was cubic in a cell's history (facts/findings.rofl,
        // join scale).
        let mut open: Vec<Sym> = rules;
        for y in self.join_contributions(&ck).into_iter().rev() {
            if open.is_empty() {
                break;
            }
            if y == x {
                continue;
            }
            let cy = *self.store.args(y).last().unwrap();
            for (ry, _, ps) in self.store.firings(y) {
                let Some(k) = open.iter().position(|r| *r == ry) else { continue };
                if !ps.iter().any(|p| matches!(p, PremRef::Fact(f) if self.lat_superseded.contains(f)))
                    && self.join_leq(op, cx, cy)?
                {
                    open.swap_remove(k);
                }
            }
        }
        let ok = open.is_empty();
        if ok {
            self.join_checked.insert(x);
            return Ok(true);
        }
        // A rule whose firing on the value that replaced x's faulted (an
        // `arith_overflow`, an `unbounded_members`: `lattice_fault`) made no
        // contribution to compare: what it would have contributed is
        // unknown, and the close holes the cell for it. Not cached: the fault
        // answers only while every fact its firing read still stands.
        open.retain(|r| brk!("join_fault_unexcused" => true; !self.fault_stands(*r, &ck)));
        Ok(open.is_empty())
    }

    /// Did a rule that fired `x` fault on firing again, from facts that all
    /// stand, with a conclusion in x's relation?
    fn faulted_refire(&self, x: FactId) -> bool {
        if brk!("refire_fault_unexcused" => true; false) {
            return false;
        }
        let rel = self.store.rec(x).rel;
        let rules: Vec<Sym> = self.store.firings(x).into_iter().map(|(r, _, _)| r).collect();
        self.lat_pending.iter().any(|f| {
            f.rule.is_some_and(|r| rules.contains(&r))
                && f.what.as_ref().is_some_and(|u| u.rel() == rel)
                && f.facts.iter().all(|g| self.store.alive(*g))
        })
    }

    /// Is a fault of `rule` pending on the cell `ck` (or on every cell of its
    /// relation), from a firing every fact of which still stands?
    fn fault_stands(&self, rule: Sym, ck: &LatKey) -> bool {
        self.lat_pending.iter().any(|x| {
            x.rule == Some(rule)
                && match &x.what {
                    Some(Unknown::Cell(c)) => c == ck,
                    Some(Unknown::Rel(p)) => *p == ck.0,
                    _ => false,
                }
                && x.facts.iter().all(|f| self.store.alive(*f))
        })
    }

    /// `a ⊑ b` in a join lattice; a side outside the carrier is a defect.
    fn join_leq(&self, op: AggOp, a: Term, b: Term) -> Result<bool, Halt> {
        op.join_leq(&self.h, &self.v, a, b).map_err(|_| off_carrier(op))
    }

    /// The contributions of a join cell that still stand.
    fn join_contributions(&self, ck: &LatKey) -> Vec<FactId> {
        self.join_contribs.get(ck).map_or(Vec::new(), |v| v.iter().copied().filter(|f| self.store.alive(*f)).collect())
    }

    /// What a Cover counts, of a contribution `c` to a cell holding `v`: a
    /// set's elements, a bitset's bits, and of an interval the two ends of
    /// `v` it reaches (0 the low, 1 the high). A set of contributions joins
    /// to `v` exactly when together they count every one of `v`'s own, each
    /// of them below `v`.
    fn cover_atoms(&self, op: AggOp, c: Term, v: Term) -> Vec<Term> {
        match op {
            AggOp::Union => set_elems(&self.h, &self.v, c).map_or(Vec::new(), |xs| xs.to_vec()),
            AggOp::BitOr => {
                let n = c.as_int().unwrap_or(0);
                (0..60).filter(|b| n >> b & 1 == 1).map(Term::int).collect()
            }
            _ => {
                let ((l1, h1), (l2, h2)) = (iv_bounds(&self.h, &self.v, c).unwrap_or((1, 0)), iv_bounds(&self.h, &self.v, v).unwrap_or((0, 0)));
                let mut out = Vec::new();
                if l1 == l2 {
                    out.push(Term::int(0));
                }
                if h1 == h2 {
                    out.push(Term::int(1));
                }
                out
            }
        }
    }

    /// THE COVER OF EACH CELL of the closing join lattices `due`: of the
    /// contributions lower than the cell's fact, taken in the canonical order
    /// — height, then the contribution's text — each that counts something
    /// the ones before it did not, and then, in the same order, none that the
    /// rest already count in full: canonical, irredundant, and joining to the
    /// value, which the cell's fact is then concluded from, by its one firing.
    ///
    /// WELL-FOUNDED BY HEIGHT. The heights are taken once, before any cell's
    /// firing is replaced: the contributions a value was reached by are all
    /// lower than it and together count all of it, so a Cover of lower ones
    /// always exists, and a member is explained only by its lowest firings
    /// (one reading a fact no lower than itself is dropped, and with it any
    /// that rests on the cell). Those heights then rank every fact of the new
    /// graph strictly, so no derivation of a cell reads the cell.
    fn join_covers(&mut self, due: &[Sym]) -> Result<(), Halt> {
        let mut joins: Vec<Sym> = due.iter().copied().filter(|p| self.join_rels.contains_key(p)).collect();
        if joins.is_empty() {
            return Ok(());
        }
        joins.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        // Ordered by key without spelling one: a key holds the whole value,
        // and spelling every cell's and every contribution's was quadratic
        // text on a large set (facts/findings.rofl, join scale).
        let mut cells: Vec<(Sym, FactId)> = Vec::new();
        for p in &joins {
            cells.extend(self.store.rel_all(&self.h, *p).into_iter().map(|f| (*p, f)));
        }
        cells.sort_by(|a, b| self.store.cmp_key(&self.h, a.1, b.1));
        let mut roots: Vec<FactId> = cells.iter().map(|c| c.1).collect();
        for (ck, cs) in &self.join_contribs {
            if joins.contains(&ck.0) {
                roots.extend(cs.iter().copied().filter(|f| self.store.alive(*f)));
            }
        }
        let mut memo: HashMap<FactId, u32> = HashMap::new();
        let _ = self.store.heights(&roots, &mut memo);
        let mut plan: Vec<(FactId, Sym, Vec<FactId>)> = Vec::new();
        for (p, f) in cells {
            let (op, crel) = (self.lattices[&p].1, self.join_rels[&p]);
            let rec = self.store.rec(f);
            let args = self.store.args(f).to_vec();
            let n = args.len();
            let v = args[n - 1];
            let ck: LatKey = (p, rec.persp, args[..n - 1].into());
            let Some(&hf) = memo.get(&f) else {
                return Err(Halt::Bug(format!("{} has no well-founded height", self.store.key(&self.h, f))));
            };
            let mut order: Vec<(u32, FactId)> = self
                .join_contributions(&ck)
                .into_iter()
                .filter(|c| memo.get(c).is_some_and(|h| *h < hf))
                .map(|c| (memo[&c], c))
                .collect();
            let (st, hp) = (&self.store, &self.h);
            order.sort_by(|a, b| brk!("join_cover_text_order" => st.cmp_key(hp, a.1, b.1); a.0.cmp(&b.0).then_with(|| st.cmp_key(hp, a.1, b.1))));
            let want = self.cover_atoms(op, v, v);
            let mut count: HashMap<Term, usize> = HashMap::new();
            let mut chosen: Vec<(FactId, Vec<Term>)> = Vec::new();
            // a value with nothing to count (the empty bitset) is the
            // least contribution alone
            if want.is_empty() {
                chosen.extend(order.first().map(|x| (x.1, Vec::new())));
            }
            for (_, c) in order {
                let cv = *self.store.args(c).last().unwrap();
                if !self.join_leq(op, cv, v)? {
                    return Err(Halt::Bug(format!("{} is not below its cell {}", self.store.key(&self.h, c), self.store.key(&self.h, f))));
                }
                let atoms = self.cover_atoms(op, cv, v);
                if !want.is_empty() && brk!("join_cover_every" => true; atoms.iter().any(|a| !count.contains_key(a))) {
                    for a in &atoms {
                        *count.entry(*a).or_default() += 1;
                    }
                    chosen.push((c, atoms));
                }
            }
            if want.iter().any(|a| !count.contains_key(a)) || chosen.is_empty() {
                return Err(Halt::Bug(format!("{}: the contributions below it do not join to it", self.store.key(&self.h, f))));
            }
            let mut i = 0;
            while i < chosen.len() && !want.is_empty() {
                if brk!("join_cover_redundant" => false; chosen[i].1.iter().all(|a| count[a] >= 2)) {
                    for a in &chosen[i].1 {
                        *count.get_mut(a).unwrap() -= 1;
                    }
                    chosen.remove(i);
                } else {
                    i += 1;
                }
            }
            plan.push((f, crel, chosen.into_iter().map(|(c, _)| c).collect()));
        }
        for (f, crel, cover) in plan {
            for &c in &cover {
                let hc = memo[&c];
                for (rule, _, prems) in self.store.firings(c) {
                    let high = prems.iter().any(|p| match p {
                        PremRef::Fact(q) => memo.get(q).is_none_or(|h| *h >= hc),
                        PremRef::Cell(x) => self.store.cell(*x).height >= hc,
                        PremRef::Neg(_) | PremRef::Bi(_) => false,
                    });
                    if brk!("join_self_firing_kept" => false; high) {
                        self.store.remove_firing(c, rule, &prems);
                        if !self.store.fired_by(c, rule) {
                            self.retire_derived_by(c, rule);
                        }
                    }
                }
            }
            for (rule, _, prems) in self.store.firings(f) {
                self.store.remove_firing(f, rule, &prems);
            }
            let prems: Vec<PremRef> = cover.into_iter().map(PremRef::Fact).collect();
            self.store.support(f, Witness { rule: crel, tick: self.store.tick, prems });
            let mut front = Front::default();
            self.note_derived_by(f, crel, &mut front);
            merge_front(&mut self.cur_front, front);
            self.height_memo.remove(&f);
        }
        Ok(())
    }

    /// AFTER THE COVERS, what no cover and no standing fact reaches is
    /// dropped: a contribution of a closing join lattice, and a value it
    /// replaced, that nothing kept rests on.
    fn join_gc(&mut self, due: &[Sym]) {
        let joins: Vec<Sym> = due.iter().copied().filter(|p| self.join_rels.contains_key(p)).collect();
        if joins.is_empty() {
            return;
        }
        let crels: HashSet<Sym> = joins.iter().map(|p| self.join_rels[p]).collect();
        let mut nodes: HashSet<FactId> = HashSet::new();
        for (ck, cs) in &self.join_contribs {
            if joins.contains(&ck.0) {
                nodes.extend(cs.iter().copied().filter(|f| self.store.alive(*f)));
            }
        }
        nodes.extend(self.lat_superseded.iter().copied().filter(|f| joins.contains(&self.store.rec(*f).rel)));
        let mut marked: HashSet<FactId> = HashSet::new();
        let mut stack: Vec<FactId> = Vec::new();
        for x in self.store.citers_of(&nodes) {
            let kept = (self.store.alive(x) && !crels.contains(&self.store.rec(x).rel)) || (self.lat_superseded.contains(&x) && !nodes.contains(&x));
            if kept {
                stack.extend(self.store.fact_premises(x).into_iter().filter(|g| nodes.contains(g)));
            }
        }
        while let Some(g) = stack.pop() {
            if marked.insert(g) {
                stack.extend(self.store.fact_premises(g).into_iter().filter(|q| nodes.contains(q)));
            }
        }
        let mut drop: Vec<FactId> = nodes.difference(&marked).copied().collect();
        drop.sort_unstable();
        for g in drop {
            if self.lat_superseded.remove(&g) {
                self.store.drop_firings(g);
            } else {
                self.retire_fact(g);
            }
        }
        let live = &self.lat_superseded;
        self.lat_history.retain(|_, v| {
            v.retain(|f| live.contains(f));
            !v.is_empty()
        });
        let store = &self.store;
        self.join_contribs.retain(|_, v| {
            v.retain(|f| store.alive(*f));
            !v.is_empty()
        });
    }

    /// A contribution to a lattice cell: `Some(cell)` to store it (a new
    /// cell, a tie, or a better value, whose old fact is superseded first),
    /// `None` to drop it (dominated, or outside the carrier: that is a fault
    /// the close decides).
    fn lattice_admit(&mut self, rel: Sym, persp: Sym, args: &[Term], op: AggOp, prems: &[PremRef]) -> Result<Option<LatKey>, Halt> {
        let n = args.len();
        let ck: LatKey = (rel, persp, args[..n - 1].into());
        if self.lat_closed.contains(&rel) {
            // Only a table that ranks the lattice below what it reads can do
            // this; the peel cannot.
            let msg = format!("the lattice {} received a contribution after it closed", self.h.name(rel));
            return Err(match self.mode {
                Mode::Strata => Halt::Strat(
                    format!("program rejected: {msg}: the stratum table ranks it below a relation it reads"),
                    String::new(),
                ),
                Mode::Rounds => Halt::Bug(msg),
            });
        }
        let x = match op.lift(&self.v, args[n - 1]) {
            Ok(x) => x,
            Err(reason) => {
                let facts = fact_prems(prems);
                self.lat_pending.push(LatFault { close: rel, what: Some(Unknown::Cell(ck)), rule: None, reason, facts });
                return Ok(None);
            }
        };
        let Some(old) = self.lat_cur.get(&ck).copied().filter(|f| self.store.alive(*f)) else {
            return Ok(Some(ck));
        };
        let ov = op
            .lift(&self.v, self.store.args(old)[n - 1])
            .map_err(|_| Halt::Bug("a lattice cell holds a value outside its carrier".into()))?;
        match op.insert(&self.v, Some(ov), x) {
            Ok(Step::Unchanged) => brk!("lattice_keep_dominated" => Ok(Some(ck)); Ok(None)),
            Ok(Step::Tied) => Ok(Some(ck)),
            Ok(Step::Improved(_)) => {
                brk!("lattice_max_stuck" => if op == AggOp::Max { return Ok(None) }; ());
                brk!("lattice_no_retire" => (); self.supersede(old, &ck));
                self.lat_improved.push(old);
                self.lattice_improvements += 1;
                Ok(Some(ck))
            }
            Err(_) => Err(Halt::Bug("a lattice value in its carrier did not compare".into())),
        }
    }

    /// The length of the key of a cell of `rel` at `arity`: a lattice's head
    /// prefix less its value, a subsumptive relation's declared key.
    fn cell_keylen(&self, rel: Sym, arity: usize) -> Option<usize> {
        match self.lattices.get(&rel) {
            Some(&(n, AggOp::Dominance)) if n == arity => Some(self.subs[&rel].keylen),
            Some(&(n, _)) if n == arity => Some(n - 1),
            _ => None,
        }
    }

    /// IS `lo` DOMINATED BY `hi`? Both are argument lists of `rel`, one key.
    /// Each dominance rule is asked in canonical order, its body solved with
    /// the two facts' variables bound; one solution is a yes. A body that
    /// could read, under not, something a hole left unknown decides nothing;
    /// one that failed for a builtin's error, or could read an unknown
    /// positively, and found no solution, is not known either.
    fn dominated(&mut self, rel: Sym, lo: &[Term], hi: &[Term]) -> Result<DomV, Halt> {
        self.dominated_as(rel, lo, hi, true)
    }

    /// `dominated`, charged against the budget (an evaluation) or not (a
    /// question asked of a world already evaluated).
    fn dominated_as(&mut self, rel: Sym, lo: &[Term], hi: &[Term], charge: bool) -> Result<DomV, Halt> {
        let sub = self.subs[&rel].clone();
        let mut undecided: Option<DomV> = None;
        for (d, plan) in &sub.doms {
            if charge {
                self.bump_steps()?;
            }
            let mut s = Some(Subst::new());
            for (t, x) in d.lo.args.iter().zip(lo).chain(d.hi.args.iter().zip(hi)) {
                let Some(cur) = s.take() else { break };
                s = unify(&self.h, *t, *x, &cur);
            }
            let Some(s) = s else { continue };
            if brk!("dominance_unknown_decides" => false; !self.lat_spread.is_empty() || !self.lat_plain.is_empty()) {
                for b in plan {
                    let (neg, lits) = (matches!(b, BodyElem::Neg(_)), b.lits_deep());
                    for l in lits {
                        if let Some(u) = self.read_unknown(l, &s, true) {
                            if neg {
                                return Ok(DomV::Unknown(u, d.id));
                            }
                            undecided.get_or_insert(DomV::Unknown(u, d.id));
                        }
                    }
                }
            }
            let saved = (self.fault, self.fault_count, self.last_fault, self.last_fault_rule, self.firing);
            self.firing = false;
            let sols = self.solve_body(plan, s, 0, None, None);
            let (faulted, reason) = (self.fault_count > saved.1, self.last_fault);
            (self.fault, self.fault_count, self.last_fault, self.last_fault_rule, self.firing) = saved;
            if !sols?.is_empty() {
                return Ok(DomV::Yes(d.id));
            }
            if faulted && brk!("dominance_fault_is_no" => false; true) {
                undecided.get_or_insert(DomV::Fault(reason.unwrap_or(self.v.arith_type_reason), d.id));
            }
        }
        Ok(undecided.unwrap_or(DomV::No))
    }

    /// A fact term of `rel` in `persp` with these arguments.
    fn sub_fact(&mut self, rel: Sym, persp: Sym, args: &[Term]) -> Term {
        fact_term(&mut self.h, &self.v, rel, persp, args)
    }

    /// The arguments of a value of the cell `ck`.
    fn sub_args(ck: &LatKey, vals: &[Term]) -> Vec<Term> {
        let mut a = ck.2.to_vec();
        a.extend_from_slice(vals);
        a
    }

    /// A CONFLICT: the cell's dominance is no strict partial order over the
    /// values it was given (a value dominates itself, two dominate each other,
    /// or a value is dominated by one no member of the front dominates), so
    /// which values are its front is not decided. The cell is a hole when its
    /// relation closes, `conflict`, its meta the parties.
    fn sub_conflict(&mut self, ck: &LatKey, cause: &str, parties: Vec<Term>) {
        if brk!("dominance_conflict_ignored" => true; false) {
            return;
        }
        let reason = self.h.intern(cause);
        let known = self.sub_parties.contains_key(ck);
        let ps = self.sub_parties.entry(ck.clone()).or_default();
        for p in parties {
            if !ps.contains(&p) {
                ps.push(p);
            }
        }
        if !known {
            self.lat_pending.push(LatFault { close: ck.0, what: Some(Unknown::Cell(ck.clone())), rule: None, reason, facts: Vec::new() });
        }
    }

    /// A dominance question not answered: the cell is a hole when its
    /// relation closes, with the fault's reason (and the dominance rule's
    /// hole), or inherited from the unknown its body could read.
    fn sub_undecided(&mut self, ck: &LatKey, v: DomV) {
        match v {
            DomV::Fault(reason, rule) => {
                self.lat_pending.push(LatFault { close: ck.0, what: Some(Unknown::Cell(ck.clone())), rule: Some(rule), reason, facts: Vec::new() });
            }
            DomV::Unknown(u, rule) => {
                let withdrawn = self.h.intern("support_withdrawn");
                self.unk_edges.push((Node::Unk(Unknown::Cell(ck.clone())), Node::Unk(u.clone())));
                self.lat_unknown.entry(Unknown::Cell(ck.clone())).or_insert(Some((u, rule)));
                self.lat_pending.push(LatFault { close: ck.0, what: Some(Unknown::Cell(ck.clone())), rule: None, reason: withdrawn, facts: Vec::new() });
            }
            DomV::No | DomV::Yes(_) => {}
        }
    }

    /// THE INSERT OF A SUBSUMPTIVE CELL (docs/aggregates.md, "Subsumption,
    /// as built"). A value already standing is a tie, another firing; one
    /// dominated this evaluation stays dominated; a value that dominates
    /// itself is a conflict. Otherwise it is compared with every value
    /// standing at its key: dominated by one, it is dropped (a conflict too
    /// when it dominates that one back); else every value it dominates is
    /// superseded — no answer, its firings kept as the cell's history and its
    /// consequences withdrawn at the settle, as an improved lattice value's
    /// are — and it joins the front. A comparison not answered (a fault, an
    /// unknown) is read as no dominance here; the close judges the front
    /// against every value given, and holes the cell then (`sub_check`).
    fn sub_admit(&mut self, rel: Sym, persp: Sym, args: &[Term], rid: Sym) -> Result<Option<LatKey>, Halt> {
        let k = self.subs[&rel].keylen;
        let ck: LatKey = (rel, persp, args[..k].into());
        if self.lat_closed.contains(&rel) {
            let msg = format!("the subsumptive relation {} received a value after it closed", self.h.name(rel));
            return Err(match self.mode {
                Mode::Strata => Halt::Strat(format!("program rejected: {msg}: the stratum table ranks it below a relation it reads"), String::new()),
                Mode::Rounds => Halt::Bug(msg),
            });
        }
        let vals: Box<[Term]> = args[k..].into();
        let me = self.sub_given(&ck, &vals);
        if me.1 {
            self.charge_row(Some(rid), true)?;
        }
        let me = me.0;
        if let Some(id) = self.store.get_any(rel, persp, args) {
            if self.store.alive(id) {
                return Ok(Some(ck));
            }
            if self.lat_superseded.contains(&id) {
                return Ok(None);
            }
        }
        match self.sub_dom(&ck, (me, args), (me, args))? {
            DomV::Yes(_) => {
                let f = self.sub_fact(rel, persp, args);
                self.sub_conflict(&ck, "dominance_cycle", vec![f]);
                return Ok(None);
            }
            v => brk!("dominance_self_fault_ignored" => (); self.sub_undecided(&ck, v)),
        }
        let standing: Vec<FactId> = self.sub_cur.get(&ck).map(|v| v.iter().copied().filter(|f| self.store.alive(*f)).collect()).unwrap_or_default();
        let standing: Vec<(FactId, u32, Vec<Term>)> = standing
            .into_iter()
            .map(|s| {
                let sargs = self.store.args(s).to_vec();
                (s, self.sub_seen_set[&(ck.clone(), sargs[k..].into())], sargs)
            })
            .collect();
        for (_, si, sargs) in &standing {
            let (si, sargs) = (*si, sargs.clone());
            if brk!("dominance_keep_dominated" => false; matches!(self.sub_dom(&ck, (me, args), (si, &sargs))?, DomV::Yes(_))) {
                self.sub_beaten.entry((ck.clone(), vals.clone())).or_insert_with(|| sargs[k..].into());
                return Ok(None);
            }
        }
        for (s, si, sargs) in standing {
            if matches!(self.sub_dom(&ck, (si, &sargs), (me, args))?, DomV::Yes(_)) {
                self.sub_beaten.entry((ck.clone(), sargs[k..].into())).or_insert_with(|| vals.clone());
                brk!("dominance_no_retire" => (); self.supersede(s, &ck));
                self.lat_improved.push(s);
                self.lattice_improvements += 1;
            }
        }
        let store = &self.store;
        if let Some(front) = self.sub_cur.get_mut(&ck) {
            front.retain(|f| store.alive(*f));
        }
        Ok(Some(ck))
    }

    /// Note a value given to a cell: its place in `sub_seen`, and whether it
    /// is new.
    fn sub_given(&mut self, ck: &LatKey, vals: &[Term]) -> (u32, bool) {
        let sv: SubVal = (ck.clone(), vals.into());
        if let Some(i) = self.sub_seen_set.get(&sv) {
            return (*i, false);
        }
        let seen = self.sub_seen.entry(ck.clone()).or_default();
        let i = seen.len() as u32;
        seen.push(sv.1.clone());
        self.sub_seen_set.insert(sv, i);
        (i, true)
    }

    /// `dominated` over two values of one cell, each with its place in
    /// `sub_seen`: asked once an evaluation, the answer kept for the close.
    fn sub_dom(&mut self, ck: &LatKey, lo: (u32, &[Term]), hi: (u32, &[Term])) -> Result<DomV, Halt> {
        if let Some(v) = self.sub_memo.get(ck).and_then(|m| m.get(&(lo.0, hi.0))) {
            return Ok(v.clone());
        }
        let v = self.dominated(ck.0, lo.1, hi.1)?;
        match self.sub_memo.get_mut(ck) {
            Some(m) => {
                m.insert((lo.0, hi.0), v.clone());
            }
            None => {
                self.sub_memo.insert(ck.clone(), HashMap::from([((lo.0, hi.0), v.clone())]));
            }
        }
        Ok(v)
    }

    /// A value a better one replaced: no answer and no `derived_by` row, its
    /// firings kept as the cell's history (`lat_superseded`).
    fn supersede(&mut self, old: FactId, ck: &LatKey) {
        if !self.no_provenance {
            let mut rules: Vec<Sym> = self.store.firing_rules(old);
            rules.sort();
            rules.dedup();
            for r in rules {
                self.retire_derived_by(old, r);
            }
        }
        self.store.retire_keeping_firings(old);
        self.lat_superseded.insert(old);
        self.lat_history.entry(ck.clone()).or_default().push(old);
    }

    /// Retire a derived fact and the `derived_by` rows its firings wrote.
    fn retire_fact(&mut self, id: FactId) {
        if !self.no_provenance {
            let mut rules: Vec<Sym> = self.store.firing_rules(id);
            rules.sort();
            rules.dedup();
            for r in rules {
                self.retire_derived_by(id, r);
            }
        }
        self.store.retire(id);
    }

    fn retire_derived_by(&mut self, id: FactId, rule: Sym) {
        if self.no_provenance {
            return;
        }
        let rec = self.store.rec(id);
        let (rel, persp) = (rec.rel, rec.persp);
        let args = self.store.args(id).to_vec();
        let ft = fact_term(&mut self.h, &self.v, rel, persp, &args);
        let db = [ft, Term::atom(rule), Term::int(self.store.tick as i64)];
        if let Some(d) = self.store.get(self.v.derived_by, self.v.kernel_persp, &db) {
            self.store.retire(d);
        }
    }

    /// NO VALUE FOR THIS CELL THIS TICK: its fact is withdrawn, with the
    /// values it held before, and `hole($lattice(Rel, Persp, Tick, Key),
    /// Reason)` says why. Its lattice is closing or cut, so nothing
    /// contributes to it again.
    fn hole_lattice_cell(&mut self, ck: LatKey, reason: Sym) -> Term {
        let (rel, persp, key) = ck.clone();
        let value = self.lat_cur.get(&ck).copied().filter(|f| self.store.alive(*f)).map(|f| *self.store.args(f).last().unwrap());
        if let Some(f) = self.lat_cur.remove(&ck) {
            if self.store.alive(f) {
                self.retire_fact(f);
                self.lat_dropped.push(f);
            }
        }
        // a subsumptive cell with no known front has none of its values
        for f in brk!("dominance_hole_keeps_front" => Vec::new(); self.sub_cur.remove(&ck).unwrap_or_default()) {
            if self.store.alive(f) {
                self.retire_fact(f);
                self.lat_dropped.push(f);
            }
        }
        self.withdraw_history(&ck);
        self.withdraw_contributions(&ck);
        let kl = self.h.list(&key);
        let tick = Term::int(self.store.tick as i64);
        let marker = self.h.mkf(self.v.s_lattice, &[Term::atom(rel), Term::atom(persp), tick, kl]);
        if reason == self.v.widened_reason {
            if let Some(val) = value {
                let steps = self.lat_widened.get(&ck).cloned().unwrap_or_default();
                self.widened_x.insert(ck.clone(), val);
                let (shown, narrowed) = match self.narrow_out.get(&ck) {
                    Some((_, to, ns)) => (brk!("narrow_meta_stale" => val; *to), ns.clone()),
                    None => (val, Vec::new()),
                };
                self.widened_marks.insert(marker, (shown, steps, narrowed));
            }
        }
        if let Some(ps) = self.sub_parties.remove(&ck) {
            self.conflict_marks.insert(marker, ps);
        }
        self.cell_hole(marker, reason);
        self.lattice_hole_edges(Node::Unk(Unknown::Cell(ck)), marker, reason);
        marker
    }

    /// A cell with no value has no history either: a bound it once met says
    /// nothing about a value that is not known.
    fn withdraw_history(&mut self, ck: &LatKey) {
        for f in self.lat_history.remove(ck).unwrap_or_default() {
            if self.lat_superseded.remove(&f) {
                self.store.drop_firings(f);
                self.lat_dropped.push(f);
            }
        }
    }

    /// A join cell with no value has no Cover: its contributions go with it.
    fn withdraw_contributions(&mut self, ck: &LatKey) {
        for c in self.join_contribs.remove(ck).unwrap_or_default() {
            if brk!("join_hole_keeps_contributions" => false; self.store.alive(c)) {
                self.retire_fact(c);
            }
        }
    }

    /// Every cell of a relation at once, when the key a failure belongs to
    /// is not known: `hole($lattice(Rel), Reason)`.
    fn hole_lattice_rel(&mut self, rel: Sym, reason: Sym) {
        if self.lat_holed_rel.insert(rel) {
            for f in self.store.rel_all(&self.h, rel) {
                self.retire_fact(f);
                self.lat_dropped.push(f);
            }
            self.lat_cur.retain(|k, _| k.0 != rel);
            self.sub_cur.retain(|k, _| k.0 != rel);
            let cells: Vec<LatKey> = self.lat_history.keys().filter(|k| k.0 == rel).cloned().collect();
            for ck in cells {
                self.withdraw_history(&ck);
            }
            let cells: Vec<LatKey> = self.join_contribs.keys().filter(|k| k.0 == rel).cloned().collect();
            for ck in cells {
                self.withdraw_contributions(&ck);
            }
        }
        let marker = self.h.mkf(self.v.s_lattice, &[Term::atom(rel)]);
        self.cell_hole(marker, reason);
        self.lattice_hole_edges(Node::Unk(Unknown::Rel(rel)), marker, reason);
    }

    /// A lattice's hole and what it leaves unknown rest on each other: a
    /// fault is the unknown's root, and a withdrawal rests on whatever
    /// reached the cell.
    fn lattice_hole_edges(&mut self, u: Node, marker: Term, reason: Sym) {
        self.unk_edges.push((u.clone(), Node::Hole(marker)));
        if self.h.name(reason) == "support_withdrawn" {
            self.unk_edges.push((Node::Hole(marker), u));
        }
    }

    /// A builtin failed for an error in a rule a lattice decides
    /// (`ERule::lat_close`), held until that lattice closes (`LatFault`). When
    /// the rule concludes into the lattice, the contribution it would have
    /// made is unknown, so the cell it was for (or, when its key is not
    /// bound, every cell of the relation) is a hole — never the ⊕ of the
    /// contributions that survived.
    fn lattice_fault(&mut self, rule_id: Option<Sym>, s: &Subst, prems: &[PremRef]) -> Result<(), Halt> {
        let Some(rid) = rule_id else { return Ok(()) };
        let Some(r) = self.rule_of(rid) else { return Ok(()) };
        let Some(close) = r.lat_close else { return Ok(()) };
        let reason = self.last_fault.unwrap_or(self.v.arith_type_reason);
        let what = self.conclusion_unknown(&r, s);
        self.lat_pending.push(LatFault { close, what, rule: Some(rid), reason, facts: fact_prems(prems) });
        Ok(())
    }

    /// What a rule's conclusion under `s` is, as something unknown: its
    /// lattice cell, its tuple, or, where the key is not bound, the whole
    /// relation. None for a conclusion `@next` or into a closed lattice.
    fn conclusion_unknown(&mut self, r: &ERule, s: &Subst) -> Option<Unknown> {
        let head = &r.clause.head;
        if head.temporal == Temporal::Next || self.is_lattice_lit(head.rel, head.args.len()) && self.lat_closed.contains(&head.rel) {
            return None;
        }
        self.head_unknown(r, s)
    }

    /// A literal under `s` as something unknown: its tuple, an argument not
    /// bound standing for any value, or every tuple when the book is not bound.
    fn lit_unknown(&mut self, l: &Lit, s: &Subst) -> Unknown {
        let Some(p) = walk(&self.h, l.persp, s).as_atom() else { return Unknown::Rel(l.rel) };
        let args: Vec<Term> = l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect();
        let Some(s2) = self.bind_unknown(&args, Subst::new()) else { return Unknown::Rel(l.rel) };
        let args: Vec<Term> = args.iter().map(|t| resolve(&mut self.h, *t, &s2)).collect();
        Unknown::Tuple(l.rel, p, args.into())
    }

    /// The head of `r` under `s` as something unknown, whatever its tick.
    fn head_unknown(&mut self, r: &ERule, s: &Subst) -> Option<Unknown> {
        let head = &r.clause.head;
        let persp = walk(&self.h, head.persp, s).as_atom();
        let kl = self.cell_keylen(head.rel, head.args.len());
        let lattice = kl.is_some();
        let n = kl.unwrap_or(head.args.len());
        let key: Vec<Term> = head.args[..n].iter().map(|a| resolve(&mut self.h, *a, s)).collect();
        let Some(p) = persp else { return Some(Unknown::Rel(head.rel)) };
        if !lattice {
            // a tuple with an argument not known is every tuple it could be
            let s2 = self.bind_unknown(&key, Subst::new())?;
            let key: Vec<Term> = key.iter().map(|t| resolve(&mut self.h, *t, &s2)).collect();
            return Some(Unknown::Tuple(head.rel, p, key.into()));
        }
        Some(if key.iter().all(|t| self.h.is_ground(*t) && !self.holds_unknown(*t)) {
            Unknown::Cell((head.rel, p, key.into()))
        } else {
            Unknown::Rel(head.rel)
        })
    }

    /// AFTER A FIXPOINT. A fact that read a value since improved on must also
    /// fire from the value that replaced it — a consumer monotone in it fired
    /// again on it — or the program was not monotone: a defect, unless the
    /// budget cut the evaluation first (`cut`). The firing that read the old
    /// value stays until the close decides it (`settle_stale`).
    ///
    /// Then every withdrawal (a hole) is carried to what rested on it: a
    /// firing that cites a withdrawn fact is removed, and a fact left with no
    /// firing, or with none that is well-founded, is withdrawn in turn; a
    /// lattice cell so withdrawn is a hole, `support_withdrawn`.
    fn lattice_settle(&mut self, cut: bool) -> Result<(), Halt> {
        if self.lat_improved.is_empty() && self.lat_dropped.is_empty() {
            self.store.sweep();
            return Ok(());
        }
        let improved: HashSet<FactId> = std::mem::take(&mut self.lat_improved).into_iter().collect();
        if !cut && brk!("dominance_consequences_kept" => false; true) {
            self.sub_withdraw(&improved)?;
        }
        for x in self.store.citers_of(&improved) {
            if !self.store.alive(x) || self.store.rec(x).base() {
                continue;
            }
            let xrel = self.store.rec(x).rel;
            // a join cell's fact cites the value it replaced: its history,
            // which its Cover replaces at the close
            if self.join_rels.contains_key(&xrel) {
                continue;
            }
            // A CONTRIBUTION READ FROM A VALUE SINCE WIDENED is history: the
            // rule, monotone in it, fired again on the value that replaced
            // it and contributed at least as much at the same key.
            if let Some(&l) = self.join_of.get(&xrel) {
                if !cut && !self.store.fired_without(x, &self.lat_superseded) && !self.join_refired(l, x)? {
                    if let Some(msg) = self.sub_nonmonotone(x) {
                        return Err(Halt::Strat(msg, String::new()));
                    }
                    return Err(Halt::Bug(format!(
                        "{} was contributed from a value since widened, and nothing at least as large was contributed from the value that replaced it: a consumer was not monotone",
                        self.store.key(&self.h, x)
                    )));
                }
                self.lat_stale.insert(x);
                continue;
            }
            // unless the rule's firing on the value that replaced it faulted,
            // from facts that stand: what it would conclude there is unknown,
            // and the close carries that unknown to x's relation (`poison`)
            if !cut && !self.store.fired_without(x, &self.lat_superseded) && !self.faulted_refire(x) {
                if let Some(msg) = self.sub_nonmonotone(x) {
                    return Err(Halt::Strat(msg, String::new()));
                }
                return Err(Halt::Bug(format!(
                    "{} lost every firing when a lattice cell improved: a consumer was not monotone",
                    self.store.key(&self.h, x)
                )));
            }
            self.lat_stale.insert(x);
        }
        let withdrawn = self.h.intern("support_withdrawn");
        let mut dropped: HashSet<FactId> = std::mem::take(&mut self.lat_dropped).into_iter().collect();
        while !dropped.is_empty() {
            let mut left: Vec<FactId> = Vec::new();
            let mut gone: Vec<FactId> = Vec::new();
            let mut lost: HashMap<FactId, (Vec<Sym>, FactId)> = HashMap::new();
            for (f, rules, any, cited) in self.store.drop_firings_citing(&dropped) {
                self.forget_rules(f, &rules);
                if any {
                    left.push(f);
                } else {
                    gone.push(f);
                }
                lost.insert(f, (rules, cited));
            }
            let roots: Vec<FactId> = left
                .into_iter()
                .filter(|f| (self.store.alive(*f) || self.lat_superseded.contains(f)) && !self.store.rec(*f).base())
                .collect();
            if !roots.is_empty() {
                let mut memo: HashMap<FactId, u32> = HashMap::new();
                let _ = self.store.heights(&roots, &mut memo);
                gone.extend(roots.into_iter().filter(|f| !memo.contains_key(f)));
            }
            gone.sort_unstable();
            for f in gone {
                let mut src = None;
                if self.store.alive(f) && !self.store.rec(f).base() {
                    let (mut rules, cited) = lost.remove(&f).unwrap_or((Vec::new(), FactId::MAX));
                    let via = (cited != FactId::MAX && !rules.is_empty()).then(|| (cited, rules[0]));
                    src = via.map(|(g, _)| Node::Unk(self.unknown_of(g)));
                    rules.extend(self.store.firing_rules(f));
                    self.lat_withdrawn.push((f, rules, via));
                }
                // the hole a withdrawn cell becomes rests on what it cited, not
                // on whatever the carry last worked from
                let src = brk!("withdrawn_cell_stale_src" => self.carry_src.clone(); src);
                let saved = (std::mem::replace(&mut self.carry_src, src), std::mem::take(&mut self.carry_more));
                self.withdraw(f, withdrawn);
                (self.carry_src, self.carry_more) = saved;
            }
            dropped = std::mem::take(&mut self.lat_dropped).into_iter().collect();
        }
        self.store.sweep();
        Ok(())
    }

    /// THE CONSEQUENCES OF A DOMINATED VALUE ARE WITHDRAWN (docs/aggregates.md,
    /// "Subsumption, as built"). A value its cell's front dominates is no
    /// answer, and neither is what was concluded from it alone: every fact
    /// of a relation that is no cell, inside the recursion (a read from
    /// outside it fires only once the cell is closed), that no derivation
    /// founds without a dominated value, is retired, and so, in turn, is what
    /// rested on it alone. Each is known not to hold: the values it read are
    /// known to be no answers, so this is no hole and no shrug. The firings
    /// that cited it go. A cell's value that rested on it alone is a consumer
    /// not monotone in the dominance: refused, as `sub_nonmonotone` refuses
    /// one that read the dominated value itself.
    fn sub_withdraw(&mut self, improved: &HashSet<FactId>) -> Result<(), Halt> {
        let dominated: HashSet<FactId> = improved.iter().copied().filter(|f| self.subs.contains_key(&self.store.rec(*f).rel)).collect();
        if dominated.is_empty() {
            return Ok(());
        }
        // what rests on them, through every relation of the recursion
        let mut region: Vec<FactId> = Vec::new();
        let mut in_region: HashSet<FactId> = HashSet::new();
        let mut frontier = dominated;
        while !frontier.is_empty() {
            let mut next: HashSet<FactId> = HashSet::new();
            for y in self.store.citers_of(&frontier) {
                if !self.store.alive(y) || self.store.rec(y).base() {
                    continue;
                }
                if in_region.insert(y) {
                    region.push(y);
                    next.insert(y);
                }
            }
            frontier = next;
        }
        if region.is_empty() {
            return Ok(());
        }
        region.sort_unstable();
        // FOUNDED: a cell's value by any firing, a dominated value it was
        // reached through being its history, as a lattice's is; a fact of no
        // cell by a firing that cites no dominated value, or whose rule
        // concluded it again with a value that dominates each dominated one
        // in its place: a consumer monotone in the dominance, so that value
        // is its history too, as a cell's own is
        let stale: HashSet<FactId> = self.lat_superseded.iter().copied().filter(|f| self.subs.contains_key(&self.store.rec(*f).rel)).collect();
        let cells: HashSet<Sym> = self.lattices.keys().chain(self.join_of.keys()).copied().collect();
        let mut ups: HashMap<FactId, HashSet<FactId>> = HashMap::new();
        for &y in &region {
            for (_, _, ps) in self.store.firings(y) {
                for p in ps {
                    if let PremRef::Fact(g) = p {
                        if stale.contains(&g) && !ups.contains_key(&g) {
                            let d = brk!("dominance_history_unfounded" => HashSet::new(); self.sub_dominators(g));
                            ups.insert(g, d);
                        }
                    }
                }
            }
        }
        let store = &self.store;
        let refired = |head: FactId, rule: Sym, ps: &[PremRef]| {
            store.firings(head).iter().any(|(r, _, qs)| {
                *r == rule
                    && qs.len() == ps.len()
                    && ps.iter().zip(qs).all(|(p, q)| match (p, q) {
                        (PremRef::Fact(g), PremRef::Fact(h)) if stale.contains(g) => ups.get(g).is_some_and(|u| u.contains(h)),
                        _ => true,
                    })
            })
        };
        let mut memo: HashMap<FactId, u32> = HashMap::new();
        let _ = store.heights_where_head(&region, &mut memo, &|head, rule, ps| {
            !cells.contains(&store.rec(head).rel)
                && ps.iter().any(|p| matches!(p, PremRef::Fact(g) if stale.contains(g)))
                && !refired(head, rule, ps)
        });
        let unfounded: Vec<FactId> = region.iter().copied().filter(|f| !memo.contains_key(f)).collect();
        if unfounded.is_empty() {
            return Ok(());
        }
        if let Some(y) = unfounded.iter().copied().find(|f| cells.contains(&self.store.rec(*f).rel)) {
            return Err(Halt::Strat(
                format!(
                    "program rejected: {} rests only on what a dominated value concluded: a consumer inside the recursion is not \
                     monotone in the dominance (docs/aggregates.md, \"Subsumption, as built\")",
                    self.store.key(&self.h, y)
                ),
                String::new(),
            ));
        }
        let gone: HashSet<FactId> = unfounded.iter().copied().collect();
        for x in &unfounded {
            self.retire_fact(*x);
        }
        self.sub_gone.extend(gone.iter().copied());
        for y in self.store.citers_of(&gone) {
            if gone.contains(&y) || self.store.rec(y).base() {
                continue;
            }
            let rules = self.store.drop_firings_of_citing(y, &gone);
            if self.store.alive(y) {
                self.forget_rules(y, &rules);
            }
        }
        Ok(())
    }

    /// The values that dominated `g`, a value of a subsumptive cell: what
    /// beat it, what beat that, and so on.
    fn sub_dominators(&self, g: FactId) -> HashSet<FactId> {
        let rec = self.store.rec(g);
        let args = self.store.args(g);
        let k = self.subs[&rec.rel].keylen;
        let ck: LatKey = (rec.rel, rec.persp, args[..k].into());
        let mut v: Box<[Term]> = args[k..].into();
        let mut seen: HashSet<Box<[Term]>> = HashSet::from([v.clone()]);
        let mut out = HashSet::new();
        while let Some(w) = self.sub_beaten.get(&(ck.clone(), v)) {
            if !seen.insert(w.clone()) {
                break;
            }
            if let Some(h) = self.store.get_any(rec.rel, rec.persp, &Self::sub_args(&ck, w)) {
                out.insert(h);
            }
            v = w.clone();
        }
        out
    }

    /// A CONSUMER NOT MONOTONE IN A DOMINANCE: `x` was concluded only from
    /// values since dominated, and its rules concluded nothing as good from
    /// what dominated them. The dominance is the program's own, so this is
    /// the program's defect, found on its data: refused, naming the rule,
    /// what it read and what dominated it. None when no dominated value is
    /// what `x` read.
    fn sub_nonmonotone(&mut self, x: FactId) -> Option<String> {
        if brk!("dominance_nonmonotone_is_bug" => true; false) {
            return None;
        }
        for (rule, _, prems) in self.store.firings(x) {
            for p in prems {
                let PremRef::Fact(g) = p else { continue };
                let rec = self.store.rec(g);
                if !self.lat_superseded.contains(&g) || !self.subs.contains_key(&rec.rel) {
                    continue;
                }
                let args = self.store.args(g).to_vec();
                let k = self.subs[&rec.rel].keylen;
                let ck: LatKey = (rec.rel, rec.persp, args[..k].into());
                let by = self.sub_beaten.get(&(ck.clone(), args[k..].into())).map(|v| {
                    let mut t = String::new();
                    write_fact_key(&self.h, rec.rel, rec.persp, &Self::sub_args(&ck, v), &mut t);
                    t
                });
                return Some(format!(
                    "program rejected: rule {} is not monotone in the dominance of {}: it concluded {} from {}, which {} dominates, \
                     and nothing its rules concluded from what dominates it is {} or dominates it (docs/aggregates.md, \"Subsumption, as built\")",
                    self.h.name(rule),
                    self.h.name(rec.rel),
                    self.store.key(&self.h, x),
                    self.store.key(&self.h, g),
                    by.unwrap_or_else(|| "a value given later".to_string()),
                    self.store.key(&self.h, x),
                ));
            }
        }
        None
    }

    /// Withdraw a fact whose support is gone: a live one is retired (a
    /// lattice cell's is a hole), a superseded value leaves the history.
    fn withdraw(&mut self, f: FactId, reason: Sym) {
        if self.lat_superseded.remove(&f) {
            self.store.drop_firings(f);
            self.lat_dropped.push(f);
            return;
        }
        if !self.store.alive(f) || self.store.rec(f).base() {
            return;
        }
        let rec = self.store.rec(f);
        let args = self.store.args(f).to_vec();
        if let Some(k) = self.cell_keylen(rec.rel, args.len()) {
            let ck: LatKey = (rec.rel, rec.persp, args[..k].into());
            // a member of an antichain withdrawn: what it dominated may be the
            // front, so the whole cell is not known
            if self.lat_cur.get(&ck) == Some(&f) || self.sub_cur.get(&ck).is_some_and(|v| v.contains(&f)) {
                self.hole_lattice_cell(ck, reason);
                return;
            }
        }
        self.retire_fact(f);
        self.lat_dropped.push(f);
    }

    /// The `derived_by` rows of the rules that no longer fire `f`.
    fn forget_rules(&mut self, f: FactId, rules: &[Sym]) {
        let mut seen: Vec<Sym> = Vec::new();
        for r in rules {
            if seen.contains(r) {
                continue;
            }
            seen.push(*r);
            if !self.store.fired_by(f, *r) {
                self.retire_derived_by(f, *r);
            }
        }
    }

    /// Close every lattice relation settled below level `lv`: its faults are
    /// decided, the firings that read superseded values settled, its Best
    /// pruned of self-support and, when a rule reads them, its members
    /// written as facts and propagated.
    fn close_lattices_below(&mut self, lv: i64) -> Result<(), Halt> {
        if self.lattices.is_empty() {
            return Ok(());
        }
        let mut due: Vec<Sym> = self
            .lattices
            .keys()
            .copied()
            .filter(|p| !self.lat_closed.contains(p))
            .filter(|p| match self.round_of.get(p) {
                Some(r) => (*r as i64) < lv,
                None => lv == i64::MAX,
            })
            .collect();
        if due.is_empty() {
            return Ok(());
        }
        due.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        self.narrow_gathered(&due)?;
        self.sub_check(&due)?;
        self.apply_lattice_holes(&due)?;
        self.join_covers(&due)?;
        self.settle_stale(&due);
        self.join_gc(&due);
        let mut front = Front::default();
        for p in due {
            self.lat_closed.insert(p);
            self.close_lattice(p, &mut front)?;
        }
        merge_front(&mut front, std::mem::take(&mut self.cur_front));
        if !front.keys.is_empty() {
            self.propagate(front)?;
            self.lattice_settle(false)?;
        }
        self.poison_readers(&[])
    }

    /// THE FAULTS OF A CLOSING LATTICE. Each is applied where every fact the
    /// failed derivation read still stands — a failure on a value since
    /// improved on says nothing about the cell — and all of them are judged
    /// against the lattice as it closed, before any is applied, so which
    /// arrived first decides nothing. A cell holed is withdrawn, and so, in
    /// turn, is whatever rested on it alone (`lattice_settle`). What the cell
    /// would have contributed further is absent, as a holed body cell's row
    /// is; the hole says where.
    fn apply_lattice_holes(&mut self, rels: &[Sym]) -> Result<(), Halt> {
        self.apply_lattice_holes_at(rels, false)
    }

    /// `apply_lattice_holes`, at a wall (`cut`) or at a close.
    fn apply_lattice_holes_at(&mut self, rels: &[Sym], cut: bool) -> Result<(), Halt> {
        let pending = std::mem::take(&mut self.lat_pending);
        let (mine, rest): (Vec<_>, Vec<_>) = pending.into_iter().partition(|x| rels.contains(&x.close));
        self.lat_pending = rest;
        let seeds = brk!("lattice_holes_in_order" => {
            let mut seeds = Vec::new();
            for x in mine {
                if x.facts.iter().all(|f| self.store.alive(*f)) {
                    seeds.extend(self.apply_faults(vec![x]));
                }
            }
            seeds
        }; {
            let standing: Vec<LatFault> = brk!("lattice_alive_unchecked" => mine;
                mine.into_iter().filter(|x| x.facts.iter().all(|f| self.store.alive(*f))).collect());
            self.apply_faults(standing)
        });
        self.poison(seeds, rels, cut)
    }

    /// Apply faults: the cells they hole are withdrawn, the rule holes
    /// written. Returns what they left unknown, for `poison`.
    fn apply_faults(&mut self, faults: Vec<LatFault>) -> Vec<Unknown> {
        // A cell a fault holes has no value to enclose: the fault is its
        // reason, and a widening of it is no hole of its own.
        let widened = self.v.widened_reason;
        let faulted: Vec<Unknown> = faults.iter().filter(|x| x.reason != widened).filter_map(|x| x.what.clone()).collect();
        let faults: Vec<LatFault> = brk!("widen_fault_both" => faults;
            faults.into_iter().filter(|x| {
                x.reason != widened
                    || !faulted.iter().any(|u| match (u, &x.what) {
                        (Unknown::Cell(a), Some(Unknown::Cell(b))) => a == b,
                        (Unknown::Rel(p), Some(w)) => *p == w.rel(),
                        _ => false,
                    })
            }).collect());
        let mut seeds = Vec::new();
        for x in faults {
            match &x.what {
                Some(Unknown::Cell(ck)) => {
                    self.hole_lattice_cell(ck.clone(), x.reason);
                }
                Some(Unknown::Rel(p)) if self.lattices.contains_key(p) => self.hole_lattice_rel(*p, x.reason),
                _ => {}
            }
            if let Some(r) = x.rule {
                self.arith_hole(r, x.reason);
            }
            seeds.extend(x.what);
        }
        seeds
    }

    /// WHAT A HOLE REACHES IS UNKNOWN TOO (docs/aggregates.md, "Holes"). From
    /// each thing a fault left unknown, every active rule that reads it is
    /// solved with it in place — an unknown cell's value decides no
    /// comparison and no sum, so each passes — and what the rule concludes
    /// is unknown in turn: a cell of a closing lattice is withdrawn as
    /// `support_withdrawn`, a cell of a lattice that closes later waits for
    /// its close as a fault, and a tuple of another relation that does not
    /// hold otherwise is absent, with its rule holed. So is what a negation
    /// or a body aggregate could not decide (`lat_undecided`). The
    /// withdrawals are carried to what rested on them (`lattice_settle`) and
    /// what that withdraws is unknown in turn, until nothing moves. It is a
    /// closure over sets, so the order anything arrived in decides nothing.
    fn poison(&mut self, seeds: Vec<Unknown>, closing: &[Sym], cut: bool) -> Result<(), Halt> {
        self.poison_with(seeds, &[], closing, cut)
    }

    /// RULES FIRED AFTER A HOLE (`readers`, a stratum just activated: a rule
    /// reading a lattice from outside its recursion, or what a hole left
    /// unknown in a lower stratum) are solved against every unknown already
    /// carried, as a rule inside the recursion is at the close; and what
    /// their negations and aggregates could not decide is carried on.
    fn poison_readers(&mut self, readers: &[Rc<ERule>]) -> Result<(), Halt> {
        if self.lat_undecided.is_empty() && (readers.is_empty() || self.lat_spread.is_empty()) {
            return Ok(());
        }
        let readers = brk!("lattice_outer_unpoisoned" => &[]; readers);
        self.carrying(|e| {
            e.poison_with(Vec::new(), readers, &[], false)?;
            e.drain_poison()
        })
    }

    /// The holes a carry wrote are news; what a firing on them cannot decide
    /// is carried on.
    fn drain_poison(&mut self) -> Result<(), Halt> {
        loop {
            let more = std::mem::take(&mut self.cur_front);
            if !more.keys.is_empty() {
                self.propagate(more)?;
                self.lattice_settle(false)?;
            }
            if self.lat_undecided.is_empty() {
                return Ok(());
            }
            self.poison_with(Vec::new(), &[], &[], false)?;
        }
    }

    fn poison_with(&mut self, seeds: Vec<Unknown>, readers: &[Rc<ERule>], closing: &[Sym], cut: bool) -> Result<(), Halt> {
        brk!("lattice_poison_off" => return self.lattice_settle(cut); ());
        self.carrying(|e| {
            e.with_walls_lifted(|e| {
                let faults = (e.fault, e.fault_count, e.last_fault);
                let r = e.poison_walk(seeds, readers, closing, cut);
                (e.fault, e.fault_count, e.last_fault) = faults;
                r
            })
        })
    }

    /// `f`, a carry of unknowns: a wall that falls inside it leaves what it
    /// would have reached not known (`carry_broken`).
    fn carrying<T>(&mut self, f: impl FnOnce(&mut Eval) -> Result<T, Halt>) -> Result<T, Halt> {
        let r = f(self);
        if r.is_err() {
            self.carry_broken = true;
        }
        r
    }

    /// One solution the carry extends, `width` more it holds: charged against
    /// the evaluation's walls, which the closes do not lift for it.
    fn carry_charge(&mut self, width: usize) -> Result<(), Halt> {
        self.carry_steps += 1;
        self.carry_check(width)
    }

    /// The carry's walls, as charged so far (each unknown a lookup looked at
    /// is a step: `unknown_cands`).
    fn carry_check(&self, width: usize) -> Result<(), Halt> {
        if brk!("carry_unwalled" => false; self.carry_steps > self.carry_wall.0) {
            self.wall_spent.set(Some(("steps", self.carry_steps, self.carry_wall.0)));
            return Err(Halt::Budget("budget_exhausted", None));
        }
        if brk!("carry_unwalled" => false; self.carry_rows + width as i64 > self.carry_wall.1) {
            self.wall_spent.set(Some(("rows", self.carry_rows + width as i64, self.carry_wall.1)));
            return Err(Halt::Budget("space_exhausted", None));
        }
        Ok(())
    }

    /// `f` with the walls lifted: what the closes and a wall's cut do once
    /// the evaluation is decided must finish.
    fn with_walls_lifted<T>(&mut self, f: impl FnOnce(&mut Eval) -> T) -> T {
        let walls = (self.budget, self.space);
        (self.budget, self.space) = (i64::MAX, i64::MAX);
        let r = f(self);
        (self.budget, self.space) = walls;
        r
    }

    /// Is `rel` at `arity` a lattice relation? (A relation of another arity
    /// with the same name is not.)
    /// Does the store hold dominance rules for `rel`?
    fn dominance_rel(&self, rel: Sym) -> bool {
        self.dom_rels.contains(&rel)
    }

    /// "lattice", or "subsumptive relation" for one of those.
    fn lat_word(&self, rel: Sym) -> &'static str {
        if self.subs.contains_key(&rel) { "subsumptive relation" } else { "lattice" }
    }

    fn is_lattice_lit(&self, rel: Sym, arity: usize) -> bool {
        self.lattices.get(&rel).is_some_and(|&(n, _)| n == arity)
    }

    /// Is a key of `n` terms a whole cell key of `rel`?
    fn is_cell_key(&self, rel: Sym, n: usize) -> bool {
        match self.lattices.get(&rel) {
            Some(&(_, AggOp::Dominance)) => self.subs[&rel].keylen == n,
            Some(&(a, _)) => a == n + 1,
            None => false,
        }
    }

    fn note_unknown(&mut self, u: Unknown, via: Option<(Unknown, Sym)>) -> bool {
        if self.lat_unknown.contains_key(&u) {
            return false;
        }
        if self.reads_unknown && u.rel() != self.v.unknown && brk!("shrug_meta_off" => false; true) {
            let m = self.meta_of(&u);
            self.meta_queue.push((m, u.clone()));
        }
        self.carry_rows += 1;
        let list = self.lat_unknown_rel.entry(u.rel()).or_default();
        let seq = list.len() as u32;
        list.push(u.clone());
        let wild = self.unknown_value;
        match &u {
            Unknown::Tuple(rel, _, args) => {
                for (i, a) in args.iter().enumerate() {
                    let k = if self.holds_unknown(*a) { wild } else { *a };
                    self.unknown_at.entry((*rel, i, k)).or_default().push(seq);
                }
            }
            Unknown::Cell((rel, _, key)) => {
                for (i, k) in key.iter().enumerate() {
                    self.unknown_at.entry((*rel, i, *k)).or_default().push(seq);
                }
                self.unknown_at.entry((*rel, key.len(), wild)).or_default().push(seq);
            }
            Unknown::Rel(rel) => self.unknown_any.entry(*rel).or_default().push(seq),
        }
        if let Unknown::Cell((rel, _, key)) = &u {
            for (i, k) in key.iter().enumerate() {
                self.lat_unknown_at.entry((*rel, i, *k)).or_default().push(u.clone());
            }
        }
        self.lat_unknown.insert(u, via);
        true
    }

    fn poison_walk(&mut self, seeds: Vec<Unknown>, readers: &[Rc<ERule>], closing: &[Sym], cut: bool) -> Result<(), Halt> {
        let withdrawn = self.h.intern("support_withdrawn");
        let mut level: Vec<Unknown> = Vec::new();
        for u in seeds {
            self.note_unknown(u.clone(), None);
            if self.lat_spread.insert(u.clone()) {
                level.push(u);
            }
        }
        self.take_metas(&mut level);
        let mut reached: Vec<(Unknown, Unknown, Sym)> = Vec::new();
        if !readers.is_empty() {
            let mut old: Vec<(String, Unknown)> =
                self.lat_spread.iter().filter(|u| !level.contains(u)).map(|u| (self.unknown_text(u), u.clone())).collect();
            old.sort_by(|a, b| cmp_js(&a.0, &b.0));
            for (_, u) in old {
                self.carry_src = Some(Node::Unk(u.clone()));
                for (v, rule, from) in self.reached_from(&u, Some(readers))? {
                    reached.push((v, from, rule));
                }
            }
        }
        for (rid, i, s, us) in std::mem::take(&mut self.lat_undecided) {
            let Some(r) = self.rule_of(rid) else { continue };
            // the rest of the body once, for every unknown that leaves it undecided
            self.carry_src = Some(Node::Unk(us[0].clone()));
            let sols = self.poison_solve(&r, i, s)?;
            for u in us.iter() {
                self.carry_src = Some(Node::Unk(u.clone()));
                let plain = self.lat_plain.contains(u);
                // A NEGATION A PLAIN HOLE LEFT UNDECIDED holes its rule wherever
                // what it would conclude does not hold another way: it is where
                // what the hole left out would have decided an answer.
                let neg = plain && matches!(r.plan[i], BodyElem::Neg(_));
                for s2 in &sols {
                    if let Some(v) = self.reached_conclusion(&r, s2, plain) {
                        if neg && brk!("plain_neg_unholed" => false; !self.unknown_holds(&v)) {
                            self.arith_hole(rid, withdrawn);
                        }
                        reached.push((v, u.clone(), rid));
                    }
                }
            }
        }
        for (v, u, rule) in reached {
            self.carry_src = Some(Node::Unk(u.clone()));
            if self.carry(&v, &u, rule, withdrawn, closing) {
                level.push(v);
            }
        }
        self.take_metas(&mut level);
        loop {
            while !level.is_empty() {
                let mut keyed: Vec<(String, Unknown)> = level.drain(..).map(|u| (self.unknown_text(&u), u)).collect();
                keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
                for (_, u) in keyed {
                    self.carry_src = Some(Node::Unk(u.clone()));
                    for (v, rule, from) in self.reached_from(&u, None)? {
                        self.carry_src = Some(Node::Unk(from.clone()));
                        if self.carry(&v, &from, rule, withdrawn, closing) {
                            level.push(v);
                        }
                    }
                    self.carry_src = Some(Node::Unk(u.clone()));
                }
                self.take_metas(&mut level);
            }
            self.lattice_settle(cut)?;
            let mut gone = std::mem::take(&mut self.lat_withdrawn);
            brk!("lattice_withdrawn_unspread" => gone.clear(); ());
            gone.sort_unstable_by_key(|g| g.0);
            for (f, rules, cited) in gone {
                let u = self.unknown_of(f);
                let via = cited.map(|(g, r)| (self.unknown_of(g), r));
                if let Some((g, _)) = &via {
                    self.unk_edges.push((Node::Unk(u.clone()), Node::Unk(g.clone())));
                    self.carry_src = Some(Node::Unk(g.clone()));
                } else {
                    self.carry_src = None;
                }
                self.note_unknown(u.clone(), via);
                if matches!(u, Unknown::Tuple(..)) {
                    let rule = match self.lat_unknown.get(&u) {
                        Some(Some((_, r))) => Some(*r),
                        _ => rules.first().copied(),
                    };
                    if let Some(r) = rule {
                        self.arith_hole(r, withdrawn);
                    }
                }
                let deplained = self.lat_plain.remove(&u);
                if self.lat_spread.insert(u.clone()) || deplained {
                    level.push(u);
                }
            }
            self.take_metas(&mut level);
            if level.is_empty() {
                self.carry_src = None;
                return Ok(());
            }
        }
    }

    /// The rule with id `id`.
    fn rule_of(&self, id: Sym) -> Option<Rc<ERule>> {
        self.rule_at.get(&id).map(|i| self.rules[*i].clone())
    }

    /// Does the tuple `u` names hold for certain, as a fact that stands?
    fn unknown_holds(&self, u: &Unknown) -> bool {
        matches!(u, Unknown::Tuple(rel, persp, args) if self.store.get(*rel, *persp, args).is_some_and(|f| self.store.alive(f)))
    }

    /// The level a relation is complete after: the round (or stratum) its
    /// rules run in, `i64::MAX` for a relation a rule concludes that no
    /// round orders, 0 for one no rule concludes.
    fn rel_level(&self, rel: Sym) -> i64 {
        match self.round_of.get(&rel) {
            Some(r) => *r as i64,
            None if self.derived_rels.contains(&rel) => i64::MAX,
            None => 0,
        }
    }

    /// The level after which every solution of `r` is known: its head's, or
    /// the end of the evaluation for a conclusion `@next`.
    fn rule_level(&self, r: &ERule) -> i64 {
        if r.clause.head.temporal == Temporal::Next {
            i64::MAX
        } else {
            self.rel_level(r.clause.head.rel)
        }
    }

    /// RULES CLOSE, AND ONLY THEN DOES A PLAIN UNKNOWN REACH THEM. Before
    /// level `lv` fires, every rule of a lower level has all its solutions,
    /// so each one closing now is solved against every unknown carried so
    /// far, and a plain unknown carried later reaches it at once. A rule
    /// still open could yet conclude, another way, the tuple an unknown would
    /// reach through it; solved only once it has closed, what a plain hole
    /// leaves unknown is a function of the program, not of the order the
    /// rules fired in, and the TypeScript engine computes the same set.
    fn close_plain_rules(&mut self, lv: i64) -> Result<(), Halt> {
        let fresh: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.safe && !self.plain_closed.contains(&r.id) && (lv == i64::MAX || self.rule_level(r) < lv))
            .cloned()
            .collect();
        for r in &fresh {
            self.plain_closed.insert(r.id);
        }
        if brk!("plain_reader_unclosed" => true; false) {
            return Ok(());
        }
        self.poison_readers(&fresh)
    }

    /// A fact as the unknown it is once withdrawn: its lattice cell, or its tuple.
    fn unknown_of(&self, f: FactId) -> Unknown {
        let rec = self.store.rec(f);
        let args = self.store.args(f);
        if let Some(&l) = self.join_of.get(&rec.rel) {
            return Unknown::Cell((l, rec.persp, args[..args.len() - 1].into()));
        }
        if let Some(k) = self.cell_keylen(rec.rel, args.len()) {
            Unknown::Cell((rec.rel, rec.persp, args[..k].into()))
        } else {
            Unknown::Tuple(rec.rel, rec.persp, args.into())
        }
    }

    /// Record what an unknown conclusion withdraws; true if it is to be
    /// carried further now.
    fn mark_unknown(&mut self, u: &Unknown, rule: Sym, reason: Sym, closing: &[Sym]) -> bool {
        match u {
            Unknown::Cell(ck) if closing.contains(&ck.0) => {
                self.hole_lattice_cell(ck.clone(), reason);
                true
            }
            Unknown::Rel(p) if closing.contains(p) => {
                self.hole_lattice_rel(*p, reason);
                true
            }
            Unknown::Cell(_) | Unknown::Rel(_) if self.lattices.contains_key(&u.rel()) => {
                // a lattice still evaluating: its close applies it, and carries it on
                self.lat_pending.push(LatFault { close: u.rel(), what: Some(u.clone()), rule: None, reason, facts: Vec::new() });
                false
            }
            Unknown::Tuple(..) if brk!("lattice_tuple_unspread" => true; self.unknown_holds(u)) => false,
            _ => {
                self.arith_hole(rule, reason);
                true
            }
        }
    }

    /// Every conclusion a rule draws with `u` in place of one of its
    /// premises, and the rule: the rules `only`, or every active one. A
    /// threshold reading `u` is such a premise too (it is monotone: a
    /// quorum reached without `u` stands). A negation or a body aggregate is
    /// not: it fires once what it reads is closed, and what a hole leaves
    /// unknown is known by then, so its firing does not decide it
    /// (`lat_undecided`). An active one reading `u` is a stratum this
    /// evaluation got wrong.
    fn reached_from(&mut self, u: &Unknown, only: Option<&[Rc<ERule>]>) -> Result<Vec<(Unknown, Sym, Unknown)>, Halt> {
        self.carry_check(0)?;
        let rel = u.rel();
        let plain = self.lat_plain.contains(u);
        let rules: Vec<Rc<ERule>> = only.map(|rs| rs.to_vec()).unwrap_or_else(|| self.active.clone());
        let mut out = Vec::new();
        for r in rules {
            if plain && only.is_none() && !self.plain_closed.contains(&r.id) {
                continue;
            }
            for i in 0..r.plan.len() {
                let s0 = match &r.plan[i] {
                    BodyElem::Pos(l) if l.rel == rel => self.unknown_binds(l, u, &Subst::new()),
                    BodyElem::Agg(a) if a.op == AggOp::AtLeast => {
                        let lits: Vec<Lit> = a.body.iter().filter_map(|b| match b {
                            BodyElem::Pos(l) if l.rel == rel => Some(l.clone()),
                            _ => None,
                        }).collect();
                        let mut found = Vec::new();
                        for l in lits {
                            if let Some(s0) = self.unknown_binds(&l, u, &Subst::new()) {
                                found.push(s0);
                            }
                        }
                        let BodyElem::Agg(ag) = &r.plan[i] else { continue };
                        let ag = ag.clone();
                        for s0 in found {
                            for s in self.poison_solve(&r, i, s0)? {
                                if brk!("shrug_thr_bound_off" => false; true) && self.thr_short(r.id, &ag, &s)? {
                                    continue;
                                }
                                if let Some(v) = self.reached_conclusion(&r, &s, plain) {
                                    // an open group rests on every member not
                                    // certain, whichever unknown arrived last
                                    let also = brk!("shrug_thr_cosource_off" => Vec::new(); self.thr_open_unknowns(r.id, &ag, &s)?);
                                    for w in also.into_iter().filter(|w| w != u) {
                                        out.push((v.clone(), r.id, w));
                                    }
                                    out.push((v, r.id, u.clone()));
                                }
                            }
                        }
                        continue;
                    }
                    BodyElem::Neg(_) if self.lat_plain.contains(u) => None,
                    // a late `unknown(A)` a strict reader could read is `meta_late`
                    BodyElem::Neg(_) | BodyElem::Agg(_) if rel == self.v.unknown => None,
                    // its correlations seal in the order of the data, after the carry of each layer
                    BodyElem::Agg(a) if self.ds_elems.contains(&(r.id, a.at)) => None,
                    b @ (BodyElem::Neg(_) | BodyElem::Agg(_)) if only.is_none() && b.lits_deep().iter().any(|l| l.rel == rel) => {
                        return Err(Halt::Bug(format!(
                            "rule {} fired before {} was closed: a negation or an aggregate read it while a hole could still reach it",
                            self.h.name(r.id),
                            self.unknown_text(u)
                        )));
                    }
                    _ => None,
                };
                let Some(s0) = s0 else { continue };
                for s in self.poison_solve(&r, i, s0)? {
                    if let Some(v) = self.reached_conclusion(&r, &s, plain) {
                        out.push((v, r.id, u.clone()));
                    }
                }
            }
        }
        Ok(out)
    }

    /// What `r` concludes under `s`, reached from something unknown (`plain`
    /// when only plain holes reached it). A conclusion for the next tick is
    /// no unknown of this one: it is not staged, its rule is holed, and it is
    /// an unknown of the next (`stage_unknown`).
    fn reached_conclusion(&mut self, r: &ERule, s: &Subst, plain: bool) -> Option<Unknown> {
        if r.clause.head.temporal == Temporal::Next {
            let withdrawn = self.h.intern("support_withdrawn");
            self.arith_hole(r.id, withdrawn);
            self.stage_unknown(r, s, plain);
            return None;
        }
        self.conclusion_unknown(r, s)
    }

    /// A HOLE AT T REACHES T+1. What an unknown kept from being staged is
    /// not absent at T+1 but unknown there, as it was at T: a lattice cell
    /// an unknown value was staged for is a hole at its close (and the
    /// contributions staged beside it with it), a tuple is carried on to
    /// what reads it. Absent, it would read as false, and a count, a min or
    /// a lattice at T+1 would be a definite answer over what is not known.
    fn stage_unknown(&mut self, r: &ERule, s: &Subst, plain: bool) {
        if brk!("carry_drops_hole" => true; false) {
            return;
        }
        if let Some(u) = self.head_unknown(r, s) {
            let p = self.staged_unknown.entry(u).or_insert(plain);
            *p &= plain;
        }
    }

    /// A CONCLUSION STAGED FROM WHAT WAS WITHDRAWN SINCE. A fact a lattice
    /// withdrew after a rule `@next` read it is no support at T+1: the fact
    /// stands on another firing that read only what stands, or it is gone
    /// when what it read is known not to hold (a dominated value, or what one
    /// alone concluded), or it is an unknown of T+1 as it would be had the
    /// hole reached it before it was staged (`stage_unknown`).
    fn settle_staged(&mut self) {
        if self.lattices.is_empty() || brk!("staged_keeps_withdrawn" => true; false) {
            return;
        }
        let store = &self.store;
        let dead = |ps: &[PremRef]| ps.iter().any(|p| matches!(p, PremRef::Fact(f) if !store.alive(*f)));
        let mut keys: Vec<FKey> = self.staged.iter().filter(|(_, f)| dead(&f.prems)).map(|(k, _)| k.clone()).collect();
        if keys.is_empty() {
            return;
        }
        keys.sort_by_cached_key(|k| {
            let mut t = String::new();
            write_fact_key(&self.h, k.0, k.1, &k.2, &mut t);
            t
        });
        let withdrawn = self.h.intern("support_withdrawn");
        for k in keys {
            let alts = self.staged_alts.remove(&k).unwrap_or_default();
            let store = &self.store;
            let dead = |ps: &[PremRef]| ps.iter().any(|p| matches!(p, PremRef::Fact(f) if !store.alive(*f)));
            let known_false = |ps: &[PremRef]| {
                ps.iter().any(|p| {
                    matches!(p, PremRef::Fact(f) if self.sub_gone.contains(f)
                        || self.lat_superseded.contains(f) && self.subs.contains_key(&store.rec(*f).rel))
                })
            };
            let f = &self.staged[&k];
            let unknown = !known_false(&f.prems) || alts.iter().any(|(_, ps)| dead(ps) && !known_false(ps));
            if let Some((rule, prems)) = alts.into_iter().find(|(_, ps)| !dead(ps)) {
                let f = self.staged.get_mut(&k).unwrap();
                (f.rule, f.prems) = (rule, prems);
                continue;
            }
            let f = self.staged.remove(&k).unwrap();
            if unknown {
                self.arith_hole(f.rule, withdrawn);
                let l = self.carried.get(&f.rel).copied().unwrap_or(f.rel);
                let u = match self.cell_keylen(l, f.args.len()) {
                    Some(n) => Unknown::Cell((l, f.persp, f.args[..n].into())),
                    None => Unknown::Tuple(f.rel, f.persp, f.args.into()),
                };
                *self.staged_unknown.entry(u).or_insert(false) &= false;
            }
        }
    }

    /// The row a boundary writes for an unknown staged into tick `tick`:
    /// `hole($next(Rel, Persp, Tick, Args), Reason)`, `$any` where the
    /// perspective or the arguments are not known, `Args` a lattice cell's
    /// key or a tuple's arguments; `support_withdrawn`, or `fault_left_out`
    /// when only plain holes reached it.
    fn next_hole(&mut self, u: &Unknown, plain: bool, tick: u32) -> [Term; 2] {
        let any = self.h.atom("$any");
        let (rel, persp, args) = match u {
            Unknown::Cell((rel, p, key)) => (*rel, Term::atom(*p), self.h.list(key)),
            Unknown::Tuple(rel, p, args) => (*rel, Term::atom(*p), self.h.list(args)),
            Unknown::Rel(rel) => (*rel, any, any),
        };
        let f = self.h.intern("$next");
        let id = self.h.mkf(f, &[Term::atom(rel), persp, Term::int(tick as i64), args]);
        let reason = self.h.atom(if plain { "fault_left_out" } else { "support_withdrawn" });
        [id, reason]
    }

    /// The unknowns a boundary carried into `tick`, read back from its
    /// `$next` holes, so a snapshot reopened carries them as the evaluation
    /// that wrote them did.
    fn carried_unknowns(&mut self, tick: u32) -> Vec<(Unknown, bool)> {
        let holes = self.store.rel_all(&self.h, self.v.hole);
        if holes.is_empty() {
            return Vec::new();
        }
        let next = self.h.intern("$next");
        let below = self.h.intern("$below");
        let any = self.h.atom("$any");
        let plain = self.h.atom("fault_left_out");
        let mut out = Vec::new();
        for id in holes {
            let a = self.store.args(id).to_vec();
            let (TermK::Func(i), reason) = (a[0].kind(), a[1]) else { continue };
            let fa = self.h.fargs(i).to_vec();
            // `$below(Rel, Book, Args)`: what the world below had no answer for
            let (rel, p, args) = if self.h.fname(i) == below && fa.len() == 3 {
                (fa[0].as_atom(), fa[1], fa[2])
            } else if self.h.fname(i) == next && fa.len() == 4 && fa[2].as_int() == Some(tick as i64) {
                (fa[0].as_atom(), fa[1], fa[3])
            } else {
                continue;
            };
            let Some(rel) = rel else { continue };
            let u = if p == any {
                Unknown::Rel(rel)
            } else {
                let Some(p) = p.as_atom() else { continue };
                let args = self.h.unlist(args);
                if self.is_cell_key(rel, args.len()) {
                    Unknown::Cell((rel, p, args.into()))
                } else {
                    Unknown::Tuple(rel, p, args.into())
                }
            };
            self.unk_edges.push((Node::Unk(u.clone()), Node::Hole(a[0])));
            self.holes_now.push((a[0], reason.as_atom().unwrap_or(self.v.hole)));
            out.push((u, reason == plain));
        }
        out
    }

    /// Something unknown a literal could read under `s`, of those carried;
    /// `plain`, what a plain hole left too.
    fn read_unknown(&mut self, l: &Lit, s: &Subst, plain: bool) -> Option<Unknown> {
        let cands = brk!("neg_unknown_unbound" => self.lat_unknown_rel.get(&l.rel).cloned().unwrap_or_default(); self.unknown_cands(l, s));
        cands
            .into_iter()
            .find(|u| self.lat_spread.contains(u) && (plain || !self.lat_plain.contains(u)) && brk!("neg_unknown_unbound" => true; self.unknown_binds(l, u, s).is_some()))
    }

    /// The unknowns `l` could read under `s`, in the order they were noted:
    /// those at its most selective bound argument, or every one of its
    /// relation when none is bound.
    fn unknown_cands(&mut self, l: &Lit, s: &Subst) -> Vec<Unknown> {
        if !self.lat_unknown_rel.contains_key(&l.rel) {
            return Vec::new();
        }
        let wild = self.unknown_value;
        let mut best: Option<(usize, Term, usize)> = None;
        for (i, a) in l.args.iter().enumerate() {
            let t = resolve(&mut self.h, *a, s);
            if !self.h.is_ground(t) || self.holds_unknown(t) {
                continue;
            }
            let n = [t, wild].iter().map(|k| self.unknown_at.get(&(l.rel, i, *k)).map_or(0, |v| v.len())).sum::<usize>();
            if best.is_none_or(|b| n < b.2) {
                best = Some((i, t, n));
            }
        }
        let all = &self.lat_unknown_rel[&l.rel];
        let Some((i, k, _)) = brk!("unknown_scan" => None; best) else {
            self.carry_steps += all.len() as i64;
            return all.clone();
        };
        let mut seqs: Vec<u32> = [k, wild]
            .iter()
            .filter_map(|k| self.unknown_at.get(&(l.rel, i, *k)))
            .chain(self.unknown_any.get(&l.rel))
            .flatten()
            .copied()
            .collect();
        seqs.sort_unstable();
        seqs.dedup();
        self.carry_steps += seqs.len() as i64;
        seqs.into_iter().map(|q| all[q as usize].clone()).collect()
    }

    /// `f`, where a firing's element may read something unknown: in a rule
    /// firing, at the top of its body, once some hole has reached anything.
    fn undecided_read<T>(&mut self, depth: usize, rule_id: Option<Sym>, f: impl FnOnce(&mut Eval) -> T) -> Option<T> {
        (depth == 0 && self.firing && rule_id.is_some() && !self.lat_spread.is_empty()).then(|| f(self))
    }

    /// EVERY SOLUTION THE AGGREGATE'S INNER BODY MIGHT HAVE over something
    /// unknown under the correlation `s` (`poison_solve_plan`, each literal
    /// in turn over each unknown it could read), as the group it would fall
    /// in and the member it would be: what `reach_of` decides the groups by.
    /// A solution the rest of the body refuses is none, so an aggregate that
    /// reaches an unknown only through one is decided.
    fn agg_possibles(&mut self, rid: Sym, a: &Agg, s: &Subst) -> Result<Vec<Possible>, Halt> {
        let Some(plan) = self.agg_plans.get(&(rid, a.at)).cloned() else { return Ok(Vec::new()) };
        let inner: Vec<BodyElem> = plan.inner_order.iter().map(|i| a.body[*i].clone()).collect();
        let outer: Vec<Sym> = self.lattices.keys().copied().collect();
        let mut out: Vec<Possible> = Vec::new();
        let mut seen: HashSet<Possible> = HashSet::new();
        for (k, b) in inner.iter().enumerate() {
            let (neg, l) = match b {
                BodyElem::Pos(l) => (false, l),
                BodyElem::Neg(l) => (true, l),
                _ => continue,
            };
            // a negation's variables nothing else reads: `not p(K, _)` is decided by any p(K, _)
            let mut free: Vec<Sym> = Vec::new();
            if neg {
                let mut here = Vec::new();
                b.vars(&self.h, &mut here);
                let mut elsewhere: Vec<Sym> = a.shared.clone();
                for t in a.vals.iter().chain(a.keys.iter()) {
                    self.h.vars_of(*t, &mut elsewhere);
                }
                for (j, e) in inner.iter().enumerate() {
                    if j != k {
                        e.vars(&self.h, &mut elsewhere);
                    }
                }
                free = here.into_iter().filter(|v| !elsewhere.contains(v)).collect();
            }
            for u in self.unknown_cands(l, s) {
                if !self.lat_spread.contains(&u) {
                    continue;
                }
                let Some(s0) = self.unknown_binds(l, &u, s) else { continue };
                for ps in self.poison_solve_plan(&inner, &outer, k, s0)? {
                    if neg && brk!("agg_reach_neg_fact_ignored" => false; self.neg_decided(l, &ps, &free)?) {
                        continue;
                    }
                    let mut pat = Vec::with_capacity(plan.group.len());
                    for i in &plan.group {
                        let t = resolve(&mut self.h, Term::var(a.shared[*i]), &ps);
                        let known = self.h.is_ground(t) && !self.holds_unknown(t);
                        pat.push(brk!("agg_reach_whole" => None; known.then_some(t)));
                    }
                    let mut proj = Vec::with_capacity(a.vals.len() + a.keys.len());
                    for t in a.vals[a.params()..].iter().chain(a.keys.iter()) {
                        proj.push(resolve(&mut self.h, *t, &ps));
                    }
                    let proj = a.plain_keys(&self.h, proj);
                    let known = proj.iter().all(|t| self.h.is_ground(*t) && !self.holds_unknown(*t));
                    let p = Possible { pat, proj: known.then_some(proj), neg: brk!("agg_reach_neg_certain" => false; neg), u: u.clone() };
                    if seen.insert(p.clone()) {
                        out.push(p);
                    }
                }
            }
        }
        Ok(out)
    }

    /// A NEGATION A FACT DECIDES under `ps`, its variables nothing else reads
    /// (`free`) left open: the member it would take away is out in every
    /// completion, so it is no possible. Undecided where an argument is not
    /// known, and asked only of a relation not answered on demand.
    fn neg_decided(&mut self, l: &Lit, ps: &Subst, free: &[Sym]) -> Result<bool, Halt> {
        if self.demand_rels.iter().any(|(r, _)| *r == l.rel) {
            return Ok(false);
        }
        let s: Subst = ps.iter().filter(|(k, _)| !free.contains(k)).copied().collect();
        if !walk(&self.h, l.persp, &s).is_atom() {
            return Ok(false);
        }
        for a in &l.args {
            let t = resolve(&mut self.h, *a, &s);
            let mut vs = Vec::new();
            self.h.vars_of(t, &mut vs);
            if self.holds_unknown(t) || vs.iter().any(|v| !free.contains(v)) {
                return Ok(false);
            }
        }
        // `match_exists` answers whether the negation holds: nothing matches
        Ok(!self.match_exists(l, &s)?)
    }

    /// THE UNKNOWNS A GROUP DEPENDS ON, of those its possibles `ps` (the
    /// group's own, `PossIndex::at`) might add or take away: none when its
    /// value is the same under every completion of them. `projs` and `vals`
    /// are the group's known members, which hold under every completion (a
    /// member that might be out is a possible of its own), and `value` its
    /// value over them. A fault every completion keeps is the group's value
    /// whatever they add (`fault_certain`). A member that might be taken
    /// away (an undecided negation), or whose projection is not known,
    /// changes it; one whose projection a set (count, sum, the holistic
    /// ones) already holds does not. The new members are decided together,
    /// each kind by its own algebra: a count by any, a sum by any not 0 (by
    /// any at all where it has no member yet: a 0 makes the group), an order
    /// by any it improves on, a median or quantile by the lower ones all
    /// added or the higher ones all added (its index moves by at most one a
    /// member, so these are its extremes), a rank by all of them added (it
    /// only grows). A projection several unknowns could add rests on each of
    /// them: the group moves if any one holds.
    #[allow(clippy::too_many_arguments)]
    fn reach_of(&self, op: AggOp, param: Result<Option<Val>, Sym>, rk: Option<&RankKey>, projs: &[&[Term]], vals: &[Term], value: CellValue, ps: &[&Possible]) -> Vec<Unknown> {
        if let Some(k) = rk {
            return self.reach_of_rank(k, projs, value, ps);
        }
        let mut us: Vec<Unknown> = Vec::new();
        if brk!("agg_reach_fault_relabel" => false; self.fault_certain(op, &param, vals, value, ps)) {
            return us;
        }
        let held: HashSet<&[Term]> = if op.dedup_by_projection() { projs.iter().copied().collect() } else { HashSet::new() };
        // each new projection, with every unknown that could add it
        let mut fresh: Vec<(Result<Val, Sym>, Vec<&Unknown>)> = Vec::new();
        let mut at_proj: HashMap<&[Term], usize> = HashMap::new();
        for p in ps {
            match &p.proj {
                Some(proj) if !p.neg => {
                    if op.dedup_by_projection() {
                        if brk!("agg_reach_dedup_any" => true; held.contains(proj.as_slice())) {
                            continue;
                        }
                        if let Some(k) = at_proj.get(proj.as_slice()) {
                            brk!("agg_reach_alias_first" => (); fresh[*k].1.push(&p.u));
                            continue;
                        }
                        at_proj.insert(proj.as_slice(), fresh.len());
                    }
                    fresh.push((op.lift(&self.v, proj[0]), vec![&p.u]));
                }
                _ => {
                    if !us.contains(&p.u) {
                        us.push(p.u.clone());
                    }
                }
            }
        }
        let now = match value {
            CellValue::Value(t) => op.lift(&self.v, t).ok(),
            _ => None,
        };
        let all: Vec<usize> = (0..fresh.len()).collect();
        let moved: Vec<usize> = match op.class() {
            _ if fresh.is_empty() => Vec::new(),
            Class::Invertible if op == AggOp::Sum && brk!("agg_reach_sum_empty" => true; !matches!(value, CellValue::Empty)) => {
                all.into_iter().filter(|k| brk!("agg_reach_sum_zero" => false; fresh[*k].0 != Ok(Val::Int(0)))).collect()
            }
            Class::IdempotentOrder => match now {
                Some(acc) => all
                    .into_iter()
                    .filter(|k| brk!("agg_reach_bound_any" => false; !fresh[*k].0.is_ok_and(|x| matches!(op.insert(&self.v, Some(acc), x), Ok(Step::Tied | Step::Unchanged)))))
                    .collect(),
                None => all,
            },
            Class::Holistic => {
                let known: Result<Vec<Val>, Sym> = vals.iter().map(|t| op.lift(&self.v, *t)).collect();
                let at = |extra: &[Val]| -> Result<Option<Val>, Sym> {
                    let mut xs = known.clone()?;
                    xs.extend_from_slice(extra);
                    op.holistic(&self.v, param?, &xs)
                };
                let adds: Result<Vec<Val>, Sym> = fresh.iter().map(|f| f.0).collect();
                let stays = match (adds, now) {
                    (Ok(adds), Some(v)) if op == AggOp::Rank => at(&adds) == Ok(Some(v)),
                    (Ok(adds), None) if op == AggOp::Rank && matches!(value, CellValue::Empty) => at(&adds) == Ok(None),
                    (Ok(adds), Some(v)) => {
                        let lo: Vec<Val> = adds.iter().copied().filter(|x| val_lt(x, &v)).collect();
                        let hi: Vec<Val> = adds.iter().copied().filter(|x| val_lt(&v, x)).collect();
                        brk!("agg_reach_holistic_low_only" => at(&lo) == Ok(Some(v)); at(&lo) == Ok(Some(v)) && at(&hi) == Ok(Some(v)))
                    }
                    _ => false,
                };
                if stays { Vec::new() } else { all }
            }
            _ => all,
        };
        for k in moved {
            for u in &fresh[k].1 {
                if !us.contains(u) {
                    us.push((*u).clone());
                }
            }
        }
        us
    }

    /// A FAULT EVERY COMPLETION KEEPS: the group's value is a hole no member
    /// its possibles `ps` add can mend, for the known members that faulted
    /// hold in every completion. A member no fold reads (or a percent or
    /// subject none reads) is `agg_type_error` whatever joins it: the fold
    /// stops at the first, and a sum's total is checked only at its finish.
    /// A sum's overflow is kept when the total is out of range at both ends
    /// of what the possibles could add or take away; a possible whose
    /// projection is not known could mend it.
    fn fault_certain(&self, op: AggOp, param: &Result<Option<Val>, Sym>, vals: &[Term], value: CellValue, ps: &[&Possible]) -> bool {
        let CellValue::Hole(r) = value else { return false };
        if r == self.v.agg_type_reason {
            return vals.iter().any(|t| op.lift(&self.v, *t).is_err()) || (op.class() == Class::Holistic && param.is_err());
        }
        if r != self.v.agg_overflow_reason || op != AggOp::Sum {
            return false;
        }
        if brk!("agg_reach_overflow_kept" => true; false) {
            return true;
        }
        let mut total: i128 = 0;
        for t in vals {
            match op.lift(&self.v, *t) {
                Ok(Val::Int(n)) => total += n,
                _ => return false,
            }
        }
        let (mut lo, mut hi) = (total, total);
        for p in ps {
            let Some(proj) = &p.proj else { return false };
            let Ok(Val::Int(n)) = op.lift(&self.v, proj[0]) else { return false };
            if p.neg {
                lo -= n.abs();
                hi += n.abs();
            } else {
                lo += n.min(0);
                hi += n.max(0);
            }
        }
        hi < INT_MIN as i128 || lo > INT_MAX as i128
    }

    /// A rank over a tuple's directions and subject under `s`; none for any
    /// other aggregate.
    fn rank_key(&mut self, a: &Agg, s: &Subst) -> Option<RankKey> {
        if !a.rank_tuple() {
            return None;
        }
        let ts: Vec<Term> = a.vals.iter().map(|t| resolve(&mut self.h, *t, s)).collect();
        Some(RankKey { desc: a.rank_desc(&self.h), subject: key_atoms(&self.h, &self.v, &ts) })
    }

    /// `reach_of` for a rank over a tuple: the group moves when adding every
    /// projection the possibles could add changes the subject's rank (a rank
    /// only grows as members are added, and a subject none of them is can
    /// only gain its place by being added itself).
    fn reach_of_rank(&self, k: &RankKey, projs: &[&[Term]], value: CellValue, ps: &[&Possible]) -> Vec<Unknown> {
        let mut us: Vec<Unknown> = Vec::new();
        let known: Result<Vec<Vec<KeyAtom>>, Sym> = projs.iter().map(|p| key_atoms(&self.h, &self.v, p)).collect();
        if let CellValue::Hole(r) = value {
            if brk!("agg_reach_fault_relabel" => false; r == self.v.agg_type_reason && (known.is_err() || k.subject.is_err())) {
                return us;
            }
        }
        let held: HashSet<&[Term]> = projs.iter().copied().collect();
        let mut fresh: Vec<(Result<Vec<KeyAtom>, Sym>, Vec<&Unknown>)> = Vec::new();
        let mut at_proj: HashMap<&[Term], usize> = HashMap::new();
        for p in ps {
            match &p.proj {
                Some(proj) if !p.neg => {
                    if brk!("agg_reach_dedup_any" => true; held.contains(proj.as_slice())) {
                        continue;
                    }
                    if let Some(i) = at_proj.get(proj.as_slice()) {
                        brk!("agg_reach_alias_first" => (); fresh[*i].1.push(&p.u));
                        continue;
                    }
                    at_proj.insert(proj.as_slice(), fresh.len());
                    fresh.push((key_atoms(&self.h, &self.v, proj), vec![&p.u]));
                }
                _ => {
                    if !us.contains(&p.u) {
                        us.push(p.u.clone());
                    }
                }
            }
        }
        let at = |extra: &[Vec<KeyAtom>]| -> Result<Option<Val>, Sym> {
            let mut xs = known.clone()?;
            xs.extend_from_slice(extra);
            Ok(Sorted::of_keys(k.desc.clone(), xs).rank_of(k.subject.as_ref().map_err(|r| *r)?))
        };
        let adds: Result<Vec<Vec<KeyAtom>>, Sym> = fresh.iter().map(|f| f.0.clone()).collect();
        let now = match value {
            CellValue::Value(t) => self.v_int(t),
            _ => None,
        };
        let stays = match (adds, now) {
            (Ok(adds), Some(v)) => at(&adds) == Ok(Some(Val::Int(v))),
            (Ok(adds), None) if matches!(value, CellValue::Empty) => at(&adds) == Ok(None),
            _ => false,
        };
        if brk!("rank_reach_blind" => false; !stays) {
            for f in &fresh {
                for u in &f.1 {
                    if !us.contains(u) {
                        us.push((*u).clone());
                    }
                }
            }
        }
        us
    }

    fn v_int(&self, t: Term) -> Option<i128> {
        match t.kind() {
            TermK::Int(n) => Some(n as i128),
            _ => None,
        }
    }

    /// Quantile's percent or rank's subject under `s`, as the fold reads it.
    fn agg_param(&mut self, a: &Agg, s: &Subst) -> Result<Option<Val>, Sym> {
        if a.op.params() == 0 || a.rank_tuple() {
            return Ok(None);
        }
        match resolve(&mut self.h, a.vals[0], s).kind() {
            TermK::Int(n) => Ok(Some(Val::Int(n as i128))),
            _ => Err(self.v.agg_type_reason),
        }
    }

    /// WHAT THE AGGREGATE DID NOT DECIDE under the correlation `mk`, decided
    /// once: each sealed group whose value an unknown could change, with the
    /// unknowns it rests on — as `seal_cells` sealed it (`cell_reach`) where
    /// this firing sealed it (`sealed_now`), else decided here over the
    /// value it was sealed with, which no possible reached then — and each
    /// group pattern of a possible no sealed group names (its group not
    /// known, or not among those sealed), with the unknowns that could make
    /// it.
    fn reach_memo_of(&mut self, rid: Sym, a: &Agg, s: &Subst, mk: &(Sym, u32, Box<[Term]>), ps: Vec<Possible>, sealed_now: bool) -> Result<ReachMemo, Halt> {
        let (plan, _) = self.agg_corr(rid, a, s)?;
        let cells: Vec<CellId> = self.agg_memo.get(mk).map(|cs| cs.to_vec()).unwrap_or_default();
        let index = PossIndex::of(&ps);
        let mut named = vec![false; ps.len()];
        let mut groups: Vec<(Box<[Term]>, Rc<[Unknown]>)> = Vec::new();
        for c in cells {
            let (key, value, op) = {
                let r = self.store.cell(c);
                (r.key.clone(), r.value, r.op)
            };
            let g: Vec<Term> = plan.group.iter().map(|i| key[*i]).collect();
            for n in index.exact.get(&g).into_iter().flatten() {
                named[*n] = true;
            }
            let us: Rc<[Unknown]> = match self.cell_reach.get(&c) {
                Some(us) if brk!("agg_reach_redecide" => false; true) => us.clone(),
                _ if sealed_now && brk!("agg_reach_redecide" => false; true) => continue,
                _ => {
                    let (projs, vals): (Vec<Box<[Term]>>, Vec<Term>) = self.store.cell_members(c).iter().map(|m| (m.proj.clone(), m.value)).unzip();
                    let projs: Vec<&[Term]> = projs.iter().map(|p| &p[..]).collect();
                    let param = self.agg_param(a, s);
                    let rk = self.rank_key(a, s);
                    let mine = index.at(&ps, &g);
                    self.reach_of(op, param, rk.as_ref(), &projs, &vals, value, &mine).into()
                }
            };
            if !us.is_empty() {
                groups.push((key, us));
            }
        }
        let mut unnamed: Vec<(Vec<Option<Term>>, Vec<Unknown>)> = Vec::new();
        let mut at_pat: HashMap<&[Option<Term>], usize> = HashMap::new();
        let mut seen: HashSet<(&[Option<Term>], &Unknown)> = HashSet::new();
        for (n, p) in ps.iter().enumerate() {
            if named[n] || !seen.insert((&p.pat, &p.u)) {
                continue;
            }
            match at_pat.get(p.pat.as_slice()) {
                Some(k) => unnamed[*k].1.push(p.u.clone()),
                None => {
                    at_pat.insert(&p.pat, unnamed.len());
                    unnamed.push((p.pat.clone(), vec![p.u.clone()]));
                }
            }
        }
        Ok(ReachMemo { ps: ps.into(), groups, unnamed: unnamed.into_iter().map(|(p, us)| (p, us.into())).collect() })
    }

    /// WHAT THE AGGREGATE DID NOT DECIDE under `s`, at every firing, from
    /// its correlation's `ReachMemo`: each group it changes is undecided for
    /// its unknowns, its group variables bound; each pattern no sealed group
    /// names is undecided with what it binds, so what the rule concludes
    /// from a group the unknown could make is unknown too.
    fn agg_reach_undecided(&mut self, rid: Sym, a: &Agg, s: &Subst, i: usize, m: &ReachMemo) {
        let Some(plan) = self.agg_plans.get(&(rid, a.at)).cloned() else { return };
        for (key, us) in &m.groups {
            if let Some(s2) = self.bind_group(a, &plan, s, key) {
                self.lat_undecided.push((rid, i, s2, us.clone()));
            }
        }
        for (pat, us) in &m.unnamed {
            let mut s2 = Some(s.clone());
            for (n, gi) in plan.group.iter().enumerate() {
                if let (Some(t), Some(x)) = (pat[n], s2.as_ref()) {
                    s2 = unify(&self.h, Term::var(a.shared[*gi]), t, x);
                }
            }
            if let Some(s2) = s2 {
                self.lat_undecided.push((rid, i, s2, us.clone()));
            }
        }
    }

    /// A builtin failed for an error in a rule no lattice decides: the rule's
    /// conclusion under the failed solution is unknown (`lat_plain`).
    fn plain_fault(&mut self, rule_id: Option<Sym>, s: &Subst) {
        let Some(r) = rule_id.and_then(|rid| self.rule_of(rid)) else { return };
        if r.lat_close.is_some() {
            return;
        }
        if r.clause.head.temporal == Temporal::Next {
            return self.stage_unknown(&r, s, true);
        }
        if let Some(u) = self.conclusion_unknown(&r, s) {
            self.narrow_feeder_fault(r.clause.head.rel);
            let marker = self.rule_marker(r.id);
            self.unk_edges.push((Node::Unk(u.clone()), Node::Hole(marker)));
            self.plain_pending.push((u, true));
        }
    }

    /// A PLAIN RULE THAT FAULTS IN A DESCENT, `head` its conclusion's relation: every widened cell that reads
    /// `head` (through anything) is left as it was, for what the rule would have contributed is unknown
    /// (`narrow_gathered` sees the faults of the rules a lattice closes, and this is the other kind). A rule that
    /// only reads what the cell concludes, from outside its recursion, is no reason.
    fn narrow_feeder_fault(&mut self, head: Sym) {
        let Some(nr) = self.narrowing.as_ref() else { return };
        let cells: Vec<Sym> = nr.frozen.keys().map(|k| k.0).collect();
        let deps = self.rel_deps();
        let hit: Vec<Sym> = cells.into_iter().filter(|&p| reaches_in(&deps, p, head)).collect();
        debug_assert!(hit.is_empty(), "a plain rule's fault reached a widened cell in a descent, which the first pass left a hole");
        if let Some(nr) = self.narrowing.as_mut() {
            nr.faulted.extend(hit);
        }
    }

    /// A FAULT BELOW A CALL ANSWERED ON DEMAND, in a firing: the call's head
    /// under the solution it was met in is unknown, and so, one call up at a
    /// time, is each call that read it (the premise that called it faulted).
    fn demand_fault(&mut self, depth: usize, s: &Subst) {
        if depth == 0 || !self.firing || brk!("demand_fault_unspread" => true; false) {
            return;
        }
        let Some(head) = self.demand_heads.last().cloned() else { return };
        let u = self.lit_unknown(&head, s);
        self.fault_edge(&u);
        self.plain_pending.push((u, true));
    }

    /// The cells the body aggregate at element `i` holed under `s`, each with
    /// no value: the rest of the body is solved around them at the flush.
    fn plain_agg_holes(&mut self, rid: Sym, a: &Agg, s: &Subst, i: usize) -> Result<(), Halt> {
        let (plan, corr) = self.agg_corr(rid, a, s)?;
        let mk = (rid, a.at, corr.into_boxed_slice());
        if self.agg_opened.contains(&mk) {
            let key = self.h.list(&mk.2);
            let marker = self.h.mkf(self.v.s_cell, &[Term::atom(rid), Term::int(a.at as i64), Term::int(self.store.tick as i64), key]);
            self.plain_undecided.push((rid, i, s.clone(), marker));
            return Ok(());
        }
        let cells: Vec<CellId> = self.agg_memo.get(&mk).map(|cs| cs.to_vec()).unwrap_or_default();
        let withdrawn = self.h.intern("support_withdrawn");
        for c in cells {
            let r = self.store.cell(c);
            // a group an unknown could change is carried from the unknown (`agg_reach_undecided`)
            if !matches!(r.value, CellValue::Hole(h) if h != withdrawn) {
                continue;
            }
            let key = r.key.clone();
            if let Some(s2) = self.bind_group(a, &plan, s, &key) {
                let marker = self.store.cell_key_term(&mut self.h, c);
                self.plain_undecided.push((rid, i, s2, marker));
            }
        }
        Ok(())
    }

    /// CARRY WHAT PLAIN HOLES LEFT UNKNOWN before the rules of level `lv`
    /// fire: every conclusion of a relation closed below `lv` (one still
    /// growing might yet hold). A conclusion that holds another way is known.
    fn plain_flush(&mut self, lv: i64) -> Result<(), Halt> {
        if self.plain_pending.is_empty() && self.plain_undecided.is_empty() {
            return Ok(());
        }
        self.carrying(|e| e.plain_flush_at(lv))
    }

    fn plain_flush_at(&mut self, lv: i64) -> Result<(), Halt> {
        let closed = |e: &Eval, rel: Sym| brk!("plain_flush_early" => true; lv == i64::MAX || e.rel_level(rel) < lv);
        let mut seeds: Vec<(Unknown, bool)> = Vec::new();
        let mut keep: Vec<(Sym, usize, Subst, Term)> = Vec::new();
        for (rid, i, s, marker) in std::mem::take(&mut self.plain_undecided) {
            let Some(r) = self.rule_of(rid) else { continue };
            if !closed(self, r.clause.head.rel) {
                keep.push((rid, i, s, marker));
                continue;
            }
            self.carry_src = Some(Node::Hole(marker));
            for s2 in self.poison_solve(&r, i, s)? {
                if let Some(v) = self.reached_conclusion(&r, &s2, true) {
                    self.unk_edges.push((Node::Unk(v.clone()), Node::Hole(marker)));
                    seeds.push((v, true));
                }
            }
            self.carry_src = None;
        }
        self.plain_undecided = keep;
        let (now, later): (Vec<(Unknown, bool)>, Vec<(Unknown, bool)>) =
            std::mem::take(&mut self.plain_pending).into_iter().partition(|(u, _)| closed(self, u.rel()));
        self.plain_pending = later;
        seeds.extend(now);
        let mut fresh: Vec<Unknown> = Vec::new();
        for (u, plain) in seeds {
            if self.lat_unknown.contains_key(&u) {
                continue;
            }
            match &u {
                Unknown::Tuple(..) if brk!("plain_alive_unknown" => false; self.unknown_holds(&u)) => continue,
                Unknown::Cell(_) | Unknown::Rel(_) if self.lattices.contains_key(&u.rel()) => {
                    self.note_unknown(u.clone(), None);
                    let withdrawn = self.h.intern("support_withdrawn");
                    self.lat_pending.push(LatFault { close: u.rel(), what: Some(u), rule: None, reason: withdrawn, facts: Vec::new() });
                }
                _ => {
                    if plain {
                        self.lat_plain.insert(u.clone());
                    }
                    fresh.push(u);
                }
            }
        }
        if fresh.is_empty() {
            return Ok(());
        }
        self.poison_with(fresh, &[], &[], false)?;
        self.drain_poison()
    }

    /// `v`, reached from `from` by `rule`, noted as unknown; true if it is to
    /// be carried further now. What only plain unknowns reach is plain: a
    /// tuple so reached is absent with no hole on its rule. A plain one then
    /// reached from what is not plain is marked as that is, and carried again.
    fn carry(&mut self, v: &Unknown, from: &Unknown, rule: Sym, reason: Sym, closing: &[Sym]) -> bool {
        brk!("shrug_edges_off" => (); self.unk_edges.push((Node::Unk(v.clone()), Node::Unk(from.clone()))));
        let plain = brk!("plain_positive_holed" => false; self.lat_plain.contains(from));
        if !self.note_unknown(v.clone(), Some((from.clone(), rule))) {
            if !plain && self.lat_plain.remove(v) {
                self.lat_unknown.insert(v.clone(), Some((from.clone(), rule)));
                return self.mark_unknown(v, rule, reason, closing);
            }
            return false;
        }
        if plain && matches!(v, Unknown::Tuple(..) | Unknown::Rel(_)) && !self.lattices.contains_key(&v.rel()) {
            if self.unknown_holds(v) {
                return false;
            }
            self.lat_plain.insert(v.clone());
            return self.lat_spread.insert(v.clone());
        }
        self.mark_unknown(v, rule, reason, closing) && self.lat_spread.insert(v.clone())
    }

    /// A literal read over an unknown: its key bound to the unknown's, every
    /// variable of its value standing for the unknown value.
    fn unknown_binds(&mut self, l: &Lit, u: &Unknown, s: &Subst) -> Option<Subst> {
        match u {
            Unknown::Cell((rel, p, key)) => {
                let n = key.len();
                if self.cell_keylen(*rel, l.args.len()) != Some(n) {
                    return None;
                }
                let mut s = unify(&self.h, l.persp, Term::atom(*p), s)?;
                for (a, k) in l.args[..n].iter().zip(key.iter()) {
                    s = unify(&self.h, *a, *k, &s)?;
                }
                self.bind_unknown(&l.args[n..], s)
            }
            Unknown::Tuple(_, p, args) => {
                if l.args.len() != args.len() {
                    return None;
                }
                let mut s = unify(&self.h, l.persp, Term::atom(*p), s)?;
                for (a, t) in l.args.iter().zip(args.iter()) {
                    s = self.unify_unknown(*a, *t, s)?;
                }
                Some(s)
            }
            Unknown::Rel(r) if self.is_lattice_lit(*r, l.args.len()) => {
                let k = self.cell_keylen(*r, l.args.len()).unwrap();
                self.bind_unknown(&l.args[k..], s.clone())
            }
            Unknown::Rel(_) => Some(s.clone()),
        }
    }

    /// A literal's argument `a` against an unknown's `t`: where `t` holds the
    /// unknown value, whatever `a` has there stands for it; a structure
    /// around it must be `a`'s too (`unknown(win(_))` is not `unknown(lose(c))`).
    fn unify_unknown(&mut self, a: Term, t: Term, s: Subst) -> Option<Subst> {
        if t == self.unknown_value || brk!("shrug_structure_wild" => self.holds_unknown(t); false) {
            return self.bind_unknown(&[a], s);
        }
        if !self.holds_unknown(t) {
            return unify(&self.h, a, t, &s);
        }
        let ra = resolve(&mut self.h, a, &s);
        match (ra.kind(), t.kind()) {
            (TermK::Var(_), _) => unify(&self.h, ra, t, &s),
            (TermK::Func(i), TermK::Func(j)) if self.h.fname(i) == self.h.fname(j) && self.h.fargs(i).len() == self.h.fargs(j).len() => {
                let (xs, ys) = (self.h.fargs(i).to_vec(), self.h.fargs(j).to_vec());
                let mut s = s;
                for (x, y) in xs.into_iter().zip(ys) {
                    s = self.unify_unknown(x, y, s)?;
                }
                Some(s)
            }
            _ => None,
        }
    }

    /// Every unbound variable of `ts` stands for an unknown value.
    fn bind_unknown(&mut self, ts: &[Term], mut s: Subst) -> Option<Subst> {
        let mut vs = Vec::new();
        for t in ts {
            let t = resolve(&mut self.h, *t, &s);
            self.h.vars_of(t, &mut vs);
        }
        for v in vs {
            s = unify(&self.h, Term::var(v), self.unknown_value, &s)?;
        }
        Some(s)
    }

    fn holds_unknown(&self, t: Term) -> bool {
        t == self.unknown_value
            || match t.kind() {
                TermK::Func(i) => self.h.fargs(i).iter().any(|a| self.holds_unknown(*a)),
                _ => false,
            }
    }

    /// The lattice cell a literal names under `s`, when its key is bound.
    fn lit_cell(&mut self, l: &Lit, s: &Subst) -> Option<LatKey> {
        let k = self.cell_keylen(l.rel, l.args.len())?;
        let p = walk(&self.h, l.persp, s).as_atom()?;
        let key: Vec<Term> = l.args[..k].iter().map(|a| resolve(&mut self.h, *a, s)).collect();
        key.iter().all(|k| self.h.is_ground(*k)).then(|| (l.rel, p, key.into()))
    }

    /// The body of `r` but its premise `skip`, over the facts that stand and
    /// the unknowns: a lattice premise matches a cell that is not unknown by
    /// its fact and an unknown one by its key; another premise matches a
    /// fact, or a tuple that is unknown. A builtin or negation that reads an
    /// unknown, or a variable nothing bound, is undecided and passes, what
    /// it binds unknown; so does a builtin that fails for an error (the
    /// derivation would fault). A body aggregate is not solved: what it binds
    /// is unknown.
    fn poison_solve(&mut self, r: &ERule, skip: usize, s0: Subst) -> Result<Vec<Subst>, Halt> {
        self.poison_solve_plan(&r.plan, &r.lattice_outer, skip, s0)
    }

    /// `poison_solve` over a body, `outer` the lattices it reads from outside
    /// their recursion.
    fn poison_solve_plan(&mut self, plan: &[BodyElem], outer: &[Sym], skip: usize, s0: Subst) -> Result<Vec<Subst>, Halt> {
        let mut acc = vec![s0];
        for (j, b) in plan.iter().enumerate() {
            if j == skip {
                continue;
            }
            let mut next: Vec<Subst> = Vec::new();
            for s in &acc {
                self.carry_charge(next.len())?;
                match b {
                    BodyElem::Pos(l) => {
                        let lattice = self.is_lattice_lit(l.rel, l.args.len()) && !outer.contains(&l.rel);
                        let whole = self.lat_unknown.contains_key(&Unknown::Rel(l.rel));
                        // an argument that holds the unknown matches anything
                        let mut lw = l.clone();
                        for (i, a) in lw.args.iter_mut().enumerate() {
                            let t = resolve(&mut self.h, *a, s);
                            if self.holds_unknown(t) {
                                *a = Term::var(self.h.intern(&format!("?unknown{j}_{i}")));
                            }
                        }
                        let l = &lw;
                        for (s2, _) in self.match_premise(l, s, 0, None)? {
                            if lattice {
                                if whole {
                                    continue;
                                }
                                if let Some(ck) = self.lit_cell(l, &s2) {
                                    if self.lat_unknown.contains_key(&Unknown::Cell(ck)) {
                                        continue;
                                    }
                                }
                            }
                            next.push(s2);
                        }
                        let bound = if lattice {
                            let n = self.cell_keylen(l.rel, l.args.len()).unwrap();
                            (0..n).find_map(|i| {
                                let t = resolve(&mut self.h, l.args[i], s);
                                self.h.is_ground(t).then_some((i, t))
                            })
                        } else {
                            None
                        };
                        let cands: Vec<Unknown> = match (lattice, self.lit_cell_opt(l, s), bound) {
                            (true, Some(ck), _) => [Unknown::Cell(ck), Unknown::Rel(l.rel)]
                                .into_iter()
                                .filter(|u| self.lat_unknown.contains_key(u))
                                .collect(),
                            (true, None, Some((i, k))) => {
                                let mut c = self.lat_unknown_at.get(&(l.rel, i, k)).cloned().unwrap_or_default();
                                c.extend(Some(Unknown::Rel(l.rel)).filter(|u| self.lat_unknown.contains_key(u)));
                                c
                            }
                            _ => self.unknown_cands(l, s),
                        };
                        for u in cands {
                            // a tuple or a cell that holds for certain matched above
                            if !lattice && !self.lat_spread.contains(&u) {
                                continue;
                            }
                            if lattice && matches!(u, Unknown::Tuple(..)) {
                                continue;
                            }
                            if let Some(s2) = self.unknown_binds(l, &u, s) {
                                next.push(s2);
                            }
                        }
                        let undef = self.undef_atoms.as_ref().and_then(|m| m.get(&l.rel)).cloned().unwrap_or_default();
                        for u in undef {
                            if let Some(s2) = self.unknown_binds(l, &u, s) {
                                next.push(s2);
                            }
                        }
                    }
                    BodyElem::Neg(l) => {
                        let args: Vec<Term> = l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect();
                        let undecided = args.iter().any(|a| self.holds_unknown(*a) || !self.h.is_ground(*a)) || self.reads_undefined(l, s);
                        if undecided || self.neg_holds(l, s, 0)? {
                            next.push(s.clone());
                        }
                    }
                    BodyElem::Bi { op, l, r: rt } => {
                        let (lv, rv) = (resolve(&mut self.h, *l, s), resolve(&mut self.h, *rt, s));
                        let unknown = self.holds_unknown(lv) || self.holds_unknown(rv);
                        let open = if *op == self.v.op_is || *op == self.v.op_in {
                            !self.h.is_ground(rv)
                        } else if *op == self.v.op_eq {
                            false
                        } else {
                            !self.h.is_ground(lv) || !self.h.is_ground(rv)
                        };
                        brk!("lattice_unknown_decides" => if unknown { continue }; ());
                        if unknown || open {
                            if let Some(s2) = self.bind_unknown(&[*l, *rt], s.clone()) {
                                next.push(s2);
                            }
                            continue;
                        }
                        let faults = self.fault_count;
                        let s2s = self.eval_builtins(*op, *l, *rt, s, None)?;
                        if s2s.is_empty() && self.fault_count > faults {
                            if let Some(s2) = self.bind_unknown(&[*l, *rt], s.clone()) {
                                next.push(s2);
                            }
                        }
                        next.extend(s2s);
                    }
                    BodyElem::Agg(a) => {
                        if let Some(s2) = self.bind_unknown(&[a.result], s.clone()) {
                            next.push(s2);
                        }
                    }
                }
            }
            self.carry_steps += next.len() as i64;
            self.carry_check(next.len())?;
            acc = next;
            if acc.is_empty() {
                break;
            }
        }
        Ok(acc)
    }

    fn lit_cell_opt(&mut self, l: &Lit, s: &Subst) -> Option<LatKey> {
        if self.is_lattice_lit(l.rel, l.args.len()) {
            self.lit_cell(l, s)
        } else {
            None
        }
    }

    /// An unknown, as whynot names it.
    fn unknown_text(&self, u: &Unknown) -> String {
        let mut k = String::new();
        match u {
            Unknown::Cell((rel, p, key)) => write_fact_key(&self.h, *rel, *p, key, &mut k),
            Unknown::Tuple(rel, p, args) => {
                write_fact_key(&self.h, *rel, *p, args, &mut k);
                k = k.replace(self.h.name(self.unknown_value.as_atom().unwrap()), "_");
            }
            Unknown::Rel(rel) => k = format!("every {} of {}", if self.lattices.contains_key(rel) { "cell" } else { "tuple" }, self.h.name(*rel)),
        }
        k
    }

    /// THE FIRINGS THAT READ A VALUE SINCE IMPROVED ON, decided when their
    /// lattice closes. Where the final values alone found the fact, they are
    /// removed, and its members read final values only. Where they did not —
    /// a value reached only through the cell's own earlier values, as a
    /// saturating or threshold recursion reaches it — they stay, with the
    /// superseded values they read and the firings those were reached by:
    /// the fact is well-founded through its history. The rest of the
    /// history of the closing relations is dropped.
    fn settle_stale(&mut self, due: &[Sym]) {
        let mut cand: Vec<FactId> = self.lat_stale.drain().filter(|f| self.store.alive(*f)).collect();
        cand.sort_unstable();
        let sup = std::mem::take(&mut self.lat_superseded);
        let mut memo: HashMap<FactId, u32> = HashMap::new();
        let _ = self.store.heights_where(&cand, &mut memo, &|ps: &[PremRef]| {
            ps.iter().any(|p| matches!(p, PremRef::Fact(g) if sup.contains(g)))
        });
        let mut keep: Vec<FactId> = Vec::new();
        for f in cand {
            if brk!("lattice_stale_firings" => false && memo.contains_key(&f),
                    "lattice_history_dropped" => true;
                    memo.contains_key(&f)) {
                let rules = self.store.drop_firings_of_citing(f, &sup);
                self.forget_rules(f, &rules);
            } else {
                keep.push(f);
            }
        }
        let mut reach: HashSet<FactId> = HashSet::new();
        let mut stack: Vec<FactId> = keep.iter().flat_map(|f| self.store.fact_premises(*f)).collect();
        while let Some(g) = stack.pop() {
            if sup.contains(&g) && reach.insert(g) {
                stack.extend(self.store.fact_premises(g));
            }
        }
        for f in sup {
            if reach.contains(&f) || !due.contains(&self.store.rec(f).rel) {
                self.lat_superseded.insert(f);
            } else {
                self.store.drop_firings(f);
            }
        }
        let live = &self.lat_superseded;
        self.lat_history.retain(|_, v| {
            v.retain(|f| live.contains(f));
            !v.is_empty()
        });
    }

    /// A firing's height: 1 + its highest premise (a cell's height, a
    /// negation and a builtin 0). Every fact premise is in `height_memo`.
    fn firing_height(&self, prems: &[PremRef]) -> u32 {
        let mut h = 0u32;
        for p in prems {
            match p {
                PremRef::Fact(f) => h = h.max(self.height_memo.get(f).copied().unwrap_or(0)),
                PremRef::Cell(c) => h = h.max(self.store.cell(*c).height),
                PremRef::Neg(_) | PremRef::Bi(_) => {}
            }
        }
        h + 1
    }

    /// A lattice fact's members, canonical: every firing, ordered by height,
    /// then rule id, then premise signature. `(height, rule, tick, prems)`.
    fn best_members(&mut self, f: FactId) -> Result<Vec<(u32, Sym, u32, Vec<PremRef>)>, Halt> {
        if let Err(g) = self.store.heights(&[f], &mut self.height_memo) {
            return Err(Halt::Bug(format!("{} has no well-founded height", self.store.key(&self.h, g))));
        }
        let mut ms: Vec<(u32, String, String, Sym, u32, Vec<PremRef>)> = self
            .store
            .supports_of(&self.h, f)
            .into_iter()
            .map(|(sig, rule, tick, prems)| (self.firing_height(&prems), self.h.name(rule).to_string(), sig, rule, tick, prems))
            .collect();
        ms.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| cmp_js(&a.1, &b.1)).then_with(|| cmp_js(&a.2, &b.2)));
        Ok(ms.into_iter().map(|(h, _, _, r, t, p)| (h, r, t, p)).collect())
    }

    /// The dominators of the derivation graph of `p`'s recursion: the facts
    /// of every relation in it (those `p` depends on that depend on `p`)
    /// that the facts of `p` rest on, superseded values included. None when
    /// a firing reads two of them (`Store::dominators`); `founded_without`
    /// then searches fact by fact.
    fn recursion_dominators(&self, p: Sym, facts: &[FactId]) -> Option<Dominators> {
        let mut deps: HashMap<Sym, HashSet<Sym>> = HashMap::new();
        for r in &self.rules {
            if r.clause.head.temporal == Temporal::Next {
                continue;
            }
            deps.entry(r.clause.head.rel).or_default().extend(r.pos_rels.iter().copied());
        }
        let closure = |from: Sym| -> HashSet<Sym> {
            let mut seen: HashSet<Sym> = HashSet::new();
            let mut stack = vec![from];
            while let Some(x) = stack.pop() {
                if seen.insert(x) {
                    if let Some(ds) = deps.get(&x) {
                        stack.extend(ds.iter().copied());
                    }
                }
            }
            seen
        };
        let below = closure(p);
        let scc: HashSet<Sym> = below.iter().copied().filter(|r| *r == p || closure(*r).contains(&p)).collect();
        let mut nodes: Vec<FactId> = Vec::new();
        let mut seen: HashSet<FactId> = HashSet::new();
        let mut stack: Vec<FactId> = facts.to_vec();
        while let Some(g) = stack.pop() {
            if !self.height_memo.contains_key(&g) || !scc.contains(&self.store.rec(g).rel) || !seen.insert(g) {
                continue;
            }
            nodes.push(g);
            stack.extend(self.store.fact_premises(g));
        }
        nodes.sort_unstable();
        self.store.dominators(&nodes, &self.height_memo)
    }

    fn close_lattice(&mut self, p: Sym, front: &mut Front) -> Result<(), Halt> {
        let facts = self.store.rel_all(&self.h, p);
        if let Err(g) = self.store.heights(&facts, &mut self.height_memo) {
            return Err(Halt::Bug(format!("{} has no well-founded height", self.store.key(&self.h, g))));
        }
        let mut keyed: Vec<(String, FactId)> = facts.iter().map(|f| (self.store.key(&self.h, *f), *f)).collect();
        keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
        let doms = self.recursion_dominators(p, &facts);
        for (_, f) in keyed {
            let hf = self.height_memo[&f];
            let members = self.best_members(f)?;
            // WELL-FOUNDED: a firing that cites the fact itself, or a premise
            // every derivation of which uses the fact, is self-support and no
            // member. Only a premise higher than the fact can be one.
            if brk!("lattice_self_support" => members.len() > 1 && false; members.len() > 1) {
                let hm = |q: &FactId| self.height_memo.get(q).copied().unwrap_or(u32::MAX);
                let mut high: Vec<FactId> = members
                    .iter()
                    .flat_map(|m| m.3.iter())
                    .filter_map(|q| match q {
                        PremRef::Fact(q) if *q != f && hm(q) > hf => Some(*q),
                        _ => None,
                    })
                    .collect();
                high.sort_unstable();
                high.dedup();
                let founded: HashSet<FactId> = match &doms {
                    Some(d) => brk!("lattice_existence_ignored" => high.iter().copied().filter(|q| !d.covers(*q) && self.height_memo.contains_key(q)).collect();
                        high.iter().copied().filter(|q| if d.covers(*q) { d.founded_without(f, *q) } else { self.height_memo.contains_key(q) }).collect()),
                    None => self.store.founded_without(f, &high, &self.height_memo),
                };
                let selfish: Vec<bool> = members
                    .iter()
                    .map(|m| {
                        m.3.iter().any(|q| match q {
                            PremRef::Fact(q) => brk!("lattice_self_cite" => hm(q) > hf && !founded.contains(q); *q == f || (hm(q) > hf && !founded.contains(q))),
                            _ => false,
                        })
                    })
                    .collect();
                for ((_, rule, _, prems), selfish) in members.iter().zip(selfish) {
                    if selfish {
                        self.store.remove_firing(f, *rule, prems);
                        if !self.store.fired_by(f, *rule) {
                            self.retire_derived_by(f, *rule);
                        }
                    }
                }
            }
            if self.answer.reads_lattice_members && !self.no_provenance {
                let rec = self.store.rec(f);
                let args = self.store.args(f).to_vec();
                let ft = fact_term(&mut self.h, &self.v, rec.rel, rec.persp, &args);
                let mut rows: Vec<(Sym, Vec<Term>)> = Vec::new();
                for (i, (hgt, rule, _, prems)) in self.best_members(f)?.into_iter().enumerate() {
                    let n = Term::int(i as i64 + 1);
                    rows.push((self.v.lattice_member, vec![ft, n, Term::int(hgt as i64), Term::atom(rule)]));
                    for q in prems {
                        let t = self.prem_term(q);
                        rows.push((self.v.lattice_member_prem, vec![ft, n, t]));
                    }
                }
                for (rel, args) in rows {
                    let (id, new) = self.store.put(&self.h, rel, self.v.kernel_persp, &args, F_TICK);
                    if new {
                        self.charge_row(None, false)?;
                        front.note(rel, id);
                    }
                }
            }
        }
        // THE ANTICHAIN'S OTHER HALF: every value the cell was given and does
        // not hold, with the member of the front that dominates it
        if self.subs.contains_key(&p) && self.answer.reads_dominated && !self.no_provenance {
            let mut rows: Vec<(String, [Term; 3])> = Vec::new();
            let by: Vec<(SubVal, (FactId, Sym))> = self.sub_by.iter().filter(|((ck, _), (f, _))| ck.0 == p && self.store.alive(*f)).map(|(k, v)| (k.clone(), *v)).collect();
            for ((ck, d), (f, rule)) in by {
                let args = Self::sub_args(&ck, &d);
                let dt = self.sub_fact(p, ck.1, &args);
                let rec = self.store.rec(f);
                let fargs = self.store.args(f).to_vec();
                let ft = self.sub_fact(rec.rel, rec.persp, &fargs);
                let mut key = String::new();
                self.h.canon_term(dt, &mut key);
                rows.push((key, [dt, ft, Term::atom(rule)]));
            }
            rows.sort_by(|a, b| cmp_js(&a.0, &b.0));
            for (_, args) in rows {
                let rel = self.v.dominated_by;
                let (id, new) = self.store.put(&self.h, rel, self.v.kernel_persp, &args, F_TICK);
                if new {
                    self.charge_row(None, false)?;
                    front.note(rel, id);
                }
            }
        }
        Ok(())
    }

    /// THE ANTICHAIN, CHECKED AT THE CLOSE (docs/aggregates.md, "Subsumption,
    /// as built"). Every value a cell of a closing subsumptive relation was
    /// given is either a member of its front or dominated by one, and no
    /// member is dominated by any value given: then the front is exactly the
    /// values nothing given dominates, whatever order they came in. A value
    /// dominated by no member (the dominance is not transitive over them), or
    /// a member dominated by a value given, is a conflict; a comparison not
    /// answered is the cell's fault or its inherited unknown. Each value
    /// dominated keeps the first member, in canonical order, that dominates
    /// it, and the rule that says so (`sub_by`).
    fn sub_check(&mut self, due: &[Sym]) -> Result<(), Halt> {
        if self.subs.is_empty() || brk!("dominance_unchecked" => true; false) {
            return Ok(());
        }
        let mut cells: Vec<(String, LatKey)> = self
            .sub_seen
            .keys()
            .filter(|k| due.contains(&k.0) && !self.lat_holed_rel.contains(&k.0))
            .map(|k| {
                let mut t = String::new();
                write_fact_key(&self.h, k.0, k.1, &k.2, &mut t);
                (t, k.clone())
            })
            .collect();
        cells.sort_by(|a, b| cmp_js(&a.0, &b.0));
        'cells: for (_, ck) in cells {
            if self.sub_parties.contains_key(&ck) {
                continue;
            }
            let rel = ck.0;
            let k = ck.2.len();
            let mut front: Vec<(String, FactId)> = self
                .sub_cur
                .get(&ck)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|f| self.store.alive(*f))
                .map(|f| (self.store.key(&self.h, f), f))
                .collect();
            front.sort_by(|a, b| cmp_js(&a.0, &b.0));
            let front: Vec<(FactId, u32, Vec<Term>)> = front
                .into_iter()
                .map(|(_, f)| {
                    let a = self.store.args(f).to_vec();
                    (f, self.sub_seen_set[&(ck.clone(), a[k..].into())], a)
                })
                .collect();
            let seen = self.sub_seen.get(&ck).cloned().unwrap_or_default();
            // every conflict of the cell, so its parties are those of the
            // values given and not of the order they came in
            let mut parties: Vec<Term> = Vec::new();
            let mut by: Vec<(Box<[Term]>, FactId, Sym)> = Vec::new();
            for (di, d) in seen.iter().enumerate() {
                let di = di as u32;
                if front.iter().any(|(_, _, a)| a[k..] == **d) {
                    continue;
                }
                let dargs = Self::sub_args(&ck, d);
                let mut found = false;
                for (f, ai, aargs) in &front {
                    match self.sub_dom(&ck, (di, &dargs), (*ai, aargs))? {
                        DomV::Yes(r) => {
                            let r = brk!("dominance_by_last" => {
                                by.retain(|x| x.0 != *d);
                                r
                            }; r);
                            by.push((d.clone(), *f, r));
                            found = true;
                            if brk!("dominance_by_last" => false; true) {
                                break;
                            }
                        }
                        DomV::No => {}
                        v => {
                            self.sub_undecided(&ck, v);
                            continue 'cells;
                        }
                    }
                }
                if !found {
                    // dominated when given, by no member: every value given
                    // that dominates it is a party
                    parties.push(self.sub_fact(rel, ck.1, &dargs));
                    for (xi, x) in seen.iter().enumerate() {
                        let xargs = Self::sub_args(&ck, x);
                        match self.sub_dom(&ck, (di, &dargs), (xi as u32, &xargs))? {
                            DomV::Yes(_) => parties.push(self.sub_fact(rel, ck.1, &xargs)),
                            DomV::No => {}
                            v => {
                                self.sub_undecided(&ck, v);
                                continue 'cells;
                            }
                        }
                    }
                }
            }
            for (_, ai, aargs) in &front {
                for (di, d) in seen.iter().enumerate() {
                    if aargs[k..] == **d {
                        continue;
                    }
                    let dargs = Self::sub_args(&ck, d);
                    match self.sub_dom(&ck, (*ai, aargs), (di as u32, &dargs))? {
                        DomV::No => {}
                        DomV::Yes(_) => {
                            parties.push(self.sub_fact(rel, ck.1, aargs));
                            parties.push(self.sub_fact(rel, ck.1, &dargs));
                        }
                        v => {
                            self.sub_undecided(&ck, v);
                            continue 'cells;
                        }
                    }
                }
            }
            if !parties.is_empty() {
                self.sub_conflict(&ck, "dominance_intransitive", parties);
                continue;
            }
            for (d, f, r) in by {
                self.sub_by_of.entry(f).or_default().push(d.clone());
                self.sub_by.insert((ck.clone(), d), (f, r));
            }
        }
        Ok(())
    }

    /// A WALL — the budget or the space — leaves values that are not final:
    /// every lattice not yet closed is `hole($lattice(Rel), Reason)` with the
    /// wall's reason, and keeps the values it reached, each a bound the
    /// cell's value meets. Its standing faults are applied and carried on
    /// (`poison`); so is every cell on an improving cycle
    /// (`improving_cycles`), `improving_cycle`: a value reached from an
    /// earlier value of its own is no bound of anything.
    ///
    /// The cut's own carry is charged afresh against the same walls. When it
    /// too runs out, every lattice not closed is holed whole, with no value.
    fn lattice_cut(&mut self, reason: Sym) -> Result<(), Halt> {
        if self.lattices.is_empty() {
            return Ok(());
        }
        brk!("cut_carry_unrenewed" => (); (self.carry_steps, self.carry_rows) = (0, 0));
        let cut = self.with_walls_lifted(|e| {
            e.close_settled()?;
            e.lattice_cut_open(reason)
        });
        match cut {
            Err(Halt::Budget(..)) if brk!("cut_fallback_off" => false; true) => self.with_walls_lifted(|e| {
                let mut open: Vec<Sym> = e.lattices.keys().copied().filter(|p| !e.lat_closed.contains(p)).collect();
                open.sort_by(|a, b| cmp_js(e.h.name(*a), e.h.name(*b)));
                for p in open {
                    e.hole_lattice_rel(p, reason);
                }
                e.lattice_settle(true)
            }),
            r => r,
        }
    }

    /// A LATTICE THE WALL DID NOT REACH closes as it would have: one whose
    /// every rule, and every rule of everything it reads, had fired on every
    /// fact there was when the wall fell. The wall stops the evaluation in
    /// some rule or some front; what depends on neither is final.
    ///
    /// What a plain hole left unknown and no carry has reached yet
    /// (`plain_pending`, `plain_undecided`, `lat_undecided`) may reach a
    /// lattice still: what reads it is not settled. After a carry the wall
    /// broke into, nothing is.
    fn close_settled(&mut self) -> Result<(), Halt> {
        if brk!("carry_broken_settles" => false; self.carry_broken) {
            return Ok(());
        }
        let mut unsettled: HashSet<Sym> = self.live_front.iter().copied().collect();
        unsettled.extend(self.cur_front.by_rel.keys().copied());
        for r in self.batch.iter().skip(self.batch_at) {
            unsettled.insert(r.clause.head.rel);
        }
        if brk!("plain_unknown_settles" => false; true) {
            unsettled.extend(self.plain_pending.iter().map(|(u, _)| u.rel()));
            let undecided: Vec<Sym> = self.plain_undecided.iter().map(|x| x.0).chain(self.lat_undecided.iter().map(|x| x.0)).collect();
            for r in self.rules.iter().filter(|r| undecided.contains(&r.id)) {
                unsettled.insert(r.clause.head.rel);
            }
        }
        let active: HashSet<Sym> = self.active.iter().map(|r| r.id).collect();
        let mut reads: HashMap<Sym, Vec<Sym>> = HashMap::new();
        for r in self.rules.iter().filter(|r| r.safe) {
            if r.clause.head.temporal == Temporal::Next {
                continue;
            }
            if !active.contains(&r.id) {
                unsettled.insert(r.clause.head.rel);
            }
            let e = reads.entry(r.clause.head.rel).or_default();
            for b in &r.plan {
                e.extend(b.lits_deep().iter().map(|l| l.rel));
            }
        }
        let mut settled: Vec<Sym> = Vec::new();
        for p in self.lattices.keys().copied().filter(|p| !self.lat_closed.contains(p)) {
            let (mut seen, mut todo) = (HashSet::from([p]), vec![p]);
            let mut ok = true;
            while let Some(q) = todo.pop() {
                if unsettled.contains(&q) {
                    ok = false;
                    break;
                }
                for x in reads.get(&q).into_iter().flatten() {
                    if seen.insert(*x) {
                        todo.push(*x);
                    }
                }
            }
            if brk!("lattice_settled_cut" => false; ok) {
                settled.push(p);
            }
        }
        if settled.is_empty() {
            return Ok(());
        }
        settled.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        self.sub_check(&settled)?;
        self.apply_lattice_holes_at(&settled, true)?;
        self.join_covers(&settled)?;
        self.settle_stale(&settled);
        self.join_gc(&settled);
        let mut front = Front::default();
        for p in settled {
            self.lat_closed.insert(p);
            self.close_lattice(p, &mut front)?;
        }
        Ok(())
    }

    fn lattice_cut_open(&mut self, reason: Sym) -> Result<(), Halt> {
        let mut open: Vec<Sym> = self.lattices.keys().copied().filter(|p| !self.lat_closed.contains(p)).collect();
        open.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        let pending = std::mem::take(&mut self.lat_pending);
        // A cell widened before the wall encloses its least value only once
        // its recursion has settled on the widened values, which a wall
        // stopped first: it has no value to give, and the wall is its reason
        // (no `within(V)` that was never checked to enclose anything).
        let widened = self.v.widened_reason;
        let standing: Vec<LatFault> = pending
            .into_iter()
            .filter(|x| x.facts.iter().all(|f| self.store.alive(*f)))
            .map(|mut x| {
                if x.reason == widened && brk!("widen_cut_encloses" => false; true) {
                    x.reason = reason;
                }
                x
            })
            .collect();
        let mut seeds = self.apply_faults(standing);
        self.lattice_settle(true)?;
        let cycling = brk!("lattice_cycle_unnamed" => Vec::new(); self.improving_cycles(&open));
        let improving = self.h.intern("improving_cycle");
        // a divergence names the cells of its own cycle: one component of
        // the graph of first firings
        let mut groups: HashMap<usize, usize> = HashMap::new();
        for (ck, c) in cycling {
            let marker = self.hole_lattice_cell(ck.clone(), improving);
            let g = brk!("shrug_cycle_merged" => 0; c);
            let gi = *groups.entry(g).or_insert_with(|| {
                self.cycle_groups.push(Vec::new());
                self.cycle_groups.len() - 1
            });
            self.cycle_groups[gi].push(marker);
            self.cycle_of.insert(marker, gi);
            seeds.push(Unknown::Cell(ck));
        }
        self.poison(seeds, &open, true)?;
        // a join value the wall left is a bound, and the join of what was
        // contributed to it: its Cover says of what
        self.join_covers(&open)?;
        for p in open {
            let marker = self.h.mkf(self.v.s_lattice, &[Term::atom(p)]);
            self.cell_hole(marker, reason);
        }
        Ok(())
    }

    /// THE CELLS ON AN IMPROVING CYCLE of the open lattices `open`: cells
    /// some value of which was first concluded, through first firings, from
    /// an earlier value of the same cell (`reached_from_own`). A min over a
    /// negative cycle, or a max over a positive one, is such a cycle, and
    /// improves until a wall stops it; a tie (a zero-weight cycle) is no
    /// first conclusion, and cells that improved through one another along
    /// paths no value of which came from its own cell's are none either,
    /// whatever order their values arrived in. Tarjan over the graph of
    /// first firings, a cell's values one node, narrows the cells to ask:
    /// a value reached from its own cell is on a cycle of that graph.
    fn improving_cycles(&mut self, open: &[Sym]) -> Vec<(LatKey, usize)> {
        let mut roots: Vec<FactId> = Vec::new();
        for p in open {
            roots.extend(self.store.rel_all(&self.h, *p));
        }
        roots.extend(self.lat_superseded.iter().copied().filter(|f| open.contains(&self.store.rec(*f).rel)));
        roots.sort_unstable();
        let mut ids: HashMap<Unknown, usize> = HashMap::new();
        let mut names: Vec<Unknown> = Vec::new();
        let mut succ: Vec<Vec<usize>> = Vec::new();
        let mut node = |u: Unknown, names: &mut Vec<Unknown>, succ: &mut Vec<Vec<usize>>| -> usize {
            *ids.entry(u.clone()).or_insert_with(|| {
                names.push(u);
                succ.push(Vec::new());
                names.len() - 1
            })
        };
        let mut seen: HashSet<FactId> = HashSet::new();
        let mut stack = roots;
        while let Some(f) = stack.pop() {
            if !seen.insert(f) || self.store.rec(f).base() {
                continue;
            }
            let Some(prems) = self.cycle_prems(f) else { continue };
            let t = node(self.unknown_of(f), &mut names, &mut succ);
            for q in prems {
                if self.store.rec(q).base() {
                    continue;
                }
                let fq = node(self.unknown_of(q), &mut names, &mut succ);
                succ[fq].push(t);
                stack.push(q);
            }
        }
        let comp = tarjan(&succ);
        let mut size: HashMap<usize, usize> = HashMap::new();
        for c in &comp {
            *size.entry(*c).or_default() += 1;
        }
        let mut out: Vec<(String, LatKey, usize)> = Vec::new();
        for (i, n) in names.iter().enumerate() {
            let Unknown::Cell(ck) = n else { continue };
            if !open.contains(&ck.0) || !self.lat_history.contains_key(ck) {
                continue;
            }
            // a join value comes from its own earlier value by construction:
            // each step is a contribution, and a step's size is bounded by
            // what exists to contribute, so none of it is a divergence
            if brk!("join_cycle_named" => false; self.join_rels.contains_key(&ck.0)) {
                continue;
            }
            if (size[&comp[i]] > 1 || succ[i].contains(&i))
                && brk!("lattice_cycle_merged_cells" => true; self.reached_from_own(ck))
            {
                out.push((self.unknown_text(n), ck.clone(), comp[i]));
            }
        }
        out.sort_by(|a, b| cmp_js(&a.0, &b.0));
        out.into_iter().map(|x| (x.1, x.2)).collect()
    }

    /// The fact premises of the firing `f` was first concluded by: each held
    /// before `f`, so the graph they make has no cycle.
    fn cycle_prems(&self, f: FactId) -> Option<Vec<FactId>> {
        brk!("lattice_cycle_any_firing" => Some(self.store.fact_premises(f));
            self.store.first_firing(f).map(|ps| fact_prems(&ps)))
    }

    /// Was some value of the cell first concluded from an earlier value of
    /// its own? Backwards from all its values at once, through first firings:
    /// a premise that is a value of the cell is one (every firing's premises
    /// held before it, so it is an earlier one).
    fn reached_from_own(&self, ck: &LatKey) -> bool {
        let own = Unknown::Cell(ck.clone());
        let mut stack: Vec<FactId> = self.lat_history.get(ck).cloned().unwrap_or_default();
        stack.extend(self.lat_cur.get(ck).copied());
        stack.extend(self.sub_cur.get(ck).cloned().unwrap_or_default());
        let mut seen: HashSet<FactId> = HashSet::new();
        while let Some(f) = stack.pop() {
            if !seen.insert(f) || self.store.rec(f).base() {
                continue;
            }
            for q in self.cycle_prems(f).unwrap_or_default() {
                if self.store.rec(q).base() {
                    continue;
                }
                if self.unknown_of(q) == own {
                    return true;
                }
                stack.push(q);
            }
        }
        false
    }

    /// WHAT A LATTICE PROGRAM MAY NOT BE, each refused with its reason.
    /// WHAT A TAG REFUSES (docs/aggregates.md, "Tags, as built"): a second
    /// algebra for its relation, an asserted fact (the cell holds what its
    /// rules conclude), and a counting tag inside its own recursion.
    fn refuse_tags(&mut self) -> Result<(), Halt> {
        let reject = |msg: String| Err(Halt::Strat(format!("program rejected: {msg}"), String::new()));
        if let Some(m) = self.tags.refused.first() {
            return reject(m.clone());
        }
        let mut names: Vec<Sym> = self.tags.by_rel.keys().copied().collect();
        names.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        for p in &names {
            let alg = self.tags.by_rel[p].1;
            for f in self.store.rel_all(&self.h, *p) {
                let r = self.store.rec(f);
                if brk!("tag_asserted" => false; r.base() || r.frozen()) {
                    return reject(format!(
                        "{} is asserted, but {} is tagged ({}): a tag holds what its rules conclude; assert the input into \
                         another relation and conclude it, its weight the head's tag",
                        self.store.key(&self.h, f),
                        self.h.name(*p),
                        alg.name()
                    ));
                }
            }
        }
        for p in &names {
            let Some(c) = self.tags.count_rel.get(p) else { continue };
            if brk!("count_demand_admitted" => false; self.answer.demand_rels.contains(c) || self.answer.demand_rels.contains(p)) {
                return reject(format!(
                    "tag {} (counting): a rule concluding it is not range-restricted, so its derivations would be unfolded at a call site",
                    self.h.name(*p)
                ));
            }
        }
        let deps = self.rel_deps();
        let in_recursion = |p: Sym| {
            self.rules.iter().any(|r| {
                r.clause.head.rel == p
                    && r.clause.head.temporal != Temporal::Next
                    && r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| reaches_in(&deps, l.rel, p))
            })
        };
        let counting = names.iter().copied().find(|p| !self.tags.by_rel[p].1.idempotent() && in_recursion(*p));
        if let Some(p) = brk!("counting_recursion_admitted" => None; counting) {
            return reject(format!(
                "tag {} (counting) is inside its own recursion: counting's ⊕ is not idempotent, so a count of derivations \
                 through a recursion need not settle (it is not p-stable); count over a relation closed below it, or tag it tropical, viterbi or trust",
                self.h.name(p)
            ));
        }
        Ok(())
    }

    fn refuse_lattices(&mut self) -> Result<(), Halt> {
        let reject = |msg: String| Err(Halt::Strat(format!("program rejected: {msg}"), String::new()));
        if let Some(m) = self.decl_refused.first() {
            return reject(m.clone());
        }
        // A RELATION WITH DOMINANCE RULES AND ANOTHER ALGEBRA, or rules that
        // disagree on its shape (docs/aggregates.md, "Subsumption, as built")
        if let Some((p, why)) = self.answer.lattice_refused.iter().find(|(p, _)| self.dominance_rel(*p)) {
            let text = match self.h.name(*why) {
                "two_algebras" => "it has dominance rules and is declared a lattice or a tag too; a relation has one algebra",
                "two_arities" => "its dominance rules compare its facts at two arities",
                "two_keys" => "its dominance rules read two keys: the prefix both facts share must be the same in every rule",
                "two_orders" => "its declarations order it two ways: a relation has one declared order, in one direction for each value",
                "order_and_rules" => "it has a declared order and dominance rules of its own: the declaration is its whole dominance, whose transitivity is by construction; write the rules or declare the order",
                _ => "safety.rofl refused its dominance rules",
            };
            return reject(format!("subsumption {}: {text}", self.h.name(*p)));
        }
        let mut counted: Vec<Sym> = self.tags.by_rel.keys().copied().filter(|p| self.dominance_rel(*p) && !self.subs.contains_key(p)).collect();
        counted.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        if let Some(p) = counted.first() {
            return reject(format!("subsumption {}: it has dominance rules and is a tag too; a relation has one algebra", self.h.name(*p)));
        }
        if let Some((p, why)) = self.answer.lattice_refused.first() {
            let text = match self.h.name(*why) {
                "not_idempotent" => "a lattice's ⊕ must be idempotent (min, max, or, and; union, hull, bitor): count, sum, median, quantile and rank are body aggregates, stratified",
                "two_algebras" => "it is declared with two operations; a relation has one algebra",
                "two_arities" => "it is declared with two arities",
                "widen_not_hull" => "a widening is declared for an interval hull only: a union's top is no set, a bitor has finite height, and an order lattice that never settles is an improving cycle",
                "two_widenings" => "it is declared with two widenings",
                _ => "safety.rofl refused the declaration",
            };
            return reject(format!("lattice {}: {text}", self.h.name(*p)));
        }
        if self.lattices.is_empty() {
            return Ok(());
        }
        let mut names: Vec<Sym> = self.lattices.keys().copied().collect();
        names.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        for p in &names {
            for f in self.store.rel_all(&self.h, *p) {
                let r = self.store.rec(f);
                if brk!("lattice_asserted" => false; r.base() || r.frozen()) {
                    return reject(if self.subs.contains_key(p) {
                        format!(
                            "{} is asserted, but {} is subsumptive: its cells hold the values its rules conclude that none dominates; \
                             assert the input into another relation and conclude it",
                            self.store.key(&self.h, f),
                            self.h.name(*p)
                        )
                    } else {
                        format!(
                            "{} is asserted, but {} is a lattice ({}): a lattice cell holds what its rules conclude; \
                             assert the input into another relation and conclude it",
                            self.store.key(&self.h, f),
                            self.h.name(*p),
                            self.lattices[p].1.name()
                        )
                    });
                }
            }
            if self.answer.demand_rels.contains(p) {
                return reject(format!(
                    "{} {}: a rule concluding it is not range-restricted, so its cells would be unfolded at a call site",
                    self.lat_word(*p),
                    self.h.name(*p)
                ));
            }
        }
        // A RELATION ANSWERED ON DEMAND is unfolded at its call sites while
        // the lattice it reads may still be improving, and what it answered
        // is kept.
        if let Some(r) = self.rules.iter().find(|r| {
            self.answer.demand_rels.contains(&r.clause.head.rel)
                && r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| self.lattices.contains_key(&l.rel))
        }) {
            let lat = r.clause.body.iter().flat_map(|b| b.lits_deep()).find(|l| self.lattices.contains_key(&l.rel)).unwrap().rel;
            return reject(format!(
                "rule {} reads the {} {} and concludes {}, which is answered on demand (a rule concluding it is not \
                 range-restricted): it would be unfolded while the {} is still improving",
                self.h.name(r.id),
                self.lat_word(lat),
                self.h.name(lat),
                self.h.name(r.clause.head.rel),
                self.lat_word(lat)
            ));
        }
        if self.answer.reads_provenance {
            return reject(format!(
                "a rule reads {} beside the {} {}: a cell that improves withdraws its old firings, so provenance read during the evaluation would change under the reader",
                self.h.name(self.v.derived_by),
                self.lat_word(names[0]),
                self.h.name(names[0])
            ));
        }
        Ok(())
    }

    /// THE STOCK EVALUATOR CLOSES A LATTICE WHERE ITS TABLE SAYS: a lattice
    /// relation must be ranked, and a rule reading it from outside its
    /// recursion ranked strictly above it.
    fn check_lattice_strata(&self, strat: &HashMap<Sym, i64>, strat_rules: &[Rc<ERule>]) -> Result<(), Halt> {
        let mut names: Vec<Sym> = self.lattices.keys().copied().filter(|p| self.derived_rels.contains(p)).collect();
        names.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        for p in names {
            if !strat.contains_key(&p) {
                return Err(Halt::Strat(
                    format!(
                        "program rejected: the stock evaluator cannot close the {} {}: it has no stratum row \
                         (load rules/strata.rofl, or run the default evaluator)",
                        self.lat_word(p),
                        self.h.name(p)
                    ),
                    String::new(),
                ));
            }
        }
        for r in strat_rules.iter().filter(|r| !r.lattice_outer.is_empty()) {
            let at = if r.clause.head.temporal == Temporal::Next { Some(i64::MAX) } else { strat.get(&r.clause.head.rel).copied() };
            for p in &r.lattice_outer {
                let ok = match (at, strat.get(p)) {
                    (Some(h), Some(i)) => *i < h,
                    _ => !self.derived_rels.contains(p),
                };
                if !ok {
                    return Err(Halt::Strat(
                        format!(
                            "program rejected: rule {}: the stock evaluator cannot order its read of the {} {}: \
                             a rule reading it from outside its recursion must be ranked strictly above it \
                             (load rules/strata.rofl, or run the default evaluator)",
                            self.h.name(r.id),
                            self.lat_word(*p),
                            self.h.name(*p)
                        ),
                        String::new(),
                    ));
                }
            }
        }
        Ok(())
    }

    /// The aggregate as written, the correlation substituted: `why`'s name for
    /// a cell.
    fn agg_desc(&mut self, a: &Agg, s: &Subst) -> Sym {
        let mut out = String::new();
        let terms = |e: &mut Eval, ts: &[Term], out: &mut String| {
            for (i, t) in ts.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                let r = resolve(&mut e.h, *t, s);
                e.h.canon_term(r, out);
            }
        };
        out.push_str(a.op.name());
        out.push('(');
        if a.op == AggOp::AtLeast {
            terms(self, &[a.result], &mut out);
            out.push_str(", ");
        }
        terms(self, &a.vals, &mut out);
        if !a.keys.is_empty() {
            out.push_str(" ; ");
            terms(self, &a.keys, &mut out);
        }
        out.push_str(" : ");
        for (i, b) in a.body.iter().enumerate() {
            if i > 0 {
                out.push_str(", ");
            }
            match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) => {
                    if matches!(b, BodyElem::Neg(_)) {
                        out.push_str("not ");
                    }
                    let k = self.resolved_lit_key(l, s);
                    out.push_str(&k);
                }
                BodyElem::Bi { op, l, r } => {
                    let (lt, rt) = (resolve(&mut self.h, *l, s), resolve(&mut self.h, *r, s));
                    self.h.canon_term(lt, &mut out);
                    out.push(' ');
                    out.push_str(self.h.name(*op));
                    out.push(' ');
                    self.h.canon_term(rt, &mut out);
                }
                BodyElem::Agg(_) => out.push_str("(aggregate)"),
            }
        }
        out.push(')');
        self.h.intern(&out)
    }

    /// `hole($cell(...), Reason)`, written the way `arith_hole` writes one.
    fn cell_hole(&mut self, marker: Term, reason: Sym) {
        if self.hole_met(marker, reason) {
            self.charge_hole_row();
        }
        let args = [marker, Term::atom(reason)];
        if self.eval_hole(&args) {
            let id = self.store.get(self.v.hole, self.v.kernel_persp, &args).unwrap();
            self.cur_front.note(self.v.hole, id);
        }
    }

    /// A hole row of this evaluation; true if it was new.
    fn eval_hole(&mut self, args: &[Term]) -> bool {
        let (id, new) = self.store.put(&self.h, self.v.hole, self.v.kernel_persp, args, F_BASE | F_FROZEN);
        if !new {
            return false;
        }
        self.store.eval_holes.push(id);
        true
    }

    /// THE CELL AS FACTS, for rules to read: `agg_cell` for a value,
    /// `agg_sealed` for every relation it read, and — only when some rule
    /// reads them — `agg_member` and `agg_member_prem`. The witness is stored
    /// in full either way; this gate decides only the copy, as
    /// `reads_provenance` does for `derived_by`. Tick-scoped: they describe
    /// this tick's cells, so a key never reads two values.
    fn reflect_cell(&mut self, c: CellId) -> Result<(), Halt> {
        if self.no_provenance {
            return Ok(());
        }
        let r = self.store.cell(c).clone();
        // sealed for a conclusion `@next`: data in the tick that conclusion
        // arrives in, where every reader of the reflection can rank above it
        let CellOwner::Body { rule, .. } = r.owner;
        if r.tick == self.store.tick && brk!("next_cells_reflected_early" => false; self.next_rules.contains(&rule)) {
            return Ok(());
        }
        let key = self.store.cell_key_term(&mut self.h, c);
        let mut rows: Vec<(Sym, Vec<Term>)> = Vec::new();
        if let CellValue::Value(v) = r.value {
            rows.push((self.v.agg_cell, vec![key, v, Term::int(r.height as i64)]));
        }
        for x in self.store.cell_seals(c).to_vec() {
            brk!("no_seal" => { let _ = x; }; rows.push((self.v.agg_sealed, vec![key, Term::atom(x.rel), Term::int(x.round as i64)])));
        }
        if self.answer.reads_members {
            let members = self.store.cell_members(c).to_vec();
            for (i, m) in members.iter().enumerate() {
                let n = Term::int(i as i64 + 1);
                let proj = self.h.list(&m.proj);
                rows.push((self.v.agg_member, vec![key, n, proj, Term::int(m.height as i64)]));
                for p in self.store.member_prems(m).to_vec() {
                    let t = self.prem_term(p);
                    rows.push((self.v.agg_member_prem, vec![key, n, t]));
                }
            }
        }
        for (rel, args) in rows {
            let (id, new) = self.store.put(&self.h, rel, self.v.kernel_persp, &args, F_TICK);
            if new {
                self.charge_row(None, false)?;
                self.cur_front.note(rel, id);
            }
        }
        Ok(())
    }

    /// A member's premise as a term: `$fact(rel, persp, args)`, `$neg("key")`
    /// or `$bi("desc")`.
    fn prem_term(&mut self, p: PremRef) -> Term {
        match p {
            PremRef::Fact(f) => {
                let r = self.store.rec(f);
                let (rel, persp) = (r.rel, r.persp);
                let args = self.store.args(f).to_vec();
                fact_term(&mut self.h, &self.v, rel, persp, &args)
            }
            PremRef::Neg(k) => {
                let t = Term::str(k);
                self.h.mkf(self.v.s_neg, &[t])
            }
            PremRef::Bi(d) => {
                let t = Term::str(d);
                self.h.mkf(self.v.s_bi, &[t])
            }
            PremRef::Cell(c) => self.store.cell_key_term(&mut self.h, c),
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
        // NO CLONE OF THE ARGUMENT LIST. `Term` is a Copy newtype over a u64,
        // so the element can be copied out and the borrow of `l` released
        // before `resolve` takes `&mut self.h` — which is what the clone was
        // buying. It bought it with a heap allocation on EVERY probe, and
        // there are 15 512 558 probes in a 128-file world.
        for i in 0..l.args.len() {
            let a = l.args[i];
            let t = resolve(&mut self.h, a, s);
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
        only: Option<&FxSet<FactId>>,
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
            let fargs = self.store.args(f);
            let s3 = match persp {
                Some(_) => unify_all(&self.h, &l.args, fargs, s),
                None => match unify(&self.h, persp_t, Term::atom(fp), s) {
                    Some(s2) => unify_all(&self.h, &l.args, fargs, &s2),
                    None => None,
                },
            };
            let Some(s3) = s3 else { continue };
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
        if self.store.unordered && self.firing {
            out.extend(open.into_iter().map(|(s, r, _)| (s, r)));
            return Ok(out);
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
            self.wall_spent.set(Some(("depth", depth as i64, MAX_DEPTH as i64)));
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
        self.demand_heads.push(head.clone());
        let sols = self.solve_body(&rn.body, s3, depth + 1, None, Some(r.id));
        self.demand_heads.pop();
        let sols = sols?;
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
                let (id, is_new) = self.store.put(&self.h, call.rel, p, &args, F_TICK);
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
        rename_body(&mut self.h, &mut c2.body, n);
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
            if let Some(iv) = self.eval_iv(r, s, &mut fail) {
                return match iv {
                    Some(t) => unify(&self.h, l, t, s),
                    None => {
                        self.builtin_failed(rule_id, fail);
                        None
                    }
                };
            }
            let rv = match eval_str_op(&mut self.h, r, s, &mut fail) {
                StrOp::NotOne => eval_arith(&mut self.h, r, s, &mut fail).map(Term::int),
                StrOp::Refused => None,
                StrOp::Value(t) => Some(t),
            };
            let Some(rv) = rv else {
                self.builtin_failed(rule_id, fail);
                return None;
            };
            return unify(&self.h, l, rv, s);
        }
        if op == v.op_in || op == v.op_subset {
            let (lt, rt) = (resolve(&mut self.h, l, s), resolve(&mut self.h, r, s));
            if !self.h.is_ground(lt) || !self.h.is_ground(rt) {
                return None;
            }
            let held = if op == self.v.op_in { self.join_member(lt, rt) } else { self.join_subset(lt, rt) };
            return match held {
                Some(true) => Some(s.clone()),
                Some(false) => None,
                None => {
                    self.builtin_failed(rule_id, SET_TYPE);
                    None
                }
            };
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
            self.builtin_failed(rule_id, fail);
            return None;
        };
        let rv = side(&mut self.h, r, &mut fail);
        let Some(rv) = rv else {
            self.builtin_failed(rule_id, fail);
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

    /// EVERY SOLUTION OF A BUILTIN: one or none, but for `E in S` with E not
    /// ground, which is one per element of S that E matches — a set's
    /// elements in their canonical order, a bitset's bits from 0, an
    /// interval's integers from its low end, each of those a step charged
    /// against the budget, so a wide interval meets the wall and never a
    /// silent cap. A value of S that is no set, interval or bitset is
    /// `set_type_error`, a fault.
    fn eval_builtins(&mut self, op: Sym, l: Term, r: Term, s: &Subst, rule_id: Option<Sym>) -> Result<Vec<Subst>, Halt> {
        if op != self.v.op_in {
            return Ok(self.eval_builtin(op, l, r, s, rule_id).into_iter().collect());
        }
        let (lt, rt) = (resolve(&mut self.h, l, s), resolve(&mut self.h, r, s));
        if !self.h.is_ground(rt) {
            return Ok(Vec::new());
        }
        if self.h.is_ground(lt) {
            return Ok(self.eval_builtin(op, l, r, s, rule_id).into_iter().collect());
        }
        let mut out = Vec::new();
        match self.join_read(rt) {
            Some((AggOp::Union, sv)) => {
                let xs = set_elems(&self.h, &self.v, sv).ok_or_else(|| off_carrier(AggOp::Union))?.to_vec();
                for x in xs {
                    out.extend(unify(&self.h, lt, x, s));
                }
            }
            Some((AggOp::Hull, sv)) => {
                let (lo, hi) = iv_bounds(&self.h, &self.v, sv).ok_or_else(|| off_carrier(AggOp::Hull))?;
                // an infinite end has no last member to enumerate to
                if brk!("in_iv_unbounded_walked" => false; lo == NINF || hi == PINF) {
                    self.builtin_failed(rule_id, UNBOUNDED);
                    return Ok(out);
                }
                for n in lo..=brk!("in_iv_open_high" => hi - 1; hi) {
                    brk!("in_iv_uncharged" => (); self.bump_steps()?);
                    out.extend(unify(&self.h, lt, Term::int(n), s));
                }
            }
            Some((_, sv)) => {
                let n = sv.as_int().ok_or_else(|| off_carrier(AggOp::BitOr))?;
                for b in 0..60 {
                    if n >> b & 1 == 1 {
                        out.extend(unify(&self.h, lt, Term::int(b), s));
                    }
                }
            }
            None => self.builtin_failed(rule_id, SET_TYPE),
        }
        Ok(out)
    }

    /// AN INTERVAL FUNCTION on the right of `is` (`ivadd`, `ivsub`, `ivmul`,
    /// `ivmeet`; `IvFn`): None when the term is none, else its value, or
    /// None inside with `fail` set — `ARITH_UNBOUND` for an operand not yet
    /// bound, `ARITH_TYPE` for one that is no interval or integer (or a
    /// multiplier that is no integer), `ARITH_OVERFLOW` for a finite end past
    /// the term range, and nothing at all for an empty meet, which is no
    /// value and no fault.
    fn eval_iv(&mut self, r: Term, s: &Subst, fail: &mut u8) -> Option<Option<Term>> {
        let t = walk(&self.h, r, s);
        let TermK::Func(i) = t.kind() else { return None };
        let f = IvFn::from_name(self.h.name(self.h.fname(i)))?;
        let args = self.h.fargs(i).to_vec();
        if args.len() != 2 {
            *fail = ARITH_TYPE;
            return Some(None);
        }
        let mut ends = Vec::with_capacity(2);
        for a in args {
            let a = resolve(&mut self.h, a, s);
            if !self.h.is_ground(a) {
                *fail = ARITH_UNBOUND;
                return Some(None);
            }
            let e = match a.kind() {
                TermK::Int(n) => Some((n, n)),
                _ => iv_bounds(&self.h, &self.v, a).filter(|(lo, hi)| brk!("iv_operand_unchecked" => { let _ = (lo, hi); true }; lo <= hi)),
            };
            let Some(e) = e else {
                *fail = ARITH_TYPE;
                return Some(None);
            };
            ends.push(e);
        }
        match f.apply(ends[0], ends[1]) {
            Ok(Some((lo, hi))) => Some(Some(mk_iv(&mut self.h, &self.v, lo, hi))),
            Ok(None) => {
                *fail = ARITH_UNBOUND;
                Some(None)
            }
            Err(IvFault::Type) => {
                *fail = ARITH_TYPE;
                Some(None)
            }
            Err(IvFault::Overflow) => {
                *fail = brk!("iv_overflow_typed" => ARITH_TYPE; ARITH_OVERFLOW);
                Some(None)
            }
        }
    }

    /// `join_canon` of a value, a set remembered: a join is canonical, and a set read from a cell is one a join or
    /// `join_canon` made, so each is sorted and rebuilt once, not at every use.
    fn join_canon_of(&mut self, op: AggOp, t: Term) -> Result<Term, Sym> {
        if op != AggOp::Union {
            return op.join_canon(&mut self.h, &self.v, &mut self.join_keys, t);
        }
        if self.join_canonical.contains(&t) {
            return Ok(t);
        }
        let c = op.join_canon(&mut self.h, &self.v, &mut self.join_keys, t)?;
        self.join_canonical.insert(c);
        Ok(c)
    }

    /// What the right side of `in` or `subset` reads: the term as the
    /// canonical value of the carrier its shape names, or None when it is no
    /// value of any -- `set_type_error`. The same test a contribution passes
    /// (`join_canon`), so `iv(5, 1)`, a negative bitset and an empty or open
    /// set are refused here as they are refused as values.
    fn join_read(&mut self, t: Term) -> Option<(AggOp, Term)> {
        let op = AggOp::join_carrier_of(&self.h, &self.v, t)?;
        let c = brk!("join_read_unchecked" => Ok(t); self.join_canon_of(op, t)).ok()?;
        Some((op, c))
    }

    /// `E in S` over ground terms: E an element of the set S, an integer
    /// inside the interval S, a bit set in the bitset S. None when S is no
    /// value of a join carrier.
    fn join_member(&mut self, e: Term, s: Term) -> Option<bool> {
        let (op, sv) = self.join_read(s)?;
        Some(match op {
            AggOp::Union => {
                let xs = set_elems(&self.h, &self.v, sv)?;
                brk!("in_first_only" => xs.first() == Some(&e); set_contains(&self.h, &mut self.join_keys, xs, e))
            }
            AggOp::Hull => {
                let (lo, hi) = iv_bounds(&self.h, &self.v, sv)?;
                e.as_int().is_some_and(|n| lo <= n && n <= hi)
            }
            _ => {
                let bits = sv.as_int()?;
                e.as_int().is_some_and(|b| (0..60).contains(&b) && bits >> b & 1 == 1)
            }
        })
    }

    /// `A subset S` over ground terms of one carrier: `A ⊑ S` in that
    /// carrier's order. None when S is no value, when A is no value, or when
    /// the two are of different carriers -- each `set_type_error`.
    fn join_subset(&mut self, a: Term, s: Term) -> Option<bool> {
        let (op, sv) = self.join_read(s)?;
        let (aop, av) = self.join_read(a)?;
        if aop != op {
            return None;
        }
        if op == AggOp::Hull && brk!("subset_iv_low_only" => true; false) {
            let ((l1, _), (l2, _)) = (iv_bounds(&self.h, &self.v, av)?, iv_bounds(&self.h, &self.v, sv)?);
            return Some(l2 <= l1);
        }
        op.join_leq(&self.h, &self.v, av, sv).ok()
    }

    /// A builtin that failed for an error, not for falsity: noted as the
    /// fault, and a hole on the rule when there is one to name.
    fn builtin_failed(&mut self, rule_id: Option<Sym>, fail: u8) {
        if fail == ARITH_UNBOUND {
            return;
        }
        let reason = hole_reason_of(&self.v, fail);
        self.fault.get_or_insert(reason);
        self.fault_count += 1;
        self.last_fault = Some(reason);
        self.last_fault_rule = rule_id;
        if let Some(rid) = rule_id {
            // a rule a lattice decides writes its hole when the lattice
            // closes, if the failed derivation still stands (`lattice_fault`)
            if brk!("lattice_rule_hole_early" => false; self.firing && self.rules.iter().any(|r| r.id == rid && r.lat_close.is_some())) {
                return;
            }
            self.arith_hole(rid, reason);
        }
    }

    fn arith_hole(&mut self, rule_id: Sym, reason: Sym) {
        let marker = self.rule_marker(rule_id);
        if self.hole_met(marker, reason) {
            self.charge_hole_row();
        }
        let args = [marker, Term::atom(reason)];
        if self.eval_hole(&args) {
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
            .filter(|r| !(self.wfs_skip_cone && self.unknown_cone.contains(&r.clause.head.rel)))
            .cloned()
            .collect()
    }

    /// What an evaluation knows of the cells it sealed: gone with the
    /// derived layer, which `clear_derived` drops with the cells it frees.
    fn forget_cells(&mut self) {
        self.agg_memo.clear();
        self.reach_memo.clear();
        self.cell_reach.clear();
        self.hol_shared.clear();
        self.thr_cells.clear();
        self.thr_open.clear();
        self.thr_acc.clear();
        self.thr_fresh.clear();
        self.height_memo.clear();
    }

    fn wfs_round(&mut self, assume: Rc<Assumption>) -> Result<(), Halt> {
        self.assume = Some(assume);
        self.clear_derived();
        self.refix_unknowns();
        self.forget_cells();
        self.rows = 0;
        self.active.clear();
        self.staged.clear();
        self.staged_alts.clear();
        let rs = self.round_rules();
        self.activate(&rs)
    }

    /// WHAT A HOLE LEAVES OUT, UNDER THE ALTERNATING FIXPOINT, is a shrug:
    /// carried through the model a round just derived (negations judged
    /// against `assume`, the round's), and through each negation the round
    /// could not decide for it, it grows with the alternation and is never
    /// withdrawn by it, so a negation over it is neither true nor undefined
    /// in any round after (docs/aggregates.md, "Shrugs, as built").
    fn wfs_unknowns(&mut self, assume: Rc<Assumption>) -> Result<(), Halt> {
        let seeds: Vec<Unknown> =
            std::mem::take(&mut self.plain_pending).into_iter().map(|(u, _)| u).filter(|u| !self.unknown_holds(u)).collect();
        if seeds.is_empty() && self.lat_undecided.is_empty() {
            return Ok(());
        }
        for u in &seeds {
            self.lat_plain.insert(u.clone());
        }
        let before = self.assume.replace(assume);
        let r = self.poison_with(seeds, &[], &[], false);
        self.assume = before;
        self.lat_undecided.clear();
        r
    }

    /// A fresh carry for an alternation: nothing noted, every rule closed.
    fn wfs_carry_reset(&mut self) {
        self.lat_unknown.clear();
        self.lat_unknown_rel.clear();
        self.lat_unknown_at.clear();
        self.unknown_at.clear();
        self.unknown_any.clear();
        self.lat_spread.clear();
        self.lat_undecided.clear();
        self.lat_plain.clear();
        self.lat_withdrawn.clear();
        self.plain_closed = self.rules.iter().filter(|r| r.safe).map(|r| r.id).collect();
    }

    fn run_well_founded(&mut self) -> Result<(), Halt> {
        // NO CELL UNDER THE ALTERNATING FIXPOINT (docs/aggregates.md, "Well-
        // founded worlds and ticks, as built"). Every round re-derives under an
        // assumption, so a cell sealed or improved in one counts facts that may
        // not hold, and an undefined member leaves the value an interval. The
        // well-founded world is evaluated below and its true and unknown rows
        // fed to a stratified world that aggregates them (`Session::feed_below`).
        const COMPOSE: &str = "evaluate the well-founded world below and feed its true and unknown rows \
                               to a stratified world that aggregates them (rofl-load --below)";
        if let Some(p) = brk!("wfs_admits_tag" => None; self.tags.by_rel.keys().min_by(|a, b| cmp_js(self.h.name(**a), self.h.name(**b)))) {
            return Err(Halt::Strat(
                format!(
                    "program rejected: tag {} ({}) is not evaluated under well_founded semantics: a tag is a cell, and a cell \
                     merged under an assumption holds a value no model may have; {COMPOSE}",
                    self.h.name(*p),
                    self.tags.by_rel[p].1.name()
                ),
                String::new(),
            ));
        }
        if let Some(p) = self.subs.keys().filter(|_| brk!("wfs_admits_subsumption" => false; true)).min_by(|a, b| cmp_js(self.h.name(**a), self.h.name(**b))) {
            return Err(Halt::Strat(
                format!(
                    "program rejected: subsumption {} is not evaluated under well_founded semantics: a value dominated \
                     under an assumption is dropped for a fact no model may have; {COMPOSE}",
                    self.h.name(*p)
                ),
                String::new(),
            ));
        }
        if let Some(p) = brk!("wfs_admits_lattice" => None; self.lattices.keys().filter(|p| !self.subs.contains_key(p)).min_by(|a, b| cmp_js(self.h.name(**a), self.h.name(**b)))) {
            return Err(Halt::Strat(
                format!(
                    "program rejected: lattice {} is not evaluated under well_founded semantics: a cell improved \
                     under an assumption holds a value no model may have; {COMPOSE}",
                    self.h.name(*p)
                ),
                String::new(),
            ));
        }
        let admitted = |op: AggOp| match op {
            AggOp::AtLeast => brk!("wfs_admits_threshold" => true; false),
            _ => brk!("wfs_admits_body_aggregate" => true; false),
        };
        let found = self.rules.iter().find_map(|r| {
            r.clause.body.iter().find_map(|b| match b {
                BodyElem::Agg(a) if !admitted(a.op) => Some((r.id, a.op)),
                _ => None,
            })
        });
        if let Some((rid, op)) = found {
            return Err(Halt::Strat(
                format!(
                    "program rejected: {} is not evaluated under well_founded semantics (rule {}): a cell sealed \
                     under an assumption counts facts that may not hold; {COMPOSE}",
                    op.name(),
                    self.h.name(rid)
                ),
                String::new(),
            ));
        }
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
        // a rule reading no derived relation writes the table as data (boot.rofl's own ranks), and is not computing it
        let concluded: HashSet<Sym> = self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next).map(|r| r.clause.head.rel).collect();
        if self.rules.iter().any(|r| {
            r.clause.head.rel == self.v.stratum
                && r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| concluded.contains(&l.rel))
        }) {
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
        // WHAT READS `unknown` IS A LEVEL ABOVE THE REST (docs/aggregates.md,
        // "Shrugs, as built"): the alternation runs first without it, its
        // undefined atoms are written, and it runs again with them fixed, so a
        // negation of `unknown` is judged where its rows exist
        // (f_a_negation_of_unknown_was_judged_before_unknown_was_written).
        let two_levels = !self.unknown_cone.is_empty() && brk!("shrug_wfs_one_level" => false; true);
        self.wfs_skip_cone = two_levels;
        self.wfs_fixed.clear();
        let (g1, w1, m1) = self.alternate(None)?;
        let mut gap = self.wfs_gap(&g1, &m1);
        let mut wits = w1;
        if two_levels {
            for (_, k, id) in &gap {
                let args = self.store.args(*id).to_vec();
                let at = atom_term(&mut self.h, k.0, &args);
                let persp = self.store.rec(*id).persp;
                self.wfs_fixed.push((persp, at));
            }
            if !self.shrug_readers.is_empty() {
                self.refix_unknowns();
                self.shrug_snapshot()?;
            }
            self.wfs_skip_cone = false;
            // nothing below the level reads it, so the lower level's
            // under-estimate is one of this level's: it starts there
            let (g2, w2, m2) = self.alternate(Some(m1))?;
            let known: HashSet<FKey> = gap.iter().map(|x| x.1.clone()).collect();
            let more: Vec<(String, FKey, FactId)> = self
                .wfs_gap(&g2, &m2)
                .into_iter()
                .filter(|x| !known.contains(&x.1) && x.1 .0 != self.v.unknown)
                .collect();
            // an atom the upper level leaves undefined is read by `unknown`
            // only after that level: refused where a reader could read it
            for (_, k, id) in &more {
                let args = self.store.args(*id).to_vec();
                let at = atom_term(&mut self.h, k.0, &args);
                let u = Unknown::Tuple(self.v.unknown, self.store.rec(*id).persp, vec![at].into());
                let lits: Vec<Lit> = self.rules.iter().flat_map(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).cloned().collect::<Vec<_>>()).filter(|l| l.rel == self.v.unknown).collect();
                if lits.iter().any(|l| self.unknown_binds(l, &u, &Subst::new()).is_some()) && brk!("shrug_wfs_upper_unrefused" => false; true) {
                    self.wfs_fixed.clear();
                    return Err(Halt::Strat(
                        format!("program rejected: unknown is read of {}, which the level that reads unknown leaves undefined", self.store.key(&self.h, *id)),
                        "unknown(A) of an atom whose rule reads unknown is not written until that rule is settled".to_string(),
                    ));
                }
            }
            for (_, k, _) in &more {
                if let Some(w) = w2.get(k) {
                    wits.insert(k.clone(), w.clone());
                }
            }
            gap.extend(more);
            gap.sort_by(|a, b| cmp_js(&a.0, &b.0));
            self.wfs_fixed.clear();
        }
        let generous_wits = wits;
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
            self.wall_spent.set(Some(("rows", self.rows + gap.len() as i64, self.space)));
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
        let mut uids: Vec<Option<FactId>> = Vec::with_capacity(gap.len());
        for (_, k, id) in &gap {
            self.rows += 1;
            let persp = self.store.rec(*id).persp;
            let args = self.store.args(*id).to_vec();
            let at = atom_term(&mut self.h, k.0, &args);
            self.store
                .add(&self.h, self.v.unknown, persp, &[at], F_TICK);
            let uid = self.store.get(self.v.unknown, persp, &[at]);
            self.wfs_written.extend(uid);
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
        Ok(())
    }

    /// The alternating fixpoint over `round_rules`, to its close: the
    /// generous model, its firings, and the mean one.
    ///
    /// THE CARRY GROWS WITH THE ALTERNATION, so a fault met only under an
    /// over-estimate the alternation has since left behind would stay in it:
    /// `f(z) :- not w(z), <overflow>` faults in the first round, where w(z)
    /// is not yet known, and w(z) holds. So once it settles with anything
    /// carried, it runs again from the under-estimate it settled on, with
    /// what the last run met forgotten (its carry, its roots and the holes it
    /// wrote), until a run settles where it started: then every fault
    /// carried was met under the final estimates, and nothing else is.
    /// `from`: an under-estimate to start from, the store's facts when none.
    #[allow(clippy::type_complexity)]
    fn alternate(&mut self, from: Option<Rc<Assumption>>) -> Result<(Rc<Assumption>, HashMap<FKey, Witness>, Rc<Assumption>), Halt> {
        let carried = self.carried_unknowns(self.store.tick);
        let holes0: HashSet<FactId> = self.store.rel_persp(&self.h, self.v.hole, self.v.kernel_persp).into_iter().collect();
        let (edges0, now0) = (self.unk_edges.len(), self.holes_now.len());
        let mut start: Option<Rc<Assumption>> = from;
        let mut restarted = false;
        let mut total = 0usize;
        loop {
            let (generous, wits, mean, n) = self.alternate_from(start.clone(), &carried, total)?;
            total += n;
            let moved = !restarted || start.as_ref().is_none_or(|s| !same_recs(s, &mean));
            if self.lat_unknown.is_empty() || !moved || brk!("shrug_wfs_history_kept" => true; false) {
                self.diags.push(format!("well-founded fixpoint settled after {total} alternation(s)"));
                return Ok((generous, wits, mean));
            }
            let met: Vec<FactId> = self.store.rel_persp(&self.h, self.v.hole, self.v.kernel_persp).into_iter().filter(|f| !holes0.contains(f)).collect();
            self.store.remove_many(&met);
            self.unk_edges.truncate(edges0);
            self.holes_now.truncate(now0);
            self.holes_met = self.holes_now.iter().copied().collect();
            start = Some(mean);
            restarted = true;
        }
    }

    /// One alternation from `start` (the store's facts when none), after
    /// `done` alternations: the two limits, the generous one's firings, and
    /// how many alternations it took.
    #[allow(clippy::type_complexity)]
    fn alternate_from(
        &mut self,
        start: Option<Rc<Assumption>>,
        carried: &[(Unknown, bool)],
        done: usize,
    ) -> Result<(Rc<Assumption>, HashMap<FKey, Witness>, Rc<Assumption>, usize), Halt> {
        self.clear_derived();
        self.refix_unknowns();
        let mut mean = match start {
            Some(s) => s,
            None => Rc::new(self.assumption_of()),
        };
        self.wfs_carry_reset();
        let cumulative = brk!("shrug_wfs_carry_reset" => false; true);
        let mut i = 0usize;
        loop {
            self.plain_pending = carried.to_vec();
            if !cumulative {
                self.wfs_carry_reset();
            }
            let noted = self.lat_unknown.len();
            self.wfs_round(mean.clone())?;
            let generous = Rc::new(self.assumption_of());
            let generous_wits = self.all_witnesses();
            brk!("wfs_unknowns_decide" => (); self.wfs_unknowns(mean.clone())?);
            self.wfs_round(generous.clone())?;
            brk!("wfs_unknowns_decide" => (); self.wfs_unknowns(generous.clone())?);
            let next = Rc::new(self.assumption_of());
            let settled = same_recs(&next, &mean) && (!cumulative || self.lat_unknown.len() == noted);
            mean = next;
            if settled {
                return Ok((generous, generous_wits, mean, i + 1));
            }
            i += 1;
            if done + i >= MAX_ALTERNATIONS {
                self.wall_spent.set(Some(("alternations", (done + i) as i64, MAX_ALTERNATIONS as i64)));
                return Err(Halt::Budget("budget_exhausted", None));
            }
        }
    }

    /// The gap: what the two limits disagree about, sorted. Kernel
    /// bookkeeping is not part of the answer. What a hole left out is in
    /// neither limit: the carry holds it in every round after the first
    /// (`wfs_unknowns`), so it is a shrug and not undefined.
    fn wfs_gap(&self, generous: &Assumption, mean: &Assumption) -> Vec<(String, FKey, FactId)> {
        let mut gap: Vec<(String, FKey, FactId)> = Vec::new();
        for (k, id) in &generous.recs {
            if mean.recs.contains_key(k) || self.v.is_reserved(k.0) {
                continue;
            }
            gap.push((self.store.key(&self.h, *id), k.clone(), *id));
        }
        gap.sort_by(|a, b| cmp_js(&a.0, &b.0));
        gap
    }

    /// The lower level's undefined atoms, fixed in the store for the upper
    /// level's rounds (`wfs_fixed`).
    fn refix_unknowns(&mut self) {
        for (p, at) in self.wfs_fixed.clone() {
            self.store.add(&self.h, self.v.unknown, p, &[at], F_TICK);
            self.wfs_written.extend(self.store.get(self.v.unknown, p, &[at]));
        }
    }

    fn all_witnesses(&self) -> HashMap<FKey, Witness> {
        let mut out = HashMap::new();
        let mut memo = HashMap::new();
        for id in self.store.firing_keys() {
            if let Some(w) = self.store.witness_of(&self.h, id, &mut memo) {
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

/// Two assumptions over the same facts, by key.
fn same_recs(a: &Assumption, b: &Assumption) -> bool {
    a.recs.len() == b.recs.len() && a.recs.keys().all(|k| b.recs.contains_key(k))
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

fn rename_body(h: &mut Heap, body: &mut [BodyElem], n: u64) {
    for b in body.iter_mut() {
        match b {
            BodyElem::Pos(l) | BodyElem::Neg(l) => rename_lit(h, l, n),
            BodyElem::Bi { l, r, .. } => {
                *l = rename_term(h, *l, n);
                *r = rename_term(h, *r, n);
            }
            BodyElem::Agg(a) => {
                a.result = rename_term(h, a.result, n);
                a.vals = a.vals.iter().map(|t| rename_term(h, *t, n)).collect();
                a.keys = a.keys.iter().map(|t| rename_term(h, *t, n)).collect();
                a.shared = a
                    .shared
                    .iter()
                    .map(|v| match rename_term(h, Term::var(*v), n).kind() {
                        TermK::Var(x) => x,
                        _ => *v,
                    })
                    .collect();
                rename_body(h, &mut a.body, n);
            }
        }
    }
}

/// The strongly connected component of every node, iteratively (Tarjan).
fn tarjan(succ: &[Vec<usize>]) -> Vec<usize> {
    let n = succ.len();
    const NONE: usize = usize::MAX;
    let (mut index, mut low, mut comp) = (vec![NONE; n], vec![0usize; n], vec![NONE; n]);
    let (mut on, mut st, mut next, mut ncomp) = (vec![false; n], Vec::new(), 0usize, 0usize);
    for root in 0..n {
        if index[root] != NONE {
            continue;
        }
        let mut call: Vec<(usize, usize)> = vec![(root, 0)];
        index[root] = next;
        low[root] = next;
        next += 1;
        st.push(root);
        on[root] = true;
        while let Some(&mut (v, ref mut i)) = call.last_mut() {
            if *i < succ[v].len() {
                let w = succ[v][*i];
                *i += 1;
                if index[w] == NONE {
                    index[w] = next;
                    low[w] = next;
                    next += 1;
                    st.push(w);
                    on[w] = true;
                    call.push((w, 0));
                } else if on[w] {
                    low[v] = low[v].min(index[w]);
                }
            } else {
                call.pop();
                if let Some(&(u, _)) = call.last() {
                    low[u] = low[u].min(low[v]);
                }
                if low[v] == index[v] {
                    while let Some(w) = st.pop() {
                        on[w] = false;
                        comp[w] = ncomp;
                        if w == v {
                            break;
                        }
                    }
                    ncomp += 1;
                }
            }
        }
    }
    comp
}

fn fact_prems(prems: &[PremRef]) -> Vec<FactId> {
    prems.iter().filter_map(|p| if let PremRef::Fact(f) = p { Some(*f) } else { None }).collect()
}

/// A RULE WHOSE FAULTS A LATTICE DECIDES runs each builtin that can fail
/// (`is` and the comparisons) after every premise it does not feed: a
/// builtin's failure then counts only for a derivation every other premise
/// admits, whatever order the body was written in (docs/aggregates.md,
/// "Holes"). A premise that reads what the builtin binds, and an aggregate,
/// still come after it.
pub fn sink_builtins(h: &Heap, v: &Vocab, plan: Vec<BodyElem>) -> Vec<BodyElem> {
    let vars_of = |b: &BodyElem| -> Vec<Sym> {
        let mut vs = Vec::new();
        match b {
            BodyElem::Agg(a) => {
                h.vars_of(a.result, &mut vs);
                vs.extend(a.shared.iter().copied());
            }
            _ => b.vars(h, &mut vs),
        }
        vs
    };
    let mut seen: Vec<Sym> = Vec::new();
    let mut held: Vec<(BodyElem, Vec<Sym>, Vec<Sym>)> = Vec::new();
    let mut out: Vec<BodyElem> = Vec::new();
    for b in plan {
        let vs = vars_of(&b);
        if let BodyElem::Bi { op, .. } = &b {
            if *op != v.op_eq && *op != v.op_ne {
                let outs: Vec<Sym> = vs.iter().copied().filter(|x| !seen.contains(x)).collect();
                seen.extend(outs.iter().copied());
                held.push((b, outs, vs));
                continue;
            }
        }
        let mut need: Vec<bool> = vec![matches!(b, BodyElem::Agg(_)); held.len()];
        let mut want: Vec<Sym> = vs.clone();
        loop {
            let mut grew = false;
            for (i, (_, outs, hv)) in held.iter().enumerate() {
                if !need[i] && outs.iter().any(|x| want.contains(x)) {
                    need[i] = true;
                    want.extend(hv.iter().copied());
                    grew = true;
                }
            }
            if !grew {
                break;
            }
        }
        let mut keep = Vec::new();
        for (i, x) in held.into_iter().enumerate() {
            if need[i] {
                out.push(x.0);
            } else {
                keep.push(x);
            }
        }
        held = keep;
        for x in vs {
            if !seen.contains(&x) {
                seen.push(x);
            }
        }
        out.push(b);
    }
    out.extend(held.into_iter().map(|x| x.0));
    out
}

/// `storeHasAggregates` (src/aggeval.ts): whether the reference asks this
/// store's program of its aggregate evaluator — a lattice, tag or dominance
/// declaration, an aggregate premise, an `in`, a `subset` or an interval
/// function in a body, a head that writes an open set, or a cell already in
/// the store. Read off the reflected rows, as the reference reads them.
pub fn store_has_aggregates(h: &Heap, v: &Vocab, store: &mut Store) -> bool {
    if [v.lattice_decl, v.tag_decl, v.dominance, v.premise_agg].iter().any(|r| store.rel_count(*r) > 0) {
        return true;
    }
    let lit_of = |store: &Store, f: FactId| -> Option<Term> {
        let a = store.args(f);
        if a.len() == 3 { Some(a[2]) } else { None }
    };
    for f in store.rel_all(h, v.premise_lit) {
        let Some(t) = lit_of(store, f) else { continue };
        let TermK::Func(i) = t.kind() else { continue };
        if h.fname(i) == v.s_agg {
            return true;
        }
        if h.fname(i) == v.s_builtin {
            let a = h.fargs(i);
            let TermK::Str(op) = a[0].kind() else { continue };
            if op == v.op_in || op == v.op_subset {
                return true;
            }
            let items = h.unlist(a[1]);
            if h.name(op) == "is" && items.len() == 2 {
                if let TermK::Func(j) = items[1].kind() {
                    if crate::cell::IvFn::from_name(h.name(h.fname(j))).is_some() {
                        return true;
                    }
                }
            }
        }
    }
    let reified_ground = |t: Term| -> bool {
        fn go(h: &Heap, v: &Vocab, t: Term) -> bool {
            match t.kind() {
                TermK::Func(i) => h.fname(i) != v.s_var && h.fargs(i).iter().all(|a| go(h, v, *a)),
                _ => true,
            }
        }
        go(h, v, t)
    };
    for f in store.rel_all(h, v.conclusion_lit) {
        let Some(t) = lit_of(store, f) else { continue };
        let TermK::Func(i) = t.kind() else { continue };
        if h.fname(i) != v.s_lit || h.fargs(i).len() < 3 {
            continue;
        }
        let args = h.unlist(h.fargs(i)[2]);
        if let Some(TermK::Func(j)) = args.last().map(|t| t.kind()) {
            if h.fname(j) == v.f_set && h.fargs(j).len() > 1 && !reified_ground(*args.last().unwrap()) {
                return true;
            }
        }
    }
    store.cell_count() > 0
}

// ------------------------------------------------------------------ planBody

/// `planBody` (src/engine.ts:273). Positive premises and builtins keep the
/// order they were written in; a negation is held back until every variable it
/// shares with the rest of the rule is bound.
/// `planBody` (src/api.ts). Returns the plan, the index of the first negation
/// that never became ready, whether the head is ground under the plan, and
/// WHAT WAS BOUND when it stalled.
///
/// The fourth element exists for `checkOrderable`, which has to name the
/// variables the stuck negation still wants. Recomputing the binding walk
/// there would be a second copy of the only thing this function knows, and a
/// second copy of a planner is a second planner.
pub fn plan_body(h: &Heap, c: &Clause) -> (Vec<BodyElem>, Option<usize>, bool, Vec<Sym>) {
    let mut must: Vec<Term> = c.head.args.clone();
    must.push(c.head.persp);
    let mut outside = Vec::new();
    for t in &must {
        h.vars_of(*t, &mut outside);
    }
    plan_elems(h, &must, &c.body, &[], &outside)
}

/// `plan_order`, with the elements rather than their positions.
pub fn plan_elems(
    h: &Heap,
    must_bind: &[Term],
    body: &[BodyElem],
    pre_bound: &[Sym],
    outside: &[Sym],
) -> (Vec<BodyElem>, Option<usize>, bool, Vec<Sym>) {
    let (order, stuck, ground, bound) = plan_order(h, must_bind, body, pre_bound, outside);
    (order.into_iter().map(|i| body[i].clone()).collect(), stuck, ground, bound)
}

/// THE PLANNER, over any body: a rule's, or an aggregate's inner one.
/// `pre_bound` is what stands bound before the body starts (for an inner body,
/// what the premises before the aggregate bound); `outside` are the variables
/// that occur somewhere other than `body`, so a negation's variable seen only
/// there is not existential; `must_bind` are the terms the head needs.
///
/// AN AGGREGATE STAYS WHERE IT IS WRITTEN and binds its result and its shared
/// variables: written order is what decides which of them are correlation,
/// and the load door refuses a clause where that order would be ambiguous.
pub fn plan_order(
    h: &Heap,
    must_bind: &[Term],
    body: &[BodyElem],
    pre_bound: &[Sym],
    outside: &[Sym],
) -> (Vec<usize>, Option<usize>, bool, Vec<Sym>) {
    plan_order_with(h, must_bind, body, pre_bound, outside, false)
}

/// `plan_body` as src/engine.ts `planBody` runs a program WITHOUT
/// aggregates (`Eval::plain`): the same planner, and ONE POSITIVE MOVES — a
/// literal sharing no variable with anything bound before it is a cross
/// product where it stands, and is held until something binds one of its
/// variables. A negation or a builtin is the barrier: everything held goes in
/// ahead of it in written order, so neither moves relative to what binds it.
/// The aggregate evaluator (src/aggeval.ts `planOrder`) holds nothing, and
/// neither does `plan_body`.
pub fn plan_body_plain(h: &Heap, c: &Clause) -> Vec<BodyElem> {
    let mut must: Vec<Term> = c.head.args.clone();
    must.push(c.head.persp);
    let mut outside = Vec::new();
    for t in &must {
        h.vars_of(*t, &mut outside);
    }
    let (order, _, _, _) = plan_order_with(h, &must, &c.body, &[], &outside, true);
    order.into_iter().map(|i| c.body[i].clone()).collect()
}

fn plan_order_with(
    h: &Heap,
    must_bind: &[Term],
    body: &[BodyElem],
    pre_bound: &[Sym],
    outside: &[Sym],
    hold: bool,
) -> (Vec<usize>, Option<usize>, bool, Vec<Sym>) {
    let mut seen_in: HashMap<Sym, Vec<i64>> = HashMap::new();
    for v in outside {
        let e = seen_in.entry(*v).or_default();
        if !e.contains(&-1) {
            e.push(-1);
        }
    }
    let note_vars = |vs: &[Sym], where_: i64, seen_in: &mut HashMap<Sym, Vec<i64>>| {
        for v in vs {
            let e = seen_in.entry(*v).or_default();
            if !e.contains(&where_) {
                e.push(where_);
            }
        }
    };
    let elem_vars = |b: &BodyElem| -> Vec<Sym> {
        let mut vs = Vec::new();
        match b {
            BodyElem::Agg(a) => {
                h.vars_of(a.result, &mut vs);
                vs.extend(a.shared.iter().copied());
            }
            BodyElem::Pos(_) | BodyElem::Neg(_) | BodyElem::Bi { .. } => b.vars(h, &mut vs),
        }
        vs
    };
    for (i, b) in body.iter().enumerate() {
        note_vars(&elem_vars(b), i as i64, &mut seen_in);
    }
    let mut bound: Vec<Sym> = pre_bound.to_vec();
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

    let mut plan: Vec<usize> = Vec::new();
    let mut pending: Vec<usize> = Vec::new();
    let mut held: Vec<usize> = Vec::new();
    let is_eq = |op: Sym| h.name(op) == "=";
    let is_is = |op: Sym| matches!(h.name(op), "is" | "in");
    let flush = |plan: &mut Vec<usize>, pending: &mut Vec<usize>, bound: &Vec<Sym>| loop {
        let at = pending.iter().position(|&j| {
            let BodyElem::Neg(l) = &body[j] else { return false };
            neg_ready(l, j as i64, bound, &seen_in)
        });
        let Some(a) = at else { break };
        plan.push(pending.remove(a));
    };
    let shares = |i: usize, bound: &Vec<Sym>| -> bool {
        let BodyElem::Pos(l) = &body[i] else { return true };
        let mut vs = Vec::new();
        for a in &l.args {
            h.vars_of(*a, &mut vs);
        }
        h.vars_of(l.persp, &mut vs);
        vs.iter().any(|v| bound.contains(v))
    };
    let take_pos = |i: usize, plan: &mut Vec<usize>, pending: &mut Vec<usize>, bound: &mut Vec<Sym>| {
        let BodyElem::Pos(l) = &body[i] else { unreachable!() };
        for a in &l.args {
            bind_all(*a, bound);
        }
        bind_all(l.persp, bound);
        plan.push(i);
        flush(plan, pending, bound);
    };
    for (i, b) in body.iter().enumerate() {
        if let BodyElem::Pos(_) = b {
            if hold && !bound.is_empty() && !shares(i, &bound) {
                held.push(i);
                continue;
            }
            take_pos(i, &mut plan, &mut pending, &mut bound);
            while let Some(at) = held.iter().position(|&j| shares(j, &bound)) {
                take_pos(held.remove(at), &mut plan, &mut pending, &mut bound);
            }
            continue;
        }
        for j in std::mem::take(&mut held) {
            take_pos(j, &mut plan, &mut pending, &mut bound);
        }
        match b {
            BodyElem::Neg(_) => pending.push(i),
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
                plan.push(i);
            }
            BodyElem::Agg(a) => {
                bind_all(a.result, &mut bound);
                for v in &a.shared {
                    if !bound.contains(v) {
                        bound.push(*v);
                    }
                }
                plan.push(i);
            }
            BodyElem::Pos(_) => unreachable!(),
        }
        flush(&mut plan, &mut pending, &bound);
    }
    for j in held {
        take_pos(j, &mut plan, &mut pending, &mut bound);
    }
    let head_ground = must_bind.iter().all(|a| ground_in(*a, &bound));
    (plan, pending.first().copied(), head_ground, bound)
}

// -------------------------------------------------------------- peelRounds

pub struct Peel {
    pub round: HashMap<Sym, i64>,
    pub rounds: i64,
    pub stalled: bool,
    pub stuck: Vec<Sym>,
    /// `(rule, head, inner)`: an aggregate in `rule` concluding `head` reads
    /// `inner`. Strict, like a negation.
    pub agg_edges: Vec<(Sym, Sym, Sym)>,
    /// What each relation reads, positively and strictly; the strict edges a
    /// body aggregate wrote (`soft`); and `(rule, at)` of every aggregate
    /// element whose edge `demote` made positive. `data_demotable` reads them
    /// (docs/aggregates.md, "Data-level stratification, as built").
    pub pos: HashMap<Sym, HashSet<Sym>>,
    pub neg: HashMap<Sym, HashSet<Sym>>,
    pub soft: HashSet<(Sym, Sym)>,
    pub demoted: Vec<(Sym, u32)>,
}

/// `peelRounds` (src/rounds.ts:93). The round number IS the stratum number,
/// and a stall is the rejection.
///
/// AN AGGREGATE'S EDGE IS A NEGATION'S: what it reads must be closed in a lower
/// round. And every aggregate rule also concludes the four relations the
/// kernel reflects its cells into, and `hole`, which a fold that overflows
/// writes, over the same edges, so a rule that negates one of them sits
/// above every aggregate.
///
/// A LATTICE READ FROM OUTSIDE ITS RECURSION is strict too, and the kernel
/// writes a lattice's members and its holes when it closes, so
/// `lattice_member`, `lattice_member_prem` and `hole` sit strictly above every
/// lattice relation. What a lattice's hole leaves unknown reaches every rule
/// downstream of it, and holes it (`poison_readers`), so `hole` sits above
/// every relation a lattice reaches, but one that reads `hole` itself.
/// A SUBSUMPTIVE RELATION'S DOMINANCE reads what its bodies read strictly
/// (`dom_edges`, `(relation, read)`): every value is compared against
/// relations already closed, so a comparison never changes its answer.
///
/// `demote` holds `(head, inner)` pairs whose aggregate edge is positive
/// instead: a component a data-level stratification takes (`data_demotable`).
pub fn peel_rounds(rules: &[Rc<ERule>], v: &Vocab, lattices: &[Sym], dom_edges: &[(Sym, Sym)], demote: &HashSet<(Sym, Sym)>) -> Peel {
    let mut pos: HashMap<Sym, HashSet<Sym>> = HashMap::new();
    let mut neg: HashMap<Sym, HashSet<Sym>> = HashMap::new();
    let mut heads: HashSet<Sym> = HashSet::new();
    let mut agg_edges: Vec<(Sym, Sym, Sym)> = Vec::new();
    let mut soft: HashSet<(Sym, Sym)> = HashSet::new();
    let mut demoted: Vec<(Sym, u32)> = Vec::new();
    let reflected = [v.agg_cell, v.agg_member, v.agg_member_prem, v.agg_sealed, v.hole];
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
                BodyElem::Pos(l) if r.lattice_outer.contains(&l.rel) => {
                    neg.get_mut(&hrel).unwrap().insert(l.rel);
                }
                BodyElem::Pos(l) => {
                    pos.get_mut(&hrel).unwrap().insert(l.rel);
                }
                BodyElem::Neg(l) => {
                    neg.get_mut(&hrel).unwrap().insert(l.rel);
                }
                // A THRESHOLD reads its inner body as premises: positive
                // edges (recursion allowed) and strict negations. Its cells
                // close with its conclusion, so their reflection sits above.
                BodyElem::Agg(a) if a.op == AggOp::AtLeast => {
                    for x in &a.body {
                        match x {
                            BodyElem::Pos(l) => {
                                pos.get_mut(&hrel).unwrap().insert(l.rel);
                            }
                            BodyElem::Neg(l) => {
                                neg.get_mut(&hrel).unwrap().insert(l.rel);
                            }
                            _ => {}
                        }
                    }
                    for h in reflected {
                        heads.insert(h);
                        pos.entry(h).or_default();
                        brk!("thr_peel_cells" => { neg.entry(h).or_default(); }; { neg.entry(h).or_default().insert(hrel); });
                    }
                }
                BodyElem::Agg(_) => {
                    for l in b.lits_deep() {
                        brk!("no_agg_edge" => { let _ = reflected; };
                        for h in std::iter::once(hrel).chain(reflected) {
                            heads.insert(h);
                            pos.entry(h).or_default();
                            if h == hrel && demote.contains(&(hrel, l.rel)) {
                                pos.entry(h).or_default().insert(l.rel);
                                let BodyElem::Agg(a) = b else { unreachable!() };
                                if !demoted.contains(&(r.id, a.at)) {
                                    demoted.push((r.id, a.at));
                                }
                                continue;
                            }
                            neg.entry(h).or_default().insert(l.rel);
                            if h == hrel {
                                soft.insert((h, l.rel));
                            }
                        });
                        agg_edges.push((r.id, hrel, l.rel));
                    }
                }
                BodyElem::Bi { .. } => {}
            }
        }
    }
    for (p, b) in dom_edges {
        heads.insert(*p);
        pos.entry(*p).or_default();
        brk!("dominance_edge_positive" => { pos.entry(*p).or_default().insert(*b); }; { neg.entry(*p).or_default().insert(*b); });
    }
    for m in [v.lattice_member, v.lattice_member_prem, v.hole, v.dominated_by] {
        if lattices.is_empty() {
            break;
        }
        heads.insert(m);
        pos.entry(m).or_default();
        neg.entry(m).or_default().extend(lattices.iter().copied());
    }
    if !lattices.is_empty() && brk!("lattice_hole_unranked" => false; true) {
        let reads = |h: &Sym| pos[h].iter().chain(neg[h].iter()).copied().collect::<Vec<Sym>>();
        let grow = |seed: HashSet<Sym>, from: &dyn Fn(&Sym, &HashSet<Sym>) -> bool| {
            let mut set = seed;
            loop {
                let more: Vec<Sym> = heads.iter().filter(|h| !set.contains(*h) && from(h, &set)).copied().collect();
                if more.is_empty() {
                    return set;
                }
                set.extend(more);
            }
        };
        let hole_readers = grow(HashSet::from([v.hole]), &|h, set| reads(h).iter().any(|x| set.contains(x)));
        let reached = grow(lattices.iter().copied().collect(), &|h, set| {
            !hole_readers.contains(h) && reads(h).iter().any(|x| set.contains(x))
        });
        neg.get_mut(&v.hole).unwrap().extend(reached.into_iter().filter(|h| !hole_readers.contains(h)));
    }
    // WHAT READS `unknown` SITS ABOVE EVERYTHING ELSE (docs/aggregates.md,
    // "Shrugs, as built"): `unknown(A)` of an A a hole left out is a shrug,
    // so every relation that does not read it is closed, and its shrugs
    // known, before one that does fires
    let (un, sh) = (v.unknown, v.shrug);
    let reads = |h: &Sym, set: &HashSet<Sym>| pos[h].iter().chain(neg[h].iter()).any(|x| set.contains(x));
    let mut cone: HashSet<Sym> = HashSet::new();
    if brk!("shrug_unknown_unranked" => false; heads.iter().any(|h| reads(h, &HashSet::from([un, sh])))) {
        cone.insert(un);
        cone.insert(sh);
        loop {
            let more: Vec<Sym> = heads.iter().filter(|h| !cone.contains(*h) && reads(h, &cone)).copied().collect();
            if more.is_empty() {
                break;
            }
            cone.extend(more);
        }
        let below: Vec<Sym> = heads.iter().filter(|h| !cone.contains(*h)).copied().collect();
        for m in [un, sh] {
            heads.insert(m);
            pos.entry(m).or_default();
            neg.entry(m).or_default().extend(below.iter().copied());
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
                agg_edges,
                pos,
                neg,
                soft,
                demoted,
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
        agg_edges,
        pos,
        neg,
        soft,
        demoted,
    }
}

/// THE COMPONENTS A DATA-LEVEL STRATIFICATION MAY TAKE, from a peel that
/// stalled: a strongly connected component of the relations it left with an
/// aggregate's edge in it (`soft`) and no relation `barred` names. The answer is
/// the aggregate edges inside such a component, `(head, inner)`; `peel_rounds`
/// run again with them demoted ranks the component as one round, unless another
/// strict edge of it (a negation, a dominance) keeps it stalled, and then the
/// program is refused as it was. The components come with it, as sets of relations.
pub fn data_demotable(p: &Peel, barred: &dyn Fn(Sym) -> bool) -> (HashSet<(Sym, Sym)>, Vec<HashSet<Sym>>) {
    let at: HashMap<Sym, usize> = p.stuck.iter().enumerate().map(|(i, r)| (*r, i)).collect();
    let mut succ: Vec<Vec<usize>> = vec![Vec::new(); p.stuck.len()];
    for (h, i) in &at {
        for set in [p.pos.get(h), p.neg.get(h)].into_iter().flatten() {
            succ[*i].extend(set.iter().filter_map(|x| at.get(x).copied()));
        }
    }
    let comp = tarjan(&succ);
    let unclean: HashSet<usize> = p.stuck.iter().filter(|r| barred(**r)).map(|r| comp[at[r]]).collect();
    let inside = |(a, b): &(Sym, Sym)| at.get(a).zip(at.get(b)).filter(|(x, y)| comp[**x] == comp[**y]).map(|(x, _)| comp[*x]);
    let mut out: HashSet<(Sym, Sym)> = HashSet::new();
    let mut comps: std::collections::BTreeMap<usize, HashSet<Sym>> = std::collections::BTreeMap::new();
    for e in &p.soft {
        if let Some(c) = inside(e).filter(|c| !unclean.contains(c)) {
            out.insert(*e);
            let members = comps.entry(c).or_default();
            members.extend(p.stuck.iter().filter(|r| comp[at[*r]] == c).copied());
        }
    }
    (out, comps.into_values().collect())
}

/// The shape of an `is` right-hand side that safety.rofl reads for a lattice:
/// `A Op B` with each operand a variable or an integer, or a lone variable or
/// integer (`Op` "is", B = A). Anything else has no shape and no row.
fn arith_shape(h: &Heap, t: Term) -> Option<(String, Term, Term)> {
    let atomic = |x: Term| x.is_var() || x.as_int().is_some();
    if atomic(t) {
        return Some(("is".to_string(), t, t));
    }
    let TermK::Func(i) = t.kind() else { return None };
    let args = h.fargs(i);
    let name = h.name(h.fname(i));
    // an interval function's operand may also be a ground interval, `iv(ninf, 9)`
    let iv = IvFn::from_name(name).is_some();
    let operand = |x: Term| atomic(x) || iv && h.is_ground(x);
    if args.len() != 2 || !operand(args[0]) || !operand(args[1]) {
        return None;
    }
    Some((name.to_string(), args[0], args[1]))
}

/// Every `lattice_decl[$kernel](Rel, Arity, Op)` row, as `(rel, arity, op)`.
/// WHAT THE LOAD CANNOT DECIDE ABOUT A SET, since it needs the lattices: a
/// head that writes a set with a variable into a relation that is no join
/// (`set_pattern`: only a join canonicalises what it is given), and a read of
/// a join whose value slot no value of its carrier can match
/// (`join_value_off_carrier`: `r(k, oops)` of a union, `r(k, iv(3, 1))`,
/// `r(k, -1)` of a bitor, which would be a silent false). A slot may hold a
/// variable, a value of the carrier (a ground set is canonical by the load),
/// `set(T)`, and `iv(A, B)` of variables and integers.
fn set_spelling_refusals(h: &mut Heap, v: &Vocab, rules: &[DRule], lattices: &[(Sym, usize, Sym)]) -> Vec<(Sym, Sym)> {
    let join_of = |h: &Heap, rel: Sym| {
        lattices.iter().find(|(p, _, _)| *p == rel).and_then(|(_, _, op)| AggOp::from_name(h.name(*op))).filter(|op| op.is_join())
    };
    let (set_pattern, off_carrier) = (h.intern("set_pattern"), h.intern("join_value_off_carrier"));
    let mut out = Vec::new();
    for r in rules {
        let head = &r.clause.head;
        if let Some(t) = head.args.last() {
            let open = crate::cell::set_elems(h, v, *t).is_some() && crate::cell::open_set(h, v, *t) == Some(*t);
            if open && join_of(h, head.rel).is_none() && !brk!("set_pattern_admitted" => true; false) {
                out.push((r.id, set_pattern));
            }
        }
        let mut lits: Vec<&Lit> = Vec::new();
        for b in &r.clause.body {
            lits.extend(b.lits_deep());
        }
        for l in lits {
            let (Some(op), Some(t)) = (join_of(h, l.rel), l.args.last()) else { continue };
            if !brk!("join_value_unchecked" => true; join_slot_ok(h, v, op, *t)) {
                out.push((r.id, off_carrier));
                break;
            }
        }
    }
    out
}

fn join_slot_ok(h: &mut Heap, v: &Vocab, op: AggOp, t: Term) -> bool {
    if t.is_var() {
        return true;
    }
    if h.is_ground(t) {
        return op.join_canon(h, v, &mut Default::default(), t).is_ok();
    }
    let end = |x: Term, inf: Sym| x.is_var() || x.as_int().is_some() || x.as_atom() == Some(inf);
    match (op, t.kind()) {
        (AggOp::Union, TermK::Func(i)) => h.fname(i) == v.f_set && h.fargs(i).len() == 1,
        (AggOp::Hull, TermK::Func(i)) => {
            h.fname(i) == v.f_iv && h.fargs(i).len() == 2 && end(h.fargs(i)[0], v.a_ninf) && end(h.fargs(i)[1], v.a_inf)
        }
        _ => false,
    }
}

/// Every `lattice_widen[$kernel](Rel, N)` row, as `(rel, n)`: a relation
/// declared `widen N` twice with two numbers is safety.rofl's to refuse.
pub fn lattice_widens(h: &mut Heap, v: &Vocab, store: &mut Store) -> Vec<(Sym, u64)> {
    let mut out = Vec::new();
    for f in store.rel_persp(h, v.lattice_widen, v.kernel_persp) {
        let a = store.args(f);
        // every parser reads N as an integer literal of at least 0 (below
        // 2^60): the number the engine counts to is the number declared
        if let (Some(r), Some(Ok(n))) = (a[0].as_atom(), a[1].as_int().map(u64::try_from)) {
            out.push((r, n));
        }
    }
    out
}

pub fn lattice_decls(h: &mut Heap, v: &Vocab, store: &mut Store, refused: &mut Vec<String>) -> Vec<(Sym, usize, Sym)> {
    decl_rows(h, store, v.lattice_decl, v.kernel_persp, refused)
}

/// The `(Rel, Arity, Op)` rows of a declaration relation, `lattice_decl` or
/// `tag_decl`. A row of another shape declares nothing it could keep (an
/// arity below one has no slot for the cell's value), so it is a sentence in
/// `refused`, never a row skipped.
pub fn decl_rows(h: &mut Heap, store: &mut Store, rel: Sym, persp: Sym, refused: &mut Vec<String>) -> Vec<(Sym, usize, Sym)> {
    let mut out = Vec::new();
    for f in store.rel_persp(h, rel, persp) {
        let a = store.args(f);
        match (a[0].as_atom(), a[1].as_int(), a[2].as_atom()) {
            (Some(r), Some(n), Some(op)) if n >= 1 => out.push((r, n as usize, op)),
            _ if brk!("decl_row_skipped" => false; true) => refused.push(format!(
                "{} declares nothing: a declaration is (relation, arity, operation), two atoms and an arity of one or more, the last argument the cell's value",
                store.key(h, f)
            )),
            _ => {}
        }
    }
    out
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
pub const ARITH_OVERFLOW: u8 = 7;
pub const SET_TYPE: u8 = 8;
pub const UNBOUNDED: u8 = 9;
pub const TAG_CARRIER: u8 = 10;

/// A join or order test met a value outside its lattice's carrier: every
/// value is canonical on the way in (`join_canon`), so this is a defect.
fn off_carrier(op: AggOp) -> Halt {
    Halt::Bug(format!("a value outside the {} carrier reached the join", op.name()))
}

fn hole_reason_of(v: &Vocab, code: u8) -> Sym {
    match code {
        ARITH_ZERO => v.arith_zero_reason,
        STR_TYPE => v.str_type_reason,
        STR_INDEX => v.str_index_reason,
        STR_SEP => v.str_sep_reason,
        ATOM_NAME => v.atom_name_reason,
        ARITH_OVERFLOW => v.arith_overflow_reason,
        SET_TYPE => v.set_type_reason,
        UNBOUNDED => v.unbounded_reason,
        TAG_CARRIER => v.tag_carrier_reason,
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
            // ⊗ OF A SEMIRING TAG (crate::tag): two values of its carrier, or
            // a fault; anything that is no integer is off the carrier too
            if let Some(alg) = TagAlg::from_times_name(&name) {
                let mut xs = [0i64; 2];
                for (k, a) in args.iter().enumerate() {
                    match walk(h, *a, s).kind() {
                        TermK::Int(n) => xs[k] = n,
                        TermK::Var(_) => {
                            *fail = ARITH_UNBOUND;
                            return None;
                        }
                        _ => {
                            *fail = TAG_CARRIER;
                            return None;
                        }
                    }
                }
                return match alg.times(xs[0], xs[1]) {
                    Ok(x) => Some(x),
                    Err(TagFault::Carrier) => {
                        *fail = TAG_CARRIER;
                        None
                    }
                    Err(TagFault::Overflow) => {
                        *fail = ARITH_OVERFLOW;
                        None
                    }
                };
            }
            let l = eval_arith(h, args[0], s, fail)?;
            let r = eval_arith(h, args[1], s, fail)?;
            // CHECKED, AND WITHIN THE TERM RANGE. `l + r` wrapped in a release
            // build and `Term::int` then truncated to 61 bits with only a
            // debug assertion, so `X is 1152921504606846975 + 1` answered a
            // large NEGATIVE number (f_arithmetic_wraps_past_the_term_range).
            // Past the range there is no value: the premise fails and the
            // rule's hole says `arith_overflow`.
            let v = match name.as_str() {
                "+" => l.checked_add(r),
                "-" => l.checked_sub(r),
                "*" => l.checked_mul(r),
                "/" => {
                    if r == 0 {
                        *fail = ARITH_ZERO;
                        return None;
                    }
                    // truncating, toward zero: the sugar's `rounded toward zero` is this (docs/aggregates.md)
                    brk!("div_floor" => l.checked_div(r).map(|q| if l % r != 0 && (l < 0) != (r < 0) { q - 1 } else { q }); l.checked_div(r))
                }
                "mod" => {
                    if r == 0 {
                        *fail = ARITH_ZERO;
                        return None;
                    }
                    brk!("mod_floor" => Some(l.rem_euclid(r));
                        l.checked_div(r).and_then(|q| r.checked_mul(q)).and_then(|m| l.checked_sub(m)))
                }
                "min" => Some(l.min(r)),
                "max" => Some(l.max(r)),
                _ => {
                    *fail = ARITH_TYPE;
                    return None;
                }
            };
            return match brk!("arith_wraps" => Some(Term::int(v.unwrap_or_else(|| l.wrapping_add(r)))); v.and_then(Term::try_int)) {
                Some(t) => t.as_int(),
                None => {
                    *fail = ARITH_OVERFLOW;
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
        std::fs::read_to_string(crate::corpus::dir().join(format!("{name}.seed.json"))).unwrap()
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

    /// SAFETY.ROFL SCHEDULES ITSELF BY A TABLE, and the table must be its own
    /// peel. The kernel runs it under the stock evaluator, which reads the
    /// `stratum` facts; a clause added without its row runs its negation in
    /// the wrong phase and no answer says so. This re-peels the program and
    /// compares, relation for relation, in both directions.
    #[test]
    fn safety_schedule_is_its_own_peel() {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let clauses = dense_clauses(&mut h, crate::kernel::safety()).expect("safety.rofl");
        let mut rules: Vec<Rc<ERule>> = Vec::new();
        let mut table: HashMap<Sym, i64> = HashMap::new();
        let stratum = h.intern("stratum");
        for (i, c) in clauses.into_iter().enumerate() {
            if c.body.is_empty() {
                if c.head.rel == stratum {
                    table.insert(c.head.args[0].as_atom().unwrap(), c.head.args[1].as_int().unwrap());
                }
                continue;
            }
            let id = h.intern(&format!("r{i}"));
            rules.push(Rc::new(ERule {
                id,
                canon: String::new(),
                safe: true,
                has_neg: false,
                has_agg: false,
                has_thr: false,
                thr_rels: Vec::new(),
                lattice_outer: Vec::new(),
                lat_close: None,
                pos_rels: Vec::new(),
                has_demand_prem: false,
                trigger_rels: Vec::new(),
                plan: Vec::new(),
                clause: c,
            }));
        }
        let peel = peel_rounds(&rules, &v, &[], &[], &HashSet::new());
        assert!(!peel.stalled, "safety.rofl does not peel");
        let heads: HashSet<Sym> = rules.iter().map(|r| r.clause.head.rel).collect();
        let mut bad: Vec<String> = Vec::new();
        for rel in &heads {
            let want = peel.round[rel];
            match table.get(rel) {
                Some(n) if *n == want => {}
                Some(n) => bad.push(format!("stratum({}, {n}) but the peel says {want}", h.name(*rel))),
                None => bad.push(format!("no stratum row for {} (the peel says {want})", h.name(*rel))),
            }
        }
        for rel in table.keys() {
            if !heads.contains(rel) {
                bad.push(format!("stratum({}, _) names a relation no rule concludes", h.name(*rel)));
            }
        }
        bad.sort();
        assert!(bad.is_empty(), "{}", bad.join("\n"));
    }

    #[test]
    fn peel_rounds_puts_an_aggregate_above_what_it_reads() {
        let mut s = crate::session::Session::fresh(1_000_000);
        s.load("e(a, b). e(b, c). e(c, d).\nreach(X, Y) :- e(X, Y).\nreach(X, Z) :- reach(X, Y), e(Y, Z).\nn(X, N) :- node(X), N is count(Y : reach(X, Y)).\nnode(a). node(d).", None).unwrap();
        let (n, reach, cell) = (s.eval.h.intern("n"), s.eval.h.intern("reach"), s.eval.h.intern("agg_cell"));
        let peel = peel_rounds(&s.eval.rules, &s.eval.v, &[], &[], &HashSet::new());
        assert!(peel.round[&n] > peel.round[&reach], "the aggregate's head is above what it reads");
        assert!(peel.round[&cell] > peel.round[&reach], "so are the relations its cells are reflected into");
        s.evaluate().unwrap();
        assert!(s.holds("n(a, 3)").unwrap());
        assert!(s.holds("n(d, 0)").unwrap(), "a correlated count of nothing is 0");
    }

    #[test]
    fn peel_refuses_count_through_recursion() {
        let mut s = crate::session::Session::fresh(1_000_000);
        s.load("p(a). q(X) :- p(X). p(X) :- q(X), N is count(Y : q(Y)), N > 0.", None).unwrap();
        let e = s.evaluate().err().expect("a count through its own conclusion is refused");
        let m = crate::describe(&e);
        assert!(m.contains("reads q, which depends on the rule's own conclusion p"), "{m}");
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
        // completed tick but the rows a firing crossing the boundary cites
        // (a staged firing read tick 2), and 3 is still there because it wrote
        // AFTER the boundary and was never a candidate.
        assert_eq!(t_none, vec![2, 3], "n=0 keeps what crosses the boundary");
        assert_eq!(t_one, vec![2, 3], "n=1 keeps the tick just ended");
        assert!(n_none < n_one && n_one < n_all, "{n_none} {n_one} {n_all}");
        assert_ne!(all, one);
        assert_ne!(one, none);
        // and of tick 2 only those: each row n = 0 kept of it is of a fact a
        // staged firing read
        let mut l = crate::load(&seed("counter"), 1_000_000).unwrap();
        l.eval.retain_ticks = Some(0);
        for _ in 0..3 {
            l.eval.tick_advance().unwrap();
        }
        let mut read: HashSet<Term> = HashSet::new();
        for id in l.eval.store.all_facts() {
            for (_, t, prems) in l.eval.store.firings(id) {
                if t != 3 {
                    continue;
                }
                for p in prems {
                    if let PremRef::Fact(f) = p {
                        let r = l.eval.store.rec(f);
                        let args = l.eval.store.args(f).to_vec();
                        read.insert(fact_term(&mut l.eval.h, &l.eval.v, r.rel, r.persp, &args));
                    }
                }
            }
        }
        let db = l.eval.v.derived_by;
        for id in l.eval.store.all_facts() {
            let a = l.eval.store.args(id);
            if l.eval.store.rec(id).rel == db && a[2].as_int() == Some(2) {
                assert!(read.contains(&a[0]), "n=0 kept a row of tick 2 nothing crossing the boundary read");
            }
        }
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
        // THE TICK-0 COLUMN IS A PROPERTY OF boot.rofl AND MOVES WITH IT.
        // Re-measured 2026-09-09 after the corpus was regenerated against the
        // current kernel: 66/56/135 became 70/60/139, +4 in all three worlds,
        // which is exactly the four rules boot.rofl had gained (`exports`,
        // `exported`, `exported_to`, `gathered`) and is why a uniform delta
        // across three unrelated worlds is the reassuring shape rather than
        // the alarming one. The CARRIED column did not move at all, because
        // none of the four stages anything here.
        //
        // Re-measured again the same day, after `in_perspective` was removed
        // and the trail-reading audits moved to rules/self-audit.rofl:
        // 70/60/139 became 63/54/129. MINUS SEVEN, SIX AND TEN — and this time
        // the UNEVENNESS is the expected shape, where last time evenness was.
        // Four new rules add the same four firings to every world; removing a
        // relation emitted once per asserted fact, and audits that read it,
        // removes an amount proportional to what each world asserts. The
        // CARRIED column did not move at all either time.
        //
        // Re-measured 2026-09-29 after boot.rofl gained the four aggregate
        // rules (an `undefined_premise` over `premise_agg`, two `agg_tail`
        // and a `negated_under`): 63/54/129 became 67/58/133, +4 in all
        // three worlds — the even shape again, because each new rule adds one
        // `rule_known` firing to every world and none of them stages
        // anything. The CARRIED column did not move.
        //
        // Re-measured 2026-10-04 after boot.rofl gained its stratification canon
        // (ten `boot_rank` facts, carried by one `@next` rule, and a copy rule into
        // `stratum`): +12 at tick 0 and +10 carried in all three worlds, the even
        // shape: ten copy firings and two new rules' reflection, and the ten ranks
        // carried across every boundary.
        //
        // If this goes red after a change to boot.rofl, re-measure — do not
        // adjust one number until it passes. What the test exists to show is
        // the SHAPE of the change: whether it matches the change made.
        for (name, at_tick_0, carried) in [("tm", 79, 20), ("counter", 70, 14), ("oops", 145, 59)] {
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
        assert_eq!(l.eval.store.firing_keys().len(), 14, "the boundary carries boot's ten ranks besides the counter's four");
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

// ------------------------------------------------------------------ explain
//
// `why` and `whynot`, the two the port owed (docs/port-surface.md, "The port
// owes explanation"). A store that can say WHICH firing produced a fact, and
// why a fact does NOT hold, is the difference between an engine and a table.
//
// THE TEXT IS THE CONTRACT. `src/api.ts` renders both as a tree and every
// marker in it is load-bearing — `[axiom]`, `[past tick]`, `[cycle]`,
// `<= rule @tick N`, `not K [finite failure]`, `-- blocked: K holds`. Two
// engines that explain the same world differently are two languages, so this
// renders the same strings rather than an equivalent structure, and
// `rust/rofl/tests/explain.rs` holds them against the reference output.

/// How many of an aggregate's members `why` prints before it says how many
/// more there are.
pub const WHY_MEMBERS: usize = 5;

/// One step of `why`'s walk (`render_tree`): a fact or a premise to render
/// at an indent, a line written, or a fact leaving the path it is on.
enum WhyTask {
    Fact(FactId, usize),
    Prem(PremRef, usize),
    Past(PremRef, u32, usize),
    Line(String),
    Unsee(FactId),
}

trait WhyLines {
    fn line(&mut self, l: String);
}

impl WhyLines for Vec<WhyTask> {
    fn line(&mut self, l: String) {
        self.push(WhyTask::Line(l));
    }
}

/// `why`'s options: the members of a cell to print, and the question asked,
/// which the digest line repeats as `why all <query>`.
pub struct WhyOpts {
    pub members: usize,
    pub query: String,
}

impl Default for WhyOpts {
    fn default() -> Self {
        WhyOpts { members: WHY_MEMBERS, query: String::new() }
    }
}

/// The bounds `whynot` carries. Every one of them announces itself in the
/// output rather than truncating quietly (src/api.ts:1000).
pub struct WhynotBounds {
    pub max_depth: usize,
    pub max_nodes: usize,
}

impl Default for WhynotBounds {
    /// src/api.ts `DEFAULT_WHYNOT_DEPTH` and `DEFAULT_WHYNOT_NODES`.
    fn default() -> Self {
        WhynotBounds { max_depth: 6, max_nodes: 64 }
    }
}

/// The bounds an `explain_request(whynot, A)` is demonstrated under:
/// src/api.ts `explainRequests` passes `{ maxDepth: 3, maxNodes: 64 }`, not
/// the protocol's default depth of 6, and the bridge's rows are compared with
/// its.
pub const EXPLAIN_WHYNOT_BOUNDS: WhynotBounds = WhynotBounds { max_depth: 3, max_nodes: 64 };

impl WhynotBounds {
    /// The bounds a caller asked for, the default where one is absent and 1
    /// where one is below 1, as src/api.ts `Math.max(1, opts.depth ?? 6)`.
    pub fn clamped(depth: Option<i64>, nodes: Option<i64>) -> Self {
        let d = WhynotBounds::default();
        let at_least_one = |v: Option<i64>, or: usize| v.map_or(or, |n| n.max(1) as usize);
        WhynotBounds { max_depth: at_least_one(depth, d.max_depth), max_nodes: at_least_one(nodes, d.max_nodes) }
    }
}

/// The `unknown` rows of a three-valued world, keyed by the atom each stands
/// for, and the atoms a `why` walked through (src/api.ts `UnknownCtx`).
#[derive(Clone)]
struct UnkCtx {
    index: HashMap<String, FactId>,
    hit: HashSet<String>,
}

/// One step of `whynot`'s walk (`explain_tree`).
enum WnTask {
    Failure(Lit, usize),
    Rule(Lit, Rc<ERule>, usize),
    Deeper(Lit, usize),
    Line(String),
    Unpath(String),
}

struct WnCtx {
    max_depth: usize,
    max_nodes: usize,
    nodes: usize,
    path: HashSet<String>,
    /// The ground literals demonstrated, with the levels each was written at:
    /// the depth below a level is what the demonstration shows, so one reached
    /// again at a level it was written at is referred to, at another written again.
    done: HashMap<String, HashSet<usize>>,
}

impl Eval {
    /// `Rofl.why` (src/api.ts:841): the derivation tree of a fact that holds.
    /// `shown` is the question as the caller wrote it, which a plain world's
    /// refusal echoes; `None` names the fact by its key.
    pub fn why_text(&mut self, lit: &Lit, shown: Option<&str>) -> Result<String, String> {
        self.why_text_with(lit, &WhyOpts::default(), shown)
    }

    /// `why`, with the number of an aggregate's members it prints: a digest of
    /// `WHY_MEMBERS` by default, and every one of them for `why all`.
    ///
    /// EVERY QUESTION RENAMES FROM ZERO, as src/api.ts explains a plain world
    /// on a fresh evaluation and src/aggeval.ts resets its counter: the
    /// suffixes (`?B#1`) do not depend on what was asked before, nor on what
    /// the evaluation renamed, and the engine's own counter is put back.
    pub fn why_text_with(&mut self, lit: &Lit, o: &WhyOpts, shown: Option<&str>) -> Result<String, String> {
        let saved = std::mem::replace(&mut self.rename_counter, 0);
        let r = self.why_at(lit, o, shown);
        self.rename_counter = saved;
        r
    }

    /// A `why` is of a ground literal: its book, when it is one, and the
    /// refusal the reference gives (src/api.ts `why`) when it is not. The one
    /// check, made by `Session::why` before the world is evaluated and by
    /// `why_text` for a caller that comes straight here.
    pub fn why_ground(&self, lit: &Lit) -> Result<Sym, String> {
        match walk(&self.h, lit.persp, &Subst::default()).as_atom() {
            Some(p) if lit.args.iter().all(|a| self.h.is_ground(*a)) => Ok(p),
            _ => Err("why needs a ground literal".into()),
        }
    }

    fn why_at(&mut self, lit: &Lit, o: &WhyOpts, shown: Option<&str>) -> Result<String, String> {
        let p = self.why_ground(lit)?;
        let mut key = String::new();
        write_fact_key(&self.h, lit.rel, p, &lit.args, &mut key);
        let Some(id) = self.store.get(lit.rel, p, &lit.args) else {
            let sh = self.shrugs_of(lit);
            if !sh.is_empty() {
                // a shrug is the answer to the aggregate evaluator, and the
                // reason the plain one gives for not answering
                let text = sh.into_iter().map(|(f, _)| self.shrug_why(f)).collect::<Vec<_>>().join("\n");
                return if self.plain { Err(text) } else { Ok(text) };
            }
            let asked = if self.plain { shown.unwrap_or(&key) } else { &key };
            return Err(format!("{key} does not hold; try: whynot {asked}"));
        };
        let o = WhyOpts { members: o.members, query: key };
        self.past_rows = None;
        self.why_scans = 0;
        self.why_done.clear();
        self.why_heights.clear();
        self.why_heads.clear();
        self.why_unk = if self.plain { self.unknown_ctx() } else { None };
        let out = self.render_tree(id, &o);
        self.past_rows = None;
        // A `why` on an undefined atom answers with the tree AND the set the
        // tree walked: the circular dependency that left it undefined, named.
        if let Some(u) = self.why_unk.take().filter(|u| lit.rel == self.v.unknown && !u.hit.is_empty()) {
            let mut hit: Vec<String> = u.hit.into_iter().collect();
            hit.sort_by(|a, b| cmp_js(a, b));
            return Ok(format!("{out}\nunfounded set: {}", hit.join(", ")));
        }
        Ok(out)
    }

    /// The `unknown` rows, keyed by the atom each stands for; `None` in every
    /// two-valued world.
    fn unknown_ctx(&mut self) -> Option<UnkCtx> {
        let rows = self.store.rel_all(&self.h, self.v.unknown);
        if rows.is_empty() {
            return None;
        }
        let mut index = HashMap::new();
        for f in rows {
            if let Some(k) = self.unknown_atom_key(f) {
                index.insert(k, f);
            }
        }
        Some(UnkCtx { index, hit: HashSet::new() })
    }

    /// The key of the atom an `unknown` row is about, in the row's own book.
    fn unknown_atom_key(&self, f: FactId) -> Option<String> {
        let args = self.store.args(f);
        if args.len() != 1 {
            return None;
        }
        let (rel, at): (Sym, &[Term]) = match args[0].kind() {
            TermK::Atom(a) => (a, &[]),
            TermK::Func(i) => (self.h.fname(i), self.h.fargs(i)),
            _ => return None,
        };
        let mut k = String::new();
        write_fact_key(&self.h, rel, self.store.rec(f).persp, at, &mut k);
        Some(k)
    }

    /// THE TREE, WALKED WITH A STACK OF ITS OWN: a derivation as deep as the
    /// store holds renders without a frame per level, and each line is
    /// written once. Every step pushes, in order, the lines and the premises
    /// it would have written and recursed into; they run in that order.
    fn render_tree(&mut self, id: FactId, o: &WhyOpts) -> String {
        let mut seen = HashSet::new();
        let mut lines: Vec<String> = Vec::new();
        let mut todo = vec![WhyTask::Fact(id, 0)];
        let mut next: Vec<WhyTask> = Vec::new();
        while let Some(t) = todo.pop() {
            match t {
                WhyTask::Fact(f, indent) => brk!("why_depth_cut" => if indent <= 1000 { self.render_why(f, indent, &mut seen, o, &mut next) }; self.render_why(f, indent, &mut seen, o, &mut next)),
                WhyTask::Prem(pr, indent) => self.render_prem(pr, indent, o, &mut next),
                WhyTask::Past(pr, at, indent) => self.render_past(pr, at, indent, o, &mut next),
                WhyTask::Line(l) => lines.push(l),
                WhyTask::Unsee(f) => {
                    seen.remove(&f);
                }
            }
            todo.extend(next.drain(..).rev());
        }
        lines.join("\n")
    }

    /// The firing `why` shows of a fact: the least height, then signature.
    ///
    /// A BASE FACT whose shown firing rests on the fact itself is its assertion:
    /// `handled` is asserted and derived from a claim derived from it, and the
    /// shortest proof of the claim is the assertion, not that circle. A firing
    /// staged from an earlier tick reads that tick's fact, which is no circle.
    fn why_witness(&mut self, id: FactId) -> Option<(Sym, u32, Vec<PremRef>)> {
        let w = if !self.no_witness || !self.lattices.is_empty() {
            self.store.witness_of(&self.h, id, &mut self.why_heights).map(|w| (w.rule, w.tick, w.prems.to_vec()))?
        } else {
            self.why_firings(id).into_iter().next()?
        };
        let rel = self.store.rec(id).rel;
        if self.store.alive(id)
            && self.store.rec(id).base()
            && !brk!("why_base_circle" => true; false)
            && !self.staged_firing(rel, w.0, w.1, &w.2)
            && self.rests_on_itself(id, &w.2)
        {
            return None;
        }
        Some(w)
    }

    /// Is `id` reachable from `prems` through firings?
    fn rests_on_itself(&self, id: FactId, prems: &[PremRef]) -> bool {
        let mut seen = HashSet::new();
        let mut stack: Vec<FactId> = prems.iter().filter_map(|p| if let PremRef::Fact(g) = p { Some(*g) } else { None }).collect();
        while let Some(g) = stack.pop() {
            if g == id {
                return true;
            }
            if seen.insert(g) {
                for (_, _, ps) in self.store.firings(g) {
                    stack.extend(ps.iter().filter_map(|p| if let PremRef::Fact(x) = p { Some(*x) } else { None }));
                }
            }
        }
        false
    }

    fn render_why(&mut self, id: FactId, indent: usize, seen: &mut HashSet<FactId>, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        let mut key = String::new();
        let r = self.store.rec(id);
        write_fact_key(&self.h, r.rel, r.persp, self.store.args(id), &mut key);
        let pad = "  ".repeat(indent);
        if seen.contains(&id) {
            next.push(WhyTask::Line(format!("{pad}{key} [cycle]")));
            return;
        }
        // A FACT WRITTEN OUT ONCE IS REFERRED TO AFTER: the proof is a DAG, and
        // what a leaf says is as short as a reference
        let special = self.subs.contains_key(&r.rel)
            || self.lattices.contains_key(&r.rel)
            || brk!("count_why_plain" => false; self.tags.count_rel.contains_key(&r.rel));
        let w = if special { None } else { self.why_witness(id) };
        let leaf = !special && w.is_none();
        if !leaf && !brk!("why_dag_off" => true; self.why_done.insert((false, id))) {
            next.push(WhyTask::Line(format!("{pad}{key} [above]")));
            return;
        }
        seen.insert(id);
        // what it rests on is rendered before it leaves the path
        if self.subs.contains_key(&r.rel) {
            self.render_sub(id, &key, indent, o, next);
            next.push(WhyTask::Unsee(id));
            return;
        }
        if let Some(&(_, op)) = self.lattices.get(&r.rel) {
            self.render_lattice(id, &key, op, indent, o, next);
            next.push(WhyTask::Unsee(id));
            return;
        }
        if brk!("count_why_plain" => false; self.tags.count_rel.contains_key(&r.rel)) {
            self.render_counting(id, &key, indent, o, next);
            next.push(WhyTask::Unsee(id));
            return;
        }
        let shown = w.is_some();
        match w {
            // A LIVE FACT WITH NO FIRING IS ONE OF TWO THINGS, and the store
            // cannot tell them apart from the witness alone: a base assertion,
            // or a fact carried across a boundary whose witness table belongs
            // to a tick that is gone.
            // To the plain explainer any fact the store holds is an axiom —
            // a kernel-emitted row such as `derived_by` among them.
            None => {
                let mark = if self.store.alive(id) && (self.plain || self.store.rec(id).base()) {
                    "[axiom]"
                } else {
                    "[past tick]"
                };
                next.push(WhyTask::Line(format!("{pad}{key} {mark}")));
            }
            Some((rule, tick, prems)) => {
                next.push(WhyTask::Line(format!("{pad}{key}  <= {} @tick {tick}", self.h.name(rule))));
                if self.why_unk.is_some() && self.store.rec(id).rel == self.v.unknown {
                    if let Some(k) = self.unknown_atom_key(id) {
                        self.why_unk.as_mut().unwrap().hit.insert(k);
                    }
                }
                self.push_firing(id, rule, tick, prems, indent + 1, o, next);
            }
        }
        // THE ASKED FACT'S OTHER FIRINGS: `why` says how many there are, `why all`
        // writes each under its own line, after the one `why` shows alone. A
        // premise they share is a reference.
        if indent == 0 {
            let rest: Vec<_> = self.why_firings(id).into_iter().skip(usize::from(shown)).collect();
            if o.members == usize::MAX {
                if !brk!("why_all_one_tree" => true; false) {
                    for (k, (rule, tick, prems)) in rest.into_iter().enumerate() {
                        next.line(format!("{pad}  #{} <= {} @tick {tick} [another derivation]", k + 2, self.h.name(rule)));
                        self.push_firing(id, rule, tick, prems, indent + 2, o, next);
                    }
                }
            } else if !rest.is_empty() && !brk!("why_hint_missing" => true; false) {
                let n = rest.len();
                next.line(format!("{pad}  [{n} more derivation{}: why all {}]", if n == 1 { "" } else { "s" }, o.query));
            }
        }
        next.push(WhyTask::Unsee(id));
    }

    /// The premises of one firing of `id`, each at `indent`.
    fn push_firing(&mut self, id: FactId, rule: Sym, tick: u32, prems: Vec<PremRef>, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        // a staged firing is stamped with the tick it arrived in and
        // read the tick before it: one that concludes a carried
        // lattice value, or cites a cell sealed before its tick
        let past = brk!("carry_why_present" => false; self.staged_firing(self.store.rec(id).rel, rule, tick, &prems));
        for pr in prems {
            match pr {
                // THE PLAIN EXPLAINER WRITES A NEGATION'S DEMONSTRATION
                // WHEN IT REACHES THE FIRING, before the premises above
                // it are walked, and its renaming suffixes count in
                // that order (src/api.ts renderWhy)
                PremRef::Neg(_) if self.plain && past => self.render_past(pr, tick.saturating_sub(1), indent, o, next),
                PremRef::Neg(_) | PremRef::Bi(_) if self.plain => self.render_prem(pr, indent, o, next),
                _ if past => next.push(WhyTask::Past(pr, tick.saturating_sub(1), indent)),
                _ => next.push(WhyTask::Prem(pr, indent)),
            }
        }
    }

    /// EVERY FIRING OF A FACT in the order `why` ranks them, least height first:
    /// the held ones, and under `sealed(witness)` the ones found again. None was
    /// kept where nothing withdraws, so they are re-solved: in a monotone world
    /// every derivation that holds at the fixpoint was fired, and is a solution
    /// of a rule with its head bound to the fact.
    fn why_firings(&mut self, id: FactId) -> Vec<(Sym, u32, Vec<PremRef>)> {
        if !self.no_witness || !self.lattices.is_empty() {
            return self.store.firings_ranked(&self.h, id, &mut self.why_heights);
        }
        let mut fs = self.store.firings(id);
        for w in self.firings_again(id) {
            if !fs.iter().any(|f| f.0 == w.0 && f.2 == w.2) {
                fs.push(w);
            }
        }
        self.store.rank_firings(&self.h, fs, &mut self.why_heights)
    }

    fn firings_again(&mut self, id: FactId) -> Vec<(Sym, u32, Vec<PremRef>)> {
        let rec = self.store.rec(id);
        if is_kernel_ledger(&self.h, rec.persp) {
            return Vec::new();
        }
        let args = self.store.args(id).to_vec();
        let rules: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.safe && r.clause.head.rel == rec.rel && r.clause.head.temporal != Temporal::Next)
            .cloned()
            .collect();
        let saved = (self.steps, self.rows, self.peak_rows, self.budget, self.space);
        (self.budget, self.space) = (i64::MAX, i64::MAX);
        let tick = self.store.tick;
        let mut out = Vec::new();
        for r in rules {
            let head = &r.clause.head;
            let Some(s) = unify(&self.h, head.persp, Term::atom(rec.persp), &Subst::default())
                .and_then(|s| unify_all(&self.h, &head.args, &args, &s))
            else {
                continue;
            };
            // the plan was made for nothing bound; with the head bound another
            // order is cheaper, and the premises go back to the plan's order
            let mut bound = Vec::new();
            for t in head.args.iter().chain([&head.persp]) {
                self.h.vars_of(*t, &mut bound);
            }
            let touches = |b: &BodyElem, bound: &[Sym]| {
                let mut vs = Vec::new();
                b.vars(&self.h, &mut vs);
                matches!(b, BodyElem::Pos(_)) && vs.iter().any(|v| bound.contains(v))
            };
            let mut rest: Vec<usize> = (0..r.plan.len()).collect();
            let mut order = Vec::new();
            while !rest.is_empty() {
                let k = rest
                    .iter()
                    .take_while(|&&i| !matches!(r.plan[i], BodyElem::Agg(_)))
                    .position(|&i| touches(&r.plan[i], &bound));
                let i = rest.remove(k.unwrap_or(0));
                r.plan[i].vars(&self.h, &mut bound);
                order.push(i);
            }
            let body: Vec<BodyElem> = order.iter().map(|i| r.plan[*i].clone()).collect();
            if let Ok(sols) = self.solve_body(&body, s, 0, None, Some(r.id)) {
                for sol in sols {
                    let mut prems = sol.prems.clone();
                    for (k, i) in order.iter().enumerate() {
                        prems[*i] = sol.prems[k];
                    }
                    out.push((r.id, tick, prems));
                }
            }
        }
        (self.steps, self.rows, self.peak_rows, self.budget, self.space) = saved;
        out
    }

    /// A LATTICE FACT IS ITS CELL: the value, and its members — every firing
    /// that reaches it, canonical, a digest of `members` at the top and the
    /// canonical member alone below it.
    fn render_lattice(&mut self, id: FactId, key: &str, op: AggOp, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        if op.is_join() {
            return self.render_join(id, key, op, indent, o, next);
        }
        let pad = "  ".repeat(indent);
        let members = match self.best_members(id) {
            Ok(m) => m,
            Err(e) => return next.push(WhyTask::Line(format!("{pad}{key} [{}: {e:?}]", self.lat_label(self.store.rec(id).rel, op)))),
        };
        let n = members.len();
        next.push(WhyTask::Line(format!(
            "{pad}{key} [{}: {n} member{}{}]",
            self.lat_label(self.store.rec(id).rel, op),
            if n == 1 { "" } else { "s" },
            if brk!("lattice_why_ghost_unmarked" => true; self.store.alive(id)) { "" } else { "; an earlier value, improved on since" }
        )));
        let limit = if brk!("lattice_why_one_member" => true; indent == 0) { brk!("lattice_why_one_member" => 1; o.members) } else { 1 };
        for (i, (hgt, rule, tick, prems)) in members.into_iter().enumerate() {
            if i >= limit {
                if indent == 0 {
                    next.line(format!("{pad}  [{} more members: why all {}]", n - limit, o.query));
                }
                break;
            }
            next.line(format!("{pad}  #{} h={hgt} <= {} @tick {tick}", i + 1, self.h.name(rule)));
            for pr in prems {
                next.push(WhyTask::Prem(pr, indent + 2));
            }
        }
    }

    /// The front of a subsumptive cell: its standing facts, in canonical
    /// order, read from the store (so a world reopened says it too).
    fn sub_front(&mut self, rel: Sym, persp: Sym, key: &[Term]) -> Vec<FactId> {
        let pos: Vec<usize> = (0..key.len()).collect();
        let arity = self.subs[&rel].arity;
        let cands = match self.store.arg_matches(&self.h, rel, Some(persp), arity, &pos, key) {
            Some(v) => v,
            None => self.store.rel_persp(&self.h, rel, persp),
        };
        let mut fs: Vec<(String, FactId)> = cands
            .into_iter()
            .filter(|f| self.store.alive(*f) && self.store.args(*f)[..key.len()] == *key)
            .map(|f| (self.store.key(&self.h, f), f))
            .collect();
        fs.sort_by(|a, b| cmp_js(&a.0, &b.0));
        fs.dedup_by_key(|x| x.1);
        fs.into_iter().map(|(_, f)| f).collect()
    }

    /// A SUBSUMPTIVE FACT'S ANTICHAIN WITNESS: its members (the firings that
    /// reach it, a Best, well-founded and over final values where those
    /// found it), its place in the front of its cell, and every value given
    /// to the cell that it dominates, each with the dominance rule that says
    /// so. A value dominated since, read as history by a member, says so.
    fn render_sub(&mut self, id: FactId, key: &str, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        let pad = "  ".repeat(indent);
        let rec = self.store.rec(id);
        let args = self.store.args(id).to_vec();
        let k = self.subs[&rec.rel].keylen;
        let ck: LatKey = (rec.rel, rec.persp, args[..k].into());
        let members = match self.best_members(id) {
            Ok(m) => m,
            Err(e) => return next.push(WhyTask::Line(format!("{pad}{key} [subsumption: {e:?}]"))),
        };
        let n = members.len();
        let live = brk!("dominance_why_ghost_unmarked" => true; self.store.alive(id));
        let place = if live {
            let front = self.sub_front(rec.rel, rec.persp, &args[..k]);
            let at = front.iter().position(|f| *f == id).map_or(0, |i| i + 1);
            format!("{at} of {} in the front of its cell", front.len())
        } else {
            let by = self.sub_beaten.get(&(ck.clone(), args[k..].into())).cloned();
            match by {
                Some(v) => {
                    let mut t = String::new();
                    write_fact_key(&self.h, rec.rel, rec.persp, &Self::sub_args(&ck, &v), &mut t);
                    format!("an earlier value, dominated since by {t}")
                }
                None => "an earlier value, dominated since".to_string(),
            }
        };
        next.push(WhyTask::Line(format!("{pad}{key} [subsumption: {n} member{}; {place}]", if n == 1 { "" } else { "s" })));
        let limit = if brk!("dominance_why_one_member" => true; indent == 0) { brk!("dominance_why_one_member" => 1; o.members) } else { 1 };
        for (i, (hgt, rule, tick, prems)) in members.into_iter().enumerate() {
            if i >= limit {
                if indent == 0 {
                    next.line(format!("{pad}  [{} more members: why all {}]", n - limit, o.query));
                }
                break;
            }
            next.line(format!("{pad}  #{} h={hgt} <= {} @tick {tick}", i + 1, self.h.name(rule)));
            for pr in prems {
                next.push(WhyTask::Prem(pr, indent + 2));
            }
        }
        if indent == 0 && live {
            let mut beat: Vec<(String, Sym)> = self
                .sub_by_of
                .get(&id)
                .into_iter()
                .flatten()
                .filter_map(|v| {
                    let (_, r) = self.sub_by.get(&(ck.clone(), v.clone())).filter(|(f, _)| *f == id)?;
                    let mut t = String::new();
                    write_fact_key(&self.h, ck.0, ck.1, &Self::sub_args(&ck, v), &mut t);
                    Some((t, *r))
                })
                .collect();
            beat.sort_by(|a, b| cmp_js(&a.0, &b.0));
            let shown = brk!("dominance_why_beaten_off" => 0; o.members);
            for (i, (t, r)) in beat.iter().enumerate() {
                if i >= shown {
                    next.line(format!("{pad}  [{} more values it dominates: why all {}]", beat.len() - shown, o.query));
                    break;
                }
                next.line(format!("{pad}  dominates {t} by {}", self.h.name(*r)));
            }
        }
    }

    /// "lattice min", or "tag tropical" for the order lattice a tag is.
    fn lat_label(&self, rel: Sym, op: AggOp) -> String {
        if op == AggOp::Dominance {
            return "subsumption".to_string();
        }
        match brk!("tag_label_lattice" => None; self.tags.by_rel.get(&rel)) {
            Some((_, a)) => format!("tag {}", a.name()),
            None => format!("lattice {}", op.name()),
        }
    }

    /// A COUNTING TAG'S FACT IS THE SUM OF ITS DERIVATIONS: each a fact of
    /// `p@count` explained by the firing that derived it, the count it
    /// contributes first; a digest of `members` at the top, the first below.
    fn render_counting(&mut self, id: FactId, key: &str, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        let pad = "  ".repeat(indent);
        let Some((rule, tick, prems)) = self.why_witness(id) else {
            return next.push(WhyTask::Line(format!("{pad}{key} [past tick]")));
        };
        let Some(c) = prems.iter().find_map(|p| if let PremRef::Cell(c) = p { Some(*c) } else { None }) else {
            return next.push(WhyTask::Line(format!("{pad}{key} [tag counting] <= {} @tick {tick}", self.h.name(rule))));
        };
        let members = self.store.cell_members(c).to_vec();
        let n = members.len();
        next.push(WhyTask::Line(format!(
            "{pad}{key} [tag counting: the sum of {n} derivation{}] <= {} @tick {tick}",
            if n == 1 { "" } else { "s" },
            self.h.name(rule)
        )));
        let limit = if indent == 0 { o.members } else { 1 };
        for (i, m) in members.iter().enumerate() {
            if i >= limit {
                next.line(if indent == 0 {
                    format!("{pad}  [{} more derivations: why all {}]", n - limit, o.query)
                } else {
                    format!("{pad}  [{} more derivation{}]", n - limit, if n - limit == 1 { "" } else { "s" })
                });
                break;
            }
            let ps = self.store.member_prems(m).to_vec();
            let v = ps.iter().find_map(|p| if let PremRef::Fact(f) = p { self.store.args(*f).last().copied() } else { None });
            let mut vs = String::new();
            if let Some(v) = v {
                self.h.canon_term(v, &mut vs);
            }
            next.line(format!("{pad}  #{} x{vs} h={}", i + 1, m.height));
            for p in ps {
                self.render_member_prem(c, p, indent + 2, next);
            }
        }
    }

    /// A JOIN FACT IS ITS COVER: the contributions whose join it is, each a
    /// fact of `L@join` explained by the firing that contributed it, a digest
    /// of `members` at the top and the first alone below it. A value since
    /// widened is the join of the value before it and one contribution.
    fn render_join(&mut self, id: FactId, key: &str, op: AggOp, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        let pad = "  ".repeat(indent);
        let firings = self.store.firings(id);
        let Some((rule, tick, prems)) = firings.into_iter().min_by(|a, b| a.2.len().cmp(&b.2.len()).then(a.1.cmp(&b.1))) else {
            return next.push(WhyTask::Line(format!("{pad}{key} [past tick]")));
        };
        let facts = fact_prems(&prems);
        let _ = self.store.heights(&facts, &mut self.height_memo);
        let live = brk!("join_why_ghost_unmarked" => true; self.store.alive(id));
        let n = if live { facts.len() } else { facts.iter().filter(|f| self.join_of.contains_key(&self.store.rec(**f).rel)).count() };
        let what = if live {
            format!("a cover of {n} contribution{}", if n == 1 { "" } else { "s" })
        } else if prems.len() == 2 {
            "an earlier value, improved on since: the join of the value before it and a contribution".to_string()
        } else {
            "an earlier value, improved on since: its first contribution".to_string()
        };
        next.push(WhyTask::Line(format!("{pad}{key} [lattice {}: {what}] <= {} @tick {tick}", op.name(), self.h.name(rule))));
        let limit = if !live {
            facts.len()
        } else if brk!("join_why_one_member" => true; indent == 0) {
            brk!("join_why_one_member" => 1; o.members)
        } else {
            1
        };
        for (i, f) in facts.iter().enumerate() {
            if i >= limit {
                next.line(if indent == 0 {
                    format!("{pad}  [{} more contributions: why all {}]", facts.len() - limit, o.query)
                } else {
                    format!("{pad}  [{} more contribution{}]", facts.len() - limit, if facts.len() - limit == 1 { "" } else { "s" })
                });
                break;
            }
            let h = self.height_memo.get(f).copied().unwrap_or(0);
            let v = *self.store.args(*f).last().unwrap();
            let mut vs = String::new();
            self.h.canon_term(v, &mut vs);
            next.line(format!("{pad}  #{} {vs} h={h}", i + 1));
            next.push(WhyTask::Prem(PremRef::Fact(*f), indent + 2));
        }
    }

    /// A firing staged at the tick before its own, which read that tick: a
    /// rule's conclusion `@next`, a carried lattice value, a firing through a
    /// cell sealed in an earlier tick
    /// (f_a_plain_staged_firing_is_explained_in_the_tick_it_arrived_in).
    fn staged_firing(&self, rel: Sym, rule: Sym, tick: u32, prems: &[PremRef]) -> bool {
        brk!("plain_staged_why_present" => false; self.next_rules.contains(&rule))
            || self.carried.contains_key(&rel)
            || prems.iter().any(|p| matches!(p, PremRef::Cell(c) if self.store.cell(*c).tick < tick))
    }

    /// A PREMISE READ IN A PAST TICK: what a cell sealed at T, or a value
    /// staged at T, read is the fact of T, whatever the store holds under its
    /// key now. It is named with the rules that derived it at T (its frozen
    /// `derived_by` rows, which `retain_ticks` keeps while a live cell cites
    /// it) and not explained further: a tick's firings go with the tick.
    fn render_past(&mut self, pr: PremRef, t: u32, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        let PremRef::Fact(f) = pr else {
            // A NEGATED PREMISE of a staged firing held in the tick it was
            // read: the arrival tick's store (an undefined row, a whynot) says
            // nothing about it, so it is the bare claim, no demonstration.
            if let PremRef::Neg(k) = pr {
                if brk!("staged_neg_arrival" => false; true) {
                    let key = self.h.name(k).to_string();
                    return next.line(format!("{}not {key} [finite failure]", "  ".repeat(indent)));
                }
            }
            return self.render_prem(pr, indent, o, next);
        };
        let mut key = String::new();
        let r = self.store.rec(f);
        let args = self.store.args(f).to_vec();
        write_fact_key(&self.h, r.rel, r.persp, &args, &mut key);
        let ft = fact_term(&mut self.h, &self.v, r.rel, r.persp, &args);
        if self.past_rows.is_none() {
            let mut by: HashMap<(Term, i64), Vec<Sym>> = HashMap::new();
            for d in self.store.rel_all(&self.h, self.v.derived_by) {
                self.why_scans += 1;
                let a = self.store.args(d);
                if let (Some(rule), Some(t)) = (a[1].as_atom(), a[2].as_int()) {
                    by.entry((a[0], t)).or_default().push(rule);
                }
            }
            self.past_rows = Some(by);
        }
        let mut rules: Vec<String> = self.past_rows.as_ref().and_then(|by| by.get(&(ft, t as i64))).map_or(Vec::new(), |rs| {
            rs.iter().map(|x| self.h.name(*x).to_string()).collect()
        });
        rules.sort_by(|a, b| cmp_js(a, b));
        let pad = "  ".repeat(indent);
        next.line(if rules.is_empty() {
            format!("{pad}{key} [past tick]")
        } else {
            format!("{pad}{key}  <= {} @tick {t} [past tick]", rules.join(", "))
        });
    }

    /// One premise of a firing, at `indent`.
    fn render_prem(&mut self, pr: PremRef, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        match pr {
            PremRef::Fact(f) => next.push(WhyTask::Fact(f, indent)),
            PremRef::Neg(k) => {
                let key = self.h.name(k).to_string();
                // `not p` over an undefined p did not fail, it never settled:
                // p's own row is the explanation.
                if let Some(&u) = self.why_unk.as_ref().and_then(|c| c.index.get(&key)) {
                    next.line(format!("{}not {key} [undefined]", "  ".repeat(indent)));
                    next.push(WhyTask::Fact(u, indent + 1));
                    return;
                }
                next.line(format!("{}not {key} [finite failure]", "  ".repeat(indent)));
                // WHY INLINES THE SINGLE-STEP whynot, because a negation that
                // held is a claim and `[finite failure]` alone is the claim
                // without its evidence. A key carrying a variable is not a
                // literal anybody can ask, so it is left bare.
                if !key.contains('?') {
                    if let Some(sub) = self.neg_demo(&key) {
                        let pad = "  ".repeat(indent + 1);
                        next.line(sub.lines().map(|l| format!("{pad}{l}")).collect::<Vec<_>>().join("\n"));
                    }
                }
            }
            PremRef::Bi(d) => next.line(format!("{}{} [builtin]", "  ".repeat(indent), self.h.name(d))),
            // AN AGGREGATE PREMISE IS ITS CELL: what it folded, what it
            // sealed, and its members, each explained in turn. A digest of
            // `WHY_MEMBERS` by default; `why all` prints every one.
            // A QUORUM: the first N members, canonical, and nothing sealed —
            // a threshold reached stays reached however its input grows.
            PremRef::Cell(c) if self.store.cell(c).op == AggOp::AtLeast => {
                let r = self.store.cell(c).clone();
                let head = self.h.name(r.desc).to_string();
                let id = self.why_cell_id(&head, c);
                if !brk!("why_dag_cell_off" => true; self.why_done.insert((true, c))) {
                    return next.line(format!("{}{head} [above]{id}", "  ".repeat(indent)));
                }
                let members = self.store.cell_members(c).to_vec();
                let n = members.len();
                next.line(format!(
                    "{}{head} [quorum: the first {n} member{}]{id}",
                    "  ".repeat(indent),
                    if n == 1 { "" } else { "s" }
                ));
                for (i, m) in members.iter().enumerate() {
                    if i == o.members {
                        next.line(format!("{}[{} more members: why all {}]", "  ".repeat(indent + 1), n - o.members, o.query));
                        break;
                    }
                    next.line(format!("{}#{} {} h={}", "  ".repeat(indent + 1), i + 1, tuple_text(&self.h, &m.proj), m.height));
                    for p in self.store.member_prems(m).to_vec() {
                        self.render_member_prem(c, p, indent + 2, next);
                    }
                    self.render_alt_derivations(c, m, i, indent + 1, o, next);
                }
            }
            PremRef::Cell(c) => {
                let r = self.store.cell(c).clone();
                let value = self.store.cell_value_text(&self.h, c);
                let head = format!("{} = {value}", self.h.name(r.desc));
                let id = self.why_cell_id(&head, c);
                if !brk!("why_dag_cell_off" => true; self.why_done.insert((true, c))) {
                    return next.line(format!("{}{head} [above]{id}", "  ".repeat(indent)));
                }
                let seals: Vec<String> =
                    self.store.cell_seals(c).iter().map(|x| format!("{}@{}", self.h.name(x.rel), x.round)).collect();
                let members = self.store.cell_members(c).to_vec();
                let n = members.len();
                let what = if n == 0 {
                    brk!("empty_text" => format!("{n} members"); "empty group".to_string())
                } else {
                    format!("{n} member{}", if n == 1 { "" } else { "s" })
                };
                next.line(brk!("no_sealed_text" => format!(
                    "{}{head} [aggregate: {what}]{}{id}",
                    "  ".repeat(indent),
                    seals.join(", ")
                ); format!(
                    "{}{head} [aggregate: {what}, sealed {}]{id}",
                    "  ".repeat(indent),
                    seals.join(", ")
                )));
                for (i, m) in members.iter().enumerate() {
                    if brk!("digest_off" => false && i >= o.members; i >= o.members) {
                        next.line(format!("{}[{} more members: why all {}]", "  ".repeat(indent + 1), n - o.members, o.query));
                        break;
                    }
                    next.line(format!("{}#{} {} h={}", "  ".repeat(indent + 1), i + 1, tuple_text(&self.h, &m.proj), m.height));
                    for p in self.store.member_prems(m).to_vec() {
                        self.render_member_prem(c, p, indent + 2, next);
                    }
                    self.render_alt_derivations(c, m, i, indent + 1, o, next);
                }
            }
        }
    }

    /// TWO CELLS CAN WRITE ONE HEADER (a description and a value name neither the
    /// tick it was sealed in nor the rule): the first met under a header is
    /// unmarked, a later one ends its lines `(cell N)`, and a reference to it too.
    fn why_cell_id(&mut self, head: &str, c: CellId) -> String {
        let ids = self.why_heads.entry(head.to_string()).or_default();
        let at = ids.iter().position(|x| *x == c).unwrap_or_else(|| {
            ids.push(c);
            ids.len() - 1
        });
        if at == 0 || brk!("why_cell_id_off" => true; false) { String::new() } else { format!(" (cell {})", at + 1) }
    }

    /// `why all`: the member's other derivations, each under its own line,
    /// after the canonical one `why` shows alone.
    fn render_alt_derivations(&mut self, c: CellId, m: &Member, i: usize, indent: usize, o: &WhyOpts, next: &mut Vec<WhyTask>) {
        if o.members != usize::MAX || brk!("why_all_one_derivation" => true; false) {
            return;
        }
        let alts: Vec<Vec<PremRef>> = self.store.member_derivs(m).skip(1).map(|d| d.to_vec()).collect();
        for (k, ps) in alts.into_iter().enumerate() {
            next.line(format!("{}#{}.{} {} [another derivation]", "  ".repeat(indent), i + 1, k + 2, tuple_text(&self.h, &m.proj)));
            for p in ps {
                self.render_member_prem(c, p, indent + 1, next);
            }
        }
    }

    /// A member's premise: of the present tick, or of the tick the cell was
    /// sealed in, when a conclusion carried it across a boundary.
    fn render_member_prem(&mut self, c: CellId, p: PremRef, indent: usize, next: &mut Vec<WhyTask>) {
        let t = self.store.cell(c).tick;
        if brk!("cell_why_present" => false; t < self.store.tick) {
            next.push(WhyTask::Past(p, t, indent));
        } else {
            next.push(WhyTask::Prem(p, indent));
        }
    }

    /// The demonstration `why` inlines under a negated premise: one step, and
    /// silently elided when the key does not parse back — a premise key is the
    /// store's spelling and the parser is the only thing that decides whether
    /// it is also a question.
    fn neg_demo(&mut self, key: &str) -> Option<String> {
        let lit = self.parse_lit(key).ok()?;
        let b = WhynotBounds { max_depth: 1, max_nodes: 64 };
        self.whynot_at(&lit, &b, None).ok().map(|(_, t)| t)
    }

    /// One literal, written as ROFL, lowered to what the evaluator runs.
    ///
    /// AT MOST ONE CLOSING DOT, as `parseLiteral` (src/parser.ts) takes it:
    /// one is supplied only when the TOKENS do not already end in one, and on
    /// a line of its own so a trailing `-- comment` cannot swallow it. So
    /// `p(a)..` is refused rather than read as `p(a)`.
    pub fn parse_lit(&mut self, query: &str) -> Result<Lit, String> {
        use crate::rofl_lex::{tokens, Tok};
        let dotted = matches!(tokens(query).last(), Some(t) if t.tok == Tok::Punct("dot"));
        let src = if dotted { query.to_string() } else { format!("{query}\n.") };
        let cs = crate::rofl_parse::parse(&mut self.h, &src)?;
        if cs.len() != 1 || !cs[0].body.is_empty() {
            return Err("this takes exactly one literal".into());
        }
        let v = self.v.clone();
        let mut c = crate::program::to_clause(&mut self.h, &v, &cs[0])?;
        crate::program::check_query_sets(&self.h, &v, &c.head.args)?;
        crate::reflect::resolve_clause_books(&v, &mut c);
        Ok(c.head)
    }

    /// Every shrug row a literal could name, in key order, with the bindings
    /// it gives: its target's atom matched, a position the target does not
    /// know matching anything.
    pub fn shrugs_of(&mut self, lit: &Lit) -> Vec<(FactId, Subst)> {
        let (inn, every) = (self.h.intern("in"), self.h.intern("every"));
        let mut out: Vec<(String, FactId, Subst)> = Vec::new();
        for id in self.store.rel_persp(&self.h, self.v.shrug, self.v.kernel_persp) {
            let t = self.store.args(id)[0];
            let (persp, at) = match t.kind() {
                TermK::Func(i) if self.h.fname(i) == inn && self.h.fargs(i).len() == 2 => match self.h.fargs(i)[0].as_atom() {
                    Some(p) => (Some(p), self.h.fargs(i)[1]),
                    None => continue,
                },
                _ => (Some(self.v.main), t),
            };
            let (rel, args): (Sym, Option<Vec<Term>>) = match at.kind() {
                TermK::Atom(r) => (r, Some(Vec::new())),
                TermK::Func(i) if self.h.fname(i) == every => match self.h.fargs(i)[0].as_atom() {
                    Some(r) => (r, None),
                    None => continue,
                },
                TermK::Func(i) => (self.h.fname(i), Some(self.h.fargs(i).to_vec())),
                _ => continue,
            };
            if rel != lit.rel || self.h.name(rel).starts_with('$') {
                continue;
            }
            let persp = if args.is_none() { None } else { persp };
            let mut s = match persp {
                Some(p) => unify(&self.h, lit.persp, Term::atom(p), &Subst::new()),
                None => Some(Subst::new()),
            };
            if let Some(args) = args {
                if args.len() != lit.args.len() {
                    continue;
                }
                for (a, t) in lit.args.iter().zip(args.iter()) {
                    s = s.and_then(|s| self.unify_unknown(*a, *t, s));
                }
            }
            if let Some(s) = s {
                out.push((self.store.key(&self.h, id), id, s));
            }
        }
        out.sort_by(|a, b| cmp_js(&a.0, &b.0));
        out.into_iter().map(|(_, f, s)| (f, s)).collect()
    }

    /// A term as a reader writes it: a list in brackets, `_` where a value is
    /// not known (src/shrug.ts `shown`, the same text).
    pub fn shown(&self, t: Term) -> String {
        if t == self.unknown_value {
            return "_".into();
        }
        match t.kind() {
            TermK::Atom(a) if self.h.name(a) == "$nil" => "[]".into(),
            TermK::Func(i) if self.h.name(self.h.fname(i)) == "$cons" => {
                let mut xs = Vec::new();
                let mut l = t;
                while let TermK::Func(j) = l.kind() {
                    if self.h.name(self.h.fname(j)) != "$cons" {
                        break;
                    }
                    xs.push(self.shown(self.h.fargs(j)[0]));
                    l = self.h.fargs(j)[1];
                }
                format!("[{}]", xs.join(", "))
            }
            TermK::Func(i) => format!(
                "{}({})",
                self.h.name(self.h.fname(i)),
                self.h.fargs(i).iter().map(|a| self.shown(*a)).collect::<Vec<_>>().join(", ")
            ),
            _ => {
                let mut k = String::new();
                self.h.canon_term(t, &mut k);
                k
            }
        }
    }

    /// One shrug row as a line: its target, reason, the reason's text, its meta.
    pub fn shrug_line(&self, id: FactId) -> String {
        let a = self.store.args(id);
        let (t, r, m) = (a[0], a[1], a[2]);
        let reason = match r.as_atom() {
            Some(x) => self.h.name(x).to_string(),
            None => self.shown(r),
        };
        let text = crate::shrug::reason_text(&reason).unwrap_or("");
        let cause = m.as_atom().and_then(|c| crate::shrug::cause_text(self.h.name(c)));
        match cause {
            Some(c) => format!("{} is a shrug: {reason}, {text}; {}, {c}", self.shown(t), self.shown(m)),
            None => format!("{} is a shrug: {reason}, {text}; {}", self.shown(t), self.shown(m)),
        }
    }

    /// WHY A SHRUG: its row, then each root target it rests on with its own
    /// row, and a rule's text where the root is a rule (src/shrug.ts `shrugWhy`).
    pub fn shrug_why(&mut self, id: FactId) -> String {
        let mut lines = vec![self.shrug_line(id)];
        let own = self.store.args(id)[0];
        lines.extend(self.widened_lines(own, "  "));
        let m = self.store.args(id)[2];
        let from = self.h.intern("from");
        if let TermK::Func(i) = m.kind() {
            if self.h.fname(i) == from && self.h.fargs(i).len() == 1 {
                let roots = self.h.unlist(self.h.fargs(i)[0]);
                let rows = self.store.rel_persp(&self.h, self.v.shrug, self.v.kernel_persp);
                for root in roots {
                    for r in &rows {
                        if self.store.args(*r)[0] == root {
                            lines.push(format!("  root {}", self.shrug_line(*r)));
                        }
                    }
                    lines.extend(brk!("widen_why_root_bare" => Vec::new(); self.widened_lines(root, "    ")));
                    if let TermK::Func(j) = root.kind() {
                        if self.h.fname(j) == self.v.s_rule_hole {
                            if let Some(rid) = self.h.fargs(j)[0].as_atom() {
                                if let Some(rule) = self.rule_of(rid) {
                                    lines.push(format!("    {}", rule.canon));
                                }
                            }
                        }
                    }
                }
            }
        }
        lines.join("\n")
    }

    /// THE WIDENED WITNESS of a cell's hole: the declared N, each widening
    /// it took, the value before, the contribution, their join and what it
    /// was widened to, and the value it closed on, an enclosure of the least
    /// value and nothing more. Empty for any other target.
    fn widened_lines(&self, marker: Term, pad: &str) -> Vec<String> {
        let Some((val, steps, narrowed)) = self.widened_marks.get(&marker) else { return Vec::new() };
        let n = match marker.kind() {
            TermK::Func(i) => self.h.fargs(i)[0].as_atom().and_then(|r| self.widen.get(&r).copied()).unwrap_or(0),
            _ => 0,
        };
        let mut out = vec![format!(
            "{pad}[widened: after {n} improvement{} each end the join moved went to the next bound its rules write, or to its infinity; the least value lies within {}, which is an over-approximation of it]",
            if n == 1 { "" } else { "s" },
            self.shown(*val)
        )];
        let shown: Vec<&[Term; 4]> = brk!("widen_why_one_step" => steps.iter().take(1).collect(); steps.iter().collect());
        for [old, c, joined, wide] in shown {
            out.push(format!(
                "{pad}  {} joined with {} is {}, widened to {}",
                self.shown(*old),
                self.shown(*c),
                self.shown(*joined),
                self.shown(*wide)
            ));
        }
        let shown: Vec<&[Term; 3]> = brk!("narrow_why_bare" => Vec::new(); narrowed.iter().collect());
        for [before, fresh, after] in shown {
            out.push(format!(
                "{pad}  narrowed {} to {} by {}, the join of what its rules contribute from it",
                self.shown(*before),
                self.shown(*after),
                self.shown(*fresh)
            ));
        }
        out
    }

    /// `Rofl.whynot` (src/api.ts:927): the demonstration that a literal fails.
    /// Returns `(holds, text)` — a literal that HOLDS is not an error, it is
    /// the answer, and the caller is told so in the same shape.
    ///
    /// `shown` as in `why_text`: a plain world says the literal holds in the
    /// caller's own words. Renaming counts from zero, as there.
    pub fn whynot_text(&mut self, lit: &Lit, b: &WhynotBounds, shown: Option<&str>) -> Result<(bool, String), Halt> {
        let saved = std::mem::replace(&mut self.rename_counter, 0);
        let r = self.whynot_at(lit, b, shown);
        self.rename_counter = saved;
        r
    }

    fn whynot_at(&mut self, lit: &Lit, b: &WhynotBounds, shown: Option<&str>) -> Result<(bool, String), Halt> {
        let mut ctx = WnCtx {
            max_depth: b.max_depth.max(1),
            max_nodes: b.max_nodes.max(1),
            nodes: 0,
            path: HashSet::new(),
            done: HashMap::new(),
        };
        let s = Subst::default();
        if !self.match_premise(lit, &s, 0, None)?.is_empty() {
            let mut k = String::new();
            resolved_lit_key(&mut self.h, lit.rel, lit.persp, &lit.args, &s, &mut k);
            let k = match shown {
                Some(q) if self.plain => q.to_string(),
                _ => k,
            };
            return Ok((true, format!("{k} holds; nothing to demonstrate")));
        }
        let mut k = String::new();
        resolved_lit_key(&mut self.h, lit.rel, lit.persp, &lit.args, &s, &mut k);
        let mut lines = vec![format!("whynot {k}:")];
        // the plain explainer knows no lattice, counting or unknown tuple
        if self.plain {
            ctx.path.insert(self.cycle_key(lit));
            return self.whynot_plain(lit, k, lines, &mut ctx);
        }
        if let Some(more) = brk!("lattice_whynot_plain" => None::<Vec<String>>; self.whynot_lattice(lit)?) {
            lines.extend(more);
            return Ok((false, lines.join("\n")));
        }
        if let Some(more) = brk!("count_whynot_plain" => None::<Vec<String>>; self.whynot_counting(lit)?) {
            lines.extend(more);
            return Ok((false, lines.join("\n")));
        }
        let path = brk!("lattice_whynot_tuple_plain" => None::<Vec<String>>; self.whynot_unknown(lit));
        // A SHRUG IS NOT A FAILURE: no answer, and why, before the premises
        // it rests on (docs/aggregates.md, "Shrugs, as built")
        let sh = brk!("shrug_whynot_as_failure" => Vec::new(); self.shrugs_of(lit));
        if !sh.is_empty() {
            lines[0] = format!("whynot {k}: no answer, a shrug");
            for (f, _) in sh {
                lines.push(self.shrug_why(f));
            }
        }
        if let Some(more) = path {
            lines.extend(more);
            return Ok((false, lines.join("\n")));
        }
        ctx.path.insert(self.cycle_key(lit));
        lines.extend(self.explain_tree(lit, &mut ctx)?);
        Ok((false, lines.join("\n")))
    }

    /// WHYNOT OF A LATTICE VALUE, where its cell holds another or is a hole:
    /// the value the cell holds, and every contribution its rules make at the
    /// key, none of which reaches the value asked about — which is why there
    /// is nothing better. `None` when the cell has no value and no hole, so
    /// the ordinary exploration says why nothing contributes.
    fn whynot_lattice(&mut self, lit: &Lit) -> Result<Option<Vec<String>>, Halt> {
        if self.subs.contains_key(&lit.rel) {
            return self.whynot_sub(lit);
        }
        let Some(&(n, op)) = self.lattices.get(&lit.rel) else { return Ok(None) };
        let Some(persp) = walk(&self.h, lit.persp, &Subst::default()).as_atom() else { return Ok(None) };
        if lit.args.len() != n || !lit.args.iter().all(|a| self.h.is_ground(*a)) {
            return Ok(None);
        }
        let key = &lit.args[..n - 1];
        let mut cell = String::new();
        write_fact_key(&self.h, lit.rel, persp, key, &mut cell);
        let tick = Term::int(self.store.tick as i64);
        let kl = self.h.list(key);
        let markers = [
            self.h.mkf(self.v.s_lattice, &[Term::atom(lit.rel), Term::atom(persp), tick, kl]),
            self.h.mkf(self.v.s_lattice, &[Term::atom(lit.rel)]),
        ];
        let unknowns = [Unknown::Cell((lit.rel, persp, key.into())), Unknown::Rel(lit.rel)];
        for (m, u) in markers.into_iter().zip(unknowns) {
            if let Some(rs) = self.hole_reason(m)? {
                let mut lines = vec![format!("  {cell} has no value: hole({rs}) [{}]", self.lat_label(lit.rel, op))];
                lines.extend(brk!("widen_whynot_bare" => Vec::new(); self.widened_lines(m, "  ")));
                brk!("lattice_whynot_no_path" => (); lines.extend(self.unknown_path(&u)?));
                return Ok(Some(lines));
            }
        }
        let vvar = Term::var(self.h.intern("?V"));
        let mut probe = lit.clone();
        probe.args[n - 1] = vvar;
        let Some((s2, _)) = self.match_premise(&probe, &Subst::default(), 0, None)?.into_iter().next() else {
            return Ok(None);
        };
        let held = resolve(&mut self.h, vvar, &s2);
        let (mut hs, mut ws) = (String::new(), String::new());
        self.h.canon_term(held, &mut hs);
        self.h.canon_term(lit.args[n - 1], &mut ws);
        if op.is_join() {
            let mut lines = vec![format!("  {cell} is a lattice cell ({}) holding {hs} [lattice]", op.name())];
            let contribs = self.lattice_contributions(lit.rel, persp, key, op)?;
            let below = match op.join_canon(&mut self.h, &self.v, &mut self.join_keys, lit.args[n - 1]) {
                Ok(w) => self.join_leq(op, w, held)?,
                Err(_) => {
                    lines.push(format!("  {ws} is no value of {}: {}", op.name(), self.h.name(self.v.agg_type_reason)));
                    return Ok(Some(lines));
                }
            };
            if brk!("join_whynot_below" => !below; below) {
                lines.push(format!("  {ws} is not its value: {} joins every contribution, and they join to {hs}", op.name()));
            } else {
                lines.push(format!(
                    "  {ws} would widen it, and no contribution reaches it: {} contribution{}, joined {hs}",
                    contribs.len(),
                    if contribs.len() == 1 { "" } else { "s" }
                ));
            }
            for (i, (_, text)) in contribs.iter().enumerate() {
                if i >= 8 {
                    lines.push(format!("    [{} more contributions]", contribs.len() - 8));
                    break;
                }
                lines.push(format!("    {text}"));
            }
            return Ok(Some(lines));
        }
        let better = match (op.lift(&self.v, held), op.lift(&self.v, lit.args[n - 1])) {
            (Ok(a), Ok(b)) => matches!(op.insert(&self.v, Some(a), b), Ok(Step::Improved(_))),
            _ => false,
        };
        let mut lines = vec![match self.tags.by_rel.get(&lit.rel) {
            Some((_, a)) => format!("  {cell} is a tag cell ({}) holding {hs} [tag]", a.name()),
            None => format!("  {cell} is a lattice cell ({}) holding {hs} [lattice]", op.name()),
        }];
        let contribs = self.lattice_contributions(lit.rel, persp, key, op)?;
        if better {
            lines.push(format!(
                "  {ws} would improve it, and no contribution reaches {ws}: {} contribution{}, the best {hs}",
                contribs.len(),
                if contribs.len() == 1 { "" } else { "s" }
            ));
        } else {
            let keeper = self.tags.by_rel.get(&lit.rel).map_or(op.name(), |(_, a)| a.name());
            lines.push(format!("  {ws} is not its value: {keeper} keeps the best contribution, {hs}"));
        }
        let shown = 8;
        for (i, (_, text)) in contribs.iter().enumerate() {
            if i >= shown {
                lines.push(format!("    [{} more contributions]", contribs.len() - shown));
                break;
            }
            lines.push(format!("    {text}"));
        }
        Ok(Some(lines))
    }

    /// WHYNOT OF A SUBSUMPTIVE VALUE (docs/aggregates.md, "Subsumption, as
    /// built"): a cell with no value says its hole (a conflict its parties);
    /// a value given and dominated names the member of the front that
    /// dominates it and the rule that says so; one never given says whether
    /// the front would dominate it, and lists what the rules give at the key.
    /// `None` when the cell has no front and no hole.
    fn whynot_sub(&mut self, lit: &Lit) -> Result<Option<Vec<String>>, Halt> {
        let sub = self.subs[&lit.rel].clone();
        let Some(persp) = walk(&self.h, lit.persp, &Subst::default()).as_atom() else { return Ok(None) };
        if lit.args.len() != sub.arity || !lit.args.iter().all(|a| self.h.is_ground(*a)) {
            return Ok(None);
        }
        let k = sub.keylen;
        let key = &lit.args[..k];
        let mut cell = String::new();
        write_fact_key(&self.h, lit.rel, persp, key, &mut cell);
        let tick = Term::int(self.store.tick as i64);
        let kl = self.h.list(key);
        let markers = [
            self.h.mkf(self.v.s_lattice, &[Term::atom(lit.rel), Term::atom(persp), tick, kl]),
            self.h.mkf(self.v.s_lattice, &[Term::atom(lit.rel)]),
        ];
        let unknowns = [Unknown::Cell((lit.rel, persp, key.into())), Unknown::Rel(lit.rel)];
        for (m, u) in markers.into_iter().zip(unknowns) {
            if let Some(rs) = self.hole_reason(m)? {
                let mut lines = vec![format!("  {cell} has no value: hole({rs}) [subsumption]")];
                if let Some(ps) = self.conflict_marks.get(&m).cloned() {
                    let mut ts: Vec<String> = ps.iter().map(|t| self.shown(*t)).collect();
                    ts.sort();
                    lines.push(format!("  its dominance is no order over {}", ts.join(", ")));
                }
                brk!("lattice_whynot_no_path" => (); lines.extend(self.unknown_path(&u)?));
                return Ok(Some(lines));
            }
        }
        let front = self.sub_front(lit.rel, persp, key);
        if front.is_empty() {
            return Ok(None);
        }
        let fronts: Vec<String> = front.iter().map(|f| self.store.key(&self.h, *f)).collect();
        let mut ws = String::new();
        write_fact_key(&self.h, lit.rel, persp, &lit.args, &mut ws);
        let mut lines = vec![format!("  {cell} is a subsumption cell; its front is {}", fronts.join(", "))];
        let ck: LatKey = (lit.rel, persp, key.into());
        let given = self.sub_by.get(&(ck, lit.args[k..].into())).copied().filter(|(f, _)| self.store.alive(*f));
        if let Some((by, rule)) = brk!("dominance_whynot_plain" => None; given) {
            let canon = sub.doms.iter().find(|(d, _)| d.id == rule).map(|(d, _)| d.canon.clone()).unwrap_or_default();
            lines.push(format!("  {ws} was given, and is dominated by {}: {} ({canon})", self.store.key(&self.h, by), self.h.name(rule)));
            return Ok(Some(lines));
        }
        // the questions the close would ask of it, in its order
        // (`sub_admit`, `sub_check`): of itself, then of it against each
        // member and each member against it
        let mut asks: Vec<(Option<FactId>, bool)> = vec![(None, true)];
        asks.extend(front.iter().map(|f| (Some(*f), true)));
        asks.extend(front.iter().map(|f| (Some(*f), false)));
        let mut by: Option<(FactId, Sym)> = None;
        let mut beats: Option<(FactId, Sym)> = None;
        for (f, lower) in asks {
            let a = f.map_or_else(|| lit.args.clone(), |f| self.store.args(f).to_vec());
            if lower && f.is_some() && by.is_some() {
                continue;
            }
            let v = if lower { self.dominated_as(lit.rel, &lit.args, &a, false)? } else { self.dominated_as(lit.rel, &a, &lit.args, false)? };
            let with = f.map_or_else(|| "itself".to_string(), |f| self.store.key(&self.h, f));
            match brk!("dominance_whynot_unasked" => DomV::No; v) {
                DomV::No => {}
                DomV::Yes(rule) => match f {
                    None => {
                        lines.push(format!(
                            "  no rule gives {ws}, and it dominates itself by {}: given, its cell would be a conflict, dominance_cycle",
                            self.h.name(rule)
                        ));
                        return Ok(Some(lines));
                    }
                    Some(f) if lower => by = Some((f, rule)),
                    Some(f) => {
                        beats.get_or_insert((f, rule));
                    }
                },
                DomV::Fault(reason, rule) => {
                    lines.push(format!(
                        "  no rule gives {ws}; given, its cell would be a hole, {}: comparing it with {with} faults in {}",
                        self.h.name(reason),
                        self.h.name(rule)
                    ));
                    return Ok(Some(lines));
                }
                DomV::Unknown(u, rule) => {
                    let ut = self.unknown_text(&u);
                    lines.push(format!(
                        "  no rule gives {ws}; given, its cell would not be known: comparing it with {with} in {} reads {ut}, which is not known",
                        self.h.name(rule)
                    ));
                    return Ok(Some(lines));
                }
            }
        }
        if let Some((f, rule)) = by {
            let tail = match beats {
                Some((g, r)) => format!(
                    ", and it dominates {} by {}: given, its cell would be a conflict, dominance_intransitive",
                    self.store.key(&self.h, g),
                    self.h.name(r)
                ),
                None => String::new(),
            };
            lines.push(format!("  no rule gives {ws}, and it would be dominated by {}: {}{tail}", self.store.key(&self.h, f), self.h.name(rule)));
            return Ok(Some(lines));
        }
        let contribs = self.lattice_contributions(lit.rel, persp, key, AggOp::Dominance)?;
        lines.push(format!(
            "  {ws} would join the front, and no rule gives it: {} value{} given at the key",
            contribs.len(),
            if contribs.len() == 1 { "" } else { "s" }
        ));
        for (i, (_, text)) in contribs.iter().enumerate() {
            if i >= 8 {
                lines.push(format!("    [{} more values]", contribs.len() - 8));
                break;
            }
            lines.push(format!("    {text}"));
        }
        Ok(Some(lines))
    }

    /// WHYNOT OF A COUNTING TAG'S VALUE, where its key holds another: the
    /// count it holds, and every derivation it adds. `None` when the key has
    /// no fact, so the ordinary exploration says why nothing derives it.
    fn whynot_counting(&mut self, lit: &Lit) -> Result<Option<Vec<String>>, Halt> {
        let Some(&c) = self.tags.count_rel.get(&lit.rel) else { return Ok(None) };
        let n = self.tags.by_rel[&lit.rel].0;
        let Some(persp) = walk(&self.h, lit.persp, &Subst::default()).as_atom() else { return Ok(None) };
        if lit.args.len() != n || !lit.args.iter().all(|a| self.h.is_ground(*a)) {
            return Ok(None);
        }
        let vvar = Term::var(self.h.intern("?V"));
        let mut probe = lit.clone();
        probe.args[n - 1] = vvar;
        let Some((s2, _)) = self.match_premise(&probe, &Subst::default(), 0, None)?.into_iter().next() else {
            return Ok(None);
        };
        let held = resolve(&mut self.h, vvar, &s2);
        let mut cell = String::new();
        write_fact_key(&self.h, lit.rel, persp, &lit.args[..n - 1], &mut cell);
        let (mut hs, mut ws) = (String::new(), String::new());
        self.h.canon_term(held, &mut hs);
        self.h.canon_term(lit.args[n - 1], &mut ws);
        let mut derivs: Vec<String> = Vec::new();
        for f in self.store.rel_persp(&self.h, c, persp) {
            let a = self.store.args(f).to_vec();
            if a[..n - 1] != lit.args[..n - 1] {
                continue;
            }
            let rule = self.store.witness_of(&self.h, f, &mut HashMap::new()).map(|w| self.h.name(w.rule).to_string()).unwrap_or_else(|| "a tick before".into());
            let mut t = String::new();
            self.h.canon_term(a[n], &mut t);
            derivs.push(format!("x{t} by {rule}"));
        }
        derivs.sort();
        let mut lines = vec![
            format!("  {cell} is a tag cell (counting) holding {hs} [tag]"),
            format!(
                "  {ws} is not its value: counting adds every derivation, and its {} derivation{} add to {hs}",
                derivs.len(),
                if derivs.len() == 1 { "" } else { "s" }
            ),
        ];
        for (i, d) in derivs.iter().enumerate() {
            if i >= 8 {
                lines.push(format!("    [{} more derivations]", derivs.len() - 8));
                break;
            }
            lines.push(format!("    {d}"));
        }
        Ok(Some(lines))
    }

    /// src/api.ts `whynotStruct` past the literal that holds: a shrug, then
    /// the demonstration.
    fn whynot_plain(&mut self, lit: &Lit, k: String, mut lines: Vec<String>, ctx: &mut WnCtx) -> Result<(bool, String), Halt> {
        let sh = self.shrugs_of(lit);
        if !sh.is_empty() {
            lines[0] = format!("whynot {k}: no answer, a shrug");
            for (f, _) in sh {
                lines.push(self.shrug_why(f));
            }
        }
        lines.extend(self.explain_tree(lit, ctx)?);
        Ok((false, lines.join("\n")))
    }

    /// WHYNOT OF A TUPLE A HOLE LEFT UNKNOWN: not known to hold, and the
    /// path back to the fault. `None` when nothing unknown matches it, or
    /// when a plain hole's own conclusion does: its hole says why.
    fn whynot_unknown(&mut self, lit: &Lit) -> Option<Vec<String>> {
        if self.is_lattice_lit(lit.rel, lit.args.len()) {
            return None;
        }
        let u = self.read_unknown(lit, &Subst::default(), true)?;
        if self.lat_plain.contains(&u) && matches!(self.lat_unknown.get(&u), Some(None)) {
            return None;
        }
        let mut lines = vec![format!("  {} is not known to hold", self.unknown_text(&u))];
        lines.extend(self.unknown_path(&u).ok()?);
        Some(lines)
    }

    /// The reason of the hole on `marker`, if there is one.
    fn hole_reason(&mut self, marker: Term) -> Result<Option<String>, Halt> {
        let rv = Term::var(self.h.intern("?R"));
        let hl = Lit { rel: self.v.hole, persp: Term::atom(self.v.kernel_persp), persp_explicit: true, args: vec![marker, rv], temporal: Temporal::Now };
        let Some((s2, _)) = self.match_premise(&hl, &Subst::default(), 0, None)?.into_iter().next() else { return Ok(None) };
        let r = resolve(&mut self.h, rv, &s2);
        let mut rs = String::new();
        self.h.canon_term(r, &mut rs);
        Ok(Some(rs))
    }

    /// WHERE A WITHDRAWN CELL'S HOLE CAME FROM: each step back to the unknown
    /// it was reached from, and the rule, to the fault behind them all.
    fn unknown_path(&mut self, u: &Unknown) -> Result<Vec<String>, Halt> {
        let mut lines = Vec::new();
        let mut cur = u.clone();
        let mut seen: HashSet<Unknown> = HashSet::new();
        while let Some(Some((from, rule))) = self.lat_unknown.get(&cur).cloned() {
            if !seen.insert(cur.clone()) {
                break;
            }
            let what = match &from {
                Unknown::Cell((rel, p, key)) => {
                    let kl = self.h.list(key);
                    let tick = Term::int(self.store.tick as i64);
                    let m = self.h.mkf(self.v.s_lattice, &[Term::atom(*rel), Term::atom(*p), tick, kl]);
                    match self.hole_reason(m)? {
                        Some(r) => format!("which has no value: hole({r})"),
                        None => "whose value is not known".to_string(),
                    }
                }
                Unknown::Rel(rel) => {
                    let m = self.h.mkf(self.v.s_lattice, &[Term::atom(*rel)]);
                    match self.hole_reason(m)? {
                        Some(r) => format!("hole({r})"),
                        None => "none of them known".to_string(),
                    }
                }
                Unknown::Tuple(..) => "which is not known to hold".to_string(),
            };
            lines.push(format!("    reached by {} from {}, {what}", self.h.name(rule), self.unknown_text(&from)));
            cur = from;
        }
        Ok(lines)
    }

    /// Every contribution the rules of a lattice relation make at one key,
    /// over the facts as they stand: `(value, "V <= rule: premises")`, best
    /// first. A rule with an aggregate in its body is named, not solved.
    fn lattice_contributions(&mut self, rel: Sym, persp: Sym, key: &[Term], op: AggOp) -> Result<Vec<(Term, String)>, Halt> {
        let rules: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.clause.head.rel == rel && r.clause.head.temporal != Temporal::Next)
            .cloned()
            .collect();
        let mut out: Vec<(Option<crate::cell::Val>, String, Term, String)> = Vec::new();
        let arity = self.lattices.get(&rel).map_or(key.len() + 1, |x| x.0);
        for r in rules {
            let rn = self.rename_clause(&r.clause);
            if rn.head.args.len() != arity {
                continue;
            }
            if rn.body.iter().any(|b| matches!(b, BodyElem::Agg(_))) {
                out.push((None, String::new(), Term::atom(self.v.a_false), format!("? <= {}: (an aggregate in its body)", self.h.name(r.id))));
                continue;
            }
            let mut s = unify(&self.h, rn.head.persp, Term::atom(persp), &Subst::default());
            for (i, k) in key.iter().enumerate() {
                let Some(cur) = s.take() else { break };
                s = unify(&self.h, rn.head.args[i], *k, &cur);
            }
            let Some(s0) = s else { continue };
            let plan = plan_body(&self.h, &rn).0;
            for sol in self.solve_body(&plan, s0, 0, None, None)? {
                let v = resolve(&mut self.h, rn.head.args[key.len()], &sol.s);
                let mut vs = String::new();
                for (i, a) in rn.head.args[key.len()..].iter().enumerate() {
                    if i > 0 {
                        vs.push_str(", ");
                    }
                    let t = resolve(&mut self.h, *a, &sol.s);
                    self.h.canon_term(t, &mut vs);
                }
                let prems: Vec<String> = sol
                    .prems
                    .iter()
                    .filter_map(|p| match p {
                        PremRef::Fact(f) => Some(self.store.key(&self.h, *f)),
                        PremRef::Bi(d) => Some(self.h.name(*d).to_string()),
                        PremRef::Neg(k) => Some(format!("not {}", self.h.name(*k))),
                        PremRef::Cell(_) => None,
                    })
                    .collect();
                let text = format!("{vs} <= {}: {}", self.h.name(r.id), prems.join(", "));
                out.push((op.lift(&self.v, v).ok(), vs, v, text));
            }
        }
        out.sort_by(|a, b| {
            let rank = |x: &Option<crate::cell::Val>, y: &Option<crate::cell::Val>| match (x, y) {
                (Some(p), Some(q)) => match op.insert(&self.v, Some(*q), *p) {
                    Ok(Step::Improved(_)) => std::cmp::Ordering::Less,
                    Ok(Step::Unchanged) => std::cmp::Ordering::Greater,
                    _ => std::cmp::Ordering::Equal,
                },
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            };
            rank(&a.0, &b.0).then_with(|| cmp_js(&a.3, &b.3))
        });
        out.dedup_by(|a, b| a.3 == b.3);
        Ok(out.into_iter().map(|(_, _, v, t)| (v, t)).collect())
    }

    /// One node: for every rule that could conclude the literal, the failing
    /// premise instances, each followed in turn (`explain_rule`).
    fn explain_failure(&mut self, lit: &Lit, level: usize, ctx: &mut WnCtx, next: &mut Vec<WnTask>) {
        ctx.nodes += 1;
        let pad = "  ".repeat(2 * level - 1);
        let rules: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.clause.head.rel == lit.rel)
            .cloned()
            .collect();
        if rules.is_empty() {
            next.push(WnTask::Line(format!(
                "{pad}no rule concludes '{}' and no matching base fact exists",
                self.h.name(lit.rel)
            )));
            return;
        }
        // each rule is explored when its turn comes, after the one before it
        // has been followed down: what renaming and exploring meet is in order
        next.extend(rules.into_iter().map(|r| WnTask::Rule(lit.clone(), r, level)));
    }

    /// One rule that could conclude `lit`: its failing premise instances, each
    /// followed one level deeper.
    fn explain_rule(&mut self, lit: &Lit, r: &ERule, level: usize, next: &mut Vec<WnTask>) -> Result<(), Halt> {
        let pad = "  ".repeat(2 * level - 1);
        let rn = self.rename_clause(&r.clause);
        let mut s = Some(Subst::default());
        if let Some(cur) = s.take() {
            s = self.eval_builtin(self.v.op_eq, rn.head.persp, lit.persp, &cur, None);
        }
        let n = rn.head.args.len().min(lit.args.len());
        for i in 0..n {
            let Some(cur) = s.take() else { break };
            s = self.eval_builtin(self.v.op_eq, rn.head.args[i], lit.args[i], &cur, None);
        }
        let Some(s0) = s.filter(|_| rn.head.args.len() == lit.args.len()) else {
            next.push(WnTask::Line(format!("{pad}rule {}: head does not unify", self.h.name(r.id))));
            return Ok(());
        };
        let mut failures = self.failing_premises(&rn, &s0, r.id)?;
        next.push(WnTask::Line(format!("{pad}rule {}: {}", self.h.name(r.id), r.canon)));
        let mut keys: Vec<String> = failures.keys().cloned().collect();
        keys.sort_by(|a, b| cmp_js(a, b));
        keys.truncate(12);
        if keys.is_empty() {
            next.push(WnTask::Line(format!("{pad}  (no failing premise found within exploration bounds)")));
        }
        for f in keys {
            next.push(WnTask::Line(format!("{pad}  failed premise: {f}")));
            if let Some(Some(sub)) = failures.remove(&f) {
                next.push(WnTask::Deeper(sub, level + 1));
            }
        }
        Ok(())
    }

    /// Everything that makes the walk terminate is here — the cycle path,
    /// the depth cap, the node cap — and each says so in the output.
    fn explain_deeper(&mut self, lit: &Lit, level: usize, ctx: &mut WnCtx, next: &mut Vec<WnTask>) {
        let pad = "  ".repeat(2 * level - 1);
        if level > ctx.max_depth {
            // depth 1 is the single-step form: nothing below the named
            // premises was promised, so nothing there is cut off.
            if ctx.max_depth > 1 {
                next.push(WnTask::Line(format!("{pad}[depth limit {} reached]", ctx.max_depth)));
            }
            return;
        }
        if ctx.nodes >= ctx.max_nodes {
            next.push(WnTask::Line(format!("{pad}[node limit {} reached]", ctx.max_nodes)));
            return;
        }
        let ck = self.cycle_key(lit);
        if ctx.path.contains(&ck) {
            let mut k = String::new();
            resolved_lit_key(&mut self.h, lit.rel, lit.persp, &lit.args, &Subst::default(), &mut k);
            next.push(WnTask::Line(format!("{pad}{k} [cycle]")));
            return;
        }
        if self.h.is_ground(lit.persp) && lit.args.iter().all(|a| self.h.is_ground(*a)) {
            if brk!("whynot_dag_off" => false; ctx.done.get(&ck).is_some_and(|ls| ls.contains(&level))) {
                let mut k = String::new();
                resolved_lit_key(&mut self.h, lit.rel, lit.persp, &lit.args, &Subst::default(), &mut k);
                next.push(WnTask::Line(format!("{pad}{k} [above]")));
                return;
            }
            ctx.done.entry(ck.clone()).or_default().insert(level);
        }
        ctx.path.insert(ck.clone());
        next.push(WnTask::Failure(lit.clone(), level));
        next.push(WnTask::Unpath(ck));
    }

    /// THE DEMONSTRATION, WALKED WITH A STACK OF ITS OWN (as `render_tree`
    /// walks `why`): a failure as deep as the bounds allow takes no frame per
    /// level, and each line is written once.
    fn explain_tree(&mut self, lit: &Lit, ctx: &mut WnCtx) -> Result<Vec<String>, Halt> {
        let mut lines = Vec::new();
        let mut todo = vec![WnTask::Failure(lit.clone(), 1)];
        let mut next: Vec<WnTask> = Vec::new();
        while let Some(t) = todo.pop() {
            match t {
                WnTask::Failure(l, level) => self.explain_failure(&l, level, ctx, &mut next),
                WnTask::Rule(l, r, level) => self.explain_rule(&l, &r, level, &mut next)?,
                WnTask::Deeper(l, level) => self.explain_deeper(&l, level, ctx, &mut next),
                WnTask::Line(x) => lines.push(x),
                WnTask::Unpath(ck) => {
                    ctx.path.remove(&ck);
                }
            }
            todo.extend(next.drain(..).rev());
        }
        Ok(lines)
    }

    /// Single-step failure analysis of one body under a head substitution.
    ///
    /// IN THE ORDER THE EVALUATOR SOLVES IN, and the two engines' hosts once
    /// disagreed about exactly this: `whynot` is top-down, so the goal has
    /// already bound the head's arguments and a negation is read with them
    /// bound, where the bottom-up run read the same negation with them free.
    fn failing_premises(&mut self, rn: &Clause, s0: &Subst, rid: Sym) -> Result<HashMap<String, Option<Lit>>, Halt> {
        let mut out: HashMap<String, Option<Lit>> = HashMap::new();
        let body = if self.plain { plan_body_plain(&self.h, rn) } else { plan_body(&self.h, rn).0 };
        let mut nodes = 0usize;
        self.explore_body(&body, 0, s0, &mut out, &mut nodes, Some(rid))?;
        Ok(out)
    }

    fn explore_body(
        &mut self,
        body: &[BodyElem],
        k: usize,
        s: &Subst,
        out: &mut HashMap<String, Option<Lit>>,
        nodes: &mut usize,
        rule: Option<Sym>,
    ) -> Result<(), Halt> {
        *nodes += 1;
        if *nodes > 2000 || k >= body.len() {
            return Ok(()); // a surviving branch is not a failure (demand)
        }
        match &body[k] {
            BodyElem::Pos(l) => {
                let mm = self.match_premise(l, s, 0, None)?;
                if mm.is_empty() {
                    let mut key = String::new();
                    resolved_lit_key(&mut self.h, l.rel, l.persp, &l.args, s, &mut key);
                    let inst = self.instantiate(l, s);
                    out.entry(key).or_insert(Some(inst));
                } else {
                    for (s2, _) in mm.into_iter().take(16) {
                        self.explore_body(body, k + 1, &s2, out, nodes, rule)?;
                    }
                }
            }
            BodyElem::Neg(l) => {
                let mm = self.match_premise(l, s, 0, None)?;
                if let Some((s2, r)) = mm.into_iter().next() {
                    let wit = match r {
                        PremRef::Fact(f) => {
                            let rec = self.store.rec(f);
                            let (rel, persp) = (rec.rel, rec.persp);
                            let args = self.store.args(f).to_vec();
                            let mut w = String::new();
                            write_fact_key(&self.h, rel, persp, &args, &mut w);
                            w
                        }
                        _ => {
                            let mut w = String::new();
                            resolved_lit_key(&mut self.h, l.rel, l.persp, &l.args, &s2, &mut w);
                            w
                        }
                    };
                    let mut key = String::new();
                    resolved_lit_key(&mut self.h, l.rel, l.persp, &l.args, s, &mut key);
                    out.entry(format!("not {key} -- blocked: {wit} holds")).or_insert(None);
                } else {
                    self.explore_body(body, k + 1, s, out, nodes, rule)?;
                }
            }
            BodyElem::Agg(a) if a.op == AggOp::AtLeast => {
                let rid = rule.ok_or_else(|| Halt::Bug("an aggregate explored outside a rule".into()))?;
                self.explore_threshold(body, k, s, a, rid, out, nodes)?;
            }
            BodyElem::Agg(a) => {
                let rid = rule.ok_or_else(|| Halt::Bug("an aggregate explored outside a rule".into()))?;
                let desc = self.agg_desc(a, s);
                let desc = self.h.name(desc).to_string();
                let mm = self.agg_premise(rid, a, s, 0, false)?;
                if mm.is_empty() {
                    // WHICH WAY IT FAILED: a value that is not the one asked
                    // for, a hole (the group is known and has no value), or
                    // an empty group. Only the last sends the question on to
                    // the inner literal: a hole's members exist.
                    let (plan, corr) = self.agg_corr(rid, a, s)?;
                    let cells = match self.seal_cells(rid, a, &plan, s, &corr, 0, false)? {
                        Sealed::Ephemeral(cells) => cells,
                        Sealed::Open(r) => {
                            out.entry(format!("{desc} has no value: hole({}) [aggregate]", self.h.name(r))).or_insert(None);
                            return Ok(());
                        }
                        Sealed::Kept(_) => return Err(Halt::Bug("whynot stored a cell".into())),
                    };
                    let mut mine: Vec<(String, CellValue, usize)> = Vec::new();
                    for (key, value, n) in cells {
                        if self.bind_group(a, &plan, s, &key).is_some() {
                            mine.push((tuple_text(&self.h, &key), value, n));
                        }
                    }
                    mine.sort_by(|x, y| cmp_js(&x.0, &y.0));
                    let valued = mine.iter().find_map(|(_, v, _)| if let CellValue::Value(t) = v { Some(*t) } else { None });
                    let holed = mine.iter().find_map(|(_, v, _)| if let CellValue::Hole(r) = v { Some(*r) } else { None });
                    // a rank whose subject is none of the group's values: the
                    // group has members, and the subject is not among them
                    let unranked = mine.iter().find_map(|(_, v, n)| (matches!(v, CellValue::Empty) && *n > 0).then_some(*n));
                    if let Some(got) = valued {
                        let want = resolve(&mut self.h, a.result, s);
                        let (mut g, mut w) = (String::new(), String::new());
                        self.h.canon_term(got, &mut g);
                        self.h.canon_term(want, &mut w);
                        out.entry(format!("{desc} = {g}, not {w} [aggregate]")).or_insert(None);
                    } else if let Some(r) = brk!("whynot_hole_empty" => holed.filter(|_| false); holed) {
                        out.entry(format!("{desc} has no value: hole({}) [aggregate]", self.h.name(r))).or_insert(None);
                    } else if let Some(n) = brk!("whynot_unranked_empty" => unranked.filter(|_| false); unranked) {
                        let mut st = String::new();
                        for (i, t) in a.vals[..a.params()].iter().enumerate() {
                            let subject = resolve(&mut self.h, *t, s);
                            if i > 0 {
                                st.push_str(", ");
                            }
                            self.h.canon_term(subject, &mut st);
                        }
                        out.entry(format!("{desc} has no value: {st} is not one of its {n} distinct values [aggregate]")).or_insert(None);
                    } else {
                        let sub = match a.body.as_slice() {
                            [BodyElem::Pos(l)] => Some(self.instantiate(l, s)),
                            _ => None,
                        };
                        out.entry(format!("{desc} has no value: empty group [aggregate]")).or_insert(sub);
                    }
                } else {
                    for (s2, _) in mm.into_iter().take(16) {
                        self.explore_body(body, k + 1, &s2, out, nodes, rule)?;
                    }
                }
            }
            BodyElem::Bi { op, l, r } => {
                let s2s = self.eval_builtins(*op, *l, *r, s, None)?;
                match s2s.first().is_some() {
                    true => {
                        for s2 in s2s.into_iter().take(16) {
                            self.explore_body(body, k + 1, &s2, out, nodes, rule)?;
                        }
                    }
                    false => {
                        let lt = resolve(&mut self.h, *l, s);
                        let rt = resolve(&mut self.h, *r, s);
                        let (mut a, mut b) = (String::new(), String::new());
                        self.h.canon_term(lt, &mut a);
                        self.h.canon_term(rt, &mut b);
                        out.entry(format!("{a} {} {b} [builtin fails]", self.h.name(*op)))
                            .or_insert(None);
                    }
                }
            }
        }
        Ok(())
    }

    /// WHYNOT OF A THRESHOLD: each group it reaches goes on to the next
    /// premise; where none does, how far it got — `reached k of N` and the k
    /// members, or the hole its N is — and, with no member at all, why its one
    /// literal has no match. Asked of the world as it stands; nothing stored.
    #[allow(clippy::too_many_arguments)]
    fn explore_threshold(
        &mut self,
        body: &[BodyElem],
        k: usize,
        s: &Subst,
        a: &Agg,
        rid: Sym,
        out: &mut HashMap<String, Option<Lit>>,
        nodes: &mut usize,
    ) -> Result<(), Halt> {
        let (plan, corr) = self.agg_corr(rid, a, s)?;
        let desc = self.agg_desc(a, s);
        let desc = self.h.name(desc).to_string();
        let need = match self.thr_need(rid, a, s, &corr, false) {
            Ok((n, _)) => n,
            Err(r) => {
                out.entry(format!("{desc} has no value: hole({}) [threshold]", self.h.name(r))).or_insert(None);
                return Ok(());
            }
        };
        let (mut groups, dropped) = self.thr_groups(rid, a, &plan, s, 0, false, None)?;
        if groups.is_empty() && plan.group.is_empty() {
            groups.push((Vec::new(), Vec::new()));
        }
        let mut reached = Vec::new();
        let mut best: Option<(Vec<Term>, Vec<ThrMember>)> = None;
        for (gkey, ms) in groups {
            let key = self.thr_shared(a, &plan, &corr, &gkey);
            let Some(s2) = self.bind_group(a, &plan, s, &key) else { continue };
            if brk!("thr_whynot_reached" => ms.len() + 1 >= need; ms.len() >= need) {
                reached.push(s2);
            } else if best.as_ref().is_none_or(|b| ms.len() > b.1.len()) {
                best = Some((gkey, ms));
            }
        }
        if !reached.is_empty() {
            for s2 in reached.into_iter().take(16) {
                self.explore_body(body, k + 1, &s2, out, nodes, Some(rid))?;
            }
            return Ok(());
        }
        let (gkey, ms) = best.unwrap_or_default();
        let named = if gkey.len() == plan.group.len() {
            let key = self.thr_shared(a, &plan, &corr, &gkey);
            self.bind_group(a, &plan, s, &key).unwrap_or_else(|| s.clone())
        } else {
            s.clone()
        };
        let d = self.agg_desc(a, &named);
        let mut hs: Vec<(u32, usize)> = Vec::with_capacity(ms.len());
        for (i, m) in ms.iter().enumerate() {
            let mut h = u32::MAX;
            for d in &m.derivs {
                h = h.min(self.member_height(&d.1)?);
            }
            hs.push((h, i));
        }
        let ranked: Vec<(u32, String)> = hs.iter().map(|(h, i)| (*h, ms[*i].text.clone())).collect();
        let order = quorum(&ranked, ranked.len()).unwrap_or_default();
        let listed: Vec<String> =
            order.iter().enumerate().map(|(i, j)| format!("#{} {} h={}", i + 1, ranked[*j].1, ranked[*j].0)).collect();
        let mut line = format!("{} reached {} of {need} [threshold]", self.h.name(d), ms.len());
        if !listed.is_empty() {
            line.push_str(": ");
            line.push_str(&listed.join(", "));
        }
        if let Some(r) = dropped {
            line.push_str(&format!("; a member was dropped: hole({})", self.h.name(r)));
        }
        let sub = match (ms.is_empty(), a.body.as_slice()) {
            (true, [BodyElem::Pos(l)]) => Some(self.instantiate(l, &named)),
            _ => None,
        };
        out.entry(line).or_insert(sub);
        Ok(())
    }

    fn instantiate(&mut self, l: &Lit, s: &Subst) -> Lit {
        Lit {
            rel: l.rel,
            persp: walk(&self.h, l.persp, s),
            persp_explicit: l.persp_explicit,
            args: l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect(),
            temporal: l.temporal,
        }
    }

    /// The literal with its variables renumbered by first appearance, so two
    /// instances that differ only in the evaluator's renaming suffix compare
    /// equal and a loop is recognised.
    fn cycle_key(&mut self, l: &Lit) -> String {
        let mut seen: HashMap<Sym, String> = HashMap::new();
        let mut out = String::new();
        out.push_str(self.h.name(l.rel));
        out.push('[');
        let p = self.renumber(l.persp, &mut seen);
        self.h.canon_term(p, &mut out);
        out.push_str("](");
        for (i, a) in l.args.clone().iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            let t = self.renumber(*a, &mut seen);
            self.h.canon_term(t, &mut out);
        }
        out.push(')');
        out.push('@');
        out.push_str(match l.temporal {
            Temporal::Now => "now",
            Temporal::Init => "init",
            Temporal::Next => "next",
        });
        out
    }

    fn renumber(&mut self, t: Term, seen: &mut HashMap<Sym, String>) -> Term {
        match t.kind() {
            TermK::Var(s) => {
                let n = seen.len();
                let name = seen.entry(s).or_insert_with(|| format!("${n}")).clone();
                let sy = self.h.intern(&name);
                Term::var(sy)
            }
            TermK::Func(i) => {
                let name = self.h.fname(i);
                let args = self.h.fargs(i).to_vec();
                let mapped: Vec<Term> = args.into_iter().map(|a| self.renumber(a, seen)).collect();
                self.h.mkf(name, &mapped)
            }
            _ => t,
        }
    }
}

/// Whether `to` is reached from `from` over `deps`.
fn reaches_in(deps: &HashMap<Sym, HashSet<Sym>>, from: Sym, to: Sym) -> bool {
    let (mut seen, mut stack) = (HashSet::new(), vec![from]);
    while let Some(x) = stack.pop() {
        if x == to {
            return true;
        }
        if seen.insert(x) {
            stack.extend(deps.get(&x).into_iter().flatten().copied());
        }
    }
    false
}
