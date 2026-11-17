//! AN EDIT IN ONE REQUEST (`rofl serve`'s `edit`): a set of base facts out and a set in, by delta, held after every
//! request to the world evaluated whole from the facts that remain (the rows of every relation, every book), and its
//! watch's `changes` held to the diff of `rows` before and after. A run in which no edit was taken by delta fails.
//! Planted: `edit_last_kept` (the last fact named out stays) turns it red.
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
    fn send(&mut self, r: &Value) -> Value {
        writeln!(self.inp, "{r}").unwrap();
        let mut line = String::new();
        self.out.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }
    fn ask(&mut self, r: Value) -> Value {
        let v = self.send(&r);
        assert_eq!(v["ok"], json!(true), "{r} answered {v}");
        v
    }
    fn world(&mut self, text: &str) -> u64 {
        let id = self.ask(json!({ "op": "fresh" }))["session"].as_u64().unwrap();
        self.ask(json!({ "op": "load", "session": id, "rofl": text }));
        self.ask(json!({ "op": "evaluate", "session": id }));
        id
    }
}

impl Drop for Serve {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

type Rows = BTreeMap<(String, String), BTreeSet<String>>;
type Diff = BTreeMap<(String, String), (BTreeSet<String>, BTreeSet<String>)>;

fn read(s: &mut Serve, id: u64, rels: &[&str]) -> Rows {
    let mut out = Rows::new();
    for rel in rels {
        for f in s.ask(json!({ "op": "rows", "session": id, "rel": rel }))["facts"].as_array().unwrap() {
            out.entry((rel.to_string(), f["persp"].as_str().unwrap().to_string())).or_default().insert(f["args"].to_string());
        }
    }
    out
}

fn diff(before: &Rows, after: &Rows) -> Diff {
    let (mut out, empty) = (Diff::new(), BTreeSet::new());
    for k in before.keys().chain(after.keys()) {
        let (b, a) = (before.get(k).unwrap_or(&empty), after.get(k).unwrap_or(&empty));
        let (added, removed): (BTreeSet<String>, BTreeSet<String>) = (a.difference(b).cloned().collect(), b.difference(a).cloned().collect());
        if !added.is_empty() || !removed.is_empty() {
            out.insert(k.clone(), (added, removed));
        }
    }
    out
}

fn told(v: &Value) -> Diff {
    let mut out = Diff::new();
    for c in v["changes"].as_array().map_or(&[][..], |a| a.as_slice()) {
        let set = |k: &str| c[k].as_array().unwrap().iter().map(|x| x.to_string()).collect::<BTreeSet<_>>();
        let k = (c["rel"].as_str().unwrap().to_string(), c["book"].as_str().unwrap().to_string());
        assert!(out.insert(k, (set("added"), set("removed"))).is_none(), "a relation and book told twice: {v}");
    }
    out
}

struct Rng(u64);
impl Rng {
    fn below(&mut self, n: usize) -> usize {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 % n as u64) as usize
    }
}

/// The programs, their relations, and one random base fact of each.
struct Program {
    rules: &'static str,
    rels: &'static [&'static str],
    fact: fn(&mut Rng) -> String,
}

const N: [&str; 5] = ["a", "b", "c", "d", "e"];

