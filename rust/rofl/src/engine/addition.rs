//! THE ADDITION PATH: base facts and rules enter an evaluated world and it is
//! brought to what a fresh evaluation of the whole program would hold, without
//! clearing what it derived (f_the_owner_settles_walls_promises_and_incremental,
//! point 3). The counterpart of the retraction path (`delta.rs`), and built on
//! its machinery.
//!
//! WHAT CHANGES. The relations of the added facts and the heads of the added
//! rules GROW; so does, through every rule that reads one of them, its head
//! (`grow`). A fact asserted where it was derived is an addition too: it is
//! base now, its height a base fact's, and what rests on it may lie lower.
//!
//! LEVEL BY LEVEL (`fine_levels`, DRed over the levels of the stratified
//! program): the news of every level below fires each level semi-naively, an
//! added rule that is plain or negates fires whole at its level; a rule that
//! reads what grew only under a negation keeps its facts and loses the firings
//! a new fact blocks, a fact that lost one goes whole with what rests on it and
//! is derived again from what holds, a fact gone for good makes a negation over
//! it hold; a rule that aggregates what grew (or a threshold, a moved round, a
//! negation that cannot be bound) is sealed again whole at its level and its
//! readers fed its change. AFTER THE REST, through the retraction path's
//! machinery: an order lattice the change reaches, what calls made to a relation
//! answered on demand, and what negates or aggregates those (`dirty`, `again`).
//! A rule staged `@next` from what changed stages again (`restage`), over cells
//! sealed again where it aggregates.
//!
//! THE STATE IS A SET OF FACTS AND, PER FACT, THE SET OF ITS FIRINGS, and the
//! witness printed is the least by height and signature (`Store::witness_of`),
//! so the order the delta fires in is not observable, except where a cell keeps
//! its members by height and canonical order, which a seal again takes as an
//! evaluation takes them.
//!
//! WHAT IT REFUSES, every reason in a fixed order (`addition_refusals`,
//! `add_worked_out`, `prep_moves`), and the world is then evaluated again from
//! its facts: not evaluated, cut by a wall, a later tick, well-founded, a hole or
//! a shrug reader, a lattice beside a relation answered on demand, a ledger
//! reader, a component stratified by its data, a join, widening, counting tag or
//! dominance reached, a staged fact two firings reach, a world that keeps no
//! witness beyond the monotone part, and for added rules a program whose
//! preparation moves more than the rules it runs.
use super::*;

/// What an addition did.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AddDelta {
    /// base facts added
    pub facts: usize,
    /// rules added, fired whole over the store
    pub rules: usize,
    /// rules fired semi-naively from the news
    pub monotone: usize,
    /// rules that read what grew under a negation or an aggregate (or added ones that negate or aggregate), reset
    pub stacked_rules: usize,
    /// cells of those rules, sealed again
    pub stacked_cells: usize,
    /// facts taken out: those of the reset rules' heads and what rested on them
    pub withdrawn: usize,
    /// rules fired again whole over what stands
    pub refired: usize,
    /// rules staged `@next` from what changed, fired again
    pub restaged: usize,
    /// rules that read what grew only under a negation, kept: the firings a new fact blocks are withdrawn
    pub negated: usize,
    /// facts taken out because a firing of theirs was withdrawn, or what they rested on went, through each other
    pub overdeleted: usize,
    /// of those, derived again from what holds
    pub rederived: usize,
    /// facts that lost a firing and kept another standing on what stays: not overdeleted
    pub kept: usize,
}

/// A negated premise over a relation that grew, as the fine path reads it: its place in the plan, and the places of
/// its arguments a new fact binds (a variable the rest of the rule never names matches anything and binds nothing).
struct NegAt {
    at: usize,
    lit: Lit,
    binds: Vec<usize>,
    persp: bool,
}

/// What preparation decided that an added rule may move (`prep_mark`, `prep_moves`).
pub struct PrepMark {
    rules: HashMap<Sym, (String, bool)>,
    lattices: Vec<Sym>,
    subs: Vec<(Sym, Vec<Sym>)>,
    demand: Vec<Sym>,
    late: Vec<Sym>,
    shrugs: Vec<Sym>,
    decl: (bool, bool, bool),
    functions: Vec<crate::structure::Function>,
    trees: Vec<crate::structure::Tree>,
    closures: Vec<Sym>,
    cone: Option<Vec<Sym>>,
    carried: Vec<Sym>,
}

fn reads(r: &ERule, set: &HashSet<Sym>) -> (bool, bool) {
    let (mut any, mut inner) = (false, false);
    fn walk(b: &BodyElem, deep: bool, set: &HashSet<Sym>, any: &mut bool, inner: &mut bool) {
        match b {
            BodyElem::Pos(l) | BodyElem::Neg(l) if set.contains(&l.rel) => {
                *any = true;
                *inner |= deep || matches!(b, BodyElem::Neg(_));
            }
            BodyElem::Agg(a) => a.body.iter().for_each(|x| walk(x, true, set, any, inner)),
            _ => {}
        }
    }
    for b in &r.clause.body {
        walk(b, false, set, &mut any, &mut inner);
    }
    (any, inner)
}

/// The negated premises of `r` over `grown`, each as the fine path binds it to a fact; None where one cannot be bound
/// so (a variable only it names, inside a compound or twice, or a literal of another tense), or `r` reads what grew
/// otherwise than positively or under such a negation.
fn negs_of(h: &Heap, r: &ERule, grown: &HashSet<Sym>) -> Option<Vec<NegAt>> {
    let mut out = Vec::new();
    for (i, b) in r.plan.iter().enumerate() {
        let BodyElem::Neg(l) = b else {
            if let BodyElem::Agg(a) = b {
                if a.body.iter().flat_map(|x| x.lits_deep()).any(|l| grown.contains(&l.rel)) {
                    return None;
                }
            }
            continue;
        };
        if !grown.contains(&l.rel) {
            continue;
        }
        if l.temporal != Temporal::Now {
            return None;
        }
        let mut outside: Vec<Sym> = Vec::new();
        h.vars_of(r.clause.head.persp, &mut outside);
        for a in &r.clause.head.args {
            h.vars_of(*a, &mut outside);
        }
        for (j, e) in r.plan.iter().enumerate() {
            if j == i {
                continue;
            }
            match e {
                BodyElem::Pos(x) | BodyElem::Neg(x) => {
                    h.vars_of(x.persp, &mut outside);
                    x.args.iter().for_each(|a| h.vars_of(*a, &mut outside));
                }
                BodyElem::Bi { l, r: rr, .. } => {
                    h.vars_of(*l, &mut outside);
                    h.vars_of(*rr, &mut outside);
                }
                BodyElem::Agg(_) => return None,
            }
        }
        let mut mine: Vec<Sym> = Vec::new();
        h.vars_of(l.persp, &mut mine);
        l.args.iter().for_each(|a| h.vars_of(*a, &mut mine));
        let alone = |v: Sym| !outside.contains(&v);
        let mut binds = Vec::new();
        for (k, a) in l.args.iter().enumerate() {
            match a.kind() {
                TermK::Var(v) if alone(v) => {
                    if mine.iter().filter(|x| **x == v).count() > 1 {
                        return None;
                    }
                }
                _ => {
                    let mut vs = Vec::new();
                    h.vars_of(*a, &mut vs);
                    if vs.iter().any(|v| alone(*v)) {
                        return None;
                    }
                    binds.push(k);
                }
            }
        }
        let persp = match l.persp.kind() {
            TermK::Var(v) if alone(v) => {
                if mine.iter().filter(|x| **x == v).count() > 1 {
                    return None;
                }
                false
            }
            _ => true,
        };
        out.push(NegAt { at: i, lit: l.clone(), binds, persp });
    }
    Some(out)
}

fn sorted(mut v: Vec<Sym>) -> Vec<Sym> {
    v.sort_unstable();
    v.dedup();
    v
}

/// How an addition fires again what it changes, as the planner sorts the rules: the lattices and calls it reaches, the
/// rules by how they fire, and what is derived again after the rest.
#[derive(Default)]
struct Plan {
    lats: HashSet<Sym>,
    joins: HashSet<Sym>,
    call_rels: HashSet<Sym>,
    reset: HashSet<Sym>,
    keyable: HashSet<Sym>,
    mono: Vec<Rc<ERule>>,
    negs: Vec<(Rc<ERule>, Vec<NegAt>)>,
    new_plain: Vec<Rc<ERule>>,
    recompute: Vec<Rc<ERule>>,
    reset_after: HashSet<Sym>,
    again: Vec<Rc<ERule>>,
    skip: HashSet<Sym>,
    dirty: HashSet<Sym>,
    staged: Vec<Rc<ERule>>,
    unstage: HashSet<Sym>,
}

/// What the fine path carries from level to level: the news, the facts withdrawn and not yet derived again, the facts
/// gone by relation, the level of each rule, and the rules by head.
struct Fine {
    news: Front,
    touched: HashSet<FactId>,
    over: HashSet<FactId>,
    over_base: HashSet<FactId>,
    gone: HashMap<Sym, Vec<FactId>>,
    lvl: HashMap<Sym, i64>,
    by_head: HashMap<Sym, Vec<Rc<ERule>>>,
    retracting: bool,
}

/// One level as the fine path settles it: its rules in order, and what it derives whole before its rounds.
struct LevelRun {
    rules: Vec<Rc<ERule>>,
    held: HashSet<FactId>,
    heads: HashSet<Sym>,
    into: Vec<Rc<ERule>>,
    here: Vec<Rc<ERule>>,
}

/// Whether the rule `id` fires at level `lv`.
fn fired_at(st: &Fine, lv: i64, id: Sym) -> bool {
    st.lvl[&id] == lv
}

/// A rule whose firing waits for its whole input: it negates, aggregates, reads a threshold, or reads a lattice from
/// outside its recursion.
fn stratified(r: &ERule) -> bool {
    r.has_neg || r.has_agg || r.has_thr || !r.lattice_outer.is_empty() || r.demand_strict
}

impl Eval {
    /// What preparation decided, beside the rules, that an added rule could move.
    pub fn prep_mark(&self) -> PrepMark {
        PrepMark {
            rules: self.rules.iter().map(|r| (r.id, (r.canon.clone(), r.safe))).collect(),
            lattices: sorted(self.lat.cell_rels().collect()),
            // (a dominance rule added to a relation already subsumptive is a declaration changed too)
            subs: {
                let mut v: Vec<(Sym, Vec<Sym>)> = self.lat.subs().map(|(r, x)| (r, sorted(x.doms.iter().filter(|_| brk!("add_dominance_rule_unmarked" => false; true)).map(|(d, _)| d.id).collect()))).collect();
                v.sort_unstable();
                v
            },
            demand: sorted(self.demand.rels.iter().map(|(r, _)| *r).collect()),
            late: sorted(self.answer.late.clone()),
            shrugs: sorted(self.shrug_readers.iter().copied().collect()),
            decl: (self.well_founded, self.prov.no_provenance, self.prov.no_witness),
            functions: self.ds.functions.clone(),
            trees: self.ds.trees.clone(),
            closures: self.vc.vclosures.iter().map(|c| c.rel).collect(),
            cone: self.cone.as_ref().map(|c| sorted(c.iter().copied().collect())),
            carried: sorted(self.carried.values().copied().collect()),
        }
    }

