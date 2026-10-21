//! A WORLD KEPT ON DISK (docs/cli.md): `rofl ... --kept F` evaluates the world once and keeps it at F; a later run,
//! a new process, answers from F without evaluating, and refuses F, naming what moved, once anything it was kept
//! from has moved (the owner, 2026-10-21: stale is refused, never loaded and never silently evaluated again).
//!
//! Each case is a function that is Ok when the binary does what docs/cli.md says, and names itself where it fails.
//! The faults planted in the kept path (`brk!("kept_...")`, `volume_unknowns_dropped`) are switched on one at a
//! time by scripts/agg_breaks.ts, which requires the cases it names to fail: a check that cannot fail is not one.
//!
//!   cargo test --test kept                                    the cases
//!   npm run test:agg:breaks -- kept_stale_files ...           each planted fault seen to turn its cases red
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
    rofl_in(bin, dir, &dir.0.join("cache"), brk, args)
}

/// The binary `bin` in `dir` with `args`, its cache under `cache`.
fn rofl_in(bin: &str, dir: &Dir, cache: &Path, brk: Option<&str>, args: &[&str]) -> Ran {
    rofl_env(bin, dir, cache, &[], brk, args)
}

fn rofl_env(bin: &str, dir: &Dir, cache: &Path, env: &[(&str, String)], brk: Option<&str>, args: &[&str]) -> Ran {
    let mut c = Command::new(bin);
    c.args(args).current_dir(&dir.0).env("XDG_CACHE_HOME", cache).env_remove("ROFL_BREAK").env_remove("ROFL_CACHE_GB").envs(env.iter().map(|(k, v)| (*k, v)));
    if let Some(b) = brk { c.env("ROFL_BREAK", b); }
    let o = c.output().unwrap();
    Ran { out: String::from_utf8_lossy(&o.stdout).into(), err: String::from_utf8_lossy(&o.stderr).into(), code: o.status.code().unwrap_or(-1) }
}

fn rofl(dir: &Dir, brk: Option<&str>, args: &[&str]) -> Ran {
    rofl_with(BIN, dir, brk, args)
}

/// The run computed from the files: a cache of its own, empty.
fn fresh(dir: &Dir, brk: Option<&str>, args: &[&str]) -> Ran {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    rofl_in(BIN, dir, &dir.0.join(format!("fresh-{n}")), brk, args)
}

/// The kept worlds the question verbs keep by themselves under `cache`, each by its file's identity.
fn implicit(cache: &Path) -> Vec<(PathBuf, u64)> {
    use std::os::unix::fs::MetadataExt;
    let Ok(rd) = std::fs::read_dir(cache.join("rofl/worlds")) else { return Vec::new() };
    let mut v: Vec<(PathBuf, u64)> = rd.flatten().filter(|e| e.path().extension().is_some_and(|x| x == "vol")).map(|e| (e.path(), e.metadata().unwrap().ino())).collect();
    v.sort();
    v
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
        let fresh = fresh(&d, brk, &[q, &["boot.rofl", "rules.rofl"]].concat());
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
            let fresh = fresh(&d, brk, &[&q[..], &["boot.rofl", file]].concat());
            let kept = rofl(&d, brk, &[&q[..], &["--kept", &vol, "boot.rofl", file]].concat());
            let again = rofl(&d, brk, &[&q[..], &["--kept", &vol]].concat());
            for (k, which) in [(&kept, "keeping"), (&again, "from disk")] {
                ensure(k.out == fresh.out && k.code == fresh.code, || format!("{file} {q:?} {which}: fresh {} {:?}, kept {} {:?} {:?}", fresh.code, fresh.out, k.code, k.out, k.err))?;
            }
        }
    }
    Ok(())
}

/// A question verb keeps its world by itself: the second run of a question is answered from it, the file kept by the
/// first untouched; an edited source is said in one line and computed anew, the answer the new one.
fn a_verb_keeps_its_world_by_itself(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit");
    let cache = d.0.join("cache");
    let ask = |brk| rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]);
    let first = ask(brk);
    let kept = implicit(&cache);
    ensure(first.code == 0 && first.out.contains("X = zebra") && kept.len() == 1, || format!("first run: {} {:?} {:?}, kept {kept:?}", first.code, first.out, first.err))?;
    let second = ask(brk);
    ensure(second.out == first.out && second.code == 0 && second.err.is_empty() && implicit(&cache) == kept,
        || format!("second run, wanted the kept world as it was: {} {:?} {:?}, kept {:?} then {kept:?}", second.code, second.out, second.err, implicit(&cache)))?;
    d.append("rules.rofl", "calls(zebra, yak).\n");
    let third = ask(brk);
    ensure(third.code == 0 && third.out.contains("X = yak") && third.err.contains("took 1 file by delta: rules.rofl") && implicit(&cache) != kept,
        || format!("after an edit: {} {:?} {:?}", third.code, third.out, third.err))?;
    let fourth = ask(brk);
    ensure(fourth.out == third.out && fourth.err.is_empty(), || format!("after the edit, again: {:?} {:?}", fourth.out, fourth.err))
}

