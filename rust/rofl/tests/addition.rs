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
    program_of(r, n)
}

fn program_of(r: &mut Rng, n: usize) -> Vec<String> {
    let mut rules = Vec::new();
    for i in 1..=n {
        let pos: Vec<String> = std::iter::once("e".to_string()).chain((1..=i).map(|j| format!("p{j}"))).collect();
        let strict: Vec<String> = std::iter::once("e".to_string()).chain((1..i).map(|j| format!("p{j}"))).collect();
        for k in 0..(1 + r.below(2)) {
            let (a, b) = (r.pick(&pos).clone(), r.pick(&pos).clone());
            let s = r.pick(&strict).clone();
            let t = if k == 0 { r.below(14) } else { 1 + r.below(13) };
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
                12 => format!("p{i}(X, N)@next :- n(X), N is count(Y : {s}(X, Y))."),
                13 => format!("p{i}(X, X)@next :- n(X), at_least(2, Y : {s}(X, Y))."),
                _ => format!("p{i}(X, M) :- n(X), M is max(V : w(X, V), {s}(X, _))."),
            };
            rules.push(rule);
        }
    }
    rules
}

fn fact(r: &mut Rng) -> String {
    match r.below(6) {
        0 | 1 => format!("e({}, {})", r.pick(&ATOMS), r.pick(&ATOMS)),
        2 => format!("n({})", r.pick(&ATOMS)),
        // a base fact of a relation rules conclude too
        3 if r.below(3) == 0 => format!("p{}({}, {})", 1 + r.below(3), r.pick(&ATOMS), r.pick(&ATOMS)),
        _ => format!("w({}, {})", r.pick(&ATOMS), 1 + r.below(5)),
    }
}

const EDB: &str = "edb(e). edb(n). edb(w).";

/// The state without `evaluated_again`, the record of how the world was brought up to date, which a fresh world has
/// no reason to hold.
fn without_record(state: &str) -> String {
    state.lines().filter(|l| !l.starts_with("evaluated_again[")).map(|l| format!("{l}\n")).collect()
}

fn state(s: &mut Session) -> String {
    if s.eval.store.dirty {
        s.evaluate().expect("evaluates");
    }
    let mut out = without_record(&s.eval.canonical_state());
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
    let (delta, fresh) = if delta.eval.demand.answers_on_demand() {
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
    opened: usize,
    opened_clean: usize,
    sum: AddDelta,
    /// retractions taken, and of them by delta
    retracted: (usize, usize),
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
                s.negated += d.negated;
                s.overdeleted += d.overdeleted;
                s.rederived += d.rederived;
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
        self.opened += o.opened;
        self.opened_clean += o.opened_clean;
        self.retracted.0 += o.retracted.0;
        self.retracted.1 += o.retracted.1;
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
        s.negated += d.negated;
        s.overdeleted += d.overdeleted;
        s.rederived += d.rederived;
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
            st.retracted.0 += 1;
            st.retracted.1 += matches!(how, Retraction::Delta(_)) as usize;
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
            if let Addition::Full(why) = a {
                // the world says it was evaluated again, and why, where a rule reads it
                let said = s.eval.canonical_state();
                for w in why.split("; ").filter(|w| *w != "the world is not evaluated") {
                    assert!(said.lines().any(|l| l.starts_with("evaluated_again[$kernel](") && l.contains(&format!(",\"{w}\")"))), "seed {seed}: {log:?} evaluated again ({w}) and the world does not say so");
                }
            }
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
                let world: String = ops.iter().map(|o| match o { Op::Load(t) => format!("-- load\n{t}\n"), Op::Assert(t) => format!("-- assert\n{t}\n"), Op::Retract(q) => format!("-- retract {q}\n") }).collect();
                std::fs::write(format!("{dir}/ops.rofl"), world).unwrap();
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
        // what a base fact holds up, asked of the world the additions made and of the fresh one
        if let Some(q) = asserted.iter().nth(step % asserted.len().max(1)) {
            let (a, b) = (s.excise(q), f.excise(q));
            assert_eq!(a, b, "seed {seed} step {step}: excise {q}");
            st.explained += 1;
        }
        was = now;
        // every third step the world goes to disk, as an image (`Session::keep`) or as a volume (`keep_volume`)
        // in turn, and the additions go on over the one read back
        if step % 3 == 2 {
            let before = s.eval.canonical_state();
            s = if step % 6 == 5 {
                // tests run side by side and share seeds: a file of its own for each volume
                static KEPT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
                let k = KEPT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let path = std::env::temp_dir().join(format!("rofl-addition-{}-{k}.vol", std::process::id()));
                let path = path.to_str().unwrap();
                s.keep_volume(path).unwrap();
                let opened = Session::open_volume(path, BUDGET);
                std::fs::remove_file(path).unwrap();
                opened
            } else {
                Session::open_kept(&s.keep(), BUDGET)
            }
            .unwrap_or_else(|e| panic!("seed {seed} step {step}: the kept world does not open: {e}"));
            assert_eq!(s.eval.canonical_state(), before, "seed {seed} step {step}: the kept world opens as another");
            st.opened += 1;
            st.opened_clean += !s.eval.store.dirty as usize;
            if s.eval.store.dirty {
                s.evaluate().unwrap_or_else(|e| panic!("seed {seed} step {step}: the kept world does not evaluate: {}", rofl::describe(&e)));
                assert_eq!(s.eval.canonical_state(), before, "seed {seed} step {step}: the kept world evaluates as another");
            }
        }
    }
    // a snapshot of the world the additions made opens as that world
    // (what is staged for the next tick is the evaluation's, not the store's: a snapshot carries the store)
    let want = s.eval.canonical_state();
    let mut back = Session::open(&s.save(), BUDGET).unwrap_or_else(|e| panic!("seed {seed}: the snapshot does not open: {e}"));
    let got = back.eval.canonical_state();
    if got != want {
        let (g, w): (Vec<&str>, Vec<&str>) = (got.lines().collect(), want.lines().collect());
        let at = g.iter().zip(w.iter()).position(|(a, b)| a != b).unwrap_or(g.len().min(w.len()));
        panic!("seed {seed}: the snapshot of the world the additions made opens as another, line {at}\n  opened: {}\n  world:  {}", g.get(at).unwrap_or(&"<end>"), w.get(at).unwrap_or(&"<end>"));
    }
    st
}

