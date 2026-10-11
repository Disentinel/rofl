//! THE ADDITION PATH: base facts and rules enter an evaluated world and it is
//! brought to what a fresh evaluation of the whole program would hold, without
//! clearing what it derived (f_the_owner_settles_walls_promises_and_incremental,
//! point 3). The counterpart of the retraction path (`delta.rs`), and built on
//! its machinery.
//!
//! WHAT CHANGES. The relations of the added facts and the heads of the added
//! rules GROW; so does, through every rule that reads one of them, its head
//! (`grow`). A fact asserted where it was derived is an addition too: it is
//! base now, its height a base fact's, and what rests on it may lie lower.
//!
//! LEVEL BY LEVEL (`fine_levels`, DRed over the levels of the stratified
//! program): the news of every level below fires each level semi-naively, an
//! added rule that is plain or negates fires whole at its level; a rule that
//! reads what grew only under a negation keeps its facts and loses the firings
//! a new fact blocks, a fact that lost one goes whole with what rests on it and
//! is derived again from what holds, a fact gone for good makes a negation over
//! it hold; a rule that aggregates what grew (or a threshold, a moved round, a
//! negation that cannot be bound) is sealed again whole at its level and its
//! readers fed its change. AFTER THE REST, through the retraction path's
//! machinery: an order lattice the change reaches, what calls made to a relation
//! answered on demand, and what negates or aggregates those (`dirty`, `again`).
//! A rule staged `@next` from what changed stages again (`restage`), over cells
//! sealed again where it aggregates.
//!
//! THE STATE IS A SET OF FACTS AND, PER FACT, THE SET OF ITS FIRINGS, and the
//! witness printed is the least by height and signature (`Store::witness_of`),
//! so the order the delta fires in is not observable, except where a cell keeps
//! its members by height and canonical order, which a seal again takes as an
//! evaluation takes them.
//!
//! WHAT IT REFUSES, every reason in a fixed order (`addition_refusals`,
//! `add_worked_out`, `prep_moves`), and the world is then evaluated again from
//! its facts: not evaluated, cut by a wall, a later tick, well-founded, a hole or
//! a shrug reader, a lattice beside a relation answered on demand, a ledger
//! reader, a component stratified by its data, a join, widening, counting tag or
//! dominance reached, a staged fact two firings reach, a world that keeps no
//! witness beyond the monotone part, and for added rules a program whose
//! preparation moves more than the rules it runs.
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
    /// rules that read what grew only under a negation, kept: the firings a new fact blocks are withdrawn
    pub negated: usize,
    /// facts taken out because a firing of theirs was withdrawn, or what they rested on went, through each other
    pub overdeleted: usize,
    /// of those, derived again from what holds
    pub rederived: usize,
}

