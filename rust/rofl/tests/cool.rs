//! COOLING A VOLUME, AND THE ONLY PROPERTY THAT MAKES IT SAFE: IT IS REVERSIBLE.
//!
//! A volume is a key prefix, minted by the scanner. Cooling writes the volume's
//! BASE facts out as ROFL and drops them; reheating loads that file back. If
//! the round trip is not the identity, the loop L3 needs is a shredder — it
//! would cool a file under memory pressure and reload something else.
//!
//! So the gate is a byte-for-byte comparison of `canonicalState` before cooling
//! and after reheating, and it is a real risk rather than a formality: the
//! facts go out through `canon_term`, which spells a string the way
//! `JSON.stringify` does, and come back through a parser that decodes FIVE
//! escapes and refuses every other BY NAME. A control character in a string
//! attribute would leave as a `\u` escape and never return. That is exactly the
//! kind of gap a round trip finds and an eyeball does not, which is why the
//! fixture below carries a quote, a backslash and a tab on purpose.
use rofl::session::Session;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn tmp(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../target").join(name)
}

/// Two files' worth of AST-shaped facts, in the id scheme `js_ast.ts` mints:
/// `n<sha256(path)[0..8]>_<counter>`, so the file is a prefix of every id it
/// produced. Two volumes, because cooling one must leave the other whole.
const WORLD: &str = r#"
ast_file[code](na1b2c3d4_1, "a.js").
ast_node[code](na1b2c3d4_1, file, "a.js", 1).
ast_node[code](na1b2c3d4_2, call, "a.js", 3).
ast_child[code](na1b2c3d4_1, body, 0, na1b2c3d4_2).
ast_attr[code](na1b2c3d4_2, name, "greet").
ast_attr[code](na1b2c3d4_2, note, "a quote \" a backslash \\ a tab \t and a newline \n").
ast_file[code](nf9e8d7c6_1, "b.js").
ast_node[code](nf9e8d7c6_1, file, "b.js", 1).
ast_node[code](nf9e8d7c6_2, call, "b.js", 7).
ast_child[code](nf9e8d7c6_1, body, 0, nf9e8d7c6_2).
ast_attr[code](nf9e8d7c6_2, name, "farewell").
"#;

fn world() -> Session {
    let mut s = Session::fresh(BUDGET);
    let boot = std::fs::read_to_string(repo().join("boot.rofl")).expect("boot");
    s.load(&boot, None).expect("boot refused");
    let rules = std::fs::read_to_string(repo().join("rules/ingest.rofl")).expect("rules");
    s.load(&rules, None).expect("rules refused");
    s.load(WORLD, None).expect("world refused");
    s.evaluate().expect("evaluate");
    s
}

#[test]
fn a_cooled_volume_reheats_to_the_same_world() {
    let mut s = world();
    let before = s.eval.canonical_state();
    let hot = s.eval.store.fact_count();

    let out = tmp("cool_a.rofl");
    let c = s.cool("na1b2c3d4_", out.to_str().unwrap()).expect("cool");
    assert!(c.facts >= 6, "only {} facts left with the volume", c.facts);
    assert!(c.bytes > 0);

    // GONE — and only this volume's. The second file is the control: a prefix
    // match that was too loose would take it too, and nothing else here would
    // notice.
    s.evaluate().expect("re-evaluate after cooling");
    assert_eq!(
        s.ask("ast_node[code](F, _, _, _)").unwrap().rows.len(),
        2,
        "cooling took facts belonging to another volume"
    );
    assert!(s.eval.store.fact_count() < hot, "cooling freed nothing");
    assert_eq!(s.ask("ast_file[code](_, \"a.js\")").unwrap().rows.len(), 0);
    assert_eq!(s.ask("ast_file[code](_, \"b.js\")").unwrap().rows.len(), 1);

    // BACK, and identical.
    let text = std::fs::read_to_string(&out).expect("the cooled file");
    s.load(&text, None)
        .unwrap_or_else(|d| panic!("reheat refused: {}", d.join("; ")));
    s.evaluate().expect("re-evaluate after reheating");
    assert_eq!(
        s.eval.canonical_state(),
        before,
        "a volume did not come back the way it left"
    );
    std::fs::remove_file(&out).ok();
}

