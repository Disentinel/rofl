//! A VIEW (`view step_in(S, X).`): a relation whose rows are never stored. Every rule that reads it reads its rules'
//! bodies in its place, unfolded before the rules are judged and planned: one copy of the reader for each rule of the
//! view, the view's variables renamed apart and its head unified with the premise. A negated read unfolds only where the
//! view is one rule of one positive premise. The view's own rules are kept aside (`view_drules`), unfired.
//!
//! WHEN NOT. A view that reads itself, through other views or not, one read inside an aggregate or in another tense, one
//! negated past one literal, one with a rule that stages or that aggregates, a lattice: its rows are stored as any
//! relation's, and `view_reason` says why.

use super::*;

impl Eval {
    pub(super) fn view_unfold(&mut self, rules: Vec<DRule>) -> Vec<DRule> {
        self.view_reason.clear();
        self.view_drules.clear();
        self.view_rels.clear();
        let decl = crate::structure::viewed(&self.h, &self.v, &mut self.store);
        if decl.is_empty() {
            return rules;
        }
        let mut views: HashMap<Sym, Vec<DRule>> = HashMap::new();
        for r in rules.iter().filter(|r| decl.contains(&r.clause.head.rel)) {
            views.entry(r.clause.head.rel).or_default().push(r.clone());
        }
        let mut names: Vec<Sym> = decl.into_iter().collect();
        names.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        for rel in &names {
            let why = match views.get(rel) {
                None => Some("it has no rule"),
                Some(_) if self.lat.lattice_rows.iter().any(|l| l.0 == *rel) => Some("it is a lattice"),
                Some(_) if self.well_founded => Some("the world is well-founded"),
                Some(rs) if rs.iter().any(|r| r.clause.head.temporal != Temporal::Now) => Some("a rule of it stages"),
                Some(rs) if rs.iter().any(|r| r.clause.body.iter().any(|b| matches!(b, BodyElem::Agg(_)))) => Some("a rule of it aggregates"),
                _ => None,
            };
            if let Some(why) = why {
                self.view_reason.push(format!("{}: {why}", self.h.name(*rel)));
                views.remove(rel);
            }
        }
        // a view read back by its own unfolding, or read where it cannot unfold, is rows; refusing one can refuse another
        loop {
            let mut refuse: Vec<(Sym, &str)> = Vec::new();
            let reach = |from: Sym| -> HashSet<Sym> {
                reachable(std::iter::once(from), |r| views.get(&r).into_iter().flatten().flat_map(|d| d.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel)).filter(|x| views.contains_key(x)).collect::<Vec<_>>())
            };
            for rel in views.keys() {
                let below: HashSet<Sym> = views[rel].iter().flat_map(|d| d.clause.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel)).collect();
                if below.iter().any(|x| views.contains_key(x) && reach(*x).contains(rel)) {
                    refuse.push((*rel, "it reads itself"));
                }
            }
            for r in &rules {
                for b in &r.clause.body {
                    match b {
                        BodyElem::Pos(l) if views.contains_key(&l.rel) && l.temporal != Temporal::Now => refuse.push((l.rel, "a rule reads it in another tense")),
                        BodyElem::Neg(l) if views.contains_key(&l.rel) => {
                            let one = matches!(views[&l.rel].as_slice(), [d] if matches!(d.clause.body.as_slice(), [BodyElem::Pos(_)]));
                            if !one || l.temporal != Temporal::Now {
                                refuse.push((l.rel, "a rule reads it negated and it is more than one literal"));
                            }
                        }
                        BodyElem::Agg(a) => {
                            for l in a.body.iter().flat_map(|b| b.lits_deep()) {
                                if views.contains_key(&l.rel) {
                                    refuse.push((l.rel, "an aggregate reads it"));
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            if refuse.is_empty() {
                break;
            }
            refuse.sort_by(|a, b| cmp_js(self.h.name(a.0), self.h.name(b.0)));
            refuse.dedup_by_key(|r| r.0);
            for (rel, why) in refuse {
                self.view_reason.push(format!("{}: {why}", self.h.name(rel)));
                views.remove(&rel);
            }
        }
        if views.is_empty() {
            return rules;
        }
        self.view_rels = views.keys().copied().collect();
        let mut out = Vec::with_capacity(rules.len());
        for r in rules {
            if views.contains_key(&r.clause.head.rel) {
                let copies = self.view_copies(&r, &views);
                self.view_drules.extend(copies);
                continue;
            }
            for c in self.view_copies(&r, &views) {
                if c.canon != r.canon {
                    self.tag_changed.insert(c.id);
                }
                out.push(c);
            }
        }
        out
    }

    pub fn is_view(&self, rel: Sym) -> bool {
        self.view_rels.contains(&rel)
    }

    /// A QUESTION OF A VIEW: each of its rules' bodies solved under the question's constants, in the book given or in any.
    pub fn view_answer(&mut self, rel: Sym, book: Option<Sym>, args: &[Term]) -> Result<Vec<Subst>, Halt> {
        let persp = match book {
            Some(b) => Term::atom(b),
            None => {
                self.alias_fresh += 1;
                Term::var(self.h.intern(&format!("_$v{}", self.alias_fresh)))
            }
        };
        let rules: Vec<Clause> = self.view_drules.iter().filter(|r| r.clause.head.rel == rel).map(|r| r.clause.clone()).collect();
        let mut out = Vec::new();
        for c in rules {
            let d = self.view_rename(&c);
            let mut s: Subst = Vec::new();
            if !(unify_into(&self.h, persp, d.head.persp, &mut s) && args.len() == d.head.args.len() && args.iter().zip(&d.head.args).all(|(a, b)| unify_into(&self.h, *a, *b, &mut s))) {
                continue;
            }
            let sols = self.questioned(|e| e.solve_body(&d.body, s, 0, None, None))?;
            out.extend(sols.into_iter().map(|sol| sol.s));
        }
        Ok(out)
    }

    /// The rule with every read of a view unfolded: one rule per combination of the views' rules that unify.
    fn view_copies(&mut self, r: &DRule, views: &HashMap<Sym, Vec<DRule>>) -> Vec<DRule> {
        if !r.clause.body.iter().any(|b| b.lit().is_some_and(|l| views.contains_key(&l.rel))) {
            return vec![r.clone()];
        }
        let mut done: Vec<Clause> = Vec::new();
        let mut work: Vec<Clause> = vec![r.clause.clone()];
        while let Some(c) = work.pop() {
            let Some(i) = c.body.iter().position(|b| b.lit().is_some_and(|l| views.contains_key(&l.rel))) else {
                done.push(c);
                continue;
            };
            let (neg, l) = match &c.body[i] {
                BodyElem::Pos(l) => (false, l.clone()),
                BodyElem::Neg(l) => (true, l.clone()),
                _ => unreachable!(),
            };
            for d in views[&l.rel].iter().rev() {
                let d = self.view_rename(&d.clause);
                let mut s: Subst = Vec::new();
                let unifies = unify_into(&self.h, l.persp, d.head.persp, &mut s) && l.args.len() == d.head.args.len() && l.args.iter().zip(&d.head.args).all(|(a, b)| unify_into(&self.h, *a, *b, &mut s));
                if !unifies {
                    continue;
                }
                let mut body: Vec<BodyElem> = Vec::with_capacity(c.body.len() + d.body.len());
                body.extend(c.body[..i].iter().cloned());
                if neg {
                    let BodyElem::Pos(inner) = &d.body[0] else { unreachable!() };
                    body.push(BodyElem::Neg(inner.clone()));
                } else {
                    body.extend(d.body.iter().cloned());
                }
                body.extend(c.body[i + 1..].iter().cloned());
                let mut nc = Clause { head: c.head.clone(), body };
                self.view_resolve(&mut nc, &s);
                work.push(nc);
            }
        }
        done.reverse();
        done.into_iter().enumerate().map(|(k, mut clause)| {
            annotate_aggs(&self.h, &mut clause);
            let id = if k == 0 { r.id } else { self.h.intern(&format!("{}~{k}", self.h.name(r.id))) };
            DRule { id, clause, canon: format!("{}~view{k}", r.canon) }
        }).collect()
    }

    /// A view's rule with every variable renamed to one no other clause holds.
    fn view_rename(&mut self, c: &Clause) -> Clause {
        let mut vs: Vec<Sym> = Vec::new();
        for t in c.head.args.iter().chain([&c.head.persp]) {
            self.h.vars_of(*t, &mut vs);
        }
        for b in &c.body {
            b.vars(&self.h, &mut vs);
        }
        vs.sort();
        vs.dedup();
        let s: Subst = vs.into_iter().map(|x| {
            self.alias_fresh += 1;
            (x, Term::var(self.h.intern(&format!("_$v{}", self.alias_fresh))))
        }).collect();
        let mut out = c.clone();
        self.view_resolve(&mut out, &s);
        out
    }

    fn view_resolve(&mut self, c: &mut Clause, s: &Subst) {
        let h = &mut self.h;
        let lit = |h: &mut Heap, l: &mut Lit| {
            l.persp = resolve(h, l.persp, s);
            for a in l.args.iter_mut() {
                *a = resolve(h, *a, s);
            }
        };
        lit(h, &mut c.head);
        fn elems(h: &mut Heap, bs: &mut [BodyElem], s: &Subst, lit: &dyn Fn(&mut Heap, &mut Lit)) {
            for b in bs.iter_mut() {
                match b {
                    BodyElem::Pos(l) | BodyElem::Neg(l) => lit(h, l),
                    BodyElem::Bi { l, r, .. } => {
                        *l = resolve(h, *l, s);
                        *r = resolve(h, *r, s);
                    }
                    BodyElem::Agg(a) => {
                        a.result = resolve(h, a.result, s);
                        for t in a.vals.iter_mut().chain(a.keys.iter_mut()) {
                            *t = resolve(h, *t, s);
                        }
                        elems(h, &mut a.body, s, lit);
                    }
                }
            }
        }
        elems(h, &mut c.body, s, &lit);
    }
}
