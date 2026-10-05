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
    assert!(ev.steps <= 40 * n as i64, "{} steps for a {n}-node chain read from every node: a complete call was unfolded again", ev.steps);
    if !cfg!(debug_assertions) {
        assert!(secs < 1.0, "a {n}-node chain read from every node took {secs:.2} s");
    }
}

#[test]
fn a_complete_call_is_unfolded_once_across_passes() {
    let n = 300usize;
    let mut src = String::from("edb(t_q). edb(t_e). edb(t_g0).\nt_q(0).\n");
    for i in 0..n {
        src.push_str(&format!("t_e({i}, {}). t_g0({i}, {}).\n", i + 1, i + 1));
    }
    // every pass of t_d(X, 5) calls t_g(0, V), whose own fixpoint is complete after the first
    src.push_str("t_u(X, Y) :- t_q(X).\nt_gb(X, W) :- t_q(X).\nt_g(X, W) :- t_gb(X, W).\nt_g(Y, W) :- t_g(X, W), t_g0(X, Y).\n");
    src.push_str("t_d(X, Z) :- t_u(X, X).\nt_d(Y, Z) :- t_d(X, Z), t_g(0, V), t_e(X, Y).\nt_r(X) :- t_d(X, 5).\n");
    let mut s = session(200_000_000, &src);
    let (ev, _) = run(&mut s);
    assert!(!ev.partial, "the evaluation was cut");
    assert_eq!(s.ask("t_r(X)").unwrap().rows.len(), n + 1);
    assert!(ev.steps <= 40 * n as i64, "{} steps: a complete call was unfolded again in every pass of the call around it", ev.steps);
}

/// THE ROWS AN OPEN ANSWER HOLDS ARE GIVEN BACK when its call ends or its table goes
/// (f_the_space_wall_counted_open_answers_already_dropped): a ring of 200 read from one node under
/// 100 000 rows walled with no answer, where the stored copy keeps 80 000 rows and finishes.
#[test]
fn a_ring_of_open_answers_holds_only_what_it_keeps() {
    let n = 200usize;
    let mut src = String::from("edb(t_e). edb(t_dom).\nt_dom(n0). t_dom(n1).\n");
    for i in 0..n {
        src.push_str(&format!("t_e(n{i}, n{}).\n", (i + 1) % n));
    }
    src.push_str("t_p(X, Y, W) :- t_e(X, Y).\nt_p(X, Z, W) :- t_e(X, Y), t_p(Y, Z, W).\nt_r(Y, W) :- t_p(n0, Y, W), t_dom(W).\n");
    let mut s = session(200_000_000, &src);
    s.eval.space = 100_000;
    let (ev, _) = run(&mut s);
    assert!(!ev.partial, "the space wall fell on rows no call held any more");
    assert_eq!(s.ask("t_r(Y, W)").unwrap().rows.len(), 2 * n);
}

/// A STRONGLY CONNECTED SET OF OPEN CALLS ITERATES TOGETHER (f_a_cycle_of_open_calls_iterated_call_by_call):
/// round a ring of 400 read from one node, every call from a node reads the outermost call's growing
/// answers. Unfolded again call by call in each pass of the outermost it took 10.1 s; the set's
/// passes unfold each call once, reading only what the set found since the pass before.
#[test]
fn a_strongly_connected_ring_iterates_together() {
    let n = 400usize;
    let mut src = String::from("edb(t_e). edb(t_dom).\nt_dom(n0). t_dom(n1).\n");
    for i in 0..n {
        src.push_str(&format!("t_e(n{i}, n{}).\n", (i + 1) % n));
    }
    src.push_str("t_p(X, Y, W) :- t_e(X, Y).\nt_p(X, Z, W) :- t_e(X, Y), t_p(Y, Z, W).\nt_r(Y, W) :- t_p(n0, Y, W), t_dom(W).\n");
    let mut s = session(200_000_000, &src);
    let names = s.eval.h.syms.bytes();
    let (ev, secs) = run(&mut s);
    let grown = s.eval.h.syms.bytes() - names;
    let unfolded = s.eval.demand_unfolded;
    eprintln!("ring of {n}: {} steps, {grown} bytes of names, {unfolded} calls unfolded, {secs:.2} s", ev.steps);
    assert!(!ev.partial, "the evaluation was cut");
    assert_eq!(s.ask("t_r(Y, W)").unwrap().rows.len(), 2 * n);
    assert!(ev.steps <= 2 * (n * n) as i64, "{} steps for a ring of {n}", ev.steps);
    assert!(unfolded <= n as u64 + 10, "{unfolded} calls unfolded for a ring of {n}: the calls of the set were unfolded again in every pass");
    if !cfg!(debug_assertions) {
        assert!(secs < 3.0, "a ring of {n} read from one node took {secs:.2} s: the calls of the set were unfolded again in every pass");
    }
}
