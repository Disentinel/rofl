// OPEN AGAINST FORK, WHICH IS THE ONLY REASON `fork` IS ON THE SURFACE.
//
// `docs/port-surface.md` puts it there on a measurement taken on the JS side:
// 383 ms to build the core and 3 ms to fork it, a hundred and twenty-eight
// times. That number has never been taken on THIS side, and a surface that
// offers a verb on someone else's measurement is offering a guess.
//
// Same discipline as `rofl_parse_bench.rs`: the seed is read before the clock,
// the first pass is discarded, the MEDIAN is reported, and the result is
// folded into a checksum so nothing may be deleted. The two are timed in the
// same process against the same seed, so what is compared is two operations
// and not two runs.
//
//   cargo run --release --bin rofl-session-bench -- <iters> <seed.json>
use rofl::session::Session;

fn med(mut v: Vec<f64>) -> (f64, f64, f64) {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (v[v.len() / 2], v[0], v[v.len() - 1])
}

fn main() {
    let mut args = std::env::args().skip(1);
    let iters: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or_else(|| {
        eprintln!("usage: rofl-session-bench <iters> <seed.json>");
        std::process::exit(2)
    });
    let path = args.next().unwrap_or_else(|| { eprintln!("no seed"); std::process::exit(2) });
    let src = std::fs::read_to_string(&path).unwrap_or_else(|e| { eprintln!("{path}: {e}"); std::process::exit(1) });

    let mut sum = 0usize;
    let core = Session::open(&src, 200_000_000).unwrap_or_else(|e| { eprintln!("{e}"); std::process::exit(1) });
    sum += core.fork().eval.store.fact_count();

    let mut o = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t = std::time::Instant::now();
        let s = Session::open(&src, 200_000_000).unwrap();
        o.push(t.elapsed().as_secs_f64() * 1000.0);
        sum += s.eval.store.fact_count();
    }
    let mut f = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t = std::time::Instant::now();
        let s = core.fork();
        f.push(t.elapsed().as_secs_f64() * 1000.0);
        sum += s.eval.store.fact_count();
    }
    let (om, olo, ohi) = med(o);
    let (fm, flo, fhi) = med(f);
    println!("side=rust facts={} iters={} open_ms={:.3} open_min={:.3} open_max={:.3} fork_ms={:.3} fork_min={:.3} fork_max={:.3} ratio={:.1} checksum={}",
        core.eval.store.fact_count(), iters, om, olo, ohi, fm, flo, fhi, om / fm, sum);
}
