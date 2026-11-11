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

use crate::arena::{Arena, VolR, VolW};
use crate::store::FxMap;
use crate::term::Term;

const NONE: u32 = u32::MAX;

/// The node a term is: an open table of node numbers by the term's hash, which a volume keeps as it is, and the nodes
/// put in since, which the table does not hold.
#[derive(Clone, Default)]
struct Idx {
    table: Arena<u32>,
    over: FxMap<u64, u32>,
}

fn slot_hash(k: u64) -> u64 {
    (k ^ (k >> 29)).wrapping_mul(0x9e37_79b9_7f4a_7c15)
}

impl Idx {
    /// The table of the nodes `held` holds, each term once.
    fn of(nodes: &[Term], held: impl Fn(usize) -> bool) -> Idx {
        let cap = (nodes.len() * 2).next_power_of_two().max(8);
        let at = nodes.iter().enumerate().filter(|(i, _)| held(*i)).map(|(i, t)| (slot_hash(t.bits()), i as u32));
        Idx { table: crate::arena::table(cap, NONE, at).into(), over: FxMap::default() }
    }
    /// The slots `over` takes in the table: a term's own slot, or the free one where it would go.
    fn placed(&self, nodes: &[Term]) -> Vec<(usize, u32)> {
        let mask = self.table.len() - 1;
        let mut over: Vec<(&u64, &u32)> = self.over.iter().collect();
        over.sort_unstable();
        let mut put: FxMap<usize, u32> = FxMap::default();
        for (&k, &v) in over {
            let mut i = slot_hash(k) as usize & mask;
            loop {
                let e = put.get(&i).copied().unwrap_or(self.table[i]);
                if e == NONE || nodes[e as usize].bits() == k {
                    break;
                }
                i = (i + 1) & mask;
            }
            put.insert(i, v);
        }
        let mut put: Vec<(usize, u32)> = put.into_iter().collect();
        put.sort_unstable();
        put
    }
    fn get(&self, nodes: &[Term], k: u64) -> Option<u32> {
        if let Some(v) = self.over.get(&k) {
            return Some(*v);
        }
        let mask = self.table.len().checked_sub(1)?;
        let mut i = slot_hash(k) as usize & mask;
        loop {
            let v = self.table[i];
            if v == NONE {
                return None;
            }
            if nodes[v as usize].bits() == k {
                return Some(v);
            }
            i = (i + 1) & mask;
        }
    }
}

#[derive(Clone)]
pub struct Forest {
    nodes: Arena<Term>,
    idx: Idx,
    parent: Arena<u32>,
    /// pre-order number of a node, `NONE` for one no root reaches
    pre: Arena<u32>,
    /// the node at each pre-order number
    order: Arena<u32>,
    /// one past the last pre-order number in the subtree of a node
    end: Arena<u32>,
    depth: Arena<u32>,
    /// rows of the strict closure: the sum of the depths
    pub pairs: u64,
    /// nodes with a parent, and nodes with a child
    pub deep: u32,
    pub internal: u32,
    pub broken: bool,
    /// a declared `graph`: cycles allowed, answered by walking (graph.rs), the tree's arrays empty
    graph: Option<Box<crate::graph::Graph>>,
    /// a declared `nearest`: for each node the nearest strict ancestor the condition holds of, `NONE` for none
    near: Option<Arena<u32>>,
}

