//! THE AGGREGATE WORLDS, HELD BY THE RUST LOOP AS WELL AS BY THE GOLDENS.
//!
//! `facts/checks.rofl` declares every aggregate proof world, whose files load
//! together and are evaluated once (`check_opt(N, together, 1)`), and
//! `scripts/goldens.ts` holds their hashes, which both engines reach. This builds the same worlds from the same registry, read by this
//! engine, and holds what a hash cannot say:
//!
//!   * no alarm is raised, and every file written to be refused
//!     (`-- expect-refusal: <text>` on its first line) is refused with that
//!     text, alone, the way the harness offers it; any other file goes
//!     straight into the world;
//!   * a second evaluation of the world is the same world;
//!   * the world saved and opened again (`save`, `Session::open`) evaluates to
//!     the same world, which is the round trip of rules reflected as data and
//!     decoded back, aggregates included (the `reflect` column of `cell`);
//!   * a budget cut never seals a partial group: at every budget that cuts the
//!     evaluation short, no zero stands where a member exists;
//!   * a world that asks for a wall (`budget`, `space`) is cut by it, and its
//!     cut state holds every row its files name (`-- expect-row: <prefix>`)
//!     and none they forbid (`-- expect-no-row:`): no rule of its own runs
//!     after the wall to say so;
//!   * a file that names a world below it (`-- below: <path>`) is evaluated
//!     over what that world concludes, fed as `rofl-load --below` feeds it.
use rofl::engine::Mode;
use rofl::session::Session;
use std::path::{Path, PathBuf};

const BUDGET: i64 = 200_000_000;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn unquote(s: &str) -> String {
    s.trim_matches('"').to_string()
}

struct World {
    name: String,
    files: Vec<PathBuf>,
    strata: bool,
    explain: bool,
    ticks: u32,
    budget: Option<i64>,
    space: Option<i64>,
    retain: Option<u32>,
    /// `check_opt(W, sentences, 1)`: its files go round the sentence form first
    sentences: bool,
    /// `check_opt(W, retract, F)`: base facts retracted after the evaluation, by the cell path
    retract: Vec<String>,
}