/// Walls are part of a kept world's name: the same files under another budget are another world, computed as such.
fn walls_name_another_world(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-walls");
    let q = |b: &str| ["ask", "reaches(a, X)", "--budget", b, "boot.rofl", "rules.rofl"].map(String::from);
    let cut = ["10", "50", "200", "1000"].into_iter().find(|b| fresh(&d, brk, &q(b).iter().map(String::as_str).collect::<Vec<_>>()).code == 5)
        .ok_or("no budget cuts this world, so the test could not tell walls apart")?;
    rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]);
    let args = q(cut);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let (want, got) = (fresh(&d, brk, &args), rofl(&d, brk, &args));
    ensure(got.code == want.code && got.out == want.out, || format!("--budget {cut} after the default budget: fresh {} {:?}, got {} {:?}", want.code, want.out, got.code, got.out))
}

/// A sealed world kept by itself answers a why from disk as it does fresh: a firing solved again, or a refusal.
fn a_sealed_world_kept_by_itself_whys_as_fresh(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-sealed");
    d.write("sealed.rofl", &format!("sealed(provenance).\n{RULES}"));
    let args = ["why", "reaches(a, c)", "boot.rofl", "sealed.rofl"];
    let want = fresh(&d, brk, &args);
    rofl(&d, brk, &args);
    let got = rofl(&d, brk, &args);
    ensure(got.code == want.code && got.out == want.out && implicit(&d.0.join("cache")).len() == 1,
        || format!("sealed why: fresh {} {:?}, from the kept world {} {:?}", want.code, want.out, got.code, got.out))
}

/// A cache that cannot be written is said on stderr and the question answered all the same.
fn an_unwritable_cache_still_answers(brk: Option<&str>) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let d = Dir::new("implicit-ro");
    let cache = d.0.join("ro");
    std::fs::create_dir_all(&cache).unwrap();
    std::fs::set_permissions(&cache, std::fs::Permissions::from_mode(0o500)).unwrap();
    let r = rofl_in(BIN, &d, &cache, brk, &["ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]);
    std::fs::set_permissions(&cache, std::fs::Permissions::from_mode(0o700)).unwrap();
    ensure(r.code == 0 && r.out.contains("X = zebra") && r.err.contains("the world is not kept"), || format!("unwritable cache: {} {:?} {:?}", r.code, r.out, r.err))
}

/// `rofl load` and `rofl serve` never read nor write what the verbs keep: a gate computes.
fn load_and_serve_keep_nothing(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-load");
    let cache = d.0.join("cache");
    rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]);
    let kept = implicit(&cache);
    d.append("rules.rofl", "calls(zebra, yak).\n");
    let r = rofl(&d, brk, &["load", "--ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]);
    ensure(r.code == 0 && r.out.contains("X = yak") && r.err.is_empty() && implicit(&cache) == kept, || format!("rofl load: {} {:?} {:?}", r.code, r.out, r.err))?;
    let mut c = Command::new(BIN);
    c.arg("serve").current_dir(&d.0).env("XDG_CACHE_HOME", d.0.join("serve-cache")).env_remove("ROFL_BREAK");
    if let Some(b) = brk { c.env("ROFL_BREAK", b); }
    let mut p = c.stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).spawn().unwrap();
    {
        use std::io::Write;
        let mut i = p.stdin.take().unwrap();
        for l in [r#"{"op":"fresh"}"#.to_string(), format!(r#"{{"op":"load","session":1,"path":"{}"}}"#, d.p("rules.rofl")), r#"{"op":"evaluate","session":1}"#.into(), r#"{"op":"ask","session":1,"query":"reaches(a, X)"}"#.into()] {
            writeln!(i, "{l}").unwrap();
        }
    }
    let o = p.wait_with_output().unwrap();
    ensure(String::from_utf8_lossy(&o.stdout).contains("yak") && !d.0.join("serve-cache").exists(), || "rofl serve kept a world, or did not answer".into())
}