fn report(name: &str, st: &Stats) {
    eprintln!(
        "{name}: {} additions ({} of rules), {} by delta ({:.0}%), {} explained, {} skipped, {} of {} kept images opened evaluated\n  full: {:?}\n  {:?}",
        st.additions,
        st.rule_additions,
        st.delta,
        100.0 * st.delta as f64 / st.additions.max(1) as f64,
        st.explained,
        st.skipped,
        st.opened_clean,
        st.opened,
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

/// LARGER PROGRAMS, more steps (ignored: run in slices, `ADD_SEEDS=a-b`, default 1-180).
#[test]
#[ignore]
fn random_large_programs_take_additions_as_a_fresh_evaluation_does() {
    let mut all = Stats::default();
    let (a, b) = std::env::var("ADD_SEEDS").ok().and_then(|v| v.split_once('-').map(|(a, b)| (a.parse().unwrap(), b.parse().unwrap()))).unwrap_or((1u64, 180u64));
    for seed in a..=b {
        let mut r = Rng(seed * 1_299_709 + 13);
        let n = 5 + r.below(5) as usize;
        let rules = program_of(&mut r, n);
        all.add(differential(seed * 7919 + 17, EDB, rules, fact, 20));
    }
    report("large", &all);
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
    match r.below(8) {
        // a base fact of a relation that reads the lattice from outside
        0 => format!("near({}, {})", r.pick(&ATOMS), r.pick(&ATOMS)),
        _ => format!("e3({}, {}, {})", r.pick(&ATOMS), r.pick(&ATOMS), 1 + r.below(6)),
    }
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
        "far(A, B) :- hop(A, B), not near(A, B).",
        "fan(A, N) :- hop(A, _), N is count(B : hop(A, B)).",
        "wide(A) :- fan(A, N), N > 2, not near(A, A).",
    ];
    let all = sweep("lattice", "edb(e3).\nlattice d(A, B, min W).", &rules, fact_edge, 1..=12, 10);
    assert!(all.additions > 50 && all.full.is_empty(), "every addition to the lattice is a delta: {all:?}");
    assert!(all.opened > 10 && all.opened_clean * 10 >= all.opened * 9, "a kept lattice world opens evaluated: {} of {}", all.opened_clean, all.opened);
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

/// The closure is answered from the forest before and after an edge and a reader are added by delta: the forest is
/// built again from the edges, the derived facts stay.
#[test]
fn an_edge_and_a_reader_added_to_a_declared_tree_keep_the_closure_answered_from_the_forest() {
    let head = "tree t_in(P, C) closure t_within.\nedb(t_pick).\nt_in(n1, n2). t_in(n2, n4). t_in(n1, n3). t_pick(n1). t_pick(n2).\nt_bf(A, D) :- t_pick(A), t_within(A, D).\nt_neg(A) :- t_pick(A), not t_within(n1, A).\n";
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).unwrap();
    s.load(head, None).unwrap();
    s.evaluate().unwrap();
    assert!(s.eval.vc.vclosure_info(&s.eval.h).iter().all(|(_, on)| *on), "{:?}", s.eval.vc.vclosure_info(&s.eval.h));
    let mut ops = vec![Op::Load(head.into())];
    for (op, text) in [("assert", "t_in(n4, n5)."), ("load", "t_cnt(A, N) :- t_pick(A), N is count(D : t_within(A, D))."), ("assert", "t_in(n0, n1). t_pick(n0).")] {
        let a = if op == "assert" { s.assert_delta(text).unwrap().1 } else { s.load_delta(text, None).unwrap().1 };
        assert!(matches!(a, Addition::Delta(_)), "{text}: {a:?}");
        assert!(s.eval.vc.vclosure_info(&s.eval.h).iter().all(|(_, on)| *on), "{text}: {:?}", s.eval.vc.vclosure_info(&s.eval.h));
        ops.push(if op == "assert" { Op::Assert(text.into()) } else { Op::Load(text.into()) });
        assert_eq!(state(&mut s), state(&mut replay(&ops).unwrap()), "{text}");
    }
}

/// A tree declared into an evaluated world whose readers already read its closure, empty until then: the closure is
/// engaged over the edges that stand and each reader fires again whole, and the world is the one evaluated with the
/// declaration (where no witness is kept, a rule added at all is refused by the negations of the program's reflection). A reader under a negation or an aggregate concluded what the rows withdraw: the
/// world is evaluated again.
#[test]
fn a_tree_declared_into_an_evaluated_world_is_answered_from_its_forest_by_delta() {
    {
        let head = "edb(t_pick). edb(t_cand). edb(t_link).\nt_link(n4, n5). t_in(P, C) :- t_link(P, C).\nt_in(n1, n2). t_in(n2, n4). t_in(n1, n3). t_pick(n1). t_pick(n2). t_cand(n1, n4). t_cand(n3, n4). t_cand(n2, n5).\nt_bf(A, D) :- t_pick(A), t_within(A, D).\nt_two(A, D) :- t_cand(A, D), t_within(A, X), t_in(X, D).\n".to_string();
        let mut s = Session::fresh(BUDGET);
        s.load(&boot(), None).unwrap();
        s.load(&head, None).unwrap();
        s.evaluate().unwrap();
        let decl = "tree t_in(P, C) closure t_within.";
        let a = s.load_delta(decl, None).unwrap().1;
        assert!(matches!(a, Addition::Delta(_)), "{a:?}");
        assert!(s.eval.vc.vclosure_info(&s.eval.h).iter().all(|(_, on)| *on), "{:?}", s.eval.vc.vclosure_info(&s.eval.h));
        assert_eq!(state(&mut s), state(&mut replay(&[Op::Load(head.clone()), Op::Load(decl.into())]).unwrap()));
        for neg in ["t_neg(A, D) :- t_cand(A, D), not t_within(A, D).", "t_cnt(A, N) :- t_pick(A), N is count(D : t_within(A, D))."] {
            let mut s = Session::fresh(BUDGET);
            s.load(&boot(), None).unwrap();
            s.load(&format!("{head}{neg}\n"), None).unwrap();
            s.evaluate().unwrap();
            assert!(matches!(s.load_delta(decl, None).unwrap().1, Addition::Full(_)), "{neg}");
        }
        // edges that stood before the declaration and break it refuse the world
        let mut s = Session::fresh(BUDGET);
        s.load(&boot(), None).unwrap();
        s.load(&format!("{head}t_in(n3, n4).\n"), None).unwrap();
        s.evaluate().unwrap();
        let a = s.load_delta(decl, None).unwrap().1;
        assert!(matches!(&a, Addition::Full(w) if w.contains("promise is broken")), "{a:?}");
    }
}

/// One addition to a world, a delta and the fresh world's state.
fn one_addition(program: &str, op: Op) -> AddDelta {
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).unwrap();
    s.load(program, None).unwrap();
    s.evaluate().unwrap();
    let a = match &op {
        Op::Assert(t) => s.assert_delta(t).unwrap().1,
        Op::Load(t) => s.load_delta(t, None).unwrap().1,
        Op::Retract(_) => unreachable!(),
    };
    let Addition::Delta(d) = a else { panic!("not a delta: {a:?}") };
    assert_eq!(state(&mut s), state(&mut replay(&[Op::Load(program.into()), op]).unwrap()), "the addition to {program}");
    d
}

