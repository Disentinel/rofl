//! SUBSUMPTION AGAINST ORACLES WRITTEN HERE (docs/aggregates.md,
//! "Subsumption, as built"): over seeded random graphs with cycles, the
//! Pareto front of (cost, time) paths equals the front of every simple path
//! a search enumerates (a cycle adds to both, so no path with one is on a
//! front); a dominance on a total order equals the min lattice, fact for fact;
//! a partial order with no join (inclusion of bitsets) keeps exactly the
//! maximal sets; and the front does not depend on the order the facts were
//! written in.
use rofl::session::Session;
use std::collections::{BTreeMap, BTreeSet};
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

fn rows(s: &mut Session, q: &str) -> BTreeSet<Vec<String>> {
    s.ask(q).unwrap().rows.into_iter().collect()
}

type Pair = (i64, i64);

fn dominates(a: Pair, b: Pair) -> bool {
    a.0 <= b.0 && a.1 <= b.1 && (a.0 < b.0 || a.1 < b.1)
}

fn front(vals: &BTreeSet<Pair>) -> BTreeSet<Pair> {
    vals.iter().copied().filter(|v| !vals.iter().any(|w| dominates(*w, *v))).collect()
}

/// Every simple path from each node (a node repeated only as its end), each
/// with its cost and time.
fn simple_fronts(n: usize, edges: &[(usize, usize, i64, i64)]) -> BTreeMap<(usize, usize), BTreeSet<Pair>> {
    let mut out: BTreeMap<(usize, usize), BTreeSet<Pair>> = BTreeMap::new();
    fn walk(u: usize, s: usize, seen: &mut Vec<bool>, acc: Pair, edges: &[(usize, usize, i64, i64)], out: &mut BTreeMap<(usize, usize), BTreeSet<Pair>>) {
        for &(a, b, c, t) in edges {
            if a != u {
                continue;
            }
            let v = (acc.0 + c, acc.1 + t);
            out.entry((s, b)).or_default().insert(v);
            if !seen[b] {
                seen[b] = true;
                walk(b, s, seen, v, edges, out);
                seen[b] = false;
            }
        }
    }
    for s in 0..n {
        let mut seen = vec![false; n];
        seen[s] = true;
        walk(s, s, &mut seen, (0, 0), edges, &mut out);
    }
    out.into_iter().map(|(k, v)| (k, front(&v))).collect()
}

const PARETO: &str = "\
p(A, B, C, T) :- e(A, B, C, T).
p(A, C, C1, T1) :- p(A, B, C0, T0), e(B, C, C2, T2), C1 is C0 + C2, T1 is T0 + T2.
p(A, B, C1, T1) <= p(A, B, C2, T2) :- C2 <= C1, T2 <= T1, C2 < C1.
p(A, B, C1, T1) <= p(A, B, C2, T2) :- C2 <= C1, T2 <= T1, T2 < T1.
";

#[test]
fn pareto_fronts_are_the_fronts_of_every_simple_path() {
    for seed in 1..7u64 {
        let mut r = Rng(seed);
        let n = 7;
        let mut edges: Vec<(usize, usize, i64, i64)> = Vec::new();
        for _ in 0..n * 2 {
            let (a, b) = (r.next() % n, r.next() % n);
            let (c, t) = (1 + (r.next() % 9) as i64, 1 + (r.next() % 9) as i64);
            edges.push((a, b, c, t));
        }
        let mut src = String::from("edb(e).\n");
        for (a, b, c, t) in &edges {
            src.push_str(&format!("e(n{a}, n{b}, {c}, {t}).\n"));
        }
        src.push_str(PARETO);
        let mut s = run(&src);
        let got = rows(&mut s, "p(A, B, C, T)");
        let mut want: BTreeSet<Vec<String>> = BTreeSet::new();
        for ((a, b), f) in simple_fronts(n, &edges) {
            for (c, t) in f {
                want.insert(vec![format!("n{a}"), format!("n{b}"), c.to_string(), t.to_string()]);
            }
        }
        assert_eq!(got, want, "seed {seed}");
        // and in the reverse order of the facts, the same front
        let mut rev = String::from("edb(e).\n");
        for (a, b, c, t) in edges.iter().rev() {
            rev.push_str(&format!("e(n{a}, n{b}, {c}, {t}).\n"));
        }
        rev.push_str(PARETO);
        let mut s2 = run(&rev);
        assert_eq!(rows(&mut s2, "p(A, B, C, T)"), got, "seed {seed}, facts reversed");
    }
}

