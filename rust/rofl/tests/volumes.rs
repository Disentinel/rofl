//! A CORPUS AS VOLUMES, held to the whole world (`engine/volumes.rs`): the JS model and the side-effect question over
//! the 19 files of examples/vscode/mini and split, evaluated whole and by volumes. Every fact that names
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
    let rules = root().join("models/lang/js");
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

/// Then again past a quarter of the memory the process may use, where the units done are cooled to disk and go
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
    let v = core.by_volumes(&cut.files);
    if cool {
        mem(0, 0);
    }
    let (mut v, stats) = v.unwrap();
    assert!(!cool || stats.cooled > 1 && stats.cool_files >= files && stats.cool_bytes > 0, "{stats:?}");

    let union = keys(&v);
    let all = keys(&whole);
    let missing: Vec<&String> = all.difference(&union).take(5).collect();
    let invented: Vec<&String> = union.difference(&all).take(5).collect();
    assert!(missing.is_empty() && invented.is_empty(), "the volumes answer otherwise than the whole world: missing {missing:?}, invented {invented:?}");

    for q in ASKED {
        assert_eq!(answers(&mut v, q), answers(&mut whole, q), "the volumes answer otherwise than the whole world: {q}");
    }
    if cool {
        // the units cooled are kept as a segment of the scroll and read back from it: the same answers
        let units = v.eval.levels.clone().expect("a world by levels");
        let k = std::env::temp_dir().join(format!("rofl-volumes-kept-{}", std::process::id())).to_string_lossy().to_string();
        rofl::volume::keep_units(&k, Some(&units)).unwrap();
        let mut e = v.eval.fork();
        e.store.reads_none();
        e.levels = None;
        let back = std::sync::Arc::new(rofl::volume::open_units(&k, &e).unwrap());
        back.read_by(&mut e);
        e.levels = Some(back);
        v.eval = e;
        for q in ASKED {
            assert_eq!(answers(&mut v, q), answers(&mut whole, q), "the units kept and read back answer otherwise than the whole world: {q}");
        }
        rofl::volume::keep_units(&k, None).unwrap();
    }
}

/// A WALKED CLOSURE WHOSE EDGES CROSS THE FILES: a path that leaves a file and comes back through a third is the
/// whole world's path, by volumes too.
#[test]
fn a_walked_closure_crosses_the_volumes() {
    // the edges given, and the edges a rule concludes
    walked("edb(edge). edb(start).\ngraph edge(X, Y) closure reach.\nfrom(S, Y) :- start(S), reach(S, Y).\n");
    walked("edb(link). edb(start).\nedge(X, Y) :- link(X, Y).\ngraph edge(X, Y) closure reach.\nfrom(S, Y) :- start(S), reach(S, Y).\n");
}

fn walked(model: &str) {
    let (a, b, c) = ("n00000000000000aa", "n00000000000000bb", "n00000000000000cc");
    let rel = if model.contains("link") { "link" } else { "edge" };
    let facts = format!(
        "start(\"{a}_1\").\n{rel}(\"{a}_1\", \"{a}_2\").\n{rel}(\"{a}_2\", \"{b}_1\").\n{rel}(\"{b}_1\", \"{b}_2\").\n{rel}(\"{b}_2\", \"{c}_1\").\n{rel}(\"{c}_1\", \"{c}_2\").\n{rel}(\"{c}_2\", \"{a}_3\").\nstart(\"{c}_1\").\n"
    );
    let refs = [model, facts.as_str()];
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();
    let cut = rofl::engine::volumes::cut(&refs);
    assert_eq!(cut.files.len(), 3);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let mut v = core.by_volumes(&cut.files).unwrap().0;
    let q = "from(S, Y)";
    let by = answers(&mut v, q);
    let all = answers(&mut whole, q);
    assert_eq!(all.len(), 8);
    assert_eq!(by, all, "the volumes walk a closure otherwise than the whole world");
}