/// A rule that moves a relation's round: a cell sealed over it names the round in its seals, and is sealed again.
#[test]
fn an_added_rule_that_moves_a_round_seals_the_cells_over_it_again() {
    let program = "edb(e). edb(n).\ne(a). e(b). n(a). n(c).\nb(X) :- e(X).\na(X) :- e(X).\nc(N) :- N is count(X : a(X)).\n";
    let d = one_addition(program, Op::Load("a(X) :- n(X), not b(X).".into()));
    assert!(d.stacked_cells > 0, "{d:?}");
}

/// A base fact of a relation a reset rule concludes stays, and the firings it had are made again from what holds.
#[test]
fn a_base_fact_beside_a_reset_rule_keeps_only_the_firings_that_hold() {
    let program = "edb(e). edb(n).\nn(a). n(b). q(a).\nq(X) :- n(X), N is count(Y : e(X, Y)), N < 1.\nr(X) :- q(X).\n";
    let d = one_addition(program, Op::Assert("e(a, a).".into()));
    assert!(d.stacked_rules > 0, "{d:?}");
    // and under a negation the fine path withdraws its firing and makes again those that hold
    let program = "edb(e). edb(n).\nn(a). n(b). q(a).\nq(X) :- n(X), not e(X, X).\nq(X) :- n(X), e(b, X).\nr(X) :- q(X).\n";
    let d = one_addition(program, Op::Assert("e(a, a). e(b, a).".into()));
    assert!(d.negated > 0 && d.stacked_rules == 0, "{d:?}");
    // a relation derived again after the rest (it reads a lattice that improves, under a negation): the base fact
    // keeps no firing of a rule that no longer holds, though everything the firing cited is alive
    let program = "edb(e3). edb(n).\nlattice d(A, B, min W).\ne3(a, b, 5). n(a). q(a).\nd(A, B, W) :- e3(A, B, W).\nd(A, C, W) :- d(A, B, W1), e3(B, C, W2), W is W1 + W2.\nfar2(A) :- d(A, _, W), W < 4.\nq(A) :- n(A), not far2(A).\n";
    let d = one_addition(program, Op::Assert("e3(a, b, 2).".into()));
    assert!(d.stacked_rules > 0 && d.withdrawn > 0, "{d:?}");
}

