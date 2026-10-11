//! H5 OF docs/staged-evaluation.md: A RESUMED EVALUATION IS A WHOLE ONE.
//!
//! Every world of `examples/` and `rules/` that evaluates alone is evaluated
//! whole, then again cut by a step wall every `b` steps and resumed each time
//! with `b` more (`Session::resume`), for several `b`. Each chain must reach
//! the whole world byte for byte, `canonical_state` and the staged facts, in
//! the same steps. A wall the engine cannot go on from evaluates the world
//! again, which must also be equal; those are counted, so a resume that
//! quietly stopped going on fails as much as one that went on wrongly.
use rofl::session::Session;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn worlds() -> Vec<(String, Vec<PathBuf>)> {
    let mut out = Vec::new();
    for top in ["examples", "rules"] {
        let mut es: Vec<PathBuf> = std::fs::read_dir(repo().join(top)).unwrap().map(|e| e.unwrap().path()).collect();
        es.sort();
        for p in es {
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            if p.is_dir() {
                if name == "checks" {
                    continue;
                }
                let mut fs: Vec<PathBuf> = std::fs::read_dir(&p).unwrap().map(|e| e.unwrap().path()).filter(|f| f.extension().is_some_and(|x| x == "rofl")).collect();
                fs.sort();
                if !fs.is_empty() {
                    out.push((format!("{top}/{name}"), fs));
                }
            } else if name.ends_with(".rofl") {
                out.push((format!("{top}/{name}"), vec![p]));
            }
        }
    }
    out
}

const BUDGET: i64 = 200_000_000;

fn build(files: &[PathBuf], budget: i64) -> Option<Session> {
    let mut s = Session::fresh(budget);
    s.load(&std::fs::read_to_string(repo().join("boot.rofl")).unwrap(), None).ok()?;
    for f in files {
        s.load(&std::fs::read_to_string(f).ok()?, None).ok()?;
    }
    Some(s)
}

fn state(s: &mut Session) -> String {
    let mut out = s.eval.canonical_state();
    out.push_str("\nstaged\n");
    out.push_str(&s.eval.staged_text());
    out
}

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

fn first_diff(a: &str, b: &str) -> String {
    let (al, bl): (Vec<&str>, Vec<&str>) = (a.lines().collect(), b.lines().collect());
    for i in 0..al.len().max(bl.len()) {
        if al.get(i) != bl.get(i) {
            return format!("line {i}: want {:?} got {:?}", al.get(i), bl.get(i));
        }
    }
    "same lines".into()
}
