//! THE FIVE VERBS, HELD TO THE ORACLE THAT ALREADY EXISTS.
//!
//! A new surface over an evaluated world is the easiest place in this port to
//! be confidently wrong, because it answers questions nothing else asks. So
//! nothing here trusts the surface to describe itself:
//!
//!   * `open` + `evaluate` is diffed against `<name>.expected.txt`, the same
//!     `canonicalState` the corpus binary is judged by. If the session path is
//!     not the harness path, this says so on all 34 cases rather than on none.
//!   * `fork` is judged by EQUALITY OF STATES and then by DIVERGENCE: a fork
//!     evaluated alone must equal the core evaluated alone, and a fact asserted
//!     into the fork must be invisible to the core. One direction alone would
//!     pass for a fork that shared everything, and the other for one that
//!     shared nothing and had also lost the world.
//!   * `ask` is judged against the STORE'S OWN census, not against itself. For
//!     every (relation, book, arity) in the evaluated world the store is asked
//!     how many facts it holds, and `ask` is asked the same question in ROFL;
//!     the two counts must agree. That routes the question through the parser,
//!     `arg_matches` and the superset re-check, and compares the answer with a
//!     number produced by neither.
//!
//! The cost fields are checked for CONSISTENCY, not for a value: `scanned` may
//! never be smaller than the rows returned, because a superset that is smaller
//! than the answer is a defect and a timing is not a test.
use rofl::session::Session;
use rofl::store::write_fact_key;
use rofl::term::TermK;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn corpus() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../facts/port-corpus")
}

fn cases() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(corpus())
        .expect("port-corpus")
        .filter_map(|e| {
            let n = e.ok()?.file_name().to_string_lossy().into_owned();
            n.strip_suffix(".seed.json").map(|s| s.to_string())
        })
        .collect();
    v.sort();
    v
}

