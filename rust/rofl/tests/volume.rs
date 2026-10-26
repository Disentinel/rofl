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

/// A WORLD KEPT AFTER AN EDIT IS WRITTEN OVER THE VOLUME IT WAS OPENED FROM (f_a_kept_world_is_written_whole_by_each_edit):
/// edits one after another, each opened from the overlay the one before kept, each kept as an overlay over the one
/// whole volume, each opened as the world a fresh evaluation of its facts gives, each overlay a small part of the
/// base. An overlay whose base is gone or changed is refused.
#[test]
fn edits_kept_as_overlays_open_as_the_fresh_world() {
    let dir = std::env::temp_dir().join(format!("rofl-overlay-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let at = |n: &str| dir.join(n).to_str().unwrap().to_string();
    let rules = "edb(edge).\nedb(tag).\nnode(X) :- edge(X, _).\ntwo(X, Z) :- edge(X, Y), edge(Y, Z).\nfirst(X) :- node(X), not edge(_, X).\nnamed(X, T) :- two(X, _), tag(X, T).\n";
    let n = 30_000;
    let mut facts: Vec<String> = (0..n).map(|i| format!("edge(n{i}, n{}).", (i * 7 + 1) % n)).collect();
    facts.extend((0..n / 3).map(|i| format!("tag(n{}, \"t{i}\").", i * 3)));
    // what no edit touches, as most of a large world
    let still: String = (0..4 * n).map(|i| format!("far({i}, \"f{}\").\n", i % 977)).collect();
    let boot = std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap();
    let fresh = |facts: &[String]| {
        let mut s = Session::fresh(BUDGET);
        s.load(&boot, None).unwrap();
        s.load(rules, None).unwrap();
        s.load(&facts.join("\n"), None).unwrap();
        s.load(&still, None).unwrap();
        s.evaluate().unwrap();
        state(&mut s)
    };
    let mut s = Session::fresh(BUDGET);
    s.load(&boot, None).unwrap();
    s.load(rules, None).unwrap();
    s.load(&facts.join("\n"), None).unwrap();
    s.load(&still, None).unwrap();
    s.evaluate().unwrap();
    s.eval.index_for_retraction();
    let base_bytes = s.keep_volume(&at("base.vol")).unwrap();
    let mut from = at("base.vol");
    let mut seed: u64 = 0x2545_f491_4f6c_dd1d;
    let mut below = move |k: usize| { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; (seed % k as u64) as usize };
    for step in 0..6 {
        let mut o = Session::open_volume(&from, BUDGET).unwrap_or_else(|e| panic!("step {step}: {e}"));
        let chain = o.kept.files.clone();
        assert_eq!(chain[0].path, at("base.vol"), "step {step}: the chain starts at the one whole volume");
        assert_eq!(chain.len(), step + 1, "step {step}: each overlay is kept over the one before it");
        let out: Vec<String> = (0..1 + below(4)).map(|_| facts.swap_remove(below(facts.len()))).collect();
        let (ids, _, _) = o.facts_of(&out.join("\n")).unwrap();
        o.retract_set_delta(&ids).unwrap().unwrap();
        let more: Vec<String> = (0..1 + below(5)).map(|k| format!("edge(m{step}_{k}, n{}).", below(n))).chain([format!("tag(m{step}_0, \"new\").")]).collect();
        o.load_delta(&more.join("\n"), None).unwrap();
        facts.extend(more);
        let path = at(&format!("over{step}.vol"));
        let bytes = o.keep_volume_as(&path, "", None, &chain).unwrap();
        assert!(bytes * 32 < base_bytes, "step {step}: an overlay of {bytes} bytes over a base of {base_bytes}");
        let mut back = Session::open_volume(&path, BUDGET).unwrap_or_else(|e| panic!("step {step}: {e}"));
        let (got, want) = (state(&mut back), fresh(&facts));
        assert!(got == want, "step {step}: the overlay opens as another world, {}", first_diff(&want, &got));
        rofl::volume::check(&path).unwrap_or_else(|e| panic!("step {step}: {e}"));
        from = path;
    }
    std::fs::copy(at("base.vol"), at("moved.vol")).unwrap();
    std::fs::remove_file(at("base.vol")).unwrap();
    assert!(Session::open_volume(&from, BUDGET).is_err_and(|e| e.contains("is gone or changed")), "an overlay opened without its base");
    std::fs::remove_dir_all(&dir).unwrap();
}
