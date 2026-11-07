//! THE DETECTION REPORT (docs/data-structures.md, "Detection", order step 0).
//!
//! Reads an evaluated store and PROPOSES declarations; it declares nothing and
//! changes nothing. Only the author knows whether every future fact of a
//! relation keeps a promise, so each proposal is a line the author may paste,
//! with what it measured. Eight structures:
//!
//! - `function`: for a set of key positions, every key has at most one value.
//!   Minimal key sets only (a key whose subset already determines the
//!   position adds nothing); relations of arity 2 to 5.
//! - `tree`: a binary relation that is a forest (one parent per child, no
//!   cycle), and, when another relation equals its strict transitive closure
//!   (or is a closure whose reduction is a forest), `closure`.
//! - `alias`: a relation whose rows are exactly another's with the arguments
//!   permuted or projected.
//! - `ordered`: a column that holds an integer in every row.
//! - `sequence`: an integer column that numbers the rows of each key 0 to n-1,
//!   each once; minimal keys only.
//! - `span`: two integer columns with start =< end in every row, `laminar`
//!   when no two intervals cross (ends exclusive).
//! - `equivalence`: a binary relation that holds of exactly every pair within
//!   its classes, `of` the smallest relation whose equivalence closure it is.
//! - `dag`: a binary relation with no cycle that is no forest, and `closure`
//!   when another relation equals its strict transitive closure.
//!
//! Near misses are listed beside the proposals, with the offending facts: a
//! scanner fault found is worth as much as a gain missed.
//!
//! Every judgement is exact: membership is asked of the store's own key table
//! (`Store::get`) or of a set of the terms themselves, and a hash only groups
//! candidates, never decides.
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
/// The kinds, in the order the report prints them.
const KINDS: [&str; 8] = ["function", "tree", "alias", "ordered", "sequence", "span", "equivalence", "dag"];
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
    format!("{} row{}", n, crate::engine::plural(n))
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
    // a declared alias is read as its rows and proposed as nothing; a declared function is not proposed again
    let (mut aliases_decl, mut functions_decl) = (BTreeSet::new(), BTreeSet::new());
    for id in store.all_facts() {
        let r = store.rec(id);
        let a = store.args(id);
        match (h.name(r.rel), a) {
            ("structure_decl", [t, _, k]) if k.as_atom().is_some_and(|k| h.name(k) == "tree") => {
                declared.entry(h.canon(*t)).or_default();
            }
            ("structure_decl", [t, _, k]) if k.as_atom().is_some_and(|k| h.name(k) == "alias") => {
                aliases_decl.insert(h.canon(*t));
            }
            ("structure_decl", [t, _, k]) if k.as_atom().is_some_and(|k| h.name(k) == "function") => {
                functions_decl.insert(h.canon(*t));
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

    // an alias read from its source has no row in the store: its rows are the source's, projected
    let virt: Vec<(Sym, Sym, Vec<Term>)> = store.aliases.iter().flat_map(|a| store.alias_rows(h, a).into_iter().map(|(p, row)| (a.rel, p, row))).collect();
    let mut groups: FxMap<(Sym, Sym, usize), (Vec<&[Term]>, usize, usize)> = FxMap::default();
    let mut facts = 0;
    for id in store.all_facts() {
        let r = store.rec(id);
        facts += 1;
        if h.name(r.persp).starts_with('$') || kernel.contains(h.name(r.rel)) || closures.contains(h.name(r.rel)) {
            continue;
        }
        let g = groups.entry((r.rel, r.persp, store.arity(id))).or_default();
        g.0.push(store.args(id));
        g.1 += r.base() as usize;
        g.2 += store.support_count(id);
    }
    for (rel, persp, row) in &virt {
        groups.entry((*rel, *persp, row.len())).or_default().0.push(row);
    }
    let mut keyed: Vec<((String, String, usize), (Sym, Sym), (Vec<&[Term]>, usize, usize))> = groups
        .into_iter()
        .filter(|(_, g)| g.0.len() >= o.min_rows)
        .map(|((rel, persp, n), g)| ((h.name(rel).to_string(), h.name(persp).to_string(), n), (rel, persp), g))
        .collect();
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    let rels: Vec<Rel> = keyed
        .into_iter()
        .map(|((name, book, arity), (rel, persp), (rows, base, firings))| {
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
    let equiv = equivalences(&rels, h, &closures, &mut proposals, &mut near);
    // a forest is a tree's, a closure its tree's, an equivalence has cycles
    let not_dag: BTreeSet<usize> = closures.iter().chain(&equiv).copied().chain(trees.iter().map(|t| t.rel)).collect();
    let dag_closed = dags(&rels, store, h, &not_dag, &mut proposals, &mut near);
    // a structure's relation is the representative of its copies
    let structured: BTreeSet<usize> = closures.iter().chain(&dag_closed).chain(&equiv).copied().collect();
    let mut aliased = aliases(&rels, store, h, &structured, &aliases_decl, &mut found, &mut proposals, &mut near);
    // a dag's closure is the dag's: no near miss reads it
    near.retain(|n| !dag_closed.iter().any(|&i| n.contains(&format!(" {}(", rels[i].name))));
    proposals.retain(|p| p.kind != "equivalence" || p.saved.is_none_or(|(i, _, _)| !aliased.contains(&i)));
    // a copy has its source's structures, and a closure its structure's
    let skip: BTreeSet<usize> = aliased.iter().chain(&closures).chain(&dag_closed).copied().collect();
    aliased.extend(dag_closed.iter().copied());
    aliased.extend(rels.iter().enumerate().filter(|(_, r)| functions_decl.contains(&r.name)).map(|(i, _)| i));
    functions(&rels, h, &trees, &aliased, &mut proposals, &mut near);
    let mut taken = sequences(&rels, h, &skip, &mut proposals, &mut near);
    taken.extend(spans(&rels, h, &skip, &mut proposals, &mut near));
    ordereds(&rels, h, &skip, &taken, &mut proposals, &mut near);

    let order = |k: &str| KINDS.iter().position(|x| *x == k).unwrap();
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
            "\n{} proposals ({}), {} near misses; the rows they stop storing: {} ({} derivations), about {} at the mean cost per fact\n",
            self.proposals.len(), KINDS.iter().map(|k| format!("{k} {}", count(k))).collect::<Vec<_>>().join(", "), self.near.len(),
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
    let (start, kids) = crate::forest::children(&parent);
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

/// A binary relation that is no forest in either direction: the two-parent or cycle line it is a near miss of, if any.
fn tree_miss(h: &Heap, t: &Rel, a: &Shape, b: &Shape) -> Option<String> {
    let score = |s: &Shape| match s {
        Shape::TwoParents(n, _) => (*n, 0),
        Shape::Cycle(n, _) => (*n, 1),
        Shape::Forest(_) => (0, 0),
    };
    let (s, pc) = if score(a).0 <= score(b).0 { (a, 0) } else { (b, 1) };
    let decl = format!("tree {}({}).", t.name, if pc == 0 { "P, C" } else { "C, P" });
    match s {
        Shape::TwoParents(n, ex) if *n <= tol(t.rows.len()) => {
            let (c, p1, p2) = ex[0];
            let mut line = format!("{decl} {} child{} with two parents: {} has parents {} and {}", n, if *n == 1 { "" } else { "ren" }, h.canon(c), h.canon(p1), h.canon(p2));
            if *n > 1 {
                line.push_str(&format!(" (+{} more)", n - 1));
            }
            Some(line)
        }
        Shape::Cycle(n, nodes) if *n <= 3 => {
            let ns: Vec<String> = nodes.iter().map(|x| h.canon(*x)).collect();
            Some(format!("{decl} {} cycle{}, the first through {}", n, crate::engine::plural(*n), clip(ns.join(", "))))
        }
        _ => None,
    }
}

/// A relation that is exactly the strict closure of the forest `f`, with the column that holds the ancestor.
fn closure_match(rels: &[Rel], by_len: &BTreeMap<usize, Vec<usize>>, f: &Forest, ti: usize, closed: &BTreeSet<usize>) -> Option<(usize, usize)> {
    for &ci in by_len.get(&f.closure).into_iter().flatten() {
        if ci == ti || closed.contains(&ci) {
            continue;
        }
        for (ac, dc) in [(0, 1), (1, 0)] {
            if rels[ci].rows.iter().all(|r| f.above(r[ac], r[dc])) {
                return Some((ci, ac));
            }
        }
    }
    None
}

/// A closure with no edge relation whose reduction is a forest: the closure's proposal, and the relations that proposal takes.
fn closure_like_trees(rels: &[Rel], closed: &BTreeSet<usize>, fds: &[TreeFd], out: &mut Vec<Proposal>) -> BTreeSet<usize> {
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
    closure_like
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
            if let Some(line) = tree_miss(h, t, &a, &b) {
                pending.push((ti, line));
            }
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
        match closure_match(rels, &by_len, &f, ti, &closed) {
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
    let closure_like = closure_like_trees(rels, &closed, &fds, out);
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

#[allow(clippy::too_many_arguments)]
fn alias_ok(r: &Rel, declared: &BTreeSet<String>) -> bool {
    r.arity >= 1 && r.arity <= MAX_ALIAS && !declared.contains(&r.name)
}

fn declared_aliases(rels: &[Rel], declared: &BTreeSet<String>, found: &mut Vec<Proposal>) {
    let mut seen = BTreeSet::new();
    for r in rels.iter().filter(|r| declared.contains(&r.name)) {
        if seen.insert(&r.name) {
            found.push(Proposal { kind: "alias", decl: format!("alias {}.", r.name), notes: vec![format!("{}: {}", r.label(), rows_word(r.rows.len()))], saved: None });
        }
    }
}

/// Two relations of one arity: equal (with the column order that takes b onto a), near (with the rows each lacks), or apart.
enum Pair<'a> {
    Equal(Vec<usize>),
    Near(Vec<usize>, Vec<&'a [Term]>, Vec<&'a [Term]>),
    Apart,
}

fn pair_verdict<'a>(store: &Store, a: &Rel<'a>, b: &Rel<'a>, t: usize) -> Pair<'a> {
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
            return Pair::Equal(s.clone());
        }
        if na + nb <= t && best.as_ref().is_none_or(|x| na + nb < x.0) {
            best = Some((na + nb, s.clone(), a_lacked, b_lacked));
        }
    }
    match best {
        Some((_, s, a_lacked, b_lacked)) => Pair::Near(s, a_lacked, b_lacked),
        None => Pair::Apart,
    }
}

/// The miss a near pair is: the copy's name, the rows each side lacks of the other, and the index of the relation it is a copy of.
fn miss_of(h: &Heap, (i, j): (usize, usize), (a, b): (&Rel, &Rel), s: Vec<usize>, (a_lacked, b_lacked): (Vec<&[Term]>, Vec<&[Term]>)) -> (usize, String) {
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
    (src_idx, format!("alias {}: {}: {}{}", alias_text(cp, src, &sigma), what, clip(ex.join("; ")), more))
}

/// Every pair of relations of one arity that are equal (`equal`, keyed by the pair) or near (their misses pushed to `misses`).
fn equal_relations(rels: &[Rel], store: &Store, h: &Heap, declared: &BTreeSet<String>, misses: &mut Vec<(usize, String)>) -> BTreeMap<(usize, usize), Vec<usize>> {
    let mut equal: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
    for i in 0..rels.len() {
        for j in i + 1..rels.len() {
            let (a, b) = (&rels[i], &rels[j]);
            if !alias_ok(a, declared) || a.arity != b.arity {
                continue;
            }
            let t = tol(a.rows.len().max(b.rows.len()));
            if a.rows.len().abs_diff(b.rows.len()) > t {
                continue;
            }
            match pair_verdict(store, a, b, t) {
                Pair::Equal(s) => {
                    equal.insert((i, j), s);
                }
                Pair::Near(s, a_lacked, b_lacked) => misses.push(miss_of(h, (i, j), (a, b), s, (a_lacked, b_lacked))),
                Pair::Apart => {}
            }
        }
    }
    equal
}

fn class_root(c: &mut Vec<usize>, x: usize) -> usize {
    if c[x] != x {
        let r = class_root(c, c[x]);
        c[x] = r;
    }
    c[x]
}

/// Relations grouped by equality: each group is one class, keyed by its root.
fn class_members(n: usize, equal: &BTreeMap<(usize, usize), Vec<usize>>) -> BTreeMap<usize, Vec<usize>> {
    let mut class: Vec<usize> = (0..n).collect();
    for &(i, j) in equal.keys() {
        let (ri, rj) = (class_root(&mut class, i), class_root(&mut class, j));
        class[ri.max(rj)] = ri.min(rj);
    }
    let mut members: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for i in 0..n {
        let root = class_root(&mut class, i);
        members.entry(root).or_default().push(i);
    }
    members
}

/// Each class of equal relations has a representative (a closure, then the one asserted, then the first name); the rest are aliases of it.
fn class_aliases(rels: &[Rel], closures: &BTreeSet<usize>, equal: &BTreeMap<(usize, usize), Vec<usize>>, out: &mut Vec<Proposal>) -> BTreeSet<usize> {
    let mut aliased: BTreeSet<usize> = BTreeSet::new();
    for ms in class_members(rels.len(), equal).values().filter(|m| m.len() > 1) {
        let rep = *ms.iter().min_by_key(|&&i| (!closures.contains(&i), std::cmp::Reverse(rels[i].base), rels[i].name.clone())).unwrap();
        for &b in ms.iter().filter(|&&b| b != rep) {
            aliased.insert(b);
            // sigma takes b's columns to rep's (the pair is stored from the smaller index)
            let sigma = if b < rep { equal[&(b, rep)].clone() } else { invert(&equal[&(rep, b)]) };
            emit_alias(&rels[b], &rels[rep], b, &sigma, ms.len() > 2, out);
        }
    }
    aliased
}

/// The smallest larger relation of which `b` is the distinct columns, with the column order, if every row of `b` is one of its rows.
fn projection_source(rels: &[Rel], store: &Store, b: &Rel, aliased: &BTreeSet<usize>, declared: &BTreeSet<String>) -> Option<(usize, Vec<usize>)> {
    let mut best: Option<(usize, Vec<usize>)> = None;
    for (ai, a) in rels.iter().enumerate() {
        if !alias_ok(a, declared) || a.arity <= b.arity || a.rows.len() < b.rows.len() {
            continue;
        }
        if aliased.contains(&ai) || best.as_ref().is_some_and(|(x, _)| (rels[*x].arity, rels[*x].rows.len(), &rels[*x].name) <= (a.arity, a.rows.len(), &a.name)) {
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
    best
}

fn aliases(rels: &[Rel], store: &Store, h: &Heap, closures: &BTreeSet<usize>, declared: &BTreeSet<String>, found: &mut Vec<Proposal>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> BTreeSet<usize> {
    declared_aliases(rels, declared, found);
    let mut misses: Vec<(usize, String)> = Vec::new();
    let equal = equal_relations(rels, store, h, declared, &mut misses);
    let aliased = class_aliases(rels, closures, &equal, out);
    // a projection: B is the distinct columns of a larger A; the smallest such A for each B not already an alias
    for (bi, b) in rels.iter().enumerate() {
        if !alias_ok(b, declared) || aliased.contains(&bi) || closures.contains(&bi) {
            continue;
        }
        if let Some((ai, s)) = projection_source(rels, store, b, &aliased, declared) {
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

// ------------------------------------------------- ordered, sequence and span

/// The values of column `c`, if every row holds an integer there.
fn int_col(r: &Rel, c: usize) -> Option<Vec<i64>> {
    r.rows.iter().map(|row| row[c].as_int()).collect()
}

/// The columns of `r` with their roles: a role word before the marked ones, a plain variable for the rest.
fn roles(n: usize, role: &dyn Fn(usize) -> Option<&'static str>) -> String {
    (0..n).map(|i| match role(i) { Some(w) => format!("{w} {}", var(i)), None => var(i).to_string() }).collect::<Vec<_>>().join(", ")
}

fn key_text(h: &Heap, key: &[Term]) -> String {
    if key.is_empty() { "the relation".into() } else { format!("key ({})", key.iter().map(|t| h.canon(*t)).collect::<Vec<_>>().join(", ")) }
}

fn int_list(v: &[i64]) -> String {
    let s: Vec<String> = v.iter().take(6).map(|x| x.to_string()).collect();
    if v.len() > 6 { format!("{}, ...", s.join(", ")) } else { s.join(", ") }
}

/// The groups of `rows` by the columns of `mask`: how many, the longest, and those not numbered 0 to n-1 by column `at`,
/// each with its key and its numbers (up to `keep` of them). Sorts row indices, so it holds four bytes a row.
#[allow(clippy::type_complexity)]
fn numbered(rows: &[&[Term]], mask: u32, at: usize, n: usize, keep: usize) -> (usize, usize, usize, Vec<(Vec<Term>, Vec<i64>)>) {
    let pos: Vec<usize> = (0..n).filter(|i| mask >> i & 1 == 1).collect();
    let key = |i: u32| pos.iter().map(move |&p| rows[i as usize][p].bits());
    let num = |i: u32| rows[i as usize][at].as_int().unwrap();
    let mut idx: Vec<u32> = (0..rows.len() as u32).collect();
    idx.sort_unstable_by(|&a, &b| key(a).cmp(key(b)).then(num(a).cmp(&num(b))));
    let (mut groups, mut longest, mut bad, mut ex) = (0, 0, 0, Vec::new());
    for g in idx.chunk_by(|&a, &b| key(a).eq(key(b))) {
        groups += 1;
        longest = longest.max(g.len());
        let v: Vec<i64> = g.iter().map(|&i| num(i)).collect();
        if !dense(&v) {
            bad += 1;
            if ex.len() < keep {
                ex.push((pos.iter().map(|&p| rows[g[0] as usize][p]).collect(), v));
            }
        }
    }
    (groups, longest, bad, ex)
}

fn subset(k: u32, mask: u32) -> bool {
    k & mask == k
}

/// Numbered 0, 1, 2, ... each once.
fn dense(v: &[i64]) -> bool {
    brk!("structures_sequence_gap_ignored" => v.first() == Some(&0) && v.windows(2).all(|w| w[0] < w[1]); v.iter().enumerate().all(|(j, &x)| x == j as i64))
}

/// `sequence r(K..., at I, to V...)`: for each key the index I runs 0 to n-1, each once; the minimal keys only.
fn sequences(rels: &[Rel], h: &Heap, skip: &BTreeSet<usize>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> BTreeSet<(usize, usize)> {
    let mut taken = BTreeSet::new();
    for (ri, r) in rels.iter().enumerate() {
        let n = r.arity;
        if !(2..=MAX_FD).contains(&n) || skip.contains(&ri) {
            continue;
        }
        for at in 0..n {
            let Some(v) = int_col(r, at) else { continue };
            if v.iter().any(|&x| x < 0) || v.iter().max().is_none_or(|&m| m < 1 || m as usize >= v.len()) {
                continue;
            }
            let others = ((1u32 << n) - 1) & !(1 << at);
            let mut masks: Vec<u32> = (0..=others).filter(|m| m & others == *m).collect();
            masks.sort_by_key(|m| (m.count_ones(), *m));
            let mut valid: Vec<u32> = Vec::new();
            let mut best_miss: Option<(usize, usize, u32, Vec<(Vec<Term>, Vec<i64>)>)> = None;
            for &mask in &masks {
                if valid.iter().any(|&k| subset(k, mask)) {
                    continue;
                }
                let (groups, longest, nbad, bad) = numbered(&r.rows, mask, at, n, 2);
                if nbad == 0 {
                    valid.push(mask);
                    taken.insert((ri, at));
                    let role = |i: usize| if i == at { Some("at") } else if mask >> i & 1 == 1 { None } else { Some("to") };
                    let keys = if mask == 0 { "one sequence".to_string() } else { format!("{groups} keys") };
                    out.push(Proposal {
                        kind: "sequence",
                        decl: format!("sequence {}({}).", r.name, roles(n, &role)),
                        notes: vec![
                            format!("{}: {}, {keys}, each numbered 0, 1, 2, ... by {}, the longest {}", r.label(), rows_word(r.rows.len()), var(at), longest),
                            "saves no rows; first, last, next and previous by key are lookups".into(),
                        ],
                        saved: None,
                    });
                } else if (mask | 1 << at).count_ones() as usize == n - 1 && groups >= 3 && nbad <= tol(groups) && best_miss.as_ref().is_none_or(|b| nbad < b.0) {
                    best_miss = Some((nbad, groups, mask, bad));
                }
            }
            if let (true, Some((nb, ng, mask, bad))) = (valid.is_empty(), best_miss) {
                let role = |i: usize| if i == at { Some("at") } else if mask >> i & 1 == 1 { None } else { Some("to") };
                let ex: Vec<String> = bad.iter().take(2).map(|(k, v)| format!("{} has {}", key_text(h, k), int_list(v))).collect();
                let more = if nb > 2 { format!(" (+{} more)", nb - 2) } else { String::new() };
                near.push(format!("sequence {}({}): {} of {} keys not numbered 0..n-1 by {}: {}{}", r.name, roles(n, &role), nb, ng, var(at), ex.join("; "), more));
            }
        }
    }
    taken
}

/// Crossing intervals of `rows` taken from columns `s` and `e`, ends exclusive (touching intervals are apart): how many
/// intervals cross one that is open when they start, and the first such pair.
fn crossings<'a>(rows: &[&'a [Term]], s: usize, e: usize) -> (usize, Option<(&'a [Term], &'a [Term])>) {
    let iv = |r: &[Term]| (r[s].as_int().unwrap(), r[e].as_int().unwrap());
    let mut sorted: Vec<&[Term]> = rows.to_vec();
    sorted.sort_by_key(|r| {
        let (a, b) = iv(r);
        (a, std::cmp::Reverse(b))
    });
    let mut stack: Vec<&[Term]> = Vec::new();
    let (mut n, mut first) = (0, None);
    for r in sorted {
        let (a, b) = iv(r);
        while stack.last().is_some_and(|t| iv(t).1 <= a) {
            stack.pop();
        }
        if let Some(t) = stack.last() {
            if brk!("structures_span_crossing_ignored" => false; iv(t).1 < b) {
                n += 1;
                first.get_or_insert((*t, r));
                continue;
            }
        }
        stack.push(r);
    }
    (n, first)
}

/// `span r(..., from S, to E)`: two integer columns with S =< E in every row (and S < E in one); `laminar` when no two
/// intervals cross.
fn spans(rels: &[Rel], h: &Heap, skip: &BTreeSet<usize>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> BTreeSet<(usize, usize)> {
    let mut taken = BTreeSet::new();
    for (ri, r) in rels.iter().enumerate() {
        let n = r.arity;
        if !(2..=MAX_ALIAS).contains(&n) || skip.contains(&ri) {
            continue;
        }
        let cols: Vec<(usize, Vec<i64>)> = (0..n).filter_map(|c| int_col(r, c).map(|v| (c, v))).collect();
        for (s, sv) in &cols {
            for (e, ev) in &cols {
                if s == e {
                    continue;
                }
                let (s, e) = (*s, *e);
                let before = sv.iter().zip(ev).filter(|(a, b)| a < b).count();
                let back: Vec<usize> = (0..sv.len()).filter(|&i| sv[i] > ev[i]).collect();
                if before == 0 || back.len() >= before {
                    continue;
                }
                let role = |i: usize| if i == s { Some("from") } else if i == e { Some("to") } else { None };
                if !back.is_empty() {
                    if r.rows.len() >= 3 && back.len() <= tol(r.rows.len()) {
                        let ex: Vec<String> = back.iter().take(2).map(|&i| r.row_text(h, r.rows[i])).collect();
                        let more = if back.len() > 2 { format!(" (+{} more)", back.len() - 2) } else { String::new() };
                        near.push(format!("span {}({}): {} of {} ends before it starts: {}{}", r.name, roles(n, &role), back.len(), rows_word(r.rows.len()), ex.join("; "), more));
                    }
                    continue;
                }
                taken.insert((ri, s));
                taken.insert((ri, e));
                let mut notes = vec![format!("{}: {}, {} =< {} in every row", r.label(), rows_word(r.rows.len()), var(s), var(e))];
                let (cross, first) = crossings(&r.rows, s, e);
                let pair = |(a, b): (&[Term], &[Term])| format!("{} and {}", r.row_text(h, a), r.row_text(h, b));
                let laminar = cross == 0;
                if laminar {
                    notes.push("laminar: any two are nested or apart (ends exclusive, so touching intervals are apart); a nesting tree answers containment".into());
                } else {
                    // laminar within each value of another column, which the declaration cannot say yet
                    let within: Vec<String> = (0..n)
                        .filter(|&c| c != s && c != e)
                        .filter(|&c| {
                            let mut g: FxMap<Term, Vec<&[Term]>> = FxMap::default();
                            for row in &r.rows {
                                g.entry(row[c]).or_default().push(row);
                            }
                            g.values().any(|v| v.len() > 1) && g.values().all(|v| crossings(v, s, e).0 == 0)
                        })
                        .map(var)
                        .map(String::from)
                        .collect();
                    let mut line = format!("not laminar: {} crossing{}, the first {}", cross, crate::engine::plural(cross), clip(pair(first.unwrap())));
                    if !within.is_empty() {
                        line.push_str(&format!("; laminar within each {}", within.join(", each ")));
                    }
                    notes.push(line);
                    if r.rows.len() >= 3 && cross <= tol(r.rows.len()) {
                        near.push(format!("span {}({}) laminar: {} crossing{}: {}", r.name, roles(n, &role), cross, crate::engine::plural(cross), clip(pair(first.unwrap()))));
                    }
                }
                notes.push("saves no rows; containment, overlap and stabbing by an interval index".into());
                out.push(Proposal { kind: "span", decl: format!("span {}({}){}.", r.name, roles(n, &role), if laminar { " laminar" } else { "" }), notes, saved: None });
            }
        }
    }
    taken
}

/// `ordered r(..., by X)`: an integer in every row, two values at least; a column a sequence or a span takes is theirs.
fn ordereds(rels: &[Rel], h: &Heap, skip: &BTreeSet<usize>, taken: &BTreeSet<(usize, usize)>, out: &mut Vec<Proposal>, near: &mut Vec<String>) {
    for (ri, r) in rels.iter().enumerate() {
        if skip.contains(&ri) {
            continue;
        }
        for c in 0..r.arity {
            let ints: Vec<i64> = r.rows.iter().filter_map(|row| row[c].as_int()).collect();
            let distinct: BTreeSet<i64> = ints.iter().copied().collect();
            let bad = r.rows.len() - ints.len();
            let role = |i: usize| if i == c { Some("by") } else { None };
            if distinct.len() < 2 || taken.contains(&(ri, c)) {
                continue;
            }
            if brk!("structures_ordered_non_integer_ignored" => bad <= 1; bad == 0) {
                out.push(Proposal {
                    kind: "ordered",
                    decl: format!("ordered {}({}).", r.name, roles(r.arity, &role)),
                    notes: vec![
                        format!("{}: {}, {} an integer in every row, {} distinct from {} to {}", r.label(), rows_word(r.rows.len()), var(c), distinct.len(), distinct.first().unwrap(), distinct.last().unwrap()),
                        format!("saves no rows (a sorted index is added); a range of {} is a lookup, not a scan", var(c)),
                    ],
                    saved: None,
                });
            } else if r.rows.len() >= 3 && bad <= tol(r.rows.len()) {
                let ex: Vec<String> = r.rows.iter().filter(|row| row[c].as_int().is_none()).take(2).map(|row| r.row_text(h, row)).collect();
                near.push(format!("ordered {}({}): {} of {} is not an integer: {}", r.name, roles(r.arity, &role), bad, rows_word(r.rows.len()), ex.join("; ")));
            }
        }
    }
}

// ---------------------------------------------------------- equivalence, dag

/// Node ids of a binary relation, and its rows as id pairs.
fn graph(r: &Rel) -> (Vec<Term>, Vec<(u32, u32)>) {
    let mut node: FxMap<Term, u32> = FxMap::default();
    let mut terms = Vec::new();
    let mut id = |t: Term| {
        *node.entry(t).or_insert_with(|| {
            terms.push(t);
            (terms.len() - 1) as u32
        })
    };
    let edges = r.rows.iter().map(|row| (id(row[0]), id(row[1]))).collect();
    (terms, edges)
}

fn find(p: &mut [u32], mut x: u32) -> u32 {
    while p[x as usize] != x {
        p[x as usize] = p[p[x as usize] as usize];
        x = p[x as usize];
    }
    x
}

/// The classes of the union-find over `edges`, as a class index per node, and the class sizes.
fn classes(n: usize, edges: &[(u32, u32)]) -> (Vec<u32>, Vec<usize>) {
    let mut p: Vec<u32> = (0..n as u32).collect();
    for &(a, b) in edges {
        let (ra, rb) = (find(&mut p, a), find(&mut p, b));
        p[ra.max(rb) as usize] = ra.min(rb);
    }
    let mut idx: FxMap<u32, u32> = FxMap::default();
    let mut size = Vec::new();
    let cls = (0..n as u32)
        .map(|x| {
            let r = find(&mut p, x);
            let k = *idx.entry(r).or_insert_with(|| {
                size.push(0);
                (size.len() - 1) as u32
            });
            size[k as usize] += 1;
            k
        })
        .collect();
    (cls, size)
}

/// `equivalence r(A, B) of g(A, B)`: a relation that holds exactly of every pair within its classes, and the smallest
/// other relation whose equivalence closure it is.
fn equivalences(rels: &[Rel], h: &Heap, skip: &BTreeSet<usize>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> BTreeSet<usize> {
    let mut equiv = BTreeSet::new();
    for (ri, r) in rels.iter().enumerate() {
        if r.arity != 2 || skip.contains(&ri) || !shared_nodes(r) {
            continue;
        }
        let (terms, edges) = graph(r);
        let (cls, size) = classes(terms.len(), &edges);
        if size.iter().all(|&s| s == 1) {
            continue;
        }
        let pairs: usize = size.iter().map(|s| s * s).sum();
        let lack = pairs - r.rows.len();
        let diagonal = edges.iter().filter(|(a, b)| a == b).count();
        if brk!("structures_equivalence_missing_ignored" => lack > tol(pairs); lack > 0) {
            let set: FxSet<(u32, u32)> = edges.iter().copied().collect();
            let strict = diagonal == 0 && lack == terms.len();
            if !strict && lack > tol(pairs) {
                continue;
            }
            let mut members: Vec<Vec<u32>> = vec![Vec::new(); size.len()];
            for (x, &k) in cls.iter().enumerate() {
                members[k as usize].push(x as u32);
            }
            let mut ex: Vec<String> = Vec::new();
            'out: for m in members.iter().filter(|_| !strict) {
                for &a in m {
                    for &b in m {
                        if !set.contains(&(a, b)) {
                            ex.push(format!("{}({}, {})", r.name, h.canon(terms[a as usize]), h.canon(terms[b as usize])));
                            if ex.len() > 2 {
                                break 'out;
                            }
                        }
                    }
                }
            }
            let line = if strict {
                format!("equivalence {}(A, B): an equivalence but for its diagonal, the {} pairs (X, X) of its nodes", r.name, terms.len())
            } else {
                let more = if lack > 2 { format!(" (+{} more)", lack - 2) } else { String::new() };
                ex.truncate(2);
                format!("equivalence {}(A, B): lacks {} of the {} pairs of its classes: {}{}", r.name, lack, pairs, ex.join("; "), more)
            };
            near.push(line);
            continue;
        }
        equiv.insert(ri);
        let nodes = terms.len();
        let mut notes = vec![format!("{}: {} = every pair of {} classes over {} nodes, the largest {}", r.label(), rows_word(r.rows.len()), size.len(), nodes, size.iter().max().unwrap())];
        let gen = generator(rels, ri, &terms, &cls, size.len());
        if size.len() == 1 {
            notes.push("one class: it holds of every pair of its nodes, a product as much as an equivalence".into());
        }
        let decl = match gen {
            Some(gi) => {
                let g = &rels[gi];
                notes.push(format!("{}: {}, whose equivalence closure it is", g.label(), rows_word(g.rows.len())));
                notes.push(format!("saves {} ({} derivations); a representative per class answers it", rows_word(r.rows.len()), r.firings));
                format!("equivalence {}(A, B) of {}(A, B).", r.name, g.name)
            }
            None => {
                let edges = nodes - size.len() + size.iter().filter(|&&s| s == 1).count();
                notes.push(format!("no relation generates it: {} edges would (one per node but a root of each class, and the singletons)", edges));
                notes.push(format!("saves {}: {} less those edges ({} derivations)", rows_word(r.rows.len().saturating_sub(edges)), r.rows.len(), r.firings));
                format!("equivalence {}(A, B) of _(A, B).", r.name)
            }
        };
        let saved = match gen { Some(_) => r.rows.len(), None => r.rows.len().saturating_sub(nodes - size.len() + size.iter().filter(|&&s| s == 1).count()) };
        out.push(Proposal { kind: "equivalence", decl, notes, saved: Some((ri, saved, r.firings)) });
    }
    equiv
}

/// The binary relation with the fewest rows, other than `ri`, whose rows lie within the classes `cls` of `terms`, cover
/// every node, and join them into as many classes.
fn generator(rels: &[Rel], ri: usize, terms: &[Term], cls: &[u32], n_classes: usize) -> Option<usize> {
    let node: FxMap<Term, u32> = terms.iter().enumerate().map(|(i, t)| (*t, i as u32)).collect();
    let mut best: Option<usize> = None;
    for (gi, g) in rels.iter().enumerate() {
        if gi == ri || g.arity != 2 || best.is_some_and(|b| (rels[b].rows.len(), &rels[b].name) <= (g.rows.len(), &g.name)) {
            continue;
        }
        let mut edges = Vec::with_capacity(g.rows.len());
        let inside = g.rows.iter().all(|row| match (node.get(&row[0]), node.get(&row[1])) {
            (Some(&a), Some(&b)) if cls[a as usize] == cls[b as usize] => {
                edges.push((a, b));
                true
            }
            _ => false,
        });
        if !inside {
            continue;
        }
        let mut seen = vec![false; terms.len()];
        for &(a, b) in &edges {
            seen[a as usize] = true;
            seen[b as usize] = true;
        }
        if seen.iter().all(|&s| s) && classes(terms.len(), &edges).1.len() == n_classes {
            best = Some(gi);
        }
    }
    best
}

/// The strongly connected components of a graph that hold a cycle (more than one node, or a loop), each as its nodes.
fn cycles(n: usize, edges: &[(u32, u32)]) -> Vec<Vec<u32>> {
    let mut start = vec![0usize; n + 1];
    for &(a, _) in edges {
        start[a as usize + 1] += 1;
    }
    for i in 0..n {
        start[i + 1] += start[i];
    }
    let mut adj = vec![0u32; edges.len()];
    let mut fill = start.clone();
    for &(a, b) in edges {
        adj[fill[a as usize]] = b;
        fill[a as usize] += 1;
    }
    let looped: FxSet<u32> = edges.iter().filter(|(a, b)| a == b).map(|e| e.0).collect();
    // Tarjan, iteratively
    let (mut index, mut low, mut on) = (vec![u32::MAX; n], vec![0u32; n], vec![false; n]);
    let (mut stack, mut out, mut clock) = (Vec::new(), Vec::new(), 0u32);
    for root in 0..n {
        if index[root] != u32::MAX {
            continue;
        }
        let mut call: Vec<(usize, usize)> = vec![(root, start[root])];
        index[root] = clock;
        low[root] = clock;
        clock += 1;
        stack.push(root as u32);
        on[root] = true;
        while let Some(&mut (v, ref mut next)) = call.last_mut() {
            if *next < start[v + 1] {
                let w = adj[*next] as usize;
                *next += 1;
                if index[w] == u32::MAX {
                    index[w] = clock;
                    low[w] = clock;
                    clock += 1;
                    stack.push(w as u32);
                    on[w] = true;
                    call.push((w, start[w]));
                } else if on[w] {
                    low[v] = low[v].min(index[w]);
                }
            } else {
                call.pop();
                if let Some(&(u, _)) = call.last() {
                    low[u] = low[u].min(low[v]);
                }
                if low[v] == index[v] {
                    let mut comp = Vec::new();
                    loop {
                        let x = stack.pop().unwrap();
                        on[x as usize] = false;
                        comp.push(x);
                        if x as usize == v {
                            break;
                        }
                    }
                    if brk!("structures_dag_cycle_ignored" => false; comp.len() > 1 || looped.contains(&(v as u32))) {
                        out.push(comp);
                    }
                }
            }
        }
    }
    out
}

/// Whether `c`, read with the ancestor at `ac`, is exactly the strict transitive closure of the acyclic edges `g`: it
/// holds g, it is closed under one more g step, and each of its rows is a g row or one g step past another of its rows.
fn dag_closure(store: &Store, g: &[(Term, Term)], c: &Rel, ac: usize) -> bool {
    let dc = 1 - ac;
    let mut buf = [g.first().map_or(Term::int(0), |e| e.0); 2];
    // the edges first, asked of the store's own key table, so that a relation that is no closure costs no set
    if !g.iter().all(|&(a, b)| {
        (buf[ac], buf[dc]) = (a, b);
        store.get(c.rel, c.persp, &buf).is_some()
    }) {
        return false;
    }
    let set: FxSet<(Term, Term)> = c.rows.iter().map(|r| (r[ac], r[dc])).collect();
    let (mut succ, mut pred): (FxMap<Term, Vec<Term>>, FxMap<Term, Vec<Term>>) = (FxMap::default(), FxMap::default());
    let gset: FxSet<(Term, Term)> = g.iter().copied().collect();
    for &(a, b) in g {
        succ.entry(a).or_default().push(b);
        pred.entry(b).or_default().push(a);
    }
    set.iter().all(|&(a, x)| succ.get(&x).is_none_or(|v| v.iter().all(|&b| set.contains(&(a, b)))))
        && set.iter().all(|&(a, b)| gset.contains(&(a, b)) || pred.get(&b).is_some_and(|v| v.iter().any(|&x| set.contains(&(a, x)))))
}

/// The transitive reduction of the acyclic `c` (the rows no two others compose to), if `c` is its closure.
fn dag_reduction(store: &Store, c: &Rel) -> Option<Vec<(Term, Term)>> {
    let set: FxSet<(Term, Term)> = c.rows.iter().map(|r| (r[0], r[1])).collect();
    let mut pred: FxMap<Term, Vec<Term>> = FxMap::default();
    for r in &c.rows {
        pred.entry(r[1]).or_default().push(r[0]);
    }
    let red: Vec<(Term, Term)> = c.rows.iter().map(|r| (r[0], r[1])).filter(|&(a, b)| !pred[&b].iter().any(|&x| set.contains(&(a, x)))).collect();
    (red.len() < c.rows.len() && dag_closure(store, &red, c, 0)).then_some(red)
}

/// `dag r(A, B)`: a binary relation with no cycle that is no forest, and `closure` when another relation is exactly its
/// strict transitive closure.
fn dags(rels: &[Rel], store: &Store, h: &Heap, skip: &BTreeSet<usize>, out: &mut Vec<Proposal>, near: &mut Vec<String>) -> BTreeSet<usize> {
    let mut acyclic: Vec<usize> = Vec::new();
    for (ri, r) in rels.iter().enumerate() {
        if r.arity != 2 || skip.contains(&ri) || !shared_nodes(r) {
            continue;
        }
        let (terms, edges) = graph(r);
        let cyc = cycles(terms.len(), &edges);
        if cyc.is_empty() {
            acyclic.push(ri);
        } else if cyc.len() <= 3 {
            let mut first: Vec<String> = cyc[0].iter().map(|&x| h.canon(terms[x as usize])).collect();
            first.sort();
            near.push(format!("dag {}(A, B): {} cycle{}, the first through the {} node{} {}", r.name, cyc.len(), crate::engine::plural(cyc.len()), first.len(), crate::engine::plural(first.len()), clip(first.join(", "))));
        }
    }
    acyclic.sort_by_key(|&i| (rels[i].rows.len(), i));
    let mut closed: BTreeSet<usize> = BTreeSet::new();
    let mut found: Vec<(usize, Option<(usize, usize)>)> = Vec::new();
    for &gi in &acyclic {
        if closed.contains(&gi) {
            continue;
        }
        let g = &rels[gi];
        let c = rels.iter().enumerate().filter(|(ci, c)| *ci != gi && c.arity == 2 && c.rows.len() >= g.rows.len() && !closed.contains(ci) && !skip.contains(ci)).find_map(|(ci, c)| {
            let edges: Vec<(Term, Term)> = g.rows.iter().map(|r| (r[0], r[1])).collect();
            [0, 1].into_iter().find(|&ac| dag_closure(store, &edges, c, ac)).map(|ac| (ci, ac))
        });
        if let Some((ci, _)) = c {
            closed.insert(ci);
        }
        found.push((gi, c));
    }
    for (gi, c) in found {
        if closed.contains(&gi) {
            continue;
        }
        let g = &rels[gi];
        let nodes: FxSet<Term> = g.rows.iter().flat_map(|r| [r[0], r[1]]).collect();
        let mut notes = vec![format!("{}: {} edges over {} nodes, no cycle, and no forest (a node has two parents)", g.label(), g.rows.len(), nodes.len())];
        match c {
            Some((ci, ac)) => {
                let c = &rels[ci];
                let mut note = format!("{}: {} = the closure of {}", c.label(), rows_word(c.rows.len()), g.label());
                if ac == 1 {
                    note.push_str(" (its columns are the end, then the start)");
                }
                notes.push(note);
                notes.push(format!("saves {} ({} derivations); reachability by labels over the dag", rows_word(c.rows.len()), c.firings));
                out.push(Proposal { kind: "dag", decl: format!("dag {}(A, B) closure {}.", g.name, c.name), notes, saved: Some((ci, c.rows.len(), c.firings)) });
            }
            None => match dag_reduction(store, g) {
                // a closure itself, of a dag no relation holds
                Some(red) => {
                    closed.insert(gi);
                    out.push(Proposal {
                    kind: "dag",
                    decl: format!("dag _(A, B) closure {}.", g.name),
                    notes: vec![
                        format!("{}: {} is the transitive closure of a dag of {} edges that no relation holds", g.label(), rows_word(g.rows.len()), red.len()),
                        format!("saves {}: {} less the {} edges to state ({} derivations)", rows_word(g.rows.len() - red.len()), g.rows.len(), red.len(), g.firings),
                    ],
                    saved: Some((gi, g.rows.len() - red.len(), g.firings)),
                    })
                }
                None => {
                    notes.push("no relation equals its closure: the promise only, no rows saved".into());
                    out.push(Proposal { kind: "dag", decl: format!("dag {}(A, B).", g.name), notes, saved: None });
                }
            },
        }
    }    closed
}
