//! THE GRAPH OF A DECLARED `graph` (docs/data-structures.md): the edges of one book, cycles allowed, which answers
//! their strict closure (a path of one edge or more) by walking, without storing a row of it.
//!
//! * the strongly connected components, numbered as Tarjan's walk closes them, a sink first: an edge never leads to
//!   a component of a higher number, so a walk towards `d` leaves out every node below `d`'s component;
//! * from a node: the nodes a walk forward reaches; to a node: a walk backward;
//! * a row's firing: the base rule where the edge itself is, the step where an edge into the end leaves a node the
//!   start reaches; its derivation follows a shortest path.
//!
//! Rebuilt whole when its edges change.

use crate::arena::{Arena, VolR, VolW};
use crate::store::FxMap;
use crate::term::Term;

const NONE: u32 = u32::MAX;

#[derive(Clone)]
pub struct Graph {
    nodes: Arena<Term>,
    idx: FxMap<u64, u32>,
    ostart: Arena<u32>,
    oadj: Arena<u32>,
    istart: Arena<u32>,
    iadj: Arena<u32>,
    comp: Arena<u32>,
    /// a component a path leaves and comes back to: more than one node, or a node with an edge to itself
    cyclic: Arena<u32>,
    pub pairs: u64,
    pub deep: u32,
    pub internal: u32,
    memo: Memo,
}

/// What a walk forward from a component reached, as a bit per node, kept while the graph stands: a test of both ends
/// asked again from one start reads a bit. Emptied whole past MEMO_BYTES.
#[derive(Default)]
struct Memo(std::sync::Mutex<(FxMap<u32, std::sync::Arc<Vec<u64>>>, usize)>);

impl Clone for Memo {
    fn clone(&self) -> Memo {
        Memo::default()
    }
}

const MEMO_BYTES: usize = 64 << 20;

fn csr(n: usize, es: &[(u32, u32)], rev: bool) -> (Vec<u32>, Vec<u32>) {
    let mut start = vec![0u32; n + 1];
    for &(a, b) in es {
        start[if rev { b } else { a } as usize + 1] += 1;
    }
    for i in 0..n {
        start[i + 1] += start[i];
    }
    let mut adj = vec![0u32; es.len()];
    let mut fill = start.clone();
    for &(a, b) in es {
        let (from, to) = if rev { (b, a) } else { (a, b) };
        adj[fill[from as usize] as usize] = to;
        fill[from as usize] += 1;
    }
    (start, adj)
}

impl Graph {
    pub fn build(edges: &[(Term, Term)]) -> Graph {
        let mut nodes: Vec<Term> = Vec::new();
        let mut idx: FxMap<u64, u32> = FxMap::default();
        let mut node = |t: Term, nodes: &mut Vec<Term>| *idx.entry(t.bits()).or_insert_with(|| { nodes.push(t); nodes.len() as u32 - 1 });
        let mut es: Vec<(u32, u32)> = edges.iter().map(|(a, b)| (node(*a, &mut nodes), node(*b, &mut nodes))).collect();
        es.sort_unstable();
        es.dedup();
        let n = nodes.len();
        let (ostart, oadj) = csr(n, &es, false);
        let (istart, iadj) = csr(n, &es, true);
        let (comp, ncomp) = tarjan(n, &ostart, &oadj);
        let mut size = vec![0u32; ncomp];
        for &c in &comp {
            size[c as usize] += 1;
        }
        let mut cyclic: Vec<u32> = size.iter().map(|&s| (s > 1) as u32).collect();
        for &(a, b) in &es {
            if a == b {
                cyclic[comp[a as usize] as usize] = 1;
            }
        }
        let deep = (0..n).filter(|&v| istart[v + 1] > istart[v]).count() as u32;
        let internal = (0..n).filter(|&v| ostart[v + 1] > ostart[v]).count() as u32;
        let mut g = Graph { nodes: nodes.into(), idx, ostart: ostart.into(), oadj: oadj.into(), istart: istart.into(), iadj: iadj.into(), comp: comp.into(), cyclic: cyclic.into(), pairs: 0, deep, internal, memo: Memo::default() };
        g.pairs = g.pairs_bound(ncomp, &size);
        g
    }

    /// THE ROWS OF THE CLOSURE, BOUNDED for the planner from the components: what a node of each reaches is its own
    /// component where that is a cycle, and each component an edge leads to with what that one reaches, counted once
    /// per edge (two paths to one place count twice), at most every node.
    fn pairs_bound(&self, ncomp: usize, size: &[u32]) -> u64 {
        let n = self.nodes.len() as u64;
        let mut members: Vec<Vec<u32>> = vec![Vec::new(); ncomp];
        for v in 0..self.nodes.len() as u32 {
            members[self.comp[v as usize] as usize].push(v);
        }
        let mut reach = vec![0u64; ncomp];
        let mut pairs = 0u64;
        for c in 0..ncomp {
            let mut next: Vec<u32> = members[c].iter().flat_map(|&v| self.oadj[self.ostart[v as usize] as usize..self.ostart[v as usize + 1] as usize].iter().map(|&y| self.comp[y as usize])).filter(|&d| d as usize != c).collect();
            next.sort_unstable();
            next.dedup();
            let r = if self.cyclic[c] == 1 { size[c] as u64 } else { 0 } + next.iter().map(|&d| size[d as usize] as u64 + reach[d as usize]).sum::<u64>();
            reach[c] = r.min(n);
            pairs += size[c] as u64 * reach[c];
        }
        pairs
    }

