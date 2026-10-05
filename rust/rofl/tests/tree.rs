//! DECLARED TREES AND THEIR CLOSURE (docs/data-structures.md, "Tree, as built"):
//! under a sealed provenance the Rust engine answers `closure` from the tree
//! and stores none of its rows; every reader of it must conclude what the
//! closure written as rules concludes, on forests of every shape, in every
//! pattern a reader of the model asks (both ends bound, the descendant bound,
//! the ancestor bound, neither; a negation; a count; a recursion through it),
//! and after a retraction.
use rofl::session::Session;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn boot() -> String {
    let repo: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    std::fs::read_to_string(repo.join("boot.rofl")).expect("boot.rofl")
}

fn world(src: &str) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    s
}

/// the readers, in every pattern the model asks of the ancestor relation
const READERS: &str = "
t_bb(A, D)     :- t_cand(A, D), t_within[code](A, D).
t_bf(A, D)     :- t_pick(A), t_within[code](A, D).
t_fb(D, A)     :- t_pick(D), t_within[code](A, D).
t_ff(A, D)     :- t_within[code](A, D).
t_ffb(B, A, D) :- t_within[B](A, D).
t_neg(A, D)    :- t_cand(A, D), not t_within[code](A, D).
t_cnt(A, N)    :- t_pick(A), N is count(D : t_within[code](A, D)).
t_up(D, A)     :- t_pick(D), t_within[code](A, D), t_pick(B), t_within[code](A, B).
t_both(A, D)   :- t_within[code](A, D), t_in[code](A, X), t_within[code](X, D).
t_feed(A)      :- t_bf(A, _).
t_feed2(D)     :- t_feed(A), t_within[code](A, D).
t_rec(X, Y)    :- t_cand(X, Y).
t_rec(X, Z)    :- t_rec(X, Y), t_within[code](Y, Z).
";

/// the closure as the author would have written it, for a world that declares nothing
const RULES: &str = "
t_within[B](P, C) :- t_in[B](P, C).
t_within[B](P, D) :- t_within[B](P, X), t_in[B](X, D).
";

struct Rng(u64);
impl Rng {
    fn next(&mut self, n: u64) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) % n.max(1)
    }
}

/// a random forest in two books, some edges derived (`t_link`), the readers' inputs, as program text
fn forest(seed: u64, n: u64) -> (String, Vec<String>) {
    let mut r = Rng(seed);
    let mut edges: Vec<String> = Vec::new();
    for book in ["code", "other"] {
        let m = if book == "code" { n } else { n / 3 + 1 };
        for i in 1..m {
            if r.next(9) == 0 {
                continue;
            }
            let p = r.next(i);
            edges.push(format!("t_in[{book}](n{p}, n{i})."));
        }
    }
    let mut links: Vec<String> = Vec::new();
    for i in n..n + n / 4 {
        let p = r.next(n);
        links.push(format!("t_link(n{p}, n{i})."));
    }
    let mut text = String::new();
    text.push_str("edb(t_link). edb(t_cand). edb(t_pick).\n");
    for l in &links {
        text.push_str(l);
        text.push('\n');
    }
    text.push_str("t_lv(P, C) :- t_link(P, C).\nt_in[code](P, C) :- t_lv(P, C).\n");
    for i in 0..n / 2 {
        let (a, b) = (r.next(n + n / 4), r.next(n + n / 4));
        text.push_str(&format!("t_cand(n{a}, n{b}).\n"));
        if i % 2 == 0 {
            text.push_str(&format!("t_pick(n{a}).\n"));
        }
    }
    (text, edges)
}

fn program(declared: bool, sealed: bool, text: &str, edges: &[String]) -> String {
    let mut p = String::new();
    if sealed {
        p.push_str("sealed(provenance).\n");
    }
    p.push_str(if declared { "tree t_in(P, C) closure t_within.\n" } else { RULES });
    p.push_str(text);
    p.push_str(&edges.join("\n"));
    p.push('\n');
    p.push_str(READERS);
    p
}

/// the rows of the user's relations, which is what a declaration promises to leave as it found them
fn rows(s: &Session) -> String {
    let st = s.eval.store.canonical_state(&s.eval.h);
    let mut v: Vec<&str> = st.lines().filter(|l| l.starts_with("t_")).map(|l| l.split(" support=").next().unwrap()).collect();
    v.sort();
    v.join("\n")
}

fn evaluated(src: &str) -> Session {
    let mut s = world(src);
    s.evaluate().unwrap();
    s
}

#[test]
fn a_closure_answered_from_its_tree_concludes_what_its_rules_conclude() {
    for seed in 0..40u64 {
        let n = 8 + (seed * 7) % 90;
        let (text, edges) = forest(seed * 7919 + 1, n);
        let rules = evaluated(&program(false, true, &text, &edges));
        let tree = evaluated(&program(true, true, &text, &edges));
        assert!(tree.eval.vclosure_info().iter().all(|(_, on)| *on), "seed {seed}: the closure was not answered from its tree: {:?}", tree.eval.vclosure_reason);
        assert!(tree.eval.store.virtual_rows() > 0, "seed {seed}: a closure with no rows proves nothing");
        assert_eq!(rows(&rules), rows(&tree), "seed {seed}, {n} nodes: a reader of the closure concluded another set");
    }
}

