//! A WATCHED RELATION'S CHANGES, HELD TO A DIFF (`rofl serve`'s `watch`, src/watch.rs): after each operation the
//! answer's `changes` must be exactly the rows `rows` reads after it less those it read before, and the reverse, for
//! every watched relation and book. A row taken out and derived again by another path is no change.
//! Planted: `watch_removals_dropped` (no row is told gone) and `watch_rederived_removed` (a row derived again is told
//! gone) turn these red.
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

struct Serve {
    child: Child,
    inp: ChildStdin,
    out: BufReader<ChildStdout>,
}

impl Serve {
    fn new() -> Serve {
        let mut child = Command::new(env!("CARGO_BIN_EXE_rofl")).arg("serve").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let (inp, out) = (child.stdin.take().unwrap(), BufReader::new(child.stdout.take().unwrap()));
        Serve { child, inp, out }
    }
    fn ask(&mut self, r: Value) -> Value {
        writeln!(self.inp, "{r}").unwrap();
        let mut line = String::new();
        self.out.read_line(&mut line).unwrap();
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["ok"], json!(true), "{r} answered {v}");
        v
    }
}

impl Drop for Serve {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

type Rows = BTreeMap<(String, String), BTreeSet<String>>;

/// The oracle: the rows of each watched relation by `rows`, by relation and book, each row its args as JSON.
fn read(s: &mut Serve, session: u64, rels: &[(&str, Option<&str>)]) -> Rows {
    let mut out = Rows::new();
    for (rel, book) in rels {
        let mut r = json!({ "op": "rows", "session": session, "rel": rel });
        if let Some(b) = book {
            r["persp"] = json!(b);
        }
        for f in s.ask(r)["facts"].as_array().unwrap() {
            out.entry((rel.to_string(), f["persp"].as_str().unwrap().to_string())).or_default().insert(f["args"].to_string());
        }
    }
    out
}

/// The changes a diff of two reads gives, in the form an answer's `changes` takes once sorted.
fn diff(before: &Rows, after: &Rows) -> BTreeMap<(String, String), (BTreeSet<String>, BTreeSet<String>)> {
    let mut out = BTreeMap::new();
    let empty = BTreeSet::new();
    for k in before.keys().chain(after.keys()) {
        let (b, a) = (before.get(k).unwrap_or(&empty), after.get(k).unwrap_or(&empty));
        let (added, removed): (BTreeSet<String>, BTreeSet<String>) = (a.difference(b).cloned().collect(), b.difference(a).cloned().collect());
        if !added.is_empty() || !removed.is_empty() {
            out.insert(k.clone(), (added, removed));
        }
    }
    out
}

fn told(v: &Value) -> BTreeMap<(String, String), (BTreeSet<String>, BTreeSet<String>)> {
    let mut out = BTreeMap::new();
    for c in v["changes"].as_array().map_or(&[][..], |a| a.as_slice()) {
        let set = |k: &str| c[k].as_array().unwrap().iter().map(|x| x.to_string()).collect::<BTreeSet<_>>();
        let k = (c["rel"].as_str().unwrap().to_string(), c["book"].as_str().unwrap().to_string());
        assert!(out.insert(k, (set("added"), set("removed"))).is_none(), "a relation and book told twice: {v}");
    }
    out
}

const WORLD: &str = "node(a). node(b). node(c). node(d). node(e).
edge(a, b). edge(b, c).
reach(X, Y) :- edge(X, Y).
reach(X, Z) :- reach(X, Y), edge(Y, Z).
reached(Y) :- reach(_, Y).
lonely(X) :- node(X), not reached(X).
seen[ana](X) :- reach(a, X).
seen[bo](X) :- reach(b, X).
";

const WATCHED: [(&str, Option<&str>); 4] = [("reach", None), ("lonely", None), ("seen", Some("ana")), ("edge", None)];

fn world() -> (Serve, u64) {
    let mut s = Serve::new();
    let id = s.ask(json!({ "op": "fresh" }))["session"].as_u64().unwrap();
    s.ask(json!({ "op": "load", "session": id, "rofl": WORLD }));
    s.ask(json!({ "op": "evaluate", "session": id }));
    let rels: Vec<Value> = WATCHED.iter().map(|(r, b)| json!({ "rel": r, "book": b })).collect();
    assert_eq!(s.ask(json!({ "op": "watch", "session": id, "rels": rels }))["watching"], json!(4));
    (s, id)
}

/// One operation, its `changes` held to the diff of `rows` before and after; the answer back.
fn step(s: &mut Serve, id: u64, r: Value) -> Value {
    let before = read(s, id, &WATCHED);
    let v = s.ask(r.clone());
    let after = read(s, id, &WATCHED);
    let (want, got) = (diff(&before, &after), told(&v));
    assert_eq!(got, want, "{r}: told {v}");
    v
}

fn rows_of(v: &Value, rel: &str) -> (Vec<String>, Vec<String>) {
    let c = v["changes"].as_array().and_then(|a| a.iter().find(|c| c["rel"] == rel));
    // a row written by its atoms' names, `a,d`
    let name = |x: &Value| x.as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap().to_string()).collect::<Vec<_>>().join(",");
    let list = |k: &str| c.map_or(Vec::new(), |c| c[k].as_array().unwrap().iter().map(name).collect());
    (list("added"), list("removed"))
}

