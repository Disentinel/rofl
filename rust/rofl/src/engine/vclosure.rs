//! THE CLOSURE OF A DECLARED TREE, ANSWERED FROM THE TREE (docs/data-structures.md,
//! `tree ast_in(P, C) closure ast_within.`). The declaration lowers to two rules
//! (`structure::lower_closure`) which the program holds as any rules, for
//! reflection and for `why`; under a sealed provenance this engine does not fire
//! them. The closure relation has no rows: each premise that reads it is
//! answered from the forest of the edge relation in the book it names
//! (`forest.rs`): both ends bound is interval containment, the descendant
//! bound is the parent chain, the ancestor bound is one pre-order range, and
//! with neither the ancestors of every node. The canonical state lists the
//! rows, generated on output (`Store::virtuals`), so a census counts them.
//!
//! WHEN. Only where no witness is kept (`sealed(provenance)`): a witness names
//! the facts a conclusion rests on, and a row that is not stored is no fact
//! (the materialised closure kernel, `fire_closure`, serves every other world,
//! and so does anything this engine does not answer for: an assumption, a
//! lattice, a closure the edges depend on). `vclosure_reason` says why a
//! declared closure is not virtual.
//!
//! THE EDGES MAY STILL ARRIVE. They are derived (`ast_in :- ast_child`) or
//! asserted. The forest is rebuilt whole whenever the edge relation has more
//! rows than when it was built, once per change, and a rule that reads the
//! closure is fired again, whole, when news of the edges reaches it and it has
//! not fired since they last changed (`fire_in_round`): the closure has no news
//! of its own.

use super::*;
use crate::forest::Forest;

#[derive(Clone)]
pub struct VClosure {
    pub rel: Sym,
    pub edge: Sym,
    /// The two lowered rules: the edge is a row, and a row and an edge are the next.
    base_rule: Sym,
    step_rule: Sym,
    pub active: bool,
    forests: Rc<[(Sym, Rc<Forest>)]>,
    built: Option<usize>,
    pairs: u64,
    deep: u64,
    internal: u64,
}