/// The ingest rules and the engine operation have to agree about what a cooled
/// file IS, and they meet only through a fact somebody writes. The engine drops
/// the facts; the caller records `cooled`; only then does the file stay off the
/// frontier. Both halves are asserted, because either alone is a loop that
/// never terminates or a world that forgets.
#[test]
fn a_cooled_file_leaves_the_frontier_only_once_it_is_recorded() {
    let mut s = world();
    s.load(
        "must_index[code](demo, \"a.js\"). must_index[code](demo, \"b.js\").",
        None,
    )
    .expect("goal");
    s.evaluate().expect("evaluate");
    assert_eq!(
        s.ask("needs_index[code](C, F)").unwrap().rows.len(),
        0,
        "both files are held as facts"
    );

    let out = tmp("cool_b.rofl");
    s.cool("na1b2c3d4_", out.to_str().unwrap()).expect("cool");
    s.evaluate().expect("re-evaluate");

    // The facts are gone and NOTHING has been recorded, so the file is wanted
    // again — which is correct, and is precisely why the host must write
    // `cooled` as part of the same act.
    assert_eq!(
        s.ask("needs_index[code](C, F)").unwrap().rows.len(),
        1,
        "a file whose facts left without a record should be wanted again"
    );

    s.load("cooled[code](\"a.js\", \"/vol/a.rofl\").", None)
        .expect("record");
    s.evaluate().expect("re-evaluate");
    assert_eq!(
        s.ask("needs_index[code](C, F)").unwrap().rows.len(),
        0,
        "recording the cooling did not take the file off the frontier"
    );
    assert_eq!(s.ask("index_complete[code](C)").unwrap().rows.len(), 1);
    assert_eq!(s.ask("index_cold[code](C, F)").unwrap().rows.len(), 1);
    std::fs::remove_file(&out).ok();
}

/// THE SIGNATURE, AND IT IS ONLY WORTH HAVING IF IT REFUSES.
///
/// A cooled volume names the kernel it was written under. The threat is not a
/// forged file — it is a STALE one: an artefact that still parses and no
/// longer means what it meant, which is the exact class this branch found in
/// its own conformance corpus today. So the gate corrupts the header three
/// ways and requires a refusal each time, and requires the message to say what
/// it wanted rather than merely that something was wrong.
#[test]
fn a_volume_this_engine_did_not_write_is_refused() {
    let mut s = world();
    let out = tmp("cool_sig.rofl");
    s.cool("na1b2c3d4_", out.to_str().unwrap()).expect("cool");
    s.evaluate().expect("re-evaluate");

    let good = std::fs::read_to_string(&out).expect("volume");
    assert!(good.starts_with("-- rofl-volume 1 kernel="),
        "a cooled volume did not name its kernel: {}", good.lines().next().unwrap_or(""));

    // The honest path works.
    let mut ok = world();
    ok.cool("na1b2c3d4_", out.to_str().unwrap()).expect("cool");
    ok.evaluate().expect("re-evaluate");
    ok.reheat(out.to_str().unwrap()).expect("a volume this engine wrote was refused");

    let bad = tmp("cool_bad.rofl");
    let body = good.split_once('\n').map(|(_, b)| b.to_string()).unwrap_or_default();
    for (what, header) in [
        ("a different kernel", "-- rofl-volume 1 kernel=deadbeefdeadbeef prefix=na1b2c3d4_"),
        ("a future format", "-- rofl-volume 2 kernel=deadbeefdeadbeef prefix=na1b2c3d4_"),
        ("no header at all", "-- just some file"),
    ] {
        std::fs::write(&bad, format!("{header}\n{body}")).expect("write");
        let mut t = world();
        match t.reheat(bad.to_str().unwrap()) {
            Ok(_) => panic!("reheated {what}"),
            Err(d) => {
                let m = d.join(" ");
                assert!(m.contains("not a volume this engine wrote"), "{what}: {m}");
                assert!(m.contains("wanted:"), "{what}: the refusal did not say what it wanted");
                assert!(m.contains("Re-parse the source"), "{what}: no repair named");
            }
        }
    }
    std::fs::remove_file(&out).ok();
    std::fs::remove_file(&bad).ok();
}

