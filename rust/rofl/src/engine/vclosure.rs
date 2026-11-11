//! THE CLOSURE OF A DECLARED TREE, ANSWERED FROM THE TREE (docs/data-structures.md,
//! `tree ast_in(P, C) closure ast_within.`). The declaration lowers to two rules
//! (`structure::lower_closure`) which the program holds as any rules, for
//! reflection and for `why`; this engine does not fire them. The closure
//! relation has no rows: each premise that reads it is answered from the forest
//! of the edge relation in the book it names (`forest.rs`): both ends bound is
//! interval containment, the descendant bound is the parent chain, the ancestor
//! bound is one pre-order range, and with neither the ancestors of every node.
//! The canonical state lists the rows, generated on output (`Store::virtuals`),
//! so a census counts them.
//!
//! WHERE WITNESSES ARE KEPT a row is still no fact, and a forest gives it one
//! firing: the first lowered rule over the edge when the parent is the
//! ancestor, else the second over the row of the parent and the edge into the
//! descendant. A firing that matched a row cites its key (`PremRef::VRow`); the
//! row's height is its chain's (`Store::vrow_height`); its witness is written
//! with the state, its `derived_by` row when something observes the rows
//! (`vsettle`, from `settle_provenance`, so a tick's boundary freezes them as it
//! freezes every fired fact's) and its `why` built from the tree.
//!
//! WHEN NOT. The materialised closure kernel, `fire_closure`, serves what this
//! engine does not answer for: an assumption, a lattice, a closure the edges
//! depend on or answered on demand, and where witnesses are kept a rule that
//! reads the closure's `derived_by` rows. `vclosure_reason` says why a declared
//! closure is not virtual.
//!
//! THE EDGES MAY STILL ARRIVE. They are derived (`ast_in :- ast_child`) or
//! asserted. The forest is rebuilt whole whenever the edge relation has more
//! rows than when it was built, once per change, and a rule that reads the
//! closure is fired again, whole, when news of the edges reaches it and it has
//! not fired since they last changed (`fire_in_round`): the closure has no news
//! of its own. An addition gives it news: the rows the new edges make
//! (`vnews`), from which the reader is solved (`vfire_news`).

use crate::store::Prem;
use super::*;
use crate::forest::Forest;

#[derive(Clone)]
pub struct VClosure {
    pub rel: Sym,
    pub edge: Sym,
    /// The relation whose facts are the edges: the edge relation, or the source of an alias it is (engine/alias.rs).
    pub src: Sym,
    view: Option<crate::store::AliasView>,
    /// declared a `graph`: cycles allowed, answered by walking (graph.rs)
    graph: bool,
    pub active: bool,
    /// Where witnesses are kept, a rule reads the closure's `derived_by` rows: it is rows then.
    prov_read: bool,
    built: Option<usize>,
    /// The edges the forests were built from, and the first fact id after them: an edge of a later id is one added since.
    rows: usize,
    mark: FactId,
    /// the edges retired, and put back, when the forests were last brought up to date (`Store::deaths`,
    /// `Store::revived`)
    deaths: u64,
    revived: usize,
    /// a nearest: how far it has read what went of its edges, and what came back and went of its condition
    near_at: [usize; 3],
    pairs: u64,
    deep: u64,
    internal: u64,
    /// a nearest answers nothing before the level the stratification gives its step, which negates its condition
    open: bool,
}

impl Eval {
    /// The closures the program declares and the rules that stand for them, read off the rule table.
    pub(super) fn vclosure_setup(&mut self) {
        self.vc.vclosures.clear();
        self.vc.vclosure_of.clear();
        self.vc.skip.clear();
        self.vc.readers.clear();
        self.vc.reader_seen.clear();
        self.vc.reader_forest.clear();
        self.vc.settled.clear();
        self.vc.neg_read.clear();
        self.vc.base.clear();
        self.vc.vclosure_reason.clear();
        self.vc.vclosure_blocked.clear();
        self.store.vrow_of.clear();
        self.store.virtuals.clear();
        let mut decl: Vec<(Sym, Sym)> = crate::structure::closures(&self.h, &self.v, &mut self.store).into_iter().collect();
        let nearests = crate::structure::nearests(&self.h, &self.v, &mut self.store);
        let mut near_of: HashMap<Sym, Result<crate::store::NearSpec, &str>> = HashMap::new();
        for rel in &nearests {
            let (spec, edge) = self.near_spec(*rel);
            decl.push((*rel, edge));
            near_of.insert(*rel, spec);
        }
        if decl.is_empty() {
            return;
        }
        decl.sort_by(|a, b| cmp_js(self.h.name(a.0), self.h.name(b.0)));
        let closure_rels: HashSet<Sym> = decl.iter().map(|d| d.0).collect();
        let prov_read = self.provenance_read();
        let graphs = crate::structure::graphs(&self.h, &self.v, &mut self.store);
        let trees: HashSet<Sym> = crate::structure::trees(&self.h, &self.v, &mut self.store).iter().map(|t| t.rel).collect();
        for (rel, edge) in decl {
            let ci = self.vc.vclosures.len();
            let lowered: Vec<Sym> = self.rules.iter().filter(|r| r.clause.head.rel == rel).map(|r| r.id).collect();
            let near = near_of.get(&rel).cloned();
            let mut why = String::new();
            if lowered.len() != 2 {
                why = format!("{} rules conclude it, not the two the declaration lowers to", lowered.len());
            } else if let Some(Err(w)) = near {
                why = w.to_string();
            } else if near.is_some() && !trees.contains(&edge) {
                why = "its edges are not declared a tree".to_string();
            } else if closure_rels.contains(&edge) {
                why = "its edges are another closure".to_string();
            } else if !brk!("vclosure_demand_unread" => true; false) && (self.demand.on(rel) || self.demand.on(edge)) {
                why = "it is answered on demand".to_string();
            } else {
                let book_of = |pick: &dyn Fn(&ERule) -> Option<Option<Sym>>| self.rules.iter().filter(|r| lowered.contains(&r.id)).find_map(|r| pick(r)).flatten();
                let rbook = book_of(&|r| Some(r.clause.head.persp.as_atom()));
                let ebook = book_of(&|r| r.clause.body.iter().find_map(|b| match b {
                    BodyElem::Pos(l) if l.rel == edge => Some(l.persp.as_atom()),
                    _ => None,
                }));
                let reach = book_cone((rel, rbook), self.rules.iter().filter(|r| !lowered.contains(&r.id) && r.clause.head.temporal != Temporal::Next));
                let src = self.store.alias_view(edge).map(|v| v.src);
                if in_cone(&reach, edge, ebook) || src.is_some_and(|s| in_cone(&reach, s, None)) {
                    why = "its edges are concluded from it".to_string();
                } else if let Some(Ok(n)) = near.filter(|n| n.as_ref().is_ok_and(|n| in_cone(&reach, n.cond, Some(n.sbook)))) {
                    why = format!("{} is concluded from it", self.h.name(n.cond));
                }
            }
            if !why.is_empty() {
                self.vc.vclosure_reason.push(format!("{}: {why}", self.h.name(rel)));
            }
            for id in &lowered {
                self.vc.skip.insert(*id, ci);
            }
            self.vc.vclosure_of.insert(rel, ci);
            let readers: Vec<Sym> = self
                .rules
                .iter()
                .filter(|r| !lowered.contains(&r.id) && r.clause.body.iter().any(|b| matches!(b, BodyElem::Pos(l) if l.rel == rel)))
                .map(|r| r.id)
                .collect();
            for r in readers {
                self.vc.readers.entry(r).or_default().push(ci);
            }
            if self.rules.iter().any(|r| r.clause.body.iter().any(|b| matches!(b, BodyElem::Neg(l) if l.rel == rel))) {
                self.vc.neg_read.insert(ci);
            }
            // the base reads no row of the relation itself; the step does
            let base = |id: &Sym| self.rules.iter().any(|r| r.id == *id && !r.clause.body.iter().any(|b| matches!(b, BodyElem::Pos(l) if l.rel == rel)));
            let rule_ids = match lowered.as_slice() {
                [a, b] if base(a) => (*a, *b),
                [a, b] => (*b, *a),
                _ => (rel, rel),
            };
            let prov_read = prov_read.as_ref().is_none_or(|rels| rels.contains(&rel));
            if prov_read {
                self.vc.vclosure_reason.push(format!("{}: a rule reads its derived_by rows, which a world that keeps witnesses stores", self.h.name(rel)));
            }
            let view = self.store.alias_view(edge).cloned();
            let src = view.as_ref().map_or(edge, |v| v.src);
            self.vc.vclosures.push(VClosure { rel, edge, src, view, graph: graphs.contains(&edge), active: false, prov_read, built: None, rows: 0, mark: 0, deaths: 0, revived: 0, near_at: [0; 3], pairs: 0, deep: 0, internal: 0, open: true });
            let near = near.and_then(|n| n.ok());
            self.store.virtuals.push(crate::store::VirtualRel { rel, edge, base_rule: rule_ids.0, step_rule: rule_ids.1, forests: Rc::from(Vec::new()), near });
            if !why.is_empty() {
                self.vc.vclosures[ci].built = Some(usize::MAX);
                self.vc.vclosure_blocked.insert(ci);
            }
        }
    }

