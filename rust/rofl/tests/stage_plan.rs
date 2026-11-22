//! THE STAGE GIVEN OUT (`Eval::stage_plan`, docs/cli.md *The stage given out*), held to the whole world. A split is
//! executed here as a federation would, from the plan's facts and nothing else: the plan is taken as text off the
//! core, loaded as facts, and the stage read back from them (`Eval::stage_planned`); the rules it names `core` are
//! fired once, each pod of files fires the rules it names `file` and `both` and gives what it names `gives` and what
//! the files state outside `cuts`, and the rest fires once over what the pods gave. Every fact outside the cut books
//! must be the whole world's, however the files are dealt into pods.
use rofl::engine::volumes::{cut, node_file};
use rofl::engine::Eval;
use rofl::session::Session;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 4_000_000_000;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn rows(e: &mut Eval, rel: &str) -> Vec<Vec<String>> {
    let (rel, book) = (e.h.intern(rel), e.h.intern("stageplan"));
    e.store.rel_persp(&e.h, rel, book).into_iter().map(|f| e.store.args(f).iter().map(|t| e.h.canon(*t)).collect()).collect()
}

/// The facts a world holds outside the books `away` and the engine's own.
fn keys(e: &Eval, away: &[String]) -> BTreeSet<String> {
    let st = &e.store;
    (0..st.len_ids())
        .filter(|&id| st.alive(id))
        .map(|id| st.key(&e.h, id))
        .filter(|k| !["[$kernel]", "[fixpointplan]", "[stageplan]"].iter().any(|b| k.contains(b)) && !away.iter().any(|b| k.contains(&format!("[{b}]"))))
        .collect()
}

struct Split {
    keys: BTreeSet<String>,
    plan: String,
    cuts: Vec<String>,
    files: usize,
}

/// The world of `texts` by the plan alone, `pod` files to a pod.
fn split(texts: &[&str], pod: usize) -> Result<Split, String> {
    let parts = cut(texts);
    let mut core = Session::fresh(BUDGET);
    core.load_all(&[parts.core.as_str()], None).map_err(|e| format!("the core: {:?}", e.1))?;
    let plan = core.eval.stage_plan_text();
    core.load_all(&[plan.as_str()], None).map_err(|e| format!("the plan: {:?}", e.1))?;
    let (st, first) = core.eval.stage_planned().ok_or("the plan names no rule")?;
    core.eval.settle_core(first).map_err(|e| rofl::describe(&e))?;
    let own = rows(&mut core.eval, "own");
    let cuts: Vec<String> = rows(&mut core.eval, "cuts").into_iter().map(|a| a[0].clone()).collect();
    let (syms, funcs) = (core.eval.h.syms.len() as u32, core.eval.h.funcs_len());
    let from = core.eval.store.len_ids();
    let mut up = core.eval.fork();
    for files in parts.files.chunks(pod) {
        let text: String = files.iter().map(|f| f.1.text().into_owned() + "\n").collect();
        let low = core.eval.thaw(&text, &st).map_err(|e| rofl::describe(&e))?;
        if let [(file, _)] = files {
            low.own_kept(&st, from).map_err(|e| rofl::describe(&e))?;
            keyed(&low, from, &own, &cuts, file)?;
        }
        up.take_lemmas(&low, &st, from, syms, funcs);
    }
    up.stage_given = Some(st.below());
    let out = up.run().map_err(|e| rofl::describe(&e))?;
    if out.partial {
        return Err("the rules across stopped at a wall".into());
    }
    Ok(Split { keys: keys(&up, &cuts), plan, cuts, files: parts.files.len() })
}

/// `own[stageplan](Rel, Book, I)` holds of what a file's world holds: argument I names a node of that file.
fn keyed(low: &Eval, from: u32, own: &[Vec<String>], cuts: &[String], file: &str) -> Result<(), String> {
    for id in (from..low.store.len_ids()).filter(|&id| low.store.alive(id)) {
        let r = low.store.rec(id);
        let (rel, book) = (low.h.name(r.rel), low.h.name(r.persp));
        if cuts.iter().any(|b| b == book) {
            continue;
        }
        for o in own.iter().filter(|o| o[0] == rel && (o[1] == book || o[1] == "any")) {
            let Ok(i) = o[2].parse::<usize>() else { continue };
            let arg = low.store.args(id).get(i).map(|t| low.h.canon(*t)).unwrap_or_default();
            let node = arg.find('n').and_then(|_| arg.split(['"', '(', ')', ',', ' ']).find_map(node_file));
            if node != Some(file) {
                return Err(format!("the plan's key does not hold: {} holds at argument {i} no node of its file {file}", low.store.key(&low.h, id)));
            }
        }
    }
    Ok(())
}

