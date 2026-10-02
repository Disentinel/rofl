//! THE RETRACTION PATH, HELD TO A FRESH EVALUATION.
//!
//! `Session::retract_delta` brings what a base fact supported to its new
//! state without evaluating the world again: a count or sum SUBTRACTS, a min,
//! max, or, and, a median, a quantile and an at_least cell is DERIVED AGAIN
//! (the one cell, its key bound), a counting tag's derivations that cited the
//! fact go and its sum subtracts them, and an order lattice's CONE (the
//! lattice facts that rested on the fact, through each other) is taken out and
//! the rules into it fired again. What that must give is what a world built
//! from the same facts and evaluated from nothing gives, byte for byte in
//! `canonical_state`, so every step of every sequence below is a
//! DIFFERENTIAL: the session that took the edits one by one, and a fresh
//! session over the facts it holds then.
//!
//! Edits are random asserts and retracts over the input relations of a world;
//! facts are given as loaded (with their `asserted_by` row) and as asserted
//! (without), and both are retracted. A retract is the delta path unless the
//! world or the fact is one it refuses, and the refusals are counted and
//! named, so a path that quietly stopped taking the delta would fail here as
//! much as one that took it wrongly.
use rofl::engine::Delta;
use rofl::session::{Retraction, Session};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

const PROGRAM: &str = "
edb(sale). edb(chan). edb(grp). edb(flag).
grp(a). grp(b). grp(c). grp(d).
total(G, S) :- S is sum(V ; K : sale(K, G, V)).
n(G, N) :- grp(G), N is count(J : sale(J, G, _)).
viach(G, N) :- grp(G), N is count(K : sale(K, G, _), chan(K, _)).
gsum(G, S) :- grp(G), S is sum(V ; K : sale(K, G, V)).
lo(G, M) :- grp(G), M is min(V : sale(_, G, V)).
hi(G, M) :- grp(G), M is max(V : sale(_, G, V)).
viahi(G, M) :- grp(G), M is max(V : sale(K, G, V), chan(K, _)).
hot(G, B) :- grp(G), B is or(X : flag(G, X)).
cold(G, B) :- grp(G), B is and(X : flag(G, X)).
both(G, S, N) :- grp(G), S is sum(V ; K : sale(K, G, V)), N is count(J : sale(J, G, _)).
";

/// A world no delta is worked out for: a rule reads `sale` outside an aggregate.
const PLAIN_READER: &str = "
edb(sale).
grp(a). grp(b).
total(G, S) :- S is sum(V ; K : sale(K, G, V)).
big(K) :- sale(K, _, V), V > 4.
";

/// The order statistics, the threshold and the rank over one relation.
const HOLISTIC: &str = "
edb(v). edb(grp).
grp(a). grp(b). grp(c).
med(G, M) :- grp(G), M is median(V ; K : v(K, G, V)).
q9(G, Q) :- grp(G), Q is quantile(90, V ; K : v(K, G, V)).
q3(G, Q) :- grp(G), Q is quantile(30, V ; K : v(K, G, V)).
two(G) :- grp(G), at_least(2, K : v(K, G, _)).
three(G) :- grp(G), at_least(3, K : v(K, G, _)).
";

/// A rule whose second aggregate is reached only for the groups the first has a value for.
const PARTIAL: &str = "
edb(v). edb(grp).
grp(a). grp(b). grp(c).
gm(G, M, N) :- grp(G), M is median(V ; K : v(K, G, V)), N is count(J : v(J, G, _)).
gs(G, S, M) :- grp(G), S is sum(V ; K : v(K, G, V)), M is median(W ; J : v(J, G, W)).
";

/// A rank, whose group is shared across its subjects, and a quantile whose
/// percent a rule hands it: the cells that stay evaluated again.
const SHARED: &str = "
edb(v). edb(pc).
pc(30). pc(90).
qp(P, G, Q) :- pc(P), grp(G), Q is quantile(P, V ; K : v(K, G, V)).
grp(a). grp(b).
";

/// Two aggregates of a rule, the second correlated on the first's result, and
/// a sum that can leave the term range.
const TRICKY: &str = "
edb(q). edb(w). edb(v).
r(N, S) :- N is count(Y : q(Y)), S is count(V : w(N, V)).
big(S) :- S is sum(X ; K : v(K, X)).
";

