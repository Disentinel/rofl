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
//   cargo run --release --bin rofl-parse-bench -- <iters> <file>...
fn main() {
    let mut args = std::env::args().skip(1);
    let iters: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or_else(|| {
        eprintln!("usage: rofl-parse-bench <iters> <file>...");
        std::process::exit(2)
    });
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
