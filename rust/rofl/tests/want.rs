//! THE CHECKS OF A WANT (docs/intents.md 4.2, phase 1): `want Cap(Args) :- Body.` is evaluated into the rows
//! want_key/want_of/want_arg, and each check refuses its planted program naming the want or the rule.
//! Planted: `want_capability_unchecked`, `want_arity_off_by_one`, `want_types_unchecked`, `want_answer_concluded`,
//! `want_shows_read`, each turns its refusal (or the clean world) red.
use rofl::session::{Addition, Session};

const BOOK: &str = "
capability(note, pad, shows). arg(note, 1, who, atom).
capability(lookup, db, reads). arg(lookup, 1, key, atom). answers(lookup, found, 2).
answers(note, noted, 2).
stage_done(w1). owner(w1, ann). owner(w2, bob).
";

fn run(extra: &str) -> Result<String, String> {
    let mut s = Session::fresh(50_000_000);
    s.load(&format!("{BOOK}{extra}"), None).map_err(|e| e.join("; "))?;
    s.evaluate().map_err(|h| rofl::describe(&h))?;
    Ok(s.eval.canonical_state())
}

fn refused(extra: &str, says: &str) {
    match run(extra) {
        Ok(_) => panic!("not refused: {extra}"),
        Err(e) => assert!(e.contains(says), "refusal of {extra:?} says {e:?}, not {says:?}"),
    }
}

#[test]
fn a_want_is_its_rows() {
    let st = run("want note(P) :- stage_done(W), owner(W, P).\nwant lookup(P) :- owner(_, P), not found(_, P).").unwrap();
    for row in ["want_key[main]($want(note,ann))", "want_of[main]($want(lookup,bob),lookup)", "want_arg[main]($want(lookup,ann),1,ann)"] {
        assert!(st.contains(row), "{row} in the state");
    }
    assert!(!st.contains("$want(note,bob)"), "bob's stage is not done");
}

#[test]
fn a_want_of_no_capability_is_refused() {
    refused("want nope(P) :- owner(_, P).", "want nope(P): no capability 'nope' is declared");
}

#[test]
fn a_want_of_the_wrong_arity_is_refused() {
    refused("want note(P, Q) :- owner(P, Q).", "'note' takes 1 argument(s) by its `arg` rows, the want gives 2");
}

#[test]
fn a_constant_of_the_wrong_type_is_refused() {
    refused("want note(\"ann\") :- stage_done(_).", "argument 1 is \"ann\", and 'note' takes a atom there");
}

#[test]
fn an_answer_concluded_by_a_rule_is_refused() {
    refused("found(k, ann) :- owner(_, ann).", "it concludes found, which 'lookup' answers in");
}

#[test]
fn what_shows_answers_is_read_by_no_rule() {
    refused("seen(K) :- noted(K, _).", "it reads noted, which 'note' answers in");
}

#[test]
fn the_rows_are_written_only_by_a_want() {
    refused("want_key(x) :- stage_done(x).", "'want_key' is written only by a want head");
}

#[test]
fn the_checks_hold_on_addition() {
    let mut s = Session::fresh(50_000_000);
    s.load(BOOK, None).unwrap();
    s.evaluate().unwrap();
    match s.load_delta("want nope(P) :- owner(_, P).", None).unwrap().1 {
        Addition::Full(why) => assert!(why.contains("no capability 'nope'"), "{why}"),
        a => panic!("added by delta: {a:?}"),
    }
    assert!(s.evaluate().is_err(), "the whole evaluation refuses it too");
}

#[test]
fn a_want_row_is_no_fact_to_assert() {
    refused("want_of(x, note).", "'want_of' is written only by a want head");
}