/// Counting tags: derivations the sum counts, from base facts read directly.
const TAGS: &str = "
edb(e). edb(w).
tag walks(A, C, counting N).
walks(A, C, N) :- e(A, C).
walks(A, C, N) :- e(A, B), e(B, C).
tag wt(A, B, counting N).
wt(A, B, W) :- w(A, B, W).
";

/// Order lattices: a min, a max, an or and an and, each recursive, and an
/// idempotent tag.
const LATTICES: &str = "
edb(e). edb(cap). edb(sd). edb(lk). edb(sat).
lattice dec(A, C, min D).
dec(A, C, D) :- sat(A, C, D).
dec(A, C, D) :- dec(A, C, D1), X is D1 - 1, D is max(X, 0).
lattice d(A, B, min W).
d(A, B, W) :- e(A, B, W).
d(A, C, W) :- d(A, B, W1), e(B, C, W2), W is W1 + W2.
lattice wide(A, B, max W).
wide(A, B, W) :- cap(A, B, W).
wide(A, C, W) :- wide(A, B, W1), cap(B, C, W2), W is min(W1, W2).
lattice tn(X, or B).
tn(X, B) :- sd(X, B).
tn(Y, B) :- tn(X, B), lk(X, Y).
lattice al(X, and B).
al(X, B) :- sd(X, B).
al(Y, B) :- al(X, B), lk(X, Y), B = false.
tag cost(A, B, tropical T).
cost(A, B, W) :- e(A, B, W).
cost(A, C, W) :- cost(A, B, _), e(B, C, W).
";

/// A value reached only through its own earlier values keeps them as its
/// history: a retraction under it is evaluated again.
const HISTORY: &str = "
edb(sat).
lattice dec(A, C, min D).
dec(A, C, D) :- sat(A, C, D).
dec(A, C, D) :- dec(A, C, D1), X is D1 - 1, D is max(X, 0).
";

/// A Pareto front: a subsumptive relation, judged against every value it was given.
const PARETO: &str = "
edb(e). edb(w). edb(st).
sd(X, Y, D) :- w(X, Y, D).
sd(X, Z, D) :- sd(X, Y, D1), w(Y, Z, W), D is D1 + W.
sd(X, Y, D1) <= sd(X, Y, D2) :- D2 < D1.
sat(A, V) :- st(A, V).
sat(A, W) :- sat(A, V), X is V - 1, W is max(X, 0).
sat(A, X) <= sat(A, Y) :- Y < X.
route(A, B, C, T) :- e(A, B, C, T).
route(A, C, C1, T1) :- route(A, B, C0, T0), e(B, C, C2, T2), C1 is C0 + C2, T1 is T0 + T2.
route(A, B, C1, T1) <= route(A, B, C2, T2) :- C2 <= C1, T2 <= T1, C2 < C1.
route(A, B, C1, T1) <= route(A, B, C2, T2) :- C2 <= C1, T2 <= T1, T2 < T1.
";

/// A lattice plain rules read from outside, one of them through another and one
/// of them around a cycle: their facts are taken out with what they rested on and
/// the rules fired again.
const LATTICE_READER: &str = "
edb(e).
lattice d(A, B, min W).
d(A, B, W) :- e(A, B, W).
d(A, C, W) :- d(A, B, W1), e(B, C, W2), W is W1 + W2.
near(A, B) :- d(A, B, W), W < 4.
two(A, C) :- near(A, B), near(B, C).
loop(A, C) :- near(A, C).
loop(A, C) :- loop(A, B), near(B, C).
";

/// Plain rules over what aggregate cells conclude.
const CONSUMERS: &str = "
edb(sale). edb(grp). edb(vip).
grp(a). grp(b). grp(c). grp(d).
total(G, S) :- S is sum(V ; K : sale(K, G, V)).
lo(G, M) :- grp(G), M is min(V : sale(_, G, V)).
big(G) :- total(G, S), S > 5.
big(G) :- vip(G).
low(G) :- lo(G, M), M < 2.
both(G) :- big(G), low(G).
n(G, N) :- grp(G), N is count(J : sale(J, G, _)).
rich(G) :- n(G, N), N >= 3.
";

