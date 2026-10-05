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
        brk!("prov_reader_deferred" => self.lazy_prov; self.lazy_prov && !self.prov_eager.contains(&rel))
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
        if self.no_provenance {
            return;
        }
        let n = (id, rule, self.store.tick);
        if self.pending_prov.last() != Some(&n) {
            self.pending_prov.push(n);
        }
    }

    /// Write the rows of the firings noted since the last call. Idempotent;
    /// the world is then as the eager one is, and stays lazy for what fires after.
    pub fn settle_provenance(&mut self) {
        self.vsettle();
        if self.pending_prov.is_empty() {
            return;
        }
        let mut notes = std::mem::take(&mut self.pending_prov);
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

    /// The harness's spelling of `sealed(provenance)` (`rofl-eval --no-provenance`), set after
    /// load: what `prepare` makes of the declaration, the engine's own order of groups and
    /// candidates and activation by component among it (f_no_provenance_flag_is_not_the_seal).
    pub fn seal_provenance(&mut self) {
        self.no_provenance = true;
        self.no_witness = true;
        self.lazy_prov = false;
        self.pending_prov.clear();
        self.store.unordered = self.lattices.is_empty();
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
        self.pending_prov.len()
    }
}
