//! THE DETECTION REPORT (docs/data-structures.md, "Detection", order step 0).
//!
//! Reads an evaluated store and PROPOSES declarations; it declares nothing and
//! changes nothing. Only the author knows whether every future fact of a
//! relation keeps a promise, so each proposal is a line the author may paste,
//! with what it measured. Three structures:
//!
//! - `function`: for a set of key positions, every key has at most one value.
//!   Minimal key sets only (a key whose subset already determines the
//!   position adds nothing); relations of arity 2 to 5.
//! - `tree`: a binary relation that is a forest (one parent per child, no
//!   cycle), and, when another relation equals its strict transitive closure
//!   (or is a closure whose reduction is a forest), `closure`.
//! - `alias`: a relation whose rows are exactly another's with the arguments
//!   permuted or projected.
//!
//! Near misses are listed beside the proposals, with the offending facts: a
//! scanner fault found is worth as much as a gain missed.
//!
//! Every judgement is exact: membership is asked of the store's own key table
//! (`Store::get`), and a hash only groups candidates, never decides.
use crate::session::Session;
use crate::store::{FactId, Fx, FxMap, FxSet, Store};
use crate::term::{Heap, Sym, Term};
use std::collections::{BTreeMap, BTreeSet};
use std::hash::Hasher;

pub struct Options {
    /// Relations with fewer rows are not looked at: every property holds of a
    /// relation of one row.
    pub min_rows: usize,
}

impl Default for Options {
    fn default() -> Options {
        Options { min_rows: 2 }
    }
}

pub struct Proposal {
    pub kind: &'static str,
    pub decl: String,
    pub notes: Vec<String>,
    /// The relation whose rows the declaration would stop storing, with its rows and derivations.
    saved: Option<(usize, usize, usize)>,
}

pub struct Report {
    /// The trees the program already declares, as found in the data: no proposal.
    pub declared: Vec<Proposal>,
    pub relations: usize,
    pub facts: usize,
    pub bytes_per_fact: f64,
    pub proposals: Vec<Proposal>,
    pub near: Vec<String>,
    pub saved_rows: usize,
    pub saved_firings: usize,
}

struct Rel<'a> {
    rel: Sym,
    persp: Sym,
    name: String,
    book: String,
    arity: usize,
    rows: Vec<&'a [Term]>,
    base: usize,
    firings: usize,
    /// Distinct values per column, for arity up to `MAX_ALIAS`.
    dc: Vec<usize>,
}

const MAX_FD: usize = 5;
const MAX_ALIAS: usize = 6;

impl Rel<'_> {
    fn label(&self) -> String {
        if self.book == "main" { self.name.clone() } else { format!("{}[{}]", self.name, self.book) }
    }
    fn row_text(&self, h: &Heap, row: &[Term]) -> String {
        let a: Vec<String> = row.iter().map(|t| h.canon(*t)).collect();
        format!("{}({})", self.name, a.join(", "))
    }
}

fn var(i: usize) -> char {
    (b'A' + i as u8) as char
}

fn tol(n: usize) -> usize {
    (n / 50).max(1)
}

fn size(b: f64) -> String {
    if b >= 1048576.0 { format!("{:.1} MiB", b / 1048576.0) } else if b >= 1024.0 { format!("{:.1} KiB", b / 1024.0) } else { format!("{:.0} B", b) }
}

fn clip(s: String) -> String {
    if s.chars().count() <= 100 { s } else { format!("{}...", s.chars().take(97).collect::<String>()) }
}

fn rows_word(n: usize) -> String {
    format!("{} row{}", n, if n == 1 { "" } else { "s" })
}

/// The relations a fresh session already holds: the kernel's own, not the world's.
fn kernel_relations() -> BTreeSet<String> {
    let s = Session::fresh(1);
    s.eval.store.all_facts().into_iter().map(|i| s.eval.h.name(s.eval.store.rec(i).rel).to_string()).collect()
}