#[test]
fn a_closure_that_keeps_witnesses_is_stored_and_agrees() {
    for seed in 0..10u64 {
        let (text, edges) = forest(seed * 104729 + 3, 20 + seed * 5);
        let rules = evaluated(&program(false, false, &text, &edges));
        let tree = evaluated(&program(true, false, &text, &edges));
        assert!(tree.eval.vclosure_info().iter().all(|(_, on)| !*on), "a witness is kept: the closure is rows");
        assert_eq!(tree.eval.store.virtual_rows(), 0);
        assert_eq!(rows(&rules), rows(&tree), "seed {seed}: the stored closure differs from the rules'");
    }
}

#[test]
fn a_retraction_leaves_the_world_a_fresh_evaluation_holds() {
    for seed in 0..12u64 {
        let (text, edges) = forest(seed * 31 + 5, 30);
        if edges.len() < 4 {
            continue;
        }
        let gone = edges[(seed as usize * 5) % edges.len()].clone();
        let mut s = world(&program(true, true, &text, &edges));
        s.evaluate().unwrap();
        s.retract_delta(gone.trim_end_matches('.')).unwrap();
        if s.eval.store.dirty {
            s.evaluate().unwrap();
        }
        let rest: Vec<String> = edges.iter().filter(|e| **e != gone).cloned().collect();
        let fresh = evaluated(&program(true, true, &text, &rest));
        assert_eq!(rows(&s), rows(&fresh), "seed {seed}: retracting {gone} left another world than a fresh one");
    }
}

#[test]
fn every_pattern_a_question_can_ask_is_answered_from_the_tree() {
    let (text, edges) = forest(77, 40);
    let rules = evaluated(&program(false, true, &text, &edges));
    let mut tree = evaluated(&program(true, true, &text, &edges));
    let mut rules = rules;
    for q in [
        "t_within[code](n3, n9)",
        "t_within[code](n3, X)",
        "t_within[code](X, n9)",
        "t_within[code](X, Y)",
        "t_within[other](n0, Y)",
        "t_within[code](X, X)",
        "t_within[code](n0, n0)",
        "t_within[code](nowhere, Y)",
    ] {
        let (a, b) = (rules.ask(q).unwrap(), tree.ask(q).unwrap());
        let (mut ra, mut rb) = (a.rows.clone(), b.rows.clone());
        ra.sort();
        rb.sort();
        assert_eq!(ra, rb, "{q}: the tree answered other rows than the rules' closure");
    }
}

#[test]
fn an_edge_relation_the_closure_is_concluded_from_keeps_its_rows() {
    // the edges depend on the closure (a node is a child of what it is within): there is no tree to answer from first
    let src = "sealed(provenance).
tree t_in(P, C) closure t_within.
t_in(a, b). t_in(b, c).
t_back(A) :- t_within(A, c).
t_in(r, top) :- t_back(_), t_root(r).
t_root(r).";
    let s = evaluated(src);
    assert!(s.eval.vclosure_info().iter().all(|(_, on)| !*on));
    assert!(!s.eval.vclosure_reason.is_empty());
}

#[test]
fn a_retraction_where_no_witness_is_kept_evaluates_again() {
    // `sealed(provenance)` writes a hole that sends every retraction to a full evaluation; a world given the flags directly (`no_provenance` and `no_witness` set by hand) does not, and its closure rows have no witness to say what a retraction took with it
    let (text, edges) = forest(9, 30);
    let gone = edges[3].clone();
    let build = |edges: &[String]| {
        let mut s = world(&program(true, false, &text, edges));
        s.eval.no_provenance = true;
        s.eval.no_witness = true;
        s.evaluate().unwrap();
        s
    };
    let mut s = build(&edges);
    assert!(s.eval.vclosure_info().iter().all(|(_, on)| *on), "{:?}", s.eval.vclosure_reason);
    let r = s.retract_delta(gone.trim_end_matches('.')).unwrap();
    assert!(matches!(r, rofl::session::Retraction::Full(_)), "a delta was worked out for a closure answered from its tree");
    if s.eval.store.dirty {
        s.evaluate().unwrap();
    }
    let rest: Vec<String> = edges.iter().filter(|e| **e != gone).cloned().collect();
    assert_eq!(rows(&s), rows(&build(&rest)));
}

#[test]
fn a_snapshot_opened_and_not_evaluated_answers_the_closure_from_its_tree() {
    // the closure's rows were never stored: a snapshot that did not carry the closure answered `ask` with nothing
    for seed in 0..6u64 {
        let (text, edges) = forest(seed, 24);
        let mut s = evaluated(&program(true, true, &text, &edges));
        assert!(s.eval.vclosure_info().iter().all(|(_, on)| *on), "{:?}", s.eval.vclosure_reason);
        let mut open = Session::open(&s.save(), BUDGET).unwrap();
        for q in ["t_within[code](A, D)", "t_within[other](A, D)", "t_cnt(A, N)", "t_ff(A, D)"] {
            let (mut a, mut b) = (s.ask(q).unwrap().rows, open.ask(q).unwrap().rows);
            a.sort();
            b.sort();
            assert_eq!(a, b, "seed {seed}: {q}");
        }
        assert!(!open.ask("t_within[code](A, D)").unwrap().rows.is_empty());
        assert_eq!(open.eval.store.canonical_state(&open.eval.h), s.eval.store.canonical_state(&s.eval.h), "seed {seed}");
    }
}