/// A rule whose aggregate reads only what did not change is monotone in the premise that grew outside it: it fires on
/// the new facts and is not sealed again, also where no witness is kept.
#[test]
fn an_aggregate_over_what_did_not_change_fires_on_what_grew() {
    for seal in ["", "sealed(provenance).\n"] {
        let program = format!("{seal}edb(e). edb(c).\nc(s, 0). c(s, 1). e(a).\np(X) :- e(X).\nt(X, I) :- p(X), I is max(J : c(s, J)).\n");
        let d = one_addition(&program, Op::Assert("e(b).".into()));
        assert!(d.monotone > 0 && d.stacked_rules == 0, "{seal}{d:?}");
    }
}

/// A fact that stood and is given a lower firing lowers what rests on it: an aggregate is sealed again at the groups of
/// the members that rest on it, not whole (a cell lists its members' heights).
#[test]
fn a_member_standing_lower_seals_again_only_its_group() {
    let groups: String = (2..=20).map(|k| format!("grp(g{k}). in(g{k}, x{k}). s(x{k}).\n")).collect();
    let program = format!("edb(e). edb(s). edb(in). edb(grp).\ne(a, b). e(b, c). e(c, d). s(a). grp(g1). in(g1, d).\n{groups}reach(X) :- s(X).\nreach(Y) :- reach(X), e(X, Y).\nmember(G, X) :- in(G, X), reach(X).\ncnt(G, N) :- grp(G), N is count(X : member(G, X)).\n");
    let d = one_addition(&program, Op::Assert("s(c).".into()));
    assert!(d.stacked_cells > 0 && d.stacked_cells <= 2, "{d:?}");
}

/// Programs of joins, recursion and negation only: every negation the fine path keeps, its withdrawals and what they
/// take with them through recursion derived again.
fn program_neg(r: &mut Rng) -> Vec<String> {
    let n = 3 + r.below(4) as usize;
    let mut rules = Vec::new();
    for i in 1..=n {
        let pos: Vec<String> = std::iter::once("e".to_string()).chain((1..=i).map(|j| format!("p{j}"))).collect();
        let strict: Vec<String> = std::iter::once("e".to_string()).chain((1..i).map(|j| format!("p{j}"))).collect();
        for k in 0..(1 + r.below(3)) {
            let (a, b) = (r.pick(&pos).clone(), r.pick(&pos).clone());
            let s = r.pick(&strict).clone();
            rules.push(match if k == 0 { r.below(4) } else { r.below(6) } {
                0 => format!("p{i}(X, Y) :- e(X, Y), not {s}(Y, X)."),
                1 => format!("p{i}(X, X) :- n(X), not {s}(X, _)."),
                2 => format!("p{i}(X, Y) :- {a}(X, Y), not {s}(X, Y)."),
                3 => format!("p{i}(X, Z) :- {a}(X, Y), {b}(Y, Z), not {s}(Z, X)."),
                4 => format!("p{i}(X, Z) :- p{i}(X, Y), e(Y, Z)."),
                _ => format!("p{i}(X, Z) :- {a}(X, Y), {b}(Y, Z)."),
            });
        }
    }
    rules
}

/// The same programs in a world that keeps no witness (`sealed(provenance)`): no firing names what a fact rests on.
#[test]
fn random_sealed_programs_take_additions_as_a_fresh_evaluation_does() {
    let mut all = Stats::default();
    let only: Option<u64> = std::env::var("ADD_SEEDS").ok().map(|v| v.parse().unwrap());
    for seed in (1..=30u64).filter(|s| only.is_none_or(|o| o == *s)) {
        let mut r = Rng(seed * 104_729 + 7);
        let rules = if seed % 2 == 0 { program(&mut r) } else { program_neg(&mut r) };
        all.add(differential(seed * 7919 + 9, &format!("{EDB}\nsealed(provenance)."), rules, fact, 10));
    }
    report("sealed", &all);
    assert!(all.opened > 10 && all.opened_clean * 10 >= all.opened * 9, "a kept sealed world opens evaluated: {} of {}", all.opened_clean, all.opened);
    assert!(all.delta > 30, "the monotone part of an addition to a sealed world is a delta: {all:?}");
}

