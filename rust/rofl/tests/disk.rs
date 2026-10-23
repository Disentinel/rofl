//! THE DISK WALL (w_disk_wall): a world whose volume would grow past the bytes it is given stops there, as at a
//! step wall, with `hole($adhoc, disk_exhausted)`; kept, opened and given more bytes it goes on from the cut, and
//! reaches byte for byte the world a run given those bytes from the start reaches.
mod common;
use common::{build, first_diff, state, worlds, BUDGET};
use rofl::session::Session;
use std::time::{Duration, Instant};

/// The measure the wall reads is never below the volume a question verb writes of the world.
#[test]
fn the_measure_bounds_the_volume() {
    let dir = std::env::temp_dir().join(format!("rofl-disk-m-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let (mut lo, mut hi, mut n, mut cuts, mut worst) = (f64::MAX, 0f64, 0, 0, 0f64);
    let mut bad = Vec::new();
    for (name, files) in worlds() {
        let t = Instant::now();
        let Some(mut s) = build(&files, BUDGET) else { continue };
        if s.evaluate().is_err() || t.elapsed() > Duration::from_secs(2) {
            continue;
        }
        s.eval.index_for_retraction();
        let m = s.eval.disk_bytes();
        let p = dir.join("w.vol");
        let v = s.keep_volume(p.to_str().unwrap()).unwrap() as i64;
        let r = v as f64 / m as f64;
        (lo, hi, n) = (lo.min(r), hi.max(r), n + 1);
        if v > m {
            bad.push(format!("{name}: volume {v} bytes, measured {m}"));
        }
        // and a world cut by the wall, with what the cut keeps of the evaluation in flight, passes it by less than an
        // eighth, the room a question verb leaves it (`rofl::engine::CUT_ROOM`)
        for k in [2, 3, 5] {
            let mut c = build(&files, BUDGET).unwrap();
            let base = c.eval.disk_bytes();
            c.eval.disk = base + (m - base) / k;
            if !c.evaluate().unwrap().partial {
                continue;
            }
            c.eval.index_for_retraction();
            let v = c.keep_volume(p.to_str().unwrap()).unwrap() as i64;
            cuts += 1;
            worst = worst.max(v as f64 / c.eval.disk as f64);
            if v > c.eval.disk + c.eval.disk / rofl::engine::CUT_ROOM {
                bad.push(format!("{name}: cut at {} bytes, its volume {v}", c.eval.disk));
            }
        }
    }
    std::fs::remove_dir_all(&dir).unwrap();
    eprintln!("{n} worlds: volume / measure from {lo:.2} to {hi:.2}; {cuts} worlds cut, their volume at most {worst:.2} of the wall");
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

/// Cut at a third of what the world grows by, kept, opened and given more bytes: with no wall it reaches byte for
/// byte the world a run with no wall reaches, gone on from the cut rather than evaluated again; given two thirds it
/// stops at the wall again, and given no wall after that it reaches the same world. A cut world cut again is not the
/// world a run given the second cap from the start stops in: the step wall's cuts are not either
/// (f_a_cut_gone_on_from_and_cut_again_is_not_a_fresh_cut).
#[test]
fn a_cap_raised_goes_on_from_the_cut() {
    let dir = std::env::temp_dir().join(format!("rofl-disk-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let (mut checked, mut went_on, mut again) = (0, 0, 0);
    let mut bad = Vec::new();
    for (name, files) in worlds() {
        let t = Instant::now();
        let Some(mut whole) = build(&files, BUDGET) else { continue };
        let base = whole.eval.disk_bytes();
        let Ok(w) = whole.evaluate() else { continue };
        let grown = whole.eval.disk_bytes() - base;
        if w.partial || w.steps < 2000 || grown < 4096 || t.elapsed() > Duration::from_secs(2) {
            continue;
        }
        let want = state(&mut whole);
        for caps in [&[base + grown / 3, i64::MAX][..], &[base + grown / 3, base + 2 * grown / 3, i64::MAX]] {
            let mut s = build(&files, BUDGET).unwrap();
            s.eval.disk = caps[0];
            if !s.evaluate().unwrap().partial {
                continue;
            }
            checked += 1;
            let path = dir.join(format!("{}.vol", name.replace('/', "_")));
            let path = path.to_str().unwrap();
            for &cap in &caps[1..] {
                if !s.eval.disk_cut() {
                    bad.push(format!("{name}: cut below {cap} bytes without the disk hole"));
                    break;
                }
                s.keep_volume(path).unwrap();
                s = Session::open_volume(path, BUDGET).unwrap_or_else(|e| panic!("{name}: {e}"));
                std::fs::remove_file(path).unwrap();
                s.eval.disk = cap;
                let more = BUDGET - s.eval.steps;
                let (_, on) = s.resume(more).unwrap_or_else(|h| panic!("{name}: {}", rofl::describe(&h)));
                if on { went_on += 1 } else { again += 1 }
            }
            let got = state(&mut s);
            if got != want {
                bad.push(format!("{name} {caps:?}: {}", first_diff(&want, &got)));
            }
        }
    }
    std::fs::remove_dir_all(&dir).unwrap();
    eprintln!("{checked} chains, {went_on} gone on from the cut, {again} evaluated again");
    assert!(bad.is_empty(), "{} differ:\n{}", bad.len(), bad.join("\n"));
    assert!(checked > 0 && went_on > again, "most cuts must be gone on from: {went_on} gone on, {again} evaluated again");
}
