//! THE RETRACTION PATH: a base fact leaves an evaluated world and what it
//! supported is brought to what a fresh evaluation would hold, without
//! evaluating the world again (docs/aggregates.md, "Ready for the incremental
//! engine"; `f_a_retraction_updates_the_cells_it_supports`).
//!
//! WHAT IT DOES, by what the fact supports:
//!
//! - an INVERTIBLE cell (count, sum) subtracts: the members whose
//!   representative derivation cites the fact are derived again, each alone
//!   (the aggregate's inner body solved with the group and the member's
//!   projection bound); one with no derivation left is dropped and its value
//!   taken from the total with `AggOp::subtract`, one with another derivation
//!   keeps its place under that derivation, which is the least signature
//!   among those left;
//! - a COUNTING TAG is that sum over derivations: the derivations (`p@count`
//!   facts) whose only firings cite the fact go, and the cell subtracts them;
//! - a cell with no inverse (min, max, or, and; median and quantile, whose
//!   value is a function of the group; at_least, whose Quorum is the first N)
//!   is derived again from the facts, the one cell alone (`seal_cells` with
//!   its key bound; a threshold is reached and closed as a Quorum is);
//! - then what read the cell is read again: the firings that cited the old
//!   record go, the facts they concluded go with their last firing, and the
//!   rule is solved with the cell's key bound against the new record;
//! - an ORDER LATTICE (and a semiring tag that is one) is taken out whole
//!   where the fact reaches it: the lattice facts whose firings cite the
//!   fact, and those whose firings cite them, are its CONE, removed with
//!   their firings (a cycle supports itself, so a fact is not kept for a
//!   firing inside the cone), and the rules into the cone's relations are
//!   fired again over what stands and the relations close again;
//! - a SUBSUMPTIVE relation does the same by KEY: the front of a key and every
//!   key a value was given to from the fact (a value no fact holds, remembered
//!   with the premises of the firing that gave it, `sub_prems`) go and are
//!   derived again, since what each value dominated is decided against every
//!   value the key was given;
//! - what PLAIN RULES concluded from what changed (`consumer_rules`,
//!   `consumer_facts`): the facts that rest on a replaced cell's old record or
//!   on the cone, through each other, are taken out, and the rules fired again
//!   once the cells are replaced and the lattices closed;
//! - what NEGATES or AGGREGATES what changed (`Readers::reset`: a changed cell's
//!   conclusion, the cone, or the retracted fact itself read outside an
//!   aggregate) is read again WHOLE, for a `not` can become true and a count
//!   gain a member, which nothing here subtracts: every fact of its head goes
//!   (`reset_facts`), its cells go (`reset_cells`, a threshold's state with
//!   them), and it fires again in a full evaluation's order, the plain rules at
//!   once and the others level by level, the quorums closing as they close
//!   (`refire`); a cell of such a rule that the fact supports is not
//!   subtracted from;
//! - a rule that concludes `@next` makes no fact of the tick: the staged facts
//!   whose firing cites what is gone are taken out and the rules that stage
//!   into their relations fire again (`restage`);
//! - a relation ANSWERED ON DEMAND makes a fact for every call, which no
//!   firing cites: every fact of such a relation goes and every rule that reads
//!   one fires again, so the calls are made again over what stands (`called`);
//! - a COMPONENT STRATIFIED BY ITS DATA that a rule concluding into it reads
//!   what changed is read again whole and run as the evaluation runs it, its
//!   correlations released a layer at a time (`comps`, `run_data_comps`).
//!
//! WHAT IT REFUSES, and says why, leaving the world as a full evaluation
//! would take it (`Err(reason)`; the caller evaluates again): a world a delta
//! is not worked out for (a later tick, a hole, a wall, the well-founded
//! mode), a join or a widening (its
//! contributions are the history of the schedule that read them, so no delta
//! promises it), a value kept as history, a rank or a quantile whose group is
//! shared across its parameter, a rule whose second aggregate depends on what
//! its first reached, a staged fact two firings reach (the first is the
//! schedule's), a lattice beside a staged rule, a rule answered on demand or a
//! component stratified by its data, and a delta that would write a hole
//! (written with its shrugs after a whole pass). Each is named; none is a
//! reason to answer differently than a full evaluation does.
//!
//! The result is the one a full evaluation gives, byte for byte in
//! `canonical_state`, and its explanations are the same (rust/rofl/tests/
//! incremental.rs holds both over random edits).
use super::datastrat::DsComp;
use super::*;
use crate::cell::Strategy;

/// What a retraction did.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Delta {
    /// cells the fact supported
    pub cells: usize,
    /// of those, updated by subtraction
    pub subtracted: usize,
    /// members taken out of a subtracted cell
    pub members_dropped: usize,
    /// members that kept their place under another derivation
    pub members_rederived: usize,
    /// cells derived again from their facts
    pub rederived: usize,
    /// facts the cells' readers concluded again
    pub refired: usize,
    /// facts the cells' readers lost
    pub retired: usize,
    /// derivations of a counting tag (`p@count`) that cited the fact, and
    /// went with it
    pub withdrawn: usize,
    /// lattice facts that rested on the fact, through each other, taken out
    /// and derived again
    pub cone: usize,
    /// facts of plain rules that rested on what changed, taken out and
    /// derived again
    pub consumers: usize,
    /// rules that negate or aggregate what changed, read again whole
    pub stacked_rules: usize,
    /// cells of those rules, sealed again
    pub stacked_cells: usize,
    /// staged facts (`@next`) that rested on what changed, taken out
    pub restaged: usize,
    /// components stratified by their data, read again whole (`ds_walk` and all)
    pub components: usize,
    /// facts a rule answered on demand concluded at a call, taken out with the calls that made them
    pub demanded: usize,
}

/// The rules that read what a retraction changes (`consumer_rules`).
struct Readers {
    /// the relations whose facts may rest on it
    rels: HashSet<Sym>,
    /// every rule that concludes one of them, to be fired again
    rules: Vec<Rc<ERule>>,
    /// the rules that negate or aggregate what changed (or aggregate at all while reading it): their facts
    /// all go and their cells are sealed again, for which key a cell is read at is the rule's own business
    reset: HashSet<Sym>,
    /// the rules that conclude `@next` from what changed: their staged facts that rested on it go and they fire
    /// again (`restage`)
    staged: Vec<Rc<ERule>>,
    /// a rule answered on demand reads what changed, or a rule that calls one does
    demand: bool,
}

type Support = HashMap<FactId, Vec<CellId>>;

fn walk(b: &BodyElem, inner: bool, f: &mut impl FnMut(&Lit, bool, bool)) {
    match b {
        BodyElem::Pos(l) => f(l, false, inner),
        BodyElem::Neg(l) => f(l, true, inner),
        BodyElem::Bi { .. } => {}
        BodyElem::Agg(a) => a.body.iter().for_each(|x| walk(x, true, f)),
    }
}

impl Eval {
    /// THE BACK-INDEX: fact -> the cells some member of which cites it. Built
    /// once from the cells a full evaluation sealed (dropped when one runs
    /// again), kept as the delta path replaces cells. A member cites the
    /// facts of every derivation it keeps: losing one of them changes the
    /// member's derivation set, and the canonical one when it was that one.
    fn support_index(&mut self) -> &mut Support {
        if self.support_ix.is_none() {
            let mut ix: Support = HashMap::new();
            for c in self.store.live_cells() {
                Self::index_cell(&self.store, c, &mut ix);
            }
            self.support_ix = Some(ix);
        }
        self.support_ix.as_mut().unwrap()
    }