fn open(name: &str) -> Session {
    let p = corpus().join(format!("{name}.seed.json"));
    let src = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
    Session::open(&src, BUDGET).unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// A case named `<x>.t3` IS THREE CALLS TO `tick`, AND NOTHING ELSE.
///
/// The corpus generator replays ticks and never calls `evaluate` beside them,
/// because `tick` already runs the standing tick to fixpoint through `ensure`.
/// An `evaluate()` here would re-derive a layer the tick already has and
/// re-date every witness — which is the exact shape of the harness defect
/// recorded at the top of `src/bin/rofl_eval.rs`, and the reason this helper
/// exists instead of the two verbs being called wherever they seem to fit.
fn ticks_of(name: &str) -> u32 {
    name.rsplit('.').next().and_then(|s| s.strip_prefix('t')).and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn settle(s: &mut Session, name: &str) -> Result<(), String> {
    match ticks_of(name) {
        0 => s.evaluate().map(|_| ()).map_err(|e| rofl::describe(&e)),
        n => (0..n).try_for_each(|_| s.tick().map(|_| ()).map_err(|e| rofl::describe(&e))),
    }
}

/// `open` + `evaluate` must produce the corpus answer. The verb is only worth
/// offering if it is the same evaluation the port is already judged by.
#[test]
fn evaluate_matches_the_corpus() {
    let names = cases();
    assert!(names.len() >= 30, "corpus shrank: {}", names.len());
    let mut checked = 0;
    for n in &names {
        let expected = corpus().join(format!("{n}.expected.txt"));
        let Ok(want) = std::fs::read_to_string(&expected) else { continue };
        let mut s = open(n);
        if let Err(e) = settle(&mut s, n) {
            panic!("{n}: {e}");
        }
        if ticks_of(n) == 0 {
            // A wall is a fact, not an error — but no corpus case is meant to
            // hit one at this budget, so a partial here is a defect.
            let o = { let mut f = s.fork(); f.evaluate().unwrap() };
            assert!(!o.partial, "{n}: partial at budget {BUDGET}");
            assert!(o.peak_rows <= o.space, "{n}: peak {} over space {}", o.peak_rows, o.space);
        }
        let got = s.eval.store.canonical_state(&s.eval.h);
        assert_eq!(got.trim_end(), want.trim_end(), "{n}: session state differs from the corpus");
        checked += 1;
    }
    assert!(checked >= 30, "only {checked} cases compared");
}

/// A fork is the same world, and then it is a DIFFERENT one. Both halves are
/// needed: sharing everything passes the first, sharing nothing passes the
/// second, and only a real copy passes both.
#[test]
fn a_fork_is_the_same_world_and_then_its_own() {
    let mut same = 0;
    for n in &cases() {
        let core = open(n);
        let mut a = core.fork();
        let mut b = core.fork();
        if settle(&mut a, n).is_err() || settle(&mut b, n).is_err() {
            continue;
        }
        assert_eq!(
            a.eval.store.canonical_state(&a.eval.h),
            b.eval.store.canonical_state(&b.eval.h),
            "{n}: two forks of one core evaluated differently"
        );
        let before = a.eval.store.canonical_state(&a.eval.h);
        // A relation no seed can contain, so its arrival is unambiguous.
        let added = b.assert("$fork_probe_9c1(marker).").expect("assert");
        assert_eq!(added, 1, "{n}: the probe was already there");
        assert!(settle(&mut b, n).is_ok(), "{n}: fork would not re-settle");
        assert_eq!(
            a.eval.store.canonical_state(&a.eval.h),
            before,
            "{n}: asserting into one fork changed another"
        );
        assert!(
            b.eval.store.canonical_state(&b.eval.h).contains("$fork_probe_9c1"),
            "{n}: the assert did not land"
        );
        same += 1;
    }
    assert!(same >= 30, "only {same} cases forked");
}

/// `ask` against the store's own census. The counts come from two different
/// pieces of code and must agree on every relation of every case.
#[test]
fn ask_agrees_with_the_stores_own_census() {
    let mut asked = 0usize;
    let mut probed = 0usize;
    for n in &cases() {
        let mut s = open(n);
        if settle(&mut s, n).is_err() {
            continue;
        }
        // The census: (relation, book, arity) -> live facts, straight off the
        // store, without going near the query path.
        let mut census: BTreeMap<(String, String, usize), usize> = BTreeMap::new();
        for id in s.eval.store.all_facts() {
            if !s.eval.store.alive(id) {
                continue;
            }
            let r = s.eval.store.rec(id);
            let rel = s.eval.h.name(r.rel).to_string();
            let bk = s.eval.h.name(r.persp).to_string();
            let ar = s.eval.store.arity(id);
            *census.entry((rel, bk, ar)).or_insert(0) += 1;
        }
        for ((rel, bk, ar), want) in &census {
            // Only names that can be written back as ROFL. A relation whose
            // name needs quoting is a real thing in this world and it is not
            // what this test is about, so it is skipped rather than mangled.
            if !writable(rel) || !writable(bk) {
                continue;
            }
            let q = format!("{rel}[{bk}]({})", vec!["_"; *ar].join(", "));
            let a = s.ask(&q).unwrap_or_else(|e| panic!("{n}: {q}: {e}"));
            assert_eq!(a.rows.len(), *want, "{n}: {q} counted {} against the census {want}", a.rows.len());
            assert_eq!(a.vars.len(), *ar, "{n}: {q} gave {} columns for arity {ar}", a.vars.len());
            assert!(a.scanned >= a.rows.len(), "{n}: {q} returned more rows than it scanned");
            assert_eq!(a.keys.len(), a.rows.len());
            asked += 1;
            if a.probed {
                probed += 1;
            }
        }
    }
    assert!(asked >= 200, "only {asked} relations asked");
    // A wholly-unbound query has no bound position to probe with, so the store
    // declines every one of these by construction. Asserting that keeps the
    // NEXT test honest: if this ever flips, the two are measuring different
    // paths and the bound-key test below is the one that matters.
    assert_eq!(probed, 0, "an unbound ask probed an index");
}

/// A BOUND key, which is the 5.5 ms end of measurement 1. Every fact in the
/// world is asked for by name and must come back exactly once — and the ask
/// must scan less than the whole relation wherever the store offers an index.
#[test]
fn a_bound_ask_finds_exactly_its_fact() {
    let mut found = 0usize;
    let mut narrower = 0usize;
    for n in &cases() {
        let mut s = open(n);
        if settle(&mut s, n).is_err() {
            continue;
        }
        let ids = s.eval.store.all_facts();
        for id in ids.iter().take(400) {
            if !s.eval.store.alive(*id) {
                continue;
            }
            let r = *s.eval.store.rec(*id);
            let rel = s.eval.h.name(r.rel).to_string();
            let bk = s.eval.h.name(r.persp).to_string();
            if !writable(&rel) || !writable(&bk) {
                continue;
            }
            // Only facts whose arguments can be written back verbatim. This is
            // deliberately narrow: the point is to test the LOOKUP, and a
            // round-trip through the printer is a different test.
            let args = s.eval.store.args(*id).to_vec();
            if args.is_empty() {
                continue;
            }
            let mut text = Vec::new();
            let mut ok = true;
            for a in &args {
                match a.kind() {
                    TermK::Atom(sym) => {
                        let nm = s.eval.h.name(sym).to_string();
                        if writable(&nm) { text.push(nm) } else { ok = false }
                    }
                    TermK::Int(v) if v >= 0 => text.push(v.to_string()),
                    _ => ok = false,
                }
                if !ok {
                    break;
                }
            }
            if !ok {
                continue;
            }
            let mut key = String::new();
            write_fact_key(&s.eval.h, r.rel, r.persp, &args, &mut key);
            let q = format!("{rel}[{bk}]({})", text.join(", "));
            let a = s.ask(&q).unwrap_or_else(|e| panic!("{n}: {q}: {e}"));
            assert_eq!(a.rows.len(), 1, "{n}: {q} matched {} facts", a.rows.len());
            assert_eq!(a.keys[0], key, "{n}: {q} returned the wrong fact");
            assert!(a.vars.is_empty(), "{n}: {q} has no variables but reported columns");
            let total = s.eval.store.rel_count(r.rel);
            if a.scanned < total {
                narrower += 1;
            }
            found += 1;
        }
    }
    assert!(found >= 200, "only {found} bound asks made");
    // Measurement 1 is only visible if a bound ask is actually cheaper than a
    // scan somewhere. If this is ever 0 the cost fields are decoration.
    assert!(narrower > 0, "no bound ask ever looked at less than its whole relation");
}

/// A repeated variable CONSTRAINS, as it does in a rule body, and two
/// wildcards are two columns. Both are things `ask` could plausibly get wrong
/// in a way no corpus case would notice, so they are asked directly.
#[test]
fn a_repeated_variable_constrains_and_wildcards_are_columns() {
    let mut s = open(&cases()[0]);
    s.evaluate().expect("evaluate");
    s.assert("$q(a, a).\n$q(a, b).\n$q(b, b).").expect("assert");
    s.evaluate().expect("re-evaluate");

    let all = s.ask("$q(_, _)").unwrap();
    assert_eq!(all.rows.len(), 3);
    assert_eq!(all.vars.len(), 2, "two wildcards are two columns");

    let dup = s.ask("$q(X, X)").unwrap();
    assert_eq!(dup.rows.len(), 2, "a repeated variable did not constrain");
    assert_eq!(dup.vars, vec!["X".to_string()], "a repeated variable is one column");
    assert!(dup.scanned >= dup.rows.len());

    let one = s.ask("$q(a, b)").unwrap();
    assert_eq!(one.rows.len(), 1);
    assert!(one.vars.is_empty());

    let none = s.ask("$q(zz, zz)").unwrap();
    assert!(none.rows.is_empty());
}

/// The two refusals `assert` owes a caller, stated rather than assumed.
#[test]
fn assert_refuses_a_rule_and_a_variable() {
    let mut s = open(&cases()[0]);
    s.evaluate().expect("evaluate");
    assert!(s.assert("$r(X) :- $q(X).").is_err(), "a rule was accepted as a fact");
    assert!(s.assert("$r(X).").is_err(), "a variable was accepted in a base fact");
    assert!(s.assert("not a literal at all").is_err());
    assert!(s.ask("$q(X) :- $r(X)").is_err(), "ask accepted a rule");
}

/// A name that can be written back into ROFL unquoted.
fn writable(s: &str) -> bool {
    !s.is_empty()
        && s.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c == '$' || c == '_')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}