#[test]
fn a_watch_is_told_what_came_and_went() {
    let (mut s, id) = world();
    let v = step(&mut s, id, json!({ "op": "assert", "session": id, "rofl": "edge(c, d)." }));
    assert_eq!(v["changes_by"], json!("delta"), "{v}");
    assert_eq!(rows_of(&v, "reach"), (vec!["a,d".into(), "b,d".into(), "c,d".into()], vec![]), "{v}");
    assert_eq!(rows_of(&v, "lonely"), (vec![], vec!["d".into()]), "{v}");
    let v = step(&mut s, id, json!({ "op": "retract", "session": id, "query": "edge(c, d)" }));
    assert_eq!(rows_of(&v, "reach"), (vec![], vec!["a,d".into(), "b,d".into(), "c,d".into()]), "{v}");
    assert_eq!(rows_of(&v, "lonely"), (vec!["d".into()], vec![]), "{v}");
    // a read changes nothing, and tells nothing
    let v = step(&mut s, id, json!({ "op": "ask", "session": id, "query": "reach(a, X)" }));
    assert!(v.get("changes").is_none(), "{v}");
}

#[test]
fn a_row_derived_again_is_no_change() {
    let (mut s, id) = world();
    let v = step(&mut s, id, json!({ "op": "assert", "session": id, "rofl": "edge(a, c)." }));
    assert_eq!(rows_of(&v, "reach").0, Vec::<String>::new(), "reach(a, c) held already: {v}");
    assert_eq!(rows_of(&v, "edge").0, vec!["a,c".to_string()], "{v}");
    // reach(a, c) rests on edge(a, c) and on a -> b -> c: taken out with the edge, derived again
    let v = step(&mut s, id, json!({ "op": "retract", "session": id, "query": "edge(a, c)" }));
    assert_eq!(rows_of(&v, "reach"), (vec![], vec![]), "a row derived again told: {v}");
    assert_eq!(rows_of(&v, "edge").1, vec!["a,c".to_string()], "{v}");
}

#[test]
fn a_whole_evaluation_is_told_too() {
    // watched before its first evaluation: the evaluation is whole, and every row it derives is told
    let mut s = Serve::new();
    let id = s.ask(json!({ "op": "fresh" }))["session"].as_u64().unwrap();
    s.ask(json!({ "op": "load", "session": id, "rofl": WORLD }));
    let rels: Vec<Value> = WATCHED.iter().map(|(r, b)| json!({ "rel": r, "book": b })).collect();
    s.ask(json!({ "op": "watch", "session": id, "rels": rels }));
    let v = step(&mut s, id, json!({ "op": "evaluate", "session": id }));
    assert_eq!(v["changes_by"], json!("whole"), "{v}");
    assert_eq!(rows_of(&v, "reach").0, vec!["a,b".to_string(), "a,c".to_string(), "b,c".to_string()], "{v}");
    let (mut s, id) = world();
    // a rule loaded: the world takes it by delta or evaluates whole; either way the change is the diff
    // a rule with a negation loaded: taken by delta, or left to the next evaluation, which evaluates whole
    let v = step(&mut s, id, json!({ "op": "load", "session": id, "rofl": "reach(X, X) :- node(X), not edge(X, _)." }));
    let v = if v["full"].is_string() {
        assert!(v.get("changes").is_none(), "{v}");
        let v = step(&mut s, id, json!({ "op": "evaluate", "session": id }));
        assert_eq!(v["changes_by"], json!("whole"), "{v}");
        v
    } else {
        assert_eq!(v["changes_by"], json!("delta"), "{v}");
        v
    };
    assert_eq!(rows_of(&v, "reach").0, vec!["c,c".to_string(), "d,d".to_string(), "e,e".to_string()], "{v}");
    let v = step(&mut s, id, json!({ "op": "evaluate", "session": id }));
    assert!(v.get("changes").is_none(), "a whole evaluation that moves nothing tells nothing: {v}");
    s.ask(json!({ "op": "unwatch", "session": id, "rels": [{ "rel": "edge" }] }));
    let v = s.ask(json!({ "op": "assert", "session": id, "rofl": "edge(d, e)." }));
    assert!(rows_of(&v, "edge").0.is_empty(), "an unwatched relation told: {v}");
    assert_eq!(s.ask(json!({ "op": "unwatch", "session": id }))["watching"], json!(0));
    let v = s.ask(json!({ "op": "assert", "session": id, "rofl": "edge(e, a)." }));
    assert!(v.get("changes").is_none(), "{v}");
}

struct Rng(u64);
impl Rng {
    fn below(&mut self, n: u64) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0 % n
    }
}

#[test]
fn random_edits_are_told_as_the_diff() {
    let (mut s, id) = world();
    let mut r = Rng(0x9e3779b97f4a7c15);
    let atoms = ["a", "b", "c", "d", "e"];
    for _ in 0..60 {
        let (x, y) = (atoms[r.below(5) as usize], atoms[r.below(5) as usize]);
        let edge = format!("edge({x}, {y})");
        let holds = !s.ask(json!({ "op": "ask", "session": id, "query": edge }))["rows"].as_array().unwrap().is_empty();
        let op = match (holds, r.below(4)) {
            (true, 0) => json!({ "op": "assert", "session": id, "rofl": format!("{edge}.") }),
            (true, _) => json!({ "op": "retract", "session": id, "query": edge }),
            (false, _) => json!({ "op": "assert", "session": id, "rofl": format!("{edge}.") }),
        };
        step(&mut s, id, op);
    }
}
