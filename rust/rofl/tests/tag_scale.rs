//! SEMIRING TAGS AT SCALE (docs/aggregates.md, "Tags, as built"). The
//! tropical tag bounds what the same rules enumerate without it — the 74 831
//! cost facts of f_semiring_needs_parameterized_evaluator, path lengths over
//! a cycle until the budget cut them — to one fact per pair, Floyd's; viterbi
//! and trust are the fixed points their ⊗ and ⊕ define, computed here by
//! iteration; and counting is the matrix product of the multiplicities.
use rofl::session::Session;
use std::collections::HashMap;
use std::path::Path;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

/// A seeded random digraph: a ring through all `n` nodes and `extra` more
/// edges, weights in 1..=`span`.
fn graph(n: usize, extra: usize, seed: u64, span: u64) -> Vec<(usize, usize, i64)> {
    let mut x = seed;
    let mut next = || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    let mut es: HashMap<(usize, usize), i64> = HashMap::new();
    for i in 0..n {
        es.insert((i, (i + 1) % n), 1 + (next() as u64 % span) as i64);
    }
    while es.len() < n + extra {
        let (a, b) = (next() % n, next() % n);
        es.entry((a, b)).or_insert(1 + (next() as u64 % span) as i64);
    }
    let mut v: Vec<_> = es.into_iter().map(|((a, b), w)| (a, b, w)).collect();
    v.sort();
    v
}

fn edges_src(es: &[(usize, usize, i64)]) -> String {
    let mut s = String::from("edb(e).\n");
    for (a, b, w) in es {
        s.push_str(&format!("e(n{a}, n{b}, {w}).\n"));
    }
    s
}

fn values(s: &mut Session, q: &str) -> HashMap<String, i64> {
    s.ask(q).unwrap().rows.into_iter().map(|r| (r[..r.len() - 1].join(","), r[r.len() - 1].parse().unwrap())).collect()
}

