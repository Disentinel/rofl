//! THE STAGE GIVEN OUT (`Eval::stage_plan`, docs/cli.md *The stage given out*), held to the whole world. A split is
//! executed here as a federation would, from the plan's facts and nothing else: the plan is taken as text off the
//! core and the stage read back from that text (`Eval::stage_planned`); the rules it names `core` are
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

/// The facts of one relation of a plan, each by its arguments.
fn rows(plan: &str, rel: &str) -> Vec<Vec<String>> {
    plan.lines().filter_map(|l| l.strip_prefix(&format!("{rel}[stageplan](")).and_then(|l| l.strip_suffix(")."))).map(|l| l.split(',').map(str::to_string).collect()).collect()
}

/// The facts a world holds outside the books `away` and the engine's own.
fn keys(e: &Eval, away: &[String]) -> BTreeSet<String> {
    let st = &e.store;
    (0..st.len_ids())
        .filter(|&id| st.alive(id))
        .map(|id| st.key(&e.h, id))
        .filter(|k| !["[$kernel]", "[fixpointplan]"].iter().any(|b| k.contains(b)) && !away.iter().any(|b| k.contains(&format!("[{b}]"))))
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
    // the plan goes as its text, and the stage is read from it alone
    let (st, first) = core.eval.stage_planned(&plan).ok_or("the plan names no rule")?;
    core.eval.settle_core(first).map_err(|e| rofl::describe(&e))?;
    let own = rows(&plan, "own");
    let cuts: Vec<String> = rows(&plan, "cuts").into_iter().map(|a| a[0].clone()).collect();
    let mut up = core.fork();
    let (syms, funcs) = (core.eval.h.syms.len() as u32, core.eval.h.funcs_len());
    let from = core.eval.store.len_ids();
    // (a world of no file is one pod of none: a rule of a file concludes from what the core states too)
    let none = [];
    let pods: Vec<&[(String, rofl::engine::volumes::FileText)]> = if parts.files.is_empty() { vec![&none] } else { parts.files.chunks(pod).collect() };
    for files in pods {
        let text: String = files.iter().map(|f| f.1.text().into_owned() + "\n").collect();
        let low = core.eval.thaw(&text, &st).map_err(|e| rofl::describe(&e))?;
        if let [(file, _)] = files {
            low.own_kept(&st, from).map_err(|e| rofl::describe(&e))?;
            keyed(&low, from, &own, &cuts, file)?;
        }
        up.eval.take_lemmas(&low, &st, from, syms, funcs);
    }
    up.eval.stage_given = Some(st.below());
    up.evaluate().map_err(|e| rofl::describe(&e))?;
    Ok(Split { keys: keys(&up.eval, &cuts), plan, cuts, files: parts.files.len() })
}

