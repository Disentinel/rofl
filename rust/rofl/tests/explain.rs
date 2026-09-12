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

// ----------------------------------------------------- what each tick spent
//
// `evals` was the last field the port's snapshot went out empty on.
// `docs/time-and-continuity.md`: a past tick replays bit-identically ONLY if
// the replay is given the same budget — a tick cut short at 100 000 steps and
// replayed at 500 000 derives more, and the replay disagrees with history
// while claiming to be it. The numbers below are the reference host's, taken
// on the same program.

fn evals_of(s: &Session) -> Vec<(u32, i64, i64, bool)> {
    s.eval
        .store
        .eval_log
        .iter()
        .map(|(t, e)| (*t, e.budget, e.steps, e.partial))
        .collect()
}

#[test]
fn every_tick_records_what_it_was_allowed_and_what_it_spent() {
    let mut s = Session::fresh(100_000);
    s.load(COUNTER, None).expect("load");
    s.evaluate().expect("evaluate");
    for _ in 0..3 {
        s.tick().expect("tick");
    }
    assert_eq!(
        evals_of(&s),
        [(0, 100_000, 2, false), (1, 100_000, 2, false), (2, 100_000, 2, false)]
    );
}

#[test]
fn the_record_survives_a_snapshot() {
    let mut s = Session::fresh(100_000);
    s.load(COUNTER, None).expect("load");
    s.evaluate().expect("evaluate");
    for _ in 0..3 {
        s.tick().expect("tick");
    }
    let back = Session::open(&s.save(), 100_000).expect("open");
    assert_eq!(evals_of(&back), evals_of(&s));
}

/// THE CASE THE FIELD EXISTS FOR. A tick that ran out records the budget that
/// was too small, so a replay is given the same wall instead of sailing past
/// it and deriving a history that never happened.
#[test]
fn a_tick_that_ran_out_records_the_budget_that_stopped_it() {
    let mut s = Session::fresh(1);
    s.load(COUNTER, None).expect("load");
    let (_, _, partial) = s.run(100).unwrap();
    assert!(partial);
    assert_eq!(s.eval.store.eval_of(0), Some(rofl::store::EvalRecord { budget: 1, steps: 2, partial: true }));

    // and it is still there on the other side of a snapshot, which is the
    // whole claim: the wall travels with the world
    let back = Session::open(&s.save(), 1_000_000).expect("open");
    assert_eq!(back.eval.store.eval_of(0).map(|e| (e.budget, e.partial)), Some((1, true)));
}

/// A later evaluation of the same tick REPLACES the record: the last one is
/// the one that produced the state a replay has to reproduce.
#[test]
fn re_evaluating_a_tick_replaces_its_record() {
    let mut s = Session::fresh(100_000);
    s.load(COUNTER, None).expect("load");
    s.evaluate().expect("evaluate");
    let first = s.eval.store.eval_of(0).unwrap();
    // A fact a rule CONSUMES, not merely one the store holds: `emit(N) :-
    // counter(N)` fires on it, where a base fact nothing reads costs nothing
    // and leaves the control flat.
    s.assert("counter(9).").expect("assert");
    s.evaluate().expect("re-evaluate");
    let second = s.eval.store.eval_of(0).unwrap();
    assert_eq!(evals_of(&s).len(), 1, "one record per tick, not one per evaluation");
    assert!(second.steps > first.steps, "{first:?} -> {second:?}");
}

/// EXCISE IS COUNTERFACTUAL AND NOT A WALK OVER STORED WITNESSES, which
/// START.md forbids in as many words: `must NOT be computed from witnesses`.
///
/// `t(1)` has TWO independent supports and the store records ONE witness for
/// it — which one is not fixed by the semantics, so a test that excised only
/// `p(1)` would pass by luck half the time. Both are excised, separately, and
/// in each case `t(1)` SURVIVES: whichever support the witness happens to
/// hold, an implementation that read it would delete a fact that is still
/// derivable the other way.
///
/// The control is the third case: excising the only support of `u(1)` does
/// remove it, so the probe is not reporting "excise removes nothing".
#[test]
fn excise_recomputes_rather_than_reading_the_witness() {
    const TWO: &str = r#"
edb(p).
edb(q).
p(1).
q(1).
t(X) :- p(X).
t(X) :- q(X).
u(X) :- p(X), q(X).
"#;
    let fresh = || {
        let mut s = Session::fresh(1_000_000);
        s.load(TWO, None).expect("load");
        s.evaluate().expect("evaluate");
        s
    };
    for base in ["p(1)", "q(1)"] {
        let (removed, added) = fresh().excise(base).unwrap();
        assert!(added.is_empty(), "{base}: a counterfactual adds nothing here");
        assert!(
            !removed.contains(&"t[main](1)".to_string()),
            "{base}: t(1) is still derivable the other way, and excise removed it: {removed:?}"
        );
        assert!(
            removed.contains(&"u[main](1)".to_string()),
            "{base}: u(1) needed both and excise kept it: {removed:?}"
        );
    }
}