    /// WHAT A NEW PROGRAM MOVES BEYOND THE RULES IT ADDS: the rules to fire whole (those added, and those now
    /// answered on demand or no longer), the relations whose facts a call made (answered on demand before or now),
    /// and every reason the addition is not worked out as a delta (an old rule changed or gone is one). A function or
    /// a tree declared derives nothing itself: its promise is judged over its whole relation after the delta
    /// (`check_promises_added`), and a tree's closure is engaged over its edges (`reprepare_keeping_trees`).
    pub fn prep_moves(&mut self, was: &PrepMark) -> (Vec<Sym>, Vec<Sym>, Vec<&'static str>) {
        let now = self.prep_mark();
        let mut out = Vec::new();
        if was.functions.iter().any(|f| !now.functions.contains(f)) || was.trees.iter().any(|t| !now.trees.contains(t)) {
            out.push("a function or tree declaration left the world");
        }
        self.ds.unjudged.extend(now.functions.iter().filter(|f| !was.functions.contains(f)).cloned());
        self.ds.unjudged_trees.extend(now.trees.iter().filter(|t| !was.trees.contains(t)).cloned());
        if was.rules.iter().any(|(id, (canon, _))| now.rules.get(id).map(|x| &x.0) != Some(canon)) {
            out.push("a rule of the world changed or left it");
        }
        if was.decl != now.decl {
            out.push("a declaration the evaluation reads changed");
        }
        if was.lattices != now.lattices || was.subs != now.subs || was.carried != now.carried {
            out.push("a lattice, tag or dominance declaration changed");
        }
        if was.late != now.late && self.mode == Mode::Strata || was.shrugs != now.shrugs {
            out.push("the rules fired late or after the shrugs changed");
        }
        if was.cone.is_none() && now.cone.is_some() {
            out.push("the world started running a cone of asks");
        }
        let demand_moved: HashSet<Sym> = was.demand.iter().chain(&now.demand).copied().filter(|r| was.demand.contains(r) != now.demand.contains(r)).collect();
        // a rule reading a closure declared since read none of its rows: it fires whole, as an added rule does, where
        // what it concluded without them stands (it reads them positively, outside an aggregate)
        let declared: HashSet<Sym> = now.closures.iter().copied().filter(|c| !was.closures.contains(c)).collect();
        if self.rules.iter().any(|r| was.rules.contains_key(&r.id) && reads(r, &declared).1) {
            out.push("a rule read a closure declared since under a negation or an aggregate");
        }
        let fresh = |r: &ERule| match was.rules.get(&r.id) {
            None => true,
            Some((_, safe)) => *safe != r.safe || reads(r, &declared).0,
        };
        let mut added: Vec<Sym> = self.rules.iter().filter(|r| fresh(r)).map(|r| r.id).collect();
        added.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        let called = if demand_moved.is_empty() { Vec::new() } else { sorted(was.demand.iter().chain(&now.demand).copied().collect()) };
        (added, called, out)
    }

