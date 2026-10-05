//! THE ADDITION PATH: base facts and rules enter an evaluated world and it is
//! brought to what a fresh evaluation of the whole program would hold, without
//! clearing what it derived (f_the_owner_settles_walls_promises_and_incremental,
//! point 3). The counterpart of the retraction path (`delta.rs`), and built on
//! its machinery.
//!
//! WHAT CHANGES. The relations of the added facts and the heads of the added
//! rules GROW; so does, through every rule that reads one of them, its head
//! (`grow`). A rule that reads a growing relation only positively, plainly, is
//! MONOTONE in it: it fires semi-naively from the news (the added facts are the
//! first front; an added plain rule fires whole once, over the store as it
//! stands, and its conclusions are news). A rule that reads a growing relation
//! under a negation or inside an aggregate (a count, a min, a threshold), or an
//! added rule that negates or aggregates at all, may WITHDRAW what it
//! concluded: it is RESET as the retraction path resets a rule (every fact of
//! its head goes, its cells go) and fires again in a full evaluation's order,
//! level by level. What rests on what a reset withdraws (`dirty`) goes with
//! it, through each other (`consumer_facts`), and every rule that reads a dirty
//! relation, or concludes into one, fires again whole over what stands: the
//! retract-then-rederive of DRed, where the rederivation is the rule fired
//! again. A rule staged `@next` from what changed stages again (`restage`); one
//! that negates or aggregates it loses what it staged first.
//!
//! THE STATE IS A SET OF FACTS AND, PER FACT, THE SET OF ITS FIRINGS, and the
//! witness printed is the least by height and signature (`Store::witness_of`),
//! so the order the delta fires in is not observable: the rules fired again in
//! a full evaluation's order are those whose firing order a cell, a negation or
//! a stage could observe.
//!
//! WHAT IT REFUSES, every reason in a fixed order (`addition_refusals`), and
//! the world is then evaluated again from its facts: a world a delta is not
//! worked out for (not evaluated, cut by a wall, a later tick, well-founded,
//! holding a hole or reading a shrug), a fact that was derived before it was
//! asserted, a relation answered on demand, a rule that reads the ledgers, a
//! lattice, tag or subsumptive relation the change reaches, a component
//! stratified by its data, a closure answered from its tree whose edges the
//! change reaches, a rule late or unsafe, and for added rules a program whose
//! preparation moves more than the rules it runs (`prep_moves`).
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
}

/// What preparation decided that an added rule may move (`prep_mark`, `prep_moves`).
pub struct PrepMark {
    rules: HashMap<Sym, (String, bool)>,
    lattices: Vec<Sym>,
    subs: Vec<Sym>,
    demand: Vec<Sym>,
    late: Vec<Sym>,
    shrugs: Vec<Sym>,
    decl: (bool, bool, bool, usize, usize, usize),
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

fn sorted(mut v: Vec<Sym>) -> Vec<Sym> {
    v.sort_unstable();
    v.dedup();
    v
}

impl Eval {
    /// What preparation decided, beside the rules, that an added rule could move.
    pub fn prep_mark(&self) -> PrepMark {
        PrepMark {
            rules: self.rules.iter().map(|r| (r.id, (r.canon.clone(), r.safe))).collect(),
            lattices: sorted(self.lattices.keys().copied().collect()),
            subs: sorted(self.subs.keys().copied().collect()),
            demand: sorted(self.demand_rels.iter().map(|(r, _)| *r).collect()),
            late: sorted(self.answer.late.clone()),
            shrugs: sorted(self.shrug_readers.iter().copied().collect()),
            decl: (self.well_founded, self.no_provenance, self.no_witness, self.functions.len(), self.trees.len(), self.vclosures.len()),
            cone: self.cone.as_ref().map(|c| sorted(c.iter().copied().collect())),
            carried: sorted(self.carried.values().copied().collect()),
        }
    }