/// THE ANSWER DOES NOT DEPEND ON THE ORDER THE FACTS ARRIVED IN, which is
/// START.md's `regardless of insertion order`. The same program is loaded
/// twice into two fresh sessions with its FACTS reversed, and the settled
/// stores are compared key for key — not a hash of one run against itself,
/// which is what a golden can check, but two different insertion orders
/// against each other, which it cannot.
#[test]
fn the_settled_world_is_the_same_whichever_order_the_facts_arrived_in() {
    const RULES: &str = "
edb(calls).
reaches(A, B) :- calls(A, B).
reaches(A, C) :- reaches(A, B), calls(B, C).
";
    let settle = |facts: &str| {
        let mut s = Session::fresh(1_000_000);
        s.load(&format!("{RULES}{facts}"), None).expect("load");
        s.evaluate().expect("evaluate");
        s.fact_keys(None)
    };
    let forward = settle("calls(a, b).\ncalls(b, c).\ncalls(c, d).\n");
    let backward = settle("calls(c, d).\ncalls(b, c).\ncalls(a, b).\n");
    assert_eq!(forward, backward, "insertion order reached the answer");
    // control: the probe is comparing something, and a DIFFERENT world differs
    assert_ne!(forward, settle("calls(a, b).\n"), "control: fewer facts, fewer answers");
}

/// THE DISCIPLINE IS IN boot.rofl AND NOT IN THE EVALUATOR, which START.md
/// forbids hardcoding. The same program is settled twice — once with the boot
/// pack and once without — and the audit that catches it EXISTS in one case and
/// does not exist in the other. An evaluator carrying the rule in code would
/// report it either way.
///
/// THE FIRST PROBE WRITTEN HERE WAS WRONG AND THE WRONGNESS IS WORTH KEEPING.
/// It used `breach[audit]`, which reads `concludes(R, Rel), reserved(Rel)` —
/// and a rule whose head names a kernel relation never reaches an audit,
/// because the LOADER refuses it, boot or no boot. `breach` is belt and braces
/// behind a door the engine already holds shut, which is why `b_breach_empty`
/// says it is empty. So the test asserts BOTH halves: what the engine owes by
/// itself, and what it owes only because a pack was loaded.
#[test]
fn the_audits_are_a_loaded_pack_and_not_a_property_of_the_engine() {
    // ENGINE, WITH NO PACK: a rule writing a reserved relation is refused at
    // load. That is START.md section 3 and it is not delegated to data.
    let mut bare = Session::fresh(1_000_000);
    let refused = bare.load("edb(src).\nsrc(1).\nconcludes(X, mine) :- src(X).\n", None);
    assert!(
        refused.unwrap_err().iter().any(|d| d.contains("write-protected")),
        "a reserved head is refused by the engine, with no boot pack in sight"
    );

    // PACK: `undefined_premise` is boot.rofl's, and a premise nothing defines
    // is invisible until that file is loaded.
    const P: &str = "edb(src).\nsrc(1).\nlonely(X) :- src(X), nosuch(X).\n";
    let settle = |boot: bool| {
        let mut s = Session::fresh(1_000_000);
        if boot {
            s.load(include_str!("../../../boot.rofl"), None).expect("boot");
        }
        s.load(P, None).expect("load");
        s.evaluate().expect("evaluate");
        s.fact_keys(Some("undefined_premise"))
    };
    assert!(settle(false).is_empty(), "without the pack nothing accuses");
    assert!(!settle(true).is_empty(), "with the pack loaded the gap is reported");
}
