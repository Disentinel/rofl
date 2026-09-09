//! LOADING A ROFL PROGRAM IN RUST, HELD TO THE TYPESCRIPT KERNEL BYTE FOR BYTE.
//!
//! This is the strongest oracle available for a `load`, and it costs nothing
//! to use, so nothing weaker is used here. `facts/port-corpus/<name>.expected
//! .txt` is the `canonicalState` the TypeScript kernel produces from
//! `new Rofl(); load(boot.rofl); load(each file); evaluate()`. The same world
//! is built here from the SAME TEXT through `Session::fresh` + `load` + a
//! settle, and the two states are diffed.
//!
//! So what is compared is not "did the parse look right" but: does reading a
//! program in Rust put the SAME facts, the same provenance, the same
//! `asserted_by` tick, the same `edb` registrations, the same `authority` rows
//! and the same encoded rules into the world as reading it in TypeScript. A
//! door that is one check thinner shows up as a state diff, and a door that is
//! one check thicker shows up as a refusal.
//!
//! THE REFUSALS ARE CHECKED SEPARATELY AND BY NAME, because a load that
//! refuses everything would pass a test that only ever loads good programs,
//! and every check in `program.rs` was paid for on the JS side by a program
//! that had to be stopped.
use rofl::session::Session;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

/// The corpus name -> the `.rofl` text it was built from. `boot_only` is the
/// world with nothing but the kernel; a bare name is `examples/<name>.rofl`;
/// a name that is a directory is every `.rofl` in it, in sorted order — the
/// same three shapes `scripts/port_corpus.ts` enumerates.
fn files_of(name: &str) -> Option<Vec<PathBuf>> {
    if name == "boot_only" {
        return Some(Vec::new());
    }
    let ex = repo().join("examples");
    let dir = ex.join(name);
    if dir.is_dir() {
        let mut v: Vec<PathBuf> = std::fs::read_dir(&dir)
            .ok()?
            .filter_map(|e| {
                let p = e.ok()?.path();
                (p.extension()? == "rofl").then_some(p)
            })
            .collect();
        v.sort();
        return (!v.is_empty()).then_some(v);
    }
    let f = ex.join(format!("{name}.rofl"));
    f.is_file().then(|| vec![f])
}

fn cases() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(repo().join("facts/port-corpus"))
        .expect("port-corpus")
        .filter_map(|e| {
            let n = e.ok()?.file_name().to_string_lossy().into_owned();
            n.strip_suffix(".expected.txt").map(|s| s.to_string())
        })
        .collect();
    v.sort();
    v
}

/// A world built from text, exactly as the corpus generator builds it.
fn build(name: &str) -> Option<Session> {
    let files = files_of(name)?;
    let mut s = Session::fresh(BUDGET);
    let boot = read(&repo().join("boot.rofl"));
    s.load(&boot, None).unwrap_or_else(|d| panic!("{name}: boot.rofl refused: {}", d.join("; ")));
    for f in &files {
        let text = read(f);
        s.load(&text, None)
            .unwrap_or_else(|d| panic!("{name}: {} refused: {}", f.display(), d.join("; ")));
    }
    Some(s)
}

#[test]
fn a_program_loaded_in_rust_is_the_world_the_kernel_builds() {
    let mut checked = 0;
    let mut skipped: Vec<String> = Vec::new();
    for n in cases() {
        // The ticked twins are the same TEXT settled differently; the untensed
        // case already compares the load, and the tick path has its own gate.
        if n.contains(".t") {
            continue;
        }
        let Some(mut s) = build(&n) else {
            skipped.push(n);
            continue;
        };
        s.evaluate().unwrap_or_else(|e| panic!("{n}: {}", rofl::describe(&e)));
        let want = read(&repo().join(format!("facts/port-corpus/{n}.expected.txt")));
        let got = s.eval.store.canonical_state(&s.eval.h);
        assert_eq!(got.trim_end(), want.trim_end(), "{n}: loaded in Rust differs from the kernel");
        checked += 1;
    }
    assert!(checked >= 25, "only {checked} worlds built from text (skipped: {skipped:?})");
}

/// The ticked twins, through the load path rather than through a seed.
#[test]
fn a_loaded_program_ticks_the_way_the_kernel_ticks() {
    let mut checked = 0;
    for n in cases() {
        let Some((base, t)) = n.rsplit_once(".t") else { continue };
        let Ok(ticks) = t.parse::<u32>() else { continue };
        let Some(mut s) = build(base) else { continue };
        for _ in 0..ticks {
            s.tick().unwrap_or_else(|e| panic!("{n}: {}", rofl::describe(&e)));
        }
        let want = read(&repo().join(format!("facts/port-corpus/{n}.expected.txt")));
        assert_eq!(
            s.eval.store.canonical_state(&s.eval.h).trim_end(),
            want.trim_end(),
            "{n}: ticked after a Rust load differs from the kernel"
        );
        checked += 1;
    }
    assert!(checked >= 5, "only {checked} ticked worlds compared");
}

