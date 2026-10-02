//! THE RETRACTION PATH, HELD TO A FRESH EVALUATION.
//!
//! `Session::retract_delta` brings the aggregate cells a base fact supported
//! to their new state by subtraction (count, sum) or by deriving the one cell
//! again (min, max, or, and), without evaluating the world again. What that
//! must give is what a world built from the same facts and evaluated from
//! nothing gives, byte for byte in `canonical_state`, so every step of every
//! sequence below is a DIFFERENTIAL: the session that took the edits one by
//! one, and a fresh session over the facts it holds then.
//!
//! Edits are random asserts and retracts over four input relations; facts are
//! given as loaded (with their `asserted_by` row) and as asserted (without),
//! and both are retracted. A retract is the delta path unless the world or
//! the fact is one it refuses, and the refusals are counted and named, so a
//! path that quietly stopped taking the delta would fail here as much as one
//! that took it wrongly.
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

/// A random fact of one of the edited relations, as a ground literal.
fn fact(r: &mut Rng, rels: &[&str]) -> String {
    let g = ["a", "b", "c", "d"][r.below(4) as usize];
    match rels[r.below(rels.len() as u64) as usize] {
        "sale" => format!("sale({}, {g}, {})", 1 + r.below(8), r.below(9) as i64 - 3),
        "chan" => format!("chan({}, {})", 1 + r.below(8), 1 + r.below(3)),
        "flag" => format!("flag({g}, {})", if r.below(2) == 0 { "true" } else { "false" }),
        "grp" => format!("grp({g})"),
        other => panic!("{other}"),
    }
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
            if rest.contains(" alg=invertible ") {
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
    sum: Delta,
}

/// `steps` random edits over `rels`, each checked against a fresh world.
fn differential(program: &str, rels: &[&str], seed: u64, start: usize, steps: usize, every: usize) -> Stats {
    let mut r = Rng(seed);
    let mut loaded: BTreeSet<String> = BTreeSet::new();
    let mut asserted: BTreeSet<String> = BTreeSet::new();
    for _ in 0..start {
        let f = fact(&mut r, rels);
        if loaded.contains(&f) || asserted.contains(&f) {
            continue;
        }
        if r.below(2) == 0 { loaded.insert(f) } else { asserted.insert(f) };
    }
    let mut s = fresh(program, &loaded, &asserted);
    let mut st = Stats::default();
    let mut log: Vec<String> = Vec::new();
    assert_eq!(state(&mut s), state(&mut fresh(program, &loaded, &asserted)), "the start");
    for step in 0..steps {
        st.edits += 1;
        let present: Vec<String> = loaded.iter().chain(asserted.iter()).filter(|f| !f.starts_with("edb")).cloned().collect();
        if r.below(100) < 40 || present.is_empty() {
            let f = fact(&mut r, rels);
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
            match s.retract_delta(&f).unwrap_or_else(|e| panic!("{f}: {e}")) {
                Retraction::Delta(d) => {
                    st.delta += 1;
                    st.sum.cells += d.cells;
                    st.sum.subtracted += d.subtracted;
                    st.sum.members_dropped += d.members_dropped;
                    st.sum.members_rederived += d.members_rederived;
                    st.sum.rederived += d.rederived;
                    st.sum.refired += d.refired;
                    st.sum.retired += d.retired;
                }
                Retraction::Full(why) => {
                    st.full.insert(why);
                    st.full_n += 1;
                }
            }
            loaded.remove(&f);
            asserted.remove(&f);
            st.retracts += 1;
            // a member that survives a retraction is the same id, wherever it sits now
            let after = member_ids(&state(&mut s));
            let new: Vec<&String> = after.difference(&before).collect();
            assert!(new.is_empty(), "seed {seed} step {step}: a retraction of {f} gave a member an id it did not have: {new:?}");
        }
        if (step + 1) % every != 0 {
            continue;
        }
        let got = state(&mut s);
        let want = state(&mut fresh(program, &loaded, &asserted));
        if got != want {
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

#[test]
fn a_retraction_is_a_fresh_evaluation_over_random_edits() {
    let mut all = Stats::default();
    for seed in 1..=12u64 {
        let st = differential(PROGRAM, &["sale", "sale", "sale", "chan", "flag"], seed * 7919, 14, 40, 1);
        all.edits += st.edits;
        all.asserts += st.asserts;
        all.retracts += st.retracts;
        all.delta += st.delta;
        all.full_n += st.full_n;
        all.full.extend(st.full);
        for (a, b) in [
            (&mut all.sum.cells, st.sum.cells),
            (&mut all.sum.subtracted, st.sum.subtracted),
            (&mut all.sum.members_dropped, st.sum.members_dropped),
            (&mut all.sum.members_rederived, st.sum.members_rederived),
            (&mut all.sum.rederived, st.sum.rederived),
            (&mut all.sum.refired, st.sum.refired),
            (&mut all.sum.retired, st.sum.retired),
        ] {
            *a += b;
        }
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
    let st = differential(PROGRAM, &["sale", "sale", "sale", "chan", "flag"], 0x5eed, 60, 120, 6);
    eprintln!("{st:?}");
    assert_eq!(st.full_n, 0, "{:?}", st.full);
    assert!(st.sum.subtracted > 20 && st.sum.rederived > 10, "{st:?}");
}

#[test]
fn a_world_the_path_is_not_worked_out_for_is_evaluated_again_and_is_the_same() {
    let st = differential(PLAIN_READER, &["sale"], 31337, 8, 40, 1);
    eprintln!("{st:?}");
    assert!(st.full_n > 5, "{st:?}");
    assert!(st.full.contains("a rule reads the relation outside an aggregate, or negated"), "{:?}", st.full);
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
