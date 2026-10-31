//! A SET OF BASE FACTS TAKEN OUT IN ONE PASS (`Session::retract_facts_delta`, `Eval::retract_set`), held to a fresh
//! evaluation of what remains and to the same facts taken out one at a time (`retract_facts_one_by_one`), byte for
//! byte in `canonical_state`, over random worlds of plain, recursive, negating and aggregating rules, and over the
//! JS model with a file's facts taken out. A set the pass refuses is counted with its reason, and a run in which the
//! pass refused everything fails: a path that quietly stopped taking the delta fails as one that took it wrongly.
use rofl::session::{Retraction, Session};
use std::collections::BTreeMap;
use std::path::Path;

const BUDGET: i64 = 200_000_000;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// The programs, and how to make one random base fact of each.
const PROGRAMS: [(&str, &str); 6] = [
    ("plain and recursive", "edb(e).\nr(A, B) :- e(A, B).\nr(A, C) :- r(A, B), e(B, C).\ntwo(A) :- e(A, B), e(B, _).\n"),
    ("negation", "edb(e). edb(down).\nnode(X) :- e(X, _).\nnode(Y) :- e(_, Y).\nr(A, B) :- e(A, B), not down(B).\nr(A, C) :- r(A, B), e(B, C), not down(C).\nlone(X) :- node(X), not r(_, X).\nup(X) :- node(X), not down(X).\n"),
    ("aggregates", "edb(sale). edb(grp).\ngrp(a). grp(b). grp(c).\ntotal(G, S) :- grp(G), S is sum(V ; K : sale(K, G, V)).\nn(G, N) :- grp(G), N is count(J : sale(J, G, _)).\nhi(G, M) :- grp(G), M is max(V : sale(_, G, V)).\nbig(G) :- total(G, S), S > 6.\n"),
    ("negation over derived", "edb(e). edb(mark).\nr(A, B) :- e(A, B).\nr(A, C) :- r(A, B), e(B, C).\nfree(A, B) :- r(A, B), not hit(B).\nhit(X) :- mark(X).\nhit(Y) :- mark(X), e(X, Y).\n"),
    ("books", "edb(e).\nv[audit](X) :- e(X, _), not w(X).\nw(X) :- e(_, X).\nw(z).\n"),
    ("a tree", "edb(t).\ntree t(P, C) closure w.\ntop(D) :- w(r, D).\nfar(A, D) :- w(A, D), not t(A, D).\nn(A, N) :- t(_, A), N is count(D : w(A, D)).\n"),
];

fn fact(r: &mut Rng, program: usize) -> String {
    let n = ["a", "b", "c", "d", "e"];
    let pick = |r: &mut Rng| n[r.below(n.len())];
    match program {
        2 => format!("sale(k{}, {}, {}).", r.below(9), ["a", "b", "c"][r.below(3)], 1 + r.below(5)),
        1 if r.below(4) == 0 => format!("down({}).", pick(r)),
        3 if r.below(4) == 0 => format!("mark({}).", pick(r)),
        _ => format!("e({}, {}).", pick(r), pick(r)),
    }
}

/// A random tree's edges: each of five nodes below `r` or an earlier node, or not in the tree.
fn tree_facts(r: &mut Rng) -> Vec<String> {
    let nodes = ["r", "a", "b", "c", "d", "e"];
    let mut out = Vec::new();
    for i in 1..nodes.len() {
        if r.below(5) != 0 {
            out.push(format!("t({}, {}).", nodes[r.below(i)], nodes[i]));
        }
    }
    out
}

fn world(rules: &str, facts: &[String]) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(&format!("{rules}{}\n", facts.join("\n")), None).unwrap();
    s.evaluate().unwrap();
    s
}

fn ids_of(s: &mut Session, facts: &[String]) -> Vec<rofl::store::FactId> {
    facts.iter().flat_map(|f| s.facts_of(f).unwrap().0).collect()
}

fn first_diff(a: &str, b: &str) -> String {
    let (x, y): (Vec<&str>, Vec<&str>) = (a.lines().collect(), b.lines().collect());
    let extra: Vec<&&str> = y.iter().filter(|l| !x.contains(l)).take(3).collect();
    let lack: Vec<&&str> = x.iter().filter(|l| !y.contains(l)).take(3).collect();
    format!("held but not fresh {extra:?}; fresh but not held {lack:?}")
}