/// Cells, lattices and their readers in one world: a retraction goes the way of
/// what the fact supports.
const MIXED: &str = "
edb(sale). edb(grp). edb(e). edb(w). edb(sat).
grp(a). grp(b). grp(c). grp(d).
total(G, S) :- S is sum(V ; K : sale(K, G, V)).
big(G) :- total(G, S), S > 5.
lo(G, M) :- grp(G), M is min(V : sale(_, G, V)).
lattice d(A, B, min W).
d(A, B, W) :- e(A, B, W).
d(A, C, W) :- d(A, B, W1), e(B, C, W2), W is W1 + W2.
near(A, B) :- d(A, B, W), W < 4.
lattice dec(A, C, min D).
dec(A, C, D) :- sat(A, C, D).
dec(A, C, D) :- dec(A, C, D1), X is D1 - 1, D is max(X, 0).
tag walks(A, C, counting N).
walks(A, C, N) :- w(A, C).
walks(A, C, N) :- w(A, B), w(B, C).
";

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// A random fact of a world's input relations, as a ground literal.
type Gen = fn(&mut Rng) -> String;

const G4: [&str; 4] = ["a", "b", "c", "d"];
const NODES: [&str; 6] = ["a", "b", "c", "d", "e", "f"];

fn pick<'a>(r: &mut Rng, xs: &[&'a str]) -> &'a str {
    xs[r.below(xs.len() as u64) as usize]
}

fn fact_main(r: &mut Rng) -> String {
    let g = pick(r, &G4);
    match r.below(5) {
        0..=2 => format!("sale({}, {g}, {})", 1 + r.below(8), r.below(9) as i64 - 3),
        3 => format!("chan({}, {})", 1 + r.below(8), 1 + r.below(3)),
        _ => format!("flag({g}, {})", if r.below(2) == 0 { "true" } else { "false" }),
    }
}

fn fact_plain(r: &mut Rng) -> String {
    let g = pick(r, &G4);
    format!("sale({}, {g}, {})", 1 + r.below(8), r.below(9) as i64 - 3)
}

fn fact_holistic(r: &mut Rng) -> String {
    let g = pick(r, &["a", "b", "c"]);
    format!("v({}, {g}, {})", 1 + r.below(9), r.below(12) as i64 - 2)
}

fn fact_shared(r: &mut Rng) -> String {
    let g = pick(r, &["a", "b"]);
    format!("v({}, {g}, {})", 1 + r.below(6), r.below(9))
}

fn fact_tricky(r: &mut Rng) -> String {
    const BIG: i64 = (1 << 60) - 1;
    match r.below(3) {
        0 => format!("q({})", 1 + r.below(3)),
        1 => format!("w({}, {})", 1 + r.below(3), 1 + r.below(4)),
        _ => {
            let x = match r.below(4) {
                0 => BIG,
                1 => -BIG,
                2 => BIG - r.below(3) as i64,
                _ => r.below(9) as i64 - 4,
            };
            format!("v({}, {x})", 1 + r.below(5))
        }
    }
}

fn fact_tags(r: &mut Rng) -> String {
    if r.below(5) == 0 {
        format!("w({}, {}, {})", pick(r, &NODES[..3]), pick(r, &NODES[..3]), 1 + r.below(3))
    } else {
        format!("e({}, {})", pick(r, &NODES), pick(r, &NODES))
    }
}

fn fact_lattice(r: &mut Rng) -> String {
    match r.below(12) {
        10..=11 => format!("sat({}, {}, {})", pick(r, &NODES[..3]), pick(r, &NODES[..3]), r.below(6)),
        0..=3 => format!("e({}, {}, {})", pick(r, &NODES), pick(r, &NODES), 1 + r.below(6)),
        4..=5 => format!("cap({}, {}, {})", pick(r, &NODES), pick(r, &NODES), 1 + r.below(7)),
        6..=7 => format!("lk({}, {})", pick(r, &NODES), pick(r, &NODES)),
        _ => format!("sd({}, {})", pick(r, &NODES), if r.below(2) == 0 { "true" } else { "false" }),
    }
}

fn fact_sat(r: &mut Rng) -> String {
    format!("sat({}, {}, {})", pick(r, &NODES[..3]), pick(r, &NODES[..3]), r.below(6))
}

fn fact_pareto(r: &mut Rng) -> String {
    match r.below(10) {
        0..=1 => return format!("w({}, {}, {})", pick(r, &NODES[..4]), pick(r, &NODES[..4]), 1 + r.below(4)),
        2 => return format!("st({}, {})", pick(r, &NODES[..3]), r.below(5)),
        _ => {}
    }
    format!("e({}, {}, {}, {})", pick(r, &NODES[..4]), pick(r, &NODES[..4]), 1 + r.below(4), 1 + r.below(4))
}

