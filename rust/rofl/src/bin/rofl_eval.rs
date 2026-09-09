//! THE HARNESS. Reads a seed on stdin or by path, evaluates, prints
//! `canonicalState` on stdout. That plus a diff against `<name>.expected.txt`
//! is the whole test rig.
use std::alloc::{GlobalAlloc, Layout, System};
use std::io::Read;
use std::sync::atomic::{AtomicIsize, Ordering};

/// LIVE BYTES, measured by the allocator rather than estimated from
/// capacities. It is the reading directly comparable to node's `heapUsed`
/// after a collection, which is what `bench/mem_census.ts` reports on the JS
/// side — the two instruments then differ only in what they cannot see
/// (node's own object headers and the collector's slack, and this one's
/// allocator bookkeeping).
struct Counting;
static LIVE: AtomicIsize = AtomicIsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        LIVE.fetch_add(l.size() as isize, Ordering::Relaxed);
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        LIVE.fetch_sub(l.size() as isize, Ordering::Relaxed);
        System.dealloc(p, l)
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        LIVE.fetch_add(n as isize - l.size() as isize, Ordering::Relaxed);
        System.realloc(p, l, n)
    }
}

#[global_allocator]
static A: Counting = Counting;

const USAGE: &str =
    "usage: rofl-eval [--bytes] [--derivations] [--budget N] [--space N] [--ticks N] [SEED.json]";

/// WHY THIS REFUSES RATHER THAN IGNORES. The catch-all arm below used to be
/// `a => path = Some(a)`, so `--ticks 3` set the path to "--ticks", then to
/// "3", and the run succeeded on the seed named "3"... except that the harness
/// passes the seed LAST, so the flag was simply overwritten and the binary
/// evaluated one tick and printed a clean, wrong answer. Seven ticked cases
/// then failed on CONTENT, which reads as an engine bug; had the harness
/// passed the flag after the path they would have failed as "file not found",
/// which reads as a harness bug. Neither says "this binary does not implement
/// the flag you handed it", and that is the only true statement.
///
/// This is the same shape as a gate that is silently not running (CLAUDE.md,
/// "a gate inherits the scope of its INCIDENT"): an unrecognised instruction
/// that produces a PASS is indistinguishable from an implementation that
/// works. So an argument that is not understood ends the process before
/// anything is read, evaluated or printed.
#[derive(Debug)]
struct Args {
    path: Option<String>,
    budget: i64,
    /// The materialization wall, in rows (`DEFAULT_SPACE`, 500 000).
    ///
    /// SEPARATE FROM `--budget` BECAUSE THEY DEMAND OPPOSITE REPAIRS, which is
    /// the reason `budget_exhausted` and `space_exhausted` are two atoms
    /// (src/reflect.ts:249): told the first, raise it and finish; told the
    /// second, raising is the move that turns a refusal into a corpse — unless
    /// you have decided you can hold the answer. Added 2026-09-09 when the JS
    /// model over 32 files of eslint/lib refused here with `space_exhausted`
    /// and this binary had no way to say yes; the JS side gained the same
    /// setting the same day (`EvalOpts.space`, examples/reach).
    space: i64,
    ticks: u32,
    want_bytes: bool,
    /// Print `derivations` (scripts/derivations.ts) instead of
    /// `canonicalState`. Two oracles, one binary: the loose contract is what a
    /// second engine owes and the strict one is kept beside it, because a
    /// contract is loosened by measuring what the loosening costs.
    derivations: bool,
}

