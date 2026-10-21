//! A WORLD KEPT ON DISK (docs/cli.md): `rofl ... --kept F` evaluates the world once and keeps it at F; a later run,
//! a new process, answers from F without evaluating, and refuses F, naming what moved, once anything it was kept
//! from has moved (the owner, 2026-10-21: stale is refused, never loaded and never silently evaluated again).
//!
//! Each case is a function that is Ok when the binary does what docs/cli.md says. Built with `--features breaks`,
//! `every_planted_fault_is_seen` switches on each fault planted in the kept path (`brk!("kept_...")`) and requires
//! the cases it names to fail: a check that cannot fail is not one.
//!
//!   cargo test --test kept                      the cases
//!   cargo test --features breaks --test kept    the cases, and each planted fault seen to turn its cases red
use std::path::{Path, PathBuf};
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_rofl");

const RULES: &str = r#"
edb(calls).
edb(down).
calls(a, b).
calls(b, c).
calls(c, zebra).
down(c).
reaches(A, B) :- calls(A, B).
reaches(A, C) :- reaches(A, B), calls(B, C).
live(X) :- reaches(_, X), not down(X).
"#;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap()
}

/// A directory of its own, with boot.rofl and facts/phrases.rofl copied in: a tree, so a `.rofl.md` in it reads
/// its vocabulary from there.
struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let d = std::env::temp_dir().join(format!("rofl-kept-{name}-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("facts")).unwrap();
        std::fs::copy(root().join("boot.rofl"), d.join("boot.rofl")).unwrap();
        std::fs::copy(root().join("facts/phrases.rofl"), d.join("facts/phrases.rofl")).unwrap();
        std::fs::write(d.join("rules.rofl"), RULES).unwrap();
        Dir(d)
    }
    fn p(&self, f: &str) -> String {
        self.0.join(f).to_string_lossy().into_owned()
    }
    fn write(&self, f: &str, text: &str) {
        std::fs::write(self.0.join(f), text).unwrap();
    }
    fn append(&self, f: &str, text: &str) {
        let old = std::fs::read_to_string(self.0.join(f)).unwrap();
        self.write(f, &format!("{old}{text}"));
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct Ran {
    out: String,
    err: String,
    code: i32,
}

/// The binary `bin` in `dir` with `args`, the fault `brk` switched on.
fn rofl_with(bin: &str, dir: &Dir, brk: Option<&str>, args: &[&str]) -> Ran {
    let mut c = Command::new(bin);
    c.args(args).current_dir(&dir.0).env("XDG_CACHE_HOME", dir.0.join("cache")).env_remove("ROFL_BREAK");
    if let Some(b) = brk { c.env("ROFL_BREAK", b); }
    let o = c.output().unwrap();
    Ran { out: String::from_utf8_lossy(&o.stdout).into(), err: String::from_utf8_lossy(&o.stderr).into(), code: o.status.code().unwrap_or(-1) }
}

fn rofl(dir: &Dir, brk: Option<&str>, args: &[&str]) -> Ran {
    rofl_with(BIN, dir, brk, args)
}

fn ensure(ok: bool, what: impl FnOnce() -> String) -> Result<(), String> {
    if ok { Ok(()) } else { Err(what()) }
}

/// The run was answered from the kept world: exit 0 and `want` among the rows.
fn answered(r: &Ran, want: &str, what: &str) -> Result<(), String> {
    ensure(r.code == 0 && r.out.contains(want), || format!("{what}: wanted an answer holding {want:?}, got exit {} out {:?} err {:?}", r.code, r.out, r.err))
}

/// The run refused the kept world as stale, naming `moved`, and printed no answer.
fn stale(r: &Ran, moved: &str, what: &str) -> Result<(), String> {
    ensure(r.code == 2 && r.err.contains("is stale") && r.err.contains(moved) && r.err.contains("--anew") && r.out.is_empty(),
        || format!("{what}: wanted a refusal naming {moved:?}, got exit {} out {:?} err {:?}", r.code, r.out, r.err))
}

/// Keeps the world of boot.rofl and `files` at `w.vol`, answering `reaches(a, X)`.
fn keep(d: &Dir, brk: Option<&str>, files: &[&str]) -> Result<(), String> {
    let mut args = vec!["ask", "reaches(a, X)", "--kept", "w.vol", "boot.rofl"];
    args.extend_from_slice(files);
    let r = rofl(d, brk, &args);
    ensure(r.code == 0 && r.err.contains("kept w.vol"), || format!("keeping: exit {} err {:?}", r.code, r.err))
}

fn ask_kept(d: &Dir, brk: Option<&str>, files: &[&str]) -> Ran {
    let mut args = vec!["ask", "reaches(a, X)", "--kept", "w.vol", "boot.rofl"];
    args.extend_from_slice(files);
    rofl(d, brk, &args)
}

/// From a new process every verb answers from the kept world as from the files, refusals and exit codes included,
/// with the files named and without them.
fn answers_as_fresh(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("same");
    let qs: [&[&str]; 9] = [
        &["ask", "reaches(a, X)"], &["ask", "live(X)"], &["why", "reaches(a, zebra)"], &["why", "--all", "live(b)"],
        &["why", "reaches(zebra, a)"], &["whynot", "live(c)"], &["excise", "calls(b, c)"], &["excise", "reaches(a, b)"],
        &["ask", "reaches(a"],
    ];
    keep(&d, brk, &["rules.rofl"])?;
    for q in qs {
        let fresh = rofl(&d, brk, &[q, &["boot.rofl", "rules.rofl"]].concat());
        for named in [true, false] {
            let mut args = [q, &["--kept", "w.vol"]].concat();
            if named { args.extend(["boot.rofl", "rules.rofl"]); }
            let kept = rofl(&d, brk, &args);
            ensure(kept.out == fresh.out && kept.code == fresh.code, || format!("{q:?} (files named: {named}): fresh {} {:?}, kept {} {:?} {:?}", fresh.code, fresh.out, kept.code, kept.out, kept.err))?;
        }
    }
    Ok(())
}

fn a_rule_file_edited(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("rule");
    keep(&d, brk, &["rules.rofl"])?;
    d.append("rules.rofl", "calls(zebra, yak).\n");
    stale(&ask_kept(&d, brk, &["rules.rofl"]), "rules.rofl changed since it was kept", "an edited rule file")?;
    stale(&rofl(&d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol"]), "rules.rofl changed since it was kept", "an edited rule file, no files named")
}

fn boot_edited(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("boot");
    keep(&d, brk, &["rules.rofl"])?;
    d.append("boot.rofl", "\n-- a line more\n");
    stale(&ask_kept(&d, brk, &["rules.rofl"]), "boot.rofl changed since it was kept", "an edited boot.rofl")
}

const MD: &str = "---\nreads: lib.rofl\n---\n# A world in Markdown\n\n```datalog\nedge_twice(X) :- edge(X, _).\n```\n";

/// A `.rofl.md`, the file its `reads:` names, and the vocabulary of its tree, each edited.
fn markdown_and_what_it_reads(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("md");
    d.write("lib.rofl", "edb(edge).\nedge(p, q).\n");
    d.write("w.rofl.md", MD);
    let ask = |brk| rofl(&d, brk, &["ask", "edge_twice(X)", "--kept", "w.vol", "w.rofl.md"]);
    let r = ask(brk);
    ensure(r.code == 0 && r.out.contains("X = p") && r.err.contains("kept w.vol"), || format!("keeping a .rofl.md: {} {:?} {:?}", r.code, r.out, r.err))?;
    answered(&ask(brk), "X = p", "a .rofl.md kept")?;
    let unchanged = d.0.join("lib.rofl");
    d.append("lib.rofl", "edge(r, s).\n");
    stale(&ask(brk), "lib.rofl changed since it was kept", "the file a .rofl.md reads")?;
    std::fs::write(&unchanged, "edb(edge).\nedge(p, q).\n").unwrap();
    answered(&ask(brk), "X = p", "the file read put back")?;
    d.append("w.rofl.md", "\nMore prose.\n");
    stale(&ask(brk), "w.rofl.md changed since it was kept", "the .rofl.md itself")?;
    d.write("w.rofl.md", MD);
    answered(&ask(brk), "X = p", "the .rofl.md put back")?;
    d.append("facts/phrases.rofl", "\n-- a word more\n");
    stale(&ask(brk), "facts/phrases.rofl changed since it was kept", "the vocabulary of the tree")
}

/// What a scanner named as read, edited; the kept world answers without running the scanner.
fn a_scan_read_edited(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("scan");
    d.write("input", "one");
    d.write("scan.sh", &format!("echo run >> {}\necho '-- reads: input'\necho \"seen($(cat input)).\"\n", d.p("runs")));
    d.write("scan.rofl", "edb(scanner).\nedb(scan_done).\nedb(scan_failed).\nscanner(t, \"sh scan.sh\").\nscan_request(t, \"x\").\n");
    let ask = |brk| rofl(&d, brk, &["ask", "seen(X)", "--kept", "w.vol", "boot.rofl", "scan.rofl"]);
    let runs = || std::fs::read_to_string(d.0.join("runs")).unwrap_or_default().lines().count();
    let r = ask(brk);
    ensure(r.code == 0 && r.out.contains("X = one"), || format!("keeping a scanned world: {} {:?} {:?}", r.code, r.out, r.err))?;
    answered(&ask(brk), "X = one", "a scanned world kept")?;
    ensure(runs() == 1, || format!("the scanner ran {} times, once to keep the world and never to answer from it", runs()))?;
    d.write("input", "two");
    stale(&ask(brk), "input changed since it was kept", "what a scanner read")
}

/// A scanner that names nothing it read leaves a world that could not be told stale: it is not kept.
fn a_blind_scan_is_not_kept(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("blind");
    d.write("scan.rofl", "edb(scanner).\nedb(scan_done).\nedb(scan_failed).\nscanner(t, \"echo\").\nscan_request(t, \"seen(a).\").\n");
    let r = rofl(&d, brk, &["ask", "seen(X)", "--kept", "w.vol", "boot.rofl", "scan.rofl"]);
    ensure(r.code == 2 && r.err.contains("named nothing it read") && !d.0.join("w.vol").exists(), || format!("a blind scan: {} {:?}", r.code, r.err))
}

fn walls_changed(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("walls");
    d.write("other.rofl", "edb(x).\nx(1).\n");
    keep(&d, brk, &["rules.rofl"])?;
    stale(&rofl(&d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol", "--budget", "5000", "boot.rofl", "rules.rofl"]), "--budget 5000", "another budget")?;
    stale(&rofl(&d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol", "--space", "100000", "boot.rofl", "rules.rofl"]), "--space 100000", "a space wall")?;
    stale(&rofl(&d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol", "--strata", "boot.rofl", "rules.rofl"]), "--strata", "the stock evaluator")?;
    stale(&ask_kept(&d, brk, &["rules.rofl", "other.rofl"]), "other.rofl", "another set of files")?;
    // a question's own bounds are not the world's
    answered(&rofl(&d, brk, &["whynot", "live(c)", "--depth", "3", "--kept", "w.vol", "boot.rofl", "rules.rofl"]), "whynot live[main](c)", "a whynot's bounds")
}

/// The same binary by everything but its bytes, as another build is.
fn another_binary(d: &Dir) -> String {
    let p = d.p("rofl-other");
    let mut b = std::fs::read(BIN).unwrap();
    b.extend_from_slice(b"\0another build\0");
    std::fs::write(&p, b).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    p
}

fn the_engine_changed(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("engine");
    let other = another_binary(&d);
    let r = rofl_with(&other, &d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol", "boot.rofl", "rules.rofl"]);
    ensure(r.code == 0 && r.err.contains("kept w.vol"), || format!("keeping with another binary: {} {:?}", r.code, r.err))?;
    answered(&rofl_with(&other, &d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol"]), "X = b", "the binary that kept it")?;
    stale(&ask_kept(&d, brk, &["rules.rofl"]), "the engine changed since it was kept", "another binary")
}

/// A kept file cut short, or with one byte of a name changed, is refused with a sentence: never a crash and never
/// an answer.
fn a_damaged_file(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("damaged");
    keep(&d, brk, &["rules.rofl"])?;
    let w = d.0.join("w.vol");
    let whole = std::fs::read(&w).unwrap();
    let damaged = |r: &Ran, what: &str| ensure(r.code == 2 && r.err.contains("w.vol") && r.out.is_empty(), || format!("{what}: exit {} out {:?} err {:?}", r.code, r.out, r.err));
    std::fs::write(&w, &whole[..whole.len() / 2]).unwrap();
    damaged(&ask_kept(&d, brk, &["rules.rofl"]), "cut in half")?;
    std::fs::write(&w, &whole[..whole.len() - 3]).unwrap();
    damaged(&ask_kept(&d, brk, &["rules.rofl"]), "three bytes short")?;
    let at = whole.windows(5).rposition(|x| x == b"zebra").expect("the name zebra in the volume");
    let mut flipped = whole.clone();
    flipped[at] = b'y';
    std::fs::write(&w, &flipped).unwrap();
    damaged(&ask_kept(&d, brk, &["rules.rofl"]), "a name changed")?;
    std::fs::write(&w, b"not a volume at all").unwrap();
    damaged(&ask_kept(&d, brk, &["rules.rofl"]), "not a volume")
}

/// Touched without a change, or beside a file that changed and was never read, the world is not stale.
fn touched_is_not_stale(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("touch");
    d.write("unrelated.rofl", "edb(u).\nu(1).\n");
    keep(&d, brk, &["rules.rofl"])?;
    let f = std::fs::OpenOptions::new().write(true).open(d.0.join("rules.rofl")).unwrap();
    f.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(3600)).unwrap();
    drop(f);
    d.write("boot.rofl", &std::fs::read_to_string(d.0.join("boot.rofl")).unwrap());
    d.append("unrelated.rofl", "u(2).\n");
    answered(&ask_kept(&d, brk, &["rules.rofl"]), "X = b", "touched, unchanged")
}

/// `--anew` evaluates a stale world again and keeps it; the next question reads it from disk.
fn anew_recomputes(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("anew");
    keep(&d, brk, &["rules.rofl"])?;
    d.append("rules.rofl", "calls(zebra, yak).\n");
    stale(&ask_kept(&d, brk, &["rules.rofl"]), "rules.rofl", "before --anew")?;
    let r = rofl(&d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol", "--anew", "boot.rofl", "rules.rofl"]);
    ensure(r.code == 0 && r.out.contains("X = yak") && r.err.contains("kept w.vol"), || format!("--anew: {} {:?} {:?}", r.code, r.out, r.err))?;
    let r = ask_kept(&d, brk, &["rules.rofl"]);
    ensure(r.code == 0 && r.out.contains("X = yak") && !r.err.contains("kept w.vol"), || format!("after --anew: {} {:?} {:?}", r.code, r.out, r.err))?;
    // with no files named, --anew evaluates the files the kept world was kept from
    d.append("rules.rofl", "calls(yak, gnu).\n");
    let r = rofl(&d, brk, &["ask", "reaches(a, X)", "--kept", "w.vol", "--anew"]);
    ensure(r.code == 0 && r.out.contains("X = gnu"), || format!("--anew, no files: {} {:?} {:?}", r.code, r.out, r.err))
}

/// A world that keeps no witness refuses a why from disk as it does fresh; a world with a cone refuses outside it;
/// a negation unfolded at a call reads what a hole left unknown from disk as it does fresh.
fn sealed_cone_and_holes_as_fresh(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("sealed");
    d.write("sealed.rofl", &format!("sealed(provenance).\n{RULES}"));
    d.write("cone.rofl", &std::fs::read_to_string(root().join("examples/checks/asks-outside.rofl")).unwrap());
    d.write("holes.rofl", &std::fs::read_to_string(root().join("examples/checks/demand-neg-hole.rofl")).unwrap());
    for (file, qs) in [
        ("sealed.rofl", vec![["why", "reaches(a, c)"], ["ask", "reaches(a, X)"], ["whynot", "live(c)"]]),
        ("cone.rofl", vec![["ask", "ot_a(X, N)"], ["ask", "ot_b(X)"], ["whynot", "ot_b(1)"], ["excise", "ot_src(1)"]]),
        ("holes.rofl", vec![["ask", "dh_h(X, Y)"], ["ask", "dh_r(X)"], ["whynot", "dh_r(c)"]]),
    ] {
        let vol = format!("{file}.vol");
        for q in qs {
            let fresh = rofl(&d, brk, &[&q[..], &["boot.rofl", file]].concat());
            let kept = rofl(&d, brk, &[&q[..], &["--kept", &vol, "boot.rofl", file]].concat());
            let again = rofl(&d, brk, &[&q[..], &["--kept", &vol]].concat());
            for (k, which) in [(&kept, "keeping"), (&again, "from disk")] {
                ensure(k.out == fresh.out && k.code == fresh.code, || format!("{file} {q:?} {which}: fresh {} {:?}, kept {} {:?} {:?}", fresh.code, fresh.out, k.code, k.out, k.err))?;
            }
        }
    }
    Ok(())
}

type Case = fn(Option<&str>) -> Result<(), String>;

const CASES: [(&str, Case); 12] = [
    ("answers_as_fresh", answers_as_fresh),
    ("a_rule_file_edited", a_rule_file_edited),
    ("boot_edited", boot_edited),
    ("markdown_and_what_it_reads", markdown_and_what_it_reads),
    ("a_scan_read_edited", a_scan_read_edited),
    ("a_blind_scan_is_not_kept", a_blind_scan_is_not_kept),
    ("walls_changed", walls_changed),
    ("the_engine_changed", the_engine_changed),
    ("a_damaged_file", a_damaged_file),
    ("touched_is_not_stale", touched_is_not_stale),
    ("anew_recomputes", anew_recomputes),
    ("sealed_cone_and_holes_as_fresh", sealed_cone_and_holes_as_fresh),
];

#[cfg(feature = "breaks")]
fn case(name: &str) -> Case {
    CASES.iter().find(|c| c.0 == name).unwrap().1
}

/// What a hole left unknown is kept by an image as by a volume: a negation unfolded at a call reads it after opening.
#[test]
fn a_holes_unknowns_survive_an_image_and_a_volume() {
    use rofl::session::Session;
    let text = std::fs::read_to_string(root().join("examples/checks/demand-neg-hole.rofl")).unwrap();
    let mut s = Session::fresh(200_000_000);
    s.load(&std::fs::read_to_string(root().join("boot.rofl")).unwrap(), None).unwrap();
    s.load(&text, None).unwrap();
    s.evaluate().unwrap();
    let rows = |s: &mut Session| s.ask("dh_h(X, Y)").unwrap().rows;
    let want = rows(&mut s);
    assert!(!want.iter().any(|r| r[0] == "c"), "dh_h(c, _) is a shrug, never a row: {want:?}");
    let image = s.keep();
    let path = std::env::temp_dir().join(format!("rofl-kept-holes-{}.vol", std::process::id()));
    s.keep_volume(path.to_str().unwrap()).unwrap();
    let mut from_image = Session::open_kept(&image, 200_000_000).unwrap();
    let mut from_volume = Session::open_volume(path.to_str().unwrap(), 200_000_000).unwrap();
    std::fs::remove_file(&path).unwrap();
    assert_eq!(rows(&mut from_image), want, "from a kept image");
    assert_eq!(rows(&mut from_volume), want, "from a volume");
}

#[test]
fn a_kept_world_answers_and_refuses_as_docs_cli_says() {
    let bad: Vec<String> = CASES.iter().filter_map(|(name, f)| f(None).err().map(|e| format!("{name}: {e}"))).collect();
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

/// Each planted fault, and the cases that must fail under it.
#[cfg(feature = "breaks")]
#[test]
fn every_planted_fault_is_seen() {
    let plants: [(&str, &[&str]); 9] = [
        ("volume_unknowns_dropped", &["sealed_cone_and_holes_as_fresh"]),
        ("kept_stale_files", &["a_rule_file_edited", "boot_edited", "markdown_and_what_it_reads", "a_scan_read_edited"]),
        ("kept_md_unread", &["markdown_and_what_it_reads"]),
        ("kept_scans_unread", &["a_scan_read_edited"]),
        ("kept_stale_args", &["walls_changed"]),
        ("kept_stale_engine", &["the_engine_changed"]),
        ("kept_unsummed", &["a_damaged_file"]),
        ("kept_stamp_mtime", &["touched_is_not_stale"]),
        ("kept_blind_scans", &["a_blind_scan_is_not_kept"]),
    ];
    let mut unseen = Vec::new();
    for (id, cases) in plants {
        for c in cases {
            if case(c)(Some(id)).is_ok() { unseen.push(format!("{id}: {c} stayed green")); }
        }
    }
    assert!(unseen.is_empty(), "planted faults no case saw:\n{}", unseen.join("\n"));
}
