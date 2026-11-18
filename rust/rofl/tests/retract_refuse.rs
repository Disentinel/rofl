//! WHAT THE RETRACTION DELTA TAKES, AND WHAT IT REFUSES.
//!
//! A rule that negates what changed is read again whole, and the facts of its relation go with it; only a base fact in
//! the book the rule concludes into is the rule's: one of the same relation in another book (the JS model's
//! `shape_verdict[main]` beside the derived `shape_verdict[audit]`) does not stop the delta. And A REFUSAL TOUCHES
//! NOTHING: the set's pass decides it cannot hold the delta before it takes a fact out, so the store, its version and
//! a watch on it are as they were (planted: `retract_decided_late`).
use rofl::session::{Retraction, Session};

const BUDGET: i64 = 200_000_000;

fn world(src: &str) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(src, None).unwrap();
    s.evaluate().unwrap();
    s
}

const BASE: &str = "edb(k).\nedb(dom).\nk(a).\nk(b).\ndom(a).\ndom(c).\n";

/// A base fact of the negating rule's relation in another book: the delta goes on, and gives the fresh world.
#[test]
fn a_base_fact_in_another_book_does_not_stop_the_delta() {
    let rules = "v[audit](S) :- dom(S), not k(S).\nv(x).\n";
    let mut s = world(&format!("{BASE}{rules}"));
    let r = s.retract_delta("k(a)").unwrap();
    match &r {
        Retraction::Delta(d) => assert!(d.set.as_ref().is_some_and(|a| a.stacked_rules > 0 || a.negated > 0), "the negating rule did not read it again: {d:?}"),
        _ => panic!("refused: {r:?}"),
    }
    let mut fresh = world(&format!("edb(k).\nedb(dom).\nk(b).\ndom(a).\ndom(c).\n{rules}"));
    assert_eq!(s.eval.canonical_state(), fresh.eval.canonical_state());
}

/// A base fact of the negating rule's relation in the book it concludes into: the set's pass takes it, and gives the
/// fresh world.
#[test]
fn a_base_fact_in_the_same_book_is_taken_by_the_sets_pass() {
    let rules = "v(S) :- dom(S), not k(S).\nv(x).\n";
    let mut s = world(&format!("{BASE}{rules}"));
    match s.retract_delta("k(a)").unwrap() {
        Retraction::Delta(d) => assert!(d.set.is_some(), "{d:?}"),
        r => panic!("evaluated again: {r:?}"),
    }
    let mut fresh = world(&format!("edb(k).\nedb(dom).\nk(b).\ndom(a).\ndom(c).\n{rules}"));
    assert_eq!(s.eval.canonical_state(), fresh.eval.canonical_state());
}

/// A REFUSED RETRACTION TOUCHES NOTHING: a lattice that keeps the history of a superseded value which rests on the
/// fact refuses the delta, and the store, its version and a watch on the lattice are as they were before it was asked.
#[test]
fn a_refused_retraction_touches_nothing() {
    let mut s = world("edb(sat).\nlattice dec(A, C, min D).\ndec(A, C, D) :- sat(A, C, D).\ndec(A, C, D) :- dec(A, C, D1), X is D1 - 1, D is max(X, 0).\nsat(a, b, 5).\nsat(a, c, 2).\n");
    let id = s.eval.store.live_ids().into_iter().find(|&f| s.eval.store.key(&s.eval.h, f).starts_with("sat[main](a,b,5)")).unwrap();
    let before = s.eval.canonical_state();
    let (dec, sat) = (s.eval.h.intern("dec"), s.eval.h.intern("sat"));
    s.eval.store.tap = rofl::store::TapSlot(Some(Box::new(rofl::store::Tap { sel: vec![(dec, None), (sat, None)], ..Default::default() })));
    let version = s.eval.store.version;
    match s.retract_set_delta(&[id]).unwrap() {
        Err(why) => assert!(why.contains("history"), "{why}"),
        Ok(d) => panic!("taken by delta: {d:?}"),
    }
    assert!(s.eval.store.alive(id), "the refused retraction took the fact out");
    assert_eq!(s.eval.store.version, version, "the refused retraction touched the store");
    assert!(s.eval.store.tap.0.as_ref().unwrap().seen.is_empty(), "a watch was told of a refused retraction");
    assert_eq!(s.eval.canonical_state(), before, "the refused retraction touched the store");
}
