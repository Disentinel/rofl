//! THE ADDITION PATH, HELD TO A FRESH EVALUATION.
//!
//! `Session::assert_delta` and `Session::load_delta` bring an evaluated world to
//! the state a fresh evaluation of the whole program gives once facts or rules
//! are added, without clearing what it derived. Every step below is a
//! DIFFERENTIAL: the session that took the additions one by one, and a fresh
//! session that took the same loads and asserts and was evaluated once,
//! compared byte for byte in `canonical_state` (and the staged facts), and on
//! `why all` of what holds and `whynot` of what held and does not.
//!
//! Programs are random: layered relations whose rules join, recurse, negate,
//! count, sum, take a min or a max, reach a threshold and stage `@next`, plus
//! fixed worlds for the order lattice, a declared tree and the asks cone. Each
//! program is split into the rules loaded first and rules added later, and its
//! facts into those loaded first and those asserted or loaded later; retracts
//! are mixed in. An addition the path refuses says why, and the reasons and
//! the rate are counted, so a path that quietly stopped taking the delta fails
//! here as much as one that took it wrongly.
use rofl::engine::AddDelta;
use rofl::session::{Addition, Retraction, Session};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn boot() -> String {
    std::fs::read_to_string(repo().join("boot.rofl")).expect("boot.rofl")
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
    fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len() as u64) as usize]
    }
}

const ATOMS: [&str; 5] = ["a", "b", "c", "d", "e"];

#[derive(Clone)]
enum Op {
    Load(String),
    Assert(String),
    Retract(String),
}

/// A random stratified program: relations p1..pN of arity 2, each with one or two rules; a rule of pI reads
/// positively any base relation or pJ with J <= I, and under a negation or an aggregate only those with J < I.
fn program(r: &mut Rng) -> Vec<String> {
    let n = 3 + r.below(4) as usize;
    let mut rules = Vec::new();
    for i in 1..=n {
        let pos: Vec<String> = std::iter::once("e".to_string()).chain((1..=i).map(|j| format!("p{j}"))).collect();
        let strict: Vec<String> = std::iter::once("e".to_string()).chain((1..i).map(|j| format!("p{j}"))).collect();
        for k in 0..(1 + r.below(2)) {
            let (a, b) = (r.pick(&pos).clone(), r.pick(&pos).clone());
            let s = r.pick(&strict).clone();
            let t = if k == 0 { r.below(12) } else { 1 + r.below(11) };
            let rule = match t {
                0 => format!("p{i}(X, Y) :- e(X, Y)."),
                1 => format!("p{i}(X, Z) :- {a}(X, Y), {b}(Y, Z)."),
                2 => format!("p{i}(X, Y) :- {a}(X, Y), not {s}(Y, X)."),
                3 => format!("p{i}(X, X) :- n(X), not {s}(X, _)."),
                4 => format!("p{i}(X, N) :- n(X), N is count(Y : {s}(X, Y))."),
                5 => format!("p{i}(X, S) :- n(X), S is sum(V ; Y : {s}(X, Y), w(Y, V))."),
                6 => format!("p{i}(X, M) :- n(X), M is min(V : {s}(X, Y), w(Y, V))."),
                7 => format!("p{i}(X, Z) :- p{i}(X, Y), e(Y, Z)."),
                8 => format!("p{i}(X, Y) :- {a}(X, Y), X != Y."),
                9 => format!("p{i}(X, X) :- n(X), at_least(2, Y : {s}(X, Y))."),
                10 => format!("p{i}(X, Y)@next :- {a}(X, Y)."),
                _ => format!("p{i}(X, M) :- n(X), M is max(V : w(X, V), {s}(X, _))."),
            };
            rules.push(rule);
        }
    }
    rules
}

fn fact(r: &mut Rng) -> String {
    match r.below(5) {
        0 | 1 => format!("e({}, {})", r.pick(&ATOMS), r.pick(&ATOMS)),
        2 => format!("n({})", r.pick(&ATOMS)),
        _ => format!("w({}, {})", r.pick(&ATOMS), 1 + r.below(5)),
    }
}

const EDB: &str = "edb(e). edb(n). edb(w).";