fn fact_mixed(r: &mut Rng) -> String {
    match r.below(10) {
        0..=2 => fact_plain(r),
        3..=4 => format!("e({}, {}, {})", pick(r, &NODES[..4]), pick(r, &NODES[..4]), 1 + r.below(5)),
        5..=6 => format!("w({}, {})", pick(r, &NODES[..4]), pick(r, &NODES[..4])),
        7 => format!("sat({}, {}, {})", pick(r, &NODES[..3]), pick(r, &NODES[..3]), r.below(5)),
        _ => fact_plain(r),
    }
}

fn fact_consumers(r: &mut Rng) -> String {
    if r.below(8) == 0 {
        return format!("vip({})", pick(r, &G4));
    }
    fact_plain(r)
}

fn fact_edge(r: &mut Rng) -> String {
    format!("e({}, {}, {})", pick(r, &NODES), pick(r, &NODES), 1 + r.below(6))
}

fn boot() -> String {
    std::fs::read_to_string(repo().join("boot.rofl")).expect("boot.rofl")
}

/// A world built from nothing: the program, `loaded` as the text of its file,
/// `asserted` through the API, evaluated once.
fn fresh(program: &str, loaded: &BTreeSet<String>, asserted: &BTreeSet<String>) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).expect("boot");
    let text: String = loaded.iter().map(|f| format!("{f}.\n")).collect();
    s.load(&format!("{program}\n{text}"), None).unwrap_or_else(|d| panic!("{d:?}"));
    for f in asserted {
        s.assert(&format!("{f}.")).unwrap();
    }
    s.evaluate().expect("evaluates");
    s
}

/// `cell-key id` of every member of a count or sum cell in a state.
fn member_ids(state: &str) -> BTreeSet<String> {
    let mut invertible: BTreeSet<&str> = BTreeSet::new();
    let mut out = BTreeSet::new();
    for l in state.lines() {
        if let Some(rest) = l.strip_prefix("cell ") {
            if rest.contains(" alg=invertible") {
                invertible.insert(rest.split(' ').next().unwrap());
            }
        } else if let Some(rest) = l.strip_prefix("mem ") {
            let mut it = rest.split(' ');
            let key = it.next().unwrap();
            if invertible.contains(key) {
                if let Some(id) = it.nth(1) {
                    out.insert(format!("{key} {id}"));
                }
            }
        }
    }
    out
}

fn state(s: &mut Session) -> String {
    if s.eval.store.dirty {
        s.evaluate().expect("evaluates");
    }
    s.eval.store.canonical_state(&s.eval.h)
}

#[derive(Default, Debug)]
struct Stats {
    edits: usize,
    asserts: usize,
    retracts: usize,
    delta: usize,
    full: BTreeSet<&'static str>,
    full_n: usize,
    explained: usize,
    sum: Delta,
}

impl Stats {
    fn add(&mut self, o: Stats) {
        self.edits += o.edits;
        self.asserts += o.asserts;
        self.retracts += o.retracts;
        self.delta += o.delta;
        self.full_n += o.full_n;
        self.explained += o.explained;
        self.full.extend(o.full);
        self.sum.take(&o.sum);
    }
}

trait Sum {
    fn take(&mut self, o: &Delta);
}
impl Sum for Delta {
    fn take(&mut self, o: &Delta) {
        self.cells += o.cells;
        self.subtracted += o.subtracted;
        self.members_dropped += o.members_dropped;
        self.members_rederived += o.members_rederived;
        self.rederived += o.rederived;
        self.refired += o.refired;
        self.retired += o.retired;
        self.withdrawn += o.withdrawn;
        self.cone += o.cone;
        self.consumers += o.consumers;
    }
}

/// A fact key `rel[main](args)` as the question `rel(args)`, where one can ask it.
fn question(key: &str) -> Option<String> {
    if key.contains('@') || key.contains('$') || !key.contains("[main](") {
        return None;
    }
    Some(key.replacen("[main](", "(", 1))
}

/// The derived facts of a state, as questions.
fn derived(state: &str) -> Vec<String> {
    state.lines().filter(|l| l.contains(" drv support=")).filter_map(|l| question(l.split(' ').next().unwrap())).collect()
}