    fn index_cell(store: &Store, c: CellId, ix: &mut Support) {
        for m in store.cell_members(c) {
            for p in store.member_derivs(m).take(brk!("retract_alts_unindexed" => 1; usize::MAX)).flatten() {
                if let PremRef::Fact(g) = p {
                    let v = ix.entry(*g).or_default();
                    if !v.contains(&c) {
                        v.push(c);
                    }
                }
            }
        }
    }

    fn unindex_cell(store: &Store, c: CellId, ix: &mut Support) {
        for m in store.cell_members(c) {
            for p in store.member_derivs(m).flatten() {
                if let PremRef::Fact(g) = p {
                    if let Some(v) = ix.get_mut(g) {
                        v.retain(|x| *x != c);
                    }
                }
            }
        }
    }

    /// The cells a retraction of `f` reaches, from the back-index.
    pub fn supported_cells(&mut self, f: FactId) -> Vec<CellId> {
        let mut v = brk!("retract_index_off" => Vec::new(); self.support_index().get(&f).cloned().unwrap_or_default());
        v.retain(|c| !self.store.cell_dead(*c));
        v.sort_unstable();
        v
    }

    /// A world a delta is worked out for, and a fact it is worked out for.
    fn delta_gate(&self, f: FactId) -> Result<(), &'static str> {
        if self.well_founded {
            return Err("the world is evaluated well-founded");
        }
        if self.store.dirty {
            return Err("the world is not evaluated");
        }
        if self.store.partial_eval {
            return Err("a wall cut the evaluation");
        }
        if self.store.tick != 0 {
            return Err("a later tick");
        }
        if !self.shrug_readers.is_empty() || self.store.rel_count(self.v.hole) > 0 {
            return Err("the world holds a hole or reads a shrug");
        }
        let rec = self.store.rec(f);
        if !rec.base() {
            return Err("not a base fact");
        }
        let rel = rec.rel;
        if self.demand_rels.iter().any(|(r, _)| *r == rel) {
            return Err("read on demand");
        }
        let ledgers = [
            self.v.asserted_by,
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
        let mut why: Option<&'static str> = None;
        for r in &self.rules {
            if r.clause.head.rel == rel {
                why = Some("the relation is concluded by a rule too");
            }
            for b in &r.clause.body {
                walk(b, false, &mut |l, _, _| {
                    if ledgers.contains(&l.rel) {
                        why = Some("a rule reads the ledger of cells, provenance or assertions");
                    }
                });
            }
        }
        why.map_or(Ok(()), Err)
    }

