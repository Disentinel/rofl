//! A CORPUS AS VOLUMES, held to the whole world (`engine/volumes.rs`): the JS model and the side-effect question over
//! the 19 files of examples/vscode/mini and split, evaluated whole and by volumes on four workers. Every fact that names
//! a file is the whole world's, no more and no fewer, and every answer of the question, the counts over every file
//! among them, is the whole world's.
use rofl::session::Session;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 4_000_000_000;
const ASKED: [&str; 5] = ["side_effect_value(S, F, V)", "side_effect_site(S, F)", "side_effect_count(F, N, V)", "side_effect_env(V, K)", "side_effect_form(S, F, T)"];

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn texts() -> Vec<String> {
    let rules = root().join("rules");
    let list = std::fs::read_to_string(rules.join("js.files")).unwrap();
    let mut files: Vec<PathBuf> = list.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).map(|l| rules.join(l)).collect();
    files.push(root().join("examples/checks/vscode-split-facts.rofl"));
    files.push(root().join("examples/vscode/side-effects.rofl"));
    files.iter().map(|f| std::fs::read_to_string(f).unwrap_or_else(|e| panic!("{}: {e}", f.display()))).collect()
}

fn names_file(key: &str) -> bool {
    let b = key.as_bytes();
    (0..b.len().saturating_sub(17)).any(|i| b[i] == b'n' && (i == 0 || !b[i - 1].is_ascii_alphanumeric()) && b[i + 17] == b'_' && b[i + 1..i + 17].iter().all(|c| c.is_ascii_hexdigit()))
}

fn keys(s: &Session) -> BTreeSet<String> {
    let st = &s.eval.store;
    (0..st.len_ids()).filter(|&id| st.alive(id)).map(|id| st.key(&s.eval.h, id)).filter(|k| names_file(k) && !k.contains("[$kernel]")).collect()
}

fn answers(s: &mut Session, q: &str) -> BTreeSet<Vec<String>> {
    s.ask(q).unwrap().rows.into_iter().collect()
}

/// Then again past a quarter of the memory the process may use, where the workers are cooled to disk before each level and go
/// on mapped from it: the same facts and answers. One test, as the memory measured is the process's.
#[test]
fn the_volumes_answer_as_the_whole_world() {
    check(false);
    check(true);
}

fn check(cool: bool) {
    let ts = texts();
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();

    let cut = rofl::engine::volumes::cut(&refs);
    let files = cut.files.len();
    assert_eq!(files, 19);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let mem = |used: i64, may: i64| {
        rofl::engine::MEMORY_USED.store(used, std::sync::atomic::Ordering::Relaxed);
        rofl::engine::MEMORY_LIMIT.store(may, std::sync::atomic::Ordering::Relaxed);
    };
    if cool {
        mem(2, 2);
    }
    let v = core.by_volumes(rofl::engine::volumes::groups(cut.files, 4), files);
    if cool {
        mem(0, 0);
    }
    let mut v = v.unwrap();
    assert!(!cool || v.stats.cooled > 1 && v.stats.cool_files == v.stats.cooled * v.stats.workers, "{:?}", v.stats);

    let union: BTreeSet<String> = v.worlds.iter().flat_map(keys).collect();
    let all = keys(&whole);
    let missing: Vec<&String> = all.difference(&union).take(5).collect();
    let invented: Vec<&String> = union.difference(&all).take(5).collect();
    assert!(missing.is_empty() && invented.is_empty(), "the volumes answer otherwise than the whole world: missing {missing:?}, invented {invented:?}");

    for q in ASKED {
        let rel = q.split('(').next().unwrap();
        let by = match core.resident(&v, rel).unwrap() {
            Some(mut r) => answers(&mut r, q),
            None => v.worlds.iter_mut().flat_map(|w| answers(w, q)).collect(),
        };
        assert_eq!(by, answers(&mut whole, q), "the volumes answer otherwise than the whole world: {q}");
    }
    assert!(v.stats.laid > 0 && v.stats.rounds > 0, "{:?}", v.stats);
}