    /// THE ROUNDS AGAIN, for a program with added rules: the levels the added rules fire at, and the relations whose
    /// round moved, which a cell sealed over one names in its seals.
    fn rerank(&mut self) -> Result<HashSet<Sym>, &'static str> {
        if self.mode != Mode::Rounds {
            return Err("the world is ranked by strata, not rounds");
        }
        let lats: Vec<Sym> = self.lat.cell_rels().collect();
        let dom_edges: Vec<(Sym, Sym)> = self.lat.subs().flat_map(|(p, x)| x.reads.iter().map(move |b| (p, *b))).collect();
        let peel = peel_rounds(&self.rules, &self.v, &lats, &dom_edges, &HashSet::new());
        if peel.stalled {
            return Err("the program is ranked only by its data, or not at all");
        }
        let round: HashMap<Sym, u32> = peel.round.iter().map(|(k, v)| (*k, *v as u32)).collect();
        let moved: HashSet<Sym> = self.round_of.keys().chain(round.keys()).copied().filter(|k| self.round_of.get(k).unwrap_or(&0) != round.get(k).unwrap_or(&0)).collect();
        self.round_of = round;
        self.derived_rels = self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next).map(|r| r.clause.head.rel).collect();
        Ok(moved)
    }

    /// A WORLD OPENED EVALUATED (`crate::image`) holds what the evaluation derived but not what it ranked: the rounds are
    /// peeled again from the program. What the image does not carry leaves the world to be evaluated again: a program
    /// ranked only by its data, the cells of a lattice, and the firings a sealed world solves again for `why`.
    pub fn after_open(&mut self, lattices: Vec<super::Tok>) {
        if self.store.dirty {
            return;
        }
        self.note_whole();
        self.round_of.clear();
        if self.rerank().is_err() || !self.lat.restore_lattices(&self.h, &mut self.store, lattices) {
            self.store.dirty = true;
        } else {
            self.restore_cells();
        }
    }

    /// A sealed world solves a firing again for `why` and finds each aggregate's cells by correlation, as the
    /// evaluation listed them (`agg_memo`): the cells the store holds, by the correlation their key carries.
    pub(super) fn restore_cells(&mut self) {
        self.restore_cells_of(None);
    }

    /// The same for the cells of `rules` alone: a full pass that kept them did not fire them (engine/layer.rs).
    pub(super) fn restore_cells_of(&mut self, rules: Option<&FxSet<Sym>>) {
        let mut by: HashMap<super::datastrat::AggKey, Vec<CellId>> = HashMap::new();
        for c in self.store.live_cells() {
            let r = self.store.cell(c);
            let CellOwner::Body { rule, at } = r.owner;
            if rules.is_some_and(|rs| !rs.contains(&rule)) {
                continue;
            }
            let Some(plan) = self.agg_plans.get(&(rule, at)).filter(|p| p.op != AggOp::AtLeast) else { continue };
            let corr: Box<[Term]> = plan.corr.iter().map(|i| r.key[*i]).collect();
            by.entry((rule, at, corr)).or_default().push(c);
        }
        for (mk, cs) in by {
            self.memo.agg_memo.insert(mk, self.cells_by_key(cs).into());
        }
    }

    /// The reasons a delta or an addition is not worked out that hold of the world alone, whatever the change.
    pub(super) fn world_refusals(&self) -> Vec<&'static str> {
        let mut out = Vec::new();
        if self.well_founded {
            out.push("the world is evaluated well-founded");
        }
        if self.store.dirty {
            out.push("the world is not evaluated");
        }
        if self.store.partial_eval {
            out.push("a wall cut the evaluation");
        }
        if self.store.tick != 0 {
            out.push("a later tick");
        }
        out
    }

    /// WHY AN ADDITION IS NOT WORKED OUT for this world: every reason that holds, in a fixed order (empty where it is).
    fn addition_refusals(&mut self) -> Vec<&'static str> {
        let mut out = self.world_refusals();
        if brk!("add_seal_hole_refused" => self.store.rel_count(self.v.hole); self.holes_beyond_faults()) > 0 {
            out.push("the world holds a hole or reads a shrug");
        }
        if !self.demand.rels.is_empty() && self.lat.has_cells() {
            out.push("a world with a lattice holds a relation answered on demand");
        }
        let ledgers = [
            self.v.agg_cell,
            self.v.agg_member,
            self.v.agg_member_prem,
            self.v.agg_sealed,
            self.v.lattice_member,
            self.v.lattice_member_prem,
            self.v.dominated_by,
        ];
        let ledger: HashSet<Sym> = ledgers.into_iter().collect();
        if self.rules.iter().any(|r| reads(r, &ledger).0) {
            out.push("a rule reads the ledger of cells, provenance or assertions");
        }
        if !self.ds.comps.is_empty() {
            out.push("a component is stratified by its data");
        }
        out
    }

    /// Add to an evaluated world the base facts `added` (already in the store) and the rules `new_rules` (already
    /// prepared), and bring it to the state a fresh evaluation would hold. `Err(reason)` leaves the store dirty or untouched; the caller evaluates again.
    pub fn add_delta(&mut self, added: &[FactId], new_rules: &[Sym], called: &[Sym]) -> Result<AddDelta, String> {
        let mut from: HashSet<Sym> = added.iter().map(|f| self.store.rec(*f).rel).collect();
        let fresh: HashSet<Sym> = new_rules.iter().copied().collect();
        from.extend(self.rules.iter().filter(|r| fresh.contains(&r.id) && r.clause.head.temporal != Temporal::Next).map(|r| r.clause.head.rel));
        let grown = self.grow(&from, &fresh);
        let why = self.addition_refusals();
        if !why.is_empty() {
            return Err(why.join("; "));
        }
        if let Err(h) = self.check_wants() {
            self.store.dirty = true;
            return Err(crate::describe(&h));
        }
        // a base fact of a closure walked whole: the two rules fire as written from now on, over the rows it walked
        if added.iter().any(|f| self.clo.closures.iter().any(|c| c.rel == self.store.rec(*f).rel)) {
            self.clo.closures_engage(&self.store);
        }
        let moved = if new_rules.is_empty() { HashSet::new() } else { self.rerank()? };
        let d = self.add_worked_out(added, &[], &fresh, &grown, &moved, called)?;
        // a closure declared by the addition lists its rows from now on
        if self.vc.any && !self.store.vlisted {
            self.vc.vpublish(&mut self.store);
        }
        Ok(d)
    }

    /// The indexes a retraction reads (`retract_set`): what cites each fact, and each row of a tree. Built once, kept
    /// by every firing since, and kept with a volume, so a world kept on disk is not indexed again by each delta.
    pub fn index_for_retraction(&mut self) {
        if !self.store.has_citers() {
            self.store.index_citers();
        }
        if self.vc.any && self.store.vciters.is_none() {
            self.vindex_citers();
        }
    }

    /// TAKE OUT OF AN EVALUATED WORLD the base facts `facts`, with `doomed` the kernel rows their loads wrote for them
    /// alone, and bring it to the state a fresh evaluation without them holds: DRed in one pass over the set, by the
    /// addition path's levels (`fine_levels`). What rests on a fact goes through the citer index, kept with every
    /// firing; each fact gone is derived again at its level where a rule still makes it; a fact gone for good makes a
    /// negation over it hold; a cell a member of which went is asked again at its key. Nothing is fired whole that
    /// the change does not reach. `Err(reason)` leaves the store dirty or untouched; the caller evaluates again.
    pub fn retract_set(&mut self, facts: &[FactId], doomed: &[FactId]) -> Result<AddDelta, String> {
        if facts.is_empty() {
            return Ok(AddDelta::default());
        }
        let mut why = self.addition_refusals();
        if facts.iter().any(|f| !self.store.alive(*f) || !self.store.rec(*f).base()) {
            why.push("not a base fact");
        }
        let from: HashSet<Sym> = facts.iter().map(|f| self.store.rec(*f).rel).collect();
        // an edge of a tree that goes is taken out of the tree at its level (`vretract_edges`)
        if brk!("retract_tree_refused" => from.iter().any(|r| self.vedges_reached(*r)); false) {
            why.push("the fact reaches the edges of a closure answered from its tree, which a retraction builds again");
        }
        if from.iter().any(|r| self.demand.on(*r)) {
            why.push("read on demand");
        }
        if self.prov.no_witness {
            why.push("the world keeps no witness, so nothing says which facts lose their last support");
        }
        if !why.is_empty() {
            why.dedup();
            return Err(why.join("; "));
        }
        let grown = self.grow(&from, &HashSet::new());
        let mut all: Vec<FactId> = facts.to_vec();
        all.extend(doomed.iter().copied().filter(|g| !facts.contains(g)));
        if !self.store.has_citers() {
            self.store.index_citers();
        }
        if self.vc.any && self.store.vciters.is_none() {
            self.vindex_citers();
        }
        self.store.remove_many(&all);
        self.add_worked_out(&[], facts, &HashSet::new(), &grown, &HashSet::new(), &[]).map_err(String::from)
    }

    /// `plan` solved as rule `r` solves its body, from each of `seeds`, the solutions in the order of the seeds.
    pub(super) fn solve_seeds_as(&mut self, r: &ERule, plan: &[BodyElem], seeds: Vec<Subst>) -> Result<Vec<Sol>, Halt> {
        let outer = self.cur_rule.replace(r.id);
        let was = std::mem::replace(&mut self.firing, true);
        let sols = self.solve_body_seeds(plan, seeds, 0, None, Some(r.id));
        self.firing = was;
        self.cur_rule = outer;
        sols
    }

    /// The relations `rules` read, at any depth, and what every rule into one of them reads, through each other.
    fn rels_below<'a>(&self, rules: impl Iterator<Item = &'a Rc<ERule>>) -> HashSet<Sym> {
        let first: Vec<Sym> = rules.flat_map(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel)).collect();
        reachable(first, |rel| self.rules.iter().filter(move |r| r.clause.head.rel == rel).flat_map(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel)).collect::<Vec<_>>())
    }

    /// The variables a fact binds in a negated premise of the fine path (`bind_neg`).
    fn neg_vars(&self, n: &NegAt) -> Vec<Sym> {
        let mut vs = Vec::new();
        for k in &n.binds {
            self.h.vars_of(n.lit.args[*k], &mut vs);
        }
        if n.persp {
            self.h.vars_of(n.lit.persp, &mut vs);
        }
        vs
    }

    /// The bindings a fact gives a negated premise of the fine path, where it matches the premise's pattern.
    fn bind_neg(&self, n: &NegAt, f: FactId) -> Option<Subst> {
        let rec = self.store.rec(f);
        let args = self.store.args(f);
        if args.len() != n.lit.args.len() {
            return None;
        }
        let mut s = Subst::new();
        if n.persp {
            s = unify(&self.h, n.lit.persp, Term::atom(rec.persp), &s)?;
        }
        for k in &n.binds {
            s = unify(&self.h, n.lit.args[*k], args[*k], &s)?;
        }
        Some(s)
    }

    /// The bindings `facts` give a negated premise, each once: facts that differ only where the premise reads nothing
    /// give the rule one start.
    fn neg_seeds(&self, n: &NegAt, facts: Vec<FactId>) -> Vec<Subst> {
        let mut seen: HashSet<Vec<(Sym, u64)>> = HashSet::new();
        facts.into_iter().filter_map(|g| self.bind_neg(n, g)).filter(|s| seen.insert(s.iter().map(|(v, t)| (*v, t.bits())).collect())).collect()
    }

    /// THE ROUNDS OF A LEVEL, over the news of every level below and then over what each round made, semi-naively. A
    /// rule whose news reaches a premise its plans cannot start from (solved in written order, such a premise is
    /// reached after the join of all those before it, for each news row) leaves the rounds: it fires whole once they
    /// are done, and the rounds go on over what that made, until nothing is new.
    fn level_rounds(&mut self, rules: &[Rc<ERule>], mut front: Front, (fired, made): (&HashSet<Sym>, Front)) -> Result<(), Halt> {
        let mut first = Some(made);
        let outer = std::mem::take(&mut self.live_front);
        let active = std::mem::replace(&mut self.active, rules.to_vec());
        let mut whole: Vec<Rc<ERule>> = Vec::new();
        let r = (|| -> Result<(), Halt> {
            loop {
                while !front.keys.is_empty() {
                    self.live_front = front.by_rel.keys().copied().collect();
                    self.cur_front = Front::default();
                    self.thr.round += 1;
                    self.memo.thr_fresh.clear();
                    let made = first.take();
                    for r in rules {
                        if whole.iter().any(|w| w.id == r.id) {
                            continue;
                        }
                        let front = match &made {
                            Some(m) if fired.contains(&r.id) => m,
                            _ => &front,
                        };
                        let at: Vec<(usize, usize)> = r.plan.iter().enumerate().filter_map(|(i, b)| match b {
                            BodyElem::Pos(l) => front.by_rel.get(&l.rel).map(|k| (i, k.len())),
                            _ => None,
                        }).collect();
                        if at.iter().any(|&(i, n)| i > 0 && self.delta_pick(r, Some(i), n).is_none() && !self.plannable(r, i)) {
                            whole.push(r.clone());
                            continue;
                        }
                        let t = std::time::Instant::now();
                        self.fire_in_round(r, front)?;
                        *self.cost.ns_by_rule.entry(r.id).or_insert(0) += t.elapsed().as_nanos() as u64;
                    }
                    front = std::mem::take(&mut self.cur_front);
                }
                if whole.is_empty() {
                    return Ok(());
                }
                for r in std::mem::take(&mut whole) {
                    let t = std::time::Instant::now();
                    let f = self.fire_rule(&r, None)?;
                    *self.cost.ns_by_rule.entry(r.id).or_insert(0) += t.elapsed().as_nanos() as u64;
                    merge_front(&mut front, f);
                }
                if front.keys.is_empty() {
                    return Ok(());
                }
            }
        })();
        self.live_front = outer;
        self.active = active;
        r
    }

    /// DRed's overdeletion: each of `seeds` (which lost a firing, and may have gone with it) goes whole, and so does
    /// every fact with a firing that cites one gone, through each other; a base fact stays and loses its firings, to
    /// be given them again.
    fn overdelete(&mut self, seeds: Vec<FactId>, over: &mut HashSet<FactId>, over_base: &mut HashSet<FactId>, d: &mut AddDelta) {
        // the citer index, made when something first goes and kept by every firing added since
        if !seeds.is_empty() && !self.store.has_citers() {
            self.store.index_citers();
        }
        let lost: HashSet<FactId> = seeds.iter().copied().collect();
        let comp = self.rel_components();
        // (kept, and queued since by nothing: a copy queued before it was judged)
        let mut judged: HashSet<FactId> = HashSet::new();
        // lowest level first: a fact is judged once everything below it that goes has gone
        let mut queue: std::collections::BinaryHeap<std::cmp::Reverse<(i64, FactId)>> =
            seeds.into_iter().map(|x| std::cmp::Reverse((self.rel_level(self.store.rec(x).rel), x))).collect();
        while let Some(std::cmp::Reverse((lv, x))) = queue.pop() {
            if over.contains(&x) || over_base.contains(&x) || judged.contains(&x) {
                continue;
            }
            if self.store.rec(x).base() {
                self.withdraw_unswept(&[x], |_, _| true);
                over_base.insert(x);
                continue;
            }
            if !self.store.alive(x) && !brk!("add_lost_unseeded" => false; lost.contains(&x)) {
                continue;
            }
            // A FACT A FIRING STILL HOLDS UP STAYS: the firings that cite what went are withdrawn, and where one is
            // left whose premises are facts that stand, none of a relation recursive with the fact's, the fact keeps
            // it and nothing above it moves. (A premise recursive with it may rest on the fact through a cycle, and a
            // cell or a row may be replaced: the fact goes whole then, and is derived again. A premise that goes after
            // this, of the same level, brings the fact back here: `judged` lets it be judged again.)
            if self.store.alive(x) {
                let store = &self.store;
                let gone = |p: &PremRef| matches!(p, PremRef::Fact(g) if over.contains(g) || over_base.contains(g) || !store.alive(*g));
                let firings = store.firings(x);
                let own = comp.get(&store.rec(x).rel);
                let below = |g: FactId| {
                    let rel = store.rec(g).rel;
                    self.rel_level(rel) < lv || brk!("overdelete_kept_by_own_component" => true; comp.get(&rel) != own || own.is_none())
                };
                let stands = |ps: &[PremRef]| ps.iter().all(|p| match p {
                    PremRef::Fact(g) => store.alive(*g) && !over.contains(g) && !over_base.contains(g) && below(*g),
                    PremRef::Neg(_) | PremRef::Bi(_) => true,
                    _ => false,
                });
                if firings.iter().any(|(_, _, ps)| !ps.iter().any(gone) && stands(ps)) {
                    let dead: HashSet<FactId> = firings.iter().flat_map(|(_, _, ps)| ps.iter()).filter(|p| gone(p)).filter_map(|p| if let PremRef::Fact(g) = p { Some(*g) } else { None }).collect();
                    self.withdraw_unswept(&[x], |_, ps| ps.iter().any(|p| matches!(p, PremRef::Fact(g) if dead.contains(g))));
                    d.kept += 1;
                    self.add.kept.entry(x).or_default().extend(dead);
                    judged.insert(x);
                    continue;
                }
            }
            self.withdraw_unswept(&[x], |_, _| true);
            if self.store.alive(x) {
                // (its id leaves the runs once all have gone: a sweep for each fact reads its relation's runs whole)
                self.store.retire(x);
            }
            over.insert(x);
            d.overdeleted += 1;
            // (the index lists a firing withdrawn since: a citer is followed where a firing of it still cites the fact)
            for y in self.store.citers_one(x) {
                if self.store.alive(y) && !over.contains(&y) && brk!("add_stale_citer_followed" => true; self.store.cites(y, PremRef::Fact(x))) {
                    if brk!("overdelete_judged_kept" => false; true) {
                        judged.remove(&y);
                    }
                    queue.push(std::cmp::Reverse((self.rel_level(self.store.rec(y).rel), y)));
                }
            }
        }
        self.store.sweep();
    }

    /// The strongly connected components of the relations, each relation's by the rules that conclude it reading
    /// another (under a negation and an aggregate too): two relations in one may rest on each other.
    fn rel_components(&self) -> HashMap<Sym, usize> {
        let mut next: HashMap<Sym, Vec<Sym>> = HashMap::new();
        for r in self.rules.iter() {
            let reads = next.entry(r.clause.head.rel).or_default();
            for l in r.clause.body.iter().flat_map(|b| b.lits_deep()) {
                reads.push(l.rel);
            }
        }
        rel_scc(&next).0
    }

    /// THE PART OF AN ADDITION THAT IS KEPT, level by level (DRed over the levels of a stratified program): at each
    /// level, a rule that reads what grew under a negation loses the firings a new fact now blocks (each new fact
    /// bound to the negated premise, the premises over what grew dropped, the rest solved: what the old firing was);
    /// a fact that lost a firing goes whole, and what rests on it, through each other, at any level above; each fact
    /// gone at this level is derived again from what holds (its rules solved with the fact bound to their head); a
    /// fact gone for good below makes a negation over it hold (the rule solved with it bound to the premise); and the
    /// news of every level below, and what this level made, fires the rules of the level semi-naively.
    fn fine_levels(&mut self, added: &[FactId], removed: &[FactId], plan: &Plan, grown: &HashSet<Sym>, d: &mut AddDelta) -> Result<(), Halt> {
        self.add.kept.clear();
        self.heights_kept.clear();
        let mut levels: std::collections::BTreeSet<i64> = plan.mono.iter().chain(&plan.new_plain).chain(&plan.recompute).chain(plan.negs.iter().map(|(r, _)| r)).map(|r| self.rule_level(r)).collect();
        levels.extend(grown.iter().filter(|r| !plan.dirty.contains(r)).map(|r| self.rel_level(*r)));
        let mut st = self.fine_start(added, plan, removed);
        self.retract_removed(removed, &mut st, d);
        st.lvl = plan.mono.iter().chain(&plan.new_plain).chain(&plan.recompute).chain(plan.negs.iter().map(|(r, _)| r)).map(|r| (r.id, self.rule_level(r))).collect();
        for lv in levels {
            self.fine_level(lv, plan, &mut st, d)?;
        }
        self.settle_thresholds(&st.news)
    }

    /// The state a fine addition starts from: the news of the added facts, the rules by head that fire here (those of
    /// `skip` aside), and the heights and the citer index it reads.
    fn fine_start(&mut self, added: &[FactId], plan: &Plan, removed: &[FactId]) -> Fine {
        let mut by_head: HashMap<Sym, Vec<Rc<ERule>>> = HashMap::new();
        for r in self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next && r.safe && !plan.skip.contains(&r.id)) {
            by_head.entry(r.clause.head.rel).or_default().push(r.clone());
        }
        if !removed.is_empty() && !self.store.has_citers() {
            self.store.index_citers();
        }
        let mut news = Front::default();
        for f in added {
            news.note(self.store.rec(*f).rel, *f);
        }
        // a base fact put over a derived one stands lower now, and so may what rests on it
        self.add.heights = self.rels_below(self.rules.iter().filter(|r| plan.keyable.contains(&r.id)));
        self.add.refired = added.iter().copied().filter(|f| self.store.support_count(*f) > 0).collect();
        self.add.mark = self.store.len_ids();
        Fine {
            news,
            touched: HashSet::new(),
            over: HashSet::new(),
            over_base: HashSet::new(),
            gone: HashMap::new(),
            lvl: HashMap::new(),
            by_head,
            retracting: !removed.is_empty(),
        }
    }

    /// A RETRACTION is the base facts `removed` gone (the caller took them out): each is overdeleted, and what rests on it
    /// through each other, and at its level derived again where a rule still makes it.
    fn retract_removed(&mut self, removed: &[FactId], st: &mut Fine, d: &mut AddDelta) {
        if removed.is_empty() {
            return;
        }
        let mut seeds: Vec<FactId> = std::mem::take(&mut self.add.retract_seeds);
        for &f in removed {
            st.over.insert(f);
            if brk!("retract_set_unpropagated" => false; true) {
                seeds.extend(self.store.citers_one(f).into_iter().filter(|y| self.store.alive(*y) && self.store.cites(*y, PremRef::Fact(f))));
            }
        }
        if brk!("retract_rederive_all" => true; false) {
            seeds.extend(self.store.live_ids().into_iter().filter(|f| !self.store.rec(*f).base()));
        }
        self.overdelete(seeds, &mut st.over, &mut st.over_base, d);
    }

    /// One level, in the order the fine path settles it: the firings a new fact blocks, the rules derived whole, the
    /// rounds of what is fired, and then what was gone at the level is derived again.
    fn fine_level(&mut self, lv: i64, plan: &Plan, st: &mut Fine, d: &mut AddDelta) -> Result<(), Halt> {
        let rules = self.level_rules(lv, plan, st);
        self.block_firings(lv, plan, st, d)?;
        let level = self.level_whole(lv, plan, st, rules, d)?;
        self.fire_whole(&level, st, d)?;
        // (what this level withdrew is withdrawn: a fact derived again begins its chain anew, a level concludes only into its own relations)
        self.store.arrivals = Some(Vec::new());
        self.store.close_dup_window();
        self.store.open_dup_window();
        let r = self.rederive_gone(lv, plan, &level, st).and_then(|out| self.conclude_level(lv, plan, &level, st, out));
        let arrived = self.store.arrivals.take().unwrap_or_default();
        r?;
        self.settle_arrived(&arrived, &level, st, d);
        self.settle_gone(lv, st, d);
        Ok(())
    }

    /// The rules that fire at a level, sorted as the evaluation sorts them.
    fn level_rules(&self, lv: i64, plan: &Plan, st: &Fine) -> Vec<Rc<ERule>> {
        let mut rules: Vec<Rc<ERule>> = plan.mono.iter().chain(&plan.new_plain).chain(&plan.recompute).chain(plan.negs.iter().map(|(r, _)| r)).filter(|r| fired_at(st, lv, r.id)).cloned().collect();
        rules.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        rules
    }

    /// The firings a new fact blocks at a level: a negation that a fact of the news now satisfies loses the firings it
    /// held, and what rested on them goes whole, to be derived again.
    fn block_firings(&mut self, lv: i64, plan: &Plan, st: &mut Fine, d: &mut AddDelta) -> Result<(), Halt> {
        let mut seeds: Vec<FactId> = Vec::new();
        for (r, ns) in plan.negs.iter().filter(|(r, _)| fired_at(st, lv, r.id)) {
            let dropped: Vec<usize> = ns.iter().filter(|n| st.news.by_rel.contains_key(&n.lit.rel)).map(|n| n.at).collect();
            if dropped.is_empty() {
                continue;
            }
            let keep: Vec<usize> = (0..r.plan.len()).filter(|i| !dropped.contains(i)).collect();
            for n in ns.iter().filter(|n| dropped.contains(&n.at)) {
                let mut blockers: Vec<FactId> = st.news.by_rel[&n.lit.rel].iter().copied().collect();
                blockers.sort_unstable();
                let pre = self.neg_vars(n);
                let order = self.bound_order(r, &keep, &pre);
                let starts = self.neg_seeds(n, blockers);
                for sol in self.solve_bound(r, &keep, order.as_deref(), starts)? {
                    let mut prems = sol.prems.clone();
                    for j in &dropped {
                        let BodyElem::Neg(l) = &r.plan[*j] else { unreachable!() };
                        let k = self.anon_lit_key(l, &sol.s);
                        prems.insert(*j, PremRef::Neg(self.h.intern(&k)));
                    }
                    let head = &r.clause.head;
                    let persp = walk(&self.h, head.persp, &sol.s);
                    let args: Vec<Term> = head.args.iter().map(|a| resolve(&mut self.h, *a, &sol.s)).collect();
                    let Some(id) = persp.as_atom().and_then(|p| self.store.get(head.rel, p, &args)) else { continue };
                    if self.store.firings(id).iter().any(|(x, _, ps)| *x == r.id && *ps == prems) {
                        self.withdraw_firings(&[id], |x, ps| x == r.id && ps == prems.as_slice());
                        seeds.push(id);
                    }
                }
            }
        }
        // what lost a firing goes whole (it may have gone with that firing already), and what rests on it, through each other
        self.overdelete(seeds, &mut st.over, &mut st.over_base, d);
        Ok(())
    }

    /// The rules of a level that are derived whole. A reset aggregate that the change can ask by key is asked so, where
    /// what changed falls in; the rest is withdrawn whole with the relations it concludes, and fired again.
    fn level_whole(&mut self, lv: i64, plan: &Plan, st: &mut Fine, rules: Vec<Rc<ERule>>, d: &mut AddDelta) -> Result<LevelRun, Halt> {
        // A RELATION A RESET RULE CONCLUDES IS DERIVED AGAIN WHOLE at its level (its cells sealed again): its facts go,
        // and every rule into it fires again over what holds; a fact that does not come back at once is taken as
        // lost, and what rests on it goes too (a fact of the relation that comes back keeps its record, and so what
        // cites it). An aggregate rule alone withdraws its own firings and fires again: what other rules conclude into
        // its head stands.
        let (own, wide): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = plan.recompute.iter().filter(|r| fired_at(st, lv, r.id)).cloned().partition(|r| r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.demand_strict);
        let heads: HashSet<Sym> = wide.iter().map(|r| r.clause.head.rel).collect();
        let own = self.settle_keyed(lv, plan, st, own, &wide, &heads, d)?;
        let here: Vec<Rc<ERule>> = own.iter().chain(&wide).cloned().collect();
        let (held, into) = self.withdraw_whole(&own, &heads, st);
        Ok(LevelRun { rules, held, heads, into, here })
    }

    /// The reset aggregates of a level are asked again by key where their rule can be (`agg_keys`), and only at the
    /// correlations what changed falls in, once every rule reset here that concludes what it reads was asked before it.
    /// The rest are returned, to be derived whole.
    fn settle_keyed(&mut self, lv: i64, plan: &Plan, st: &mut Fine, own: Vec<Rc<ERule>>, wide: &[Rc<ERule>], heads: &HashSet<Sym>, d: &mut AddDelta) -> Result<Vec<Rc<ERule>>, Halt> {
        let concluded: Vec<Sym> = own.iter().chain(wide).map(|r| r.clause.head.rel).collect();
        let mut by_key: HashSet<Sym> = HashSet::new();
        let mut own_whole: Vec<Rc<ERule>> = Vec::new();
        let mut pending: Vec<Rc<ERule>> = own
            .into_iter()
            .filter(|r| {
                let alone = plan.keyable.contains(&r.id) && !heads.contains(&r.clause.head.rel) && concluded.iter().filter(|h| **h == r.clause.head.rel).count() == 1;
                if !alone {
                    own_whole.push(r.clone());
                }
                alone
            })
            .collect();
        loop {
            let below: HashSet<Sym> = concluded.iter().copied().filter(|h| !by_key.contains(h)).collect();
            let Some(i) = pending.iter().position(|r| !reads(r, &below.iter().copied().filter(|h| *h != r.clause.head.rel).collect()).0) else { break };
            let r = pending.remove(i);
            let changed: HashSet<FactId> = st.over.iter().chain(&st.over_base).chain(&st.touched).copied().collect();
            match self.agg_keys(&r, lv, &st.news, &changed) {
                Some(seeds) => {
                    self.refire_keyed(&r, seeds, &mut st.news, &mut st.over, &mut st.over_base, &mut st.touched, d)?;
                    by_key.insert(r.clause.head.rel);
                }
                None => own_whole.push(r),
            }
        }
        own_whole.extend(pending);
        Ok(own_whole)
    }

    /// What a level derives whole is withdrawn first: the firings of its own aggregates, then every fact of its heads
    /// (`held`), and the rules into those heads, which fire again (`into`).
    fn withdraw_whole(&mut self, own: &[Rc<ERule>], heads: &HashSet<Sym>, st: &Fine) -> (HashSet<FactId>, Vec<Rc<ERule>>) {
        let mut held: HashSet<FactId> = HashSet::new();
        let mut into: Vec<Rc<ERule>> = own.to_vec();
        for r in own {
            for id in self.store.rel_all(&self.h, r.clause.head.rel) {
                if self.store.fired_by(id, r.id) {
                    held.insert(id);
                    self.withdraw_firings(&[id], |x, _| x == r.id);
                    if self.store.alive(id) && !self.store.rec(id).base() && self.store.support_count(id) == 0 {
                        self.store.remove_many(&[id]);
                    }
                }
            }
        }
        for h in heads {
            for id in self.store.rel_all(&self.h, *h) {
                held.insert(id);
                self.withdraw_firings(&[id], |_, _| true);
                if self.store.alive(id) && !self.store.rec(id).base() {
                    self.store.remove_many(&[id]);
                }
            }
            into.extend(st.by_head.get(h).into_iter().flatten().cloned());
        }
        (held, into)
    }

    /// The rules derived whole fire over what holds, and what they conclude joins the news. A threshold reached stays
    /// open, and closes with the level (after its rounds), on every member the level makes, as an evaluation closes it.
    fn fire_whole(&mut self, level: &LevelRun, st: &mut Fine, d: &mut AddDelta) -> Result<(), Halt> {
        if level.here.is_empty() {
            return Ok(());
        }
        self.memo.height_memo.clear();
        let ids: HashSet<Sym> = level.here.iter().map(|r| r.id).collect();
        d.stacked_cells += self.reset_cells(&ids);
        self.store.arrivals = Some(Vec::new());
        let r = if brk!("add_threshold_closed_early" => true; false) {
            self.refire(&level.into, &[])
        } else {
            let saved = std::mem::take(&mut self.active);
            let (strat, plain): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = level.into.iter().cloned().partition(|r| r.has_neg || r.has_agg || !r.lattice_outer.is_empty() || r.demand_strict);
            let r = self.activate(&plain).and_then(|_| self.activate(&strat));
            self.active = saved;
            r
        };
        let came = self.store.arrivals.take().unwrap_or_default();
        r?;
        let derived_by = self.v.derived_by;
        for id in came {
            if !level.held.contains(&id) && self.store.alive(id) && self.store.rec(id).rel != derived_by {
                st.news.note(self.store.rec(id).rel, id);
            }
        }
        let lost: Vec<FactId> = level.held.iter().copied().filter(|id| !self.store.alive(*id)).collect();
        self.overdelete(lost, &mut st.over, &mut st.over_base, d);
        st.touched.extend(level.held.iter().copied());
        Ok(())
    }

    /// The facts gone at a level are derived again from what holds, until nothing more comes back; each that stands
    /// takes every firing it has, once all that came back stands. Returns what was concluded.
    fn rederive_gone(&mut self, lv: i64, plan: &Plan, level: &LevelRun, st: &mut Fine) -> Result<Front, Halt> {
        let mut again: Vec<FactId> = st
            .over
            .iter()
            .chain(st.over_base.iter())
            .copied()
            .filter(|x| {
                let rec = self.store.rec(*x);
                self.rel_level(rec.rel) == lv && !plan.dirty.contains(&rec.rel) && !level.heads.contains(&rec.rel) && (rec.base() || !self.store.alive(*x))
            })
            .collect();
        again.sort_unstable();
        let mut out = Front::default();
        let mut orders: HashMap<Sym, Option<Vec<usize>>> = HashMap::new();
        // until nothing more comes back: a fact of a recursion may rest on one derived again after it
        let mut pending = if brk!("retract_unrederived" => st.retracting; false) { Vec::new() } else { again.clone() };
        loop {
            let mut still: Vec<FactId> = Vec::new();
            let mut came = false;
            for x in pending {
                let was = self.store.alive(x) && !self.store.rec(x).base();
                self.rederive_one(x, &st.by_head, &mut orders, &mut out)?;
                if !self.store.alive(x) {
                    still.push(x);
                } else if !was && !self.store.rec(x).base() {
                    came = true;
                }
            }
            pending = still;
            if !came || pending.is_empty() || brk!("rederive_once" => true; false) {
                break;
            }
        }
        // and each that stands takes every firing it has, now that all that came back stands
        // (and each kept for a firing that stood, where a premise of a firing it lost came back)
        let kept_here: Vec<FactId> = {
            let store = &self.store;
            let mut v: Vec<FactId> = self
                .add
                .kept
                .iter()
                .filter(|(x, lost)| store.alive(**x) && self.rel_level(store.rec(**x).rel) == lv && lost.iter().any(|g| store.alive(*g)))
                .map(|(x, _)| *x)
                .collect();
            v.sort_unstable();
            v
        };
        if (again.len() > 1 || !kept_here.is_empty()) && !brk!("retract_unrederived" => st.retracting; false) {
            for x in again.iter().copied().filter(|x| self.store.alive(*x)).chain(kept_here).collect::<Vec<_>>() {
                self.rederive_one(x, &st.by_head, &mut orders, &mut out)?;
            }
        }
        Ok(out)
    }

    /// The rest of a level's rounds: a fact gone for good makes its negations hold, the added rules fire whole, and the
    /// news of the level fires the rules at it semi-naively; then the thresholds below close.
    fn conclude_level(&mut self, lv: i64, plan: &Plan, level: &LevelRun, st: &mut Fine, mut out: Front) -> Result<(), Halt> {
        // a fact gone for good below makes a negation over it hold
        for (r, ns) in plan.negs.iter().filter(|(r, _)| fired_at(st, lv, r.id)) {
            for n in ns {
                let mut freed: Vec<FactId> = st.gone.get(&n.lit.rel).cloned().unwrap_or_default();
                freed.sort_unstable();
                let (pre, all) = (self.neg_vars(n), (0..r.plan.len()).collect::<Vec<usize>>());
                let order = self.bound_order(r, &all, &pre);
                let seeds = self.neg_seeds(n, freed);
                for sol in self.solve_bound(r, &all, order.as_deref(), seeds)? {
                    self.conclude(r, sol, &mut out)?;
                }
            }
        }
        self.active = level.rules.clone();
        // a rule fired whole has read every fact that stands: its first round reads only what the firings made
        let mut whole: HashSet<Sym> = HashSet::new();
        for r in plan.new_plain.iter().filter(|r| fired_at(st, lv, r.id)) {
            let f = self.fire_rule(r, None)?;
            merge_front(&mut out, f);
            whole.insert(r.id);
        }
        let mut front = st.news.clone();
        for id in self.store.arrivals.clone().unwrap_or_default() {
            if self.store.alive(id) {
                front.note(self.store.rec(id).rel, id);
            }
        }
        merge_front(&mut front, out.clone());
        self.level_rounds(&level.rules, front, (&whole, out))?;
        // a threshold reached at this level closes once what it reads is closed, as an evaluation closes it
        self.close_thresholds_below(lv.saturating_add(1), true)
    }

    /// The facts that arrived in a level's rounds join the news, unless they stand as this level derived them; a fact
    /// derived again counts as rederived.
    fn settle_arrived(&mut self, arrived: &[FactId], level: &LevelRun, st: &mut Fine, d: &mut AddDelta) {
        for &id in arrived {
            let rel = self.store.rec(id).rel;
            if !self.store.alive(id) || rel == self.v.derived_by {
                continue;
            }
            if st.over.contains(&id) || level.held.contains(&id) {
                d.rederived += st.over.contains(&id) as usize;
            } else {
                st.news.note(rel, id);
            }
        }
    }

    /// The facts a level let go are recorded by relation for the levels above. An edge of a tree gone for good leaves the
    /// tree: its tree is built again, and what cited a row of it that no longer holds goes, at the levels above.
    fn settle_gone(&mut self, lv: i64, st: &mut Fine, d: &mut AddDelta) {
        let mut edges_gone: Vec<FactId> = Vec::new();
        for x in &st.over {
            let rel = self.store.rec(*x).rel;
            if self.rel_level(rel) == lv && !self.store.alive(*x) {
                st.gone.entry(rel).or_default().push(*x);
                edges_gone.push(*x);
            }
        }
        if st.retracting && self.vc.any {
            edges_gone.sort_unstable();
            let (seeds, touched) = self.vretract_edges(&edges_gone);
            self.vc.vretract_done(&self.store, &touched);
            self.overdelete(seeds, &mut st.over, &mut st.over_base, d);
        }
    }

    /// The thresholds left open after the levels close, and the news that closing makes is what the window carries on.
    fn settle_thresholds(&mut self, news: &Front) -> Result<(), Halt> {
        // (a threshold closed after the levels makes facts the news does not hold)
        self.add.fresh = self.memo.thr_open.is_empty().then(|| news.keys.iter().copied().collect());
        while !self.memo.thr_open.is_empty() {
            let open = self.memo.thr_open.len();
            self.close_thresholds_below(i64::MAX, true)?;
            if self.memo.thr_open.len() >= open {
                break;
            }
        }
        Ok(())
    }

    /// A fact gone (or a base fact that lost its firings) derived again from what holds: every rule into its relation
    /// solved with it bound to the head, each solution concluded.
    fn rederive_one(&mut self, x: FactId, by_head: &HashMap<Sym, Vec<Rc<ERule>>>, orders: &mut HashMap<Sym, Option<Vec<usize>>>, out: &mut Front) -> Result<(), Halt> {
        let (rel, persp) = (self.store.rec(x).rel, self.store.rec(x).persp);
        let args = self.store.args(x).to_vec();
        for r in by_head.get(&rel).cloned().unwrap_or_default() {
            let mut s0 = Some(Subst::new());
            s0 = s0.and_then(|s| unify(&self.h, r.clause.head.persp, Term::atom(persp), &s));
            for (a, b) in r.clause.head.args.iter().zip(&args) {
                s0 = s0.and_then(|s| unify(&self.h, *a, *b, &s));
            }
            let Some(s0) = s0.filter(|_| r.clause.head.args.len() == args.len()) else { continue };
            let all: Vec<usize> = (0..r.plan.len()).collect();
            if let std::collections::hash_map::Entry::Vacant(e) = orders.entry(r.id) {
                let mut pre = Vec::new();
                for a in r.clause.head.args.iter().chain([&r.clause.head.persp]) {
                    self.h.vars_of(*a, &mut pre);
                }
                let o = self.bound_order(&r, &all, &pre);
                e.insert(o);
            }
            for sol in self.solve_bound(&r, &all, orders[&r.id].clone().as_deref(), vec![s0])? {
                // (a fact brought back cuts the window as it begins its chain anew)
                self.store.window_chain(x);
                self.conclude(&r, sol, out)?;
            }
        }
        Ok(())
    }

    /// THE CORRELATIONS AN AGGREGATE RULE IS ASKED AGAIN AT: the keys of its cells that what changed falls in, each as the
    /// binding the rule is solved from. None, and the rule is sealed again whole, where a change names no key (a premise
    /// it matches leaves a variable of the key free) or the key is not the head's. A fact below that may stand lower than
    /// it did names the keys of the members resting on it (a cell lists its members' heights).
    fn agg_keys(&mut self, r: &ERule, lv: i64, news: &Front, changed: &HashSet<FactId>) -> Option<Vec<Subst>> {
        if !self.ds.elems.is_empty() {
            return None;
        }
        let lower: Vec<FactId> = self.add.refired.iter().copied().filter(|f| !changed.contains(f) && self.rel_level(self.store.rec(*f).rel) < lv).collect();
        let mut key: Option<Vec<Sym>> = None;
        let mut lits: Vec<&Lit> = Vec::new();
        for b in &r.plan {
            match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) => lits.push(l),
                BodyElem::Agg(a) => {
                    let plan = self.agg_plans.get(&(r.id, a.at))?;
                    // a holistic group shared across its percent or subject is asked again at the correlation less it
                    let subject: Vec<Sym> = match self.hol_share_key(r.id, a, plan, &[]) {
                        Some(_) => a.vals[..a.params()].iter().filter_map(|t| match t.kind() { TermK::Var(v) => Some(v), _ => None }).collect(),
                        None => Vec::new(),
                    };
                    let mut vs: Vec<Sym> = plan.corr.iter().map(|i| a.shared[*i]).filter(|v| !subject.contains(v)).collect();
                    vs.sort_unstable();
                    if vs.is_empty() || key.as_ref().is_some_and(|k| *k != vs) {
                        return None;
                    }
                    key = Some(vs);
                    for x in &a.body {
                        match x {
                            BodyElem::Pos(l) | BodyElem::Neg(l) => lits.push(l),
                            BodyElem::Agg(_) => return None,
                            BodyElem::Bi { .. } => {}
                        }
                    }
                }
                BodyElem::Bi { .. } => {}
            }
        }
        let key = key?;
        let rels: HashSet<Sym> = lits.iter().map(|l| l.rel).collect();
        if lits.iter().any(|l| l.temporal != Temporal::Now || self.lat.is_cell(l.rel)) || key.iter().any(|v| !r.clause.head.args.contains(&Term::var(*v))) || self.vc.vclosures.iter().any(|c| rels.contains(&c.rel)) {
            return None;
        }
        let mut facts: Vec<FactId> = news.by_rel.iter().filter(|(rel, _)| rels.contains(rel)).flat_map(|(_, ids)| ids.iter().copied()).collect();
        facts.extend(changed.iter().copied().filter(|f| rels.contains(&self.store.rec(*f).rel)));
        if !lower.is_empty() && brk!("add_lower_unfollowed" => false; true) {
            facts.extend(self.resting_on(r, lower).into_iter().filter(|f| rels.contains(&self.store.rec(*f).rel)));
        }
        facts.sort_unstable();
        facts.dedup();
        let mut keys: Vec<Vec<Term>> = Vec::new();
        let mut seen: HashSet<Vec<Term>> = HashSet::new();
        for f in facts {
            let (rel, persp) = (self.store.rec(f).rel, self.store.rec(f).persp);
            let args = self.store.args(f).to_vec();
            for l in lits.iter().filter(|l| l.rel == rel && l.args.len() == args.len()) {
                let mut s = unify(&self.h, l.persp, Term::atom(persp), &Subst::new());
                for (a, b) in l.args.iter().zip(&args) {
                    s = s.and_then(|s| unify(&self.h, *a, *b, &s));
                }
                let Some(s) = s else { continue };
                let k: Vec<Term> = key.iter().map(|v| resolve(&mut self.h, Term::var(*v), &s)).collect();
                if k.iter().any(|t| !self.h.is_ground(*t)) {
                    return None;
                }
                if seen.insert(k.clone()) {
                    keys.push(k);
                }
            }
        }
        Some(keys.into_iter().map(|k| key.iter().zip(k).fold(Subst::new(), |s, (v, t)| unify(&self.h, Term::var(*v), t, &s).expect("a free variable binds"))).collect())
    }

    /// The facts below `r` that rest on `from`, through each other: where one of `from` stands lower, only these may.
    fn resting_on(&mut self, r: &ERule, from: Vec<FactId>) -> HashSet<FactId> {
        if !self.store.has_citers() {
            self.store.index_citers();
        }
        let below = self.rels_below(self.rules.iter().filter(|x| x.id == r.id));
        let mut seen: HashSet<FactId> = HashSet::new();
        let mut todo = from;
        while let Some(f) = todo.pop() {
            if seen.insert(f) {
                todo.extend(self.store.citers_one(f).into_iter().filter(|c| self.store.alive(*c) && below.contains(&self.store.rec(*c).rel)));
            }
        }
        seen
    }

    /// `agg_keys`'s rule at its keys: what it concluded there withdrawn, the cells of those correlations unsealed, and the
    /// rule solved from each key; what it makes new is news, and what it no longer makes goes with what rests on it.
    #[allow(clippy::too_many_arguments)]
    fn refire_keyed(&mut self, r: &Rc<ERule>, seeds: Vec<Subst>, news: &mut Front, over: &mut HashSet<FactId>, over_base: &mut HashSet<FactId>, touched: &mut HashSet<FactId>, d: &mut AddDelta) -> Result<(), Halt> {
        let head = r.clause.head.clone();
        let persp = head.persp.as_atom();
        let mut held: HashSet<FactId> = HashSet::new();
        let mut cells: Vec<CellId> = Vec::new();
        for s in &seeds {
            let mut pos: Vec<usize> = Vec::new();
            let mut vals: Vec<Term> = Vec::new();
            for (j, a) in head.args.iter().enumerate() {
                let t = resolve(&mut self.h, *a, s);
                if self.h.is_ground(t) {
                    pos.push(j);
                    vals.push(t);
                }
            }
            let cands = match self.store.arg_matches(&self.h, head.rel, persp, head.args.len(), &pos, &vals) {
                Some(c) => c,
                None => self.store.rel_all(&self.h, head.rel),
            };
            for id in cands {
                if !self.store.alive(id) || pos.iter().zip(&vals).any(|(j, v)| self.store.args(id)[*j] != *v) || !self.store.fired_by(id, r.id) || !held.insert(id) {
                    continue;
                }
                self.withdraw_firings(&[id], |x, _| x == r.id);
                if self.store.alive(id) && !self.store.rec(id).base() && self.store.support_count(id) == 0 {
                    self.store.remove_many(&[id]);
                }
            }
            for b in &r.plan {
                let BodyElem::Agg(a) = b else { continue };
                let plan = self.agg_plans[&(r.id, a.at)].clone();
                let corr: Box<[Term]> = plan.corr.iter().map(|i| resolve(&mut self.h, Term::var(a.shared[*i]), s)).collect();
                if corr.iter().all(|t| self.h.is_ground(*t)) {
                    let mk = (r.id, a.at, corr);
                    if let Some(cs) = self.memo.agg_memo.remove(&mk) {
                        cells.extend(cs.iter().copied());
                    }
                    self.memo.reach_memo.remove(&mk);
                    self.cells.agg_opened.remove(&mk);
                    continue;
                }
                // a shared holistic group: every percent or subject of it, and the group
                let h = &self.h;
                let fits = |k: &super::datastrat::AggKey| k.0 == r.id && k.1 == a.at && k.2.len() == corr.len() && k.2.iter().zip(corr.iter()).all(|(x, p)| !h.is_ground(*p) || x == p);
                let mine: Vec<super::datastrat::AggKey> = self.memo.agg_memo.keys().filter(|k| fits(k)).cloned().collect();
                for mk in mine {
                    if let Some(cs) = self.memo.agg_memo.remove(&mk) {
                        cells.extend(cs.iter().copied());
                    }
                }
                self.memo.reach_memo.retain(|k, _| !fits(k));
                self.cells.agg_opened.retain(|k| !fits(k));
                let base: Box<[Term]> = corr.iter().copied().filter(|t| h.is_ground(*t)).collect();
                if brk!("add_hol_shared_kept" => false; true) {
                    self.memo.hol_shared.remove(&(r.id, a.at, base));
                }
            }
        }
        self.kill_cells(&cells);
        d.stacked_cells += cells.len();
        // the heights of what lies below the level reached stand: those found before are read again
        let lv = self.rule_level(r);
        self.memo.height_memo = std::mem::take(&mut self.heights_kept);
        self.store.arrivals = Some(Vec::new());
        let saved = std::mem::replace(&mut self.active, vec![r.clone()]);
        let t = std::time::Instant::now();
        let res = (|| -> Result<(), Halt> {
            let mut front = Front::default();
            for s in seeds {
                let f = self.fire_rule_from(r, s, None)?;
                merge_front(&mut front, f);
            }
            self.propagate(front)
        })();
        *self.cost.ns_by_rule.entry(r.id).or_insert(0) += t.elapsed().as_nanos() as u64;
        let mut kept = std::mem::take(&mut self.memo.height_memo);
        kept.retain(|f, _| self.rel_level(self.store.rec(*f).rel) < lv);
        self.heights_kept = kept;
        self.active = saved;
        let came = self.store.arrivals.take().unwrap_or_default();
        res?;
        for id in came {
            if !held.contains(&id) && self.store.alive(id) && self.store.rec(id).rel != self.v.derived_by {
                news.note(self.store.rec(id).rel, id);
            }
        }
        let lost: Vec<FactId> = held.iter().copied().filter(|id| !self.store.alive(*id)).collect();
        self.overdelete(lost, over, over_base, d);
        touched.extend(held);
        Ok(())
    }

    /// The holes other than a rule's fault (`hole_cone`) and the one a seal of provenance writes, which says only that
    /// derived_by is sealed and which no change moves.
    pub(super) fn holes_beyond_faults(&mut self) -> usize {
        let sealed = self.h.atom("reflection_sealed");
        let s_rule = self.v.s_rule_hole;
        let h = &self.h;
        self.store.rel_all(h, self.v.hole).into_iter().filter(|id| {
            let a = self.store.args(*id);
            a.get(1) != Some(&sealed) && !matches!(a[0].kind(), TermK::Func(i) if h.fname(i) == s_rule && brk!("add_fault_hole_refused" => false; true))
        }).count()
    }

    /// WHAT A HOLE OR A SHRUG MAY MOVE: the heads of the rules a fault names, the shrugs and unknowns the kernel
    /// writes of them, and every relation that reads one, through each other. An addition that reaches none of them
    /// meets no fault it did not meet and leaves every shrug standing.
    pub(super) fn hole_cone(&mut self) -> HashSet<Sym> {
        let s_rule = self.v.s_rule_hole;
        let mut from: HashSet<Sym> = HashSet::new();
        for id in self.store.rel_all(&self.h, self.v.hole) {
            if let TermK::Func(i) = self.store.args(id)[0].kind() {
                if self.h.fname(i) == s_rule {
                    let r = self.h.fargs(i)[0].as_atom().and_then(|r| self.rule_of(r));
                    from.extend(r.map(|r| r.clause.head.rel));
                }
            }
        }
        if from.is_empty() && self.shrug_readers.is_empty() && !self.unk.reads_unknown {
            return from;
        }
        from.extend([self.v.shrug, self.v.unknown, self.v.hole]);
        self.grow(&from, &HashSet::new())
    }

    /// The relations that may grow: those added to, and the heads of every rule that reads one, through each other.
    pub(super) fn grow(&self, from: &HashSet<Sym>, fresh: &HashSet<Sym>) -> HashSet<Sym> {
        readers_cone(from.clone(), self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next), |r, seen| fresh.contains(&r.id) || reads(r, seen).0)
    }

    /// An addition's own work: the lattices and calls it reaches, every rule sorted by how it fires again, what it
    /// refuses, what goes, and the window the fine path runs in.
    fn add_worked_out(&mut self, added: &[FactId], removed: &[FactId], fresh: &HashSet<Sym>, grown: &HashSet<Sym>, moved: &HashSet<Sym>, called: &[Sym]) -> Result<AddDelta, &'static str> {
        let call_rels = self.call_relations(called, fresh, grown);
        let (lats, joins) = self.lattices_reached(grown)?;
        let mut plan = Plan { lats, joins, call_rels, ..Plan::default() };
        self.sort_rules(&mut plan, grown, moved, fresh)?;
        let ledger_heads = self.ledger_readers(&mut plan.reset);
        plan.dirty = self.dirty_set(&plan, &ledger_heads);
        self.reset_negated_dirty(&mut plan);
        self.split_again(&mut plan);
        let changed: HashSet<Sym> = grown.union(&plan.dirty).copied().chain(plan.recompute.iter().map(|r| r.clause.head.rel)).collect();
        self.stage_changed(&mut plan, fresh, &changed);
        self.refuse_changed(&plan, &changed)?;
        // (what is forced goes is read before the joins and the based facts are retired)
        let forced = self.forced_facts(&plan);
        self.retire_joins(&plan);
        self.withdraw_based(&plan);
        let consumers = if forced.is_empty() { Vec::new() } else { self.consumer_facts(&[], &forced, &plan.dirty, &HashSet::new(), &plan.reset_after)? };
        let mut d = AddDelta {
            facts: added.len(),
            rules: fresh.len(),
            monotone: plan.mono.len(),
            negated: plan.negs.len(),
            stacked_rules: plan.reset.len(),
            withdrawn: consumers.len(),
            refired: plan.again.len(),
            restaged: plan.staged.len(),
            ..AddDelta::default()
        };
        self.take_out_and_reset(&plan, &consumers, &mut d);
        self.lat.forget_reached(&plan.lats, &self.store);
        let (outer, holes0) = self.begin_window();
        let active = std::mem::take(&mut self.active);
        self.add.adding = true;
        self.add.fresh = None;
        let r = self.fine_window(added, removed, &plan, grown, holes0, &mut d);
        self.store.close_dup_window();
        self.add.adding = false;
        self.active = active;
        self.added_steps += self.steps;
        self.end_window(outer);
        match r {
            Ok(true) => {
                self.store.dirty = true;
                Err("a staged fact has more than one firing, and the evaluation kept the first, by its schedule")
            }
            Ok(false) => Ok(d),
            Err(_) => {
                self.store.dirty = true;
                Err("the addition would write a hole, keep a lattice's history or meet a wall, and the world is evaluated again")
            }
        }
    }

    /// The order lattices the change reaches, and the joins among them. A lattice the change reaches is derived again
    /// whole, as the retraction path derives its cone again: an improved value withdraws what read the old one, and the
    /// history of a schedule is no delta's. What cannot be derived so refuses.
    fn lattices_reached(&self, grown: &HashSet<Sym>) -> Result<(HashSet<Sym>, HashSet<Sym>), &'static str> {
        let lats: HashSet<Sym> = grown.iter().copied().filter(|r| self.lat.is_cell(*r)).collect();
        for l in &lats {
            let a = self.lat.algebra(*l);
            let op = a.cell.unwrap().1;
            // (a dominance is derived again whole by key as an order is, where its rules compare by the values alone)
            let dom = op == AggOp::Dominance && brk!("add_dominance_refused" => true; a.sub.as_ref().is_none_or(|x| !x.reads.is_empty()));
            let join = brk!("add_join_refused" => false; op.class() == Class::IdempotentJoin);
            if !(matches!(op.class(), Class::IdempotentOrder | Class::PartialOrder) || join) || dom || a.count_of.is_some() || a.widen.is_some() {
                return Err("a join, a widening, a counting tag or a dominance is reached by what changed");
            }
        }
        // a join's history is what its retraction reads, and a join derived again whole writes its own
        let joins: HashSet<Sym> = lats.iter().copied().filter(|l| self.lat.algebra(*l).cell.unwrap().1.class() == Class::IdempotentJoin).collect();
        if !lats.is_empty() && self.store.firing_keys().into_iter().any(|g| !self.store.alive(g) && lats.contains(&self.store.rec(g).rel) && !joins.contains(&self.store.rec(g).rel)) {
            return Err("a lattice keeps the history of a superseded value");
        }
        Ok((lats, joins))
    }

    /// The relations answered on demand that the addition makes or unmakes calls of. A call made before and not now (or
    /// the reverse) holds what calls made, so it goes whole with what rests on it.
    fn call_relations(&self, called: &[Sym], fresh: &HashSet<Sym>, grown: &HashSet<Sym>) -> HashSet<Sym> {
        // (one the change reaches neither through its own rules nor through a rule that calls it holds the same calls,
        // answered the same, and stays)
        called
            .iter()
            .copied()
            .chain(self.demand.rels.iter().map(|(d, _)| *d).filter(|d| {
                let one = HashSet::from([*d]);
                brk!("add_demand_unreached_dropped" => false; grown.contains(d) || fresh.iter().any(|f| self.rule_of(*f).is_some_and(|r| reads(&r, &one).0)) || self.rules.iter().any(|r| reads(r, &one).0 && reads(r, grown).0))
            }))
            .collect()
    }

    /// Every rule the addition meets, sorted by how it fires again: reset (its cells sealed again, or its conclusions
    /// withdrawn and derived again), fired over what stands (`mono`), kept under a negation that loses the firings a new
    /// fact blocks (`negs`), or an added rule that concludes nothing yet (`new_plain`).
    fn sort_rules(&self, plan: &mut Plan, grown: &HashSet<Sym>, moved: &HashSet<Sym>, fresh: &HashSet<Sym>) -> Result<(), &'static str> {
        for r in &self.rules {
            let (any, inner) = reads(r, grown);
            if r.clause.head.temporal == Temporal::Next || !r.safe {
                continue;
            }
            // a cell seals the rounds of what it reads: one over a relation whose round moved is sealed again
            if (r.has_agg || r.has_thr) && reads(r, moved).1 {
                plan.reset.insert(r.id);
                continue;
            }
            if plan.lats.contains(&r.clause.head.rel) {
                if stratified(r) || self.answer.late.contains(&r.id) {
                    return Err("a rule into the lattice negates, aggregates, reads a lattice from outside its recursion or is late");
                }
                plan.reset.insert(r.id);
                continue;
            }
            if fresh.contains(&r.id) {
                // an added rule concludes nothing yet: one that negates fires whole at its level, after what it reads
                let whole = !r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.demand_strict;
                if stratified(r) && !brk!("add_fresh_negation_reset" => false; whole) {
                    plan.reset.insert(r.id);
                } else {
                    plan.new_plain.push(r.clone());
                }
            } else if any {
                let fine = || !r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.demand_strict && brk!("add_negation_reset" => false; true);
                // (an aggregate over what did not change is a value of the firing; a holistic one's group is shared across firings)
                let held = r.clause.body.iter().all(|b| !matches!(b, BodyElem::Agg(a) if a.op.class() == Class::Holistic));
                if !inner && !r.has_thr && (!r.has_agg || held) {
                    plan.mono.push(r.clone());
                } else if let Some(ns) = negs_of(&self.h, r, grown).filter(|_| inner && fine()) {
                    plan.negs.push((r.clone(), ns));
                } else {
                    plan.reset.insert(r.id);
                    plan.keyable.insert(r.id);
                }
            }
        }
        Ok(())
    }

    /// A rule that reads `derived_by` reads a row of every firing, which any change makes or withdraws: it is reset, and
    /// its head is derived again after the rest, as a lattice is. Returns those heads.
    fn ledger_readers(&self, reset: &mut HashSet<Sym>) -> HashSet<Sym> {
        let ledger = HashSet::from([self.v.derived_by]);
        let mut heads: HashSet<Sym> = HashSet::new();
        for r in self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next && r.safe && reads(r, &ledger).0 && brk!("add_ledger_reader_kept" => false; true)) {
            reset.insert(r.id);
            heads.insert(r.clause.head.rel);
        }
        heads
    }

    /// What is derived again after the rest: the reset rules whose heads are a lattice the change reaches, a join, or a
    /// ledger reader; the calls made or unmade; and, to a fixed point, what reads any of those, and each closure a reset
    /// rule of it is in.
    fn dirty_set(&self, plan: &Plan, ledger_heads: &HashSet<Sym>) -> HashSet<Sym> {
        let mut dirty: HashSet<Sym> = self
            .rules
            .iter()
            .filter(|r| plan.reset.contains(&r.id) && (plan.lats.contains(&r.clause.head.rel) || ledger_heads.contains(&r.clause.head.rel) || brk!("add_reset_after" => true; false)))
            .map(|r| r.clause.head.rel)
            .collect();
        dirty.extend(plan.joins.iter().copied());
        if brk!("add_demand_kept" => false; true) {
            dirty.extend(plan.call_rels.iter().copied());
        }
        // a closure is walked whole from its base rule and its step fires nothing: a closure the change reaches is
        // walked again, after what it reads, and so is what reads it
        loop {
            loop {
                let n = dirty.len();
                for r in &self.rules {
                    if r.clause.head.temporal != Temporal::Next && reads(r, &dirty).0 {
                        dirty.insert(r.clause.head.rel);
                    }
                }
                if dirty.len() == n {
                    break;
                }
            }
            let n = dirty.len();
            for c in &self.clo.closures {
                if plan.reset.contains(&c.base) || plan.reset.contains(&c.step) {
                    dirty.insert(c.rel);
                }
            }
            if dirty.len() == n {
                break;
            }
        }
        dirty
    }

    /// A rule that reads what is derived again after the rest under a negation or an aggregate may withdraw too: reset
    /// with it.
    fn reset_negated_dirty(&self, plan: &mut Plan) {
        for r in &self.rules {
            if r.clause.head.temporal == Temporal::Next || !r.safe {
                continue;
            }
            let (any, inner) = reads(r, &plan.dirty);
            if brk!("add_dirty_negation_kept" => false; inner || (any && (r.has_agg || r.has_thr))) {
                plan.reset.insert(r.id);
            }
        }
    }

    /// The rules fired again whole are those reset and not dirty (`recompute`), and those reset or concluding into what is
    /// dirty (`again`). The fine path keeps the rest, and skips `again`.
    fn split_again(&self, plan: &mut Plan) {
        plan.recompute = self.rules.iter().filter(|r| plan.reset.contains(&r.id) && !plan.dirty.contains(&r.clause.head.rel)).cloned().collect();
        plan.reset_after = plan.reset.iter().copied().filter(|id| !plan.recompute.iter().any(|r| r.id == *id)).collect();
        plan.again = self
            .rules
            .iter()
            .filter(|r| r.clause.head.temporal != Temporal::Next && r.safe && (plan.reset_after.contains(&r.id) || plan.dirty.contains(&r.clause.head.rel)))
            .cloned()
            .collect();
        plan.skip = plan.again.iter().map(|r| r.id).collect();
        let dirty = &plan.dirty;
        plan.mono.retain(|r| !dirty.contains(&r.clause.head.rel));
        plan.new_plain.retain(|r| !dirty.contains(&r.clause.head.rel));
        plan.negs.retain(|(r, _)| !dirty.contains(&r.clause.head.rel));
        self.pair_closures(plan);
    }

    /// A closure is walked whole from its base rule and its step fires nothing: where either is added, the two fire
    /// whole together (news reaches both through the edges, and a base fact of the relation stops the walk).
    fn pair_closures(&self, plan: &mut Plan) {
        for c in self.clo.closures.iter().filter(|c| !plan.dirty.contains(&c.rel)) {
            let pair: Vec<Rc<ERule>> = [c.base, c.step].iter().filter_map(|id| self.rule_of(*id)).collect();
            let has = |v: &[Rc<ERule>], id: Sym| v.iter().any(|r| r.id == id);
            if brk!("add_closure_unpaired" => false; has(&plan.new_plain, c.base) || has(&plan.new_plain, c.step)) {
                plan.mono.retain(|r| r.id != c.base && r.id != c.step);
                plan.new_plain.retain(|r| r.id != c.base && r.id != c.step);
                plan.new_plain.extend(pair.iter().cloned());
            }
        }
    }

    /// A rule staged `@next` from what changed stages again; one that negates or aggregates it first loses what it staged.
    fn stage_changed(&self, plan: &mut Plan, fresh: &HashSet<Sym>, changed: &HashSet<Sym>) {
        for r in &self.rules {
            if r.clause.head.temporal != Temporal::Next {
                continue;
            }
            let (any, inner) = reads(r, changed);
            if fresh.contains(&r.id) || any {
                if fresh.contains(&r.id) || inner || r.has_agg || r.has_thr {
                    plan.unstage.insert(r.id);
                }
                plan.staged.push(r.clone());
            }
        }
    }

    /// The refusals of what the addition would meet, each before anything is written: a lattice, a tag or a ledger
    /// concluded from what changed, a reader of the shrugs or a late rule reached, a hole, a dominance rule, and a world
    /// that keeps no witness beyond the monotone part.
    fn refuse_changed(&mut self, plan: &Plan, changed: &HashSet<Sym>) -> Result<(), &'static str> {
        if !plan.staged.is_empty() && self.lat.has_cells() {
            return Err("a rule staged from what changed in a world with a lattice");
        }
        for r in plan.mono.iter().chain(&plan.new_plain).chain(&plan.again).chain(&plan.recompute).chain(plan.negs.iter().map(|(r, _)| r)) {
            let head = r.clause.head.rel;
            // (a counting tag's derivations are facts of their own, one per firing, summed by the tag's rule as any sum)
            if (self.lat.is_cell(head) && !plan.lats.contains(&head)) || brk!("add_tag_count_refused" => self.lat.algebra(head).count_of.is_some(); false) || self.v.is_reserved(head) {
                return Err("a lattice, a tag or a ledger is concluded from what changed");
            }
            // late is an order only the stock evaluator reads its strata between
            if self.shrug_readers.contains(&r.id) || self.answer.late.contains(&r.id) && self.mode == Mode::Strata {
                return Err("a rule that reads the shrugs, or one late under the stock evaluator, reads what changed");
            }
        }
        if self.hole_cone().iter().any(|r| changed.contains(r)) {
            return Err("a rule that faulted, or what reads it or the shrugs, is reached by what changed");
        }
        if self.lat.subs().any(|(_, x)| x.reads.iter().any(|b| changed.contains(b))) {
            return Err("a dominance rule reads what changed");
        }
        // a world that keeps no witness has no firing to name what a fact rests on: only the monotone part is kept
        if self.prov.no_witness && (!plan.reset.is_empty() || !plan.negs.is_empty() || !plan.call_rels.is_empty()) {
            return Err("the world keeps no witness, and what a negation or an aggregate withdraws is found through the firings");
        }
        Ok(())
    }

    /// Every fact of a reset rule's head goes, and what rests on it, with the calls made: they are read before anything is
    /// retired.
    fn forced_facts(&mut self, plan: &Plan) -> Vec<FactId> {
        let mut forced: Vec<FactId> = Vec::new();
        let mut gone: HashSet<Sym> = self.rules.iter().filter(|r| plan.reset_after.contains(&r.id)).map(|r| r.clause.head.rel).collect();
        if brk!("add_demand_kept" => false; true) {
            gone.extend(plan.call_rels.iter().copied());
        }
        for rel in gone {
            for id in self.store.rel_all(&self.h, rel) {
                if !self.store.rec(id).base() {
                    forced.push(id);
                }
            }
        }
        forced.sort_unstable();
        forced
    }

    /// The joins are retired whole: their superseded values go, their history and contributions with them, and the facts
    /// they hold are retired.
    fn retire_joins(&mut self, plan: &Plan) {
        let mut ghosts: Vec<FactId> = self.lat.pass.superseded.iter().copied().filter(|g| plan.joins.contains(&self.store.rec(*g).rel)).collect();
        ghosts.sort_unstable();
        for g in ghosts {
            self.lat.pass.superseded.remove(&g);
            self.store.drop_firings(g);
        }
        self.lat.pass.history.retain(|k, _| !plan.joins.contains(&k.0));
        self.lat.pass.join_contribs.retain(|k, _| !plan.joins.contains(&k.0));
        for rel in plan.joins.iter().filter_map(|l| self.lat.algebra(*l).join).collect::<Vec<_>>() {
            for id in self.store.rel_all(&self.h, rel) {
                if brk!("add_join_contribs_kept" => false; self.store.alive(id)) {
                    self.prov.retire_fact(&mut self.h, &mut self.store, &self.v, id);
                }
            }
        }
    }

    /// A base fact of a relation that changed stays, and its firings are made again by the rules fired again.
    fn withdraw_based(&mut self, plan: &Plan) {
        let mut based: Vec<FactId> = Vec::new();
        for rel in &plan.dirty {
            based.extend(self.store.rel_all(&self.h, *rel).into_iter().filter(|id| self.store.rec(*id).base() && self.store.support_count(*id) > 0));
        }
        if brk!("add_base_firings_kept" => false; !based.is_empty()) {
            self.withdraw_firings(&based, |_, _| true);
        }
    }

    /// The facts to take out are taken, the reset cells sealed again, and the staged rules that lose what they staged
    /// forget it; the caches a changed world reads are dropped.
    fn take_out_and_reset(&mut self, plan: &Plan, consumers: &[FactId], d: &mut AddDelta) {
        if !consumers.is_empty() {
            self.take_out(consumers);
            self.store.sweep();
        }
        d.stacked_cells = if plan.reset_after.is_empty() { 0 } else { self.reset_cells(&plan.reset_after) };
        if !plan.reset.is_empty() || !consumers.is_empty() || !plan.negs.is_empty() {
            self.support_ix = None;
        }
        self.memo.height_memo.clear();
        if !plan.call_rels.is_empty() {
            self.drop_done();
        }
        self.staged.retain(|_, f| !plan.unstage.contains(&f.rule));
        // a staged rule that aggregates what changed stages again over cells sealed again
        let staged_cells: HashSet<Sym> = plan.staged.iter().filter(|r| plan.unstage.contains(&r.id) && (r.has_agg || r.has_thr)).map(|r| r.id).collect();
        if brk!("add_staged_cells_kept" => false; !staged_cells.is_empty()) {
            d.stacked_cells += self.reset_cells(&staged_cells);
            self.support_ix = None;
        }
    }

    /// The window the addition runs in: the part kept, level by level (`fine_levels`), the rules fired again whole, and
    /// the staged rules restaged. Returns whether a staged fact has more than one firing.
    fn fine_window(&mut self, added: &[FactId], removed: &[FactId], plan: &Plan, grown: &HashSet<Sym>, holes0: usize, d: &mut AddDelta) -> Result<bool, Halt> {
        self.fine_levels(added, removed, plan, grown, d)?;
        self.active.clear();
        // the rest, as a full evaluation fires it
        self.refire(&plan.again, &[])?;
        if !plan.again.is_empty() || !plan.staged.is_empty() {
            self.add.fresh = None;
        }
        let mut rd = Delta::default();
        let ambiguous = self.restage(&plan.staged, &mut rd)?;
        if self.lat.lattice_hole(&self.store, &self.v, holes0) {
            return Err(Halt::Bug("an addition wrote a hole".into()));
        }
        if self.lat.pass.superseded.iter().any(|g| plan.lats.contains(&self.store.rec(*g).rel) && !plan.joins.contains(&self.store.rec(*g).rel)) {
            return Err(Halt::Bug("a lattice delta kept a history".into()));
        }
        Ok(ambiguous)
    }
}


