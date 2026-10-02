//! THE RETRACTION PATH: a base fact leaves an evaluated world and the
//! aggregate cells it supported are brought to what a fresh evaluation would
//! hold, without evaluating the world again (docs/aggregates.md, "Ready for
//! the incremental engine"; `f_a_retraction_updates_the_cells_it_supports`).
//!
//! WHAT IT DOES, per cell the fact supports (the back-index, `support_ix`):
//!
//! - an INVERTIBLE cell (count, sum) subtracts: the members whose
//!   representative derivation cites the fact are derived again, each alone
//!   (the aggregate's inner body solved with the group and the member's
//!   projection bound); one with no derivation left is dropped and its value
//!   taken from the total with `AggOp::subtract`, one with another derivation
//!   keeps its place under that derivation, which is the least signature
//!   among those left;
//! - an IDEMPOTENT cell (min, max, or, and) has no inverse and keeps only the
//!   members that reach its value, so it is derived again from the facts, the
//!   one cell alone (`seal_cells` with its key bound);
//! - then what read the cell is read again: the firings that cited the old
//!   record go, the facts they concluded go with their last firing, and the
//!   rule is solved with the cell's key bound against the new record.
//!
//! WHAT IT REFUSES, and says why, leaving the world as a full evaluation
//! would take it (`Err(reason)`; the caller evaluates again): a world a delta
//! is not worked out for (ticks, lattices, tags, thresholds, holes, walls,
//! the well-founded mode), a fact something other than an aggregate reads, a
//! cell of another algebra (holistic cells share members), a cell whose
//! conclusion another rule reads or whose reflection a rule reads. Each is a
//! bounded job for the delta engine proper; none is a reason to answer
//! differently than a full evaluation does.
//!
//! The result is the one a full evaluation gives, byte for byte in
//! `canonical_state` (rust/rofl/tests/incremental.rs holds it over random
//! edits).
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
    /// facts of its representative derivation only, which is all a retraction
    /// needs: a derivation that is not a member's representative decides
    /// nothing about the member while it stands or falls.
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
            for p in store.member_prems(m) {
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
            for p in store.member_prems(m) {
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
        if !self.lattices.is_empty() || !self.subs.is_empty() || !self.tags.by_rel.is_empty() {
            return Err("the world declares a lattice, a subsumption or a tag");
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
        let ledgers = [self.v.asserted_by, self.v.agg_cell, self.v.agg_member, self.v.agg_member_prem, self.v.agg_sealed, self.v.derived_by, self.v.hole, self.v.shrug];
        let mut why: Option<&'static str> = None;
        for r in &self.rules {
            if r.clause.head.rel == rel {
                why = Some("the relation is concluded by a rule too");
            }
            for b in &r.clause.body {
                walk(b, false, &mut |l, neg, inner| {
                    if ledgers.contains(&l.rel) {
                        why = Some("a rule reads the ledger of cells, provenance or assertions");
                    }
                    if l.rel == rel && brk!("retract_gate_plain" => neg, "retract_gate_neg" => !neg && !inner; neg || !inner) {
                        why = Some("a rule reads the relation outside an aggregate, or negated");
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
        if er.has_thr || er.clause.head.temporal == Temporal::Next {
            return Err("a threshold, or a conclusion @next");
        }
        let head = er.clause.head.rel;
        let mut read = false;
        for o in &self.rules {
            for b in &o.clause.body {
                walk(b, false, &mut |l, _, _| read |= l.rel == head);
            }
        }
        if read {
            return Err("a rule reads what the aggregate's rule concludes");
        }
        Ok((er, agg, plan))
    }

    /// Retract the base facts `doomed` (the first is the one asked for, the
    /// rest its `asserted_by` rows) and bring the cells it supported to the
    /// state a fresh evaluation would hold. `Err(reason)` leaves the store
    /// either untouched or removed-from and dirty: the caller removes the
    /// facts if they are still there, and the next `ensure` evaluates.
    pub fn retract_delta(&mut self, doomed: &[FactId]) -> Result<Delta, &'static str> {
        let f = doomed[0];
        self.delta_gate(f)?;
        let cells = self.supported_cells(f);
        // every cell is checked before anything is touched
        let mut owners = Vec::with_capacity(cells.len());
        for c in &cells {
            let rec = self.store.cell(*c);
            if !matches!(rec.op.algebra().strategy(), Strategy::Subtract | Strategy::Rederive) || rec.op.class() == Class::Threshold {
                return Err("a cell of an algebra with no delta yet (holistic, threshold)");
            }
            if matches!(rec.value, CellValue::Hole(_)) {
                return Err("a cell holding a hole");
            }
            owners.push(self.delta_owner(*c)?);
        }
        self.store.remove_many(doomed);
        if let Some(ix) = self.support_ix.as_mut() {
            ix.remove(&f);
        }
        let mut d = Delta { cells: cells.len(), ..Delta::default() };
        let outer = (self.steps, self.rows);
        self.steps = 0;
        let r = (|| -> Result<(), Halt> {
            for (c, (er, agg, plan)) in cells.iter().zip(owners.iter()) {
                self.delta_cell(*c, f, er, agg, plan, &mut d)?;
            }
            Ok(())
        })();
        self.cur_front = Front::default();
        (self.steps, self.rows) = outer;
        match r {
            Ok(()) => Ok(d),
            Err(_) => {
                self.store.dirty = true;
                Err("a wall or a defect inside the delta; the world is evaluated again")
            }
        }
    }

    /// One cell: its new record, the firings that cited the old one, the facts
    /// they concluded, and the rule read again.
    fn delta_cell(&mut self, old: CellId, f: FactId, er: &Rc<ERule>, agg: &Agg, plan: &Rc<AggPlan>, d: &mut Delta) -> Result<(), Halt> {
        let rec = self.store.cell(old).clone();
        let CellOwner::Body { rule, at } = rec.owner;
        let key: Vec<Term> = rec.key.to_vec();
        let mut s = Subst::new();
        for (i, k) in key.iter().enumerate() {
            s = unify(&self.h, Term::var(agg.shared[i]), *k, &s).ok_or_else(|| Halt::Bug("a cell key is not its own binding".into()))?;
        }
        let corr: Vec<Term> = plan.corr.iter().map(|i| key[*i]).collect();
        // the new record, before anything of the old one is withdrawn
        let (mut fresh, mut gone): (Option<NewCell>, bool) = (None, false);
        if rec.alg.strategy() == Strategy::Subtract {
            if let Some((nc, dropped, again)) = self.subtract_cell(old, f, agg, plan, &s)? {
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
            None => {
                d.rederived += 1;
                match self.seal_cells(rule, agg, plan, &s, &corr, 0, true)? {
                    Sealed::Kept(cs) => cs,
                    _ => return Err(Halt::Bug("a cell sealed for the store came back ephemeral".into())),
                }
            }
        };
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
        brk!("retract_memo_stale" => { let _ = (&mk, &keyed); }; {
            self.agg_memo.insert(mk, keyed.into_iter().map(|(_, c)| c).collect::<Vec<_>>().into());
        });
        // what read the cell reads it again, for this key alone
        if !new.is_empty() && brk!("retract_no_refire" => false; true) {
            let outer = self.cur_rule.replace(er.id);
            let was = std::mem::replace(&mut self.firing, true);
            let sols = self.solve_body(&er.plan, s, 0, None, Some(er.id));
            self.firing = was;
            self.cur_rule = outer;
            let mut out = Front::default();
            for sol in sols? {
                self.conclude(er, sol, &mut out)?;
                d.refired += 1;
            }
        }
        Ok(())
    }

    /// THE SUBTRACTION: the cell without the members `f` supported, as a
    /// record. `None` when the cell cannot be subtracted (a projection that
    /// is no variable, a total that left the range): it is derived again.
    /// `Some((None, ..))` is a cell that is gone (a group with no member). The
    /// counts are members dropped and members that kept their place.
    #[allow(clippy::type_complexity)]
    fn subtract_cell(&mut self, old: CellId, f: FactId, agg: &Agg, plan: &Rc<AggPlan>, s: &Subst) -> Result<Option<(Option<NewCell>, usize, usize)>, Halt> {
        let rec = self.store.cell(old).clone();
        let CellOwner::Body { rule, .. } = rec.owner;
        let params = plan.op.params();
        let mut pvars: Vec<Sym> = Vec::new();
        for t in agg.vals[params..].iter().chain(agg.keys.iter()) {
            match t.kind() {
                TermK::Var(v) => pvars.push(v),
                _ => return Ok(None),
            }
        }
        let CellValue::Value(total) = rec.value else { return Ok(None) };
        let TermK::Int(n) = total.kind() else { return Ok(None) };
        let mut acc = Val::Int(n as i128);
        let members: Vec<(Box<[Term]>, Term, u32, Vec<PremRef>)> = self
            .store
            .cell_members(old)
            .iter()
            .map(|m| (m.proj.clone(), m.value, m.height, self.store.member_prems(m).to_vec()))
            .collect();
        let (mut dropped, mut kept_again) = (0usize, 0usize);
        let mut keep: Vec<NewMember> = Vec::with_capacity(members.len());
        for (proj, value, height, prems) in members {
            if !prems.contains(&PremRef::Fact(f)) || brk!("retract_stale_rep" => true; false) {
                keep.push(NewMember { proj, value, height, prems });
                continue;
            }
            // this member alone, derived again
            let mut sm = s.clone();
            for (v, t) in pvars.iter().zip(proj.iter()) {
                sm = match unify(&self.h, Term::var(*v), *t, &sm) {
                    Some(x) => x,
                    None => return Ok(None),
                };
            }
            let (found, fault) = self.inner_cands(rule, agg, plan, &sm, 0, true, None, true)?;
            if fault.is_some() {
                return Ok(None);
            }
            let best = found.into_iter().flat_map(|(_, cs)| cs).min_by(|a, b| cmp_js(&a.sig, &b.sig));
            match best {
                Some(c) => {
                    let height = self.member_height(&c.prems)?;
                    keep.push(NewMember { proj, value, height, prems: c.prems });
                    kept_again += 1;
                }
                None => {
                    let x = plan.op.lift(&self.v, value).map_err(|_| Halt::Bug("a member's value no longer lifts".into()))?;
                    match brk!("retract_no_subtract" => Some(acc); plan.op.subtract(acc, x)) {
                        Some(a) => acc = a,
                        None => return Ok(None),
                    }
                    dropped += 1;
                }
            }
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
        let mut retire: Vec<FactId> = Vec::new();
        let mut rows: Vec<[Term; 3]> = Vec::new();
        for id in self.store.rel_all(&self.h, head) {
            let (rel, persp) = (self.store.rec(id).rel, self.store.rec(id).persp);
            let args = self.store.args(id).to_vec();
            let ft = fact_term(&mut self.h, &self.v, rel, persp, &args);
            for (r, tick, prems) in self.store.firings(id) {
                if r == rule && prems.contains(&PremRef::Cell(cell)) && self.store.remove_firing(id, r, &prems) && !self.store.fired_by(id, r) {
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
        retire.len()
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
