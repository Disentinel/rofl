//! NODES AS PROCESSES (`ROFL_FAR`, engine/levels/far.rs): the side-effect question over the 19 files of
//! examples/vscode/mini by levels, in five processes that each settle the units of four files and a root that
//! settles those over more and answers; the same facts and answers as the world whole in one process.
use rofl::session::Session;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

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

fn by_levels() -> Session {
    let ts = texts();
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&std::iter::once(cut.core.as_str()).chain(cut.over.iter().map(String::as_str)).collect::<Vec<_>>(), None).unwrap();
    core.by_volumes(cut.files.clone()).unwrap().0
}

fn keys(s: &Session) -> BTreeSet<String> {
    let st = &s.eval.store;
    (0..st.len_ids()).filter(|&id| st.alive(id)).map(|id| st.key(&s.eval.h, id)).filter(|k| !k.contains("[$kernel]")).collect()
}

/// A node: run by the test below as a process of its own; it settles its units and answers until the root goes.
#[test]
#[ignore]
fn a_node() {
    if std::env::var_os("ROFL_FAR").is_some() {
        by_levels();
    }
}

#[test]
fn nodes_in_processes_answer_as_the_whole_world() {
    let dir = std::env::temp_dir().join(format!("rofl-far-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let nodes: Vec<std::process::Child> = (0..5)
        .map(|i| {
            std::process::Command::new(std::env::current_exe().unwrap())
                .args(["a_node", "--exact", "--ignored", "--nocapture"])
                .env("ROFL_FAR", &dir)
                .env("ROFL_FAR_ME", i.to_string())
                .env("ROFL_HELD", "4")
                .stdout(std::process::Stdio::null())
                .stderr(std::fs::File::create(dir.join(format!("node-{i}.err"))).unwrap())
                .spawn()
                .unwrap()
        })
        .collect();
    // SAFETY: the one test of this binary that runs, before any thread reads the environment
    unsafe {
        std::env::set_var("ROFL_FAR", &dir);
        std::env::set_var("ROFL_FAR_ME", "root");
        std::env::set_var("ROFL_HELD", "4");
    }
    let mut v = by_levels();
    let ts = texts();
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();

    let said = rofl::engine::levels::FAR_SAID[0].load(std::sync::atomic::Ordering::Relaxed);
    assert!(said > 0, "the root asked no node");
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
    drop(v);
    for mut n in nodes {
        let _ = n.kill();
        let _ = n.wait();
    }
    let _ = std::fs::remove_dir_all(&dir);
}