    /// A nearest's edges and what its ancestor is, read off the base rule it lowers to (`R[b](A, D) :- E[e](A, D), S[s](A).`).
    fn near_spec(&self, rel: Sym) -> (Result<crate::store::NearSpec, &'static str>, Sym) {
        let base = self.rules.iter().find(|r| r.clause.head.rel == rel && r.clause.body.len() == 2);
        let Some(r) = base else { return (Err("its base rule is not there"), rel) };
        let (BodyElem::Pos(e), BodyElem::Pos(w)) = (&r.clause.body[0], &r.clause.body[1]) else { return (Err("its base rule is not the one it lowers to"), rel) };
        match (r.clause.head.persp.as_atom(), e.persp.as_atom(), w.persp.as_atom()) {
            (Some(rbook), Some(ebook), Some(sbook)) => (Ok(crate::store::NearSpec { rbook, ebook, cond: w.rel, sbook }), e.rel),
            _ => (Err("a book of it is not named"), e.rel),
        }
    }

    /// THE RULES READ AGAIN OVER AN EVALUATED WORLD (an addition, `Session::load_delta`): the program's closures are
    /// read again, and where they are the same closures, answered the same way, the forests the evaluation built and
    /// the keys its firings cite are kept, so what was derived over them stands. False where a closure is declared,
    /// dropped or answered another way: the world is evaluated again.
    pub fn reprepare_keeping_trees(&mut self) -> bool {
        let kept = (self.vc.vclosures.clone(), self.store.virtuals.clone(), self.store.vrow_of.clone(), self.vc.any, self.store.vlisted, self.store.vwit, self.vc.reader_seen.clone(), self.vc.reader_forest.clone(), self.vc.settled.clone());
        let was_blocked = self.vc.vclosure_blocked.clone();
        self.reprepare();
        if kept.0.is_empty() && self.vc.vclosures.is_empty() {
            return true;
        }
        let n = kept.0.len();
        // a closure declared after the others, over a relation that holds no row yet, is engaged as an evaluation engages it
        let same = n <= self.vc.vclosures.len()
            && kept.0.iter().zip(&self.vc.vclosures).enumerate().all(|(ci, (a, b))| a.rel == b.rel && a.edge == b.edge && a.prov_read == b.prov_read && was_blocked.contains(&ci) == self.vc.vclosure_blocked.contains(&ci))
            && self.vc.vclosures[n..].iter().map(|c| c.rel).collect::<Vec<_>>().into_iter().all(|r| self.store.rel_all(&self.h, r).iter().all(|f| !self.store.alive(*f)));
        if !same || brk!("add_trees_dropped" => true; false) {
            return false;
        }
        let fresh: Vec<VClosure> = self.vc.vclosures.drain(n..).collect();
        self.vc.vclosures = kept.0;
        self.vc.vclosures.extend(fresh);
        for (ci, v) in kept.1.into_iter().enumerate() {
            self.store.virtuals[ci].forests = v.forests;
        }
        self.store.vrow_of = kept.2;
        self.store.vlisted = kept.4;
        self.store.vwit = kept.5;
        self.vc.reader_seen = kept.6;
        self.vc.reader_forest = kept.7;
        self.vc.settled = kept.8;
        if n < self.vc.vclosures.len() {
            let witnessed = !self.prov.no_witness;
            let mode = !self.lat.has_cells() && self.assume.is_none() && !self.well_founded && !self.naive && self.lat.counts().next().is_none() && std::env::var_os("ROFL_NO_VCLOSURE").is_none();
            for ci in n..self.vc.vclosures.len() {
                self.vc.vclosures[ci].active = mode && !self.vc.vclosure_blocked.contains(&ci) && !(witnessed && self.vc.vclosures[ci].prov_read);
            }
            if !kept.3 {
                self.store.vwit = witnessed;
            }
            self.store.vlisted = false;
        }
        self.vc.any = self.vc.vclosures.iter().any(|c| c.active);
        true
    }

    /// The relations whose `derived_by` rows a rule reads (`$fact(Rel, ..)`), None where one reads every relation's.
    fn provenance_read(&self) -> Option<HashSet<Sym>> {
        let mut out = HashSet::new();
        for r in &self.rules {
            for l in r.clause.body.iter().flat_map(|b| b.lits_deep()) {
                if l.rel != self.v.derived_by {
                    continue;
                }
                let Some(TermK::Func(i)) = l.args.first().map(|a| a.kind()) else { return None };
                if self.h.fname(i) != self.v.s_fact {
                    return None;
                }
                out.insert(self.h.fargs(i).first()?.as_atom()?);
            }
        }
        Some(out)
    }

    /// WHICH CLOSURES THIS EVALUATION ANSWERS FROM THEIR TREES: those the program allows (no lattice, no assumption,
    /// nothing the closure's edges are concluded from, and where witnesses are kept no rule that reads the closure's
    /// `derived_by` rows), with the forests forgotten.
    pub(super) fn vclosure_engage(&mut self) {
        let mode = !self.lat.has_cells() && self.assume.is_none() && !self.well_founded && !self.naive && self.lat.counts().next().is_none() && std::env::var_os("ROFL_NO_VCLOSURE").is_none();
        let witnessed = !self.prov.no_witness && !brk!("vclosure_prov_read_ignored" => true; false);
        for ci in 0..self.vc.vclosures.len() {
            // a closure of a lemma stage's lower world: its rows are lemmas, given to the upper world as facts
            let (rel, base, step) = (self.store.virtuals[ci].rel, self.store.virtuals[ci].base_rule, self.store.virtuals[ci].step_rule);
            let lemma = match &self.stage_pass {
                StagePass::Lower(s) | StagePass::Upper(s) => s.contains(&base) || s.contains(&step),
                StagePass::Whole => false,
            } || self.store.rel_all(&self.h, rel).iter().any(|f| self.store.alive(*f))
                || self.staged_away.as_ref().is_some_and(|(_, gone)| gone.contains(&rel));
            if lemma {
                let why = format!("{}: it is concluded below a lemma stage, whose rows are given as lemmas", self.h.name(rel));
                if !self.vc.vclosure_reason.contains(&why) {
                    self.vc.vclosure_reason.push(why);
                }
            }
            let on = mode && !lemma && !self.vc.vclosure_blocked.contains(&ci) && (!witnessed || !self.vc.vclosures[ci].prov_read);
            let near = self.store.virtuals[ci].near.is_some();
            let c = &mut self.vc.vclosures[ci];
            c.active = on;
            c.open = !near;
            c.built = None;
            c.pairs = 0;
            self.store.virtuals[ci].forests = Rc::from(Vec::new());
        }
        self.store.vwit = witnessed;
        self.vc.reader_seen.clear();
        self.vc.reader_forest.clear();
        self.vc.settled.clear();
        self.vc.any = self.vc.vclosures.iter().any(|c| c.active);
    }

    /// A WORLD OPENED FROM A SNAPSHOT is asked before anything evaluates it, and the closure's rows were never stored: the
    /// program is read and the closures that may be answered from their trees are engaged, the forests built from the edges
    /// the snapshot holds when first asked.
    pub fn vclosure_restore(&mut self) {
        if let Some(st) = self.lemma_stage() {
            self.note_staged_away(&st);
        }
        if crate::structure::closures(&self.h, &self.v, &mut self.store).is_empty() && crate::structure::nearests(&self.h, &self.v, &mut self.store).is_empty() {
            return;
        }
        if !brk!("vclosure_restore_unengaged" => true; false) {
            self.vclosure_engage();
            // the world was evaluated: every level was reached
            for c in &mut self.vc.vclosures {
                c.open = true;
            }
            // a volume brings the rows read and the forests built, published once they are read (`read_forests`)
            if !self.store.vrow_of.is_empty() {
                return;
            }
            self.vc.vpublish(&mut self.store);
            self.vsettle_forests();
            // the rows the snapshot's witnesses and members cite are named by their keys: read now, for their heights
            let mut keys: Vec<Sym> = Vec::new();
            for id in self.store.firing_keys() {
                for (_, _, ps) in self.store.firings(id) {
                    keys.extend(ps.iter().filter_map(|p| if let Prem::VRow(k) = p.kind() { Some(k) } else { None }));
                }
            }
            for c in self.store.live_cells() {
                for m in self.store.cell_members(c) {
                    keys.extend(self.store.member_derivs(m).flatten().filter_map(|p| if let Prem::VRow(k) = p.kind() { Some(k) } else { None }));
                }
            }
            for k in keys.into_iter().filter(|_| !brk!("vclosure_restore_keys_unread" => true; false)) {
                self.vrow_entry(k);
            }
        }
    }

    /// What cites a row of a tree, by the row's descendant (`Store::vciters`), from every firing the store keeps.
    pub(super) fn vindex_citers(&mut self) {
        let mut cited: Vec<(FactId, Sym)> = Vec::new();
        super::meter::walk("row_citer_index", self.store.len_ids() as usize);
        for id in self.store.firing_keys() {
            for (_, _, prems) in self.store.firings(id) {
                for p in prems {
                    if let Prem::VRow(k) = p.kind() {
                        if k != 0 {
                            cited.push((id, k));
                        }
                    }
                }
            }
        }
        let mut rows: Vec<[u32; 4]> = cited.into_iter().filter_map(|(id, k)| self.vrow_entry(k).map(|(_, _, _, d)| [d.bits() as u32, (d.bits() >> 32) as u32, id, k])).collect();
        rows.sort_unstable();
        self.store.vciters = Some(Rc::new(crate::store::VCiters { rows: rows.concat().into(), ..Default::default() }));
    }

