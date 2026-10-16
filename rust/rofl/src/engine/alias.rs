//! AN ALIAS READ FROM ITS SOURCE (docs/data-structures.md, `alias ast_in(P, C) is ast_child(P, _, _, C).`). The
//! declaration lowers to one rule (`structure::lower_alias`), which the program holds as any rule, for reflection and
//! for `whynot`; where no witness is kept this engine does not fire it and stores no row of the alias. Every rule that
//! reads the alias reads the source in its place, the literal rewritten before the rule is planned (`alias_lower`), so
//! news, strata, plans and additions are the source's; a question of the alias (`ask`, `whynot`, a declared tree's
//! edges, the canonical state) reads the source and projects each row once (`Store::alias_rows`).
//!
//! WHERE WITNESSES ARE KEPT the rows are stored, the lowered rule fired as any rule: a firing that read the alias
//! cites the alias's fact, which a witness of the source's would not be. `alias_reason` says why one is rows.

use super::*;
use crate::store::{AliasView, SrcArg};

impl Eval {
    /// THE ALIASES THIS EVALUATION READS FROM THEIR SOURCES, and the rules with each literal of one rewritten to read its
    /// source; the rule each lowers to is kept aside (`alias_rules`), the reader's literal as written in `alias_orig`.
    pub(super) fn alias_lower(&mut self, rules: Vec<DRule>) -> Vec<DRule> {
        self.store.aliases.clear();
        self.alias_drules.clear();
        self.alias_orig.clear();
        self.alias_reason.clear();
        let mut decl: Vec<Sym> = crate::structure::aliased(&self.h, &self.v, &mut self.store).into_iter().collect();
        if decl.is_empty() {
            return rules;
        }
        decl.sort_by(|a, b| cmp_js(self.h.name(*a), self.h.name(*b)));
        let mut views: Vec<(AliasView, Sym)> = Vec::new();
        for rel in decl {
            let defs: Vec<&DRule> = rules.iter().filter(|r| r.clause.head.rel == rel).collect();
            let why = match defs.as_slice() {
                [r] => match self.alias_view(&r.clause) {
                    Some(v) if self.lattices.contains_key(&v.src) || self.lattices.contains_key(&rel) => "it reads a lattice",
                    Some(_) if !self.no_witness => "a world that keeps witnesses stores its rows",
                    Some(_) if self.well_founded => "the world is well-founded",
                    Some(v) => {
                        views.push((v, r.id));
                        ""
                    }
                    None => "its rule is not the one the declaration lowers to",
                },
                _ => "the declaration's rule is not its one conclusion",
            };
            if !why.is_empty() {
                self.alias_reason.push(format!("{}: {why}", self.h.name(rel)));
            }
        }
        // AN ALIAS OF AN ALIAS reads the first source: the patterns compose; a cycle reads nothing and is rows
        let n = views.len();
        for i in 0..n {
            let mut hops = 0;
            while let Some(j) = views.iter().position(|(w, _)| w.rel == views[i].0.src) {
                hops += 1;
                if hops > n {
                    break;
                }
                let (outer, inner) = (views[i].0.pat.clone(), views[j].0.clone());
                views[i].0.src = inner.src;
                views[i].0.pat = inner.pat.iter().map(|p| match p {
                    SrcArg::Head(k) => outer[*k],
                    other => *other,
                }).collect();
            }
            if hops > n {
                self.alias_reason.push(format!("{}: its sources come back to it", self.h.name(views[i].0.rel)));
            }
        }
        let cyclic: Vec<Sym> = views.iter().filter(|(v, _)| views.iter().any(|(w, _)| w.rel == v.src)).map(|(v, _)| v.rel).collect();
        views.retain(|(v, _)| !cyclic.contains(&v.rel));
        let lowered: HashSet<Sym> = views.iter().map(|(_, id)| *id).collect();
        self.store.aliases = views.into_iter().map(|(v, _)| v).collect();
        let mut out = Vec::with_capacity(rules.len());
        for mut r in rules {
            if lowered.contains(&r.id) {
                self.alias_drules.push(r);
                continue;
            }
            if let Some(body) = self.alias_body(&r.clause.body) {
                let orig = std::mem::replace(&mut r.clause.body, body);
                self.alias_orig.insert(r.id, Clause { head: r.clause.head.clone(), body: orig });
            }
            out.push(r);
        }
        out
    }

    /// The alias a lowered rule stands for: its head the alias's arguments, each a variable once, its one premise the
    /// source in the head's book.
    fn alias_view(&self, c: &Clause) -> Option<AliasView> {
        let [BodyElem::Pos(l)] = c.body.as_slice() else { return None };
        let head: Vec<Sym> = c.head.args.iter().map(|a| match a.kind() {
            TermK::Var(x) => Some(x),
            _ => None,
        }).collect::<Option<_>>()?;
        if l.persp != c.head.persp || l.temporal != Temporal::Now || c.head.temporal != Temporal::Now {
            return None;
        }
        let pat = l.args.iter().map(|a| match a.kind() {
            TermK::Var(x) => match head.iter().position(|h| *h == x) {
                Some(i) => Some(SrcArg::Head(i)),
                None if self.h.name(x).starts_with("_$") => Some(SrcArg::Anon),
                None => None,
            },
            TermK::Func(_) => None,
            _ => Some(SrcArg::Const(*a)),
        }).collect::<Option<Vec<_>>>()?;
        Some(AliasView { rel: c.head.rel, arity: head.len(), src: l.rel, pat })
    }

