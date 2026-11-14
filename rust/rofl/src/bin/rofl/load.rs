// `rofl load`: build a world from .rofl TEXT and print canonicalState; with
// `--seed` (seed.rs) the world comes from a snapshot instead.
//   rofl load [--ticks N] [--budget N] [--space N] [--strata] [--explain] [--save F] [--below F]... [--retain N] [--retract L]...
//             [--why L]... [--why-all L]... [--whynot L]... [--whynot-all L]... [--excise F]... [--depth N] [--nodes N] [--state]
//             [--propose-structures [--structures-min-rows N]] [--kept F [--anew]]
//             boot.rofl file.rofl...
// `--kept F` keeps the world at F once it is evaluated, and a later run answers from F without evaluating while
// nothing it was kept from has moved; a stale F is refused, and `--anew` evaluates it again (kept.rs).
// `--strata` runs the stock evaluator, which reads `stratum/2`; `--explain`
// answers the world's `explain_request` rows after the first evaluation and
// evaluates again (`Session::explain_requests`); `--save` writes the world's
// snapshot (`Session::save`) to F, which is how a TypeScript check gets a
// store only this engine can build. `--below F`, repeated, builds a world of
// boot.rofl and those files, evaluates it, and feeds what it concludes to
// this one before it evaluates (`Session::feed_below`), under the same
// `--budget`, `--space` and `--strata`; `--retain N` keeps the
// provenance of the last N completed ticks (`retain_ticks`). `--retract L`, repeated,
// retracts the base fact L after the first evaluation, in order, by `Session::retract_delta`
// (the cells it supported are updated, the world is not evaluated again) and prints the
// state the world is left in; with `--ticks N` the ticks run after the last retraction, so what
// the retractions left staged `@next` is seen at the boundary.
//
// A QUESTION REPLACES THE DUMP. With any `--why`, `--why-all`, `--whynot` or
// `--excise` the answers are printed, in the order the flags were given, each
// followed by one empty line; `--state` puts the dump back, before them. The
// answers are the reference's text (src/api.ts, and the REPL's `- `/`+ ` lines
// for excise). `--depth` and `--nodes` bound every `--whynot` as the
// protocol's fields do (`WhynotBounds::clamped`). A why of a fact that does
// not hold, or a refused question, prints its message as the answer and the
// exit code is 4.
use rofl::engine::WhynotBounds;
use rofl::session::Session;

enum Q { Ask(String), Why(String), WhyAll(String), Whynot(String), WhynotAll(String), Excise(String) }

/// What a run ends in, one code each (docs/cli.md): the call was wrong, a file or the world or the question was
/// refused, the answer is short of the whole, or the engine failed.
pub const USAGE: i32 = 1;
pub const FILE_REFUSED: i32 = 2;
pub const WORLD_REFUSED: i32 = 3;
pub const QUESTION_REFUSED: i32 = 4;
pub const PARTIAL: i32 = 5;
pub const DEFECT: i32 = 70;

/// The end of a run that did not answer: its message, on stdout as `{"ok":false,...}` under `--json` and on stderr
/// besides, and its code.
fn fail(json: bool, code: i32, msg: &str) -> ! {
    if json { println!("{}", serde_json::json!({ "ok": false, "error": msg, "exit": code })); }
    eprintln!("{msg}");
    std::process::exit(code)
}

/// A numeric flag's value. Every one of them fails the same way: a message
/// naming the flag and what it takes, and exit 1 — a value that does not
/// parse as the flag's type (a word, `1e6`, a negative count, a count past
/// its range) is never a panic and never silently a default.
fn number<T: std::str::FromStr>(flag: &str, v: String, takes: &str) -> T {
    v.parse::<T>().unwrap_or_else(|_| { eprintln!("{flag} takes {takes}, not {v:?}"); std::process::exit(1) })
}

/// A refusal ends the run, and a world refused for a broken promise is asked again first: it must refuse again,
/// never answer (`function` is judged until the world is fixed).
fn refuse(s: &mut Session, json: bool, msg: String) -> ! {
    if msg.contains("has two values in the book") && s.eval.ensure().is_ok() {
        fail(json, DEFECT, "a broken world was answered after its refusal");
    }
    fail(json, if msg.starts_with("defect:") { DEFECT } else { WORLD_REFUSED }, &msg)
}

/// An ask in the REPL's words with the sentences off (src/repl.ts `?`): each row's bindings, sorted, `(empty)` for
/// none, each shrug with its line, and a last line when the rows may be short of an answer.
fn ask_text(a: &rofl::session::Answer) -> String {
    let said = |row: &[String]| if a.vars.is_empty() { "true".to_string() } else { a.vars.iter().zip(row).map(|(v, x)| format!("{v} = {x}")).collect::<Vec<_>>().join(", ") };
    let mut rows: Vec<String> = a.rows.iter().map(|r| said(r)).collect();
    rows.sort_by(|x, y| rofl::term::cmp_js(x, y));
    rows.dedup();
    if rows.is_empty() && a.shrugs.is_empty() { rows.push("(empty)".into()); }
    rows.extend(a.shrugs.iter().map(|(r, line)| format!("? {}  {line}", said(r))));
    if a.partial { rows.push("[partial: budget exhausted, hole emitted]".into()); }
    rows.join("\n")
}

pub fn main(args: Vec<String>) {
    let json = args.iter().any(|a| a == "--json");
    let args: Vec<String> = args.into_iter().filter(|a| a != "--json").collect();
    run(json, args, None, rofl::brk!("kept_load_reads_cache" => true; false))
}

/// A question verb (`rofl ask|why|whynot|excise`): `rofl load` with its question, keeping its world by itself.
pub fn verb(args: Vec<String>) {
    let json = args.iter().any(|a| a == "--json");
    let args: Vec<String> = args.into_iter().filter(|a| a != "--json").collect();
    run(json, args, None, rofl::brk!("kept_verbs_compute" => false; true))
}

/// Each `scan_failed(Kind, Path, Message)` the world holds, written out: from this run's scans, and from the world
/// itself for one answered from a kept world.
fn failed_scans(s: &mut Session) -> Vec<String> {
    let mut out: Vec<String> = s.eval.scans.iter().filter(|r| r.unit.starts_with("scan_failed(")).map(|r| r.unit.trim().trim_end_matches('.').to_string()).collect();
    if let Ok(a) = s.ask("scan_failed(K, P, M)") {
        out.extend(a.rows.iter().map(|r| format!("scan_failed({})", r.join(", "))));
    }
    out.sort();
    out.dedup();
    out
}

/// The scans the world loaded, each with the base facts it brought.
fn scan_units(s: &mut Session) -> Vec<crate::kept::ScanUnit> {
    let recs = s.eval.scans.clone();
    recs.iter().map(|r| crate::kept::ScanUnit::of(s, r)).collect()
}

/// The disk wall for a world its cache gives `most` bytes: room left for what a cut keeps beyond the wall.
fn wall(most: u64) -> i64 {
    let m = most.min(i64::MAX as u64) as i64;
    m - m / (rofl::engine::CUT_ROOM + 1)
}