#[test]
fn a_set_taken_out_in_one_pass_is_the_fresh_world() {
    let mut refused: BTreeMap<String, usize> = BTreeMap::new();
    let (mut taken, mut bad) = (0, Vec::new());
    for (p, (name, rules)) in PROGRAMS.iter().enumerate() {
        for seed in 1..=40u64 {
            let mut r = Rng(seed * 7919 + p as u64);
            let mut facts: Vec<String> = if p == 5 { tree_facts(&mut r) } else { (0..4 + r.below(10)).map(|_| fact(&mut r, p)).collect() };
            facts.sort();
            facts.dedup();
            let k = 1 + r.below(facts.len().min(4));
            let mut out: Vec<String> = Vec::new();
            for _ in 0..k {
                let i = r.below(facts.len());
                out.push(facts[i].clone());
            }
            out.sort();
            out.dedup();
            let rest: Vec<String> = facts.iter().filter(|f| !out.contains(f)).cloned().collect();
            let want = world(rules, &rest).eval.canonical_state();
            let mut s = world(rules, &facts);
            let ids = ids_of(&mut s, &out);
            match s.retract_facts_delta(&ids).unwrap() {
                Retraction::Delta(_) => {
                    taken += 1;
                    let got = s.eval.canonical_state();
                    if got != want {
                        bad.push(format!("{name} seed {seed}, out {out:?}: {}", first_diff(&want, &got)));
                    }
                }
                Retraction::Full(why) => *refused.entry(why).or_default() += 1,
            }
            let mut o = world(rules, &facts);
            let ids = ids_of(&mut o, &out);
            if let Retraction::Delta(_) = o.retract_facts_one_by_one(&ids).unwrap() {
                if o.eval.store.dirty { o.evaluate().unwrap(); }
            }
            if o.eval.store.dirty { o.evaluate().unwrap(); }
        }
    }
    eprintln!("{taken} sets taken in one pass; refused: {refused:?}");
    assert!(bad.is_empty(), "{} sets differ from the fresh world:\n{}", bad.len(), bad.join("\n"));
    assert!(taken > 150, "the pass took only {taken} sets: {refused:?}");
}

fn js_model() -> Vec<String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let list = std::fs::read_to_string(root.join("rules/js.files")).unwrap();
    list.lines().filter(|l| !l.trim().is_empty()).map(|l| std::fs::read_to_string(root.join("rules").join(l.trim())).unwrap()).collect()
}

fn js_version(m: &str, v: usize) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    std::fs::read_to_string(root.join(format!("rust/rofl/tests/fixtures/delta/{m}.{v}.rofl"))).unwrap()
}

const MODS: [&str; 6] = ["db", "users", "orders", "log", "server", "util"];

/// The JS world of the modules present at their versions (None: absent), evaluated from nothing.
fn js_fresh(model: &[String], at: &[Option<usize>]) -> Session {
    let mut s = Session::fresh(BUDGET);
    for t in model { s.load(t, None).unwrap(); }
    for (m, v) in MODS.iter().zip(at) {
        if let Some(v) = v { s.load(&js_version(m, *v), None).unwrap(); }
    }
    s.evaluate().unwrap();
    s
}

/// One step by delta: `m` goes from version `was` to `now` (None: absent). Its facts that no other file of the world
/// asserts go out as a set, the new version's come in. What the pass did (overdeleted, derived again) and the file's
/// own facts, for the measure of what an edit touches.
fn js_step(s: &mut Session, model: &[rofl::store::FactId], at: &[Option<usize>], i: usize, now: Option<usize>, one_by_one: bool) -> Result<(usize, usize), String> {
    let mut stays: std::collections::HashSet<rofl::store::FactId> = model.iter().copied().collect();
    for (j, (m, v)) in MODS.iter().zip(at).enumerate() {
        if let Some(v) = v.filter(|_| j != i) { stays.extend(s.facts_of(&js_version(m, v)).unwrap().0); }
    }
    let new_text = now.map(|v| js_version(MODS[i], v)).unwrap_or_default();
    stays.extend(s.facts_of(&new_text).unwrap().0);
    let (old, _, _) = at[i].map(|v| s.facts_of(&js_version(MODS[i], v)).unwrap()).unwrap_or_default();
    let own = old.len();
    let out: Vec<_> = old.into_iter().filter(|f| !stays.contains(f)).collect();
    let touched = if one_by_one {
        if let Retraction::Full(_) = s.retract_facts_one_by_one(&out)? { s.evaluate().map_err(|e| rofl::describe(&e))?; }
        if s.eval.store.dirty { s.evaluate().map_err(|e| rofl::describe(&e))?; }
        0
    } else {
        match s.retract_set_delta(&out)? {
            Ok(d) => d.overdeleted + d.rederived,
            Err(why) => return Err(format!("refused: {why}")),
        }
    };
    if !new_text.is_empty() {
        s.load_delta(&new_text, None).map_err(|d| d.join("; "))?;
        if s.eval.store.dirty { s.evaluate().map_err(|e| rofl::describe(&e))?; }
    }
    Ok((touched, own.max(new_text.lines().count())))
}