/// `own[stageplan](Rel, Book, I)` holds of what a file's world holds: argument I names a node of that file.
fn keyed(low: &Eval, from: u32, own: &[Vec<String>], cuts: &[String], file: &str) -> Result<(), String> {
    for id in (from..low.store.len_ids()).filter(|&id| low.store.alive(id)) {
        let r = low.store.rec(id);
        let (rel, book) = (low.h.name(r.rel), low.h.name(r.persp));
        if cuts.iter().any(|b| b == book) {
            continue;
        }
        // the arguments the plan names hold each a node of this file, or the fact is of no file and none holds a node
        let at: Vec<usize> = own.iter().filter(|o| o[0] == rel && (o[1] == book || o[1] == "any")).filter_map(|o| o[2].parse().ok()).collect();
        let nodes: Vec<Option<String>> = at
            .iter()
            .map(|&i| {
                let arg = low.store.args(id).get(i).map(|t| low.h.canon(*t)).unwrap_or_default();
                arg.split(['"', '(', ')', ',', ' ']).find_map(node_file).map(str::to_string)
            })
            .collect();
        if let Some(i) = (0..at.len()).find(|&i| nodes[i].as_deref() != Some(file) && nodes.iter().any(|n| n.is_some())) {
            return Err(format!("the plan's key does not hold: {} holds at argument {} no node of its file {file}", low.store.key(&low.h, id), at[i]));
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
    held(name, texts, pods).unwrap_or_else(|e| panic!("{}", e.said))
}

/// Whether the world whole keeps the relation of a fact: it keeps none of a relation below its cut that no rule
/// above reads, and refuses a question of it.
fn kept(all: &mut Session, k: &str) -> bool {
    let (rel, book) = k.split_once('[').and_then(|(r, rest)| Some((r, rest.split_once(']')?.0))).unwrap_or((k, ""));
    let (rel, book) = (all.eval.h.intern(rel), all.eval.h.intern(book));
    all.eval.staged_away(rel, Some(book)).is_none()
}

/// Why a split is not the world whole: the relations of the rows it lost, and how many rows it holds too many.
struct Gap {
    said: String,
    lost: BTreeSet<String>,
    more: usize,
}

fn held(name: &str, texts: &[&str], pods: &[usize]) -> Result<(usize, usize), Gap> {
    let gap = |said: String| Gap { said, lost: BTreeSet::new(), more: 0 };
    let mut all = whole(texts).map_err(|e| gap(format!("{name}: the world whole: {e}")))?;
    let mut said = (0, 0);
    for &pod in pods {
        let s = split(texts, pod).map_err(|e| gap(format!("{name}, {pod} files to a pod: {e}")))?;
        let want = keys(&all.eval, &s.cuts);
        let lost: Vec<_> = want.difference(&s.keys).take(4).collect();
        // (the world whole keeps no fact of a relation below its cut that no rule above reads, and refuses a question of
        // it: a split that gave one, the edges of a tree it walks above, is held to what the world whole answers)
        let more: Vec<_> = s.keys.difference(&want).filter(|k| kept(&mut all, k)).take(4).collect();
        if !(lost.is_empty() && more.is_empty()) {
            let rels = want.difference(&s.keys).filter_map(|k| k.split_once(']').map(|x| format!("{}]", x.0))).collect();
            let said = format!("{name}, {pod} files to a pod of {}: the split is not the world whole: {} rows whole, {} split; lost {lost:?}, more {more:?}", s.files, want.len(), s.keys.len());
            return Err(Gap { said, lost: rels, more: more.len() });
        }
        said = (s.files, want.len());
    }
    Ok(said)
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
    for said in ["cuts[stageplan](raw).", "gives[stageplan](leaf).", "own[stageplan](leaf,main,0).", "own[stageplan](child,any,1)."] {
        assert!(s.plan.contains(said), "the plan says {said}:\n{}", s.plan);
    }
    let fires = |w: &str| s.plan.lines().filter(|l| l.starts_with("fires[") && l.ends_with(&format!(",{w})."))).count();
    assert!(fires("file") >= 6 && fires("across") >= 3, "rules of a file and rules across:\n{}", s.plan);
    // every rule the plan gives a layer is a rule across
    let layered: Vec<&str> = s.plan.lines().filter_map(|l| l.strip_prefix("layer[stageplan](")).filter_map(|l| l.split(',').next()).collect();
    assert!(!layered.is_empty() && layered.iter().all(|r| s.plan.contains(&format!("fires[stageplan]({r},across)."))), "the layers:\n{}", s.plan);
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
        let count = |w: &str| s.plan.lines().filter(|l| l.starts_with("fires[") && l.ends_with(&format!(",{w})."))).count();
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
    let count = |w: &str| s.plan.lines().filter(|l| l.starts_with("fires[") && l.ends_with(&format!(",{w})."))).count();
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
    assert!(s.plan.contains("tree[stageplan](nearest_v,flow)."), "the nearest a file settles is named a tree");
}

/// The worlds of facts/checks.rofl whose plan cuts a book, each as `npm test` loads it: boot.rofl, then its files.
/// `STAGE_PLAN_WORLD` names one.
fn checked_worlds() -> Vec<(String, Vec<String>)> {
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
    let mut out = Vec::new();
    for (w, fs) in worlds.into_iter().filter(|x| only.as_ref().is_none_or(|o| *o == x.0) && x.1.iter().all(|f| f.ends_with(".rofl"))) {
        let mut texts = vec![boot.clone()];
        texts.extend(fs.iter().map(|f| std::fs::read_to_string(root().join(f)).unwrap_or_else(|e| panic!("{f}: {e}"))));
        if texts.iter().any(|t| t.lines().any(|l| l.starts_with("cut[fixpointplan]("))) {
            out.push((w, texts));
        }
    }
    out
}

/// The worlds the engine's own units do not answer whole (`the_checked_worlds_by_the_engines_units`).
const UNITS_OPEN: [&str; 6] = ["parity_rs_instances", "parity_rs_keyed", "parity_rs_strings", "parity_rs_guards", "parity_rs_service", "parity_rs_calls"];

/// The worlds whose split loses the rows of one rule the engine's pass above does not fire (below).
const OPEN: [&str; 4] = ["lifecycle_clean", "lifecycle_forgetful", "lifecycle_leaky", "lifecycle_overwrites"];

/// EVERY WORLD OF facts/checks.rofl WHOSE PLAN CUTS A BOOK, as `npm test` loads it (boot.rofl, then its files).
#[test]
fn the_checked_worlds_split_by_their_plans() {
    let (mut ran, mut refused, mut open, mut bad) = (0, 0, 0, Vec::new());
    for (w, texts) in checked_worlds() {
        let w = &w;
        let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
        let t0 = std::time::Instant::now();
        match held(w, &refs, &[1]) {
            Ok(_) if OPEN.contains(&w.as_str()) => bad.push(format!("{w} (whole now: no longer open)")),
            Ok((files, rows)) => eprintln!("parity {w}: {files} files, {rows} rows whole and split, {} ms", t0.elapsed().as_millis()),
            // a file that states what the plan's `own` does not name breaks the plan: the engine by volumes refuses
            // the world with the same words (and evaluates it whole)
            Err(Gap { said: e, .. }) if e.contains("the plan names what a file states") => {
                let parts = cut(&refs);
                let mut core = Session::fresh(BUDGET);
                core.load_all(&[parts.core.as_str()], None).unwrap();
                let said = core.by_volumes(parts.files).err().map(|e| rofl::describe(&e)).unwrap_or_default();
                let fact = |t: &str| t.split(" is stated by a file").next().unwrap_or_default().rsplit(": ").next().unwrap_or_default().to_string();
                assert!(said.contains("the plan names what a file states"), "{w}: the split is refused and the engine by volumes is not: {e}\n{said}");
                eprintln!("REFUSED {w}, as the engine by volumes refuses it: {} is stated by a file and no `own[fixpointplan]` names it (by volumes: {})", fact(&e), fact(&said));
                refused += 1;
            }
            // OPEN, f_a_pass_above_given_lemmas_misses_a_reader_of_a_nearest: a pass above given lemmas walks
            // `nearest_v[flow]` again, and the nearest is closed until its level while its condition is already
            // given; `ow_fn[lifecycle](X, F) :- updated_by[lifecycle](_, X), nearest_v[flow](F, X)`, monotone and
            // standing above that level, fires from the given binders at the start, meets it closed and is never
            // fired again. The engine's units do not walk it: they read the tree its file settled (the plan's
            // `tree[stageplan](nearest_v, flow)`), and are whole (`the_checked_worlds_by_the_engines_units`). The
            // rows of that rule and those that rest on them are lost, and nothing else is. A world named here
            // that comes whole is a red too: the gap closed, take its name out.
            Err(g) if OPEN.contains(&w.as_str()) && g.more == 0 && g.lost.iter().all(|r| ["ow_fn[lifecycle]", "ow_read_elsewhere[lifecycle]"].contains(&r.as_str())) => {
                eprintln!("OPEN {w}: {}", &g.said[..g.said.len().min(600)]);
                open += 1;
            }
            Err(g) => {
                eprintln!("RED {}", &g.said[..g.said.len().min(900)]);
                bad.push(w.clone());
            }
        }
        ran += 1;
    }
    assert!(ran > 0, "no world of facts/checks.rofl cuts a book");
    eprintln!("parity of the checked worlds: {ran} that cut a book, {refused} of them refused, {open} open");
    assert!(bad.is_empty(), "of {ran} worlds, not the world whole: {bad:?}");
}

/// THE ENGINE'S OWN UNITS, held to the same worlds (`Session::by_volumes`, the path `rofl ask` takes over a corpus):
/// every checked world that cuts a book and names a file is the world whole by them, or refused as the split by the
/// plan refuses it. The four worlds the split by the plan leaves open are whole here: a unit reads a nearest from
/// the tree its file settled, where a pass above given lemmas walks it again and meets it closed.
/// A world to a process, as `rofl ask` is: the units of a second program in one process read the names of the first
/// (f_the_units_of_two_programs_in_one_process_share_their_names), so this test runs itself again for each world.
#[test]
fn the_checked_worlds_by_the_engines_units() {
    if std::env::var("STAGE_PLAN_UNITS").is_ok() {
        for (w, texts) in checked_worlds() {
            let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
            let parts = cut(&refs);
            let mut core = Session::fresh(BUDGET);
            core.load_all(&[parts.core.as_str()], None).unwrap();
            let cuts: Vec<String> = rows(&core.eval.stage_plan_text(), "cuts").into_iter().map(|a| a[0].clone()).collect();
            let files = parts.files.len();
            match core.by_volumes(parts.files) {
                Err(e) if rofl::describe(&e).contains("the plan names what a file states") => println!("UNITS refused {w}"),
                Err(e) => println!("UNITS red {w}: {}", rofl::describe(&e)),
                Ok((vol, _)) => {
                    let mut all = whole(&refs).unwrap_or_else(|e| panic!("{w}: {e}"));
                    let (want, got) = (keys(&all.eval, &cuts), keys(&vol.eval, &cuts));
                    // (held, as the split is, to what the world whole keeps)
                    let more: Vec<&String> = got.difference(&want).filter(|k| kept(&mut all, k)).collect();
                    let lost: Vec<&String> = want.difference(&got).collect();
                    println!("UNITS {} {w}: {files} files, {} rows whole, {} by units, lost {}, more {}; {:?} {:?}", if lost.len() + more.len() == 0 { "whole" } else { "red" }, want.len(), got.len(), lost.len(), more.len(), lost.iter().take(3).collect::<Vec<_>>(), more.iter().take(3).collect::<Vec<_>>());
                }
            }
        }
        return;
    }
    // (the engine goes by units over files: a world of none is evaluated whole)
    let worlds: Vec<String> = checked_worlds().into_iter().filter(|(_, texts)| !cut(&texts.iter().map(String::as_str).collect::<Vec<_>>()).files.is_empty()).map(|x| x.0).collect();
    let said: Vec<String> = std::thread::scope(|s| {
        let runs: Vec<_> = worlds
            .chunks(worlds.len().div_ceil(3).max(1))
            .map(|ws| {
                s.spawn(move || {
                    ws.iter()
                        .map(|w| {
                            let out = std::process::Command::new(std::env::current_exe().unwrap()).args(["the_checked_worlds_by_the_engines_units", "--exact", "--nocapture"]).env("STAGE_PLAN_UNITS", "1").env("STAGE_PLAN_WORLD", w).output().unwrap();
                            let text = String::from_utf8_lossy(&out.stdout).to_string();
                            text.lines().find(|l| l.starts_with("UNITS ")).map(str::to_string).unwrap_or_else(|| format!("UNITS red {w}: no verdict: {}", String::from_utf8_lossy(&out.stderr).lines().rev().take(4).collect::<Vec<_>>().join(" | ")))
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        runs.into_iter().flat_map(|r| r.join().unwrap()).collect()
    });
    for l in &said {
        eprintln!("{l}");
    }
    let count = |k: &str| said.iter().filter(|l| l.starts_with(&format!("UNITS {k} "))).count();
    eprintln!("the engine's units over the checked worlds: {} that cut a book and name a file, {} whole, {} refused, {} open", said.len(), count("whole"), count("refused"), count("red"));
    // OPEN, f_the_units_lose_the_qualified_names_of_the_rust_model: the reader of the units answers
    // `fn_q[rust](F, Q)` with no row where the world whole holds some (a name a rule makes with `concat`), and what
    // rests on it is lost or too many. The split by the plan is whole on these six. One that comes whole is a red.
    let red: Vec<&String> = said.iter().filter(|l| l.starts_with("UNITS red")).filter(|l| !UNITS_OPEN.iter().any(|w| l.starts_with(&format!("UNITS red {w}:")))).collect();
    let closed: Vec<&&str> = UNITS_OPEN.iter().filter(|w| !said.iter().any(|l| l.starts_with(&format!("UNITS red {w}:")))).collect();
    assert!(count("whole") > 0 && red.is_empty() && closed.is_empty(), "by the engine's units, not the world whole: {red:?}; named open and whole now: {closed:?}");
    for w in OPEN {
        assert!(said.iter().any(|l| l.starts_with(&format!("UNITS whole {w}:"))), "{w} is open by the plan's split and whole by the engine's units");
    }
}

/// `rofl serve` GIVES THE PLAN BY ITS `rows`, of a session that loaded the program and no file: the facts of
/// `Eval::stage_plan`, and those at an argument where one is named.
#[test]
fn rofl_serve_gives_the_plan_by_rows() {
    use std::io::{BufRead, BufReader, Write};
    let d = std::env::temp_dir().join(format!("rofl-stage-plan-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let file = d.join("by_file.rofl");
    std::fs::write(&file, BY_FILE).unwrap();
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_rofl")).arg("serve").stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).spawn().unwrap();
    let (mut to, mut from) = (child.stdin.take().unwrap(), BufReader::new(child.stdout.take().unwrap()));
    let mut ask = |req: serde_json::Value| -> serde_json::Value {
        writeln!(to, "{req}").unwrap();
        let mut line = String::new();
        from.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap_or_else(|e| panic!("{e}: {line}"))
    };
    let s = ask(serde_json::json!({"op": "fresh"}))["session"].clone();
    let loaded = ask(serde_json::json!({"op": "load", "session": s, "path": file}));
    assert_eq!(loaded["ok"], true, "{loaded}");
    let mut here = Session::fresh(BUDGET);
    here.load_all(&[BY_FILE], None).unwrap();
    let plan = here.eval.stage_plan_text();
    for rel in ["fires", "gives", "cuts", "own", "layer", "tree"] {
        let got = ask(serde_json::json!({"op": "rows", "session": s, "rel": rel, "persp": "stageplan"}));
        let mut keys: Vec<String> = got["facts"].as_array().unwrap_or_else(|| panic!("{got}")).iter().map(|f| f["key"].as_str().unwrap_or_default().to_string() + ".").collect();
        keys.sort();
        let mut want: Vec<&str> = plan.lines().filter(|l| l.starts_with(&format!("{rel}["))).collect();
        want.sort();
        assert!((!want.is_empty() || rel == "tree") && keys == want, "{rel}: served {keys:?}, the plan {want:?}");
    }
    let across = ask(serde_json::json!({"op": "rows", "session": s, "rel": "fires", "persp": "stageplan", "at": {"1": "across"}}));
    assert_eq!(across["facts"].as_array().map(Vec::len), Some(plan.lines().filter(|l| l.ends_with(",across).")).count()), "{across}");
    // another book of the same relation's name is not the plan
    let other = ask(serde_json::json!({"op": "rows", "session": s, "rel": "fires", "persp": "main"}));
    assert_eq!(other["facts"].as_array().map(Vec::len), Some(0), "{other}");
    drop(to);
    let _ = child.wait();
    let _ = std::fs::remove_dir_all(&d);
}
