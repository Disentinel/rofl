// THE RUST SIDE OF THE PARSE TIMING, SHAPED TO MATCH THE HOST SIDE EXACTLY.
//
// A ratio between two parsers is only a ratio if both instruments are the same
// instrument. So this and `scanners/parse_bench.ts` are written as one program
// in two languages, and every choice below is mirrored there:
//
//   * the files are read into memory BEFORE the clock starts, so what is timed
//     is parsing and not the filesystem;
//   * every file is parsed on every iteration, in the same order, so a cheap
//     file cannot be over-represented by a scheduler;
//   * the result is folded into a checksum that is printed, so neither an
//     optimiser nor a JIT may delete the work;
//   * the FIRST pass is discarded as warm-up, because the host has a JIT and
//     comparing a cold JIT against warm native code measures the warm-up;
//   * the reported number is the MEDIAN of the per-iteration times, not the
//     mean, because one scheduler preemption should not become the answer.
//
// DURATION MODE, AND WHY IT EXISTS. A median of wall-clock iterations is only
// a measurement on a quiet machine, and this one has not been quiet: load has
// run between 8 and 61 all session under another user's test suite, and the
// one reading taken had a 7x min-max spread. Two runs taken minutes apart
// under a fluctuating load are not comparable at all.
//
// `--seconds N` answers a different question that IS answerable under load:
// run for a FIXED WALL WINDOW and count the work finished. Started at the same
// moment as the host side, both processes see the same contention, the same
// scheduler and the same thermal state, so the RATIO of their throughputs is
// meaningful even when neither absolute number is. It is still not a quiet-
// machine number and it is not reported as one.
//
//   cargo run --release --bin rofl-parse-bench -- <iters> <file>...
//   cargo run --release --bin rofl-parse-bench -- --seconds <n> <file>...
fn main() {
    let mut args = std::env::args().skip(1);
    let first = args.next().unwrap_or_else(|| {
        eprintln!("usage: rofl-parse-bench <iters>|--seconds <n> <file>...");
        std::process::exit(2)
    });
    let (secs, iters): (f64, usize) = if first == "--seconds" {
        let n: f64 = args.next().and_then(|s| s.parse().ok()).unwrap_or_else(|| {
            eprintln!("--seconds needs a number");
            std::process::exit(2)
        });
        (n, 0)
    } else {
        (0.0, first.parse().unwrap_or_else(|_| {
            eprintln!("usage: rofl-parse-bench <iters>|--seconds <n> <file>...");
            std::process::exit(2)
        }))
    };
    let paths: Vec<String> = args.collect();
    if paths.is_empty() { eprintln!("no files"); std::process::exit(2) }

    let mut srcs: Vec<String> = Vec::new();
    for p in &paths {
        match std::fs::read_to_string(p) {
            Ok(s) => srcs.push(s),
            Err(e) => { eprintln!("{p}: {e}"); std::process::exit(1) }
        }
    }
    let bytes: usize = srcs.iter().map(|s| s.len()).sum();

    // Warm-up, discarded. Also the refusal count: a file the parser cannot read
    // is not silently free, it is reported next to the time.
    let mut refused = 0usize;
    let mut sum = 0usize;
    for s in &srcs {
        match rofl::rofl_parse::parse(s) { Ok(cs) => sum += cs.len(), Err(_) => refused += 1 }
    }

    if secs > 0.0 {
        let t0 = std::time::Instant::now();
        let mut passes = 0u64;
        while t0.elapsed().as_secs_f64() < secs {
            for s in &srcs {
                if let Ok(cs) = rofl::rofl_parse::parse(s) { sum += cs.len() }
            }
            passes += 1;
        }
        let el = t0.elapsed().as_secs_f64();
        let kib = (bytes as f64 / 1024.0) * passes as f64;
        println!("side=rust mode=duration files={} bytes={} seconds={:.3} passes={} kib={:.1} kib_per_s={:.1} refused={} checksum={}",
            srcs.len(), bytes, el, passes, kib, kib / el, refused, sum);
        return;
    }

    let mut ms: Vec<f64> = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t0 = std::time::Instant::now();
        for s in &srcs {
            if let Ok(cs) = rofl::rofl_parse::parse(s) { sum += cs.len() }
        }
        ms.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let med = ms[ms.len() / 2];
    let lo = ms[0];
    let hi = ms[ms.len() - 1];
    println!("side=rust files={} bytes={} iters={} median_ms={:.3} min_ms={:.3} max_ms={:.3} ms_per_kib={:.4} refused={} checksum={}",
        srcs.len(), bytes, iters, med, lo, hi, med / (bytes as f64 / 1024.0), refused, sum);
}
