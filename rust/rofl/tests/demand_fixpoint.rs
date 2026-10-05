//! A CALL MET AGAIN INSIDE ITS OWN UNFOLDING IS ITERATED TO THE FIXPOINT, and the
//! iteration is paid for: an unbounded one meets a wall with a shrug, a bounded one
//! costs what its answers cost (f_a_cycle_fixpoint_ran_away_unbounded_and_recomputed_every_pass).
//! The recursion over the integers ran 14.6 s into a panic of the interner, 4.2 GB, and
//! a chain with a reader per node took 34.5 s and 3.7 GB at 800 nodes. Steps, rows and
//! interned name text are the deterministic guards; the clock a coarse one in an
//! optimised build only.
use rofl::session::{Evaluated, Session};
use std::path::Path;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

fn session(budget: i64, src: &str) -> Session {
    let mut s = Session::fresh(budget);
    s.load(&boot(), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    s
}

fn run(s: &mut Session) -> (Evaluated, f64) {
    let t = std::time::Instant::now();
    let ev = s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    (ev, t.elapsed().as_secs_f64())
}

fn state(s: &Session) -> String {
    s.eval.store.canonical_state(&s.eval.h)
}

/// d over the integers: every pass finds one more answer, without end.
const UNBOUNDED: &str = "edb(t_s). t_s(0).\nt_u(X, Y) :- t_s(X).\nt_d(X, Z) :- t_u(X, X).\nt_d(Y, Z) :- t_d(X, Z), Y is X + 1.\n";

#[test]
fn an_unbounded_fixpoint_meets_the_step_wall() {
    let budget = 20_000;
    let mut s = session(budget, UNBOUNDED);
    let names = s.eval.h.syms.bytes();
    let (ev, _) = run(&mut s);
    assert!(ev.partial, "an unbounded fixpoint finished");
    assert!(state(&s).contains("spent(steps,"), "the wall is not the step wall");
    let grown = s.eval.h.syms.bytes() - names;
    assert!(grown < 200 * budget as usize, "{grown} bytes of names interned for {budget} steps: a name renamed at each read grows");
}

#[test]
fn an_unbounded_fixpoint_meets_the_space_wall() {
    let mut s = session(1_000_000, UNBOUNDED);
    s.eval.space = 2_000;
    let (ev, _) = run(&mut s);
    assert!(ev.partial, "an unbounded fixpoint finished");
    assert!(state(&s).contains("spent(rows,"), "its open answers were not counted as rows");
}

#[test]
fn an_unbounded_nonlinear_fixpoint_pays_for_its_reads() {
    let budget = 20_000;
    let src = "edb(t_s). t_s(1).\nt_b(X, W) :- t_s(X).\nt_p(X, W) :- t_b(X, W).\nt_p(X, W) :- t_p(Y, W), t_p(Z, W), X is Y + Z.\nt_all(X) :- t_p(X, W).\n";
    let mut s = session(budget, src);
    let names = s.eval.h.syms.len();
    let (ev, _) = run(&mut s);
    assert!(ev.partial, "an unbounded fixpoint finished");
    let grown = s.eval.h.syms.len() - names;
    assert!(grown < 8 * budget as usize, "{grown} names interned for {budget} steps: answers read for nothing");
}

#[test]
fn a_chain_iterated_once_is_linear() {
    let n = 2000usize;
    let mut src = String::from("edb(t_q). edb(t_e).\nt_q(0).\n");
    for i in 0..n {
        src.push_str(&format!("t_e({i}, {}).\n", i + 1));
    }
    src.push_str("t_u(X, Y) :- t_q(X).\nt_d(X, Z) :- t_u(X, X).\nt_d(Y, Z) :- t_d(X, Z), t_e(X, Y).\nt_r(X) :- t_d(X, 5).\n");
    let mut s = session(20 * n as i64, &src);
    let (ev, secs) = run(&mut s);
    assert!(!ev.partial, "{n}-step chain cut at {} steps: every pass read every answer", ev.steps);
    assert_eq!(s.ask("t_r(X)").unwrap().rows.len(), n + 1);
    if !cfg!(debug_assertions) {
        assert!(secs < 1.0, "a {n}-step chain iterated once took {secs:.2} s: a call met again read the store again");
    }
}

#[test]
fn a_chain_read_from_every_node_is_bounded() {
    let n = 400usize;
    let mut src = String::from("edb(t_q). edb(t_e). edb(t_s).\nt_q(0).\n");
    for i in 0..n {
        src.push_str(&format!("t_e({i}, {}). t_s({i}).\n", i + 1));
    }
    src.push_str("t_u(X, Y) :- t_q(X).\nt_d(X, Z) :- t_u(X, X).\nt_d(Y, Z) :- t_d(X, Z), t_e(X, Y).\nt_r(X) :- t_s(X), t_d(X, 5).\nt_n(X) :- t_s(X), not t_d(X, 7).\n");
    let mut s = session(200_000_000, &src);
    let names = s.eval.h.syms.bytes();
    let (ev, secs) = run(&mut s);
    assert!(!ev.partial, "the evaluation was cut");
    assert_eq!(s.ask("t_r(X)").unwrap().rows.len(), n);
    assert_eq!(s.ask("t_n(X)").unwrap().rows.len(), 0);
    let grown = s.eval.h.syms.bytes() - names;
    assert!(grown < 64 << 20, "{grown} bytes of names interned for {n} nodes");
    if !cfg!(debug_assertions) {
        assert!(secs < 6.0, "a {n}-node chain read from every node took {secs:.2} s");
    }
}