    /// THE EDGES OF A TREE A RETRACTION TAKES OUT (`retract_set`), before they go: each tree an edge of `facts` is in
    /// is built again from its edges that stand (`Forest::rebuild_trees`), the rest of the forest as it was, and the
    /// facts that cited a row of a tree built again that no longer holds are what the retraction overdeletes besides.
    /// The closures touched, for `vretract_done` once the edges are gone from the store.
    pub(super) fn vretract_edges(&mut self, facts: &[FactId]) -> (Vec<FactId>, Vec<usize>) {
        let (mut out, mut touched) = (Vec::new(), Vec::new());
        if !self.vc.any {
            return (out, touched);
        }
        for ci in 0..self.vc.vclosures.len() {
            if !self.vc.vclosures[ci].active {
                continue;
            }
            if self.store.virtuals[ci].near.is_some() {
                if let Some(seeds) = self.vnear_retract(ci, facts) {
                    out.extend(seeds);
                    touched.push(ci);
                }
                continue;
            }
            let src = self.vc.vclosures[ci].src;
            let mut by_book: FxMap<Sym, Vec<(Term, Term)>> = FxMap::default();
            let mut old = 0;
            for &f in facts {
                if self.store.rec(f).rel != src {
                    continue;
                }
                if let Some(e) = self.vc.vedge(&self.store, ci, f) {
                    by_book.entry(self.store.rec(f).persp).or_default().push(e);
                    old += (f < self.vc.vclosures[ci].mark) as usize;
                }
            }
            if by_book.is_empty() {
                continue;
            }
            // the forest as it stood before the retraction: the edges it took out are found in it
            if self.vc.vclosures[ci].built.is_none() {
                continue;
            }
            if self.store.vciters.is_none() {
                self.vindex_citers();
            }
            let held = std::mem::replace(&mut self.store.virtuals[ci].forests, Rc::from(Vec::new()));
            let mut forests: Vec<(Sym, Rc<Forest>)> = held.to_vec();
            drop(held);
            for (book, es) in by_book {
                let Some(slot) = forests.iter_mut().find(|f| f.0 == book) else { continue };
                let forest = Rc::make_mut(&mut slot.1);
                let dropped = forest.rebuild_trees(&es, &[]);
                for d in dropped {
                    let cites: Vec<(FactId, Sym)> = self.store.vciters.as_ref().map(|m| m.of(d.bits())).unwrap_or_default();
                    for (y, k) in cites {
                        if !self.store.alive(y) || !self.store.cites(y, PremRef::VRow(k)) {
                            continue;
                        }
                        let Some((c, b, a, dd)) = self.vrow_entry(k) else { continue };
                        if c == ci && b == book && brk!("vclosure_gone_rows_kept" => false; !forest.is_ancestor(a, dd)) {
                            out.push(y);
                        }
                    }
                }
            }
            self.store.virtuals[ci].forests = Rc::from(forests);
            let c = &mut self.vc.vclosures[ci];
            c.rows -= old;
            touched.push(ci);
        }
        (out, touched)
    }

    /// The rows a question about a relation is answered with when the relation is a closure answered from its tree; None when it is not.
    pub fn vclosure_query(&mut self, rel: Sym, book: Option<Sym>, args: &[Term]) -> Option<Vec<(Sym, Term, Term)>> {
        let ci = self.vc.vclosure_for(rel)?;
        if args.len() != 2 {
            return Some(Vec::new());
        }
        let (a, d) = (self.h.is_ground(args[0]).then_some(args[0]), self.h.is_ground(args[1]).then_some(args[1]));
        Some(self.vc.vrows(&mut self.store, ci, book, a, d))
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
        // the rows in the order a stored closure's are read: by key, unless a firing's order is unobservable
        let sorted = !(self.store.unordered && self.firing);
        let mut out: Vec<(String, Subst, PremRef)> = Vec::new();
        for (book, x, y) in self.vc.vrows(&mut self.store, ci, persp, a, d) {
            if persp.is_none() && is_kernel_ledger(&self.h, book) {
                continue;
            }
            let s2 = match persp {
                Some(_) => Some(s.clone()),
                None => unify(&self.h, persp_t, Term::atom(book), s),
            };
            let Some(s2) = s2 else { continue };
            if let Some(s3) = unify_all(&self.h, &l.args, &[x, y], &s2) {
                let key = if sorted { fact_key(&self.h, self.vc.vclosures[ci].rel, book, &[x, y]) } else { String::new() };
                out.push((key, s3, brk!("vclosure_premise_untagged" => PremRef::Neg(0); PremRef::VRow(0))));
            }
        }
        if sorted {
            out.sort_by(|p, q| cmp_js(&p.0, &q.0));
        }
        out.into_iter().map(|(_, s, p)| (s, p)).collect()
    }

    /// Does a row of the closure hold the ends given: the answer to a negation.
    pub(super) fn vexists(&mut self, ci: usize, l: &Lit, s: &Subst) -> bool {
        if l.args.len() != 2 || (l.temporal == Temporal::Init && self.store.tick != 0) {
            return false;
        }
        let persp = walk(&self.h, l.persp, s).as_atom();
        let (ta, td) = (resolve(&mut self.h, l.args[0], s), resolve(&mut self.h, l.args[1], s));
        if let (Some(p), true, true) = (persp, self.h.is_ground(ta), self.h.is_ground(td)) {
            let forests = self.vc.vforests(&mut self.store, ci);
            return forests.iter().any(|(b, f)| *b == p && f.is_ancestor(ta, td));
        }
        !self.vmatch(ci, l, s).is_empty()
    }

    /// PROVENANCE ON DEMAND OF A CLOSURE ANSWERED FROM ITS TREE, where witnesses are kept: the `derived_by` row of each
    /// row of the closure, its one firing at the tick evaluated, written when something observes the rows
    /// (`settle_provenance`) as the noted firings' are, and taken out again when the trees have changed since.
    pub(super) fn vsettle(&mut self) {
        if !self.vc.any || self.prov.no_provenance || !self.store.vlisted || brk!("vclosure_prov_unsettled" => true; false) {
            return;
        }
        let stamp = (self.store.tick, self.vc.builds);
        if self.vc.prov_stamp == Some(stamp) && self.vc.prov_ids.iter().all(|i| self.store.alive(*i)) {
            return;
        }
        let tick = Term::int(self.store.tick as i64);
        let mut rows: Vec<(Sym, Sym, Term, Term, Sym)> = Vec::new();
        for v in &self.store.virtuals {
            for (book, f) in v.forests.iter() {
                f.each_pair(|a, d| {
                    let (base, step) = f.firings(a, d);
                    for (fires, rule) in [(base, v.base_rule), (step, v.step_rule)] {
                        if fires {
                            rows.push((v.rel, *book, a, d, rule));
                        }
                    }
                });
            }
        }
        let mut ids: Vec<FactId> = Vec::with_capacity(rows.len());
        for (rel, book, a, d, rule) in rows {
            let ft = fact_term(&mut self.h, &self.v, rel, book, &[a, d]);
            ids.push(self.store.put(&self.h, self.v.derived_by, self.v.kernel_persp, &[ft, Term::atom(rule), tick], 0).0);
        }
        let now: HashSet<FactId> = ids.iter().copied().collect();
        let gone: Vec<FactId> = std::mem::take(&mut self.vc.prov_ids)
            .into_iter()
            .filter(|i| !now.contains(i) && self.store.alive(*i) && !self.store.rec(*i).frozen() && !self.store.rec(*i).base())
            .collect();
        self.store.remove_many(&gone);
        self.vc.prov_ids = ids;
        self.vc.prov_stamp = Some(stamp);
    }

    /// A rule that reads a closure, fired in an addition on the closure's news: each premise over the closure bound to
    /// each new end and each new row in turn, the rest solved from it in the planner's order; whole where the rule takes
    /// no such order.
    pub(super) fn vfire_news(&mut self, r: &Rc<ERule>, cur: &Front) -> Result<Front, Halt> {
        let all: Vec<usize> = (0..r.plan.len()).collect();
        let mut at: Vec<(Lit, usize, Vec<usize>, Vec<usize>)> = Vec::new();
        let mut near: Vec<(Lit, usize, Vec<usize>)> = Vec::new();
        for b in r.plan.iter() {
            let BodyElem::Pos(l) = b else { continue };
            let Some(ci) = self.vc.vclosure_for(l.rel) else { continue };
            if self.store.virtuals[ci].near.is_some() {
                let mut pre = Vec::new();
                for t in l.args.iter().chain([&l.persp]) {
                    self.h.vars_of(*t, &mut pre);
                }
                match self.bound_order(r, &all, &pre) {
                    Some(o) if l.args.len() == 2 => near.push((l.clone(), ci, o)),
                    _ => return self.fire_rule(r, None),
                }
                continue;
            }
            if !cur.by_rel.contains_key(&self.vc.vclosures[ci].src) {
                continue;
            }
            let (mut end, mut pre) = (Vec::new(), Vec::new());
            for t in l.args.iter().chain([&l.persp]) {
                self.h.vars_of(*t, &mut pre);
            }
            for t in l.args.iter().skip(1).chain([&l.persp]) {
                self.h.vars_of(*t, &mut end);
            }
            match (self.bound_order(r, &all, &end), self.bound_order(r, &all, &pre)) {
                (Some(oe), Some(o)) if l.args.len() == 2 => at.push((l.clone(), ci, oe, o)),
                _ => return self.fire_rule(r, None),
            }
        }
        let mut out = Front::default();
        for (l, ci, o) in near {
            let rows = self.vnear_news(r.id, ci, cur);
            let seeds: Vec<Subst> = rows.into_iter().filter_map(|(book, a, d)| unify(&self.h, l.persp, Term::atom(book), &Subst::new()).and_then(|s| unify_all(&self.h, &l.args, &[a, d], &s))).collect();
            for sol in self.solve_bound(r, &all, Some(&o), seeds)? {
                self.conclude(r, sol, &mut out)?;
            }
        }
        for (l, ci, oe, o) in at {
            let (ends, rows) = self.vc.vnews(&mut self.store, ci, cur);
            let seeds: Vec<Subst> = ends.into_iter().filter_map(|(book, d)| unify(&self.h, l.persp, Term::atom(book), &Subst::new()).and_then(|s| unify(&self.h, l.args[1], d, &s))).collect();
            for sol in self.solve_bound(r, &all, Some(&oe), seeds)? {
                self.conclude(r, sol, &mut out)?;
            }
            let seeds: Vec<Subst> = rows.into_iter().filter_map(|(book, a, d)| unify(&self.h, l.persp, Term::atom(book), &Subst::new()).and_then(|s| unify_all(&self.h, &l.args, &[a, d], &s))).collect();
            for sol in self.solve_bound(r, &all, Some(&o), seeds)? {
                self.conclude(r, sol, &mut out)?;
            }
        }
        Ok(out)
    }

}