#[test]
fn random_negation_programs_keep_what_a_negation_still_allows() {
    let mut all = Stats::default();
    let only: Option<u64> = std::env::var("ADD_SEEDS").ok().map(|v| v.parse().unwrap());
    for seed in (1..=40u64).filter(|s| only.is_none_or(|o| o == *s)) {
        let mut r = Rng(seed * 15_485_863 + 11);
        let rules = program_neg(&mut r);
        all.add(differential(seed * 7919 + 5, EDB, rules, fact, 12));
    }
    report("negation", &all);
    assert!(all.sum.negated > 100 && all.sum.overdeleted > 20 && all.sum.rederived > 0, "the fine path is exercised: {all:?}");
    assert!(all.sum.stacked_rules == 0 && all.sum.refired == 0, "no rule of joins, recursion and negation is reset: {all:?}");
}

fn fact_hol(r: &mut Rng) -> String {
    match r.below(5) {
        0 => format!("ask({}, {})", r.pick(&ATOMS), 25 * r.below(5)),
        1 => format!("n({})", r.pick(&ATOMS)),
        _ => format!("w({}, {}, {})", r.pick(&ATOMS), r.pick(&ATOMS), 1 + r.below(9)),
    }
}

/// A median, a quantile and a rank the change reaches are sealed again at the groups it falls in, a group shared
/// across its percent or subject with every percent or subject of it, and so is what reads them.
#[test]
fn a_holistic_aggregate_is_sealed_again_at_the_groups_the_change_reaches() {
    let rules = [
        "med(G, M) :- n(G), M is median(V ; K : w(G, K, V)).",
        "q(G, P, Q) :- ask(G, P), Q is quantile(P, V ; K : w(G, K, V)).",
        "q90(G, Q) :- n(G), Q is quantile(90, V ; K : w(G, K, V)).",
        "place(G, K, R) :- w(G, K, V), R is rank(V, K ; desc(V2), K2 : w(G, K2, V2)).",
        "top(G, K) :- place(G, K, 1), not q90(G, 1).",
        "high(G) :- med(G, M), M > 4.",
    ];
    let all = sweep("holistic", "edb(w). edb(n). edb(ask).", &rules, fact_hol, 1..=16, 10);
    assert!(all.additions > 50 && all.full.is_empty(), "every addition to a holistic aggregate is a delta: {all:?}");
    assert!(all.sum.stacked_cells > 0, "{all:?}");
}

/// Rules that read `derived_by`, plainly, joined and under a negation of what they conclude: every change makes or withdraws a row they read, so they
/// are derived again after the rest.
#[test]
fn a_rule_reading_derived_by_is_derived_again_after_an_addition() {
    let rules = [
        "p(X, Y) :- e(X, Y).",
        "p(X, Z) :- p(X, Y), e(Y, Z).",
        "q(X) :- n(X), not p(X, X).",
        "c(X, N) :- n(X), N is count(Y : p(X, Y)).",
        "fired(R) :- derived_by(_, R, _).",
        "seen(R, X) :- derived_by(_, R, _), q(X).",
        "cold(X) :- n(X), not seen(X, X).",
        "busy(X) :- n(X), fired(R), not q(X).",
    ];
    let all = sweep("derived_by", EDB, &rules, fact, 1..=12, 10);
    assert!(all.additions > 40 && all.full.is_empty(), "every addition to a world that reads derived_by is a delta: {all:?}");
}

fn fact_fault(r: &mut Rng) -> String {
    match r.below(8) {
        0 => format!("w({}, {})", r.pick(&ATOMS), if r.below(3) == 0 { "x".to_string() } else { (1 + r.below(5)).to_string() }),
        1 | 2 => format!("n({})", r.pick(&ATOMS)),
        _ => format!("e({}, {})", r.pick(&ATOMS), r.pick(&ATOMS)),
    }
}

/// A world holding a rule's fault (an arithmetic type error, a hole and its shrugs) and a rule that reads the shrugs:
/// an addition that reaches neither the rule nor what reads it is a delta, and the hole and the shrugs stand.
#[test]
fn a_fault_the_addition_does_not_reach_stands() {
    let rules = [
        "v(X, N) :- w(X, V), N is V + 1.",
        "big(X) :- v(X, N), N > 3.",
        "lone(X) :- n(X), not big(X).",
        "hurt(T) :- shrug(T, fault, _).",
        "p(X, Y) :- e(X, Y).",
        "p(X, Z) :- p(X, Y), e(Y, Z).",
        "q(X) :- n(X), not p(X, X).",
        "c(X, N) :- n(X), N is count(Y : p(X, Y)).",
    ];
    let all = sweep("fault", "edb(e). edb(n). edb(w).\nw(z, x).", &rules, fact_fault, 1..=14, 10);
    assert!(all.delta * 2 > all.additions, "most additions reach no fault: {all:?}");
    assert!(all.full.keys().all(|k| k.contains("faulted") || k.contains("write a hole")), "{all:?}");
    assert!(all.retracted.1 * 2 > all.retracted.0, "most retractions reach no fault: {all:?}");
}