    pub(crate) fn write(&self, w: &mut VolW) {
        w.arena(&self.nodes);
        for a in [&self.ostart, &self.oadj, &self.istart, &self.iadj, &self.comp] {
            w.arena(a);
        }
        w.arena(&self.cyclic);
        w.u64(self.pairs);
        w.u32(self.deep);
        w.u32(self.internal);
    }

    pub(crate) fn read(r: &mut VolR) -> Result<Graph, String> {
        let nodes: Arena<Term> = r.arena()?;
        let [ostart, oadj, istart, iadj, comp] = [(); 5].map(|_| r.arena::<u32>());
        let cyclic: Arena<u32> = r.arena()?;
        let idx = nodes.iter().enumerate().map(|(i, t)| (t.bits(), i as u32)).collect();
        let g = Graph { nodes, idx, ostart: ostart?, oadj: oadj?, istart: istart?, iadj: iadj?, comp: comp?, cyclic, pairs: r.u64()?, deep: r.u32()?, internal: r.u32()?, memo: Memo::default() };
        if g.ostart.len() != g.nodes.len() + 1 || g.istart.len() != g.nodes.len() + 1 || g.comp.len() != g.nodes.len() {
            return Err("a volume's graph is not a graph".into());
        }
        Ok(g)
    }

    pub(crate) fn kept_by(&self, w: &VolW) -> bool {
        self.nodes.len() < 1 << 14 || (w.in_base(&self.nodes) && [&self.ostart, &self.oadj, &self.istart, &self.iadj, &self.comp].iter().all(|a| w.in_base(*a)))
    }

    /// The edges as they stand.
    pub fn edges(&self) -> Vec<(Term, Term)> {
        let mut out = Vec::with_capacity(self.oadj.len());
        for v in 0..self.nodes.len() {
            for k in self.ostart[v]..self.ostart[v + 1] {
                out.push((self.nodes[v], self.nodes[self.oadj[k as usize] as usize]));
            }
        }
        out
    }

    pub fn node_terms(&self) -> Vec<Term> {
        self.nodes.to_vec()
    }

    fn at(&self, t: Term) -> Option<u32> {
        self.idx.get(&t.bits()).copied()
    }

    /// The nodes a path of one edge or more leads to from `v` (forward), or from which one leads to `v` (backward), in
    /// the order a breadth-first walk meets them.
    fn walk(&self, v: u32, forward: bool) -> Vec<u32> {
        let (start, adj) = if forward { (&self.ostart, &self.oadj) } else { (&self.istart, &self.iadj) };
        let mut seen = crate::store::FxSet::default();
        let mut out: Vec<u32> = Vec::new();
        let mut q = std::collections::VecDeque::from([v]);
        while let Some(x) = q.pop_front() {
            for k in start[x as usize]..start[x as usize + 1] {
                let y = adj[k as usize];
                if seen.insert(y) {
                    out.push(y);
                    q.push_back(y);
                }
            }
        }
        out
    }

    /// The node before `d` on a shortest path from `a`, None where no path leads there.
    fn pred(&self, a: u32, d: u32) -> Option<u32> {
        let floor = self.comp[d as usize];
        let mut from: FxMap<u32, u32> = FxMap::default();
        let mut q = std::collections::VecDeque::from([a]);
        while let Some(x) = q.pop_front() {
            for k in self.ostart[x as usize]..self.ostart[x as usize + 1] {
                let y = self.oadj[k as usize];
                if self.comp[y as usize] < floor || from.contains_key(&y) {
                    continue;
                }
                from.insert(y, x);
                if y == d {
                    return Some(x);
                }
                q.push_back(y);
            }
        }
        None
    }

    fn reached(&self, a: u32) -> std::sync::Arc<Vec<u64>> {
        let c = self.comp[a as usize];
        if let Some(r) = self.memo.0.lock().unwrap().0.get(&c) {
            return r.clone();
        }
        let mut bits = vec![0u64; self.nodes.len().div_ceil(64)];
        for y in self.walk(a, true) {
            bits[y as usize / 64] |= 1 << (y % 64);
        }
        let r = std::sync::Arc::new(bits);
        let mut m = self.memo.0.lock().unwrap();
        m.1 += r.len() * 8;
        if m.1 > MEMO_BYTES {
            m.0.clear();
            m.1 = r.len() * 8;
        }
        m.0.insert(c, r.clone());
        r
    }