/// The cap (`ROFL_CACHE_GB`) is hard: a world larger than it is answered and not kept, said on stderr; a world that
/// fits takes the place of the older ones it pushes over.
fn the_cache_cap_is_hard(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-cap");
    let cache = d.0.join("cache");
    let gb = |bytes: f64| vec![("ROFL_CACHE_GB", format!("{}", bytes / (1u64 << 30) as f64))];
    let ask = |file: &str, env: &[(&str, String)]| rofl_env(BIN, &d, &cache, env, brk, &["ask", "reaches(a, X)", "boot.rofl", file]);
    let tiny = ask("rules.rofl", &gb(1000.0));
    ensure(tiny.code == 0 && tiny.out.contains("X = zebra") && tiny.err.contains("larger than") && implicit(&cache).is_empty(),
        || format!("a cap smaller than the world: {} {:?} {:?}, kept {:?}", tiny.code, tiny.out, tiny.err, implicit(&cache)))?;
    let first = ask("rules.rofl", &[]);
    let kept = implicit(&cache);
    ensure(first.code == 0 && kept.len() == 1, || format!("the default cap: {:?} kept {kept:?}", first.err))?;
    let size = std::fs::metadata(&kept[0].0).unwrap().len() as f64;
    d.write("other.rofl", &format!("{RULES}calls(zebra, yak).\n"));
    let second = ask("other.rofl", &gb(size * 1.5));
    let now = implicit(&cache);
    ensure(second.code == 0 && second.out.contains("X = yak") && now.len() == 1 && now[0].0 != kept[0].0,
        || format!("two worlds over the cap, wanted the older gone: {:?}, kept {now:?}", second.err))
}

/// Every file in the directory the verbs keep their worlds in, with its size.
fn files_in(cache: &Path) -> Vec<(String, u64)> {
    let Ok(rd) = std::fs::read_dir(cache.join("rofl/worlds")) else { return Vec::new() };
    let mut v: Vec<(String, u64)> = rd.flatten().map(|e| (e.file_name().to_string_lossy().into_owned(), e.metadata().map_or(0, |m| m.len()))).collect();
    v.sort();
    v
}

/// Cold runs of one question at once each write under a name of their own: all answer alike and quietly, one world
/// is kept and nothing else is left, and the next run is answered from it.
fn concurrent_cold_runs_keep_one_world(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-concurrent");
    let cache = d.0.join("cache");
    let runs: Vec<Ran> = std::thread::scope(|sc| {
        let hs: Vec<_> = (0..8).map(|_| sc.spawn(|| rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]))).collect();
        hs.into_iter().map(|h| h.join().unwrap()).collect()
    });
    for r in &runs {
        ensure(r.code == 0 && r.out == runs[0].out && r.err.is_empty(), || format!("a cold run among eight: {} {:?} {:?}", r.code, r.out, r.err))?;
    }
    let left = files_in(&cache);
    ensure(left.len() == 1 && left[0].0.ends_with(".vol"), || format!("eight cold runs left {left:?}"))?;
    let kept = implicit(&cache);
    let next = rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "rules.rofl"]);
    ensure(next.out == runs[0].out && next.err.is_empty() && implicit(&cache) == kept, || format!("the run after: {:?} {:?}", next.out, next.err))
}

/// A world over the cap is never written past the cap: the writer stops at it, watched while the run writes.
fn the_writer_stops_at_the_cap(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-bound");
    let cache = d.0.join("cache");
    let facts: String = (0..60_000).map(|i| format!("big({i}, \"a fact of some length to fill the volume {i}\").\n")).collect();
    d.write("big.rofl", &format!("edb(big).\n{facts}"));
    let cap: u64 = 1 << 20;
    let done = std::sync::atomic::AtomicBool::new(false);
    let (r, most) = std::thread::scope(|sc| {
        let watch = sc.spawn(|| {
            let mut most = 0u64;
            while !done.load(std::sync::atomic::Ordering::Relaxed) {
                most = most.max(files_in(&cache).iter().map(|f| f.1).max().unwrap_or(0));
                std::thread::sleep(std::time::Duration::from_micros(200));
            }
            most
        });
        let env = [("ROFL_CACHE_GB", format!("{}", cap as f64 / (1u64 << 30) as f64))];
        let r = rofl_env(BIN, &d, &cache, &env, brk, &["ask", "big(1, X)", "boot.rofl", "big.rofl"]);
        done.store(true, std::sync::atomic::Ordering::Relaxed);
        (r, watch.join().unwrap())
    });
    ensure(r.code == 0 && r.out.contains("X = ") && r.err.contains("larger than") && files_in(&cache).is_empty() && most <= cap,
        || format!("a world over a 1 MB cap: {} {:?} {:?}, the largest file seen {most} bytes, left {:?}", r.code, r.out, r.err, files_in(&cache)))
}

/// A source gone since the world was kept is said missing, not computed anew.
fn a_missing_source_is_said_missing(brk: Option<&str>) -> Result<(), String> {
    let d = Dir::new("implicit-missing");
    d.write("other.rofl", RULES);
    rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "other.rofl"]);
    std::fs::remove_file(d.0.join("other.rofl")).unwrap();
    let r = rofl(&d, brk, &["ask", "reaches(a, X)", "boot.rofl", "other.rofl"]);
    ensure(r.code != 0 && r.err.contains("other.rofl is missing") && !r.err.contains("computed anew"), || format!("a source gone: {} {:?}", r.code, r.err))
}

