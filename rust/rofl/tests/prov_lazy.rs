//! PROVENANCE ON DEMAND (engine/prov.rs), HELD TO THE ENGINE THAT WRITES EVERY ROW.
//!
//! A provenanced world no rule reads `derived_by` of notes each firing and writes its row when
//! something asks. What a reader can distinguish must not move: the canonical state, `why`,
//! `excise`, the frozen rows of a past tick, a world that reads `derived_by` of one relation.
//! Each test runs the same world twice, once with `eager_prov` (every row as it fires), and
//! compares; the lazy run is also required to have been lazy, or the comparison proves nothing.
use rofl::session::Session;
use std::path::Path;

fn src(name: &str) -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/checks").join(name);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn world(name: &str, eager: bool) -> Session {
    let mut s = Session::fresh(200_000_000);
    if eager {
        s.eval.eager_prov = true;
        s.eval.reprepare();
    }
    s.load(&src(name), None).unwrap();
    s
}

fn derived_by_rows(s: &mut Session) -> Vec<String> {
    let db = s.eval.v.derived_by;
    let ids = s.eval.store.rel_all(&s.eval.h, db);
    ids.into_iter().map(|i| s.eval.store.key(&s.eval.h, i)).collect()
}

#[test]
fn a_world_nothing_reads_derived_by_of_is_lazy_and_its_state_is_the_eager_one() {
    let (mut lazy, mut eager) = (world("prov-lazy.rofl", false), world("prov-lazy.rofl", true));
    lazy.evaluate().unwrap();
    eager.evaluate().unwrap();
    assert!(lazy.eval.lazy_prov && !eager.eval.lazy_prov);
    assert!(lazy.eval.unsettled_provenance() > 0, "no firing was left unwritten");
    assert!(derived_by_rows(&mut lazy).len() < derived_by_rows(&mut eager).len(), "no row was saved");
    assert_eq!(lazy.eval.canonical_state(), eager.eval.canonical_state());
    assert_eq!(lazy.eval.unsettled_provenance(), 0);
}

#[test]
fn why_and_excise_do_not_need_the_rows_and_answer_alike() {
    let (mut lazy, mut eager) = (world("prov-lazy.rofl", false), world("prov-lazy.rofl", true));
    for q in ["pl_hit(a)", "pl_reach(a, d)", "pl_dead_end(d)"] {
        assert_eq!(lazy.why(q), eager.why(q), "{q}");
        assert_eq!(lazy.why_all(q), eager.why_all(q), "{q} all");
    }
    assert!(lazy.eval.unsettled_provenance() > 0, "why settled the world");
    for f in ["pl_edge(x, d)", "pl_mark(d)", "pl_edge(a, b)"] {
        assert_eq!(lazy.excise(f), eager.excise(f), "{f}");
    }
    assert_eq!(lazy.eval.canonical_state(), eager.eval.canonical_state());
}

#[test]
fn a_query_for_derived_by_writes_the_rows_and_a_retraction_after_it_still_agrees() {
    let (mut lazy, mut eager) = (world("prov-lazy.rofl", false), world("prov-lazy.rofl", true));
    let q = "derived_by[$kernel](F, R, T)";
    assert_eq!(lazy.ask(q).unwrap().rows, eager.ask(q).unwrap().rows);
    assert_eq!(lazy.eval.unsettled_provenance(), 0);
    for f in ["pl_edge(x, d)", "pl_mark(d)"] {
        lazy.retract(f).unwrap();
        eager.retract(f).unwrap();
        lazy.evaluate().unwrap();
        eager.evaluate().unwrap();
        assert_eq!(lazy.eval.canonical_state(), eager.eval.canonical_state(), "after retracting {f}");
        assert_eq!(lazy.ask(q).unwrap().rows, eager.ask(q).unwrap().rows, "after retracting {f}");
    }
}

#[test]
fn ticks_freeze_the_rows_of_the_tick_they_end() {
    let (mut lazy, mut eager) = (world("prov-lazy.rofl", false), world("prov-lazy.rofl", true));
    for _ in 0..2 {
        lazy.tick().unwrap();
        eager.tick().unwrap();
        assert_eq!(lazy.eval.canonical_state(), eager.eval.canonical_state());
    }
    lazy.evaluate().unwrap();
    eager.evaluate().unwrap();
    for q in ["pl_seen(a)", "pl_hit(a)"] {
        assert_eq!(lazy.why(q), eager.why(q), "{q}");
    }
    assert_eq!(lazy.eval.canonical_state(), eager.eval.canonical_state());
}

#[test]
fn a_reader_of_one_relation_gets_its_rows_as_they_fire_and_the_rest_wait() {
    let (mut lazy, mut eager) = (world("prov-lazy-reader.rofl", false), world("prov-lazy-reader.rofl", true));
    lazy.evaluate().unwrap();
    eager.evaluate().unwrap();
    assert!(lazy.eval.lazy_prov, "a reader of one relation turned the world eager");
    let rows = derived_by_rows(&mut lazy);
    assert!(rows.iter().any(|r| r.contains("pr_a")), "the read relation's rows were not written");
    assert!(!rows.iter().any(|r| r.contains("pr_b")), "an unread relation's rows were written");
    for q in ["pr_fired(R)", "pr_fired_for(X, R)"] {
        assert_eq!(lazy.ask(q).unwrap().rows, eager.ask(q).unwrap().rows, "{q}");
    }
    assert_eq!(lazy.eval.canonical_state(), eager.eval.canonical_state());
}

#[test]
fn a_reader_whose_fact_is_a_variable_keeps_every_row_as_it_fires() {
    let mut s = Session::fresh(200_000_000);
    s.load("edb(q).\nq(1).\nr(X) :- q(X).\nfired(R) :- derived_by[$kernel](_, R, _).\n", None).unwrap();
    s.evaluate().unwrap();
    assert!(!s.eval.lazy_prov);
    assert_eq!(s.eval.unsettled_provenance(), 0);
}

#[test]
fn a_sealed_world_notes_nothing() {
    let mut s = Session::fresh(200_000_000);
    s.load("sealed(provenance).\nedb(q).\nq(1).\nr(X) :- q(X).\n", None).unwrap();
    s.evaluate().unwrap();
    assert!(!s.eval.lazy_prov);
    assert_eq!(s.eval.unsettled_provenance(), 0);
    assert!(derived_by_rows(&mut s).is_empty());
}