/// A world that stopped at the disk wall and could not be kept there (what its cut held did not fit): its answers
/// are not left partial for a world nobody keeps, it goes on to its end, `said` first.
fn to_the_end(s: &mut Session, budget: i64, json: bool, said: &str) {
    eprintln!("{said}; it was evaluated to its end, and is not kept");
    s.eval.disk = i64::MAX;
    if let Err(e) = s.resume(budget - s.eval.steps) { refuse(s, json, rofl::describe(&e)); }
}

/// The words of a kept world's record as a reader of a message knows them.
fn said(args: &[String]) -> String {
    args.iter().map(|a| crate::kept::shown(a)).collect::<Vec<_>>().join(" ")
}

/// The flags of a run, parsed.
struct Opts {
    json: bool,
    implicit: bool,
    ticks: u32,
    budget: i64,
    files: Vec<String>,
    strata: bool,
    explain: bool,
    save: Option<String>,
    space: Option<i64>,
    below: Vec<String>,
    retain: Option<u32>,
    retracts: Vec<String>,
    qs: Vec<Q>,
    state: bool,
    propose: bool,
    min_rows: usize,
    depth: Option<i64>,
    nodes: Option<i64>,
    kept: Option<String>,
    anew: bool,
    world_given: bool,
}

/// What the slot of a question verb's world held: a world opened, one that stopped at the disk wall, or a stale one.
struct Slot {
    opened: Option<Session>,
    cut: Option<(u64, String, crate::kept::Record)>,
    stale: Option<(String, crate::kept::Record, String)>,
}

/// A stale kept world taken by delta: what the run says of it, and what keeping it again records.
struct Taken {
    said: String,
    units: Vec<crate::kept::Unit>,
    scans: Vec<crate::kept::ScanUnit>,
    from: String,
}

/// The flags of a run, as the words it was given.
fn parse(json: bool, args: &[String], implicit: bool) -> Opts {
    let mut ticks = 0u32;
    // `Session::fresh` has always taken the budget; this binary hard-coded one
    // and so could not answer about a world that runs out. A world with a
    // budget was checked by ONE engine for exactly that reason.
    let mut budget: i64 = 200_000_000;
    let mut files: Vec<String> = Vec::new();
    let (mut strata, mut explain) = (false, false);
    let mut save: Option<String> = None;
    let mut space: Option<i64> = None;
    let mut below: Vec<String> = Vec::new();
    let mut retain: Option<u32> = None;
    let mut retracts: Vec<String> = Vec::new();
    let mut qs: Vec<Q> = Vec::new();
    let mut state = false;
    let mut propose = false;
    let mut min_rows = 2usize;
    let (mut depth, mut nodes): (Option<i64>, Option<i64>) = (None, None);
    let (mut kept, mut anew, mut world_given) = (None::<String>, false, false);
    let mut i = 0;
    while i < args.len() {
        let value = |i: &mut usize| {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| { eprintln!("{} needs a value", args[*i - 1]); std::process::exit(1) })
        };
        world_given |= matches!(args[i].as_str(), "--ticks" | "--budget" | "--space" | "--strata" | "--explain" | "--below" | "--retain" | "--retract") || !args[i].starts_with("--");
        match args[i].as_str() {
            "--kept" => kept = Some(value(&mut i)),
            "--anew" => anew = true,
            "--ticks" => ticks = number("--ticks", value(&mut i), "a count of ticks"),
            "--budget" => { budget = number("--budget", value(&mut i), "an integer") }
            "--space" => {
                let v = value(&mut i);
                let n: i64 = number("--space", v.clone(), "a positive number of rows");
                if n <= 0 { eprintln!("--space takes a positive number of rows, not {v:?}"); std::process::exit(1) }
                space = Some(n)
            }
            "--strata" => strata = true,
            "--explain" => explain = true,
            "--save" => save = Some(value(&mut i)),
            "--below" => below.push(value(&mut i)),
            "--retain" => retain = Some(number("--retain", value(&mut i), "a count of ticks")),
            "--retract" => retracts.push(value(&mut i)),
            "--ask" => qs.push(Q::Ask(value(&mut i))),
            "--why" => qs.push(Q::Why(value(&mut i))),
            "--why-all" => qs.push(Q::WhyAll(value(&mut i))),
            "--whynot" => qs.push(Q::Whynot(value(&mut i))),
            "--whynot-all" => qs.push(Q::WhynotAll(value(&mut i))),
            "--excise" => qs.push(Q::Excise(value(&mut i))),
            "--depth" => depth = Some(number("--depth", value(&mut i), "an integer")),
            "--nodes" => nodes = Some(number("--nodes", value(&mut i), "an integer")),
            "--state" => state = true,
            "--propose-structures" => propose = true,
            "--structures-min-rows" => min_rows = number("--structures-min-rows", value(&mut i), "a count of rows"),
            _ => files.push(args[i].clone()),
        }
        i += 1;
    }
    Opts { json, implicit, ticks, budget, files, strata, explain, save, space, below, retain, retracts, qs, state, propose, min_rows, depth, nodes, kept, anew, world_given }
}

/// The walls and files of a world, canonical: what a kept world is kept from.
fn world_words(o: &Opts) -> Vec<String> {
    let mut world: Vec<String> = Vec::new();
    if o.ticks > 0 { world.extend(["--ticks".into(), o.ticks.to_string()]); }
    world.extend(["--budget".into(), o.budget.to_string()]);
    if let Some(n) = o.space { world.extend(["--space".into(), n.to_string()]); }
    if o.strata { world.push("--strata".into()); }
    if o.explain { world.push("--explain".into()); }
    for b in &o.below { world.extend(["--below".into(), crate::kept::absolute(b)]); }
    if let Some(n) = o.retain { world.extend(["--retain".into(), n.to_string()]); }
    for r in &o.retracts { world.extend(["--retract".into(), r.clone()]); }
    world.extend(o.files.iter().map(|f| crate::kept::absolute(f)));
    world
}

/// The last words of a world: its files.
fn files_of<'a>(o: &Opts, world: &'a [String]) -> &'a [String] {
    &world[world.len() - o.files.len()..]
}

/// The record of the kept world at `k`, and whether it was kept by this build.
fn check_kept(k: &str) -> Result<(bool, crate::kept::Record), String> {
    rofl::volume::check_seen(k, crate::kept::seen().as_deref()).and_then(|c| crate::kept::parse(&c.note).map(|r| (c.this_build, r)).ok_or_else(|| format!("{k}: not a world kept by `rofl --kept`")))
}

/// The slot of a question verb's world, when it keeps its world by itself (docs/cli.md).
fn question_slot(o: &Opts, world: &[String]) -> Option<String> {
    // A QUESTION VERB KEEPS ITS WORLD BY ITSELF (docs/cli.md): under a name made of its walls and files, the
    // environment and the engine, opened while nothing else it read has moved, else computed anew and kept over
    // it, said in one line. Never `rofl load`, `rofl serve` or a harness: a gate computes.
    if o.implicit && o.kept.is_none() && o.save.is_none() && !o.files.is_empty() {
        crate::kept::slot(world, files_of(o, world))
    } else {
        None
    }
}