pub fn propose(store: &Store, h: &Heap, o: &Options) -> Report {
    let kernel = kernel_relations();
    // the trees the program already declares, each with its closure: reported as declared, never proposed
    let mut declared: BTreeMap<String, Option<String>> = BTreeMap::new();
    let mut closure_of: BTreeMap<String, String> = BTreeMap::new();
    for id in store.all_facts() {
        let r = store.rec(id);
        let a = store.args(id);
        match (h.name(r.rel), a) {
            ("structure_decl", [t, _, k]) if k.as_atom().is_some_and(|k| h.name(k) == "tree") => {
                declared.entry(h.canon(*t)).or_default();
            }
            ("structure_closure", [t, c]) => {
                closure_of.insert(h.canon(*t), h.canon(*c));
            }
            _ => {}
        }
    }
    for (t, c) in closure_of {
        declared.insert(t, Some(c));
    }
    let declared = if brk!("structures_declared_ignored" => true; false) { BTreeMap::new() } else { declared };
    // a declared closure is the declaration's, stored or answered from its tree: no proposal and no near miss reads it
    let closures: BTreeSet<String> = declared.values().flatten().cloned().collect();

    let mut groups: FxMap<(Sym, Sym, usize), Vec<FactId>> = FxMap::default();
    let mut facts = 0;
    for id in store.all_facts() {
        let r = store.rec(id);
        facts += 1;
        if h.name(r.persp).starts_with('$') || kernel.contains(h.name(r.rel)) || closures.contains(h.name(r.rel)) {
            continue;
        }
        groups.entry((r.rel, r.persp, store.arity(id))).or_default().push(id);
    }
    let mut keyed: Vec<((String, String, usize), (Sym, Sym), Vec<FactId>)> = groups
        .into_iter()
        .filter(|(_, ids)| ids.len() >= o.min_rows)
        .map(|((rel, persp, n), ids)| ((h.name(rel).to_string(), h.name(persp).to_string(), n), (rel, persp), ids))
        .collect();
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    let rels: Vec<Rel> = keyed
        .into_iter()
        .map(|((name, book, arity), (rel, persp), ids)| {
            let rows: Vec<&[Term]> = ids.iter().map(|&i| store.args(i)).collect();
            let base = ids.iter().filter(|&&i| store.rec(i).base()).count();
            let firings = ids.iter().map(|&i| store.support_count(i)).sum();
            let dc = if arity <= MAX_ALIAS {
                (0..arity).map(|c| rows.iter().map(|r| r[c]).collect::<FxSet<Term>>().len()).collect()
            } else {
                Vec::new()
            };
            Rel { rel, persp, name, book, arity, rows, base, firings, dc }
        })
        .collect();
    let total: usize = store.bytes().iter().map(|(_, b)| *b).sum();
    let bytes_per_fact = if facts == 0 { 0.0 } else { total as f64 / facts as f64 };

    let mut proposals = Vec::new();
    let mut near = Vec::new();
    let mut found = Vec::new();
    let trees = trees(&rels, h, &declared, &mut found, &mut proposals, &mut near);
    let closures: BTreeSet<usize> = proposals.iter().filter_map(|p| p.saved.map(|s| s.0)).collect();
    let aliased = aliases(&rels, store, h, &closures, &mut proposals, &mut near);
    functions(&rels, h, &trees, &aliased, &mut proposals, &mut near);

    let order = |k: &str| match k { "function" => 0, "tree" => 1, _ => 2 };
    proposals.sort_by(|a, b| (order(a.kind), &a.decl).cmp(&(order(b.kind), &b.decl)));
    near.sort();
    near.dedup();
    let mut seen = BTreeSet::new();
    let (mut saved_rows, mut saved_firings) = (0, 0);
    for p in &proposals {
        if let Some((i, rows, firings)) = p.saved {
            if seen.insert(i) {
                saved_rows += rows;
                saved_firings += firings;
            }
        }
    }
    Report { declared: found, relations: rels.len(), facts, bytes_per_fact, proposals, near, saved_rows, saved_firings }
}

impl Report {
    pub fn render(&self, min_rows: usize) -> String {
        let mut out = format!(
            "structures: {} relations of at least {} rows scanned over {} live facts, about {} per fact (store tables over live facts)\n",
            self.relations, min_rows, self.facts, size(self.bytes_per_fact)
        );
        for (verb, p) in self.declared.iter().map(|p| ("declared", p)).chain(self.proposals.iter().map(|p| ("propose", p))) {
            out.push_str(&format!("\n{verb} {}\n", p.decl));
            for n in &p.notes {
                out.push_str(&format!("        {n}\n"));
            }
        }
        if !self.near.is_empty() {
            out.push('\n');
            for n in &self.near {
                out.push_str(&format!("near miss {n}\n"));
            }
        }
        let count = |k: &str| self.proposals.iter().filter(|p| p.kind == k).count();
        out.push_str(&format!(
            "\n{} proposals (function {}, tree {}, alias {}), {} near misses; the rows they stop storing: {} ({} derivations), about {} at the mean cost per fact\n",
            self.proposals.len(), count("function"), count("tree"), count("alias"), self.near.len(),
            self.saved_rows, self.saved_firings, size(self.saved_rows as f64 * self.bytes_per_fact)
        ));
        out
    }
}

// ------------------------------------------------------------------ function

struct Fd {
    groups: usize,
    viol: [usize; MAX_FD],
}

fn key_hash(row: &[Term], pos: &[usize]) -> u64 {
    let mut f = Fx::default();
    for &p in pos {
        f.write_u64(row[p].bits());
    }
    f.finish()
}