#[test]
fn a_dominance_on_a_total_order_is_the_min_lattice() {
    for seed in 1..7u64 {
        let mut r = Rng(seed);
        let n = 30;
        let mut src = String::from("edb(e).\n");
        for _ in 0..n * 3 {
            let (a, b, w) = (r.next() % n, r.next() % n, r.next() % 20);
            src.push_str(&format!("e(n{a}, n{b}, {w}).\n"));
        }
        src.push_str(
            "d(A, B, D) :- e(A, B, D).\n\
             d(A, C, D) :- d(A, B, D0), e(B, C, W), D is D0 + W.\n\
             d(A, B, X) <= d(A, B, Y) :- Y < X.\n\
             lattice m(A, B, min D).\n\
             m(A, B, D) :- e(A, B, D).\n\
             m(A, C, D) :- m(A, B, D0), e(B, C, W), D is D0 + W.\n",
        );
        let mut s = run(&src);
        let d = rows(&mut s, "d(A, B, D)");
        let m = rows(&mut s, "m(A, B, D)");
        assert!(!d.is_empty());
        assert_eq!(d, m, "seed {seed}");
    }
}

/// The same, with the improvement flowing back through plain relations:
/// reaching a node unlocks others at 0, which may reach it again for less
/// (f_a_monotone_consumer_an_improvement_reached_back_through_was_refused).
#[test]
fn a_dominance_through_plain_relations_is_the_min_lattice() {
    for seed in 1..9u64 {
        let mut r = Rng(seed);
        let n = 20;
        let mut src = String::from("edb(e). edb(unlock). edb(start).\nstart(n0).\n");
        for _ in 0..n * 2 {
            let (a, b, w) = (r.next() % n, r.next() % n, r.next() % 20);
            src.push_str(&format!("e(n{a}, n{b}, {w}).\n"));
        }
        for _ in 0..n / 2 {
            src.push_str(&format!("unlock(n{}, n{}).\n", r.next() % n, r.next() % n));
        }
        src.push_str(
            "d(X, 0) :- start(X).\n\
             d(Y, D) :- d(X, D0), e(X, Y, W), D is D0 + W.\n\
             at(X) :- d(X, _).\n\
             d(Y, 0) :- at(X), unlock(X, Y).\n\
             d(X, A) <= d(X, B) :- B < A.\n\
             lattice m(X, min D).\n\
             m(X, 0) :- start(X).\n\
             m(Y, D) :- m(X, D0), e(X, Y, W), D is D0 + W.\n\
             mt(X) :- m(X, _).\n\
             m(Y, 0) :- mt(X), unlock(X, Y).\n",
        );
        let mut s = run(&src);
        let d = rows(&mut s, "d(A, D)");
        assert!(d.len() > 1, "seed {seed}");
        assert_eq!(d, rows(&mut s, "m(A, D)"), "seed {seed}");
        assert_eq!(rows(&mut s, "at(A)"), rows(&mut s, "mt(A)"), "seed {seed}");
    }
}

#[test]
fn inclusion_keeps_the_maximal_sets() {
    for seed in 1..7u64 {
        let mut r = Rng(seed);
        let mut src = String::from("edb(h).\nedb(bit).\n");
        for b in 0..6 {
            src.push_str(&format!("bit({b}, {}).\n", 1i64 << b));
        }
        let mut sets: BTreeMap<usize, BTreeSet<i64>> = BTreeMap::new();
        for _ in 0..40 {
            let (k, v) = (r.next() % 4, (r.next() % 64) as i64);
            sets.entry(k).or_default().insert(v);
            src.push_str(&format!("h(k{k}, {v}).\n"));
        }
        // X is below Y when every bit of X is in Y and they differ
        src.push_str(
            "q(K, V) :- h(K, V).\n\
             lacks(X, Y) :- h(_, X), h(_, Y), bit(_, B), P is X / B, Q is P mod 2, Q = 1, R is Y / B, S is R mod 2, S = 0.\n\
             q(K, X) <= q(K, Y) :- X != Y, not lacks(X, Y).\n",
        );
        let mut s = run(&src);
        let got = rows(&mut s, "q(K, V)");
        let sub = |x: i64, y: i64| x != y && x & y == x;
        let mut want: BTreeSet<Vec<String>> = BTreeSet::new();
        for (k, vs) in &sets {
            for v in vs {
                if !vs.iter().any(|w| sub(*v, *w)) {
                    want.insert(vec![format!("k{k}"), v.to_string()]);
                }
            }
        }
        assert_eq!(got, want, "seed {seed}");
    }
}
