//! `facts/port-corpus/`, the oracle every conformance test reads. It is
//! GENERATED (`scripts/port_corpus.ts`) and gitignored, so a test that read
//! whatever is on disk would panic on a fresh clone with a bare "port-corpus"
//! and, worse, pass or fail against a photograph of some older kernel. The
//! generator writes `STAMP` beside it — every file it read, every directory it
//! walked for worlds, every pairing file it looked for and did not find — and
//! `dir()` refuses the corpus unless every line still holds.
//!
//! Regenerating is NOT done here: it takes about seventy seconds of node, and
//! three test binaries running at once would each start it over one
//! directory. The refusal names the command instead.
use crate::term::{cmp_js, fnv1a};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const REGENERATE: &str = "regenerate it with `node --experimental-strip-types scripts/port_corpus.ts` \
     (about 70 s), or run rust/run_corpus.sh, which regenerates it first";

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// The corpus directory, once it is known to match the tree. Panics with the
/// reason and the command otherwise.
pub fn dir() -> PathBuf {
    static CHECKED: OnceLock<Result<PathBuf, String>> = OnceLock::new();
    match CHECKED.get_or_init(check) {
        Ok(p) => p.clone(),
        Err(e) => panic!("facts/port-corpus/ {e}; {REGENERATE}"),
    }
}

fn check() -> Result<PathBuf, String> {
    let root = repo();
    let dir = root.join("facts/port-corpus");
    let stamp = std::fs::read_to_string(dir.join("STAMP"))
        .map_err(|_| "is missing or predates its STAMP".to_string())?;
    for line in stamp.lines().filter(|l| !l.starts_with("--")) {
        let f: Vec<&str> = line.split('\t').collect();
        match f.as_slice() {
            ["file", hash, len, p] => {
                let t = std::fs::read_to_string(root.join(p))
                    .map_err(|_| format!("is stale: {p} is gone"))?;
                if fnv1a(&t) != *hash || t.encode_utf16().count().to_string() != *len {
                    return Err(format!("is stale: {p} changed since it was generated"));
                }
            }
            ["dir", hash, suffix, p] => {
                if fnv1a(&listing(&root.join(p), suffix)) != *hash {
                    return Err(format!("is stale: the worlds under {p}/ changed since it was generated"));
                }
            }
            ["absent", p] => {
                if root.join(p).exists() {
                    return Err(format!("is stale: {p} appeared since it was generated"));
                }
            }
            _ => return Err(format!("has a STAMP line this reader does not know: {line}")),
        }
    }
    Ok(dir)
}

/// `listing` in scripts/port_corpus.ts: the entries that end in `suffix` and
/// the directories, a directory marked with `/`, in the host's order.
fn listing(dir: &Path, suffix: &str) -> String {
    let mut v: Vec<String> = std::fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| {
                let e = e.ok()?;
                let n = e.file_name().to_string_lossy().into_owned();
                if e.path().is_dir() {
                    Some(n + "/")
                } else {
                    n.ends_with(suffix).then_some(n)
                }
            })
            .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| cmp_js(a.trim_end_matches('/'), b.trim_end_matches('/')));
    v.join("\n")
}