/// A run; `pre` is the kept world's record when the run took its files from it; `implicit`, a question verb's.
fn run(json: bool, args: Vec<String>, mut pre: Option<(bool, crate::kept::Record)>, implicit: bool) {
    let o = parse(json, &args, implicit);
    let world = world_words(&o);
    if o.anew && o.kept.is_none() { fail(json, USAGE, "--anew computes a kept world anew: name it with --kept F"); }
    let mut opened = None;
    if let Some(k) = &o.kept {
        if o.save.is_some() { fail(json, USAGE, "--kept and --save are two ways to keep a world: give one"); }
        let exists = std::path::Path::new(k).exists();
        if !o.world_given {
            // no files and no walls: the world is the one the kept file was kept from
            if !exists { fail(json, USAGE, &format!("{k}: no world is kept there; name the files of the world to keep it")); }
            let (this_build, r) = check_kept(k).unwrap_or_else(|e| fail(json, FILE_REFUSED, &(if o.anew { format!("{e}; name the files of the world to compute it anew") } else { e })));
            let mut again = args;
            again.extend(r.args.iter().cloned());
            return run(json, again, Some((this_build, r)), implicit);
        }
        if exists && !o.anew {
            opened = Some(open_kept(&o, &world, k, pre.take()));
        }
    }
    let slot = question_slot(&o, &world);
    if opened.is_none() && by_volumes(&o) {
        if let Some(code) = answer_by_volumes(&o, &world, &slot) { std::process::exit(code); }
    }
    let found = open_slot(&o, &world, &slot);
    let mut opened = opened.or(found.opened);
    let mut by_delta = None;
    if let Some(stale) = found.stale {
        if let Some((t, d)) = take_by_delta(&o, &world, stale) {
            opened = Some(t);
            by_delta = Some(d);
        }
    }
    // a kept world that asked a cone answers no question that needs every rule: it is evaluated anew
    let opened = opened.and_then(|mut k| (!(o.implicit && question_rels(&o).is_none() && !asked(&mut k).is_empty())).then_some(k));
    let from_disk = opened.is_some();
    let mut s = opened.unwrap_or_else(|| Session::fresh(o.budget));
    set_walls(&o, &mut s);
    if let (Some(cut), Some(p)) = (found.cut, &slot) { resume_disk_wall(&o, &world, &mut s, p, cut); }
    if let (Some(d), Some(p)) = (&by_delta, &slot) { keep_taken(&o, &world, &mut s, p, d); }
    if !from_disk { build_world(&o, &world, &mut s, &slot); } else { grow_cone(&o, &mut s); }
    if let Some(f) = &o.save {
        std::fs::write(f, s.save()).unwrap_or_else(|e| fail(json, USAGE, &format!("{f}: {e}")));
    }
    if o.propose { propose_report(&mut s, o.min_rows); return; }
    if let Some(t) = s.eval.heap_said() { eprintln!("{t}"); }
    let cut = s.eval.store.partial_eval;
    if o.qs.is_empty() || o.state { print_state(&o, &mut s, cut); }
    let (refused, partial) = answers(&mut s, &o, cut);
    if refused { std::process::exit(QUESTION_REFUSED); }
    if partial && !o.qs.is_empty() { std::process::exit(PARTIAL); }
}

/// The kept world `k`, opened when its files and walls are this run's and nothing it was kept from has moved; else refused.
fn open_kept(o: &Opts, world: &[String], k: &str, pre: Option<(bool, crate::kept::Record)>) -> Session {
    let json = o.json;
    let (this_build, r) = pre.map_or_else(|| check_kept(k), Ok).unwrap_or_else(|e| fail(json, FILE_REFUSED, &e));
    if rofl::brk!("kept_stale_args" => false; r.args != world) {
        fail(json, FILE_REFUSED, &format!("{k} is stale: it was kept from `{}`, and this run names `{}`; run again with --anew to compute it anew", said(&r.args), said(world)));
    }
    if let Some(m) = crate::kept::moved(&r, this_build) {
        fail(json, FILE_REFUSED, &format!("{k} is stale: {m}; run again with --anew to compute it anew"));
    }
    Session::open_volume(k, o.budget).unwrap_or_else(|e| fail(json, FILE_REFUSED, &format!("{k} is damaged: {e}")))
}

/// The slot of a question verb's world, opened while it is still this one; else the stale one, or the one that stopped
/// at the disk wall.
fn open_slot(o: &Opts, world: &[String], slot: &Option<String>) -> Slot {
    let mut found = Slot { opened: None, cut: None, stale: None };
    if let Some(p) = slot.as_ref().filter(|p| std::path::Path::new(p).exists()) {
        let checked = rofl::volume::check_seen(p, crate::kept::seen().as_deref()).and_then(|c| crate::kept::parse(&c.note).map(|r| (c.this_build, r, c.note)).ok_or_else(|| format!("{p}: not a kept world")));
        match checked.map(|(b, r, n)| (crate::kept::moved(&r, b), r, n)) {
            Ok((None, r, note)) => match Session::open_volume(p, o.budget) {
                Ok(s) => {
                    crate::kept::touch(p);
                    found.opened = Some(s);
                    found.cut = r.cut.map(|c| (c, note, r));
                }
                Err(e) => eprintln!("{p} is damaged: {e}; computed anew"),
            },
            Ok((Some(m), _, _)) if crate::kept::missing(&m) => eprintln!("the kept world {p} is stale: {m}"),
            Ok((Some(m), r, _)) if r.cut.is_some() => eprintln!("the kept world {p} is stale: {m}; computed anew, not by delta: it stopped at the disk cap"),
            Ok((Some(m), r, _)) => found.stale = Some((p.clone(), r, m)),
            Err(e) => eprintln!("{e}; computed anew"),
        }
    } else if let Some(p) = slot {
        found.stale = crate::delta::base_beside(p, &world[..world.len() - o.files.len()], files_of(o, world)).filter(|(_, r)| r.cut.is_none()).map(|(q, r)| (q, r, "the files named are others".into()));
    }
    found
}

/// A stale kept world taken by delta (delta.rs): the files that changed, came or went, and nothing else. When that cannot
/// be done it is said on stderr, and the world is computed anew.
fn take_by_delta(o: &Opts, world: &[String], stale: (String, crate::kept::Record, String)) -> Option<(Session, Taken)> {
    let (q, r, m) = stale;
    let t0 = std::time::Instant::now();
    let opened_q = rofl::volume::check_seen(&q, crate::kept::seen().as_deref()).map_err(|e| e.to_string()).and_then(|_| Session::open_volume(&q, o.budget));
    let done = opened_q.and_then(|mut t| {
        set_walls(o, &mut t);
        crate::delta::apply(&mut t, &r, files_of(o, world)).map(|d| (t, d))
    });
    match done {
        Ok((t, d)) => {
            let said = format!("the kept world took {} by delta: {} ({} facts out, {} overdeleted or derived again; opened and taken in {} ms", if d.took.len() == 1 { "1 file".to_string() } else { format!("{} files", d.took.len()) }, d.took.join(", "), d.out, d.touched, t0.elapsed().as_millis());
            Some((t, Taken { said, units: d.units, scans: d.scans, from: q }))
        }
        Err(why) => {
            eprintln!("the kept world {q} is stale: {m}; computed anew, not by delta: {why}");
            None
        }
    }
}

