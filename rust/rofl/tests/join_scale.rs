//! THE JOIN LATTICES AGAINST SOLVERS WRITTEN HERE: connected components as
//! sets equal to a breadth-first search's, live variables equal to the
//! iterative dataflow solver's, and the interval hull and the bitset of what
//! reaches a node equal to the fold over the nodes a search reaches, over
//! seeded random graphs with cycles; each cell one fact, and every
//! contribution the Cover keeps below it.
use rofl::session::Session;
use std::collections::{BTreeSet, HashMap};
use std::path::Path;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> usize {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) as usize
    }
}

fn run(src: &str) -> Session {
    let mut s = Session::fresh(50_000_000);
    s.load(&boot(), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    s
}

/// `set(a,b,c)` as its elements.
fn elems(t: &str) -> BTreeSet<String> {
    let inner = t.strip_prefix("set(").and_then(|x| x.strip_suffix(')')).unwrap_or_else(|| panic!("not a set: {t}"));
    inner.split(',').map(|x| x.to_string()).collect()
}

/// Each key of a binary lattice relation and its value's text, one per key.
fn cells(s: &mut Session, q: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for r in s.ask(q).unwrap().rows {
        assert!(out.insert(r[0].clone(), r[1].clone()).is_none(), "{q}: two values for {}", r[0]);
    }
    out
}

/// The nodes reachable from each node over `adj`, itself included.
fn reach(n: usize, adj: &[Vec<usize>]) -> Vec<BTreeSet<usize>> {
    (0..n)
        .map(|s| {
            let mut seen = BTreeSet::from([s]);
            let mut stack = vec![s];
            while let Some(u) = stack.pop() {
                for v in &adj[u] {
                    if seen.insert(*v) {
                        stack.push(*v);
                    }
                }
            }
            seen
        })
        .collect()
}

#[test]
fn union_components_are_a_searchs_components() {
    for seed in 1..6u64 {
        let mut r = Rng(seed);
        let n = 40;
        let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut src = String::from("edb(e).\nedb(node).\n");
        for i in 0..n {
            src.push_str(&format!("node(n{i}).\n"));
        }
        for _ in 0..n * 3 / 4 {
            let (a, b) = (r.next() % n, r.next() % n);
            adj[a].push(b);
            adj[b].push(a);
            src.push_str(&format!("e(n{a}, n{b}).\n"));
        }
        src.push_str(
            "u(X, Y) :- e(X, Y).\nu(Y, X) :- e(X, Y).\nlattice comp(X, union S).\n\
             comp(X, set(X)) :- node(X).\ncomp(X, S) :- u(X, Y), comp(Y, S).\nin_comp(X, Y) :- comp(X, S), Y in S.\n",
        );
        let mut s = run(&src);
        let got = cells(&mut s, "comp(X, S)");
        let want = reach(n, &adj);
        assert_eq!(got.len(), n);
        for (i, w) in want.iter().enumerate() {
            let w: BTreeSet<String> = w.iter().map(|j| format!("n{j}")).collect();
            assert_eq!(elems(&got[&format!("n{i}")]), w, "seed {seed}: the component of n{i}");
        }
        let pairs = s.ask("in_comp(X, Y)").unwrap().rows.len();
        assert_eq!(pairs, want.iter().map(|w| w.len()).sum::<usize>(), "seed {seed}: every member, once");
    }
}

#[test]
fn live_variables_are_the_iterative_solvers() {
    for seed in 1..6u64 {
        let mut r = Rng(seed * 31);
        let (n, vars) = (25, 6);
        let mut succ: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut src = String::from("edb(succ).\nedb(use).\nedb(def).\n");
        for i in 0..n {
            for _ in 0..1 + r.next() % 2 {
                let j = r.next() % n;
                if !succ[i].contains(&j) {
                    succ[i].push(j);
                    src.push_str(&format!("succ(b{i}, b{j}).\n"));
                }
            }
        }
        let mut uses = vec![BTreeSet::new(); n];
        let mut defs = vec![BTreeSet::new(); n];
        for i in 0..n {
            for x in 0..vars {
                match r.next() % 5 {
                    0 => {
                        uses[i].insert(x);
                        src.push_str(&format!("use(b{i}, v{x}).\n"));
                    }
                    1 => {
                        defs[i].insert(x);
                        src.push_str(&format!("def(b{i}, v{x}).\n"));
                    }
                    _ => {}
                }
            }
        }
        src.push_str(
            "lattice live_in(B, union S).\nlattice live_out(B, union S).\n\
             live_in(B, set(V)) :- use(B, V).\nlive_in(B, set(V)) :- live_out(B, S), V in S, not def(B, V).\n\
             live_out(B, S) :- succ(B, C), live_in(C, S).\n",
        );
        // the textbook solver, to its fixpoint
        let (mut lin, mut lout) = (vec![BTreeSet::<usize>::new(); n], vec![BTreeSet::<usize>::new(); n]);
        loop {
            let mut moved = false;
            for i in (0..n).rev() {
                let out: BTreeSet<usize> = succ[i].iter().flat_map(|j| lin[*j].iter().copied()).collect();
                let inn: BTreeSet<usize> = uses[i].iter().copied().chain(out.iter().copied().filter(|x| !defs[i].contains(x))).collect();
                if out != lout[i] || inn != lin[i] {
                    moved = true;
                    (lout[i], lin[i]) = (out, inn);
                }
            }
            if !moved {
                break;
            }
        }
        let mut s = run(&src);
        for (q, want) in [("live_in(B, S)", &lin), ("live_out(B, S)", &lout)] {
            let got = cells(&mut s, q);
            for (i, w) in want.iter().enumerate() {
                let key = format!("b{i}");
                if w.is_empty() {
                    assert!(!got.contains_key(&key), "seed {seed}: {q} of {key} is the bottom, no cell");
                    continue;
                }
                let w: BTreeSet<String> = w.iter().map(|x| format!("v{x}")).collect();
                assert_eq!(elems(&got[&key]), w, "seed {seed}: {q} of {key}");
            }
        }
    }
}

#[test]
fn a_hull_and_a_bitset_are_the_fold_over_what_reaches() {
    for seed in 1..6u64 {
        let mut r = Rng(seed * 7 + 3);
        let n = 30;
        let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut src = String::from("edb(link).\nedb(val).\nedb(flag).\n");
        let vals: Vec<i64> = (0..n).map(|_| r.next() as i64 % 1000 - 500).collect();
        let flags: Vec<i64> = (0..n).map(|_| 1i64 << (r.next() % 60)).collect();
        for i in 0..n {
            src.push_str(&format!("val(n{i}, {}).\nflag(n{i}, {}).\n", vals[i], flags[i]));
            for _ in 0..r.next() % 3 {
                let j = r.next() % n;
                adj[i].push(j);
                src.push_str(&format!("link(n{i}, n{j}).\n"));
            }
        }
        src.push_str(
            "lattice range(N, hull I).\nrange(N, iv(V, V)) :- val(N, V).\nrange(N, I) :- link(N, M), range(M, I).\n\
             lattice bits(N, bitor B).\nbits(N, F) :- flag(N, F).\nbits(N, B) :- link(N, M), bits(M, B).\n",
        );
        let mut s = run(&src);
        let (ranges, bits) = (cells(&mut s, "range(N, I)"), cells(&mut s, "bits(N, B)"));
        for (i, rs) in reach(n, &adj).iter().enumerate() {
            let (lo, hi) = (rs.iter().map(|j| vals[*j]).min().unwrap(), rs.iter().map(|j| vals[*j]).max().unwrap());
            assert_eq!(ranges[&format!("n{i}")], format!("iv({lo},{hi})"), "seed {seed}: the hull of n{i}");
            let b = rs.iter().fold(0i64, |a, j| a | flags[*j]);
            assert_eq!(bits[&format!("n{i}")], b.to_string(), "seed {seed}: the bitset of n{i}");
        }
    }
}

/// THE COST OF A LONG HISTORY, bounded rather than printed. One `union`
/// component over a 400-node chain: each node's cell widens once per value
/// its successor takes, so the cells hold O(n^2) superseded values, each a
/// set of O(n) elements -- O(n^3) work that the representation owes and no
/// more. Until 2026-09-30 the store paid n^4.5 on top (27.6 s here): every
/// superseded value stayed in its relation's canonical run until the
/// fixpoint's sweep and was merged again on every read, and ordering two
/// facts rendered both argument lists whole although the first differing
/// byte decides (facts/findings.rofl, join scale). The counters are the
/// deterministic guard -- the ids merged across every absorb, and the rule
/// firings -- and the clock a coarse one, in an optimised build only.
#[test]
fn a_long_chain_as_one_set_stays_within_its_history() {
    let n = 400usize;
    let mut src = String::from("edb(e).\nedb(node).\n");
    for i in 0..n {
        src.push_str(&format!("node(n{i}).\n"));
    }
    for i in 0..n - 1 {
        src.push_str(&format!("e(n{i}, n{}).\n", i + 1));
    }
    src.push_str("lattice comp(X, union S).\ncomp(X, set(X)) :- node(X).\ncomp(X, S) :- e(X, Y), comp(Y, S).\n");
    let mut s = Session::fresh(500_000_000);
    s.load(&boot(), None).expect("boot");
    s.load(&src, None).unwrap_or_else(|d| panic!("{d:?}"));
    let t = std::time::Instant::now();
    s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    let secs = t.elapsed().as_secs_f64();
    let got = cells(&mut s, "comp(X, S)");
    assert_eq!(got.len(), n);
    for k in [0, 1, n / 2, n - 2, n - 1] {
        let want: BTreeSet<String> = (k..n).map(|j| format!("n{j}")).collect();
        assert_eq!(elems(&got[&format!("n{k}")]), want, "the set reached from n{k}");
    }
    let (canon, steps) = (s.eval.store.absorb_canon, s.eval.steps);
    // 159 862 and 98 926 when written; the run held 15 057 357 before
    assert!(canon <= 2 * (n * n) as u64, "absorb merged {canon} standing ids: superseded values are kept in the runs again");
    assert!(steps <= (n * n) as i64, "{steps} rule firings for a {n}-node chain");
    if !cfg!(debug_assertions) {
        assert!(secs < 12.0, "a {n}-node chain as one set took {secs:.2} s (2.5 s when written)");
    }
}

/// A SET IS ASKED BY ITS VALUE at every door a caller has: a question, a
/// `why`, a `whynot` and an asserted fact each read a set however it is
/// written, and a set written with a variable is refused rather than matched
/// by the order its variables fall in.
#[test]
fn every_door_reads_a_set_by_its_value() {
    let mut s = run("edb(e). e(k, a). e(k, b).\nlattice r(X, union S).\nr(X, set(Y)) :- e(X, Y).");
    assert_eq!(s.ask("r(k, set(b, a, b))").unwrap().rows.len(), 1);
    assert_eq!(s.ask("r(k, set(b))").unwrap().rows.len(), 0);
    let e = s.ask("r(k, set(Y, b))").err().expect("an open set is refused");
    assert!(e.contains("is a set written with a variable"), "{e}");
    assert!(s.ask("r(k, set(Y))").is_ok(), "set(Y) has one spelling");
    let why = s.why("r(k, set(b, a))").unwrap();
    assert!(why.contains("[lattice union: a cover of 2 contributions]"), "{why}");
    let b = rofl::engine::WhynotBounds { max_depth: 4, max_nodes: 64 };
    let (holds, text) = s.whynot("r(k, set(a, a, b))", &b).unwrap();
    assert!(holds, "{text}");
    assert!(s.whynot("r(k, set(b, Y))", &b).is_err());
    assert_eq!(s.assert("q(set(b, a)). q(set(a, b, a)).").unwrap(), 1, "two spellings, one fact");
    s.evaluate().unwrap();
    assert_eq!(s.ask("q(set(a, b))").unwrap().rows.len(), 1);
}