/// A negated premise over a relation that grew, as the fine path reads it: its place in the plan, and the places of
/// its arguments a new fact binds (a variable the rest of the rule never names matches anything and binds nothing).
struct NegAt {
    at: usize,
    lit: Lit,
    binds: Vec<usize>,
    persp: bool,
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

/// The negated premises of `r` over `grown`, each as the fine path binds it to a fact; None where one cannot be bound
/// so (a variable only it names, inside a compound or twice, or a literal of another tense), or `r` reads what grew
/// otherwise than positively or under such a negation.
fn negs_of(h: &Heap, r: &ERule, grown: &HashSet<Sym>) -> Option<Vec<NegAt>> {
    let mut out = Vec::new();
    for (i, b) in r.plan.iter().enumerate() {
        let BodyElem::Neg(l) = b else {
            if let BodyElem::Agg(a) = b {
                if a.body.iter().flat_map(|x| x.lits_deep()).any(|l| grown.contains(&l.rel)) {
                    return None;
                }
            }
            continue;
        };
        if !grown.contains(&l.rel) {
            continue;
        }
        if l.temporal != Temporal::Now {
            return None;
        }
        let mut outside: Vec<Sym> = Vec::new();
        h.vars_of(r.clause.head.persp, &mut outside);
        for a in &r.clause.head.args {
            h.vars_of(*a, &mut outside);
        }
        for (j, e) in r.plan.iter().enumerate() {
            if j == i {
                continue;
            }
            match e {
                BodyElem::Pos(x) | BodyElem::Neg(x) => {
                    h.vars_of(x.persp, &mut outside);
                    x.args.iter().for_each(|a| h.vars_of(*a, &mut outside));
                }
                BodyElem::Bi { l, r: rr, .. } => {
                    h.vars_of(*l, &mut outside);
                    h.vars_of(*rr, &mut outside);
                }
                BodyElem::Agg(_) => return None,
            }
        }
        let mut mine: Vec<Sym> = Vec::new();
        h.vars_of(l.persp, &mut mine);
        l.args.iter().for_each(|a| h.vars_of(*a, &mut mine));
        let alone = |v: Sym| !outside.contains(&v);
        let mut binds = Vec::new();
        for (k, a) in l.args.iter().enumerate() {
            match a.kind() {
                TermK::Var(v) if alone(v) => {
                    if mine.iter().filter(|x| **x == v).count() > 1 {
                        return None;
                    }
                }
                _ => {
                    let mut vs = Vec::new();
                    h.vars_of(*a, &mut vs);
                    if vs.iter().any(|v| alone(*v)) {
                        return None;
                    }
                    binds.push(k);
                }
            }
        }
        let persp = match l.persp.kind() {
            TermK::Var(v) if alone(v) => {
                if mine.iter().filter(|x| **x == v).count() > 1 {
                    return None;
                }
                false
            }
            _ => true,
        };
        out.push(NegAt { at: i, lit: l.clone(), binds, persp });
    }
    Some(out)
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
            Some((_, safe)) => *safe != r.safe,
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

    /// A WORLD OPENED EVALUATED (`crate::image`) holds what the evaluation derived but not what it ranked: the rounds are
    /// peeled again from the program. What the image does not carry leaves the world to be evaluated again: a program
    /// ranked only by its data, the cells of a lattice, and the firings a sealed world solves again for `why`.
    pub fn after_open(&mut self) {
        if self.store.dirty {
            return;
        }
        self.round_of.clear();
        if self.rerank().is_err() || !self.lattices.is_empty() || self.no_witness {
            self.store.dirty = true;
        }
    }

    /// WHY AN ADDITION IS NOT WORKED OUT for this world: every reason that holds, in a fixed order (empty where it is).
    fn addition_refusals(&mut self) -> Vec<&'static str> {
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
        // (the hole a seal of provenance writes says only that derived_by is sealed: no addition moves it)
        let sealed = self.h.atom("reflection_sealed");
        let holes = self.store.rel_all(&self.h, self.v.hole).into_iter().filter(|id| self.store.args(*id).get(1) != Some(&sealed)).count();
        if !self.shrug_readers.is_empty() || brk!("add_seal_hole_refused" => self.store.rel_count(self.v.hole); holes) > 0 {
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
        // a base fact of a closure walked whole: the two rules fire as written from now on, over the rows it walked
        if added.iter().any(|f| self.closures.iter().any(|c| c.rel == self.store.rec(*f).rel)) {
            self.closures_engage();
        }
        let moved = if new_rules.is_empty() { HashSet::new() } else { self.rerank()? };
        self.add_worked_out(added, &fresh, &grown, &moved, called).map_err(String::from)
    }

    /// `plan` solved as rule `r` solves its body, from `s0`.
    fn solve_as(&mut self, r: &ERule, plan: &[BodyElem], s0: Subst) -> Result<Vec<Sol>, Halt> {
        let outer = self.cur_rule.replace(r.id);
        let was = std::mem::replace(&mut self.firing, true);
        let sols = self.solve_body(plan, s0, 0, None, Some(r.id));
        self.firing = was;
        self.cur_rule = outer;
        sols
    }

    /// The bindings a fact gives a negated premise of the fine path, where it matches the premise's pattern.
    fn bind_neg(&self, n: &NegAt, f: FactId) -> Option<Subst> {
        let rec = self.store.rec(f);
        let args = self.store.args(f);
        if args.len() != n.lit.args.len() {
            return None;
        }
        let mut s = Subst::new();
        if n.persp {
            s = unify(&self.h, n.lit.persp, Term::atom(rec.persp), &s)?;
        }
        for k in &n.binds {
            s = unify(&self.h, n.lit.args[*k], args[*k], &s)?;
        }
        Some(s)
    }

    /// THE ROUNDS OF A LEVEL, over the news of every level below and then over what each round made, semi-naively. A
    /// rule whose news reaches a premise its plans cannot start from (solved in written order, such a premise is
    /// reached after the join of all those before it, for each news row) leaves the rounds: it fires whole once they
    /// are done, and the rounds go on over what that made, until nothing is new.
    fn level_rounds(&mut self, rules: &[Rc<ERule>], mut front: Front) -> Result<(), Halt> {
        let outer = std::mem::take(&mut self.live_front);
        let active = std::mem::replace(&mut self.active, rules.to_vec());
        let mut whole: Vec<Rc<ERule>> = Vec::new();
        let r = (|| -> Result<(), Halt> {
            loop {
                while !front.keys.is_empty() {
                    self.live_front = front.by_rel.keys().copied().collect();
                    self.cur_front = Front::default();
                    self.thr_round += 1;
                    self.thr_fresh.clear();
                    for r in rules {
                        if whole.iter().any(|w| w.id == r.id) {
                            continue;
                        }
                        let at: Vec<(usize, usize)> = r.plan.iter().enumerate().filter_map(|(i, b)| match b {
                            BodyElem::Pos(l) => front.by_rel.get(&l.rel).map(|k| (i, k.len())),
                            _ => None,
                        }).collect();
                        if at.iter().any(|&(i, n)| i > 0 && self.delta_pick(r, Some(i), n).is_none()) {
                            whole.push(r.clone());
                            continue;
                        }
                        let t = std::time::Instant::now();
                        self.fire_in_round(r, &front)?;
                        *self.ns_by_rule.entry(r.id).or_insert(0) += t.elapsed().as_nanos() as u64;
                    }
                    front = std::mem::take(&mut self.cur_front);
                }
                if whole.is_empty() {
                    return Ok(());
                }
                for r in whole.clone() {
                    let t = std::time::Instant::now();
                    let f = self.fire_rule(&r, None)?;
                    *self.ns_by_rule.entry(r.id).or_insert(0) += t.elapsed().as_nanos() as u64;
                    merge_front(&mut front, f);
                }
                if front.keys.is_empty() {
                    return Ok(());
                }
            }
        })();
        self.live_front = outer;
        self.active = active;
        r
    }

    /// DRed's overdeletion: each of `seeds` (which lost a firing, and may have gone with it) goes whole, and so does
    /// every fact with a firing that cites one gone, through each other; a base fact stays and loses its firings, to
    /// be given them again.
    fn overdelete(&mut self, mut seeds: Vec<FactId>, cm: &HashMap<FactId, Vec<FactId>>, over: &mut HashSet<FactId>, over_base: &mut HashSet<FactId>, d: &mut AddDelta) {
        let lost: HashSet<FactId> = seeds.iter().copied().collect();
        while let Some(x) = seeds.pop() {
            if over.contains(&x) || over_base.contains(&x) {
                continue;
            }
            if self.store.rec(x).base() {
                self.withdraw_firings(&[x], |_, _| true);
                over_base.insert(x);
                continue;
            }
            if !self.store.alive(x) && !brk!("add_lost_unseeded" => false; lost.contains(&x)) {
                continue;
            }
            self.withdraw_firings(&[x], |_, _| true);
            if self.store.alive(x) {
                self.store.remove_many(&[x]);
            }
            over.insert(x);
            d.overdeleted += 1;
            // (the citers were read before the addition: one made again since cites what holds now, or nothing gone)
            for y in cm.get(&x).into_iter().flatten() {
                if self.store.alive(*y) && !over.contains(y) && brk!("add_stale_citer_followed" => true; self.store.firings(*y).iter().any(|(_, _, ps)| ps.contains(&PremRef::Fact(x)))) {
                    seeds.push(*y);
                }
            }
        }
    }

    /// THE PART OF AN ADDITION THAT IS KEPT, level by level (DRed over the levels of a stratified program): at each
    /// level, a rule that reads what grew under a negation loses the firings a new fact now blocks (each new fact
    /// bound to the negated premise, the premises over what grew dropped, the rest solved: what the old firing was);
    /// a fact that lost a firing goes whole, and what rests on it, through each other, at any level above; each fact
    /// gone at this level is derived again from what holds (its rules solved with the fact bound to their head); a
    /// fact gone for good below makes a negation over it hold (the rule solved with it bound to the premise); and the
    /// news of every level below, and what this level made, fires the rules of the level semi-naively.
    #[allow(clippy::too_many_arguments)]
    fn fine_levels(&mut self, added: &[FactId], mono: &[Rc<ERule>], negs: &[(Rc<ERule>, Vec<NegAt>)], fresh: &[Rc<ERule>], recompute: &[Rc<ERule>], grown: &HashSet<Sym>, dirty: &HashSet<Sym>, skip: &HashSet<Sym>, d: &mut AddDelta) -> Result<(), Halt> {
        let mut levels: std::collections::BTreeSet<i64> = mono.iter().chain(fresh).chain(recompute).chain(negs.iter().map(|(r, _)| r)).map(|r| self.rule_level(r)).collect();
        levels.extend(grown.iter().filter(|r| !dirty.contains(r)).map(|r| self.rel_level(*r)));
        let mut by_head: HashMap<Sym, Vec<Rc<ERule>>> = HashMap::new();
        for r in self.rules.iter().filter(|r| r.clause.head.temporal != Temporal::Next && r.safe && !skip.contains(&r.id)) {
            by_head.entry(r.clause.head.rel).or_default().push(r.clone());
        }
        let cm = if negs.is_empty() && recompute.is_empty() { HashMap::new() } else { self.citer_map() };
        let mut news = Front::default();
        for f in added {
            news.note(self.store.rec(*f).rel, *f);
        }
        let mut over: HashSet<FactId> = HashSet::new();
        let mut over_base: HashSet<FactId> = HashSet::new();
        let mut gone: HashMap<Sym, Vec<FactId>> = HashMap::new();
        let derived_by = self.v.derived_by;
        let lvl: HashMap<Sym, i64> = mono.iter().chain(fresh).chain(recompute).chain(negs.iter().map(|(r, _)| r)).map(|r| (r.id, self.rule_level(r))).collect();
        for lv in levels {
            let at_ = |r: &Rc<ERule>| lvl[&r.id] == lv;
            // (a threshold is monotone: what its level makes after it was sealed again is news to it)
            let mut rules: Vec<Rc<ERule>> = mono.iter().chain(fresh).chain(recompute).chain(negs.iter().map(|(r, _)| r)).filter(|r| at_(r)).cloned().collect();
            rules.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
            // the firings a new fact blocks
            let mut seeds: Vec<FactId> = Vec::new();
            for (r, ns) in negs.iter().filter(|(r, _)| at_(r)) {
                let dropped: Vec<usize> = ns.iter().filter(|n| news.by_rel.contains_key(&n.lit.rel)).map(|n| n.at).collect();
                if dropped.is_empty() {
                    continue;
                }
                let plan: Vec<BodyElem> = r.plan.iter().enumerate().filter(|(i, _)| !dropped.contains(i)).map(|(_, b)| b.clone()).collect();
                for n in ns.iter().filter(|n| dropped.contains(&n.at)) {
                    let mut blockers: Vec<FactId> = news.by_rel[&n.lit.rel].iter().copied().collect();
                    blockers.sort_unstable();
                    for g in blockers {
                        let Some(s0) = self.bind_neg(n, g) else { continue };
                        for sol in self.solve_as(r, &plan, s0)? {
                            let mut prems = sol.prems.clone();
                            for j in &dropped {
                                let BodyElem::Neg(l) = &r.plan[*j] else { unreachable!() };
                                let k = self.anon_lit_key(l, &sol.s);
                                prems.insert(*j, PremRef::Neg(self.h.intern(&k)));
                            }
                            let head = &r.clause.head;
                            let persp = walk(&self.h, head.persp, &sol.s);
                            let args: Vec<Term> = head.args.iter().map(|a| resolve(&mut self.h, *a, &sol.s)).collect();
                            let Some(id) = persp.as_atom().and_then(|p| self.store.get(head.rel, p, &args)) else { continue };
                            if self.store.firings(id).iter().any(|(x, _, ps)| *x == r.id && *ps == prems) {
                                self.withdraw_firings(&[id], |x, ps| x == r.id && ps == prems.as_slice());
                                seeds.push(id);
                            }
                        }
                    }
                }
            }
            // what lost a firing goes whole (it may have gone with that firing already), and what rests on it, through
            // each other
            self.overdelete(seeds, &cm, &mut over, &mut over_base, d);
            // A RELATION A RESET RULE CONCLUDES IS DERIVED AGAIN WHOLE at its level (its cells sealed again): its facts go,
            // and every rule into it fires again over what holds; a fact that does not come back at once is taken as
            // lost, and what rests on it goes too (a fact of the relation that comes back keeps its record, and so what
            // cites it)
            let here: Vec<Rc<ERule>> = recompute.iter().filter(|r| at_(r)).cloned().collect();
            let heads: HashSet<Sym> = here.iter().map(|r| r.clause.head.rel).collect();
            let mut held: HashSet<FactId> = HashSet::new();
            let mut into: Vec<Rc<ERule>> = Vec::new();
            for h in &heads {
                for id in self.store.rel_all(&self.h, *h) {
                    held.insert(id);
                    self.withdraw_firings(&[id], |_, _| true);
                    if self.store.alive(id) && !self.store.rec(id).base() {
                        self.store.remove_many(&[id]);
                    }
                }
                into.extend(by_head.get(h).into_iter().flatten().cloned());
            }
            if !here.is_empty() {
                self.height_memo.clear();
                let ids: HashSet<Sym> = here.iter().map(|r| r.id).collect();
                d.stacked_cells += self.reset_cells(&ids);
                self.store.arrivals = Some(Vec::new());
                // fired whole over what holds; a threshold reached stays open, and closes with the level (after its
                // rounds), on every member the level makes, as an evaluation closes it
                let r = if brk!("add_threshold_closed_early" => true; false) {
                    self.refire(&into, &[])
                } else {
                    let saved = std::mem::take(&mut self.active);
                    let (strat, plain): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = into.iter().cloned().partition(|r| r.has_neg || r.has_agg || !r.lattice_outer.is_empty() || r.demand_strict);
                    let r = self.activate(&plain).and_then(|_| self.activate(&strat));
                    self.active = saved;
                    r
                };
                let came = self.store.arrivals.take().unwrap_or_default();
                r?;
                for id in came {
                    if !held.contains(&id) && self.store.alive(id) && self.store.rec(id).rel != derived_by {
                        news.note(self.store.rec(id).rel, id);
                    }
                }
                let lost: Vec<FactId> = held.iter().copied().filter(|id| !self.store.alive(*id)).collect();
                self.overdelete(lost, &cm, &mut over, &mut over_base, d);
            }
            self.store.arrivals = Some(Vec::new());
            let r = (|| -> Result<(), Halt> {
                // each fact gone at this level, derived again from what holds
                let mut again: Vec<FactId> = over.iter().chain(over_base.iter()).copied().filter(|x| {
                    let rec = self.store.rec(*x);
                    self.rel_level(rec.rel) == lv && !dirty.contains(&rec.rel) && !heads.contains(&rec.rel) && (rec.base() || !self.store.alive(*x))
                }).collect();
                again.sort_unstable();
                let mut out = Front::default();
                for x in again {
                    let (rel, persp) = (self.store.rec(x).rel, self.store.rec(x).persp);
                    let args = self.store.args(x).to_vec();
                    for r in by_head.get(&rel).cloned().unwrap_or_default() {
                        let mut s0 = Some(Subst::new());
                        s0 = s0.and_then(|s| unify(&self.h, r.clause.head.persp, Term::atom(persp), &s));
                        for (a, b) in r.clause.head.args.iter().zip(&args) {
                            s0 = s0.and_then(|s| unify(&self.h, *a, *b, &s));
                        }
                        let Some(s0) = s0.filter(|_| r.clause.head.args.len() == args.len()) else { continue };
                        for sol in self.solve_as(&r, &r.plan, s0)? {
                            self.conclude(&r, sol, &mut out)?;
                        }
                    }
                }
                // a fact gone for good below makes a negation over it hold
                for (r, ns) in negs.iter().filter(|(r, _)| at_(r)) {
                    for n in ns {
                        let mut freed: Vec<FactId> = gone.get(&n.lit.rel).cloned().unwrap_or_default();
                        freed.sort_unstable();
                        for g in freed {
                            let Some(s0) = self.bind_neg(n, g) else { continue };
                            for sol in self.solve_as(r, &r.plan, s0)? {
                                self.conclude(r, sol, &mut out)?;
                            }
                        }
                    }
                }
                self.active = rules.clone();
                for r in fresh.iter().filter(|r| at_(r)) {
                    let f = self.fire_rule(r, None)?;
                    merge_front(&mut out, f);
                }
                let mut front = news.clone();
                for id in self.store.arrivals.as_ref().map(|a| a.clone()).unwrap_or_default() {
                    if self.store.alive(id) {
                        front.note(self.store.rec(id).rel, id);
                    }
                }
                merge_front(&mut front, out);
                self.level_rounds(&rules, front)?;
                // a threshold reached at this level closes once what it reads is closed, as an evaluation closes it
                self.close_thresholds_below(lv.saturating_add(1), true)
            })();
            let arrived = self.store.arrivals.take().unwrap_or_default();
            r?;
            for id in arrived {
                let rel = self.store.rec(id).rel;
                if !self.store.alive(id) || rel == derived_by {
                    continue;
                }
                if over.contains(&id) || held.contains(&id) {
                    d.rederived += over.contains(&id) as usize;
                } else {
                    news.note(rel, id);
                }
            }
            for x in &over {
                let rel = self.store.rec(*x).rel;
                if self.rel_level(rel) == lv && !self.store.alive(*x) {
                    gone.entry(rel).or_default().push(*x);
                }
            }
        }
        while !self.thr_open.is_empty() {
            let open = self.thr_open.len();
            self.close_thresholds_below(i64::MAX, true)?;
            if self.thr_open.len() >= open {
                break;
            }
        }
        Ok(())
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
        // (one the change reaches neither through its own rules nor through a rule that calls it holds the same calls,
        // answered the same, and stays)
        let call_rels: HashSet<Sym> = called
            .iter()
            .copied()
            .chain(demanded.iter().copied().filter(|d| {
                let one = HashSet::from([*d]);
                brk!("add_demand_unreached_dropped" => false; grown.contains(d) || fresh.iter().any(|f| self.rule_of(*f).is_some_and(|r| reads(&r, &one).0)) || self.rules.iter().any(|r| reads(r, &one).0 && reads(r, grown).0))
            }))
            .collect();
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
        let mut negs: Vec<(Rc<ERule>, Vec<NegAt>)> = Vec::new();
        let mut new_plain: Vec<Rc<ERule>> = Vec::new();
        let mut staged: Vec<Rc<ERule>> = Vec::new();
        for r in &self.rules {
            let (any, inner) = reads(r, grown);
            if r.clause.head.temporal == Temporal::Next || called(r) {
                continue;
            }
            // a cell seals the rounds of what it reads: one over a relation whose round moved is sealed again
            if (r.has_agg || r.has_thr) && reads(r, moved).1 {
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
                // an added rule concludes nothing yet: one that negates fires whole at its level, after what it reads
                let whole = !r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.demand_strict;
                if stratified(r) && !brk!("add_fresh_negation_reset" => false; whole) {
                    reset.insert(r.id);
                } else {
                    new_plain.push(r.clone());
                }
            } else if any {
                let fine = || !r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.demand_strict && brk!("add_negation_reset" => false; true);
                if !inner && !r.has_agg && !r.has_thr {
                    mono.push(r.clone());
                } else if let Some(ns) = negs_of(&self.h, r, grown).filter(|_| inner && fine()) {
                    negs.push((r.clone(), ns));
                } else {
                    reset.insert(r.id);
                }
            }
        }
        // WHAT IS DERIVED AGAIN AFTER THE REST, and what rests on it, through each other: a lattice the change reaches,
        // what calls made, a closure walked whole (a reset rule elsewhere is derived again at its level)
        let mut dirty: HashSet<Sym> = self.rules.iter().filter(|r| reset.contains(&r.id) && (lats.contains(&r.clause.head.rel) || brk!("add_reset_after" => true; false))).map(|r| r.clause.head.rel).collect();
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
                if reset.contains(&c.base) || reset.contains(&c.step) {
                    dirty.insert(c.rel);
                }
            }
            if dirty.len() == n {
                break;
            }
        }
        // a rule that reads what is derived again after the rest under a negation or an aggregate may withdraw too:
        // reset with it
        for r in &self.rules {
            if r.clause.head.temporal == Temporal::Next || called(r) {
                continue;
            }
            let (any, inner) = reads(r, &dirty);
            if brk!("add_dirty_negation_kept" => false; inner || (any && (r.has_agg || r.has_thr))) {
                reset.insert(r.id);
            }
        }
        let recompute: Vec<Rc<ERule>> = self.rules.iter().filter(|r| reset.contains(&r.id) && !dirty.contains(&r.clause.head.rel)).cloned().collect();
        let reset_after: HashSet<Sym> = reset.iter().copied().filter(|id| !recompute.iter().any(|r| r.id == *id)).collect();
        let again: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.clause.head.temporal != Temporal::Next && !called(r) && (reset_after.contains(&r.id) || dirty.contains(&r.clause.head.rel)))
            .cloned()
            .collect();
        mono.retain(|r| !dirty.contains(&r.clause.head.rel));
        new_plain.retain(|r| !dirty.contains(&r.clause.head.rel));
        negs.retain(|(r, _)| !dirty.contains(&r.clause.head.rel));
        // a closure is walked whole from its base rule and its step fires nothing: where either is added the two fire
        // whole together (news reaches both through the edges, and a base fact of the relation stops the walk)
        for c in self.closures.iter().filter(|c| !dirty.contains(&c.rel)) {
            let pair: Vec<Rc<ERule>> = [c.base, c.step].iter().filter_map(|id| self.rule_of(*id)).collect();
            let has = |v: &[Rc<ERule>], id: Sym| v.iter().any(|r| r.id == id);
            if brk!("add_closure_unpaired" => false; has(&new_plain, c.base) || has(&new_plain, c.step)) {
                mono.retain(|r| r.id != c.base && r.id != c.step);
                new_plain.retain(|r| r.id != c.base && r.id != c.step);
                new_plain.extend(pair.iter().cloned());
            }
        }
        let mut changed: HashSet<Sym> = grown.union(&dirty).copied().collect();
        changed.extend(recompute.iter().map(|r| r.clause.head.rel));
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
        for r in mono.iter().chain(&new_plain).chain(&again).chain(&recompute).chain(negs.iter().map(|(r, _)| r)) {
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
        // a world that keeps no witness has no firing to name what a fact rests on: only the monotone part is kept
        if self.no_witness && (!reset.is_empty() || !negs.is_empty() || !call_rels.is_empty()) {
            return Err("the world keeps no witness, and what a negation or an aggregate withdraws is found through the firings");
        }
        // every fact of a reset rule's head goes, and what rests on it
        let mut forced: Vec<FactId> = Vec::new();
        let mut gone: HashSet<Sym> = self.rules.iter().filter(|r| reset_after.contains(&r.id)).map(|r| r.clause.head.rel).collect();
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
        let consumers = if forced.is_empty() { Vec::new() } else { self.consumer_facts(&[], &forced, &dirty, &HashSet::new(), &reset_after)? };
        let mut d = AddDelta {
            facts: added.len(),
            rules: fresh.len(),
            monotone: mono.len(),
            negated: negs.len(),
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
        d.stacked_cells = if reset_after.is_empty() { 0 } else { self.reset_cells(&reset_after) };
        if !reset.is_empty() || !consumers.is_empty() || !negs.is_empty() {
            self.support_ix = None;
        }
        self.height_memo.clear();
        if !call_rels.is_empty() {
            self.drop_done();
        }
        self.staged.retain(|_, f| !unstage.contains(&f.rule));
        // a staged rule that aggregates what changed stages again over cells sealed again
        let staged_cells: HashSet<Sym> = staged.iter().filter(|r| unstage.contains(&r.id) && (r.has_agg || r.has_thr)).map(|r| r.id).collect();
        if brk!("add_staged_cells_kept" => false; !staged_cells.is_empty()) {
            d.stacked_cells += self.reset_cells(&staged_cells);
            self.support_ix = None;
        }
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
            // the part kept, level by level: the news through the rules that read it, the added plain rules whole, and
            // under a negation the firings a new fact blocks withdrawn, what rested on them derived again
            let skip: HashSet<Sym> = again.iter().map(|r| r.id).collect();
            self.fine_levels(added, &mono, &negs, &new_plain, &recompute, grown, &dirty, &skip, &mut d)?;
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