type Case = fn(Option<&str>) -> Result<(), String>;

const CASES: [(&str, Case); 21] = [
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
    ("a_verb_keeps_its_world_by_itself", a_verb_keeps_its_world_by_itself),
    ("walls_name_another_world", walls_name_another_world),
    ("a_sealed_world_kept_by_itself_whys_as_fresh", a_sealed_world_kept_by_itself_whys_as_fresh),
    ("an_unwritable_cache_still_answers", an_unwritable_cache_still_answers),
    ("load_and_serve_keep_nothing", load_and_serve_keep_nothing),
    ("the_cache_cap_is_hard", the_cache_cap_is_hard),
    ("concurrent_cold_runs_keep_one_world", concurrent_cold_runs_keep_one_world),
    ("the_writer_stops_at_the_cap", the_writer_stops_at_the_cap),
    ("a_missing_source_is_said_missing", a_missing_source_is_said_missing),
];

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

/// JS SOURCES BY DELTA: a world that scans its JS (the scanner of scanners/cli.ts, the model of rules/js.files) kept
/// by a question; an edit of one source scans that file again alone and the world takes it by delta; an import
/// added asks for a file no scan had, scanned and taken; the import taken away again lets that scan go. Each step's
/// answer and state are a fresh run's. (The JS model in a debug build is too slow for a test: optimised builds only.)
#[test]
fn js_sources_edited_go_by_delta() {
    if cfg!(debug_assertions) {
        return;
    }
    let planted = std::env::var("ROFL_BREAK").ok().filter(|b| !b.is_empty());
    let brk = planted.as_deref();
    let d = Dir::new("js-sources");
    std::fs::create_dir_all(d.0.join("src/lib")).unwrap();
    for f in ["main.js", "lib/greet.js", "lib/shout.js", "lib/unused.js"] {
        std::fs::copy(root().join("examples/scan/src").join(f), d.0.join("src").join(f)).unwrap();
    }
    let cli = root().join("scanners/cli.ts");
    d.write("scan.rofl", &format!("edb(scanner).\nedb(scan_done).\nedb(scan_failed).\nscanner(js, \"node --experimental-strip-types {} src\").\nscan_request(js, \"main.js\").\nscan_request(js, F) :- depends[code](_, F).\n", cli.display()));
    let model = format!("@{}", root().join("rules/js.files").display());
    let q = ["ask", "calls(A, B)", "--state", &model, "scan.rofl"];
    let step = |what: &str, want_delta: Option<&str>| -> Result<(), String> {
        let got = rofl(&d, brk, &q);
        let fresh = fresh(&d, brk, &["load", "--ask", "calls(A, B)", "--state", &model, "scan.rofl"]);
        ensure(got.code == fresh.code && got.out == fresh.out, || format!("{what}: from the kept world {} lines, fresh {} lines, exit {} and {}; {:?}", got.out.lines().count(), fresh.out.lines().count(), got.code, fresh.code, got.err))?;
        if let Some(w) = want_delta {
            ensure(got.err.contains("by delta") && got.err.contains(w), || format!("{what}: wanted a delta taking {w:?}, got {:?}", got.err))?;
        }
        Ok(())
    };
    step("kept", None).and_then(|_| {
        d.append("src/lib/shout.js", "export function whisper(s) { return s.toLowerCase(); }\n");
        step("shout.js edited", Some("lib/shout.js (scanned again)"))
    }).and_then(|_| {
        d.write("src/lib/greet.js", "import { shout } from './shout.js';\nimport { quiet } from './unused.js';\nexport function greet(name) { return quiet(shout(`hello ${name}`)); }\n");
        step("an import of unused.js added", Some("lib/unused.js (scanned)"))
    }).and_then(|_| {
        std::fs::copy(root().join("examples/scan/src/lib/greet.js"), d.0.join("src/lib/greet.js")).unwrap();
        step("the import taken away", Some("lib/unused.js (no longer asked)"))
    }).unwrap_or_else(|e| panic!("{e}"));
}

#[test]
fn a_kept_world_answers_and_refuses_as_docs_cli_says() {
    // a fault planted by scripts/agg_breaks.ts reaches every binary a case runs
    let planted = std::env::var("ROFL_BREAK").ok().filter(|b| !b.is_empty());
    let bad: Vec<String> = CASES.iter().filter_map(|(name, f)| f(planted.as_deref()).err().map(|e| format!("{name}: {e}"))).collect();
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