const BY_FILE: &str = "cut[fixpointplan](raw).\n\
own[fixpointplan](node, 0). own[fixpointplan](child, 0). own[fixpointplan](child, 1). own[fixpointplan](name, 0).\n\
edb(node). edb(child). edb(name).\n\
kind(N, K) :- node[raw](N, K).\n\
edge(P, C) :- child[raw](P, C).\n\
named(N, S) :- name[raw](N, S).\n\
graph edge(P, C) closure under.\n\
has_child(P) :- edge(P, _).\n\
leaf(N) :- kind(N, _), not has_child(N).\n\
kids(P, N) :- has_child(P), N is count(C : edge(P, C)).\n\
deep(A, D) :- under(A, D), leaf(D).\n\
same(A, B) :- named(A, S), named(B, S).\n\
twin(A) :- same(A, B), leaf(B).\n\
lonely(N) :- leaf(N), not twin(N).\n";

fn by_file_facts() -> String {
    let (a, b, c) = ("n00000000000000aa", "n00000000000000bb", "n00000000000000cc");
    let mut t = String::new();
    for f in [a, b, c] {
        for (n, k) in [(1, "fn"), (2, "block"), (3, "call"), (4, "call")] {
            t.push_str(&format!("node[raw](\"{f}_{n}\", {k}).\n"));
        }
        t.push_str(&format!("child[raw](\"{f}_1\", \"{f}_2\").\nchild[raw](\"{f}_2\", \"{f}_3\").\nchild[raw](\"{f}_2\", \"{f}_4\").\n"));
    }
    t.push_str(&format!("name[raw](\"{a}_3\", \"go\").\nname[raw](\"{b}_4\", \"go\").\nname[raw](\"{c}_3\", \"stop\").\nname[raw](\"{a}_1\", \"main\").\n"));
    t
}

/// THE WORK CUT BY FILE (`Eval::lemma_stage`, `own[fixpointplan]`): the rules that cannot leave a file, a negation, a
/// count and a walked closure among them, are evaluated in the file's world and what they conclude is given; the rules
/// that cross files fire over it. The answers are the whole world's.
#[test]
fn the_rules_of_one_file_are_evaluated_in_its_world() {
    let facts = by_file_facts();
    let refs = [BY_FILE, facts.as_str()];
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();
    let cut = rofl::engine::volumes::cut(&refs);
    assert_eq!(cut.files.len(), 3);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let st = core.eval.lemma_stage().expect("the plan cuts a book");
    let heads: BTreeSet<&str> = st.heads.iter().map(|r| core.eval.h.name(*r)).collect();
    for of_file in ["has_child", "leaf", "kids", "deep"] {
        assert!(heads.contains(of_file), "{of_file} is of one file: {heads:?}");
    }
    for across in ["same", "twin", "lonely", "under"] {
        assert!(!heads.contains(across), "{across} is not given by a file: {heads:?}");
    }
    let mut v = core.by_volumes(&cut.files).unwrap().0;
    for (q, n) in [("leaf(N)", 6), ("kids(P, N)", 6), ("deep(A, D)", 12), ("same(A, B)", 6), ("twin(A)", 3), ("lonely(N)", 3)] {
        let all = answers(&mut whole, q);
        assert_eq!(all.len(), n, "{q}: {all:?}");
        assert_eq!(answers(&mut v, q), all, "{q}");
    }
    {
        let w = &mut v;
        let fact = "lonely(\"n00000000000000aa_4\")";
        let short = w.why(fact).unwrap();
        assert!(short.contains("leaf") && short.contains("[lemma"), "why stops at the file's lemma:\n{short}");
        w.eval.lower_texts = Some(std::sync::Arc::new(cut.files.iter().cloned().collect()));
        let all = w.why_all(fact).unwrap();
        assert!(!all.contains("[lemma") && all.contains("has_child"), "why --all unfolds it:\n{all}");
    }
}