    pub fn is_ancestor(&self, a: Term, d: Term) -> bool {
        let (Some(a), Some(d)) = (self.at(a), self.at(d)) else { return false };
        let (ca, cd) = (self.comp[a as usize], self.comp[d as usize]);
        if ca == cd {
            return self.cyclic[ca as usize] == 1;
        }
        ca > cd && self.reached(a)[d as usize / 64] >> (d % 64) & 1 == 1
    }

    /// The node before `d` on a shortest path from `a`: `a` itself where the edge is.
    pub fn step_of(&self, a: Term, d: Term) -> Option<Term> {
        let (a, d) = (self.at(a)?, self.at(d)?);
        self.pred(a, d).map(|p| self.nodes[p as usize])
    }

    /// The rules that make the row `(a, d)`: the base where the edge is, the step where an edge into `d` leaves a node
    /// `a` reaches.
    pub fn firings(&self, a: Term, d: Term) -> (bool, bool) {
        let (Some(av), Some(dv)) = (self.at(a), self.at(d)) else { return (false, false) };
        let ins = &self.iadj[self.istart[dv as usize] as usize..self.istart[dv as usize + 1] as usize];
        let base = ins.contains(&av);
        let r = self.reached(av);
        let step = ins.iter().any(|&p| r[p as usize / 64] >> (p % 64) & 1 == 1);
        (base, step)
    }

    pub fn firing_count(&self, a: Term, d: Term) -> u32 {
        let (Some(av), Some(dv)) = (self.at(a), self.at(d)) else { return 0 };
        let ins = &self.iadj[self.istart[dv as usize] as usize..self.istart[dv as usize + 1] as usize];
        let r = self.reached(av);
        ins.contains(&av) as u32 + ins.iter().filter(|&&p| r[p as usize / 64] >> (p % 64) & 1 == 1).count() as u32
    }

    pub fn ancestors(&self, d: Term, out: &mut Vec<Term>) {
        let Some(v) = self.at(d) else { return };
        out.extend(self.walk(v, false).into_iter().map(|x| self.nodes[x as usize]));
    }

    pub fn descendants(&self, a: Term, out: &mut Vec<Term>) {
        let Some(v) = self.at(a) else { return };
        out.extend(self.walk(v, true).into_iter().map(|x| self.nodes[x as usize]));
    }

    pub fn each_pair(&self, mut f: impl FnMut(Term, Term)) {
        for v in 0..self.nodes.len() as u32 {
            for d in self.walk(v, true) {
                f(self.nodes[v as usize], self.nodes[d as usize]);
            }
        }
    }

    pub fn subtree(&self, a: Term) -> u64 {
        self.at(a).map_or(0, |v| self.walk(v, true).len() as u64)
    }

    pub(crate) fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn bytes(&self) -> usize {
        self.nodes.len() * (8 + 4 * 3 + 1 + 24) + self.oadj.len() * 8
    }
}

/// The strongly connected components, numbered in the order Tarjan's walk closes them (a sink first), and how many.
fn tarjan(n: usize, start: &[u32], adj: &[u32]) -> (Vec<u32>, usize) {
    let (mut index, mut low, mut comp) = (vec![NONE; n], vec![0u32; n], vec![NONE; n]);
    let (mut on, mut stack): (Vec<bool>, Vec<u32>) = (vec![false; n], Vec::new());
    let (mut next, mut ncomp) = (0u32, 0u32);
    for root in 0..n as u32 {
        if index[root as usize] != NONE {
            continue;
        }
        let mut call: Vec<(u32, u32)> = vec![(root, start[root as usize])];
        index[root as usize] = next;
        low[root as usize] = next;
        next += 1;
        stack.push(root);
        on[root as usize] = true;
        while let Some(&mut (v, ref mut at)) = call.last_mut() {
            if *at < start[v as usize + 1] {
                let w = adj[*at as usize];
                *at += 1;
                if index[w as usize] == NONE {
                    index[w as usize] = next;
                    low[w as usize] = next;
                    next += 1;
                    stack.push(w);
                    on[w as usize] = true;
                    call.push((w, start[w as usize]));
                } else if on[w as usize] {
                    low[v as usize] = low[v as usize].min(index[w as usize]);
                }
            } else {
                call.pop();
                if let Some(&(u, _)) = call.last() {
                    low[u as usize] = low[u as usize].min(low[v as usize]);
                }
                if low[v as usize] == index[v as usize] {
                    while let Some(w) = stack.pop() {
                        on[w as usize] = false;
                        comp[w as usize] = ncomp;
                        if w == v {
                            break;
                        }
                    }
                    ncomp += 1;
                }
            }
        }
    }
    (comp, ncomp as usize)
}
