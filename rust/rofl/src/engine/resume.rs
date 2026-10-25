//! A STOP BY BUDGET IS A CONTINUATION (docs/staged-evaluation.md, decision 4).
//!
//! A step wall that falls in the plain path of an evaluation leaves where it
//! fell: the phase and the batch component, the firing loop or the round it
//! was in (with that round's news and what the round had made so far), and
//! the firing in flight, whose solutions not yet concluded are kept as they
//! were solved, against the store as it stood when it fired. `resume` puts
//! back what the wall's epilogue wrote (its hole, the shrug rows) and goes on
//! from there: the same firings in the same order, so the same facts, the
//! same witnesses and the same steps as one evaluation with the larger budget.
//!
//! A wall anywhere else (a lattice, a threshold, a closure kernel, a demand
//! unfolding, the alternating fixpoint, a component stratified by its data,
//! the space wall) leaves no cut, and `resume` evaluates the world again.
use super::*;
use crate::arena::{VolR, VolW};

/// The firing the wall fell in.
#[derive(Clone)]
pub(super) enum InFlight {
    /// The wall fell while solving: nothing was concluded, the firing is made again.
    Refire,
    /// The wall fell while concluding: the fact it fell on (`tail`), the
    /// solutions after it, and what the firing had concluded before.
    Rest { sols: Vec<Sol>, out: Front, tail: Option<Tail> },
}

/// The fact a wall fell on, put and supported but not yet written whole.
#[derive(Clone)]
pub(super) enum Tail {
    Staged(Sym),
    Fact { rule: Sym, rel: Sym, persp: Sym, args: Vec<Term>, id: FactId, is_new: bool },
}

#[derive(Clone)]
pub(super) enum CutAt {
    /// In a batch's first, whole firing of each rule, at rule `i`.
    Whole { i: usize, front: Front },
    /// In a round of the batch's propagation: its news `cur`, rule `j` of the
    /// active rules, body position `pos`, and the news made so far.
    Round { cur: Front, j: usize, pos: usize, front: Front },
}

/// Where a step wall fell, gathered as the wall unwinds.
#[derive(Clone, Default)]
pub(super) struct Cut {
    pub(super) phase: Option<usize>,
    pub(super) comp: usize,
    pub(super) at: Option<CutAt>,
    pub(super) pos: Option<usize>,
    pub(super) fl: Option<InFlight>,
    /// The wall's own hole row, and the store's size once the epilogue ended:
    /// a world that took a fact since is evaluated again.
    pub(super) hole: Option<FactId>,
    pub(super) facts: usize,
    pub(super) tick: u32,
}

impl Eval {
    /// What a firing solved; a step wall while solving marks a firing to make again.
    /// Only a firing whose first step was the one refused is made again: a
    /// solve that had spent steps (an unfolding on demand, an aggregate's
    /// cells) would spend them twice, and one larger than the steps given
    /// would never end. That refused step is given back.
    pub(super) fn solved(&mut self, r: &Rc<ERule>, sols: Result<Vec<Sol>, Halt>, before: i64) -> Result<Vec<Sol>, Halt> {
        if let (Err(Halt::Budget("budget_exhausted", _)), Some(c)) = (&sols, self.cutting.as_mut()) {
            if c.fl.is_none() && !r.has_agg && self.steps == before + 1 {
                c.fl = Some(InFlight::Refire);
                self.steps = before;
            }
        }
        sols
    }