/// A VOLUME COOLED BY BOOK (docs/surface-split.md, the driver): its `[code]` and `[flow]` facts go, base and derived,
/// with the kernel's account of them; its `[surface]` stays, a base one through every evaluation after. Reheated, the
/// world is the one that was cooled, byte for byte, and the other volume never moved.
const BOOKS: &str = r#"
imports(flow, code).
imports(surface, flow).
callee_of[flow](C, N) :- ast_attr[code](C, name, N).
sx_called[surface](N) :- callee_of[flow](_, N).
sx_pinned[surface](na1b2c3d4_2, "published").
"#;

#[test]
fn a_volume_cooled_by_book_keeps_its_surface_and_reheats_to_the_same_world() {
    let mut s = world();
    s.load(BOOKS, None).expect("books refused");
    s.evaluate().expect("evaluate");
    let before = s.eval.canonical_state();
    let n = |s: &mut Session, q: &str| s.ask(q).unwrap().rows.len();
    assert_eq!(n(&mut s, "callee_of[flow](C, N)"), 2);

    let out = tmp("cool_books_a.rofl");
    let c = s.cool_books("na1b2c3d4_", &["code".into(), "flow".into()], out.to_str().unwrap()).expect("cool by book");
    assert_eq!(c.facts, 6, "the volume's base [code] facts are what is written");
    let text = std::fs::read_to_string(&out).unwrap();
    assert!(!text.contains("[surface]") && !text.contains("[flow]"), "only the base facts of the books leave: {text}");

    // GONE: the volume's [code] and [flow], base and derived. KEPT: its [surface], and all of the other volume.
    assert_eq!(n(&mut s, "ast_node[code](na1b2c3d4_1, K, F, L)"), 0);
    assert_eq!(n(&mut s, "callee_of[flow](na1b2c3d4_2, N)"), 0);
    assert_eq!(n(&mut s, "callee_of[flow](nf9e8d7c6_2, N)"), 1);
    assert_eq!(n(&mut s, "sx_called[surface](\"greet\")"), 1, "the surface it published left with the volume");
    assert_eq!(n(&mut s, "sx_pinned[surface](na1b2c3d4_2, V)"), 1);
    // A BASE surface fact outlives the evaluation that drops what the cooled volume concluded, its trail with it.
    s.evaluate().expect("re-evaluate after cooling");
    assert_eq!(n(&mut s, "sx_pinned[surface](na1b2c3d4_2, V)"), 1);
    assert_eq!(n(&mut s, "sx_called[surface](\"greet\")"), 0, "a conclusion without its volume outlived an evaluation");
    assert_eq!(n(&mut s, "sx_called[surface](\"farewell\")"), 1);
    assert_eq!(s.ask("asserted_by[$kernel](F, W, T)").unwrap().keys.iter().filter(|k| k.contains("sx_pinned")).count(), 1);

    // BACK, by delta into the evaluated world, and identical.
    s.reheat(out.to_str().unwrap()).unwrap_or_else(|d| panic!("reheat refused: {}", d.join("; ")));
    s.evaluate().expect("re-evaluate after reheating");
    assert_eq!(s.eval.canonical_state(), before, "a volume cooled by book did not come back the way it left");

    // cooled and reheated with no evaluation between: the same
    s.cool_books("na1b2c3d4_", &["code".into(), "flow".into()], out.to_str().unwrap()).expect("cool");
    s.reheat(out.to_str().unwrap()).expect("reheat");
    s.evaluate().expect("evaluate");
    assert_eq!(s.eval.canonical_state(), before);
    assert!(s.cool_books("na1b2c3d4_", &[], out.to_str().unwrap()).is_err(), "cooling no book is a mistake, said");
    std::fs::remove_file(&out).ok();
}

