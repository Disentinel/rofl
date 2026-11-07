//! THE FINISHED LAYER OF A FULL PASS. A world evaluated whole, or opened evaluated, notes what it holds (`Whole`); a
//! later full pass keeps the relations whose rules and premises nothing touched since: `clear_derived` leaves their
//! facts and firings and no rule concluding one fires. What stands is what the pass would derive again, so a world
//! evaluated in stages pays for its upper stage only.
//!
//! A relation is kept when every rule concluding it is a rule it had, with no lattice, dominance or tag, and every
//! relation it reads is kept, or a base relation no fact came into or left since and no rule concludes, or what the
//! kernel read off the program as it was loaded, or the shrugs or firings of one kept relation it names
//! (`shrug(r(X), ..)`, `derived_by($fact(r, ..), ..)`). A threshold is kept with what its sealing knew of its groups. A
//! relation a hole or a shrug names is kept with what the holes left unknown in it (`carry_kept`): the hole rows of its
//! rules stand, and its unknowns, with what each was reached from, are carried on to the readers evaluated again. A
//! relation a cell's or a lattice's hole names (their memos are the pass's), or (well-founded) an undefined row, is
//! evaluated again, and so is every one a hole names in a well-founded world (each round carries afresh) or one whose
//! rules read `unknown` (an `unknown(A)` is noted in the order the pass meets its strict readers). A relation answered on demand is kept only
//! while no rule evaluated again reads it: one could ask it otherwise. A world cut by a wall, or whose semantics
//! changed, keeps nothing.

use super::*;

#[derive(Clone, Default)]
pub struct Whole {
    tick: u32,
    well_founded: bool,
    rules: HashMap<Sym, Vec<String>>,
    special: HashSet<Sym>,
    faulted: HashSet<Sym>,
    unkept: HashSet<Sym>,
    pub(super) carry: Option<Rc<Carried>>,
}

/// What the unknowns of a whole evaluation were, for a later full pass to carry those of the relations it keeps.
#[derive(Clone, Default)]
pub struct Carried {
    carry: UnknownCarry,
    edges: Vec<(Node, Node)>,
    holes: Vec<(Term, Sym)>,
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

    /// The relations the rows of `rels` name: a fact's, a rule's head, a lattice's.
    fn named_rels(&mut self, rels: &[Sym]) -> HashSet<Sym> {
        let rows: Vec<FactId> = rels.iter().flat_map(|&rel| self.store.rel_all(&self.h, rel)).collect();
        self.named_by(&rows)
    }