/// A world taken by delta is kept again over the one it went on from, which goes unless something else keeps it.
fn keep_taken(o: &Opts, world: &[String], s: &mut Session, p: &str, t: &Taken) {
    let files_now = files_of(o, world);
    // the world it went on from: gone once this one is kept, unless this one is kept over it
    let mut gone = t.from != p;
    match crate::kept::record(world, files_now, &t.units, files_now, &t.scans, None) {
        Err(e) => eprintln!("the world is not kept: {e}"),
        Ok(note) => {
            let t1 = std::time::Instant::now();
            match crate::kept::keep_capped_over(s, p, &note, true) {
                Ok((n, over)) => {
                    gone &= !over || s.kept.files.iter().all(|b| b.path != t.from);
                    eprintln!("{}, kept again in {} ms, {n} bytes written{})", t.said, t1.elapsed().as_millis(), if over { " over the world it was kept from" } else { "" });
                }
                Err(e) => eprintln!("{}); the world is not kept: {e}", t.said),
            }
        }
    }
    if gone { let _ = std::fs::remove_file(&t.from); }
}

/// A world that stopped at the disk wall goes on from where it stopped when its cache now gives it more (w_disk_wall).
fn resume_disk_wall(o: &Opts, world: &[String], s: &mut Session, p: &str, cut: (u64, String, crate::kept::Record)) {
    let (cut, note, r) = cut;
    match crate::kept::most(p) {
        Ok(most) if most > cut => {
            let t0 = std::time::Instant::now();
            s.eval.disk = wall(most);
            let more = o.budget - s.eval.steps;
            let on = match s.resume(more) { Ok((_, on)) => on, Err(e) => refuse(s, o.json, rofl::describe(&e)) };
            let now = s.eval.disk_cut().then_some(most);
            let read: Vec<String> = r.read.iter().map(|x| x.0.clone()).collect();
            let note = crate::kept::record(world, &r.files, &r.units, &read, &scan_units(s), now).unwrap_or_else(|_| crate::kept::recut(&note, now));
            s.eval.index_for_retraction();
            let kept = crate::kept::keep_capped(s, p, &note);
            if let (Err(e), Some(_)) = (&kept, now) {
                to_the_end(s, o.budget, o.json, &format!("the kept world went on from where it stopped to the disk cap of its cache, {}, and was not kept there: {e}", crate::kept::said_size(most)));
            } else { eprintln!("the kept world had stopped at {} and the cache now gives {}: {} in {} ms{}; {}",
                crate::kept::said_size(cut), crate::kept::said_size(most),
                if on { "it went on from where it stopped" } else { "where it stopped could not be gone on from, so it was evaluated again" }, t0.elapsed().as_millis(),
                if now.is_some() { " and stopped again" } else { " to its end" },
                kept.map_or_else(|e| format!("not kept: {e}"), |n| format!("kept again, {n} bytes"))); }
        }
        _ => eprintln!("the kept world stopped at the disk cap of its cache, {} (ROFL_CACHE_GB): its answers are partial; a larger cap goes on from where it stopped", crate::kept::said_size(cut)),
    }
}

/// The walls every world of a run is evaluated under.
fn set_walls(o: &Opts, s: &mut Session) {
    s.eval.cost.on_hot = Some(|t| eprintln!("hot: {t}"));
    if o.strata { s.eval.mode = rofl::engine::Mode::Strata; }
    if let Some(n) = o.space { s.eval.space = n; }
    s.eval.retain_ticks = o.retain;
}

/// The world of a run that did not open one from disk: its files, its world below, and what it evaluates, then kept.
fn build_world(o: &Opts, world: &[String], s: &mut Session, slot: &Option<String>) {
    let sources = load_sources(o);
    // what each file brought is read now, and the texts dropped before the evaluation, not held through it
    let units = {
        let loaded = load_files(o, s, &sources);
        (o.kept.is_some() || slot.is_some()).then(|| units_of(s, &loaded))
    };
    load_below(o, s, &sources);
    let disk = disk_wall(o, s, slot);
    if let Some(rels) = question_rels(o) {
        if let Err(e) = s.assert(&asks_text(&rels)) { fail(o.json, USAGE, &e); }
    }
    evaluate_world(o, s);
    for d in &s.eval.diags { eprintln!("diag: {d}"); }
    let read: Vec<String> = sources.iter().map(|(f, _)| f.clone()).chain(o.below.iter().cloned()).collect();
    keep_loaded(o, world, s, units.unwrap_or_default(), &read, slot, disk);
}

/// A run its world answers by volumes (`engine/volumes.rs`): questions asked, of a world evaluated once, and
/// nothing else asked of it. `ROFL_VOLUMES=0` is the check harness's oracle of the whole world, `=1` of volumes
/// under VOLUMES_FROM.
fn by_volumes(o: &Opts) -> bool {
    !o.qs.is_empty() && o.qs.iter().all(|q| matches!(q, Q::Ask(_) | Q::Why(_) | Q::WhyAll(_))) && !o.state && o.ticks == 0 && o.retracts.is_empty() && !o.explain
        && o.below.is_empty() && o.kept.is_none() && o.save.is_none() && !o.propose && std::env::var("ROFL_VOLUMES").as_deref() != Ok("0")
}