fn whole(texts: &[&str]) -> Result<Session, String> {
    let mut s = Session::fresh(BUDGET);
    s.load_all(texts, None).map_err(|e| format!("{:?}", e.1))?;
    s.evaluate().map_err(|e| rofl::describe(&e))?;
    Ok(s)
}

/// The split by the plan against the world whole, row for row; how many files and rows.
fn parity(name: &str, texts: &[&str], pods: &[usize]) -> (usize, usize) {
    let all = whole(texts).unwrap_or_else(|e| panic!("{name}: the world whole: {e}"));
    let mut said = (0, 0);
    for &pod in pods {
        let s = split(texts, pod).unwrap_or_else(|e| panic!("{name}, {pod} files to a pod: {e}"));
        let want = keys(&all.eval, &s.cuts);
        let lost: Vec<_> = want.difference(&s.keys).take(4).collect();
        let more: Vec<_> = s.keys.difference(&want).take(4).collect();
        assert!(lost.is_empty() && more.is_empty(), "{name}, {pod} files to a pod: the split is not the world whole: {} rows whole, {} split; lost {lost:?}, more {more:?}", want.len(), s.keys.len());
        said = (s.files, want.len());
    }
    said
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

/// A pseudo-random stream (xorshift), the same on every run.
struct Rng(u64);
impl Rng {
    fn below(&mut self, n: usize) -> usize {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as usize % n
    }
}

/// Files of a raw tree: nodes of three kinds, each but the first a child of an earlier one, some named from a few
/// names so that files meet by them.
fn files(r: &mut Rng, n: usize) -> String {
    let mut t = String::new();
    for f in 0..n {
        let file = format!("n{:016x}", 0xa0 + f);
        let nodes = 3 + r.below(5);
        for i in 0..nodes {
            t.push_str(&format!("node[raw](\"{file}_{i}\", {}).\n", ["fn", "block", "call"][r.below(3)]));
            if i > 0 {
                t.push_str(&format!("child[raw](\"{file}_{}\", \"{file}_{i}\").\n", r.below(i)));
            }
            if r.below(2) == 0 {
                t.push_str(&format!("name[raw](\"{file}_{i}\", \"{}\").\n", ["go", "stop", "run", "main"][r.below(4)]));
            }
        }
    }
    t
}

/// A program over the raw tree: relations `d0`, `d1`, ... of nodes and names, each concluded from the tree's
/// relations, a fact of the model and the relations before it, by joins on a node or on a name, absences and counts.
fn program(r: &mut Rng) -> String {
    // a relation: its name and what each argument is, a node or a name
    let mut rels: Vec<(String, Vec<char>)> = vec![("kind".into(), vec!['n', 'k']), ("edge".into(), vec!['n', 'n']), ("named".into(), vec!['n', 's']), ("good".into(), vec!['s'])];
    let mut t = String::from(
        "cut[fixpointplan](raw).\nown[fixpointplan](node, 0). own[fixpointplan](child, 0). own[fixpointplan](child, 1). own[fixpointplan](name, 0).\n\
         edb(node). edb(child). edb(name). edb(good).\ngood(\"go\"). good(\"run\").\n\
         kind(N, K) :- node[raw](N, K).\nedge(P, C) :- child[raw](P, C).\nnamed(N, S) :- name[raw](N, S).\n",
    );
    let lit = |r: &mut Rng, rels: &[(String, Vec<char>)], bound: Option<&[String]>| -> Option<(String, Vec<String>)> {
        let (name, sig) = &rels[r.below(rels.len())];
        let mut vars = Vec::new();
        let args: Vec<String> = sig
            .iter()
            .map(|k| match k {
                'k' => ["fn", "block", "call", "_"][r.below(4)].to_string(),
                k => {
                    let v = if *k == 'n' { ["A", "B", "C"][r.below(3)] } else { ["S", "T"][r.below(2)] }.to_string();
                    vars.push(v.clone());
                    v
                }
            })
            .collect();
        if bound.is_some_and(|b| vars.iter().any(|v| !b.contains(v))) {
            return None;
        }
        Some((format!("{name}({})", args.join(", ")), vars))
    };
    for i in 0..4 + r.below(5) {
        let sig: Vec<char> = [vec!['n'], vec!['n', 'n'], vec!['n', 's'], vec!['s']][r.below(4)].clone();
        let mut made = false;
        for _ in 0..1 + r.below(2) {
            let mut body = Vec::new();
            let mut bound: Vec<String> = Vec::new();
            for _ in 0..1 + r.below(3) {
                let (l, vs) = lit(r, &rels, None).expect("a premise");
                body.push(l);
                bound.extend(vs);
            }
            if r.below(4) == 0 {
                if let Some((l, _)) = lit(r, &rels, Some(&bound)) {
                    body.push(format!("not {l}"));
                }
            }
            if r.below(5) == 0 && bound.iter().any(|v| v == "A") {
                body.push(format!("M is count(X : edge(A, X)), M > {}", r.below(2)));
            }
            let head: Option<Vec<String>> = sig.iter().enumerate().map(|(p, k)| bound.iter().filter(|v| (*k == 'n') == ["A", "B", "C"].contains(&v.as_str())).nth(p % 2).or_else(|| bound.iter().find(|v| (*k == 'n') == ["A", "B", "C"].contains(&v.as_str()))).cloned()).collect();
            if let Some(head) = head {
                t.push_str(&format!("d{i}({}) :- {}.\n", head.join(", "), body.join(", ")));
                made = true;
            }
        }
        if made {
            rels.push((format!("d{i}"), sig));
        }
    }
    t
}

/// THE WORLD OF `tests/volumes.rs` the engine's own units are held to: a negation, a count and a walked closure in a
/// file, a join by name and an absence across. One, two and all three files to a pod.
#[test]
fn a_split_by_the_plan_is_the_world_whole() {
    let facts = by_file_facts();
    let (files, rows) = parity("by_file", &[BY_FILE, &facts], &[1, 2, 3]);
    eprintln!("parity by_file: {files} files, {rows} rows whole and split");
    let s = split(&[BY_FILE, &facts], 1).unwrap();
    for said in ["cuts[stageplan](raw).", "gives[stageplan](leaf).", "own[stageplan](leaf, main, 0).", "own[stageplan](child, any, 1)."] {
        assert!(s.plan.contains(said), "the plan says {said}:\n{}", s.plan);
    }
    let fires = |w: &str| s.plan.lines().filter(|l| l.starts_with("fires[") && l.ends_with(&format!(", {w})."))).count();
    assert!(fires("file") >= 6 && fires("across") >= 3, "rules of a file and rules across:\n{}", s.plan);
}

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

/// RANDOM PROGRAMS over random files: each split by its plan, one and two files to a pod, is the world whole.
#[test]
fn random_programs_split_by_their_plans() {
    let (mut ran, mut local, mut across, mut rows) = (0, 0, 0, 0);
    for seed in 1..=60u64 {
        let mut r = Rng(seed * 0x9e3779b97f4a7c15);
        let (model, facts) = (program(&mut r), files(&mut r, 4));
        let texts = [model.as_str(), facts.as_str()];
        // (a program the engine refuses whole, an unsafe rule, is no case)
        let Ok(s) = split(&texts, 1) else {
            assert!(whole(&texts).is_err(), "seed {seed}: the split is refused, the world whole is not:\n{model}\n{}", split(&texts, 1).err().unwrap_or_default());
            continue;
        };
        let count = |w: &str| s.plan.lines().filter(|l| l.starts_with("fires[") && l.ends_with(&format!(", {w})."))).count();
        rows += parity(&format!("seed {seed}\n{model}"), &texts, &[1, 2]).1;
        ran += 1;
        local += count("file");
        across += count("across");
    }
    eprintln!("parity random: {ran} programs of 60, {local} rules of a file, {across} across, {rows} rows whole and split");
    assert!(ran >= 40 && local > 100 && across > 40, "{ran} programs ran, {local} rules of a file, {across} across");
}

/// THE PLAN IS OF THE PROGRAM, NOT OF THE FILES: the same rules over other files, over none, and over the files
/// loaded whole give the same facts.
#[test]
fn the_plan_does_not_move_with_the_files() {
    let plan = |texts: &[&str]| {
        let mut s = Session::fresh(BUDGET);
        s.load_all(texts, None).unwrap();
        s.eval.stage_plan_text()
    };
    let mut r = Rng(7);
    let (few, many) = (files(&mut r, 2), files(&mut r, 9));
    let alone = plan(&[BY_FILE]);
    assert!(alone.lines().count() > 15, "the plan:\n{alone}");
    assert_eq!(plan(&[BY_FILE, &few]), alone, "two files");
    assert_eq!(plan(&[BY_FILE, &many]), alone, "nine files");
    assert_eq!(plan(&[BY_FILE, &by_file_facts()]), alone, "the files of the test above");
    let js = js_texts("examples/checks/vscode-split-facts.rofl");
    let refs: Vec<&str> = js.iter().map(String::as_str).collect();
    let (core, with) = (plan(&[cut(&refs).core.as_str()]), plan(&refs));
    assert_eq!(core, with, "the JS model: the plan of the core is the plan with its 19 files loaded");
}

fn js_texts(facts: &str) -> Vec<String> {
    let rules = root().join("models/lang/js");
    let list = std::fs::read_to_string(rules.join("js.files")).unwrap();
    let mut files: Vec<PathBuf> = list.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).map(|l| rules.join(l)).collect();
    files.push(root().join(facts));
    files.iter().map(|f| std::fs::read_to_string(f).unwrap_or_else(|e| panic!("{}: {e}", f.display()))).collect()
}