fn state(s: &mut Session) -> String {
    if s.eval.store.dirty {
        s.evaluate().expect("evaluates");
    }
    let mut out = s.eval.canonical_state();
    out.push_str("\nstaged\n");
    out.push_str(&s.eval.staged_text());
    out
}

/// The same loads and asserts, evaluated once at the end.
fn replay(ops: &[Op]) -> Option<Session> {
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).expect("boot");
    for op in ops {
        match op {
            Op::Load(t) => {
                s.load(t, None).ok()?;
            }
            Op::Assert(t) => {
                s.assert(t).ok()?;
            }
            Op::Retract(q) => {
                s.retract(q).ok()?;
            }
        }
    }
    s.evaluate().ok()?;
    Some(s)
}

fn question(key: &str) -> Option<String> {
    if key.contains('@') || key.contains('$') || !key.contains("[main](") {
        return None;
    }
    Some(key.replacen("[main](", "(", 1))
}

fn derived(state: &str) -> Vec<String> {
    state.lines().filter(|l| l.contains(" drv support=")).filter_map(|l| question(l.split(' ').next().unwrap())).collect()
}

fn same_answers(delta: &mut Session, fresh: &mut Session, was: &[String], now: &[String]) -> Result<usize, String> {
    // asking a relation answered on demand makes a fact for the call: the questions go to copies
    let (mut d2, mut f2);
    let (delta, fresh) = if delta.eval.answers_on_demand() {
        d2 = delta.fork();
        f2 = fresh.fork();
        (&mut d2, &mut f2)
    } else {
        (delta, fresh)
    };
    let mut n = 0;
    for q in now.iter().take(30) {
        let (a, b) = (delta.why_all(q), fresh.why_all(q));
        if a != b {
            return Err(format!("why {q}:\n  delta: {a:?}\n  fresh: {b:?}"));
        }
        n += 1;
    }
    let bounds = rofl::engine::WhynotBounds::default();
    for q in was.iter().filter(|q| !now.contains(q)).take(6) {
        let (a, b) = (delta.whynot(q, &bounds), fresh.whynot(q, &bounds));
        if a != b {
            return Err(format!("whynot {q}:\n  delta: {a:?}\n  fresh: {b:?}"));
        }
        n += 1;
    }
    Ok(n)
}

#[derive(Default, Debug)]
struct Stats {
    additions: usize,
    rule_additions: usize,
    delta: usize,
    full: BTreeMap<String, usize>,
    explained: usize,
    skipped: usize,
    sum: AddDelta,
}

impl Stats {
    fn took(&mut self, a: &Addition) {
        self.additions += 1;
        match a {
            Addition::Delta(d) => {
                self.delta += 1;
                let s = &mut self.sum;
                s.facts += d.facts;
                s.rules += d.rules;
                s.monotone += d.monotone;
                s.stacked_rules += d.stacked_rules;
                s.stacked_cells += d.stacked_cells;
                s.withdrawn += d.withdrawn;
                s.refired += d.refired;
                s.restaged += d.restaged;
            }
            Addition::Full(why) => {
                for w in why.split("; ") {
                    *self.full.entry(w.to_string()).or_default() += 1;
                }
            }
        }
    }
    fn add(&mut self, o: Stats) {
        self.additions += o.additions;
        self.rule_additions += o.rule_additions;
        self.delta += o.delta;
        self.explained += o.explained;
        self.skipped += o.skipped;
        for (k, v) in o.full {
            *self.full.entry(k).or_default() += v;
        }
        let (s, d) = (&mut self.sum, o.sum);
        s.facts += d.facts;
        s.rules += d.rules;
        s.monotone += d.monotone;
        s.stacked_rules += d.stacked_rules;
        s.stacked_cells += d.stacked_cells;
        s.withdrawn += d.withdrawn;
        s.refired += d.refired;
        s.restaged += d.restaged;
    }
}