/// The worlds loaded together, read from the registry by this engine.
fn registry() -> Vec<World> {
    let mut s = Session::fresh(BUDGET);
    s.load(&read(&repo().join("boot.rofl")), None).expect("boot");
    s.load(&read(&repo().join("facts/checks.rofl")), None).expect("facts/checks.rofl");
    s.evaluate().expect("the registry evaluates");
    let rows = |s: &mut Session, q: &str| s.ask(q).unwrap().rows;
    let mut out: Vec<World> = Vec::new();
    for r in rows(&mut s, "check_opt(N, together, 1)") {
        out.push(World { name: unquote(&r[0]), files: Vec::new(), strata: false, explain: false, ticks: 0, budget: None, space: None, retain: None, sentences: false, retract: Vec::new() });
    }
    for w in out.iter_mut() {
        let n = &w.name;
        w.files = rows(&mut s, &format!("check_file(\"{n}\", F)")).iter().map(|r| repo().join(unquote(&r[0]))).collect();
        w.strata = !rows(&mut s, &format!("check_opt(\"{n}\", evaluator, strata)")).is_empty();
        w.explain = !rows(&mut s, &format!("check_opt(\"{n}\", explain, 1)")).is_empty();
        w.ticks = rows(&mut s, &format!("check_opt(\"{n}\", ticks, T)")).first().map_or(0, |r| r[0].parse().unwrap());
        w.budget = rows(&mut s, &format!("check_opt(\"{n}\", budget, T)")).first().map(|r| r[0].parse().unwrap());
        w.space = rows(&mut s, &format!("check_opt(\"{n}\", space, T)")).first().map(|r| r[0].parse().unwrap());
        w.retain = rows(&mut s, &format!("check_opt(\"{n}\", retain, T)")).first().map(|r| r[0].parse().unwrap());
        w.sentences = !rows(&mut s, &format!("check_opt(\"{n}\", sentences, 1)")).is_empty();
        w.retract = rows(&mut s, &format!("check_opt(\"{n}\", retract, F)")).iter().map(|r| unquote(&r[0])).collect();
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn fresh(strata: bool) -> Session {
    fresh_walled(strata, BUDGET)
}

fn fresh_walled(strata: bool, budget: i64) -> Session {
    let mut s = Session::fresh(budget);
    s.load(&read(&repo().join("boot.rofl")), None).expect("boot");
    if strata {
        s.eval.mode = Mode::Strata;
    }
    s
}

/// A file offered alone, as the harness offers it: `Err` carries the refusal.
/// A fixture offered alone, under its world's ticks and retractions as
/// `rofl-load` runs it: a promise broken only at a tick or by a retraction is
/// refused there.
fn alone(f: &Path, w: &World) -> Result<(), String> {
    let mut s = fresh(w.strata);
    s.load(&read(f), None).map_err(|d| d.join("; "))?;
    feed(&mut s, &below(std::slice::from_ref(&f.to_path_buf())))?;
    let ticks = |s: &mut rofl::session::Session| (0..w.ticks).try_for_each(|_| s.tick().map(|_| ())).map_err(|e| rofl::describe(&e));
    if w.ticks > 0 && w.retract.is_empty() {
        return ticks(&mut s);
    }
    s.evaluate().map_err(|e| rofl::describe(&e))?;
    // as `rofl-load --retract` runs it: a retraction the cell path refuses is a full evaluation, which may refuse the world
    for r in &w.retract {
        s.retract_delta(r).map_err(|e| e.to_string())?;
        if s.eval.store.dirty {
            s.evaluate().map_err(|e| rofl::describe(&e))?;
        }
    }
    if w.ticks > 0 { ticks(&mut s) } else { Ok(()) }
}

/// The world below the files, named by their `-- below: <path>` lines.
fn below(files: &[PathBuf]) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for f in files {
        for l in read(f).lines() {
            // the directive names one .rofl file and nothing else, so a
            // comment that happens to begin with `below:` is not one
            let Some(p) = l.strip_prefix("-- below: ").map(str::trim).filter(|p| p.ends_with(".rofl") && !p.contains(char::is_whitespace)) else {
                continue;
            };
            let p = repo().join(p);
            if !out.contains(&p) {
                out.push(p);
            }
        }
    }
    out
}

/// Evaluate the world below and feed what it concludes, as rofl-load does.
fn feed(s: &mut Session, below: &[PathBuf]) -> Result<(), String> {
    if below.is_empty() {
        return Ok(());
    }
    // the world below is built under the walls of the world above
    let mut b = fresh_walled(s.eval.mode == Mode::Strata, s.eval.budget);
    b.eval.space = s.eval.space;
    for f in below {
        b.load(&read(f), None).map_err(|d| format!("below: {}", d.join("; ")))?;
    }
    b.evaluate().map_err(|e| format!("below: {}", rofl::describe(&e)))?;
    s.feed_below(&mut b).map(|_| ()).map_err(|e| format!("below: {e}"))
}

fn expected_refusal(f: &Path) -> Option<String> {
    read(f).lines().next()?.strip_prefix("-- expect-refusal: ").map(|x| x.trim().to_string())
}

fn alarms(s: &mut Session) -> Vec<String> {
    let rels: Vec<String> = s.ask("alarm(R)").unwrap().rows.into_iter().map(|r| r[0].clone()).collect();
    let mut out = Vec::new();
    for rel in rels {
        for k in s.fact_keys(Some(&rel)) {
            out.push(k);
        }
    }
    out
}

fn state(s: &Session) -> String {
    s.eval.fork().canonical_state()
}

/// One world loaded together, held to every property the test names: what is
/// wrong with it, one line each.
fn check_world(w: &World) -> Vec<String> {
    let mut bad: Vec<String> = Vec::new();
    let walled = w.budget.is_some() || w.space.is_some();
    let mut s = fresh_walled(w.strata, w.budget.unwrap_or(BUDGET));
    if let Some(n) = w.space {
        s.eval.space = n;
    }
    s.eval.retain_ticks = w.retain;
    for f in &w.files {
        let base = f.file_name().unwrap().to_string_lossy().into_owned();
        // only a fixture is offered alone, as the harness offers it
        let Some(want) = expected_refusal(f) else {
            s.load(&read(f), None).unwrap_or_else(|d| panic!("{}: {base}: {}", w.name, d.join("; ")));
            continue;
        };
        match alone(f, w) {
            Ok(()) => bad.push(format!("{}: {base} was to be refused ({want}) and loaded", w.name)),
            Err(e) if e.contains(&want) => {}
            Err(e) => bad.push(format!("{}: {base} refused ({e}); expected {want:?}", w.name)),
        }
    }
    let kept: Vec<PathBuf> = w.files.iter().filter(|f| expected_refusal(f).is_none()).cloned().collect();
    if let Err(e) = feed(&mut s, &below(&kept)) {
        bad.push(format!("{}: {e}", w.name));
        return bad;
    }
    // as `rofl-load --ticks N` runs it: N boundaries, each evaluating first, after the retractions where there are any
    let ticks = |s: &mut rofl::session::Session| (0..w.ticks).try_for_each(|_| s.tick().map(|_| ()));
    let run = if w.ticks > 0 && w.retract.is_empty() { ticks(&mut s) } else { s.evaluate().map(|_| ()) };
    if let Err(e) = run {
        bad.push(format!("{}: does not evaluate: {}", w.name, rofl::describe(&e)));
        return bad;
    }
    // as `rofl-load --retract` runs it: each fact out by the cell path, and the
    // world evaluated again only where the path refused; the second evaluation
    // below is then the check that the path left the world a fresh one
    for f in &w.retract {
        if let Err(e) = s.retract_delta(f) {
            bad.push(format!("{}: retract {f}: {e}", w.name));
            return bad;
        }
        if s.eval.store.dirty {
            s.evaluate().unwrap();
        }
    }
    if w.ticks > 0 && !w.retract.is_empty() {
        if let Err(e) = ticks(&mut s) {
            bad.push(format!("{}: does not tick after the retractions: {}", w.name, rofl::describe(&e)));
            return bad;
        }
    }
    // the explain bridge answers once the world is evaluated, as
    // `rofl-load --explain` does, and its rows are read with the rest
    if w.explain {
        if w.ticks > 0 {
            s.evaluate().unwrap();
        }
        s.explain_requests().unwrap();
        s.evaluate().unwrap();
    }
    // A WORLD THE BUDGET CUT PROVES NOTHING: its alarms may simply not
    // have been reached. What it proves, its files say as rows the state
    // must hold and must not, and a world that asks for a wall says so
    // with the world's hole; one whose wall is a ceiling says the hole is
    // not there, and is an ordinary world.
    let st = state(&s);
    // a world with asks refuses a question outside its cone; its state still lists its holes
    let cut = match s.ask("hole(M, space_exhausted)") {
        Ok(a) => !a.rows.is_empty(),
        Err(_) => st.contains("space_exhausted)"),
    };
    for f in &w.files {
        for l in read(f).lines() {
            let (want, prefix) = match (l.strip_prefix("-- expect-row: "), l.strip_prefix("-- expect-no-row: ")) {
                (Some(p), _) => (true, p.trim()),
                (_, Some(p)) => (false, p.trim()),
                _ => continue,
            };
            if st.lines().any(|x| x.starts_with(prefix)) != want {
                bad.push(format!("{}: the state {} the row {prefix}", w.name, if want { "lacks" } else { "holds" }));
            }
        }
    }
    if walled && s.eval.store.partial_eval {
        s.eval.store.dirty = true;
        let again = s.evaluate();
        if again.is_err() || state(&s) != st {
            bad.push(format!("{}: a second evaluation to the wall is a different world", w.name));
        }
        return bad;
    }
    if s.eval.store.partial_eval || cut {
        bad.push(format!("{}: the world was cut by the budget", w.name));
        return bad;
    }
    // the tick a ticked world entered is evaluated before it is read
    // (f_a_ticked_case_is_read_before_its_tick_is_evaluated)
    if w.ticks > 0 {
        s.evaluate().unwrap();
    }
    for a in alarms(&mut s) {
        bad.push(format!("{}: ALARM {a}", w.name));
    }
    let first = state(&s);
    s.eval.store.dirty = true;
    s.evaluate().unwrap();
    if state(&s) != first {
        bad.push(format!("{}: a second evaluation is a different world", w.name));
    }
    // A SNAPSHOT CARRIES THE WORLD, NOT ITS WALLS: the opener gives them, as
    // `open` takes the budget, so the world is opened under the walls it was
    // evaluated under. Opened under the default space, agg_precise_oracle's
    // 528 720 rows met the wall of 500 000 and came back with a hole
    // (f_a_snapshot_carries_the_world_not_its_walls).
    let mut back = Session::open(&s.save(), s.eval.budget).unwrap_or_else(|e| panic!("{}: {e}", w.name));
    back.eval.mode = s.eval.mode;
    back.eval.space = s.eval.space;
    back.eval.retain_ticks = s.eval.retain_ticks;
    back.evaluate().unwrap();
    if state(&back) != first {
        let (a, b) = (state(&back), first.clone());
        let diff: Vec<&str> = a.lines().filter(|l| !b.lines().any(|m| m == *l)).take(3).collect();
        bad.push(format!("{}: saved and opened, it evaluates to another world: {diff:?}", w.name));
    }
    bad
}

#[test]
fn every_world_loaded_together_holds_its_properties_and_its_state() {
    let ws = registry();
    assert!(ws.len() >= 31, "the registry names {} worlds loaded together", ws.len());
    // A WORLD IN SENTENCES IS READ BEFORE IT IS LOADED: a `.rofl.md` file, and
    // under `sentences` a round trip through rofl-render, go through the
    // reader (scripts/read.ts, TypeScript), which `npm test` runs before it
    // hands the files it wrote to rofl-load. This test has no reader, so it
    // names those worlds and leaves them to that path, never loads them raw.
    let (read_first, ws): (Vec<World>, Vec<World>) = ws.into_iter().partition(|w| w.sentences || w.files.iter().any(|f| f.to_string_lossy().ends_with(".rofl.md")));
    eprintln!("{} worlds in sentences are answered through the reader by npm test: {}", read_first.len(),
        read_first.iter().map(|w| w.name.as_str()).collect::<Vec<_>>().join(", "));
    // the worlds are independent and each builds its own sessions, so they are
    // checked side by side; the slowest (a world saved, opened and evaluated
    // again) sets the time instead of the sum
    let next = std::sync::atomic::AtomicUsize::new(0);
    let jobs = std::thread::available_parallelism().map_or(4, |n| n.get()).min(ws.len().max(1));
    let mut bad: Vec<(usize, Vec<String>)> = std::thread::scope(|sc| {
        let hands: Vec<_> = (0..jobs).map(|_| sc.spawn(|| {
            let mut out = Vec::new();
            loop {
                let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let Some(w) = ws.get(i) else { break out };
                out.push((i, check_world(w)));
            }
        })).collect();
        hands.into_iter().flat_map(|h| h.join().unwrap_or_else(|e| std::panic::resume_unwind(e))).collect()
    });
    bad.sort_by_key(|(i, _)| *i);
    let bad: Vec<String> = bad.into_iter().flat_map(|(_, b)| b).collect();
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}

/// A BUDGET CUT NEVER SEALS A PARTIAL GROUP. The wall can fall inside the
/// inner solve of an aggregate or on a member's charge, and in both places it
/// leaves before the cell is written, so no zero is ever read from a group
/// cut short. Every budget from one step to the whole evaluation is tried,
/// so the cut falls at every point it can fall.
#[test]
fn a_budget_cut_never_reads_as_an_empty_group() {
    let data = read(&repo().join("examples/checks/agg-empty-data.rofl"));
    let mut base = fresh(false);
    base.load(&data, None).unwrap();
    let mut full = base.fork();
    let steps = full.evaluate().unwrap().steps;
    let cands = ["c1", "c2", "c3", "c4"];
    let balloted: Vec<&str> = cands.iter().copied().filter(|c| full.holds(&format!("ae_ballot(_, {c})")).unwrap()).collect();
    assert!(balloted.len() < cands.len() && !balloted.is_empty(), "the data has candidates with and without ballots");
    let mut cut = 0;
    for b in 1..steps {
        let mut s = base.fork();
        s.eval.budget = b;
        if !s.evaluate().unwrap().partial {
            continue;
        }
        cut += 1;
        for c in &balloted {
            for rel in ["ae_votes", "ae_total"] {
                assert!(
                    !s.holds(&format!("{rel}({c}, 0)")).unwrap(),
                    "budget {b} of {steps}: {rel}({c}, 0) stands, and {c} has a ballot"
                );
            }
        }
    }
    assert_eq!(cut, steps - 1, "every budget below the whole evaluation cuts it short");
}

/// A BUDGET CUT IS A HOLE, NEVER A SMALLER VALUE, for every kind of
/// aggregate over a relation still being derived, and for every point the cut
/// can fall at: a row the cut state holds is a row of the whole evaluation,
/// so no count, sum, best, median, quantile, rank or quorum is ever read from
/// a group cut short, and nothing below the wall seals a partial group
/// (docs/aggregates.md, "Holes, as built").
#[test]
fn a_budget_cut_never_seals_a_partial_group() {
    let mut src = String::from("edb(e). edb(n).\n");
    for i in 0..9 {
        src.push_str(&format!("e(n{i}, n{}, {}). n(n{i}).\n", i + 1, i + 1));
    }
    src.push_str(
        "n(n9). n(lone).
         r(A, B, W) :- e(A, B, W).
         r(A, C, W) :- r(A, B, _), e(B, C, W).
         bc(C, N) :- n(C), N is count(A : r(A, C, _)).
         bs(C, S) :- n(C), S is sum(W ; A : r(A, C, W)).
         bm(C, M) :- n(C), M is max(W : r(_, C, W)).
         bl(C, M) :- n(C), M is min(W : r(C, _, W)).
         bd(C, M) :- n(C), M is median(W ; A : r(A, C, W)).
         bq(C, M) :- n(C), M is quantile(75, W ; A : r(A, C, W)).
         bk(C, W, K) :- r(_, C, W), K is rank(W, V : r(_, C, V)).
         bt(C) :- n(C), at_least(3, A : r(A, C, _)).
         bo(C, B) :- n(C), B is or(F : r(_, C, W), F = true, W > 5).
         bn(C) :- n(C), not bt(C).",
    );
    let rels = ["bc[", "bs[", "bm[", "bl[", "bd[", "bq[", "bk[", "bt[", "bo[", "bn["];
    let rows = |st: &str| -> Vec<String> {
        st.lines().filter(|l| rels.iter().any(|r| l.starts_with(r))).map(|l| l.split(' ').next().unwrap().to_string()).collect()
    };
    let mut base = fresh(false);
    base.load(&src, None).unwrap();
    let mut full = base.fork();
    let steps = full.evaluate().unwrap().steps;
    let whole: std::collections::HashSet<String> = rows(&state(&full)).into_iter().collect();
    for r in rels {
        assert!(whole.iter().any(|x| x.starts_with(r)), "the whole evaluation has no {r} row");
    }
    let mut cut = 0;
    for b in 1..steps {
        let mut s = base.fork();
        s.eval.budget = b;
        if !s.evaluate().unwrap().partial {
            continue;
        }
        cut += 1;
        for row in rows(&state(&s)) {
            assert!(whole.contains(&row), "budget {b} of {steps}: {row} is no row of the whole evaluation");
        }
    }
    assert_eq!(cut, steps - 1, "every budget below the whole evaluation cuts it short");
}

/// A CUT NEVER PUBLISHES A LATTICE VALUE A HOLE LEFT OPEN. Each lattice
/// below reads what a plain hole left unknown: lo directly, lb through a
/// wide carry the wall can break into, lf through a fault in its own rule.
/// The whole evaluation holes their cells for g. At every budget and every
/// space from one to the whole evaluation, a lattice row of the cut state is
/// a row of the whole one or stands, a bound, under its lattice's wall hole
/// (f_a_wall_closed_a_lattice_a_plain_hole_had_not_reached,
/// f_the_carry_of_unknowns_ran_past_the_walls).
#[test]
fn a_cut_never_publishes_a_lattice_value_a_hole_left_open() {
    let mut src = String::from("edb(v). edb(e). edb(d). edb(n). edb(fv).\n");
    for i in 0..6 {
        src.push_str(&format!("e(n{i}, n{}).\n", i + 1));
    }
    for i in 0..5 {
        src.push_str(&format!("n(a{i}).\n"));
    }
    src.push_str(
        "v(g, q, oops). v(g, r, 1). v(h, r, 3). d(g, 5). d(h, 9).
         fv(g, oops). fv(g, 1). fv(h, 2).
         y(G, K, Y) :- v(G, K, X), Y is X + 1.
         lattice lo(G, min Y).
         lo(G, Y) :- y(G, _, Y).
         lo(G, D) :- d(G, D).
         yq(G) :- y(G, _, Y), Y > 100.
         big(A, B, C, G) :- yq(G), n(A), n(B), n(C).
         lattice lb(G, min D).
         lb(G, D) :- d(G, D).
         lb(G, 1) :- big(a0, a0, a0, G).
         lattice lf(G, min Y).
         lf(G, Y) :- fv(G, X), Y is X + 1.
         rc(X, Y) :- e(X, Y).
         rc(X, Z) :- rc(X, Y), e(Y, Z).",
    );
    let lats = ["lo", "lb", "lf"];
    let rows = |st: &str| -> Vec<String> {
        st.lines().filter(|l| lats.iter().any(|r| l.starts_with(&format!("{r}[")))).map(|l| l.split(' ').next().unwrap().to_string()).collect()
    };
    let mut base = fresh(false);
    base.load(&src, None).unwrap();
    let mut full = base.fork();
    assert!(!full.evaluate().unwrap().partial);
    let whole: std::collections::HashSet<String> = rows(&state(&full)).into_iter().collect();
    for l in ["lo[main](h,4)", "lb[main](h,9)", "lf[main](h,3)"] {
        assert!(whole.contains(l), "the whole evaluation has no {l}");
    }
    for l in ["lo[main](g,", "lb[main](g,", "lf[main](g,"] {
        assert!(!whole.iter().any(|x| x.starts_with(l)), "the whole evaluation values a cell a hole left open: {l}");
    }
    for space in [false, true] {
        let (mut n, mut cuts) = (1, 0);
        loop {
            let mut s = base.fork();
            if space {
                s.eval.space = n;
            } else {
                s.eval.budget = n;
            }
            if !s.evaluate().unwrap_or_else(|e| panic!("wall {n}: {}", rofl::describe(&e))).partial {
                break;
            }
            cuts += 1;
            let st = state(&s);
            let wall = if space { "space_exhausted" } else { "budget_exhausted" };
            for row in rows(&st) {
                let rel = row.split('[').next().unwrap();
                let bound = st.lines().any(|l| l.starts_with(&format!("hole[$kernel]($lattice({rel}),{wall})")));
                assert!(whole.contains(&row) || bound, "{wall} at {n}: {row} is no row of the whole evaluation and stands under no wall hole");
            }
            n += 1;
            assert!(n < 200_000, "no wall lets the evaluation finish");
        }
        assert!(cuts > 50, "the {} wall cut only {cuts} times", if space { "space" } else { "budget" });
    }
}

/// A CELL IS NAMED WITH ITS TICK. A count read by an `@next` rule is sealed
/// again every tick under one rule, position and key; before the tick was
/// part of the name, a snapshot re-pointed an earlier tick's firing at the
/// last cell of that name, and `why` then printed the later count beside the
/// earlier comparison. Opened without evaluating, the world must be the same
/// world and explain itself the same way.
#[test]
fn a_cell_keeps_its_tick_through_a_snapshot() {
    let mut s = fresh(false);
    s.load(
        "edb(q). edb(go). q(1). q(2). go(1).
         flag()@next :- N is count(B : q(B)), N > 1.
         q(3)@next :- go(1).
         q(B)@next :- q(B).",
        None,
    )
    .unwrap();
    s.tick().unwrap();
    s.tick().unwrap();
    s.evaluate().unwrap();
    // the second tick is quiescent, so the world stands at tick 1 with a
    // tick-0 firing and a tick-1 cell of the same rule, position and key
    assert_eq!(s.eval.store.tick, 1);
    let (why, st) = (s.why("flag()").unwrap(), state(&s));
    assert!(why.contains("count("), "flag() rests on a count: {why}");
    // every tick's count is in the state under a name of its own
    let names: Vec<&str> = st.lines().filter(|l| l.starts_with("cell ")).map(|l| l.split(' ').nth(1).unwrap()).collect();
    let mut dedup = names.clone();
    dedup.sort();
    dedup.dedup();
    assert_eq!(dedup.len(), names.len(), "two cells under one name: {names:?}");
    let mut back = Session::open(&s.save(), BUDGET).unwrap();
    assert_eq!(state(&back), st, "opened, not evaluated: the same state");
    assert_eq!(back.why("flag()").unwrap(), why, "opened, not evaluated: the same explanation");
}

/// AN ENDED TICK TAKES ITS UNCITED CELLS WITH IT. Only a cell some live
/// firing cites outlives the tick it was sealed in; the state is read at the
/// boundary, before any evaluation of the new tick could collect them.
#[test]
fn an_ended_tick_keeps_only_the_cells_it_carried() {
    let mut s = fresh(false);
    s.load(
        "edb(c). c(0).
         c(K)@next :- c(J), K is J + 1, J < 5.
         n(N) :- N is count(B : c(B)).
         seen(N)@next :- N is count(B : c(B)).",
        None,
    )
    .unwrap();
    for _ in 0..3 {
        assert!(s.tick().unwrap().advanced, "the program does not settle within three ticks");
    }
    let st = state(&s);
    // every firing's cell premises, from the snapshot: the state prints only
    // each fact's canonical witness
    let snap: serde_json::Value = serde_json::from_str(&s.save()).unwrap();
    let mut cited: Vec<String> = Vec::new();
    for f in snap["firings"].as_array().unwrap() {
        for sup in f["sup"].as_array().unwrap() {
            for p in sup["prems"].as_array().unwrap() {
                if p["t"] == "cell" {
                    cited.push(p["key"].as_str().unwrap().to_string());
                }
            }
        }
    }
    let mut old = 0;
    for l in st.lines().filter(|l| l.starts_with("cell ")) {
        let name = l.split(' ').nth(1).unwrap();
        let tick: u32 = l.split(" tick=").nth(1).unwrap().split(' ').next().unwrap().parse().unwrap();
        assert!(tick < s.eval.store.tick, "the new tick is not evaluated yet, and holds {name}");
        old += 1;
        assert!(cited.iter().any(|c| c == name), "{name} outlived tick {tick} and nothing cites it");
    }
    assert!(old > 0, "a cell carried across a tick is kept: {st}");
}

/// A SNAPSHOT'S CELL IS READ WHOLE OR REFUSED: a field missing, or a key that
/// does not spell the cell's fields, is an error and never a default.
#[test]
fn a_damaged_cell_in_a_snapshot_is_refused() {
    let mut s = fresh(false);
    s.load("edb(q). q(1). q(2). n(N) :- N is count(B : q(B)).", None).unwrap();
    s.evaluate().unwrap();
    let good = s.save();
    Session::open(&good, BUDGET).expect("the snapshot as saved opens");
    let v: serde_json::Value = serde_json::from_str(&good).unwrap();
    assert!(v["cells"].as_array().is_some_and(|c| !c.is_empty()), "the snapshot carries a cell");
    let damage: [(&str, fn(&mut serde_json::Value)); 8] = [
        ("height", |c| c["height"] = serde_json::Value::Null),
        ("tick", |c| {
            c.as_object_mut().unwrap().remove("tick");
        }),
        ("seal round", |c| c["sealed"][0]["round"] = serde_json::json!("x")),
        ("seal rel", |c| c["sealed"][0]["rel"] = serde_json::json!("")),
        ("member height", |c| c["members"][0]["height"] = serde_json::Value::Null),
        ("description", |c| c["desc"] = serde_json::json!("")),
        ("key", |c| c["key"] = serde_json::json!("$cell(r0,1,0,$nil)")),
        ("value", |c| c["value"] = serde_json::json!(true)),
    ];
    for (what, f) in damage {
        let mut bad = v.clone();
        f(&mut bad["cells"][0]);
        assert!(Session::open(&bad.to_string(), BUDGET).is_err(), "a cell with a damaged {what} was accepted");
    }
}

/// `rofl-load --space N --below F`: the space wall is the run's, so a world
/// below it cuts is not fed from outside the wall: every relation it feeds is
/// what it has no answer for, a shrug above (docs/aggregates.md, "Shrugs, as
/// built").
#[test]
fn the_world_below_is_built_under_the_run_s_walls() {
    let root = repo();
    let run = |args: &[&str]| {
        let p = std::process::Command::new(env!("CARGO_BIN_EXE_rofl-load"))
            .current_dir(&root)
            .args(args)
            .output()
            .expect("rofl-load");
        (p.status.code(), String::from_utf8_lossy(&p.stdout).into_owned(), String::from_utf8_lossy(&p.stderr).into_owned())
    };
    let game = "examples/checks/agg-wfs-game.rofl";
    let (code, out, _) = run(&["--below", game, "boot.rofl", "examples/checks/agg-cell-wfs-check.rofl"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("wg_win[main](c)"), "unwalled, the world below is fed");
    let (code, out, err) = run(&["--space", "100", "--below", game, "boot.rofl"]);
    assert_eq!(code, Some(0), "{err}");
    assert!(out.contains("hole[$kernel]($below(wg_win,$any,$any),left_out_below)"), "the cut world below is fed as a shrug");
    assert!(!out.contains("wg_win[main]("), "no row of the cut world below is fed as an answer");
}

/// THE PRODUCT OPENER GIVES THE WALLS TOO (f_a_snapshot_carries_the_world_not_its_walls):
/// rofl-serve's `open` and `fresh` take `space`, `retainTicks` and `mode`, so
/// a snapshot reopened through it is evaluated under the walls it was saved
/// under, not the defaults.
#[test]
fn rofl_serve_opens_a_snapshot_under_the_walls_it_is_given() {
    use std::io::Write;
    let root = repo();
    let mut s = Session::fresh(BUDGET);
    s.load(&read(&root.join("boot.rofl")), None).expect("boot");
    s.load(&read(&root.join("examples/checks/agg-wfs-game.rofl")), None).expect("the world");
    let path = std::env::temp_dir().join(format!("rofl_serve_walls_{}.seed.json", std::process::id()));
    std::fs::write(&path, s.save()).unwrap();
    let seed = path.to_str().unwrap().replace('\\', "\\\\");
    let reqs = [
        format!(r#"{{"op":"open","seedPath":"{seed}","id":1}}"#),
        r#"{"op":"evaluate","session":1,"id":2}"#.to_string(),
        format!(r#"{{"op":"open","seedPath":"{seed}","space":100,"retainTicks":2,"mode":"strata","id":3}}"#),
        r#"{"op":"evaluate","session":2,"id":4}"#.to_string(),
        r#"{"op":"fresh","space":7,"id":5}"#.to_string(),
        r#"{"op":"evaluate","session":3,"id":6}"#.to_string(),
        format!(r#"{{"op":"open","seedPath":"{seed}","mode":"sideways","id":7}}"#),
        format!(r#"{{"op":"open","seedPath":"{seed}","space":-1,"id":8}}"#),
    ];
    let mut p = std::process::Command::new(env!("CARGO_BIN_EXE_rofl-serve"))
        .current_dir(&root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("rofl-serve");
    p.stdin.take().unwrap().write_all((reqs.join("\n") + "\n").as_bytes()).unwrap();
    let out = String::from_utf8(p.wait_with_output().unwrap().stdout).unwrap();
    let _ = std::fs::remove_file(&path);
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(lines.len(), reqs.len(), "{out}");
    assert!(lines[1].contains(r#""partial":false"#) && lines[1].contains(r#""space":500000"#), "unwalled: {}", lines[1]);
    assert!(lines[3].contains(r#""partial":true"#) && lines[3].contains(r#""space":100"#), "walled: {}", lines[3]);
    assert!(lines[5].contains(r#""space":7"#), "a fresh world takes its walls: {}", lines[5]);
    assert!(lines[6].contains(r#""ok":false"#) && lines[6].contains("mode"), "{}", lines[6]);
    assert!(lines[7].contains(r#""ok":false"#) && lines[7].contains("space"), "{}", lines[7]);
}