fn fact_route(r: &mut Rng) -> String {
    match r.below(6) {
        0 => format!("n({})", r.pick(&ATOMS)),
        _ => format!("e4({}, {}, {}, {})", r.pick(&ATOMS), r.pick(&ATOMS), 1 + r.below(4), 1 + r.below(4)),
    }
}

/// A Pareto front kept by two dominance rules, and readers of it plainly and under a negation: the front the change
/// reaches is derived again whole, its values given forgotten with it.
#[test]
fn a_dominance_the_change_reaches_is_derived_again() {
    let rules = [
        "route(A, B, C, T) :- e4(A, B, C, T).",
        "route(A, C, C1, T1) :- route(A, B, C0, T0), e4(B, C, C2, T2), C1 is C0 + C2, T1 is T0 + T2, C1 < 12.",
        "route(A, B, C1, T1) <= route(A, B, C2, T2) :- C2 <= C1, T2 <= T1, C2 < C1.",
        "route(A, B, C1, T1) <= route(A, B, C2, T2) :- C2 <= C1, T2 <= T1, T2 < T1.",
        "cheap(A, B) :- route(A, B, C, _), C < 3.",
        "far(A) :- n(A), not cheap(A, A).",
    ];
    let all = sweep("dominance", "edb(e4). edb(n).", &rules, fact_route, 1..=12, 10);
    assert!(all.additions > 40 && all.full.keys().all(|k| k.contains("declaration changed")), "every addition to the front but a dominance rule is a delta: {all:?}");
}

/// Joins, a union of members and a hull of values over edges, and readers of them plainly and under a negation:
/// what a change adds only grows them, in any order, so the joins it reaches are derived again with the rest.
#[test]
fn a_join_the_change_reaches_is_derived_again() {
    let rules = [
        "comp(X, set(X)) :- n(X).",
        "comp(X, S) :- e(X, Y), comp(Y, S).",
        "span(X, iv(V, V)) :- w(X, V).",
        "span(Y, I) :- e(X, Y), span(X, I).",
        "bits(X, V) :- w(X, V).",
        "bits(Y, B) :- e(X, Y), bits(X, B).",
        "joined(X, Y) :- comp(X, S), Y in S, X != Y.",
        "alone(X) :- n(X), not joined(X, _).",
        "wide(X) :- span(X, iv(L, H)), H - L > 2.",
    ];
    let all = sweep("join", &format!("{EDB}\nlattice comp(X, union S).\nlattice span(X, hull I).\nlattice bits(X, bitor B)."), &rules, fact, 1..=12, 10);
    assert!(all.additions > 40 && all.full.is_empty(), "every addition to a join is a delta: {all:?}");
}

/// Counting tags, their sums read plainly and under a negation: what a change adds is new derivations, summed.
#[test]
fn a_counting_tag_sums_the_derivations_an_addition_makes() {
    let rules = [
        "walks(A, C, N) :- e(A, C).",
        "walks(A, C, N) :- e(A, B), e(B, C).",
        "tot(N) :- n(_).",
        "many(A, C) :- walks(A, C, N), N > 1.",
        "lone(X) :- n(X), not many(X, X).",
    ];
    let all = sweep("tagc", &format!("{EDB}\ntag walks(A, C, counting N).\ntag tot(counting N)."), &rules, fact, 1..=12, 10);
    assert!(all.additions > 40 && all.full.is_empty(), "every addition to a counting tag is a delta: {all:?}");
}

/// An aggregate the change reaches is sealed again at its level, and what reads it, plainly or under a negation, is
/// kept and fed what the new seal changed, not fired again whole.
#[test]
fn what_reads_an_aggregate_sealed_again_is_kept_and_fed_its_change() {
    let program = "edb(e). edb(n).\nn(a). n(b). e(a, b). e(b, a). e(b, b).\nc(X, N) :- n(X), N is count(Y : e(X, Y)).\nbig(X) :- c(X, N), N > 1.\nsmall(X) :- n(X), not big(X).\n";
    let d = one_addition(program, Op::Assert("e(a, a).".into()));
    assert!(d.stacked_rules == 1 && d.refired == 0 && d.negated == 1, "{d:?}");
}

/// A relation sealed again whole whose own recursion cited a fact that does not come back: a fact that does come back
/// cites what holds now, and is not taken out for what it cited before.
#[test]
fn a_fact_sealed_again_is_not_taken_out_for_what_it_cited_before() {
    let program = "edb(e). edb(n).\nn(a). n(b). e(a, b).\nc(X) :- n(X), N is count(Y : e(X, Y)), N < 2.\nc(X) :- c(Y), e(X, Y).\n";
    let d = one_addition(program, Op::Assert("e(b, x). e(b, y).".into()));
    assert!(d.stacked_rules == 1, "{d:?}");
}

/// A closure walked whole that gains a fact of its own relation: the step reads the news, the base walks.
#[test]
fn a_closure_that_gains_a_fact_of_its_own_relation_is_walked_again() {
    let program = "edb(e).\ne(a, b). e(b, c).\np(X, Y) :- e(X, Y).\np(X, Z) :- p(X, Y), e(Y, Z).\n";
    one_addition(program, Op::Assert("p(x, a).".into()));
}