    /// The solutions concluded in order; at a step wall the rest are kept.
    ///
    /// `stale`: a solution citing a value improved on earlier in this batch is
    /// not concluded: the value that replaced it is in Δ and the rule,
    /// monotone in it, fires again on it. The values never change for it; the
    /// history does — a firing on a value that no longer stood when it fired
    /// is no way the cell was reached (agg_lattice_witness, docs/aggregates.md,
    /// "The order lattice, as built").
    pub(super) fn conclude_all(&mut self, r: &Rc<ERule>, sols: Vec<Sol>, mut out: Front, stale: bool) -> Result<Front, Halt> {
        // what a cut would keep of the firing counts against the disk wall, as the store does
        let held = |s: &Sol| (16 + s.s.len() * 12 + s.prems.len() * 8) as i64;
        self.disk_held = if self.disk == i64::MAX { 0 } else { sols.iter().map(held).sum() };
        let mut it = sols.into_iter();
        while let Some(sol) = it.next() {
            if self.disk_held > 0 {
                self.disk_held -= held(&sol);
            }
            if stale
                && !self.lattices.is_empty()
                && brk!("lattice_stale_solution" => false; sol.prems.iter().any(|p| matches!(p, PremRef::Fact(f) if !self.store.alive(*f))))
            {
                continue;
            }
            if let Err(e) = self.conclude(r, sol, &mut out) {
                let tail = self.cut_tail.take();
                if let (Halt::Budget("budget_exhausted", _), Some(c)) = (&e, self.cutting.as_mut()) {
                    if c.fl.is_none() {
                        c.fl = Some(InFlight::Rest { sols: it.collect(), out, tail });
                    }
                }
                return Err(e);
            }
        }
        self.disk_held = 0;
        Ok(out)
    }

    /// The firing in flight, finished: its fact written whole, its other solutions concluded.
    pub(super) fn finish(&mut self, r: &Rc<ERule>, fl: InFlight, fire: impl FnOnce(&mut Eval) -> Result<Front, Halt>) -> Result<Front, Halt> {
        let InFlight::Rest { sols, mut out, tail } = fl else {
            return fire(self);
        };
        match tail {
            Some(Tail::Staged(rule)) => {
                if let Err(e) = self.charge_row(Some(rule), true) {
                    return Err(self.cut_rest(sols, out, None, e));
                }
            }
            Some(Tail::Fact { rule, rel, persp, args, id, is_new }) => {
                if let Err(e) = self.charge_row(Some(rule), true) {
                    return Err(self.cut_rest(sols, out, None, e));
                }
                self.write_derived_by(rule, rel, persp, &args, id, &mut out);
                if is_new {
                    out.note(rel, id);
                }
            }
            None => {}
        }
        self.conclude_all(r, sols, out, false)
    }

    /// A firing at step `at` of a rule's round, finished from `fl` when resumed; a wall in it names the step.
    pub(super) fn fire_at(&mut self, r: &Rc<ERule>, at: usize, fl: Option<InFlight>, fire: impl FnOnce(&mut Eval) -> Result<Front, Halt>) -> Result<Front, Halt> {
        let f = match fl {
            Some(fl) => self.finish(r, fl, fire),
            None => fire(self),
        };
        if f.is_err() {
            if let Some(c) = self.cutting.as_mut() {
                c.pos.get_or_insert(at);
            }
        }
        f
    }

    fn cut_rest(&mut self, sols: Vec<Sol>, out: Front, tail: Option<Tail>, e: Halt) -> Halt {
        if let Some(c) = self.cutting.as_mut() {
            if c.fl.is_none() {
                c.fl = Some(InFlight::Rest { sols, out, tail });
            }
        }
        e
    }

    /// A program whose every wall in the plain path can be resumed from.
    pub(super) fn resumable(&self) -> bool {
        self.lattices.is_empty()
            && !self.well_founded
            && !self.naive
            && self.shrug_readers.is_empty()
            && self.ds_comps.is_empty()
            && self.narrowing.is_none()
            && self.rules.iter().all(|r| !r.has_thr)
    }

    /// The cut gathered as the wall unwound, kept if it is whole.
    pub(super) fn keep_cut(&mut self) {
        let c = self.cutting.take();
        self.cut = c.filter(|c| self.resumable() && c.phase.is_some() && c.fl.is_some() && c.at.is_some());
    }