impl Eval {
    /// THE LEVEL OF A NEAREST REACHED: its step reads its condition under a negation, so the stratification puts it
    /// above what concludes the condition, and before that level it answers nothing. At it the closure opens and every
    /// rule that reads it, at this level or below, fires whole over the condition complete; one above fires at its own.
    pub(super) fn vopen_below(&mut self, lv: i64) -> Result<(), Halt> {
        let opening: Vec<usize> = (0..self.vc.vclosures.len())
            .filter(|ci| {
                let (c, step) = (&self.vc.vclosures[*ci], self.store.virtuals[*ci].step_rule);
                c.active && !c.open && self.rules.iter().find(|r| r.id == step).is_none_or(|r| self.rule_level(r) <= lv)
            })
            .collect();
        if opening.is_empty() {
            return Ok(());
        }
        for &ci in &opening {
            let c = &mut self.vc.vclosures[ci];
            (c.open, c.built) = (true, None);
            self.vc.reader_seen.retain(|(_, x), _| *x != ci);
            self.vc.reader_forest.retain(|(_, x), _| *x != ci);
            // a negation reads the forests as they stand
            self.vc.vforests(&mut self.store, ci);
        }
        let readers: Vec<Rc<ERule>> = self.rules.iter().filter(|r| self.vc.readers.get(&r.id).is_some_and(|cs| cs.iter().any(|c| opening.contains(c))) && self.stage_fires(r) && self.rule_level(r) <= lv).cloned().collect();
        self.activate(&readers)
    }

    /// The forests of each closure a negation reads, as a delta finds them: its change is counted against them
    /// (`vneg_rows`).
    pub(super) fn vsnapshot(&mut self) {
        self.vc.base.clear();
        self.vc.unbased = false;
        for ci in self.vfollowed() {
            // (a world opened over a base holds no forest it built whole, `write_forests`: it is built from the edges
            // as they stand, which is what its readers last fired over)
            let f = match self.vc.settled.get(&ci) {
                Some(f) => f.clone(),
                None => self.vc.vforests(&mut self.store, ci),
            };
            self.vc.base.insert(ci, Some(f));
        }
    }

    /// The closures a delta counts its change against: each nearest, and each closure a negation reads.
    fn vfollowed(&self) -> Vec<usize> {
        (0..self.vc.vclosures.len()).filter(|ci| self.vc.vclosures[*ci].active && (self.store.virtuals[*ci].near.is_some() || self.vc.neg_read.contains(ci))).collect()
    }

    /// The forests of the followed closures as the store now stands: what the next delta counts against.
    pub(super) fn vsettle_forests(&mut self) {
        self.vc.settled.clear();
        for ci in self.vfollowed() {
            let f = self.vc.vforests(&mut self.store, ci);
            self.vc.settled.insert(ci, f);
        }
    }

    /// THE ROWS A DELTA PUT INTO AND TOOK OUT OF a closure a negation reads, by its book: under each node an edge of the
    /// news or of what went leads into, and each node its condition came to hold or stopped holding of, the rows the
    /// forests hold now against those the delta found. None for a relation that is no such closure.
    pub(super) fn vneg_rows(&mut self, rel: Sym, news: &Front, gone: &HashMap<Sym, Vec<FactId>>) -> Option<(Vec<(Sym, [Term; 2])>, Vec<(Sym, [Term; 2])>)> {
        let ci = self.vc.vclosure_for(rel)?;
        let base = self.vc.base.get(&ci)?.clone();
        let src = self.vc.vclosures[ci].src;
        let near = self.store.virtuals[ci].near;
        let mut touched: Vec<Term> = Vec::new();
        let ids = |r: Sym| news.by_rel.get(&r).into_iter().flatten().copied().chain(gone.get(&r).into_iter().flatten().copied()).collect::<Vec<FactId>>();
        for id in ids(src) {
            if near.is_none_or(|n| self.store.rec(id).persp == n.ebook) {
                touched.extend(self.vc.vedge(&self.store, ci, id).map(|e| e.1));
            }
        }
        if let Some(n) = near {
            for id in ids(n.cond) {
                if self.store.rec(id).persp == n.sbook {
                    touched.extend(self.store.args(id).first().copied());
                }
            }
        }
        if touched.is_empty() {
            return Some((Vec::new(), Vec::new()));
        }
        let Some(base) = base else {
            self.vc.unbased = true;
            return Some((Vec::new(), Vec::new()));
        };
        let forests = self.vc.vforests(&mut self.store, ci);
        let rows = |fs: &[(Sym, Rc<Forest>)]| {
            let mut out: FxSet<(Sym, u64, u64)> = FxSet::default();
            for (book, f) in fs {
                let mut set = FxSet::default();
                for t in &touched {
                    f.rows_under(*t, &mut set);
                }
                out.extend(set.into_iter().map(|(a, d)| (*book, a, d)));
            }
            out
        };
        let (was, now) = (rows(&base), rows(&forests));
        let pick = |a: &FxSet<(Sym, u64, u64)>, b: &FxSet<(Sym, u64, u64)>| {
            let mut v: Vec<(Sym, [Term; 2])> = a.iter().filter(|r| !b.contains(*r)).map(|(k, x, y)| (*k, [Term::from_bits(*x), Term::from_bits(*y)])).collect();
            v.sort_unstable_by_key(|(k, [x, y])| (*k, x.bits(), y.bits()));
            v
        };
        Some((pick(&now, &was), pick(&was, &now)))
    }

    /// THE ROWS A DELTA PUT INTO AND TOOK OUT OF A NEAREST so far: under each node an edge that came or went leads into
    /// and each node its condition came to hold or stopped holding of, the forest now against the one the delta found.
    fn vnear_delta(&mut self, ci: usize, news: &Front, gone: &HashMap<Sym, Vec<FactId>>) -> Option<(FxSet<(u64, u64)>, FxSet<(u64, u64)>)> {
        let s = self.store.virtuals[ci].near?;
        let src = self.vc.vclosures[ci].src;
        let ids = |r: Sym| news.by_rel.get(&r).into_iter().flatten().copied().chain(gone.get(&r).into_iter().flatten().copied()).collect::<Vec<FactId>>();
        let mut touched: Vec<Term> = Vec::new();
        for id in ids(src) {
            if self.store.rec(id).persp == s.ebook {
                touched.extend(self.vc.vedge(&self.store, ci, id).map(|e| e.1));
            }
        }
        for id in ids(s.cond) {
            if self.store.rec(id).persp == s.sbook {
                touched.extend(self.store.args(id).first().copied());
            }
        }
        if touched.is_empty() {
            return None;
        }
        let Some(base) = self.vc.base.get(&ci).cloned().flatten() else {
            self.vc.unbased = true;
            return None;
        };
        let forests = self.vc.vforests(&mut self.store, ci);
        let (mut was, mut now) = (FxSet::default(), FxSet::default());
        for t in &touched {
            for (_, f) in base.iter() {
                f.near_rows_under(*t, &mut was);
            }
            for (_, f) in forests.iter() {
                f.near_rows_under(*t, &mut now);
            }
        }
        let came = now.iter().filter(|r| !was.contains(*r)).copied().collect();
        let went = was.iter().filter(|r| !now.contains(*r)).copied().collect();
        Some((came, went))
    }

    /// The nearests answered from their trees.
    fn vnears(&self) -> Vec<usize> {
        (0..self.vc.vclosures.len()).filter(|ci| self.vc.vclosures[*ci].active && self.store.virtuals[*ci].near.is_some()).collect()
    }