/// The questions answered by volumes, with the exit code; none when the world is not one (a file alone, or its files
/// under VOLUMES_FROM) or the volumes refused it, said on stderr, and the world is then evaluated whole.
fn answer_by_volumes(o: &Opts, world: &[String], slot: &Option<String>) -> Option<i32> {
    // the volumes are kept beside the slot, a set for the question's cone
    let kept = slot.as_ref().map(|p| {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        question_rels(o).hash(&mut h);
        format!("{}.q{:016x}", p.trim_end_matches(".vol"), h.finish())
    });
    if let Some(mut s) = kept.as_ref().and_then(|k| open_volumes(o, k)) {
        eprintln!("volumes: {} answered from the kept units", o.qs.len());
        return Some(answer_volumes(o, &mut s));
    }
    let sources = load_sources(o);
    // a source gone is said by the kept world's slot, which knows it was there
    if sources.iter().any(|(f, t)| t.is_none() && !std::path::Path::new(f).exists()) { return None; }
    let texts: Vec<String> = sources.iter().map(|(f, t)| t.clone().unwrap_or_else(|| read(o.json, f))).collect();
    let cut = rofl::engine::volumes::cut(&texts.iter().map(String::as_str).collect::<Vec<_>>());
    drop(texts);
    // under VOLUMES_FROM a world is kept whole, its answer read back fastest so
    let bytes: usize = cut.files.iter().map(|(_, t)| t.len()).sum();
    if cut.files.len() < 2 || bytes < VOLUMES_FROM && std::env::var("ROFL_VOLUMES").as_deref() != Ok("1") { return None; }
    let read: Vec<String> = sources.iter().map(|(f, _)| f.clone()).collect();
    if let Some((mut s, sums)) = kept.as_ref().and_then(|k| delta_volumes(o, k, &cut)) {
        let t = std::time::Instant::now();
        let code = answer_volumes(o, &mut s);
        let t = rofl::engine::meter::spent("answers", t);
        if let Err(e) = keep_volumes(world, files_of(o, world), &read, &mut s, kept.as_deref().unwrap_or_default(), (sum(&cut.core), &sums), true) { eprintln!("the volumes are not kept: {e}"); }
        rofl::engine::meter::spent("keeps", t);
        rofl::engine::meter::write();
        return Some(code);
    }
    let mut core = Session::fresh(o.budget);
    set_walls(o, &mut core);
    if let Err(d) = core.load_all(&[cut.core.as_str()], None) {
        fail(o.json, FILE_REFUSED, &format!("refused:\n  {}", d.1.join("\n  ")));
    }
    if let Some(rels) = question_rels(o) {
        if let Err(e) = core.assert(&asks_text(&rels)) { fail(o.json, USAGE, &e); }
    }
    let mut s = match core.by_volumes(&cut.files) {
        Ok((s, st)) => {
            eprintln!("volumes: {} files settled by levels, {} facts in their units ({} ms)", st.files, st.facts, st.ms);
            if st.cooled > 0 {
                eprintln!("volumes: past a quarter of the memory this process may use, the units done were cooled to disk {} times, {} units of {} MB", st.cooled, st.cool_files, st.cool_bytes >> 20);
            }
            s
        }
        Err(e) => { eprintln!("volumes: {}; the world is evaluated whole", rofl::describe(&e)); return None; }
    };
    for d in &s.eval.diags { eprintln!("diag: {d}"); }
    if let Some(t) = rofl::engine::heap_said_over(&[&core.eval, &s.eval]) { eprintln!("{t}"); }
    let code = answer_volumes(o, &mut s);
    if let Some(k) = &kept {
        let sums: Vec<(String, u64)> = cut.files.iter().map(|(f, t)| (f.clone(), sum(t))).collect();
        if let Err(e) = keep_volumes(world, files_of(o, world), &read, &mut s, k, (sum(&cut.core), &sums), false) { eprintln!("the volumes are not kept: {e}"); }
    }
    Some(code)
}

/// The bytes of the files' facts from which a world is evaluated by volumes: below them the whole world is as fast
/// (vscode: 20 files, 10 MB).
const VOLUMES_FROM: usize = 32 << 20;

/// A file of a world kept by volumes (`<slot>.q<sum>.vol`): no world of its own to take by delta.
pub fn is_volume_of_set(p: &std::path::Path) -> bool {
    p.file_name().and_then(|n| n.to_str()).and_then(|n| n.split_once(".q")).is_some_and(|(_, r)| r.len() > 17 && r.as_bytes()[16] == b'.' && r[..16].bytes().all(|c| c.is_ascii_hexdigit()))
}

/// The reader kept at `k` over its dictionary and units, not yet reading them; none where one is missing.
fn open_reader(o: &Opts, k: &str, held: impl Fn(&crate::kept::Record, bool) -> bool) -> Option<Session> {
    let p = format!("{k}.vol");
    let dict = std::sync::Arc::new(rofl::dict::Dict::read(&format!("{k}.names")).ok()?);
    let t = std::time::Instant::now();
    let c = rofl::volume::check_seen(&p, crate::kept::seen().as_deref()).ok()?;
    rofl::engine::meter::spent("sums", t);
    if !held(&crate::kept::parse(&c.note)?, c.this_build) || !rofl::volume::has_units(k) { return None; }
    let mut s = Session::open_volume_in(&p, o.budget, Some(dict)).ok()?;
    set_walls(o, &mut s);
    Some(s)
}

/// The world kept by volumes at `k`, reading its units, when nothing it was kept from moved.
fn open_volumes(o: &Opts, k: &str) -> Option<Session> {
    Registry::read(k)?;
    let mut s = open_reader(o, k, |r, this_build| match crate::kept::moved(r, this_build) {
        Some(m) => { eprintln!("the kept volumes {k} are stale: {m}"); false }
        None => true,
    })?;
    let lv = std::sync::Arc::new(rofl::volume::open_units(k, &s.eval).map_err(|e| eprintln!("the kept units {k}: {e}")).ok()?);
    lv.read_by(&mut s.eval);
    s.eval.levels = Some(lv);
    crate::kept::touch(&format!("{k}.vol"));
    Some(s)
}

/// The reader kept at `k` (`<k>.vol`: the core it stands on), with what it was read from; beside it the names its
/// facts share (`<k>.names`), its units (`<k>.u<n>`) and the registry (`<k>.scroll`): what a later run takes by delta.
fn keep_volumes(world: &[String], files: &[String], read: &[String], s: &mut Session, k: &str, sums: (u64, &[(String, u64)]), over: bool) -> Result<(), String> {
    let units = s.eval.levels.clone();
    let note = crate::kept::record(world, files, &[], read, &[], None)?;
    let _ = std::fs::remove_file(format!("{k}.scroll"));
    let p = format!("{k}.vol");
    let near = s.eval.store.reads_none();
    // (taken by delta, it is written as an overlay over the volume it was opened from)
    let done = if over { crate::kept::keep_capped_over(s, &p, &note, true).map(drop) } else { crate::kept::keep_capped(s, &p, &note).map(drop) };
    if let Some(n) = near {
        s.eval.store.reads_again(n);
    }
    done?;
    if rofl::brk!("volumes_dict_unkept" => false; true) {
        s.eval.h.dict().ok_or("the volumes share no dictionary")?.write(&format!("{k}.names")).map_err(|e| e.to_string())?;
    }
    rofl::volume::keep_units(k, units.as_deref())?;
    Registry { core: sums.0, files: sums.1.iter().cloned().collect() }.write(k)
}

/// THE REGISTRY OF A WORLD KEPT BY VOLUMES (`<k>.scroll`): the sum of the core's text and each file with its sum.
/// Written last and whole, under another name first: the reader, its units and the dictionary are a kept world once
/// it names them. A later run reads it alone to know what moved.
struct Registry {
    core: u64,
    files: std::collections::HashMap<String, u64>,
}

impl Registry {
    fn write(&self, k: &str) -> Result<(), String> {
        let mut list = format!("scroll 3\ncore {:016x}\n", self.core);
        let mut files: Vec<_> = self.files.iter().collect();
        files.sort();
        for (f, h) in files {
            list.push_str(&format!("file {f} {h:016x}\n"));
        }
        let tmp = format!("{k}.scroll.{}.new", std::process::id());
        std::fs::write(&tmp, list).and_then(|_| std::fs::rename(&tmp, format!("{k}.scroll"))).map_err(|e| e.to_string())
    }
    fn read(k: &str) -> Option<Registry> {
        let text = std::fs::read_to_string(format!("{k}.scroll")).ok()?;
        let mut lines = text.lines();
        if lines.next()? != "scroll 3" {
            return None;
        }
        let core = u64::from_str_radix(lines.next()?.strip_prefix("core ")?, 16).ok()?;
        let files = lines.map(|l| { let (f, h) = l.strip_prefix("file ")?.split_once(' ')?; Some((f.to_string(), u64::from_str_radix(h, 16).ok()?)) }).collect::<Option<_>>()?;
        Some(Registry { core, files })
    }
}