fn differs(first: &[Term], row: &[Term], mask: u32, n: usize) -> u8 {
    (0..n).filter(|&p| mask >> p & 1 == 0 && first[p] != row[p]).fold(0u8, |m, p| m | 1 << p)
}

fn fd_pass(rows: &[&[Term]], mask: u32, n: usize) -> Fd {
    let pos: Vec<usize> = (0..n).filter(|i| mask >> i & 1 == 1).collect();
    let mut m: FxMap<u64, (u32, u8)> = FxMap::default();
    let mut sec: FxMap<Vec<Term>, (u32, u8)> = FxMap::default();
    for (i, row) in rows.iter().enumerate() {
        let hk = key_hash(row, &pos);
        match m.get_mut(&hk) {
            None => {
                m.insert(hk, (i as u32, 0));
            }
            Some(e) => {
                let first = rows[e.0 as usize];
                if pos.iter().all(|&p| first[p] == row[p]) {
                    e.1 |= differs(first, row, mask, n);
                } else {
                    let key: Vec<Term> = pos.iter().map(|&p| row[p]).collect();
                    let s = sec.entry(key).or_insert((i as u32, 0));
                    s.1 |= differs(rows[s.0 as usize], row, mask, n);
                }
            }
        }
    }
    let mut viol = [0; MAX_FD];
    for (_, v) in m.values().chain(sec.values()).map(|v| ((), v)) {
        for (p, c) in viol.iter_mut().enumerate().take(n) {
            *c += (v.1 >> p & 1) as usize;
        }
    }
    Fd { groups: m.len() + sec.len(), viol }
}

/// The first two keys of `mask` that have more than one value at `p`, as pairs of rows.
fn fd_examples<'a>(rows: &[&'a [Term]], mask: u32, p: usize, n: usize) -> Vec<(&'a [Term], &'a [Term])> {
    let pos: Vec<usize> = (0..n).filter(|i| mask >> i & 1 == 1).collect();
    let mut first: FxMap<Vec<Term>, &[Term]> = FxMap::default();
    let mut seen: FxSet<Vec<Term>> = FxSet::default();
    let mut out = Vec::new();
    for row in rows {
        let key: Vec<Term> = pos.iter().map(|&q| row[q]).collect();
        match first.get(&key) {
            None => {
                first.insert(key, row);
            }
            Some(f) if f[p] != row[p] && seen.insert(key) => out.push((*f, *row)),
            _ => {}
        }
    }
    out
}

fn shown(n: usize, mask: u32, deps: u32) -> String {
    (0..n)
        .map(|i| if mask >> i & 1 == 1 { var(i).to_string() } else if deps >> i & 1 == 1 { format!("to {}", var(i)) } else { "_".to_string() })
        .collect::<Vec<_>>()
        .join(", ")
}

fn functions(rels: &[Rel], h: &Heap, trees: &[TreeFd], aliased: &BTreeSet<usize>, out: &mut Vec<Proposal>, near: &mut Vec<String>) {
    for (ri, r) in rels.iter().enumerate() {
        let n = r.arity;
        // a copy has its source's functions
        if !(2..=MAX_FD).contains(&n) || aliased.contains(&ri) {
            continue;
        }
        let full = (1u32 << n) - 1;
        let mut det = vec![0u32; 1 << n];
        let mut passes: Vec<Option<Fd>> = (0..=full).map(|_| None).collect();
        for mask in 1..full {
            let fd = fd_pass(&r.rows, mask, n);
            for p in 0..n {
                if mask >> p & 1 == 0 && brk!("structures_function_conflict_ignored" => fd.viol[p] <= 1; fd.viol[p] == 0) {
                    det[mask as usize] |= 1 << p;
                }
            }
            passes[mask as usize] = Some(fd);
        }
        let mut masks: Vec<u32> = (1..full).collect();
        masks.sort_by_key(|m| (m.count_ones(), *m));
        for &mask in &masks {
            let below = (1..full).filter(|&k| k != mask && k & mask == k).fold(0u32, |a, k| a | det[k as usize]);
            let mut deps = det[mask as usize] & !below & !mask;
            // a tree's one parent per child is the tree's promise, proposed there
            if trees.iter().any(|t| t.rel == ri && deps == 1 << t.parent && mask == 1 << t.child) {
                deps = 0;
            }
            if deps != 0 {
                let fd = passes[mask as usize].as_ref().unwrap();
                let dep_cols: Vec<String> = (0..n).filter(|&i| deps >> i & 1 == 1).map(|i| var(i).to_string()).collect();
                let key_cols: Vec<String> = (0..n).filter(|&i| mask >> i & 1 == 1).map(|i| var(i).to_string()).collect();
                out.push(Proposal {
                    kind: "function",
                    decl: format!("function {}({}).", r.name, shown(n, mask, deps)),
                    notes: vec![
                        format!("{}: {}, {} distinct {}; at most one {} for each", r.label(), rows_word(r.rows.len()), fd.groups, key_cols.join(","), dep_cols.join(",")),
                        "saves no rows (a map by key is added); the planner learns at most one match".into(),
                    ],
                    saved: None,
                });
            }
        }
        // near misses: every position but one as the key, a few keys that break it
        for mask in (0..n).map(|i| full & !(1 << i)) {
            let fd = passes[mask as usize].as_ref().unwrap();
            for p in 0..n {
                if mask >> p & 1 == 1 || fd.viol[p] == 0 || fd.groups < 3 || fd.viol[p] > tol(fd.groups) {
                    continue;
                }
                let mut ex: Vec<String> = fd_examples(&r.rows, mask, p, n)
                    .iter()
                    .map(|(a, b)| clip(format!("{} and {}", r.row_text(h, a), r.row_text(h, b))))
                    .collect();
                ex.sort();
                let more = if ex.len() > 2 { format!(" (+{} more)", ex.len() - 2) } else { String::new() };
                ex.truncate(2);
                near.push(format!(
                    "function {}({}): {} of {} keys has more than one {}: {}{}",
                    r.name, shown(n, mask, 1 << p), fd.viol[p], fd.groups, var(p), ex.join("; "), more
                ));
            }
        }
    }
}