/// What the world answers when asked why of what holds and why not of what
/// held and does not, in the session that took the edits and in one built
/// from nothing: the explanations read what an evaluation left in the engine,
/// which the delta path must leave as a full one does.
fn same_answers(delta: &mut Session, fresh: &mut Session, was: &[String], now: &[String]) -> Result<usize, String> {
    let mut n = 0;
    for q in now.iter().take(40) {
        let (a, b) = (delta.why_all(q), fresh.why_all(q));
        if a != b {
            return Err(format!("why {q}:\n  delta: {a:?}\n  fresh: {b:?}"));
        }
        n += 1;
    }
    let bounds = rofl::engine::WhynotBounds::default();
    for q in was.iter().filter(|q| !now.contains(q)).take(8) {
        let (a, b) = (delta.whynot(q, &bounds), fresh.whynot(q, &bounds));
        if a != b {
            return Err(format!("whynot {q}:\n  delta: {a:?}\n  fresh: {b:?}"));
        }
        n += 1;
    }
    Ok(n)
}

/// `steps` random edits over a world, each checked against a fresh world.
fn differential(program: &str, gen: Gen, seed: u64, start: usize, steps: usize, every: usize) -> Stats {
    let mut r = Rng(seed);
    let mut loaded: BTreeSet<String> = BTreeSet::new();
    let mut asserted: BTreeSet<String> = BTreeSet::new();
    for _ in 0..start {
        let f = gen(&mut r);
        if loaded.contains(&f) || asserted.contains(&f) {
            continue;
        }
        if r.below(2) == 0 { loaded.insert(f) } else { asserted.insert(f) };
    }
    let mut s = fresh(program, &loaded, &asserted);
    let mut st = Stats::default();
    let mut log: Vec<String> = Vec::new();
    let mut was: Vec<String> = derived(&state(&mut s));
    assert_eq!(state(&mut s), state(&mut fresh(program, &loaded, &asserted)), "the start");
    for step in 0..steps {
        st.edits += 1;
        let present: Vec<String> = loaded.iter().chain(asserted.iter()).cloned().collect();
        if r.below(100) < 40 || present.is_empty() {
            let f = gen(&mut r);
            if loaded.contains(&f) || asserted.contains(&f) {
                continue;
            }
            s.assert(&format!("{f}.")).unwrap();
            asserted.insert(f.clone());
            st.asserts += 1;
            log.push(format!("assert {f}"));
        } else {
            let f = present[r.below(present.len() as u64) as usize].clone();
            log.push(format!("retract {f}"));
            let before = member_ids(&state(&mut s));
            let mut by_delta = false;
            match s.retract_delta(&f).unwrap_or_else(|e| panic!("{f}: {e}")) {
                Retraction::Delta(d) => {
                    by_delta = true;
                    st.delta += 1;
                    st.sum.take(&d);
                }
                Retraction::Full(why) => {
                    st.full.insert(why);
                    st.full_n += 1;
                }
            }
            loaded.remove(&f);
            asserted.remove(&f);
            st.retracts += 1;
            // a member that survives a retraction is the same id, wherever it sits now; an evaluation again may seal cells of its own
            let after = member_ids(&state(&mut s));
            let new: Vec<&String> = after.difference(&before).collect();
            assert!(!by_delta || new.is_empty(), "seed {seed} step {step}: a retraction of {f} gave a member an id it did not have: {new:?}");
        }
        if (step + 1) % every != 0 {
            continue;
        }
        let got = state(&mut s);
        let mut f = fresh(program, &loaded, &asserted);
        let want = state(&mut f);
        if got == want {
            let now = derived(&got);
            match same_answers(&mut s, &mut f, &was, &now) {
                Ok(n) => st.explained += n,
                Err(e) => panic!("seed {seed} step {step}: the explanations differ after {:?}\n  {e}", log.iter().rev().take(4).collect::<Vec<_>>()),
            }
            was = now;
        }
        if got != want {
            if let Ok(dir) = std::env::var("INCR_DUMP") {
                std::fs::write(format!("{dir}/delta.state"), &got).unwrap();
                std::fs::write(format!("{dir}/fresh.state"), &want).unwrap();
                std::fs::write(format!("{dir}/edits.log"), log.join("\n")).unwrap();
                let text: String = loaded.iter().chain(asserted.iter()).map(|f| format!("{f}.\n")).collect();
                std::fs::write(format!("{dir}/world.rofl"), format!("{program}\n{text}")).unwrap();
            }
            let (g, w): (Vec<&str>, Vec<&str>) = (got.lines().collect(), want.lines().collect());
            let at = g.iter().zip(w.iter()).position(|(a, b)| a != b).unwrap_or(g.len().min(w.len()));
            let tail = log.iter().rev().take(6).rev().cloned().collect::<Vec<_>>().join("\n  ");
            panic!(
                "seed {seed} step {step}: the delta state is not a fresh evaluation's\n  last edits:\n  {tail}\n  line {at}\n  delta: {}\n  fresh: {}\n  lines: {} vs {}",
                g.get(at).unwrap_or(&"<end>"),
                w.get(at).unwrap_or(&"<end>"),
                g.len(),
                w.len()
            );
        }
    }
    st
}

