// `rofl load`: build a world from .rofl TEXT and print canonicalState; with
// `--seed` (seed.rs) the world comes from a snapshot instead.
//   rofl load [--ticks N] [--budget N] [--space N] [--strata] [--explain] [--save F] [--below F]... [--retain N] [--retract L]...
//             [--why L]... [--why-all L]... [--whynot L]... [--excise F]... [--depth N] [--nodes N] [--state]
//             [--propose-structures [--structures-min-rows N]]
//             boot.rofl file.rofl...
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
    let mut i = 0;
    while i < args.len() {
        let value = |i: &mut usize| {
            *i += 1;
            args.get(*i).cloned().unwrap_or_else(|| { eprintln!("{} needs a value", args[*i - 1]); std::process::exit(1) })
        };
        match args[i].as_str() {
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
    let read = |f: &String| std::fs::read_to_string(f).unwrap_or_else(|e| fail(json, USAGE, &format!("{f}: {e}")));
    let mut s = rofl::session::Session::fresh(budget);
    s.eval.on_hot = Some(|t| eprintln!("hot: {t}"));
    if strata { s.eval.mode = rofl::engine::Mode::Strata; }
    if let Some(n) = space { s.eval.space = n; }
    s.eval.retain_ticks = retain;
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
    for (f, text) in &sources {
        if let Err(d) = s.load(&text.clone().unwrap_or_else(|| read(f)), None) {
            fail(json, FILE_REFUSED, &format!("{f} refused:\n  {}", d.join("\n  ")));
        }
    }
    if !below.is_empty() {
        // the walls are the run's: the world below is built under them too
        let mut b = rofl::session::Session::fresh(budget);
        if strata { b.eval.mode = rofl::engine::Mode::Strata; }
        if let Some(n) = space { b.eval.space = n; }
        for f in sources.iter().take(1).map(|s| &s.0).chain(below.iter()) {
            if let Err(d) = b.load(&read(f), None) {
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