// ---------------------------------------------------------------------- tree

const NONE: u32 = u32::MAX;

struct Forest {
    node: FxMap<Term, u32>,
    tin: Vec<u32>,
    tout: Vec<u32>,
    roots: usize,
    edges: usize,
    depth: u32,
    closure: usize,
}

impl Forest {
    fn above(&self, a: Term, d: Term) -> bool {
        match (self.node.get(&a), self.node.get(&d)) {
            (Some(&a), Some(&d)) => self.tin[a as usize] < self.tin[d as usize] && self.tin[d as usize] < self.tout[a as usize],
            _ => false,
        }
    }
}

enum Shape {
    Forest(Forest),
    /// Children with two parents: how many, and the first of them with both parents.
    TwoParents(usize, Vec<(Term, Term, Term)>),
    /// Cycles: how many, and the nodes of the first.
    Cycle(usize, Vec<Term>),
}

fn shape(rows: &[&[Term]], pc: usize, cc: usize) -> Shape {
    let mut node: FxMap<Term, u32> = FxMap::default();
    let mut terms: Vec<Term> = Vec::new();
    fn id(t: Term, node: &mut FxMap<Term, u32>, terms: &mut Vec<Term>) -> u32 {
        *node.entry(t).or_insert_with(|| {
            terms.push(t);
            (terms.len() - 1) as u32
        })
    }
    let mut parent: Vec<u32> = Vec::new();
    let mut viol: BTreeMap<u32, (u32, u32)> = BTreeMap::new();
    for row in rows {
        let (ip, ic) = (id(row[pc], &mut node, &mut terms), id(row[cc], &mut node, &mut terms));
        parent.resize(terms.len(), NONE);
        let slot = parent[ic as usize];
        if slot == NONE {
            parent[ic as usize] = ip;
        } else if brk!("structures_tree_two_parents_ignored" => false; slot != ip) {
            viol.entry(ic).or_insert((slot, ip));
        }
    }
    if !viol.is_empty() {
        let mut ex: Vec<(Term, Term, Term)> = viol.iter().map(|(&c, &(a, b))| (terms[c as usize], terms[a as usize], terms[b as usize])).collect();
        ex.sort_by_key(|e| (e.0.bits(), e.1.bits(), e.2.bits()));
        return Shape::TwoParents(viol.len(), ex);
    }
    let n = terms.len();
    let mut state = vec![0u8; n];
    let mut cycles = 0;
    let mut first: Vec<Term> = Vec::new();
    for s in 0..n {
        let mut path = Vec::new();
        let mut x = s as u32;
        while x != NONE && state[x as usize] == 0 {
            state[x as usize] = 1;
            path.push(x);
            x = parent[x as usize];
        }
        if x != NONE && state[x as usize] == 1 {
            cycles += 1;
            if first.is_empty() {
                let at = path.iter().position(|&p| p == x).unwrap();
                first = path[at..].iter().map(|&p| terms[p as usize]).collect();
            }
        }
        for p in path {
            state[p as usize] = 2;
        }
    }
    if cycles > 0 {
        return Shape::Cycle(cycles, first);
    }
    // children by counting, then one pre-order walk over the roots
    let mut start = vec![0u32; n + 1];
    for &p in &parent {
        if p != NONE {
            start[p as usize + 1] += 1;
        }
    }
    for i in 0..n {
        start[i + 1] += start[i];
    }
    let mut fill = start.clone();
    let mut kids = vec![0u32; start[n] as usize];
    for (c, &p) in parent.iter().enumerate() {
        if p != NONE {
            kids[fill[p as usize] as usize] = c as u32;
            fill[p as usize] += 1;
        }
    }
    let (mut tin, mut tout, mut depth) = (vec![0u32; n], vec![0u32; n], vec![0u32; n]);
    let (mut clock, mut roots, mut maxd, mut closure) = (0u32, 0, 0u32, 0usize);
    let mut stack: Vec<(u32, u32)> = Vec::new();
    for root in 0..n as u32 {
        if parent[root as usize] != NONE {
            continue;
        }
        roots += 1;
        stack.push((root, start[root as usize]));
        tin[root as usize] = clock;
        clock += 1;
        while let Some(&mut (x, ref mut next)) = stack.last_mut() {
            if *next < start[x as usize + 1] {
                let c = kids[*next as usize];
                *next += 1;
                depth[c as usize] = depth[x as usize] + 1;
                maxd = maxd.max(depth[c as usize]);
                closure += depth[c as usize] as usize;
                tin[c as usize] = clock;
                clock += 1;
                stack.push((c, start[c as usize]));
            } else {
                tout[x as usize] = clock;
                stack.pop();
            }
        }
    }
    Shape::Forest(Forest { node, tin, tout, roots, edges: parent.iter().filter(|&&p| p != NONE).count(), depth: maxd, closure })
}

