//! THE MEMORY WALL IS MET AT THE NEXT STEP. With `MEMORY_FULL` set (the watcher's word, bin/rofl/memory.rs) a world
//! of a few steps stops at its first and answers partial, its hole `memory_exhausted`: the wall is not left to every
//! thousandth step, which a firing of gigabytes reaches after the kernel has killed the process (docs/cli.md, *A
//! world larger than memory stops there*).
use rofl::session::Session;
use std::sync::atomic::Ordering::Relaxed;

const WORLD: &str = "e(a, b). e(b, c). e(c, d).\np(X, Y) :- e(X, Y).\np(X, Z) :- p(X, Y), e(Y, Z).\n";

fn asked(full: bool) -> (usize, bool, bool) {
    let mut s = Session::fresh(1_000_000);
    s.load(WORLD, None).expect("the world loads");
    rofl::engine::MEMORY_FULL.store(full, Relaxed);
    let partial = s.evaluate().expect("the world is evaluated").partial;
    rofl::engine::MEMORY_FULL.store(false, Relaxed);
    let rows = s.ask("p(a, X)").expect("the question is asked").rows.len();
    (rows, partial, s.eval.memory_cut())
}

#[test]
fn a_full_memory_stops_the_next_step() {
    assert_eq!(asked(false), (3, false, false), "with room the world answers whole");
    let (_, partial, cut) = asked(true);
    assert!(partial && cut, "the memory wall waited for a later step: partial {partial}, memory_exhausted {cut}");
}
