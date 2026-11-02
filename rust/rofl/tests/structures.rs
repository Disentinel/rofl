//! THE DETECTION REPORT, HELD TO A FIXTURE WITH A KNOWN ANSWER.
//!
//! `fixtures/structures_proof.facts` holds a forest with its closure, two
//! functions, two aliases, an ordered column, a sequence, two spans, an
//! equivalence with its generator, a dag with its closure and one without, and
//! near misses of each kind (a DAG, a cycle, a key with two values, a permuted
//! copy missing a row, a column with one string, a numbering with a gap, an
//! interval ending before it starts, two crossing intervals, an equivalence
//! lacking a pair or its diagonal). The report must
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
    let structures: Vec<&str> = decls.iter().copied().filter(|d| !d.starts_with("function ")).collect();
    assert_eq!(
        structures,
        [
            "tree edge(P, C) closure below.",
            "tree joined(P, C).",
            "alias held_by(A, B) is owns(B, A).",
            "alias holder(A) is owns(A, _).",
            "ordered grade(A, B, by C).",
            "ordered rank(A, by B).",
            "ordered slot(A, by B, C).",
            "ordered trip(A, B, by C).",
            "ordered trip(A, by B, C).",
            "sequence step(A, at B, to C).",
            "span range(A, from B, to C) laminar.",
            "span window(A, from B, to C).",
            "equivalence eqv(A, B) of joined(A, B).",
            "dag _(A, B) closure prec.",
            "dag dep(A, B).",
            "dag link(A, B) closure reach.",
        ]
    );
    for f in ["function grade(A, B, to C).", "function name_of(A, to B).", "function ring(A, to B).", "function ring(to A, B)."] {
        assert!(decls.contains(&f), "{f} not proposed");
    }
    for gone in ["tree link", "tree ring", "alias copy_miss", "function tag_of", "function link", "function owns", "ordered level", "sequence slot", "span trip", "span window(A, from B, to C) laminar", "equivalence buddy", "equivalence peer", "dag ring", "dag reach", "function reach", "tree prec", "function prec"] {
        assert!(!decls.iter().any(|d| d.starts_with(gone)), "{gone} proposed");
    }
    assert_eq!((r.saved_rows, r.saved_firings), (37, 72));
}

#[test]
fn lists_the_near_misses_with_their_facts() {
    let r = report("structures_proof.facts", 2);
    let has = |needle: &str| r.near.iter().any(|n| n.contains(needle));
    assert!(has("tree link(P, C). 1 child with two parents: d1 has parents b1 and c1"));
    assert!(has("tree ring(P, C). 1 cycle"));
    assert!(has("function tag_of(A, to B): 1 of 4 keys has more than one B: tag_of(k3, t2) and tag_of(k3, t3)"));
    assert!(has("alias copy_miss(A, B) is owns(B, A): copy_miss lacks 1 row of owns: owns(p4, i4)"));
    assert!(has("ordered level(A, by B): 1 of 4 rows is not an integer: level(v3, \"high\")"));
    assert!(has("sequence slot(A, at B, to C): 1 of 3 keys not numbered 0..n-1 by B: key (q1) has 0, 2"));
    assert!(has("span trip(A, from B, to C): 1 of 3 rows ends before it starts: trip(t3, 9, 3)"));
    assert!(has("span window(A, from B, to C) laminar: 1 crossing: window(w1, 0, 5) and window(w2, 3, 8)"));
    assert!(has("equivalence buddy(A, B): lacks 1 of the 8 pairs of its classes: buddy(m4, m3)"));
    assert!(has("equivalence peer(A, B): an equivalence but for its diagonal"));
    assert!(has("dag ring(A, B): 1 cycle, the first through the 3 nodes x1, x2, x3"));
    assert!(!r.near.iter().any(|n| n.contains(" reach(") || n.contains(" prec(")), "a dag's closure read by a near miss");
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
