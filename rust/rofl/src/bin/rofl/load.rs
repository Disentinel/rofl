// `rofl load`: build a world from .rofl TEXT and print canonicalState; with
// `--seed` (seed.rs) the world comes from a snapshot instead.
//   rofl load [--ticks N] [--budget N] [--space N] [--strata] [--explain] [--save F] [--below F]... [--retain N] [--retract L]...
//             [--why L]... [--why-all L]... [--whynot L]... [--excise F]... [--depth N] [--nodes N] [--state]
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

enum Q { Ask(String), Why(String), WhyAll(String), Whynot(String), Excise(String) }

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
fn refuse(s: &mut rofl::session::Session, json: bool, msg: String) -> ! {
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

/// The lines a file opens with that are comments: where a scanner signs what it wrote.
fn head(f: &str) -> String {
    use std::io::BufRead;
    let Ok(file) = std::fs::File::open(f) else { return String::new() };
    std::io::BufReader::new(file).lines().map_while(Result::ok).take_while(|l| l.is_empty() || l.starts_with("--")).map(|l| l + "\n").collect()
}

/// The scans the world loaded, each with the base facts it brought.
fn scan_units(s: &mut rofl::session::Session) -> Vec<crate::kept::ScanUnit> {
    let recs = s.eval.scans.clone();
    recs.iter().map(|r| crate::kept::ScanUnit::of(s, r)).collect()
}

/// The words of a kept world's record as a reader of a message knows them.
fn said(args: &[String]) -> String {
    args.iter().map(|a| crate::kept::shown(a)).collect::<Vec<_>>().join(" ")
}

/// A run; `pre` is the kept world's record when the run took its files from it; `implicit`, a question verb's.
fn run(json: bool, args: Vec<String>, mut pre: Option<(bool, crate::kept::Record)>, implicit: bool) {
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
    let bounds = WhynotBounds::clamped(depth, nodes);
    // the world's walls and files, canonical: what a kept world is kept from
    let mut world: Vec<String> = Vec::new();
    if ticks > 0 { world.extend(["--ticks".into(), ticks.to_string()]); }
    world.extend(["--budget".into(), budget.to_string()]);
    if let Some(n) = space { world.extend(["--space".into(), n.to_string()]); }
    if strata { world.push("--strata".into()); }
    if explain { world.push("--explain".into()); }
    for b in &below { world.extend(["--below".into(), crate::kept::absolute(b)]); }
    if let Some(n) = retain { world.extend(["--retain".into(), n.to_string()]); }
    for r in &retracts { world.extend(["--retract".into(), r.clone()]); }
    world.extend(files.iter().map(|f| crate::kept::absolute(f)));
    if anew && kept.is_none() { fail(json, USAGE, "--anew computes a kept world anew: name it with --kept F"); }
    let mut opened = None;
    // the scans of a world opened from disk, whose signs `why` names
    let mut scans_kept: Vec<crate::kept::ScanUnit> = Vec::new();
    if let Some(k) = &kept {
        if save.is_some() { fail(json, USAGE, "--kept and --save are two ways to keep a world: give one"); }
        let exists = std::path::Path::new(k).exists();
        let check = || rofl::volume::check(k).and_then(|c| crate::kept::parse(&c.note).map(|r| (c.this_build, r)).ok_or_else(|| format!("{k}: not a world kept by `rofl --kept`")));
        if !world_given {
            // no files and no walls: the world is the one the kept file was kept from
            if !exists { fail(json, USAGE, &format!("{k}: no world is kept there; name the files of the world to keep it")); }
            let (this_build, r) = check().unwrap_or_else(|e| fail(json, FILE_REFUSED, &(if anew { format!("{e}; name the files of the world to compute it anew") } else { e })));
            let mut args = args.clone();
            args.extend(r.args.iter().cloned());
            return run(json, args, Some((this_build, r)), implicit);
        }
        if exists && !anew {
            let (this_build, r) = pre.take().map_or_else(check, Ok).unwrap_or_else(|e| fail(json, FILE_REFUSED, &e));
            if rofl::brk!("kept_stale_args" => false; r.args != world) {
                fail(json, FILE_REFUSED, &format!("{k} is stale: it was kept from `{}`, and this run names `{}`; run again with --anew to compute it anew", said(&r.args), said(&world)));
            }
            if let Some(m) = crate::kept::moved(&r, this_build) {
                fail(json, FILE_REFUSED, &format!("{k} is stale: {m}; run again with --anew to compute it anew"));
            }
            opened = Some(rofl::session::Session::open_volume(k, budget).unwrap_or_else(|e| fail(json, FILE_REFUSED, &format!("{k} is damaged: {e}"))));
            scans_kept = r.scans;
        }
    }
    // A QUESTION VERB KEEPS ITS WORLD BY ITSELF (docs/cli.md): under a name made of its walls and files, the
    // environment and the engine, opened while nothing else it read has moved, else computed anew and kept over
    // it, said in one line. Never `rofl load`, `rofl serve` or a harness: a gate computes.
    let slot = if implicit && kept.is_none() && save.is_none() && !files.is_empty() {
        crate::kept::slot(&world, &world[world.len() - files.len()..])
    } else {
        None
    };
    // what a kept world that is not this one, or no longer, is: where it lies, its record, and what moved
    let mut stale: Option<(String, crate::kept::Record, String)> = None;
    if let Some(p) = slot.as_ref().filter(|p| std::path::Path::new(p).exists()) {
        let checked = rofl::volume::check(p).and_then(|c| crate::kept::parse(&c.note).map(|r| (c.this_build, r)).ok_or_else(|| format!("{p}: not a kept world")));
        match checked.map(|(b, r)| (crate::kept::moved(&r, b), r)) {
            Ok((None, r)) => match rofl::session::Session::open_volume(p, budget) {
                Ok(s) => {
                    crate::kept::touch(p);
                    opened = Some(s);
                    scans_kept = r.scans;
                }
                Err(e) => eprintln!("{p} is damaged: {e}; computed anew"),
            },
            Ok((Some(m), _)) if crate::kept::missing(&m) => eprintln!("the kept world {p} is stale: {m}"),
            Ok((Some(m), r)) => stale = Some((p.clone(), r, m)),
            Err(e) => eprintln!("{e}; computed anew"),
        }
    } else if let Some(p) = &slot {
        stale = crate::delta::base_beside(p, &world[..world.len() - files.len()]).map(|(q, r)| (q, r, "the files named are others".into()));
    }
    let read = |f: &String| std::fs::read_to_string(f).unwrap_or_else(|e| fail(json, USAGE, &format!("{f}: {e}")));
    let walls = |s: &mut rofl::session::Session| {
        s.eval.on_hot = Some(|t| eprintln!("hot: {t}"));
        if strata { s.eval.mode = rofl::engine::Mode::Strata; }
        if let Some(n) = space { s.eval.space = n; }
        s.eval.retain_ticks = retain;
    };
    // A KEPT WORLD TAKES ITS FILES BY DELTA (delta.rs): the files that changed, came or went, and nothing else
    let mut by_delta: Option<(Vec<crate::kept::Unit>, Vec<crate::kept::ScanUnit>, Vec<String>)> = None;
    let mut said = String::new();
    if let Some((q, r, m)) = stale {
        let t0 = std::time::Instant::now();
        let opened_q = rofl::volume::check(&q).map_err(|e| e.to_string()).and_then(|_| rofl::session::Session::open_volume(&q, budget));
        let done = opened_q.and_then(|mut t| {
            walls(&mut t);
            crate::delta::apply(&mut t, &r, &world[world.len() - files.len()..]).map(|d| (t, d))
        });
        match done {
            Ok((t, d)) => {
                said = format!("the kept world took {} by delta: {} ({} facts out, {} overdeleted or derived again; opened and taken in {} ms", if d.took.len() == 1 { "1 file".to_string() } else { format!("{} files", d.took.len()) }, d.took.join(", "), d.out, d.touched, t0.elapsed().as_millis());
                if q != *slot.as_ref().unwrap() { let _ = std::fs::remove_file(&q); }
                opened = Some(t);
                by_delta = Some((d.units, d.scans, d.code));
            }
            Err(why) => eprintln!("the kept world {q} is stale: {m}; computed anew, not by delta: {why}"),
        }
    }
    let from_disk = opened.is_some();
    let mut s = opened.unwrap_or_else(|| rofl::session::Session::fresh(budget));
    walls(&mut s);
    if let Err(e) = if scans_kept.is_empty() { Ok(()) } else { crate::kept::signed(&mut s, &scans_kept) } {
        fail(json, FILE_REFUSED, &e);
    }
    // a world from disk holds its files of scanned facts to their sources again, as time has passed: by their heads
    if from_disk {
        for f in &world[world.len() - files.len()..] {
            if let Err(e) = s.signed_file(&head(f), f) {
                fail(json, FILE_REFUSED, &e);
            }
        }
    }
    if let (Some((units, scans, code)), Some(p)) = (&by_delta, &slot) {
        let files_now = &world[world.len() - files.len()..];
        let read: Vec<String> = files_now.iter().chain(code).cloned().collect();
        match crate::kept::record(&world, files_now, units, &read, scans) {
            Err(e) => eprintln!("the world is not kept: {e}"),
            Ok(note) => {
                let t1 = std::time::Instant::now();
                match crate::kept::keep_capped(&mut s, p, &note) {
                    Ok(n) => eprintln!("{said}, kept again in {} ms, {n} bytes written)", t1.elapsed().as_millis()),
                    Err(e) => eprintln!("{said}); the world is not kept: {e}"),
                }
            }
        }
    }
    if !from_disk {
        // a world written as Markdown is read into rules here, after the worlds it reads; a plain `.md` is a document
        let mut sources: Vec<(String, Option<String>)> = Vec::new();
        for f in &files {
            if f.ends_with(".rofl.md") {
                for w in rofl::md::world_files(std::path::Path::new(f)).unwrap_or_else(|e| fail(json, USAGE, &e)) {
                    match w {
                        rofl::md::Source::File(p) => sources.push((p.display().to_string(), None)),
                        rofl::md::Source::Md(p) => {
                            let r = rofl::md::read_world(&p).unwrap_or_else(|e| fail(json, USAGE, &e));
                            if let Some(u) = rofl::md::unread(&r.report) { eprintln!("{}: {u}", p.display()); }
                            sources.push((p.display().to_string(), Some(r.rofl)));
                        }
                    }
                }
            } else if f.ends_with(".md") {
                fail(json, FILE_REFUSED, &format!("{f} is a document, not a world: executable Markdown ends in .rofl.md"));
            } else { sources.push((f.clone(), None)); }
        }
        let mut loaded: Vec<(String, String)> = Vec::new();
        // the code a file of scanned facts is signed by, which a kept world stamps beside the files
        let mut code: Vec<String> = Vec::new();
        for (f, text) in &sources {
            let t = text.clone().unwrap_or_else(|| read(f));
            let sg = s.signed_file(&t, f).unwrap_or_else(|e| fail(json, FILE_REFUSED, &e));
            code.extend(sg.code);
            if let Err(d) = s.load(&t, sg.who.as_deref()) {
                fail(json, FILE_REFUSED, &format!("{f} refused:\n  {}", d.join("\n  ")));
            }
            loaded.push((f.clone(), t));
        }
        if !below.is_empty() {
            // the walls are the run's: the world below is built under them too
            let mut b = rofl::session::Session::fresh(budget);
            if strata { b.eval.mode = rofl::engine::Mode::Strata; }
            if let Some(n) = space { b.eval.space = n; }
            for f in sources.iter().take(1).map(|s| &s.0).chain(below.iter()) {
                let t = read(f);
                let sg = b.signed_file(&t, f).unwrap_or_else(|e| fail(json, FILE_REFUSED, &format!("below: {e}")));
                code.extend(sg.code);
                if let Err(d) = b.load(&t, sg.who.as_deref()) {
                    fail(json, FILE_REFUSED, &format!("below: {f} refused:\n  {}", d.join("\n  ")));
                }
            }
            if let Err(e) = b.evaluate() { refuse(&mut b, json, format!("below: {}", rofl::describe(&e))); }
            if let Err(e) = s.feed_below(&mut b) { fail(json, WORLD_REFUSED, &format!("below: {e}")); }
        }
        if ticks == 0 || !retracts.is_empty() {
            if let Err(e) = s.evaluate() { refuse(&mut s, json, rofl::describe(&e)); }
            for f in &retracts {
                match s.retract_delta(f) {
                    Ok(rofl::session::Retraction::Delta(d)) => eprintln!("retract {f}: {d:?}"),
                    Ok(rofl::session::Retraction::Full(why)) => eprintln!("retract {f}: evaluated again, {why}"),
                    Err(e) => { refuse(&mut s, json, format!("retract {f}: {e}")); }
                }
                if s.eval.store.dirty {
                    if let Err(e) = s.evaluate() { refuse(&mut s, json, rofl::describe(&e)); }
                }
            }
            if explain && ticks == 0 {
                if let Err(e) = s.explain_requests() { fail(json, WORLD_REFUSED, &format!("explain: {e}")); }
                if let Err(e) = s.evaluate() { refuse(&mut s, json, rofl::describe(&e)); }
            }
        }
        if ticks > 0 {
            for _ in 0..ticks {
                if let Err(e) = s.tick() { refuse(&mut s, json, rofl::describe(&e)); }
            }
            // after the last boundary the tick entered is evaluated, answered and
            // evaluated again, so a world asks about what a tick carried in
            if explain {
                if let Err(e) = s.evaluate() { refuse(&mut s, json, rofl::describe(&e)); }
                if let Err(e) = s.explain_requests() { fail(json, WORLD_REFUSED, &format!("explain: {e}")); }
                if let Err(e) = s.evaluate() { refuse(&mut s, json, rofl::describe(&e)); }
            }
        }
        for d in &s.eval.diags { eprintln!("diag: {d}"); }
        // each file loaded, what it asserted: a delta takes a file's facts out by this (delta.rs)
        let mut units = || -> Vec<crate::kept::Unit> {
            loaded.iter().filter_map(|(f, t)| s.facts_of(t).ok().map(|(ids, rules, _)| crate::kept::Unit { path: crate::kept::absolute(f), rules: crate::kept::rules_sum(&rules), facts: ids })).collect()
        };
        let files_now = &world[world.len() - files.len()..];
        if let Some(k) = &kept {
            let read: Vec<String> = sources.iter().map(|s| s.0.clone()).chain(below.iter().cloned()).chain(code.iter().cloned()).collect();
            let units = units();
            let note = crate::kept::record(&world, files_now, &units, &read, &scan_units(&mut s)).unwrap_or_else(|e| fail(json, FILE_REFUSED, &format!("{k} is not kept: {e}")));
            let n = s.keep_volume_noted(k, &note).unwrap_or_else(|e| fail(json, USAGE, &format!("{k}: {e}")));
            eprintln!("kept {k}: {n} bytes");
        } else if let Some(p) = &slot {
            // keeping is a convenience of the question: a world that cannot be kept is answered all the same
            let read: Vec<String> = sources.iter().map(|s| s.0.clone()).chain(below.iter().cloned()).chain(code.iter().cloned()).collect();
            let units = units();
            match crate::kept::record(&world, files_now, &units, &read, &scan_units(&mut s)) {
                Err(e) => eprintln!("the world is not kept: {e}"),
                Ok(note) => {
                    // kept with what a delta reads, so no later run indexes the world again
                    s.eval.index_for_retraction();
                    if let Err(e) = crate::kept::keep_capped(&mut s, p, &note) {
                        eprintln!("the world is not kept: {e}");
                    }
                }
            }
        }
    }
    if let Some(f) = save {
        std::fs::write(&f, s.save()).unwrap_or_else(|e| fail(json, USAGE, &format!("{f}: {e}")));
    }
    if propose {
        s.eval.settle_provenance();
        // read-only: the report replaces the dump, as a question does
        print!("{}", rofl::structures::propose(&s.eval.store, &s.eval.h, &rofl::structures::Options { min_rows }).render(min_rows));
        return;
    }
    let cut = s.eval.store.partial_eval;
    if qs.is_empty() || state {
        if json { println!("{}", serde_json::json!({ "ok": true, "state": s.eval.canonical_state(), "partial": cut })) } else { print!("{}", s.eval.canonical_state()) }
    }
    let (mut refused, mut partial) = (false, cut);
    // an answer that rests on a snapshot says when it was taken
    if !qs.is_empty() {
        for l in s.as_of_said() { eprintln!("{l}"); }
    }
    for q in &qs {
        // each answer as plain text, or as `rofl serve` answers it
        let (text, js) = match q {
            Q::Ask(l) => match s.ask(l) {
                Ok(a) => {
                    partial |= a.partial;
                    let shrugs: Vec<_> = a.shrugs.iter().map(|(row, line)| serde_json::json!({ "row": row, "line": line })).collect();
                    (ask_text(&a), serde_json::json!({ "ok": true, "vars": a.vars, "rows": a.rows, "keys": a.keys, "shrugs": shrugs, "partial": a.partial }))
                }
                Err(e) => { refused = true; (format!("error: {e}"), serde_json::json!({ "ok": false, "error": e })) }
            },
            Q::Why(l) | Q::WhyAll(l) => match if matches!(q, Q::Why(_)) { s.why(l) } else { s.why_all(l) } {
                Ok(t) => (t.clone(), serde_json::json!({ "ok": true, "text": t })),
                Err(e) => { refused = true; (e.clone(), serde_json::json!({ "ok": false, "error": e })) }
            },
            Q::Whynot(l) => match s.whynot(l, &bounds) {
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
        if json { println!("{js}") } else { println!("{text}\n") }
    }
    if refused { std::process::exit(QUESTION_REFUSED); }
    if partial && !qs.is_empty() { std::process::exit(PARTIAL); }
}