    pub(super) fn named_by(&self, rows: &[FactId]) -> HashSet<Sym> {
        let heads: HashMap<Sym, Sym> = self.rules.iter().map(|r| (r.id, r.clause.head.rel)).collect();
        let mut out = HashSet::new();
        let mut todo: Vec<Term> = rows.iter().flat_map(|&f| self.store.args(f).iter().copied()).collect();
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
        let faulted = self.named_rels(&[self.v.hole, self.v.shrug]);
        let mut unkept = if self.well_founded { self.named_rels(&[self.v.unknown]) } else { HashSet::new() };
        // a hole of a cell or a lattice says of it what the pass's memos knew (the regions a label spent, a widening's
        // enclosure, the groups a possible member reached): what it names is evaluated again
        let s_rule = self.v.s_rule_hole;
        let cells: Vec<FactId> = self.store.rel_all(&self.h, self.v.hole).into_iter().filter(|&f| !matches!(self.store.args(f)[0].kind(), TermK::Func(i) if self.h.fname(i) == s_rule)).collect();
        unkept.extend(self.named_by(&cells));
        let carry = (!faulted.is_empty()).then(|| self.carried_now());
        self.whole = Some(Rc::new(Whole {
            tick: self.store.tick,
            well_founded: self.well_founded,
            rules: self.rules_by_head(),
            special: self.special_rels(),
            faulted,
            unkept,
            carry,
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
            || w.well_founded != self.well_founded
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
        let carries = w.carry.is_some() && !self.well_founded && !self.rules.iter().any(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.rel == self.v.unknown));
        let read_ok = |rel: Sym| {
            let moved = changed.contains(&rel)
                || (self.well_founded && rel == self.v.unknown)
                || special.contains(&rel)
                || w.special.contains(&rel)
                || w.unkept.contains(&rel)
                || (w.faulted.contains(&rel) && !carries)
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
                            && r.lattice_outer.is_empty()
                            && r.lat_close.is_none()
                            && r.clause.head.temporal == Temporal::Now
                    })
            })
            .map(|(rel, _)| *rel)
            .collect();
        // a shrug or a firing read of one relation (`shrug(r(X), ..)`, `derived_by($fact(r, ..), ..)`) is read of what
        // the pass writes again of it: of a kept relation, what stands
        let (shrug, derived_by, s_fact) = (self.v.shrug, self.v.derived_by, self.v.s_fact);
        let of_kept = |l: &Lit, kept: &FxSet<Sym>| {
            (l.rel == shrug || l.rel == derived_by)
                && match l.args.first().map(|t| t.kind()) {
                    Some(TermK::Func(i)) if self.h.fname(i) == s_fact => self.h.fargs(i).first().and_then(|t| t.as_atom()),
                    Some(TermK::Func(i)) if l.rel == shrug => Some(self.h.fname(i)),
                    Some(TermK::Atom(a)) if l.rel == shrug => Some(a),
                    _ => None,
                }
                .is_some_and(|rel| kept.contains(&rel))
        };
        let demand: HashSet<Sym> = self.demand.rels.iter().map(|(r, _)| *r).chain(self.answer.demand_rels.iter().copied()).collect();
        loop {
            let n = kept.len();
            let stays = |rel: &Sym, kept: &FxSet<Sym>| {
                by_head[rel].iter().all(|r| {
                    r.clause.body.iter().flat_map(|b| b.lits_deep()).all(|l| {
                        l.temporal == Temporal::Now
                            && (kept.contains(&l.rel) || of_kept(l, kept) || !w.rules.contains_key(&l.rel) && !now.contains_key(&l.rel) && read_ok(l.rel))
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

    /// The carry a full pass starts from: what the last whole evaluation left unknown in the relations this pass keeps,
    /// with what each was reached from, the holes that stand of their rules and every edge out of either. A reader
    /// evaluated again is carried them at its level as the whole evaluation carried them; the shrug rows are written
    /// again from them as from what this pass meets.
    fn carried_now(&self) -> Rc<Carried> {
        Rc::new(Carried { carry: self.lat.carry.clone(), edges: self.shrug.unk_edges.clone(), holes: self.shrug.holes_now.clone() })
    }

    /// The unknowns of a world opened evaluated are read back after it noted what it holds: the carry is noted again.
    pub(super) fn recarry_whole(&mut self) {
        let carry = self.carried_now();
        if let Some(w) = self.whole.as_mut().filter(|w| !w.faulted.is_empty()) {
            Rc::make_mut(w).carry = Some(carry);
        }
    }

    /// The holes the last evaluation wrote, gone before the next, but for those a rule or a relation it keeps names.
    pub(super) fn drop_stale_holes(&mut self) {
        let kept = &self.store.kept_layer;
        let names: HashSet<Sym> = self.rules.iter().filter(|r| kept.contains(&r.clause.head.rel)).map(|r| r.id).chain(kept.iter().copied()).collect();
        let ids: Vec<FactId> = std::mem::take(&mut self.store.eval_holes).into_iter().filter(|i| self.store.alive(*i)).collect();
        let (stay, gone): (Vec<FactId>, Vec<FactId>) = ids.into_iter().partition(|&i| match self.store.args(i)[0].kind() {
            TermK::Func(f) => self.h.fargs(f).first().and_then(|a| a.as_atom()).is_some_and(|a| names.contains(&a)),
            _ => false,
        });
        self.store.remove_many(&gone);
        self.store.eval_holes = stay;
    }

    pub(super) fn carry_kept(&mut self, carried: Option<Rc<Carried>>) {
        let Some(k) = carried.filter(|_| !self.store.kept_layer.is_empty()) else { return };
        let standing: HashSet<Term> = self.store.rel_all(&self.h, self.v.hole).into_iter().map(|f| self.store.args(f)[0]).collect();
        let kept = &self.store.kept_layer;
        let mine = |n: &Node| match n {
            Node::Unk(u) => kept.contains(&u.rel()),
            Node::Hole(t) => standing.contains(t),
        };
        let mut rels: Vec<Sym> = k.carry.lat_unknown_rel.keys().filter(|r| kept.contains(r)).copied().collect();
        rels.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        let edges: Vec<(Node, Node)> = k.edges.iter().filter(|(a, _)| mine(a)).cloned().collect();
        let holes: Vec<(Term, Sym)> = k.holes.iter().filter(|(t, _)| standing.contains(t)).copied().collect();
        let closed: Vec<Sym> = k.carry.plain_closed.iter().filter(|r| kept.contains(r)).copied().collect();
        for rel in rels {
            for u in &k.carry.lat_unknown_rel[&rel] {
                self.note_unknown(u.clone(), k.carry.unknown.get(u).cloned().flatten());
                if k.carry.plain.contains(u) {
                    self.lat.carry.plain.insert(u.clone());
                }
                if k.carry.spread.contains(u) {
                    self.lat.carry.spread.insert(u.clone());
                }
            }
        }
        self.lat.carry.plain_closed.extend(closed);
        self.shrug.unk_edges.extend(edges);
        for h in holes {
            self.shrug.holes_met.insert(h);
            self.shrug.holes_now.push(h);
        }
    }

    /// WHAT A DELTA LEAVES TO A PASS: the relations a hole or a shrug may move (`hole_cone`) that the change reaches,
    /// `from` and the rules `fresh` added, through every reader. None reads what the delta works out, so the delta is
    /// worked out without their rules and they are evaluated again after it (`pass_aside`). A lattice, a tag or a
    /// dominance among them keeps a history the delta's own paths for them would read: refused.
    pub(super) fn hole_world(&mut self, from: &HashSet<Sym>, fresh: &HashSet<Sym>) -> Result<HashSet<Sym>, &'static str> {
        let cone = self.hole_cone();
        if cone.is_empty() {
            return Ok(cone);
        }
        let reached = self.grow(from, fresh);
        let aside: HashSet<Sym> = cone.into_iter().filter(|r| reached.contains(r)).collect();
        if aside.iter().any(|r| self.lat.algebras.get(r).is_some_and(|a| a.cell.is_some() || a.tag.is_some() || a.sub.is_some() || a.join.is_some())) {
            return Err("a lattice, a tag or a dominance a hole or a shrug may move is reached by what changed");
        }
        Ok(aside)
    }

    /// The full pass after a delta that set `aside` apart: what holes leave unknown elsewhere is carried on from the
    /// evaluation before (`carry_kept`), every relation not set apart that the pass can keep is kept, and the rest is
    /// evaluated again over it.
    pub(super) fn pass_aside(&mut self, aside: HashSet<Sym>) -> Result<(), &'static str> {
        if aside.is_empty() {
            return Ok(());
        }
        self.note_whole();
        if let Some(w) = self.whole.as_mut() {
            Rc::make_mut(w).unkept.extend(aside);
        }
        // the pass declares `shrug` and `unknown` extensional where a rule now reads them (`shrug_reset`), which what
        // reads `edb` reads as a base fact come
        for rel in [self.v.shrug, self.v.unknown] {
            let read = self.rules.iter().any(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.rel == rel));
            if read && self.store.get(self.v.edb, self.v.main, &[Term::atom(rel)]).is_none_or(|f| !self.store.alive(f)) {
                self.store.base_moved.insert(self.v.edb);
            }
        }
        match self.run() {
            Ok(o) if !o.partial => Ok(()),
            _ => {
                self.store.dirty = true;
                Err("what a hole or a shrug may move, evaluated again after the delta, met a wall or a fault of its own")
            }
        }
    }
}
