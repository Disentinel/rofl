//! THE FINISHED LAYER OF A FULL PASS. A world evaluated whole, or opened evaluated, notes what it holds (`Whole`); a
//! later full pass keeps the relations whose rules and premises nothing touched since: `clear_derived` leaves their
//! facts and firings and no rule concluding one fires. What stands is what the pass would derive again, so a world
//! evaluated in stages pays for its upper stage only.
//!
//! A relation is kept when every rule concluding it is a rule it had, with no threshold, lattice, dominance, tag or
//! shrug, and every relation it reads is kept, or a base relation no fact came into or left since and no rule
//! concludes, or what the kernel read off the program as it was loaded. A relation a hole or a shrug of the whole
//! evaluation names, or whose rule one names, is evaluated again: a fault is the firing's, and only a firing writes
//! it. A relation answered on demand is kept only while no rule evaluated again reads it: one could ask it more. A
//! well-founded world, a world cut by a wall, and one whose rules read `derived_by` keep nothing.

use super::*;

#[derive(Clone, Default)]
pub struct Whole {
    tick: u32,
    rules: HashMap<Sym, Vec<String>>,
    special: HashSet<Sym>,
    faulted: HashSet<Sym>,
}

impl Eval {
    /// The relations the program concludes, by the canonical text of the rules concluding each.
    fn rules_by_head(&self) -> HashMap<Sym, Vec<String>> {
        let mut by: HashMap<Sym, Vec<String>> = HashMap::new();
        for r in self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next) {
            by.entry(r.clause.head.rel).or_default().push(r.canon.clone());
        }
        for v in by.values_mut() {
            v.sort();
        }
        by
    }

    /// The relations the kernel answers or orders some other way than by firing their rules once over what they read.
    fn special_rels(&self) -> HashSet<Sym> {
        let mut s: HashSet<Sym> = self.lat.algebras.iter().filter(|(_, a)| a.cell.is_some() || a.tag.is_some()).map(|(r, _)| *r).collect();
        s.extend(self.ds.comps.iter().flat_map(|c| c.rels.iter().copied()));
        s
    }

    /// The relations a hole or a shrug names: a fact's, a rule's head, a lattice's.
    fn faulted_rels(&mut self) -> HashSet<Sym> {
        let heads: HashMap<Sym, Sym> = self.rules.iter().map(|r| (r.id, r.clause.head.rel)).collect();
        let mut out = HashSet::new();
        let mut todo: Vec<Term> = Vec::new();
        for rel in [self.v.hole, self.v.shrug] {
            for f in self.store.rel_all(&self.h, rel) {
                todo.extend(self.store.args(f).iter().copied());
            }
        }
        while let Some(t) = todo.pop() {
            match t.kind() {
                TermK::Atom(a) => {
                    out.insert(*heads.get(&a).unwrap_or(&a));
                }
                TermK::Func(i) => {
                    out.insert(self.h.fname(i));
                    todo.extend(self.h.fargs(i).iter().copied());
                }
                _ => {}
            }
        }
        out
    }

    /// The derived rows that are about a kept relation or a rule concluding one, by what their first argument names
    /// first: `derived_by($fact(Rel, ..), ..)`, `agg_cell($cell(Rule, ..), ..)`.
    pub(super) fn kept_rows(&mut self) -> FxSet<FactId> {
        let kept = &self.store.kept_layer;
        if kept.is_empty() {
            self.store.kept_rules.clear();
            return FxSet::default();
        }
        self.store.kept_rules = self.rules.iter().filter(|r| kept.contains(&r.clause.head.rel)).map(|r| r.id).collect();
        let kept = &self.store.kept_layer;
        let names: HashSet<Sym> = self.store.kept_rules.iter().chain(kept.iter()).copied().collect();
        (0..self.store.len_ids())
            .filter(|&i| {
                let r = self.store.rec(i);
                !r.dead() && !r.base() && (self.v.is_reserved(r.rel) || self.v.in_kernel_book(r.rel)) && match self.store.args(i).first().map(|t| t.kind()) {
                    Some(TermK::Func(f)) => self.h.fargs(f).first().and_then(|a| a.as_atom()).is_some_and(|a| names.contains(&a)),
                    _ => false,
                }
            })
            .collect()
    }

    /// The world is evaluated whole: what a later full pass may keep is read against it.
    pub(super) fn note_whole(&mut self) {
        self.store.base_moved.clear();
        if self.store.partial_eval {
            self.whole = None;
            return;
        }
        self.whole = Some(Rc::new(Whole {
            tick: self.store.tick,
            rules: self.rules_by_head(),
            special: self.special_rels(),
            faulted: self.faulted_rels(),
        }));
    }

    /// The relations this full pass keeps from the last whole evaluation, and those it evaluates again.
    pub(super) fn finished_layer(&self) -> (FxSet<Sym>, Vec<Sym>) {
        let Some(w) = self.whole.as_deref() else { return Default::default() };
        let again = |kept: &FxSet<Sym>| {
            let mut a: Vec<Sym> = w.rules.keys().filter(|r| !kept.contains(r)).copied().collect();
            a.sort_by(|x, y| cmp_js(self.h.name(*x), self.h.name(*y)));
            a
        };
        if w.tick != self.store.tick
            || self.well_founded
            || self.answer.reads_provenance
            || self.wall.level_wall.is_some()
        {
            return (FxSet::default(), again(&FxSet::default()));
        }
        let changed = &self.store.base_moved;
        let now = self.rules_by_head();
        let special = self.special_rels();
        let by_head: HashMap<Sym, Vec<&Rc<ERule>>> = self.rules.iter().fold(HashMap::new(), |mut m, r| {
            m.entry(r.clause.head.rel).or_default().push(r);
            m
        });
        // what the kernel writes as the world evaluates, as against what it reads off the program as it is loaded
        const WRITTEN: &[&str] = &[
            "derived_by", "asserted_by", "hole", "shrug", "agg_cell", "agg_member", "agg_member_prem", "agg_sealed",
            "lattice_member", "lattice_member_prem", "lattice_widen", "dominated_by", "evaluated_again",
        ];
        let kernel = |rel: Sym| self.v.is_reserved(rel) || self.v.in_kernel_book(rel);
        let read_ok = |rel: Sym| {
            let moved = changed.contains(&rel)
                || special.contains(&rel)
                || w.special.contains(&rel)
                || w.faulted.contains(&rel)
                || self.store.alias_view(rel).is_some()
                || (kernel(rel) && WRITTEN.contains(&self.h.name(rel)));
            !moved
        };
        let mut kept: FxSet<Sym> = w
            .rules
            .iter()
            .filter(|(rel, rs)| {
                read_ok(**rel)
                    && !kernel(**rel)
                    && now.get(rel) == Some(rs)
                    && by_head[rel].iter().all(|r| {
                        (r.safe || self.demand.on(**rel))
                            && !r.has_thr
                            && r.lattice_outer.is_empty()
                            && r.lat_close.is_none()
                            && !self.shrug_readers.contains(&r.id)
                            && r.clause.head.temporal == Temporal::Now
                    })
            })
            .map(|(rel, _)| *rel)
            .collect();
        let demand: HashSet<Sym> = self.demand.rels.iter().map(|(r, _)| *r).chain(self.answer.demand_rels.iter().copied()).collect();
        loop {
            let n = kept.len();
            let stays = |rel: &Sym, kept: &FxSet<Sym>| {
                by_head[rel].iter().all(|r| {
                    r.clause.body.iter().flat_map(|b| b.lits_deep()).all(|l| {
                        l.temporal == Temporal::Now
                            && (kept.contains(&l.rel) || !w.rules.contains_key(&l.rel) && !now.contains_key(&l.rel) && read_ok(l.rel))
                    })
                })
            };
            // what is answered on demand holds what was asked of it: a rule evaluated again may ask it more
            let asked_anew: HashSet<Sym> = self
                .rules
                .iter()
                .filter(|r| !kept.contains(&r.clause.head.rel))
                .flat_map(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel).collect::<Vec<_>>())
                .filter(|rel| demand.contains(rel))
                .collect();
            let drop: Vec<Sym> = kept.iter().filter(|r| !stays(r, &kept) || asked_anew.contains(r)).copied().collect();
            for r in drop {
                kept.remove(&r);
            }
            if kept.len() == n {
                break;
            }
        }
        let a = again(&kept);
        (kept, a)
    }
}

