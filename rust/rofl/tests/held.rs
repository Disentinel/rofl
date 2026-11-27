//! A UNIT ANOTHER NODE HOLDS (`ROFL_HELD`, engine/levels.rs `Nodes`): the side-effect question over the 19 files of
//! examples/vscode/mini by levels, where a node holds the units of four files and a reader sees the units of another
//! only as they come from there, a relation or a key at a time; the same facts and answers as the world whole.
use rofl::session::Session;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering::Relaxed;

const BUDGET: i64 = 4_000_000_000;
const ASKED: [&str; 3] = ["side_effect_value(S, F, V)", "side_effect_count(F, N, V)", "side_effect_form(S, F, T)"];

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn texts() -> Vec<String> {
    let rules = root().join("models/lang/js");
    let list = std::fs::read_to_string(rules.join("js.files")).unwrap();
    let mut files: Vec<PathBuf> = list.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).map(|l| rules.join(l)).collect();
    files.push(root().join("examples/checks/vscode-split-facts.rofl"));
    files.push(root().join("examples/vscode/side-effects.rofl"));
    files.iter().map(|f| std::fs::read_to_string(f).unwrap_or_else(|e| panic!("{}: {e}", f.display()))).collect()
}

fn keys(s: &Session) -> BTreeSet<String> {
    let st = &s.eval.store;
    (0..st.len_ids()).filter(|&id| st.alive(id)).map(|id| st.key(&s.eval.h, id)).filter(|k| !k.contains("[$kernel]")).collect()
}

#[test]
fn a_unit_another_node_holds_answers_as_the_whole_world() {
    // SAFETY: the one test of this binary, before any thread reads the environment
    unsafe { std::env::set_var("ROFL_HELD", "4") };
    let ts = texts();
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();

    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&std::iter::once(cut.core.as_str()).chain(cut.over.iter().map(String::as_str)).collect::<Vec<_>>(), None).unwrap();
    let (mut v, _) = core.by_volumes(cut.files.clone()).unwrap();

    let read: Vec<u64> = rofl::store::HELD_READ.iter().map(|c| c.load(Relaxed)).collect();
    assert!(read[0] > 0, "no reader read a unit another node holds: {read:?}");
    assert_eq!(read[4], 0, "a reader read a unit another node holds whole: {read:?}");

    let (all, got) = (keys(&whole), keys(&v));
    let names_file = |k: &&String| k.contains("_") && k.split(|c: char| !c.is_ascii_alphanumeric() && c != '_').any(|w| w.len() > 18 && w.starts_with('n') && w.as_bytes()[17] == b'_');
    let missing: Vec<&String> = all.difference(&got).filter(names_file).take(5).collect();
    let invented: Vec<&String> = got.difference(&all).filter(names_file).take(5).collect();
    assert!(missing.is_empty() && invented.is_empty(), "missing {missing:?}, invented {invented:?}");
    for q in ASKED {
        let a: BTreeSet<Vec<String>> = v.ask(q).unwrap().rows.into_iter().collect();
        let b: BTreeSet<Vec<String>> = whole.ask(q).unwrap().rows.into_iter().collect();
        assert_eq!(a, b, "{q}");
    }
}
