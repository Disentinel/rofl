// Build a world from .rofl TEXT and print canonicalState — the load path's
// counterpart to `rofl-eval`, so a divergence can be diffed rather than read
// out of a test panic.
//   rofl-load [--ticks N] [--budget N] boot.rofl file.rofl...
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut ticks = 0u32;
    // `Session::fresh` has always taken the budget; this binary hard-coded one
    // and so could not answer about a world that runs out. A world with a
    // budget was checked by ONE engine for exactly that reason.
    let mut budget: i64 = 200_000_000;
    let mut files: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--ticks" { i += 1; ticks = args[i].parse().unwrap(); }
        else if args[i] == "--budget" { i += 1; budget = args[i].parse().unwrap(); }
        else { files.push(args[i].clone()); }
        i += 1;
    }
    let mut s = rofl::session::Session::fresh(budget);
    for f in &files {
        let t = std::fs::read_to_string(f).unwrap_or_else(|e| { eprintln!("{f}: {e}"); std::process::exit(1) });
        if let Err(d) = s.load(&t, None) {
            eprintln!("{f} refused:");
            for x in d { eprintln!("  {x}"); }
            std::process::exit(2);
        }
    }
    if ticks == 0 {
        if let Err(e) = s.evaluate() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
    } else {
        for _ in 0..ticks {
            if let Err(e) = s.tick() { eprintln!("{}", rofl::describe(&e)); std::process::exit(3); }
        }
    }
    for d in &s.eval.diags { eprintln!("diag: {d}"); }
    print!("{}", s.eval.store.canonical_state(&s.eval.h));
}
