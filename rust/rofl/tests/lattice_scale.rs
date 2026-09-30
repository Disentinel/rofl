//! THE ORDER LATTICE AT SCALE: shortest and widest paths over cyclic weighted
//! graphs end with one fact per key, equal to Dijkstra's and Floyd's answers
//! computed here, and a bounded number of improvements; the same rules without
//! the declaration enumerate path lengths until the budget cuts them
//! (f_semiring_needs_parameterized_evaluator: 74 831 cost facts).
use rofl::session::Session;
use std::collections::{BinaryHeap, HashMap};
use std::cmp::Reverse;
use std::path::Path;
use std::time::Instant;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

/// A seeded random digraph: `n` nodes, a ring through all of them (so every
/// node is reachable and there is a cycle), and `extra` more edges; weights
/// in 1..=20.
fn graph(n: usize, extra: usize, seed: u64) -> Vec<(usize, usize, i64)> {
    let mut x = seed;
    let mut next = || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    let mut es: HashMap<(usize, usize), i64> = HashMap::new();
    for i in 0..n {
        es.insert((i, (i + 1) % n), 1 + (next() % 20) as i64);
    }
    while es.len() < n + extra {
        let (a, b) = (next() % n, next() % n);
        es.entry((a, b)).or_insert(1 + (next() % 20) as i64);
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

#[test]
fn single_source_shortest_paths_are_dijkstras_with_one_fact_per_node() {
    let n = 3000;
    let es = graph(n, 3 * n, 7);
    let mut adj: Vec<Vec<(usize, i64)>> = vec![Vec::new(); n];
    for (a, b, w) in &es {
        adj[*a].push((*b, *w));
    }
    let mut dist = vec![i64::MAX; n];
    let mut pq = BinaryHeap::new();
    dist[0] = 0;
    pq.push(Reverse((0i64, 0usize)));
    while let Some(Reverse((d, u))) = pq.pop() {
        if d > dist[u] {
            continue;
        }
        for (v, w) in &adj[u] {
            if d + w < dist[*v] {
                dist[*v] = d + w;
                pq.push(Reverse((d + w, *v)));
            }
        }
    }
    let src = format!(
        "{}edb(src).\nsrc(n0).\nlattice sd(X, min D).\nsd(X, 0) :- src(X).\nsd(Y, D) :- sd(X, D1), e(X, Y, W), D is D1 + W.\n",
        edges_src(&es)
    );
    let t = Instant::now();
    let (mut s, ev) = run(&src, 50_000_000);
    let took = t.elapsed();
    assert!(!ev.partial, "the evaluation was cut");
    let got = values(&mut s, "sd(X, D)");
    assert_eq!(got.len(), n, "one fact per reachable node");
    for (i, d) in dist.iter().enumerate() {
        assert_eq!(got.get(&format!("n{i}")), Some(d), "sd(n{i})");
    }
    let imp = s.eval.lattice_improvements;
    eprintln!("sssp: {n} nodes, {} edges, {imp} improvements, {} steps, {took:?}", es.len(), ev.steps);
    assert!(imp < 8 * n as u64, "{imp} improvements for {n} keys");
}

#[test]
fn all_pairs_shortest_and_widest_paths_are_floyds() {
    let n = 90;
    let es = graph(n, 2 * n, 11);
    let inf = i64::MAX / 4;
    let mut d = vec![vec![inf; n]; n];
    let mut wd = vec![vec![i64::MIN; n]; n];
    for (a, b, w) in &es {
        d[*a][*b] = d[*a][*b].min(*w);
        wd[*a][*b] = wd[*a][*b].max(*w);
    }
    for k in 0..n {
        for i in 0..n {
            for j in 0..n {
                if d[i][k] + d[k][j] < d[i][j] {
                    d[i][j] = d[i][k] + d[k][j];
                }
                let via = wd[i][k].min(wd[k][j]);
                if via > wd[i][j] {
                    wd[i][j] = via;
                }
            }
        }
    }
    let src = format!(
        "{}lattice dist(A, C, min D).\ndist(A, C, D) :- e(A, C, D).\n\
         dist(A, C, D) :- dist(A, B, D1), e(B, C, W), D is D1 + W.\n\
         lattice wide(A, C, max W).\nwide(A, C, W) :- e(A, C, W).\n\
         wide(A, C, W) :- wide(A, B, W1), e(B, C, W2), W is min(W1, W2).\n",
        edges_src(&es)
    );
    let t = Instant::now();
    let (mut s, ev) = run(&src, 50_000_000);
    let took = t.elapsed();
    assert!(!ev.partial, "the evaluation was cut");
    let got = values(&mut s, "dist(A, C, D)");
    let wgot = values(&mut s, "wide(A, C, W)");
    assert_eq!(got.len(), n * n, "one fact per pair: the ring makes every pair reachable");
    assert_eq!(wgot.len(), n * n);
    for i in 0..n {
        for j in 0..n {
            assert_eq!(got.get(&format!("n{i},n{j}")), Some(&d[i][j]), "dist(n{i}, n{j})");
            assert_eq!(wgot.get(&format!("n{i},n{j}")), Some(&wd[i][j]), "wide(n{i}, n{j})");
        }
    }
    let imp = s.eval.lattice_improvements;
    eprintln!("apsp: {n} nodes, {} edges, {} keys, {imp} improvements, {} steps, {took:?}", es.len(), 2 * n * n, ev.steps);
    assert!(imp < 16 * (2 * n * n) as u64, "{imp} improvements for {} keys", 2 * n * n);
}

/// The contrast: without the declaration every path length is a fact of its
/// own, so a cyclic graph never settles and the budget cuts it.
#[test]
fn without_the_declaration_a_cycle_enumerates_until_the_budget() {
    let es = graph(12, 12, 3);
    let src = format!(
        "{}dist(A, C, D) :- e(A, C, D).\ndist(A, C, D) :- dist(A, B, D1), e(B, C, W), D is D1 + W.\n",
        edges_src(&es)
    );
    let (mut s, ev) = run(&src, 200_000);
    assert!(ev.partial, "a cycle of positive weights has infinitely many path lengths");
    let n = s.ask("dist(A, C, D)").unwrap().rows.len();
    let (mut s2, ev2) = run(&format!("lattice dist(A, C, min D).\n{src}"), 200_000);
    assert!(!ev2.partial);
    let m = s2.ask("dist(A, C, D)").unwrap().rows.len();
    eprintln!("without the declaration: {n} facts when cut; with it: {m}, settled");
    assert_eq!(m, 144);
    assert!(n > 10 * m);
}

/// DEEP ZERO-WEIGHT TIES: a chain n0 .. nN of weight 0 with an edge of
/// weight 0 back from nN to every node. Every back edge ties its node's cell
/// and rests on it (nN is reached only through the node), so each is
/// self-support; judging that once per closing recursion (dominators), not
/// by a walk per member, keeps the close near-linear. Before, it grew as N²:
/// 9.9 s at N = 4000.
#[test]
fn deep_zero_weight_ties_close_in_near_linear_time() {
    let n = 30_000;
    let mut src = String::from("edb(e).\nedb(src).\nsrc(n0).\n");
    for i in 0..n {
        src.push_str(&format!("e(n{i}, n{}, 0).\n", i + 1));
    }
    for k in 0..n {
        src.push_str(&format!("e(n{n}, n{k}, 0).\n"));
    }
    src.push_str("lattice sd(X, min D).\nsd(X, 0) :- src(X).\nsd(Y, D) :- sd(X, D1), e(X, Y, W), D is D1 + W.\n");
    src.push_str("second(F) :- lattice_member[$kernel](F, 2, _, _).\n");
    let t = Instant::now();
    let (mut s, ev) = run(&src, 50_000_000);
    let took = t.elapsed();
    assert!(!ev.partial);
    assert_eq!(values(&mut s, "sd(X, D)").len(), n + 1);
    assert_eq!(s.ask("second(F)").unwrap().rows.len(), 0, "a back edge kept as a member");
    eprintln!("deep ties: {} facts, {took:?}", n + 1);
    assert!(took.as_secs() < 20, "{took:?}");
}

/// A HOLE AT THE HEAD OF A LONG CHAIN withdraws the chain one level at a
/// time; each level visits only the firings that cite what it withdrew. It
/// grew as N² when each level rescanned the store (4.8 s at N = 16 000).
#[test]
fn a_hole_withdraws_a_long_chain_in_linear_time() {
    let n = 64_000;
    let mut src = String::from("edb(e).\nedb(src).\nsrc(n0).\ne(n0, n1, oops).\ne(n0, n1, 1).\n");
    for i in 1..n {
        src.push_str(&format!("e(n{i}, n{}, 1).\n", i + 1));
    }
    src.push_str("lattice sd(X, min D).\nsd(X, 0) :- src(X).\nsd(Y, D) :- sd(X, D1), e(X, Y, W), D is D1 + W.\n");
    src.push_str("gone(M) :- hole[$kernel](M, support_withdrawn).\n");
    let t = Instant::now();
    let (mut s, ev) = run(&src, 50_000_000);
    let took = t.elapsed();
    assert!(!ev.partial);
    assert_eq!(values(&mut s, "sd(X, D)").len(), 1, "only the source stands");
    assert_eq!(s.ask("gone(M)").unwrap().rows.len(), n - 1);
    eprintln!("hole cascade: {n} facts withdrawn in {took:?}");
    assert!(took.as_secs() < 20, "{took:?}");
}

/// Which members survive self-support, against an oracle that knows only the
/// graph. Weights 0 and 1 over a random digraph, so ties and zero-weight
/// cycles abound. A member of sd(v) through u (a tight edge, d(u) + w = d(v))
/// is well-founded when u is reached from the source over tight edges
/// without v; the source's own rule is always one.
#[test]
fn self_support_is_judged_by_existence_on_zero_weight_ties() {
    let n = 400;
    let mut x: u64 = 17;
    let mut next = || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    let mut es: HashMap<(usize, usize), i64> = HashMap::new();
    for i in 0..n {
        es.insert((i, (i + 1) % n), (next() % 2) as i64);
    }
    while es.len() < 4 * n {
        let (a, b) = (next() % n, next() % n);
        es.entry((a, b)).or_insert((next() % 2) as i64);
    }
    let mut d = vec![i64::MAX; n];
    d[0] = 0;
    loop {
        let mut changed = false;
        for ((a, b), w) in &es {
            if d[*a] != i64::MAX && d[*a] + w < d[*b] {
                d[*b] = d[*a] + w;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    let tight: Vec<(usize, usize)> = es.iter().filter(|((a, b), w)| d[*a] + **w == d[*b]).map(|(e, _)| *e).collect();
    let reach_without = |v: usize| -> Vec<bool> {
        let mut r = vec![false; n];
        if v != 0 {
            r[0] = true;
            let mut stack = vec![0usize];
            while let Some(u) = stack.pop() {
                for (a, b) in &tight {
                    if *a == u && *b != v && !r[*b] {
                        r[*b] = true;
                        stack.push(*b);
                    }
                }
            }
        }
        r
    };
    let mut want: HashMap<String, usize> = HashMap::new();
    for v in 0..n {
        let r = reach_without(v);
        let mut m = if v == 0 { 1 } else { 0 };
        for (a, b) in &tight {
            if *b == v && r[*a] {
                m += 1;
            }
        }
        want.insert(format!("n{v}"), m);
    }
    let mut src = String::from("edb(e).\nedb(src).\nsrc(n0).\n");
    for ((a, b), w) in &es {
        src.push_str(&format!("e(n{a}, n{b}, {w}).\n"));
    }
    src.push_str("lattice sd(X, min D).\nsd(X, 0) :- src(X).\nsd(Y, D) :- sd(X, D1), e(X, Y, W), D is D1 + W.\n");
    src.push_str("mem(X, I) :- sd(X, D), lattice_member[$kernel]($fact(sd, main, $cons(X, $cons(D, $nil))), I, _, _).\n");
    let (mut s, ev) = run(&src, 50_000_000);
    assert!(!ev.partial);
    let mut got: HashMap<String, usize> = HashMap::new();
    for r in s.ask("mem(X, I)").unwrap().rows {
        *got.entry(r[0].clone()).or_default() += 1;
    }
    let ties = want.values().filter(|m| **m > 1).count();
    eprintln!("zero-weight ties: {n} nodes, {} tight edges, {ties} cells with more than one member", tight.len());
    assert!(ties > 10, "the graph has too few ties to test anything");
    for v in 0..n {
        let k = format!("n{v}");
        assert_eq!(got.get(&k).copied().unwrap_or(0), want[&k], "members of sd({k})");
    }
}

/// The same judgment where a firing reads two cells of the recursion
/// (all-pairs by doubling), which is no graph: the fact-by-fact search,
/// against an oracle that computes, for each fact, what is derivable
/// without it.
#[test]
fn self_support_is_judged_by_existence_when_a_firing_reads_two_cells() {
    let n = 14;
    let mut x: u64 = 5;
    let mut next = || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    let mut es: HashMap<(usize, usize), i64> = HashMap::new();
    for i in 0..n {
        es.insert((i, (i + 1) % n), (next() % 2) as i64);
    }
    while es.len() < 3 * n {
        let (a, b) = (next() % n, next() % n);
        es.entry((a, b)).or_insert((next() % 2) as i64);
    }
    let inf = i64::MAX / 4;
    let mut d = vec![vec![inf; n]; n];
    for ((a, b), w) in &es {
        d[*a][*b] = d[*a][*b].min(*w);
    }
    for k in 0..n {
        for i in 0..n {
            for j in 0..n {
                if d[i][k] + d[k][j] < d[i][j] {
                    d[i][j] = d[i][k] + d[k][j];
                }
            }
        }
    }
    // firings over final facts: an edge, or (i,k) and (k,j) with a tight sum
    let fact = |i: usize, j: usize| i * n + j;
    let mut firings: Vec<(usize, Vec<usize>)> = Vec::new();
    for ((a, b), w) in &es {
        if *w == d[*a][*b] {
            firings.push((fact(*a, *b), Vec::new()));
        }
    }
    for i in 0..n {
        for k in 0..n {
            for j in 0..n {
                if d[i][k] < inf && d[k][j] < inf && d[i][k] + d[k][j] == d[i][j] {
                    firings.push((fact(i, j), vec![fact(i, k), fact(k, j)]));
                }
            }
        }
    }
    let founded_without = |f: usize| -> Vec<bool> {
        let mut ok = vec![false; n * n];
        loop {
            let mut changed = false;
            for (h, ps) in &firings {
                if *h != f && !ok[*h] && ps.iter().all(|p| *p != f && ok[*p]) {
                    ok[*h] = true;
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        ok
    };
    let mut want: HashMap<String, usize> = HashMap::new();
    for i in 0..n {
        for j in 0..n {
            let f = fact(i, j);
            let ok = founded_without(f);
            let m = firings.iter().filter(|(h, ps)| *h == f && ps.iter().all(|p| *p != f && ok[*p])).count();
            want.insert(format!("n{i},n{j}"), m);
        }
    }
    let mut src = String::from("edb(e).\n");
    for ((a, b), w) in &es {
        src.push_str(&format!("e(n{a}, n{b}, {w}).\n"));
    }
    src.push_str(
        "lattice dist(A, C, min D).\ndist(A, C, D) :- e(A, C, D).\n\
         dist(A, C, D) :- dist(A, B, D1), dist(B, C, D2), D is D1 + D2.\n\
         mem(A, C, I) :- dist(A, C, D), lattice_member[$kernel]($fact(dist, main, $cons(A, $cons(C, $cons(D, $nil)))), I, _, _).\n",
    );
    let (mut s, ev) = run(&src, 50_000_000);
    assert!(!ev.partial);
    let mut got: HashMap<String, usize> = HashMap::new();
    for r in s.ask("mem(A, C, I)").unwrap().rows {
        *got.entry(format!("{},{}", r[0], r[1])).or_default() += 1;
    }
    let ties = want.values().filter(|m| **m > 1).count();
    assert!(ties > 10, "the graph has too few ties to test anything");
    for (k, m) in &want {
        assert_eq!(got.get(k).copied().unwrap_or(0), *m, "members of dist({k})");
    }
}

/// WHAT A HOLE REACHES IS A HOLE, against an oracle that knows only the
/// graph: a forward random digraph from n0 with one edge that is not a
/// number, into v. Every node reachable from v is unknown (v itself
/// arith_type_error, the rest support_withdrawn); every other node holds
/// Dijkstra's distance over the other edges. The same program with its edges
/// written in the opposite order is the same world.
#[test]
fn a_hole_reaches_what_reads_it_and_nothing_else() {
    let n = 4000;
    let mut x: u64 = 29;
    let mut next = || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    let mut es: Vec<(usize, usize, i64)> = Vec::new();
    for i in 0..n - 1 {
        es.push((i, i + 1, 1 + (next() % 9) as i64));
    }
    for _ in 0..3 * n {
        let a = next() % n;
        let b = next() % n;
        if a < b {
            es.push((a, b, 1 + (next() % 9) as i64));
        }
    }
    let (u, v) = (n / 3, n / 3 + 50);
    let mut adj: Vec<Vec<(usize, i64)>> = vec![Vec::new(); n];
    for (a, b, w) in &es {
        adj[*a].push((*b, *w));
    }
    let mut reach = vec![false; n];
    let mut stack = vec![v];
    while let Some(y) = stack.pop() {
        if !reach[y] {
            reach[y] = true;
            stack.extend(adj[y].iter().map(|e| e.0));
        }
    }
    let mut d = vec![i64::MAX; n];
    d[0] = 0;
    let mut heap = BinaryHeap::from([Reverse((0i64, 0usize))]);
    while let Some(Reverse((dx, y))) = heap.pop() {
        if dx > d[y] {
            continue;
        }
        for (z, w) in &adj[y] {
            if dx + w < d[*z] {
                d[*z] = dx + w;
                heap.push(Reverse((d[*z], *z)));
            }
        }
    }
    let prog = "lattice sd(X, min D).\nsd(n0, 0) :- e(n0, _, _).\nsd(Y, D) :- sd(X, D1), e(X, Y, W), D is D1 + W.\n\
                gone(M, R) :- hole[$kernel](M, R), M = $lattice(sd, _, _, _).\n";
    let bad = format!("e(n{u}, n{v}, oops).\n");
    let fwd = format!("{}{bad}{prog}", edges_src(&es));
    let mut rev_es = es.clone();
    rev_es.reverse();
    let rev = format!("{bad}{}{prog}", edges_src(&rev_es));
    let t = Instant::now();
    let (mut s, ev) = run(&fwd, 200_000_000);
    let took = t.elapsed();
    assert!(!ev.partial);
    let got = values(&mut s, "sd(X, D)");
    for y in 0..n {
        let k = format!("n{y}");
        if reach[y] {
            assert!(!got.contains_key(&k), "{k} holds {:?}, and a path through the hole reaches it", got.get(&k));
        } else if d[y] != i64::MAX {
            assert_eq!(got.get(&k), Some(&d[y]), "{k}");
        }
    }
    let holes = s.ask("gone(M, R)").unwrap().rows;
    let reached = reach.iter().filter(|r| **r).count();
    assert_eq!(holes.len(), reached, "one hole per node reachable from the hole");
    assert_eq!(holes.iter().filter(|r| r[1] == "arith_type_error").count(), 1);
    let (s2, _) = run(&rev, 200_000_000);
    let facts = |s: &Session| s.eval.store.canonical_state(&s.eval.h).lines().filter(|l| l.starts_with("sd[") || l.starts_with("hole[")).map(String::from).collect::<Vec<_>>();
    assert_eq!(facts(&s), facts(&s2), "the order the edges are written in decided something");
    eprintln!("hole reach: {reached} of {n} nodes unknown in {took:?}");
    assert!(took.as_secs() < 20, "{took:?}");
}

/// ANY WALL HOLES EVERY OPEN LATTICE. A min over a negative cycle never
/// settles: at the space wall and at the budget alike the relation is a hole
/// with the wall's reason, the cells of the cycle are `improving_cycle`,
/// what they reach is `support_withdrawn`, and a cell no cycle reaches keeps
/// its value. At the default space wall (500 000 rows) it is the half a
/// million improvements the verifier saw, answered as if final before.
#[test]
fn a_wall_holes_an_improving_cycle_and_what_it_reaches() {
    let src = "edb(e).\ne(x, y, 1).\ne(y, x, -2).\ne(y, z, 1).\ne(q, r, 1).\n\
               lattice d(A, C, min D).\nd(A, C, D) :- e(A, C, D).\nd(A, C, D) :- d(A, B, D1), e(B, C, W), D is D1 + W.\n";
    for (budget, space, reason) in [(200_000_000, None, "space_exhausted"), (20_000, Some(10_000_000), "budget_exhausted")] {
        let mut s = Session::fresh(budget);
        if let Some(sp) = space {
            s.eval.space = sp;
        }
        s.load(&boot(), None).expect("boot");
        s.load(src, None).unwrap();
        let t = Instant::now();
        let ev = s.evaluate().unwrap();
        let took = t.elapsed();
        assert!(ev.partial, "{reason}: the wall was not reached");
        let st = s.eval.store.canonical_state(&s.eval.h);
        let has = |p: &str| st.lines().any(|l| l.starts_with(p));
        assert!(has(&format!("hole[$kernel]($lattice(d),{reason})")), "{reason}: no relation hole");
        for k in ["x,$cons(x", "x,$cons(y", "y,$cons(x", "y,$cons(y"] {
            assert!(has(&format!("hole[$kernel]($lattice(d,main,0,$cons({k},$nil))),improving_cycle)")), "{reason}: {k}");
        }
        for k in ["x,$cons(z", "y,$cons(z"] {
            assert!(has(&format!("hole[$kernel]($lattice(d,main,0,$cons({k},$nil))),support_withdrawn)")), "{reason}: {k}");
        }
        assert!(has("d[main](q,r,1)"));
        assert!(!st.lines().any(|l| l.starts_with("d[main](x,") || l.starts_with("d[main](y,")), "{reason}: a cycle's value stands");
        eprintln!("{reason}: cut and holed in {took:?}");
    }
}

/// A WALL NAMES ONLY WHAT CAME BACK THROUGH ITSELF. A random positive graph
/// (every cell settles, many improving through one another) beside an
/// unrelated negative cycle that brings the wall: at the space wall every
/// cell of the positive graph keeps Floyd's value, with no hole of its own,
/// and only the negative cycle's cells are `improving_cycle`. Judged over
/// cells collapsed to one node, 2580 of these 3600 settled cells were
/// withdrawn (f_a_wall_named_cells_that_improved_through_one_another).
#[test]
fn a_wall_names_no_cell_that_improved_only_through_others() {
    let n = 60;
    let es = graph(n, 2 * n, 5);
    let inf = i64::MAX / 4;
    let mut d = vec![vec![inf; n]; n];
    for (a, b, w) in &es {
        d[*a][*b] = d[*a][*b].min(*w);
    }
    for k in 0..n {
        for i in 0..n {
            for j in 0..n {
                if d[i][k] + d[k][j] < d[i][j] {
                    d[i][j] = d[i][k] + d[k][j];
                }
            }
        }
    }
    let src = format!(
        "{}e(x, y, 1).\ne(y, x, -2).\nlattice dist(A, C, min D).\ndist(A, C, D) :- e(A, C, D).\n\
         dist(A, C, D) :- dist(A, B, D1), e(B, C, W), D is D1 + W.\n",
        edges_src(&es)
    );
    let mut s = Session::fresh(200_000_000);
    s.eval.space = 100_000;
    s.load(&boot(), None).expect("boot");
    s.load(&src, None).unwrap();
    let ev = s.evaluate().unwrap();
    assert!(ev.partial, "the wall was not reached");
    let st = s.eval.store.canonical_state(&s.eval.h);
    let named: Vec<&str> = st.lines().filter(|l| l.contains("improving_cycle")).collect();
    assert_eq!(named.len(), 4, "{named:?}");
    assert!(named.iter().all(|l| l.contains("$cons(x,") || l.contains("$cons(y,")), "{named:?}");
    assert!(!st.lines().any(|l| l.contains("support_withdrawn")), "a settled cell was withdrawn");
    let got = values(&mut s, "dist(A, C, D)");
    for i in 0..n {
        for j in 0..n {
            assert_eq!(got.get(&format!("n{i},n{j}")), Some(&d[i][j]), "dist(n{i}, n{j})");
        }
    }
}

/// A WALL BEFORE A CYCLE WAS GONE ROUND names nothing on it: no value of its
/// cells came back through its own yet, so each keeps the value it reached,
/// a bound under the relation's hole like every other (docs/aggregates.md,
/// Holes, "At a wall"). The per-cell verdict is the history the wall left,
/// so it depends on how far the wall let the cycle go.
#[test]
fn a_wall_before_a_cycle_came_round_names_none_of_it() {
    let src = "edb(e).\ne(x, y, 1).\ne(y, x, -2).\n\
               lattice d(A, C, min D).\nd(A, C, D) :- e(A, C, D).\nd(A, C, D) :- d(A, B, D1), e(B, C, W), D is D1 + W.\n";
    let (s, ev) = run(src, 4);
    assert!(ev.partial, "the wall was not reached");
    let st = s.eval.store.canonical_state(&s.eval.h);
    let has = |p: &str| st.lines().any(|l| l.starts_with(p));
    assert!(has("hole[$kernel]($lattice(d),budget_exhausted)"));
    assert!(has("d[main](x,y,1)"), "{st}");
    assert!(!st.contains("improving_cycle"), "{st}");
}
