//! A STRATIFIED LAYER FIRES ONLY THE INSTANCES THAT ARE NEW TO IT
//! (docs/aggregates.md, "Data-level stratification, as built";
//! `f_a_stratified_layer_fires_its_rules_whole`). A chain of n sums, each over the
//! one before, is n layers of one correlation each: fired whole, each layer fires
//! every instance of the rule and the chain costs n x n/2 firings; fired by the
//! correlations it releases, n.
use rofl::session::Session;
use std::path::Path;
use std::time::Instant;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

fn chain(n: usize) -> String {
    let mut s = String::from("edb(seed). edb(sum_head). edb(in_range).\nseed(c0, 1).\n");
    s.push_str("val(C, V) :- seed(C, V).\nval(N, V) :- sum_head(N, I), V is sum(X ; C : in_range(I, C), val(C, X)).\n");
    for k in 1..=n {
        s.push_str(&format!("sum_head(c{k}, r{k}). in_range(r{k}, c{}). in_range(r{k}, c0).\n", k - 1));
    }
    s
}

fn run_in(n: usize, budget: i64) -> (i64, f64, Session, bool) {
    let mut s = Session::fresh(budget);
    s.load(&boot(), None).expect("boot");
    s.load(&chain(n), None).unwrap_or_else(|d| panic!("{d:?}"));
    let t = Instant::now();
    let ev = s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    (ev.steps, t.elapsed().as_secs_f64(), s, ev.partial)
}

fn run(n: usize) -> (i64, f64, Session) {
    let (steps, secs, s, partial) = run_in(n, 1_000_000_000);
    assert!(!partial);
    (steps, secs, s)
}

/// The steps a chain costs are linear in its length, and a chain of 2000 sums runs
/// in under a second (it took 15 s when each layer fired every instance).
#[test]
fn a_chain_of_sums_is_fired_once_per_sum() {
    let (a, _, _) = run(100);
    let (b, secs, mut s) = run(2000);
    assert!(b < a * 21, "20 times the chain cost {b} steps against {a}: the layers fire more than the instances new to them");
    if !cfg!(debug_assertions) {
        assert!(secs < 1.0, "a chain of 2000 sums took {secs} s");
    }
    let rows = s.ask("val(c2000, V)").unwrap().rows;
    assert_eq!(rows, vec![vec!["2000".to_string()]]);
}

/// A layer that fires an instance it has fired is a step, so the budget counts the firings: a chain of
/// 300 sums runs inside six steps a sum, where a layer that fired its rules whole would spend 45 000.
#[test]
fn a_layer_that_fires_an_instance_again_spends_the_budget() {
    let (_, _, _, partial) = run_in(300, 6 * 300);
    assert!(!partial, "a chain of 300 sums did not fit six steps a sum");
}