/// The children by parent, in the order the edges were given: the offsets into the child list, and the list.
pub(crate) fn children(parent: &[u32]) -> (Vec<u32>, Vec<u32>) {
    let n = parent.len();
    let mut start = vec![0u32; n + 1];
    for &p in parent {
        if p != NONE {
            start[p as usize + 1] += 1;
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
    (start, kids)
}

impl Forest {
    /// The forest of `(parent, child)` edges.
    pub fn build(edges: &[(Term, Term)]) -> Forest {
        let mut nodes: Vec<Term> = Vec::new();
        let mut seen: FxMap<u64, u32> = FxMap::default();
        let mut node = |t: Term, nodes: &mut Vec<Term>| *seen.entry(t.bits()).or_insert_with(|| { nodes.push(t); nodes.len() as u32 - 1 });
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
        let (start, kids) = children(&parent);
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
        let idx = Idx::of(&nodes, |_| true);
        Forest { nodes: nodes.into(), idx, parent: parent.into(), pre: pre.into(), order: order.into(), end: end.into(), depth: depth.into(), pairs, deep, internal, broken, graph: None, near: None }
    }

    /// The graph of `(from, to)` edges, cycles allowed.
    pub fn build_graph(edges: &[(Term, Term)]) -> Forest {
        let g = crate::graph::Graph::build(edges);
        let mut f = Forest::build(&[]);
        (f.pairs, f.deep, f.internal) = (g.pairs, g.deep, g.internal);
        f.graph = Some(Box::new(g));
        f
    }

    /// The forest of `(parent, child)` edges answering `nearest`: each node's nearest strict ancestor of those `marked`.
    pub fn build_nearest(edges: &[(Term, Term)], marked: &crate::store::FxSet<u64>) -> Forest {
        let mut f = Forest::build(edges);
        let mut near = vec![NONE; f.nodes.len()];
        for &v in f.order.iter() {
            let p = f.parent[v as usize];
            if p != NONE {
                near[v as usize] = if marked.contains(&f.nodes[p as usize].bits()) { p } else { near[p as usize] };
            }
        }
        let mut ups: crate::store::FxSet<u32> = crate::store::FxSet::default();
        f.pairs = 0;
        for &u in &near {
            if u != NONE {
                f.pairs += 1;
                ups.insert(u);
            }
        }
        (f.deep, f.internal) = (f.pairs as u32, ups.len() as u32);
        f.near = Some(near.into());
        f
    }

    pub fn is_graph(&self) -> bool {
        self.graph.is_some()
    }

    /// The forest as a volume keeps it: its arrays and its table as they are, mapped back when read.
    pub(crate) fn write(&self, w: &mut VolW) {
        w.u32(if self.graph.is_some() { 1 } else if self.near.is_some() { 2 } else { 0 });
        if let Some(g) = &self.graph {
            return g.write(w);
        }
        if let Some(near) = &self.near {
            w.arena(near);
        }
        w.arena(&self.nodes);
        // nodes put in since the table was made go in its free slots while it has room as `of` leaves it, else in a
        // new table of the live node of each term
        if self.idx.over.is_empty() {
            w.arena(&self.idx.table);
        } else if self.nodes.len() * 2 <= self.idx.table.len() {
            w.arena_placed(&self.idx.table, &self.idx.placed(&self.nodes), &[]);
        } else {
            w.arena(&Idx::of(&self.nodes, |i| self.pre[i] != NONE).table);
        }
        for a in [&self.parent, &self.pre, &self.order, &self.end, &self.depth] {
            w.arena(a);
        }
        w.u64(self.pairs);
        w.u32(self.deep);
        w.u32(self.internal);
        w.u32(self.broken as u32);
    }

    /// Whether a volume over a base writes this forest by reference: small, or its columns lie in the base.
    pub(crate) fn kept_by(&self, w: &VolW) -> bool {
        if let Some(g) = &self.graph {
            return g.kept_by(w);
        }
        self.nodes.len() < 1 << 14 || (w.in_base(&self.nodes) && [&self.parent, &self.pre, &self.order, &self.end, &self.depth].into_iter().chain(&self.near).all(|a| w.in_base(a)))
    }

    pub(crate) fn read(r: &mut VolR) -> Result<Forest, String> {
        let kind = r.u32()?;
        let near: Option<Arena<u32>> = if kind == 2 { Some(r.arena()?) } else { None };
        if kind == 1 {
            let g = crate::graph::Graph::read(r)?;
            let mut f = Forest::build(&[]);
            (f.pairs, f.deep, f.internal) = (g.pairs, g.deep, g.internal);
            f.graph = Some(Box::new(g));
            return Ok(f);
        }
        let (nodes, table): (Arena<Term>, Arena<u32>) = (r.arena()?, r.arena()?);
        let [parent, pre, order, end, depth] = [(); 5].map(|_| r.arena::<u32>());
        let f = Forest { idx: Idx { table, over: FxMap::default() }, parent: parent?, pre: pre?, order: order?, end: end?, depth: depth?, pairs: r.u64()?, deep: r.u32()?, internal: r.u32()?, broken: r.u32()? == 1, nodes, graph: None, near };
        let n = f.nodes.len();
        if !f.idx.table.len().is_power_of_two() || [&f.parent, &f.pre, &f.end, &f.depth].into_iter().chain(&f.near).any(|a| a.len() != n) || f.order.len() > n {
            return Err("a volume's forest is not a forest".into());
        }
        Ok(f)
    }

    /// `add`'s trees after this forest's, the numbering of both kept.
    fn append(&mut self, add: Forest) {
        let (n, o) = (self.nodes.len() as u32, self.order.len() as u32);
        let shift = |v: u32, by: u32| if v == NONE { NONE } else { v + by };
        self.idx.over.extend(add.nodes.iter().enumerate().map(|(i, t)| (t.bits(), i as u32 + n)));
        self.nodes.to_mut().extend_from_slice(&add.nodes);
        self.parent.to_mut().extend(add.parent.iter().map(|&v| shift(v, n)));
        self.pre.to_mut().extend(add.pre.iter().map(|&v| shift(v, o)));
        self.order.to_mut().extend(add.order.iter().map(|&v| v + n));
        self.end.to_mut().extend(add.end.iter().map(|&v| v + o));
        self.depth.to_mut().extend_from_slice(&add.depth);
        self.pairs += add.pairs;
        self.deep += add.deep;
        self.internal += add.internal;
        self.broken |= add.broken;
    }

    /// THE TREES AN EDGE TAKEN OUT OR PUT IN REACHES, BUILT AGAIN: each tree holding the child of an edge of `removed`,
    /// or either end of an edge of `added`, is dropped (its nodes keep their slots, unreachable), and the edges of it
    /// that stand are built into trees again with those added, after the rest, whose numbering is kept. The cost is the
    /// trees the edges are in, not the forest. The nodes of the trees dropped, each once, for the rows that ended at one
    /// are what a retraction looks at.
    pub fn rebuild_trees(&mut self, removed: &[(Term, Term)], added: &[(Term, Term)]) -> Vec<Term> {
        if let Some(g) = &self.graph {
            let out: crate::store::FxSet<(u64, u64)> = removed.iter().map(|(p, c)| (p.bits(), c.bits())).collect();
            let mut es: Vec<(Term, Term)> = g.edges().into_iter().filter(|(p, c)| !out.contains(&(p.bits(), c.bits()))).collect();
            es.extend_from_slice(added);
            let dropped = g.node_terms();
            *self = Forest::build_graph(&es);
            return dropped;
        }
        let out: crate::store::FxSet<(u64, u64)> = removed.iter().map(|(p, c)| (p.bits(), c.bits())).collect();
        let (mut roots, mut rooted): (Vec<u32>, crate::store::FxSet<u32>) = Default::default();
        for t in removed.iter().map(|e| e.1).chain(added.iter().flat_map(|(p, c)| [*p, *c])) {
            let Some(mut v) = self.at(t) else { continue };
            for _ in 0..self.depth[v as usize] {
                v = self.parent[v as usize];
            }
            if rooted.insert(v) {
                roots.push(v);
            }
        }
        let (mut stand, mut dropped): (Vec<(Term, Term)>, Vec<Term>) = (Vec::new(), Vec::new());
        let mut parents: crate::store::FxSet<u32> = crate::store::FxSet::default();
        for r in roots {
            let (lo, hi) = (self.pre[r as usize], self.end[r as usize]);
            for k in lo..hi {
                let v = self.order[k as usize];
                dropped.push(self.nodes[v as usize]);
                if v != r {
                    let p = self.parent[v as usize];
                    parents.insert(p);
                    let e = (self.nodes[p as usize], self.nodes[v as usize]);
                    if !out.contains(&(e.0.bits(), e.1.bits())) || brk!("vclosure_removed_edge_kept" => true; false) {
                        stand.push(e);
                    }
                }
                self.pairs -= self.depth[v as usize] as u64;
                self.deep -= (self.depth[v as usize] > 0) as u32;
            }
            for k in lo..hi {
                let v = self.order[k as usize];
                self.pre.to_mut()[v as usize] = NONE;
            }
        }
        self.internal -= parents.len() as u32;
        stand.extend_from_slice(added);
        self.append(Forest::build(&stand));
        dropped
    }

    fn at(&self, t: Term) -> Option<u32> {
        self.idx.get(&self.nodes, t.bits()).filter(|v| self.pre[*v as usize] != NONE)
    }

    /// `a` is a strict ancestor of `d`: containment of intervals.
    pub fn is_ancestor(&self, a: Term, d: Term) -> bool {
        if let Some(g) = &self.graph {
            return g.is_ancestor(a, d);
        }
        if let Some(near) = &self.near {
            return matches!((self.at(a), self.at(d)), (Some(a), Some(d)) if near[d as usize] == a);
        }
        match (self.at(a), self.at(d)) {
            (Some(a), Some(d)) => {
                let (pa, pd) = (self.pre[a as usize], self.pre[d as usize]);
                brk!("vclosure_nonstrict" => pa <= pd; pa < pd) && pd < self.end[a as usize]
            }
            _ => false,
        }
    }

    /// The node before `d` on the way down from its ancestor `a`: in a tree its parent, in a graph the node before it on
    /// a shortest path.
    pub fn step_of(&self, a: Term, d: Term) -> Option<Term> {
        match &self.graph {
            Some(g) => g.step_of(a, d),
            None => self.parent_of(d),
        }
    }

    /// How many firings make the row `(a, d)`: one in a tree; in a graph the edge itself and each edge into `d` from a
    /// node `a` reaches.
    pub fn firing_count(&self, a: Term, d: Term) -> u32 {
        self.graph.as_ref().map_or(1, |g| g.firing_count(a, d))
    }

    /// The rules that make the row `(a, d)`: the base, the step. One in a tree; in a graph both where both fire.
    pub fn firings(&self, a: Term, d: Term) -> (bool, bool) {
        match &self.graph {
            Some(g) => g.firings(a, d),
            None => {
                let base = self.parent_of(d) == Some(a);
                (base, !base)
            }
        }
    }

    /// The parent of `d`, the root having none.
    fn parent_of(&self, d: Term) -> Option<Term> {
        let v = self.at(d)?;
        Some(self.nodes[*self.parent.get(v as usize).filter(|p| **p != NONE)? as usize])
    }

    /// The strict ancestors of `d`, nearest first.
    pub fn ancestors(&self, d: Term, out: &mut Vec<Term>) {
        if let Some(g) = &self.graph {
            return g.ancestors(d, out);
        }
        let Some(mut v) = self.at(d) else { return };
        if let Some(near) = &self.near {
            if near[v as usize] != NONE {
                out.push(self.nodes[near[v as usize] as usize]);
            }
            return;
        }
        for _ in 0..self.depth[v as usize].saturating_sub(brk!("vclosure_ancestors_short" => 1; 0)) {
            v = self.parent[v as usize];
            out.push(self.nodes[v as usize]);
        }
    }

    /// The strict descendants of `a`, in pre-order: one range.
    pub fn descendants(&self, a: Term, out: &mut Vec<Term>) {
        if let Some(g) = &self.graph {
            return g.descendants(a, out);
        }
        let Some(v) = self.at(a) else { return };
        if let Some(near) = &self.near {
            // below a node another ancestor is nearest to, nothing is nearest to `a`
            let (mut k, hi) = (self.pre[v as usize] + 1, self.end[v as usize]);
            while k < hi {
                let x = self.order[k as usize];
                if near[x as usize] == v {
                    out.push(self.nodes[x as usize]);
                    k += 1;
                } else {
                    k = self.end[x as usize];
                }
            }
            return;
        }
        let (lo, hi) = (self.pre[v as usize] + brk!("vclosure_nonstrict" => 0; 1), self.end[v as usize] - brk!("vclosure_descendants_short" => 1; 0));
        out.extend(self.order[lo as usize..hi.max(lo) as usize].iter().map(|x| self.nodes[*x as usize]));
    }

    /// Every pair, ancestor first: the ancestors of each node.
    pub fn each_pair(&self, mut f: impl FnMut(Term, Term)) {
        if let Some(g) = &self.graph {
            return g.each_pair(f);
        }
        if let Some(near) = &self.near {
            for &v in self.order.iter() {
                if self.pre[v as usize] != NONE && near[v as usize] != NONE {
                    f(self.nodes[near[v as usize] as usize], self.nodes[v as usize]);
                }
            }
            return;
        }
        for &v in self.order.iter() {
            if self.pre[v as usize] == NONE {
                continue;
            }
            let mut u = v;
            for _ in 0..self.depth[v as usize] {
                u = self.parent[u as usize];
                f(self.nodes[u as usize], self.nodes[v as usize]);
            }
        }
    }

    /// The rows into `t` and every node below it: what a change of the edges or the marks at `t` can move.
    pub fn rows_under(&self, t: Term, out: &mut crate::store::FxSet<(u64, u64)>) {
        if self.near.is_some() {
            return self.near_rows_under(t, out);
        }
        let mut xs = vec![t];
        self.descendants(t, &mut xs);
        let mut up = Vec::new();
        for x in xs {
            up.clear();
            self.ancestors(x, &mut up);
            out.extend(up.iter().map(|a| (a.bits(), x.bits())));
        }
    }

    /// A nearest's rows into `t` and every node below it.
    pub fn near_rows_under(&self, t: Term, out: &mut crate::store::FxSet<(u64, u64)>) {
        let (Some(near), Some(v)) = (&self.near, self.at(t)) else { return };
        for k in self.pre[v as usize]..self.end[v as usize] {
            let x = self.order[k as usize];
            if near[x as usize] != NONE {
                out.insert((self.nodes[near[x as usize] as usize].bits(), self.nodes[x as usize].bits()));
            }
        }
    }

    /// Whether `a` is the nearest marked node above `d`.
    pub fn near_is(&self, a: u64, d: Term) -> bool {
        let (Some(near), Some(v)) = (&self.near, self.at(d)) else { return false };
        near[v as usize] != NONE && self.nodes[near[v as usize] as usize].bits() == a
    }

    /// Rows of the strict closure with this node as the ancestor.
    pub fn subtree(&self, a: Term) -> u64 {
        if let Some(g) = &self.graph {
            return g.subtree(a);
        }
        if self.near.is_some() {
            let mut v = Vec::new();
            self.descendants(a, &mut v);
            return v.len() as u64;
        }
        self.at(a).map_or(0, |v| (self.end[v as usize] - self.pre[v as usize] - 1) as u64)
    }

    pub fn len(&self) -> usize {
        self.graph.as_ref().map_or(self.nodes.len(), |g| g.len())
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Heap bytes held.
    pub fn bytes(&self) -> usize {
        self.graph.as_ref().map_or(0, |g| g.bytes()) + self.near.as_ref().map_or(0, |n| n.len() * 4) + self.nodes.len() * (8 + 4 * 5 + 16) + self.order.len() * 4
    }
}
