//! A RULE TAKEN OUT AS A FACT IS (`rofl serve`'s `edit` with a rule in `out`, written as in the program): after every
//! request the world holds what the world evaluated whole from the program without the rule holds (the rows of every
//! relation, every book, and the `why` of each row), its watch's `changes` are the diff of `rows` before and after, and
//! a rule taken out and loaded again comes back by delta. The programs read a rule's head under a negation, conclude a
//! relation by two rules, and move the strata when a rule goes. A run in which a rule went by delta fewer than half the
//! times fails. Planted: `rule_out_firings_kept` and `rule_out_unprepared` turn it red.
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

/// The `why` of every row of `rels`: the witness a fresh evaluation keeps is the one an edit must keep.
fn whys(s: &mut Serve, id: u64, rels: &[&str]) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for rel in rels {
        for f in s.ask(json!({ "op": "rows", "session": id, "rel": rel }))["facts"].as_array().unwrap() {
            let args: Vec<String> = f["args"].as_array().unwrap().iter().map(|a| a["name"].as_str().map_or_else(|| a["v"].to_string(), str::to_string)).collect();
            let key = format!("{rel}[{}]({})", f["persp"].as_str().unwrap(), args.join(", "));
            let v = s.ask(json!({ "op": "why", "session": id, "query": key }));
            out.insert(key, v["text"].as_str().unwrap_or("").to_string());
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

/// THE WORLD OF THE STEP-0 EXPERIMENT (f_a_rule_row_taken_out_left_the_rule_running): before rule edits, `retract`
/// of `rule(R)`, and `edit` of `rule(R)`, `concludes(R, s)` and `has_premise(R, 1)`, answered ok and `full: null`,
/// and s stayed {a, b} and t {b} where the world without the rule holds s {a} and t nothing. A row of a rule taken
/// out alone is refused and touches nothing; the rule taken out by its text is the world without it.
#[test]
fn a_rule_row_out_is_refused_and_the_rule_out_is_the_world_without_it() {
    let mut s = Serve::new();
    let (with, without) = ("p(a). p(b). q(a).\ns(X) :- p(X).\ns(X) :- q(X).\nt(X) :- s(X), not q(X).\n", "p(a). p(b). q(a).\ns(X) :- q(X).\nt(X) :- s(X), not q(X).\n");
    let rels = ["p", "q", "s", "t"];
    let id = s.world(with);
    let held = read(&mut s, id, &rels);
    let r = s.ask(json!({ "op": "ask", "session": id, "query": "concludes[$kernel](R, s)" }))["rows"].as_array().unwrap().iter().map(|x| x[0].as_str().unwrap().to_string()).collect::<Vec<_>>();
    let rid = r.into_iter().find(|rid| {
        let v = s.ask(json!({ "op": "ask", "session": id, "query": format!("premise_pos[$kernel]({rid}, p)") }));
        !v["rows"].as_array().unwrap().is_empty()
    }).unwrap();
    let rows = [format!("rule[$kernel]({rid})"), format!("concludes[$kernel]({rid}, s)"), format!("has_premise[$kernel]({rid}, 1)"), format!("premise_pos[$kernel]({rid}, p)")];
    for q in &rows {
        let v = s.send(&json!({ "op": "retract", "session": id, "query": q }));
        assert_ne!(v["ok"], json!(true), "retract {q}: {v}");
        assert_eq!(read(&mut s, id, &rels), held, "retract {q} touched the world: {v}");
    }
    let v = s.send(&json!({ "op": "edit", "session": id, "out": rows }));
    assert_ne!(v["ok"], json!(true), "edit of the rows: {v}");
    assert_eq!(read(&mut s, id, &rels), held, "edit of the rows touched the world: {v}");
    let v = s.ask(json!({ "op": "edit", "session": id, "out": ["s(X) :- p(X)."] }));
    assert!(v["full"].is_null(), "{v}");
    let whole = s.world(without);
    assert_eq!(read(&mut s, id, &rels), read(&mut s, whole, &rels), "the rule out: {v}: the rows differ from the world evaluated whole");
    assert_eq!(whys(&mut s, id, &rels), whys(&mut s, whole, &rels), "the rule out: {v}: a why differs from the world evaluated whole");
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

struct Program {
    facts: &'static str,
    rules: &'static [&'static str],
    rels: &'static [&'static str],
    fact: fn(&mut Rng) -> String,
}

const N: [&str; 5] = ["a", "b", "c", "d", "e"];

const PROGRAMS: [Program; 3] = [
    // `lonely` read under a negation by `hub`; `reached` concluded by two rules; without `lonely`'s rule `hub` moves
    // down a stratum, and without both rules of `reached`, `lonely` does
    Program {
        facts: "node(a). node(b). node(c). node(d). node(e).\n",
        rules: &[
            "reach(X, Y) :- edge(X, Y).",
            "reach(X, Z) :- reach(X, Y), edge(Y, Z).",
            "reached(Y) :- reach(_, Y).",
            "reached(X) :- mark(X).",
            "lonely(X) :- node(X), not reached(X).",
            "hub(X) :- edge(X, _), not lonely(X).",
            "seen[ana](X) :- reach(a, X).",
        ],
        rels: &["edge", "mark", "reach", "reached", "lonely", "hub", "seen"],
        fact: |r| if r.below(4) == 0 { format!("mark({})", N[r.below(5)]) } else { format!("edge({}, {})", N[r.below(5)], N[r.below(5)]) },
    },
    Program {
        facts: "",
        rules: &[
            "r(A, B) :- e(A, B).",
            "r(A, B) :- f(A, B).",
            "r(A, C) :- r(A, B), e(B, C).",
            "free(A, B) :- r(A, B), not hit(B).",
            "hit(X) :- mark(X).",
            "hit(Y) :- mark(X), f(X, Y).",
            "both(A) :- free(A, _), hit(A).",
        ],
        rels: &["e", "f", "mark", "r", "free", "hit", "both"],
        fact: |r| match r.below(5) {
            0 => format!("mark({})", N[r.below(5)]),
            1 => format!("f({}, {})", N[r.below(5)], N[r.below(5)]),
            _ => format!("e({}, {})", N[r.below(5)], N[r.below(5)]),
        },
    },
    // an aggregate: its rule is refused (`full` says why) and the world evaluated whole; the rules above it go by delta
    Program {
        facts: "grp(a). grp(b). grp(c).\n",
        rules: &[
            "total(G, S) :- grp(G), S is sum(V ; K : sale(K, G, V)).",
            "big(G) :- total(G, S), S > 6.",
            "busy(G) :- sale(_, G, _).",
            "quiet(G) :- grp(G), not busy(G).",
            "flag(G) :- big(G).",
            "flag(G) :- quiet(G).",
        ],
        rels: &["sale", "total", "big", "busy", "quiet", "flag"],
        fact: |r| format!("sale(k{}, {}, {})", r.below(9), ["a", "b", "c"][r.below(3)], 1 + r.below(5)),
    },
];

#[test]
fn a_rule_out_is_the_world_evaluated_whole_without_it() {
    let mut s = Serve::new();
    let (mut outs, mut by_delta, mut back, mut back_delta) = (0, 0, 0, 0);
    for (p, prog) in PROGRAMS.iter().enumerate() {
        let mut r = Rng(0x2545f4914f6cdd1d ^ ((p as u64 + 1) * 0x9e3779b97f4a7c15));
        let mut held: BTreeSet<String> = (0..10).map(|_| (prog.fact)(&mut r)).collect();
        let mut on: Vec<bool> = vec![true; prog.rules.len()];
        let text = |held: &BTreeSet<String>, on: &[bool]| {
            let rules: String = prog.rules.iter().zip(on).filter(|(_, o)| **o).map(|(r, _)| format!("{r}\n")).collect();
            format!("{}{rules}{}", prog.facts, held.iter().map(|f| format!("{f}.\n")).collect::<String>())
        };
        let id = s.world(&text(&held, &on));
        let rels: Vec<Value> = prog.rels.iter().map(|r| json!({ "rel": r })).collect();
        s.ask(json!({ "op": "watch", "session": id, "rels": rels }));
        for _ in 0..30 {
            let i = r.below(prog.rules.len());
            let before = read(&mut s, id, prog.rels);
            let (req, v) = if on[i] {
                // the rule out, and now and then a fact out and one in with it
                let mut out = vec![prog.rules[i].to_string()];
                let list: Vec<String> = held.iter().cloned().collect();
                if r.below(3) == 0 && !list.is_empty() {
                    out.push(list[r.below(list.len())].clone());
                }
                let add = if r.below(3) == 0 { format!("{}.\n", (prog.fact)(&mut r)) } else { String::new() };
                let req = json!({ "op": "edit", "session": id, "out": out, "rofl": add });
                let v = s.ask(req.clone());
                on[i] = false;
                held.retain(|f| !out.contains(f));
                held.extend(add.lines().map(|l| l.trim_end_matches('.').to_string()).filter(|l| !l.is_empty()));
                outs += 1;
                if v["full"].is_null() {
                    by_delta += 1;
                } else {
                    eprintln!("{} out, full: {}", prog.rules[i], v["full"]);
                }
                (req, v)
            } else {
                let req = json!({ "op": "load", "session": id, "rofl": prog.rules[i] });
                let v = s.ask(req.clone());
                on[i] = true;
                back += 1;
                if v["full"].is_null() {
                    back_delta += 1;
                }
                (req, v)
            };
            let mid = read(&mut s, id, prog.rels);
            // a fact in after the change: a rule taken out fires no more
            let f = (prog.fact)(&mut r);
            s.ask(json!({ "op": "assert", "session": id, "rofl": format!("{f}.") }));
            held.insert(f);
            let after = read(&mut s, id, prog.rels);
            let whole = s.world(&text(&held, &on));
            assert_eq!(after, read(&mut s, whole, prog.rels), "{req} answered {v}: the rows differ from the world evaluated whole");
            assert_eq!(whys(&mut s, id, prog.rels), whys(&mut s, whole, prog.rels), "{req} answered {v}: a why differs from the world evaluated whole");
            s.ask(json!({ "op": "close", "session": whole }));
            assert_eq!(told(&v), diff(&before, &mid), "{req}: told {v}");
        }
    }
    eprintln!("{by_delta} of {outs} rules out by delta, {back_delta} of {back} back by delta");
    assert!(by_delta * 2 > outs, "{by_delta} of {outs} rules out by delta");
    assert!(back_delta * 2 > back, "{back_delta} of {back} rules back by delta");
}

/// Each rule of the first program out alone and back, held to the world evaluated whole without it: `lonely`'s rule
/// (read under a negation by `hub`, whose stratum drops when it goes), each of the two rules of `reached` (the rows
/// the other makes stay), and the rest. Each of those goes by delta, and comes back by delta.
#[test]
fn each_rule_out_and_back_is_the_world_evaluated_whole() {
    let mut s = Serve::new();
    let prog = &PROGRAMS[0];
    let facts = "edge(a, b). edge(b, c). edge(d, d). mark(e). mark(b).\n";
    let id = s.world(&format!("{}{}\n{facts}", prog.facts, prog.rules.join("\n")));
    let rels: Vec<Value> = prog.rels.iter().map(|r| json!({ "rel": r })).collect();
    s.ask(json!({ "op": "watch", "session": id, "rels": rels }));
    let by_delta = ["reached(Y) :- reach(_, Y).", "reached(X) :- mark(X).", "lonely(X) :- node(X), not reached(X).", "hub(X) :- edge(X, _), not lonely(X).", "seen[ana](X) :- reach(a, X)."];
    for (i, rule) in prog.rules.iter().enumerate() {
        let before = read(&mut s, id, prog.rels);
        let v = s.ask(json!({ "op": "edit", "session": id, "out": [rule] }));
        let after = read(&mut s, id, prog.rels);
        assert_eq!(told(&v), diff(&before, &after), "rule {i} out: told {v}");
        if by_delta.contains(rule) {
            assert!(v["full"].is_null(), "{rule} out: {v}");
        }
        let without: Vec<&str> = prog.rules.iter().copied().filter(|r| r != rule).collect();
        let whole = s.world(&format!("{}{}\n{facts}", prog.facts, without.join("\n")));
        assert_eq!(after, read(&mut s, whole, prog.rels), "{rule} out: the rows differ from the world evaluated whole");
        assert_eq!(whys(&mut s, id, prog.rels), whys(&mut s, whole, prog.rels), "{rule} out: a why differs from the world evaluated whole");
        s.ask(json!({ "op": "close", "session": whole }));
        let v = s.ask(json!({ "op": "load", "session": id, "rofl": rule }));
        assert!(v["full"].is_null() || !by_delta.contains(rule), "{rule} back: {v}");
        assert_eq!(told(&v), diff(&after, &before), "rule {i} back: told {v}");
        assert_eq!(read(&mut s, id, prog.rels), before, "rule {i} back");
    }
}

#[test]
fn a_rule_not_held_or_a_row_of_one_is_refused_and_touches_nothing() {
    let mut s = Serve::new();
    let id = s.world("edge(a, b). edge(b, c).\nreach(X, Y) :- edge(X, Y).\n");
    let v = s.send(&json!({ "op": "edit", "session": id, "out": ["edge(a, b)", "reach(X, Y) :- edge(Y, X)."] }));
    assert_ne!(v["ok"], json!(true), "a rule the world does not hold: {v}");
    let v = s.send(&json!({ "op": "edit", "session": id, "out": ["reach(X, Y) :- edge(X, Y).", "edge(z, z)"] }));
    assert_ne!(v["ok"], json!(true), "a fact the world does not hold beside a rule: {v}");
    let rule = s.ask(json!({ "op": "ask", "session": id, "query": "rule[$kernel](R)" }))["rows"][0][0].as_str().unwrap().to_string();
    let v = s.send(&json!({ "op": "retract", "session": id, "query": format!("rule[$kernel]({rule})") }));
    assert_ne!(v["ok"], json!(true), "a row of a rule taken out alone: {v}");
    let rows = read(&mut s, id, &["edge", "reach"]);
    assert_eq!(rows.values().map(|r| r.len()).sum::<usize>(), 4, "{rows:?}");
}