/// One world: `rules` loaded first except those `later`, facts in random additions, each step checked.
fn differential(seed: u64, head: &str, rules: Vec<String>, gen: fn(&mut Rng) -> String, steps: usize) -> Stats {
    let mut r = Rng(seed);
    let mut st = Stats::default();
    let (mut first, mut later): (Vec<String>, Vec<String>) = (Vec::new(), Vec::new());
    for x in rules {
        if r.below(100) < 30 { later.push(x) } else { first.push(x) }
    }
    let mut present: BTreeSet<String> = BTreeSet::new();
    let mut asserted: BTreeSet<String> = BTreeSet::new();
    let mut text = format!("{head}\n{}\n", first.join("\n"));
    for _ in 0..(6 + r.below(10)) {
        let f = gen(&mut r);
        if present.insert(f.clone()) {
            text.push_str(&format!("{f}.\n"));
        }
    }
    let mut ops = vec![Op::Load(text.clone())];
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).expect("boot");
    if s.load(&text, None).is_err() || s.evaluate().is_err() {
        st.skipped += 1;
        return st;
    }
    let mut was = derived(&state(&mut s));
    let mut log: Vec<String> = Vec::new();
    for step in 0..steps {
        let roll = r.below(100);
        let (op, a): (Op, Result<Addition, Retraction>) = if roll < 25 && !later.is_empty() {
            let i = r.below(later.len() as u64) as usize;
            let rule = later.remove(i);
            st.rule_additions += 1;
            match s.load_delta(&rule, None) {
                Ok((_, a)) => (Op::Load(rule), Ok(a)),
                Err(d) => panic!("seed {seed}: {rule}: {d:?}"),
            }
        } else if roll < 40 {
            let present_now: Vec<String> = asserted.iter().cloned().collect();
            if present_now.is_empty() {
                continue;
            }
            let f = r.pick(&present_now).clone();
            asserted.remove(&f);
            present.remove(&f);
            let how = s.retract_delta(&f).unwrap_or_else(|e| panic!("{f}: {e}"));
            if let Some(mut g) = replay(&ops) {
                let gh = g.retract_delta(&f).unwrap();
                let mut ops2 = ops.clone();
                ops2.push(Op::Retract(f.clone()));
                if let Some(mut w) = replay(&ops2) {
                    let (a, b) = (state(&mut g), state(&mut w));
                    if a != b {
                        let world: String = ops.iter().map(|o| match o { Op::Load(t) | Op::Assert(t) => format!("{t}\n"), Op::Retract(q) => format!("-- retracted {q}\n") }).collect();
                        if let Ok(dir) = std::env::var("ADD_DUMP") {
                            std::fs::write(format!("{dir}/world.rofl"), &world).unwrap();
                            std::fs::write(format!("{dir}/delta.state"), &a).unwrap();
                            std::fs::write(format!("{dir}/fresh.state"), &b).unwrap();
                        }
                        panic!("seed {seed}: a retraction from a FRESH world is not a fresh evaluation's: {f} {gh:?}\n{world}");
                    }
                }
            }
            (Op::Retract(f), Err(how))
        } else {
            let mut fs: Vec<String> = Vec::new();
            for _ in 0..(1 + r.below(3)) {
                let f = gen(&mut r);
                if present.insert(f.clone()) {
                    fs.push(f);
                }
            }
            if fs.is_empty() {
                continue;
            }
            let text: String = fs.iter().map(|f| format!("{f}.\n")).collect();
            if roll < 75 {
                asserted.extend(fs.iter().cloned());
                let (_, a) = s.assert_delta(&text).unwrap_or_else(|e| panic!("{text}: {e}"));
                (Op::Assert(text), Ok(a))
            } else {
                let (_, a) = s.load_delta(&text, None).unwrap_or_else(|d| panic!("{text}: {d:?}"));
                (Op::Load(text), Ok(a))
            }
        };
        log.push(match &op {
            Op::Load(t) => format!("load {}", t.trim()),
            Op::Assert(t) => format!("assert {}", t.trim()),
            Op::Retract(t) => format!("retract {t}"),
        });
        log.push(format!("  -> {a:?}"));
        if let Ok(a) = &a {
            st.took(a);
        }
        ops.push(op);
        let Some(mut f) = replay(&ops) else {
            // the program the additions make is refused by a fresh evaluation too
            st.skipped += 1;
            return st;
        };
        let got = state(&mut s);
        let want = state(&mut f);
        if got != want {
            if let Ok(dir) = std::env::var("ADD_DUMP") {
                std::fs::write(format!("{dir}/delta.state"), &got).unwrap();
                std::fs::write(format!("{dir}/fresh.state"), &want).unwrap();
                std::fs::write(format!("{dir}/ops.log"), log.join("\n")).unwrap();
            }
            let (g, w): (Vec<&str>, Vec<&str>) = (got.lines().collect(), want.lines().collect());
            let at = g.iter().zip(w.iter()).position(|(a, b)| a != b).unwrap_or(g.len().min(w.len()));
            let tail = log.iter().rev().take(8).rev().cloned().collect::<Vec<_>>().join("\n  ");
            panic!(
                "seed {seed} step {step}: the delta state is not a fresh evaluation's\n  program:\n  {}\n  last ops:\n  {tail}\n  line {at}\n  delta: {}\n  fresh: {}\n  lines: {} vs {}",
                text.lines().filter(|l| l.contains(":-") || l.starts_with("lattice") || l.starts_with("tree")).collect::<Vec<_>>().join("\n  "),
                g.get(at).unwrap_or(&"<end>"),
                w.get(at).unwrap_or(&"<end>"),
                g.len(),
                w.len()
            );
        }
        let now = derived(&got);
        match same_answers(&mut s, &mut f, &was, &now) {
            Ok(n) => st.explained += n,
            Err(e) => panic!("seed {seed} step {step}: the explanations differ after {:?}\n  {e}", log.iter().rev().take(4).collect::<Vec<_>>()),
        }
        was = now;
    }
    st
}

