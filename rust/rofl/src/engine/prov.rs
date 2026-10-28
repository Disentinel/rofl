//! PROVENANCE ON DEMAND. A provenanced world keeps a witness per firing (what
//! `why` renders) and, besides, a `derived_by(F, Rule, Tick)` row per fired
//! fact: 44% of the facts of a code world, read only by a rule that names
//! `derived_by`, by a query for it, and by the canonical state. Where no rule
//! reads it the row is not written when a rule fires: the firing is noted
//! (fact, rule, tick; twelve bytes) and `settle_provenance` writes the rows
//! the world would have held, from the notes, when something observes them.
//!
//! A note stands for a row only while its fact is alive and a firing of that
//! rule is still among its witnesses: the eager path retires a row on exactly
//! those events (`retire_fact`, `supersede`, a rule that no longer fires), so
//! the settled rows are the eager ones. A tick boundary settles first, the
//! frozen rows being what `why` reads of a past tick.

use super::*;

impl Eval {
    /// Is a firing of `rel` noted and not written? Not where a rule reads its rows.
    pub(super) fn defers(&self, rel: Sym) -> bool {
        brk!("prov_reader_deferred" => self.prov.lazy; self.prov.lazy && !self.prov.prov_eager.contains(&rel))
    }

    /// The relations the `derived_by` premises of `rules` name, `$fact(Rel, ..)`
    /// with `Rel` written; `None` where a premise names none (its fact a variable),
    /// where a dominance reads provenance, or where the policy says a rule reads it
    /// and none is found: every relation is then written as it fires.
    pub(super) fn provenance_readers(&self, rules: &[DRule]) -> Option<HashSet<Sym>> {
        let mut out = HashSet::new();
        for r in rules {
            for l in r.clause.body.iter().flat_map(|b| b.lits_deep()) {
                if l.rel != self.v.derived_by {
                    continue;
                }
                let TermK::Func(i) = l.args.first()?.kind() else { return brk!("prov_variable_reader_lazy" => Some(HashSet::new()); None) };
                if self.h.fname(i) != self.v.s_fact {
                    return None;
                }
                out.insert(self.h.fargs(i).first()?.as_atom()?);
            }
        }
        (!out.is_empty() && self.subs.is_empty()).then_some(out)
    }

    /// Note a firing whose `derived_by` row is written when asked for.
    pub(super) fn defer_derived_by(&mut self, id: FactId, rule: Sym) {
        if self.prov.no_provenance {
            return;
        }
        let n = (id, rule, self.store.tick);
        if self.prov.pending.last() != Some(n) {
            self.prov.pending.push(n);
        }
    }

    /// Write every row noted and not written, `derived_by` and `asserted_by`. Idempotent; the world is then as the
    /// eager one is, and stays lazy for what fires and is asserted after.
    pub fn settle_provenance(&mut self) {
        self.settle_derived();
        self.settle_assertions();
    }

    /// The `asserted_by` rows of the base facts asserted since the last call, where no rule reads them: a quarter of
    /// a code world's stored facts, each naming its fact by a term as large as the fact.
    pub fn settle_assertions(&mut self) {
        for (id, who, tick) in self.pending_assert.take() {
            // (a fact taken out, or one taken out and derived again since, is no assertion)
            if !self.store.alive(id) || !self.store.rec(id).base() {
                continue;
            }
            let rec = self.store.rec(id);
            let args = self.store.args(id).to_vec();
            let f = fact_term(&mut self.h, &self.v, rec.rel, rec.persp, &args);
            let (ab, kp) = (self.v.asserted_by, self.v.kernel_persp);
            self.store.add(&self.h, ab, kp, &[f, Term::atom(who), Term::int(tick as i64)], F_BASE);
        }
    }

    /// Write the `derived_by` rows of the firings noted since the last call.
    pub fn settle_derived(&mut self) {
        self.vsettle();
        if self.prov.pending.is_empty() {
            return;
        }
        let mut notes = self.prov.pending.take();
        notes.sort_unstable();
        notes.dedup();
        for (id, rule, tick) in notes {
            if brk!("prov_settle_keeps_dead" => false; !self.store.alive(id) || !self.store.fired_by(id, rule)) {
                continue;
            }
            let rec = self.store.rec(id);
            let args = self.store.args(id).to_vec();
            let ft = fact_term(&mut self.h, &self.v, rec.rel, rec.persp, &args);
            let row = [ft, Term::atom(rule), Term::int(tick as i64)];
            self.store.put(&self.h, self.v.derived_by, self.v.kernel_persp, &row, 0);
        }
    }

    /// `canonicalState`: every row a reader can distinguish, the `derived_by`
    /// rows of the firings noted and not yet written among them, so the state of
    /// a lazy world is the state of the eager one.
    pub fn canonical_state(&mut self) -> String {
        brk!("prov_state_unsettled" => (); self.settle_provenance());
        self.store.canonical_state(&self.h)
    }

    /// Firings whose row is not written yet (notes, before the dedup).
    pub fn unsettled_provenance(&self) -> usize {
        self.prov.pending.len()
    }
}

/// Rows noted and not written: those a volume held, read where they lie, and those noted since.
#[derive(Default, Clone)]
pub(crate) struct Notes {
    kept: crate::arena::Arena<u32>,
    own: Vec<(FactId, Sym, u32)>,
}

impl Notes {
    pub(crate) fn push(&mut self, n: (FactId, Sym, u32)) {
        self.own.push(n);
    }
    pub(crate) fn last(&self) -> Option<(FactId, Sym, u32)> {
        self.own.last().copied().or_else(|| self.kept.chunks_exact(3).last().map(|x| (x[0], x[1], x[2])))
    }
    pub(crate) fn len(&self) -> usize {
        self.kept.len() / 3 + self.own.len()
    }
    pub(crate) fn is_empty(&self) -> bool {
        self.len() == 0
    }
    pub(crate) fn iter(&self) -> impl Iterator<Item = (FactId, Sym, u32)> + '_ {
        self.kept.chunks_exact(3).map(|x| (x[0], x[1], x[2])).chain(self.own.iter().copied())
    }
    pub(crate) fn take(&mut self) -> Vec<(FactId, Sym, u32)> {
        let all = self.iter().collect();
        *self = Notes::default();
        all
    }
    pub(crate) fn clear(&mut self) {
        *self = Notes::default();
    }
    fn write(&self, w: &mut crate::arena::VolW) {
        w.arena_parts(&self.kept, &[&self.own.iter().flat_map(|&(f, r, t)| [f, r, t]).collect::<Vec<u32>>()]);
    }
    fn read(r: &mut crate::arena::VolR) -> Result<Notes, String> {
        let kept = r.arena::<u32>()?;
        if kept.len() % 3 != 0 {
            return Err("a volume's notes are not triples".into());
        }
        Ok(Notes { kept, own: Vec::new() })
    }
}

impl Eval {
    /// The rows noted and not written, as a volume keeps them: the opened world writes them when asked, as this one
    /// would, and keeping writes none.
    pub(crate) fn write_notes(&self, w: &mut crate::arena::VolW) {
        self.prov.pending.write(w);
        self.pending_assert.write(w);
        self.store.journal.write(w);
    }

    pub(crate) fn read_notes(&mut self, r: &mut crate::arena::VolR) -> Result<(), String> {
        self.prov.pending = Notes::read(r)?;
        self.pending_assert = Notes::read(r)?;
        self.store.journal = crate::journal::Journal::read(r)?;
        Ok(())
    }
}