    /// A ROW A DELTA TOOK OUT OF A NEAREST takes with it what cited it: the facts to overdelete as level `lv` begins,
    /// which are derived again at their level where another row or rule makes them. A citer below `lv` could not be
    /// (its level is past): the delta is given up (`near_moved`).
    pub(super) fn vnear_went(&mut self, lv: i64, news: &Front, gone: &HashMap<Sym, Vec<FactId>>) -> Vec<FactId> {
        let mut out = Vec::new();
        for ci in self.vnears() {
            let Some((_, went)) = self.vnear_delta(ci, news, gone) else { continue };
            let Some(s) = self.store.virtuals[ci].near else { continue };
            for (a, d) in went {
                if !self.vc.near_out.insert((ci, a, d)) {
                    continue;
                }
                if self.store.vciters.is_none() {
                    self.vindex_citers();
                }
                let cites: Vec<(FactId, Sym)> = self.store.vciters.as_ref().map(|m| m.of(d)).unwrap_or_default();
                for (y, k) in cites {
                    if self.store.alive(y) && self.store.cites(y, PremRef::VRow(k)) && self.vrow_entry(k).is_some_and(|(c, b, x, dd)| c == ci && b == s.rbook && x.bits() == a && dd.bits() == d) {
                        let rc = self.store.rec(y);
                        if self.fact_level(rc.rel, rc.persp) < lv {
                            self.vc.near_moved = true;
                        }
                        out.push(y);
                    }
                }
            }
        }
        out
    }

    /// A ROW A RETRACTION PUT INTO A NEAREST is news to the rules that read it: each plain reader of level `lv` solved
    /// from each such row it was not yet fired on, bound to its premise over the nearest.
    pub(super) fn vnear_came(&mut self, lv: i64, news: &Front, gone: &HashMap<Sym, Vec<FactId>>, out: &mut Front) -> Result<(), Halt> {
        for (ci, readers) in self.vnear_unfired(lv, news, gone) {
            let Some(s) = self.store.virtuals[ci].near else { continue };
            let rel = self.vc.vclosures[ci].rel;
            for (r, rows) in readers {
                let all: Vec<usize> = (0..r.plan.len()).collect();
                let lits: Vec<Lit> = r.plan.iter().filter_map(|b| if let BodyElem::Pos(l) = b { (l.rel == rel && l.args.len() == 2).then(|| l.clone()) } else { None }).collect();
                for l in lits {
                    let mut pre = Vec::new();
                    for t in l.args.iter().chain([&l.persp]) {
                        self.h.vars_of(*t, &mut pre);
                    }
                    let Some(o) = self.bound_order(&r, &all, &pre) else {
                        let f = self.fire_rule(&r, None)?;
                        merge_front(out, f);
                        break;
                    };
                    let seeds: Vec<Subst> = rows.iter().filter_map(|(a, d)| unify(&self.h, l.persp, Term::atom(s.rbook), &Subst::new()).and_then(|x| unify_all(&self.h, &l.args, &[Term::from_bits(*a), Term::from_bits(*d)], &x))).collect();
                    for sol in self.solve_bound(&r, &all, Some(&o), seeds)? {
                        self.conclude(&r, sol, out)?;
                    }
                }
                self.vc.near_in.entry((r.id, ci)).or_default().extend(rows);
                self.vc.vreader_fired(&self.store, &r);
            }
        }
        Ok(())
    }

    /// The rows a delta put into each nearest so far that a plain reader of level `lv` was not fired on, by reader.
    pub(super) fn vnear_unfired(&mut self, lv: i64, news: &Front, gone: &HashMap<Sym, Vec<FactId>>) -> Vec<(usize, Vec<(Rc<ERule>, Vec<(u64, u64)>)>)> {
        let mut out = Vec::new();
        for ci in self.vnears() {
            let Some((came, _)) = self.vnear_delta(ci, news, gone) else { continue };
            if came.is_empty() {
                continue;
            }
            let mut by = Vec::new();
            for r in self.rules.iter().filter(|r| self.vnear_reader(r, ci) && self.rule_level(r) == lv) {
                let mut rows: Vec<(u64, u64)> = came.iter().filter(|x| !self.vc.near_in.get(&(r.id, ci)).is_some_and(|m| m.contains(*x))).copied().collect();
                if !rows.is_empty() {
                    rows.sort_unstable();
                    by.push((r.clone(), rows));
                }
            }
            if !by.is_empty() {
                out.push((ci, by));
            }
        }
        out
    }

    /// Whether `r` reads the nearest `ci` and fires here.
    fn vnear_reader(&self, r: &Rc<ERule>, ci: usize) -> bool {
        self.vc.readers.get(&r.id).is_some_and(|cs| cs.contains(&ci)) && r.safe && self.stage_fires(r)
    }

    /// THE NEWS OF A NEAREST, in an addition: the rows its build put in under the new edges' children and the nodes its
    /// condition newly holds of, against the forest before. A row it took out is no news an addition can follow
    /// (`near_moved`): the world is evaluated again.
    fn vnear_news(&mut self, rule: Sym, ci: usize, cur: &Front) -> Vec<(Sym, Term, Term)> {
        let forests = self.vc.vforests(&mut self.store, ci);
        let Some(s) = self.store.virtuals[ci].near else { return Vec::new() };
        let mut touched: Vec<Term> = Vec::new();
        for id in cur.by_rel.get(&self.vc.vclosures[ci].src).into_iter().flatten() {
            if self.store.rec(*id).persp == s.ebook {
                touched.extend(self.vc.vedge(&self.store, ci, *id).map(|e| e.1));
            }
        }
        for id in cur.by_rel.get(&s.cond).into_iter().flatten() {
            if self.store.rec(*id).persp == s.sbook {
                touched.extend(self.store.args(*id).first().copied());
            }
        }
        // what the reader saw: the forest it last fired over, else the one the delta found
        let prev = self.vc.reader_forest.insert((rule, ci), forests.clone()).or_else(|| self.vc.base.get(&ci).cloned().flatten());
        if prev.is_none() {
            self.vc.unbased = true;
        }
        let (mut was, mut now) = (FxSet::default(), FxSet::default());
        for t in &touched {
            for (_, f) in prev.iter().flat_map(|p| p.iter()) {
                f.near_rows_under(*t, &mut was);
            }
            for (_, f) in forests.iter() {
                f.near_rows_under(*t, &mut now);
            }
        }
        self.vc.near_owed.extend(was.iter().filter(|r| !now.contains(*r)).map(|r| (ci, r.0, r.1)));
        let mut out: Vec<(Sym, Term, Term)> = now.iter().filter(|r| !was.contains(*r)).map(|(a, d)| (s.rbook, Term::from_bits(*a), Term::from_bits(*d))).collect();
        out.sort_unstable_by_key(|(_, a, d)| (a.bits(), d.bits()));
        out
    }

    /// Whether a row a reader saw gone is gone and no level took out what cited it. A row gone while its edges were
    /// derived again and back when they stood holds as it did: what cites it stands.
    pub(super) fn vnear_owes(&mut self) -> bool {
        let owed: Vec<(usize, u64, u64)> = self.vc.near_owed.iter().filter(|r| !self.vc.near_out.contains(*r)).copied().collect();
        owed.into_iter().any(|(ci, a, d)| {
            let forests = self.vc.vforests(&mut self.store, ci);
            !forests.iter().any(|(_, f)| f.near_is(a, Term::from_bits(d)))
        })
    }

    /// Whether the retraction, now whole, left a nearest a row it did not hold before that some rule reading it was not
    /// fired on (`vnear_came`). A row a level put in and a later level took out (the condition gone a level before the
    /// edges under it) is none.
    pub(super) fn vnear_put_in(&mut self) -> bool {
        let was: Vec<_> = self.vc.near_was.drain().collect();
        for (ci, (old, touched)) in was {
            let forests = self.vc.vforests(&mut self.store, ci);
            let (mut before, mut now) = (FxSet::default(), FxSet::default());
            for t in &touched {
                for (_, f) in old.iter() {
                    f.near_rows_under(*t, &mut before);
                }
                for (_, f) in forests.iter() {
                    f.near_rows_under(*t, &mut now);
                }
            }
            let put: Vec<(u64, u64)> = now.iter().filter(|r| !before.contains(*r)).copied().collect();
            if !put.is_empty() {
                let rel = self.vc.vclosures[ci].rel;
                let readers: Vec<Rc<ERule>> = self.rules.iter().filter(|r| self.vc.readers.get(&r.id).is_some_and(|cs| cs.contains(&ci))).cloned().collect();
                for r in readers {
                    let plain = self.vnear_reader(&r, ci) && !r.plan.iter().any(|b| !matches!(b, BodyElem::Pos(_)) && b.lits_deep().iter().any(|l| l.rel == rel));
                    let fired = self.vc.near_in.get(&(r.id, ci));
                    if !plain || put.iter().any(|x| !fired.is_some_and(|m| m.contains(x))) {
                        return true;
                    }
                }
            }
            // its readers were brought to this forest by the retraction: their next news are counted against it
            self.vc.reader_forest.retain(|(_, x), _| *x != ci);
        }
        false
    }

