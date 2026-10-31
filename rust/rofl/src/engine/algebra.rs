//! THE ALGEBRA OF A RELATION: how its facts combine, read in `prepare` from the lattices, tags and dominance rules
//! the program declares. A relation with none is a plain set.
use super::*;

/// A relation can be several of these at once: an idempotent tag is also the order lattice it is (`cell`), a join
/// lattice L names `L@join`, the relation its contributions go to, and a counting tag p names `p@count`, the relation
/// of its derivations; each names its owner back (`join_of`, `count_of`).
#[derive(Clone, Default)]
pub struct RelAlgebra {
    /// Its facts are cells of this arity under this operation; `Dominance` for a subsumptive relation (`sub`).
    pub cell: Option<(usize, AggOp)>,
    pub sub: Option<Rc<Sub>>,
    pub tag: Option<(usize, TagAlg)>,
    /// A declared widening (docs/aggregates.md, "Widening, as built"): improvements before a cell widens.
    pub widen: Option<u64>,
    pub join: Option<Sym>,
    pub join_of: Option<Sym>,
    pub count: Option<Sym>,
    pub count_of: Option<Sym>,
}

impl RelAlgebra {
    /// Is a literal of `arity` one of its cells? (A relation of another arity with the same name is not.)
    pub fn is_cell_lit(&self, arity: usize) -> bool {
        self.cell.is_some_and(|(n, _)| n == arity)
    }

    /// The length of the key of a cell at `arity`: a lattice's head prefix less its value, a subsumptive
    /// relation's declared key.
    pub fn keylen(&self, arity: usize) -> Option<usize> {
        match self.cell {
            Some((n, AggOp::Dominance)) if n == arity => Some(self.sub.as_ref().unwrap().keylen),
            Some((n, _)) if n == arity => Some(n - 1),
            _ => None,
        }
    }

    /// Is a key of `n` terms a whole cell key?
    pub fn is_cell_key(&self, n: usize) -> bool {
        match self.cell {
            Some((_, AggOp::Dominance)) => self.sub.as_ref().unwrap().keylen == n,
            Some((a, _)) => a == n + 1,
            None => false,
        }
    }

    pub fn word(&self) -> &'static str {
        if self.sub.is_some() { "subsumptive relation" } else { "lattice" }
    }
}

impl LatticeState {
    pub fn algebra(&self, rel: Sym) -> &RelAlgebra {
        self.algebras.get(&rel).unwrap_or(&self.plain)
    }

    pub fn is_cell(&self, rel: Sym) -> bool {
        self.algebra(rel).cell.is_some()
    }

    pub fn sub(&self, rel: Sym) -> &Rc<Sub> {
        self.algebra(rel).sub.as_ref().unwrap()
    }

    /// Does any relation keep cells?
    pub fn has_cells(&self) -> bool {
        self.cells
    }

    pub fn cell_rels(&self) -> impl Iterator<Item = Sym> + '_ {
        self.algebras.iter().filter(|(_, a)| a.cell.is_some()).map(|(r, _)| *r)
    }

    pub fn subs(&self) -> impl Iterator<Item = (Sym, &Rc<Sub>)> {
        self.algebras.iter().filter_map(|(r, a)| a.sub.as_ref().map(|x| (*r, x)))
    }

    pub fn tags(&self) -> impl Iterator<Item = (Sym, (usize, TagAlg))> + '_ {
        self.algebras.iter().filter_map(|(r, a)| a.tag.map(|t| (*r, t)))
    }

    pub fn counts(&self) -> impl Iterator<Item = (Sym, Sym)> + '_ {
        self.algebras.iter().filter_map(|(r, a)| a.count.map(|c| (*r, c)))
    }

    pub(super) fn algebra_mut(&mut self, rel: Sym) -> &mut RelAlgebra {
        self.algebras.entry(rel).or_default()
    }

    pub(super) fn set_cell(&mut self, rel: Sym, arity: usize, op: AggOp) {
        self.cells = true;
        self.algebra_mut(rel).cell = Some((arity, op));
    }

    /// What the declarations give: each lattice row's cell (an idempotent tag's among them), each tag and its counts.
    pub(super) fn read_algebras(&mut self, v: &Vocab, tags: &crate::tag::Tags) {
        (self.algebras, self.cells) = (HashMap::new(), false);
        for (r, n, op) in self.lattice_rows.clone() {
            if let Some(o) = v.op_of(op) {
                self.set_cell(r, n, o);
            }
        }
        for (&r, &t) in &tags.by_rel {
            self.algebra_mut(r).tag = Some(t);
        }
        for (&r, &c) in &tags.count_rel {
            self.algebra_mut(r).count = Some(c);
            self.algebra_mut(c).count_of = Some(r);
        }
    }

    /// The widenings declared of hull lattices, and the relation each join lattice's contributions are written into.
    pub(super) fn read_widens_and_joins(&mut self, h: &mut Heap, widens: Vec<(Sym, u64)>) {
        for (r, n) in widens {
            if self.algebra(r).cell.is_some_and(|(_, op)| op == AggOp::Hull) {
                self.algebra_mut(r).widen = Some(n);
            }
        }
        let mut joins: Vec<Sym> = self.algebras.iter().filter(|(_, a)| a.cell.is_some_and(|(_, op)| op.is_join())).map(|(r, _)| *r).collect();
        joins.sort_unstable();
        for l in joins {
            let c = h.intern(&format!("{}@join", h.name(l)));
            self.algebra_mut(l).join = Some(c);
            self.algebra_mut(c).join_of = Some(l);
        }
    }
}
