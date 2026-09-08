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

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut path: Option<String> = None;
    let mut budget = 100_000i64;
    let mut want_bytes = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--budget" => {
                i += 1;
                budget = args[i].parse().unwrap();
            }
            "--bytes" => want_bytes = true,
            a => path = Some(a.to_string()),
        }
        i += 1;
    }
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
    let t_load = t0.elapsed();
    if l.dangling > 0 {
        eprintln!("warning: {} dangling witness reference(s)", l.dangling);
    }
    let t1 = std::time::Instant::now();
    let out = l.eval.run();
    let t_eval = t1.elapsed();
    match out {
        Ok(_) => {}
        Err(e) => {
            eprintln!("evaluation refused: {}", rofl::describe(&e));
            std::process::exit(3);
        }
    }
    drop(src);
    let live = LIVE.load(Ordering::Relaxed);
    let cs = l.eval.store.canonical_state(&l.eval.h);
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
    }
}
