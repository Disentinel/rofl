//! The driver for ring1's generated tokenizer tables.
//!
//! `ring1_tables.rs` is GENERATED from `examples/ring1/ring1.rofl` and holds
//! nothing but data: the relations, their productions, the valued relations and
//! the projections. This file walks those tables and is written once — the same
//! division a parser generator makes between an LR table and its driver.
//!
//! WHY TABLES RATHER THAN GENERATED CONTROL FLOW. Reading these rules produced
//! six offset-and-frame mistakes in one day, every one of which would have
//! become a wrong-but-compiling Rust function. A table can be read; a generated
//! loop has to be re-derived to be checked.
//!
//! THE EVALUATION IS ONE FIXPOINT over spans and valued relations TOGETHER, not
//! ordered phases. Phasing it by the apparent layering is what left `punct`
//! empty in the first draft: `punct(I, lpar) :- kind(I, lpar), code_at(I)`
//! needs a span, and spans read valued relations, so the graph is mutual.
use std::collections::{HashMap, HashSet};

use crate::ring1_lexer::{kind_of, states, Kind, State};

#[derive(Clone, Copy)]
pub enum Test {
    Kind(i64, &'static str),
    Char(i64, &'static str),
    State(i64, &'static str),
    Pred(i64, &'static str),
    Not(&'static Test),
}

#[derive(Clone, Copy)]
pub enum Step {
    Test(usize, Test),
    Consume(&'static str),
    Search(Test),
    Valued(&'static str),
}

#[derive(Clone, Copy)]
pub enum Prod {
    Chain { steps: &'static [Step], end_off: Option<i64> },
    While { step: &'static [Test] },
}

pub struct Rel { pub name: &'static str, pub prods: &'static [Prod] }
pub struct Valued { pub name: &'static str, pub cases: &'static [(&'static [Test], &'static str)] }

/// Characters, their classes and the automaton's state at each position.
///
/// THE NAMES ARE COMPUTED ONCE. The tables carry classes as strings — they are
/// generated from rule text — and the first driver rebuilt the name on EVERY
/// test at EVERY position with `format!("{k:?}").to_lowercase()`. That is a
/// heap allocation and a case fold inside the hot loop, and it is where the
/// constant went: the driver was linear at 13 ms per KiB, which is a thousand
/// times the host parser for the tokenizer alone.
pub struct World {
    pub ch: Vec<char>,
    pub kind: Vec<Kind>,
    pub state: Vec<State>,
    kind_name: Vec<String>,
    state_name: Vec<String>,
}

impl World {
    pub fn new(src: &str) -> World {
        let ch: Vec<char> = src.chars().collect();
        let kind: Vec<Kind> = ch.iter().map(|c| kind_of(*c)).collect();
        let state = states(src);
        let kind_name = kind.iter().map(|k| format!("{k:?}").to_lowercase()).collect();
        let state_name = state.iter().map(|s| format!("{s:?}").to_lowercase()).collect();
        World { ch, kind, state, kind_name, state_name }
    }
    pub fn len(&self) -> usize { self.ch.len() }
    pub fn is_empty(&self) -> bool { self.ch.is_empty() }
}

pub struct Spans {
    pub by_rel: HashMap<&'static str, HashSet<(usize, usize)>>,
    pub valued: HashMap<&'static str, HashMap<usize, &'static str>>,
    /// `relation -> start -> ends`, so a consume is a lookup and not a scan.
    pub starts: HashMap<&'static str, HashMap<usize, Vec<usize>>>,
}

fn holds(w: &World, sp: &Spans, t: &Test, at: usize) -> bool {
    match t {
        Test::Kind(o, k) => idx(at, *o, w.len()).is_some_and(|i| w.kind_name[i] == *k),
        Test::State(o, s) => idx(at, *o, w.len()).is_some_and(|i| w.state_name[i] == *s),
        Test::Char(o, c) => idx(at, *o, w.len())
            .is_some_and(|i| c.chars().next() == Some(w.ch[i]) && c.chars().count() == 1),
        Test::Pred(o, r) => match idx(at, *o, w.len()) {
            None => false,
            Some(i) => sp.by_rel.get(r).is_some_and(|s| s.contains(&(i, i)))
                || sp.valued.get(r).is_some_and(|m| m.contains_key(&i)),
        },
        Test::Not(x) => !holds(w, sp, x, at),
    }
}
fn idx(at: usize, off: i64, n: usize) -> Option<usize> {
    let j = at as i64 + off;
    if j < 0 || j as usize >= n { None } else { Some(j as usize) }
}

/// Every end a chain can reach from `start`.
fn run_chain(w: &World, sp: &Spans, steps: &[Step], end_off: Option<i64>, start: usize) -> Vec<usize> {
    let mut states: Vec<(usize, Vec<usize>)> = vec![(start, vec![start])];
    for st in steps {
        let mut next: Vec<(usize, Vec<usize>)> = Vec::new();
        for (cursor, frames) in &states {
            match st {
                Step::Test(f, t) => {
                    let base = frames[(*f).min(frames.len() - 1)];
                    if holds(w, sp, t, base) { next.push((*cursor, frames.clone())); }
                }
                Step::Valued(r) => {
                    let ok = match sp.valued.get(r) { Some(m) => m.contains_key(cursor), None => *cursor < w.len() };
                    if ok { next.push((*cursor, frames.clone())); }
                }
                Step::Consume(r) => {
                    // BY START, NOT BY SCAN. Filtering every span of the
                    // relation for the ones that begin at the cursor is
                    // O(spans) per position, which is the second quadratic in
                    // this driver and was invisible next to the first.
                    if let Some(idx) = sp.starts.get(r) {
                        if let Some(ends) = idx.get(cursor) {
                            for b in ends {
                                let mut f2 = frames.clone();
                                f2.push(*b);
                                next.push((*b, f2));
                            }
                        }
                    }
                }
                Step::Search(t) => {
                    for j in (cursor + 1)..w.len() {
                        if holds(w, sp, t, j) {
                            let mut f2 = frames.clone();
                            f2.push(j);
                            next.push((j, f2));
                            break;
                        }
                    }
                }
            }
        }
        states = next;
        if states.is_empty() { break; }
    }
    states.iter()
        .map(|(c, _)| match end_off { None => *c as i64, Some(o) => start as i64 + o })
        .filter(|e| *e >= 0 && (*e as usize) < w.len())
        .map(|e| e as usize)
        .collect()
}

/// Every span of every relation the tables carry.
pub fn tokenize(w: &World, rels: &'static [Rel], valued: &'static [Valued],
                projected: &'static [(&'static str, &'static str, bool)]) -> Spans {
    let mut sp = Spans { by_rel: HashMap::new(), valued: HashMap::new(), starts: HashMap::new() };
    for (p, _, _) in projected { sp.by_rel.entry(p).or_default(); sp.starts.entry(p).or_default(); }
    let n = w.len();

    for _round in 0..6 {
        let before: usize = sp.by_rel.values().map(|s| s.len()).sum::<usize>()
            + sp.valued.values().map(|m| m.len()).sum::<usize>();

        for v in valued {
            let mut m: HashMap<usize, &'static str> = HashMap::new();
            for i in 0..n {
                for (tests, val) in v.cases {
                    if tests.iter().all(|t| holds(w, &sp, t, i)) { m.insert(i, val); break; }
                }
            }
            sp.valued.insert(v.name, m);
        }

        for r in rels {
            let mut out: HashSet<(usize, usize)> = sp.by_rel.get(r.name).cloned().unwrap_or_default();

            // CHAINS CONVERGE IN ONE PASS. They read only relations already
            // built, so re-scanning positions cannot find anything new. The
            // first driver wrapped everything in `for _pass in 0..(n + 2)`,
            // which is O(n squared) per relation per round, and a timing run
            // over 581 KiB did not finish in 120 seconds.
            for i in 0..n {
                for prod in r.prods {
                    if let Prod::Chain { steps, end_off } = prod {
                        for e in run_chain(w, &sp, steps, *end_off, i) { out.insert((i, e)); }
                    }
                }
            }

            // A `while` EXTENDS MONOTONICALLY TO THE RIGHT, so one left-to-right
            // sweep suffices: a span ending at e can only grow to e + 1, and by
            // the time the sweep reaches e every span that ends there is known.
            // Re-scanning was buying nothing except the square.
            for prod in r.prods {
                if let Prod::While { step } = prod {
                    let mut by_end: Vec<Vec<usize>> = vec![Vec::new(); n + 1];
                    for (s, e) in &out { if *e < n { by_end[*e].push(*s); } }
                    for e in 0..n.saturating_sub(1) {
                        if by_end[e].is_empty() { continue; }
                        if !step.iter().all(|t| holds(w, &sp, t, e)) { continue; }
                        let starts = std::mem::take(&mut by_end[e]);
                        for s in &starts {
                            if out.insert((*s, e + 1)) { by_end[e + 1].push(*s); }
                        }
                        by_end[e] = starts;
                    }
                }
            }

            for (pname, of, end) in projected {
                if *of != r.name { continue; }
                let add: Vec<(usize, usize)> = out.iter()
                    .map(|(a, b)| { let at = if *end { *b } else { *a }; (at, at) }).collect();
                sp.by_rel.entry(pname).or_default().extend(add);
            }
            let mut idx: HashMap<usize, Vec<usize>> = HashMap::new();
            for (a, b) in &out { idx.entry(*a).or_default().push(*b); }
            sp.starts.insert(r.name, idx);
            sp.by_rel.insert(r.name, out);
        }

        let after: usize = sp.by_rel.values().map(|s| s.len()).sum::<usize>()
            + sp.valued.values().map(|m| m.len()).sum::<usize>();
        if after == before { break; }
    }
    sp
}
