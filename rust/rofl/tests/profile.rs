//! THE PROFILE OF AN EVALUATION, READ BY RULES (examples/profile/chain.rofl; docs/cli.md, *The profile of an
//! evaluation*). A rule that reads a relation of the book `profile` is answered after the evaluation with what each rule and premise
//! cost (`Eval::profile_text`), and runs in the round after; a world that reads none pays nothing and holds nothing of it.
use rofl::session::Session;
use std::path::Path;

const BUDGET: i64 = 10_000_000;

fn chain() -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/profile/chain.rofl");
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn rows(s: &mut Session, q: &str) -> Vec<Vec<String>> {
    s.ask(q).unwrap_or_else(|e| panic!("{q}: {e}")).rows
}

#[test]
fn a_rule_that_reads_the_profile_is_answered_in_the_round_after() {
    let mut s = Session::fresh(BUDGET);
    s.load(&chain(), None).unwrap();
    s.evaluate().unwrap();
    // depth(B, K) :- nxt(A, B), depth(A, J), K is J + 1. fires once per node of the chain, kept in written order for its
    // builtin, and reads the whole of nxt on every firing
    let fired = rows(&mut s, "rounds(R, N)");
    assert_eq!(fired.len(), 1, "{fired:?}");
    assert_eq!(fired[0][1], "10");
    let depth = fired[0][0].clone();
    assert!(s.holds(&format!("kept_written({depth}, builtin)")).unwrap());
    let rescanned = rows(&mut s, "rescanned(R, K, Rel)");
    assert_eq!(rescanned, vec![vec![depth.clone(), "1".to_string(), "nxt".to_string()]]);
    // reach is answered by the closure kernel, which the profile says: no firing, and written order for `closure`
    let closure = rows(&mut s, "kept_written(R, closure)");
    assert_eq!(closure.len(), 2, "{closure:?}");
    for r in &closure {
        assert!(s.holds(&format!("fires[profile]({}, 0)", r[0])).unwrap());
    }
    assert!(s.holds("rows[profile](reach, main, 45)").unwrap());
    // the chain is a function of its first argument
    assert!(s.holds("one_next(nxt)").unwrap());
    // the profile joins the reflection: K counts as premise_lit does
    let mut ks: Vec<String> = rows(&mut s, &format!("read[profile]({depth}, K, N)")).into_iter().map(|r| r[0].clone()).collect();
    ks.sort();
    assert_eq!(ks, ["1", "2", "3"]);
    assert_eq!(rows(&mut s, &format!("premise_lit({depth}, K, L)")).len(), 3);
    // the profile's readers are profiled too: their first firing, over nothing
    assert!(rows(&mut s, "fires[profile](R, 1)").len() >= 3);
}

#[test]
fn a_world_that_reads_no_profile_holds_none() {
    let whole = chain();
    let src = whole.split("-- The questions over the profile").next().unwrap().to_string();
    let mut s = Session::fresh(BUDGET);
    s.load(&src, None).unwrap();
    s.evaluate().unwrap();
    assert!(rows(&mut s, "fires[profile](R, N)").is_empty());
    assert!(rows(&mut s, "rows[profile](Rel, B, N)").is_empty());
}

#[test]
fn the_profile_is_the_same_on_every_run() {
    let state = || {
        let mut s = Session::fresh(BUDGET);
        s.load(&chain(), None).unwrap();
        s.evaluate().unwrap();
        s.eval.canonical_state()
    };
    assert_eq!(state(), state());
}
