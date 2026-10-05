//! THE TREE OF A DECLARED `tree` (docs/data-structures.md): the edges of one book
//! as a forest with the engine's own pre-order numbering, which answers the
//! strict ancestor relation without storing a row of it.
//!
//! * ancestry of two nodes is containment of pre-order intervals, O(1);
//! * the ancestors of a node are its parent chain, nearest first;
//! * the descendants of a node are one contiguous range of the pre-order;
//! * the pairs with both ends free are the ancestors of every node.
//!
//! A forest is rebuilt whole when its edges change (a rebuild of the touched
//! book, which the engine does at most once per change of the edge relation:
//! `Eval::vtree`). It is built from edges that may break the promise (a child
//! with two parents, a cycle: the evaluation is judged after it runs, and the
//! world refused), so a build never loops and never panics on them: the first
//! parent of a child stands, a node no root reaches has no place, and `broken`
//! says so. What a broken forest answers is never read, for the world is
//! refused (`structure::check_trees`).

use crate::store::FxMap;
use crate::term::Term;

const NONE: u32 = u32::MAX;

pub struct Forest {
    nodes: Vec<Term>,
    idx: FxMap<u64, u32>,
    parent: Vec<u32>,
    /// pre-order number of a node, `NONE` for one no root reaches
    pre: Vec<u32>,
    /// the node at each pre-order number
    order: Vec<u32>,
    /// one past the last pre-order number in the subtree of a node
    end: Vec<u32>,
    depth: Vec<u32>,
    /// rows of the strict closure: the sum of the depths
    pub pairs: u64,
    /// nodes with a parent, and nodes with a child
    pub deep: u32,
    pub internal: u32,
    pub broken: bool,
}

impl Forest {
    /// The forest of `(parent, child)` edges.
    pub fn build(edges: &[(Term, Term)]) -> Forest {
        let mut nodes: Vec<Term> = Vec::new();
        let mut idx: FxMap<u64, u32> = FxMap::default();
        let mut node = |t: Term, nodes: &mut Vec<Term>| *idx.entry(t.bits()).or_insert_with(|| { nodes.push(t); nodes.len() as u32 - 1 });
        let mut es: Vec<(u32, u32)> = Vec::with_capacity(edges.len());
        for (p, c) in edges {
            let (p, c) = (node(*p, &mut nodes), node(*c, &mut nodes));
            es.push((p, c));
        }
        let n = nodes.len();
        let mut parent = vec![NONE; n];
        let mut broken = false;
        for &(p, c) in &es {
            if parent[c as usize] == NONE && p != c {
                parent[c as usize] = p;
            } else {
                broken = true;
            }
        }
        // the children by parent, in the order the edges were given
        let mut start = vec![0u32; n + 1];
        for (c, &p) in parent.iter().enumerate() {
            if p != NONE {
                start[p as usize + 1] += 1;
                let _ = c;
            }
        }
        for i in 0..n {
            start[i + 1] += start[i];
        }
        let mut kids = vec![NONE; start[n] as usize];
        let mut fill = start.clone();
        for (c, &p) in parent.iter().enumerate() {
            if p != NONE {
                kids[fill[p as usize] as usize] = c as u32;
                fill[p as usize] += 1;
            }
        }
        let (mut pre, mut end, mut depth) = (vec![NONE; n], vec![0u32; n], vec![0u32; n]);
        let mut order: Vec<u32> = Vec::with_capacity(n);
        let mut stack: Vec<(u32, u32)> = Vec::new();
        for root in 0..n as u32 {
            if parent[root as usize] != NONE {
                continue;
            }
            stack.push((root, start[root as usize]));
            pre[root as usize] = order.len() as u32;
            order.push(root);
            while let Some(&(v, at)) = stack.last() {
                if at < start[v as usize + 1] {
                    stack.last_mut().unwrap().1 += 1;
                    let c = kids[at as usize];
                    depth[c as usize] = depth[v as usize] + 1;
                    pre[c as usize] = order.len() as u32;
                    order.push(c);
                    stack.push((c, start[c as usize]));
                } else {
                    end[v as usize] = order.len() as u32;
                    stack.pop();
                }
            }
        }
        if order.len() != n {
            broken = true;
        }
        let (mut pairs, mut deep, mut internal) = (0u64, 0u32, 0u32);
        for v in 0..n {
            if pre[v] == NONE {
                continue;
            }
            pairs += depth[v] as u64;
            deep += (depth[v] > 0) as u32;
            internal += (start[v + 1] > start[v]) as u32;
        }
        Forest { nodes, idx, parent, pre, order, end, depth, pairs, deep, internal, broken }
    }

    fn at(&self, t: Term) -> Option<u32> {
        self.idx.get(&t.bits()).copied().filter(|v| self.pre[*v as usize] != NONE)
    }

    /// `a` is a strict ancestor of `d`: containment of intervals.
    pub fn is_ancestor(&self, a: Term, d: Term) -> bool {
        match (self.at(a), self.at(d)) {
            (Some(a), Some(d)) => {
                let (pa, pd) = (self.pre[a as usize], self.pre[d as usize]);
                brk!("vclosure_nonstrict" => pa <= pd; pa < pd) && pd < self.end[a as usize]
            }
            _ => false,
        }
    }

    /// The strict ancestors of `d`, nearest first.
    pub fn ancestors(&self, d: Term, out: &mut Vec<Term>) {
        let Some(mut v) = self.at(d) else { return };
        for _ in 0..self.depth[v as usize].saturating_sub(brk!("vclosure_ancestors_short" => 1; 0)) {
            v = self.parent[v as usize];
            out.push(self.nodes[v as usize]);
        }
    }

    /// The strict descendants of `a`, in pre-order: one range.
    pub fn descendants(&self, a: Term, out: &mut Vec<Term>) {
        let Some(v) = self.at(a) else { return };
        let (lo, hi) = (self.pre[v as usize] + brk!("vclosure_nonstrict" => 0; 1), self.end[v as usize] - brk!("vclosure_descendants_short" => 1; 0));
        out.extend(self.order[lo as usize..hi.max(lo) as usize].iter().map(|x| self.nodes[*x as usize]));
    }

    /// Every pair, ancestor first: the ancestors of each node.
    pub fn each_pair(&self, mut f: impl FnMut(Term, Term)) {
        for &v in &self.order {
            let mut u = v;
            for _ in 0..self.depth[v as usize] {
                u = self.parent[u as usize];
                f(self.nodes[u as usize], self.nodes[v as usize]);
            }
        }
    }

    /// Rows of the strict closure with this node as the ancestor.
    pub fn subtree(&self, a: Term) -> u64 {
        self.at(a).map_or(0, |v| (self.end[v as usize] - self.pre[v as usize] - 1) as u64)
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Heap bytes held.
    pub fn bytes(&self) -> usize {
        self.nodes.len() * (8 + 4 * 5 + 16) + self.order.len() * 4
    }
}