fn sum(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut h);
    h.finish()
}

/// The world kept by volumes at `k` brought by delta to the files `cut` holds, where only the files' texts moved and
/// few of them: the units whose answer may have moved are settled again, the others stand. None, said on stderr,
/// where the core moved, a file came or went, too many files moved, or the units refuse the edit.
fn delta_volumes(o: &Opts, k: &str, cut: &rofl::engine::volumes::Cut) -> Option<(Session, Vec<(String, u64)>)> {
    let Registry { core: core_sum, files: old } = Registry::read(k)?;
    let say = |why: &str| eprintln!("the kept volumes {k} are not taken by delta: {why}; computed anew");
    if sum(&cut.core) != core_sum {
        say("the rules or the facts naming no file changed");
        return None;
    }
    let now: std::collections::HashMap<&str, &str> = cut.files.iter().map(|(f, t)| (f.as_str(), t.as_str())).collect();
    let moved: Vec<&str> = now.iter().filter(|(f, t)| old.get(**f).is_none_or(|h| *h != sum(t))).map(|(f, _)| *f).chain(old.keys().map(String::as_str).filter(|f| !now.contains_key(f))).collect();
    if moved.is_empty() || moved.len() * 8 > now.len().max(8) {
        if !moved.is_empty() { say(&format!("{} of {} files moved", moved.len(), now.len())); }
        return None;
    }
    if old.len() != now.len() || moved.iter().any(|f| !old.contains_key(*f)) {
        say("a file came or went");
        return None;
    }
    let t = std::time::Instant::now();
    let mut s = open_reader(o, k, |r, this_build| r.engine_env_hold(this_build).is_none() && r.scans.is_empty())?;
    let before = rofl::volume::open_units(k, &s.eval).map_err(|e| say(&e)).ok()?;
    let named: std::collections::HashMap<u64, (&str, &str)> = now.iter().filter_map(|(f, t)| Some((u64::from_str_radix(f, 16).ok()?, (*f, *t)))).collect();
    let files: Vec<(String, String)> = before.files().iter().map(|h| named.get(h).map(|(f, t)| (f.to_string(), t.to_string()))).collect::<Option<_>>().or_else(|| { say("a file came or went"); None })?;
    let changed = files.iter().enumerate().filter(|(_, (f, _))| moved.contains(&f.as_str())).map(|(i, _)| i as u32).collect();
    before.named_by(&mut s.eval);
    let (st, joins) = s.eval.level_stage();
    s.eval.store.settled = s.eval.store.len_ids();
    // (the check harness's oracle: how many units meet in one)
    let lv = match s.eval.fork().by_levels(&files, &st, joins, Some(rofl::engine::levels::Edit(&before, changed))) {
        Ok(lv) => lv,
        Err(e) => { say(&rofl::describe(&e)); return None; }
    };
    let (again, same) = lv.again.unwrap_or_default();
    eprintln!("volumes: {} of {} files edited; {again} of {} units settled again, {same} of them concluding what they had ({} ms)", moved.len(), files.len(), lv.tops.iter().map(|t| t.count()).sum::<usize>(), t.elapsed().as_millis());
    rofl::engine::meter::spent("units", t);
    for d in &lv.said { eprintln!("diag: {d}"); }
    lv.read_by(&mut s.eval);
    s.eval.levels = Some(std::sync::Arc::new(lv));
    let mut sums: Vec<(String, u64)> = files.iter().map(|(f, t)| (f.clone(), sum(t))).collect();
    sums.sort();
    Some((s, sums))
}

/// Every question answered by the reader. Returns the exit code.
fn answer_volumes(o: &Opts, s: &mut Session) -> i32 {
    let (refused, partial) = answers(s, o, false);
    if refused { QUESTION_REFUSED } else if partial { PARTIAL } else { 0 }
}

/// The relations a question verb's questions name, which its world asks (docs/demand-cones.md) as a notebook asks
/// its lines': none for a run that needs every rule (an excise, the state, ticks, retractions, explanations).
fn question_rels(o: &Opts) -> Option<Vec<String>> {
    if !o.implicit || o.qs.is_empty() || o.state || o.ticks != 0 || !o.retracts.is_empty() || o.explain { return None; }
    // and what the session reads after each evaluation: the scans and the adapters' wants it is asked for
    let mut rels: Vec<String> = ["scan_request", "want_of", "permit"].map(String::from).to_vec();
    for q in &o.qs {
        match q {
            Q::Ask(l) | Q::Why(l) | Q::WhyAll(l) | Q::Whynot(l) | Q::WhynotAll(l) => rels.extend(heads_of(l)),
            Q::Excise(_) => return None,
        }
    }
    if rels.len() == 3 { return None; }
    rels.sort();
    rels.dedup();
    Some(rels)
}

/// The relation names of a question's literals: each name outside parentheses that a `(` or `[` follows.
fn heads_of(l: &str) -> Vec<String> {
    let (b, mut out, mut depth, mut i) = (l.as_bytes(), Vec::new(), 0i32, 0);
    while i < b.len() {
        match b[i] {
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b'"' => { i += 1; while i < b.len() && b[i] != b'"' { if b[i] == b'\\' { i += 1; } i += 1; } }
            c if depth == 0 && c.is_ascii_lowercase() && (i == 0 || !(b[i - 1].is_ascii_alphanumeric() || b[i - 1] == b'_' || b[i - 1] == b'$')) => {
                let at = i;
                while i + 1 < b.len() && (b[i + 1].is_ascii_alphanumeric() || b[i + 1] == b'_') { i += 1; }
                if matches!(b.get(i + 1), Some(b'(' | b'[')) { out.push(l[at..=i].to_string()); }
            }
            _ => {}
        }
        i += 1;
    }
    out
}

fn asks_text(rels: &[String]) -> String {
    rels.iter().map(|r| format!("asks({r}).\n")).collect()
}

/// The relations a world asks.
fn asked(s: &mut Session) -> Vec<String> {
    let e = &mut s.eval;
    e.store.rel_all(&e.h, e.v.asks).into_iter().filter_map(|f| e.store.args(f).first().and_then(|t| t.as_atom()).map(|a| e.h.name(a).to_string())).collect()
}

/// A kept world asked for less than the question needs grows its cone over what it holds, by delta; one that asks
/// nothing holds every rule already.
fn grow_cone(o: &Opts, s: &mut Session) {
    let Some(rels) = question_rels(o) else { return };
    let had = asked(s);
    let more: Vec<String> = rels.into_iter().filter(|r| !had.contains(r)).collect();
    if had.is_empty() || more.is_empty() { return; }
    if let Err(e) = s.assert_delta(&asks_text(&more)) { fail(o.json, USAGE, &e); }
    if s.eval.store.dirty {
        if let Err(e) = s.evaluate() { refuse(s, o.json, rofl::describe(&e)); }
    }
}

