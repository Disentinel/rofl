//! THE DETECTION REPORT, HELD TO A FIXTURE WITH A KNOWN ANSWER.
//!
//! `fixtures/structures_proof.facts` holds a forest with its closure, two
//! functions, two aliases, and one near miss of each kind (a DAG, a cycle, a
//! key with two values, a permuted copy missing a row). The report must
//! propose exactly the right declarations and must list the near misses; the
//! full text is `fixtures/structures_proof.report`, rewritten by
//! `ROFL_BLESS_STRUCTURES=1 cargo test --test structures`.
//!
//! The same fixture is run by scripts/agg_breaks.ts with a fault planted in
//! each check (`structures_*`), and the report must then differ.
use rofl::session::Session;
use rofl::structures::{propose, Options};
use std::path::Path;

fn report(file: &str, min_rows: usize) -> rofl::structures::Report {
    let src = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(file)).unwrap();
    let mut s = Session::fresh(200_000_000);
    s.load(&src, None).unwrap();
    s.evaluate().unwrap_or_else(|e| panic!("{}", rofl::describe(&e)));
    s.eval.settle_provenance();
    propose(&s.eval.store, &s.eval.h, &Options { min_rows })
}

#[test]
fn proposes_exactly_the_right_declarations() {
    let r = report("structures_proof.facts", 2);
    let decls: Vec<&str> = r.proposals.iter().map(|p| p.decl.as_str()).collect();
    assert_eq!(
        decls,
        [
            "function grade(A, B, to C).",
            "function name_of(A, to B).",
            "function ring(A, to B).",
            "function ring(to A, B).",
            "tree edge(P, C) closure below.",
            "alias held_by(A, B) is owns(B, A).",
            "alias holder(A) is owns(A, _).",
        ]
    );
    for gone in ["tree link", "tree ring", "alias copy_miss", "function tag_of", "function link", "function owns"] {
        assert!(!decls.iter().any(|d| d.starts_with(gone)), "{gone} proposed");
    }
    assert_eq!((r.saved_rows, r.saved_firings), (18, 19));
}

#[test]
fn lists_the_near_misses_with_their_facts() {
    let r = report("structures_proof.facts", 2);
    let has = |needle: &str| r.near.iter().any(|n| n.contains(needle));
    assert!(has("tree link(P, C). 1 child with two parents: d1 has parents b1 and c1"));
    assert!(has("tree ring(P, C). 1 cycle"));
    assert!(has("function tag_of(A, to B): 1 of 4 keys has more than one B: tag_of(k3, t2) and tag_of(k3, t3)"));
    assert!(has("alias copy_miss(A, B) is owns(B, A): copy_miss lacks 1 row of owns: owns(p4, i4)"));
}

#[test]
fn the_text_is_the_committed_report() {
    let text = report("structures_proof.facts", 2).render(2);
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/structures_proof.report");
    if std::env::var("ROFL_BLESS_STRUCTURES").is_ok() {
        std::fs::write(&path, &text).unwrap();
    }
    assert_eq!(text, std::fs::read_to_string(&path).unwrap());
}