    /// A NEAREST IN A RETRACTION: its forest built again as the store stands without `facts`, and the facts that cited a
    /// row under what went that no longer holds, to overdelete. What it put in is judged once the retraction is whole
    /// (`vnear_put_in`).
    fn vnear_retract(&mut self, ci: usize, facts: &[FactId]) -> Option<Vec<FactId>> {
        let s = self.store.virtuals[ci].near?;
        let src = self.vc.vclosures[ci].src;
        let mut touched: Vec<Term> = Vec::new();
        for &f in facts {
            let rc = self.store.rec(f);
            if rc.rel == src && rc.persp == s.ebook {
                touched.extend(self.vc.vedge(&self.store, ci, f).map(|e| e.1));
            } else if rc.rel == s.cond && rc.persp == s.sbook {
                touched.extend(self.store.args(f).first().copied());
            }
        }
        if touched.is_empty() || self.vc.vclosures[ci].built.is_none() {
            return None;
        }
        let old = self.store.virtuals[ci].forests.clone();
        self.vc.near_was.entry(ci).or_insert_with(|| (old.clone(), Vec::new())).1.extend(&touched);
        let (mut was, mut now) = (FxSet::default(), FxSet::default());
        for t in &touched {
            for (_, f) in old.iter() {
                f.near_rows_under(*t, &mut was);
            }
        }
        drop(old);
        // (not the count it was built at: it is brought up to what went)
        self.vc.vclosures[ci].built = Some(usize::MAX);
        let forests = self.vc.vforests(&mut self.store, ci);
        for t in &touched {
            for (_, f) in forests.iter() {
                f.near_rows_under(*t, &mut now);
            }
        }
        if self.store.vciters.is_none() {
            self.vindex_citers();
        }
        let mut out = Vec::new();
        for (a, d) in was.into_iter().filter(|r| !now.contains(r)) {
            let cites: Vec<(FactId, Sym)> = self.store.vciters.as_ref().map(|m| m.of(d)).unwrap_or_default();
            for (y, k) in cites {
                if self.store.alive(y) && self.store.cites(y, PremRef::VRow(k)) && self.vrow_entry(k).is_some_and(|(c, b, x, dd)| c == ci && b == s.rbook && x.bits() == a && dd.bits() == d) {
                    out.push(y);
                }
            }
        }
        Some(out)
    }

    /// The row a premise's key names: as it was cited in this engine, or read back from the key where the premise came from a snapshot.
    pub(super) fn vrow_entry(&mut self, k: Sym) -> Option<(usize, Sym, Term, Term)> {
        if let Some(e) = self.store.vrow_of.get(&k) {
            return Some(e);
        }
        let name = self.h.name(k).to_string();
        let lit = self.parse_lit(&name).ok()?;
        let (book, ci) = (walk(&self.h, lit.persp, &Subst::default()).as_atom()?, *self.vc.vclosure_of.get(&lit.rel)?);
        let [a, d] = lit.args[..] else { return None };
        self.store.vrow_of.name(k, (ci, book, a, d));
        Some((ci, book, a, d))
    }

    /// The key of the row a question names, when the relation is a closure answered from its tree and the row holds.
    pub(super) fn vrow_held(&mut self, rel: Sym, book: Sym, args: &[Term]) -> Option<Sym> {
        let ci = self.vc.vclosure_for(rel).filter(|_| !brk!("vclosure_why_absent" => true; false))?;
        let [a, d] = args else { return None };
        if self.vc.vrows(&mut self.store, ci, Some(book), Some(*a), Some(*d)).is_empty() {
            return None;
        }
        Some(self.vc.vrow_key(&mut self.h, &mut self.store, ci, book, *a, *d))
    }

    /// WHAT THE LOWERED RULES FIRE FOR A ROW, rebuilt from the tree: the edge from the parent of the descendant is the
    /// row when the parent is the ancestor (the first rule), and else the row of the parent with that edge (the second).
    /// A forest gives a row one parent, so one firing.
    fn vderive(&mut self, k: Sym) -> Option<(Sym, Vec<PremRef>)> {
        let (ci, book, a, d) = self.vrow_entry(k)?;
        self.vc.vforests(&mut self.store, ci);
        let v = &self.store.virtuals[ci];
        let (rule, ps) = v.firing_prems(book, a, d)?;
        let rule = brk!("vclosure_derive_always_step" => v.step_rule; rule);
        let mut out = Vec::with_capacity(ps.len());
        for p in ps {
            out.push(match p {
                crate::store::VPrem::Fact(r, b, args) => match self.store.get(r, b, &args) {
                    Some(e) => PremRef::Fact(e),
                    None => PremRef::Fact(self.alias_fact(r, b, &args)?),
                },
                crate::store::VPrem::Row(a, p) => PremRef::VRow(self.vc.vrow_key(&mut self.h, &mut self.store, ci, book, a, p)),
                crate::store::VPrem::Neg(r, b, x) => {
                    let k = fact_key(&self.h, r, b, &[x]);
                    PremRef::Neg(self.h.key(&k))
                }
            });
        }
        Some((rule, out))
    }

    /// A row answered from the tree, as `why` writes a fact: its firing, and below it the premises, a row written out once
    /// and referred to after.
    pub(super) fn render_vrow(&mut self, k: Sym, indent: usize, next: &mut Vec<WhyTask>) {
        let (key, pad) = (self.h.name(k).to_string(), "  ".repeat(indent));
        if !self.vc.row_done.insert(k) && !brk!("vclosure_row_written_twice" => true; false) {
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

    /// Does a row of a closure answered from its tree hold, as the forests stand: what a stored row's presence says.
    pub(super) fn vrow_holds(&self, rel: Sym, book: Sym, args: &[Term]) -> bool {
        let (Some(ci), [a, d]) = (self.vc.vclosure_for(rel), args) else { return false };
        !brk!("vclosure_unknown_row_absent" => true; false) && self.store.virtuals[ci].forests.iter().any(|(b, f)| *b == book && f.is_ancestor(*a, *d))
    }

    /// Does a change of these relations reach what a nearest answered from its tree reads: its edges, or (`cond_only`)
    /// what its ancestor is, the growth of which may take a row out.
    pub(super) fn near_reached(&self, grown: &HashSet<Sym>, cond_only: bool) -> bool {
        self.vc.any && self.vc.vclosures.iter().zip(self.store.virtuals.iter()).any(|(c, v)| {
            c.active && v.near.is_some_and(|n| grown.contains(&n.cond) || (!cond_only && grown.contains(&c.src)))
        })
    }

    /// Can a change of `rel` reach the edges of a closure answered from its tree, through the rules (a negation and an
    /// aggregate included)? A retraction that cannot leaves every forest as it is, and is worked out as a delta.
    pub(super) fn vedges_reached(&self, rel: Sym) -> bool {
        if !self.vc.any {
            return false;
        }
        let edges: HashSet<Sym> = self.vc.vclosures.iter().filter(|c| c.active).map(|c| c.src).collect();
        let reached = readers_cone(HashSet::from([rel]), self.rules.iter(), reads_any).iter().any(|r| edges.contains(r));
        reached && !brk!("vclosure_retract_edge_delta" => true; false)
    }
}

/// The relations, each with its book (None: every book, as a variable names it), that `seed` reaches through `rules`: a
/// rule fires on a premise of a relation in the set whose book can be the same.
fn book_cone<'a>(seed: (Sym, Option<Sym>), rules: impl Iterator<Item = &'a Rc<ERule>> + Clone) -> HashSet<(Sym, Option<Sym>)> {
    let mut set = HashSet::from([seed]);
    loop {
        let n = set.len();
        for r in rules.clone() {
            if r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| in_cone(&set, l.rel, l.persp.as_atom())) {
                set.insert((r.clause.head.rel, r.clause.head.persp.as_atom()));
            }
        }
        if set.len() == n {
            return set;
        }
    }
}

fn in_cone(set: &HashSet<(Sym, Option<Sym>)>, rel: Sym, book: Option<Sym>) -> bool {
    set.contains(&(rel, None)) || match book {
        Some(_) => set.contains(&(rel, book)),
        None => set.iter().any(|(r, _)| *r == rel),
    }
}

impl VClosure {
    /// declared a `graph`: its closure is walked, over edges that may cross the files
    pub(super) fn is_graph(&self) -> bool {
        self.graph
    }
}

impl VClosureState {
    /// The forests the closures answered from their trees were built to, as a volume keeps them: a world opened is
    /// asked without building them again from every edge.
    pub(crate) fn write_forests(&self, store: &Store, w: &mut crate::arena::VolW) {
        w.u32(self.vclosures.len() as u32);
        for (ci, c) in self.vclosures.iter().enumerate() {
            // over a base, a forest built again whole is not written: an opening builds it from the edges
            let fs = &store.virtuals[ci].forests;
            let Some(n) = c.built.filter(|_| c.active && (!w.is_over() || fs.iter().all(|f| f.1.kept_by(w)))) else {
                w.u32(0);
                continue;
            };
            w.u32(1);
            for x in [n as u64, c.rows as u64, c.mark as u64, c.pairs, c.deep, c.internal] {
                w.u64(x);
            }
            w.u32(fs.len() as u32);
            for (b, f) in fs.iter() {
                w.u32(*b);
                f.write(w);
            }
        }
    }

    pub(crate) fn read_forests(&mut self, store: &mut Store, r: &mut crate::arena::VolR) -> Result<(), String> {
        for ci in 0..r.u32()? as usize {
            if r.u32()? == 0 {
                continue;
            }
            let [n, rows, mark, pairs, deep, internal] = [(); 6].map(|_| r.u64());
            let mut fs: Vec<(Sym, Rc<Forest>)> = Vec::new();
            for _ in 0..r.u32()? {
                let b = r.u32()?;
                fs.push((b, Rc::new(Forest::read(r)?)));
            }
            // one built at the opening for as many edges is the same forest: the one read lies in the volume
            if let Some(c) = self.vclosures.get_mut(ci).filter(|c| c.active && c.built.is_none_or(|b| Some(b as u64) == n.as_ref().ok().copied())) {
                (c.built, c.rows, c.mark, c.pairs, c.deep, c.internal) = (Some(n? as usize), rows? as usize, mark? as FactId, pairs?, deep?, internal?);
                c.deaths = store.deaths.get(&c.src).copied().unwrap_or(0);
                c.revived = store.revived.get(&c.src).map_or(0, Vec::len);
                if let Some(s) = store.virtuals[ci].near {
                    c.near_at = Self::vnear_at(store, c.src, s.cond);
                }
                store.virtuals[ci].forests = Rc::from(fs);
                if store.virtuals[ci].near.is_some() || self.neg_read.contains(&ci) {
                    self.settled.insert(ci, store.virtuals[ci].forests.clone());
                }
            }
        }
        Ok(())
    }