/// The sources of the files named: a `.rofl.md` world is read into its rules, after the worlds it reads.
fn load_sources(o: &Opts) -> Vec<(String, Option<String>)> {
    // a world written as Markdown is read into rules here, after the worlds it reads; a plain `.md` is a document
    let mut sources: Vec<(String, Option<String>)> = Vec::new();
    for f in &o.files {
        if f.ends_with(".rofl.md") {
            for w in rofl::md::world_files(std::path::Path::new(f)).unwrap_or_else(|e| fail(o.json, USAGE, &e)) {
                match w {
                    rofl::md::Source::File(p) => sources.push((p.display().to_string(), None)),
                    rofl::md::Source::Md(p) => {
                        let r = rofl::md::read_world(&p).unwrap_or_else(|e| fail(o.json, USAGE, &e));
                        if let Some(u) = rofl::md::unread(&r.report) { eprintln!("{}: {u}", p.display()); }
                        sources.push((p.display().to_string(), Some(r.rofl)));
                    }
                }
            }
        } else if f.ends_with(".md") {
            fail(o.json, FILE_REFUSED, &format!("{f} is a document, not a world: executable Markdown ends in .rofl.md"));
        } else { sources.push((f.clone(), None)); }
    }
    sources
}

/// Each source loaded into the world, refused with its diagnostics; returned with its text, for what it asserts.
fn load_files(o: &Opts, s: &mut Session, sources: &[(String, Option<String>)]) -> Vec<(String, String)> {
    let loaded: Vec<(String, String)> = sources.iter().map(|(f, text)| (f.clone(), text.clone().unwrap_or_else(|| read(o.json, f)))).collect();
    let texts: Vec<&str> = loaded.iter().map(|(_, t)| t.as_str()).collect();
    if let Err((i, d)) = s.load_all(&texts, None) {
        fail(o.json, FILE_REFUSED, &format!("{} refused:\n  {}", loaded[i].0, d.join("\n  ")));
    }
    loaded
}

/// The world below (`--below`), built and evaluated under the run's walls, and fed to this one before it evaluates.
fn load_below(o: &Opts, s: &mut Session, sources: &[(String, Option<String>)]) {
    if o.below.is_empty() { return; }
    // the walls are the run's: the world below is built under them too
    let mut b = Session::fresh(o.budget);
    if o.strata { b.eval.mode = rofl::engine::Mode::Strata; }
    if let Some(n) = o.space { b.eval.space = n; }
    let files: Vec<&String> = sources.iter().take(1).map(|x| &x.0).chain(o.below.iter()).collect();
    let texts: Vec<String> = files.iter().map(|f| read(o.json, f)).collect();
    if let Err((i, d)) = b.load_all(&texts.iter().map(String::as_str).collect::<Vec<_>>(), None) {
        fail(o.json, FILE_REFUSED, &format!("below: {} refused:\n  {}", files[i], d.join("\n  ")));
    }
    if let Err(e) = b.evaluate() { refuse(&mut b, o.json, format!("below: {}", rofl::describe(&e))); }
    if let Err(e) = s.feed_below(&mut b) { fail(o.json, WORLD_REFUSED, &format!("below: {e}")); }
}

/// The disk wall: a question verb's world stops where its volume would pass what the cache gives it, when what it is
/// given already fits; a world that ticks, retracts or explains is evaluated whole as before.
fn disk_wall(o: &Opts, s: &mut Session, slot: &Option<String>) -> Option<u64> {
    let disk = slot.as_ref().filter(|_| o.ticks == 0 && o.retracts.is_empty() && !o.explain && o.below.is_empty())
        .and_then(|p| crate::kept::most(p).ok()).filter(|m| wall(*m) > s.eval.disk_bytes());
    if let Some(m) = disk { s.eval.disk = wall(m); }
    disk
}

/// The world evaluated, retracted and explained as the flags ask; with `--ticks`, its ticks run instead.
fn evaluate_world(o: &Opts, s: &mut Session) {
    let json = o.json;
    if o.ticks == 0 || !o.retracts.is_empty() {
        if let Err(e) = s.evaluate() { refuse(s, json, rofl::describe(&e)); }
        for f in &o.retracts {
            match s.retract_delta(f) {
                Ok(rofl::session::Retraction::Delta(d)) => eprintln!("retract {f}: {d:?}"),
                Ok(rofl::session::Retraction::Full(why)) => eprintln!("retract {f}: evaluated again, {why}"),
                Err(e) => { refuse(s, json, format!("retract {f}: {e}")); }
            }
            if s.eval.store.dirty {
                if let Err(e) = s.evaluate() { refuse(s, json, rofl::describe(&e)); }
            }
        }
        if o.explain && o.ticks == 0 {
            if let Err(e) = s.explain_requests() { fail(json, WORLD_REFUSED, &format!("explain: {e}")); }
            if let Err(e) = s.evaluate() { refuse(s, json, rofl::describe(&e)); }
        }
    }
    if o.ticks > 0 {
        for _ in 0..o.ticks {
            if let Err(e) = s.tick() { refuse(s, json, rofl::describe(&e)); }
        }
        // after the last boundary the tick entered is evaluated, answered and
        // evaluated again, so a world asks about what a tick carried in
        if o.explain {
            if let Err(e) = s.evaluate() { refuse(s, json, rofl::describe(&e)); }
            if let Err(e) = s.explain_requests() { fail(json, WORLD_REFUSED, &format!("explain: {e}")); }
            if let Err(e) = s.evaluate() { refuse(s, json, rofl::describe(&e)); }
        }
    }
}

/// Each file loaded, with what it asserted: a delta takes a file's facts out by this (delta.rs).
fn units_of(s: &mut Session, loaded: &[(String, String)]) -> Vec<crate::kept::Unit> {
    loaded.iter().filter_map(|(f, t)| s.facts_of(t).ok().map(|(ids, rules, _)| crate::kept::Unit { path: crate::kept::absolute(f), rules: crate::kept::rules_sum(&rules), facts: ids })).collect()
}

