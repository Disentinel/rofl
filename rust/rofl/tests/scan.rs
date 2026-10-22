//! A WORLD THAT ASKS FOR ITS OWN INPUT (docs/cli.md): `scan_request(Kind, Path)` runs `scanner(Kind, Command)` with the
//! path as its last argument and loads what it prints, until the world asks for nothing more. A script that names
//! itself as its code and prints its argument stands in for a scanner here: the path it is given is the clause it
//! prints.
//!
//! A SCAN NAMES ITS CODE: `the_storeroom_of_scans_holds_to_the_scanners_code` holds the contract case by case, each
//! naming itself where it fails; the faults planted in it (`brk!("scan_...")`) are switched on one at a time by
//! scripts/agg_breaks.ts, which requires the cases it names to fail.
use rofl::session::Session;
use std::path::{Path, PathBuf};

/// `sh ECHO`: prints its code and then its argument.
fn echo() -> String {
    static E: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    E.get_or_init(|| {
        let d = std::env::temp_dir().join(format!("rofl-scan-echo-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let p = d.join("echo.sh");
        std::fs::write(&p, "echo \"-- code: $0\"\necho \"$1\"\n").unwrap();
        format!("sh {}", p.display())
    }).clone()
}

fn world(src: &str) -> Result<Session, String> {
    let mut s = Session::fresh(1_000_000);
    s.load(&src.replace("ECHO", &echo()), None).map_err(|d| d.join("; "))?;
    s.evaluate().map_err(|h| rofl::describe(&h))?;
    Ok(s)
}

fn evaluated(src: &str) -> Session {
    world(src).expect("evaluate")
}

#[test]
fn what_a_scan_brings_in_asks_for_the_next() {
    let mut s = evaluated(r#"
scanner(t, "ECHO").
scan_request(t, "seen(a).").
scan_request(t, "seen(b).") :- seen(a).
scan_request(t, "seen(c).") :- seen(b).
"#);
    for k in ["seen(a)", "seen(b)", "seen(c)"] { assert!(s.holds(k).unwrap(), "{k}"); }
    assert!(s.holds(r#"scan_done(t, "seen(c).", 1)"#).unwrap());
    // each request runs once: evaluating again asks for nothing
    assert_eq!(s.scan_requests().unwrap(), 0);
}

#[test]
fn a_request_no_scanner_answers_is_a_fact_and_not_a_halt() {
    let mut s = evaluated(r#"scan_request(u, "x.js")."#);
    let a = s.ask(r#"scan_failed(u, "x.js", M)"#).unwrap();
    assert_eq!(a.rows, vec![vec!["\"no scanner(Kind, Command) for this kind\"".to_string()]]);
    let mut s = evaluated("scanner(t, \"false\").\nscan_request(t, \"y\").");
    assert_eq!(s.ask(r#"scan_failed(t, "y", M)"#).unwrap().rows.len(), 1);
}

#[test]
fn a_scanners_rules_are_loaded_like_its_facts() {
    let mut s = evaluated(r#"
scanner(t, "ECHO").
base(1).
scan_request(t, "twice(X) :- base(X).").
"#);
    assert!(s.holds("twice(1)").unwrap());
}

fn ensure(ok: bool, why: impl FnOnce() -> String) -> Result<(), String> {
    if ok { Ok(()) } else { Err(why()) }
}

/// A directory with a scanner of two files, `scan.sh` and the `lib.sh` it reads in, which names both as its code
/// and `input` as what it read, prints `seen(INPUT, VERSION).` and counts its runs in `runs`.
struct Scan(PathBuf);

impl Scan {
    fn new(name: &str) -> Scan {
        let d = std::env::temp_dir().join(format!("rofl-scan-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let s = Scan(d);
        s.write("input", "one");
        s.write("lib.sh", "VERSION=v1\n");
        s.write("scan.sh", &format!("D={}\necho \"-- code: $D/scan.sh\"\necho \"-- code: $D/lib.sh\"\necho \"-- reads: $D/input\"\n. $D/lib.sh\necho \"seen($(cat $D/input), $VERSION).\"\necho \"entry(e1).\"\necho run >> $D/runs\n", s.0.display()));
        s
    }
    fn write(&self, f: &str, text: &str) {
        std::fs::write(self.0.join(f), text).unwrap();
    }
    fn edit(&self, f: &str, from: &str, to: &str) {
        let t = std::fs::read_to_string(self.0.join(f)).unwrap();
        self.write(f, &t.replace(from, to));
    }
    fn world(&self) -> String {
        format!("scanner(t, \"sh {}\").\nscan_request(t, \"x\").", self.0.join("scan.sh").display())
    }
    fn runs(&self) -> usize {
        std::fs::read_to_string(self.0.join("runs")).unwrap_or_default().lines().count()
    }
    /// The world evaluated, and what it holds of `seen` and `entry`.
    fn seen(&self) -> Result<Vec<Vec<String>>, String> {
        let mut s = world(&self.world())?;
        let mut rows = s.ask("seen(I, V)").map_err(|e| e)?.rows;
        rows.extend(s.ask("entry(E)").map_err(|e| e)?.rows);
        Ok(rows)
    }
}

impl Drop for Scan {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn row(xs: &[&str]) -> Vec<String> {
    xs.iter().map(|x| x.to_string()).collect()
}

/// What the scanner read changes: the kept scan is stale and runs again; unchanged, it is answered kept.
fn kept_until_what_it_read_changes() -> Result<(), String> {
    let d = Scan::new("reads");
    ensure(d.seen()?[0] == row(&["one", "v1"]), || "the first scan".into())?;
    ensure(d.seen()?[0] == row(&["one", "v1"]), || "the kept scan".into())?;
    ensure(d.runs() == 1, || format!("the scanner ran {} times for one input, once wanted", d.runs()))?;
    d.write("input", "two");
    ensure(d.seen()?[0] == row(&["two", "v1"]), || "the input changed and the old scan was answered".into())?;
    ensure(d.runs() == 2, || format!("ran {} times", d.runs()))
}

/// Unchanged scanner, unchanged input: answered from the storeroom, the scanner not run (the positive control).
fn unchanged_is_a_hit() -> Result<(), String> {
    let d = Scan::new("hit");
    d.seen()?;
    let t0 = std::time::Instant::now();
    let rows = d.seen()?;
    let took = t0.elapsed();
    ensure(rows[0] == row(&["one", "v1"]) && d.runs() == 1, || format!("an unchanged scan ran again: {} runs", d.runs()))?;
    eprintln!("unchanged_is_a_hit: the kept scan answered in {} us", took.as_micros());
    Ok(())
}

/// The scanner's entry file edited: every kept scan by it is stale, and the answer is the new code's.
fn the_entry_edited() -> Result<(), String> {
    let d = Scan::new("entry");
    d.seen()?;
    d.edit("scan.sh", "entry(e1)", "entry(e2)");
    let rows = d.seen()?;
    ensure(rows.contains(&row(&["e2"])) && !rows.contains(&row(&["e1"])), || format!("the entry was edited and the old scan answered: {rows:?}"))?;
    ensure(d.runs() == 2, || format!("ran {} times", d.runs()))
}

/// A file the scanner reads in, not its entry, edited: stale all the same; and an edit of a comment alone is one.
fn a_module_edited() -> Result<(), String> {
    let d = Scan::new("module");
    d.seen()?;
    d.write("lib.sh", "VERSION=v2\n");
    ensure(d.seen()?[0] == row(&["one", "v2"]), || "a module of the scanner was edited and the old scan answered".into())?;
    d.write("lib.sh", "# a comment\nVERSION=v2\n");
    d.seen()?;
    ensure(d.runs() == 3, || format!("a comment edited: {} runs, 3 wanted (it is code, and its bytes moved)", d.runs()))
}

/// A scanner that names none of its code is refused, with the sentence; one that names a file not there, too.
fn no_code_is_refused() -> Result<(), String> {
    let d = Scan::new("nocode");
    d.write("scan.sh", &format!("echo \"-- reads: {}/input\"\necho \"seen(a, b).\"\n", d.0.display()));
    match d.seen() {
        Err(e) if e.contains("named none of its own code") && e.contains("scan.sh") => {}
        r => return Err(format!("a scan naming no code: {r:?}")),
    }
    d.write("scan.sh", &format!("echo \"-- code: {}/gone.sh\"\necho \"seen(a, b).\"\n", d.0.display()));
    match d.seen() {
        Err(e) if e.contains("gone.sh") && e.contains("no such file") => Ok(()),
        r => Err(format!("a scan naming code not there: {r:?}")),
    }
}

/// The scanner's code changed while a world was scanned (a session that asks again): the world would hold facts
/// of two versions, and is refused, naming the file.
fn two_versions_in_one_world() -> Result<(), String> {
    let d = Scan::new("mixed");
    let mut s = world(&d.world())?;
    d.write("lib.sh", "VERSION=v2\n");
    s.load("scan_request(t, \"y\").", None).map_err(|e| e.join("; "))?;
    match s.evaluate() {
        Err(h) if rofl::describe(&h).contains("two versions of the scanner `t`") && rofl::describe(&h).contains("lib.sh") => Ok(()),
        Err(h) => Err(format!("refused, but not for two versions: {}", rofl::describe(&h))),
        Ok(_) => Err(format!("a world holds two versions of a scanner: {:?}", s.ask("seen(I, V)").map(|a| a.rows))),
    }
}

/// `why` of a scanned fact names the scanner and the sum of its code, and the sum moves with the code.
fn why_names_the_scanner() -> Result<(), String> {
    let d = Scan::new("why");
    let sign = |d: &Scan, v: &str| -> Result<String, String> {
        let mut s = world(&d.world())?;
        let w = s.why(&format!("seen(one, {v})"))?;
        let at = w.find("brought in by the scanner `t`, code ").ok_or_else(|| format!("why names no scanner: {w}"))?;
        ensure(w.contains("scan.sh") && w.contains("lib.sh"), || format!("why names not the code's files: {w}"))?;
        Ok(w[at..].split_whitespace().nth(7).unwrap_or("").to_string())
    };
    let one = sign(&d, "v1")?;
    d.write("lib.sh", "VERSION=v2\n");
    let two = sign(&d, "v2")?;
    ensure(one.len() == 16 && two.len() == 16 && one != two, || format!("the code's sum did not move with it: {one} then {two}"))?;
    let mut s = world("edb(p).\np(a).")?;
    let w = s.why("p(a)")?;
    ensure(!w.contains("brought in"), || format!("a fact no scan brought names a scanner: {w}"))
}

/// THE #85 INCIDENT: scanners/js_ast.ts from before #85 in a scratch copy of the scanner, a scan, the current
/// js_ast.ts put in its place (a module of the scanner, not its entry), a scan with the same storeroom: the current
/// scanner's facts, as an empty storeroom gives them, not the old ones.
fn the_85_incident(cache: &Path) -> Result<(), String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap();
    let old = std::process::Command::new("git").args(["show", "19eb2c41^:scanners/js_ast.ts"]).current_dir(&root).output().map_err(|e| e.to_string())?;
    if !old.status.success() {
        eprintln!("the_85_incident: not run, git has not 19eb2c41 (a shallow clone)");
        return Ok(());
    }
    // under target/, so node finds the repository's node_modules above it
    let d = Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("scan-85-{}", std::process::id()));
    let sc = d.join("scanners");
    std::fs::create_dir_all(&sc).unwrap();
    for f in ["cli.ts", "code_facts.ts", "own_code.ts"] {
        std::fs::copy(root.join("scanners").join(f), sc.join(f)).unwrap();
    }
    std::fs::write(sc.join("js_ast.ts"), &old.stdout).unwrap();
    let w = format!("edb(scanner).\nscanner(js, \"node --experimental-strip-types {} {}\").\nscan_request(js, \"main.js\").",
        sc.join("cli.ts").display(), root.join("examples/scan/src").display());
    let boot = std::fs::read_to_string(root.join("boot.rofl")).unwrap();
    let facts = |w: &str| -> Result<Vec<Vec<String>>, String> {
        let mut s = Session::fresh(200_000_000);
        s.load(&boot, None).map_err(|d| d.join("; "))?;
        s.load(w, None).map_err(|d| d.join("; "))?;
        s.evaluate().map_err(|h| rofl::describe(&h))?;
        let mut rows = s.ask("ast_line[code](N, L)").map_err(|e| e)?.rows;
        rows.extend(s.ask("ast_file[code](R, F)").map_err(|e| e)?.rows);
        rows.sort();
        Ok(rows)
    };
    let before = facts(&w)?;
    std::fs::copy(root.join("scanners/js_ast.ts"), sc.join("js_ast.ts")).unwrap();
    let after = facts(&w)?;
    std::env::set_var("XDG_CACHE_HOME", cache.join("empty"));
    let fresh = facts(&w);
    std::env::set_var("XDG_CACHE_HOME", cache);
    let _ = std::fs::remove_dir_all(&d);
    let fresh = fresh?;
    ensure(before != fresh, || "the old js_ast.ts and the current one gave the same facts: the case shows nothing".into())?;
    ensure(after == fresh, || format!("after js_ast.ts was swapped the storeroom answered {} rows of the old scanner's, a fresh scan gives {}", after.len(), fresh.len()))
}

type Case = fn() -> Result<(), String>;

const CASES: [(&str, Case); 7] = [
    ("kept_until_what_it_read_changes", kept_until_what_it_read_changes),
    ("unchanged_is_a_hit", unchanged_is_a_hit),
    ("the_entry_edited", the_entry_edited),
    ("a_module_edited", a_module_edited),
    ("no_code_is_refused", no_code_is_refused),
    ("two_versions_in_one_world", two_versions_in_one_world),
    ("why_names_the_scanner", why_names_the_scanner),
];

/// One test, the cases in turn: they share the process's storeroom (`XDG_CACHE_HOME`).
#[test]
fn the_storeroom_of_scans_holds_to_the_scanners_code() {
    let cache = std::env::temp_dir().join(format!("rofl-scan-cache-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&cache);
    std::env::set_var("XDG_CACHE_HOME", &cache);
    let mut bad: Vec<String> = CASES.iter().filter_map(|(name, f)| f().err().map(|e| format!("{name}: {e}"))).collect();
    if let Err(e) = the_85_incident(&cache) {
        bad.push(format!("the_85_incident: {e}"));
    }
    let _ = std::fs::remove_dir_all(&cache);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}