/// A fact that breaks what the plan says of its relation refuses the world: a node of another file where `own` names
/// the fact's file, and a relation a file states that the plan does not name.
#[test]
fn a_file_that_breaks_the_plan_is_refused() {
    for (more, said) in [
        ("child[raw](\"n00000000000000aa_1\", \"n00000000000000bb_1\").\n", "is of no one file"),
        ("child[raw](\"n00000000000000aa_1\", top).\n", "no node of its file"),
        ("seen(\"n00000000000000aa_1\").\n", "the plan names what a file states"),
    ] {
        let facts = by_file_facts() + more;
        let refs = [BY_FILE, facts.as_str()];
        let cut = rofl::engine::volumes::cut(&refs);
        let mut core = Session::fresh(BUDGET);
        core.load_all(&[cut.core.as_str()], None).unwrap();
        let e = core.by_volumes(&cut.files).err().map(|e| rofl::describe(&e)).unwrap_or_default();
        assert!(e.contains(said), "refused with {said:?}: {e}");
    }
}

/// A NODE IS AN ATOM OR A WHOLE STRING: a key written inside a string's text (a test of the scanner quoting one, a
/// line of a source) names no file, and the fact is its own nodes' file's, not the core's.
#[test]
fn a_node_key_inside_a_string_names_no_file() {
    use rofl::engine::volumes::file_of;
    assert_eq!(file_of("attr[ast_rs](\"n4010502757c192de_a2\", value, \"refers(n0000000000000006_\").\n"), Some("4010502757c192de"));
    assert_eq!(file_of("name[raw](\"n00000000000000aa_1\", \"n00000000000000bb_1 \\\" n00000000000000cc_1\").\n"), None);
    assert_eq!(file_of("edge(n00000000000000aa_1, n00000000000000aa_2, \"x n00000000000000bb_1\").\n"), Some("00000000000000aa"));
    assert_eq!(file_of("see(\"main\", \"go n00000000000000bb_1\").\n"), None);
    // (so a plan that says a name's node is of its file holds: the world goes by levels, as the world whole answers)
    let facts = by_file_facts() + "name[raw](\"n00000000000000aa_2\", \"go n00000000000000bb_4\").\n";
    let refs = [BY_FILE, facts.as_str()];
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let mut v = core.by_volumes(&cut.files).unwrap_or_else(|e| panic!("{}", rofl::describe(&e))).0;
    assert_eq!(answers(&mut v, "named(N, S)"), answers(&mut whole, "named(N, S)"));
}

/// A FIRING IS READ IN THE STORE THAT WROTE IT: a unit's firing cites a row of a tree by its key, and the unit above
/// (here the reader's, where a count is left) names its own rows with numbers of its own. The count's members rest
/// on rows the file units cite, and their heights are the world whole's.
#[test]
fn the_rows_a_lower_unit_cites_are_its_own() {
    let model = "tree edge(P, C).\nnearest nfn[d](F, X) of edge[d](F, X) where func[d](F).\n\
        m[d](X) :- stmt[d](X), nfn[d](F, X).\nn[d](F, N) :- func[d](F), N is count(X : m[d](X), nfn[d](F, X)).\n";
    let mut facts = String::new();
    for f in 1..=12u64 {
        let node = |k: u64| format!("n{f:016x}_{k}");
        facts += &format!("func[d]({}).\n", node(0));
        // (a chain as deep as the file's number: the rows' heights differ from file to file)
        for k in 1..=f + 2 {
            facts += &format!("edge[d]({}, {}).\nstmt[d]({}).\n", node(k - 1), node(k), node(k));
        }
    }
    let refs = [model, facts.as_str()];
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let mut v = core.by_volumes(&cut.files).unwrap_or_else(|e| panic!("{}", rofl::describe(&e))).0;
    assert_eq!(answers(&mut v, "n[d](F, N)"), answers(&mut whole, "n[d](F, N)"));
    let heights = |s: &rofl::store::Store| {
        let mut all: Vec<Vec<u32>> = (0..s.cell_count()).map(|c| {
            let mut h: Vec<u32> = s.cell_members(c as _).iter().map(|m| m.height).collect();
            h.sort_unstable();
            h
        }).collect();
        all.sort();
        all
    };
    let lv = v.eval.levels.clone().expect("a world by levels");
    let reader = lv.tops.last().expect("the reader's unit").stretch.store();
    let want = heights(&whole.eval.store);
    assert!(want.len() == 12 && want.iter().all(|h| !h.is_empty()), "{want:?}");
    assert_eq!(heights(reader), want);
}