/// The world kept: at the kept file, else under the question's slot, where a world that cannot be kept is answered all the same.
fn keep_loaded(o: &Opts, world: &[String], s: &mut Session, mut units: Vec<crate::kept::Unit>, read: &[String], slot: &Option<String>, disk: Option<u64>) {
    // read before the evaluation: what a retraction took out since is no longer the file's
    for u in &mut units {
        u.facts.retain(|&f| s.eval.store.alive(f) && s.eval.store.rec(f).base());
    }
    let files_now = files_of(o, world);
    if let Some(k) = &o.kept {
        let note = crate::kept::record(world, files_now, &units, read, &scan_units(s), None).unwrap_or_else(|e| fail(o.json, FILE_REFUSED, &format!("{k} is not kept: {e}")));
        let n = s.keep_volume_noted(k, &note).unwrap_or_else(|e| fail(o.json, USAGE, &format!("{k}: {e}")));
        eprintln!("kept {k}: {n} bytes");
    } else if s.eval.memory_cut() {
        eprintln!("the world reached the memory this process may use and stopped there: its answers are partial, and it is not kept");
    } else if let Some(need) = keep_needs_more(s) {
        eprintln!("the world is not kept: keeping it takes about {} of memory more, which this process may not use", crate::kept::said_size(need));
    } else if let Some(p) = slot {
        // keeping is a convenience of the question: a world that cannot be kept is answered all the same
        let cut = disk.filter(|_| s.eval.disk_cut());
        let kept = crate::kept::record(world, files_now, &units, read, &scan_units(s), cut).and_then(|note| {
            // kept with what a delta reads, so no later run indexes the world again
            s.eval.index_for_retraction();
            crate::kept::keep_capped(&mut *s, p, &note)
        });
        match (kept, cut) {
            (Ok(_), Some(m)) => eprintln!("the world reached the disk cap of its cache, {} (ROFL_CACHE_GB), and stopped there: its answers are partial; a larger cap goes on from where it stopped", crate::kept::said_size(m)),
            (Ok(_), None) => {}
            (Err(e), None) => eprintln!("the world is not kept: {e}"),
            (Err(e), Some(m)) => to_the_end(s, o.budget, o.json, &format!("the world reached the disk cap of its cache, {}, and was not kept where it stopped: {e}", crate::kept::said_size(m))),
        }
    }
}

/// What keeping the world would take beyond the memory the process may still use, when it would: indexing it for a
/// delta and writing its volume took 2.5 times the volume's bytes at 700 vscode files (5.9 GB against 2.1 GB evaluated).
fn keep_needs_more(s: &Session) -> Option<u64> {
    use std::sync::atomic::Ordering::Relaxed;
    let may = rofl::engine::MEMORY_LIMIT.load(Relaxed);
    let need = s.eval.disk_bytes().saturating_mul(3);
    (may > 0 && need > may - rofl::engine::MEMORY_USED.load(Relaxed)).then_some(need as u64)
}

/// The read-only structure report, which replaces the dump as a question does.
fn propose_report(s: &mut Session, min_rows: usize) {
    s.eval.settle_provenance();
    // read-only: the report replaces the dump, as a question does
    print!("{}", rofl::structures::propose(&s.eval.store, &s.eval.h, &rofl::structures::Options { min_rows }).render(min_rows));
}

/// The state of the world, as the dump: printed when there are no questions or `--state` asks for it.
fn print_state(o: &Opts, s: &mut Session, cut: bool) {
    if o.json { println!("{}", serde_json::json!({ "ok": true, "state": s.eval.canonical_state(), "partial": cut })) } else { print!("{}", s.eval.canonical_state()) }
}

/// Where a `why --all` is asked of a world that cut a book, the texts of its files by the node prefix they name: what
/// unfolds a lemma (`Session::why_all`).
fn lower_texts(o: &Opts, s: &mut Session) {
    if s.eval.lower_texts.is_some() || !o.qs.iter().any(|q| matches!(q, Q::WhyAll(_))) || s.eval.lemma_stage().is_none() {
        return;
    }
    let sources = load_sources(o);
    let texts: Vec<String> = sources.iter().filter_map(|(f, t)| t.clone().or_else(|| std::fs::read_to_string(f).ok())).collect();
    let cut = rofl::engine::volumes::cut(&texts.iter().map(String::as_str).collect::<Vec<_>>());
    s.eval.lower_texts = Some(std::sync::Arc::new(cut.files.into_iter().collect()));
}

/// Every question answered in order. Returns whether one was refused and whether the answers are partial.
fn answers(s: &mut Session, o: &Opts, cut: bool) -> (bool, bool) {
    let bounds = WhynotBounds::clamped(o.depth, o.nodes);
    let mut partial = cut;
    // a scan that failed left out the facts it would have brought: every answer may be short of them (docs/cli.md)
    let failed = if o.qs.is_empty() { Vec::new() } else { failed_scans(s) };
    for f in &failed { eprintln!("a scan failed, so the answers may be short of what it would have brought: {f}"); }
    partial |= !failed.is_empty();
    let mut refused = false;
    lower_texts(o, s);
    for q in &o.qs {
        let (text, js, bad, part) = answer(s, q, &bounds, &failed);
        refused |= bad;
        partial |= part;
        if o.json { println!("{js}") } else { println!("{text}\n") }
    }
    (refused, partial)
}

/// One question answered: its text, its `rofl serve` answer, whether it was refused, and whether it is partial.
fn answer(s: &mut Session, q: &Q, bounds: &WhynotBounds, failed: &[String]) -> (String, serde_json::Value, bool, bool) {
    let (mut refused, mut partial) = (false, false);
    // each answer as plain text, or as `rofl serve` answers it
    let (text, js) = match q {
        Q::Ask(l) => match s.ask(l) {
            Ok(a) => {
                partial = a.partial;
                let shrugs: Vec<_> = a.shrugs.iter().map(|(row, line)| serde_json::json!({ "row": row, "line": line })).collect();
                let text = if failed.is_empty() { ask_text(&a) } else { format!("{}\n[partial: a scan failed, its facts are not in the world]", ask_text(&a)) };
                (text, serde_json::json!({ "ok": true, "vars": a.vars, "rows": a.rows, "keys": a.keys, "shrugs": shrugs, "partial": a.partial || !failed.is_empty() }))
            }
            Err(e) => { refused = true; (format!("error: {e}"), serde_json::json!({ "ok": false, "error": e })) }
        },
        Q::Why(l) | Q::WhyAll(l) => match if matches!(q, Q::Why(_)) { s.why(l) } else { s.why_all(l) } {
            Ok(t) => (t.clone(), serde_json::json!({ "ok": true, "text": t })),
            Err(e) => { refused = true; (e.clone(), serde_json::json!({ "ok": false, "error": e })) }
        },
        Q::Whynot(l) | Q::WhynotAll(l) => match s.whynot(l, &WhynotBounds { all: matches!(q, Q::WhynotAll(_)), ..*bounds }) {
            Ok((h, t)) => (t.clone(), serde_json::json!({ "ok": true, "holds": h, "text": t })),
            Err(e) => { refused = true; (e.clone(), serde_json::json!({ "ok": false, "error": e })) }
        },
        Q::Excise(l) => match s.excise(l) {
            Ok((removed, added)) => {
                let t = if removed.is_empty() && added.is_empty() { "(no change)".into() } else {
                    removed.iter().map(|k| format!("- {k}")).chain(added.iter().map(|k| format!("+ {k}"))).collect::<Vec<_>>().join("\n")
                };
                (t, serde_json::json!({ "ok": true, "removed": removed, "added": added }))
            }
            Err(e) => { refused = true; (format!("error: {e}"), serde_json::json!({ "ok": false, "error": e })) }
        },
    };
    (text, js, refused, partial)
}

/// The text of a file that was read, or the run ends.
fn read(json: bool, f: &str) -> String {
    std::fs::read_to_string(f).unwrap_or_else(|e| fail(json, USAGE, &format!("{f}: {e}")))
}