/// A rule added to a closure that has its other rule: the two fire whole together, as the step alone fires nothing.
#[test]
fn a_step_added_to_a_closure_base_walks_the_closure_whole() {
    let program = "edb(e).\ne(a, b). e(b, c). e(c, d).\np(X, Y) :- e(X, Y).\n";
    one_addition(program, Op::Load("p(X, Z) :- p(X, Y), e(Y, Z).".into()));
    let program = "edb(e).\ne(a, b). e(b, c). e(c, d).\np(X, Z) :- p(X, Y), e(Y, Z).\n";
    one_addition(program, Op::Load("p(X, Y) :- e(X, Y).".into()));
}

/// Found by review: a rule staged `@next` that aggregates what grew stages again over a cell sealed again.
#[test]
fn a_staged_aggregate_is_sealed_again_before_it_stages() {
    let program = "edb(e).\ne(a, b).\nc(N)@next :- N is count(X : e(X, _)).\n";
    one_addition(program, Op::Assert("e(b, a).".into()));
}

/// Found by review: a fact asserted where it was derived lowers the height of what rests on it, a cell's included.
#[test]
fn a_fact_asserted_where_it_was_derived_lowers_what_rests_on_it() {
    let program = "edb(e).\ne(a, b). e(b, c).\nt(X, Y) :- e(X, Y).\nt(X, Z) :- t(X, Y), e(Y, Z).\nc(X, N) :- t(X, _), N is count(Y : t(X, Y)).\n";
    one_addition(program, Op::Assert("t(a, c).".into()));
    one_addition(program, Op::Load("t(a, c).".into()));
}

