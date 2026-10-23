//! THE JOURNAL OF INPUTS REPLAYED (docs/intents.md, phase 0): a world told things over several ticks, by load,
//! assert and retraction (plain and by delta), and kept on disk and opened again halfway, rebuilt from its journal
//! to every tick it passed, equals byte for byte in `canonical_state` the state it had at the end of that tick.
//! Planted: `journal_closed_late` writes a retraction one tick late, and the replay of that tick is red.
use rofl::journal::Entry;
use rofl::session::Session;
use std::path::Path;

const BUDGET: i64 = 50_000_000;

const PROGRAM: &str = "
edb(e). edb(down). edb(sale).
r(A, B) :- e(A, B), not down(B).
r(A, C) :- r(A, B), e(B, C), not down(C).
lone(X) :- e(X, _), not r(_, X).
total(G, S) :- sale(_, G, _), S is sum(V ; K : sale(K, G, V)).
seen(A, B) @next :- r(A, B).
seen(A, B) @next :- seen(A, B).
";

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).expect("boot.rofl")
}

/// The steps of one tick, and the state at its end.
fn tick(s: &mut Session, steps: &[&str]) -> String {
    for step in steps {
        let (verb, what) = step.split_once(' ').unwrap_or((step, ""));
        match verb {
            "load" => drop(s.load(what, Some("alice")).unwrap()),
            "load_delta" => drop(s.load_delta(what, None).unwrap()),
            "assert" => drop(s.assert(what).unwrap()),
            "retract" => s.retract(what).unwrap(),
            "retract_delta" => drop(s.retract_delta(what).unwrap()),
            "evaluate" => drop(s.evaluate().unwrap()),
            _ => unreachable!("{verb}"),
        }
    }
    s.evaluate().unwrap();
    s.eval.canonical_state()
}

#[test]
fn a_past_tick_replayed_is_the_state_the_world_had() {
    let ticks: [&[&str]; 5] = [
        &["load e(a, b). e(b, c). sale(k1, g, 2). sale(k2, g, 3).", "evaluate", "retract_delta e(b, c)", "assert down(z)."],
        &["load e(a, b). e(b, c). e(c, d).", "evaluate", "load_delta down(c).", "load sale(k1, g, 5)."],
        &["assert e(a, b).", "load down(b).", "retract down(b)", "load e(x, y)."],
        &["load e(a, b). e(b, a).", "evaluate", "retract_delta e(b, a)", "load_delta e(b, a)."],
        &["load lone_rule(x). e(q, r).", "retract e(q, r)"],
    ];
    let dir = std::env::temp_dir().join(format!("rofl-journal-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let kept = dir.join("w.vol");
    let mut s = Session::fresh(BUDGET);
    s.load(&boot(), None).unwrap();
    s.load(PROGRAM, None).unwrap();
    let mut states = Vec::new();
    for (t, steps) in ticks.iter().enumerate() {
        states.push(tick(&mut s, steps));
        if t + 1 < ticks.len() {
            assert!(s.tick().unwrap().advanced, "tick {t} advances");
        }
        // halfway the world is kept and opened again: its journal goes on from the volume
        if t == 2 {
            s.keep_volume(kept.to_str().unwrap()).unwrap();
            s = Session::open_volume(kept.to_str().unwrap(), BUDGET).unwrap();
        }
    }
    for t in 0..ticks.len() as u32 {
        assert!(s.eval.store.journal.tick_at(t).is_some(), "tick_at({t}) is journaled");
        let mut r = s.replay(t).unwrap_or_else(|e| panic!("replayed to tick {t}: refused: {e}"));
        let got = r.eval.canonical_state();
        if got != states[t as usize] {
            let (a, b): (Vec<&str>, Vec<&str>) = (states[t as usize].lines().collect(), got.lines().collect());
            let lost: Vec<&&str> = a.iter().filter(|l| !b.contains(l)).take(5).collect();
            let more: Vec<&&str> = b.iter().filter(|l| !a.contains(l)).take(5).collect();
            panic!("replayed to tick {t}: not the live state; lost {lost:?}, more {more:?}");
        }
    }
    let gone = s.eval.store.journal.entries().iter().filter(|e| matches!(e, Entry::Gone(_))).count();
    assert_eq!(gone, 4, "every retraction is in the journal");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_journal_from_a_seed_is_no_replay() {
    let mut s = Session::fresh(BUDGET);
    s.eval.store.journal.seeded();
    s.load("e(a, b).", None).unwrap();
    assert!(s.replay(0).err().is_some_and(|e| e.contains("seed")));
}
