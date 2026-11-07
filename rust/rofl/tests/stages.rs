//! LEMMA STAGES, held to the whole world (`engine/stages.rs`): the JS model over the 19 files of examples/vscode/mini
//! and split, its raw tree cut (`cut[fixpointplan](ast_oxc)`, models/lang/js/oxc-roles.rofl) and not. Every fact
//! outside the cut book is the uncut world's, `why` stops at a lemma and `why --all` unfolds it, and a retraction is
//! refused.
use rofl::session::Session;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 4_000_000_000;
const CUT: &str = "cut[fixpointplan](ast_oxc).";

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn texts(cut: bool) -> Vec<String> {
    let rules = root().join("rules");
    let list = std::fs::read_to_string(rules.join("js.files")).unwrap();
    let mut files: Vec<PathBuf> = list.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).map(|l| rules.join(l)).collect();
    files.push(root().join("examples/checks/vscode-split-facts.rofl"));
    let ts: Vec<String> = files.iter().map(|f| std::fs::read_to_string(f).unwrap_or_else(|e| panic!("{}: {e}", f.display()))).collect();
    assert!(ts.iter().any(|t| t.contains(CUT)), "the JS model cuts its raw tree");
    ts.into_iter().map(|t| if cut { t } else { t.replace(CUT, "") }).collect()
}

fn world(cut: bool) -> Session {
    let ts = texts(cut);
    let refs: Vec<&str> = ts.iter().map(String::as_str).collect();
    let mut s = Session::fresh(BUDGET);
    s.load_all(&refs, None).unwrap();
    s.evaluate().unwrap();
    s
}

fn keys(s: &Session) -> BTreeSet<String> {
    let st = &s.eval.store;
    (0..st.len_ids()).filter(|&id| st.alive(id)).map(|id| st.key(&s.eval.h, id)).filter(|k| !k.contains("[$kernel]") && !k.contains("[ast_oxc]") && !k.contains("[fixpointplan]") && k != "edb[main](cut)").collect()
}

#[test]
fn a_cut_world_holds_what_the_whole_world_holds_outside_the_cut() {
    let (whole, mut cut) = (world(false), world(true));
    assert!(cut.eval.diags.iter().any(|d| d.starts_with("stage: ")), "the world was staged: {:?}", cut.eval.diags);
    let st = &cut.eval.store;
    assert!(!(0..st.len_ids()).any(|id| st.alive(id) && st.key(&cut.eval.h, id).contains("[ast_oxc]")), "the cut book is dropped");
    let (a, b) = (keys(&whole), keys(&cut));
    let lost: Vec<_> = a.difference(&b).take(5).collect();
    let more: Vec<_> = b.difference(&a).take(5).collect();
    assert!(lost.is_empty() && more.is_empty(), "lost {lost:?}, more {more:?}");

    let q = "held[flow](A)";
    let row = &cut.ask(q).unwrap().rows[0][0];
    let fact = format!("held[flow]({row})");
    let short = cut.why(&fact).unwrap();
    assert!(short.contains("[lemma "), "why stops at a lemma:\n{short}");
    let texts = texts(true);
    let parts = rofl::engine::volumes::cut(&texts.iter().map(String::as_str).collect::<Vec<_>>());
    cut.eval.lower_texts = Some(std::sync::Arc::new(parts.files.into_iter().collect()));
    let all = cut.why_all(&fact).unwrap();
    assert!(!all.contains("[lemma"), "why --all unfolds every lemma:\n{all}");
    assert!(all.contains("[ast_oxc]"), "down to the raw tree:\n{all}");

    let some = (0..cut.eval.store.len_ids()).find(|&id| cut.eval.store.alive(id) && cut.eval.store.rec(id).base() && cut.eval.store.key(&cut.eval.h, id).contains("[fs]")).expect("a base fact");
    let refused = cut.retract_set_delta(&[some]).unwrap();
    assert!(refused.is_err_and(|why| why.contains("lemmas")), "a staged world takes no retraction");
}