    /// Run on from where a step wall stopped the last evaluation, with `more`
    /// steps; a world with no cut to go on from is evaluated again whole
    /// under the steps spent and `more`. True when it went on.
    pub fn resume(&mut self, more: i64) -> Result<(Outcome, bool), Halt> {
        let cut = self.cut.take().filter(|_| brk!("disk_resume_from_scratch" => !self.disk_cut(); true)).filter(|c| {
            !self.store.dirty && self.store.partial_eval && c.facts == self.store.len_ids() as usize && c.tick == self.store.tick
        });
        let Some(cut) = cut else {
            self.budget = self.steps + more;
            return Ok((self.run()?, false));
        };
        if let Some(id) = cut.hole {
            let why = self.store.args(id).get(1).and_then(|t| t.as_atom()).unwrap_or(self.v.budget_reason);
            let target = self.hole_id;
            self.holes_met.remove(&(target, why));
            if let Some(i) = self.holes_now.iter().rposition(|x| *x == (target, why)) {
                self.holes_now.remove(i);
            }
            self.store.eval_holes.retain(|x| *x != id);
            self.store.remove_many(&[id]);
            self.rows -= 1;
        }
        let shrugs = self.store.rel_all(&self.h, self.v.shrug);
        self.store.remove_many(&shrugs);
        self.wall_spent.0.set(None);
        self.store.vlisted = false;
        self.budget = self.steps + more;
        self.disk_held = 0;
        self.resume_at = Some(cut);
        let out = self.run_pass_from();
        self.resume_at = None;
        Ok((out?, true))
    }
}

fn opt(w: &mut VolW, x: Option<usize>) {
    w.u64(x.map_or(u64::MAX, |x| x as u64));
}

fn read_opt(r: &mut VolR) -> Result<Option<usize>, String> {
    Ok(Some(r.u64()?).filter(|&x| x != u64::MAX).map(|x| x as usize))
}

fn sorted(ids: &FxSet<FactId>) -> Vec<FactId> {
    let mut v: Vec<FactId> = ids.iter().copied().collect();
    v.sort_unstable();
    v
}

fn write_front(w: &mut VolW, f: &Front) {
    w.arena(&sorted(&f.keys));
    let mut rels: Vec<&Sym> = f.by_rel.keys().collect();
    rels.sort_unstable();
    w.u32(rels.len() as u32);
    for rel in rels {
        w.u32(*rel);
        w.arena(&sorted(&f.by_rel[rel]));
    }
}

fn read_front(r: &mut VolR) -> Result<Front, String> {
    let mut f = Front { keys: r.arena::<FactId>()?.iter().copied().collect(), ..Front::default() };
    for _ in 0..r.u32()? {
        let rel = r.u32()?;
        f.by_rel.insert(rel, r.arena::<FactId>()?.iter().copied().collect());
    }
    Ok(f)
}

fn read_prems(r: &mut VolR) -> Result<Vec<PremRef>, String> {
    Ok(r.arena_checked::<PremRef>(|w| w.iter().step_by(2).all(|&t| t <= 4))?.to_vec())
}

impl Eval {
    /// The cut a step wall left, and what the evaluation it stopped had counted, as a volume keeps them: so a
    /// process can go on from where another stopped (`crate::volume`).
    pub(crate) fn write_cut(&self, w: &mut VolW) {
        let Some(c) = self.cut.as_ref().filter(|_| self.resumable()) else {
            w.u32(0);
            return;
        };
        w.u32(1);
        opt(w, c.phase);
        w.u64(c.comp as u64);
        opt(w, c.pos);
        opt(w, c.hole.map(|h| h as usize));
        w.u64(c.facts as u64);
        w.u32(c.tick);
        match &c.at {
            None => w.u32(0),
            Some(CutAt::Whole { i, front }) => {
                w.u32(1);
                w.u64(*i as u64);
                write_front(w, front);
            }
            Some(CutAt::Round { cur, j, pos, front }) => {
                w.u32(2);
                write_front(w, cur);
                w.u64(*j as u64);
                w.u64(*pos as u64);
                write_front(w, front);
            }
        }
        match &c.fl {
            None => w.u32(0),
            Some(InFlight::Refire) => w.u32(1),
            Some(InFlight::Rest { sols, out, tail }) => {
                w.u32(2);
                w.u32(sols.len() as u32);
                for s in sols {
                    w.arena(&s.s.iter().map(|(v, _)| *v).collect::<Vec<Sym>>());
                    w.arena(&s.s.iter().map(|(_, t)| *t).collect::<Vec<Term>>());
                    w.arena(&s.prems);
                }
                write_front(w, out);
                match tail {
                    None => w.u32(0),
                    Some(Tail::Staged(rule)) => {
                        w.u32(1);
                        w.u32(*rule);
                    }
                    Some(Tail::Fact { rule, rel, persp, args, id, is_new }) => {
                        w.u32(2);
                        for x in [*rule, *rel, *persp, *id, *is_new as u32] {
                            w.u32(x);
                        }
                        w.arena(args);
                    }
                }
            }
        }
        for x in [self.steps, self.rows, self.peak_rows, self.carry_wall.0, self.carry_wall.1, self.carry_steps, self.carry_rows] {
            w.u64(x as u64);
        }
        w.arena(&self.active.iter().map(|r| r.id).collect::<Vec<Sym>>());
    }