/// `seeds` sequences over one world, summed.
fn sweep(program: &str, gen: Gen, seeds: std::ops::RangeInclusive<u64>, start: usize, steps: usize) -> Stats {
    let mut all = Stats::default();
    for seed in seeds {
        all.add(differential(program, gen, seed * 7919, start, steps, 1));
    }
    eprintln!("{all:?}");
    all
}

#[test]
fn a_retraction_is_a_fresh_evaluation_over_random_edits() {
    let mut all = Stats::default();
    for seed in 1..=12u64 {
        all.add(differential(PROGRAM, fact_main, seed * 7919, 14, 40, 1));
    }
    eprintln!("{all:?}");
    // the path was taken, and every way it has of changing a cell was used
    assert!(all.retracts > 150, "{all:?}");
    assert_eq!(all.full_n, 0, "a retract of an input relation fell back: {:?}", all.full);
    assert!(all.sum.subtracted > 50, "no cell was subtracted: {all:?}");
    assert!(all.sum.members_dropped > 20, "no member was dropped: {all:?}");
    assert!(all.sum.members_rederived > 5, "no member kept its place under another derivation: {all:?}");
    assert!(all.sum.rederived > 30, "no idempotent cell was derived again: {all:?}");
    assert!(all.sum.retired > 20 && all.sum.refired > 20, "the readers of the cells were not read again: {all:?}");
}

#[test]
fn a_larger_world_takes_the_same_path() {
    let st = differential(PROGRAM, fact_main, 0x5eed, 60, 120, 6);
    eprintln!("{st:?}");
    assert_eq!(st.full_n, 0, "{:?}", st.full);
    assert!(st.sum.subtracted > 20 && st.sum.rederived > 10, "{st:?}");
}

#[test]
fn a_world_the_path_is_not_worked_out_for_is_evaluated_again_and_is_the_same() {
    let st = differential(PLAIN_READER, fact_plain, 31337, 8, 40, 1);
    eprintln!("{st:?}");
    assert!(st.full_n > 5, "{st:?}");
    assert!(st.full.contains("a rule reads the relation outside an aggregate, or negated"), "{:?}", st.full);
}

#[test]
fn the_median_the_quantile_and_the_threshold_are_derived_again() {
    let all = sweep(HOLISTIC, fact_holistic, 1..=10, 16, 40);
    assert!(all.retracts > 100, "{all:?}");
    assert!(all.sum.rederived > 100, "no cell of an order statistic or a threshold was derived again: {all:?}");
    assert!(all.sum.refired > 50 && all.sum.retired > 50, "{all:?}");
    // only a grouping fact (read outside the aggregates) is a full evaluation
    assert!(all.full.iter().all(|w| *w == "a rule reads the relation outside an aggregate, or negated"), "{:?}", all.full);
}

#[test]
fn an_aggregate_after_one_that_may_leave_no_solution_is_evaluated_again_and_is_the_same() {
    let all = sweep(PARTIAL, fact_holistic, 1..=8, 12, 40);
    assert!(all.full.contains("an aggregate follows one that may leave no solution"), "{all:?}");
}

#[test]
fn a_shared_group_is_evaluated_again_by_name() {
    let all = sweep(SHARED, fact_shared, 1..=6, 10, 30);
    assert!(all.sum.rederived == 0, "{all:?}");
    assert!(all.full.contains("a quantile whose percent is read from outside"), "{:?}", all.full);
}

