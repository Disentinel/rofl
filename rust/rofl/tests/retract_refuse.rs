//! WHAT THE RETRACTION DELTA TAKES, AND WHAT IT REFUSES.
//!
//! A rule that negates what changed is read again whole, and the facts of its relation go with it; a base fact of
//! that relation cannot go, so such a retraction is refused. But only a base fact in the book the rule concludes
//! into is the rule's: one of the same relation in another book (the JS model's `shape_verdict[main]` beside the
//! derived `shape_verdict[audit]`) does not stop the delta. And the engine's delta takes one fact at a time: given
//! two facts of the program at once it refuses, where it once removed the second and left what rested on it.
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
        Retraction::Delta(d) => assert!(d.stacked_rules > 0, "the negating rule was not read again whole: {d:?}"),
        _ => panic!("refused: {r:?}"),
    }
    let mut fresh = world(&format!("edb(k).\nedb(dom).\nk(b).\ndom(a).\ndom(c).\n{rules}"));
    assert_eq!(s.eval.canonical_state(), fresh.eval.canonical_state());
}

/// A base fact of the negating rule's relation in the book it concludes into: refused, the world evaluated again.
#[test]
fn a_base_fact_in_the_same_book_still_refuses() {
    let rules = "v(S) :- dom(S), not k(S).\nv(x).\n";
    let mut s = world(&format!("{BASE}{rules}"));
    match s.retract_delta("k(a)").unwrap() {
        Retraction::Full(why) => assert!(why.contains("concludes a base fact"), "{why}"),
        d => panic!("a base fact of the rule's own book was taken by delta: {d:?}"),
    }
}

/// Two facts of the program given to the engine's delta at once: refused, not half done.
#[test]
fn the_engine_delta_refuses_two_facts_at_once() {
    let mut s = world(&format!("{BASE}r(X) :- k(X).\n"));
    let id = |s: &Session, key: &str| s.eval.store.live_ids().into_iter().find(|&f| s.eval.store.key(&s.eval.h, f).starts_with(key)).unwrap();
    let (a, b) = (id(&s, "k[main](a)"), id(&s, "k[main](b)"));
    match s.eval.retract_delta(&[a, b]) {
        Err(why) => assert!(why.contains("one fact at a time"), "{why}"),
        Ok(d) => panic!("two facts taken as one: {d:?}"),
    }
}
