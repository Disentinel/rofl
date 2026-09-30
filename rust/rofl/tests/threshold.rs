//! THE THRESHOLD, held where a world cannot hold it: at scale against a
//! fixpoint computed here, independent of the order its input arrives in, and
//! closed whatever the budget cut (docs/aggregates.md, "The threshold, as
//! built").
use rofl::cell::AggOp;
use rofl::session::Session;
use rofl::store::PremRef;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;

fn read(p: &str) -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").join(p)).unwrap()
}

fn run(src: &str, budget: i64) -> Session {
    let mut s = Session::fresh(budget);
    s.load(&read("boot.rofl"), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    s
}

const BELIEF: &str = "believed(X) :- root(X).\nbelieved(X) :- at_least(2, S : sup(S, X), believed(S)).\n";

/// A seeded support graph: `n` nodes, `roots` of them believed outright, and
/// each node supported by three random others.
fn support(n: usize, roots: usize, seed: u64) -> (Vec<usize>, Vec<(usize, usize)>) {
    let mut x = seed;
    let mut next = || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    // roots in pairs, and each node supported by the one before it and by
    // two more, the one before that or anywhere: the belief runs along the
    // chain, across cycles, and stops where a random source is not believed
    let rs: Vec<usize> = (0..roots).flat_map(|i| [i * (n / roots), i * (n / roots) + 1]).collect();
    let mut es: HashSet<(usize, usize)> = HashSet::new();
    for b in 0..n {
        es.insert(((b + n - 1) % n, b));
        let mut k = 0;
        while k < 2 {
            let a = if next() % 2 == 0 { (b + n - 2) % n } else { next() % n };
            if a != b && es.insert((a, b)) {
                k += 1;
            }
        }
    }
    let mut es: Vec<_> = es.into_iter().collect();
    es.sort();
    (rs, es)
}

fn src_of(rs: &[usize], es: &[(usize, usize)], rev: bool) -> String {
    let mut lines: Vec<String> = vec!["edb(root).".into(), "edb(sup).".into()];
    lines.extend(rs.iter().map(|r| format!("root(n{r}).")));
    lines.extend(es.iter().map(|(a, b)| format!("sup(n{a}, n{b}).")));
    if rev {
        lines.reverse();
    }
    format!("{}\n{BELIEF}", lines.join("\n"))
}

/// The belief and its heights, computed here: believed when two believed
/// sources support it; a root's height is 1, a member's 1 + its source's,
/// a quorum's its second-lowest member's (ties broken by name, as `why`
/// orders them), a belief's the lowest of its firings.
fn oracle(n: usize, rs: &[usize], es: &[(usize, usize)]) -> (HashMap<usize, u32>, HashMap<usize, (u32, Vec<String>)>) {
    let mut into: HashMap<usize, Vec<usize>> = HashMap::new();
    for (a, b) in es {
        into.entry(*b).or_default().push(*a);
    }
    let mut h: HashMap<usize, u32> = rs.iter().map(|r| (*r, 1)).collect();
    let mut quorum: HashMap<usize, (u32, Vec<String>)> = HashMap::new();
    loop {
        let mut changed = false;
        for b in 0..n {
            let mut ms: Vec<(u32, String)> = into
                .get(&b)
                .into_iter()
                .flatten()
                .filter_map(|a| h.get(a).map(|ha| (ha + 1, format!("(n{a})"))))
                .collect();
            if ms.len() < 2 {
                continue;
            }
            ms.sort_by(|x, y| x.0.cmp(&y.0).then_with(|| x.1.cmp(&y.1)));
            ms.truncate(2);
            let cell = ms[1].0;
            let hb = if rs.contains(&b) { 1 } else { cell + 1 };
            let q = (cell, ms.into_iter().map(|m| m.1).collect());
            if h.get(&b) != Some(&hb) || quorum.get(&b) != Some(&q) {
                h.insert(b, hb);
                quorum.insert(b, q);
                changed = true;
            }
        }
        if !changed {
            return (h, quorum);
        }
    }
}

#[test]
fn a_recursive_quorum_at_scale_is_the_fixpoint_computed_here() {
    let n = 3000;
    let (rs, es) = support(n, 60, 7);
    let (want, quorums) = oracle(n, &rs, &es);
    assert!(want.len() > rs.len() * 3 && want.len() < n, "the belief spreads, and not to everything: {} of {n}", want.len());
    let t = Instant::now();
    let mut s = run(&src_of(&rs, &es, false), 200_000_000);
    let took = t.elapsed();
    let got: HashSet<String> = s.ask("believed(X)").unwrap().rows.into_iter().map(|r| r[0].clone()).collect();
    let want_names: HashSet<String> = want.keys().map(|k| format!("n{k}")).collect();
    assert_eq!(got, want_names, "the belief is the fixpoint");
    // every quorum: its two members, and its height, as computed here
    let st = &s.eval.store;
    let mut checked = 0;
    for c in st.cell_ids_sorted(&s.eval.h) {
        let r = st.cell(c);
        if r.op != AggOp::AtLeast {
            continue;
        }
        let node: usize = s.eval.h.canon(r.key[0]).trim_start_matches('n').parse().unwrap();
        let (hq, ms) = &quorums[&node];
        let members: Vec<String> = st.cell_members(c).iter().map(|m| rofl::store::tuple_text(&s.eval.h, &m.proj)).collect();
        assert_eq!(&members, ms, "the quorum of n{node}");
        assert_eq!(r.height, *hq, "the height of n{node}'s quorum");
        checked += 1;
    }
    assert!(checked > 100, "{checked} quorums checked");
    assert!(took.as_secs() < 30, "{n} nodes took {took:?}");
}

#[test]
fn the_quorum_does_not_depend_on_the_order_its_input_arrives_in() {
    let (rs, es) = support(300, 6, 11);
    let cells = |s: &Session| -> Vec<String> {
        s.eval.store.canonical_state(&s.eval.h).lines().filter(|l| l.starts_with("cell ") || l.starts_with("mem ")).map(String::from).collect()
    };
    let a = cells(&run(&src_of(&rs, &es, false), 200_000_000));
    let b = cells(&run(&src_of(&rs, &es, true), 200_000_000));
    let mut shuffled = es.clone();
    shuffled.sort_by_key(|(x, y)| (x * 7919 + y * 104729) % 1013);
    let c = cells(&run(&src_of(&rs, &shuffled, false), 200_000_000));
    assert!(a.len() > 20, "{} cell lines", a.len());
    assert_eq!(a, b, "input reversed");
    assert_eq!(a, c, "input shuffled");
}

/// A BUDGET CUT LEAVES NO QUORUM OPEN. Whatever was reached before the wall
/// is closed over what was derived: exactly N members, the first by height,
/// each member's height its premises' plus one, the cell's its highest
/// member's.
#[test]
fn a_budget_cut_leaves_every_quorum_closed() {
    let src = format!("{}\n{}", read("examples/checks/agg-threshold-data.rofl"), read("examples/checks/agg-threshold-raft.rofl"));
    let mut base = Session::fresh(200_000_000);
    base.load(&read("boot.rofl"), None).unwrap();
    base.load(&src, None).unwrap();
    let mut full = base.fork();
    let steps = full.evaluate().unwrap().steps;
    let mut cut = 0;
    let mut seen = 0;
    for b in (1..steps).step_by(3) {
        let mut s = base.fork();
        s.eval.budget = b;
        if !s.evaluate().unwrap().partial {
            continue;
        }
        cut += 1;
        let st = &s.eval.store;
        let h = &s.eval.h;
        for c in st.cell_ids_sorted(h) {
            let r = st.cell(c);
            if r.op != AggOp::AtLeast {
                continue;
            }
            seen += 1;
            let desc = h.name(r.desc);
            let need: usize = desc["at_least(".len()..].split(',').next().unwrap().trim().parse().unwrap();
            let ms = st.cell_members(c);
            assert_eq!(ms.len(), need, "budget {b}: {desc} has {} members", ms.len());
            let mut top = 0;
            let mut last = 0;
            for m in ms {
                let roots: Vec<u32> = st.member_prems(m).iter().filter_map(|p| if let PremRef::Fact(f) = p { Some(*f) } else { None }).collect();
                let mut memo = HashMap::new();
                st.heights(&roots, &mut memo).unwrap();
                let want = 1 + roots.iter().map(|f| memo[f]).max().unwrap_or(0);
                assert_eq!(m.height, want, "budget {b}: a member of {desc}");
                assert!(m.height >= last, "budget {b}: {desc} is not in height order");
                last = m.height;
                top = top.max(m.height);
            }
            assert_eq!(r.height, top, "budget {b}: the height of {desc}");
        }
    }
    assert!(cut > 10 && seen > 10, "{cut} cuts, {seen} quorums seen");
}

const VIA: &str = "believed(X) :- root(X).\nbelieved(X) :- at_least(2, S : sup(S, X, V), believed(V)).\n";

/// A MEMBER IS AS LOW AS ITS LOWEST DERIVATION. Each node is backed by three
/// of ten supporters, each through one to three believed nodes, cycles and
/// all: a supporter is a member at 1 + its lowest believed via, the quorum
/// the first two by that height and then name, whatever derivation sorts
/// first by text — and a via that rests on the belief itself never makes a
/// member unfounded when another via is founded.
#[test]
fn a_member_with_many_derivations_is_at_its_least_height() {
    let n = 400;
    let mut x = 5u64;
    let mut next = move || {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (x >> 33) as usize
    };
    let roots: Vec<usize> = (0..n).step_by(40).flat_map(|r| [r, r + 1]).collect();
    let mut es: Vec<(usize, usize, usize)> = Vec::new();
    for b in 0..n {
        let mut ss: Vec<usize> = Vec::new();
        while ss.len() < 3 {
            let s = next() % 10;
            if !ss.contains(&s) {
                ss.push(s);
            }
        }
        for s in ss {
            for _ in 0..1 + next() % 3 {
                let v = if next() % 3 == 0 { next() % n } else { (b + n - 1 - next() % 3) % n };
                if !es.contains(&(s, b, v)) {
                    es.push((s, b, v));
                }
            }
        }
    }
    let mut lines: Vec<String> = vec!["edb(root).".into(), "edb(sup).".into()];
    lines.extend(roots.iter().map(|r| format!("root(n{r}).")));
    lines.extend(es.iter().map(|(s, b, v)| format!("sup(s{s}, n{b}, n{v}).")));
    let mut s = run(&format!("{}\n{VIA}", lines.join("\n")), 200_000_000);
    // the oracle: least heights, iterated to their fixpoint
    let mut h: HashMap<usize, u32> = roots.iter().map(|r| (*r, 1)).collect();
    let mut quorum: HashMap<usize, (u32, Vec<String>)> = HashMap::new();
    loop {
        let mut changed = false;
        for b in 0..n {
            let mut best: HashMap<usize, u32> = HashMap::new();
            for (sp, _, v) in es.iter().filter(|e| e.1 == b) {
                if let Some(hv) = h.get(v) {
                    let e = best.entry(*sp).or_insert(u32::MAX);
                    *e = (*e).min(hv + 1);
                }
            }
            let mut ms: Vec<(u32, String)> = best.into_iter().map(|(sp, hh)| (hh, format!("(s{sp})"))).collect();
            if ms.len() < 2 {
                continue;
            }
            ms.sort();
            ms.truncate(2);
            let cell = ms[1].0;
            let hb = if roots.contains(&b) { 1 } else { cell + 1 };
            let q = (cell, ms.into_iter().map(|m| m.1).collect());
            if h.get(&b) != Some(&hb) || quorum.get(&b) != Some(&q) {
                h.insert(b, hb);
                quorum.insert(b, q);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    let got: HashSet<String> = s.ask("believed(X)").unwrap().rows.into_iter().map(|r| r[0].clone()).collect();
    let want: HashSet<String> = h.keys().map(|k| format!("n{k}")).collect();
    assert!(want.len() > roots.len() * 3, "the belief spreads: {} of {n}", want.len());
    assert_eq!(got, want, "the belief is the fixpoint");
    let st = &s.eval.store;
    let mut checked = 0;
    for c in st.cell_ids_sorted(&s.eval.h) {
        let r = st.cell(c);
        if r.op != AggOp::AtLeast {
            continue;
        }
        let node: usize = s.eval.h.canon(r.key[0]).trim_start_matches('n').parse().unwrap();
        let (hq, ms) = &quorum[&node];
        let members: Vec<String> = st.cell_members(c).iter().map(|m| rofl::store::tuple_text(&s.eval.h, &m.proj)).collect();
        assert_eq!(&members, ms, "the quorum of n{node}");
        assert_eq!(r.height, *hq, "the height of n{node}'s quorum");
        checked += 1;
    }
    assert!(checked > 50, "{checked} quorums checked");
}

/// The smallest such case, where the text-least derivation of a member rests
/// on the very belief its quorum supports and the quorum has no one else.
#[test]
fn a_member_founded_by_its_other_derivation_reaches_the_quorum() {
    let src = "edb(node). edb(e). edb(okb).\nnode(x). e(w,x,v1). e(w,x,v2). e(u,x,v2). okb(v2).\n\
               ok(V) :- okb(V).\nok(v1) :- b(x).\nb(X) :- node(X), at_least(2, W : e(W,X,V), ok(V)).\n";
    let mut s = run(src, 1_000_000);
    let rows = s.ask("b(X)").unwrap().rows;
    assert_eq!(rows, vec![vec!["x".to_string()]]);
}

/// A DEEP RECURSION COSTS STEPS LINEAR IN ITS DEPTH. Each node is believed
/// on the two before it, so the belief grows by one node a round; a round's
/// news reaches two groups, and only they are solved again, by the news.
#[test]
fn a_deep_recursive_quorum_costs_steps_linear_in_its_depth() {
    let chain = |n: usize| -> String {
        let mut lines: Vec<String> = vec!["edb(root).".into(), "edb(sup).".into(), "root(n0).".into(), "root(n1).".into()];
        for i in 2..n {
            lines.push(format!("sup(n{}, n{i}).", i - 1));
            lines.push(format!("sup(n{}, n{i}).", i - 2));
        }
        format!("{}\n{BELIEF}", lines.join("\n"))
    };
    let steps = |n: usize| -> i64 {
        let mut s = Session::fresh(200_000_000);
        s.load(&read("boot.rofl"), None).unwrap();
        let before = s.evaluate().unwrap().steps;
        s.load(&chain(n), None).unwrap();
        let t = Instant::now();
        let e = s.evaluate().unwrap();
        assert!(t.elapsed().as_secs() < 10, "{n} deep took {:?}", t.elapsed());
        assert_eq!(s.ask("believed(X)").unwrap().rows.len(), n, "the whole chain is believed");
        e.steps - before
    };
    let (a, b) = (steps(1000), steps(4000));
    assert!(b <= 4 * a + 4 * 1000, "steps grow faster than the depth: {a} at 1000, {b} at 4000");
    assert!(b < 40 * 4000, "{b} steps for 4000 nodes");
}