/// RANDOM EDITS, REMOVALS AND ADDITIONS OF JS FILES, each taken by delta, held at every step to a fresh evaluation and
/// every tenth step to the same step taken one fact at a time: 5 seeded sequences of 40 steps over the fixture's six
/// modules in three versions, run at once.
fn random_js_steps(seeds: &[u64]) {
    let steps = if cfg!(debug_assertions) { 3 } else { 40 };
    let model = js_model();
    let results: Vec<Result<(usize, Vec<(usize, usize)>), String>> = std::thread::scope(|sc| {
        let hs: Vec<_> = seeds.iter().copied().map(|seed| {
            let model = &model;
            sc.spawn(move || -> Result<(usize, Vec<(usize, usize)>), String> {
                let mut r = Rng(seed * 104_729);
                let mut at: Vec<Option<usize>> = vec![Some(0); MODS.len()];
                let mut s = js_fresh(model, &at);
                // the model's own facts, which no step takes out
                let held: Vec<rofl::store::FactId> = model.iter().flat_map(|t| s.facts_of(t).unwrap().0).collect();
                let mut ratios = Vec::new();
                for step in 0..steps {
                    let i = r.below(MODS.len());
                    let now = match (at[i], r.below(5)) {
                        (Some(_), 0) => None,
                        (Some(v), _) => Some((v + 1 + r.below(2)) % 3),
                        (None, _) => Some(r.below(3)),
                    };
                    let (touched, own) = js_step(&mut s, &held, &at, i, now, false).map_err(|e| format!("seed {seed} step {step}: {e}"))?;
                    // the pass touches the file's layer and what reads it, never the world
                    if touched > 30 * own + 100 {
                        return Err(format!("seed {seed} step {step}: the pass touched {touched} facts for a file of {own}"));
                    }
                    // every tenth step, the same step taken one fact at a time from the world before it
                    let check_ref = step % 10 == 9;
                    let mut o = None;
                    if check_ref {
                        let mut w = js_fresh(model, &at);
                        let held: Vec<rofl::store::FactId> = model.iter().flat_map(|t| w.facts_of(t).unwrap().0).collect();
                        js_step(&mut w, &held, &at, i, now, true).map_err(|e| format!("seed {seed} step {step}, one by one: {e}"))?;
                        o = Some(w);
                    }
                    at[i] = now;
                    ratios.push((touched, own));
                    let want = js_fresh(model, &at).eval.canonical_state();
                    let got = s.eval.canonical_state();
                    if got != want {
                        return Err(format!("seed {seed} step {step} ({} -> {now:?}): {}", MODS[i], first_diff(&want, &got)));
                    }
                    if let Some(mut o) = o {
                        let one = o.eval.canonical_state();
                        if one != want {
                            return Err(format!("seed {seed} step {step}, one at a time: {}", first_diff(&want, &one)));
                        }
                    }
                }
                Ok((steps, ratios))
            })
        }).collect();
        hs.into_iter().map(|h| h.join().unwrap()).collect()
    });
    let mut all: Vec<(usize, usize)> = Vec::new();
    for r in &results {
        match r {
            Ok((_, rs)) => all.extend(rs),
            Err(e) => panic!("{e}"),
        }
    }
    let (t, o): (usize, usize) = all.iter().fold((0, 0), |a, x| (a.0 + x.0, a.1 + x.1));
    let worst = all.iter().map(|(t, o)| *t as f64 / (*o).max(1) as f64).fold(0.0, f64::max);
    eprintln!("{} steps by delta, each the fresh world; facts the pass touched {t} against the edited files' own {o} (ratio {:.2}, worst step {:.2})", all.len(), t as f64 / o.max(1) as f64, worst);
}

// one sequence a test, each under two minutes alone (`--test-threads 1`); the five together are the 200 steps
#[test]
fn random_js_steps_1() { random_js_steps(&[1]) }
#[test]
fn random_js_steps_2() { random_js_steps(&[2]) }
#[test]
fn random_js_steps_3() { random_js_steps(&[3]) }
#[test]
fn random_js_steps_4() { random_js_steps(&[4]) }
#[test]
fn random_js_steps_5() { random_js_steps(&[5]) }