    /// The rule of a cell, its aggregate, its plan: what a cell can be
    /// derived again and read again from. A cell whose conclusion is read, or
    /// that no top-level aggregate of a rule made, is not one.
    fn delta_owner(&self, c: CellId) -> Result<(Rc<ERule>, Agg, Rc<AggPlan>), &'static str> {
        let r = self.store.cell(c);
        let CellOwner::Body { rule, at } = r.owner;
        let er = self.rule_of(rule).ok_or("the cell's rule is gone")?;
        let agg = er
            .plan
            .iter()
            .find_map(|b| match b {
                BodyElem::Agg(a) if a.at == at => Some((**a).clone()),
                _ => None,
            })
            .ok_or("an aggregate inside an aggregate")?;
        let plan = self.agg_plans.get(&(rule, at)).cloned().ok_or("the aggregate has no plan")?;
        if er.clause.head.temporal == Temporal::Next && !self.lattices.is_empty() {
            return Err("a conclusion @next in a world with a lattice");
        }
        // an aggregate that reads what another of its rule binds (a result, a
        // group) is sealed for the values the other reached: a cell the
        // retraction leaves nothing to read would stay
        let aggs: Vec<&Agg> = er.plan.iter().filter_map(|b| if let BodyElem::Agg(a) = b { Some(&**a) } else { None }).collect();
        if aggs.len() > 1 {
            let mut made: Vec<(u32, Sym)> = Vec::new();
            for a in &aggs {
                let p = self.agg_plans.get(&(rule, a.at)).ok_or("the aggregate has no plan")?;
                let mut vs: Vec<Sym> = Vec::new();
                self.h.vars_of(a.result, &mut vs);
                vs.extend(p.group.iter().map(|i| a.shared[*i]));
                made.extend(vs.into_iter().map(|v| (a.at, v)));
            }
            for a in &aggs {
                let p = self.agg_plans.get(&(rule, a.at)).ok_or("the aggregate has no plan")?;
                if brk!("retract_chain_gate_off" => false; p.corr.iter().any(|i| made.iter().any(|(at, v)| *at != a.at && *v == a.shared[*i]))) {
                    return Err("an aggregate reads what another aggregate of its rule binds");
                }
            }
        }
        // a later aggregate is sealed only for the groups an earlier one reached: one that may leave
        // no solution (a group, a min over nothing) decides which cells there are
        for i in 1..aggs.len() {
            let partial = aggs[..i].iter().any(|b| {
                let total = self.agg_plans.get(&(rule, b.at)).is_some_and(|p| p.group.is_empty() && matches!(p.op, AggOp::Count | AggOp::Sum));
                brk!("retract_partial_gate_off" => false; !total)
            });
            if partial {
                return Err("an aggregate follows one that may leave no solution");
            }
        }
        Ok((er, agg, plan))
    }

    /// THE RULES THAT READ WHAT A RETRACTION CHANGES, and what they conclude
    /// in turn: the relations whose facts may rest on it (`from`), the rules
    /// that read any of them and the relations those conclude. Every such
    /// rule must be monotone and plain (no negation, aggregate or threshold,
    /// not staged, no demand) and conclude no lattice, tag or ledger: its
    /// facts are taken out when they rest on what changed, and the rules
    /// fired again over what stands. `own` are the relations whose rules are
    /// not readers but the thing that changed (a lattice's own).
    #[allow(clippy::type_complexity)]
    fn consumer_rules(&self, from: &HashSet<Sym>, own: &HashSet<Sym>, base: Sym) -> Result<Readers, &'static str> {
        let mut seen: HashSet<Sym> = from.clone();
        let mut rels: HashSet<Sym> = HashSet::new();
        let mut rules: Vec<Rc<ERule>> = Vec::new();
        let mut taken: HashSet<Sym> = HashSet::new();
        let mut reset: HashSet<Sym> = HashSet::new();
        let mut staged: Vec<Rc<ERule>> = Vec::new();
        let mut demand = false;
        let staging = self.lattices.is_empty();
        loop {
            let mut grew = false;
            for r in &self.rules {
                if own.contains(&r.clause.head.rel) || taken.contains(&r.id) {
                    continue;
                }
                let (mut reads, mut inner) = (false, false);
                // a counting tag's derivation reads the retracted fact outside an aggregate, directly (it is what the sum counts), and so does a rule into a lattice (its firing is the contribution): the path's own
                let counts = self.tags.count_of.contains_key(&r.clause.head.rel) || self.lattices.contains_key(&r.clause.head.rel);
                for b in &r.clause.body {
                    walk(b, false, &mut |l, neg, deep| {
                        if seen.contains(&l.rel) {
                            reads = true;
                            inner |= neg || deep;
                        } else if l.rel == base && (!deep || neg && brk!("retract_deep_neg_unread" => false; true)) && !counts && brk!("retract_gate_plain" => neg, "retract_gate_neg" => !neg; true) {
                            // the fact itself, read plainly or negated (an aggregate's own body too: the back-index holds no negated premise, and a count may gain a member): what rests on it goes, and a negation of it may now hold
                            reads = true;
                            inner |= neg;
                        }
                    });
                }
                if !reads {
                    continue;
                }
                let head = r.clause.head.rel;
                // answered at the call sites and never fired: its conclusions are the calls' (`demand`)
                if !r.safe && self.demand_rels.iter().any(|(x, _)| *x == head) {
                    demand = true;
                    continue;
                }
                if self.shrug_readers.contains(&r.id) || self.answer.late.contains(&r.id) || !r.safe {
                    return Err("a rule late or unsafe reads what rests on the fact");
                }
                if r.clause.head.temporal == Temporal::Next {
                    if !staging {
                        return Err("a rule staged in a world with a lattice reads what rests on the fact");
                    }
                    // it concludes no fact of this tick: what it staged is read again at the end
                    if brk!("retract_stacked_plain" => false; inner || r.has_agg) {
                        reset.insert(r.id);
                    }
                    staged.push(r.clone());
                    taken.insert(r.id);
                    continue;
                }
                if self.lattices.contains_key(&head) || self.tags.count_of.contains_key(&head) || self.v.is_reserved(head) {
                    return Err("a lattice, a tag or a ledger is concluded from what rests on the fact");
                }
                if brk!("retract_stacked_plain" => false; inner || r.has_agg) {
                    reset.insert(r.id);
                }
                rules.push(r.clone());
                taken.insert(r.id);
                rels.insert(head);
                seen.insert(head);
                grew = true;
            }
            if !grew {
                break;
            }
        }
        // a fact of these relations that a rule not reading what changed also concludes is taken out
        // too, so that rule is fired again as well
        for r in &self.rules {
            let head = r.clause.head.rel;
            if !rels.contains(&head) || taken.contains(&r.id) || own.contains(&head) {
                continue;
            }
            if (r.clause.head.temporal == Temporal::Next && staging) || (!r.safe && self.demand_rels.iter().any(|(x, _)| *x == head)) {
                continue;
            }
            if r.clause.head.temporal == Temporal::Next || self.shrug_readers.contains(&r.id) || self.answer.late.contains(&r.id) || !r.safe {
                return Err("a rule that stages or counts concludes what rests on the fact");
            }
            rules.push(r.clone());
        }
        if self.subs.values().any(|x| x.reads.iter().any(|b| seen.contains(b))) {
            return Err("a dominance rule reads what rests on the fact");
        }
        demand |= rules.iter().chain(staged.iter()).any(|r| self.calls_on_demand(r));
        Ok(Readers { rels, rules, reset, staged, demand })
    }

    /// Whether `r` reads a relation answered on demand, anywhere in its body.
    fn calls_on_demand(&self, r: &ERule) -> bool {
        let mut yes = false;
        for b in &r.clause.body {
            walk(b, false, &mut |l, _, _| yes |= self.demand_rels.iter().any(|(x, _)| *x == l.rel));
        }
        yes
    }

    /// Every fact of the relations the rules that are read again whole conclude.
    fn reset_facts(&mut self, rd: &Readers) -> Result<Vec<FactId>, &'static str> {
        let mut out: Vec<FactId> = Vec::new();
        for r in rd.rules.iter().filter(|r| rd.reset.contains(&r.id)) {
            for id in self.store.rel_all(&self.h, r.clause.head.rel) {
                if self.store.rec(id).base() {
                    return Err("a rule that negates or aggregates what changed concludes a base fact");
                }
                if !out.contains(&id) {
                    out.push(id);
                }
            }
        }
        Ok(brk!("retract_stacked_facts_kept" => Vec::new(); out))
    }

    /// The cells of the rules read again whole, gone with their reflection.
    fn reset_cells(&mut self, reset: &HashSet<Sym>) -> usize {
        if brk!("retract_stacked_cells_kept" => true; false) {
            return 0;
        }
        let mut n = 0;
        for c in self.store.live_cells() {
            let CellOwner::Body { rule, at } = self.store.cell(c).owner;
            if !reset.contains(&rule) {
                continue;
            }
            let key = self.store.cell_key_term(&mut self.h, c);
            self.forget_reflection(key);
            if let Some(ix) = self.support_ix.as_mut() {
                Self::unindex_cell(&self.store, c, ix);
            }
            if self.store.cell(c).op == AggOp::AtLeast && brk!("retract_thr_cells_kept" => false; true) {
                let rec = self.store.cell(c);
                self.thr_cells.remove(&(rule, at, rec.key.clone()));
                self.thr_fresh.remove(&c);
            }
            self.store.kill_cell(c);
            n += 1;
        }
        self.thr_open.retain(|(c, _)| !self.store.cell_dead(*c));
        self.thr_acc.retain(|(r, _, _), _| !reset.contains(r));
        self.agg_memo.retain(|(r, _, _), _| !reset.contains(r));
        self.reach_memo.retain(|(r, _, _), _| !reset.contains(r));
        self.agg_opened.retain(|(r, _, _)| !reset.contains(r));
        self.hol_shared.retain(|(r, _, _), _| !reset.contains(r));
        self.height_memo.clear();
        n
    }

    /// THE RULES THAT READ WHAT CHANGED, FIRED AGAIN AS A FULL EVALUATION FIRES
    /// THEM: those that neither negate nor aggregate at once, the others by
    /// level, each level over what the levels below concluded.
    fn refire(&mut self, rules: &[Rc<ERule>], comps: &[Rc<DsComp>]) -> Result<(), Halt> {
        let (strat, mono): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = rules.iter().cloned().partition(|r| r.has_neg || r.has_agg || !r.lattice_outer.is_empty());
        let mut levels: std::collections::BTreeMap<i64, Vec<Rc<ERule>>> = std::collections::BTreeMap::new();
        for r in strat {
            let lv = brk!("retract_stacked_one_level" => 0; self.rule_level(&r));
            levels.entry(lv).or_default().push(r);
        }
        // a component stratified by its data is run as the evaluation runs it: its correlations held, then
        // released a layer at a time
        for c in comps {
            self.ds_elems.extend(c.elems.iter().copied());
            self.ds_released.retain(|k| !c.elems.contains(&(k.0, k.1)));
            self.ds_done.retain(|e| !c.elems.contains(e));
        }
        let active = std::mem::take(&mut self.active);
        let r = (|| -> Result<(), Halt> {
            self.activate(&mono)?;
            for (lv, rs) in levels {
                brk!("retract_thr_unclosed" => (); self.close_thresholds_below(lv, true)?);
                let (ds, rs): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = rs.into_iter().partition(|r| self.ds_owner(r));
                self.activate(&rs)?;
                self.run_data_comps(comps, lv, &ds)?;
            }
            while !rules.is_empty() && !self.thr_open.is_empty() {
                brk!("retract_thr_unclosed" => break; self.close_thresholds_below(i64::MAX, true)?);
            }
            Ok(())
        })();
        self.active = active;
        self.ds_elems.clear();
        self.ds_done.clear();
        r
    }

    /// Premise -> the live derived facts with a firing that cites it.
    fn citer_map(&self) -> HashMap<FactId, Vec<FactId>> {
        let mut cm: HashMap<FactId, Vec<FactId>> = HashMap::new();
        for x in self.store.firing_keys() {
            if !self.store.alive(x) {
                continue;
            }
            for (_, _, ps) in self.store.firings(x) {
                for p in ps {
                    if let PremRef::Fact(g) = p {
                        let v = cm.entry(g).or_default();
                        if v.last() != Some(&x) {
                            v.push(x);
                        }
                    }
                }
            }
        }
        cm
    }

    /// The facts of plain rules that rest on `seeds`, through each other: all
    /// of them (a cycle supports itself, so a fact is not kept for a firing
    /// inside the closure), none of them base or cited by a cell, all of a
    /// relation `consumer_rules` found. `stop` are facts already taken out.
    fn consumer_facts(&mut self, seeds: &[FactId], forced: &[FactId], rels: &HashSet<Sym>, stop: &HashSet<FactId>, reset: &HashSet<Sym>) -> Result<Vec<FactId>, &'static str> {
        let cm = self.citer_map();
        let mut inside: HashSet<FactId> = stop.clone();
        inside.extend(seeds.iter().copied());
        let mut out: Vec<FactId> = Vec::new();
        for g in forced {
            if inside.insert(*g) {
                out.push(*g);
            }
        }
        let mut frontier: Vec<FactId> = seeds.iter().chain(forced.iter()).copied().collect();
        while !frontier.is_empty() {
            let mut next: Vec<FactId> = Vec::new();
            for g in &frontier {
                for x in cm.get(g).into_iter().flatten() {
                    if inside.contains(x) {
                        continue;
                    }
                    let rec = *self.store.rec(*x);
                    if !rec.base() && (self.tags.count_rel.values().any(|r| *r == rec.rel) || self.lattices.contains_key(&rec.rel)) && !rels.contains(&rec.rel) {
                        continue;
                    }
                    if rec.base() || !rels.contains(&rec.rel) {
                        return Err("a fact that is no plain rule's rests on what changed");
                    }
                    if !self.cells_all_reset(*x, reset) {
                        return Err("a cell rests on what rests on the fact");
                    }
                    inside.insert(*x);
                    out.push(*x);
                    next.push(*x);
                }
            }
            frontier = next;
        }
        Ok(out)
    }

    /// Every cell that rests on `x` belongs to a rule that is read again whole.
    fn cells_all_reset(&mut self, x: FactId, reset: &HashSet<Sym>) -> bool {
        self.supported_cells(x).iter().all(|c| {
            let CellOwner::Body { rule, .. } = self.store.cell(*c).owner;
            reset.contains(&rule)
        })
    }

    /// The facts of a counting tag's derivations (`p@count`) with a firing
    /// that cites `f`.
    fn derivations_citing(&mut self, f: FactId) -> Vec<FactId> {
        let mut out = Vec::new();
        let rels: Vec<Sym> = self.tags.count_rel.values().copied().collect();
        for rel in rels {
            for id in self.store.rel_all(&self.h, rel) {
                if self.store.firings(id).iter().any(|(_, _, ps)| ps.contains(&PremRef::Fact(f))) {
                    out.push(id);
                }
            }
        }
        out
    }

    /// Retract the base facts `doomed` (the first is the one asked for, the
    /// rest its `asserted_by` rows) and bring the cells it supported to the
    /// state a fresh evaluation would hold. `Err(reason)` leaves the store
    /// either untouched or removed-from and dirty: the caller removes the
    /// facts if they are still there, and the next `ensure` evaluates.
    pub fn retract_delta(&mut self, doomed: &[FactId]) -> Result<Delta, &'static str> {
        let f = doomed[0];
        self.delta_gate(f)?;
        // THE DERIVATIONS OF A COUNTING TAG that rest on the fact: each is a
        // member of the tag's sum, and goes where the fact does
        let citing = self.derivations_citing(f);
        let lost: Vec<FactId> = citing
            .iter()
            .copied()
            .filter(|g| self.store.firings(*g).iter().all(|(_, _, ps)| ps.contains(&PremRef::Fact(f))))
            .collect();
        let mut cells = self.supported_cells(f);
        for g in &lost {
            cells.extend(self.supported_cells(*g));
        }
        cells.sort_unstable();
        cells.dedup();
        // a lattice fact (a join's contribution, a value no fact holds) that rests on the fact
        let lattice_hit = !self.lattices.is_empty()
            && (self.store.citers_of(&HashSet::from([f])).into_iter().any(|x| {
                let rel = self.store.rec(x).rel;
                self.lattices.contains_key(&rel) || self.join_of.contains_key(&rel)
            }) || self.sub_prems.values().any(|fs| fs.iter().any(|ps| ps.contains(&PremRef::Fact(f)))));
        if lattice_hit {
            if !cells.is_empty() || !citing.is_empty() {
                return Err("a fact a cell and a lattice both rest on");
            }
            return self.retract_lattice(doomed);
        }
        // every cell is checked before anything is touched
        let mut cell_rules: Vec<Rc<ERule>> = Vec::with_capacity(cells.len());
        for c in &cells {
            let rec = self.store.cell(*c);
            if matches!(rec.value, CellValue::Hole(_)) {
                return Err("a cell holding a hole");
            }
            let CellOwner::Body { rule, .. } = rec.owner;
            cell_rules.push(self.rule_of(rule).ok_or("the cell's rule is gone")?);
        }
        // WHAT READS THE CELLS' CONCLUSIONS: the facts that rest on one a cell's old record made go, and
        // their rules are fired again once the cells are replaced
        let mut from: HashSet<Sym> = cell_rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next).map(|r| r.clause.head.rel).collect();
        // A COMPONENT STRATIFIED BY ITS DATA that a rule concluding into it reads what changed: its cells are
        // sealed in the order of its data, which a rule fired again at once does not know, so the component is read
        // again whole, its facts and cells gone, and run as it was
        let mut comps: Vec<Rc<DsComp>> = Vec::new();
        // A RULE ANSWERED ON DEMAND that reads what changed, or a rule that calls one: what its calls made is
        // the calls' own (a fact is made for every call whether or not the rest of the rule holds), so every
        // fact made at a call goes, and every rule that reads a relation answered on demand fires again
        let demanded: Vec<Sym> = self.demand_rels.iter().map(|(r, _)| *r).collect();
        let mut called = false;
        let rd = loop {
            let rd = self.consumer_rules(&from, &HashSet::new(), self.store.rec(f).rel)?;
            let hit: Vec<Rc<DsComp>> = self
                .ds_comps
                .iter()
                .filter(|c| !comps.iter().any(|x| Rc::ptr_eq(x, c)) && rd.rules.iter().chain(cell_rules.iter()).any(|r| c.rels.contains(&r.clause.head.rel)))
                .cloned()
                .collect();
            // a fact a question made is no fact of the evaluation: a fresh world has none, so every retraction
            // from a world with a demand relation makes them again, and a world with a lattice as well is evaluated again
            let call = !called && !demanded.is_empty();
            if (hit.is_empty() || brk!("ds_comp_not_reread" => true; false)) && !call {
                break rd;
            }
            if call {
                if !self.lattices.is_empty() {
                    return Err("a world with a lattice holds a relation answered on demand");
                }
                called = true;
                from.extend(demanded.iter().copied());
            }
            for c in hit {
                from.extend(c.rels.iter().copied());
                comps.push(c);
            }
        };
        let Readers { rels: crels, rules: crules, reset, staged: mut restage, .. } = rd;
        // A RULE READ AGAIN WHOLE THAT OWNS A CELL THE FACT SUPPORTS has no use for the subtraction: its cells are
        // sealed again with the rule, and a cell subtracted from first would be one a fresh evaluation does not
        // hold. (A rule read again whole that concludes what a changed cell's rule concludes needs nothing more:
        // the facts of the relation go, the cell is replaced and the rules fire again.)
        let cells: Vec<CellId> = cells.iter().zip(&cell_rules).filter(|(_, r)| brk!("retract_swept_cell_subtracted" => true; !reset.contains(&r.id))).map(|(c, _)| *c).collect();
        let mut owners = Vec::with_capacity(cells.len());
        for c in &cells {
            let rec = self.store.cell(*c);
            let owner = self.delta_owner(*c)?;
            match rec.op {
                AggOp::Rank => return Err("a rank, whose group is shared across its subjects"),
                AggOp::Quantile if matches!(owner.1.vals[0].kind(), TermK::Var(_)) => return Err("a quantile whose percent is read from outside"),
                _ => {}
            }
            if owner.0.clause.head.temporal == Temporal::Next && !restage.iter().any(|r| r.id == owner.0.id) {
                restage.push(owner.0.clone());
            }
            owners.push(owner);
        }
        let mut forced = self.reset_facts(&Readers { rels: crels.clone(), rules: crules.clone(), reset: reset.clone(), staged: Vec::new(), demand: false })?;
        let mut made = 0;
        if called {
            for rel in &demanded {
                for id in self.store.rel_all(&self.h, *rel) {
                    if self.store.rec(id).base() {
                        return Err("a fact is asserted into a relation answered on demand");
                    }
                    if !forced.contains(&id) && brk!("retract_demand_kept" => false; true) {
                        forced.push(id);
                        made += 1;
                    }
                }
            }
        }
        let mut seeds: Vec<FactId> = vec![f];
        for (c, o) in cells.iter().zip(owners.iter()).filter(|(_, o)| o.0.clause.head.temporal != Temporal::Next) {
            for id in self.store.rel_all(&self.h, o.0.clause.head.rel) {
                if self.store.firings(id).iter().any(|(_, _, ps)| ps.contains(&PremRef::Cell(*c))) {
                    seeds.push(id);
                }
            }
        }
        let consumers = if crules.is_empty() { Vec::new() } else { self.consumer_facts(&seeds, &forced, &crels, &HashSet::new(), &reset)? };
        self.store.remove_many(doomed);
        if let Some(ix) = self.support_ix.as_mut() {
            ix.remove(&f);
        }
        let mut d = Delta { cells: cells.len(), consumers: consumers.len(), stacked_rules: reset.len(), components: comps.len(), demanded: made, ..Delta::default() };
        brk!("retract_consumers_kept" => (); {
            self.withdraw_firings(&consumers, |_, _| true);
            self.store.remove_many(&consumers);
            self.store.sweep();
        });
        d.stacked_cells = if reset.is_empty() { 0 } else { self.reset_cells(&reset) };
        if let Some(ix) = self.support_ix.as_mut() {
            for g in &consumers {
                ix.remove(g);
            }
        }
        let withdrawn = brk!("retract_tag_derivations_kept" => Vec::new(); self.withdraw_firings(&citing, |_, ps| ps.contains(&PremRef::Fact(f))));
        d.withdrawn = withdrawn.len();
        if let Some(ix) = self.support_ix.as_mut() {
            for g in &withdrawn {
                ix.remove(g);
            }
        }
        let outer = (self.steps, self.rows);
        self.steps = 0;
        let holes0 = self.store.rel_count(self.v.hole);
        let gone: Vec<FactId> = std::iter::once(f).chain(withdrawn.iter().copied()).collect();
        let mut ambiguous = false;
        let r = (|| -> Result<(), Halt> {
            for (c, (er, agg, plan)) in cells.iter().zip(owners.iter()) {
                self.delta_cell(*c, &gone, er, agg, plan, &mut d)?;
            }
            self.refire(&crules, &comps)?;
            if !reset.is_empty() {
                self.support_ix = None;
            }
            ambiguous = self.restage(&restage, &mut d)?;
            // a hole is written with its shrugs after a whole pass, so a delta that made one is not one
            if brk!("retract_hole_kept" => false; self.store.rel_count(self.v.hole) > holes0) {
                return Err(Halt::Bug("a delta wrote a hole".into()));
            }
            Ok(())
        })();
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
                Err("the delta would write a hole, seal a cell nothing indexes or meet a wall; the world is evaluated again")
            }
        }
    }

    /// THE FACTS STAGED `@next` THAT RESTED ON WHAT CHANGED: those whose firing cites a fact or a cell that is gone
    /// are taken out, and every rule that stages into their relations (or that read what changed) fires again over
    /// the world as it now stands. A staged fact is kept with its FIRST firing, which is the schedule's, so a
    /// fact a second firing reaches (`staged_watch`) is the one case a delta cannot promise: it is answered
    /// `true` and the world is evaluated again.
    fn restage(&mut self, affected: &[Rc<ERule>], d: &mut Delta) -> Result<bool, Halt> {
        if affected.is_empty() {
            return Ok(false);
        }
        let store = &self.store;
        let dead: Vec<FKey> = self
            .staged
            .iter()
            .filter(|(_, f)| {
                f.prems.iter().any(|p| match p {
                    PremRef::Fact(g) => !store.alive(*g),
                    PremRef::Cell(c) => store.cell_dead(*c),
                    _ => false,
                })
            })
            .map(|(k, _)| k.clone())
            .collect();
        let mut rels: HashSet<Sym> = affected.iter().map(|r| r.clause.head.rel).collect();
        rels.extend(dead.iter().map(|k| k.0));
        if brk!("restage_dead_kept" => false; true) {
            for k in &dead {
                self.staged.remove(k);
            }
        }
        d.restaged += dead.len();
        let rules: Vec<Rc<ERule>> = self.rules.iter().filter(|r| r.clause.head.temporal == Temporal::Next && rels.contains(&r.clause.head.rel)).cloned().collect();
        let cells0 = self.store.cell_count();
        let active = std::mem::take(&mut self.active);
        self.staged_watch = Some(false);
        let r = self.fire_all(rules);
        let many = self.staged_watch.take().unwrap_or(false);
        self.active = active;
        r?;
        while !self.thr_open.is_empty() {
            self.close_thresholds_below(i64::MAX, true)?;
        }
        if self.store.cell_count() != cells0 {
            self.support_ix = None;
        }
        Ok(many)
    }

    /// A FACT AN ORDER LATTICE RESTS ON. The lattice facts whose firings cite
    /// it, and those whose firings cite them, and so on, are its cone: taken
    /// out with their firings and provenance (a cycle supports itself, so a
    /// fact is not kept for a firing inside the cone), and then the rules
    /// into the cone's relations are fired again over what stands, which is
    /// how the evaluation concluded them, and the relations close again. A
    /// key that is derived again holds what a fresh evaluation holds: the
    /// best value its rules reach and every firing of that value over final
    /// facts.
    ///
    /// REFUSED, and the world evaluated again: a value kept as history (a
    /// fact no firing over final values founds), a fact outside the lattice
    /// that rests on a lattice fact, a cell that does, a rule into the cone
    /// that negates, aggregates or reads a lattice from outside its
    /// recursion (it fires once its input closes, in a stratum of its own), a
    /// join, a widening, and a hole or a fault made on the way.
    fn retract_lattice(&mut self, doomed: &[FactId]) -> Result<Delta, &'static str> {
        if !self.ds_comps.is_empty() {
            return Err("a lattice in a world with an aggregate component stratified by its data");
        }
        if !self.demand_rels.is_empty() {
            return Err("a lattice in a world with a rule answered on demand");
        }
        let f = doomed[0];
        let mut cone: Vec<FactId> = Vec::new();
        let mut cone_keys: HashSet<LatKey> = HashSet::new();
        // cone facts a cell rests on: the rule of the cell is read again whole, or the world is
        let mut cell_cited: Vec<FactId> = Vec::new();
        let mut inside: HashSet<FactId> = HashSet::new();
        let mut frontier: HashSet<FactId> = HashSet::from([f]);
        const JOIN: &str = "a join or a widening rests on it: its contributions are the history of the schedule that read them";
        while !frontier.is_empty() {
            let mut next: HashSet<FactId> = HashSet::new();
            let mut added: Vec<FactId> = Vec::new();
            for x in self.store.citers_of(&frontier) {
                if inside.contains(&x) {
                    continue;
                }
                let cites = |ps: &Vec<PremRef>| ps.iter().any(|p| matches!(p, PremRef::Fact(g) if frontier.contains(g)));
                let firings = self.store.firings(x);
                let rested = brk!("retract_lattice_precise" => firings.iter().all(|(_, _, ps)| cites(ps)); firings.iter().any(|(_, _, ps)| cites(ps)));
                if !rested {
                    continue;
                }
                let rel = self.store.rec(x).rel;
                if self.join_of.contains_key(&rel) {
                    return Err(JOIN);
                }
                match self.lattices.get(&rel) {
                    Some((_, op)) if matches!(op.class(), Class::IdempotentOrder | Class::PartialOrder) => {}
                    Some(_) => return Err(JOIN),
                    // a fact of a plain rule: taken out below, with what rests on it
                    None => continue,
                }
                if !self.store.alive(x) {
                    return Err("a lattice keeps the history of a superseded value");
                }
                if !self.supported_cells(x).is_empty() {
                    cell_cited.push(x);
                }
                inside.insert(x);
                cone.push(x);
                added.push(x);
            }
            // THE FRONT OF A SUBSUMPTIVE CELL IS ONE KEY: a value of it that rests on the
            // fact takes the others with it, which are then derived again with it, as
            // what each dominated is decided against every value the key was given. So is
            // the key of a value no fact holds (it was dominated when it was given) whose
            // firing rested on a fact of the cone
            let mut keys: Vec<LatKey> = Vec::new();
            for ((ck, _), firings) in &self.sub_prems {
                if firings.iter().any(|ps| ps.iter().any(|p| matches!(p, PremRef::Fact(g) if frontier.contains(g)))) && !keys.contains(ck) {
                    keys.push(ck.clone());
                }
            }
            for x in &added {
                let rec = *self.store.rec(*x);
                if let Some(sub) = self.subs.get(&rec.rel) {
                    let ck: LatKey = (rec.rel, rec.persp, self.store.args(*x)[..sub.keylen].into());
                    if !keys.contains(&ck) {
                        keys.push(ck);
                    }
                }
            }
            for ck in keys {
                if !cone_keys.insert(ck.clone()) {
                    continue;
                }
                for y in self.store.rel_all(&self.h, ck.0) {
                    if inside.contains(&y) || self.store.rec(y).persp != ck.1 || self.store.args(y)[..ck.2.len()] != ck.2[..] {
                        continue;
                    }
                    if !self.supported_cells(y).is_empty() {
                        cell_cited.push(y);
                    }
                    inside.insert(y);
                    cone.push(y);
                    added.push(y);
                }
            }
            next.extend(added);
            frontier = next;
        }
        let rels: HashSet<Sym> = cone.iter().map(|x| self.store.rec(*x).rel).collect();
        // the close of a relation decides again which superseded values its facts still need
        if self.store.firing_keys().into_iter().any(|g| !self.store.alive(g) && rels.contains(&self.store.rec(g).rel)) {
            return Err("a lattice keeps the history of a superseded value");
        }
        let rd = self.consumer_rules(&rels, &rels, self.store.rec(f).rel)?;
        let Readers { rels: crels, rules: crules, reset, .. } = rd;
        if !cell_cited.iter().all(|x| self.cells_all_reset(*x, &reset)) {
            return Err("a cell rests on a lattice fact");
        }
        let forced = self.reset_facts(&Readers { rels: crels.clone(), rules: crules.clone(), reset: reset.clone(), staged: Vec::new(), demand: false })?;
        let consumers = if crules.is_empty() {
            Vec::new()
        } else {
            let stop: HashSet<FactId> = cone.iter().copied().chain([f]).collect();
            let seeds: Vec<FactId> = cone.iter().copied().chain([f]).collect();
            self.consumer_facts(&seeds, &forced, &crels, &stop, &reset)?
        };
        let direct: Vec<FactId> = self.store.citers_of(&HashSet::from([f]));
        if direct.iter().any(|x| self.store.alive(*x) && !inside.contains(x) && !consumers.contains(x) && !self.lattices.contains_key(&self.store.rec(*x).rel)) {
            return Err("a fact outside the lattice rests on a lattice fact");
        }
        let rel_f = self.store.rec(f).rel;
        if self.subs.values().any(|x| x.reads.contains(&rel_f)) {
            return Err("a dominance rule reads the fact");
        }
        let late = self.answer.late.clone();
        let mut rules: Vec<Rc<ERule>> = Vec::new();
        for r in &self.rules {
            if !rels.contains(&r.clause.head.rel) {
                continue;
            }
            if self.subs.get(&r.clause.head.rel).is_some_and(|x| !x.reads.is_empty()) {
                return Err("a subsumptive relation is compared by what rules derive, closed before its values are");
            }
            if r.has_neg || r.has_agg || r.has_thr || !r.lattice_outer.is_empty() || r.clause.head.temporal == Temporal::Next || late.contains(&r.id) || self.shrug_readers.contains(&r.id) || !r.safe {
                return Err("a rule into the lattice negates, aggregates, reads a lattice from outside its recursion or is staged");
            }
            rules.push(r.clone());
        }
        let mut d = Delta { cone: cone.len(), consumers: consumers.len(), stacked_rules: reset.len(), ..Delta::default() };
        self.store.remove_many(doomed);
        if let Some(ix) = self.support_ix.as_mut() {
            ix.remove(&f);
        }
        self.withdraw_firings(&cone, |_, _| true);
        self.store.remove_many(&cone);
        brk!("retract_consumers_kept" => (); {
            self.withdraw_firings(&consumers, |_, _| true);
            self.store.remove_many(&consumers);
        });
        self.store.sweep();
        d.stacked_cells = if reset.is_empty() { 0 } else { self.reset_cells(&reset) };
        // what the evaluation kept of the values a cone key was given goes with its facts; the other
        // keys of the relation are not judged again at the close
        for ck in &cone_keys {
            self.sub_cur.remove(ck);
            self.sub_seen.remove(ck);
            self.sub_memo.remove(ck);
            self.sub_parties.remove(ck);
        }
        self.sub_seen_set.retain(|(ck, _), _| !cone_keys.contains(ck));
        self.sub_beaten.retain(|(ck, _), _| !cone_keys.contains(ck));
        self.sub_prems.retain(|(ck, _), _| !cone_keys.contains(ck));
        self.sub_by.retain(|(ck, _), _| !cone_keys.contains(ck));
        self.sub_by_of.retain(|f, _| !inside.contains(f));
        let rest: Vec<LatKey> = self.sub_seen.keys().filter(|k| rels.contains(&k.0)).cloned().collect();
        let stashed: Vec<(LatKey, Vec<Box<[Term]>>)> = rest.into_iter().filter_map(|k| self.sub_seen.remove(&k).map(|v| (k, v))).collect();
        let outer = (self.steps, self.rows);
        self.steps = 0;
        let holes0 = self.store.rel_count(self.v.hole);
        let active = std::mem::take(&mut self.active);
        let was = self.lat_closed.clone();
        for r in &rels {
            self.lat_closed.remove(r);
        }
        let store = &self.store;
        self.lat_cur.retain(|_, id| store.alive(*id));
        self.height_memo.clear();
        let r = (|| -> Result<(), Halt> {
            self.activate(&rules)?;
            self.close_lattices_below(i64::MAX)?;
            self.active.clear();
            self.refire(&crules, &[])?;
            if !reset.is_empty() {
                self.support_ix = None;
            }
            if brk!("retract_lattice_hole_kept" => false; self.store.rel_count(self.v.hole) > holes0 || !self.lat_pending.is_empty()) {
                return Err(Halt::Bug("a lattice delta made a hole".into()));
            }
            if self.lat_superseded.iter().any(|g| rels.contains(&self.store.rec(*g).rel)) {
                return Err(Halt::Bug("a lattice delta kept a history".into()));
            }
            Ok(())
        })();
        self.sub_seen.extend(stashed);
        self.active = active;
        self.cur_front = Front::default();
        (self.steps, self.rows) = outer;
        match r {
            Ok(()) => Ok(d),
            Err(_) => {
                self.lat_closed = was;
                self.store.dirty = true;
                Err("the lattice delta kept a history, wrote a hole or met a wall; the world is evaluated again")
            }
        }
    }

    /// One cell: its new record, the firings that cited the old one, the facts
    /// they concluded, and the rule read again.
    fn delta_cell(&mut self, old: CellId, gone_facts: &[FactId], er: &Rc<ERule>, agg: &Agg, plan: &Rc<AggPlan>, d: &mut Delta) -> Result<(), Halt> {
        let rec = self.store.cell(old).clone();
        let CellOwner::Body { rule, at } = rec.owner;
        let key: Vec<Term> = rec.key.to_vec();
        let threshold = rec.op == AggOp::AtLeast;
        let mut s = Subst::new();
        // a threshold's key is its shared values and then its N
        for (i, k) in key.iter().take(agg.shared.len()).enumerate() {
            s = unify(&self.h, Term::var(agg.shared[i]), *k, &s).ok_or_else(|| Halt::Bug("a cell key is not its own binding".into()))?;
        }
        let corr: Vec<Term> = plan.corr.iter().map(|i| key[*i]).collect();
        // the new record, before anything of the old one is withdrawn
        let (mut fresh, mut gone): (Option<NewCell>, bool) = (None, false);
        if rec.alg.strategy() == Strategy::Subtract {
            if let Some((nc, dropped, again)) = self.subtract_cell(old, gone_facts, plan)? {
                d.subtracted += 1;
                d.members_dropped += dropped;
                d.members_rederived += again;
                gone = nc.is_none();
                fresh = nc;
            }
        }
        // the readers of the old record
        let head = er.clause.head.rel;
        let key_term = self.store.cell_key_term(&mut self.h, old);
        d.retired += brk!("retract_no_readers" => 0; self.drop_readers(er.id, head, old));
        self.forget_reflection(key_term);
        Self::unindex_cell(&self.store, old, self.support_ix.as_mut().unwrap());
        self.store.kill_cell(old);
        let new: Vec<CellId> = match fresh {
            Some(nc) => {
                let id = self.store.add_cell(nc);
                self.reflect_cell(id)?;
                vec![id]
            }
            None if gone => Vec::new(),
            None if brk!("retract_no_rederive" => true; false) => Vec::new(),
            None if threshold => {
                d.rederived += 1;
                self.rederive_threshold(rule, at, agg, plan, &s, &key)?
            }
            None => {
                d.rederived += 1;
                match self.seal_cells(rule, agg, plan, &s, &corr, 0, true)? {
                    Sealed::Kept(cs) => cs,
                    _ => return Err(Halt::Bug("a cell sealed for the store came back ephemeral".into())),
                }
            }
        };
        if brk!("retract_hole_kept" => false; new.iter().any(|c| matches!(self.store.cell(*c).value, CellValue::Hole(_)))) {
            return Err(Halt::Bug("a cell derived again holds a hole".into()));
        }
        for c in &new {
            Self::index_cell(&self.store, *c, self.support_ix.as_mut().unwrap());
        }
        // the correlation's cells, in the order a seal lists them
        let mk = (rule, at, corr.clone().into_boxed_slice());
        let mut cs: Vec<CellId> = self.agg_memo.get(&mk).map(|v| v.to_vec()).unwrap_or_default();
        cs.retain(|x| *x != old);
        cs.extend(new.iter().copied());
        let mut keyed: Vec<(String, CellId)> = cs
            .into_iter()
            .map(|c| {
                let mut k = String::new();
                self.store.write_cell_key(&self.h, c, &mut k);
                (k, c)
            })
            .collect();
        keyed.sort_by(|x, y| cmp_js(&x.0, &y.0));
        brk!("retract_memo_stale" => { let _ = (&mk, &keyed); }; if !threshold {
            self.agg_memo.insert(mk, keyed.into_iter().map(|(_, c)| c).collect::<Vec<_>>().into());
        });
        // what read the cell reads it again, for this key alone
        if !new.is_empty() && er.clause.head.temporal != Temporal::Next && brk!("retract_no_refire" => false; true) {
            let outer = self.cur_rule.replace(er.id);
            let was = std::mem::replace(&mut self.firing, true);
            let cells0 = self.store.cell_count();
            let sols = self.solve_body(&er.plan, s, 0, None, Some(er.id));
            self.firing = was;
            self.cur_rule = outer;
            // a cell sealed by the re-read is one no back-index holds
            if brk!("retract_chain_gate_off" => false; self.store.cell_count() != cells0) {
                return Err(Halt::Bug("the rule read again sealed a cell".into()));
            }
            let mut out = Front::default();
            for sol in sols? {
                self.conclude(er, sol, &mut out)?;
                d.refired += 1;
            }
        }
        Ok(())
    }

    /// A THRESHOLD CELL DERIVED AGAIN: the group asked over the facts as they
    /// stand, and where it still reaches N the cell reached and closed as a
    /// Quorum is (`thr_reach`, `close_thresholds_below`), the reflection and
    /// the first N members by height and projection included. A group that no
    /// longer reaches N has no cell.
    fn rederive_threshold(&mut self, rule: Sym, at: u32, agg: &Agg, plan: &Rc<AggPlan>, s: &Subst, key: &[Term]) -> Result<Vec<CellId>, Halt> {
        let need = match key.last().map(|n| n.kind()) {
            Some(TermK::Int(k)) => k.max(0) as usize,
            _ => return Err(Halt::Bug("a threshold cell key does not end in its N".into())),
        };
        self.thr_cells.remove(&(rule, at, key.to_vec().into_boxed_slice()));
        self.thr_acc.retain(|(r, _, _), _| *r != rule);
        let (groups, _) = self.thr_groups(rule, agg, plan, s, 0, true, None)?;
        let members = groups.into_iter().next().map(|g| g.1).unwrap_or_default();
        if members.len() < need {
            return Ok(Vec::new());
        }
        let c = self.thr_reach(rule, agg, plan, s, key.to_vec(), need, members)?;
        brk!("retract_thr_no_close" => (); self.close_thresholds_below(i64::MAX, false)?);
        Ok(vec![c])
    }

    /// THE SUBTRACTION: the cell without the members the retracted facts supported, as a
    /// record. `None` when the cell cannot be subtracted (a total that left
    /// the range): it is derived again.
    /// `Some((None, ..))` is a cell that is gone (a group with no member). The
    /// counts are members dropped and members that kept their place.
    #[allow(clippy::type_complexity)]
    fn subtract_cell(&mut self, old: CellId, gone: &[FactId], plan: &Rc<AggPlan>) -> Result<Option<(Option<NewCell>, usize, usize)>, Halt> {
        let rec = self.store.cell(old).clone();
        let CellValue::Value(total) = rec.value else { return Ok(None) };
        let TermK::Int(n) = total.kind() else { return Ok(None) };
        let mut acc = Val::Int(n as i128);
        type Derivs = Vec<Vec<PremRef>>;
        let members: Vec<(Box<[Term]>, Term, u32, Derivs)> = self
            .store
            .cell_members(old)
            .iter()
            .map(|m| (m.proj.clone(), m.value, m.height, self.store.member_derivs(m).map(|p| p.to_vec()).collect()))
            .collect();
        let (mut dropped, mut kept_again) = (0usize, 0usize);
        let mut keep: Vec<NewMember> = Vec::with_capacity(members.len());
        for (proj, value, height, derivs) in members {
            // the derivations that stand without the facts that are gone
            let canonical = derivs[0].clone();
            let mut left: Derivs = derivs.iter().filter(|d| !gone.iter().any(|g| d.contains(&PremRef::Fact(*g)))).cloned().collect();
            if left.len() == derivs.len() || brk!("retract_stale_rep" => true; false) {
                let mut all = derivs;
                let prems = all.remove(0);
                keep.push(NewMember { proj, value, height, prems, others: all });
                continue;
            }
            if left.is_empty() || brk!("retract_alt_member_dropped" => left.len() < derivs.len(); false) {
                let x = plan.op.lift(&self.v, value).map_err(|_| Halt::Bug("a member's value no longer lifts".into()))?;
                match brk!("retract_no_subtract" => Some(acc); plan.op.subtract(acc, x)) {
                    Some(a) => acc = a,
                    None => return Ok(None),
                }
                dropped += 1;
                continue;
            }
            let prems = left.remove(0);
            let height = if prems == canonical {
                height
            } else {
                kept_again += 1;
                self.member_height(&prems)?
            };
            keep.push(NewMember { proj, value, height, prems, others: left });
        }
        let mut keyed: Vec<(String, u32, usize)> = keep.iter().enumerate().map(|(i, m)| (tuple_text(&self.h, &m.proj), m.height, i)).collect();
        keyed.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| cmp_js(&a.0, &b.0)));
        let mut slots: Vec<Option<NewMember>> = keep.into_iter().map(Some).collect();
        let members: Vec<NewMember> = keyed.into_iter().map(|(_, _, i)| slots[i].take().unwrap()).collect();
        let height = members.iter().map(|m| m.height).max().unwrap_or(0);
        let value = if members.is_empty() {
            if !plan.group.is_empty() || brk!("retract_empty_gone" => true; false) {
                return Ok(Some((None, dropped, kept_again)));
            }
            if plan.empty_zero {
                CellValue::Value(plan.op.lower(&mut self.h, &self.v, plan.op.identity().unwrap()))
            } else {
                CellValue::Empty
            }
        } else {
            match plan.op.finish(&self.v, Some(acc)) {
                Ok(Some(x)) => CellValue::Value(plan.op.lower(&mut self.h, &self.v, x)),
                _ => return Ok(None),
            }
        };
        let seals = self.store.cell_seals(old).to_vec();
        Ok(Some((
            Some(NewCell { owner: rec.owner, op: rec.op, key: rec.key.clone(), value, height, tick: rec.tick, desc: rec.desc, members, seals }),
            dropped,
            kept_again,
        )))
    }

    /// The firings of `rule` that cite `cell`, removed, and the facts that
    /// lost their last firing, and their provenance rows, with them.
    fn drop_readers(&mut self, rule: Sym, head: Sym, cell: CellId) -> usize {
        let ids = self.store.rel_all(&self.h, head);
        self.withdraw_firings(&ids, |r, ps| r == rule && ps.contains(&PremRef::Cell(cell))).len()
    }

    /// The firings of `ids` that `cited` holds for, removed; a fact that lost
    /// its last firing goes unless it is base, and its provenance rows with it
    /// (every row of a rule none of whose firings is left). The facts gone.
    fn withdraw_firings(&mut self, ids: &[FactId], cited: impl Fn(Sym, &[PremRef]) -> bool) -> Vec<FactId> {
        let mut retire: Vec<FactId> = Vec::new();
        let mut rows: Vec<[Term; 3]> = Vec::new();
        for &id in ids {
            let (rel, persp) = (self.store.rec(id).rel, self.store.rec(id).persp);
            let args = self.store.args(id).to_vec();
            let ft = fact_term(&mut self.h, &self.v, rel, persp, &args);
            for (r, tick, prems) in self.store.firings(id) {
                if cited(r, &prems) && self.store.remove_firing(id, r, &prems) && !self.store.fired_by(id, r) {
                    rows.push([ft, Term::atom(r), Term::int(tick as i64)]);
                }
            }
            if self.store.support_count(id) == 0 && !self.store.rec(id).base() {
                retire.push(id);
            }
        }
        let mut gone = retire.clone();
        for args in rows {
            if let Some(r) = self.store.get(self.v.derived_by, self.v.kernel_persp, &args) {
                gone.push(r);
            }
        }
        self.store.remove_many(&gone);
        retire
    }

    /// The reflection of a cell, withdrawn: every row of the cell's name.
    fn forget_reflection(&mut self, key: Term) {
        let mut gone: Vec<FactId> = Vec::new();
        for rel in [self.v.agg_cell, self.v.agg_sealed, self.v.agg_member, self.v.agg_member_prem] {
            for id in self.store.rel_all(&self.h, rel) {
                if self.store.args(id).first() == Some(&key) {
                    gone.push(id);
                }
            }
        }
        self.store.remove_many(&gone);
    }
}
