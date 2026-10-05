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