    /// The declared closures and whether each is answered from its tree.
    pub fn vclosure_info(&self, h: &Heap) -> Vec<(String, bool)> {
        self.vclosures.iter().map(|c| (h.name(c.rel).to_string(), c.active)).collect()
    }

    /// The closure answered from a tree for this relation, if it is.
    pub(super) fn vclosure_for(&self, rel: Sym) -> Option<usize> {
        if !self.any {
            return None;
        }
        self.vclosure_of.get(&rel).copied().filter(|&ci| self.vclosures[ci].active)
    }

    /// The forests of a closure, one for each book of its edge relation, as the edges stand: built again when the edge
    /// relation has changed since.
    fn vforests(&mut self, store: &mut Store, ci: usize) -> Rc<[(Sym, Rc<Forest>)]> {
        if !self.vclosures[ci].open {
            return Rc::from(Vec::new());
        }
        let edge = self.vclosures[ci].src;
        let near = store.virtuals[ci].near;
        let n = self.vseen(store, ci);
        if self.vclosures[ci].built != Some(n) && !(self.vclosures[ci].built.is_some() && brk!("vclosure_stale_forest" => true; false)) {
            let t = std::time::Instant::now();
            let moved = if near.is_some() { self.vnear_moved(store, ci) } else { self.vextended(store, ci) };
            let forests = match moved {
                Some(f) => f,
                None if near.is_some() => {
                    let s = near.unwrap();
                    let mut es: Vec<(Term, Term)> = Vec::new();
                    let mut rows = 0;
                    let mut seen: FxSet<(u64, u64)> = FxSet::default();
                    store.each_row(edge, |persp, id| {
                        if let Some((p, c)) = self.vedge(store, ci, id).filter(|_| persp == s.ebook) {
                            rows += 1;
                            if seen.insert((p.bits(), c.bits())) {
                                es.push((p, c));
                            }
                        }
                    });
                    let mut marked: FxSet<u64> = FxSet::default();
                    store.each_row(s.cond, |persp, id| {
                        if let [x] = store.args(id) {
                            if persp == s.sbook {
                                marked.insert(x.bits());
                            }
                        }
                    });
                    self.vclosures[ci].rows = rows;
                    super::meter::walk("nearest_forest", rows + marked.len());
                    vec![(s.rbook, Rc::new(Forest::build_nearest(&es, &marked)))]
                }
                None => {
                    let mut books: FxMap<Sym, Vec<(Term, Term)>> = FxMap::default();
                    let mut rows = 0;
                    let mut seen: FxSet<(Sym, u64, u64)> = FxSet::default();
                    store.each_row(edge, |persp, id| {
                        if let Some((p, c)) = self.vedge(store, ci, id) {
                            rows += 1;
                            if seen.insert((persp, p.bits(), c.bits())) {
                                books.entry(persp).or_default().push((p, c));
                            }
                        }
                    });
                    self.vclosures[ci].rows = rows;
                    super::meter::walk("forest", rows);
                    let mut books: Vec<(Sym, Vec<(Term, Term)>)> = books.into_iter().collect();
                    books.sort_by_key(|b| b.0);
                    let graph = self.vclosures[ci].graph;
                    books.into_iter().map(|(b, es)| (b, Rc::new(if graph { Forest::build_graph(&es) } else { Forest::build(&es) }))).collect()
                }
            };
            self.vclosures[ci].mark = store.len_ids();
            self.vclosures[ci].deaths = store.deaths.get(&edge).copied().unwrap_or(0);
            self.vclosures[ci].revived = store.revived.get(&edge).map_or(0, Vec::len);
            if let Some(s) = near {
                self.vclosures[ci].near_at = Self::vnear_at(store, edge, s.cond);
            }
            let c = &mut self.vclosures[ci];
            c.pairs = forests.iter().map(|f| f.1.pairs).sum();
            c.deep = forests.iter().map(|f| f.1.deep as u64).sum();
            c.internal = forests.iter().map(|f| f.1.internal as u64).sum();
            c.built = Some(n);
            store.virtuals[ci].forests = Rc::from(forests);
            super::meter::spent("each_forest", t);
            self.builds += 1;
        }
        store.virtuals[ci].forests.clone()
    }

    /// How far a nearest has read what went of its edges `src` and what came back and went of its condition; from
    /// here on the store notes what goes of both.
    fn vnear_at(store: &mut Store, src: Sym, cond: Sym) -> [usize; 3] {
        let died = store.died.entry(src).or_default().len();
        [died, store.revived.get(&cond).map_or(0, Vec::len), store.died.entry(cond).or_default().len()]
    }

    /// The forest of the nearest `ci` with what moved since it was built: the edges and the marks that came, came back
    /// or went, and the trees they are in built again (`Forest::renear`). What it costs is what moved and the trees it
    /// reaches. None where the store did not note what went, or the edges are a view's.
    fn vnear_moved(&mut self, store: &mut Store, ci: usize) -> Option<Vec<(Sym, Rc<Forest>)>> {
        let c = &self.vclosures[ci];
        c.built?;
        let s = store.virtuals[ci].near?;
        if c.view.is_some() {
            return None;
        }
        let (src, mark) = (c.src, c.mark);
        let [(book, old)] = &store.virtuals[ci].forests[..] else { return None };
        let since = |m: &FxMap<Sym, Vec<FactId>>, r: Sym, at: usize| m.get(&r).map_or(&[][..], |v| &v[at.min(v.len())..]).to_vec();
        let (mut edges, mut conds) = (since(&store.revived, src, c.revived), since(&store.revived, s.cond, c.near_at[1]));
        edges.extend(since(&store.died, src, c.near_at[0]));
        conds.extend(since(&store.died, s.cond, c.near_at[2]));
        store.died.get(&src)?;
        store.died.get(&s.cond)?;
        for id in mark..store.len_ids() {
            let r = store.rec(id).rel;
            if r == src {
                edges.push(id);
            } else if r == s.cond {
                conds.push(id);
            }
        }
        edges.sort_unstable();
        edges.dedup();
        let (mut removed, mut added, mut touched) = (Vec::new(), Vec::new(), Vec::new());
        let mut rows = c.rows as i64;
        for id in edges {
            if store.rec(id).persp != s.ebook {
                continue;
            }
            let Some((p, ch)) = self.vedge(store, ci, id) else { continue };
            let held = old.parent_of(ch).is_some_and(|q| q.bits() == p.bits());
            match (store.alive(id), held) {
                (true, false) => {
                    added.push((p, ch));
                    rows += 1;
                }
                (false, true) => {
                    removed.push((p, ch));
                    rows -= 1;
                }
                _ => {}
            }
        }
        for id in conds {
            if let [x] = store.args(id) {
                if store.rec(id).persp == s.sbook {
                    touched.push(*x);
                }
            }
        }
        let (book, mut f) = (*book, old.clone());
        if !(removed.is_empty() && added.is_empty() && touched.is_empty()) {
            // (the store's hold on it let go: it is copied only where a delta keeps it as it found it)
            store.virtuals[ci].forests = Rc::from(Vec::new());
            if Rc::strong_count(&f) > 1 {
                super::meter::walk("forest_copied", f.nodes());
            }
            Rc::make_mut(&mut f).renear(&removed, &added, &touched, &|x| store.has(s.cond, s.sbook, &[x]));
        }
        self.vclosures[ci].rows = rows.max(0) as usize;
        Some(vec![(book, f)])
    }

    /// The edge a fact of the closure's edge relation is, its parent and child; an alias's from the row of its source.
    fn vedge(&self, store: &Store, ci: usize, id: FactId) -> Option<(Term, Term)> {
        let args = store.args(id);
        match &self.vclosures[ci].view {
            Some(v) => match v.project(args)?.as_slice() {
                [p, c] => Some((*p, *c)),
                _ => None,
            },
            None => match args {
                [p, c] => Some((*p, *c)),
                _ => None,
            },
        }
    }

    /// The forests of `ci` with the edges added since they were built (a fact past `mark`, or one taken out and put
    /// back): a tree no new edge reaches stands as it is numbered, one an edge reaches is built again with it, and the
    /// rest come after (`Forest::rebuild_trees`). What it costs is the edges added and the trees they reach.
    fn vextended(&mut self, store: &Store, ci: usize) -> Option<Vec<(Sym, Rc<Forest>)>> {
        let c = &self.vclosures[ci];
        c.built?;
        let (src, mark) = (c.src, c.mark);
        // an edge retired by a path that did not take it out of its tree: the forest no longer stands for the edges
        if store.deaths.get(&src).copied().unwrap_or(0) != c.deaths {
            return None;
        }
        let back: Vec<FactId> = store.revived.get(&src).map_or(&[][..], |v| &v[c.revived.min(v.len())..]).iter().copied().filter(|&id| id < mark).collect();
        let mut books: FxMap<Sym, Vec<(Term, Term)>> = FxMap::default();
        let mut seen: FxSet<(Sym, u64, u64)> = FxSet::default();
        let mut added = 0;
        for id in back.into_iter().chain(mark..store.len_ids()) {
            if !store.alive(id) || store.rec(id).rel != src {
                continue;
            }
            let persp = store.rec(id).persp;
            if let Some((p, c)) = self.vedge(store, ci, id) {
                added += 1;
                if seen.insert((persp, p.bits(), c.bits())) {
                    books.entry(persp).or_default().push((p, c));
                }
            }
        }
        let mut forests: Vec<(Sym, Rc<Forest>)> = store.virtuals[ci].forests.to_vec();
        for (b, es) in books {
            match forests.iter_mut().find(|f| f.0 == b) {
                Some(f) => {
                    Rc::make_mut(&mut f.1).rebuild_trees(&[], &es);
                }
                None => forests.push((b, Rc::new(if self.vclosures[ci].graph { Forest::build_graph(&es) } else { Forest::build(&es) }))),
            }
        }
        forests.sort_by_key(|b| b.0);
        self.vclosures[ci].rows += added;
        Some(forests)
    }

