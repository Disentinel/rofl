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
        let mut it = sols.into_iter();
        while let Some(sol) = it.next() {
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
        let cut = self.cut.take().filter(|c| {
            !self.store.dirty && self.store.partial_eval && c.facts == self.store.len_ids() as usize && c.tick == self.store.tick
        });
        let Some(cut) = cut else {
            self.budget = self.steps + more;
            return Ok((self.run()?, false));
        };
        if let Some(id) = cut.hole {
            let why = self.v.budget_reason;
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
        self.wall_spent.set(None);
        self.store.vlisted = false;
        self.budget = self.steps + more;
        self.resume_at = Some(cut);
        let out = self.run_pass_from();
        self.resume_at = None;
        Ok((out?, true))
    }
}
