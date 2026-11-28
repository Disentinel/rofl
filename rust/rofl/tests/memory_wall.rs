//! THE MEMORY WALL IS MET AT THE NEXT STEP. With `MEMORY_FULL` set (the watcher's word, bin/rofl/memory.rs) a world
//! of a few steps stops at its first and answers partial, its hole `memory_exhausted`: the wall is not left to every
//! thousandth step, which a firing of gigabytes reaches after the kernel has killed the process (docs/cli.md, *A
//! world larger than memory stops there*).
use rofl::session::Session;
use std::sync::atomic::Ordering::Relaxed;

/// the wall is one flag of the process: its tests take it in turn
static WALL: std::sync::Mutex<()> = std::sync::Mutex::new(());

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
    let _wall = WALL.lock().unwrap_or_else(|e| e.into_inner());
    assert_eq!(asked(false), (3, false, false), "with room the world answers whole");
    let (_, partial, cut) = asked(true);
    assert!(partial && cut, "the memory wall waited for a later step: partial {partial}, memory_exhausted {cut}");
}

/// THE MEMORY WALL COOLS THE WORLD TO DISK: a world stopped there, written as a volume and opened again from it,
/// goes on from where it stopped to the whole answer.
#[test]
fn a_world_at_the_memory_wall_goes_on_cooled() {
    let _wall = WALL.lock().unwrap_or_else(|e| e.into_inner());
    let mut s = Session::fresh(1_000_000);
    s.load(WORLD, None).expect("the world loads");
    rofl::engine::MEMORY_FULL.store(true, Relaxed);
    assert!(s.evaluate().expect("the world is evaluated").partial);
    rofl::engine::MEMORY_FULL.store(false, Relaxed);
    let dir = std::env::temp_dir().join(format!("rofl-cool-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let times = s.cool_and_go_on(&dir).expect("the world is cooled");
    assert_eq!(times, 1, "cooled once");
    assert!(!s.eval.memory_cut(), "the world went on past the wall");
    assert_eq!(s.ask("p(a, X)").expect("the question is asked").rows.len(), 3, "the whole answer");
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "nothing left on disk");
    let _ = std::fs::remove_dir(&dir);
}