    /// The closures `vretract_edges` built again, told the edge relation as it now stands: no rebuild follows.
    pub(super) fn vretract_done(&mut self, store: &Store, touched: &[usize]) {
        for &ci in touched {
            let n = self.vseen(store, ci);
            let forests = store.virtuals[ci].forests.clone();
            let src = self.vclosures[ci].src;
            let (deaths, revived) = (store.deaths.get(&src).copied().unwrap_or(0), store.revived.get(&src).map_or(0, Vec::len));
            let c = &mut self.vclosures[ci];
            c.built = Some(n);
            (c.deaths, c.revived) = (deaths, revived);
            c.pairs = forests.iter().map(|f| f.1.pairs).sum();
            c.deep = forests.iter().map(|f| f.1.deep as u64).sum();
            c.internal = forests.iter().map(|f| f.1.internal as u64).sum();
        }
        // what a reader saw is a count of edges, which an addition of as many as were taken out would give again
        if brk!("vclosure_reader_seen_kept" => false; true) {
            self.reader_seen.retain(|(_, ci), _| !touched.contains(ci));
        }
        // the trees changed: the rows' provenance is written again when next it is read (`vsettle`)
        if !touched.is_empty() && brk!("vclosure_prov_unbuilt" => false; true) {
            self.builds += 1;
        }
    }

    /// The forests of every active closure, built as the edges stand: the planner's estimates read them.
    pub(super) fn vrefresh(&mut self, store: &mut Store) {
        if !self.any {
            return;
        }
        for ci in 0..self.vclosures.len() {
            if self.vclosures[ci].active {
                self.vforests(store, ci);
            }
        }
    }

    /// The rows of the closure `ci` that hold the ends given (a bound end is a ground term), in the book given or in every one.
    pub fn vrows(&mut self, store: &mut Store, ci: usize, book: Option<Sym>, a: Option<Term>, d: Option<Term>) -> Vec<(Sym, Term, Term)> {
        let forests = self.vforests(store, ci);
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
        self.rows_read += out.len() as u64;
        out
    }

    /// The estimate of a premise that reads the closure: its rows, and the matches for each binding of the ends already
    /// bound (`cpos` by a constant, `vpos` by a variable). A both-bound premise is a test; an unbound one costs every row,
    /// so no plan puts it first.
    pub(super) fn vstat(&mut self, store: &mut Store, ci: usize, cpos: &[usize], vpos: &[usize]) -> (f64, f64) {
        self.vforests(store, ci);
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

    /// THE CENSUS OF THE CLOSURES, for the profile: each active closure in each book its edges have, with its pairs
    /// (its rows), the ancestors with a descendant (the distinct values of its first column) and the descendants (of
    /// its second), as `vstat` reads them for the planner. A closure holds no row, so the store's census misses it.
    pub(super) fn vcensus(&mut self, store: &mut Store) -> Vec<(Sym, Sym, u64, u32, u32)> {
        let mut out = Vec::new();
        for ci in 0..self.vclosures.len() {
            if !self.vclosures[ci].active {
                continue;
            }
            let rel = self.vclosures[ci].rel;
            for (book, f) in self.vforests(store, ci).iter() {
                out.push((rel, *book, f.pairs, f.internal, f.deep));
            }
        }
        out
    }

    /// WHAT THE STORE LISTS ON OUTPUT: the rows of every active closure, generated from the trees as the last evaluation
    /// left them, each with its firing where the world keeps witnesses.
    pub(crate) fn vpublish(&mut self, store: &mut Store) {
        self.vrefresh(store);
        store.vlisted = self.any && !brk!("vclosure_rows_unpublished" => true; false);
    }

    /// A rule that reads a closure is fired whole when news of the closure's edges reaches it, unless it has already fired since they last changed.
    pub(super) fn vreader_due(&self, store: &Store, r: &Rc<ERule>, cur: &Front) -> bool {
        let Some(cis) = self.readers.get(&r.id) else { return false };
        let mut due = false;
        for &ci in cis.clone().iter() {
            let c = &self.vclosures[ci];
            let cond = store.virtuals[ci].near.map(|n| n.cond);
            if !c.active || !(cur.by_rel.contains_key(&c.src) || cond.is_some_and(|x| cur.by_rel.contains_key(&x))) {
                continue;
            }
            let rows = self.vseen(store, ci);
            if self.reader_seen.get(&(r.id, ci)) != Some(&rows) {
                due = true;
            }
        }
        due
    }

    /// THE NEWS OF A CLOSURE, in an addition: an edge `(p, c)` new in a book makes the rows from `p` and each of its
    /// ancestors to `c` and each of its descendants (a child had no parent before it, or the tree is broken and the
    /// world refused). Every row into a node whose own edge is new is news: such a node is given as an end, its rows
    /// read from the tree; the rest each as a row, once.
    fn vnews(&mut self, store: &mut Store, ci: usize, cur: &Front) -> (Vec<(Sym, Term)>, Vec<(Sym, Term, Term)>) {
        let forests = self.vforests(store, ci);
        let mut edges: Vec<(Sym, Term, Term)> = cur.by_rel.get(&self.vclosures[ci].src).into_iter().flatten().filter_map(|e| self.vedge(store, ci, *e).map(|(p, c)| (store.rec(*e).persp, p, c))).collect();
        edges.sort_unstable_by_key(|(b, p, c)| (*b, p.bits(), c.bits()));
        edges.dedup_by_key(|(b, p, c)| (*b, p.bits(), c.bits()));
        let ends: FxSet<(Sym, u64)> = edges.iter().map(|(b, _, c)| (*b, c.bits())).collect();
        let mut rows: Vec<(Sym, Term, Term)> = Vec::new();
        let mut seen: FxSet<(Sym, u64, u64)> = FxSet::default();
        for &(book, p, c) in &edges {
            let Some((_, f)) = forests.iter().find(|(b, _)| *b == book) else { continue };
            let mut down = Vec::new();
            f.descendants(c, &mut down);
            down.retain(|d| !ends.contains(&(book, d.bits())));
            if down.is_empty() {
                continue;
            }
            let mut up = vec![p];
            f.ancestors(p, &mut up);
            for &a in &up {
                for &d in &down {
                    if seen.insert((book, a.bits(), d.bits())) {
                        rows.push((book, a, d));
                    }
                }
            }
        }
        (edges.into_iter().map(|(b, _, c)| (b, c)).collect(), rows)
    }

    /// What a reader of the closure saw: the rows of its edges, and of a nearest's condition.
    fn vseen(&self, store: &Store, ci: usize) -> usize {
        let near = store.virtuals[ci].near;
        // a count, and the deaths beside it: an edge put in and another taken out leave the count as it was
        let seen = |r: Sym| store.rel_len_est(r, None).wrapping_add(store.deaths.get(&r).map_or(0, |d| *d as usize).wrapping_mul(7_919));
        seen(self.vclosures[ci].src).wrapping_add(near.map_or(0, |s| seen(s.cond).wrapping_mul(1_000_003)))
    }

    /// A whole firing of a rule that reads a closure notes the rows its edges had.
    pub(super) fn vreader_fired(&mut self, store: &Store, r: &Rc<ERule>) {
        let Some(cis) = self.readers.get(&r.id) else { return };
        for &ci in cis.clone().iter() {
            if self.vclosures[ci].active {
                let rows = self.vseen(store, ci);
                self.reader_seen.insert((r.id, ci), rows);
                if store.virtuals[ci].near.is_some() {
                    self.reader_forest.insert((r.id, ci), store.virtuals[ci].forests.clone());
                }
            }
        }
    }

    /// The premise of a match of a closure answered from its tree, spelled as the key of the row it is: what a firing records
    /// where it keeps its premises, and what a cell keeps of a member.
    pub(super) fn vrow_ref(&self, h: &mut Heap, store: &mut Store, l: &Lit, s: &Subst) -> PremRef {
        let (Some(book), Some(&ci)) = (walk(&*h, l.persp, s).as_atom(), self.vclosure_of.get(&l.rel)) else { return PremRef::VRow(0) };
        let (a, d) = (resolve(&mut *h, l.args[0], s), resolve(&mut *h, l.args[1], s));
        PremRef::VRow(self.vrow_key(h, store, ci, book, a, d))
    }

    fn vrow_key(&self, h: &mut Heap, store: &mut Store, ci: usize, book: Sym, a: Term, d: Term) -> Sym {
        let k = h.key(&fact_key(&*h, self.vclosures[ci].rel, book, &[a, d]));
        store.vrow_of.name(k, (ci, book, a, d));
        k
    }
}
