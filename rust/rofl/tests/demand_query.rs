//! A QUESTION TO A RELATION UNFOLDED AT A CALL (examples/checks/demand-query.rofl): `ask` unfolds it as
//! the reference's `query` does, says `partial` when an answer it left unknown is named by no shrug row,
//! and leaves the store as it found it (f_ask_read_the_store_where_query_unfolded,
//! f_a_question_stored_what_it_unfolded). scripts/whycheck.ts compares the same asks with src/api.ts.
use rofl::session::Session;
use std::path::Path;

fn world() -> Session {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut s = Session::fresh(50_000_000);
    s.load(&std::fs::read_to_string(root.join("boot.rofl")).unwrap(), None).expect("boot");
    s.load(&std::fs::read_to_string(root.join("examples/checks/demand-query.rofl")).unwrap(), None).unwrap_or_else(|d| panic!("{d:?}"));
    s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    s
}

#[test]
fn an_ask_unfolds_a_relation_answered_on_demand() {
    let mut s = world();
    let before = s.eval.store.canonical_state(&s.eval.h);
    let a = s.ask("dq_o(X, 9)").unwrap();
    assert_eq!(a.rows, vec![vec!["6".to_string()]], "dq_o(6, 9) holds and is in no store");
    assert!(a.partial, "dq_o(4, 9) is not known and no shrug row names it");
    let a = s.ask("dq_o(6, Y)").unwrap();
    assert_eq!(a.rows, vec![vec!["1".to_string()], vec!["?Y".to_string()]]);
    assert!(!a.partial);
    let a = s.ask("dq_o(4, Y)").unwrap();
    assert!(a.rows.is_empty());
    assert_eq!(a.shrugs.len(), 1, "the shrug row of dq_o(4, 1)");
    assert!(a.partial, "the row names dq_o(4, 1), not dq_o(4, _)");
    let a = s.ask("dq_o(4, 1)").unwrap();
    assert!(!a.partial, "the shrug row names it");
    assert_eq!(s.eval.store.canonical_state(&s.eval.h), before, "an ask left a fact behind");
}

#[test]
fn a_why_asks_as_whynot_does_and_neither_leaves_a_fact() {
    let mut s = world();
    let before = s.eval.store.canonical_state(&s.eval.h);
    let first = s.why("dq_o(6, 9)").unwrap();
    assert!(first.starts_with("dq_o[main](6,9)  <= "), "{first}");
    let (holds, _) = s.whynot("dq_o(6, 9)", &rofl::engine::WhynotBounds::default()).unwrap();
    assert!(holds);
    assert_eq!(s.why("dq_o(6, 9)").unwrap(), first, "the why after a whynot is another");
    // a shrug is the answer in an aggregate world and the plain evaluator's refusal, in the same words
    assert!(s.why("dq_o(4, 9)").unwrap_or_else(|e| e).starts_with("dq_o[main](4,9): no answer, a shrug"));
    assert_eq!(s.eval.store.canonical_state(&s.eval.h), before, "a question left a fact behind");
}

