// Build a world from .rofl TEXT and print canonicalState — the load path's
// counterpart to `rofl-eval`, so a divergence can be diffed rather than read
// out of a test panic.
//   rofl-load [--ticks N] [--budget N] [--space N] [--strata] [--explain] [--save F] [--below F]... [--retain N] boot.rofl file.rofl...
// `--strata` runs the stock evaluator, which reads `stratum/2`; `--explain`
// answers the world's `explain_request` rows after the first evaluation and
// evaluates again (`Session::explain_requests`); `--save` writes the world's
// snapshot (`Session::save`) to F, which is how a TypeScript check gets a
// store only this engine can build. `--below F`, repeated, builds a world of
// boot.rofl and those files, evaluates it, and feeds what it concludes to
// this one before it evaluates (`Session::feed_below`), under the same
// `--budget`, `--space` and `--strata`; `--retain N` keeps the
// provenance of the last N completed ticks (`retain_ticks`).
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
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
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--ticks" { i += 1; ticks = args[i].parse().unwrap(); }
        else if args[i] == "--budget" { i += 1; budget = args[i].parse().unwrap(); }
        else if args[i] == "--space" { i += 1; space = Some(args[i].parse().unwrap()); }
        else if args[i] == "--strata" { strata = true; }
        else if args[i] == "--explain" { explain = true; }
        else if args[i] == "--save" { i += 1; save = Some(args[i].clone()); }
        else if args[i] == "--below" { i += 1; below.push(args[i].clone()); }
        else if args[i] == "--retain" { i += 1; retain = Some(args[i].parse().unwrap()); }
        else { files.push(args[i].clone()); }
        i += 1;
    }
    let read = |f: &String| std::fs::read_to_string(f).unwrap_or_else(|e| { eprintln!("{f}: {e}"); std::process::exit(1) });
    let mut s = rofl::session::Session::fresh(budget);
    if strata { s.eval.mode = rofl::engine::Mode::Strata; }
    if let Some(n) = space { s.eval.space = n; }
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
    if ticks == 0 {
        if let Err(e) = s.evaluate() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
        if explain {
            if let Err(e) = s.explain_requests() { eprintln!("explain: {e}"); std::process::exit(3); }
            if let Err(e) = s.evaluate() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
        }
    } else {
        for _ in 0..ticks {
            if let Err(e) = s.tick() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
        }
        // after the last boundary the tick entered is evaluated, answered and
        // evaluated again, so a world asks about what a tick carried in
        if explain {
            if let Err(e) = s.evaluate() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
            if let Err(e) = s.explain_requests() { eprintln!("explain: {e}"); std::process::exit(3); }
            if let Err(e) = s.evaluate() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
        }
    }
    for d in &s.eval.diags { eprintln!("diag: {d}"); }
    if let Some(f) = save {
        std::fs::write(&f, s.save()).unwrap_or_else(|e| { eprintln!("{f}: {e}"); std::process::exit(1) });
    }
    print!("{}", s.eval.store.canonical_state(&s.eval.h));
}
