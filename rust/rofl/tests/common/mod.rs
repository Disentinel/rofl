//! What the differential tests over every world share: the worlds of `examples/` and `rules/`, built and printed.
use rofl::session::Session;
use std::path::{Path, PathBuf};

pub fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

pub fn worlds() -> Vec<(String, Vec<PathBuf>)> {
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

pub const BUDGET: i64 = 200_000_000;

pub fn build(files: &[PathBuf], budget: i64) -> Option<Session> {
    let mut s = Session::fresh(budget);
    s.load(&std::fs::read_to_string(repo().join("boot.rofl")).unwrap(), None).ok()?;
    for f in files {
        s.load(&std::fs::read_to_string(f).ok()?, None).ok()?;
    }
    Some(s)
}

pub fn state(s: &mut Session) -> String {
    let mut out = s.eval.canonical_state();
    out.push_str("\nstaged\n");
    out.push_str(&s.eval.staged_text());
    out
}

pub fn first_diff(a: &str, b: &str) -> String {
    let (al, bl): (Vec<&str>, Vec<&str>) = (a.lines().collect(), b.lines().collect());
    for i in 0..al.len().max(bl.len()) {
        if al.get(i) != bl.get(i) {
            return format!("line {i}: want {:?} got {:?}", al.get(i), bl.get(i));
        }
    }
    "same lines".into()
}
