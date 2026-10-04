// Build a world from .rofl TEXT and print canonicalState — the load path's
// counterpart to `rofl-eval`, so a divergence can be diffed rather than read
// out of a test panic.
//   rofl-load [--ticks N] [--budget N] [--space N] [--delta-first] [--strata] [--explain] [--save F] [--below F]... [--retain N] [--retract L]...
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
// `--budget`, `--space` and `--strata`; a firing is solved in written order
// under a `--budget` or `--space` (where a wall cuts is not the planner's),
// unless `--delta-first` says the world asks for its plans; `--retain N` keeps the
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

enum Q { Why(String), WhyAll(String), Whynot(String), Excise(String) }

/// A numeric flag's value. Every one of them fails the same way: a message
/// naming the flag and what it takes, and exit 1 — a value that does not
/// parse as the flag's type (a word, `1e6`, a negative count, a count past
/// its range) is never a panic and never silently a default.
fn number<T: std::str::FromStr>(flag: &str, v: String, takes: &str) -> T {
    v.parse::<T>().unwrap_or_else(|_| { eprintln!("{flag} takes {takes}, not {v:?}"); std::process::exit(1) })
}

/// A refusal ends the run, and a world refused for a broken promise is asked again first: it must refuse again,
/// never answer (`function` is judged until the world is fixed).
fn refuse(s: &mut rofl::session::Session, msg: String) -> ! {
    if msg.contains("has two values in the book") && s.eval.ensure().is_ok() {
        eprintln!("a broken world was answered after its refusal");
        std::process::exit(3);
    }
    eprintln!("{msg}");
    std::process::exit(3);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut ticks = 0u32;
    // `Session::fresh` has always taken the budget; this binary hard-coded one
    // and so could not answer about a world that runs out. A world with a
    // budget was checked by ONE engine for exactly that reason.
    let mut budget: i64 = 200_000_000;
    let (mut walls, mut delta_first) = (false, false);
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
            "--budget" => { budget = number("--budget", value(&mut i), "an integer"); walls = true }
            "--delta-first" => delta_first = true,
            "--space" => {
                let v = value(&mut i);
                let n: i64 = number("--space", v.clone(), "a positive number of rows");
                if n <= 0 { eprintln!("--space takes a positive number of rows, not {v:?}"); std::process::exit(1) }
                space = Some(n);
                walls = true
            }
            "--strata" => strata = true,
            "--explain" => explain = true,
            "--save" => save = Some(value(&mut i)),
            "--below" => below.push(value(&mut i)),
            "--retain" => retain = Some(number("--retain", value(&mut i), "a count of ticks")),
            "--retract" => retracts.push(value(&mut i)),
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
    let read = |f: &String| std::fs::read_to_string(f).unwrap_or_else(|e| { eprintln!("{f}: {e}"); std::process::exit(1) });
    let mut s = rofl::session::Session::fresh(budget);
    if strata { s.eval.mode = rofl::engine::Mode::Strata; }
    if let Some(n) = space { s.eval.space = n; }
    (s.eval.walls_set, s.eval.delta_first_under_walls) = (walls, delta_first);
    s.eval.retain_ticks = retain;
    for f in &files {
        if let Err(d) = s.load(&read(f), None) {
            eprintln!("{f} refused:");
            for x in d { eprintln!("  {x}"); }
            std::process::exit(2);
        }
    }
    if !below.is_empty() {
        // the walls are the run's: the world below is built under them too
        let mut b = rofl::session::Session::fresh(budget);
        if strata { b.eval.mode = rofl::engine::Mode::Strata; }
        if let Some(n) = space { b.eval.space = n; }
        (b.eval.walls_set, b.eval.delta_first_under_walls) = (walls, delta_first);
        for f in files.iter().take(1).chain(below.iter()) {
            if let Err(d) = b.load(&read(f), None) {
                eprintln!("below: {f} refused:");
                for x in d { eprintln!("  {x}"); }
                std::process::exit(2);
            }
        }
        if let Err(e) = b.evaluate() { eprintln!("below: {}", rofl::describe(&e)); std::process::exit(3); }
        if let Err(e) = s.feed_below(&mut b) { eprintln!("below: {e}"); std::process::exit(3); }
    }
    if ticks == 0 || !retracts.is_empty() {
        if let Err(e) = s.evaluate() { refuse(&mut s, rofl::describe(&e)); }
        for f in &retracts {
            match s.retract_delta(f) {
                Ok(rofl::session::Retraction::Delta(d)) => eprintln!("retract {f}: {d:?}"),
                Ok(rofl::session::Retraction::Full(why)) => eprintln!("retract {f}: evaluated again, {why}"),
                Err(e) => { refuse(&mut s, format!("retract {f}: {e}")); }
            }
            if s.eval.store.dirty {
                if let Err(e) = s.evaluate() { refuse(&mut s, rofl::describe(&e)); }
            }
        }
        if explain && ticks == 0 {
            if let Err(e) = s.explain_requests() { eprintln!("explain: {e}"); std::process::exit(3); }
            if let Err(e) = s.evaluate() { refuse(&mut s, rofl::describe(&e)); }
        }
    }
    if ticks > 0 {
        for _ in 0..ticks {
            if let Err(e) = s.tick() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
        }
        // after the last boundary the tick entered is evaluated, answered and
        // evaluated again, so a world asks about what a tick carried in
        if explain {
            if let Err(e) = s.evaluate() { refuse(&mut s, rofl::describe(&e)); }
            if let Err(e) = s.explain_requests() { eprintln!("explain: {e}"); std::process::exit(3); }
            if let Err(e) = s.evaluate() { refuse(&mut s, rofl::describe(&e)); }
        }
    }
    for d in &s.eval.diags { eprintln!("diag: {d}"); }
    if std::env::var("ROFL_VSTATS").is_ok() {
        for (rel, on) in s.eval.vclosure_info() { eprintln!("vclosure {rel}: {}", if on { "answered from its tree" } else { "rows" }); }
        for r in &s.eval.vclosure_reason { eprintln!("vclosure off: {r}"); }
        eprintln!("vclosure builds {} rows read {} virtual rows {}", s.eval.vbuilds, s.eval.vrows_read, s.eval.store.virtual_rows());
    }
    if let Some(f) = save {
        std::fs::write(&f, s.save()).unwrap_or_else(|e| { eprintln!("{f}: {e}"); std::process::exit(1) });
    }
    if propose {
        // read-only: the report replaces the dump, as a question does
        print!("{}", rofl::structures::propose(&s.eval.store, &s.eval.h, &rofl::structures::Options { min_rows }).render(min_rows));
        return;
    }
    if qs.is_empty() || state {
        print!("{}", s.eval.store.canonical_state(&s.eval.h));
    }
    let mut refused = false;
    for q in &qs {
        let text = match q {
            Q::Why(l) => s.why(l).unwrap_or_else(|e| { refused = true; e }),
            Q::WhyAll(l) => s.why_all(l).unwrap_or_else(|e| { refused = true; e }),
            Q::Whynot(l) => match s.whynot(l, &bounds) {
                Ok((_, t)) => t,
                Err(e) => { refused = true; e }
            },
            Q::Excise(l) => match s.excise(l) {
                Ok((removed, added)) if removed.is_empty() && added.is_empty() => "(no change)".into(),
                Ok((removed, added)) => removed.iter().map(|k| format!("- {k}"))
                    .chain(added.iter().map(|k| format!("+ {k}"))).collect::<Vec<_>>().join("\n"),
                Err(e) => { refused = true; format!("error: {e}") }
            },
        };
        println!("{text}\n");
    }
    if refused { std::process::exit(4); }
}