    /// A body with every literal of an alias read from its source, aggregates' bodies too; None where none reads one.
    fn alias_body(&mut self, body: &[BodyElem]) -> Option<Vec<BodyElem>> {
        let mut changed = false;
        let out = body.iter().map(|b| match b {
            BodyElem::Pos(l) => match self.alias_lit(l) {
                Some(s) => {
                    changed = true;
                    BodyElem::Pos(s)
                }
                None => b.clone(),
            },
            BodyElem::Neg(l) => match self.alias_lit(l) {
                Some(s) => {
                    changed = true;
                    BodyElem::Neg(s)
                }
                None => b.clone(),
            },
            BodyElem::Agg(a) => match self.alias_body(&a.body) {
                Some(inner) => {
                    changed = true;
                    let mut a = a.clone();
                    a.body = inner;
                    BodyElem::Agg(a)
                }
                None => b.clone(),
            },
            BodyElem::Bi { .. } => b.clone(),
        }).collect();
        changed.then_some(out)
    }

    /// A literal of an alias read from its source, each dropped column a variable of its own.
    pub(super) fn alias_lit(&mut self, l: &Lit) -> Option<Lit> {
        let v = self.store.aliases.iter().find(|a| a.rel == l.rel)?.clone();
        if l.args.len() != v.arity {
            return None;
        }
        let args = v.pat.iter().map(|p| match p {
            SrcArg::Head(i) => l.args[*i],
            SrcArg::Const(c) => *c,
            SrcArg::Anon => {
                self.alias_fresh += 1;
                Term::var(self.h.intern(&format!("_$a{}", self.alias_fresh)))
            }
        }).collect();
        Some(Lit { rel: v.src, persp: l.persp, persp_explicit: l.persp_explicit, args, temporal: l.temporal })
    }

    /// THE ROWS OF AN ALIAS THAT MATCH A QUESTION's constants, in the book given or in every one: the source asked with the
    /// constants where the alias's columns are, each row it makes once. None where `rel` is no alias read from its source.
    pub fn alias_query(&mut self, rel: Sym, book: Option<Sym>, args: &[Term]) -> Option<Vec<(Sym, Vec<Term>)>> {
        let v = self.store.alias_view(rel)?.clone();
        let (mut pos, mut vals) = (Vec::new(), Vec::new());
        for (j, p) in v.pat.iter().enumerate() {
            let t = match p {
                SrcArg::Head(i) => args.get(*i).copied().filter(|t| self.h.is_ground(*t)),
                SrcArg::Const(c) => Some(*c),
                SrcArg::Anon => None,
            };
            if let Some(t) = t {
                pos.push(j);
                vals.push(t);
            }
        }
        let ids = match self.store.arg_matches(&self.h, v.src, book, v.pat.len(), &pos, &vals) {
            Some(ids) => ids,
            None => match book {
                Some(p) => self.store.rel_persp(&self.h, v.src, p),
                None => self.store.rel_all(&self.h, v.src),
            },
        };
        let mut seen: HashSet<(Sym, Vec<u64>)> = HashSet::new();
        let mut out = Vec::new();
        for id in ids {
            let p = self.store.rec(id).persp;
            if !self.store.alive(id) || book.is_some_and(|b| b != p) || is_kernel_ledger(&self.h, p) {
                continue;
            }
            if let Some(row) = v.project(self.store.args(id)) {
                if seen.insert((p, row.iter().map(|t| t.bits()).collect())) {
                    out.push((p, row));
                }
            }
        }
        Some(out)
    }

    /// A fact of the source that makes a row of an alias read from it, the one a reader of the alias cites.
    pub(super) fn alias_fact(&mut self, rel: Sym, book: Sym, args: &[Term]) -> Option<FactId> {
        let v = self.store.alias_view(rel)?.clone();
        let (mut pos, mut vals) = (Vec::new(), Vec::new());
        for (j, p) in v.pat.iter().enumerate() {
            match p {
                SrcArg::Head(i) => {
                    pos.push(j);
                    vals.push(*args.get(*i)?);
                }
                SrcArg::Const(c) => {
                    pos.push(j);
                    vals.push(*c);
                }
                SrcArg::Anon => {}
            }
        }
        let ids = self.store.arg_matches(&self.h, v.src, Some(book), v.pat.len(), &pos, &vals).unwrap_or_else(|| self.store.rel_persp(&self.h, v.src, book));
        ids.into_iter().filter(|&id| self.store.alive(id) && self.store.rec(id).persp == book).find(|&id| v.project(self.store.args(id)).as_deref() == Some(args))
    }

    /// The rules the aliases read from their sources lower to, planned as any rule is, for `whynot`.
    pub(super) fn alias_plan_rules(&mut self) {
        let drs = std::mem::take(&mut self.alias_drules);
        self.alias_rules = drs.into_iter().map(|r| Rc::new(self.classify(r))).collect();
    }

    /// The declared aliases and whether each is read from its source.
    pub fn alias_info(&self) -> Vec<(String, bool)> {
        let mut out: Vec<(String, bool)> = self.store.aliases.iter().map(|a| (self.h.name(a.rel).to_string(), true)).collect();
        out.extend(self.alias_reason.iter().map(|r| (r.split(':').next().unwrap_or("").to_string(), false)));
        out
    }
}
