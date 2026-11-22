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

type Files = Vec<(String, rofl::engine::volumes::FileText)>;

/// The core and the files cut into volumes, and the world of them by levels.
fn by_levels() -> (Session, Files, Session) {
    let ts = texts();
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&std::iter::once(cut.core.as_str()).chain(cut.over.iter().map(String::as_str)).collect::<Vec<_>>(), None).unwrap();
    let v = core.by_volumes(cut.files.clone()).unwrap().0;
    (core, cut.files, v)
}

/// The same edit everywhere: a file loses its first fact naming a node.
fn edited(files: &Files, i: usize) -> String {
    let t = files[i].1.text().to_string();
    t[t.find(".\n").map_or(0, |x| x + 2)..].to_string()
}

fn whole_of(files: &Files) -> Session {
    let ts = texts();
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let cut = rofl::engine::volumes::cut(&refs);
    let mut texts: Vec<String> = vec![cut.core.clone()];
    texts.extend(cut.over.iter().cloned());
    texts.extend(files.iter().map(|f| f.1.text().to_string()));
    let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();
    whole
}

fn same_answers(a: &mut Session, b: &mut Session, at: &str) {
    for q in ASKED {
        let x: BTreeSet<Vec<String>> = a.ask(q).unwrap().rows.into_iter().collect();
        let y: BTreeSet<Vec<String>> = b.ask(q).unwrap().rows.into_iter().collect();
        assert_eq!(x, y, "{at}: {q}");
    }
}

fn keys(s: &Session) -> BTreeSet<String> {
    let st = &s.eval.store;
    (0..st.len_ids()).filter(|&id| st.alive(id)).map(|id| st.key(&s.eval.h, id)).filter(|k| !k.contains("[$kernel]")).collect()
}

/// A node: run by the test below as a process of its own; it settles its units, then each edit the root sends,
/// and answers until the root goes.
#[test]
#[ignore]
fn a_node() {
    if std::env::var_os("ROFL_FAR").is_some() {
        let (mut core, mut files, mut v) = by_levels();
        loop {
            let e = rofl::engine::levels::far_next();
            for (i, t) in &e {
                files[*i as usize].1 = rofl::engine::volumes::FileText::Held(t.clone());
            }
            v = core.by_volumes_edit(files.clone(), &v, e.iter().map(|x| x.0).collect()).unwrap();
        }
    }
}

#[test]
fn nodes_in_processes_answer_as_the_whole_world_and_after_edits() {
    // (first in one process, the edit in memory: one test, since the nodes are this binary's processes and the
    // environment says which one is which)
    {
        let (mut core, mut files, v) = by_levels();
        files[3].1 = rofl::engine::volumes::FileText::Held(edited(&files, 3));
        let mut w = core.by_volumes_edit(files.clone(), &v, [3u32].into_iter().collect()).unwrap();
        same_answers(&mut w, &mut whole_of(&files), "in one process, after the edit");
    }
    let dir = std::env::temp_dir().join(format!("rofl-far-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    // (the root and two nodes listen over TCP, as processes on other machines would; the rest on unix sockets)
    let port = || std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    std::fs::write(dir.join("peers"), format!("root 127.0.0.1:{}\n1 127.0.0.1:{}\n3 127.0.0.1:{}\n", port(), port(), port())).unwrap();
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
    let (mut core, mut files, mut v) = by_levels();
    let mut whole = whole_of(&files);

    let said = rofl::engine::levels::FAR_SAID[0].load(std::sync::atomic::Ordering::Relaxed);
    assert!(said > 0, "the root asked no node");
    let (all, got) = (keys(&whole), keys(&v));
    let names_file = |k: &&String| k.contains("_") && k.split(|c: char| !c.is_ascii_alphanumeric() && c != '_').any(|w| w.len() > 18 && w.starts_with('n') && w.as_bytes()[17] == b'_');
    let missing: Vec<&String> = all.difference(&got).filter(names_file).take(5).collect();
    let invented: Vec<&String> = got.difference(&all).filter(names_file).take(5).collect();
    assert!(missing.is_empty() && invented.is_empty(), "missing {missing:?}, invented {invented:?}");
    same_answers(&mut v, &mut whole, "the world");

    // (a file of node 0 edited, then one of node 2 and one of node 4 at once: every process takes each)
    for at in [vec![3usize], vec![9, 17]] {
        let e: Vec<(u32, String)> = at.iter().map(|&i| (i as u32, edited(&files, i))).collect();
        rofl::engine::levels::far_edit(&e);
        for (i, t) in &e {
            files[*i as usize].1 = rofl::engine::volumes::FileText::Held(t.clone());
        }
        v = core.by_volumes_edit(files.clone(), &v, at.iter().map(|&i| i as u32).collect()).unwrap();
        same_answers(&mut v, &mut whole_of(&files), &format!("after the edit of {at:?}"));
    }
    drop(v);
    for mut n in nodes {
        let _ = n.kill();
        let _ = n.wait();
    }
    let _ = std::fs::remove_dir_all(&dir);
}
