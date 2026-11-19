//! WHAT A RETRACTION LEAVES OF THE ENGINE'S OLD ONE-FACT DELTA: the machinery the set's pass (addition.rs
//! `retract_set`, the one path a fact leaves an evaluated world by since 2026-11-18) and the additions share, the
//! window a delta fires in, the cells it resets and kills, the firings it withdraws, what it stages again, and
//! `Delta`, what `Session::retract_delta` answers (the set's pass in `set`). The one-fact delta itself (cells subtracted,
//! a lattice's cone, the readers read again whole) was deleted: the set's pass takes what it took
//! (f_the_one_fact_fallback_is_a_debt).
use crate::store::Prem;
use super::datastrat::DsComp;
use super::*;

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
    /// relations a hole or a shrug may move that the change reached, evaluated again after the rest
    pub holed: usize,
    /// cells of those rules, sealed again
    pub stacked_cells: usize,
    /// staged facts (`@next`) that rested on what changed, taken out
    pub restaged: usize,
    /// components stratified by their data, read again whole (`ds_walk` and all)
    pub components: usize,
    /// facts a rule answered on demand concluded at a call, taken out with the calls that made them
    pub demanded: usize,
    /// the fact taken out by the set's pass (`retract_set`) where this one is not worked out, and what it did
    pub set: Option<Box<AddDelta>>,
}