    /// The cut a volume kept, put back as the evaluation that wrote it left it; `resume` goes on from it.
    pub(crate) fn read_cut(&mut self, r: &mut VolR) -> Result<(), String> {
        if r.u32()? == 0 {
            // no cut to go on from: `resume` evaluates again under the steps spent and more
            if self.store.partial_eval {
                self.steps = self.store.eval_log.get(&self.store.tick).map_or(0, |e| e.steps);
            }
            return Ok(());
        }
        let mut c = Cut { phase: read_opt(r)?, comp: r.u64()? as usize, pos: read_opt(r)?, hole: read_opt(r)?.map(|h| h as FactId), ..Cut::default() };
        (c.facts, c.tick) = (r.u64()? as usize, r.u32()?);
        c.at = match r.u32()? {
            0 => None,
            1 => Some(CutAt::Whole { i: r.u64()? as usize, front: read_front(r)? }),
            _ => {
                let cur = read_front(r)?;
                let (j, pos) = (r.u64()? as usize, r.u64()? as usize);
                Some(CutAt::Round { cur, j, pos, front: read_front(r)? })
            }
        };
        c.fl = match r.u32()? {
            0 => None,
            1 => Some(InFlight::Refire),
            _ => {
                let mut sols = Vec::new();
                for _ in 0..r.u32()? {
                    let (vs, ts) = (r.arena::<Sym>()?, r.arena::<Term>()?);
                    sols.push(Sol { s: vs.iter().copied().zip(ts.iter().copied()).collect(), prems: read_prems(r)? });
                }
                let out = read_front(r)?;
                let tail = match r.u32()? {
                    0 => None,
                    1 => Some(Tail::Staged(r.u32()?)),
                    _ => {
                        let [rule, rel, persp, id, is_new] = [(); 5].map(|_| r.u32());
                        Some(Tail::Fact { rule: rule?, rel: rel?, persp: persp?, id: id?, is_new: is_new? == 1, args: r.arena::<Term>()?.to_vec() })
                    }
                };
                Some(InFlight::Rest { sols, out, tail })
            }
        };
        let [steps, rows, peak, wall_steps, wall_space, carry_steps, carry_rows] = [(); 7].map(|_| r.u64().map(|x| x as i64));
        (self.steps, self.rows, self.peak_rows) = (steps?, rows?, peak?);
        self.carry_wall = (wall_steps?, wall_space?);
        (self.carry_steps, self.carry_rows) = (carry_steps?, carry_rows?);
        let active: HashSet<Sym> = r.arena::<Sym>()?.iter().copied().collect();
        self.active = self.rules.iter().filter(|r| active.contains(&r.id)).cloned().collect();
        self.active.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        self.derived_rels = self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next).map(|r| r.clause.head.rel).collect();
        self.vclosure_engage();
        self.closures_engage();
        // the cells sealed before the cut are found again by correlation, as the evaluation that sealed them did
        self.restore_cells();
        self.cut = Some(Box::new(c));
        Ok(())
    }
}