/// Found by review: a threshold sealed again takes its members as an evaluation takes them, not the oldest.
#[test]
fn a_threshold_sealed_again_takes_the_members_a_fresh_evaluation_takes() {
    let program = "edb(e). edb(n).\nn(c). e(c, d). e(c, e).\np1(X, Y) :- e(X, Y).\np2(X, X) :- n(X), at_least(2, Y : p1(X, Y)).\n";
    one_addition(program, Op::Assert("e(c, a).".into()));
    // a rule that gives a member a lower height: the quorum is the lowest first
    let program = "edb(e). edb(n). edb(q).\nn(c). e(c, d). e(c, e). q(c, a).\np0(X, Y) :- q(X, Y).\np1(X, Y) :- p0(X, Y).\np1(X, Y) :- e(X, Y).\np2(X, X) :- n(X), at_least(2, Y : p1(X, Y)).\n";
    one_addition(program, Op::Load("p1(X, Y) :- q(X, Y).".into()));
    one_addition(program, Op::Assert("e(c, b). p1(c, a).".into()));
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

/// The volume of a scanned fact: the first node id it names, `n<hash of the file>_<counter>`, up to the underscore.
fn volume_of(line: &str) -> Option<&str> {
    let i = line.find("(n")? + 1;
    let rest = &line[i..];
    let end = rest.find('_')?;
    let id = &rest[..end];
    (id.len() > 8 && id[1..].bytes().all(|b| b.is_ascii_hexdigit())).then_some(id)
}

fn timed<T>(f: impl FnOnce() -> T) -> (T, f64) {
    let t = std::time::Instant::now();
    let r = f();
    (r, t.elapsed().as_secs_f64())
}

/// THE CORPORA, on the release build: `ADD_CORPUS=<dir>/<name>` names `<name>.model.rofl` (boot and the model's rules)
/// and `<name>.facts.rofl` (the scanned code). Each file chosen (`ADD_FILES`, indexes into the files in the order
/// they are scanned, default the first) is held out: the world of the rest is evaluated, the file's facts are
/// asserted by delta, and the state is compared with a fresh evaluation of the whole, each timed. `ADD_CELL=<file.rofl.md>`
/// adds the rules of the notebook's `datalog` cells to the evaluated world instead.
#[test]
#[ignore]
fn corpus_additions_are_a_fresh_evaluation() {
    let Ok(base) = std::env::var("ADD_CORPUS") else { return };
    let model = std::fs::read_to_string(format!("{base}.model.rofl")).unwrap();
    let facts = std::fs::read_to_string(format!("{base}.facts.rofl")).unwrap();
    let mut order: Vec<&str> = Vec::new();
    let mut by: BTreeMap<&str, String> = BTreeMap::new();
    let mut loose = String::new();
    // a fact whose string holds a line break spans lines
    let mut stmts: Vec<String> = Vec::new();
    let mut cur = String::new();
    let (mut quoted, mut escaped) = (false, false);
    for l in facts.lines() {
        cur.push_str(l);
        for c in l.chars() {
            match (escaped, c) {
                (true, _) => escaped = false,
                (false, '\\') => escaped = true,
                (false, '"') => quoted = !quoted,
                _ => {}
            }
        }
        if !quoted && l.ends_with('.') {
            stmts.push(std::mem::take(&mut cur));
        } else {
            cur.push('\n');
        }
    }
    for l in stmts.iter().map(|s| s.as_str()) {
        match volume_of(l) {
            Some(v) => {
                if !by.contains_key(v) {
                    order.push(v);
                }
                let t = by.entry(v).or_default();
                t.push_str(l);
                t.push('\n');
            }
            None => {
                loose.push_str(l);
                loose.push('\n');
            }
        }
    }
    let world = |text: &[&str]| -> (Session, f64) {
        timed(|| {
            let mut s = Session::fresh(4_000_000_000);
            s.eval.space = 40_000_000;
            s.load(&model, None).expect("the model loads");
            for t in text {
                if let Err(e) = s.assert(t) {
                    let n: usize = e.split(':').next().and_then(|x| x.trim_start_matches("line ").parse().ok()).unwrap_or(1);
                    panic!("the facts assert: {e}\n{}", t.lines().skip(n.saturating_sub(3)).take(5).collect::<Vec<_>>().join("\n"));
                }
            }
            s.evaluate().expect("evaluates");
            s
        })
    };
    if let Ok(asks) = std::env::var("ADD_ASKS") {
        let (first, then) = asks.split_once(',').expect("ADD_ASKS=first,then");
        let (mut s, t_world) = world(&[&facts, &format!("asks({first}).")]);
        let steps0 = s.eval.steps;
        let ((_, a), t_delta) = timed(|| {
            let a = s.assert_delta(&format!("asks({then}).")).unwrap();
            s.eval.ensure().unwrap();
            a
        });
        let (mut f, t_fresh) = world(&[&facts, &format!("asks({first}).\nasks({then}).")]);
        let same = without_record(&s.eval.canonical_state()) == without_record(&f.eval.canonical_state());
        eprintln!("asks({first}) then asks({then}): first cone {t_world:.2}s ({steps0} steps), delta {t_delta:.2}s, fresh {t_fresh:.2}s ({} steps), x{:.1}; same={same}; {a:?}", f.eval.steps, t_fresh / t_delta.max(1e-6));
        assert!(same);
        return;
    }
    if let Ok(cell) = std::env::var("ADD_CELL") {
        let md = std::fs::read_to_string(&cell).unwrap();
        let mut rules = String::new();
        let mut inside = false;
        for l in md.lines() {
            if l.starts_with("```") {
                inside = l == "```datalog";
                continue;
            }
            if inside && l.contains(":-") {
                rules.push_str(l);
                rules.push('\n');
            }
        }
        let (mut s, t_world) = world(&[&facts]);
        let ((_, a), t_delta) = timed(|| { let a = s.load_delta(&rules, None).unwrap(); s.eval.ensure().unwrap(); a });
        let (mut f, t_fresh) = timed(|| {
            let mut f = Session::fresh(4_000_000_000);
            f.eval.space = 40_000_000;
            f.load(&model, None).unwrap();
            f.assert(&facts).unwrap();
            f.load(&rules, None).unwrap();
            f.evaluate().unwrap();
            f
        });
        let same = without_record(&s.eval.canonical_state()) == without_record(&f.eval.canonical_state());
        eprintln!("cell {cell}: {} rules; world {t_world:.2}s, delta {t_delta:.2}s, fresh {t_fresh:.2}s, x{:.1}; same={same}; {a:?}", rules.lines().count(), t_fresh / t_delta.max(1e-6));
        assert!(same);
        return;
    }
    let picks: Vec<usize> = std::env::var("ADD_FILES").map(|v| v.split(',').map(|x| x.parse().unwrap()).collect()).unwrap_or_else(|_| vec![0]);
    for i in picks {
        let held = order[i % order.len()];
        let rest: String = order.iter().filter(|v| **v != held).map(|v| by[v].as_str()).collect::<String>() + &loose;
        let file = &by[held];
        let (mut s, t_world) = world(&[&rest]);
        let ((_, a), t_delta) = timed(|| { let a = s.assert_delta(file).unwrap(); s.eval.ensure().unwrap(); a });
        let (mut f, t_fresh) = world(&[&rest, file]);
        let same = without_record(&s.eval.canonical_state()) == without_record(&f.eval.canonical_state());
        eprintln!(
            "file {held} ({} facts of {}): world of the rest {t_world:.2}s, delta {t_delta:.2}s, fresh {t_fresh:.2}s, x{:.1}; {} facts; same={same}; {a:?}",
            file.lines().count(),
            facts.lines().count(),
            t_fresh / t_delta.max(1e-6),
            s.eval.store.fact_count()
        );
        assert!(same);
    }
}

/// A closure walked again that gives a row it held a shorter path: the row stands lower, and so does a cell over it.
#[test]
fn a_closure_row_given_a_shorter_path_seals_its_aggregate_again() {
    let program = "edb(e). edb(n).\np(X, Y) :- e(X, Y).\np(X, Z) :- p(X, Y), e(Y, Z).\nq(X) :- n(X), not p(X, X).\nc(X, N) :- n(X), N is count(Y : p(X, Y)).\nn(b). n(e). n(c). e(d, b). e(c, c). e(c, d). e(a, e). e(b, c).\n";
    one_addition(program, Op::Assert("e(c, b). n(a).".into()));
}