type Support = HashMap<FactId, Vec<CellId>>;

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
                if let Prem::Fact(g) = p.kind() {
                    let v = ix.entry(g).or_default();
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
                if let Prem::Fact(g) = p.kind() {
                    if let Some(v) = ix.get_mut(&g) {
                        v.retain(|x| *x != c);
                    }
                }
            }
        }
    }

    /// A cell of a rule whose relation the delta leaves to the pass after it.
    fn aside_cell(&self, c: CellId) -> bool {
        let CellOwner::Body { rule, .. } = self.store.cell(c).owner;
        !self.aside.is_empty() && self.rule_of(rule).is_some_and(|r| self.aside.contains(&r.clause.head.rel))
    }

    /// The cells a retraction of `f` reaches, from the back-index.
    pub fn supported_cells(&mut self, f: FactId) -> Vec<CellId> {
        let mut v = brk!("retract_index_off" => Vec::new(); self.support_index().get(&f).cloned().unwrap_or_default());
        v.retain(|c| !self.store.cell_dead(*c) && !self.aside_cell(*c));
        v.sort_unstable();
        v
    }

    /// The counters a delta run starts from (given back by `end_window`) and the holes there are before it.
    pub(super) fn begin_window(&mut self) -> ((i64, i64), usize) {
        let outer = (self.steps, self.rows);
        self.steps = 0;
        (outer, self.store.rel_count(self.v.hole))
    }

    pub(super) fn end_window(&mut self, outer: (i64, i64)) {
        self.cur_front = Front::default();
        (self.steps, self.rows) = outer;
    }

    pub(super) fn take_out(&mut self, facts: &[FactId]) {
        self.withdraw_firings(facts, |_, _| true);
        self.store.remove_many(facts);
    }

    /// The cells of the rules read again whole, gone with their reflection.
    pub(super) fn reset_cells(&mut self, reset: &HashSet<Sym>) -> usize {
        if brk!("retract_stacked_cells_kept" => true; false) {
            return 0;
        }
        let cells: Vec<CellId> = self.store.live_cells().into_iter().filter(|c| {
            let CellOwner::Body { rule, .. } = self.store.cell(*c).owner;
            reset.contains(&rule)
        }).collect();
        let n = self.kill_cells(&cells);
        self.memo.thr_open.retain(|(c, _)| !self.store.cell_dead(*c));
        self.memo.thr_acc.retain(|(r, _, _), _| !reset.contains(r));
        self.memo.agg_memo.retain(|(r, _, _), _| !reset.contains(r));
        self.memo.reach_memo.retain(|(r, _, _), _| !reset.contains(r));
        self.cells.agg_opened.retain(|(r, _, _)| !reset.contains(r));
        self.memo.hol_shared.retain(|(r, _, _), _| !reset.contains(r));
        self.memo.height_memo.clear();
        n
    }

    /// THE RULES THAT READ WHAT CHANGED, FIRED AGAIN AS A FULL EVALUATION FIRES
    /// THEM: those that neither negate nor aggregate at once, the others by
    /// level, each level over what the levels below concluded.
    pub(super) fn refire(&mut self, rules: &[Rc<ERule>], comps: &[Rc<DsComp>]) -> Result<(), Halt> {
        let (strat, mono): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = rules.iter().cloned().partition(|r| r.has_neg || r.has_agg || !r.lattice_outer.is_empty() || brk!("demand_strict_refire" => false; r.demand_strict));
        let mut levels: std::collections::BTreeMap<i64, Vec<Rc<ERule>>> = std::collections::BTreeMap::new();
        for r in strat {
            let lv = brk!("retract_stacked_one_level" => 0; self.rule_level(&r));
            levels.entry(lv).or_default().push(r);
        }
        // a component stratified by its data is run as the evaluation runs it: its correlations held, then
        // released a layer at a time
        for c in comps {
            self.ds.elems.extend(c.elems.iter().copied());
            self.ds.released.retain(|k| !c.elems.contains(&(k.0, k.1)));
            self.ds.done.retain(|e| !c.elems.contains(e));
        }
        let active = std::mem::take(&mut self.active);
        let r = (|| -> Result<(), Halt> {
            self.activate(&mono)?;
            for (lv, rs) in levels {
                brk!("retract_thr_unclosed" => (); self.close_thresholds_below(lv, true)?);
                // an order lattice fired again closes at its level, as an evaluation closes it
                brk!("refire_lattice_unclosed" => (); self.close_lattices_below(lv)?);
                let (ds, rs): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = rs.into_iter().partition(|r| self.ds.ds_owner(r));
                self.activate(&rs)?;
                self.run_data_comps(comps, lv, &ds)?;
            }
            brk!("refire_lattice_unclosed" => (); self.close_lattices_below(i64::MAX)?);
            while !rules.is_empty() && !self.memo.thr_open.is_empty() {
                brk!("retract_thr_unclosed" => break; self.close_thresholds_below(i64::MAX, true)?);
                self.close_lattices_below(i64::MAX)?;
            }
            Ok(())
        })();
        self.active = active;
        self.ds.elems.clear();
        self.ds.done.clear();
        r
    }

    /// Premise -> the live derived facts with a firing that cites it.
    pub(super) fn citer_map(&self) -> HashMap<FactId, Vec<FactId>> {
        let mut cm: HashMap<FactId, Vec<FactId>> = HashMap::new();
        for x in self.store.firing_keys() {
            if !self.store.alive(x) {
                continue;
            }
            for (_, _, ps) in self.store.firings(x) {
                for p in ps {
                    if let Prem::Fact(g) = p.kind() {
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
    pub(super) fn consumer_facts(&mut self, seeds: &[FactId], forced: &[FactId], rels: &HashSet<Sym>, stop: &HashSet<FactId>, reset: &HashSet<Sym>) -> Result<Vec<FactId>, &'static str> {
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
                    let rec = self.store.rec(*x);
                    if !rec.base() && (self.lat.algebra(rec.rel).count_of.is_some() || self.lat.is_cell(rec.rel)) && !rels.contains(&rec.rel) {
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

    /// THE FACTS STAGED `@next` THAT RESTED ON WHAT CHANGED: those whose firing cites a fact or a cell that is gone
    /// are taken out, and every rule that stages into their relations (or that read what changed) fires again over
    /// the world as it now stands. A staged fact is kept with its FIRST firing, which is the schedule's, so a
    /// fact a second firing reaches (`staged_watch`) is the one case a delta cannot promise: it is answered
    /// `true` and the world is evaluated again.
    pub(super) fn restage(&mut self, affected: &[Rc<ERule>], d: &mut Delta) -> Result<bool, Halt> {
        if affected.is_empty() {
            return Ok(false);
        }
        let store = &self.store;
        let dead: Vec<FKey> = self
            .staged
            .iter()
            .filter(|(_, f)| {
                f.prems.iter().any(|p| match p.kind() {
                    Prem::Fact(g) => !store.alive(g),
                    Prem::Cell(c) => store.cell_dead(c),
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
        while !self.memo.thr_open.is_empty() {
            self.close_thresholds_below(i64::MAX, true)?;
        }
        if self.store.cell_count() != cells0 {
            self.support_ix = None;
        }
        Ok(many)
    }

    /// The firings of `ids` that `cited` holds for, removed; a fact that lost
    /// its last firing goes unless it is base, and its provenance rows with it
    /// (every row of a rule none of whose firings is left). The facts gone.
    pub(super) fn withdraw_firings(&mut self, ids: &[FactId], cited: impl Fn(Sym, &[PremRef]) -> bool) -> Vec<FactId> {
        let retire = self.withdraw_unswept(ids, cited);
        self.store.sweep();
        retire
    }

    /// `withdraw_firings`, the ids gone left in the runs for one sweep after many (`Store::sweep`). A fact all of
    /// whose firings go loses its chain at once, not a firing at a time.
    pub(super) fn withdraw_unswept(&mut self, ids: &[FactId], cited: impl Fn(Sym, &[PremRef]) -> bool) -> Vec<FactId> {
        let mut retire: Vec<FactId> = Vec::new();
        let mut rows: Vec<[Term; 3]> = Vec::new();
        for &id in ids {
            let (rel, persp) = (self.store.rec(id).rel, self.store.rec(id).persp);
            let args = self.store.args(id).to_vec();
            let ft = fact_term(&mut self.h, &self.v, rel, persp, &args);
            let firings = self.store.firings(id);
            if firings.iter().all(|(r, _, ps)| cited(*r, ps)) {
                // each rule's row goes with the last of its firings, as removing them one at a time from the head says
                let mut last: Vec<(Sym, u32)> = Vec::new();
                for (r, tick, _) in &firings {
                    match last.iter_mut().find(|(q, _)| q == r) {
                        Some(x) => x.1 = *tick,
                        None => last.push((*r, *tick)),
                    }
                }
                self.store.drop_firings(id);
                rows.extend(brk!("withdraw_all_rows_kept" => Vec::new(); last).into_iter().map(|(r, tick)| [ft, Term::atom(r), Term::int(tick as i64)]));
            } else {
                for (r, tick, prems) in firings {
                    if cited(r, &prems) && self.store.remove_firing(id, r, &prems) && !self.store.fired_by(id, r) {
                        rows.push([ft, Term::atom(r), Term::int(tick as i64)]);
                    }
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
        for g in gone {
            self.store.retire(g);
        }
        retire
    }

    /// `cells` killed, their reflection forgotten in one pass. How many.
    pub(super) fn kill_cells(&mut self, cells: &[CellId]) -> usize {
        let reflected = self.reflected();
        let mut keys: HashSet<Term> = HashSet::new();
        for &c in cells {
            let CellOwner::Body { rule, at } = self.store.cell(c).owner;
            if reflected {
                keys.insert(self.store.cell_key_term(&mut self.h, c));
            }
            if let Some(ix) = self.support_ix.as_mut() {
                Self::unindex_cell(&self.store, c, ix);
            }
            if self.store.cell(c).op == AggOp::AtLeast && brk!("retract_thr_cells_kept" => false; true) {
                let rec = self.store.cell(c);
                self.memo.thr_cells.remove(&(rule, at, rec.key.clone()));
                self.memo.thr_fresh.remove(&c);
            }
            self.store.kill_cell(c);
        }
        self.forget_reflection(&keys);
        cells.len()
    }

    /// Whether a cell has a reflection row to forget.
    fn reflected(&self) -> bool {
        [self.v.agg_cell, self.v.agg_sealed, self.v.agg_member, self.v.agg_member_prem].iter().any(|r| self.store.rel_count(*r) > 0)
    }

    /// The reflection of the cells named `keys`, withdrawn: every row of their names, in one pass.
    fn forget_reflection(&mut self, keys: &HashSet<Term>) {
        if keys.is_empty() {
            return;
        }
        let mut gone: Vec<FactId> = Vec::new();
        for rel in [self.v.agg_cell, self.v.agg_sealed, self.v.agg_member, self.v.agg_member_prem] {
            for id in self.store.rel_all(&self.h, rel) {
                if self.store.args(id).first().is_some_and(|k| keys.contains(k)) {
                    gone.push(id);
                }
            }
        }
        self.store.remove_many(&gone);
    }
}

impl LatticeState {
    pub(super) fn lattice_hole(&self, store: &Store, v: &Vocab, holes0: usize) -> bool {
        store.rel_count(v.hole) > holes0 || !self.pass.pending.is_empty()
    }

    /// What the evaluation kept of the witnesses of the subsumptive keys that `gone` names.
    pub(super) fn forget_sub_witnesses(&mut self, gone: impl Fn(&LatKey) -> bool) {
        self.pass.sub_seen_set.retain(|(k, _), _| !gone(k));
        self.pass.sub_beaten.retain(|(k, _), _| !gone(k));
        self.pass.sub_prems.retain(|(k, _), _| !gone(k));
        self.pass.sub_by.retain(|(k, _), _| !gone(k));
    }
}
