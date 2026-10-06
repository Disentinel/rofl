//! WHAT CROSSES A TICK, AT SCALE: the provenance a boundary keeps for a cell
//! and `why` of a carried cell cost what the cells and their members are, not
//! their product with the firings that cite them or the rows `why` reads.
use rofl::session::Session;
use std::path::Path;

fn boot() -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../boot.rofl")).unwrap()
}

fn world(src: &str, retain: Option<u32>) -> Session {
    let mut s = Session::fresh(200_000_000);
    s.eval.retain_ticks = retain;
    s.load(&boot(), None).expect("boot");
    s.load(src, None).unwrap_or_else(|d| panic!("{d:?}"));
    s
}

fn facts(n: usize, rels: &[&str]) -> String {
    let mut src = String::new();
    for r in rels {
        src.push_str(&format!("edb({r}).\n"));
        for i in 0..n {
            src.push_str(&format!("{r}(k{i}).\n"));
        }
    }
    src
}

/// One cell, cited by every one of n staged firings: `retain_ticks` walks
/// its members once, not once per firing.
#[test]
fn a_cell_cited_by_many_firings_is_walked_once_at_the_boundary() {
    let n = 2000;
    let src = facts(n, &["q", "r"]) + "w(Y) :- r(Y).\np(X, N)@next :- q(X), N is count(Y : w(Y)).\n";
    let mut s = world(&src, Some(0));
    assert!(s.tick().unwrap().advanced);
    assert_eq!(s.eval.past_walks, n as u64, "the one cell's members, each once");
    let kept = s.fact_keys(Some("derived_by")).iter().filter(|k| k.starts_with("derived_by[$kernel]($fact(w,")).count();
    assert_eq!(kept, n, "every member the carried cell cites keeps its row");
}

/// `why all` of a carried cell names each member with its rules of the past
/// tick: the frozen rows are read once for the explanation, not once per
/// member.
#[test]
fn why_of_a_carried_cell_reads_the_past_rows_once() {
    let n = 4000;
    let src = facts(n, &["r"]) + "w(Y) :- r(Y).\ntn(N)@next :- N is count(Y : w(Y)).\n";
    let mut s = world(&src, None);
    assert!(s.tick().unwrap().advanced);
    s.evaluate().unwrap();
    let rows = s.fact_keys(Some("derived_by")).len() as u64;
    let text = s.why_all(&format!("tn({n})")).unwrap();
    assert_eq!(text.matches("[past tick]").count(), n, "every member, as of its tick");
    assert!(text.contains("w[main](k0)  <= r"), "a member is named with the rule that derived it then");
    assert!(s.eval.why_scans <= rows, "{} rows read for {rows} rows", s.eval.why_scans);
}