const PROGRAMS: [Program; 3] = [
    Program {
        rules: "node(a). node(b). node(c). node(d). node(e).\nreach(X, Y) :- edge(X, Y).\nreach(X, Z) :- reach(X, Y), edge(Y, Z).\nreached(Y) :- reach(_, Y).\nlonely(X) :- node(X), not reached(X).\nseen[ana](X) :- reach(a, X).\nseen[bo](X) :- reach(b, X).\n",
        rels: &["edge", "reach", "reached", "lonely", "seen"],
        fact: |r| format!("edge({}, {})", N[r.below(5)], N[r.below(5)]),
    },
    Program {
        rules: "grp(a). grp(b). grp(c).\ntotal(G, S) :- grp(G), S is sum(V ; K : sale(K, G, V)).\nn(G, M) :- grp(G), M is count(J : sale(J, G, _)).\nbig(G) :- total(G, S), S > 6.\n",
        rels: &["sale", "total", "n", "big"],
        fact: |r| format!("sale(k{}, {}, {})", r.below(9), ["a", "b", "c"][r.below(3)], 1 + r.below(5)),
    },
    Program {
        rules: "r(A, B) :- e(A, B).\nr(A, C) :- r(A, B), e(B, C).\nfree(A, B) :- r(A, B), not hit(B).\nhit(X) :- mark(X).\nhit(Y) :- mark(X), e(X, Y).\n",
        rels: &["e", "mark", "r", "free", "hit"],
        fact: |r| if r.below(4) == 0 { format!("mark({})", N[r.below(5)]) } else { format!("e({}, {})", N[r.below(5)], N[r.below(5)]) },
    },
];

#[test]
fn an_edit_is_the_world_evaluated_whole_and_its_watch_the_diff() {
    let mut s = Serve::new();
    let (mut steps, mut by_delta) = (0, 0);
    for (p, prog) in PROGRAMS.iter().enumerate() {
        let mut r = Rng(0x9e3779b97f4a7c15 ^ ((p as u64 + 1) * 0x2545f4914f6cdd1d));
        let mut held: BTreeSet<String> = (0..8).map(|_| (prog.fact)(&mut r)).collect();
        let text = |held: &BTreeSet<String>| format!("{}{}", prog.rules, held.iter().map(|f| format!("{f}.\n")).collect::<String>());
        let id = s.world(&text(&held));
        let rels: Vec<Value> = prog.rels.iter().map(|r| json!({ "rel": r })).collect();
        s.ask(json!({ "op": "watch", "session": id, "rels": rels }));
        for _ in 0..25 {
            // a few of the facts held out, a few in, some of them the same
            let list: Vec<String> = held.iter().cloned().collect();
            let out: BTreeSet<String> = (0..r.below(5)).filter(|_| !list.is_empty()).map(|_| list[r.below(list.len())].clone()).collect();
            let mut add: BTreeSet<String> = (0..r.below(5)).map(|_| (prog.fact)(&mut r)).collect();
            if r.below(4) == 0 {
                add.extend(out.iter().take(1).cloned());
            }
            let req = json!({ "op": "edit", "session": id, "out": out, "rofl": add.iter().map(|f| format!("{f}.\n")).collect::<String>() });
            let before = read(&mut s, id, prog.rels);
            let v = s.ask(req.clone());
            let after = read(&mut s, id, prog.rels);
            assert_eq!(told(&v), diff(&before, &after), "{req}: told {v}");
            held.retain(|f| !out.contains(f));
            held.extend(add);
            let whole = s.world(&text(&held));
            assert_eq!(after, read(&mut s, whole, prog.rels), "{req} answered {v}: the rows differ from the world evaluated whole");
            s.ask(json!({ "op": "close", "session": whole }));
            steps += 1;
            if v["full"].is_null() {
                by_delta += 1;
            }
        }
    }
    eprintln!("{by_delta} of {steps} edits by delta");
    assert!(by_delta * 2 > steps, "{by_delta} of {steps} edits by delta");
}

#[test]
fn an_edit_naming_no_fact_is_refused_and_touches_nothing() {
    let mut s = Serve::new();
    let id = s.world("edge(a, b). edge(b, c).\nreach(X, Y) :- edge(X, Y).\n");
    let v = s.send(&json!({ "op": "edit", "session": id, "out": ["edge(a, b)", "edge(z, z)"], "rofl": "edge(c, d)." }));
    assert_ne!(v["ok"], json!(true), "{v}");
    let v = s.send(&json!({ "op": "edit", "session": id, "out": ["reach(a, b)"] }));
    assert_ne!(v["ok"], json!(true), "a derived fact named out: {v}");
    let rows = read(&mut s, id, &["edge", "reach"]);
    assert_eq!(rows.values().map(|r| r.len()).sum::<usize>(), 4, "{rows:?}");
}