impl Eval {
    /// The closures the program declares and the rules that stand for them, read off the rule table.
    pub(super) fn vclosure_setup(&mut self) {
        self.vclosures.clear();
        self.vclosure_of.clear();
        self.vskip.clear();
        self.vreaders.clear();
        self.vreader_seen.clear();
        self.vclosure_reason.clear();
        self.vrow_of.clear();
        let decl = crate::structure::closures(&self.h, &self.v, &mut self.store);
        if decl.is_empty() {
            return;
        }
        let mut decl: Vec<(Sym, Sym)> = decl.into_iter().collect();
        decl.sort_by(|a, b| cmp_js(self.h.name(a.0), self.h.name(b.0)));
        let closure_rels: HashSet<Sym> = decl.iter().map(|d| d.0).collect();
        for (rel, edge) in decl {
            let ci = self.vclosures.len();
            let lowered: Vec<Sym> = self.rules.iter().filter(|r| r.clause.head.rel == rel).map(|r| r.id).collect();
            let mut why = String::new();
            if lowered.len() != 2 {
                why = format!("{} rules conclude it, not the two the declaration lowers to", lowered.len());
            } else if closure_rels.contains(&edge) {
                why = "its edges are another closure".to_string();
            } else if !brk!("vclosure_demand_unread" => true; false) && self.demand_rels.iter().any(|(r, _)| *r == rel || *r == edge) {
                why = "it is answered on demand".to_string();
            } else {
                let mut reach: HashSet<Sym> = HashSet::from([rel]);
                loop {
                    let n = reach.len();
                    for r in self.rules.iter().filter(|r| !lowered.contains(&r.id) && r.clause.head.temporal != Temporal::Next) {
                        if r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| reach.contains(&l.rel)) {
                            reach.insert(r.clause.head.rel);
                        }
                    }
                    if reach.len() == n {
                        break;
                    }
                }
                if reach.contains(&edge) {
                    why = "its edges are concluded from it".to_string();
                }
            }
            if !why.is_empty() {
                self.vclosure_reason.push(format!("{}: {why}", self.h.name(rel)));
            }
            for id in &lowered {
                self.vskip.insert(*id, ci);
            }
            self.vclosure_of.insert(rel, ci);
            let readers: Vec<Sym> = self
                .rules
                .iter()
                .filter(|r| !lowered.contains(&r.id) && r.clause.body.iter().any(|b| matches!(b, BodyElem::Pos(l) if l.rel == rel)))
                .map(|r| r.id)
                .collect();
            for r in readers {
                self.vreaders.entry(r).or_default().push(ci);
            }
            let rule_ids = match lowered.as_slice() {
                [a, b] if self.rules.iter().any(|r| r.id == *a && r.clause.body.len() == 1) => (*a, *b),
                [a, b] => (*b, *a),
                _ => (rel, rel),
            };
            self.vclosures.push(VClosure { rel, edge, base_rule: rule_ids.0, step_rule: rule_ids.1, active: false, forests: Rc::from(Vec::new()), built: None, pairs: 0, deep: 0, internal: 0 });
            if !why.is_empty() {
                self.vclosures[ci].built = Some(usize::MAX);
                self.vclosure_blocked.insert(ci);
            }
        }
    }

    /// WHICH CLOSURES THIS EVALUATION ANSWERS FROM THEIR TREES: those the program allows (no witness kept, no lattice,
    /// no assumption, nothing the closure's edges are concluded from), with the forests forgotten.
    pub(super) fn vclosure_engage(&mut self) {
        let mode = brk!("vclosure_with_witness" => true; self.no_witness) && self.lattices.is_empty() && self.assume.is_none() && !self.well_founded && !self.naive && self.tags.count_rel.is_empty() && std::env::var_os("ROFL_NO_VCLOSURE").is_none();
        for ci in 0..self.vclosures.len() {
            let on = mode && !self.vclosure_blocked.contains(&ci);
            let c = &mut self.vclosures[ci];
            c.active = on;
            c.forests = Rc::from(Vec::new());
            c.built = None;
            c.pairs = 0;
        }
        self.vreader_seen.clear();
        self.vrow_of.clear();
        self.vany = self.vclosures.iter().any(|c| c.active);
    }

    /// A WORLD OPENED FROM A SNAPSHOT is asked before anything evaluates it, and the closure's rows were never stored: the
    /// program is read and the closures that may be answered from their trees are engaged, the forests built from the edges
    /// the snapshot holds when first asked.
    pub fn vclosure_restore(&mut self) {
        if crate::structure::closures(&self.h, &self.v, &mut self.store).is_empty() {
            return;
        }
        self.prepare();
        if !brk!("vclosure_restore_unengaged" => true; false) {
            self.vclosure_engage();
            self.vpublish();
        }
    }

    /// The declared closures and whether each is answered from its tree.
    pub fn vclosure_info(&self) -> Vec<(String, bool)> {
        self.vclosures.iter().map(|c| (self.h.name(c.rel).to_string(), c.active)).collect()
    }

    pub(super) fn vclosure_active(&self) -> bool {
        self.vany
    }

    /// The closure answered from a tree for this relation, if it is.
    pub(super) fn vclosure_for(&self, rel: Sym) -> Option<usize> {
        if !self.vany {
            return None;
        }
        self.vclosure_of.get(&rel).copied().filter(|&ci| self.vclosures[ci].active)
    }

    /// The forests of a closure, one for each book of its edge relation, as the edges stand: built again when the edge
    /// relation has changed since.
    fn vforests(&mut self, ci: usize) -> Rc<[(Sym, Rc<Forest>)]> {
        let edge = self.vclosures[ci].edge;
        let n = self.store.rel_len_est(edge, None);
        if self.vclosures[ci].built != Some(n) && !(self.vclosures[ci].built.is_some() && brk!("vclosure_stale_forest" => true; false)) {
            let mut books: FxMap<Sym, Vec<(Term, Term)>> = FxMap::default();
            self.store.each_row(edge, |persp, id| {
                if let [p, c] = self.store.args(id) {
                    books.entry(persp).or_default().push((*p, *c));
                }
            });
            let mut books: Vec<(Sym, Vec<(Term, Term)>)> = books.into_iter().collect();
            books.sort_by_key(|b| b.0);
            let forests: Vec<(Sym, Rc<Forest>)> = books.into_iter().map(|(b, es)| (b, Rc::new(Forest::build(&es)))).collect();
            let c = &mut self.vclosures[ci];
            c.pairs = forests.iter().map(|f| f.1.pairs).sum();
            c.deep = forests.iter().map(|f| f.1.deep as u64).sum();
            c.internal = forests.iter().map(|f| f.1.internal as u64).sum();
            c.forests = Rc::from(forests);
            c.built = Some(n);
            self.vbuilds += 1;
        }
        self.vclosures[ci].forests.clone()
    }

    /// The forests of every active closure, built as the edges stand: the planner's estimates read them.
    pub(super) fn vrefresh(&mut self) {
        if !self.vany {
            return;
        }
        for ci in 0..self.vclosures.len() {
            if self.vclosures[ci].active {
                self.vforests(ci);
            }
        }
    }

    /// The rows of the closure `ci` that hold the ends given (a bound end is a ground term), in the book given or in every one.
    pub fn vrows(&mut self, ci: usize, book: Option<Sym>, a: Option<Term>, d: Option<Term>) -> Vec<(Sym, Term, Term)> {
        let forests = self.vforests(ci);
        let mut out = Vec::new();
        for (b, f) in forests.iter() {
            if book.is_some_and(|p| p != *b) && !brk!("vclosure_book_merged" => true; false) {
                continue;
            }
            match (a, d) {
                (Some(a), Some(d)) => {
                    if f.is_ancestor(a, d) {
                        out.push((*b, a, d));
                    }
                }
                (Some(a), None) => {
                    let mut v = Vec::new();
                    f.descendants(a, &mut v);
                    out.extend(v.into_iter().map(|d| (*b, a, d)));
                }
                (None, Some(d)) => {
                    let mut v = Vec::new();
                    f.ancestors(d, &mut v);
                    out.extend(v.into_iter().map(|a| (*b, a, d)));
                }
                (None, None) => f.each_pair(|a, d| out.push((*b, a, d))),
            }
        }
        self.vrows_read += out.len() as u64;
        out
    }

    /// The rows a question about a relation is answered with when the relation is a closure answered from its tree; None when it is not.
    pub fn vclosure_query(&mut self, rel: Sym, book: Option<Sym>, args: &[Term]) -> Option<Vec<(Sym, Term, Term)>> {
        let ci = self.vclosure_for(rel)?;
        if args.len() != 2 {
            return Some(Vec::new());
        }
        let (a, d) = (self.h.is_ground(args[0]).then_some(args[0]), self.h.is_ground(args[1]).then_some(args[1]));
        Some(self.vrows(ci, book, a, d))
    }

    /// A premise that reads the closure, answered from its tree: a solution for each row that unifies.
    pub(super) fn vmatch(&mut self, ci: usize, l: &Lit, s: &Subst) -> Vec<(Subst, PremRef)> {
        if l.args.len() != 2 || (l.temporal == Temporal::Init && self.store.tick != 0) {
            return Vec::new();
        }
        let persp_t = walk(&self.h, l.persp, s);
        let persp = persp_t.as_atom();
        let (ta, td) = (resolve(&mut self.h, l.args[0], s), resolve(&mut self.h, l.args[1], s));
        let a = self.h.is_ground(ta).then_some(ta);
        let d = self.h.is_ground(td).then_some(td);
        let mut out = Vec::new();
        for (book, x, y) in self.vrows(ci, persp, a, d) {
            if persp.is_none() && is_kernel_ledger(&self.h, book) {
                continue;
            }
            let s2 = match persp {
                Some(_) => Some(s.clone()),
                None => unify(&self.h, persp_t, Term::atom(book), s),
            };
            let Some(s2) = s2 else { continue };
            if let Some(s3) = unify_all(&self.h, &l.args, &[x, y], &s2) {
                out.push((s3, brk!("vclosure_premise_untagged" => PremRef::Neg(0); PremRef::VRow(0))));
            }
        }
        out
    }

    /// Does a row of the closure hold the ends given: the answer to a negation.
    pub(super) fn vexists(&mut self, ci: usize, l: &Lit, s: &Subst) -> bool {
        if l.args.len() != 2 || (l.temporal == Temporal::Init && self.store.tick != 0) {
            return false;
        }
        let persp = walk(&self.h, l.persp, s).as_atom();
        let (ta, td) = (resolve(&mut self.h, l.args[0], s), resolve(&mut self.h, l.args[1], s));
        if let (Some(p), true, true) = (persp, self.h.is_ground(ta), self.h.is_ground(td)) {
            let forests = self.vforests(ci);
            return forests.iter().any(|(b, f)| *b == p && f.is_ancestor(ta, td));
        }
        !self.vmatch(ci, l, s).is_empty()
    }

    /// The estimate of a premise that reads the closure: its rows, and the matches for each binding of the ends already
    /// bound (`cpos` by a constant, `vpos` by a variable). A both-bound premise is a test; an unbound one costs every row,
    /// so no plan puts it first.
    pub(super) fn vstat(&mut self, ci: usize, cpos: &[usize], vpos: &[usize]) -> (f64, f64) {
        self.vforests(ci);
        let c = &self.vclosures[ci];
        let (rows, deep, internal) = (c.pairs as f64, c.deep.max(1) as f64, c.internal.max(1) as f64);
        if c.pairs == 0 {
            return (0.0, 0.0);
        }
        let bound = |k: usize| cpos.contains(&k) || vpos.contains(&k);
        let konst = |k: usize| cpos.contains(&k);
        match (bound(0), bound(1)) {
            (true, true) => (if konst(0) && konst(1) { 1.0 } else { rows }, 1.0),
            (false, true) => (if konst(1) { rows / deep } else { rows }, (rows / deep).max(1.0)),
            (true, false) => (if konst(0) { rows / internal } else { rows }, (rows / internal).max(1.0)),
            (false, false) => brk!("vclosure_unbound_cheap" => (1.0, 1.0); (rows, rows)),
        }
    }

    /// The pairs of a closure: its size to the planner.
    pub(super) fn vlen(&self, ci: usize) -> usize {
        self.vclosures[ci].pairs as usize
    }

    /// WHAT THE STORE LISTS ON OUTPUT: the rows of every active closure, generated from the trees as the last evaluation left them.
    pub(super) fn vpublish(&mut self) {
        let mut rows: Vec<crate::store::VirtualRel> = Vec::new();
        for ci in 0..self.vclosures.len() {
            if !self.vclosures[ci].active {
                continue;
            }
            let forests = self.vforests(ci);
            rows.push(crate::store::VirtualRel { rel: self.vclosures[ci].rel, forests: forests.iter().map(|(b, f)| (*b, f.clone())).collect() });
        }
        self.store.virtuals = if brk!("vclosure_rows_unpublished" => true; false) { Vec::new() } else { rows };
    }

    /// A rule that reads a closure is fired whole when news of the closure's edges reaches it, unless it has already fired since they last changed.
    pub(super) fn vreader_due(&mut self, r: &Rc<ERule>, cur: &Front) -> bool {
        let Some(cis) = self.vreaders.get(&r.id) else { return false };
        let mut due = false;
        for &ci in cis.clone().iter() {
            let c = &self.vclosures[ci];
            if !c.active || !cur.by_rel.contains_key(&c.edge) {
                continue;
            }
            let rows = self.store.rel_len_est(c.edge, None);
            if self.vreader_seen.get(&(r.id, ci)) != Some(&rows) {
                due = true;
            }
        }
        due
    }

    /// A whole firing of a rule that reads a closure notes the rows its edges had.
    pub(super) fn vreader_fired(&mut self, r: &Rc<ERule>) {
        let Some(cis) = self.vreaders.get(&r.id) else { return };
        for &ci in cis.clone().iter() {
            if self.vclosures[ci].active {
                let rows = self.store.rel_len_est(self.vclosures[ci].edge, None);
                self.vreader_seen.insert((r.id, ci), rows);
            }
        }
    }
}