fn report(name: &str, st: &Stats) {
    eprintln!(
        "{name}: {} additions ({} of rules), {} by delta ({:.0}%), {} explained, {} skipped\n  full: {:?}\n  {:?}",
        st.additions,
        st.rule_additions,
        st.delta,
        100.0 * st.delta as f64 / st.additions.max(1) as f64,
        st.explained,
        st.skipped,
        st.full,
        st.sum
    );
}

#[test]
fn random_programs_take_additions_as_a_fresh_evaluation_does() {
    let mut all = Stats::default();
    let seeds: Vec<u64> = match std::env::var("ADD_SEEDS") {
        Ok(v) => v.split(',').map(|x| x.parse().unwrap()).collect(),
        Err(_) => (1..=60).collect(),
    };
    for seed in seeds {
        let mut r = Rng(seed * 104_729 + 7);
        let rules = program(&mut r);
        all.add(differential(seed * 7919 + 1, EDB, rules, fact, 14));
    }
    report("random", &all);
    assert!(all.delta * 2 > all.additions, "most additions are deltas: {all:?}");
}

fn sweep(name: &str, head: &str, rules: &[&str], gen: fn(&mut Rng) -> String, seeds: std::ops::RangeInclusive<u64>, steps: usize) -> Stats {
    let mut all = Stats::default();
    let only: Option<u64> = std::env::var("ADD_SEEDS").ok().map(|v| v.parse().unwrap());
    for seed in seeds.filter(|s| only.is_none_or(|o| o == *s)) {
        eprintln!("{name} {seed}");
        all.add(differential(seed * 7919 + 3, head, rules.iter().map(|r| r.to_string()).collect(), gen, steps));
    }
    report(name, &all);
    all
}

fn fact_edge(r: &mut Rng) -> String {
    format!("e3({}, {}, {})", r.pick(&ATOMS), r.pick(&ATOMS), 1 + r.below(6))
}

/// An order lattice and a reader of it: what the lattice improves withdraws what read the old value.
#[test]
fn a_lattice_world_is_a_fresh_evaluation_after_every_addition() {
    let rules = [
        "d(A, B, W) :- e3(A, B, W).",
        "d(A, C, W) :- d(A, B, W1), e3(B, C, W2), W is W1 + W2.",
        "near(A, B) :- d(A, B, W), W < 4.",
        "hop(A, B) :- e3(A, B, _).",
        "hop2(A, C) :- hop(A, B), hop(B, C).",
    ];
    let all = sweep("lattice", "edb(e3).\nlattice d(A, B, min W).", &rules, fact_edge, 1..=12, 10);
    assert!(all.additions > 50, "{all:?}");
}

fn fact_tree(r: &mut Rng) -> String {
    let c = 1 + r.below(30);
    match r.below(4) {
        0 | 1 => format!("t_in(n{}, n{c})", c / 2),
        2 => format!("t_cand(n{}, n{c})", r.below(30)),
        _ => format!("t_pick(n{c})"),
    }
}

