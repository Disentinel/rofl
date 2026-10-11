//! H5 OF docs/staged-evaluation.md: A RESUMED EVALUATION IS A WHOLE ONE.
//!
//! Every world of `examples/` and `rules/` that evaluates alone is evaluated
//! whole, then again cut by a step wall every `b` steps and resumed each time
//! with `b` more (`Session::resume`), for several `b`. Each chain must reach
//! the whole world byte for byte, `canonical_state` and the staged facts, in
//! the same steps. A wall the engine cannot go on from evaluates the world
//! again, which must also be equal; those are counted, so a resume that
//! quietly stopped going on fails as much as one that went on wrongly.
mod common;
use common::{build, first_diff, state, worlds, BUDGET};
use std::time::{Duration, Instant};

#[test]
fn a_resumed_evaluation_is_a_whole_one() {
    let (mut checked, mut chains, mut went_on, mut again) = (0, 0, 0, 0);
    let mut bad = Vec::new();
    let mut slowest = (Duration::ZERO, String::new());
    for (name, files) in worlds() {
        let t = Instant::now();
        let Some(mut whole) = build(&files, BUDGET) else { continue };
        let Ok(w) = whole.evaluate() else { continue };
        if w.partial || w.steps < 10 || t.elapsed() > Duration::from_secs(2) {
            continue;
        }
        let want = state(&mut whole);
        checked += 1;
        for k in [2, 3, 7, 40] {
            let b = (w.steps / k).max(1);
            let mut s = build(&files, b).unwrap();
            let mut e = s.evaluate().unwrap();
            let (mut n, mut chain_again) = (0, false);
            while e.partial && n < 100 {
                let (r, on) = s.resume(b).unwrap_or_else(|h| panic!("{name}: {}", rofl::describe(&h)));
                if on { went_on += 1 } else { again += 1; chain_again = true }
                e = r;
                n += 1;
            }
            chains += 1;
            let got = state(&mut s);
            if e.partial || got != want {
                bad.push(format!("{name} b={b}: {}", if e.partial { "still partial".into() } else { first_diff(&want, &got) }));
            } else if !chain_again && e.steps != w.steps {
                bad.push(format!("{name} b={b}: {} steps resumed, {} whole", e.steps, w.steps));
            }
        }
        if t.elapsed() > slowest.0 {
            slowest = (t.elapsed(), name.clone());
        }
    }
    eprintln!("{checked} worlds, {chains} chains, {went_on} resumed, {again} evaluated again; slowest {} {:?}", slowest.1, slowest.0);
    assert!(bad.is_empty(), "{} chains differ:\n{}", bad.len(), bad.join("\n"));
    assert!(went_on > again, "most walls must be gone on from: {went_on} resumed, {again} evaluated again");
}