/// A prefix that names nothing must cool nothing. A volume operation that
/// quietly matched everything would empty a world the first time it came under
/// pressure, and the emptying would look like success.
#[test]
fn an_unknown_volume_cools_nothing() {
    let mut s = world();
    let before = s.eval.canonical_state();
    let out = tmp("cool_c.rofl");
    let c = s.cool("nzzzzzzzz_", out.to_str().unwrap()).expect("cool");
    assert_eq!(c.facts, 0, "an unknown prefix cooled {} facts", c.facts);
    s.evaluate().expect("re-evaluate");
    assert_eq!(s.eval.canonical_state(), before);
    std::fs::remove_file(&out).ok();
}

/// THE ASSERTION TRAIL, PARKED AND FETCHED BACK.
///
/// `asserted_by` is half the world and two thirds of what a load writes, and it
/// is the layer nobody asks about until something is wrong. Cooling it is the
/// difference between `sealed(assertions)` — cheaper, and the information gone
/// for good — and keeping the answer available at the price of a disk read.
///
/// The round trip is asserted the same way a volume's is: byte for byte. It has
/// to go PAST THE DOOR to come back, since `asserted_by` lives in `[$kernel]`
/// and a program may not write a kernel ledger, so the header is what earns
/// that — and the gate below corrupts it and requires a refusal, because a
/// bypass with an unchecked signature is just a bypass.
#[test]
fn the_trail_cools_and_comes_back_whole() {
    let mut s = world();
    let before = s.eval.canonical_state();
    let hot = s.eval.store.fact_count();

    let out = tmp("cool_trail.rofl");
    let c = s.cool_trail(out.to_str().unwrap()).expect("cool the trail");
    assert!(c.facts >= 10, "only {} trail rows cooled", c.facts);
    s.evaluate().expect("re-evaluate");
    assert!(s.eval.store.fact_count() < hot, "cooling the trail freed nothing");
    assert_eq!(s.ask("asserted_by[$kernel](F, W, T)").unwrap().rows.len(), 0,
        "the trail is still hot after cooling");
    // THE FACTS THEMSELVES ARE UNTOUCHED. Only the account of who asserted them
    // has gone; a cold trail must not cost the world its data.
    assert_eq!(s.ask("ast_node[code](I, K, F, L)").unwrap().rows.len(), 4);

    let back = s.reheat_trail(out.to_str().unwrap()).expect("reheat the trail");
    assert_eq!(back, c.facts, "reheating restored {back} of {} rows", c.facts);
    s.evaluate().expect("re-evaluate after reheating");
    assert_eq!(s.eval.canonical_state(), before,
        "the trail did not come back the way it left");
    std::fs::remove_file(&out).ok();
}

#[test]
fn a_trail_this_engine_did_not_write_is_refused() {
    let mut s = world();
    let out = tmp("cool_trail_sig.rofl");
    s.cool_trail(out.to_str().unwrap()).expect("cool");
    let good = std::fs::read_to_string(&out).expect("trail");
    let body = good.split_once('\n').map(|(_, b)| b.to_string()).unwrap_or_default();

    let bad = tmp("cool_trail_bad.rofl");
    std::fs::write(&bad, format!("-- rofl-volume 1 kernel=deadbeefdeadbeef\n{body}")).unwrap();
    match s.reheat_trail(bad.to_str().unwrap()) {
        Ok(_) => panic!("reheated a trail from another kernel"),
        Err(e) => {
            assert!(e.contains("not a trail this engine wrote"), "{e}");
            assert!(e.contains("wanted:"), "the refusal did not say what it wanted: {e}");
        }
    }
    // AND A WELL-SIGNED FILE THAT IS NOT A TRAIL IS ALSO REFUSED. The bypass is
    // earned by the signature, so what comes through it must still be what it
    // claims — otherwise the header licences writing anything into `[$kernel]`.
    let hdr = good.lines().next().unwrap().to_string();
    std::fs::write(&bad, format!("{hdr}\nast_node[code](nx_1, file, \"x.js\", 1).\n")).unwrap();
    match s.reheat_trail(bad.to_str().unwrap()) {
        Ok(_) => panic!("a signed file wrote a non-trail fact into the kernel's book"),
        Err(e) => assert!(e.contains("`asserted_by` facts and nothing else"), "{e}"),
    }
    std::fs::remove_file(&out).ok();
    std::fs::remove_file(&bad).ok();
}
