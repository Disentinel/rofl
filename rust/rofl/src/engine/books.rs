//! A RELATION IS RANKED BY ITS NAME AND ITS BOOK. One the program writes in two books or more,
//! `delegates[value]` beside `delegates[flow]`, is two relations to the peel: a rule may negate
//! the one and conclude the other. A literal whose book is a variable reads every book the
//! relation is written in; a relation written in one book is ranked by its name, as before.

use crate::reflect::{BodyElem, Lit, Vocab};
use crate::term::{Heap, Sym};
use std::collections::{BTreeSet, HashMap};

use super::{ERule, Temporal};

#[derive(Default, Clone)]
pub struct Books {
    node: HashMap<(Sym, Sym), Sym>,
    nodes: HashMap<Sym, Vec<Sym>>,
    rel_of: HashMap<Sym, Sym>,
}

impl Books {
    /// The relations of `rules` written in two books or more, each book its own node; `whole` keeps a relation one
    /// node whatever its books (what the kernel writes and ranks by its name).
    pub fn of<R: std::borrow::Borrow<ERule>>(rules: &[R], h: &mut Heap, v: &Vocab, whole: &dyn Fn(Sym) -> bool) -> Books {
        let mut seen: HashMap<Sym, BTreeSet<Sym>> = HashMap::new();
        for r in rules {
            let r = r.borrow();
            if r.clause.head.temporal == Temporal::Next {
                continue;
            }
            let lits = std::iter::once(&r.clause.head).chain(r.clause.body.iter().flat_map(BodyElem::lits_deep));
            for l in lits {
                if let Some(b) = l.persp.as_atom() {
                    seen.entry(l.rel).or_default().insert(b);
                }
            }
        }
        let mut out = Books::default();
        let mut split: Vec<(Sym, BTreeSet<Sym>)> = seen.into_iter().filter(|(rel, bs)| bs.len() > 1 && !v.in_kernel_book(*rel) && !whole(*rel)).collect();
        split.sort_by_key(|(rel, _)| *rel);
        for (rel, bs) in split {
            let mut all = Vec::new();
            for b in bs {
                let name = format!("{}[{}]", h.name(rel), h.name(b));
                let n = h.intern(&name);
                out.node.insert((rel, b), n);
                out.rel_of.insert(n, rel);
                all.push(n);
            }
            out.nodes.insert(rel, all);
        }
        out
    }

    /// The nodes a literal reads or a head concludes: its book's, every book's for a variable one, else the relation.
    pub fn lit(&self, l: &Lit) -> Vec<Sym> {
        match (self.nodes.get(&l.rel), l.persp.as_atom()) {
            (None, _) => vec![l.rel],
            (Some(_), Some(b)) => vec![self.node.get(&(l.rel, b)).copied().unwrap_or(l.rel)],
            (Some(all), None) => all.clone(),
        }
    }

    /// The node a fact of `rel` in book `persp` belongs to.
    pub fn fact(&self, rel: Sym, persp: Sym) -> Sym {
        self.node.get(&(rel, persp)).copied().unwrap_or(rel)
    }

    /// The node a rule's level is read from: its head's book, or for a variable book the relation, ranked with its
    /// last book.
    pub fn head(&self, l: &Lit) -> Sym {
        l.persp.as_atom().map_or(l.rel, |b| self.fact(l.rel, b))
    }

    pub fn is_node(&self, s: Sym) -> bool {
        self.rel_of.contains_key(&s)
    }

    /// The round table by relation: each node's round, and a split relation's its last book's.
    pub fn rounds(&self, round: &HashMap<Sym, i64>) -> HashMap<Sym, u32> {
        let mut out: HashMap<Sym, u32> = round.iter().map(|(k, v)| (*k, *v as u32)).collect();
        for (rel, all) in &self.nodes {
            if let Some(m) = all.iter().filter_map(|n| round.get(n)).max() {
                out.insert(*rel, *m as u32);
            }
        }
        out
    }
}
