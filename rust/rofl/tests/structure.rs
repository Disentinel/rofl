//! DECLARED FUNCTIONS (docs/data-structures.md): the promise is judged after
//! every evaluation, every tick and every retraction, a declaration changes no
//! fact, and the planner answers a bound key from the promise instead of
//! counting rows.
use rofl::engine::Halt;
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

fn refusal(r: Result<rofl::session::Evaluated, Halt>) -> String {
    match r {
        Err(Halt::Strat(m, _)) => m,
        Err(e) => panic!("another halt: {}", rofl::describe(&e)),
        Ok(_) => panic!("not refused"),
    }
}

const RULES: &str = "
edb(kind). edb(name). edb(w).
kind(n1, ident). kind(n2, call). kind(n3, ident). name(n1, bar). name(n3, foo). name(n4, baz).
w(ident, w1). w(ident, w2). w(ident, w3). w(call, w4).
use(N, V, W) :- name(N, S), kind(N, V), w(V, W).
pair(N, S, V) :- kind(N, V), name(N, S).
";

/// the lines of a state that are about the declaration itself
fn without_declaration(state: &str) -> String {
    state.lines().filter(|l| !l.contains("structure_decl") && !l.contains("structure_role")).collect::<Vec<_>>().join("\n")
}

#[test]
fn a_declaration_changes_no_fact_and_the_planner_reads_its_promise() {
    let mut plain = world(RULES);
    plain.evaluate().unwrap();
    let decl = "function kind(N, to V). function name(N, to S).";
    let mut declared = world(&format!("{RULES}\n{decl}"));
    declared.evaluate().unwrap();
    let (a, b) = (plain.eval.store.canonical_state(&plain.eval.h), declared.eval.store.canonical_state(&declared.eval.h));
    assert_ne!(a, b, "the declaration is two kernel rows");
    assert_eq!(without_declaration(&a), without_declaration(&b), "a declaration changed a fact");
    assert_eq!(plain.eval.promise_stats, 0, "no promise was declared");
    assert!(declared.eval.promise_stats > 0, "the planner counted rows where the key was promised");
}

#[test]
fn a_broken_promise_is_refused_naming_the_key_and_both_values() {
    let mut s = world(&format!("{RULES}\nfunction kind(N, to V).\nkind(n1, call)."));
    let m = refusal(s.evaluate());
    assert!(m.contains("function kind: key (n1) has two values in the book main: (call) and (ident)"), "{m}");
    // the world is left dirty, never answered
    assert!(s.eval.store.dirty);
}

#[test]
fn the_promise_is_judged_at_every_tick() {
    let mut s = world("
edb(v). edb(go).
function v(K, to X).
v(k, 1).
v(K, X)@next :- v(K, X).
go(x).
v(k, 2)@next :- go(x).
");
    s.evaluate().unwrap();
    let m = match s.tick() {
        Ok(_) => refusal(s.evaluate()),
        Err(Halt::Strat(m, _)) => m,
        Err(e) => panic!("{}", rofl::describe(&e)),
    };
    assert!(m.contains("function v: key (k) has two values"), "{m}");
}

#[test]
fn a_retraction_that_breaks_the_promise_is_refused_not_answered() {
    let mut s = world("
edb(src). edb(blocked).
function p(K, to V).
src(a, 1). src(a, 2). blocked(a, 2).
p(K, V) :- src(K, V), not blocked(K, V).
");
    s.evaluate().unwrap();
    match s.retract_delta("blocked(a, 2)") {
        Err(m) => assert!(m.contains("function p: key (a) has two values"), "{m}"),
        Ok(_) => {
            let m = refusal(s.evaluate());
            assert!(m.contains("function p: key (a) has two values"), "{m}");
        }
    }
    // THE WORLD STAYS BROKEN: nothing is answered from it until it is fixed
    for _ in 0..2 {
        let m = s.why("p(a, 2)").expect_err("why answered from a broken world");
        assert!(m.contains("function p: key (a) has two values"), "{m}");
        let m = s.ask("p(a, X)").err().expect("ask answered from a broken world");
        assert!(m.contains("function p: key (a) has two values"), "{m}");
        let m = refusal(s.evaluate());
        assert!(m.contains("function p: key (a) has two values"), "{m}");
    }
}

#[test]
fn a_key_in_two_books_is_two_keys() {
    let mut s = world("
edb(bk).
function bk(K, to V).
bk[w1](k, 1). bk[w2](k, 2). bk[w1](j, 1).
");
    s.evaluate().unwrap();
}

#[test]
fn a_budget_wall_does_not_skip_the_promise() {
    let mut s = Session::fresh(60);
    s.load(&boot(), None).expect("boot");
    s.load("
edb(wf_e). edb(wf_v).
function wf_v(K, to V).
wf_v(k, 1). wf_v(k, 2).
wf_e(0, 1). wf_e(1, 2). wf_e(2, 3). wf_e(3, 4). wf_e(4, 5). wf_e(5, 6). wf_e(6, 7). wf_e(7, 8). wf_e(8, 9).
wf_r(X, Y) :- wf_e(X, Y).
wf_r(X, Z) :- wf_r(X, Y), wf_e(Y, Z).
", None).unwrap_or_else(|d| panic!("{d:?}"));
    let m = refusal(s.evaluate());
    assert!(m.contains("function wf_v: key (k) has two values"), "{m}");
    assert!(s.eval.store.dirty, "a refused world stays dirty");
    assert!(s.ask("wf_v(k, X)").is_err(), "a broken world answered");
}