/// THE JS MODEL over the 19 files of examples/vscode/mini and split, its plan declared in
/// models/lang/js/oxc-roles.rofl: one file to a pod, and five.
#[test]
fn the_js_model_split_by_its_plan() {
    let js = js_texts("examples/checks/vscode-split-facts.rofl");
    let refs: Vec<&str> = js.iter().map(String::as_str).collect();
    let (files, rows) = parity("js", &refs, &[1, 5]);
    let s = split(&refs, 1).unwrap();
    let count = |w: &str| s.plan.lines().filter(|l| l.starts_with("fires[") && l.ends_with(&format!(", {w})."))).count();
    eprintln!(
        "parity js: {files} files, {rows} rows whole and split; the plan: {} facts, {} bytes; rules: {} core, {} file, {} both, {} across; gives {}",
        s.plan.lines().count(),
        s.plan.len(),
        count("core"),
        count("file"),
        count("both"),
        count("across"),
        s.plan.lines().filter(|l| l.starts_with("gives[")).count()
    );
    assert!(count("file") > 300 && count("across") > 0);
}

/// EVERY WORLD OF facts/checks.rofl WHOSE PLAN CUTS A BOOK, as `npm test` loads it (boot.rofl, then its files).
#[test]
fn the_checked_worlds_split_by_their_plans() {
    let checks = std::fs::read_to_string(root().join("facts/checks.rofl")).unwrap();
    let mut worlds: Vec<(String, Vec<String>)> = Vec::new();
    for l in checks.lines().filter_map(|l| l.strip_prefix("check_file(\"")) {
        let Some((w, f)) = l.strip_suffix("\").").and_then(|l| l.split_once("\", \"")) else { continue };
        match worlds.last_mut().filter(|x| x.0 == w) {
            Some(x) => x.1.push(f.to_string()),
            None => worlds.push((w.to_string(), vec![f.to_string()])),
        }
    }
    let only = std::env::var("STAGE_PLAN_WORLD").ok();
    let boot = std::fs::read_to_string(root().join("boot.rofl")).unwrap();
    let mut ran = 0;
    for (w, fs) in worlds.iter().filter(|x| only.as_ref().is_none_or(|o| *o == x.0)) {
        if fs.iter().any(|f| !f.ends_with(".rofl")) {
            continue;
        }
        let mut texts = vec![boot.clone()];
        texts.extend(fs.iter().map(|f| std::fs::read_to_string(root().join(f)).unwrap_or_else(|e| panic!("{f}: {e}"))));
        if !texts.iter().any(|t| t.lines().any(|l| l.starts_with("cut[fixpointplan]("))) {
            continue;
        }
        let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
        let t0 = std::time::Instant::now();
        let (files, rows) = parity(w, &refs, &[1]);
        eprintln!("parity {w}: {files} files, {rows} rows whole and split, {} ms", t0.elapsed().as_millis());
        ran += 1;
    }
    assert!(ran > 0, "no world of facts/checks.rofl cuts a book");
}
