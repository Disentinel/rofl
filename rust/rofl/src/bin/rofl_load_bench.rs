// WHERE THE TIME IN A LOAD ACTUALLY GOES, asked before optimising the parser.
//
// The parser measured 1.75x the host and the obvious next move was to intern
// its names — `rofl_parse::Term` allocates a String per atom and per variable
// where the host interns. That is only worth doing if PARSING is what a load
// spends its time on, and this repository has a standing rule about finding
// out rather than assuming.
//
// So: the same text, three ways, ALTERNATED rather than run in sequence.
// Alternating matters for the same reason the parser bench runs both sides in
// one window — this machine is not quiet, and three phases run back to back
// would each see a different afternoon. Interleaving makes them share it.
//
//   parse    `rofl_parse::parse` and throw the tree away
//   convert  parse, then `to_clause` — which interns every name into the heap
//   check    convert, then run every door check
//   load     all of that, plus admission into a forked world
//
// `convert` was added after the first run said the phase between parsing and
// admission was 56 per cent of a load, because "between" is not a place you
// can optimise. Two candidates lived there — interning and the checks — and
// subtracting adjacent phases is the only way to learn which.
//
// The world is FORKED per load rather than rebuilt, so what is measured is the
// load and not `bootstrap_kernel`.
//
//   rofl-load-bench <seconds> <boot.rofl> <program.rofl>
use rofl::session::Session;

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 3 {
        eprintln!("usage: rofl-load-bench <seconds> <boot.rofl> <program.rofl>");
        std::process::exit(2);
    }
    let secs: f64 = a[0].parse().expect("seconds");
    let boot = std::fs::read_to_string(&a[1]).expect("boot");
    let text = std::fs::read_to_string(&a[2]).expect("program");
    let kib = text.len() as f64 / 1024.0;

    let mut core = Session::fresh(200_000_000);
    core.load(&boot, None).expect("boot refused");

    let (mut np, mut nv, mut nc, mut nl) = (0u64, 0u64, 0u64, 0u64);
    let (mut tp, mut tv, mut tc, mut tl) = (0f64, 0f64, 0f64, 0f64);
    let mut sum = 0usize;

    // One warm-up of each, discarded, so no phase pays for a cold allocator.
    sum += rofl::rofl_parse::parse(&text).map(|c| c.len()).unwrap_or(0);
    core.fork().load(&text, None).expect("program refused");

    let t0 = std::time::Instant::now();
    while t0.elapsed().as_secs_f64() < secs {
        let a0 = std::time::Instant::now();
        sum += rofl::rofl_parse::parse(&text).map(|c| c.len()).unwrap_or(0);
        tp += a0.elapsed().as_secs_f64();
        np += 1;

        let mut cv = core.fork();
        let v0 = std::time::Instant::now();
        if let Ok(pcs) = rofl::rofl_parse::parse(&text) {
            for pc in &pcs {
                if let Ok(c) = rofl::program::to_clause(&mut cv.eval.h, &cv.eval.v, pc) {
                    sum += c.head.args.len();
                }
            }
        }
        tv += v0.elapsed().as_secs_f64();
        nv += 1;

        let mut f = core.fork();
        let b0 = std::time::Instant::now();
        // `check` is `load` minus admission, reached by loading into a fork and
        // measuring the refusal path... which does not exist for a good
        // program. So it is approximated the only honest way available from
        // outside: a load of a program with one deliberately bad clause
        // appended does everything but admit, and returns.
        let bad = format!("{text}\np[$kernel](x).\n");
        let _ = f.load(&bad, None);
        tc += b0.elapsed().as_secs_f64();
        nc += 1;

        let mut g = core.fork();
        let c0 = std::time::Instant::now();
        g.load(&text, None).expect("program refused");
        tl += c0.elapsed().as_secs_f64();
        nl += 1;
        sum += g.eval.store.fact_count();
    }

    let ms = |t: f64, n: u64| if n == 0 { 0.0 } else { t / n as f64 * 1000.0 };
    let (p, v, c, l) = (ms(tp, np), ms(tv, nv), ms(tc, nc), ms(tl, nl));
    // The SHARE columns are the point. Absolutes move with the machine; these
    // are four phases interleaved in one process, so what each one costs
    // RELATIVE to the others survives a load average this host cannot control.
    println!(
        "bytes={} kib={:.1} n={} | parse_ms={p:.1} convert_ms={v:.1} check_ms={c:.1} load_ms={l:.1} \
         | parse={:.0}% intern={:.0}% checks={:.0}% admit={:.0}% | load_kib_s={:.1} checksum={}",
        text.len(), kib, nl,
        p / l * 100.0, (v - p) / l * 100.0, (c - v) / l * 100.0, (l - c) / l * 100.0,
        kib / (l / 1000.0), sum
    );
}
