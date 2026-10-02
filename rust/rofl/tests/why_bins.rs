//! `why`, `whynot` and `excise` through the two binaries, held to `Session`.
//!
//! The text itself is pinned against the reference in `explain.rs` and, over
//! every world the tree loads, by `scripts/whycheck.ts`. What is left to show
//! here is that `rofl-serve` and `rofl-load` carry that text unchanged, and
//! that their contracts — the JSON fields, the error shape, the order of the
//! answers, the dump they replace, the exit code — are what they say.

use rofl::engine::WhynotBounds;
use rofl::session::Session;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

const W: &str = r#"
edb(calls).
edb(down).
calls(a, b).
calls(b, c).
down(c).
reaches(A, B) :- calls(A, B).
reaches(A, C) :- reaches(A, B), calls(B, C).
live(X) :- reaches(_, X), not down(X).
"#;

fn world() -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(W, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

fn serve(reqs: &[Value]) -> Vec<Value> {
    let mut c = Command::new(env!("CARGO_BIN_EXE_rofl-serve"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("rofl-serve");
    let mut i = c.stdin.take().unwrap();
    for r in reqs {
        writeln!(i, "{r}").unwrap();
    }
    drop(i);
    let out: Vec<Value> = BufReader::new(c.stdout.take().unwrap())
        .lines()
        .map(|l| serde_json::from_str(&l.unwrap()).unwrap())
        .collect();
    c.wait().unwrap();
    out
}

#[test]
fn serve_answers_in_the_sessions_own_text() {
    let mut s = world();
    let q = |op: &str, query: &str| json!({ "op": op, "session": 1, "query": query });
    let a = serve(&[
        json!({ "op": "fresh", "budget": 1_000_000 }),
        json!({ "op": "load", "session": 1, "rofl": W }),
        json!({ "op": "evaluate", "session": 1 }),
        q("why", "reaches(a, c)"),
        q("why", "reaches(c, a)"),
        q("whynot", "reaches(c, a)"),
        json!({ "op": "whynot", "session": 1, "query": "reaches(c, a)", "depth": 1 }),
        q("whynot", "reaches(a, c)"),
        q("excise", "calls(a, b)"),
        q("excise", "reaches(a, c)"),
        json!({ "op": "why", "session": 1 }),
    ]);
    assert!(a[..3].iter().all(|v| v["ok"] == json!(true)), "{a:?}");
    assert_eq!(a[3], json!({ "ok": true, "id": null, "text": s.why("reaches(a, c)").unwrap() }));
    // a fact that does not hold is the protocol's error, carrying the text
    assert_eq!(a[4], json!({ "ok": false, "id": null, "error": s.why("reaches(c, a)").unwrap_err() }));
    let (h, t) = s.whynot("reaches(c, a)", &WhynotBounds::default()).unwrap();
    assert_eq!(a[5], json!({ "ok": true, "id": null, "holds": h, "text": t }));
    let (_, t1) = s.whynot("reaches(c, a)", &WhynotBounds { max_depth: 1, max_nodes: 64 }).unwrap();
    assert_eq!(a[6]["text"], json!(t1));
    assert_ne!(t1, t, "depth reached the engine");
    assert_eq!(a[7]["holds"], json!(true));
    let (removed, added) = s.excise("calls(a, b)").unwrap();
    assert_eq!(a[8], json!({ "ok": true, "id": null, "removed": removed, "added": added }));
    assert!(!removed.is_empty());
    assert_eq!(a[9], json!({ "ok": false, "id": null, "error": "reaches[main](a,c) is not a base fact" }));
    assert_eq!(a[10], json!({ "ok": false, "id": null, "error": "why needs `query`" }));
}

fn load(args: &[&str]) -> (String, i32) {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("rofl-why-bins-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join(format!("w{n}.rofl"));
    std::fs::write(&f, W).unwrap();
    let o = Command::new(env!("CARGO_BIN_EXE_rofl-load"))
        .args(args)
        .arg(&f)
        .output()
        .expect("rofl-load");
    (String::from_utf8(o.stdout).unwrap(), o.status.code().unwrap())
}

#[test]
fn load_prints_the_answers_in_flag_order_instead_of_the_state() {
    let mut s = world();
    let (out, code) = load(&["--budget", "1000000", "--why", "reaches(a, c)", "--whynot", "live(c)", "--excise", "calls(a, b)"]);
    let (removed, added) = s.excise("calls(a, b)").unwrap();
    let ex: Vec<String> = removed.iter().map(|k| format!("- {k}")).chain(added.iter().map(|k| format!("+ {k}"))).collect();
    let want = format!(
        "{}\n\n{}\n\n{}\n\n",
        s.why("reaches(a, c)").unwrap(),
        s.whynot("live(c)", &WhynotBounds::default()).unwrap().1,
        ex.join("\n")
    );
    assert_eq!(out, want);
    assert_eq!(code, 0);
}

#[test]
fn load_keeps_the_state_without_a_question_and_with_state() {
    let s = world();
    let state = s.eval.store.canonical_state(&s.eval.h);
    assert_eq!(load(&["--budget", "1000000"]), (state.clone(), 0));
    let (out, _) = load(&["--budget", "1000000", "--state", "--why", "calls(a, b)"]);
    assert_eq!(out, format!("{state}calls[main](a,b) [axiom]\n\n"));
}

#[test]
fn load_prints_a_refusal_as_the_answer_and_exits_four() {
    let mut s = world();
    let (out, code) = load(&["--why", "reaches(c, a)", "--excise", "reaches(a, c)", "--whynot", "reaches(a, c)"]);
    assert_eq!(
        out,
        format!(
            "{}\n\nerror: reaches[main](a,c) is not a base fact\n\nreaches(a, c) holds; nothing to demonstrate\n\n",
            s.why("reaches(c, a)").unwrap_err()
        )
    );
    assert_eq!(code, 4);
    // what an excise brings into being is printed too
    assert_eq!(load(&["--excise", "down(c)"]), ("- down[main](c)\n+ live[main](c)\n\n".into(), 0));
}