/// WHAT A WORLD BY LEVELS SPENT IS THE SUM OF ITS UNITS: the rules fired in the files' units are in the reader's
/// count, as a world whole keeps its own (`hot_rules`, the profile), and one whose rows read, summed, cross the
/// threshold is said hot though no unit alone crossed it.
#[test]
fn the_units_spend_into_the_worlds_count() {
    let facts = by_file_facts();
    let refs = [BY_FILE, facts.as_str()];
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    (core.eval.cost.hot_read, core.eval.cost.hot_given) = (20, true);
    let v = core.by_volumes(&cut.files).unwrap().0;
    let heads: BTreeSet<String> = v.eval.hot_rules(100).into_iter().map(|h| h.head).collect();
    for of_file in ["has_child", "leaf"] {
        assert!(heads.contains(of_file), "{of_file} fired in the files' units: {heads:?}");
    }
    assert!(v.eval.cost.hot_said.iter().any(|s| s.contains("summed over the units")), "{:#?}", v.eval.cost.hot_said);
}

/// THE PROFILE OF A WORLD BY LEVELS (docs/cli.md, *The profile of an evaluation*): a rule that reads it is not a
/// reason to evaluate the world whole. The units' count is written once they are settled, and the reader fires what
/// reads it: the rules the files' units fired are there.
#[test]
fn a_world_by_levels_reads_its_own_profile() {
    let facts = by_file_facts();
    let model = format!("{BY_FILE}fired(R) :- fires[profile](R, N), N > 0.\n");
    let refs = [model.as_str(), facts.as_str()];
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let mut v = core.by_volumes(&cut.files).unwrap_or_else(|e| panic!("{}", rofl::describe(&e))).0;
    let fired: BTreeSet<String> = answers(&mut v, "fired(R)").into_iter().map(|r| r[0].clone()).collect();
    let leaf: BTreeSet<String> = v.eval.rules.iter().filter(|r| ["leaf", "has_child"].contains(&v.eval.h.name(r.clause.head.rel))).map(|r| v.eval.h.name(r.id).to_string()).collect();
    assert!(!leaf.is_empty() && leaf.is_subset(&fired), "the rules of the files' units are in the profile: {leaf:?} of {fired:?}");
    assert_eq!(answers(&mut v, "leaf(N)").len(), 6);
}

/// A count the core settles (it reads no file) and a count left to the reader's unit, in one world: the reader's
/// unit, a fork of the frozen core, clears what it derives without walking the core's cells as its own.
#[test]
fn a_count_of_the_core_and_one_of_the_reader() {
    let facts = by_file_facts();
    let model = format!("{BY_FILE}tag(a). tag(b).\ntags(N) :- N is count(X : tag(X)).\ntwins(N) :- N is count(A : twin(A)).\n");
    let refs = [model.as_str(), facts.as_str()];
    let mut whole = Session::fresh(BUDGET);
    whole.load_all(&refs, None).unwrap();
    whole.evaluate().unwrap();
    let cut = rofl::engine::volumes::cut(&refs);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[cut.core.as_str()], None).unwrap();
    let mut v = core.by_volumes(&cut.files).unwrap_or_else(|e| panic!("{}", rofl::describe(&e))).0;
    for q in ["tags(N)", "twins(N)"] {
        assert_eq!(answers(&mut v, q), answers(&mut whole, q), "{q}");
    }
}