impl Eval {
    /// The premise of a match of a closure answered from its tree, spelled as the key of the row it is: what a firing records
    /// where it keeps its premises, and what a cell keeps of a member.
    pub(super) fn vrow_ref(&mut self, l: &Lit, s: &Subst) -> PremRef {
        let (Some(book), Some(&ci)) = (walk(&self.h, l.persp, s).as_atom(), self.vclosure_of.get(&l.rel)) else { return PremRef::VRow(0) };
        let (a, d) = (resolve(&mut self.h, l.args[0], s), resolve(&mut self.h, l.args[1], s));
        PremRef::VRow(self.vrow_key(ci, book, a, d))
    }

    /// The row a premise's key names: as it was cited in this engine, or read back from the key where the premise came from a snapshot.
    pub(super) fn vrow_entry(&mut self, k: Sym) -> Option<(usize, Sym, Term, Term)> {
        if let Some(e) = self.vrow_of.get(&k) {
            return Some(*e);
        }
        let lit = self.parse_lit(&self.h.name(k).to_string()).ok()?;
        let (book, ci) = (walk(&self.h, lit.persp, &Subst::default()).as_atom()?, *self.vclosure_of.get(&lit.rel)?);
        let [a, d] = lit.args[..] else { return None };
        self.vrow_of.insert(k, (ci, book, a, d));
        Some((ci, book, a, d))
    }