/// A TREE EDITED IN SEQUENCE: edges taken out (the trees they are in built again), edges added by delta, and those taken
/// out again, each step the fresh world. A rule that reads only the closure rests on no fact of the edges, so what goes
/// with a row is found through the index of what cites the rows alone, which every firing an addition makes must keep.
#[test]
fn a_tree_edited_in_sequence_is_the_fresh_world() {
    let rules = PROGRAMS[5].1;
    let steps: [(&[&str], &[&str]); 4] = [
        (&["t(r, a).", "t(a, b).", "t(b, c).", "t(r, d).", "t(d, e)."], &[]),
        (&["t(r, a).", "t(r, d).", "t(d, e)."], &["t(a, b).", "t(b, c)."]),
        (&["t(r, a).", "t(a, b).", "t(b, c).", "t(r, d).", "t(d, e)."], &[]),
        (&["t(r, a).", "t(r, d)."], &["t(a, b).", "t(b, c).", "t(d, e)."]),
    ];
    let mut s = world(rules, &steps[0].0.iter().map(|x| x.to_string()).collect::<Vec<_>>());
    let mut held: Vec<&str> = steps[0].0.to_vec();
    for (i, (now, _)) in steps.iter().enumerate().skip(1) {
        let gone: Vec<String> = held.iter().filter(|f| !now.contains(f)).map(|x| x.to_string()).collect();
        let came: Vec<&str> = now.iter().filter(|f| !held.contains(f)).copied().collect();
        let ids = ids_of(&mut s, &gone);
        match s.retract_set_delta(&ids).unwrap() {
            Ok(_) => {}
            Err(why) => panic!("step {i}: refused: {why}"),
        }
        if !came.is_empty() {
            s.load_delta(&came.join("\n"), None).unwrap();
            assert!(!s.eval.store.dirty, "step {i}: the edges added were not taken by delta");
        }
        held = now.to_vec();
        let want = world(rules, &held.iter().map(|x| x.to_string()).collect::<Vec<_>>()).eval.canonical_state();
        let got = s.eval.canonical_state();
        assert!(got == want, "step {i}: {}", first_diff(&want, &got));
        // the index of what cites a row of the tree, kept by every firing, holds what one built now would
        let kept = s.eval.store.vciters.take().expect("the index of the tree's rows is kept");
        s.eval.index_for_retraction();
        let now = s.eval.store.vciters.clone().unwrap();
        for r in now.rows.chunks_exact(4) {
            let (d, c) = (r[0] as u64 | (r[1] as u64) << 32, (r[2], r[3]));
            assert!(kept.of(d).contains(&c), "step {i}: the kept index lacks {c:?}");
        }
    }
}

/// A JS file's facts taken out of the JS model: the world a fresh evaluation without the file gives.
#[test]
fn a_js_files_facts_taken_out_are_the_fresh_world() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let list = std::fs::read_to_string(root.join("rules/js.files")).unwrap();
    let model: Vec<String> = list.lines().filter(|l| !l.trim().is_empty()).map(|l| std::fs::read_to_string(root.join("rules").join(l.trim())).unwrap()).collect();
    let mods = ["db", "users", "orders", "log", "server", "util"];
    let text = |m: &str| std::fs::read_to_string(root.join(format!("rust/rofl/tests/fixtures/delta/{m}.0.rofl"))).unwrap();
    let build = |ms: &[&str]| {
        let mut s = Session::fresh(BUDGET);
        for t in &model { s.load(t, None).unwrap(); }
        for m in ms { s.load(&text(m), None).unwrap(); }
        s.evaluate().unwrap();
        s
    };
    for gone in ["util", "db"] {
        let rest: Vec<&str> = mods.iter().copied().filter(|m| *m != gone).collect();
        let want = build(&rest).eval.canonical_state();
        let mut s = build(&mods);
        let (mine, _, _) = s.facts_of(&text(gone)).unwrap();
        let mut stays = std::collections::HashSet::new();
        for m in &rest { stays.extend(s.facts_of(&text(m)).unwrap().0); }
        for t in &model { stays.extend(s.facts_of(t).unwrap().0); }
        let out: Vec<_> = mine.into_iter().filter(|f| !stays.contains(f)).collect();
        match s.retract_facts_delta(&out).unwrap() {
            Retraction::Delta(_) => {
                let got = s.eval.canonical_state();
                assert!(got == want, "{gone}.js taken out: {}", first_diff(&want, &got));
            }
            Retraction::Full(why) => panic!("{gone}.js taken out was refused: {why}"),
        }
    }
}
