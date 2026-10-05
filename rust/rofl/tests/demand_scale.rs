//! A CLOSED RELATION ANSWERED ON DEMAND IS READ LIKE ANY OTHER: its rows are all
//! in the store, so a rule reading one fires on its news only (semi-naive), not
//! over the whole store every round. A recursion through one over a chain of n
//! steps refired its step rule n times, n^2 probes: 73.6 s for 8 000 steps
//! against 0.16 s for the same rules with nothing answered on demand
//! (f_a_closed_demand_reader_refired_every_round). The probe count is the
//! deterministic guard, the clock a coarse one in an optimised build only.
use rofl::session::Session;
use std::path::Path;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

#[test]
fn a_recursion_through_a_closed_demand_relation_is_linear() {
    let n = 4000usize;
    let mut src = String::from("edb(dc_q). edb(dc_e).\ndc_q(0).\n");
    for i in 0..n {
        src.push_str(&format!("dc_e({i}, {}).\n", i + 1));
    }
    // dc_u leaves Y free: dc_u, dc_h and dc_r are answered on demand; dc_h and dc_r are closed
    src.push_str("dc_u(X, Y) :- dc_q(X).\ndc_h(X) :- dc_u(X, X).\ndc_r(X) :- dc_h(X).\ndc_r(Y) :- dc_e(X, Y), dc_r(X).\n");
    let mut s = Session::fresh(50_000_000);
    s.load(&boot(), None).expect("boot");
    s.load(&src, None).unwrap_or_else(|d| panic!("{d:?}"));
    let t = std::time::Instant::now();
    let ev = s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    let secs = t.elapsed().as_secs_f64();
    assert!(!ev.partial, "the evaluation was cut");
    assert_eq!(s.ask("dc_r(X)").unwrap().rows.len(), n + 1);
    let probes: u64 = s.eval.argm_by_rule.values().sum();
    assert!(probes <= 8 * n as u64, "{probes} index probes for a {n}-step chain: a reader of a closed relation refires whole");
    if !cfg!(debug_assertions) {
        assert!(secs < 3.0, "a {n}-step recursion through a closed demand relation took {secs:.2} s");
    }
}