fn parse_args(args: &[String]) -> Result<Args, String> {
    let mut a = Args {
        path: None,
        budget: 100_000,
        space: 500_000,
        ticks: 0,
        want_bytes: false,
        derivations: false,
    };
    let mut i = 0;
    // A flag's value is fetched through this, so a trailing `--ticks` with
    // nothing after it is an error and not a panic on `args[i]`.
    fn value<'a>(args: &'a [String], i: &mut usize, flag: &str) -> Result<&'a str, String> {
        *i += 1;
        args.get(*i)
            .map(|s| s.as_str())
            .ok_or_else(|| format!("{flag} needs a value"))
    }
    while i < args.len() {
        match args[i].as_str() {
            "--budget" => {
                let v = value(args, &mut i, "--budget")?;
                a.budget = v
                    .parse()
                    .map_err(|_| format!("--budget: not an integer: {v}"))?;
            }
            "--space" => {
                let v = value(args, &mut i, "--space")?;
                a.space = v
                    .parse()
                    .map_err(|_| format!("--space: not an integer: {v}"))?;
            }
            "--ticks" => {
                let v = value(args, &mut i, "--ticks")?;
                a.ticks = v
                    .parse()
                    .map_err(|_| format!("--ticks: not an integer: {v}"))?;
            }
            "--bytes" => a.want_bytes = true,
            "--derivations" => a.derivations = true,
            "--help" | "-h" => return Err(USAGE.to_string()),
            f if f.starts_with('-') && f != "-" => {
                return Err(format!("unknown flag: {f}"));
            }
            p => {
                if let Some(had) = &a.path {
                    return Err(format!("two seeds given: {had} and {p}"));
                }
                a.path = Some(p.to_string());
            }
        }
        i += 1;
    }
    Ok(a)
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let Args {
        path,
        budget,
        space,
        ticks,
        want_bytes,
        derivations,
    } = match parse_args(&argv) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            eprintln!("{USAGE}");
            std::process::exit(64);
        }
    };
    let mut src = String::new();
    match path {
        Some(p) => src = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{p}: {e}")),
        None => {
            std::io::stdin().read_to_string(&mut src).unwrap();
        }
    }
    let t0 = std::time::Instant::now();
    let mut l = match rofl::load(&src, budget) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("load failed: {e}");
            std::process::exit(2);
        }
    };
    // SET AFTER `load` AND BEFORE ANY EVALUATION. `rofl::load` builds the Eval
    // with the default; the field is public and this is the one caller that has
    // a reason to move it, so the library signature stays as it is.
    l.eval.space = space;
    let t_load = t0.elapsed();
    if l.dangling > 0 {
        eprintln!("warning: {} dangling witness reference(s)", l.dangling);
    }
    let t1 = std::time::Instant::now();
    // `--ticks N` IS N CALLS TO `tickAdvance` AND NOTHING ELSE, which is what
    // the corpus generator does (scripts/port_corpus.ts): each call runs the
    // standing tick to fixpoint through `ensure` and then advances if the tick
    // is not quiescent, so no separate `evaluate()` belongs here. A quiescent
    // or partial call is a no-op that still counts, exactly as the generator's
    // replay counts it.
    let out = if ticks == 0 {
        l.eval.run().map(|_| ())
    } else {
        (0..ticks).try_for_each(|_| l.eval.tick_advance().map(|_| ()))
    };
    let t_eval = t1.elapsed();
    match out {
        Ok(()) => {}
        Err(e) => {
            eprintln!("evaluation refused: {}", rofl::describe(&e));
            std::process::exit(3);
        }
    }
    drop(src);
    let live = LIVE.load(Ordering::Relaxed);
    let cs = if derivations {
        l.eval.store.derivations(&l.eval.h)
    } else {
        l.eval.store.canonical_state(&l.eval.h)
    };
    print!("{cs}");
    if want_bytes {
        let n = l.eval.store.fact_count();
        let mut total = l.eval.h.bytes();
        eprintln!("facts\t{n}");
        eprintln!("syms\t{}", l.eval.h.sym_count());
        eprintln!("funcs\t{}", l.eval.h.func_count());
        eprintln!("tuples\t{}", l.eval.store.tuple_count());
        for (k, b) in l.eval.h.parts() {
            eprintln!("{k}\t{b}");
        }
        for (k, b) in l.eval.store.bytes() {
            eprintln!("{k}\t{b}");
            total += b;
        }
        eprintln!("total\t{total}");
        eprintln!("counted_total\t{total}");
        eprintln!("live_bytes\t{live}");
        eprintln!("bytes_per_fact\t{:.1}", live as f64 / n as f64);
        eprintln!("counted_per_fact\t{:.1}", total as f64 / n as f64);
        eprintln!("load_ms\t{:.2}", t_load.as_secs_f64() * 1000.0);
        eprintln!("eval_ms\t{:.2}", t_eval.as_secs_f64() * 1000.0);
        eprintln!("steps\t{}", l.eval.steps);
        eprintln!("peak_rows\t{}", l.eval.peak_rows);
        // `absorb` is invisible to both counters above, which is why these
        // three are here: it sorts and merges rather than firing a rule.
        eprintln!("absorb_calls\t{}", l.eval.store.absorb_calls);
        eprintln!("absorb_fresh\t{}", l.eval.store.absorb_fresh);
        eprintln!("absorb_canon\t{}", l.eval.store.absorb_canon);
        eprintln!("relp_calls\t{}", l.eval.store.relp_calls);
        eprintln!("relp_cloned\t{}", l.eval.store.relp_cloned);
        eprintln!("relp_dead\t{}", l.eval.store.relp_dead);
        eprintln!("argm_calls\t{}", l.eval.store.argm_calls);
        eprintln!("argm_cloned\t{}", l.eval.store.argm_cloned);
        // PER RULE, so the question "which body asks for more probes as the
        // corpus grows" has an answer. Sorted, top twenty; the tail is long
        // and flat and printing it would bury the head.
        let mut by: Vec<(rofl::term::Sym, u64)> =
            l.eval.argm_by_rule.iter().map(|(k, v)| (*k, *v)).collect();
        by.sort_by(|a, b| b.1.cmp(&a.1));
        for (rid, n) in by.iter().take(20) {
            // The head relation beside the id, because a rule id is a hash and
            // the question this table answers is about a BODY someone has to
            // find and read.
            let head = l
                .eval
                .rules
                .iter()
                .find(|r| r.id == *rid)
                .map(|r| l.eval.h.name(r.clause.head.rel).to_string())
                .unwrap_or_else(|| "?".to_string());
            eprintln!("argm_rule\t{}\t{}\t{}", l.eval.h.name(*rid), head, n);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_args;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    /// SWEEP THE BOUNDARY, DO NOT WIDEN THE GUESS (CLAUDE.md). Both halves
    /// are asserted: what is refused AND what is still accepted, so a refusal
    /// that grew teeth on the wrong thing prints by name rather than passing.
    ///
    /// AND THE REFUSAL IS CHECKED BY ITS REASON, not merely by `is_err`. The
    /// first version of this test passed every bad flag WITH a seed after it,
    /// so deleting the unknown-flag arm entirely left it green: `--ticks3`
    /// became a path, `s.json` became a second path, and "two seeds given" is
    /// an error too. A mutant found that (rust/mutants.sh, T13). A test that
    /// is green for the wrong reason is the same failure as a gate that is
    /// silently not running, which is the failure this whole flag exists to
    /// prevent.
    #[test]
    fn an_argument_that_is_not_understood_ends_the_run() {
        for bad in [
            "--ticks3",
            "--tick",
            "--Ticks",
            "--",
            "-t",
            "--bytes=1",
            "--budget=5",
            "--derivation",
        ] {
            // Alone, so that nothing else can supply the error.
            let e = parse_args(&v(&[bad])).expect_err("accepted a bad flag");
            assert!(e.contains("unknown flag"), "{bad} refused for: {e}");
            assert!(e.contains(bad), "{bad} refused without naming itself: {e}");
            // And with a seed after it, which is how a harness passes one.
            assert!(parse_args(&v(&[bad, "s.json"])).is_err(), "accepted {bad}");
        }
        for (args, why) in [
            (vec!["--ticks"], "needs a value"),
            (vec!["--ticks", "x"], "not an integer"),
            (vec!["--budget"], "needs a value"),
            (vec!["a.json", "b.json"], "two seeds given"),
        ] {
            let e = parse_args(&v(&args)).expect_err("accepted");
            assert!(e.contains(why), "{args:?} refused for: {e}");
        }
        assert!(parse_args(&v(&["--help"])).is_err(), "--help is not a run");
    }

    #[test]
    fn everything_the_harness_passes_is_still_accepted() {
        let a = parse_args(&v(&["--bytes", "--derivations", "--ticks", "3", "s.json"])).unwrap();
        assert!(a.want_bytes);
        assert!(a.derivations);
        assert_eq!(a.ticks, 3);
        assert_eq!(a.path.as_deref(), Some("s.json"));
        let b = parse_args(&v(&["--budget", "7", "s.json"])).unwrap();
        assert_eq!(b.budget, 7);
        assert_eq!(b.ticks, 0);
        // No seed at all is stdin, which is how `probe.ts` drives it.
        assert!(parse_args(&v(&[])).unwrap().path.is_none());
        // A lone "-" is a path, not a flag: a name that starts with a dash is
        // refused, and this is the one that must not be.
        assert_eq!(parse_args(&v(&["-"])).unwrap().path.as_deref(), Some("-"));
    }
}
