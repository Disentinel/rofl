// Build a world from .rofl TEXT and print canonicalState — the load path's
// counterpart to `rofl-eval`, so a divergence can be diffed rather than read
// out of a test panic.
//   rofl-load [--ticks N] [--budget N] [--state]
//             [--why L]... [--whynot L]... [--excise F]... boot.rofl file.rofl...
//
// A QUESTION REPLACES THE DUMP. With any `--why`, `--whynot` or `--excise` the
// answers are printed, in the order the flags were given, each followed by one
// empty line; `--state` puts the dump back, before them. The answers are the
// reference's text (src/api.ts, and the REPL's `- `/`+ ` lines for excise).
// A why of a fact that does not hold, or an excise that is refused, prints its
// message as the answer and the exit code is 4.
use rofl::engine::WhynotBounds;

enum Q { Why(String), Whynot(String), Excise(String) }

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut ticks = 0u32;
    // `Session::fresh` has always taken the budget; this binary hard-coded one
    // and so could not answer about a world that runs out. A world with a
    // budget was checked by ONE engine for exactly that reason.
    let mut budget: i64 = 200_000_000;
    let mut files: Vec<String> = Vec::new();
    let mut qs: Vec<Q> = Vec::new();
    let mut state = false;
    let mut i = 0;
    while i < args.len() {
        let next = |i: &mut usize| { *i += 1; args.get(*i).cloned().unwrap_or_else(|| { eprintln!("{} needs a value", args[*i - 1]); std::process::exit(1) }) };
        match args[i].as_str() {
            "--ticks" => ticks = next(&mut i).parse().unwrap(),
            "--budget" => budget = next(&mut i).parse().unwrap(),
            "--state" => state = true,
            "--why" => qs.push(Q::Why(next(&mut i))),
            "--whynot" => qs.push(Q::Whynot(next(&mut i))),
            "--excise" => qs.push(Q::Excise(next(&mut i))),
            _ => files.push(args[i].clone()),
        }
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
    if qs.is_empty() || state {
        print!("{}", s.eval.store.canonical_state(&s.eval.h));
    }
    let mut refused = false;
    for q in &qs {
        let text = match q {
            Q::Why(l) => s.why(l).unwrap_or_else(|e| { refused = true; e }),
            Q::Whynot(l) => match s.whynot(l, &WhynotBounds::default()) {
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
