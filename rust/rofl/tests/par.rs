//! THE THREADS ANSWER AS ONE THREAD DOES (engine/par.rs, w_workers_by_key).
//!
//! Every world of `examples/` and `rules/` that evaluates alone is evaluated on one thread, then again with every
//! premise the threads take split as finely as it goes: each partial solution its own run, each candidate row its
//! own piece, on four threads. The two must agree byte for byte, `canonical_state`, the staged facts and the steps,
//! and a world cut by a wall must be cut where it was. The premises the threads took are counted, so a path that
//! quietly stopped taking them fails here too.
mod common;
use common::{build, first_diff, state, worlds, BUDGET};
use rofl::engine::Split;

#[test]
fn the_threads_answer_as_one_thread_does() {
    let (mut checked, mut split) = (0, 0);
    let mut bad = Vec::new();
    for (name, files) in worlds() {
        let Some(mut one) = build(&files, BUDGET) else { continue };
        one.eval.par = Split { threads: 1, ..Split::default() };
        let a = one.evaluate().map(|e| (e.partial, e.steps)).map_err(|h| format!("{h:?}"));
        let mut many = build(&files, BUDGET).unwrap();
        many.eval.par = Split { threads: 4, sols: 1, rows: 1, piece: 1 };
        let b = many.evaluate().map(|e| (e.partial, e.steps)).map_err(|h| format!("{h:?}"));
        checked += 1;
        split += many.eval.par_levels;
        let (sa, sb) = (state(&mut one), state(&mut many));
        if a != b {
            bad.push(format!("{name}: {a:?} on one thread, {b:?} on four"));
        } else if sa != sb {
            bad.push(format!("{name}: {}", first_diff(&sa, &sb)));
        }
    }
    assert!(bad.is_empty(), "{} of {checked} worlds answer otherwise on threads:\n{}", bad.len(), bad.join("\n"));
    assert!(checked > 50 && split > 1000, "{checked} worlds, {split} premises split: the threads took too little to say anything");
}