impl LatticeState {
    /// The order lattices an addition reaches stand open again, and what their subsumptive keys kept goes with the facts
    /// that went.
    fn forget_reached(&mut self, lats: &HashSet<Sym>, store: &Store) {
        for l in lats {
            self.pass.closed.remove(l);
        }
        if lats.iter().any(|l| self.algebra(*l).sub.is_some()) {
            self.pass.sub_cur.retain(|k, _| !lats.contains(&k.0));
            self.pass.sub_seen.retain(|k, _| !lats.contains(&k.0));
            self.pass.sub_memo.retain(|k, _| !lats.contains(&k.0));
            self.pass.sub_parties.retain(|k, _| !lats.contains(&k.0));
            self.forget_sub_witnesses(|k| lats.contains(&k.0));
            self.pass.sub_by_of.retain(|f, _| store.alive(*f));
        }
        self.pass.cur.retain(|_, id| store.alive(*id));
    }

    /// The cells of the order lattices stand in the store at their values, closed, and the values they replaced stand as ghosts, as the evaluation left them. A
    /// lattice of dominance or a join keeps more than that, and is restored from what was kept with it (`latkept.rs`).
    fn restore_lattices(&mut self, h: &Heap, store: &mut Store, kept: Vec<super::Tok>) -> bool {
        if self.has_cells() {
            store.index_citers();
        }
        if self.lattice_keeps() {
            return self.lattices_from(kept).unwrap_or(false);
        }
        let lats: Vec<(Sym, usize)> = self.algebras.iter().filter_map(|(r, a)| a.cell.map(|(n, _)| (*r, n))).collect();
        for (rel, n) in lats {
            for id in store.rel_all(h, rel) {
                if store.alive(id) && store.arity(id) == n {
                    let key: Box<[Term]> = store.args(id)[..n - 1].into();
                    self.pass.cur.insert((rel, store.rec(id).persp, key), id);
                }
            }
            self.pass.closed.insert(rel);
        }
        let ids = if !self.has_cells() { Vec::new() } else { store.firing_keys() };
        for id in ids.into_iter().filter(|id| !store.alive(*id)) {
            let r = store.rec(id);
            if let Some((n, _)) = self.algebra(r.rel).cell.filter(|(n, _)| store.arity(id) == *n) {
                self.pass.superseded.insert(id);
                let key: Box<[Term]> = store.args(id)[..n - 1].into();
                self.pass.history.entry((r.rel, r.persp, key)).or_default().push(id);
            }
        }
        true
    }
}
