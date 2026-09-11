//! `why` and `whynot` against the reference host, byte for byte.
//!
//! THE TEXT IS THE CONTRACT (docs/port-surface.md, "The port owes
//! explanation"). Two engines that explain the same world differently are two
//! languages, so the expected strings here were produced by `src/api.ts` on
//! the same program and pasted in unedited — including the rule ids, which are
//! content-addressed, and the `#1` / `#3` renaming suffixes, which are the
//! evaluator's own and not a spelling either side may choose.

use rofl::engine::WhynotBounds;
use rofl::session::Session;

const W: &str = r#"
edb(calls).
edb(down).
calls(a, b).
calls(b, c).
down(c).
reaches(A, B) :- calls(A, B).
reaches(A, C) :- reaches(A, B), calls(B, C).
live(X) :- reaches(_, X), not down(X).
hop(A, B, N) :- calls(A, B), N is 1 + 1.
"#;

fn world() -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(W, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

#[test]
fn why_walks_the_derivation_to_its_axioms() {
    assert_eq!(
        world().why("reaches(a, c)").unwrap(),
        "reaches[main](a,c)  <= rb0ab574d @tick 0\n  \
           reaches[main](a,b)  <= r7a090e48 @tick 0\n    \
             calls[main](a,b) [axiom]\n  \
           calls[main](b,c) [axiom]"
    );
}

#[test]
fn a_negated_premise_renders_as_finite_failure_with_its_demonstration() {
    assert_eq!(
        world().why("live(b)").unwrap(),
        "live[main](b)  <= r1fa0aa7b @tick 0\n  \
           reaches[main](a,b)  <= r7a090e48 @tick 0\n    \
             calls[main](a,b) [axiom]\n  \
           not down[main](b) [finite failure]\n    \
             whynot down[main](b):\n      \
               no rule concludes 'down' and no matching base fact exists"
    );
}

#[test]
fn a_builtin_premise_keeps_its_own_spelling() {
    assert_eq!(
        world().why("hop(a, b, 2)").unwrap(),
        "hop[main](a,b,2)  <= rad5d6396 @tick 0\n  \
           calls[main](a,b) [axiom]\n  \
           2 is +(1,1) [builtin]"
    );
}

#[test]
fn why_refuses_a_fact_that_does_not_hold_and_names_the_other_question() {
    assert_eq!(
        world().why("reaches(c, a)").unwrap_err(),
        "reaches[main](c,a) does not hold; try: whynot reaches[main](c,a)"
    );
}

#[test]
fn why_refuses_a_literal_that_is_not_ground() {
    assert_eq!(world().why("reaches(a, X)").unwrap_err(), "why needs a ground literal");
}

#[test]
fn whynot_names_the_negation_that_blocked_it_and_the_fact_that_did() {
    let (holds, text) = world().whynot("live(c)", &WhynotBounds::default()).unwrap();
    assert!(!holds);
    assert_eq!(
        text,
        "whynot live[main](c):\n  \
         rule r1fa0aa7b: live[main](?X)@now :- reaches[main](?_$0,?X)@now, not down[main](?X)@now\n    \
           failed premise: not down[main](c) -- blocked: down[main](c) holds"
    );
}

/// THE RECURSION AND ITS TERMINATION IN ONE ANSWER: two rules, a positive
/// premise explained one level deeper, and a self-join that comes back to the
/// goal and is cut by the cycle path rather than by the depth cap.
#[test]
fn whynot_recurses_and_reports_the_cycle_it_found() {
    let (holds, text) = world().whynot("reaches(c, a)", &WhynotBounds::default()).unwrap();
    assert!(!holds);
    assert_eq!(
        text,
        "whynot reaches[main](c,a):\n  \
         rule r7a090e48: reaches[main](?A,?B)@now :- calls[main](?A,?B)@now\n    \
           failed premise: calls[main](c,a)\n      \
             no rule concludes 'calls' and no matching base fact exists\n  \
         rule rb0ab574d: reaches[main](?A,?C)@now :- reaches[main](?A,?B)@now, calls[main](?B,?C)@now\n    \
           failed premise: reaches[main](c,?B#1)\n      \
             rule r7a090e48: reaches[main](?A,?B)@now :- calls[main](?A,?B)@now\n        \
               failed premise: calls[main](c,?B#1)\n          \
                 no rule concludes 'calls' and no matching base fact exists\n      \
             rule rb0ab574d: reaches[main](?A,?C)@now :- reaches[main](?A,?B)@now, calls[main](?B,?C)@now\n        \
               failed premise: reaches[main](c,?B#3)\n          \
                 reaches[main](c,?B#3) [cycle]"
    );
}

#[test]
fn whynot_over_a_relation_no_rule_concludes() {
    let (holds, text) = world().whynot("nosuch(a)", &WhynotBounds::default()).unwrap();
    assert!(!holds);
    assert_eq!(
        text,
        "whynot nosuch[main](a):\n  no rule concludes 'nosuch' and no matching base fact exists"
    );
}

/// A LITERAL THAT HOLDS IS THE ANSWER, NOT AN ERROR.
#[test]
fn whynot_on_something_that_holds_says_so() {
    let (holds, text) = world().whynot("reaches(a, c)", &WhynotBounds::default()).unwrap();
    assert!(holds);
    assert_eq!(text, "reaches[main](a,c) holds; nothing to demonstrate");
}

// -------------------------------------------------- the counterfactual half

#[test]
fn holds_is_the_question_with_the_answer_thrown_away() {
    let mut s = world();
    assert!(s.holds("reaches(a, c)").unwrap());
    assert!(!s.holds("reaches(c, a)").unwrap());
}

#[test]
fn fact_keys_narrows_by_relation_and_comes_back_in_canonical_order() {
    let mut s = world();
    assert_eq!(s.fact_keys(Some("calls")), ["calls[main](a,b)", "calls[main](b,c)"]);
    assert_eq!(
        s.fact_keys(Some("reaches")),
        ["reaches[main](a,b)", "reaches[main](a,c)", "reaches[main](b,c)"]
    );
}

/// THE BLAST RADIUS, AND THE WORLD IT IS ASKED OF IS NOT TOUCHED.
#[test]
fn excise_names_everything_the_fact_was_holding_up() {
    let mut s = world();
    let (removed, added) = s.excise("calls(a, b)").unwrap();
    assert_eq!(
        removed,
        [
            "calls[main](a,b)",
            "hop[main](a,b,2)",
            "live[main](b)",
            "reaches[main](a,b)",
            "reaches[main](a,c)"
        ]
    );
    assert!(added.is_empty());
    // the counterfactual left no mark on the world it was asked of
    assert!(s.holds("reaches(a, c)").unwrap());
}

#[test]
fn excise_refuses_a_derived_fact() {
    assert_eq!(
        world().excise("reaches(a, c)").unwrap_err(),
        "reaches[main](a,c) is not a base fact"
    );
}

#[test]
fn retract_refuses_a_derived_fact_and_names_the_repair() {
    assert_eq!(
        world().retract("reaches(a, c)").unwrap_err(),
        "reaches[main](a,c) is derived; retract its supports instead"
    );
}

#[test]
fn retract_refuses_a_fact_the_store_does_not_hold() {
    assert_eq!(world().retract("calls(z, z)").unwrap_err(), "no such fact: calls[main](z,z)");
}

/// The repair `retract` promises: the fact goes, and re-evaluation loses
/// exactly what rested on it.
#[test]
fn retract_takes_the_derivations_that_rested_on_it() {
    let mut s = world();
    s.retract("calls(a, b)").unwrap();
    s.evaluate().expect("re-evaluate");
    assert_eq!(s.fact_keys(Some("reaches")), ["reaches[main](b,c)"]);
}

// ------------------------------------------------- the way out, and the pause

const COUNTER: &str = r#"
counter(1) @init.
counter(M) @next :- counter(N), N < 5, M is N + 1.
emit(N) :- counter(N).
"#;

fn counter() -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(COUNTER, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

#[test]
fn save_round_trips_through_open() {
    let mut s = counter();
    s.tick().expect("tick");
    let before = s.eval.store.canonical_state(&s.eval.h);
    let mut back = Session::open(&s.save(), 1_000_000).expect("open");
    assert_eq!(back.eval.store.canonical_state(&back.eval.h), before);
}

/// THE PAUSE, AND IT IS A TICK BOUNDARY AND NOTHING ELSE.
///
/// Three boundaries, a snapshot, a new process's worth of session built from
/// it, and three more — against six taken without stopping. The two worlds are
/// identical to the byte, which is what makes "stop here and continue later" a
/// property of the engine rather than a hope about it.
#[test]
fn a_world_paused_at_a_boundary_resumes_as_the_same_world() {
    let mut straight = counter();
    for _ in 0..6 {
        straight.tick().expect("tick");
    }

    let mut paused = counter();
    for _ in 0..3 {
        paused.tick().expect("tick");
    }
    let mut resumed = Session::open(&paused.save(), 1_000_000).expect("open");
    for _ in 0..3 {
        resumed.tick().expect("tick");
    }

    assert_eq!(resumed.eval.store.canonical_state(&resumed.eval.h), straight.eval.store.canonical_state(&straight.eval.h));
}

#[test]
fn run_drives_boundaries_to_quiescence_and_says_so() {
    let mut s = counter();
    let (ticks, quiescent, partial) = s.run(100).unwrap();
    assert!(quiescent, "the counter empties and the world stops moving");
    assert!(!partial);
    assert_eq!(ticks, 5);
    // and nothing is left to emit: the @next rule stopped carrying it
    assert!(s.fact_keys(Some("counter")).is_empty());
}

/// A BUDGET IS NOT A PAUSE. `run` reports `partial`, the hole is IN the world,
/// and a later larger budget does not reach it — which is why the only place
/// to stop and continue is a boundary, as the test above does.
///
/// THE WALL IS AT ONE AND THE WORLD IS FIVE TICKS LONG, measured rather than
/// guessed: 1 stops at tick 0, and 3 already runs to quiescence. A budget is
/// steps, and this program takes almost none.
#[test]
fn run_reports_partial_rather_than_pretending_to_have_finished() {
    let mut s = Session::fresh(1);
    s.load(COUNTER, None).expect("load");
    let (ticks, quiescent, partial) = s.run(100).unwrap();
    assert!(partial && !quiescent);
    assert_eq!(ticks, 0);
    assert!(!s.fact_keys(Some("hole")).is_empty(), "the world records why it stopped");

    let mut enough = Session::fresh(3);
    enough.load(COUNTER, None).expect("load");
    assert_eq!(enough.run(100).unwrap(), (5, true, false), "control: the wall is the budget");
}

// `strataPlan` HAS NO PORT FORM AND THE REASON IS NOT THE PORT'S.
//
// `Evaluation.strataPlan` (src/engine.ts:1007) reads `readStrata()`, which
// reads the `stratum` relation — and MEASURED on both hosts, with boot.rofl
// loaded and without, that relation has ZERO rows in a settled store. The
// reference answers `level: 1` for `up(X) :- down(X), not gone(X)` only
// because `Rofl.strataPlan` calls `prepared()` first and reads the table the
// evaluation builds while it is still standing.
//
// A port entry point reading the settled store would therefore answer `None`
// for every rule in every world, forever, and pass a test written against it.
// That is a clean-looking negative over an unpopulated relation, which this
// repository has a name for. So it is not shipped: the honest form re-runs the
// stratifier, and that is a piece of work rather than an accessor.