/// A declared tree, its closure answered from the forest, and readers of the closure every way.
#[test]
fn a_declared_tree_is_a_fresh_evaluation_after_every_addition() {
    let rules = [
        "t_bb(A, D) :- t_cand(A, D), t_within(A, D).",
        "t_bf(A, D) :- t_pick(A), t_within(A, D).",
        "t_neg(A, D) :- t_cand(A, D), not t_within(A, D).",
        "t_cnt(A, N) :- t_pick(A), N is count(D : t_within(A, D)).",
        "t_feed2(D) :- t_bf(A, _), t_within(A, D).",
        "t_rec(X, Y) :- t_cand(X, Y).",
        "t_rec(X, Z) :- t_rec(X, Y), t_within(Y, Z).",
    ];
    let all = sweep("tree", "tree t_in(P, C) closure t_within.\nedb(t_cand). edb(t_pick).", &rules, fact_tree, 1..=10, 10);
    assert!(all.additions > 50, "{all:?}");
}

fn fact_demand(r: &mut Rng) -> String {
    match r.below(3) {
        0 => format!("dq_e({}, {})", r.below(6), r.below(6)),
        1 => format!("dq_s({})", r.below(7)),
        _ => format!("dq_k({}, {})", r.below(6), r.below(3)),
    }
}

/// A relation answered on demand (its head leaves Y free) and the rules that call it.
#[test]
fn a_world_with_a_relation_answered_on_demand_is_a_fresh_evaluation_after_every_addition() {
    let rules = [
        "dq_c(X) :- dq_k(X, 0).",
        "dq_c(Y) :- dq_e(X, Y), dq_c(X).",
        "dq_o(X, Y) :- dq_s(X), not dq_c(X).",
        "dq_r(X) :- dq_s(X), dq_o(X, 1).",
        "dq_nr(X) :- dq_s(X), not dq_o(X, 1).",
        "dq_n(N) :- N is count(X : dq_r(X)).",
    ];
    let all = sweep("demand", "edb(dq_e). edb(dq_s). edb(dq_k).", &rules, fact_demand, 1..=10, 10);
    assert!(all.delta * 2 > all.additions, "{all:?}");
}

const CONE: &str = "edb(e). edb(n).
q1(X, Y) :- e(X, Y).
q1(X, Z) :- q1(X, Y), e(Y, Z).
q2(X) :- n(X), not q1(X, X).
q3(X, N) :- n(X), N is count(Y : q1(X, Y)).
q4(X) :- q2(X), q3(X, N), N > 1.
e(a, b). e(b, c). e(c, a). e(c, d). n(a). n(d). n(e).
";

/// THE ASKS CONE GROWS (w_cmp_cone_rules_added): an ask asserted into an evaluated world runs the rules its cone adds
/// over the store as it stands, and the world is the one asked everything from the start.
#[test]
fn an_ask_added_grows_the_cone_over_the_retained_store() {
    for (first, then) in [("q1", "q2"), ("q1", "q4"), ("q2", "q3"), ("q3", "q4")] {
        let mut s = Session::fresh(BUDGET);
        s.load(&boot(), None).unwrap();
        s.load(&format!("{CONE}asks({first}).\n"), None).unwrap();
        s.evaluate().unwrap();
        let (_, a) = s.assert_delta(&format!("asks({then}).")).unwrap();
        let Addition::Delta(d) = &a else { panic!("asks({then}) after asks({first}): {a:?}") };
        assert!(d.rules > 0, "asks({then}) after asks({first}) added no rule: {d:?}");
        let ops = [Op::Load(format!("{CONE}asks({first}).\n")), Op::Assert(format!("asks({then})."))];
        let mut f = replay(&ops).unwrap();
        assert_eq!(state(&mut s), state(&mut f), "asks({then}) after asks({first})");
        let st = state(&mut s);
        same_answers(&mut s, &mut f, &[], &derived(&st)).unwrap();
        // and a fact after it is a delta of the grown cone
        let (_, a) = s.assert_delta("e(d, e).").unwrap();
        assert!(matches!(a, Addition::Delta(_)), "{a:?}");
        let mut f = replay(&[ops[0].clone(), ops[1].clone(), Op::Assert("e(d, e).".into())]).unwrap();
        assert_eq!(state(&mut s), state(&mut f), "e(d, e) after asks({then})");
    }
}