fn run(src: &str, budget: i64) -> (Session, rofl::session::Evaluated) {
    let mut s = Session::fresh(budget);
    s.load(&boot(), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    let ev = s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    (s, ev)
}

/// THE CASE THE FINDING RECORDED: tropical costs over a cyclic graph, written
/// as plain rules, are every path length there is, and the budget cuts them;
/// the same rules over a tropical tag settle with one fact per pair, Floyd's.
#[test]
fn a_tropical_tag_bounds_what_the_plain_rules_enumerate() {
    let n = 12;
    let es = graph(n, 12, 3, 20);
    let plain = format!(
        "{}cost(A, C, D) :- e(A, C, D).\ncost(A, C, D) :- cost(A, B, D1), e(B, C, W), D is D1 + W.\n",
        edges_src(&es)
    );
    let (mut s, ev) = run(&plain, 200_000);
    assert!(ev.partial, "a cycle of positive weights has infinitely many path lengths");
    let cut = s.ask("cost(A, C, D)").unwrap().rows.len();
    let tagged = format!(
        "{}tag step(A, B, tropical W).\nstep(A, B, W) :- e(A, B, W).\n\
         tag cost(A, C, tropical T).\ncost(A, C, T) :- step(A, C, _).\ncost(A, C, T) :- cost(A, B, _), step(B, C, _).\n",
        edges_src(&es)
    );
    let (mut s2, ev2) = run(&tagged, 200_000);
    assert!(!ev2.partial, "the tag settles under the budget the plain rules exhaust");
    let got = values(&mut s2, "cost(A, C, T)");
    let inf = i64::MAX / 4;
    let mut d = vec![vec![inf; n]; n];
    for (a, b, w) in &es {
        d[*a][*b] = d[*a][*b].min(*w);
    }
    for k in 0..n {
        for i in 0..n {
            for j in 0..n {
                d[i][j] = d[i][j].min(d[i][k].saturating_add(d[k][j]));
            }
        }
    }
    assert_eq!(got.len(), n * n);
    for i in 0..n {
        for j in 0..n {
            assert_eq!(got.get(&format!("n{i},n{j}")), Some(&d[i][j]), "cost(n{i}, n{j})");
        }
    }
    eprintln!("plain: {cut} cost facts when the budget cut it; tagged: {} facts, settled in {} steps", got.len(), ev2.steps);
    assert!(cut > 50 * got.len(), "{cut} facts cut against {}", got.len());
}

/// VITERBI AND TRUST over probabilities in millionths on a larger cyclic
/// graph: the fixed point of the linear rule, `p(A, C) = p(A, B) ⊗ e(B, C)`
/// maximised, computed by iterating the same ⊗ (viterbi rounds each product
/// down, in the rule's order) until nothing improves.
#[test]
fn viterbi_and_trust_are_the_fixed_points_of_their_semirings() {
    let n = 40;
    let unit: i64 = 1_000_000;
    let es: Vec<(usize, usize, i64)> = graph(n, 2 * n, 17, 999_999).into_iter().map(|(a, b, w)| (a, b, w.max(1))).collect();
    let src = format!(
        "{}tag pr(A, C, viterbi P).\npr(A, C, W) :- e(A, C, W).\npr(A, C, W) :- pr(A, B, _), e(B, C, W).\n\
         tag tr(A, C, trust T).\ntr(A, C, W) :- e(A, C, W).\ntr(A, C, W) :- tr(A, B, _), e(B, C, W).\n",
        edges_src(&es)
    );
    let (mut s, ev) = run(&src, 50_000_000);
    assert!(!ev.partial);
    let (pr, tr) = (values(&mut s, "pr(A, C, P)"), values(&mut s, "tr(A, C, T)"));
    let vit = |a: i64, b: i64| a * b / unit;
    for (times, got, name) in [(&vit as &dyn Fn(i64, i64) -> i64, &pr, "pr"), (&|a: i64, b: i64| a.min(b), &tr, "tr")] {
        let mut best = vec![vec![-1i64; n]; n];
        for (a, b, w) in &es {
            best[*a][*b] = best[*a][*b].max(times(unit, *w));
        }
        loop {
            let mut moved = false;
            for a in 0..n {
                for (b, c, w) in &es {
                    if best[a][*b] >= 0 {
                        let v = times(times(unit, *w), best[a][*b]);
                        if v > best[a][*c] {
                            best[a][*c] = v;
                            moved = true;
                        }
                    }
                }
            }
            if !moved {
                break;
            }
        }
        assert_eq!(got.len(), n * n, "{name}: one fact per pair");
        for a in 0..n {
            for c in 0..n {
                assert_eq!(got.get(&format!("n{a},n{c}")), Some(&best[a][c]), "{name}(n{a}, n{c})");
            }
        }
    }
}

/// COUNTING is stratified, so a fixed number of hops: the two- and three-hop
/// counts over edges of multiplicity 1..=3 are the entries of A² and A³.
#[test]
fn counting_is_the_matrix_product_of_the_multiplicities() {
    let n = 30;
    let es = graph(n, 3 * n, 5, 3);
    let src = format!(
        "{}tag hop(A, B, counting N).\nhop(A, B, W) :- e(A, B, W).\n\
         tag two(A, C, counting N).\ntwo(A, C, N) :- hop(A, B, _), hop(B, C, _).\n\
         tag three(A, D, counting N).\nthree(A, D, N) :- two(A, C, _), hop(C, D, _).\n",
        edges_src(&es)
    );
    let (mut s, ev) = run(&src, 50_000_000);
    assert!(!ev.partial);
    let mut m = vec![vec![0i64; n]; n];
    for (a, b, w) in &es {
        m[*a][*b] = *w;
    }
    let mul = |x: &Vec<Vec<i64>>, y: &Vec<Vec<i64>>| -> Vec<Vec<i64>> {
        (0..n).map(|i| (0..n).map(|j| (0..n).map(|k| x[i][k] * y[k][j]).sum()).collect()).collect()
    };
    let m2 = mul(&m, &m);
    let m3 = mul(&m2, &m);
    for (q, want) in [("two(A, C, N)", &m2), ("three(A, C, N)", &m3)] {
        let got = values(&mut s, q);
        for i in 0..n {
            for j in 0..n {
                let g = got.get(&format!("n{i},n{j}")).copied();
                assert_eq!(g, (want[i][j] > 0).then_some(want[i][j]), "{q} at n{i}, n{j}");
            }
        }
    }
}