fn small(budget: i64, src: &str) -> Session {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut s = Session::fresh(budget);
    s.load(&std::fs::read_to_string(root.join("boot.rofl")).unwrap(), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    s.evaluate().unwrap_or_else(|e| panic!("{e:?}"));
    s
}

/// A QUESTION RUNS UNDER ITS OWN BUDGET (f_a_question_spent_the_world_budget): sixty asks, thirty whynots and
/// thirty whys of a relation answered on demand under a session budget of 200 all answer as the first did, and
/// the world's steps are as the evaluation left them.
#[test]
fn a_question_spends_its_own_budget() {
    let mut s = small(200, "edb(t_s). t_s(0). t_s(1). t_s(2). t_s(3).\nt_o(X, Y) :- t_s(X), X > 0.\nt_p(X, Y) :- t_o(X, Y), t_s(X).\nt_r(X) :- t_s(X), t_p(X, 7).\n");
    let steps = s.eval.steps;
    let first = s.ask("t_p(X, Y)").expect("the first ask").rows;
    for i in 0..60 {
        let a = s.ask("t_p(X, Y)").unwrap_or_else(|e| panic!("ask {i}: {e}: a question spent the world's budget"));
        assert_eq!(a.rows, first, "ask {i}: a question spent the world's budget");
    }
    let bounds = rofl::engine::WhynotBounds::default();
    let whynot = s.whynot("t_r(9)", &bounds).unwrap().1;
    for i in 0..30 {
        assert_eq!(s.whynot("t_r(9)", &bounds).unwrap().1, whynot, "whynot {i}: a question spent the world's budget");
        assert!(s.why("t_p(1, 7)").is_ok(), "why {i}: a question spent the world's budget");
    }
    assert_eq!(s.eval.steps, steps, "a question left its steps in the world's");
}

/// A WALL MET ANSWERING is a hole named for the question and a partial answer, as the reference's `query` writes
/// it, not an error.
#[test]
fn an_ask_that_meets_a_wall_is_partial() {
    let mut s = small(4000, "edb(t_s). t_s(0).\nt_u(X, Y) :- t_s(X).\nt_d(X, Z) :- t_u(X, X).\nt_d(Y, Z) :- t_d(X, Z), Y is X + 1.\n");
    let a = s.ask("t_d(X, Y)").expect("a wall met answering is no error");
    assert!(a.partial && a.rows.is_empty());
    let a = s.ask("t_d(X, Y)").expect("a wall met answering is no error");
    assert!(a.partial);
    let state = s.eval.store.canonical_state(&s.eval.h);
    assert!(state.contains("hole[$kernel]($q(2),budget_exhausted)"), "no hole names the second question");
}

/// AN ASK'S ANSWERS ARE TOLD APART BY A SET, not by a scan of those found so far: 40 000 open answers took
/// quadratic time to dedup. The clock is the guard, in an optimised build only.
#[test]
fn an_ask_with_many_answers_is_linear() {
    let n = 40_000;
    let mut src = String::from("edb(t_s).\n");
    for i in 0..n {
        src.push_str(&format!("t_s({i}).\n"));
    }
    src.push_str("t_o(X, Y) :- t_s(X).\nt_p(X, Y) :- t_o(X, Y).\nt_k(X) :- t_s(X), X < 3, t_p(X, 7).\n");
    let mut s = small(200_000_000, &src);
    let t = std::time::Instant::now();
    let a = s.ask("t_p(X, Y)").unwrap();
    let secs = t.elapsed().as_secs_f64();
    assert_eq!(a.rows.len(), n + 3);
    if !cfg!(debug_assertions) {
        assert!(secs < 1.0, "an ask of {n} open answers took {secs:.2} s: its answers were told apart by a scan");
    }
}

/// ASKING A SEALED BODY REFUSES (f_an_ask_answered_a_sealed_body), as src/api.ts `query` does: no rows, a
/// partial answer, and a hole named for the question.
#[test]
fn an_ask_of_a_sealed_body_refuses() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut s = small(50_000_000, &std::fs::read_to_string(root.join("examples/checks/sealed-provenance.rofl")).unwrap());
    let a = s.ask("derived_by(F, R, T)").unwrap();
    assert!(a.rows.is_empty() && a.partial, "an ask answered a sealed body");
    let state = s.eval.store.canonical_state(&s.eval.h);
    assert!(state.contains("hole[$kernel]($q(1),reflection_sealed)"), "no hole names the refused question");
}

/// A QUESTION THAT MEETS THE SPACE WALL LEAVES THE WORLD AS IT FOUND IT (f_a_question_left_its_wall_in_the_world):
/// no hole of a rule beside the question's own, and that one says the rows ran out.
#[test]
fn a_question_that_runs_out_of_rows_writes_only_its_own_hole() {
    let mut src = String::from("edb(t_e).\n");
    for i in 0..30 {
        src.push_str(&format!("t_e(n{i}, n{}).\n", (i + 1) % 30));
    }
    src.push_str("t_p(X, Y, W) :- t_e(X, Y).\nt_p(X, Z, W) :- t_p(X, Y, W), t_e(Y, Z).\n");
    let mut s = small(10_000_000, &src);
    let before: std::collections::BTreeSet<String> = s.eval.store.canonical_state(&s.eval.h).lines().map(String::from).collect();
    s.eval.space = 200;
    let a = s.ask("t_p(X, Y, W)").expect("a wall met answering is no error");
    assert!(a.partial);
    let new: Vec<String> = s.eval.store.canonical_state(&s.eval.h).lines().filter(|l| !before.contains(*l)).map(String::from).collect();
    assert_eq!(new, vec!["hole[$kernel]($q(1),space_exhausted) timeless base frozen support=0".to_string()], "a question left a hole of its wall in the world");
}

/// A QUESTION'S ROWS ARE ITS OWN, their peak too (f_a_question_spent_the_world_budget): the world's peak is as
/// it was before an ask that held more rows.
#[test]
fn a_question_leaves_the_world_its_peak() {
    let mut src = String::from("edb(t_e).\n");
    for i in 0..60 {
        src.push_str(&format!("t_e(n{i}, n{}).\n", (i + 1) % 60));
    }
    src.push_str("t_p(X, Y, W) :- t_e(X, Y).\nt_p(X, Z, W) :- t_p(X, Y, W), t_e(Y, Z).\nt_q(X, W) :- t_e(X, n0).\n");
    let mut s = small(50_000_000, &src);
    // the world's mark set low, so the question's rows would pass it
    s.eval.peak_rows = 1;
    let peak = s.eval.peak_rows;
    let a = s.ask("t_p(n0, Y, W)").unwrap();
    assert_eq!(a.rows.len(), 60);
    assert_eq!(s.eval.peak_rows, peak, "a question left its peak of rows in the world's");
}