    /// WHAT A NEW PROGRAM MOVES BEYOND THE RULES IT ADDS: the rules to fire whole (those added, and those now
    /// answered on demand or no longer), the relations whose facts a call made (answered on demand before or now),
    /// and every reason the addition is not worked out as a delta (an old rule changed or gone is one).
    pub fn prep_moves(&self, was: &PrepMark) -> (Vec<Sym>, Vec<Sym>, Vec<&'static str>) {
        let now = self.prep_mark();
        let mut out = Vec::new();
        if was.rules.iter().any(|(id, (canon, _))| now.rules.get(id).map(|x| &x.0) != Some(canon)) {
            out.push("a rule of the world changed or left it");
        }
        if was.decl != now.decl {
            out.push("a declaration the evaluation reads changed");
        }
        if was.lattices != now.lattices || was.subs != now.subs || was.carried != now.carried {
            out.push("a lattice, tag or dominance declaration changed");
        }
        if was.late != now.late || was.shrugs != now.shrugs {
            out.push("the rules fired late or after the shrugs changed");
        }
        if was.cone.is_some() != now.cone.is_some() {
            out.push("the world started or stopped running a cone of asks");
        }
        let demand_moved: HashSet<Sym> = was.demand.iter().chain(&now.demand).copied().filter(|r| was.demand.contains(r) != now.demand.contains(r)).collect();
        let fresh = |r: &ERule| match was.rules.get(&r.id) {
            None => true,
            Some((_, safe)) => *safe != r.safe || brk!("add_demand_moved_kept" => false; demand_moved.contains(&r.clause.head.rel)),
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
        let lats: Vec<Sym> = self.lattices.keys().copied().collect();
        let dom_edges: Vec<(Sym, Sym)> = self.subs.iter().flat_map(|(p, x)| x.reads.iter().map(move |b| (*p, *b))).collect();
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

    /// WHY AN ADDITION IS NOT WORKED OUT for this world: every reason that holds, in a fixed order (empty where it is).
    fn addition_refusals(&self) -> Vec<&'static str> {
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
        if !self.shrug_readers.is_empty() || self.store.rel_count(self.v.hole) > 0 {
            out.push("the world holds a hole or reads a shrug");
        }
        if !self.demand_rels.is_empty() && !self.lattices.is_empty() {
            out.push("a world with a lattice holds a relation answered on demand");
        }
        let ledgers = [
            self.v.agg_cell,
            self.v.agg_member,
            self.v.agg_member_prem,
            self.v.agg_sealed,
            self.v.derived_by,
            self.v.hole,
            self.v.shrug,
            self.v.lattice_member,
            self.v.lattice_member_prem,
            self.v.dominated_by,
        ];
        let ledger: HashSet<Sym> = ledgers.into_iter().collect();
        if self.rules.iter().any(|r| reads(r, &ledger).0) {
            out.push("a rule reads the ledger of cells, provenance or assertions");
        }
        if !self.ds_comps.is_empty() {
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
        let moved = if new_rules.is_empty() { HashSet::new() } else { self.rerank()? };
        self.add_worked_out(added, &fresh, &grown, &moved, called).map_err(String::from)
    }

    /// The relations that may grow: those added to, and the heads of every rule that reads one, through each other.
    fn grow(&self, from: &HashSet<Sym>, fresh: &HashSet<Sym>) -> HashSet<Sym> {
        let mut seen = from.clone();
        loop {
            let n = seen.len();
            for r in &self.rules {
                if r.clause.head.temporal != Temporal::Next && (fresh.contains(&r.id) || reads(r, &seen).0) {
                    seen.insert(r.clause.head.rel);
                }
            }
            if seen.len() == n {
                return seen;
            }
        }
    }

    fn add_worked_out(&mut self, added: &[FactId], fresh: &HashSet<Sym>, grown: &HashSet<Sym>, moved: &HashSet<Sym>, called: &[Sym]) -> Result<AddDelta, &'static str> {
        let stratified = |r: &ERule| r.has_neg || r.has_agg || r.has_thr || !r.lattice_outer.is_empty() || r.demand_strict;
        // A RELATION ANSWERED ON DEMAND makes a fact for every call, which no firing cites: every such fact goes and
        // every rule that reads one fires again, so the calls are made again over what stands (as a retraction does)
        let demanded: HashSet<Sym> = self.demand_rels.iter().map(|(r, _)| *r).collect();
        // a relation answered on demand before and not now (or the reverse) holds what calls made: it goes too
        let call_rels: HashSet<Sym> = called.iter().copied().chain(demanded.iter().copied()).collect();
        let called = |r: &ERule| !r.safe && demanded.contains(&r.clause.head.rel);
        // AN ORDER LATTICE THE CHANGE REACHES is derived again whole, as the retraction path derives its cone again:
        // an improved value withdraws what read the old one, and the history of a schedule is no delta's
        let lats: HashSet<Sym> = grown.iter().copied().filter(|r| self.lattices.contains_key(r)).collect();
        for l in &lats {
            let op = self.lattices[l].1;
            if !matches!(op.class(), Class::IdempotentOrder | Class::PartialOrder) || op == AggOp::Dominance || self.tags.count_of.contains_key(l) || self.widen.contains_key(l) {
                return Err("a join, a widening, a counting tag or a dominance is reached by what changed");
            }
        }
        if !lats.is_empty() && self.store.firing_keys().into_iter().any(|g| !self.store.alive(g) && lats.contains(&self.store.rec(g).rel)) {
            return Err("a lattice keeps the history of a superseded value");
        }
        // THE RESET: a rule that may withdraw what it concluded
        let mut reset: HashSet<Sym> = HashSet::new();
        let mut mono: Vec<Rc<ERule>> = Vec::new();
        let mut new_plain: Vec<Rc<ERule>> = Vec::new();
        let mut staged: Vec<Rc<ERule>> = Vec::new();
        for r in &self.rules {
            let (any, inner) = reads(r, grown);
            if r.clause.head.temporal == Temporal::Next || called(r) {
                continue;
            }
            // a cell seals the rounds of what it reads: one over a relation whose round moved is sealed again
            if (r.has_agg || r.has_thr) && brk!("add_moved_round_kept" => false; reads(r, moved).1) {
                reset.insert(r.id);
                continue;
            }
            if lats.contains(&r.clause.head.rel) {
                if stratified(r) || self.answer.late.contains(&r.id) {
                    return Err("a rule into the lattice negates, aggregates, reads a lattice from outside its recursion or is late");
                }
                reset.insert(r.id);
                continue;
            }
            if fresh.contains(&r.id) {
                if stratified(r) {
                    reset.insert(r.id);
                } else {
                    new_plain.push(r.clone());
                }
            } else if any {
                if inner || r.has_agg || r.has_thr {
                    reset.insert(r.id);
                } else {
                    mono.push(r.clone());
                }
            }
        }
        // WHAT A RESET MAY WITHDRAW, and what rests on it, through each other
        let mut dirty: HashSet<Sym> = self.rules.iter().filter(|r| reset.contains(&r.id)).map(|r| r.clause.head.rel).collect();
        if brk!("add_demand_kept" => false; true) {
            dirty.extend(call_rels.iter().copied());
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
            for c in &self.closures {
                let hit = |id: Sym| reset.contains(&id) || mono.iter().chain(&new_plain).any(|r| r.id == id);
                if brk!("add_closure_unpaired" => false; hit(c.base) || hit(c.step)) {
                    dirty.insert(c.rel);
                }
            }
            if dirty.len() == n {
                break;
            }
        }
        let again: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.clause.head.temporal != Temporal::Next && !called(r) && (reset.contains(&r.id) || dirty.contains(&r.clause.head.rel)))
            .cloned()
            .collect();
        mono.retain(|r| !dirty.contains(&r.clause.head.rel));
        new_plain.retain(|r| !dirty.contains(&r.clause.head.rel));
        let changed: HashSet<Sym> = grown.union(&dirty).copied().collect();
        // a rule staged from what changed stages again; one that negates or aggregates it first loses what it staged
        let mut unstage: HashSet<Sym> = HashSet::new();
        for r in &self.rules {
            if r.clause.head.temporal != Temporal::Next {
                continue;
            }
            let (any, inner) = reads(r, &changed);
            if fresh.contains(&r.id) || any {
                if fresh.contains(&r.id) || inner || r.has_agg || r.has_thr {
                    unstage.insert(r.id);
                }
                staged.push(r.clone());
            }
        }
        if !staged.is_empty() && !self.lattices.is_empty() {
            return Err("a rule staged from what changed in a world with a lattice");
        }
        for r in mono.iter().chain(&new_plain).chain(&again) {
            let head = r.clause.head.rel;
            if (self.lattices.contains_key(&head) && !lats.contains(&head)) || self.tags.count_of.contains_key(&head) || self.v.is_reserved(head) {
                return Err("a lattice, a tag or a ledger is concluded from what changed");
            }
            if self.shrug_readers.contains(&r.id) || self.answer.late.contains(&r.id) || !r.safe {
                return Err("a rule late or unsafe reads what changed");
            }
        }
        if self.subs.values().any(|x| x.reads.iter().any(|b| changed.contains(b))) {
            return Err("a dominance rule reads what changed");
        }
        // every fact of a reset rule's head goes, and what rests on it
        let mut forced: Vec<FactId> = Vec::new();
        let mut gone: HashSet<Sym> = self.rules.iter().filter(|r| reset.contains(&r.id)).map(|r| r.clause.head.rel).collect();
        if brk!("add_demand_kept" => false; true) {
            gone.extend(call_rels.iter().copied());
        }
        for rel in gone {
            for id in self.store.rel_all(&self.h, rel) {
                if !self.store.rec(id).base() {
                    forced.push(id);
                }
            }
        }
        forced.sort_unstable();
        // a base fact of a relation that changed stays, and its firings are made again by the rules fired again
        let mut based: Vec<FactId> = Vec::new();
        for rel in &dirty {
            based.extend(self.store.rel_all(&self.h, *rel).into_iter().filter(|id| self.store.rec(*id).base() && self.store.support_count(*id) > 0));
        }
        if brk!("add_base_firings_kept" => false; !based.is_empty()) {
            self.withdraw_firings(&based, |_, _| true);
        }
        let consumers = if forced.is_empty() { Vec::new() } else { self.consumer_facts(&[], &forced, &dirty, &HashSet::new(), &reset)? };
        let mut d = AddDelta {
            facts: added.len(),
            rules: fresh.len(),
            monotone: mono.len(),
            stacked_rules: reset.len(),
            withdrawn: consumers.len(),
            refired: again.len(),
            restaged: staged.len(),
            ..AddDelta::default()
        };
        if !consumers.is_empty() {
            self.withdraw_firings(&consumers, |_, _| true);
            self.store.remove_many(&consumers);
            self.store.sweep();
        }
        d.stacked_cells = if reset.is_empty() { 0 } else { self.reset_cells(&reset) };
        if !reset.is_empty() || !consumers.is_empty() {
            self.support_ix = None;
        }
        self.height_memo.clear();
        if !call_rels.is_empty() {
            self.drop_done();
        }
        self.staged.retain(|_, f| !unstage.contains(&f.rule));
        for l in &lats {
            self.lat_closed.remove(l);
        }
        let store = &self.store;
        self.lat_cur.retain(|_, id| store.alive(*id));
        let outer = (self.steps, self.rows);
        self.steps = 0;
        let holes0 = self.store.rel_count(self.v.hole);
        let active = std::mem::take(&mut self.active);
        let mut ambiguous = false;
        let r = (|| -> Result<(), Halt> {
            // the monotone part: the news through the rules that read it plainly, and the added plain rules whole
            let mut front = Front::default();
            for f in added {
                front.note(self.store.rec(*f).rel, *f);
            }
            let mut sorted_mono = mono.clone();
            sorted_mono.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
            self.active = sorted_mono;
            self.propagate(front)?;
            self.activate(&new_plain)?;
            self.active.clear();
            // the rest, as a full evaluation fires it
            self.refire(&again, &[])?;
            let mut rd = Delta::default();
            ambiguous = self.restage(&staged, &mut rd)?;
            if self.store.rel_count(self.v.hole) > holes0 || !self.lat_pending.is_empty() {
                return Err(Halt::Bug("an addition wrote a hole".into()));
            }
            if self.lat_superseded.iter().any(|g| lats.contains(&self.store.rec(*g).rel)) {
                return Err(Halt::Bug("a lattice delta kept a history".into()));
            }
            Ok(())
        })();
        self.active = active;
        self.cur_front = Front::default();
        (self.steps, self.rows) = outer;
        match r {
            Ok(()) if ambiguous => {
                self.store.dirty = true;
                Err("a staged fact has more than one firing, and the evaluation kept the first, by its schedule")
            }
            Ok(()) => Ok(d),
            Err(_) => {
                self.store.dirty = true;
                Err("the addition would write a hole, keep a lattice's history or meet a wall, and the world is evaluated again")
            }
        }
    }
}