struct TreeFd {
    rel: usize,
    parent: usize,
    child: usize,
}

/// Nodes of one column that are in the other too: a tree has them (every inner node), a relation between two kinds does not.
fn shared_nodes(r: &Rel) -> bool {
    let a: FxSet<Term> = r.rows.iter().map(|x| x[0]).collect();
    let shared = r.rows.iter().map(|x| x[1]).filter(|t| a.contains(t)).collect::<FxSet<Term>>().len();
    shared > 0 && shared * 4 >= r.dc[0].min(r.dc[1])
}

fn trees(rels: &[Rel], h: &Heap, declared: &BTreeMap<String, Option<String>>, found: &mut Vec<Proposal>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> Vec<TreeFd> {
    let mut fds = Vec::new();
    let mut by_len: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for (i, r) in rels.iter().enumerate() {
        if r.arity == 2 {
            by_len.entry(r.rows.len()).or_default().push(i);
        }
    }
    let mut closed: BTreeSet<usize> = BTreeSet::new();
    let mut pending: Vec<(usize, String)> = Vec::new();
    for (ti, t) in rels.iter().enumerate() {
        if t.arity != 2 || !shared_nodes(t) {
            continue;
        }
        let (a, b) = (shape(&t.rows, 0, 1), shape(&t.rows, 1, 0));
        let pick = match (&a, &b) {
            (Shape::Forest(_), _) => Some((0, 1, true)),
            (_, Shape::Forest(_)) => Some((1, 0, false)),
            _ => None,
        };
        let Some((pc, cc, first)) = pick else {
            let score = |s: &Shape| match s {
                Shape::TwoParents(n, _) => (*n, 0),
                Shape::Cycle(n, _) => (*n, 1),
                Shape::Forest(_) => (0, 0),
            };
            let (s, pc, cc) = if score(&a).0 <= score(&b).0 { (&a, 0, 1) } else { (&b, 1, 0) };
            let decl = format!("tree {}({}).", t.name, if pc == 0 { "P, C" } else { "C, P" });
            match s {
                Shape::TwoParents(n, ex) if *n <= tol(t.rows.len()) => {
                    let (c, p1, p2) = ex[0];
                    let mut line = format!("{decl} {} child{} with two parents: {} has parents {} and {}", n, if *n == 1 { "" } else { "ren" }, h.canon(c), h.canon(p1), h.canon(p2));
                    if *n > 1 {
                        line.push_str(&format!(" (+{} more)", n - 1));
                    }
                    pending.push((ti, line));
                }
                Shape::Cycle(n, nodes) if *n <= 3 => {
                    let ns: Vec<String> = nodes.iter().map(|x| h.canon(*x)).collect();
                    pending.push((ti, format!("{decl} {} cycle{}, the first through {}", n, if *n == 1 { "" } else { "s" }, clip(ns.join(", ")))));
                }
                _ => {}
            }
            let _ = cc;
            continue;
        };
        let both = matches!((&a, &b), (Shape::Forest(_), Shape::Forest(_)));
        let f = match if first { a } else { b } {
            Shape::Forest(f) => f,
            _ => unreachable!(),
        };
        fds.push(TreeFd { rel: ti, parent: pc, child: cc });
        let cols = if pc == 0 { "P, C" } else { "C, P" };
        let mut notes = vec![format!(
            "{}: {} edges over {} nodes, {} roots, depth {}; one parent per child, no cycle (implies a function from child to parent)",
            t.label(), f.edges, f.node.len(), f.roots, f.depth
        )];
        if both {
            notes.push("a forest the other way round too (each node has at most one child as well): the orientation is the author's".into());
        }
        if let Some(c) = declared.get(&t.name) {
            let decl = match c {
                Some(c) => format!("tree {}(P, C) closure {c}.", t.name),
                None => format!("tree {}(P, C).", t.name),
            };
            found.push(Proposal { kind: "tree", decl, notes, saved: None });
            continue;
        }
        // a relation that is exactly the strict closure of this forest
        let mut found: Option<(usize, usize)> = None;
        for &ci in by_len.get(&f.closure).into_iter().flatten() {
            if ci == ti || closed.contains(&ci) {
                continue;
            }
            for (ac, dc) in [(0, 1), (1, 0)] {
                if rels[ci].rows.iter().all(|r| f.above(r[ac], r[dc])) {
                    found = Some((ci, ac));
                    break;
                }
            }
            if found.is_some() {
                break;
            }
        }
        match found {
            Some((ci, ac)) => {
                closed.insert(ci);
                let c = &rels[ci];
                let mut note = format!("{}: {} = the closure of {}", c.label(), rows_word(c.rows.len()), t.label());
                if ac == 1 {
                    note.push_str(" (its columns are descendant, ancestor)");
                }
                notes.push(note);
                notes.push(format!("saves {} ({} derivations)", rows_word(c.rows.len()), c.firings));
                out.push(Proposal { kind: "tree", decl: format!("tree {}({cols}) closure {}.", t.name, c.name), notes, saved: Some((ci, c.rows.len(), c.firings)) });
            }
            None => {
                notes.push("no relation equals its closure: the promise only, no rows saved".into());
                out.push(Proposal { kind: "tree", decl: format!("tree {}({cols}).", t.name), notes, saved: None });
            }
        }
    }
    // a closed relation whose reduction is a forest: a closure with no edge relation (one with an edge relation was matched above)
    let mut closure_like: BTreeSet<usize> = BTreeSet::new();
    for (ci, c) in rels.iter().enumerate() {
        if c.arity != 2 || closed.contains(&ci) || fds.iter().any(|f| f.rel == ci) || !shared_nodes(c) {
            continue;
        }
        for (ac, dc) in [(0, 1), (1, 0)] {
            if let Some(edges) = reduction(&c.rows, ac, dc) {
                closure_like.insert(ci);
                out.push(Proposal {
                    kind: "tree",
                    decl: format!("tree _(P, C) closure {}.", c.name),
                    notes: vec![
                        format!("{}: {} is a transitive closure of a forest of {} edges that no relation holds", c.label(), rows_word(c.rows.len()), edges),
                        format!("saves {} less the {} edges to state ({} derivations)", rows_word(c.rows.len().saturating_sub(edges)), edges, c.firings),
                    ],
                    saved: Some((ci, c.rows.len().saturating_sub(edges), c.firings)),
                });
                break;
            }
        }
    }
    // a closure is no near miss of a tree
    near.extend(pending.into_iter().filter(|(i, _)| !closed.contains(i) && !closure_like.contains(i)).map(|(_, m)| m));
    fds
}

/// The number of edges of the forest whose strict closure these rows are, or None.
fn reduction(rows: &[&[Term]], ac: usize, dc: usize) -> Option<usize> {
    let mut anc: FxMap<Term, Vec<Term>> = FxMap::default();
    let mut set: FxSet<(Term, Term)> = FxSet::default();
    for r in rows {
        if r[ac] == r[dc] {
            return None;
        }
        anc.entry(r[dc]).or_default().push(r[ac]);
        set.insert((r[ac], r[dc]));
    }
    let cnt = |x: &Term| anc.get(x).map_or(0, |v| v.len());
    let mut edges = 0;
    for (d, v) in &anc {
        let p = v.iter().max_by_key(|x| (cnt(x), x.bits())).unwrap();
        if v.len() != cnt(p) + 1 {
            return None;
        }
        if let Some(pa) = anc.get(p) {
            if !pa.iter().all(|x| set.contains(&(*x, *d))) {
                return None;
            }
        }
        edges += 1;
    }
    Some(edges)
}

// --------------------------------------------------------------------- alias

fn perms(m: usize, n: usize, ok: &dyn Fn(usize, usize) -> bool) -> Vec<Vec<usize>> {
    fn go(j: usize, m: usize, n: usize, ok: &dyn Fn(usize, usize) -> bool, cur: &mut Vec<usize>, out: &mut Vec<Vec<usize>>) {
        if j == m {
            out.push(cur.clone());
            return;
        }
        for i in 0..n {
            if !cur.contains(&i) && ok(j, i) {
                cur.push(i);
                go(j + 1, m, n, ok, cur, out);
                cur.pop();
            }
        }
    }
    let mut out = Vec::new();
    go(0, m, n, ok, &mut Vec::new(), &mut out);
    out
}

/// Rows of `a` whose image under `to` is no fact of `b`, up to `limit` (one more is enough to refuse).
fn missing<'a>(store: &Store, a: &Rel<'a>, b: &Rel, to: &dyn Fn(&[Term], &mut Vec<Term>), limit: usize) -> Vec<&'a [Term]> {
    let mut buf = Vec::new();
    let mut out = Vec::new();
    for row in &a.rows {
        buf.clear();
        to(row, &mut buf);
        if store.get(b.rel, b.persp, &buf).is_none() {
            out.push(*row);
            if out.len() > limit {
                break;
            }
        }
    }
    out
}