/// EVERY DOOR, BY NAME. A load that refused nothing would pass the test above
/// as long as the programs it loads are good, and each of these was paid for
/// on the JS side by a program that had to be stopped.
#[test]
fn the_door_refuses_what_the_kernel_refuses() {
    let boot = read(&repo().join("boot.rofl"));
    let fresh = || {
        let mut s = Session::fresh(BUDGET);
        s.load(&boot, None).expect("boot");
        s
    };
    let refused = |s: &mut Session, src: &str, want: &str| {
        match s.load(src, None) {
            Ok(_) => panic!("accepted: {src}"),
            Err(d) => assert!(
                d.iter().any(|x| x.contains(want)),
                "refusing {src} did not mention {want:?}: {d:?}"
            ),
        }
    };

    // A `$` ledger the author typed. Deliberately narrow — a BARE kernel
    // relation is a different mistake and gets a different answer.
    refused(&mut fresh(), "p[$kernel](a).", "kernel ledger");
    // A kernel relation at a width the kernel does not read it at. This is a
    // crash gate on the JS side, not tidiness.
    refused(&mut fresh(), "stratum(a, b, c, d).", "arity");
    // Granting the kernel. A program electing itself into the ring.
    refused(&mut fresh(), "authority(mybook, $kernel).", "kernel principal");
    // A negation nothing binds, under a range-restricted head — AND the form
    // beside it that must still LOAD, because the two are one line apart in
    // the grammar and a check that refuses both is a different check.
    //
    // Verified against the kernel itself, 2026-09-09: it ACCEPTS
    // `q(X) :- p(X), not r(Y).` — a variable occurring only inside the
    // negation IS the existential reading, and `_` is the same rule spelled
    // differently — and REFUSES `not r(Y), not s(Y)`, where Y occurs twice and
    // nothing positive ever binds it. The first version of this test asserted
    // the refusal of the accepted form and was wrong about the language, not
    // about the code.
    fresh().load("q(X) :- p(X), not r(Y).", None).expect("the existential reading must load");
    refused(&mut fresh(), "q(X) :- p(X), not r(Y), not s(Y).", "no premise binds");
    refused(&mut fresh(), "q(X) :- p(X), not r(X, Y), not s(Y, Z).", "no premise binds");
    // A rule concluding into a write-protected kernel relation.
    refused(&mut fresh(), "concludes(A, B) :- p(A, B).", "write-protected");
    // Facts must be ground and `@next` is not assertable.
    refused(&mut fresh(), "p(X).", "must be ground");
    refused(&mut fresh(), "p(a)@next.", "not assertable");
    // A caller may not spell a kernel principal.
    {
        let mut s = fresh();
        match s.load("p(a).", Some("$kernel")) {
            Ok(_) => panic!("a caller claimed a kernel principal"),
            Err(d) => assert!(d.iter().any(|x| x.contains("kernel principal")), "{d:?}"),
        }
    }
    // The claim is the FIRST clause of the FIRST load, or it is not a claim.
    {
        let mut s = fresh();
        match s.load("p(a).\n$kernel_authority(late).", None) {
            Ok(_) => panic!("a mid-file claim was accepted"),
            Err(d) => assert!(d.iter().any(|x| x.contains("FIRST clause")), "{d:?}"),
        }
    }
    // boot.rofl claims it, so a second claim into the same store is refused
    // rather than ignored — dropping it silently would let a program believe
    // it is privileged when it is not.
    {
        let mut s = fresh();
        match s.load("$kernel_authority(second).", None) {
            Ok(_) => panic!("a second claim was accepted"),
            Err(d) => assert!(d.iter().any(|x| x.contains("already claimed")), "{d:?}"),
        }
    }
    // And a syntax error is a diagnostic, not a panic.
    refused(&mut fresh(), "p(a", "");
}

/// A REFUSAL LEAVES NOTHING BEHIND, and a program with three bad clauses hears
/// about all three.
#[test]
fn a_refused_load_is_atomic_and_complete() {
    let boot = read(&repo().join("boot.rofl"));
    let mut s = Session::fresh(BUDGET);
    s.load(&boot, None).expect("boot");
    s.evaluate().expect("evaluate");
    let before = s.eval.store.canonical_state(&s.eval.h);

    let bad = "$good_one(a).\nauthority(b, $kernel).\np[$kernel](c).\nstratum(x, y, z, w).";
    let d = s.load(bad, None).expect_err("a bad program was accepted");
    assert!(d.len() >= 3, "only {} diagnostics for three bad clauses: {d:?}", d.len());

    s.evaluate().expect("re-evaluate");
    assert_eq!(
        s.eval.store.canonical_state(&s.eval.h),
        before,
        "a refused load left something behind"
    );
    // Including the GOOD clause that shared the file with them.
    assert!(!before.contains("$good_one"), "the good clause of a refused load was kept");
}

/// A SECOND LOAD SEES THE FIRST, and the rules are re-prepared: a load that
/// added rules and left the prepared program alone would evaluate the OLD
/// program against the NEW facts, silently and with no diagnostic.
#[test]
fn a_second_load_runs_the_rules_the_first_one_did_not_have() {
    let boot = read(&repo().join("boot.rofl"));
    let mut s = Session::fresh(BUDGET);
    s.load(&boot, None).expect("boot");
    s.load("$base(a).\n$base(b).", None).expect("facts");
    s.evaluate().expect("evaluate");
    assert_eq!(s.ask("$derived(_)").unwrap().rows.len(), 0);

    s.load("$derived(X) :- $base(X).", None).expect("rule");
    s.evaluate().expect("re-evaluate");
    let a = s.ask("$derived(X)").unwrap();
    assert_eq!(a.rows.len(), 2, "the rule from the second load never fired");

    // And a fact arriving after the rule reaches it too.
    s.load("$base(c).", None).expect("more facts");
    s.evaluate().expect("third");
    assert_eq!(s.ask("$derived(X)").unwrap().rows.len(), 3);

    // Loading the same rule twice must not double anything: the rule id is a
    // hash of the canonical clause, so the second is the same row.
    s.load("$derived(X) :- $base(X).", None).expect("same rule again");
    s.evaluate().expect("fourth");
    assert_eq!(s.ask("$derived(X)").unwrap().rows.len(), 3);
    assert!(!s.eval.diags.iter().any(|d| d.contains("not executable")), "{:?}", s.eval.diags);
}