    fn vrow_key(&mut self, ci: usize, book: Sym, a: Term, d: Term) -> Sym {
        let mut key = String::new();
        write_fact_key(&self.h, self.vclosures[ci].rel, book, &[a, d], &mut key);
        let k = self.h.intern(&key);
        self.vrow_of.entry(k).or_insert((ci, book, a, d));
        k
    }

    /// The key of the row a question names, when the relation is a closure answered from its tree and the row holds.
    pub(super) fn vrow_held(&mut self, rel: Sym, book: Sym, args: &[Term]) -> Option<Sym> {
        let ci = self.vclosure_for(rel).filter(|_| !brk!("vclosure_why_absent" => true; false))?;
        let [a, d] = args else { return None };
        if self.vrows(ci, Some(book), Some(*a), Some(*d)).is_empty() {
            return None;
        }
        Some(self.vrow_key(ci, book, *a, *d))
    }

    /// WHAT THE LOWERED RULES FIRE FOR A ROW, rebuilt from the tree: the edge from the parent of the descendant is the
    /// row when the parent is the ancestor (the first rule), and else the row of the parent with that edge (the second).
    /// A forest gives a row one parent, so one firing.
    fn vderive(&mut self, k: Sym) -> Option<(Sym, Vec<PremRef>)> {
        let (ci, book, a, d) = self.vrow_entry(k)?;
        let forests = self.vforests(ci);
        let parent = forests.iter().find(|(b, _)| *b == book)?.1.parent_of(d)?;
        let edge = self.store.get(self.vclosures[ci].edge, book, &[parent, d])?;
        if brk!("vclosure_derive_always_step" => false; parent == a) {
            return Some((self.vclosures[ci].base_rule, vec![PremRef::Fact(edge)]));
        }
        let up = self.vrow_key(ci, book, a, parent);
        Some((self.vclosures[ci].step_rule, vec![PremRef::VRow(up), PremRef::Fact(edge)]))
    }

    /// A row answered from the tree, as `why` writes a fact: its firing, and below it the premises, a row written out once
    /// and referred to after.
    pub(super) fn render_vrow(&mut self, k: Sym, indent: usize, next: &mut Vec<WhyTask>) {
        let (key, pad) = (self.h.name(k).to_string(), "  ".repeat(indent));
        if !self.vrow_done.insert(k) && !brk!("vclosure_row_written_twice" => true; false) {
            return next.line(format!("{pad}{key} [above]"));
        }
        match self.vderive(k) {
            Some((rule, prems)) => {
                next.line(format!("{pad}{key}  <= {} @tick {}", self.h.name(rule), self.store.tick));
                next.extend(prems.into_iter().map(|p| WhyTask::Prem(p, indent + 1)));
            }
            None => next.line(format!("{pad}{key} [past tick]")),
        }
    }
}