#[test]
fn correlated_aggregates_and_overflow_are_evaluated_again_and_are_the_same() {
    let all = sweep(TRICKY, fact_tricky, 1..=16, 10, 40);
    assert!(all.full.contains("an aggregate reads what another aggregate of its rule binds"), "{:?}", all.full);
    assert!(all.full.contains("a cell holding a hole") || all.full.iter().any(|w| w.contains("write a hole")), "{:?}", all.full);
    assert!(all.sum.subtracted > 0, "the sum was never subtracted: {all:?}");
}

#[test]
fn a_counting_tag_subtracts_the_derivations_a_fact_made() {
    let all = sweep(TAGS, fact_tags, 1..=10, 14, 40);
    assert!(all.retracts > 100, "{all:?}");
    assert_eq!(all.full_n, 0, "{:?}", all.full);
    assert!(all.sum.withdrawn > 50 && all.sum.subtracted > 50 && all.sum.members_dropped > 50, "{all:?}");
}

#[test]
fn an_order_lattice_is_derived_again_over_its_cone() {
    let all = sweep(LATTICES, fact_lattice, 1..=12, 14, 40);
    assert!(all.retracts > 150, "{all:?}");
    assert!(all.sum.cone > 100, "no cone was taken out and derived again: {all:?}");
    assert!(all.delta > 100, "{all:?}");
}

#[test]
fn a_larger_lattice_world_takes_the_same_path() {
    let st = differential(LATTICES, fact_lattice, 0x1a77, 50, 100, 5);
    eprintln!("{st:?}");
    assert!(st.sum.cone > 100 && st.delta > 50, "{st:?}");
}

#[test]
fn a_lattice_that_keeps_a_history_is_evaluated_again_by_name() {
    let all = sweep(HISTORY, fact_sat, 1..=8, 6, 30);
    assert!(all.full.contains("a lattice keeps the history of a superseded value"), "{:?}", all.full);
    assert!(all.sum.cone > 0, "a world with a history is a delta when nothing rests on it: {all:?}");
}

#[test]
fn a_subsumptive_relation_is_derived_again_key_by_key() {
    let all = sweep(PARETO, fact_pareto, 1..=8, 8, 30);
    assert!(all.sum.cone > 50 && all.delta > 50, "no key of a front was derived again: {all:?}");
    assert!(all.explained > 1000, "{all:?}");
}

#[test]
fn the_rules_that_read_a_lattice_are_fired_again_over_what_changed() {
    let all = sweep(LATTICE_READER, fact_edge, 1..=8, 10, 30);
    assert!(all.sum.consumers > 50, "no fact of a rule reading the lattice was taken out and derived again: {all:?}");
    assert!(all.delta > 100, "{all:?}");
}

#[test]
fn the_rules_that_read_a_cell_are_fired_again_over_what_changed() {
    let all = sweep(CONSUMERS, fact_consumers, 1..=10, 14, 40);
    assert!(all.sum.consumers > 50, "no fact of a rule reading a cell's conclusion was taken out and derived again: {all:?}");
    assert!(all.delta > 100, "{all:?}");
}

#[test]
fn cells_lattices_and_tags_in_one_world_each_take_their_own_path() {
    let all = sweep(MIXED, fact_mixed, 1..=10, 16, 40);
    assert!(all.sum.cone > 20 && all.sum.subtracted > 20 && all.sum.withdrawn > 20 && all.sum.consumers > 20, "{all:?}");
    assert!(all.delta > 150, "{all:?}");
}

#[test]
fn a_fact_a_rule_reads_outside_the_aggregate_is_refused_by_name() {
    let mut s = fresh(PROGRAM, &["grp(a)", "sale(1, a, 3)"].iter().map(|x| x.to_string()).collect(), &BTreeSet::new());
    match s.retract_delta("grp(a)").unwrap() {
        Retraction::Full(why) => assert_eq!(why, "a rule reads the relation outside an aggregate, or negated"),
        other => panic!("{other:?}"),
    }
    let mut s = fresh(PROGRAM, &["sale(1, a, 3)"].iter().map(|x| x.to_string()).collect(), &BTreeSet::new());
    match s.retract_delta("sale(1, a, 3)").unwrap() {
        Retraction::Delta(d) => assert!(d.cells > 0 && d.subtracted > 0, "{d:?}"),
        other => panic!("{other:?}"),
    }
}
