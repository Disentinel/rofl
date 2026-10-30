//! THE LEVEL WALL, HELD TO A WHOLE EVALUATION.
//!
//! `Session::evaluate_to` stops an evaluation before the first level above its wall, `evaluate_on` goes on, and
//! `admit` takes facts of a level already run into the stopped world. Stopped at every level, the world ends as the
//! whole evaluation does; facts of a relation admitted after its level end it as if they had been loaded before.
use rofl::session::Session;
use std::path::Path;

const BUDGET: i64 = 200_000_000;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).expect("boot.rofl")
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
    fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len() as u64) as usize]
    }
}

const ATOMS: [&str; 5] = ["a", "b", "c", "d", "e"];

/// Layered relations p1..pN: pI reads positively e or any pJ with J <= I, under a negation or an aggregate only J < I.
fn program(r: &mut Rng) -> String {
    let n = 3 + r.below(4) as usize;
    let mut rules = vec!["edb(e). edb(n). edb(w).".to_string()];
    for i in 1..=n {
        let pos: Vec<String> = std::iter::once("e".to_string()).chain((1..=i).map(|j| format!("p{j}"))).collect();
        let strict: Vec<String> = std::iter::once("e".to_string()).chain((1..i).map(|j| format!("p{j}"))).collect();
        for k in 0..(1 + r.below(2)) {
            let (a, b, s) = (r.pick(&pos).clone(), r.pick(&pos).clone(), r.pick(&strict).clone());
            rules.push(match if k == 0 { r.below(10) } else { 1 + r.below(9) } {
                0 => format!("p{i}(X, Y) :- e(X, Y)."),
                1 => format!("p{i}(X, Z) :- {a}(X, Y), {b}(Y, Z)."),
                2 => format!("p{i}(X, Y) :- {a}(X, Y), not {s}(Y, X)."),
                3 => format!("p{i}(X, X) :- n(X), not {s}(X, _)."),
                4 => format!("p{i}(X, N) :- n(X), N is count(Y : {s}(X, Y))."),
                5 => format!("p{i}(X, M) :- n(X), M is min(V : {s}(X, Y), w(Y, V))."),
                6 => format!("p{i}(X, Z) :- p{i}(X, Y), e(Y, Z)."),
                7 => format!("p{i}(X, Y) :- {a}(X, Y), X != Y."),
                8 => format!("p{i}(X, X) :- n(X), at_least(2, Y : {s}(X, Y))."),
                _ => format!("p{i}(X, M) :- n(X), {a}(X, Y), M is max(V : w(Y, V))."),
            });
        }
    }
    rules.join("\n") + "\n"
}

fn facts(r: &mut Rng, k: usize) -> String {
    (0..k)
        .map(|_| match r.below(5) {
            0 | 1 => format!("e({}, {}).\n", r.pick(&ATOMS), r.pick(&ATOMS)),
            2 => format!("n({}).\n", r.pick(&ATOMS)),
            _ => format!("w({}, {}).\n", r.pick(&ATOMS), 1 + r.below(5)),
        })
        .collect()
}

/// What a fresh world shows of its facts: the derived and base rows of the program's own relations.
fn rows(s: &mut Session) -> String {
    s.eval.canonical_state().lines().filter(|l| l.starts_with('p') || l.starts_with("e(") || l.starts_with("n(") || l.starts_with("w(")).map(|l| format!("{l}\n")).collect()
}

fn world(sealed: bool, program: &str, facts: &str) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).unwrap();
    s.load(&format!("{}{program}{facts}", if sealed { "sealed(provenance).\n" } else { "" }), None).unwrap();
    s
}

/// Every level in turn, `admit` called at each wall; the levels it stopped before.
fn walk(s: &mut Session, mut admit: impl FnMut(&mut Session, Option<i64>)) -> usize {
    let mut walls = 0;
    s.evaluate_to(Some(-1)).unwrap();
    while let Some(next) = s.eval.wall.next_level() {
        admit(s, Some(next));
        walls += 1;
        s.evaluate_on(Some(next)).unwrap();
    }
    admit(s, None);
    walls
}

#[test]
fn a_world_stopped_at_every_level_ends_as_the_whole_evaluation() {
    let mut walls = 0;
    for seed in 1..=150u64 {
        let mut r = Rng(seed * 7919);
        let (p, f) = (program(&mut r), facts(&mut r, 14));
        for sealed in [true, false] {
            let mut whole = world(sealed, &p, &f);
            whole.evaluate().unwrap();
            let mut walled = world(sealed, &p, &f);
            walls += walk(&mut walled, |_, _| {});
            assert_eq!(rows(&mut walled), rows(&mut whole), "seed {seed} sealed {sealed}\n{p}{f}");
        }
    }
    assert!(walls > 300, "{walls} walls");
}

#[test]
fn facts_admitted_after_their_level_end_the_world_as_if_loaded_before() {
    let mut admitted = 0;
    for seed in 1..=150u64 {
        let mut r = Rng(seed * 104729);
        let (p, f) = (program(&mut r), facts(&mut r, 12));
        let i = 1 + r.below(3);
        let extra: String = (0..3).map(|_| format!("p{i}({}, {}).\n", r.pick(&ATOMS), r.pick(&ATOMS))).collect();
        for sealed in [true, false] {
            let mut whole = world(sealed, &p, &f);
            whole.load(&extra, None).unwrap();
            whole.evaluate().unwrap();
            let mut walled = world(sealed, &p, &f);
            let mut done = false;
            walk(&mut walled, |s, next| {
                let rel = s.eval.h.intern(&format!("p{i}"));
                let lv = s.eval.rel_level(rel);
                if !done && next.is_some_and(|n| n > lv) {
                    s.admit(&extra).unwrap();
                    done = true;
                }
            });
            if !done {
                continue;
            }
            admitted += 1;
            assert_eq!(rows(&mut walled), rows(&mut whole), "seed {seed} sealed {sealed} p{i}\n{p}{f}{extra}");
        }
    }
    assert!(admitted > 100, "{admitted} admitted");
}
