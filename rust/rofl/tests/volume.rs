//! DECISION 2 OF docs/staged-evaluation.md: A WORLD KEPT AS A VOLUME OPENS AS ITSELF.
//!
//! Every world of `examples/` and `rules/` that evaluates alone is evaluated, kept as a volume
//! (`Session::keep_volume`) and opened from it mapped (`Session::open_volume`): the world opened must print as the
//! one kept, `canonical_state` and the staged facts, and evaluated again it must stay that world. A lattice's facts
//! are explained by the world opened as by the world kept, a dominance's and a join's included.
mod common;
use common::{build, first_diff, state, worlds, BUDGET};
use rofl::session::Session;

#[test]
fn a_world_kept_as_a_volume_opens_as_itself() {
    let dir = std::env::temp_dir().join(format!("rofl-volume-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let (mut checked, mut clean, mut explained) = (0, 0, 0);
    let mut bad = Vec::new();
    for (name, files) in worlds() {
        let Some(mut s) = build(&files, BUDGET) else { continue };
        if s.evaluate().is_err() {
            continue;
        }
        let want = state(&mut s);
        let path = dir.join(name.replace('/', "_")).with_extension("vol");
        let path = path.to_str().unwrap();
        s.keep_volume(path).unwrap();
        if state(&mut s) != want {
            bad.push(format!("{name}: keeping it changed the world"));
        }
        let mut o = Session::open_volume(path, BUDGET).unwrap_or_else(|e| panic!("{name}: {e}"));
        checked += 1;
        clean += !o.eval.store.dirty as usize;
        let got = state(&mut o);
        if got != want {
            bad.push(format!("{name}: opens as another, {}", first_diff(&want, &got)));
            continue;
        }
        let rels: Vec<String> = s.eval.store.lat_regs.iter().map(|r| r.rel).chain(s.eval.subs.keys().copied()).map(|r| s.eval.h.name(r).to_string()).collect();
        for rel in rels {
            for k in s.fact_keys(Some(&rel)).into_iter().take(40) {
                let (a, b) = (s.why_all(&k), o.why_all(&k));
                explained += a.is_ok() as usize;
                if a != b {
                    bad.push(format!("{name}: {k} is explained otherwise when opened"));
                }
            }
        }
        if o.evaluate().is_ok() && state(&mut o) != want {
            bad.push(format!("{name}: evaluated again it is another, {}", first_diff(&want, &state(&mut o))));
        }
        std::fs::remove_file(path).unwrap();
    }
    std::fs::remove_dir_all(&dir).unwrap();
    eprintln!("{checked} worlds kept as volumes, {clean} opened evaluated, {explained} lattice facts explained alike");
    assert!(bad.is_empty(), "{} worlds differ:\n{}", bad.len(), bad.join("\n"));
}