fn invert(s: &[usize]) -> Vec<usize> {
    let mut inv = vec![0; s.len()];
    for (c, &k) in s.iter().enumerate() {
        inv[k] = c;
    }
    inv
}

fn aliases(rels: &[Rel], store: &Store, h: &Heap, closures: &BTreeSet<usize>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> BTreeSet<usize> {
    let mut misses: Vec<(usize, String)> = Vec::new();
    let alias_ok = |r: &Rel| r.arity >= 1 && r.arity <= MAX_ALIAS;
    // same arity: one verdict per unordered pair, either way round; sigma takes i's columns to j's
    let mut equal: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
    for i in 0..rels.len() {
        for j in i + 1..rels.len() {
            let (a, b) = (&rels[i], &rels[j]);
            if !alias_ok(a) || a.arity != b.arity {
                continue;
            }
            let t = tol(a.rows.len().max(b.rows.len()));
            if a.rows.len().abs_diff(b.rows.len()) > t {
                continue;
            }
            let ok = |c: usize, k: usize| a.dc[c].abs_diff(b.dc[k]) <= t;
            let mut best: Option<(usize, Vec<usize>, Vec<&[Term]>, Vec<&[Term]>)> = None;
            for s in perms(a.arity, a.arity, &ok) {
                let a_to_b = |row: &[Term], buf: &mut Vec<Term>| {
                    buf.resize(row.len(), row[0]);
                    for (c, &k) in s.iter().enumerate() {
                        buf[k] = row[c];
                    }
                };
                let b_to_a = |row: &[Term], buf: &mut Vec<Term>| buf.extend(s.iter().map(|&k| row[k]));
                let a_lacked = missing(store, a, b, &a_to_b, t);
                if a_lacked.len() > t {
                    continue;
                }
                let b_lacked = missing(store, b, a, &b_to_a, t);
                let (na, nb) = (a_lacked.len(), b_lacked.len());
                let exact = brk!("structures_alias_subset_accepted" => na == 0 || nb == 0; na == 0 && nb == 0);
                if exact {
                    equal.insert((i, j), s.clone());
                    best = None;
                    break;
                }
                if na + nb <= t && best.as_ref().map_or(true, |x| na + nb < x.0) {
                    best = Some((na + nb, s.clone(), a_lacked, b_lacked));
                }
            }
            if let Some((_, s, a_lacked, b_lacked)) = best {
                // the copy is the relation with fewer rows, else the later name
                let a_copy = (a.rows.len(), &a.name) < (b.rows.len(), &b.name);
                let a_txt: Vec<String> = a_lacked.iter().map(|r| a.row_text(h, r)).collect();
                let b_txt: Vec<String> = b_lacked.iter().map(|r| b.row_text(h, r)).collect();
                let (cp, src, sigma, lacks, extra) = if a_copy { (a, b, s, b_txt, a_txt) } else { (b, a, invert(&s), a_txt, b_txt) };
                let src_idx = if a_copy { j } else { i };
                let what = match (lacks.len(), extra.len()) {
                    (m, 0) => format!("{} lacks {} of {}", cp.label(), rows_word(m), src.label()),
                    (0, e) => format!("{} has {} {} lacks", cp.label(), rows_word(e), src.label()),
                    (m, e) => format!("{} lacks {} of {} and has {} it lacks", cp.label(), m, src.label(), e),
                };
                let mut ex: Vec<String> = lacks.into_iter().chain(extra).collect();
                ex.sort();
                let more = if ex.len() > 2 { format!(" (+{} more)", ex.len() - 2) } else { String::new() };
                ex.truncate(2);
                misses.push((src_idx, format!("alias {}: {}: {}{}", alias_text(cp, src, &sigma), what, clip(ex.join("; ")), more)));
            }
        }
    }
    // classes of equal relations: a representative (a closure, then the one asserted, then the first name), the rest aliases of it
    let mut class: Vec<usize> = (0..rels.len()).collect();
    fn find(c: &mut Vec<usize>, x: usize) -> usize {
        if c[x] != x {
            let r = find(c, c[x]);
            c[x] = r;
        }
        c[x]
    }
    for &(i, j) in equal.keys() {
        let (ri, rj) = (find(&mut class, i), find(&mut class, j));
        class[ri.max(rj)] = ri.min(rj);
    }
    let mut members: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for i in 0..rels.len() {
        let root = find(&mut class, i);
        members.entry(root).or_default().push(i);
    }
    let mut aliased: BTreeSet<usize> = BTreeSet::new();
    for ms in members.values().filter(|m| m.len() > 1) {
        let rep = *ms.iter().min_by_key(|&&i| (!closures.contains(&i), std::cmp::Reverse(rels[i].base), rels[i].name.clone())).unwrap();
        for &b in ms.iter().filter(|&&b| b != rep) {
            aliased.insert(b);
            // sigma takes b's columns to rep's (the pair is stored from the smaller index)
            let sigma = if b < rep { equal[&(b, rep)].clone() } else { invert(&equal[&(rep, b)]) };
            emit_alias(&rels[b], &rels[rep], b, &sigma, ms.len() > 2, out);
        }
    }
    // a projection: B is the distinct columns of a larger A; the smallest such A for each B not already an alias
    for (bi, b) in rels.iter().enumerate() {
        if !alias_ok(b) || aliased.contains(&bi) || closures.contains(&bi) {
            continue;
        }
        let mut best: Option<(usize, Vec<usize>)> = None;
        for (ai, a) in rels.iter().enumerate() {
            if !alias_ok(a) || a.arity <= b.arity || a.rows.len() < b.rows.len() {
                continue;
            }
            if aliased.contains(&ai) || best.as_ref().map_or(false, |(x, _)| (rels[*x].arity, rels[*x].rows.len(), &rels[*x].name) <= (a.arity, a.rows.len(), &a.name)) {
                continue;
            }
            let ok = |c: usize, k: usize| b.dc[c] == a.dc[k];
            for s in perms(b.arity, a.arity, &ok) {
                let a_to_b = |row: &[Term], buf: &mut Vec<Term>| buf.extend(s.iter().map(|&k| row[k]));
                if !missing(store, a, b, &a_to_b, 0).is_empty() {
                    continue;
                }
                let mut hit: FxSet<FactId> = FxSet::default();
                let mut buf = Vec::new();
                for row in &a.rows {
                    buf.clear();
                    a_to_b(row, &mut buf);
                    hit.extend(store.get(b.rel, b.persp, &buf));
                }
                if hit.len() == b.rows.len() {
                    best = Some((ai, s));
                    break;
                }
            }
        }
        if let Some((ai, s)) = best {
            emit_alias(b, &rels[ai], bi, &s, false, out);
        }
    }
    // a miss against a copy is the same miss against its source
    near.extend(misses.into_iter().filter(|(src, _)| !aliased.contains(src)).map(|(_, m)| m));
    aliased
}

fn alias_text(b: &Rel, a: &Rel, sigma: &[usize]) -> String {
    let mut args = vec!["_".to_string(); a.arity];
    for (c, &k) in sigma.iter().enumerate() {
        args[k] = var(c).to_string();
    }
    let head: Vec<String> = (0..b.arity).map(|c| var(c).to_string()).collect();
    format!("{}({}) is {}({})", b.name, head.join(", "), a.name, args.join(", "))
}

fn emit_alias(b: &Rel, a: &Rel, bi: usize, sigma: &[usize], many: bool, out: &mut Vec<Proposal>) {
    let proj = b.arity < a.arity;
    let mut notes = vec![format!(
        "{}: {} ({} asserted) {} {}: {}",
        b.label(), rows_word(b.rows.len()), b.base, if proj { "is the distinct projection of" } else { "equals, arguments permuted," }, a.label(), rows_word(a.rows.len())
    )];
    if many {
        notes.push("several relations are equal: which one is the alias is the author's (the representative is a closure, else the asserted one, else the first name)".into());
    }
    if proj {
        notes.push("the price is a distinct index on the kept columns, unless they are a key of the source".into());
    }
    notes.push(format!("saves {} ({} derivations)", rows_word(b.rows.len()), b.firings));
    out.push(Proposal { kind: "alias", decl: format!("alias {}.", alias_text(b, a, sigma)), notes, saved: Some((bi, b.rows.len(), b.firings)) });
}
